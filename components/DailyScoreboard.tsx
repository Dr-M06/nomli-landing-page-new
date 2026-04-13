import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  ScrollView,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Trophy, Medal, Award, MessageCircle, Heart, Crown, Star, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import { getDailyLeaderboardOptimized, getUserDailyStats, DailyUserStats, UserDailyStats } from '../utils/dailyScoreboard';
import useAuth from '../hooks/useAuth';
import { getSafeAvatarUrl } from '../utils/safeAvatarUrl';
import { useLeaderboard } from '../contexts/LeaderboardContext';
import { warn, error } from '../utils/productionLogger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MAX_WIDTH = 380;

interface DailyScoreboardProps {
  visible: boolean;
  onClose: () => void;
}

export default function DailyScoreboard({ visible, onClose }: DailyScoreboardProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  const { refreshLeaderboard } = useLeaderboard();
  
  const [leaderboard, setLeaderboard] = useState<DailyUserStats[]>([]);
  const [userStats, setUserStats] = useState<UserDailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const modalScale = useRef(new Animated.Value(0.94)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const listItemAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(0))).current;
  const crownScale = useRef(new Animated.Value(0)).current;

  const loadScoreboard = async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Load leaderboard and user stats in parallel (top 5 only)
      // Uses optimized SQL function for better performance
      const [leaderboardData, stats] = await Promise.all([
        getDailyLeaderboardOptimized(5),
        user?.id ? getUserDailyStats(user.id) : Promise.resolve(null),
      ]);

      setLeaderboard(leaderboardData);
      setUserStats(stats);
      
      // Refresh global leaderboard context so crowns appear on home screen
      refreshLeaderboard().catch((e) => {
        warn('[DailyScoreboard] Failed to refresh global leaderboard context:', e);
      });
    } catch (error) {
      error('[DailyScoreboard] Error loading scoreboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadScoreboard();
      modalOpacity.setValue(0);
      modalScale.setValue(0.94);
      Animated.parallel([
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(modalScale, {
          toValue: 1,
          tension: 90,
          friction: 14,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || leaderboard.length === 0) return;
    const count = Math.min(leaderboard.length, listItemAnims.length);
    for (let i = 0; i < count; i++) {
      listItemAnims[i].setValue(0);
      Animated.timing(listItemAnims[i], {
        toValue: 1,
        duration: 280,
        delay: 80 + i * 60,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, leaderboard.length]);

  useEffect(() => {
    if (visible && leaderboard.length > 0) {
      crownScale.setValue(0);
      Animated.spring(crownScale, {
        toValue: 1,
        tension: 120,
        friction: 8,
        delay: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, leaderboard.length]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) {
      return <Trophy size={20} color={themeColors.warning.main} fill={themeColors.warning.main} />;
    } else if (rank === 2) {
      // Silver - use a theme-aware grey
      const silverColor = isDarkMode ? '#A0A0A0' : '#808080';
      return <Medal size={20} color={silverColor} fill={silverColor} />;
    } else if (rank === 3) {
      // Bronze - use warning dark for bronze-like color
      return <Award size={20} color={themeColors.warning.dark} fill={themeColors.warning.dark} />;
    }
    return (
      <View style={[styles.rankNumber, { backgroundColor: themeColors.surface }]}>
        <Text style={[styles.rankNumberText, { color: themeColors.textSecondary }]}>{rank}</Text>
      </View>
    );
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return themeColors.warning.main;
    if (rank === 2) return isDarkMode ? '#A0A0A0' : '#808080'; // Silver
    if (rank === 3) return themeColors.warning.dark; // Bronze
    return themeColors.text;
  };

  const getCrownSize = (rank: number) => {
    if (rank === 1) return 20;
    if (rank === 2) return 18;
    if (rank === 3) return 16;
    return 0; // No crown for rank 4+
  };

  if (!visible) return null;

  const surface = themeColors.neutral?.surface ?? (isDarkMode ? '#1e293b' : '#f1f5f9');
  const border = themeColors.neutral?.border ?? (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        style={[
          styles.cardWrap,
          {
            opacity: modalOpacity,
            transform: [{ scale: modalScale }],
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <View style={styles.headerLeft}>
              <Animated.View style={{ transform: [{ scale: crownScale }] }}>
                <Crown size={18} color={themeColors.warning.main} fill={themeColors.warning.main} />
              </Animated.View>
              <Text style={[styles.title, { color: themeColors.text }]}>Top Contributors</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: themeColors.neutral?.surfaceHover ?? surface }]} hitSlop={12}>
              <X size={18} color={themeColors.textSecondary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {userStats && (
              <View style={[styles.statsCard, { backgroundColor: themeColors.neutral?.background ?? surface, borderColor: border }]}>
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Heart size={14} color={themeColors.error.main} fill={themeColors.error.main} />
                    <Text style={[styles.statNum, { color: themeColors.text }]}>{userStats.likes_given}</Text>
                    <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Likes</Text>
                  </View>
                  <View style={styles.stat}>
                    <MessageCircle size={14} color={themeColors.primary.main} />
                    <Text style={[styles.statNum, { color: themeColors.text }]}>{userStats.comments_made}</Text>
                    <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Comments</Text>
                  </View>
                  <View style={styles.stat}>
                    <Trophy size={14} color={getRankColor(userStats.rank)} fill={getRankColor(userStats.rank)} />
                    <Text style={[styles.statNum, { color: getRankColor(userStats.rank) }]}>#{userStats.rank}</Text>
                    <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Rank</Text>
                  </View>
                </View>
                <View style={[styles.totalRow, { borderTopColor: border }]}>
                  <Text style={[styles.totalLabel, { color: themeColors.textSecondary }]}>Total Score</Text>
                  <Text style={[styles.totalNum, { color: themeColors.text }]}>{userStats.total_score}</Text>
                </View>
                {userStats.total_score > 0 && (
                  <Text style={[styles.tokenHint, { color: themeColors.textSecondary }]}>
                    Tokens awarded at midnight UTC to top 5 • Redeem in Rewards
                  </Text>
                )}
              </View>
            )}

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={themeColors.primary.main} />
                <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading…</Text>
              </View>
            ) : leaderboard.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Crown size={28} color={themeColors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No activity yet</Text>
                <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>Like and comment to appear on the board</Text>
              </View>
            ) : (
              leaderboard.map((leaderboardUser, index) => {
                const isCurrentUser = leaderboardUser.user_id === user?.id;
                const rank = leaderboardUser.rank || index + 1;
                const showCrown = rank <= 3;
                const anim = listItemAnims[index];
                const itemOpacity = anim?.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) ?? 1;
                const itemTranslateY = anim?.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) ?? 0;

                return (
                  <Animated.View
                    key={leaderboardUser.user_id}
                    style={[
                      styles.row,
                      { backgroundColor: isCurrentUser ? (themeColors.primary.main + '12') : 'transparent', borderColor: border },
                      rank === 1 && { borderLeftWidth: 3, borderLeftColor: themeColors.warning.main },
                      rank === 2 && { borderLeftWidth: 3, borderLeftColor: '#94a3b8' },
                      rank === 3 && { borderLeftWidth: 3, borderLeftColor: themeColors.warning.dark },
                      { opacity: itemOpacity, transform: [{ translateY: itemTranslateY }] },
                    ]}
                  >
                    <View style={styles.rankCell}>{getRankIcon(rank)}</View>
                    <TouchableOpacity
                      style={styles.avatarCell}
                      onPress={() => router.push(`/profile/${leaderboardUser.user_id}`)}
                      activeOpacity={0.7}
                    >
                      <Image
                        source={{ uri: getSafeAvatarUrl(leaderboardUser.avatar_url, leaderboardUser.user_id) }}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                      {showCrown && (
                        <View style={styles.crownBadge}>
                          <Crown size={getCrownSize(rank)} color={getRankColor(rank)} fill={getRankColor(rank)} />
                        </View>
                      )}
                    </TouchableOpacity>
                    <View style={styles.infoCell}>
                      <View style={styles.nameRow}>
                        <TouchableOpacity onPress={() => router.push(`/profile/${leaderboardUser.user_id}`)} activeOpacity={0.7} style={{ flex: 1 }}>
                          <Text style={[styles.name, { color: isCurrentUser ? themeColors.primary.main : themeColors.text }]} numberOfLines={1}>
                            {leaderboardUser.full_name || leaderboardUser.username || 'Anonymous'}
                          </Text>
                        </TouchableOpacity>
                        {isCurrentUser && (
                          <View style={[styles.youTag, { backgroundColor: themeColors.primary.main }]}>
                            <Text style={styles.youTagText}>YOU</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.metaRow}>
                        <Heart size={11} color={themeColors.error.main} fill={themeColors.error.main} />
                        <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>{leaderboardUser.likes_given}</Text>
                        <MessageCircle size={11} color={themeColors.textSecondary} style={{ marginLeft: 6 }} />
                        <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>{leaderboardUser.comments_made}</Text>
                      </View>
                    </View>
                    <View style={styles.ptsCell}>
                      <Text style={[styles.pts, { color: themeColors.text }]}>{leaderboardUser.total_score}</Text>
                      <Text style={[styles.ptsLabel, { color: themeColors.textSecondary }]}>pts</Text>
                    </View>
                  </Animated.View>
                );
              })
            )}

            <Text style={[styles.footer, { color: themeColors.textSecondary }]}>
              Scores reset daily at midnight UTC
            </Text>
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10000,
  },
  cardWrap: {
    width: '90%',
    maxWidth: CARD_MAX_WIDTH,
  },
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: Dimensions.get('window').height * 0.72,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    maxHeight: Dimensions.get('window').height * 0.6,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  statsCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.sm,
  },
  stat: {
    alignItems: 'center',
    gap: 2,
  },
  statNum: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '500',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  totalLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  totalNum: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
  },
  tokenHint: {
    fontSize: FontSizes.xs,
    marginTop: Spacing.sm,
    lineHeight: 14,
  },
  loadingWrap: {
    paddingVertical: Spacing.xxxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSizes.sm,
  },
  emptyWrap: {
    paddingVertical: Spacing.xxxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  emptySub: {
    fontSize: FontSizes.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  rankCell: {
    width: 28,
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  avatarCell: {
    position: 'relative',
    marginRight: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  crownBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    padding: 2,
  },
  infoCell: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  name: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  youTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  youTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    fontSize: FontSizes.xs,
    marginLeft: 2,
  },
  ptsCell: {
    alignItems: 'flex-end',
  },
  pts: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  ptsLabel: {
    fontSize: FontSizes.xs,
    marginTop: -1,
  },
  rankNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumberText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    fontSize: FontSizes.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
