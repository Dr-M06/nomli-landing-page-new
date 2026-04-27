/**
 * Image Resizing Utility
 * Automatically resizes large images to appropriate display sizes
 * Uses CDN transformations when available, falls back to client-side hints
 * Now includes network-aware optimization for low internet conditions
 */

import { Dimensions } from 'react-native';
import { getOptimizedCdnUrl } from './cdnConfig';
import { getNetworkOptimizedImageUrlSync, getOptimizedPostImageUrl, getOptimizedThumbnailUrl, getOptimizedAvatarUrl } from './networkAwareImageOptimizer';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Maximum dimensions for different image types
 * These are display sizes, not file sizes
 */
export const IMAGE_MAX_DIMENSIONS = {
  post: Math.min(SCREEN_WIDTH, 1080), // Post images: screen width or 1080px max
  thumbnail: 400, // Thumbnails: 400px
  avatar: 200, // Avatars: 200px
  story: 1080, // Stories: 1080px width
  fullscreen: SCREEN_WIDTH * 2, // Fullscreen viewer: 2x screen width for retina
};

/**
 * Quality settings for different image types
 */
export const IMAGE_QUALITY = {
  post: 88, // Post images: 88% quality (increased from 85 to preserve dynamic range)
  thumbnail: 80, // Thumbnails: 80% quality (increased from 70 to prevent ashy look)
  avatar: 82, // Avatars: 82% quality (increased from 75)
  story: 92, // Stories: 92% quality (increased from 90 for better highlights/shadows)
  fullscreen: 92, // Fullscreen: 92% quality (increased from 90)
};

/**
 * Resize image URL for display
 * Automatically reduces large images to appropriate display size
 * 
 * @param imageUrl - Original image URL
 * @param type - Type of image (determines max size and quality)
 * @param customWidth - Optional custom width override
 * @returns Optimized image URL
 */
export const resizeImageUrl = (
  imageUrl: string,
  type: 'post' | 'thumbnail' | 'avatar' | 'story' | 'fullscreen' = 'post',
  customWidth?: number
): string => {
  if (!imageUrl) return imageUrl;

  const maxWidth = customWidth || IMAGE_MAX_DIMENSIONS[type];
  const quality = IMAGE_QUALITY[type];

  // Use CDN optimization (even if it doesn't resize, it helps with caching)
  // For actual resizing, you'd need Cloudflare Images, Imgix, or similar service
  return getOptimizedCdnUrl(imageUrl, {
    width: maxWidth,
    quality,
    format: 'webp', // WebP is smaller than JPEG/PNG
    fit: 'cover',
  });
};

/**
 * Resize post image URL
 * Optimized for feed display with network-aware quality
 */
export const resizePostImage = (imageUrl: string, width?: number): string => {
  // Use network-aware optimizer for better performance on slow networks
  return getOptimizedPostImageUrl(imageUrl, width);
};

/**
 * Resize thumbnail image URL
 * Optimized for small previews with network-aware quality
 */
export const resizeThumbnail = (imageUrl: string): string => {
  return getOptimizedThumbnailUrl(imageUrl);
};

/**
 * Resize avatar image URL
 * Optimized for profile pictures with network-aware quality
 */
export const resizeAvatar = (imageUrl: string, size?: number): string => {
  return getOptimizedAvatarUrl(imageUrl, size);
};

/**
 * Resize story image URL
 * Optimized for story display
 */
export const resizeStoryImage = (imageUrl: string): string => {
  return resizeImageUrl(imageUrl, 'story');
};

/**
 * Resize fullscreen image URL
 * Optimized for fullscreen viewer (higher quality)
 */
export const resizeFullscreenImage = (imageUrl: string): string => {
  return resizeImageUrl(imageUrl, 'fullscreen');
};

/**
 * Batch resize multiple image URLs
 */
export const resizeImageUrls = (
  imageUrls: string[],
  type: 'post' | 'thumbnail' | 'avatar' | 'story' | 'fullscreen' = 'post'
): string[] => {
  return imageUrls.map(url => resizeImageUrl(url, type));
};
