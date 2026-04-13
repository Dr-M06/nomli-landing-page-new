/**
 * Cloudflare Images Integration
 * 
 * Provides image upload and URL generation for Cloudflare Images service
 * This enables on-the-fly image resizing and optimization
 */

import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import Constants from 'expo-constants';
import { log, warn, error } from './productionLogger';


// SECURITY: Cloudflare API token is now server-side only
// We use Edge Function to proxy requests (no token exposure)
const CLOUDFLARE_ACCOUNT_HASH = process.env.EXPO_PUBLIC_CF_ACCOUNT_HASH || '';
const USE_CLOUDFLARE_IMAGES = process.env.EXPO_PUBLIC_USE_CLOUDFLARE_IMAGES === 'true' && !!CLOUDFLARE_ACCOUNT_HASH;
const SUPABASE_URL = Constants?.expoConfig?.extra?.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';

/**
 * Check if Cloudflare Images is enabled
 */
export const isCloudflareImagesEnabled = (): boolean => {
  return USE_CLOUDFLARE_IMAGES;
};

/**
 * Upload image to Cloudflare Images
 * 
 * @param imageUri - Local file URI or blob URL
 * @param metadata - Optional metadata (filename, etc.)
 * @returns Cloudflare Image ID or null on error
 */
export const uploadToCloudflareImages = async (
  imageUri: string,
  metadata?: {
    filename?: string;
    userId?: string;
  }
): Promise<string | null> => {
  if (!USE_CLOUDFLARE_IMAGES) {
    warn('[Cloudflare Images] Not enabled, skipping upload');
    return null;
  }

  try {
    log('[Cloudflare Images] Starting upload for:', imageUri.substring(0, 50) + '...');
    
    // Convert local URI to blob/file
    let blob: Blob;
    
    if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
      // Remote URL - fetch it
      log('[Cloudflare Images] Fetching remote URL...');
      const response = await fetch(imageUri);
      blob = await response.blob();
    } else {
      // Local file URI (React Native) - read as base64 then convert to blob
      log('[Cloudflare Images] Reading local file...');
      
      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // Convert base64 to blob
      // For React Native, we need to create a blob from base64
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      
      // Determine content type from file extension or default to jpeg
      const extension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
      const contentType = extension === 'png' ? 'image/png' : 
                         extension === 'gif' ? 'image/gif' : 
                         extension === 'webp' ? 'image/webp' : 'image/jpeg';
      
      blob = new Blob([byteArray], { type: contentType });
      log('[Cloudflare Images] File converted to blob, size:', blob.size, 'bytes');
    }

    const formData = new FormData();
    formData.append('file', blob as any);
    
    if (metadata?.filename) {
      formData.append('metadata', JSON.stringify({ filename: metadata.filename }));
    }

    log('[Cloudflare Images] Uploading via secure Edge Function...');
    
    // SECURITY: Use Edge Function to proxy Cloudflare API calls
    // This keeps the API token server-side only
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      error('[Cloudflare Images] No session - cannot upload');
      return null;
    }

    // Convert blob to base64 for Edge Function
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove data URL prefix if present
        const base64Data = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Call secure Edge Function instead of direct API
    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/cloudflare-images-proxy`;
    const uploadResponse = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        },
      body: JSON.stringify({
        action: 'upload',
        imageData: `data:${blob.type};base64,${base64}`,
        filename: metadata?.filename || 'image.jpg',
        metadata: metadata ? { filename: metadata.filename, userId: metadata.userId } : undefined,
      }),
    });

    const data = await uploadResponse.json();
    
    if (data.success && data.result?.id) {
      log('[Cloudflare Images] ✅ Upload successful! Image ID:', data.result.id);
      return data.result.id;
    } else {
      error('[Cloudflare Images] ❌ Upload failed:', data.errors || data);
      return null;
    }
  } catch (error: any) {
    error('[Cloudflare Images] ❌ Upload error:', error?.message || error);
    return null;
  }
};

/**
 * Generate Cloudflare Images URL with transformations
 * 
 * @param imageId - Cloudflare Image ID
 * @param options - Transformation options
 * @returns Optimized image URL
 */
export const getCloudflareImageUrl = (
  imageId: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'auto';
    fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
    blur?: number; // 0-250
    sharpen?: number; // 0-10
  } = {}
): string => {
  if (!imageId || !CLOUDFLARE_ACCOUNT_HASH) {
    return '';
  }

  const {
    width,
    height,
    quality = 85,
    format = 'webp',
    fit = 'cover',
    blur,
    sharpen,
  } = options;

  // Cloudflare Images URL format:
  // https://imagedelivery.net/{account_hash}/{image_id}/{variant}
  // Variant can be 'public' or a custom variant name
  
  const params = new URLSearchParams();
  if (width) params.append('width', width.toString());
  if (height) params.append('height', height.toString());
  params.append('quality', quality.toString());
  params.append('format', format);
  params.append('fit', fit);
  if (blur !== undefined) params.append('blur', blur.toString());
  if (sharpen !== undefined) params.append('sharpen', sharpen.toString());

  const queryString = params.toString();
  const baseUrl = `https://imagedelivery.net/${CLOUDFLARE_ACCOUNT_HASH}/${imageId}/public`;
  
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
};

