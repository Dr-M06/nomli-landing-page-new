import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X } from 'lucide-react-native';
import useAuth from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontSizes } from '../constants/Theme';
import {
  fetchActivitySummaryCounts,
  activitySummarySignature,
  activitySummaryHasAny,
  type ActivitySummaryCounts,
} from '../utils/activitySummaryCounts';

const STORAGE_PREFIX = 'nomli_activity_summary_sig_v1:';
const OPEN_DELAY_MS = 2000;
const FLAMINGO_MAIN = '#FF6FAE';

function linesForCounts(c: ActivitySummaryCounts): string[] {
  const lines: string[] = [];
  if (c.newFollows > 0) {
    lines.push(
      c.newFollows === 1
        ? 'Someone started following you'
        : `${c.newFollows} people started following you`
    );
  }
  if (c.friendRequests > 0) {
    lines.push(
      c.friendRequests === 1
        ? '1 friend request'
        : `${c.friendRequests} friend requests`
    );
  }
  if (c.messageRequests > 0) {
    lines.push(
      c.messageRequests === 1
        ? '1 message request'
        : `${c.messageRequests} message requests`
    );
  }
  if (c.unreadAnnouncements > 0) {
    lines.push(
      c.unreadAnnouncements === 1
        ? '1 new announcement'
        : `${c.unreadAnnouncements} new announcements`
    );
  }
  if (c.unreadSocial > 0) {
    lines.push(
      c.unreadSocial === 1
        ? '1 other notification'
        : `${c.unreadSocial} other notifications`
    );
  }
  return lines;
}

type Props = {
  /** When true, floats over the feed without taking layout space (home screen). */
  overlay?: boolean;
};

/**
 * Home feed: short “what’s new” row with mascot; dismiss stores a signature until counts change.
 */
export default function ActivitySummaryCard({ overlay = false }: Props) {
  const { user, isLoaded } = useAuth();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  const [visible, setVisible] = useState(false);
  const [counts, setCounts] = useState<ActivitySummaryCounts | null>(null);

  const storageKey = user?.id ? `${STORAGE_PREFIX}${user.id}` : '';

  const dismissWithSignature = useCallback(
    async (c: ActivitySummaryCounts) => {
      const sig = activitySummarySignature(c);
      if (storageKey) {
        try {
          await AsyncStorage.setItem(storageKey, sig);
        } catch {
          /* ignore */
        }
      }
      setVisible(false);
    },
    [storageKey]
  );

  useEffect(() => {
    if (!isLoaded || !user?.id || !storageKey) {
      setVisible(false);
      setCounts(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const c = await fetchActivitySummaryCounts(user.id);
        if (cancelled) return;

        if (!activitySummaryHasAny(c)) return;

        const sig = activitySummarySignature(c);
        const stored = await AsyncStorage.getItem(storageKey);
        if (stored === sig) return;

        setCounts(c);
        setVisible(true);
      } catch {
        /* ignore */
      }
    }, OPEN_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLoaded, user?.id, storageKey]);

  if (!visible || !counts || !activitySummaryHasAny(counts)) {
    return null;
  }

  const lines = linesForCounts(counts);

  const cardBg = isDarkMode ? themeColors.neutral.card : '#ffffff';
  const borderCol = isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(15,23,42,0.12)';
  const textCol = themeColors.neutral.text;
  const subCol = themeColors.neutral.textSecondary;
  const mascotBg = isDarkMode ? 'rgba(255,111,174,0.22)' : 'rgba(255,111,174,0.14)';

  return (
    <View style={overlay ? styles.outerOverlay : styles.outerInline}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: borderCol,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isDarkMode ? 0.28 : 0.08,
                shadowRadius: 6,
              },
              android: { elevation: 2 },
              default: {},
            }),
          },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.mascotCol} accessibilityLabel="Nomli mascot">
            <View style={[styles.mascotCircle, { backgroundColor: mascotBg }]}>
              <Text style={styles.mascotEmoji} allowFontScaling={false}>
                🦩
              </Text>
            </View>
          </View>
          <View style={styles.body}>
            <View style={styles.cardHeader}>
              <Text style={[styles.title, { color: textCol }]}>{"What's new"}</Text>
              <Pressable
                onPress={() => dismissWithSignature(counts)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                style={styles.closeBtn}
              >
                <X size={18} color={subCol} strokeWidth={2.2} />
              </Pressable>
            </View>
            {lines.map((line, i) => (
              <Text key={i} style={[styles.line, { color: subCol }]}>
                • {line}
              </Text>
            ))}
            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  dismissWithSignature(counts);
                  router.push('/notifications');
                }}
                style={[styles.linkBtn, { backgroundColor: FLAMINGO_MAIN }]}
              >
                <Text style={styles.linkBtnText}>Open notifications</Text>
              </Pressable>
              <Pressable
                onPress={() => dismissWithSignature(counts)}
                style={[styles.skipBtn, { borderColor: borderCol }]}
              >
                <Text style={[styles.skipText, { color: subCol }]}>Got it</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerInline: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  outerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 80,
    paddingHorizontal: 12,
    paddingTop: 4,
    pointerEvents: 'box-none',
    ...Platform.select({
      android: { elevation: 14 },
      default: {},
    }),
  },
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingRight: 12,
    paddingLeft: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mascotCol: {
    marginRight: 10,
    paddingTop: 2,
  },
  mascotCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotEmoji: {
    fontSize: 28,
    lineHeight: 32,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  closeBtn: {
    padding: 4,
  },
  line: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  linkBtn: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 9,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  linkBtnText: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  skipBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  skipText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
});
