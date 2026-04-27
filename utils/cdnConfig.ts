import { log, warn, error } from './productionLogger';
/**
 * CDN Configuration for Nigeria Performance Optimization
 * 
 * This utility converts Supabase Storage URLs to CDN URLs for faster loading
 * in Nigeria and other regions. Supports Cloudflare CDN integration.
 * 
 * OPTIMIZATION: Direct Supabase URLs with aggressive caching can be faster than CDN
 * when expo-image's cache is working well. Use direct URLs when CDN adds latency.
 */

// CDN Domain - Configure this in your environment variables
// Example: cdn.yourdomain.com or cdn.nomlimingle.com
const CDN_DOMAIN = process.env.EXPO_PUBLIC_CDN_DOMAIN || '';
const USE_CDN = process.env.EXPO_PUBLIC_USE_CDN === 'true' && !!CDN_DOMAIN;

// OPTIMIZATION: Use direct Supabase URLs for better caching with expo-image
// Direct URLs cache better because:
// 1. expo-image caches URLs directly (no CDN proxy layer)
// 2. Direct Supabase URLs are more stable (don't change)
// 3. Can be faster when CDN adds latency or cold starts
// Set EXPO_PUBLIC_USE_DIRECT_SUPABASE=true to force direct URLs
// Defaults to true when CDN is disabled
const USE_DIRECT_SUPABASE = process.env.EXPO_PUBLIC_USE_DIRECT_SUPABASE === 'true' || !USE_CDN;

/**
 * Check if CDN is enabled and configured
 */
export const isCdnEnabled = (): boolean => {
  return USE_CDN;
};

/**
 * Get CDN domain
 */
export const getCdnDomain = (): string => {
  return CDN_DOMAIN;
};

/**
 * Convert Supabase Storage URL to CDN URL
 * 
 * Example:
 * Input:  https://[project].supabase.co/storage/v1/object/public/post-images/image.jpg
 * Output: https://cdn.yourdomain.com/post-images/image.jpg
 */
export const getCdnUrl = (supabaseUrl: string): string => {
  // OPTIMIZATION: Use direct Supabase URLs when CDN is disabled or bypassed
  // Direct URLs cache better with expo-image and can be faster in some regions
  if (USE_DIRECT_SUPABASE || !CDN_DOMAIN) {
    // Return direct Supabase URL - expo-image will cache aggressively
    return supabaseUrl;
  }

  if (!supabaseUrl) {
    return supabaseUrl;
  }

  try {
    // Check if URL is already a CDN URL - skip conversion
    if (supabaseUrl.includes(CDN_DOMAIN)) {
      // Already a CDN URL, return as-is (no need to log)
      return supabaseUrl;
    }

    // Extract path from Supabase Storage URL
    // Pattern: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
    // Remove query parameters (cache-busting) for better caching
    const urlWithoutQuery = supabaseUrl.split('?')[0];
    const supabaseMatch = urlWithoutQuery.match(/supabase\.co\/storage\/v1\/object\/public\/(.+)$/);
    
    if (supabaseMatch) {
      const path = supabaseMatch[1];
      // Construct CDN URL without query parameters for better caching
      const cdnUrl = `https://${CDN_DOMAIN}/${path}`;
      if (__DEV__) {
        log(`[CDN] Converted: ${supabaseUrl.substring(0, 60)}... → ${cdnUrl.substring(0, 60)}...`);
      }
      return cdnUrl;
    }

    // If URL doesn't match Supabase pattern and isn't already CDN, return as-is
    // Only log if it's a Supabase URL (to catch potential issues)
    if (__DEV__ && supabaseUrl.includes('supabase.co')) {
      log('[CDN] URL does not match Supabase pattern, using as-is:', supabaseUrl.substring(0, 60));
    }
    return supabaseUrl;
  } catch (error) {
    error('[CDN] Error converting URL:', error);
    return supabaseUrl; // Fallback to original URL
  }
};

/**
 * Get optimized image URL with CDN and transformation parameters
 * 
 * Supports:
 * - Cloudflare Image Resizing (via Workers or Transform Rules)
 * - Supabase Storage transformations (fallback)
 * - Automatic format conversion (WebP)
 */
export const getOptimizedCdnUrl = (
  imageUrl: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'auto';
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  }
): string => {
  if (!imageUrl) return imageUrl;

  const {
    width,
    height,
    quality = 80,
    format = 'webp',
    fit = 'cover',
  } = options || {};

  // Convert to CDN URL (simple proxy, no image transformations)
  // The CDN Worker just proxies to Supabase Storage for faster edge delivery
  const cdnUrl = getCdnUrl(imageUrl);
  
  // Return CDN URL as-is (no transformations - Cloudflare Worker doesn't support image resizing)
  if (USE_CDN && CDN_DOMAIN && cdnUrl.includes(CDN_DOMAIN)) {
    return cdnUrl;
  }

  // Fallback: When CDN is disabled or not configured, return original URL without modifications
  // Supabase Storage doesn't support query parameters for transformations
  // Always return a valid URL - use cdnUrl if it's different (meaning CDN_DOMAIN was set but USE_CDN is false)
  // Otherwise use the original imageUrl
  if (!USE_CDN || !CDN_DOMAIN) {
    // If CDN_DOMAIN is set but USE_CDN is false, getCdnUrl still converts it
    // In that case, return the original imageUrl to avoid using CDN when disabled
    return imageUrl;
  }

  // Fallback: Use Supabase Storage transformations (only if CDN is enabled but URL doesn't match)
  // Note: Supabase Storage doesn't actually support width/height/quality parameters
  // This is a placeholder for future Supabase features
  if (imageUrl.includes('supabase.co/storage')) {
    // Return original URL - Supabase doesn't support these transformations
    return imageUrl;
  }

  // Return original URL if no optimization possible
  return imageUrl;
};

