import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { SlidersHorizontal, Heart } from 'lucide-react-native';
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import { RC_PRODUCTS } from '../../constants/revenueCat';
import DatingPaywallSheet from '../../components/dating/DatingPaywallSheet';
import {
  fetchDatingCandidates,
  getDatingSetup,
  hasCompletedDatingSetup,
  hasSkippedDatingSetup,
  getWhoLikedCount,
  getWhoLikedPreview,
  likeDatingProfile,
  passDatingProfile,
  type DatingIntent,
  type DatingCandidate,
} from '../../utils/datingFlowService';
import { getDiscoverDailyLikesStatus } from '../../utils/discoverDailyLikes';
import { getProEntitlement } from '../../utils/proEntitlement';
import { purchaseSubscriptionWithRevenueCat } from '../../utils/revenueCatService';
import { supabase } from '../../utils/supabase';
import DiscoverSwipeDeck from '../../components/nearby/DiscoverSwipeDeck';
import { NearbyProfile } from '../../components/nearby/types';

const DAILY_LIKE_LIMIT = 10;
const AGE_MIN = 18;
const AGE_MAX = 70;
const DEFAULT_MIN_AGE = 21;
const DEFAULT_MAX_AGE = 40;
const DISTANCE_MIN_KM = 5;
const DISTANCE_MAX_KM = 200;
const DEFAULT_DISTANCE_KM = 25;

const RECENT_PROFILE_WINDOW_DAYS = 14;
const CONNECT_REPEAT_COOLDOWN_HOURS = 12;
const CONNECT_SEEN_KEY_PREFIX = 'connect_seen_profiles_v1:';
const MIN_UNIQUE_DECK_SIZE = 12;
const DATING_FILTERS_KEY_PREFIX = 'connect_dating_filters_v1:';

type DatingFilters = {
  minAge: number | null;
  maxAge: number | null;
  maxDistanceKm: number | null;
  gender: 'any' | 'male' | 'female' | 'non_binary';
  intent: DatingIntent | 'any';
  onlineOnly: boolean;
};

const DEFAULT_FILTERS: DatingFilters = {
  minAge: null,
  maxAge: null,
  maxDistanceKm: null,
  gender: 'any',
  intent: 'any',
  onlineOnly: false,
};

function filtersKey(userId: string): string {
  return `${DATING_FILTERS_KEY_PREFIX}${userId}`;
}

function normalizeGender(raw?: string): 'male' | 'female' | 'non_binary' | 'unknown' {
  if (!raw) return 'unknown';
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['male', 'man', 'm', 'boy'].includes(value)) return 'male';
  if (['female', 'woman', 'f', 'girl'].includes(value)) return 'female';
  if (['non_binary', 'nonbinary', 'nb', 'enby', 'genderqueer'].includes(value)) return 'non_binary';
  return 'unknown';
}

function isProfileOnlineNow(profile: DatingCandidate): boolean {
  if (profile.online_status === 'online') return true;
  const rawTs = profile.last_seen || profile.last_active;
  const ts = rawTs ? new Date(rawTs).getTime() : NaN;
  return Number.isFinite(ts) && Date.now() - ts <= 10 * 60 * 1000;
}

function applyDatingFilters(deck: DatingCandidate[], filters: DatingFilters): DatingCandidate[] {
  return deck.filter((profile) => {
    if (filters.minAge != null && typeof profile.age === 'number' && profile.age < filters.minAge) return false;
    if (filters.maxAge != null && typeof profile.age === 'number' && profile.age > filters.maxAge) return false;
    if (filters.maxDistanceKm != null && typeof profile.distance === 'number' && profile.distance > filters.maxDistanceKm) return false;
    if (filters.gender !== 'any' && normalizeGender(profile.gender) !== filters.gender) return false;
    if (filters.intent !== 'any' && profile.dating_intent && profile.dating_intent !== filters.intent) return false;
    if (filters.onlineOnly) {
      if (!isProfileOnlineNow(profile)) return false;
    }
    return true;
  });
}

