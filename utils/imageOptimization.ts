/**
 * Image Optimization Utilities
 * Provides low-res thumbnails for instant loading (like Instagram)
 */

/**
 * Generate a low-res data URL from an image URL
 * This creates a tiny blurred preview that loads instantly
 */
export const generateLowResPreview = async (
  imageUrl: string,
  size: number = 24
): Promise<string | null> => {
  try {
    // For now, return a data URL placeholder
    // In production, you'd generate this on the server during upload
    // This is a placeholder implementation
    const canvas = document?.createElement?.('canvas');
    if (!canvas) return null;

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Create a simple gradient placeholder
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, 'rgba(200, 200, 200, 0.3)');
    gradient.addColorStop(1, 'rgba(150, 150, 150, 0.3)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return canvas.toDataURL('image/jpeg', 0.1);
  } catch (error) {
    error('[ImageOptimization] Error generating preview:', error);
    return null;
  }
};

import { getOptimizedCdnUrl } from './cdnConfig';
import { log, warn, error } from './productionLogger';


/**
 * Get optimized image URL with size parameter
 * Now supports CDN for faster loading in Nigeria and other regions
 */
export const getOptimizedImageUrl = (
  imageUrl: string,
  width?: number,
  height?: number,
  quality: number = 80
): string => {
  if (!imageUrl) return imageUrl;

  // Use CDN optimization if enabled (faster for Nigeria)
  return getOptimizedCdnUrl(imageUrl, {
    width,
    height,
    quality,
    format: 'webp', // Use WebP for smaller file sizes
  });
};

/**
 * Get thumbnail URL for story images
 * Returns a small version for instant loading
 */
export const getStoryThumbnailUrl = (imageUrl: string): string => {
  return getOptimizedImageUrl(imageUrl, 100, 100, 60);
};

/**
 * Get full resolution URL for story images
 * Use this after thumbnail is displayed
 */
export const getStoryFullResUrl = (imageUrl: string): string => {
  return getOptimizedImageUrl(imageUrl, 1080, 1920, 90);
};

/**
 * Preload image in background
 */
export const preloadImage = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      resolve();
      return;
    }

    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
};

/**
 * Batch preload multiple images
 */
export const preloadImages = async (urls: string[]): Promise<void> => {
  await Promise.allSettled(urls.map(url => preloadImage(url)));
};

