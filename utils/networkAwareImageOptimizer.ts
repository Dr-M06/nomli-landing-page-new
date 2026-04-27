/**
 * Network-Aware Image Optimization
 * Automatically adjusts image quality and size based on network speed
 * Optimized for low internet conditions (Nigeria, etc.)
 */

import { Dimensions } from 'react-native';
import { detectNetworkSpeed, NetworkSpeedInfo } from './networkSpeedDetector';
import { getCdnUrl } from './cdnConfig';
import { getOptimizedImageUrl, isCloudflareImageId } from './cloudflareImages';
import { log, warn, error } from './productionLogger';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Image quality levels based on network speed
 */
const NETWORK_QUALITY_LEVELS = {
  verySlow: { quality: 75, maxWidth: 480 },      // < 100 kbps (increased from 60 to prevent ashy look)
  slow: { quality: 80, maxWidth: 720 },          // 100-500 kbps (increased from 70)
  moderate: { quality: 85, maxWidth: 1080 },      // 500-1000 kbps (increased from 80)
  good: { quality: 88, maxWidth: 1080 },        // 1-5 Mbps (increased from 85)
  excellent: { quality: 92, maxWidth: 1440 },    // > 5 Mbps (increased from 90)
};

/**
 * Get network-appropriate image quality settings
 */
const getNetworkQualitySettings = async (): Promise<{ quality: number; maxWidth: number }> => {
  try {
    const speedInfo = await detectNetworkSpeed();
    const kbps = speedInfo.estimatedKbps || 0;

    if (kbps < 100) {
      return NETWORK_QUALITY_LEVELS.verySlow;
    } else if (kbps < 500) {
      return NETWORK_QUALITY_LEVELS.slow;
    } else if (kbps < 1000) {
      return NETWORK_QUALITY_LEVELS.moderate;
    } else if (kbps < 5000) {
      return NETWORK_QUALITY_LEVELS.good;
    } else {
      return NETWORK_QUALITY_LEVELS.excellent;
    }
  } catch (error) {
    // Fallback to moderate quality if detection fails
    warn('[ImageOptimizer] Network detection failed, using moderate quality:', error);
    return NETWORK_QUALITY_LEVELS.moderate;
  }
};

/**
 * Optimize image URL for current network conditions
 * Automatically reduces quality and size for slow networks
 */
export const getNetworkOptimizedImageUrl = async (
  imageUrl: string,
  options?: {
    type?: 'post' | 'thumbnail' | 'avatar' | 'story' | 'fullscreen';
    customWidth?: number;
    forceLowQuality?: boolean; // Force low quality regardless of network
  }
): Promise<string> => {
  if (!imageUrl) return imageUrl;

  const { type = 'post', customWidth, forceLowQuality = false } = options || {};

  // Get network-appropriate settings
  const networkSettings = forceLowQuality 
    ? NETWORK_QUALITY_LEVELS.verySlow 
    : await getNetworkQualitySettings();

  // Determine max width
  let maxWidth: number;
  if (customWidth) {
    maxWidth = Math.min(customWidth, networkSettings.maxWidth);
  } else {
    switch (type) {
      case 'thumbnail':
        maxWidth = Math.min(400, networkSettings.maxWidth);
        break;
      case 'avatar':
        maxWidth = Math.min(200, networkSettings.maxWidth);
        break;
      case 'story':
        maxWidth = Math.min(1080, networkSettings.maxWidth);
        break;
      case 'fullscreen':
        maxWidth = Math.min(SCREEN_WIDTH * 2, networkSettings.maxWidth);
        break;
      case 'post':
      default:
        maxWidth = Math.min(SCREEN_WIDTH, networkSettings.maxWidth);
        break;
    }
  }

  // Check if it's a Cloudflare Image ID - use Cloudflare Images for actual resizing
  if (isCloudflareImageId(imageUrl)) {
    return getOptimizedImageUrl(imageUrl, {
      type,
      customWidth: maxWidth,
      width: maxWidth,
      quality: networkSettings.quality,
      format: 'webp',
      fit: 'cover',
    });
  }

  // For Supabase Storage URLs, use CDN for faster delivery
  // Note: Actual resizing requires Cloudflare Images or similar service
  const cdnUrl = getCdnUrl(imageUrl);
  return cdnUrl;
};

/**
 * Synchronous version (uses cached network info or defaults)
 * Use this for immediate rendering without async delay
 */
