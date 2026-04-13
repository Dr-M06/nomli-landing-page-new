import AsyncStorage from '@react-native-async-storage/async-storage';
import * as cloudCache from './cloudCache';
import { log, warn, error } from './productionLogger';


// Import cache prefixes for cloud cache deletion
const CACHE_PREFIXES = {
  PROFILE: 'profile_',
  NEARBY_PROFILES: 'nearby_profiles',
};

// Cache keys
const NEARBY_PROFILES_CACHE_KEY = '@nomli_nearby_profiles_cache';
const NEARBY_PROFILES_TIMESTAMP_KEY = '@nomli_nearby_profiles_timestamp';
const PROFILE_CACHE_KEY_PREFIX = '@nomli_profile_cache_';
const PROFILE_CACHE_TIMESTAMP_PREFIX = '@nomli_profile_timestamp_';

// Cache expiry times - Nearby list should show new users within ~1 hour, not 24–48h
const NEARBY_PROFILES_CACHE_EXPIRY_MS = 1 * 60 * 60 * 1000; // 1 hour so new users appear soon; pull-to-refresh always gets fresh data
const INDIVIDUAL_PROFILE_CACHE_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours for individual profiles (profiles rarely change)

export interface CachedProfile {
  id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  country?: string;
  interests?: string[];
  profile_visible?: boolean;
  estimated_latitude?: number;
  estimated_longitude?: number;
  latitude?: number;
  longitude?: number;
  is_placeholder?: boolean;
  is_verified?: boolean;
  distance?: number;
  [key: string]: any; // Allow additional fields
}

interface CachedProfilesData {
  profiles: CachedProfile[];
  timestamp: number;
}

/**
 * Get cached nearby profiles
 * Tries local cache first, then cloud cache if local is missing/expired
 */
export const getCachedNearbyProfiles = async (): Promise<CachedProfile[] | null> => {
  try {
    // 1. Try local cache first (fastest)
    const cachedData = await AsyncStorage.getItem(NEARBY_PROFILES_CACHE_KEY);
    const timestampStr = await AsyncStorage.getItem(NEARBY_PROFILES_TIMESTAMP_KEY);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const cacheAge = Date.now() - timestamp;
      
      // Check if cache is still valid
      if (cacheAge < NEARBY_PROFILES_CACHE_EXPIRY_MS) {
        const data: CachedProfilesData = JSON.parse(cachedData);
        log(`[ProfileCache] ✅ Loaded ${data.profiles.length} cached nearby profiles from local cache (${Math.round(cacheAge / 1000)}s old)`);
        return data.profiles;
      } else {
        log(`[ProfileCache] ⏰ Local cache expired (${Math.round(cacheAge / 1000 / 60)} minutes old), trying cloud cache...`);
      }
    }
    
    // 2. Try cloud cache if local is missing/expired (with timeout to prevent slowdown)
    try {
      const cloudProfiles = await Promise.race([
        cloudCache.loadNearbyProfilesFromCloud(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)) // 2 second timeout
      ]);
      
      if (cloudProfiles && cloudProfiles.length > 0) {
        log(`[ProfileCache] ✅ Loaded ${cloudProfiles.length} nearby profiles from cloud cache`);
        
        // Restore to local cache for faster access next time (non-blocking)
        const data: CachedProfilesData = {
          profiles: cloudProfiles,
          timestamp: Date.now(),
        };
        AsyncStorage.setItem(NEARBY_PROFILES_CACHE_KEY, JSON.stringify(data)).catch(() => {});
        AsyncStorage.setItem(NEARBY_PROFILES_TIMESTAMP_KEY, Date.now().toString()).catch(() => {});
        
        return cloudProfiles;
      }
    } catch (cloudError) {
      warn('[ProfileCache] Cloud cache load failed or timed out (non-critical):', cloudError);
    }
  } catch (error) {
    error('[ProfileCache] Error loading cached nearby profiles:', error);
  }
  return null;
};

/**
 * Cache nearby profiles
 * Saves to both AsyncStorage (local) and Cloudflare (persistent)
 */
export const cacheNearbyProfiles = async (profiles: CachedProfile[]): Promise<void> => {
  try {
    const data: CachedProfilesData = {
      profiles,
      timestamp: Date.now(),
    };
    
    // Save to local cache (AsyncStorage) - instant access
    await AsyncStorage.setItem(NEARBY_PROFILES_CACHE_KEY, JSON.stringify(data));
    await AsyncStorage.setItem(NEARBY_PROFILES_TIMESTAMP_KEY, Date.now().toString());
    log(`[ProfileCache] 💾 Cached ${profiles.length} nearby profiles locally`);
    
    // Save to cloud cache (Cloudflare) - persists across app reinstalls
    // OPTIMIZED: Only save if we have meaningful profiles (not just placeholders)
    // This reduces write operations to stay within Cloudflare KV free tier limits
    const realProfiles = profiles.filter(p => p && p.id && !p.id.startsWith('placeholder-') && p.username);
    if (realProfiles.length > 0) {
      // Don't await - save in background to not block UI
      // Rate limiting is handled inside saveNearbyProfilesToCloud
      cloudCache.saveNearbyProfilesToCloud(realProfiles).catch(error => {
        warn('[ProfileCache] Failed to save to cloud cache (non-critical):', error);
      });
    }
  } catch (error) {
    error('[ProfileCache] Error caching nearby profiles:', error);
  }
};