/**
 * Check if an image URL/ID is a Cloudflare Image ID
 * Cloudflare Image IDs are typically UUIDs or short alphanumeric strings
 */
export const isCloudflareImageId = (imageId: string): boolean => {
  if (!imageId) return false;
  
  // Cloudflare Image IDs are typically:
  // - UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // - Short alphanumeric: abc123def456
  // - Or prefixed with 'cf-'
  
  // Check if it's a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(imageId)) return true;
  
  // Check if it starts with cf-
  if (imageId.startsWith('cf-')) return true;
  
  // Check if it's a short alphanumeric string (typical Cloudflare ID format)
  // This is a heuristic - adjust based on your actual Cloudflare Image IDs
  const shortIdRegex = /^[a-z0-9]{8,36}$/i;
  if (shortIdRegex.test(imageId) && !imageId.includes('/') && !imageId.includes('.')) {
    return true;
  }
  
  return false;
};

/**
 * Get optimized image URL (works with both Cloudflare Images and regular URLs)
 * 
 * If imageId is a Cloudflare Image ID, returns Cloudflare Images URL with transformations
 * Otherwise, returns the original URL (for Supabase Storage, etc.)
 */
export const getOptimizedImageUrl = (
  imageIdOrUrl: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'auto';
    fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
    type?: 'post' | 'thumbnail' | 'avatar' | 'story' | 'fullscreen';
  } = {}
): string => {
  if (!imageIdOrUrl) return '';

  const { type, ...transformOptions } = options;

  // Check if it's a Cloudflare Image ID
  if (isCloudflareImageId(imageIdOrUrl)) {
    // Apply type-specific defaults
    let finalOptions = { ...transformOptions };
    
    if (type) {
      switch (type) {
        case 'thumbnail':
          finalOptions.width = finalOptions.width || 400;
          finalOptions.quality = finalOptions.quality || 70;
          break;
        case 'avatar':
          finalOptions.width = finalOptions.width || 200;
          finalOptions.height = finalOptions.height || 200;
          finalOptions.quality = finalOptions.quality || 75;
          break;
        case 'post':
          finalOptions.width = finalOptions.width || 1080;
          finalOptions.quality = finalOptions.quality || 85;
          break;
        case 'story':
          finalOptions.width = finalOptions.width || 1080;
          finalOptions.height = finalOptions.height || 1920;
          finalOptions.quality = finalOptions.quality || 90;
          break;
        case 'fullscreen':
          finalOptions.quality = finalOptions.quality || 90;
          break;
      }
    }

    return getCloudflareImageUrl(imageIdOrUrl, finalOptions);
  }

  // Not a Cloudflare Image ID - return as-is (will be handled by CDN/other optimizers)
  return imageIdOrUrl;
};

/**
 * Delete image from Cloudflare Images
 */
export const deleteCloudflareImage = async (imageId: string): Promise<boolean> => {
  if (!USE_CLOUDFLARE_IMAGES || !imageId) {
    return false;
  }

  try {
    // SECURITY: Use Edge Function to proxy Cloudflare API calls
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      error('[Cloudflare Images] No session - cannot delete');
      return false;
    }

    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/cloudflare-images-proxy`;
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
        headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'delete',
        imageId,
      }),
    });

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    error('[Cloudflare Images] Delete error:', error);
    return false;
  }
};

/**
 * Get image metadata from Cloudflare
 */
export const getCloudflareImageMetadata = async (imageId: string): Promise<any | null> => {
  if (!USE_CLOUDFLARE_IMAGES || !imageId) {
    return null;
  }

  try {
    // SECURITY: Use Edge Function to proxy Cloudflare API calls
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      error('[Cloudflare Images] No session - cannot get metadata');
      return null;
    }

    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/cloudflare-images-proxy`;
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
        headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get',
        imageId,
      }),
    });

    const data = await response.json();
    return data.success ? data.result : null;
  } catch (error) {
    error('[Cloudflare Images] Get metadata error:', error);
    return null;
  }
};
