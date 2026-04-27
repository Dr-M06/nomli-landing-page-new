/**
 * Pre-fetch Service - Loads critical data during splash screen
 * This makes the app feel instant like Instagram/TikTok
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { fetchStories } from './storyUtils';
import { fetchPosts } from './communityUtils';
import { log, warn, error } from './productionLogger';


const PREFETCH_CACHE_KEY = '@nomli_prefetch_cache';
const PREFETCH_TIMESTAMP_KEY = '@nomli_prefetch_timestamp';
// NIGERIA-OPTIMIZED CACHING: Cache lasts 72 hours for instant app loading
// Longer cache = less data usage = faster app = better for Nigeria
// Users will see cached content immediately, then fresh data loads in background
const CACHE_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72 hours (Nigeria-optimized, increased from 48h)

interface PrefetchCache {
  stories: any[];
  posts: any[];
  userProfile: any | null;
  timestamp: number;
}

/**
 * Initialize empty cache on first launch
 * This ensures UI never shows "empty" state
 */
export const initializeEmptyCache = async (): Promise<void> => {
  try {
    const existingCache = await AsyncStorage.getItem(PREFETCH_CACHE_KEY);
    if (!existingCache) {
      const emptyCache: PrefetchCache = {
        stories: [],
        posts: [],
        userProfile: null,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(PREFETCH_CACHE_KEY, JSON.stringify(emptyCache));
      log('✅ [Prefetch] Initialized empty cache for first launch');
    }
  } catch (error) {
    error('[Prefetch] Error initializing empty cache:', error);
  }
};

/**
 * Pre-fetch critical data during splash screen
 * This runs in parallel to maximize speed
 */
export const prefetchCriticalData = async (): Promise<PrefetchCache> => {
  const startTime = Date.now();
  log('🚀 [Prefetch] Starting critical data pre-fetch...');

  try {
    // Check if we have fresh cache
    const cachedTimestamp = await AsyncStorage.getItem(PREFETCH_TIMESTAMP_KEY);
    const cacheAge = cachedTimestamp ? Date.now() - parseInt(cachedTimestamp, 10) : Infinity;
    
    // PROGRESSIVE CACHE REFRESH: Refresh cache at 24 hours (before 48-hour expiry)
    // This ensures cache is always fresh and prevents cold starts
    const PROGRESSIVE_REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours
    const shouldRefreshInBackground = cacheAge >= PROGRESSIVE_REFRESH_MS && cacheAge < CACHE_EXPIRY_MS;
    
    if (cacheAge < CACHE_EXPIRY_MS) {
      const cachedData = await AsyncStorage.getItem(PREFETCH_CACHE_KEY);
      if (cachedData) {
        const cacheSizeKB = (cachedData.length * 2) / 1024;
        log(`✅ [Prefetch] Using cached data (${Math.round(cacheAge / 1000)}s old, ${cacheSizeKB.toFixed(2)}KB) on ${Platform.OS}`);
        try {
          const parsed = JSON.parse(cachedData);
          // Verify cache has expected structure
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.posts)) {
            // PROGRESSIVE REFRESH: Refresh cache in background if it's older than 24 hours
            if (shouldRefreshInBackground) {
              log('[Prefetch] 🔄 Cache is 24+ hours old, refreshing in background...');
              // Refresh in background (non-blocking) - use a flag to prevent recursion
              const refreshCache = async () => {
                try {
                  // Fetch fresh data without checking cache again (to prevent recursion)
                  const [storiesResult, postsResult, profileResult] = await Promise.allSettled([
                    fetchStories().catch(() => []),
                    fetchPosts(5, 0, true).catch(() => []),
                    fetchUserProfile().catch(() => null),
                  ]);
                  
                  const freshData: PrefetchCache = {
                    stories: storiesResult.status === 'fulfilled' ? storiesResult.value : [],
                    posts: postsResult.status === 'fulfilled' ? postsResult.value : [],
                    userProfile: profileResult.status === 'fulfilled' ? profileResult.value : null,
                    timestamp: Date.now(),
                  };
                  
                  // Update cache
                  await AsyncStorage.multiSet([
                    [PREFETCH_CACHE_KEY, JSON.stringify(freshData)],
                    [PREFETCH_TIMESTAMP_KEY, Date.now().toString()]
                  ]);
                  log('[Prefetch] ✅ Progressive refresh completed');
                } catch (err) {
                  warn('[Prefetch] Background refresh failed:', err);
                }
              };
              refreshCache();
            }
            return parsed;
          } else {
            warn('[Prefetch] ⚠️ Invalid cache structure, will fetch fresh data');
          }
        } catch (parseError) {
          error('[Prefetch] Error parsing cached data:', parseError);
          // Clear corrupted cache
          await AsyncStorage.multiRemove([PREFETCH_CACHE_KEY, PREFETCH_TIMESTAMP_KEY]);
        }
      } else {
        log(`[Prefetch] No cached data found (timestamp exists but data missing) on ${Platform.OS}`);
      }
    } else {
      log(`[Prefetch] Cache expired (${Math.round(cacheAge / 1000)}s old, limit: ${CACHE_EXPIRY_MS / 1000}s) on ${Platform.OS}`);
    }

    // Fetch all critical data in parallel
    // IMPORTANT: Use fetchPosts (not getCachedPosts) to ensure data is fetched and cached properly
    // AFRICA-OPTIMIZED + iOS-OPTIMIZED: Smaller initial batch for faster loading
    // iOS: Use even smaller batch (3 posts) due to AsyncStorage limits and slower JSON parsing
    const initialBatchSize = Platform.OS === 'ios' ? 3 : 5;
    
    const [storiesResult, postsResult, profileResult] = await Promise.allSettled([
      fetchStories().catch(err => {
        warn('[Prefetch] Stories fetch failed:', err);
        return [];
      }),
      fetchPosts(initialBatchSize, 0, true).catch(err => {
        warn('[Prefetch] Posts fetch failed:', err);
        return [];
      }),
      fetchUserProfile().catch(err => {
        warn('[Prefetch] Profile fetch failed:', err);
        return null;
      }),
    ]);

    const stories = storiesResult.status === 'fulfilled' ? storiesResult.value : [];
    const posts = postsResult.status === 'fulfilled' ? postsResult.value : [];
    const userProfile = profileResult.status === 'fulfilled' ? profileResult.value : null;

    const prefetchData: PrefetchCache = {
      stories,
      posts: posts || [],
      userProfile,
      timestamp: Date.now(),
    };

    // Cache the results with improved error handling for iOS
    try {
      let cacheString = JSON.stringify(prefetchData);
      // Check cache size (iOS has stricter limits ~6MB for AsyncStorage)
      // Estimate size: UTF-16 encoding uses 2 bytes per character
      const cacheSizeMB = (cacheString.length * 2) / (1024 * 1024);
      const iOS_MAX_CACHE_MB = 4; // iOS: More conservative limit (4MB vs 6MB)
      const ANDROID_MAX_CACHE_MB = 5;
      const maxCacheMB = Platform.OS === 'ios' ? iOS_MAX_CACHE_MB : ANDROID_MAX_CACHE_MB;
      
      // iOS: Reduce cache size more aggressively if needed
      if (Platform.OS === 'ios' && cacheSizeMB > iOS_MAX_CACHE_MB) {
        log('[Prefetch] iOS: Reducing cache size to prevent performance issues...');
        const reducedCache: PrefetchCache = {
          stories: prefetchData.stories.slice(0, 5), // Limit stories more on iOS
          posts: prefetchData.posts.slice(0, 3), // Limit posts more on iOS
          userProfile: prefetchData.userProfile,
          timestamp: prefetchData.timestamp,
        };
        const reducedCacheString = JSON.stringify(reducedCache);
        const reducedSizeMB = (reducedCacheString.length * 2) / (1024 * 1024);
        if (reducedSizeMB <= iOS_MAX_CACHE_MB) {
          cacheString = reducedCacheString; // Use reduced cache for saving
          log(`[Prefetch] iOS: Reduced cache to ${reducedSizeMB.toFixed(2)}MB`);
        }
      } else if (cacheSizeMB > maxCacheMB) {
        warn(`[Prefetch] Cache size is large (${cacheSizeMB.toFixed(2)}MB), may cause issues on ${Platform.OS}`);
      }
      
      // Use multiSet for atomic operations (better for iOS)
      await AsyncStorage.multiSet([
        [PREFETCH_CACHE_KEY, cacheString],
        [PREFETCH_TIMESTAMP_KEY, Date.now().toString()]
      ]);
      
      // Verify cache was saved (important for iOS)
      const verifyCache = await AsyncStorage.getItem(PREFETCH_CACHE_KEY);
      if (!verifyCache) {
        error('[Prefetch] ⚠️ Cache verification failed - data not saved!');
      } else {
        log(`[Prefetch] ✅ Cache verified (${Math.round(cacheString.length / 1024)}KB)`);
      }
    } catch (cacheError: any) {
      error('[Prefetch] Error saving cache:', cacheError);
      // On iOS, AsyncStorage can fail with quota exceeded errors
      if (cacheError?.message?.includes('quota') || cacheError?.message?.includes('storage')) {
        warn('[Prefetch] Storage quota exceeded, clearing old cache...');
        try {
          // Clear old cache and retry
          await AsyncStorage.multiRemove([PREFETCH_CACHE_KEY, PREFETCH_TIMESTAMP_KEY]);
          // Retry with smaller dataset
          const smallerCache: PrefetchCache = {
            stories: prefetchData.stories.slice(0, 10), // Limit stories
            posts: prefetchData.posts.slice(0, 10), // Limit posts
            userProfile: prefetchData.userProfile,
            timestamp: prefetchData.timestamp,
          };
          await AsyncStorage.multiSet([
            [PREFETCH_CACHE_KEY, JSON.stringify(smallerCache)],
            [PREFETCH_TIMESTAMP_KEY, Date.now().toString()]
          ]);
          log('[Prefetch] ✅ Saved smaller cache after quota error');
        } catch (retryError) {
          error('[Prefetch] Failed to save even smaller cache:', retryError);
        }
      }
    }

    const duration = Date.now() - startTime;
    log(`✅ [Prefetch] Completed in ${duration}ms - Stories: ${stories.length}, Posts: ${posts?.length || 0}`);

    return prefetchData;
  } catch (error) {
    error('[Prefetch] Error during pre-fetch:', error);
    
    // Return empty cache on error (better than crashing)
    const fallbackCache: PrefetchCache = {
      stories: [],
      posts: [],
      userProfile: null,
      timestamp: Date.now(),
    };
    return fallbackCache;
  }
};

