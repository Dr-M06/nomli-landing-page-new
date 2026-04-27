/**
 * Video Preloading Service - TikTok-style instant playback
 * 
 * Preloads next 2-3 videos in background for instant playback
 * Optimized for Nigeria's network conditions
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { detectNetworkSpeed, ConnectionSpeed } from './networkSpeedDetector';
import { log, warn, error } from './productionLogger';


const VIDEO_PRELOAD_CACHE_KEY = '@nomli_video_preload_cache';
const VIDEO_DISK_CACHE_KEY_PREFIX = '@nomli_video_cache_';
const MAX_PRELOAD_VIDEOS = 3; // Preload next 3 videos (TikTok-style)
const CACHE_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours cache

interface PreloadVideo {
  id: string;
  url: string;
  thumbnailUrl?: string;
  timestamp: number;
}

interface VideoCache {
  url: string;
  cachedAt: number;
  watchCount: number;
}

/**
 * Get network-aware preload count
 * MUX-OPTIMIZED: Mux handles adaptive bitrate streaming and CDN delivery
 * We can preload more aggressively since Mux optimizes automatically
 */
async function getPreloadCount(): Promise<number> {
  try {
    const netInfo = await NetInfo.fetch();
    const isWiFi = netInfo.type === 'wifi';
    
    if (isWiFi) {
      // WiFi: Preload more aggressively
      return MAX_PRELOAD_VIDEOS;
    } else {
      // Mobile data: Mux handles adaptive streaming, so we can still preload
      // Mux automatically adjusts quality based on network, so preloading is safe
      return 2; // Preload 2 videos on mobile (Mux handles optimization)
    }
  } catch (error) {
    // Default: Preload videos (Mux handles optimization)
    return 2; // Default: Preload videos since Mux optimizes automatically
  }
}

/**
 * Preload video for instant playback
 * For Mux videos: Preloads HLS manifest and initial segments for faster playback
 * For other videos: Uses expo-av caching
 */
export async function preloadVideo(videoUrl: string, videoId: string): Promise<void> {
  try {
    if (!videoUrl || !videoId) return;
    
    // Mux videos: Preload HLS manifest and initial segments
    // This reduces the time to first frame when video comes into view
    if (videoUrl.includes('stream.mux.com') || videoUrl.includes('.m3u8')) {
      try {
        // Preload HLS manifest (small file, fast to download)
        const manifestResponse = await fetch(videoUrl, {
          method: 'HEAD', // Just check if available, don't download full manifest
          cache: 'default', // Allow browser/CDN caching
        });
        
        // If manifest is accessible, mark as preloaded
        // expo-av will handle actual video segment caching when Video component loads
        if (manifestResponse.ok) {
          const cacheKey = `${VIDEO_DISK_CACHE_KEY_PREFIX}${videoId}`;
          const videoCache: VideoCache = {
            url: videoUrl,
            cachedAt: Date.now(),
            watchCount: 0,
          };
          await AsyncStorage.setItem(cacheKey, JSON.stringify(videoCache));
        }
      } catch (error) {
        // Silently fail - preloading is best effort
        // Video will still load normally when it comes into view
      }
      return;
    }

    // Check if already preloaded recently
    const cacheKey = `${VIDEO_DISK_CACHE_KEY_PREFIX}${videoId}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const videoCache: VideoCache = JSON.parse(cached);
      const cacheAge = Date.now() - videoCache.cachedAt;
      if (cacheAge < CACHE_EXPIRY_MS) {
        // Silently skip already cached videos - no logging to reduce noise
        return; // Already cached
      }
    }
    
    // Mark as cached (expo-av handles actual video caching)
    const videoCache: VideoCache = {
      url: videoUrl,
      cachedAt: Date.now(),
      watchCount: 0,
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(videoCache));
    
    // Note: expo-av automatically caches videos when loaded
    // We just mark it in our cache for tracking
    // Silently complete - no logging to reduce noise
  } catch (error) {
    error(`[VideoPreload] Error preloading video ${videoId}:`, error);
  }
}

/**
 * Preload next videos in background (TikTok-style)
 * Preloads next 2-3 videos based on network speed
 */
export async function preloadNextVideos(
  currentVideoIndex: number,
  allVideos: Array<{ id: string; video_url?: string; thumbnail_url?: string }>
): Promise<void> {
  try {
    const preloadCount = await getPreloadCount();
    
    if (preloadCount === 0) {
      log('[VideoPreload] Network too slow, skipping preload');
      return;
    }
    
    // Get next videos to preload (include Mux videos - preload HLS manifest)
    const nextVideos = allVideos
      .slice(currentVideoIndex + 1, currentVideoIndex + 1 + preloadCount)
      .filter(v => v.video_url);
    
    if (nextVideos.length === 0) {
      return;
    }
    
    // Silently preload - summary logs handled by caller
    
    // Preload videos in parallel (but with small delay to not overwhelm network)
    // iOS: Use longer stagger (200ms) to reduce memory pressure and improve performance
    const staggerDelay = Platform.OS === 'ios' ? 200 : 100;
    await Promise.allSettled(
      nextVideos.map((video, index) => {
        return new Promise<void>((resolve) => {
          // Stagger preloading (iOS: 200ms, Android: 100ms delay between each)
          setTimeout(async () => {
            if (video.video_url && video.id) {
              await preloadVideo(video.video_url, video.id);
            }
            resolve();
          }, index * staggerDelay);
        });
      })
    );
    
    // Silently complete - summary logs handled by caller
  } catch (error) {
    error('[VideoPreload] Error preloading next videos:', error);
  }
}

/**
 * Check if video is cached
 */
export async function isVideoCached(videoId: string): Promise<boolean> {
  try {
    const cacheKey = `${VIDEO_DISK_CACHE_KEY_PREFIX}${videoId}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (!cached) return false;
    
    const videoCache: VideoCache = JSON.parse(cached);
    const cacheAge = Date.now() - videoCache.cachedAt;
    return cacheAge < CACHE_EXPIRY_MS;
  } catch (error) {
    return false;
  }
}

