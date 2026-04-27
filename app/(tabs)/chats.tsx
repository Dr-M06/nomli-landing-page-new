import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatRoomsList from '../../components/ChatRoomsList';
import ChatBackgroundPattern from '../../components/ChatBackgroundPattern';
import DatingPaywallSheet from '../../components/dating/DatingPaywallSheet';
import { getThemeColors } from '../../constants/Colors';
import { RC_PRODUCTS } from '../../constants/revenueCat';
import { useTheme } from '../../contexts/ThemeContext';
import useAuth from '../../hooks/useAuth';
import { getInboxMatchPreviews } from '../../utils/datingFlowService';
import { getProEntitlement } from '../../utils/proEntitlement';
import { purchaseSubscriptionWithRevenueCat } from '../../utils/revenueCatService';

export default function ChatsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const [hasFocused, setHasFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<'matches' | 'conversations'>('matches');
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [canViewMatchIdentity, setCanViewMatchIdentity] = useState(false);
  const [creatorProActive, setCreatorProActive] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [matches, setMatches] = useState<Array<{
    id: string;
    userId: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  }>>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) {
        setMatches([]);
        setLoadingMatches(false);
        return;
      }
      setLoadingMatches(true);
      const items = await getInboxMatchPreviews(user.id, 12);
      if (active) {
        setMatches(items);
        setLoadingMatches(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) {
        if (active) {
          setCreatorProActive(false);
          setCanViewMatchIdentity(false);
        }
        return;
      }

      const ent = await getProEntitlement(user.id);

      if (active) {
        setCreatorProActive(ent.creatorActive);
        setCanViewMatchIdentity(ent.anyActive);
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setHasFocused(true);
      return () => {};
    }, [])
  );

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ChatBackgroundPattern style={{ backgroundColor: themeColors.background }}>
      <View
        style={[
          styles.topTabs,
          {
            marginTop: Math.max(insets.top, 6) + 2,
            borderColor: themeColors.neutral.border,
            backgroundColor: themeColors.neutral.card,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.topTabBtn, activeTab === 'matches' && { backgroundColor: themeColors.primary.main }]}
          onPress={() => setActiveTab('matches')}
          activeOpacity={0.85}
        >
          <Text style={[styles.topTabText, { color: activeTab === 'matches' ? '#FFF' : themeColors.neutral.textSecondary }]}>
            Matches
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTabBtn, activeTab === 'conversations' && { backgroundColor: themeColors.primary.main }]}
          onPress={() => setActiveTab('conversations')}
          activeOpacity={0.85}
        >
          <Text style={[styles.topTabText, { color: activeTab === 'conversations' ? '#FFF' : themeColors.neutral.textSecondary }]}>
            Conversations
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'matches' ? (
        <View style={styles.matchesWrap}>
          {loadingMatches ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" color={themeColors.primary.main} />
            </View>
          ) : matches.length === 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: themeColors.neutral.textSecondary }]}>No matches yet</Text>
            </View>
          ) : (
            <FlatList
              data={matches}
              keyExtractor={(item) => item.id}
              numColumns={2}
              contentContainerStyle={styles.matchListContent}
              columnWrapperStyle={styles.matchListRow}
              renderItem={({ item }) => {
                const avatarUrl = item.avatar_url || `https://api.dicebear.com/7.x/avataaars/png?seed=${item.userId}`;
                const name = item.full_name || item.username || 'Match';
                const isLocked = !canViewMatchIdentity;
                return (
                  <TouchableOpacity
                    style={[styles.matchCard, { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border }]}
                    activeOpacity={0.85}
                    onPress={() => (isLocked ? setPaywallVisible(true) : router.push(`/chat/${item.userId}`))}
                  >
                    <View style={styles.matchAvatarWrap}>
                      <Image
                        source={{ uri: avatarUrl }}
                        style={[styles.matchAvatar, isLocked && styles.matchAvatarLocked]}
                        contentFit="cover"
                        blurRadius={isLocked ? 36 : 0}
                      />
                      {isLocked ? (
                        <View style={styles.lockOverlay}>
                          <View style={styles.lockOverlayPill}>
                            <Text style={styles.lockOverlayText}>Unlock</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.matchName, { color: themeColors.neutral.text }]} numberOfLines={1}>
                      {isLocked ? '••••••' : name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      ) : hasFocused ? (
        <ChatRoomsList compactTop />
      ) : (
        <View style={styles.placeholder} />
      )}

      <DatingPaywallSheet
        visible={paywallVisible}
        contextTitle="Unlock Combo Pro to reveal matches"
        subtitle={
          creatorProActive
            ? 'You already have Creator Pro. Upgrade to the discounted combo to keep both Pro plans together.'
            : 'Best value: unlock Dating Pro + Creator Pro together with a discounted combo offer.'
        }
        features={
          [
            'Reveal who matched you in Inbox',
            'Dating Pro: Unlimited likes + premium messaging',
            'Creator Pro: Earnings tools + creator unlocks',
            'One discounted combo subscription',
          ]
        }
        dealHighlight="Save 36% vs separate plans (4.99 + 5.99)"
        monthlyLabel="Combo monthly - from $6.99/month"
        annualLabel="Combo annual - from $69.99/year"
        basePlanLabel="Prefer Dating Pro only - from $5.99/month"
        onBasePlan={async () => {
          setPaywallVisible(false);
          const res = await purchaseSubscriptionWithRevenueCat(RC_PRODUCTS.datingMonthly);
          if (!res.ok) return;
          setCanViewMatchIdentity(true);
        }}
        basePlanAnnualLabel="Prefer Dating Pro yearly - from $59.99/year"
        onBasePlanAnnual={async () => {
          setPaywallVisible(false);
          const res = await purchaseSubscriptionWithRevenueCat(RC_PRODUCTS.datingAnnual);
          if (!res.ok) return;
          setCanViewMatchIdentity(true);
        }}
        onClose={() => setPaywallVisible(false)}
        onMonthly={async () => {
          setPaywallVisible(false);
          const productId = RC_PRODUCTS.bundleMonthly;
          const res = await purchaseSubscriptionWithRevenueCat(productId);
          if (!res.ok) return;
          setCanViewMatchIdentity(true);
        }}
        onAnnual={async () => {
          setPaywallVisible(false);
          const productId = RC_PRODUCTS.bundleAnnual;
          const res = await purchaseSubscriptionWithRevenueCat(productId);
          if (!res.ok) return;
          setCanViewMatchIdentity(true);
        }}
      />
      </ChatBackgroundPattern>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0,
  },
  topTabs: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  topTabBtn: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  matchesWrap: {
    flex: 1,
  },
  matchListContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  matchListRow: {
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  matchCard: {
    width: '48.5%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
  },
  matchAvatarWrap: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  matchAvatar: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
  },
  matchAvatarLocked: {
    opacity: 0.3,
    transform: [{ scale: 1.04 }],
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6, 10, 20, 0.68)',
  },
  lockOverlayPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  lockOverlayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  matchName: {
    fontSize: 14,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  placeholder: {
    flex: 1,
  },
});