/**
 * Fetch user profile (lightweight)
 */
const fetchUserProfile = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    error('[Prefetch] Error fetching profile:', error);
    return null;
  }
};

/**
 * Get pre-fetched data from cache
 */
export const getPrefetchedData = async (): Promise<PrefetchCache | null> => {
  try {
    const cachedData = await AsyncStorage.getItem(PREFETCH_CACHE_KEY);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      // Verify cache structure
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.posts)) {
        log(`[Prefetch] ✅ Loaded cache: ${parsed.posts.length} posts, ${parsed.stories?.length || 0} stories`);
        return parsed;
      } else {
        warn('[Prefetch] ⚠️ Invalid cache structure, clearing...');
        await clearPrefetchCache();
        return null;
      }
    }
    return null;
  } catch (error: any) {
    error('[Prefetch] Error reading cache:', error);
    // On iOS, JSON parsing can fail if data is corrupted
    if (error?.message?.includes('JSON') || error?.message?.includes('parse')) {
      warn('[Prefetch] Cache data corrupted, clearing...');
      try {
        await clearPrefetchCache();
      } catch (clearError) {
        error('[Prefetch] Error clearing corrupted cache:', clearError);
      }
    }
    return null;
  }
};

/**
 * Clear pre-fetch cache (useful for testing or forced refresh)
 */
export const clearPrefetchCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PREFETCH_CACHE_KEY);
    await AsyncStorage.removeItem(PREFETCH_TIMESTAMP_KEY);
    log('✅ [Prefetch] Cache cleared');
  } catch (error) {
    error('[Prefetch] Error clearing cache:', error);
  }
};

/**
 * Batch fetch multiple resources efficiently
 * Reduces number of round trips to Supabase
 */
export const batchFetchResources = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Single query to get user profile + initial data
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    return {
      profile: profileData,
    };
  } catch (error) {
    error('[Prefetch] Batch fetch error:', error);
    return null;
  }
};

