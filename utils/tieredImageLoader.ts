/**
 * Tiered Image Loading System
 * 
 * Implements TikTok-level fast image loading with three tiers:
 * - Preview: 2-5KB (instant UI, blurred placeholder)
 * - Medium: 30-80KB (feed display, lazy loaded)
 * - Full: 200-600KB (on-demand only, tap/zoom)
 * 
 * Optimized for 2G-5G networks, especially Nigeria and emerging markets.
 */

import { Dimensions } from 'react-native';
import { getCloudflareImageUrl, isCloudflareImageId } from './cloudflareImages';
import { getCdnUrl } from './cdnConfig';
import { log, warn, error } from './productionLogger';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Image tier definitions
 */
export const IMAGE_TIERS = {
  preview: {
    width: 40, // Very small for instant load
    quality: 50,
    blur: 10, // Blur for placeholder effect
  },
  medium: {
    width: Math.min(SCREEN_WIDTH, 720), // Feed display size
    quality: 75,
    blur: 0,
  },
  full: {
    width: Math.min(SCREEN_WIDTH * 2, 1080), // Full quality
    quality: 85,
    blur: 0,
  },
} as const;

export type ImageTier = 'preview' | 'medium' | 'full';

/**
 * Generate tiered image URLs from a single source URL
 * 
 * For Cloudflare Images: Uses API to generate optimized variants
 * For Supabase Storage: Uses query parameters or generates preview URLs
 * 
 * @param imageUrl - Original image URL or Cloudflare Image ID
 * @param tier - Which tier to generate ('preview' | 'medium' | 'full')
 * @returns Optimized URL for the requested tier
 */
export const getTieredImageUrl = (
  imageUrl: string,
  tier: ImageTier = 'medium'
): string => {
  if (!imageUrl) return '';

  const tierConfig = IMAGE_TIERS[tier];

  // Handle Cloudflare Images (if enabled and imageId detected)
  if (isCloudflareImageId(imageUrl)) {
    return getCloudflareImageUrl(imageUrl, {
      width: tierConfig.width,
      quality: tierConfig.quality,
      format: 'webp',
      fit: 'cover',
      blur: tierConfig.blur,
    });
  }

  // Supabase Storage supports image transformations via render endpoint!
  // Format: /storage/v1/render/image/public/[bucket]/[path]?width=X&quality=Y&format=webp&resize=cover
  // IMPORTANT: Strip query parameters from original URL before generating render URL
  if (imageUrl.includes('supabase.co/storage')) {
    try {
      // Strip query parameters from original URL (cache-busting params interfere with render endpoint)
      const urlWithoutQuery = imageUrl.split('?')[0];
      
      // Check if it's already a render URL
      if (urlWithoutQuery.includes('/render/image/')) {
        // Already a render URL, just update query params
        const url = new URL(urlWithoutQuery);
        url.searchParams.set('width', tierConfig.width.toString());
        url.searchParams.set('quality', tierConfig.quality.toString());
        url.searchParams.set('format', 'webp');
        url.searchParams.set('resize', 'cover');
        return url.toString();
      }
      
      // Convert regular Supabase Storage URL to render URL
      // Pattern: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
      // To: https://[project].supabase.co/storage/v1/render/image/public/[bucket]/[path]?params
      const renderMatch = urlWithoutQuery.match(/supabase\.co\/storage\/v1\/object\/public\/(.+)$/);
      if (renderMatch) {
        const path = renderMatch[1];
        const baseUrl = urlWithoutQuery.split('/storage/')[0];
        const renderUrl = `${baseUrl}/storage/v1/render/image/public/${path}`;
        
        const url = new URL(renderUrl);
        url.searchParams.set('width', tierConfig.width.toString());
        url.searchParams.set('quality', tierConfig.quality.toString());
        url.searchParams.set('format', 'webp');
        url.searchParams.set('resize', 'cover');
        
        return url.toString();
      }
    } catch (error) {
      if (__DEV__) {
        warn('[TieredImageLoader] Error generating Supabase render URL, using original:', error);
      }
      // Fallback to original URL without query params
      return imageUrl.split('?')[0];
    }
  }
  
  // For CDN URLs or other sources, try to append query parameters
  const cdnUrl = getCdnUrl(imageUrl);
  
  // If CDN supports transformations (Cloudflare Workers with Image Resizing),
  // append query parameters
  if (cdnUrl.includes('cdn') || cdnUrl.includes('cloudflare')) {
    try {
      const url = new URL(cdnUrl);
      url.searchParams.set('width', tierConfig.width.toString());
      url.searchParams.set('quality', tierConfig.quality.toString());
      url.searchParams.set('format', 'webp');
      if (tierConfig.blur > 0) {
        url.searchParams.set('blur', tierConfig.blur.toString());
      }
      return url.toString();
    } catch (error) {
      // URL parsing failed, return as-is
    }
  }

  // Fallback: Return original URL without query params (cache-busting params can cause issues)
  // Strip query parameters to ensure consistent URLs
  const cleanUrl = imageUrl.split('?')[0];
  return cleanUrl || cdnUrl;
};

/**
 * Generate all three tier URLs at once
 */
export const getAllTierUrls = (imageUrl: string): {
  preview: string;
  medium: string;
  full: string;
} => {
  return {
    preview: getTieredImageUrl(imageUrl, 'preview'),
    medium: getTieredImageUrl(imageUrl, 'medium'),
    full: getTieredImageUrl(imageUrl, 'full'),
  };
};

/**
 * Check if we should load a higher tier based on network conditions
 */
export const shouldLoadHigherTier = async (
  currentTier: ImageTier,
  networkSpeed?: '2g' | '3g' | '4g' | '5g' | 'wifi'
): Promise<boolean> => {
  // Always load preview first
  if (currentTier === 'preview') {
    return true;
  }

  // On 2G, only load preview
  if (networkSpeed === '2g') {
    return false;
  }

  // On 3G+, allow medium
  if (currentTier === 'medium') {
    return networkSpeed !== '2g';
  }

  // Full tier only on 4G+ or WiFi
  if (currentTier === 'full') {
    return networkSpeed === '4g' || networkSpeed === '5g' || networkSpeed === 'wifi';
  }

  return false;
};

/**
 * Get dominant color from image URL (for placeholder)
 * This is a placeholder - in production, you'd extract this server-side
 */
export const getImagePlaceholderColor = (imageUrl: string): string => {
  // Generate a consistent color based on URL hash
  let hash = 0;
  for (let i = 0; i < imageUrl.length; i++) {
    hash = imageUrl.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate a muted color
  const hue = hash % 360;
  return `hsl(${hue}, 30%, 85%)`;
};