/**
 * Get cached individual profile
 * Tries local cache first, then cloud cache if local is missing/expired
 */
export const getCachedProfile = async (profileId: string): Promise<CachedProfile | null> => {
  try {
    const cacheKey = PROFILE_CACHE_KEY_PREFIX + profileId;
    const timestampKey = PROFILE_CACHE_TIMESTAMP_PREFIX + profileId;
    
    // 1. Try local cache first (fastest)
    const cachedData = await AsyncStorage.getItem(cacheKey);
    const timestampStr = await AsyncStorage.getItem(timestampKey);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const cacheAge = Date.now() - timestamp;
      
      // Check if cache is still valid
      if (cacheAge < INDIVIDUAL_PROFILE_CACHE_EXPIRY_MS) {
        log(`[ProfileCache] ✅ Loaded cached profile ${profileId} from local cache (${Math.round(cacheAge / 1000)}s old)`);
        return JSON.parse(cachedData);
      } else {
        log(`[ProfileCache] ⏰ Local cache expired for ${profileId} (${Math.round(cacheAge / 1000 / 60)} minutes old), trying cloud cache...`);
      }
    }
    
    // 2. Try cloud cache if local is missing/expired (with timeout to prevent slowdown)
    try {
      const cloudProfile = await Promise.race([
        cloudCache.loadProfileFromCloud(profileId),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)) // 2 second timeout
      ]);
      
      if (cloudProfile) {
        log(`[ProfileCache] ✅ Loaded profile ${profileId} from cloud cache`);
        
        // Restore to local cache for faster access next time (non-blocking)
        AsyncStorage.setItem(cacheKey, JSON.stringify(cloudProfile)).catch(() => {});
        AsyncStorage.setItem(timestampKey, Date.now().toString()).catch(() => {});
        
        return cloudProfile;
      }
    } catch (cloudError) {
      warn(`[ProfileCache] Cloud cache load failed or timed out for ${profileId} (non-critical):`, cloudError);
    }
  } catch (error) {
    error(`[ProfileCache] Error loading cached profile ${profileId}:`, error);
  }
  return null;
};

/**
 * Check if profile needs to be refreshed by comparing updated_at timestamps
 * This allows us to only fetch when profile actually changed
 */
export const shouldRefreshProfile = async (
  profileId: string, 
  currentUpdatedAt?: string | null
): Promise<boolean> => {
  try {
    const cacheKey = PROFILE_CACHE_KEY_PREFIX + profileId;
    const cachedData = await AsyncStorage.getItem(cacheKey);
    
    if (!cachedData) {
      // No cache, need to fetch
      return true;
    }
    
    const cachedProfile: CachedProfile = JSON.parse(cachedData);
    const cachedUpdatedAt = cachedProfile.updated_at;
    
    // If we have current updated_at, compare with cached
    if (currentUpdatedAt && cachedUpdatedAt) {
      const cachedTime = new Date(cachedUpdatedAt).getTime();
      const currentTime = new Date(currentUpdatedAt).getTime();
      
      if (currentTime > cachedTime) {
        log(`[ProfileCache] 🔄 Profile ${profileId} was updated (cached: ${cachedUpdatedAt}, current: ${currentUpdatedAt})`);
        return true; // Profile was updated, need to refresh
      }
      
      // Profile hasn't changed, use cache
      log(`[ProfileCache] ✅ Profile ${profileId} unchanged, using cache`);
      return false;
    }
    
    // No updated_at to compare, check cache expiry
    const timestampKey = PROFILE_CACHE_TIMESTAMP_PREFIX + profileId;
    const timestampStr = await AsyncStorage.getItem(timestampKey);
    if (timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const cacheAge = Date.now() - timestamp;
      return cacheAge >= INDIVIDUAL_PROFILE_CACHE_EXPIRY_MS;
    }
    
    return true; // No cache timestamp, need to fetch
  } catch (error) {
    error(`[ProfileCache] Error checking if profile needs refresh:`, error);
    return true; // On error, fetch fresh data
  }
};

/**
 * Cache individual profile
 * Saves to both AsyncStorage (local) and Cloudflare (persistent)
 */
