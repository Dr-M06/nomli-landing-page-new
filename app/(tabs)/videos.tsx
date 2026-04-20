import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { MapPin, MessageCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import { FontFamily } from '../../constants/Theme';
import useAuth from '../../hooks/useAuth';
import FollowButton from '../../components/FollowButton';
import { InlineVerifiedBadge } from '../../components/InlineVerifiedBadge';
import { fetchVisibleProfilesPaginated } from '../../utils/paginatedDataFetch';
import { getSafeDisplayName, stripAtSymbol } from '../../utils/contentFilter';
import { getSafeAvatarUrl } from '../../utils/safeAvatarUrl';
import { supabase } from '../../utils/supabase';
import { getFloatingTabBarReservedHeight } from '../../utils/tabBarInset';
import { isVerifiedEntity } from '../../utils/verification';

type DiscoverProfile = {
  id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  is_verified?: boolean;
  profile_visible?: boolean;
};

const PAGE_SIZE = 20;
const VERIFIED_FETCH_LIMIT = 300;
const VERIFIED_MAX_SCAN_PAGES = 12;
const VERIFIED_BROAD_QUERY_LIMIT = 1500;
const VERIFIED_CACHE_KEY_PREFIX = 'discovery_verified_cache_v3';
const VERIFIED_CACHE_TTL_MS = 15 * 60 * 1000;
const VERIFIED_CACHE_MIN_ITEMS = 1;
const VERIFIED_RELOAD_COOLDOWN_MS = 45 * 1000;
const DISCOVERY_PREFETCH_PAGES = 4;
const DISCOVERY_PREFETCH_MIN_PHOTO_PROFILES = 18;
const { width: SCREEN_W } = Dimensions.get('window');
const GRID_COLUMNS = 2;
const CARD_GAP = 10;
const CARD_W = Math.floor((SCREEN_W - 24 - CARD_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
const COMPACT_DISCOVERY_CARD = CARD_W < 172;
const CARD_H = COMPACT_DISCOVERY_CARD
  ? Math.max(Math.round(CARD_W * 1.84), 208)
  : Math.round(CARD_W * 1.42);
const DISCOVERY_PHOTO_PCT = COMPACT_DISCOVERY_CARD ? 50 : 56;

const DISCOVERY_HINTS = [
  'People you may know',
  'Fresh faces nearby',
  'Say hello first',
  'New voices on Nomli',
];

function DiscoverySkeletonGrid({
  isDarkMode,
  borderColor,
}: {
  isDarkMode: boolean;
  borderColor: string;
}) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const blocks = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);
  const cardBg = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const lineBg = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <View style={styles.skeletonGrid}>
      {blocks.map((i) => {
        const isLastInRow = (i + 1) % GRID_COLUMNS === 0;
        return (
          <Animated.View
            key={i}
            style={[
              styles.skeletonCard,
              {
                width: CARD_W,
                height: CARD_H,
                marginRight: isLastInRow ? 0 : CARD_GAP,
                opacity: pulse,
                backgroundColor: cardBg,
                borderColor,
              },
            ]}
          >
            <View
              style={[
                styles.skeletonPhoto,
                { height: `${DISCOVERY_PHOTO_PCT}%`, backgroundColor: lineBg },
              ]}
            />
            <View style={styles.skeletonBody}>
              <View style={[styles.skeletonLineLg, { backgroundColor: lineBg }]} />
              <View style={[styles.skeletonLineSm, { backgroundColor: lineBg }]} />
              <View style={[styles.skeletonLineMd, { backgroundColor: lineBg }]} />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

function hasRealProfilePhoto(profile: DiscoverProfile): boolean {
  const url = (profile.avatar_url || '').toLowerCase();
  if (!url) return false;
  if (url.includes('dicebear')) return false;
  if (url.includes('api.dicebear')) return false;
  if (url.includes('placeholder')) return false;
  if (url.includes('default-avatar')) return false;
  if (url.includes('ui-avatars')) return false;
  if (url.includes('gravatar') && url.includes('d=')) return false;
  // Prefer uploaded/storage avatars even when extension is absent.
  if (url.includes('supabase') || url.includes('bunny.net') || url.includes('bunnycdn.com')) return true;
  // Accept normal image/CDN URLs even without file extension.
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  return (
    url.includes('.jpg') ||
    url.includes('.jpeg') ||
    url.includes('.png') ||
    url.includes('.webp') ||
    url.includes('.gif')
  );
}

function isVerifiedProfile(profile: DiscoverProfile): boolean {
  return isVerifiedEntity(profile);
}

function toMillis(ts?: string): number {
  if (!ts) return 0;
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : 0;
}

function compareDiscoveryProfiles(a: DiscoverProfile, b: DiscoverProfile): number {
  const aVerified = isVerifiedProfile(a) ? 1 : 0;
  const bVerified = isVerifiedProfile(b) ? 1 : 0;
  if (aVerified !== bVerified) return bVerified - aVerified;
  const aPhoto = hasRealProfilePhoto(a) ? 1 : 0;
  const bPhoto = hasRealProfilePhoto(b) ? 1 : 0;
  if (aPhoto !== bPhoto) return bPhoto - aPhoto;
  const activeDiff = toMillis((b as any).last_active) - toMillis((a as any).last_active);
  if (activeDiff !== 0) return activeDiff;
  return toMillis((b as any).created_at) - toMillis((a as any).created_at);
}

/** Stable pseudo-random order per (id, seed); new ids sort in without reshuffling existing mutual order. */
function discoveryShuffleKey(profileId: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < profileId.length; i++) {
    h = Math.imul(h ^ profileId.charCodeAt(i), 0x9e3779b1) >>> 0;
  }
  return h >>> 0;
}

export default function VideosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [verifiedBoostProfiles, setVerifiedBoostProfiles] = useState<DiscoverProfile[]>([]);
  const [bootstrapping, setBootstrapping] = useState(true);
  /** Bumps when discovery reloads page 0 so non-verified order re-randomizes (open / pull-to-refresh). */
  const [discoveryOrderRevision, setDiscoveryOrderRevision] = useState(0);
  const discoveryShuffleSeedRef = useRef(Math.floor(Math.random() * 0x7fffffff));
  /** Keep row order stable while paginating (full re-sort caused visible shuffle/jump). */
  const verifiedStableOrderRef = useRef<string[]>([]);
  const nonVerifiedStableOrderRef = useRef<string[]>([]);
  const discoveryRevisionSyncedRef = useRef(0);
  const discoveryUserIdRef = useRef<string | undefined>(undefined);
  const loadMoreLockRef = useRef(false);
  const verifiedLoadInFlightRef = useRef(false);
  const verifiedLastLoadedAtRef = useRef(0);
  const verifiedCacheKey = `${VERIFIED_CACHE_KEY_PREFIX}:${user?.id || 'anon'}`;

  const listFade = useRef(new Animated.Value(0)).current;
  const pinScale = useRef(new Animated.Value(1)).current;
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    if (bootstrapping) {
      listFade.setValue(0);
      return;
    }
    listFade.setValue(0);
    Animated.timing(listFade, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [bootstrapping, listFade]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pinScale, {
          toValue: 1.12,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pinScale, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pinScale]);

  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(hintOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setHintIndex((i) => (i + 1) % DISCOVERY_HINTS.length);
        Animated.timing(hintOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    }, 7000);
    return () => clearInterval(id);
  }, [hintOpacity]);

  const [gridProfiles, setGridProfiles] = useState<DiscoverProfile[]>([]);

  useLayoutEffect(() => {
    if (bootstrapping) {
      setGridProfiles([]);
      return;
    }
    if (!user?.id) {
      setGridProfiles([]);
      verifiedStableOrderRef.current = [];
      nonVerifiedStableOrderRef.current = [];
      return;
    }

    if (discoveryUserIdRef.current !== user.id) {
      discoveryUserIdRef.current = user.id;
      verifiedStableOrderRef.current = [];
      nonVerifiedStableOrderRef.current = [];
    }
    if (discoveryRevisionSyncedRef.current !== discoveryOrderRevision) {
      discoveryRevisionSyncedRef.current = discoveryOrderRevision;
      verifiedStableOrderRef.current = [];
      nonVerifiedStableOrderRef.current = [];
    }

    const merged = new Map<string, DiscoverProfile>();
    for (const p of verifiedBoostProfiles) {
      if (!p?.id || !hasRealProfilePhoto(p)) continue;
      merged.set(p.id, p);
    }
    for (const p of profiles) {
      if (!p?.id || !hasRealProfilePhoto(p)) continue;
      const existing = merged.get(p.id);
      if (!existing) {
        merged.set(p.id, p);
        continue;
      }
      const mergedVerified =
        !!(existing.is_verified || p.is_verified || isVerifiedProfile(existing) || isVerifiedProfile(p));
      merged.set(p.id, {
        ...existing,
        ...p,
        is_verified: mergedVerified,
      });
    }

    const list = Array.from(merged.values());
    const verified = list.filter((p) => isVerifiedProfile(p));
    const nonVerified = list.filter((p) => !isVerifiedProfile(p));

    const vIds = new Set(verified.map((p) => p.id));
    let vOrder = verifiedStableOrderRef.current.filter((id) => vIds.has(id));
    const vNew = verified.filter((p) => !vOrder.includes(p.id));
    vNew.sort(compareDiscoveryProfiles);
    vOrder = [...vOrder, ...vNew.map((p) => p.id)];
    verifiedStableOrderRef.current = vOrder;
    const orderedVerified = vOrder.map((id) => merged.get(id)!).filter(Boolean);

    const shuffleSeed =
      (discoveryShuffleSeedRef.current ^ (discoveryOrderRevision * 0x9e3779b9)) >>> 0;
    const nvIds = new Set(nonVerified.map((p) => p.id));
    let nvOrder = nonVerifiedStableOrderRef.current.filter((id) => nvIds.has(id));
    const nvNew = nonVerified.filter((p) => !nvOrder.includes(p.id));
    nvNew.sort(
      (a, b) => discoveryShuffleKey(a.id, shuffleSeed) - discoveryShuffleKey(b.id, shuffleSeed)
    );
    nvOrder = [...nvOrder, ...nvNew.map((p) => p.id)];
    nonVerifiedStableOrderRef.current = nvOrder;
    const orderedNon = nvOrder.map((id) => merged.get(id)!).filter(Boolean);

    setGridProfiles([...orderedVerified, ...orderedNon]);
  }, [
    bootstrapping,
    user?.id,
    profiles,
    verifiedBoostProfiles,
    discoveryOrderRevision,
  ]);

  const loadProfiles = useCallback(async (nextPage = 0, replace = false) => {
    if (!user?.id) {
      setVerifiedBoostProfiles([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    try {
      let result = await fetchVisibleProfilesPaginated(user.id, nextPage, PAGE_SIZE, false);
      let incoming = (result.profiles || []) as DiscoverProfile[];
      let resolvedPage = nextPage;
      let resolvedHasMore = result.hasMore;

      // First-open pass: pull a few extra pages so users with real photos are not buried past page 0.
      if (replace && nextPage === 0 && result.hasMore) {
        const merged = [...incoming];
        const seen = new Set(merged.map((p) => p.id));
        let photoCount = merged.filter(hasRealProfilePhoto).length;
        for (let p = 1; p < DISCOVERY_PREFETCH_PAGES; p += 1) {
          if (!resolvedHasMore && photoCount >= DISCOVERY_PREFETCH_MIN_PHOTO_PROFILES) break;
          const pageResult = await fetchVisibleProfilesPaginated(user.id, p, PAGE_SIZE, false);
          const pageProfiles = (pageResult.profiles || []) as DiscoverProfile[];
          for (const profile of pageProfiles) {
            if (!profile?.id || seen.has(profile.id)) continue;
            seen.add(profile.id);
            merged.push(profile);
            if (hasRealProfilePhoto(profile)) photoCount += 1;
          }
          resolvedPage = p;
          resolvedHasMore = pageResult.hasMore;
          if (!resolvedHasMore && photoCount >= DISCOVERY_PREFETCH_MIN_PHOTO_PROFILES) break;
        }
        incoming = merged;
      }

      if (replace && nextPage === 0) {
        setDiscoveryOrderRevision((r) => r + 1);
      }
      setProfiles((prev) => {
        if (replace) return incoming;
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of incoming) {
          if (!seen.has(p.id)) merged.push(p);
        }
        return merged;
      });
      setHasMore(resolvedHasMore);
      setPage(resolvedPage);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [user?.id]);

  const loadVerifiedProfiles = useCallback(async (options?: { forceRefresh?: boolean }) => {
    const forceRefresh = !!options?.forceRefresh;
    const now = Date.now();
    if (!forceRefresh && verifiedLoadInFlightRef.current) {
      return;
    }
    if (!forceRefresh && now - verifiedLastLoadedAtRef.current < VERIFIED_RELOAD_COOLDOWN_MS) {
      return;
    }
    if (!user?.id) {
      setProfiles([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    if (!forceRefresh) {
      try {
        const cachedRaw = await AsyncStorage.getItem(verifiedCacheKey);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw) as
            | DiscoverProfile[]
            | { items?: DiscoverProfile[]; ts?: number };
          const legacyList = Array.isArray(parsed) ? parsed : [];
          const wrappedList = !Array.isArray(parsed) && Array.isArray(parsed?.items) ? parsed.items : [];
          const cachedList = wrappedList.length > 0 ? wrappedList : legacyList;
          const cacheTs = !Array.isArray(parsed) && typeof parsed?.ts === 'number' ? parsed.ts : 0;
          const isFresh = cacheTs > 0 && Date.now() - cacheTs < VERIFIED_CACHE_TTL_MS;
          const isUsable = cachedList.length >= VERIFIED_CACHE_MIN_ITEMS;
          if (isFresh && isUsable) {
            setVerifiedBoostProfiles(cachedList);
            return;
          }
        }
      } catch {
        // Ignore cache parse/read errors and fall back to network.
      }
    }

    try {
      verifiedLoadInFlightRef.current = true;
      setLoading(true);
      const merged = new Map<string, DiscoverProfile>();

      // Primary path: fast server-side verified query.
      const { data: directVerified, error: directError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio, is_verified, profile_visible, hide_from_discover, is_suspended, created_at')
        .eq('is_verified', true)
        .or('profile_visible.eq.true,profile_visible.is.null')
        .or('hide_from_discover.eq.false,hide_from_discover.is.null')
        .or('is_suspended.is.null,is_suspended.eq.false')
        .not('id', 'eq', user.id)
        .order('created_at', { ascending: false })
        .limit(VERIFIED_FETCH_LIMIT);

      if (!directError && Array.isArray(directVerified)) {
        for (const p of directVerified as DiscoverProfile[]) {
          if (p?.id) merged.set(p.id, p);
        }
      }

      // Secondary source: profile verification sessions with verified status.
      // Some environments store verification outcome here before (or without) setting profiles.is_verified.
      const { data: verificationRows, error: verificationError } = await supabase
        .from('profile_verifications')
        .select('user_id, status, updated_at')
        .eq('status', 'verified')
        .order('updated_at', { ascending: false })
        .limit(VERIFIED_FETCH_LIMIT);

      if (!verificationError && Array.isArray(verificationRows) && verificationRows.length > 0) {
        const verifiedIds = Array.from(
          new Set(
            verificationRows
              .map((row: any) => String(row?.user_id || '').trim())
              .filter((id: string) => !!id && id !== user.id)
          )
        );

        if (verifiedIds.length > 0) {
          const { data: verifiedBySessionProfiles, error: verifiedBySessionError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', verifiedIds)
            .or('profile_visible.eq.true,profile_visible.is.null')
            .or('hide_from_discover.eq.false,hide_from_discover.is.null')
            .or('is_suspended.is.null,is_suspended.eq.false')
            .limit(VERIFIED_FETCH_LIMIT);

          if (!verifiedBySessionError && Array.isArray(verifiedBySessionProfiles)) {
            for (const p of verifiedBySessionProfiles as DiscoverProfile[]) {
              if (p?.id) merged.set(p.id, p);
            }
          }
        }
      }

      // Broad query path: pull a larger candidate set, then apply all verification logic.
      // This catches non-standard verification flags that paginated selects may not include.
      const { data: broadProfiles, error: broadError } = await supabase
        .from('profiles')
        .select('*')
        .or('profile_visible.eq.true,profile_visible.is.null')
        .or('hide_from_discover.eq.false,hide_from_discover.is.null')
        .or('is_suspended.is.null,is_suspended.eq.false')
        .not('id', 'eq', user.id)
        .order('created_at', { ascending: false })
        .limit(VERIFIED_BROAD_QUERY_LIMIT);

      if (!broadError && Array.isArray(broadProfiles)) {
        for (const p of broadProfiles as DiscoverProfile[]) {
          if (!p?.id) continue;
          if (isVerifiedProfile(p)) {
            merged.set(p.id, p);
            if (merged.size >= VERIFIED_FETCH_LIMIT) break;
          }
        }
      }

      // Fallback scan when we still have too few verified profiles.
      // Previously this ran only at size===0, which could leave the list stuck at small counts (e.g. 4).
      if (merged.size < VERIFIED_CACHE_MIN_ITEMS) {
        const seenIds = new Set<string>();
        for (const id of merged.keys()) seenIds.add(id);
        for (let scanPage = 0; scanPage < VERIFIED_MAX_SCAN_PAGES; scanPage += 1) {
          const result = await fetchVisibleProfilesPaginated(user.id, scanPage, PAGE_SIZE, false);
          const pageProfiles = (result.profiles || []) as DiscoverProfile[];
          for (const p of pageProfiles) {
            if (!p?.id || seenIds.has(p.id)) continue;
            seenIds.add(p.id);
            if (isVerifiedProfile(p)) {
              merged.set(p.id, p);
              if (merged.size >= VERIFIED_FETCH_LIMIT) break;
            }
          }
          if (merged.size >= VERIFIED_FETCH_LIMIT || !result.hasMore) break;
        }
      }

      const list = Array.from(merged.values());
      setVerifiedBoostProfiles(list);
      await AsyncStorage.setItem(
        verifiedCacheKey,
        JSON.stringify({ items: list, ts: Date.now() })
      );
      verifiedLastLoadedAtRef.current = Date.now();
    } finally {
      verifiedLoadInFlightRef.current = false;
    }
  }, [user?.id, verifiedCacheKey]);

  useEffect(() => {
    let active = true;
    setBootstrapping(true);
    Promise.allSettled([
      loadProfiles(0, true),
      loadVerifiedProfiles({ forceRefresh: false }),
    ]).finally(() => {
      if (active) setBootstrapping(false);
    });
    return () => {
      active = false;
    };
  }, [loadProfiles, loadVerifiedProfiles]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProfiles(0, true);
    loadVerifiedProfiles({ forceRefresh: true }).finally(() => {
      setRefreshing(false);
    });
  }, [loadProfiles, loadVerifiedProfiles]);

  const onLoadMore = useCallback(() => {
    if (loading || refreshing || loadingMore || !hasMore || loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    setLoadingMore(true);
    loadProfiles(page + 1, false);
    setTimeout(() => {
      loadMoreLockRef.current = false;
    }, 700);
  }, [loading, refreshing, loadingMore, hasMore, page, loadProfiles]);

  const renderItem = useCallback(
    ({ item, index }: { item: DiscoverProfile; index: number }) => {
      const handle = stripAtSymbol(item.username || item.full_name || 'user');
      const displayName = getSafeDisplayName(item.username, item.full_name) || `@${handle}`;
      const avatar =
        getSafeAvatarUrl(item.avatar_url, item.id) ||
        `https://api.dicebear.com/7.x/avataaars/png?seed=${item.id}`;
      const isLastInRow = (index + 1) % GRID_COLUMNS === 0;

      return (
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={() => router.push(`/profile/${item.id}`)}
          style={[
            styles.gridCard,
            {
              width: CARD_W,
              height: CARD_H,
              marginRight: isLastInRow ? 0 : CARD_GAP,
              backgroundColor: isDarkMode ? '#101621' : '#fff',
              borderColor: themeColors.neutral.border,
            },
          ]}
        >
          <Image
            source={{ uri: avatar }}
            style={[styles.gridAvatar, { height: `${DISCOVERY_PHOTO_PCT}%` }]}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
          />
          <View style={[styles.imageShade, { height: `${DISCOVERY_PHOTO_PCT}%` }]} />
          <View
            style={[
              styles.infoPanel,
              { top: `${DISCOVERY_PHOTO_PCT}%`, backgroundColor: isDarkMode ? '#101624' : '#ffffff' },
              COMPACT_DISCOVERY_CARD && styles.infoPanelCompact,
            ]}
          >
            <View style={styles.gridNameRow}>
              <Text style={[styles.gridName, { color: themeColors.neutral.text }]} numberOfLines={1}>
                {displayName}
              </Text>
              {isVerifiedProfile(item) ? (
                <InlineVerifiedBadge size={13} style={styles.gridNameVerified} />
              ) : null}
            </View>
            <Text style={[styles.gridHandle, { color: themeColors.neutral.textSecondary }]} numberOfLines={1}>
              @{handle}
            </Text>
            <Text
              style={[styles.bioHighlight, { color: themeColors.neutral.textSecondary }]}
              numberOfLines={COMPACT_DISCOVERY_CARD ? 1 : 2}
            >
              {item.bio?.trim() || 'Open profile to learn what they do and connect.'}
            </Text>
            <View style={[styles.cardActionsRow, COMPACT_DISCOVERY_CARD && styles.cardActionsStack]}>
              <FollowButton
                userId={item.id}
                size="compact"
                variant="outline"
                profileVisible={item.profile_visible !== false}
                style={[styles.gridFollowButtonScale, COMPACT_DISCOVERY_CARD && styles.followBtnStacked]}
              />
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push(`/chat/${item.id}` as any)}
                style={[
                  styles.messageBtn,
                  COMPACT_DISCOVERY_CARD && styles.messageBtnStacked,
                  {
                    borderColor: themeColors.neutral.border,
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#f8faff',
                  },
                ]}
              >
                <MessageCircle size={12} color={themeColors.primary.main} strokeWidth={2} />
                <Text style={[styles.messageBtnText, { color: themeColors.primary.main }]}>Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [router, isDarkMode, themeColors.neutral.border, themeColors.neutral.text, themeColors.neutral.textSecondary, themeColors.primary.main]
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Animated.View style={[styles.listFlex, { opacity: listFade }]}>
      <FlatList
        data={bootstrapping ? [] : gridProfiles}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={GRID_COLUMNS}
        removeClippedSubviews={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        ListHeaderComponent={
          <View style={{ paddingTop: Math.max(8, insets.top + 4) }}>
            <View style={styles.topBar}>
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <Animated.View style={{ transform: [{ scale: pinScale }] }}>
                    <MapPin size={16} color={themeColors.primary.main} />
                  </Animated.View>
                  <Text style={[styles.headerTitle, { color: themeColors.neutral.text }]}>Discovery</Text>
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/dating-app')}
                  style={[
                    styles.datingBtn,
                    { borderColor: themeColors.neutral.border, backgroundColor: isDarkMode ? '#101521' : '#fff' },
                  ]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.datingBtnText, { color: themeColors.primary.main }]}>Dating</Text>
                </TouchableOpacity>
              </View>
              <Animated.Text
                style={[styles.headerSub, { color: themeColors.neutral.textSecondary, opacity: hintOpacity }]}
              >
                {DISCOVERY_HINTS[hintIndex]}
              </Animated.Text>
            </View>
          </View>
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: getFloatingTabBarReservedHeight(insets.bottom) + 18 },
        ]}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColors.primary.main}
            colors={[themeColors.primary.main]}
            progressBackgroundColor={isDarkMode ? '#141a24' : '#fff'}
          />
        }
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          <View style={styles.listFooter}>
            {loadingMore ? <ActivityIndicator color={themeColors.primary.main} /> : null}
          </View>
        }
        ListEmptyComponent={
          bootstrapping ? (
            <View style={styles.skeletonListWrap}>
              <DiscoverySkeletonGrid
                isDarkMode={isDarkMode}
                borderColor={themeColors.neutral.border}
              />
              <Text style={[styles.initialLoadingText, { color: themeColors.neutral.textSecondary }]}>
                Finding people for you…
              </Text>
            </View>
          ) : loading ? (
            <View style={styles.initialLoadingWrap}>
              <ActivityIndicator size="small" color={themeColors.primary.main} />
              <Text style={[styles.initialLoadingText, { color: themeColors.neutral.textSecondary }]}>
                Loading profiles...
              </Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { color: themeColors.neutral.text }]}>No profiles to show yet</Text>
              <Text style={[styles.emptySub, { color: themeColors.neutral.textSecondary }]}>
                Pull to refresh or check back shortly.
              </Text>
            </View>
          )
        }
      />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listFlex: { flex: 1 },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    marginTop: 4,
  },
  skeletonListWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: 'center',
  },
  skeletonCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: CARD_GAP,
  },
  skeletonPhoto: {
    width: '100%',
  },
  skeletonBody: {
    flex: 1,
    paddingHorizontal: 9,
    paddingTop: 10,
    gap: 7,
  },
  skeletonLineLg: {
    height: 10,
    borderRadius: 5,
    width: '72%',
  },
  skeletonLineSm: {
    height: 8,
    borderRadius: 4,
    width: '48%',
  },
  skeletonLineMd: {
    height: 8,
    borderRadius: 4,
    width: '88%',
  },
  topBar: {
    paddingTop: 14,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datingBtn: {
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datingBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
  },
  headerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
  },
  headerSub: {
    marginTop: 4,
    fontFamily: FontFamily.regular,
    fontSize: 12,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(140,140,160,0.28)',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 32,
    justifyContent: 'center',
  },
  filterText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 34,
  },
  row: {
    marginBottom: CARD_GAP,
  },
  gridCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  gridAvatar: {
    width: '100%',
  },
  imageShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.10)',
    zIndex: 0,
  },
  infoPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'column',
    paddingHorizontal: 9,
    paddingTop: 6,
    paddingBottom: 8,
  },
  infoPanelCompact: {
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 7,
  },
  gridNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  gridName: {
    fontFamily: FontFamily.bold,
    fontSize: 12,
    flex: 1,
    minWidth: 0,
  },
  gridNameVerified: {
    flexShrink: 0,
  },
  gridHandle: {
    marginTop: 1,
    fontFamily: FontFamily.medium,
    fontSize: 10,
  },
  bioHighlight: {
    marginTop: 3,
    fontFamily: FontFamily.regular,
    fontSize: 10,
    lineHeight: 13,
  },
  cardActionsRow: {
    marginTop: 'auto',
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  cardActionsStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    width: '100%',
    gap: 6,
    marginTop: 'auto',
    paddingTop: 4,
  },
  followBtnStacked: {
    alignSelf: 'stretch',
    marginLeft: 0,
    marginBottom: 0,
    transform: [{ scale: 1 }],
  },
  messageBtnStacked: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 8,
  },
  gridFollowWrap: {
    marginTop: 5,
    alignItems: 'flex-start',
  },
  gridFollowButtonScale: {
    transform: [{ scale: 0.88 }],
    marginLeft: -4,
    marginBottom: -2,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  messageBtn: {
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  messageBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: 11,
  },
  initialLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 72,
    paddingVertical: 10,
  },
  initialLoadingText: {
    marginTop: 10,
    fontFamily: FontFamily.medium,
    fontSize: 13,
  },
  listFooter: {
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    marginTop: 72,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    textAlign: 'center',
  },
});
