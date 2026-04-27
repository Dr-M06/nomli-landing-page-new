/**
 * Aggressive Caching Service
 * 
 * Implements aggressive caching and preloading to make the app load instantly
 * - Preloads images/videos to disk cache
 * - Preloads next batch of content in background
 * - Caches navigation state
 * - Background refresh when app goes to background
 */

import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Image } from 'expo-image';
import { supabase } from './supabase';
import { fetchPosts } from './communityUtils';
import { fetchStories } from './storyUtils';
import { log, warn, error } from './productionLogger';


const CACHE_DIR = `${FileSystem.cacheDirectory}aggressive_cache/`;
const MEDIA_CACHE_DIR = `${CACHE_DIR}media/`;
const PRELOAD_CACHE_KEY = '@nomli_preload_cache';
const NAVIGATION_CACHE_KEY = '@nomli_navigation_cache';

// Cache expiry: 24 hours for aggressive caching
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface PreloadCache {
  nextBatchPosts: any[];
  nextBatchVideos: any[];
  timestamp: number;
}

/**
 * Initialize cache directories
 */
export const initializeCacheDirectories = async (): Promise<void> => {
  try {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    await FileSystem.makeDirectoryAsync(MEDIA_CACHE_DIR, { intermediates: true });
    log('✅ [AggressiveCache] Cache directories initialized');
  } catch (error) {
    error('[AggressiveCache] Error initializing cache directories:', error);
  }
};

/**
 * Preload images to disk cache using expo-image
 * This makes images load instantly when displayed
 */
export const preloadImages = async (imageUrls: string[]): Promise<void> => {
  try {
    // OPTIMIZED: Don't check network speed synchronously - it adds latency
    // Instead, use a reasonable default and let the network/OS handle prioritization
    // Network speed detection is async and can delay initial content display
    // Android: Reduced from 20 to 10 to match iOS and improve initial load speed
    let maxPreloadImages = Platform.OS === 'ios' ? 10 : 10;
    
    // Use expo-image's built-in preloading
    // REMOVED DELAYS: Preload immediately without delays to improve initial load speed
    // The delays were causing slower initial content display
    const preloadPromises = imageUrls
      .filter(url => url && url.startsWith('http'))
      .slice(0, maxPreloadImages)
      .map((url) => {
        // Preload immediately without delays - let the browser/network handle prioritization
        return Image.prefetch(url, {
              cachePolicy: 'memory-disk', // Aggressive: cache to both memory and disk
        }).catch(err => {
              // Silently fail - don't log every failure
          return null;
        });
      });

    await Promise.allSettled(preloadPromises);
    // Silently complete - summary logs are handled by preloadAllMedia
  } catch (error) {
    // Silently fail - don't block app
    if (__DEV__) {
    error('[AggressiveCache] Error preloading images:', error);
    }
  }
};

/**
 * Preload videos (skip Mux - Mux CDN handles delivery; no client cache needed)
 */
export const preloadVideos = async (videoUrls: string[], videoIds?: string[]): Promise<void> => {
  try {
    const nonMux = videoUrls
      .map((url, i) => ({ url, id: videoIds?.[i] ?? `video_${i}` }))
      .filter((v) => v.url && v.url.startsWith('http') && !v.url.includes('stream.mux.com'));
    if (nonMux.length === 0) return;

    const { preloadVideo } = await import('./videoPreloadService');
    await Promise.allSettled(
      nonMux.slice(0, 3).map((v) => preloadVideo(v.url, v.id).catch(() => null))
    );
  } catch (error) {
    if (__DEV__) {
      error('[AggressiveCache] Error preloading videos:', error);
    }
  }
};

/**
 * Extract image URLs from posts
 */
const extractImageUrls = (posts: any[]): string[] => {
  const imageUrls: string[] = [];
  
  posts.forEach(post => {
    // Add post images
    if (post.image_urls && Array.isArray(post.image_urls)) {
      imageUrls.push(...post.image_urls.filter((url: string) => url));
    }
    
    // Add user avatars
    if (post.user_avatar_url) {
      imageUrls.push(post.user_avatar_url);
    }
    
    // Add video thumbnails
    if (post.video_thumbnail_url) {
      imageUrls.push(post.video_thumbnail_url);
    }
  });
  
  return [...new Set(imageUrls)]; // Remove duplicates
};

/**
 * Extract video URLs and IDs from posts
 */
