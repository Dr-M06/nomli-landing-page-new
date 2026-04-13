import { supabase } from './supabase';
import { getBlockedUserIds } from './blockUser';
import { log, warn, error as logError } from './productionLogger';


export interface FetchNearbyOptions {
  userLat: number;
  userLng: number;
  radiusKm: number;
}

/** Cursor for stable geo pagination (after last row). */
export interface DiscoverGeoCursor {
  distance_km: number;
  id: string;
  boosted: boolean;
}

/**
 * Fetch visible profiles with pagination
 * When nearbyOptions provided, uses PostGIS geo query (server-side distance). Otherwise fetches by created_at.
 * For geo, pass cursor when page > 0 for stable next batch (cursor-based instead of offset).
 *
 * @param currentUserId - Current user ID to exclude from results
 * @param page - Page number (0-indexed)
 * @param pageSize - Number of profiles per page (default: 20)
 * @param onlyDiscoverDatingOptedIn - When true, only return profiles that are single
 * @param nearbyOptions - When set, fetches profiles within radiusKm of (userLat, userLng) via PostGIS
 * @param geoCursor - When set with nearbyOptions, use cursor pagination (pass from previous result nextCursor)
 */
export const fetchVisibleProfilesPaginated = async (
  currentUserId?: string,
  page: number = 0,
  pageSize: number = 20,
  onlyDiscoverDatingOptedIn: boolean = false,
  nearbyOptions?: FetchNearbyOptions,
  geoCursor?: DiscoverGeoCursor | null
): Promise<{ profiles: any[]; hasMore: boolean; totalLoaded: number; nextCursor?: DiscoverGeoCursor | null }> => {
  try {
    log(`[PaginatedFetch] Fetching page ${page} (${pageSize} profiles per page)${nearbyOptions ? ` [geo ${nearbyOptions.radiusKm}km]` : ''}${geoCursor ? ' [cursor]' : ''}...`);
    
    // Get blocked user IDs for filtering
    let blockedUserIds: string[] = [];
    if (currentUserId) {
      try {
        blockedUserIds = await getBlockedUserIds(currentUserId);
        log(`[PaginatedFetch] Found ${blockedUserIds.length} blocked users to filter`);
      } catch (blockedErr) {
        logError('[PaginatedFetch] Error getting blocked user IDs:', blockedErr);
      }
    }
    
    const blockedSet = new Set(blockedUserIds);
    const offset = page * pageSize;

    // Geo query: use PostGIS RPC when user has location and nearby filter
    if (nearbyOptions) {
      try {
        const radiusM = nearbyOptions.radiusKm * 1000;
        const useCursor = page > 0 && geoCursor != null;
        const rpcParams: Record<string, unknown> = {
          p_lat: nearbyOptions.userLat,
          p_lng: nearbyOptions.userLng,
          p_radius_m: radiusM,
          p_limit: pageSize,
          p_offset: useCursor ? 0 : offset,
          p_exclude_user_id: currentUserId || null,
          p_only_single: onlyDiscoverDatingOptedIn,
        };
        if (useCursor && geoCursor) {
          rpcParams.p_after_distance_km = geoCursor.distance_km;
          rpcParams.p_after_id = geoCursor.id;
          rpcParams.p_after_boosted = geoCursor.boosted;
        }
        const { data: geoData, error: geoError } = await supabase.rpc('get_nearby_profiles', rpcParams);
        if (!geoError && geoData && Array.isArray(geoData)) {
          const filtered = geoData.filter((p: any) => !blockedSet.has(p.id) && p.is_suspended !== true);
          const hasMore = filtered.length >= Math.max(1, pageSize - 2);
          const profiles = filtered.map((p: any) => ({
            ...p,
            distance: p.distance_km,
          }));
          const last = filtered.length > 0 ? filtered[filtered.length - 1] : null;
          const nextCursor: DiscoverGeoCursor | undefined =
            last && hasMore
              ? {
                  distance_km: last.distance_km ?? 0,
                  id: last.id,
                  boosted: !!(last.discover_boosted_until && last.discover_boosted_until > new Date().toISOString()),
                }
              : undefined;
          log(`[PaginatedFetch] Geo query: ${profiles.length} profiles within ${nearbyOptions.radiusKm}km (hasMore: ${hasMore})`);
          // Only use geo result when we got profiles; otherwise fall back to standard query so we still show discover (e.g. users outside radius)
          if (profiles.length > 0) {
            return { profiles, hasMore, totalLoaded: profiles.length, nextCursor: nextCursor ?? null };
          }
          log('[PaginatedFetch] Geo returned 0 profiles, falling back to standard query for more discover profiles');
        } else {
          log('[PaginatedFetch] Geo RPC failed or empty, falling back to standard query:', geoError?.message);
        }
      } catch (geoErr) {
        log('[PaginatedFetch] Geo query exception, falling back:', geoErr);
      }
    }
    
    try {
      // Build query with visibility filters (standard, no geo)
      // Try with gender fields first, fallback if they don't exist
      // Include profiles where profile_visible is true OR null (null = visible); hide_from_discover is false OR null (null = not hidden)
      let query = supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio, country, interests, profile_visible, hide_from_discover, estimated_latitude, estimated_longitude, latitude, longitude, is_placeholder, is_verified, created_at, last_active, updated_at, age, gender, show_me, vibe_mode, discover_boosted_until')
        .or('profile_visible.eq.true,profile_visible.is.null')
        .or('hide_from_discover.eq.false,hide_from_discover.is.null')
        .or('is_suspended.is.null,is_suspended.eq.false') // Exclude suspended users
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (onlyDiscoverDatingOptedIn) {
        query = query.or('relationship_status.is.null,relationship_status.eq.single,relationship_status.not.in.(married,in_relationship)');
      }
      // Exclude current user if provided
      if (currentUserId) {
        query = query.not('id', 'eq', currentUserId);
      }
      
      let { data, error: queryError } = await query;
      
      // If gender/show_me columns don't exist, retry without them
      if (queryError && (queryError.code === '42703' || queryError.message?.includes('column')) && queryError.message?.includes('gender')) {
        log('[PaginatedFetch] Gender columns not found, fetching without them');
        let fallbackQuery = supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, bio, country, interests, profile_visible, hide_from_discover, estimated_latitude, estimated_longitude, latitude, longitude, is_placeholder, is_verified, created_at, last_active, updated_at, age, discover_boosted_until')
          .or('profile_visible.eq.true,profile_visible.is.null')
          .or('hide_from_discover.eq.false,hide_from_discover.is.null')
          .or('is_suspended.is.null,is_suspended.eq.false')
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (onlyDiscoverDatingOptedIn) {
          fallbackQuery = fallbackQuery.or('relationship_status.is.null,relationship_status.eq.single,relationship_status.not.in.(married,in_relationship)');
        }
        if (currentUserId) {
          fallbackQuery = fallbackQuery.not('id', 'eq', currentUserId);
        }
        
        const fallbackResult = await fallbackQuery;
        data = fallbackResult.data;
        queryError = fallbackResult.error;
      }
      
      // If profile_visible or hide_from_discover columns don't exist, use fallback query
      if (queryError && (queryError.code === '42703' || queryError.message?.includes('column'))) {
        log('[PaginatedFetch] Some columns not found, using fallback query');
        
        // Fallback: try without hide_from_discover first
        let fallbackQuery = supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, bio, country, interests, profile_visible, estimated_latitude, estimated_longitude, latitude, longitude, is_placeholder, is_verified, created_at, last_active, updated_at, age, gender, show_me, discover_boosted_until')
          .or('profile_visible.eq.true,profile_visible.is.null')
          .or('is_suspended.is.null,is_suspended.eq.false') // Exclude suspended users
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (onlyDiscoverDatingOptedIn) {
          fallbackQuery = fallbackQuery.or('relationship_status.is.null,relationship_status.eq.single,relationship_status.not.in.(married,in_relationship)');
        }
        if (currentUserId) {
          fallbackQuery = fallbackQuery.not('id', 'eq', currentUserId);
        }
        
        const fallbackResult = await fallbackQuery;
        
        if (fallbackResult.error) {
          // If profile_visible also doesn't exist, fetch all profiles and filter client-side
          log('[PaginatedFetch] profile_visible column not found, fetching all profiles');
          
          let allProfilesQuery = supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, bio, country, interests, estimated_latitude, estimated_longitude, latitude, longitude, is_placeholder, is_verified, created_at, last_active, updated_at, age, gender, show_me, relationship_status, discover_boosted_until')
            .or('is_suspended.is.null,is_suspended.eq.false') // Exclude suspended users
            .order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (onlyDiscoverDatingOptedIn) {
            allProfilesQuery = allProfilesQuery.or('relationship_status.is.null,relationship_status.eq.single,relationship_status.not.in.(married,in_relationship)');
          }
          if (currentUserId) {
            allProfilesQuery = allProfilesQuery.not('id', 'eq', currentUserId);
          }
          
          const allProfilesResult = await allProfilesQuery;
          
          if (allProfilesResult.error) {
            logError(`[PaginatedFetch] Error fetching page ${page}:`, allProfilesResult.error);
            return { profiles: [], hasMore: false, totalLoaded: 0 };
          }
          
          // Filter client-side: exclude profiles with hide_from_discover = true if column exists
          const filteredData = (allProfilesResult.data || []).filter((profile: any) => {
            // Exclude suspended users
            if (profile.is_suspended === true) {
              return false;
            }
            // If hide_from_discover exists and is true, exclude
            if (profile.hide_from_discover === true) {
              return false;
            }
            // If profile_visible exists and is false, exclude
            if (profile.profile_visible === false) {
              return false;
            }
            if (onlyDiscoverDatingOptedIn && profile.relationship_status != null) {
              const lower = String(profile.relationship_status).toLowerCase().trim();
              if (lower === 'married' || lower === 'in_relationship') return false;
            }
            return true;
          });
          
          // Filter out blocked users
          const finalFiltered = filteredData.filter((profile: any) => !blockedSet.has(profile.id));
          
          const hasMore = finalFiltered.length >= Math.max(1, pageSize - 2);
          
          return {
            profiles: finalFiltered,
            hasMore,
            totalLoaded: finalFiltered.length,
          };
        } else {
          // Use fallback result (only profile_visible filter)
          const filteredData = (fallbackResult.data || []).filter((profile: any) => !blockedSet.has(profile.id));
          const hasMore = filteredData.length >= Math.max(1, pageSize - 2);
          
          return {
            profiles: filteredData,
            hasMore,
            totalLoaded: filteredData.length,
          };
        }
      }
      
      if (queryError) {
        logError(`[PaginatedFetch] Error fetching page ${page}:`, queryError);
        return { profiles: [], hasMore: false, totalLoaded: 0 };
      }
      
      if (!data || data.length === 0) {
        log(`[PaginatedFetch] No profiles found at page ${page}`);
        return { profiles: [], hasMore: false, totalLoaded: 0 };
      }
      
      // Filter out blocked users and suspended users
      const filteredProfiles = data.filter((profile: any) => {
        if (blockedSet.has(profile.id)) return false;
        if (profile.is_suspended === true) return false;
        return true;
      });

      // Boosted first only in dating mode; regular discover keeps API order
      const sorted =
        onlyDiscoverDatingOptedIn
          ? (() => {
              const now = new Date().toISOString();
              return [...filteredProfiles].sort((a: any, b: any) => {
                const aBoosted = a.discover_boosted_until && a.discover_boosted_until > now ? 1 : 0;
                const bBoosted = b.discover_boosted_until && b.discover_boosted_until > now ? 1 : 0;
                return bBoosted - aBoosted;
              });
            })()
          : filteredProfiles;
      
      // If we got a full page (or nearly – e.g. one blocked) assume more; only stop when we get clearly fewer
      const hasMore = filteredProfiles.length >= Math.max(1, pageSize - 2);
      
      log(`[PaginatedFetch] Page ${page}: Fetched ${data.length} profiles, ${sorted.length} after filtering (hasMore: ${hasMore})`);
      
      return {
        profiles: sorted,
        hasMore,
        totalLoaded: sorted.length,
      };
    } catch (fetchError) {
      logError(`[PaginatedFetch] Exception fetching page ${page}:`, fetchError);
      return { profiles: [], hasMore: false, totalLoaded: 0 };
    }
  } catch (outerErr) {
    logError('[PaginatedFetch] Error in fetchVisibleProfilesPaginated:', outerErr);
    return { profiles: [], hasMore: false, totalLoaded: 0 };
  }
};

