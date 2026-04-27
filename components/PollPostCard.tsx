import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { castMyVoteOnce, lockPoll } from '../utils/pollService';
import { Trophy, Lock } from 'lucide-react-native';
import useAuth from '../hooks/useAuth';

type ThemeColors = any;

export function PollPostCard({
  postId,
  themeColors,
  poll,
  onVoted,
  postCreatorId,
}: {
  postId: string;
  themeColors: ThemeColors;
  poll: {
    question: string;
    expires_at?: string | null;
    locked_at?: string | null;
    show_results_mode?: 'after_vote' | 'after_expiry' | 'always';
    options: Array<{ id: string; text: string; sort_order: number; vote_count: number }>;
    my_vote_option_id?: string | null;
    total_votes: number;
  };
  onVoted?: () => void;
  postCreatorId?: string;
}) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [locking, setLocking] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  const isLocked = useMemo(() => {
    return !!poll.locked_at;
  }, [poll.locked_at]);

  const isExpired = useMemo(() => {
    if (isLocked) return true; // Locked polls are considered expired
    if (!poll.expires_at) return false;
    return new Date(poll.expires_at).getTime() <= Date.now();
  }, [poll.expires_at, timeRemaining, isLocked]);

  const isCreator = postCreatorId && user?.id === postCreatorId;

  // Calculate winners (options with highest vote count)
  const winners = useMemo(() => {
    if (!isExpired || poll.options.length === 0) return [];
    const maxVotes = Math.max(...poll.options.map(opt => opt.vote_count));
    if (maxVotes === 0) return []; // No votes yet
    return poll.options.filter(opt => opt.vote_count === maxVotes);
  }, [isExpired, poll.options]);

  // Handle manual poll lock
  const handleLockPoll = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to lock the poll');
      return;
    }

    Alert.alert(
      'Lock Poll',
      'Are you sure you want to lock this poll? This will end voting immediately and show the winners. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock Poll',
          style: 'destructive',
          onPress: async () => {
            try {
              setLocking(true);
              await lockPoll(postId, user.id);
              Toast.show({
                type: 'success',
                text1: 'Poll Locked',
                text2: 'Voting has ended. Winners are now visible.',
              });
              onVoted?.(); // Refresh poll data
            } catch (error: any) {
              Toast.show({
                type: 'error',
                text1: 'Failed to Lock Poll',
                text2: error.message || 'An error occurred',
              });
            } finally {
              setLocking(false);
            }
          },
        },
      ]
    );
  };

  // Countdown timer - optimized to reduce updates based on time remaining
  useEffect(() => {
    if (!poll.expires_at || isExpired) {
      setTimeRemaining('');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const expiry = new Date(poll.expires_at!).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeRemaining('');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes}m ${seconds}s`);
      } else {
        setTimeRemaining(`${seconds}s`);
      }
    };

    updateTimer();
    
    // Optimize update frequency based on time remaining:
    // - >1 hour: update every minute (60s)
    // - >1 minute: update every 10 seconds
    // - <1 minute: update every second
    const now = Date.now();
    const expiry = new Date(poll.expires_at!).getTime();
    const diff = expiry - now;
    
    let intervalMs = 1000; // Default: 1 second
    if (diff > 60 * 60 * 1000) {
      // More than 1 hour remaining
      intervalMs = 60 * 1000; // Update every minute
    } else if (diff > 60 * 1000) {
      // More than 1 minute remaining
      intervalMs = 10 * 1000; // Update every 10 seconds
    }
    // Otherwise, update every second for final minute
    
    const interval = setInterval(updateTimer, intervalMs);

    return () => clearInterval(interval);
  }, [poll.expires_at, isExpired]);

  const canShowResults = useMemo(() => {
    if (poll.show_results_mode === 'always') return true;
    if (poll.show_results_mode === 'after_expiry') return isExpired;
    // after_vote
    return !!poll.my_vote_option_id;
  }, [poll.show_results_mode, isExpired, poll.my_vote_option_id]);

  const totalVotes = poll.total_votes || poll.options.reduce((sum, o) => sum + (o.vote_count || 0), 0);
  const hasVoted = !!poll.my_vote_option_id;

  return (
    <View style={[styles.card, { borderColor: themeColors.border, backgroundColor: themeColors.cardBackground }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={[styles.badge, { color: themeColors.primary.main }]}>📊 Poll</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isCreator && !isExpired && !isLocked && (
            <TouchableOpacity
              onPress={handleLockPoll}
              disabled={locking}
              style={[styles.lockButton, { backgroundColor: '#FF3B3020', borderColor: '#FF3B30' }]}
            >
              <Lock size={12} color="#FF3B30" />
              <Text style={[styles.lockButtonText, { color: '#FF3B30' }]}>
                {locking ? 'Locking...' : 'Lock'}
              </Text>
            </TouchableOpacity>
          )}
          {poll.expires_at && !isExpired && timeRemaining && (
            <View style={[styles.timerBadge, { backgroundColor: themeColors.primary.main + '20', borderColor: themeColors.primary.main }]}>
              <Text style={[styles.timerText, { color: themeColors.primary.main }]}>⏱️ {timeRemaining}</Text>
            </View>
          )}
          {isExpired && (
            <View style={[styles.timerBadge, { backgroundColor: '#FF3B3020', borderColor: '#FF3B30' }]}>
              <Text style={[styles.timerText, { color: '#FF3B30' }]}>
                {isLocked ? '🔒 Locked' : 'Ended'}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.question, { color: themeColors.text }]}>{poll.question}</Text>

      {isExpired && winners.length > 0 && (
        <View style={[styles.winnerBanner, { backgroundColor: '#FFD70020', borderColor: '#FFD700' }]}>
          <Trophy size={16} color="#FFD700" fill="#FFD700" />
          <Text style={[styles.winnerText, { color: '#FFD700' }]}>
            {winners.length === 1 
              ? `Winner: ${winners[0].text}` 
              : `${winners.length} Winners (Tie)`}
          </Text>
        </View>
      )}

      <View style={{ gap: 10, marginTop: 10 }}>
        {poll.options
          .slice()
          .sort((a, b) => {
            // When expired, show winners first, then by vote count descending
            if (isExpired) {
              const aIsWinner = winners.some(w => w.id === a.id);
              const bIsWinner = winners.some(w => w.id === b.id);
              if (aIsWinner && !bIsWinner) return -1;
              if (!aIsWinner && bIsWinner) return 1;
              if (aIsWinner && bIsWinner) return a.sort_order - b.sort_order;
              return b.vote_count - a.vote_count;
            }
            return a.sort_order - b.sort_order;
          })
          .map((opt) => {
            const selected = poll.my_vote_option_id === opt.id;
            const pct = totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0;
            const isWinner = isExpired && winners.some(w => w.id === opt.id);
            return (
              <TouchableOpacity
                key={opt.id}
                disabled={submitting || isExpired || hasVoted}
                onPress={async () => {
                  try {
                    setSubmitting(true);
                    await castMyVoteOnce(postId, opt.id);
                    Toast.show({ type: 'success', text1: 'Vote recorded' });
                    onVoted?.();
                  } catch (e: any) {
                    Toast.show({ type: 'error', text1: e?.message || 'Failed to vote' });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                activeOpacity={0.85}
                style={[
                  styles.option,
                  {
                    borderColor: isWinner 
                      ? '#FFD700' 
                      : selected 
                        ? themeColors.primary.main 
                        : themeColors.border,
                    backgroundColor: isWinner
                      ? '#FFD70020'
                      : selected 
                        ? themeColors.primary.main + '14' 
                        : 'transparent',
                    opacity: hasVoted && !selected && !isWinner ? 0.7 : 1,
                    borderWidth: isWinner ? 2 : 1,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    {isWinner && (
                      <Trophy size={16} color="#FFD700" fill="#FFD700" />
                    )}
                    <Text style={[styles.optionText, { color: themeColors.text }]} numberOfLines={2}>
                      {opt.text}
                    </Text>
                  </View>
                  {canShowResults && (
                    <Text style={[styles.pct, { color: isWinner ? '#FFD700' : themeColors.textSecondary }]}>{pct}%</Text>
                  )}
                </View>
                {canShowResults && (
                  <View style={[styles.barTrack, { backgroundColor: themeColors.border }]}>
                    <View
                      style={[
                        styles.barFill,
                        { 
                          width: `${pct}%`, 
                          backgroundColor: isWinner 
                            ? '#FFD700' 
                            : selected 
                              ? themeColors.primary.main 
                              : themeColors.textSecondary 
                        },
                      ]}
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
      </View>

      <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
        {isLocked ? '🔒 Locked by creator' : isExpired ? 'Ended' : 'Active'}
        {' • '}
        {totalVotes} vote{totalVotes === 1 ? '' : 's'}
        {hasVoted ? ' • Vote locked' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
  },
  timerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  lockButtonText: {
    fontSize: 11,
    fontWeight: '700',
  },
  question: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  winnerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  winnerText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  option: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  pct: {
    fontSize: 12,
    fontWeight: '700',
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 999,
  },
  meta: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
  },
});