const extractVideoUrls = (posts: any[]): { urls: string[]; ids: string[] } => {
  const videos = posts
    .filter(post => post.video_url && post.id)
    .map(post => ({ url: post.video_url, id: post.id }));
  
  return {
    urls: videos.map(v => v.url).filter((url: string) => url),
    ids: videos.map(v => v.id).filter((id: string) => id),
  };
};

/**
 * Preload next batch of content in background
 * This ensures smooth scrolling without loading delays
 */
export const preloadNextBatch = async (currentPosts: any[] = []): Promise<void> => {
  try {
    // Check if we already have a fresh preload cache
    const cachedPreload = await AsyncStorage.getItem(PRELOAD_CACHE_KEY);
    if (cachedPreload) {
      const parsed: PreloadCache = JSON.parse(cachedPreload);
      const cacheAge = Date.now() - parsed.timestamp;
      
      if (cacheAge < CACHE_EXPIRY_MS && parsed.nextBatchPosts.length > 0) {
        log(`[AggressiveCache] Using cached preload (${Math.round(cacheAge / 1000)}s old)`);
        return;
      }
    }

    log('[AggressiveCache] Preloading next batch of content...');
    
    // Fetch next batch of posts (offset by current count)
    // Android: Reduced from 10 to 5 to match iOS and improve initial load speed
    const batchSize = Platform.OS === 'ios' ? 5 : 5; // Both platforms: 5 posts for faster initial load
    const nextBatchPosts = await fetchPosts(batchSize, currentPosts.length, true);
    
    if (nextBatchPosts && nextBatchPosts.length > 0) {
      // Extract media URLs
      const imageUrls = extractImageUrls(nextBatchPosts);
      const { urls: videoUrls, ids: videoIds } = extractVideoUrls(nextBatchPosts);
      
      // Preload media in parallel
      await Promise.all([
        preloadImages(imageUrls),
        preloadVideos(videoUrls, videoIds),
      ]);
      
      // Cache the preloaded batch
      const preloadCache: PreloadCache = {
        nextBatchPosts,
        nextBatchVideos: nextBatchPosts.filter(p => p.video_url),
        timestamp: Date.now(),
      };
      
      await AsyncStorage.setItem(PRELOAD_CACHE_KEY, JSON.stringify(preloadCache));
      // Silently complete - summary logs handled by preloadAllMedia
    }
  } catch (error) {
    error('[AggressiveCache] Error preloading next batch:', error);
  }
};

/**
 * Preload all media from posts/stories
 * OPTIMIZED: Removed delays between batches to improve initial load speed
 */
export const preloadAllMedia = async (posts: any[], stories: any[] = []): Promise<void> => {
  try {
    // Extract all image URLs
    const postImageUrls = extractImageUrls(posts);
    const storyImageUrls = stories
      .filter(story => story.media_url)
      .map(story => story.media_url)
      .filter((url: string) => url);
    
    const allImageUrls = [...postImageUrls, ...storyImageUrls];
    const { urls: allVideoUrls, ids: allVideoIds } = extractVideoUrls(posts);
    
    // Preload in batches to avoid memory issues, but without delays
    // Removed 100ms delay between batches - it was slowing down initial content display
    const batchSize = 20;
    const batchPromises: Promise<void>[] = [];
    for (let i = 0; i < allImageUrls.length; i += batchSize) {
      const batch = allImageUrls.slice(i, i + batchSize);
      batchPromises.push(preloadImages(batch));
    }
      
    // Preload all batches in parallel (no delays)
    await Promise.allSettled(batchPromises);
    
    // Preload videos (with IDs for TikTok-style preloading)
    if (allVideoUrls.length > 0) {
      await preloadVideos(allVideoUrls, allVideoIds);
    }
    
    // Only log summary in dev mode to reduce noise
    if (__DEV__ && (allImageUrls.length > 0 || allVideoUrls.length > 0)) {
    log(`✅ [AggressiveCache] Preloaded ${allImageUrls.length} images and ${allVideoUrls.length} videos`);
    }
  } catch (error) {
    error('[AggressiveCache] Error preloading all media:', error);
  }
};

/**
 * Cache navigation state
 */
export const cacheNavigationState = async (route: string, params?: any): Promise<void> => {
  try {
    const navState = {
      route,
      params,
      timestamp: Date.now(),
    };
    
    await AsyncStorage.setItem(NAVIGATION_CACHE_KEY, JSON.stringify(navState));
  } catch (error) {
    error('[AggressiveCache] Error caching navigation state:', error);
  }
};