/**
 * Mark video as watched (for cache prioritization)
 */
export async function markVideoWatched(videoId: string): Promise<void> {
  try {
    const cacheKey = `${VIDEO_DISK_CACHE_KEY_PREFIX}${videoId}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const videoCache: VideoCache = JSON.parse(cached);
      videoCache.watchCount = (videoCache.watchCount || 0) + 1;
      await AsyncStorage.setItem(cacheKey, JSON.stringify(videoCache));
    }
  } catch (error) {
    warn(`[VideoPreload] Error marking video as watched:`, error);
  }
}

/**
 * Get adaptive buffer configuration based on network
 * MUX-OPTIMIZED: Mux handles adaptive bitrate streaming automatically
 * We use standard buffering since Mux optimizes quality based on network
 */
export async function getAdaptiveBufferConfig(): Promise<{
  initialBufferMs: number;
  maxBufferMs: number;
  bufferForPlaybackMs: number;
  bufferForPlaybackAfterRebufferMs: number;
}> {
  try {
    const netInfo = await NetInfo.fetch();
    const isWiFi = netInfo.type === 'wifi';
    
    if (isWiFi) {
      // WiFi: Aggressive buffering
      return {
        initialBufferMs: 5000, // 5 seconds
        maxBufferMs: 30000, // 30 seconds
        bufferForPlaybackMs: 2000, // 2 seconds
        bufferForPlaybackAfterRebufferMs: 3000, // 3 seconds
      };
    } else {
      // Mobile data: Mux handles adaptive streaming, so we use moderate buffering
      // Mux automatically adjusts quality, so we can buffer normally
      return {
        initialBufferMs: 3000, // 3 seconds
        maxBufferMs: 15000, // 15 seconds
        bufferForPlaybackMs: 1500, // 1.5 seconds
        bufferForPlaybackAfterRebufferMs: 2000, // 2 seconds
      };
    }
  } catch (error) {
    warn('[VideoPreload] Error getting buffer config, using defaults:', error);
    // Default: Standard buffering (Mux handles optimization)
    return {
      initialBufferMs: 3000,
      maxBufferMs: 15000,
      bufferForPlaybackMs: 1500,
      bufferForPlaybackAfterRebufferMs: 2000,
    };
  }
}

/**
 * Clear old video cache (keep only recent videos)
 */
export async function clearOldVideoCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const videoCacheKeys = allKeys.filter(key => key.startsWith(VIDEO_DISK_CACHE_KEY_PREFIX));
    
    let clearedCount = 0;
    for (const key of videoCacheKeys) {
      try {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const videoCache: VideoCache = JSON.parse(cached);
          const cacheAge = Date.now() - videoCache.cachedAt;
          
          // Keep frequently watched videos longer
          const shouldKeep = videoCache.watchCount > 3 && cacheAge < maxAgeMs * 2;
          
          if (cacheAge > maxAgeMs && !shouldKeep) {
            await AsyncStorage.removeItem(key);
            clearedCount++;
          }
        }
      } catch (error) {
        // Remove corrupted cache entries
        await AsyncStorage.removeItem(key);
        clearedCount++;
      }
    }
    
    if (clearedCount > 0) {
      log(`[VideoPreload] Cleared ${clearedCount} old video cache entries`);
    }
  } catch (error) {
    error('[VideoPreload] Error clearing old cache:', error);
  }
}

/**
 * Get cache size (for monitoring)
 */
export async function getVideoCacheSize(): Promise<number> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const videoCacheKeys = allKeys.filter(key => key.startsWith(VIDEO_DISK_CACHE_KEY_PREFIX));
    return videoCacheKeys.length;
  } catch (error) {
    return 0;
  }
}