/**
 * Get optimized Mux video URL
 * Mux already uses CDN, but we can add optimization parameters
 */
export const getOptimizedMuxUrl = (muxUrl: string): string => {
  if (!muxUrl) return muxUrl;

  // Mux URLs already use CDN (stream.mux.com)
  // Mux handles optimization automatically
  // But we can add query parameters for additional optimization
  
  if (muxUrl.includes('stream.mux.com')) {
    try {
      const url = new URL(muxUrl);
      
      // Mux HLS URLs are already optimized
      // Add any additional parameters if needed
      // Example: ?max_resolution=720p for lower bandwidth
      
      return muxUrl; // Return as-is, Mux handles optimization
    } catch (error) {
      error('[CDN] Error optimizing Mux URL:', error);
      return muxUrl;
    }
  }

  return muxUrl;
};

/**
 * Get thumbnail URL for images (small, fast-loading version)
 */
export const getThumbnailUrl = (imageUrl: string): string => {
  return getOptimizedCdnUrl(imageUrl, {
    width: 200,
    height: 200,
    quality: 60,
    format: 'webp',
    fit: 'cover',
  });
};

/**
 * Get optimized URL for post images (medium size)
 */
export const getPostImageUrl = (imageUrl: string, width: number = 1080): string => {
  // If Bunny.net URL, use Bunny.net optimization
  if (imageUrl.includes('bunny.net') || imageUrl.includes('bunnycdn.com')) {
    const { getBunnyNetImageUrl } = require('./bunnyNetStorage');
    return getBunnyNetImageUrl(imageUrl, {
      width,
      quality: 85,
      format: 'webp',
    });
  }
  
  return getOptimizedCdnUrl(imageUrl, {
    width,
    quality: 85,
    format: 'webp',
    fit: 'cover',
  });
};

/**
 * Get optimized URL for avatar images (small, square)
 */
export const getAvatarUrl = (imageUrl: string, size: number = 200): string => {
  // If Bunny.net URL, use Bunny.net optimization
  if (imageUrl.includes('bunny.net') || imageUrl.includes('bunnycdn.com')) {
    const { getBunnyNetImageUrl } = require('./bunnyNetStorage');
    return getBunnyNetImageUrl(imageUrl, {
      width: size,
      height: size,
      quality: 75,
      format: 'webp',
    });
  }
  
  return getOptimizedCdnUrl(imageUrl, {
    width: size,
    height: size,
    quality: 75,
    format: 'webp',
    fit: 'cover',
  });
};

/**
 * Get optimized URL for story images (portrait, high quality)
 */
export const getStoryImageUrl = (imageUrl: string): string => {
  // If Bunny.net URL, use Bunny.net optimization
  if (imageUrl.includes('bunny.net') || imageUrl.includes('bunnycdn.com')) {
    const { getBunnyNetImageUrl } = require('./bunnyNetStorage');
    return getBunnyNetImageUrl(imageUrl, {
      width: 1080,
      height: 1920,
      quality: 90,
      format: 'webp',
    });
  }
  
  return getOptimizedCdnUrl(imageUrl, {
    width: 1080,
    height: 1920,
    quality: 90,
    format: 'webp',
    fit: 'cover',
  });
};

/**
 * Batch convert multiple URLs to CDN URLs
 */
export const convertUrlsToCdn = (urls: string[]): string[] => {
  return urls.map(url => getCdnUrl(url));
};

/**
 * Preload image from CDN
 */
export const preloadCdnImage = (imageUrl: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const cdnUrl = getCdnUrl(imageUrl);
    
    // Use React Native Image prefetch
    const { Image } = require('react-native');
    Image.prefetch(cdnUrl)
      .then(() => {
        log('[CDN] Preloaded image:', cdnUrl);
        resolve();
      })
      .catch((error: any) => {
        error('[CDN] Failed to preload image:', error);
        reject(error);
      });
  });
};

/**
 * Batch preload multiple images from CDN
 */
export const preloadCdnImages = async (urls: string[]): Promise<void> => {
  const cdnUrls = convertUrlsToCdn(urls);
  const { Image } = require('react-native');
  
  await Promise.allSettled(
    cdnUrls.map(url => 
      Image.prefetch(url).catch((error: any) => {
        error('[CDN] Failed to preload:', url, error);
      })
    )
  );
};

