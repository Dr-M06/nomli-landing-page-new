import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../../utils/supabase';
import { 
  getDistanceInKm,
  getStoredUserLocation,
  getCurrentLocation,
} from '../../utils/locationUtils';
import { getSafeAvatarUrl } from '../../utils/safeAvatarUrl';
import { NearbyProfile, FilterType } from '../../components/nearby/types';

const PAGE_SIZE = 20;
/** Minimum profiles to show on first load so the grid looks full (e.g. 2–3 rows of 3). */
const MIN_INITIAL_PROFILES = 12;

/** Fisher-Yates shuffle so discover order varies on each load. */
function shuffleProfiles<T>(arr: T[]): T[] {
  if (arr.length <= 1) return arr;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** True when profile is currently boosted (discover_boosted_until > now). */
function isProfileBoosted(p: { discover_boosted_until?: string | null }): boolean {
  return !!(p.discover_boosted_until && p.discover_boosted_until > new Date().toISOString());
}

// Verified profiles list
const VERIFIED_PROFILES = [
  'zanga pay', 'zangapay', 'zanga_pay', 'zanga-pay', 'zangapay1', 'zangapay2',
];

interface UseNearbyUsersProps {
  userId?: string;
  location: Location.LocationObject | null;
  selectedFilter: FilterType | null;
  selectedGender: string | null;
  userGenderPreference: string | null;
  hideNoPhotoProfiles: boolean;
  /** Radius in km for Nearby filter (10, 50, 100, 200). Used for PostGIS geo query when selectedFilter is 'Nearby'. */
  nearbyRadiusKm?: number;
  /** Age range filter (Tinder-style). When set, only profiles with age in [min, max] are shown. */
  ageRangeMin?: number;
  ageRangeMax?: number;
  /** Current user's interests for "Shared Interests" filter; when set, only profiles with at least one matching interest are shown. */
  userInterests?: string[] | null;
  /** When true, only fetch profiles that are single (relationship_status not married/in_relationship). */
  onlyDiscoverDatingOptedIn?: boolean;
}

interface UseNearbyUsersReturn {
  allUsers: NearbyProfile[];
  filteredUsers: NearbyProfile[];
  loading: boolean;
  loadingMore: boolean;
  hasMoreUsers: boolean;
  currentPage: number;
  refreshing: boolean;
  fetchAllUsers: (useCache?: boolean) => Promise<void>;
  fetchUsersPage: (page: number, reset?: boolean) => Promise<void>;
  loadMoreUsers: () => Promise<void>;
  handleRefresh: () => Promise<void>;
  resetPagination: () => void;
}

const DEFAULT_AGE_MIN = 18;
const DEFAULT_AGE_MAX = 99;

const DEFAULT_NEARBY_RADIUS_KM = 50;

export function useNearbyUsers({
  userId,
  location,
  selectedFilter,
  selectedGender,
  userGenderPreference,
  hideNoPhotoProfiles,
  nearbyRadiusKm = DEFAULT_NEARBY_RADIUS_KM,
  ageRangeMin = DEFAULT_AGE_MIN,
  ageRangeMax = DEFAULT_AGE_MAX,
  userInterests = null,
  onlyDiscoverDatingOptedIn = false,
}: UseNearbyUsersProps): UseNearbyUsersReturn {
  const [allUsers, setAllUsers] = useState<NearbyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMoreUsers, setHasMoreUsers] = useState(true);
  const [cachedUsers, setCachedUsers] = useState<Map<number, NearbyProfile[]>>(new Map());
  
  const isFetchingRef = useRef(false);
  const cachedUsersRef = useRef<Map<number, NearbyProfile[]>>(new Map());
  const hasUsersRef = useRef(false); // Track if users are currently displayed
  const lastGeoCursorRef = useRef<{ distance_km: number; id: string; boosted: boolean } | null>(null);
  
  // Sync refs with state
  useEffect(() => {
    cachedUsersRef.current = cachedUsers;
  }, [cachedUsers]);
  
  useEffect(() => {
    hasUsersRef.current = allUsers.length > 0;
  }, [allUsers.length]);

  // Check if profile is verified
  const isProfileVerified = useCallback((profile: NearbyProfile): boolean => {
    if (profile.is_verified) return true;
    
    const username = profile.username?.toLowerCase() || '';
    const fullName = profile.full_name?.toLowerCase() || '';
    
    return VERIFIED_PROFILES.some(name => 
      username.includes(name) || fullName.includes(name)
    );
  }, []);

  // Check if profile has real photo: exclude placeholders; include image extensions or known upload storage
  const hasRealPhoto = useCallback((profile: NearbyProfile): boolean => {
    const avatarUrl = profile.avatar_url;
    if (!avatarUrl) return false;
    const lowerUrl = avatarUrl.toLowerCase();
    // Exclude placeholders: dicebear avatars, emoji URLs
    if (lowerUrl.includes('dicebear')) return false;
    if (lowerUrl.includes('api.dicebear')) return false;
    if (/[\u{1F300}-\u{1F9FF}]/u.test(avatarUrl)) return false;
    // Include if URL has image extension (photo type) or is from known image storage (paths often have no extension)
    const hasImageExtension =
      lowerUrl.includes('.jpg') ||
      lowerUrl.includes('.jpeg') ||
      lowerUrl.includes('.png') ||
      lowerUrl.includes('.webp') ||
      lowerUrl.includes('.gif');
    const isKnownImageStorage =
      lowerUrl.includes('supabase') ||
      lowerUrl.includes('bunny.net') ||
      lowerUrl.includes('bunnycdn.com');
    return hasImageExtension || isKnownImageStorage;
  }, []);

  // Check if profile is complete
  const hasCompleteProfile = useCallback((profile: NearbyProfile): boolean => {
    let completedFields = 0;
    if (profile.username && profile.username.trim().length > 0) completedFields++;
    if (profile.full_name && profile.full_name.trim().length > 0) completedFields++;
    if (profile.bio && profile.bio.trim().length > 0) completedFields++;
    if (profile.age && profile.age > 0) completedFields++;
    if (profile.country && profile.country.trim().length > 0) completedFields++;
    return completedFields >= 3;
  }, []);

  // Process profiles (add verification, calculate distances)
  const processProfiles = useCallback((profiles: NearbyProfile[]): NearbyProfile[] => {
    const profilesWithVerification = profiles.map(profile => ({
      ...profile,
      is_verified: isProfileVerified(profile),
    }));
    
    if (location?.coords) {
      return profilesWithVerification.map(profile => {
        const profileLat = profile.estimated_latitude || profile.latitude;
        const profileLon = profile.estimated_longitude || profile.longitude;
        
        if (profileLat && profileLon) {
          try {
            const distance = getDistanceInKm(
              location.coords.latitude,
              location.coords.longitude,
              profileLat,
              profileLon
            );
            return { ...profile, distance };
          } catch {
            return { ...profile, distance: undefined };
          }
        }
        return { ...profile, distance: undefined };
      });
    }
    
    return profilesWithVerification.map(p => ({ ...p, distance: undefined }));
  }, [location, isProfileVerified]);

  // Fetch users page
  const fetchUsersPage = useCallback(async (page: number, reset: boolean = false) => {
    try {
      if (isFetchingRef.current && !reset) return;
      isFetchingRef.current = true;
      
      const currentUserId = userId || undefined;

      // Check cache first (use ref to avoid dependency issues)
      if (!reset && cachedUsersRef.current.has(page)) {
        const cachedPageUsers = cachedUsersRef.current.get(page) || [];
        setAllUsers(prev => {
          const profileMap = new Map<string, NearbyProfile>();
          prev.forEach(p => p?.id && profileMap.set(p.id, p));
          cachedPageUsers.forEach(p => p?.id && profileMap.set(p.id, p));
          return Array.from(profileMap.values());
        });
        setHasMoreUsers(cachedUsersRef.current.has(page + 1));
        setLoadingMore(false);
        isFetchingRef.current = false;
        return;
      }

      if (reset) {
        // Only show loading spinner if no users are currently displayed
        // This keeps existing content visible during pull-to-refresh (stale-while-revalidate)
        if (!hasUsersRef.current) {
          setLoading(true);
        }
        setCurrentPage(0);
        // Don't clear allUsers - keep existing content visible until new data arrives
        setCachedUsers(new Map());
        setHasMoreUsers(true);
      } else {
        setLoadingMore(true);
      }
      
      const { fetchVisibleProfilesPaginated } = await import('../../utils/paginatedDataFetch');
      // Geo query (PostGIS) only in dating/single mode
      const nearbyOptions =
        onlyDiscoverDatingOptedIn &&
        selectedFilter === 'Nearby' &&
        location?.coords?.latitude != null &&
        location?.coords?.longitude != null
          ? {
              userLat: location.coords.latitude,
              userLng: location.coords.longitude,
              radiusKm: nearbyRadiusKm,
            }
          : undefined;
      if (reset && page === 0) {
        lastGeoCursorRef.current = null;
      }
      const geoCursor = page > 0 && nearbyOptions ? lastGeoCursorRef.current : undefined;
      const result = await fetchVisibleProfilesPaginated(
        currentUserId,
        page,
        PAGE_SIZE,
        onlyDiscoverDatingOptedIn,
        nearbyOptions,
        geoCursor ?? undefined
      );
      if (nearbyOptions && result.nextCursor != null) {
        lastGeoCursorRef.current = result.nextCursor;
      }
      
      if (!result.profiles || result.profiles.length === 0) {
        // Cache empty page so we don't re-request the same page repeatedly
        setCachedUsers(prev => {
          const next = new Map(prev);
          next.set(page, []);
          cachedUsersRef.current = next;
          return next;
        });
        setHasMoreUsers(false);
        setLoading(false);
        setLoadingMore(false);
        isFetchingRef.current = false;
        return;
      }
      
      const validProfiles = result.profiles.filter(
        profile => profile && profile.id && typeof profile.id === 'string'
      );
      
      const processedProfiles = processProfiles(validProfiles);
      // In dating mode keep API order (boosted first); in regular discover shuffle only (no boost)
      const toSet = page === 0 && reset
        ? (onlyDiscoverDatingOptedIn ? processedProfiles : shuffleProfiles(processedProfiles))
        : processedProfiles;
      
      // Cache in memory (store unshuffled for consistency when merging pages)
      setCachedUsers(prev => {
        const newCache = new Map(prev);
        newCache.set(page, processedProfiles);
        cachedUsersRef.current = newCache; // Update ref immediately
        return newCache;
      });
      
      // Cache to persistent storage for first page
      if (page === 0) {
        try {
          const { cacheNearbyProfiles } = await import('../../utils/profileCache');
          await cacheNearbyProfiles(processedProfiles);
        } catch {
          // Silent fail
        }
      }
      
      // Preload next page so grid fills: immediately if first batch is small, else soon
      if (result.hasMore && page === 0) {
        const delay = toSet.length < MIN_INITIAL_PROFILES ? 0 : 400;
        const schedule = () => fetchUsersPage(1, false).catch(() => {});
        if (delay === 0) schedule();
        else setTimeout(schedule, delay);
      }
      
      if (reset) {
        setAllUsers(toSet);
      } else {
        setAllUsers(prev => {
          const profileMap = new Map<string, NearbyProfile>();
          prev.forEach(p => p?.id && profileMap.set(p.id, p));
          processedProfiles.forEach(p => p?.id && profileMap.set(p.id, p));
          return Array.from(profileMap.values());
        });
      }
      
      setHasMoreUsers(result.hasMore);
      setCurrentPage(page);
      setLoading(false);
      setLoadingMore(false);
      isFetchingRef.current = false;
      
    } catch (error) {
      __DEV__ && console.error(`[useNearbyUsers] Error fetching page ${page}:`, error);
      setLoading(false);
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [userId, processProfiles, onlyDiscoverDatingOptedIn, selectedFilter, location, nearbyRadiusKm]);

  const prevOnlyDiscoverDatingOptedInRef = useRef(onlyDiscoverDatingOptedIn);
  useEffect(() => {
    if (prevOnlyDiscoverDatingOptedInRef.current !== onlyDiscoverDatingOptedIn) {
      prevOnlyDiscoverDatingOptedInRef.current = onlyDiscoverDatingOptedIn;
      setCachedUsers(new Map());
      cachedUsersRef.current = new Map();
      setHasMoreUsers(true);
      setCurrentPage(0);
      fetchUsersPage(0, true).catch(() => {});
    }
  }, [onlyDiscoverDatingOptedIn, fetchUsersPage]);

  // Fetch discover profiles: in dating mode use pagination only (so we can load thousands); in grid mode use cache-first then full set
  const fetchAllUsers = useCallback(async (useCache: boolean = true) => {
    const currentUserId = userId || undefined;
    const nearbyOpts =
      onlyDiscoverDatingOptedIn &&
      selectedFilter === 'Nearby' &&
      location?.coords?.latitude != null &&
      location?.coords?.longitude != null
        ? { userLat: location.coords.latitude, userLng: location.coords.longitude, radiusKm: nearbyRadiusKm }
        : undefined;

    // Dating/swipe mode: always use pagination so we can keep loading more (thousands of profiles)
    if (onlyDiscoverDatingOptedIn) {
      setCachedUsers(new Map());
      cachedUsersRef.current = new Map();
      setHasMoreUsers(true);
      await fetchUsersPage(0, true);
      return;
    }

    // 1) Cache-first: show cached profiles immediately, then load full set from DB in background
    if (useCache) {
      try {
        const { getCachedNearbyProfiles, cacheNearbyProfiles } = await import('../../utils/profileCache');
        const cachedProfiles = await getCachedNearbyProfiles();
        if (cachedProfiles && cachedProfiles.length > 0) {
          const processedCached = processProfiles(cachedProfiles as NearbyProfile[]);
          const shuffled = shuffleProfiles(processedCached);
          setAllUsers(shuffled);
          setLoading(false);
          setCurrentPage(0);
          setHasMoreUsers(false);
          setCachedUsers(new Map());
          cachedUsersRef.current = new Map();

          const { fetchAllDiscoverProfiles } = await import('../../utils/paginatedDataFetch');
          fetchAllDiscoverProfiles(currentUserId, false, nearbyOpts)
            .then(({ profiles }) => {
              if (!profiles?.length) return;
              const valid = profiles.filter((p: any) => p?.id && typeof p.id === 'string');
              const processed = processProfiles(valid as NearbyProfile[]);
              const shuffledFresh = shuffleProfiles(processed);
              setAllUsers(shuffledFresh);
              cacheNearbyProfiles(shuffledFresh).catch(() => {});
            })
            .catch(() => {});
          return;
        }
      } catch {
        // Silent fail, fall through to fresh fetch
      }
    }

    // 2) No cache: fast first batch (80), then full set in background (video-feed style)
    setLoading(true);
    try {
      const { fetchAllDiscoverProfiles } = await import('../../utils/paginatedDataFetch');
      const { cacheNearbyProfiles } = await import('../../utils/profileCache');

      const first = await fetchAllDiscoverProfiles(currentUserId, false, nearbyOpts, 80);
      if (first.profiles?.length > 0) {
        const valid = first.profiles.filter((p: any) => p?.id && typeof p.id === 'string');
        const processed = processProfiles(valid as NearbyProfile[]);
        setAllUsers(shuffleProfiles(processed));
        setCurrentPage(0);
        setHasMoreUsers(true);
      }
      setLoading(false);

      fetchAllDiscoverProfiles(currentUserId, false, nearbyOpts)
        .then(({ profiles }) => {
          if (!profiles?.length) return;
          const valid = profiles.filter((p: any) => p?.id && typeof p.id === 'string');
          const processed = processProfiles(valid as NearbyProfile[]);
          const shuffledFresh = shuffleProfiles(processed);
          setAllUsers(shuffledFresh);
          setHasMoreUsers(false);
          cacheNearbyProfiles(shuffledFresh).catch(() => {});
        })
        .catch(() => {
          setLoading(false);
        });
    } catch (err) {
      __DEV__ && console.error('[useNearbyUsers] fetchAllUsers error:', err);
      setLoading(false);
      await fetchUsersPage(0, true);
    }
  }, [userId, processProfiles, onlyDiscoverDatingOptedIn, selectedFilter, location?.coords?.latitude, location?.coords?.longitude, nearbyRadiusKm, fetchUsersPage]);

  // Load more users (always try next page on tap so "Load more" works even when hasMoreUsers was set false)
  const loadMoreUsers = useCallback(async () => {
    if (loadingMore || isFetchingRef.current) return;
    const nextPage = currentPage + 1;
    await fetchUsersPage(nextPage, false);
  }, [loadingMore, currentPage, fetchUsersPage]);

  // Handle refresh: in dating mode keep pagination so we can keep loading more; in grid mode fetch full set
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (onlyDiscoverDatingOptedIn) {
        // Dating/swipe mode: reset cache and fetch fresh first page so hasMoreUsers stays from API – can load thousands
        setCachedUsers(new Map());
        cachedUsersRef.current = new Map();
        setCurrentPage(0);
        setHasMoreUsers(true);
        await fetchUsersPage(0, true);
      } else {
        const currentUserId = userId || undefined;
        const nearbyOpts =
          selectedFilter === 'Nearby' &&
          location?.coords?.latitude != null &&
          location?.coords?.longitude != null
            ? { userLat: location.coords.latitude, userLng: location.coords.longitude, radiusKm: nearbyRadiusKm }
            : undefined;
        const { fetchAllDiscoverProfiles } = await import('../../utils/paginatedDataFetch');
        const { cacheNearbyProfiles } = await import('../../utils/profileCache');
        const { profiles } = await fetchAllDiscoverProfiles(currentUserId, false, nearbyOpts);
        if (profiles?.length > 0) {
          const valid = profiles.filter((p: any) => p?.id && typeof p.id === 'string');
          const processed = processProfiles(valid as NearbyProfile[]);
          const shuffled = shuffleProfiles(processed);
          setAllUsers(shuffled);
          cacheNearbyProfiles(shuffled).catch(() => {});
        }
        setCurrentPage(0);
        setHasMoreUsers(false);
      }
    } catch (error) {
      __DEV__ && console.error('[useNearbyUsers] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  }, [userId, processProfiles, onlyDiscoverDatingOptedIn, selectedFilter, location?.coords?.latitude, location?.coords?.longitude, nearbyRadiusKm, fetchUsersPage]);

  // Reset pagination
  const resetPagination = useCallback(() => {
    setCurrentPage(0);
    const emptyCache = new Map();
    setCachedUsers(emptyCache);
    cachedUsersRef.current = emptyCache;
    setHasMoreUsers(true);
    setAllUsers([]);
  }, []);

  // Filtered users with memoization.
  // Boosted profiles override everything except gender: they always appear at top (if they pass gender). Other filters (photo, age, interests, distance) do not exclude boosted.
  const filteredUsers = useMemo(() => {
    if (!allUsers || !Array.isArray(allUsers)) return [];

    const base = allUsers.filter((user): user is NearbyProfile => !!(user && user.is_suspended !== true));
    if (base.length === 0) return [];

    // 1) Gender filter only (boosted still respect gender)
    let afterGender = base;
    if (selectedGender && selectedGender !== 'all') {
      const selectedGenderLower = selectedGender.toLowerCase().trim();
      afterGender = afterGender.filter(user => {
        const userGender = user.gender?.toLowerCase()?.trim();
        if (!userGender) return true;
        if (selectedGenderLower === 'male') return userGender === 'male';
        if (selectedGenderLower === 'female') return userGender === 'female';
        if (selectedGenderLower === 'other') return userGender !== 'male' && userGender !== 'female';
        return true;
      });
    } else if (userGenderPreference && userGenderPreference !== 'all' && !selectedGender) {
      const preferenceLower = userGenderPreference.toLowerCase().trim();
      afterGender = afterGender.filter(user => {
        const userGender = user.gender?.toLowerCase()?.trim();
        if (!userGender) return true;
        if (preferenceLower === 'male') return userGender === 'male';
        if (preferenceLower === 'female') return userGender === 'female';
        if (preferenceLower === 'other') return userGender !== 'male' && userGender !== 'female';
        return true;
      });
    }

    // 2) Split: boosted (override all except gender) vs non-boosted (apply other filters)
    const boosted = afterGender.filter(isProfileBoosted);
    let nonBoosted = afterGender.filter(p => !isProfileBoosted(p));

    // 3) For non-boosted only: photo filter
    if (hideNoPhotoProfiles) {
      nonBoosted = nonBoosted.filter(user => hasRealPhoto(user));
    }

    // 4) For non-boosted only: selected filter (Nearby / Age / Shared Interests) and sort
    if (selectedFilter === 'Nearby') {
      const maxKm = nearbyRadiusKm;
      const fallbackKm = Math.min(500, maxKm * 2);
      let nearby = nonBoosted.filter(user =>
        user.distance !== undefined && user.distance !== null && user.distance <= maxKm
      );
      if (nearby.length === 0) {
        nearby = nonBoosted.filter(user =>
          user.distance !== undefined && user.distance !== null && user.distance <= fallbackKm
        );
      }
      if (nearby.length === 0) nearby = nonBoosted;
      nonBoosted = [...nearby].sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999));
    } else if (selectedFilter === 'Age Range') {
      const minAge = Math.max(18, Math.min(99, ageRangeMin));
      const maxAge = Math.max(18, Math.min(99, ageRangeMax));
      if (minAge <= maxAge) {
        nonBoosted = nonBoosted.filter(user => {
          const age = user.age;
          if (age == null || typeof age !== 'number') return false;
          return age >= minAge && age <= maxAge;
        });
      }
      nonBoosted = [...nonBoosted].sort((a, b) => (a.age ?? 999) - (b.age ?? 999));
    } else if (selectedFilter === 'Shared Interests') {
      if (userInterests && userInterests.length > 0) {
        const userInterestsLower = userInterests.map(i => (i || '').toLowerCase().trim()).filter(Boolean);
        nonBoosted = nonBoosted.filter(profile => {
          const profileInterests = profile.interests ?? [];
          return profileInterests.some(pi =>
            userInterestsLower.some(ui => (pi || '').toLowerCase().trim() === ui || (pi || '').toLowerCase().includes(ui))
          );
        });
      }
      nonBoosted = [...nonBoosted].sort((a, b) => (b.interests?.length ?? 0) - (a.interests?.length ?? 0));
    }

    // 5) Sort boosted by distance for stable order; non-boosted: real photo first
    const boostedSorted = [...boosted].sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999));
    const nonBoostedPhotoSort = [...nonBoosted].sort((a, b) => {
      const aHas = hasRealPhoto(a) ? 1 : 0;
      const bHas = hasRealPhoto(b) ? 1 : 0;
      return bHas - aHas;
    });

    // 6) Boosted first, then rest; dedupe by id (first occurrence wins)
    const combined = [...boostedSorted, ...nonBoostedPhotoSort];
    return Array.from(new Map(combined.map(p => [p.id, p])).values());
  }, [allUsers, selectedFilter, hideNoPhotoProfiles, selectedGender, userGenderPreference, nearbyRadiusKm, ageRangeMin, ageRangeMax, userInterests, hasRealPhoto]);

  return {
    allUsers,
    filteredUsers,
    loading,
    loadingMore,
    hasMoreUsers,
    currentPage,
    refreshing,
    fetchAllUsers,
    fetchUsersPage,
    loadMoreUsers,
    handleRefresh,
    resetPagination,
  };
}