export const cacheProfile = async (profile: CachedProfile): Promise<void> => {
  try {
    if (!profile?.id) {
      warn('[ProfileCache] Cannot cache profile without ID');
      return;
    }
    
    const cacheKey = PROFILE_CACHE_KEY_PREFIX + profile.id;
    const timestampKey = PROFILE_CACHE_TIMESTAMP_PREFIX + profile.id;
    
    // Save to local cache (AsyncStorage) - instant access
    await AsyncStorage.setItem(cacheKey, JSON.stringify(profile));
    await AsyncStorage.setItem(timestampKey, Date.now().toString());
    log(`[ProfileCache] 💾 Cached profile ${profile.id} locally`);
    
    // Save to cloud cache (Cloudflare) - persists across app reinstalls
    // OPTIMIZED: Only save if profile data is significant (not placeholder or minimal)
    // This reduces write operations to stay within Cloudflare KV free tier limits
    if (profile && profile.id && !profile.id.startsWith('placeholder-') && profile.username) {
      // Don't await - save in background to not block UI
      // Rate limiting is handled inside saveProfileToCloud
      cloudCache.saveProfileToCloud(profile.id, profile).catch(error => {
        warn(`[ProfileCache] Failed to save profile ${profile.id} to cloud cache (non-critical):`, error);
      });
    }
  } catch (error) {
    error(`[ProfileCache] Error caching profile ${profile.id}:`, error);
  }
};

/**
 * Cache multiple profiles at once
 */
export const cacheProfiles = async (profiles: CachedProfile[]): Promise<void> => {
  try {
    await Promise.all(profiles.map(profile => cacheProfile(profile)));
    log(`[ProfileCache] 💾 Cached ${profiles.length} individual profiles`);
  } catch (error) {
    error('[ProfileCache] Error caching profiles:', error);
  }
};

/**
 * Clear nearby profiles cache
 * Clears both local and cloud cache to ensure deleted items stay deleted
 */
export const clearNearbyProfilesCache = async (): Promise<void> => {
  try {
    // Clear local cache
    await AsyncStorage.multiRemove([NEARBY_PROFILES_CACHE_KEY, NEARBY_PROFILES_TIMESTAMP_KEY]);
    log('[ProfileCache] 🗑️ Cleared nearby profiles cache locally');
    
    // Clear cloud cache (non-blocking - don't wait for it)
    cloudCache.deleteFromCloudCache(CACHE_PREFIXES.NEARBY_PROFILES).catch(error => {
      warn('[ProfileCache] Failed to clear cloud cache (non-critical):', error);
    });
  } catch (error) {
    error('[ProfileCache] Error clearing nearby profiles cache:', error);
  }
};

/**
 * Clear individual profile cache
 * Clears both local and cloud cache to ensure deleted items stay deleted
 */
export const clearProfileCache = async (profileId: string): Promise<void> => {
  try {
    const cacheKey = PROFILE_CACHE_KEY_PREFIX + profileId;
    const timestampKey = PROFILE_CACHE_TIMESTAMP_PREFIX + profileId;
    
    // Clear local cache
    await AsyncStorage.multiRemove([cacheKey, timestampKey]);
    log(`[ProfileCache] 🗑️ Cleared cache for profile ${profileId} locally`);
    
    // Clear cloud cache (non-blocking - don't wait for it)
    cloudCache.deleteFromCloudCache(`${CACHE_PREFIXES.PROFILE}${profileId}`).catch(error => {
      warn(`[ProfileCache] Failed to clear cloud cache for ${profileId} (non-critical):`, error);
    });
  } catch (error) {
    error(`[ProfileCache] Error clearing profile cache ${profileId}:`, error);
  }
};

/**
 * Clear all profile caches
 */
export const clearAllProfileCaches = async (): Promise<void> => {
  try {
    // Get all keys
    const allKeys = await AsyncStorage.getAllKeys();
    
    // Filter profile cache keys
    const profileCacheKeys = allKeys.filter(key => 
      key.startsWith(PROFILE_CACHE_KEY_PREFIX) || 
      key.startsWith(PROFILE_CACHE_TIMESTAMP_PREFIX) ||
      key === NEARBY_PROFILES_CACHE_KEY ||
      key === NEARBY_PROFILES_TIMESTAMP_KEY
    );
    
    if (profileCacheKeys.length > 0) {
      await AsyncStorage.multiRemove(profileCacheKeys);
      log(`[ProfileCache] 🗑️ Cleared ${profileCacheKeys.length} profile cache keys`);
    }
  } catch (error) {
    error('[ProfileCache] Error clearing all profile caches:', error);
  }
};

/**
 * Check if cache is stale (but still usable for stale-while-revalidate)
 */
export const isCacheStale = (timestamp: number, expiryMs: number): boolean => {
  const cacheAge = Date.now() - timestamp;
  return cacheAge >= expiryMs;
};

/**
 * Get cache age in seconds
 */
export const getCacheAge = (timestamp: number): number => {
  return Math.round((Date.now() - timestamp) / 1000);
};

