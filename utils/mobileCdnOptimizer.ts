/**
 * Mobile CDN Optimizer
 * Ensures mobile app benefits from Cloudflare CDN like the website does
 * 
 * Uses the SAME CDN setup as Nigeria scaling:
 * - Same Cloudflare Worker: cloudflare-worker.js (proxies Supabase Storage)
 * - Same CDN domain: supabase-cdn.cdnnomliminglecom.workers.dev
 * - Same edge caching: Cloudflare's global network
 * 
 * Key differences:
 * - Websites: Browser HTTP cache + Cloudflare edge cache = super fast
 * - Mobile apps: expo-image cache + need explicit CDN URLs = can be slower
 * 
 * This utility ensures mobile app uses the SAME CDN URLs as the website
 */

import { Platform } from 'react-native';
import { getCdnUrl, getOptimizedCdnUrl, isCdnEnabled } from './cdnConfig';
import { log, warn, error } from './productionLogger';


/**
 * Check if CDN is enabled and log status
 */
export const checkCdnStatus = (): { enabled: boolean; domain?: string } => {
  const enabled = isCdnEnabled();
  const domain = process.env.EXPO_PUBLIC_CDN_DOMAIN;
  
  if (__DEV__) {
    log(`[MobileCDN] CDN Status: ${enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
    if (enabled && domain) {
      log(`[MobileCDN] CDN Domain: ${domain}`);
    } else if (!enabled) {
      warn('[MobileCDN] ⚠️ CDN is disabled! Set EXPO_PUBLIC_USE_CDN=true in .env');
      warn('[MobileCDN] ⚠️ Mobile app will use direct Supabase URLs (slower)');
    }
  }
  
  return { enabled, domain };
};

/**
 * Force enable CDN for mobile app (if configured)
 * OPTIMIZED: Now respects USE_DIRECT_SUPABASE flag for better caching
 * 
 * When USE_DIRECT_SUPABASE is true, returns direct Supabase URLs
 * which cache better with expo-image and can be faster
 */
export const forceCdnUrl = (imageUrl: string): string => {
  if (!imageUrl) return imageUrl;
  
  // OPTIMIZATION: Use direct Supabase URLs if configured for better caching
  const useDirectSupabase = process.env.EXPO_PUBLIC_USE_DIRECT_SUPABASE === 'true';
  if (useDirectSupabase) {
    // Return direct Supabase URL - expo-image caches these aggressively
    return imageUrl;
  }
  
  // Check if URL is already a CDN URL - skip conversion
  const cdnDomain = process.env.EXPO_PUBLIC_CDN_DOMAIN;
  if (cdnDomain && imageUrl.includes(cdnDomain)) {
    // Already a CDN URL, return as-is
    return imageUrl;
  }
  
  // Use CDN if domain is configured
  if (cdnDomain && imageUrl.includes('supabase.co/storage')) {
    try {
      const supabaseMatch = imageUrl.match(/supabase\.co\/storage\/v1\/object\/public\/(.+)$/);
      if (supabaseMatch) {
        const path = supabaseMatch[1];
        const cdnUrl = `https://${cdnDomain}/${path}`;
        // Don't log in production to reduce console spam
        return cdnUrl;
      }
    } catch (error) {
      // Silently fail and return original URL
      if (__DEV__) {
      error('[MobileCDN] Error forcing CDN URL:', error);
      }
    }
  }
  
  return imageUrl;
};

/**
 * Get optimized image URL for mobile app
 * Ensures CDN is used and respects mobile-specific optimizations
 */
export const getMobileOptimizedImageUrl = (
  imageUrl: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
  }
): string => {
  if (!imageUrl) return imageUrl;
  
  // Force CDN usage for mobile (even if flag is disabled)
  const cdnUrl = forceCdnUrl(imageUrl);
  
  // Apply optimizations if provided
  if (options && (options.width || options.height || options.quality)) {
    return getOptimizedCdnUrl(cdnUrl, {
      width: options.width,
      height: options.height,
      quality: options.quality,
      format: 'webp',
      fit: 'cover',
    });
  }
  
  return cdnUrl;
};

/**
 * Batch optimize image URLs for mobile
 */
export const optimizeImageUrlsForMobile = (imageUrls: string[]): string[] => {
  return imageUrls.map(url => forceCdnUrl(url));
};

/**
 * Preload images from CDN for mobile app
 * Uses expo-image prefetch with aggressive caching
 */
export const preloadMobileImages = async (imageUrls: string[]): Promise<void> => {
  try {
    const { Image } = require('expo-image');
    
    // Convert to CDN URLs first
    const cdnUrls = imageUrls.map(url => forceCdnUrl(url));
    
    // Preload with aggressive caching
    await Promise.allSettled(
      cdnUrls.map(url => 
        Image.prefetch(url, {
          cachePolicy: 'memory-disk', // Aggressive: cache to both memory and disk
        }).catch((error: any) => {
          if (__DEV__) {
            warn(`[MobileCDN] Failed to preload: ${url}`, error);
          }
        })
      )
    );
    
    if (__DEV__) {
      log(`[MobileCDN] ✅ Preloaded ${cdnUrls.length} images from CDN`);
    }
  } catch (error) {
    error('[MobileCDN] Error preloading images:', error);
  }
};
