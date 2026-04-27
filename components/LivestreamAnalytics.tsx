import React, { useEffect, useState } from 'react';
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


interface LivestreamAnalyticsProps {
  visible: boolean;
  streamId: string;
  onClose: () => void;
}

interface StreamStats {
  duration: number; // seconds
  peakViewers: number;
  totalViewers: number;
  totalGifts: number;
  totalEarnings: number;
}

export default function LivestreamAnalytics({
  visible,
  streamId,
  onClose,
}: LivestreamAnalyticsProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible && streamId) {
      loadAnalytics();
    }
  }, [visible, streamId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      // Get stream data
      const { data: streamData, error: streamError } = await supabase
        .from('live_streams')
        .select('started_at, ended_at, viewer_count, peak_viewer_count')
        .eq('id', streamId)
        .single();

      if (streamError) {
        error('Error loading stream data:', streamError);
        setLoading(false);
        return;
      }

      // Calculate duration
      const startTime = streamData.started_at ? new Date(streamData.started_at).getTime() : 0;
      const endTime = streamData.ended_at ? new Date(streamData.ended_at).getTime() : Date.now();
      const duration = Math.floor((endTime - startTime) / 1000);

      // Get current user for gift query
      const { data: { user } } = await supabase.auth.getUser();
      
      let totalGifts = 0;
      let totalEarnings = 0;

      if (user?.id) {
        const { data: giftsData } = await supabase
          .from('gift_transactions')
          .select('gift_price')
          .eq('stream_id', streamId)
          .eq('receiver_id', user.id);

        if (giftsData) {
          totalGifts = giftsData.length;
          totalEarnings = giftsData.reduce((sum, gift) => sum + (gift.gift_price || 0), 0);
        }
      }

      setStats({
        duration,
        peakViewers: streamData.peak_viewer_count || streamData.viewer_count || 0,
        totalViewers: streamData.viewer_count || 0,
        totalGifts,
        totalEarnings,
      });
    } catch (error) {
      error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
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
          <View style={styles.header}>
            <Text style={[styles.title, { color: themeColors.text }]}>
              Stream Analytics
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                Loading analytics...
              </Text>
            </View>
          ) : stats ? (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Duration */}
              <View style={[styles.statRow, { borderBottomColor: themeColors.border }]}>
                <View style={styles.statLeft}>
                  <Clock size={20} color={themeColors.primary} />
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>
                    Duration
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {formatDuration(stats.duration)}
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

              {/* Total Viewers */}
              <View style={[styles.statRow, { borderBottomColor: themeColors.border }]}>
                <View style={styles.statLeft}>
                  <Users size={20} color={themeColors.primary} />
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>
                    Total Viewers
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {formatNumber(stats.totalViewers)}
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
                <View style={[styles.earningsCard, { backgroundColor: themeColors.primary + '15' }]}>
                  <Text style={[styles.earningsLabel, { color: themeColors.textSecondary }]}>
                    Total Earnings
                  </Text>
                  <Text style={[styles.earningsValue, { color: themeColors.primary }]}>
                    {stats.totalEarnings.toLocaleString()} coins
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={[styles.errorText, { color: themeColors.textSecondary }]}>
                Unable to load analytics
              </Text>
            </View>
          )}

          {/* Close Button */}
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: themeColors.primary }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.doneButtonText}>Done</Text>
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
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
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
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
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

