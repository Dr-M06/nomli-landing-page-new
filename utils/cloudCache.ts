import { log, warn, error } from './productionLogger';
/**
 * Cloudflare Persistent Cache Utility
 * 
 * Stores cache in Cloudflare KV via Supabase Edge Function.
 * Cache persists across app reinstalls and doesn't expire on app restart.
 * 
 * Usage:
 * - Save cache: await saveToCloudCache('profile_123', profileData, 86400)
 * - Load cache: const cached = await loadFromCloudCache('profile_123')
 * - Delete cache: await deleteFromCloudCache('profile_123')
 */

// Use Cloudflare Worker directly (public, no auth required)
// Fallback to Supabase function if worker URL not available
const CLOUDFLARE_WORKER_URL = 'https://nomlicache.cdnnomliminglecom.workers.dev';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const CACHE_FUNCTION_URL = CLOUDFLARE_WORKER_URL; // Use Cloudflare Worker directly
const SUPABASE_CACHE_URL = `${SUPABASE_URL}/functions/v1/cloudflare-cache`; // Fallback

// Cache key prefixes
const CACHE_PREFIXES = {
  PROFILE: 'profile_',
  NEARBY_PROFILES: 'nearby_profiles',
  POSTS: 'posts_',
  USER_POSTS: 'user_posts_',
  EVENTS: 'events_',
  COMMENTS: 'comments_',
  WALLET: 'wallet_',
};

// Default TTLs (in seconds) - Increased to reduce write frequency
const DEFAULT_TTLS = {
  PROFILE: 14 * 24 * 60 * 60, // 14 days (profiles change rarely)
  NEARBY_PROFILES: 7 * 24 * 60 * 60, // 7 days (location-based, changes slowly)
  POSTS: 1 * 60 * 60, // 1 hour (but we'll skip cloud cache for posts - too frequent)
  USER_POSTS: 2 * 60 * 60, // 2 hours
  EVENTS: 12 * 60 * 60, // 12 hours (events change less frequently)
  COMMENTS: 2 * 60 * 60, // 2 hours (increased from 30 min)
  WALLET: 6 * 60 * 60, // 6 hours (wallet changes less frequently)
};

// Rate limiting to prevent exceeding Cloudflare KV free tier limits
// Free tier: 100k reads/day, 1k writes/day, 1k deletes/day
const RATE_LIMITS = {
  MAX_WRITES_PER_HOUR: 30, // Limit to ~720 writes/day (under 1k limit)
  MAX_READS_PER_HOUR: 4000, // Limit to ~96k reads/day (under 100k limit)
  MAX_DELETES_PER_HOUR: 30, // Limit to ~720 deletes/day (under 1k limit)
};

// Track operations per hour
let writeCount = 0;
let readCount = 0;
let deleteCount = 0;
let lastResetTime = Date.now();

// Reset counters every hour
const resetCounters = () => {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  if (now - lastResetTime >= hourMs) {
    writeCount = 0;
    readCount = 0;
    deleteCount = 0;
    lastResetTime = now;
  }
};

// Check if operation is allowed (rate limiting)
const canWrite = (): boolean => {
  resetCounters();
  return writeCount < RATE_LIMITS.MAX_WRITES_PER_HOUR;
};

const canRead = (): boolean => {
  resetCounters();
  return readCount < RATE_LIMITS.MAX_READS_PER_HOUR;
};

const canDelete = (): boolean => {
  resetCounters();
  return deleteCount < RATE_LIMITS.MAX_DELETES_PER_HOUR;
};

interface CacheResponse {
  found: boolean;
  key?: string;
  value?: any;
  cachedAt?: number;
  expiresAt?: number | null;
  expired?: boolean;
  error?: string;
}

/**
 * Save data to Cloudflare cache
 * OPTIMIZED: Rate limited to prevent exceeding Cloudflare KV free tier limits
 */
export const saveToCloudCache = async (
  key: string,
  value: any,
  ttl?: number
): Promise<boolean> => {
  try {
    // Rate limiting: Check if we can write
    if (!canWrite()) {
      log(`[CloudCache] ⚠️ Write rate limit reached, skipping cloud cache save for ${key}`);
      return false; // Skip cloud cache, use local cache only
    }

    // Skip cloud cache for posts (they change too frequently and consume too many writes)
    if (key.startsWith(CACHE_PREFIXES.POSTS)) {
      log(`[CloudCache] ⏭️ Skipping cloud cache for posts (too frequent changes): ${key}`);
      return false; // Posts change too often, skip cloud cache to save quota
    }

    // Use Cloudflare Worker directly (public, no auth)
    const response = await fetch(`${CACHE_FUNCTION_URL}/cache`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        value,
        ttl: ttl || DEFAULT_TTLS.POSTS, // Default to 1 hour if not specified
      }),
    });

    if (!response.ok) {
      warn(`[CloudCache] Failed to save cache for key ${key}:`, response.statusText);
      return false;
    }

    const result = await response.json();
    if (result.success) {
      writeCount++; // Increment write counter
      log(`[CloudCache] ✅ Saved cache for key ${key} (writes today: ${writeCount}/${RATE_LIMITS.MAX_WRITES_PER_HOUR})`);
      return true;
    }

    return false;
  } catch (error: any) {
    warn(`[CloudCache] Error saving cache for key ${key}:`, error.message);
    return false; // Fail silently - fallback to local cache
  }
};

/**
 * Load data from Cloudflare cache
 * OPTIMIZED: Rate limited to prevent exceeding Cloudflare KV free tier limits
 */
