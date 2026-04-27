import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { log, warn, error } from '../utils/productionLogger';


const { width } = Dimensions.get('window');

interface LiveUser {
  id: string;
  username: string;
  avatar?: string;
  streamTitle?: string;
  viewerCount?: number;
  adultContent?: boolean;
}

interface LiveIndicatorProps {
  liveUsers: LiveUser[];
  maxVisible?: number;
  onRefresh?: () => void;
}

const LiveIndicator: React.FC<LiveIndicatorProps> = React.memo(({ 
  liveUsers, 
  maxVisible = 5,
  onRefresh
}) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  
  
  
  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current;
  
  // Debug log to see what data we're receiving
  useEffect(() => {
    log('🎥 LiveIndicator received liveUsers:', liveUsers);
    
    // Force refresh if we have stale data
    if (liveUsers.length > 0) {
      const now = new Date();
      const staleUsers = liveUsers.filter(user => {
        if (!user.startedAt) return true;
        const startedAt = new Date(user.startedAt);
        const hoursAgo = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);
        return hoursAgo > 24; // Consider streams older than 24 hours as stale
      });
      
      if (staleUsers.length > 0) {
        log('🧹 Found stale live users, triggering refresh:', staleUsers);
        if (onRefresh) {
          onRefresh();
        }
      }
    }
  }, [liveUsers, onRefresh]);

  // Start pulsing animation for live indicator - STAY VISIBLE
  useEffect(() => {
    if (liveUsers.length > 0) {
      // Slide in ONCE and STAY
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
      
      // Start pulsing animation for the live dot
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      
      return () => {
        pulse.stop();
      };
    }
    // Only slide out when there are NO live users
  }, [liveUsers.length]);

  const handleLiveUserPress = (user: LiveUser) => {
    // Navigate to live screen with the stream ID as a parameter
    router.push(`/live?streamId=${user.streamId}`);
  };


  // Don't render if no live users
  if (liveUsers.length === 0) {
    return null;
  }
  
  // Debug: Log the exact data we're rendering
  log('🎥 LiveIndicator rendering with:', {
    count: liveUsers.length,
    users: liveUsers.map(u => ({ id: u.id, username: u.username, isLive: u.isLive }))
  });

  const visibleUsers = liveUsers.slice(0, maxVisible);
  const remainingCount = Math.max(0, liveUsers.length - maxVisible);

  // Helper to get user initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <View style={styles.container}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        >
          {visibleUsers.map((user, index) => (
            <TouchableOpacity
              key={user.id}
            style={[styles.userItem, index === 0 && styles.firstItem]}
              onPress={() => handleLiveUserPress(user)}
              activeOpacity={0.8}
            >
            <View style={styles.avatarWrapper}>
              {user.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={styles.avatar}
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={styles.initialsContainer}>
                  <Text style={styles.initialsText}>
                    {getInitials(user.username || user.full_name || 'U')}
                  </Text>
                </View>
              )}
                <Animated.View 
                  style={[
                  styles.liveDot,
                    { transform: [{ scale: pulseAnim }] }
                  ]}
              />
              {/* Adult Content Badge */}
              {user.adultContent && (
                <View style={styles.adultBadge}>
                  <Text style={styles.adultBadgeText}>18+</Text>
                </View>
              )}
              </View>
            <Text style={[styles.username, { color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]} numberOfLines={1}>
                {user.username}
              </Text>
            </TouchableOpacity>
          ))}
          
          {remainingCount > 0 && (
          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => router.push('/live')}
            activeOpacity={0.8}
            >
            <View style={styles.moreCircle}>
              <Text style={styles.moreText}>+{remainingCount}</Text>
            </View>
            <Text style={[styles.username, { color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]}>
              more
            </Text>
          </TouchableOpacity>
          )}
        </ScrollView>
      </View>
  );
}, (prevProps, nextProps) => {
  // Only re-render if liveUsers array actually changed
  return (
    prevProps.liveUsers.length === nextProps.liveUsers.length &&
    prevProps.liveUsers.every((user, index) => {
      const nextUser = nextProps.liveUsers[index];
      return (
        user.id === nextUser?.id &&
        user.streamId === nextUser?.streamId &&
        user.adultContent === nextUser?.adultContent
      );
    })
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
    alignItems: 'center',
  },
  userItem: {
    alignItems: 'center',
    gap: 6,
  },
  firstItem: {
    marginLeft: 0,
  },
  avatarWrapper: {
    position: 'relative',
    width: 64,
    height: 64,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#FF0050',
  },
  initialsContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF0050',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FF0050',
  },
  initialsText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  liveDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF0050',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  username: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 64,
    letterSpacing: -0.3,
  },
  moreButton: {
    alignItems: 'center',
    gap: 6,
  },
  moreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 0, 80, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 0, 80, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF0050',
    letterSpacing: -0.5,
  },
  adultBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 149, 0, 0.95)',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  adultBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default LiveIndicator;