const DEFAULT_PAGE_SIZE = 50;
/** Max profiles to load for discover/dating so users see a full deck; new profiles appear on each app open via background refresh. */
const MAX_DISCOVER_PROFILES = 300;

/**
 * Fetch a full set of discover profiles (video-feed style): load from DB so users see new profiles on each app open.
 * Optionally return after first batch for fast first paint, then caller can request full set in background.
 *
 * @param currentUserId - Current user ID to exclude
 * @param onlyDiscoverDatingOptedIn - When true, only single profiles
 * @param nearbyOptions - When set, uses PostGIS geo query (paginated via offset)
 * @param firstBatchOnly - If set, return after this many profiles for fast first paint; otherwise fetch up to maxProfiles
 */
export const fetchAllDiscoverProfiles = async (
  currentUserId?: string,
  onlyDiscoverDatingOptedIn: boolean = false,
  nearbyOptions?: FetchNearbyOptions,
  firstBatchOnly?: number
): Promise<{ profiles: any[]; totalLoaded: number }> => {
  const pageSize = DEFAULT_PAGE_SIZE;
  const maxProfiles = firstBatchOnly != null ? Math.min(firstBatchOnly, MAX_DISCOVER_PROFILES) : MAX_DISCOVER_PROFILES;
  const all: any[] = [];
  let page = 0;
  let geoCursor: DiscoverGeoCursor | null | undefined = null;

  try {
    while (all.length < maxProfiles) {
      const result = await fetchVisibleProfilesPaginated(
        currentUserId,
        page,
        pageSize,
        onlyDiscoverDatingOptedIn,
        nearbyOptions,
        page > 0 && nearbyOptions ? geoCursor ?? undefined : undefined
      );
      if (nearbyOptions && result.nextCursor != null) geoCursor = result.nextCursor;
      if (!result.profiles || result.profiles.length === 0) break;
      const dedup = result.profiles.filter((p: any) => p?.id && !all.some((e: any) => e.id === p.id));
      all.push(...dedup);
      if (!result.hasMore || result.profiles.length < pageSize) break;
      page++;
      if (firstBatchOnly != null && all.length >= firstBatchOnly) break;
    }
    const totalLoaded = all.length;
    log(`[PaginatedFetch] fetchAllDiscoverProfiles: ${totalLoaded} profiles${firstBatchOnly != null ? ` (first batch only)` : ''}`);
    return { profiles: all, totalLoaded };
  } catch (err) {
    logError('[PaginatedFetch] fetchAllDiscoverProfiles error:', err);
    return { profiles: all, totalLoaded: all.length };
  }
};

