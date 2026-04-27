import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Users, UserPlus } from 'lucide-react-native';
import { getFollowCounts, FollowCounts } from '../utils/followersServiceSimple';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { log, warn, error } from '../utils/productionLogger';


interface FollowStatsCardProps {
  userId: string;
  onFollowersPress?: () => void;
  onFollowingPress?: () => void;
  onPrivacyPress?: () => void; // Privacy modal handler for non-owners
  variant?: 'row' | 'card';
  style?: any;
  refreshTrigger?: number; // Add refresh trigger
}

export default function FollowStatsCard({
  userId,
  onFollowersPress,
  onFollowingPress,
  onPrivacyPress,
  variant = 'row',
  style,
  refreshTrigger
}: FollowStatsCardProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [followCounts, setFollowCounts] = useState<FollowCounts>({
    followers_count: 0,
    following_count: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFollowCounts();
  }, [userId, refreshTrigger]);

  const loadFollowCounts = async () => {
    try {
      setLoading(true);
      const counts = await getFollowCounts(userId);
      setFollowCounts(counts);
    } catch (error) {
      error('Error loading follow counts:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    } else if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return count.toString();
  };

  if (variant === 'card') {
    return (
      <View style={[
        styles.cardContainer,
        { backgroundColor: themeColors.neutral.card },
        style
      ]}>
        <View style={styles.cardHeader}>
          <Users size={16} color={themeColors.primary.main} strokeWidth={2} />
          <Text style={[styles.cardTitle, { color: themeColors.neutral.text }]}>
            Social Stats
          </Text>
        </View>
        
        <View style={styles.statsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.statButton,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={onFollowersPress || onPrivacyPress}
            disabled={!onFollowersPress && !onPrivacyPress}
          >
            <Text style={[styles.statNumber, { color: themeColors.neutral.text }]}>
              {loading ? '—' : formatCount(followCounts.followers_count)}
            </Text>
            <Text style={[styles.statLabel, { color: themeColors.neutral.subtext }]}>
              Followers
            </Text>
          </Pressable>
          
          <View style={[styles.separator, { backgroundColor: themeColors.neutral.border }]} />
          
          <Pressable
            style={({ pressed }) => [
              styles.statButton,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={onFollowingPress || onPrivacyPress}
            disabled={!onFollowingPress && !onPrivacyPress}
          >
            <Text style={[styles.statNumber, { color: themeColors.neutral.text }]}>
              {loading ? '—' : formatCount(followCounts.following_count)}
            </Text>
            <Text style={[styles.statLabel, { color: themeColors.neutral.subtext }]}>
              Following
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Row variant (for use in existing profile layouts)
  return (
    <View style={[styles.rowContainer, style]}>
      <TouchableOpacity
        style={styles.statItem}
        onPress={onFollowersPress || onPrivacyPress}
        disabled={!onFollowersPress && !onPrivacyPress}
        activeOpacity={0.7}
      >
        <Text style={[styles.statNumber, { color: themeColors.neutral.text }]}>
          {loading ? '—' : formatCount(followCounts.followers_count)}
        </Text>
        <Text style={[styles.statLabel, { color: themeColors.neutral.subtext }]}>
          Followers
        </Text>
      </TouchableOpacity>
      
      <View style={[styles.rowSeparator, { backgroundColor: themeColors.neutral.border }]} />
      
      <TouchableOpacity
        style={styles.statItem}
        onPress={onFollowingPress || onPrivacyPress}
        disabled={!onFollowingPress && !onPrivacyPress}
        activeOpacity={0.7}
      >
        <Text style={[styles.statNumber, { color: themeColors.neutral.text }]}>
          {loading ? '—' : formatCount(followCounts.following_count)}
        </Text>
        <Text style={[styles.statLabel, { color: themeColors.neutral.subtext }]}>
          Following
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Card variant styles
  cardContainer: {
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'System',
    marginLeft: 6,
    letterSpacing: -0.2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  separator: {
    width: 1,
    height: 30,
    marginHorizontal: 12,
  },
  
  // Row variant styles
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 6,
  },
  rowSeparator: {
    width: 1,
    height: 24,
    marginHorizontal: 8,
  },
  
  // Shared styles
  statNumber: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'System',
    marginBottom: 1,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'System',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    opacity: 0.8,
  },
});