function applyDatingFiltersWithFallback(deck: DatingCandidate[], filters: DatingFilters): DatingCandidate[] {
  const strict = applyDatingFilters(deck, filters);
  if (strict.length > 0 || deck.length === 0) return strict;

  // If strict filter yields no results, progressively relax constraints so users
  // don't get an empty experience from sparse metadata.
  if (filters.onlineOnly) {
    const relaxedOnline = applyDatingFilters(deck, { ...filters, onlineOnly: false });
    if (relaxedOnline.length > 0) return relaxedOnline;
  }
  if (filters.gender !== 'any') {
    const relaxedGender = applyDatingFilters(deck, { ...filters, gender: 'any' });
    if (relaxedGender.length > 0) return relaxedGender;
  }

  const relaxedBoth = applyDatingFilters(deck, { ...filters, onlineOnly: false, gender: 'any' });
  if (relaxedBoth.length > 0) return relaxedBoth;
  return strict;
}

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function mixDatingProfiles(deck: DatingCandidate[]): DatingCandidate[] {
  if (deck.length <= 2) return deck;
  const now = Date.now();
  const recentCutoffMs = RECENT_PROFILE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const recent: DatingCandidate[] = [];
  const older: DatingCandidate[] = [];

  for (const profile of deck) {
    const createdAtMs = profile.created_at ? new Date(profile.created_at).getTime() : NaN;
    if (Number.isFinite(createdAtMs) && now - createdAtMs <= recentCutoffMs) {
      recent.push(profile);
    } else {
      older.push(profile);
    }
  }

  const recentShuffled = shuffleArray(recent);
  const olderShuffled = shuffleArray(older);

  // Keep a small "fresh" lane near the top while mixing with older profiles.
  const mixed: DatingCandidate[] = [];
  const topRecent = recentShuffled.splice(0, Math.min(6, recentShuffled.length));
  mixed.push(...topRecent);

  while (recentShuffled.length > 0 || olderShuffled.length > 0) {
    if (olderShuffled.length > 0) mixed.push(olderShuffled.shift() as DatingCandidate);
    if (recentShuffled.length > 0) mixed.push(recentShuffled.shift() as DatingCandidate);
    if (olderShuffled.length > 0) mixed.push(olderShuffled.shift() as DatingCandidate);
  }

  return mixed;
}

function seenProfilesKey(userId: string): string {
  return `${CONNECT_SEEN_KEY_PREFIX}${userId}`;
}

async function applyProfileCooldown(userId: string, deck: DatingCandidate[]): Promise<DatingCandidate[]> {
  if (!userId || deck.length === 0) return deck;

  const now = Date.now();
  const cooldownMs = CONNECT_REPEAT_COOLDOWN_HOURS * 60 * 60 * 1000;

  let seenMap: Record<string, number> = {};
  try {
    const raw = await AsyncStorage.getItem(seenProfilesKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        seenMap = parsed as Record<string, number>;
      }
    }
  } catch {
    seenMap = {};
  }

  // Cleanup expired entries first.
  const activeSeen: Record<string, number> = {};
  Object.entries(seenMap).forEach(([id, ts]) => {
    if (typeof ts === 'number' && now - ts < cooldownMs) {
      activeSeen[id] = ts;
    }
  });

  const unseen = deck.filter((p) => !activeSeen[p.id]);
  const seen = deck.filter((p) => !!activeSeen[p.id]);

  // Prefer unseen first; if pool is small, backfill with oldest-seen profiles.
  const result = [...unseen];
  if (result.length < Math.min(MIN_UNIQUE_DECK_SIZE, deck.length) && seen.length > 0) {
    const backfill = [...seen].sort((a, b) => (activeSeen[a.id] ?? 0) - (activeSeen[b.id] ?? 0));
    result.push(...backfill.slice(0, Math.min(deck.length - result.length, MIN_UNIQUE_DECK_SIZE - result.length)));
  }

  // Mark surfaced profiles as seen now.
  result.forEach((p) => {
    activeSeen[p.id] = now;
  });

  try {
    await AsyncStorage.setItem(seenProfilesKey(userId), JSON.stringify(activeSeen));
  } catch {
    // non-blocking
  }

  return result;
}

