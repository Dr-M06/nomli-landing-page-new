import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import useAuth from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from '../utils/productionLogger';


const { width } = Dimensions.get('window');

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority?: string;
  created_at: string;
}

const DISMISSED_ANNOUNCEMENTS_KEY = 'dismissed_announcements';

export default function AnnouncementBanner() {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load dismissed announcements from storage
  useEffect(() => {
    const loadDismissed = async () => {
      try {
        const stored = await AsyncStorage.getItem(DISMISSED_ANNOUNCEMENTS_KEY);
        if (stored) {
          const ids = JSON.parse(stored);
          setDismissedIds(new Set(ids));
        }
      } catch (error) {
        error('Error loading dismissed announcements:', error);
      }
    };
    loadDismissed();
  }, []);

  // Fetch unread announcements
  useEffect(() => {
    // Don't show announcements if user is not logged in
    if (!user?.id) {
      setIsVisible(false);
      setAnnouncement(null);
      return;
    }

    const fetchAnnouncements = async () => {
      try {
        // Get read announcement IDs
        let readIds = new Set<string>();
        try {
          const { data: readAnnouncements, error: readError } = await supabase
            .from('announcement_reads')
            .select('announcement_id')
            .eq('user_id', user.id);
          
          if (!readError && readAnnouncements) {
            readIds = new Set(
              readAnnouncements.map((r: any) => r.announcement_id)
            );
          }
        } catch (readError) {
          // Table might not exist, continue without read status
          log('Could not fetch read announcements:', readError);
        }

        // Fetch active announcements
        const { data: allAnnouncements, error } = await supabase
          .from('announcements')
          .select(`
            id,
            title,
            content,
            created_at,
            start_date,
            end_date,
            is_active,
            target_audience,
            priority
          `)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          error('Error fetching announcements:', error);
          return;
        }

        if (!allAnnouncements || allAnnouncements.length === 0) {
          setIsVisible(false);
          return;
        }

        const now = new Date();
        const userIdStr = user.id;

        // Filter announcements - exclude token/credit/gift related content
        const validAnnouncements = allAnnouncements.filter((ann: any) => {
          // Skip if already read
          if (readIds.has(ann.id)) return false;
          
          // Skip if dismissed
          if (dismissedIds.has(ann.id)) return false;

          // Check date range
          const endDate = ann.end_date ? new Date(ann.end_date) : null;
          if (endDate && endDate < now) return false;

          // Skip token/credit/gift related announcements
          const titleLower = (ann.title || '').toLowerCase();
          const contentLower = (ann.content || '').toLowerCase();
          const tokenKeywords = ['token', 'credit', 'gift', 'wallet', 'balance', 'purchase', 'buy tokens', 'redeem'];
          const hasTokenContent = tokenKeywords.some(keyword => 
            titleLower.includes(keyword) || contentLower.includes(keyword)
          );
          if (hasTokenContent) {
            log('[AnnouncementBanner] Filtered out token-related announcement:', ann.id);
            return false;
          }

          // Check target audience
          const targetAudience = ann.target_audience || ['all'];
          return targetAudience.includes('all') || targetAudience.includes(userIdStr);
        });

        if (validAnnouncements.length > 0) {
          // Show the most recent unread announcement
          const latest = validAnnouncements[0];
          setAnnouncement({
            id: latest.id,
            title: latest.title,
            content: latest.content || '',
            priority: latest.priority,
            created_at: latest.created_at,
          });
          setIsVisible(true);
          
          // Animate in with bounce effect
          Animated.parallel([
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 60,
              friction: 7,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1,
              useNativeDriver: true,
              tension: 60,
              friction: 7,
            }),
            Animated.timing(opacityAnim, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
          ]).start(() => {
            // Subtle pulse animation
            Animated.loop(
              Animated.sequence([
                Animated.timing(pulseAnim, {
                  toValue: 1.02,
                  duration: 2000,
                  useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                  toValue: 1,
                  duration: 2000,
                  useNativeDriver: true,
                }),
              ])
            ).start();
          });
        } else {
          setIsVisible(false);
        }
      } catch (error) {
        error('Error in fetchAnnouncements:', error);
        setIsVisible(false);
      }
    };

    fetchAnnouncements();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchAnnouncements, 30000);
    return () => clearInterval(interval);
  }, [user?.id, dismissedIds]);

  const handleDismiss = async () => {
    if (!announcement) return;

    try {
      // Save dismissed ID
      const newDismissed = new Set(dismissedIds);
      newDismissed.add(announcement.id);
      setDismissedIds(newDismissed);
      
      await AsyncStorage.setItem(
        DISMISSED_ANNOUNCEMENTS_KEY,
        JSON.stringify(Array.from(newDismissed))
      );

      // Animate out with scale
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsVisible(false);
        setAnnouncement(null);
        pulseAnim.setValue(1);
      });
    } catch (error) {
      error('Error dismissing announcement:', error);
    }
  };

  const handlePress = () => {
    // Optional: Navigate to notifications screen to view full announcement
    // Users can dismiss or tap to view more details
    router.push('/notifications');
  };

  // Don't render if user is not logged in or no announcement
  if (!user?.id || !isVisible || !announcement) {
    return null;
  }

  // Priority-based gradient colors (Gen Z friendly vibrant colors)
  const getPriorityGradient = () => {
    switch (announcement.priority) {
      case 'urgent':
        return ['#FF006E', '#FF3B30', '#FF6B6B'];
      case 'high':
        return ['#FF9500', '#FFB84D', '#FFD93D'];
      case 'normal':
        return isDarkMode 
          ? ['#6366F1', '#8B5CF6', '#A78BFA']
          : ['#6366F1', '#818CF8', '#A5B4FC'];
      default:
        return isDarkMode
          ? ['#6366F1', '#8B5CF6', '#A78BFA']
          : ['#6366F1', '#818CF8', '#A5B4FC'];
    }
  };

  const whatsNewTitle = "What's New";
  const primaryLine = (announcement.title || '').trim();
  const secondaryLine = (announcement.content || '').trim();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top,
          transform: [
            { translateY: slideAnim },
            { scale: Animated.multiply(scaleAnim, pulseAnim) },
          ],
          opacity: opacityAnim,
        },
      ]}
    >
      <LinearGradient
        colors={getPriorityGradient()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handlePress}
          style={styles.content}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
          </View>
          
          <View style={styles.textContainer}>
            <Text
              style={styles.title}
              numberOfLines={1}
            >
              {whatsNewTitle}
            </Text>
            {!!primaryLine && (
              <Text
                style={styles.headlineText}
                numberOfLines={1}
              >
                {primaryLine}
              </Text>
            )}
            {!!secondaryLine && (
              <Text
                style={styles.contentText}
                numberOfLines={1}
              >
                {secondaryLine}
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.closeButtonInner}>
              <Ionicons
                name="close"
                size={16}
                color="#FFFFFF"
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    marginHorizontal: 12,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  gradient: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  headlineText: {
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(255, 255, 255, 0.96)',
    fontWeight: '700',
  },
  contentText: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.88)',
    fontWeight: '500',
  },
  closeButton: {
    padding: 2,
  },
  closeButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
});

