import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Users, Clock, TrendingUp, Gift } from 'lucide-react-native';
import { supabase } from '../utils/supabase';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { log, warn, error } from '../utils/productionLogger';


interface LiveAnalyticsModalProps {
  visible: boolean;
  streamId: string;
  currentViewerCount: number;
  streamStartTime: string | null;
  onClose: () => void;
}

export default function LiveAnalyticsModal({
  visible,
  streamId,
  currentViewerCount,
  streamStartTime,
  onClose,
}: LiveAnalyticsModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [stats, setStats] = useState({
    peakViewers: currentViewerCount,
    totalGifts: 0,
    totalEarnings: 0,
  });
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const isInitialLoadRef = useRef(true);

  // Update duration every second
  useEffect(() => {
    if (!visible || !streamStartTime) return;

    const updateDuration = () => {
      const startTime = new Date(streamStartTime).getTime();
      const now = Date.now();
      const seconds = Math.floor((now - startTime) / 1000);
      setDuration(seconds);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [visible, streamStartTime]);

  // Update peak viewers
  useEffect(() => {
    if (currentViewerCount > stats.peakViewers) {
      setStats(prev => ({ ...prev, peakViewers: currentViewerCount }));
    }
  }, [currentViewerCount, stats.peakViewers]);

  // Load gifts and earnings
  useEffect(() => {
    if (!visible || !streamId) {
      isInitialLoadRef.current = true; // Reset when modal closes
      return;
    }

    const loadGiftStats = async (isInitial: boolean) => {
      try {
        // Only show loading spinner on initial load
        if (isInitial) {
          setLoading(true);
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) {
          if (isInitial) setLoading(false);
          return;
        }

        const { data: giftsData } = await supabase
          .from('gift_transactions')
          .select('gift_price')
          .eq('stream_id', streamId)
          .eq('receiver_id', user.id);

        if (giftsData) {
          const totalGifts = giftsData.length;
          const totalEarnings = giftsData.reduce((sum, gift) => sum + (gift.gift_price || 0), 0);
          setStats(prev => ({ ...prev, totalGifts, totalEarnings }));
        }
      } catch (err) {
        error('Error loading gift stats:', err);
      } finally {
        if (isInitial) {
          setLoading(false);
        }
      }
    };

    // Initial load
    const isInitial = isInitialLoadRef.current;
    if (isInitial) {
      isInitialLoadRef.current = false;
    }
    loadGiftStats(isInitial);

    // Refresh every 5 seconds (without loading spinner)
    const interval = setInterval(() => {
      loadGiftStats(false);
    }, 5000);
    
    return () => {
      clearInterval(interval);
      isInitialLoadRef.current = true; // Reset when effect cleans up
    };
  }, [visible, streamId]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <Text style={[styles.title, { color: themeColors.text }]}>
              Live Analytics
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.primary.main} />
              <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                Loading analytics...
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Current Viewers */}
              <View style={[styles.statRow, { borderBottomColor: themeColors.border }]}>
                <View style={styles.statLeft}>
                  <Users size={20} color={themeColors.primary.main} />
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>
                    Current Viewers
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {formatNumber(currentViewerCount)}
                </Text>
              </View>

              {/* Duration */}
              <View style={[styles.statRow, { borderBottomColor: themeColors.border }]}>
                <View style={styles.statLeft}>
                  <Clock size={20} color={themeColors.primary.main} />
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>
                    Duration
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {formatDuration(duration)}
                </Text>
              </View>

              {/* Peak Viewers */}
              <View style={[styles.statRow, { borderBottomColor: themeColors.border }]}>
                <View style={styles.statLeft}>
                  <TrendingUp size={20} color="#FF3B30" />
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>
                    Peak Viewers
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {formatNumber(stats.peakViewers)}
                </Text>
              </View>

              {/* Gifts Received */}
              <View style={[styles.statRow, { borderBottomColor: themeColors.border }]}>
                <View style={styles.statLeft}>
                  <Gift size={20} color="#FFCC00" />
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>
                    Gifts Received
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {formatNumber(stats.totalGifts)}
                </Text>
              </View>

              {/* Earnings */}
              {stats.totalEarnings > 0 && (
                <View style={[styles.earningsCard, { 
                  backgroundColor: `${themeColors.primary.main}15` 
                }]}>
                  <Text style={[styles.earningsLabel, { color: themeColors.textSecondary }]}>
                    Total Earnings
                  </Text>
                  <Text style={[styles.earningsValue, { color: themeColors.primary.main }]}>
                    {stats.totalEarnings.toLocaleString()} coins
                  </Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Close Button */}
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: themeColors.primary.main }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.doneButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    // borderBottomColor set dynamically via theme
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  content: {
    padding: 20,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  statLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  earningsCard: {
    marginTop: 20,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  earningsLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  earningsValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  doneButton: {
    margin: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