export default function ConnectDatingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openPaywall?: string; paywallTitle?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const [profiles, setProfiles] = useState<DatingCandidate[]>([]);
  const [likesRemaining, setLikesRemaining] = useState<number>(DAILY_LIKE_LIMIT);
  const [unlimitedLikes, setUnlimitedLikes] = useState(false);
  const [likedYouCount, setLikedYouCount] = useState(0);
  const [likedYouPreview, setLikedYouPreview] = useState<DatingCandidate[]>([]);
  const [canRevealWhoLiked, setCanRevealWhoLiked] = useState(false);
  const [canUseFilters, setCanUseFilters] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filters, setFilters] = useState<DatingFilters>(DEFAULT_FILTERS);
  const [draftMinAge, setDraftMinAge] = useState(DEFAULT_MIN_AGE);
  const [draftMaxAge, setDraftMaxAge] = useState(DEFAULT_MAX_AGE);
  const [draftDistance, setDraftDistance] = useState(DEFAULT_DISTANCE_KM);
  const [draftGender, setDraftGender] = useState<'any' | 'male' | 'female' | 'non_binary'>('any');
  const [draftIntent, setDraftIntent] = useState<DatingIntent | 'any'>('any');
  const [draftOnlineOnly, setDraftOnlineOnly] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallTitle, setPaywallTitle] = useState('Unlock Dating Pro');
  const [matchBannerName, setMatchBannerName] = useState<string | null>(null);
  const [creatorProActive, setCreatorProActive] = useState(false);
  const [hasSetup, setHasSetup] = useState(false);
  const [skippedSetup, setSkippedSetup] = useState(false);
  const [lastPassedProfile, setLastPassedProfile] = useState<DatingCandidate | null>(null);
  const [likesInfoVisible, setLikesInfoVisible] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const setup = await getDatingSetup(user.id);
      const completedLocally = await hasCompletedDatingSetup(user.id);
      setHasSetup(!!setup || completedLocally);
      setSkippedSetup(await hasSkippedDatingSetup(user.id));

      let savedFilters = DEFAULT_FILTERS;
      try {
        const raw = await AsyncStorage.getItem(filtersKey(user.id));
        if (raw) {
          const parsed = JSON.parse(raw);
          savedFilters = {
            minAge: typeof parsed?.minAge === 'number' ? parsed.minAge : null,
            maxAge: typeof parsed?.maxAge === 'number' ? parsed.maxAge : null,
            maxDistanceKm: typeof parsed?.maxDistanceKm === 'number' ? parsed.maxDistanceKm : null,
            gender:
              parsed?.gender === 'male' || parsed?.gender === 'female' || parsed?.gender === 'non_binary'
                ? parsed.gender
                : 'any',
            intent: parsed?.intent === 'serious' || parsed?.intent === 'open' || parsed?.intent === 'vibing' ? parsed.intent : 'any',
            onlineOnly: !!parsed?.onlineOnly,
          };
        }
      } catch {
        savedFilters = DEFAULT_FILTERS;
      }
      setFilters(savedFilters);
      setDraftMinAge(savedFilters.minAge != null ? savedFilters.minAge : DEFAULT_MIN_AGE);
      setDraftMaxAge(savedFilters.maxAge != null ? savedFilters.maxAge : DEFAULT_MAX_AGE);
      setDraftDistance(savedFilters.maxDistanceKm != null ? savedFilters.maxDistanceKm : DEFAULT_DISTANCE_KM);
      setDraftGender(savedFilters.gender);
      setDraftIntent(savedFilters.intent);
      setDraftOnlineOnly(savedFilters.onlineOnly);

      const [deck, dailyStatus, whoLikedNum, whoLikedProfiles] = await Promise.all([
        fetchDatingCandidates(user.id, 40),
        getDiscoverDailyLikesStatus(user.id),
        getWhoLikedCount(user.id),
        getWhoLikedPreview(user.id, 4),
      ]);
      const ent = await getProEntitlement(user.id);
      const anyProActive = ent.anyActive;
      const filteredDeck = anyProActive ? applyDatingFiltersWithFallback(deck, savedFilters) : deck;
      const mixedDeck = mixDatingProfiles(filteredDeck);
      const cooledDeck = await applyProfileCooldown(user.id, mixedDeck);
      setProfiles(cooledDeck);
      setUnlimitedLikes(dailyStatus.unlimited);
      setLikesRemaining(dailyStatus.unlimited ? DAILY_LIKE_LIMIT : Math.max(0, Number.isFinite(dailyStatus.remaining) ? dailyStatus.remaining : DAILY_LIKE_LIMIT));
      setLikedYouCount(whoLikedNum);
      setCreatorProActive(ent.creatorActive);
      setCanRevealWhoLiked(anyProActive);
      setCanUseFilters(anyProActive);
      setLikedYouPreview(anyProActive ? whoLikedProfiles : []);
    } finally {
      setLoading(false);
    }
  }, [router, user?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
      return () => {};
    }, [reload])
  );

  const openPaywall = useCallback((title: string) => {
    setPaywallTitle(title);
    setPaywallVisible(true);
  }, []);

  useEffect(() => {
    if (params?.openPaywall === '1') {
      openPaywall(params?.paywallTitle || 'Unlock Dating Pro');
      router.setParams({ openPaywall: undefined, paywallTitle: undefined });
    }
  }, [openPaywall, params?.openPaywall, params?.paywallTitle, router]);

  useEffect(() => {
    if (!likesInfoVisible) return;
    const timeout = setTimeout(() => setLikesInfoVisible(false), 1800);
    return () => clearTimeout(timeout);
  }, [likesInfoVisible]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const removeFromDeck = useCallback((id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const topUpProfiles = useCallback(async () => {
    if (!user?.id || toppingUp || loading || refreshing) return;
    setToppingUp(true);
    try {
      const raw = await fetchDatingCandidates(user.id, 60);
      const filtered = canUseFilters ? applyDatingFiltersWithFallback(raw, filters) : raw;
      const mixed = mixDatingProfiles(filtered);
      const cooled = await applyProfileCooldown(user.id, mixed);
      setProfiles((prev) => {
        const byId = new Map<string, DatingCandidate>();
        prev.forEach((p) => byId.set(p.id, p));
        cooled.forEach((p) => {
          if (!byId.has(p.id)) byId.set(p.id, p);
        });
        return Array.from(byId.values()).slice(0, 120);
      });
    } catch {
      // non-blocking
    } finally {
      setToppingUp(false);
    }
  }, [canUseFilters, filters, loading, refreshing, toppingUp, user?.id]);

  const onPass = useCallback(
    async (profile: DatingCandidate) => {
      if (!user?.id) return;
      await passDatingProfile(user.id, profile.id);
      setLastPassedProfile(profile);
      removeFromDeck(profile.id);
    },
    [removeFromDeck, user?.id]
  );

  const onLike = useCallback(
    async (profile: DatingCandidate, superLike = false) => {
      if (!user?.id) return;
      const setup = await getDatingSetup(user.id);
      const completedLocally = await hasCompletedDatingSetup(user.id);
      if (!setup && !completedLocally) {
        setHasSetup(false);
        Alert.alert(
          'Finish dating setup',
          'Complete your dating setup before liking profiles.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Set up now', onPress: () => router.push('/dating/setup') },
          ]
        );
        return;
      }
      setHasSetup(true);

      if (!unlimitedLikes && likesRemaining <= 0) {
        openPaywall("You've used all 10 likes today");
        return;
      }
      if (superLike) {
        Alert.alert(
          'Super Like - 10 tokens',
          'Use 10 tokens to send a Super Like?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Use 10 tokens',
              onPress: async () => {
                const result = await likeDatingProfile(user.id, profile.id, true);
                if (!result.ok) {
                  if (result.reason === 'limit_reached') openPaywall("You've used all 10 likes today");
                  else Alert.alert('Could not super like', 'Please try again.');
                  return;
                }
                if (!result.consumedLike) {
                  Alert.alert('Already liked', 'You already liked this profile.');
                  removeFromDeck(profile.id);
                  return;
                }
                removeFromDeck(profile.id);
                if (result.remaining !== 'unlimited') setLikesRemaining(Math.max(0, result.remaining));
                if (result.matched) {
                  setMatchBannerName(profile.full_name || profile.username || 'a new match');
                }
              },
            },
          ],
          { cancelable: true }
        );
        return;
      }

      const result = await likeDatingProfile(user.id, profile.id, false);
      if (!result.ok) {
        if (result.reason === 'limit_reached') openPaywall("You've used all 10 likes today");
        else Alert.alert('Could not like profile', 'Please try again.');
        return;
      }
      if (!result.consumedLike) {
        Alert.alert('Already liked', 'You already liked this profile.');
        removeFromDeck(profile.id);
        return;
      }
      removeFromDeck(profile.id);
      if (result.remaining !== 'unlimited') setLikesRemaining(Math.max(0, result.remaining));
      if (result.matched) {
        setMatchBannerName(profile.full_name || profile.username || 'a new match');
      }
    },
    [likesRemaining, openPaywall, removeFromDeck, router, unlimitedLikes, user?.id]
  );

  useEffect(() => {
    if (!user?.id || loading || refreshing || toppingUp) return;
    if (profiles.length === 0 || profiles.length < 8) {
      topUpProfiles().catch(() => {});
    }
  }, [loading, profiles.length, refreshing, topUpProfiles, toppingUp, user?.id]);

  const likesRatio = useMemo(() => {
    if (unlimitedLikes) return 1;
    const clamped = Math.max(0, Math.min(DAILY_LIKE_LIMIT, likesRemaining));
    return clamped / DAILY_LIKE_LIMIT;
  }, [likesRemaining, unlimitedLikes]);

  const likeHeartColor = useMemo(() => {
    if (unlimitedLikes) return '#FF6FAE';
    // Fade the heart as likes drop: strong pink -> soft/faded pink.
    const alpha = 0.22 + likesRatio * 0.78;
    return `rgba(255,111,174,${alpha.toFixed(2)})`;
  }, [likesRatio, unlimitedLikes]);

  const swipeProfiles = useMemo<NearbyProfile[]>(
    () =>
      profiles.map((p) => {
        const isOnlineNow = isProfileOnlineNow(p);
        return { ...p, is_online_now: isOnlineNow };
      }),
    [profiles]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 6 }]}>
      <View style={styles.topBar}>
        <Text style={[styles.topTitle, { color: colors.text }]}>Connect</Text>
        <Text style={[styles.topSub, { color: colors.textSecondary }]}>Dating matches near you</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
        >
          <TouchableOpacity
            style={styles.likesPill}
            activeOpacity={0.85}
            onPress={() => setLikesInfoVisible(true)}
          >
            <View style={styles.likesLivesRow}>
              <Heart
                size={12}
                color={likeHeartColor}
                fill={likeHeartColor}
                strokeWidth={2}
              />
              <Text style={styles.likesLivesText}>
                {unlimitedLikes ? '∞' : likesRemaining}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterBtn}
            activeOpacity={0.9}
            onPress={() => {
              if (!canUseFilters) {
                openPaywall('Pro filters: Age range, Distance, Intent, Online now');
                return;
              }
              setDraftMinAge(filters.minAge != null ? filters.minAge : DEFAULT_MIN_AGE);
              setDraftMaxAge(filters.maxAge != null ? filters.maxAge : DEFAULT_MAX_AGE);
              setDraftDistance(filters.maxDistanceKm != null ? filters.maxDistanceKm : DEFAULT_DISTANCE_KM);
              setDraftGender(filters.gender);
              setDraftIntent(filters.intent);
              setDraftOnlineOnly(filters.onlineOnly);
              setFiltersVisible(true);
            }}
          >
            <SlidersHorizontal size={14} color="#F9A8D4" />
            <Text style={styles.filterBtnText}>Filters</Text>
          </TouchableOpacity>
        </ScrollView>
        {likesInfoVisible ? (
          <View pointerEvents="none" style={styles.likesInfoBanner}>
            <Text style={styles.likesInfoText}>
              {unlimitedLikes
                ? 'Unlimited likes active.'
                : `${likesRemaining} like${likesRemaining === 1 ? '' : 's'} left today.`}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6FAE" />}
      >
        {loading ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>Loading dating profiles...</Text>
        ) : (
          <DiscoverSwipeDeck
            profiles={swipeProfiles}
            onLike={(p) => onLike(p as DatingCandidate, false)}
            onPass={(p) => onPass(p as DatingCandidate)}
            onCardPress={(p) => router.push(`/profile/${p.id}?from=discover`)}
            canUseRewind={canRevealWhoLiked}
            showOnlineBadges={canUseFilters}
            onLockedRewindPress={() => openPaywall('Rewind your last pass is a Dating Pro feature')}
            canUndoPass={!!lastPassedProfile}
            onUndoPass={() => {
              if (!lastPassedProfile) return;
              setProfiles((prev) => [lastPassedProfile, ...prev]);
              setLastPassedProfile(null);
            }}
          />
        )}
      </ScrollView>

      {matchBannerName ? (
        <TouchableOpacity style={styles.matchBanner} activeOpacity={0.9} onPress={() => setMatchBannerName(null)}>
          <Text style={styles.matchTitle}>It is a match!</Text>
          <Text style={styles.matchSub}>You and {matchBannerName} liked each other. Start chatting in Inbox.</Text>
        </TouchableOpacity>
      ) : null}

      <DatingPaywallSheet
        visible={paywallVisible}
        contextTitle={paywallTitle}
        subtitle={
          creatorProActive
            ? 'You already have Creator Pro. Upgrade to the discounted combo to keep both Pro plans together.'
            : 'Best value: unlock Dating Pro + Creator Pro together with a discounted combo offer.'
        }
        features={
          [
            'Dating Pro: Unlimited likes + who liked you',
            'Dating Pro: Advanced filters + calls/read receipts',
            'Creator Pro: Earnings tools + creator unlocks',
            'One combo subscription, discounted total price',
          ]
        }
        dealHighlight="Save 36% vs separate plans (4.99 + 5.99)"
        monthlyLabel="Combo monthly - from $6.99/month"
        annualLabel="Combo annual - from $69.99/year"
        basePlanLabel="Prefer Dating Pro only - from $5.99/month"
        onBasePlan={async () => {
          setPaywallVisible(false);
          const res = await purchaseSubscriptionWithRevenueCat(RC_PRODUCTS.datingMonthly);
          if (!res.ok) {
            Alert.alert('Purchase failed', res.error || 'Could not complete purchase.');
            return;
          }
          Alert.alert('Plan unlocked', 'Dating Pro is now active.');
          await reload();
        }}
        basePlanAnnualLabel="Prefer Dating Pro yearly - from $59.99/year"
        onBasePlanAnnual={async () => {
          setPaywallVisible(false);
          const res = await purchaseSubscriptionWithRevenueCat(RC_PRODUCTS.datingAnnual);
          if (!res.ok) {
            Alert.alert('Purchase failed', res.error || 'Could not complete purchase.');
            return;
          }
          Alert.alert('Plan unlocked', 'Dating Pro yearly is now active.');
          await reload();
        }}
        onClose={() => setPaywallVisible(false)}
        onMonthly={async () => {
          setPaywallVisible(false);
          const productId = RC_PRODUCTS.bundleMonthly;
          const res = await purchaseSubscriptionWithRevenueCat(productId);
          if (!res.ok) {
            Alert.alert('Purchase failed', res.error || 'Could not complete purchase.');
            return;
          }
          Alert.alert('Plan unlocked', 'Combo plan is now active.');
          await reload();
        }}
        onAnnual={async () => {
          setPaywallVisible(false);
          const productId = RC_PRODUCTS.bundleAnnual;
          const res = await purchaseSubscriptionWithRevenueCat(productId);
          if (!res.ok) {
            Alert.alert('Purchase failed', res.error || 'Could not complete purchase.');
            return;
          }
          Alert.alert('Plan unlocked', 'Combo plan is now active.');
          await reload();
        }}
      />

      <Modal visible={filtersVisible} transparent animationType="fade" onRequestClose={() => setFiltersVisible(false)}>
        <Pressable style={styles.filterOverlay} onPress={() => setFiltersVisible(false)}>
          <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.filterTitle}>Dating Filters</Text>
            <Text style={styles.filterSubtitle}>Refine your matches</Text>

            <View style={styles.sliderRow}>
              <View style={styles.sliderLabelRow}>
                <Text style={styles.filterLabel}>Min age</Text>
                <Text style={styles.sliderValueText}>{Math.round(draftMinAge)}</Text>
              </View>
              <Slider
                minimumValue={AGE_MIN}
                maximumValue={AGE_MAX}
                step={1}
                value={draftMinAge}
                minimumTrackTintColor="#FF6FAE"
                maximumTrackTintColor="rgba(148,163,184,0.35)"
                thumbTintColor="#FF6FAE"
                onValueChange={(v) => {
                  const next = Math.round(v);
                  setDraftMinAge(next);
                  setDraftMaxAge((prev) => Math.max(next, prev));
                }}
              />
            </View>

            <View style={styles.sliderRow}>
              <View style={styles.sliderLabelRow}>
                <Text style={styles.filterLabel}>Max age</Text>
                <Text style={styles.sliderValueText}>{Math.round(draftMaxAge)}</Text>
              </View>
              <Slider
                minimumValue={AGE_MIN}
                maximumValue={AGE_MAX}
                step={1}
                value={draftMaxAge}
                minimumTrackTintColor="#FF6FAE"
                maximumTrackTintColor="rgba(148,163,184,0.35)"
                thumbTintColor="#FF6FAE"
                onValueChange={(v) => {
                  const next = Math.round(v);
                  setDraftMaxAge(next);
                  setDraftMinAge((prev) => Math.min(prev, next));
                }}
              />
            </View>

            <View style={styles.sliderRow}>
              <View style={styles.sliderLabelRow}>
                <Text style={styles.filterLabel}>Max distance (km)</Text>
                <Text style={styles.sliderValueText}>{Math.round(draftDistance)} km</Text>
              </View>
              <Slider
                minimumValue={DISTANCE_MIN_KM}
                maximumValue={DISTANCE_MAX_KM}
                step={1}
                value={draftDistance}
                minimumTrackTintColor="#FF6FAE"
                maximumTrackTintColor="rgba(148,163,184,0.35)"
                thumbTintColor="#FF6FAE"
                onValueChange={(v) => setDraftDistance(Math.round(v))}
              />
            </View>

            <Text style={[styles.filterLabel, styles.intentLabel]}>Intent</Text>
            <View style={styles.intentRow}>
              {(['any', 'serious', 'open', 'vibing'] as const).map((intentOption) => (
                <TouchableOpacity
                  key={intentOption}
                  style={[styles.intentChip, draftIntent === intentOption && styles.intentChipActive]}
                  onPress={() => setDraftIntent(intentOption)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.intentChipText, draftIntent === intentOption && styles.intentChipTextActive]}>
                    {intentOption === 'any' ? 'Any' : intentOption[0].toUpperCase() + intentOption.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.filterLabel, styles.intentLabel]}>Gender</Text>
            <View style={styles.intentRow}>
              {(['any', 'male', 'female', 'non_binary'] as const).map((genderOption) => (
                <TouchableOpacity
                  key={genderOption}
                  style={[styles.intentChip, draftGender === genderOption && styles.intentChipActive]}
                  onPress={() => setDraftGender(genderOption)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.intentChipText, draftGender === genderOption && styles.intentChipTextActive]}>
                    {genderOption === 'any'
                      ? 'Any'
                      : genderOption === 'non_binary'
                        ? 'Non-binary'
                        : genderOption[0].toUpperCase() + genderOption.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Online now</Text>
              <Switch
                value={draftOnlineOnly}
                onValueChange={setDraftOnlineOnly}
                trackColor={{ true: 'rgba(255,111,174,0.45)', false: 'rgba(148,163,184,0.35)' }}
                thumbColor={draftOnlineOnly ? '#FF6FAE' : '#E2E8F0'}
              />
            </View>

            <View style={styles.filterActions}>
              <TouchableOpacity
                style={styles.filterGhostBtn}
                onPress={() => {
                  setDraftMinAge(DEFAULT_MIN_AGE);
                  setDraftMaxAge(DEFAULT_MAX_AGE);
                  setDraftDistance(DEFAULT_DISTANCE_KM);
                  setDraftGender('any');
                  setDraftIntent('any');
                  setDraftOnlineOnly(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.filterGhostText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={async () => {
                  if (!user?.id) return;
                  const nextFilters: DatingFilters = {
                    minAge: Math.round(draftMinAge),
                    maxAge: Math.round(draftMaxAge),
                    maxDistanceKm: Math.round(draftDistance),
                    gender: draftGender,
                    intent: draftIntent,
                    onlineOnly: draftOnlineOnly,
                  };
                  setFilters(nextFilters);
                  await AsyncStorage.setItem(filtersKey(user.id), JSON.stringify(nextFilters));
                  setFiltersVisible(false);
                  await reload();
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.filterApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: 14, marginBottom: 8, position: 'relative' },
  topTitle: { fontSize: 24, fontWeight: '800' },
  topSub: { marginTop: 2, fontSize: 13, fontWeight: '600' },
  pillsRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 14,
  },
  likesPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,111,174,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  likesInfoBanner: {
    position: 'absolute',
    left: 14,
    bottom: -20,
    borderRadius: 10,
    backgroundColor: 'rgba(2,6,23,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,111,174,0.38)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    zIndex: 12,
  },
  likesInfoText: {
    color: '#FFD8EA',
    fontSize: 12,
    fontWeight: '700',
  },
  likesLivesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likesLivesText: {
    color: '#FFD8EA',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 4,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,111,174,0.32)',
    backgroundColor: 'rgba(255,111,174,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterBtnText: { color: '#FFD8EA', fontSize: 12, fontWeight: '700' },
  setupCta: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,111,174,0.2)',
  },
  setupCtaText: { color: '#FFD8EA', fontSize: 12, fontWeight: '700' },
  likedYouPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,111,174,0.32)',
    backgroundColor: 'rgba(255,111,174,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  likedYouPillText: { color: '#FFD8EA', fontSize: 12, fontWeight: '700' },
  proMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: 'rgba(250,204,21,0.16)',
  },
  proMiniBadgeText: { color: '#FDE68A', fontSize: 10, fontWeight: '800' },
  likedYouAvatars: { flexDirection: 'row', alignItems: 'center', marginLeft: 2 },
  previewAvatarSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -5,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.8)',
  },
  listContent: { padding: 14 },
  empty: { textAlign: 'center', marginTop: 36, fontSize: 14, fontWeight: '600' },
  matchBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.95)',
    padding: 12,
  },
  matchTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  matchSub: { color: '#FFFFFF', marginTop: 2, fontSize: 12, fontWeight: '600' },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.58)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  filterSheet: {
    borderRadius: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255,111,174,0.25)',
    padding: 14,
    gap: 10,
  },
  filterTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  filterSubtitle: {
    marginTop: -2,
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sliderRow: {
    gap: 6,
  },
  sliderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterLabel: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  sliderValueText: {
    color: '#FFD8EA',
    fontSize: 12,
    fontWeight: '800',
  },
  intentLabel: {
    marginTop: 2,
  },
  intentRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  intentChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  intentChipActive: {
    borderColor: 'rgba(255,111,174,0.5)',
    backgroundColor: 'rgba(255,111,174,0.15)',
  },
  intentChipText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  intentChipTextActive: {
    color: '#FFD8EA',
  },
  filterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 2,
  },
  filterGhostBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterGhostText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  filterApplyBtn: {
    borderRadius: 10,
    backgroundColor: '#FF6FAE',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterApplyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});