export const loadFromCloudCache = async <T = any>(key: string): Promise<T | null> => {
  try {
    // Rate limiting: Check if we can read
    if (!canRead()) {
      log(`[CloudCache] ⚠️ Read rate limit reached, skipping cloud cache load for ${key}`);
      return null; // Skip cloud cache, use local cache only
    }

    // Skip cloud cache for posts (they change too frequently)
    if (key.startsWith(CACHE_PREFIXES.POSTS)) {
      return null; // Posts change too often, skip cloud cache to save quota
    }

    // Use Cloudflare Worker directly (public, no auth)
    const response = await fetch(`${CACHE_FUNCTION_URL}/cache?key=${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    readCount++; // Increment read counter
    const result: CacheResponse = await response.json();
    
    if (result.found && result.value) {
      log(`[CloudCache] ✅ Loaded cache for key ${key} (reads today: ${readCount}/${RATE_LIMITS.MAX_READS_PER_HOUR})`);
      return result.value as T;
    }

    return null;
  } catch (error: any) {
    warn(`[CloudCache] Error loading cache for key ${key}:`, error.message);
    return null; // Fail silently - fallback to local cache
  }
};

/**
 * Delete data from Cloudflare cache
 * OPTIMIZED: Rate limited to prevent exceeding Cloudflare KV free tier limits
 */
export const deleteFromCloudCache = async (key: string): Promise<boolean> => {
  try {
    // Rate limiting: Check if we can delete
    if (!canDelete()) {
      log(`[CloudCache] ⚠️ Delete rate limit reached, skipping cloud cache delete for ${key}`);
      return false; // Skip cloud cache delete
    }

    // Skip cloud cache for posts (they change too frequently)
    if (key.startsWith(CACHE_PREFIXES.POSTS)) {
      return false; // Posts change too often, skip cloud cache to save quota
    }

    // Use Cloudflare Worker directly (public, no auth)
    const response = await fetch(`${CACHE_FUNCTION_URL}/cache?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    if (result.success === true) {
      deleteCount++; // Increment delete counter
      log(`[CloudCache] ✅ Deleted cache for key ${key} (deletes today: ${deleteCount}/${RATE_LIMITS.MAX_DELETES_PER_HOUR})`);
      return true;
    }
    return false;
  } catch (error: any) {
    warn(`[CloudCache] Error deleting cache for key ${key}:`, error.message);
    return false;
  }
};

/**
 * Batch operations for efficiency
 */
export const batchCloudCache = async (operations: Array<{
  type: 'get' | 'put' | 'delete';
  key: string;
  value?: any;
  ttl?: number;
}>): Promise<Array<{ type: string; key: string; found?: boolean; value?: any; success?: boolean; error?: string }>> => {
  try {
    // Use Cloudflare Worker directly (public, no auth)
    const response = await fetch(`${CACHE_FUNCTION_URL}/cache/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operations }),
    });

    if (!response.ok) {
      return operations.map(op => ({ type: op.type, key: op.key, error: 'Request failed' }));
    }

    const result = await response.json();
    return result.results || [];
  } catch (error: any) {
    warn(`[CloudCache] Error in batch operation:`, error.message);
    return operations.map(op => ({ type: op.type, key: op.key, error: error.message }));
  }
};

/**
 * Save profile to cloud cache
 */
export const saveProfileToCloud = async (profileId: string, profile: any): Promise<boolean> => {
  return saveToCloudCache(
    `${CACHE_PREFIXES.PROFILE}${profileId}`,
    profile,
    DEFAULT_TTLS.PROFILE
  );
};

/**
 * Load profile from cloud cache
 */
export const loadProfileFromCloud = async (profileId: string): Promise<any | null> => {
  return loadFromCloudCache(`${CACHE_PREFIXES.PROFILE}${profileId}`);
};

/**
 * Save nearby profiles to cloud cache
 */
export const saveNearbyProfilesToCloud = async (profiles: any[]): Promise<boolean> => {
  return saveToCloudCache(
    CACHE_PREFIXES.NEARBY_PROFILES,
    profiles,
    DEFAULT_TTLS.NEARBY_PROFILES
  );
};

/**
 * Load nearby profiles from cloud cache
 */
export const loadNearbyProfilesFromCloud = async (): Promise<any[] | null> => {
  return loadFromCloudCache(CACHE_PREFIXES.NEARBY_PROFILES);
};

/**
 * Save posts to cloud cache
 * ⚠️ OPTIMIZED: This function now skips cloud cache to prevent exceeding KV limits
 * Posts change too frequently - use local AsyncStorage cache only (72 hour TTL)
 */
export const savePostsToCloud = async (key: string, posts: any[], ttl?: number): Promise<boolean> => {
  // Skip cloud cache for posts - they change too frequently
  // This prevents exceeding Cloudflare KV free tier limits (1k writes/day)
  // Local AsyncStorage cache is sufficient for posts
  log(`[CloudCache] ⏭️ Skipping cloud cache for posts: ${key} (use local cache only)`);
  return false;
};

/**
 * Load posts from cloud cache
 * ⚠️ OPTIMIZED: This function now skips cloud cache to prevent exceeding KV limits
 * Posts change too frequently - use local AsyncStorage cache only (72 hour TTL)
 */
export const loadPostsFromCloud = async (key: string): Promise<any[] | null> => {
  // Skip cloud cache for posts - they change too frequently
  // This prevents exceeding Cloudflare KV free tier limits
  // Local AsyncStorage cache is sufficient for posts
  return null;
};

/**
 * Check if cloud cache is available
 */
export const isCloudCacheAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
};