let cachedNetworkSettings: { quality: number; maxWidth: number } | null = null;
let lastNetworkCheck = 0;
const NETWORK_CHECK_INTERVAL = 30000; // Check every 30 seconds

export const getNetworkOptimizedImageUrlSync = (
  imageUrl: string,
  options?: {
    type?: 'post' | 'thumbnail' | 'avatar' | 'story' | 'fullscreen';
    customWidth?: number;
    forceLowQuality?: boolean;
  }
): string => {
  if (!imageUrl) return imageUrl;

  const { type = 'post', customWidth, forceLowQuality = false } = options || {};

  // Use cached settings or default to moderate
  let networkSettings = cachedNetworkSettings || NETWORK_QUALITY_LEVELS.moderate;
  
  if (forceLowQuality) {
    networkSettings = NETWORK_QUALITY_LEVELS.verySlow;
  }

  // Determine max width (same logic as async version)
  let maxWidth: number;
  if (customWidth) {
    maxWidth = Math.min(customWidth, networkSettings.maxWidth);
  } else {
    switch (type) {
      case 'thumbnail':
        maxWidth = Math.min(400, networkSettings.maxWidth);
        break;
      case 'avatar':
        maxWidth = Math.min(200, networkSettings.maxWidth);
        break;
      case 'story':
        maxWidth = Math.min(1080, networkSettings.maxWidth);
        break;
      case 'fullscreen':
        maxWidth = Math.min(SCREEN_WIDTH * 2, networkSettings.maxWidth);
        break;
      case 'post':
      default:
        maxWidth = Math.min(SCREEN_WIDTH, networkSettings.maxWidth);
        break;
    }
  }

  // Check if it's a Cloudflare Image ID - use Cloudflare Images for actual resizing
  if (isCloudflareImageId(imageUrl)) {
    return getOptimizedImageUrl(imageUrl, {
      type,
      customWidth: maxWidth,
      width: maxWidth,
      quality: networkSettings.quality,
      format: 'webp',
      fit: 'cover',
    });
  }

  // For Supabase Storage URLs, use CDN or direct URL based on configuration
  // Direct URLs cache better with expo-image and can be faster
  const optimizedUrl = getCdnUrl(imageUrl);
  return optimizedUrl;
};

/**
 * Initialize network settings (call on app start)
 * This pre-fetches network speed so image optimization is ready
 */
export const initializeNetworkImageOptimizer = async (): Promise<void> => {
  try {
    const settings = await getNetworkQualitySettings();
    cachedNetworkSettings = settings;
    lastNetworkCheck = Date.now();
    log('[ImageOptimizer] Network settings initialized:', settings);
  } catch (error) {
    warn('[ImageOptimizer] Failed to initialize, using defaults:', error);
    cachedNetworkSettings = NETWORK_QUALITY_LEVELS.moderate;
  }
};

/**
 * Update network settings periodically
 */
export const updateNetworkImageSettings = async (): Promise<void> => {
  const now = Date.now();
  if (now - lastNetworkCheck < NETWORK_CHECK_INTERVAL) {
    return; // Too soon to check again
  }

  try {
    const settings = await getNetworkQualitySettings();
    cachedNetworkSettings = settings;
    lastNetworkCheck = now;
  } catch (error) {
    // Keep existing settings on error
    warn('[ImageOptimizer] Failed to update network settings:', error);
  }
};

/**
 * Get optimized post image URL (synchronous, uses cached network info)
 */
export const getOptimizedPostImageUrl = (imageUrl: string, width?: number): string => {
  return getNetworkOptimizedImageUrlSync(imageUrl, {
    type: 'post',
    customWidth: width,
  });
};

/**
 * Get optimized thumbnail URL (synchronous)
 */
export const getOptimizedThumbnailUrl = (imageUrl: string): string => {
  return getNetworkOptimizedImageUrlSync(imageUrl, {
    type: 'thumbnail',
  });
};

/**
 * Get optimized avatar URL (synchronous)
 */
export const getOptimizedAvatarUrl = (imageUrl: string, size?: number): string => {
  return getNetworkOptimizedImageUrlSync(imageUrl, {
    type: 'avatar',
    customWidth: size,
  });
};

/**
 * Force low quality mode (for very slow networks or user preference)
 */
export const getLowQualityImageUrl = (imageUrl: string, type: 'post' | 'thumbnail' | 'avatar' = 'post'): string => {
  return getNetworkOptimizedImageUrlSync(imageUrl, {
    type,
    forceLowQuality: true,
  });
};
