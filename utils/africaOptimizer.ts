/**
 * Africa/Nigeria Performance Optimizer
 * 
 * Aggressive optimizations specifically for Africa's network conditions:
 * - Slow/unstable networks
 * - High latency
 * - Limited bandwidth
 * - Cost-conscious users (data usage)
 * - Intermittent connectivity
 */

import { detectNetworkSpeed, ConnectionSpeed } from './networkSpeedDetector';
import { getOptimizedCdnUrl, getCdnUrl } from './cdnConfig';
import { Image } from 'expo-image';
import { log, warn, error } from './productionLogger';


/**
 * Africa-optimized image quality settings
 * Lower quality = faster loading = less data usage
 */
export const AFRICA_IMAGE_QUALITY = {
  thumbnail: 60,      // Lower quality for thumbnails
  post: 75,           // Medium quality for posts
  story: 80,          // Slightly higher for stories
  profile: 70,        // Medium quality for profiles
  avatar: 65,         // Lower quality for avatars
};

/**
 * Africa-optimized image sizes
 * Smaller sizes = faster loading = less data usage
 */
export const AFRICA_IMAGE_SIZES = {
  thumbnail: 200,     // Small thumbnails
  post: 720,          // Medium posts (not full HD)
  story: 1080,        // Full stories (portrait)
  profile: 400,       // Medium profile images
  avatar: 150,        // Small avatars
};

/**
 * Get Africa-optimized image URL
 * Automatically reduces quality and size for faster loading
 */
export function getAfricaOptimizedImageUrl(
  imageUrl: string,
  type: 'thumbnail' | 'post' | 'story' | 'profile' | 'avatar' = 'post'
): string {
  if (!imageUrl) return imageUrl;

  const quality = AFRICA_IMAGE_QUALITY[type];
  const size = AFRICA_IMAGE_SIZES[type];

  // Use CDN with aggressive optimization
  return getOptimizedCdnUrl(imageUrl, {
    width: size,
    quality,
    format: 'webp', // WebP is smaller than JPEG/PNG
    fit: 'cover',
  });
}

/**
 * Preload images with Africa-optimized settings
 * Uses lower quality for faster preloading
 */
export async function preloadAfricaOptimizedImages(
  imageUrls: string[],
  type: 'thumbnail' | 'post' | 'story' | 'profile' | 'avatar' = 'post'
): Promise<void> {
  try {
    const optimizedUrls = imageUrls
      .filter(url => url && url.startsWith('http'))
      .map(url => getAfricaOptimizedImageUrl(url, type))
      .slice(0, 10); // Limit to 10 images at a time

    log(`[AfricaOptimizer] Preloading ${optimizedUrls.length} images with ${type} quality...`);

    await Promise.allSettled(
      optimizedUrls.map(url =>
        Image.prefetch(url, {
          cachePolicy: 'memory-disk',
        }).catch(err => {
          warn(`[AfricaOptimizer] Failed to preload ${url}:`, err);
        })
      )
    );

    log(`[AfricaOptimizer] ✅ Preloaded ${optimizedUrls.length} images`);
  } catch (error) {
    error('[AfricaOptimizer] Error preloading images:', error);
  }
}

/**
 * Get Africa-optimized video quality
 * Automatically uses lower quality for faster loading
 */
export async function getAfricaOptimizedVideoQuality(): Promise<{
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
}> {
  const speedInfo = await detectNetworkSpeed();

  // Be extra conservative for Africa
  switch (speedInfo.speed) {
    case ConnectionSpeed.VERY_SLOW:
      return { width: 240, height: 135, bitrate: 100, frameRate: 8 };
    case ConnectionSpeed.SLOW:
      return { width: 320, height: 180, bitrate: 200, frameRate: 10 };
    case ConnectionSpeed.MODERATE:
      return { width: 480, height: 270, bitrate: 350, frameRate: 12 };
    case ConnectionSpeed.GOOD:
      return { width: 640, height: 360, bitrate: 600, frameRate: 20 };
    case ConnectionSpeed.EXCELLENT:
      return { width: 960, height: 540, bitrate: 1000, frameRate: 24 };
    default:
      return { width: 320, height: 180, bitrate: 200, frameRate: 10 };
  }
}