/**
 * Get cached navigation state
 */
export const getCachedNavigationState = async (): Promise<{ route: string; params?: any } | null> => {
  try {
    const cached = await AsyncStorage.getItem(NAVIGATION_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;
      
      // Navigation cache expires after 1 hour
      if (age < 60 * 60 * 1000) {
        return { route: parsed.route, params: parsed.params };
      }
    }
    return null;
  } catch (error) {
    error('[AggressiveCache] Error getting cached navigation state:', error);
    return null;
  }
};

/**
 * Background refresh when app goes to background
 * Preloads fresh content so it's ready when user returns
 */
let backgroundRefreshTimer: NodeJS.Timeout | null = null;
let periodicRefreshTimer: NodeJS.Timeout | null = null;

export const setupBackgroundRefresh = (): void => {
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background') {
      log('[AggressiveCache] App went to background - DISABLED background refresh to save energy');
      
      // Clear periodic refresh when app goes to background
      if (periodicRefreshTimer) {
        clearInterval(periodicRefreshTimer);
        periodicRefreshTimer = null;
      }
      
      // Clear any existing timer
      if (backgroundRefreshTimer) {
        clearTimeout(backgroundRefreshTimer);
        backgroundRefreshTimer = null;
      }
      
      // DISABLED: Background refresh causes high CPU usage (41.8% CPU in background)
      // Background refresh removed to reduce energy impact - cache will refresh when app returns to foreground
      // This significantly reduces background CPU usage and battery drain
    } else if (nextAppState === 'active') {
      // Clear timer if app becomes active again
      if (backgroundRefreshTimer) {
        clearTimeout(backgroundRefreshTimer);
        backgroundRefreshTimer = null;
      }
      
      // PERIODIC REFRESH: Refresh every 5 minutes when app is active
      // This prevents cold starts by keeping cache fresh
      // iOS: Use longer interval (10 minutes) to reduce battery drain and improve performance
      if (!periodicRefreshTimer) {
        const refreshInterval = Platform.OS === 'ios' ? 10 * 60 * 1000 : 5 * 60 * 1000; // iOS: 10min, Android: 5min
        log(`[AggressiveCache] Setting up periodic refresh (every ${refreshInterval / 60000} minutes)...`);
        periodicRefreshTimer = setInterval(async () => {
          try {
            log('[AggressiveCache] 🔄 Periodic refresh triggered...');
            // Both platforms: Use smaller batch to reduce memory usage and improve performance
            const batchSize = Platform.OS === 'ios' ? 10 : 10;
            const [posts, stories] = await Promise.allSettled([
              fetchPosts(batchSize, 0, false), // Force fresh data
              fetchStories(false), // Force fresh data
            ]);
            
            if (posts.status === 'fulfilled' && posts.value) {
              // Preload media from fresh posts (non-blocking)
              // iOS: Preload fewer images to reduce memory pressure
              preloadAllMedia(posts.value, []).catch(err => {
                warn('[AggressiveCache] Periodic media preload failed:', err);
              });
              log('[AggressiveCache] ✅ Periodic refresh completed');
            }
          } catch (error) {
            warn('[AggressiveCache] Periodic refresh failed (non-critical):', error);
          }
        }, refreshInterval);
      }
    }
  };
  
  AppState.addEventListener('change', handleAppStateChange);
  
  // Start periodic refresh immediately if app is active
  if (AppState.currentState === 'active') {
    handleAppStateChange('active');
  }
  
  log('[AggressiveCache] Background refresh listener set up');
};

/**
 * Clear all aggressive cache
 */
export const clearAggressiveCache = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([PRELOAD_CACHE_KEY, NAVIGATION_CACHE_KEY]);
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    log('✅ [AggressiveCache] All cache cleared');
  } catch (error) {
    error('[AggressiveCache] Error clearing cache:', error);
  }
};

/**
 * Get cache size for debugging
 */
export const getCacheSize = async (): Promise<{ sizeMB: number; fileCount: number }> => {
  try {
    const cacheInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (cacheInfo.exists && cacheInfo.isDirectory) {
      // Note: FileSystem doesn't provide directory size directly
      // This is an approximation
      return { sizeMB: 0, fileCount: 0 };
    }
    return { sizeMB: 0, fileCount: 0 };
  } catch (error) {
    error('[AggressiveCache] Error getting cache size:', error);
    return { sizeMB: 0, fileCount: 0 };
  }
};

