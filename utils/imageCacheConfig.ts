/**
 * Global Image Cache Configuration
 * 
 * Configures expo-image for aggressive caching across the app
 * This ensures images load instantly from cache when app reopens
 */

import { Image } from 'expo-image';
import { log, warn, error } from './productionLogger';


/**
 * Default cache policy for all images
 * - 'memory-disk': Cache to both memory and disk (aggressive)
 * - 'disk': Cache to disk only (persistent across app restarts)
 * - 'memory': Cache to memory only (cleared on app restart)
 * - 'none': No caching
 */
export const DEFAULT_CACHE_POLICY: 'memory-disk' | 'disk' | 'memory' | 'none' = 'memory-disk';

/**
 * Default image configuration for aggressive caching
 * Use this as a base for all Image components
 */
export const AGGRESSIVE_IMAGE_CONFIG = {
  cachePolicy: DEFAULT_CACHE_POLICY as const,
  transition: 200, // Smooth fade-in transition
  priority: 'normal' as const,
  // Note: recyclingKey should be unique per image for proper view recycling
};

/**
 * High priority image config (for above-the-fold content)
 */
export const HIGH_PRIORITY_IMAGE_CONFIG = {
  ...AGGRESSIVE_IMAGE_CONFIG,
  priority: 'high' as const,
};

/**
 * Low priority image config (for below-the-fold content)
 */
export const LOW_PRIORITY_IMAGE_CONFIG = {
  ...AGGRESSIVE_IMAGE_CONFIG,
  priority: 'low' as const,
};

/**
 * Clear expo-image cache
 * Useful for debugging or forcing fresh image loads
 */
export const clearImageCache = async (): Promise<void> => {
  try {
    await Image.clearMemoryCache();
    await Image.clearDiskCache();
    log('✅ [ImageCache] Cleared all image caches');
  } catch (error) {
    error('[ImageCache] Error clearing cache:', error);
  }
};

/**
 * Get cache size (approximate)
 * Note: expo-image doesn't provide exact cache size, this is an approximation
 */
export const getImageCacheSize = async (): Promise<{ memoryMB: number; diskMB: number }> => {
  try {
    // Note: expo-image doesn't expose cache size directly
    // This would require native module access
    return { memoryMB: 0, diskMB: 0 };
  } catch (error) {
    error('[ImageCache] Error getting cache size:', error);
    return { memoryMB: 0, diskMB: 0 };
  }
};