/**
 * Should use audio-only mode (Africa-optimized)
 * More aggressive threshold for Africa
 */
export async function shouldUseAudioOnlyAfrica(): Promise<boolean> {
  const speedInfo = await detectNetworkSpeed();
  
  // In Africa, be more aggressive about audio-only
  return (
    speedInfo.speed === ConnectionSpeed.VERY_SLOW ||
    speedInfo.speed === ConnectionSpeed.SLOW ||
    (speedInfo.speed === ConnectionSpeed.MODERATE && !speedInfo.isStable)
  );
}

/**
 * Get optimal batch size for data fetching (Africa-optimized)
 * Smaller batches = faster loading = better UX
 */
export function getAfricaBatchSize(type: 'posts' | 'stories' | 'events' = 'posts'): number {
  const batchSizes = {
    posts: 10,      // Smaller batches for posts
    stories: 5,     // Even smaller for stories
    events: 3,      // Smallest for events
  };

  return batchSizes[type];
}

/**
 * Get cache expiry for Africa (longer cache = less data usage)
 */
export function getAfricaCacheExpiry(): number {
  // 48 hours cache for Africa (longer than default 24h)
  // Reduces data usage significantly
  return 48 * 60 * 60 * 1000; // 48 hours
}

/**
 * Should compress images before upload (Africa-optimized)
 */
export function shouldCompressForAfrica(): boolean {
  // Always compress in Africa to reduce upload time and data usage
  return true;
}

/**
 * Get compression quality for Africa
 */
export function getAfricaCompressionQuality(): number {
  // Lower quality = smaller file = faster upload
  return 0.7; // 70% quality (good balance)
}

/**
 * Get maximum image size before compression (Africa-optimized)
 */
export function getAfricaMaxImageSize(): number {
  // Smaller max size = faster uploads
  return 1920; // Max 1920px (not 4K)
}

/**
 * Get maximum video size before compression (Africa-optimized)
 */
export function getAfricaMaxVideoSize(): number {
  // Smaller max size = faster uploads
  return 1080; // Max 1080p (not 4K)
}

/**
 * Get timeout for network requests (Africa-optimized)
 * Longer timeout for slow networks
 */
export function getAfricaRequestTimeout(): number {
  // Longer timeout for Africa's slower networks
  return 30000; // 30 seconds (vs default 10-15s)
}

/**
 * Should retry failed requests (Africa-optimized)
 */
export function shouldRetryForAfrica(): boolean {
  // Always retry in Africa (networks are more unstable)
  return true;
}

/**
 * Get retry configuration for Africa
 */
export function getAfricaRetryConfig(): {
  maxRetries: number;
  retryDelay: number;
} {
  return {
    maxRetries: 3,      // More retries for unstable networks
    retryDelay: 2000,   // 2 second delay between retries
  };
}

/**
 * Get prefetch delay for Africa (staggered loading)
 */
export function getAfricaPrefetchDelay(): number {
  // Stagger prefetch to avoid overwhelming slow networks
  return 500; // 500ms delay between prefetch operations
}

/**
 * Should use progressive loading (Africa-optimized)
 */
export function shouldUseProgressiveLoading(): boolean {
  // Always use progressive loading in Africa
  return true;
}

/**
 * Get initial load count (Africa-optimized)
 * Load fewer items initially for faster first paint
 */
export function getAfricaInitialLoadCount(type: 'posts' | 'stories' | 'events' = 'posts'): number {
  const counts = {
    posts: 5,      // Load only 5 posts initially
    stories: 3,    // Load only 3 stories initially
    events: 2,     // Load only 2 events initially
  };

  return counts[type];
}

/**
 * Log Africa optimization status
 */
export function logAfricaOptimizationStatus(): void {
  log('🌍 [AfricaOptimizer] Africa optimizations enabled:');
  log('  - Lower image quality:', AFRICA_IMAGE_QUALITY);
  log('  - Smaller image sizes:', AFRICA_IMAGE_SIZES);
  log('  - Longer cache expiry:', getAfricaCacheExpiry() / (60 * 60 * 1000), 'hours');
  log('  - Smaller batch sizes:', getAfricaBatchSize('posts'));
  log('  - Longer request timeout:', getAfricaRequestTimeout() / 1000, 'seconds');
}

