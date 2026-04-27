/**
 * Bunny.net Storage Integration
 * 
 * Upload images to Bunny.net Storage for faster loading in Africa
 * Falls back to Supabase Storage if Bunny.net fails
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


// Bunny.net Configuration (client-side flags only - credentials are server-side)
const USE_BUNNY_NET = process.env.EXPO_PUBLIC_USE_BUNNY_NET === 'true';
const BUNNY_NET_CDN_HOSTNAME = process.env.EXPO_PUBLIC_BUNNY_NET_CDN_HOSTNAME || '';
const BUNNY_NET_STORAGE_ZONE = process.env.EXPO_PUBLIC_BUNNY_NET_STORAGE_ZONE || '';

/**
 * Check if Bunny.net is enabled (credentials are checked server-side)
 */
export const isBunnyNetEnabled = (): boolean => {
  return USE_BUNNY_NET;
};

/**
 * Upload file to Bunny.net Storage
 * 
 * @param fileUri - Local file URI (from expo-image-picker or similar)
 * @param fileName - Desired filename (e.g., "post_123_456.jpg")
 * @param folder - Folder path in storage zone (e.g., "post-images", "avatars")
 * @returns Bunny.net CDN URL or null if upload fails
 */
export const uploadToBunnyNet = async (
  fileUri: string,
  fileName: string,
  folder: 'post-images' | 'avatars' | 'story-photos' | 'verifications' = 'post-images'
): Promise<string | null> => {
  if (!USE_BUNNY_NET) {
    log('[BunnyNet] Bunny.net is disabled');
    return null;
  }

  try {
    log('[BunnyNet] Starting upload via secure Edge Function:', { fileName, folder });

    // Verify user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      warn('[BunnyNet] No session - cannot upload (falling back to Supabase)');
      return null;
    }

    // Read file content as base64
    let base64Data: string;
    
    if (Platform.OS === 'web') {
      // Web: Fetch as blob, then convert to base64
      const response = await fetch(fileUri);
      const blob = await response.blob();
      
      // Convert blob to base64
      base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      // Mobile: Read as base64 directly
      base64Data = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    // Determine content type from file extension
    const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const contentType = 
      extension === 'png' ? 'image/png' :
      extension === 'gif' ? 'image/gif' :
      extension === 'webp' ? 'image/webp' :
      'image/jpeg';

    // Call secure Edge Function (keeps credentials server-side)
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      warn('[BunnyNet] Supabase URL not configured (falling back to Supabase)');
      return null;
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/bunny-net-proxy`;
    
    log('[BunnyNet] Calling Edge Function...');
    
    // Add timeout to prevent hanging on network issues (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      warn('[BunnyNet] ⚠️ Request timeout after 30 seconds');
    }, 30000);
    
    let uploadResponse: Response;
    try {
      uploadResponse = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'upload',
          imageData: `data:${contentType};base64,${base64Data}`,
          fileName,
          folder,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Handle network errors
      if (fetchError.name === 'AbortError') {
        warn('[BunnyNet] ⚠️ Request timeout (falling back to Supabase)');
        return null;
      }
      
      if (fetchError.message?.includes('Network request failed') || 
          fetchError.message?.includes('Failed to fetch') ||
          fetchError.message?.includes('NetworkError')) {
        warn('[BunnyNet] ⚠️ Network error (falling back to Supabase):', fetchError.message);
        return null;
      }
      
      // Re-throw other errors
      throw fetchError;
    }

    // Check response status first
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'Unknown error');
      
      // Log as warning instead of error to prevent error modal from showing
      // This is expected behavior - we fallback to Supabase
      warn('[BunnyNet] ⚠️ Edge Function error (falling back to Supabase):', uploadResponse.status);
      
      // Try to parse as JSON for more details (dev only)
      if (__DEV__) {
        try {
          const errorData = JSON.parse(errorText);
          warn('[BunnyNet] ⚠️ Error details:', errorData);
        } catch {
          warn('[BunnyNet] ⚠️ Error response (not JSON):', errorText);
        }
      }
      
      return null;
    }

    const data = await uploadResponse.json();

    if (data.success && data.cdnUrl) {
      log('[BunnyNet] ✅ Upload successful! CDN URL:', data.cdnUrl);
      return data.cdnUrl;
    } else {
      // Log as warning instead of error to prevent error modal
      // This is expected - we fallback to Supabase automatically
      warn('[BunnyNet] ⚠️ Upload failed (falling back to Supabase):', {
        success: data.success,
        error: data.error,
        status: data.status
      });
      return null;
    }
  } catch (error: any) {
    // Log as warning instead of error to prevent error modal
    warn('[BunnyNet] ⚠️ Upload error (falling back to Supabase):', error?.message || error);
    return null;
  }
};

/**
 * Generate optimized Bunny.net image URL with transformations
 * 
 * @param imageUrl - Bunny.net CDN URL
 * @param options - Image transformation options
 * @returns Optimized image URL
 */
export const getBunnyNetImageUrl = (
  imageUrl: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpeg' | 'png' | 'auto';
  }
): string => {
  if (!imageUrl) return imageUrl;
  
  // Check if it's a Bunny.net URL
  const isBunnyUrl = imageUrl.includes('bunny.net') || 
                     imageUrl.includes('bunnycdn.com') ||
                     (BUNNY_NET_CDN_HOSTNAME && imageUrl.includes(BUNNY_NET_CDN_HOSTNAME)) ||
                     (BUNNY_NET_STORAGE_ZONE && imageUrl.includes(`${BUNNY_NET_STORAGE_ZONE}.b-cdn.net`));
  
  if (!isBunnyUrl) {
    return imageUrl; // Not a Bunny.net URL, return as-is
  }

  const {
    width,
    height,
    quality = 85,
    format = 'webp',
  } = options || {};

  // Bunny.net supports URL-based transformations
  // Format: ?width=800&height=600&quality=85&format=webp
  const params = new URLSearchParams();
  
  if (width) params.append('width', width.toString());
  if (height) params.append('height', height.toString());
  if (quality) params.append('quality', quality.toString());
  if (format && format !== 'auto') params.append('format', format);

  const queryString = params.toString();
  return queryString ? `${imageUrl}?${queryString}` : imageUrl;
};

/**
 * Delete image from Bunny.net Storage
 * 
 * @param imageUrl - Bunny.net CDN URL or storage path
 * @returns Success status
 */
export const deleteFromBunnyNet = async (imageUrl: string): Promise<boolean> => {
  if (!USE_BUNNY_NET || !imageUrl) {
    return false;
  }
  
  const isBunnyUrl = imageUrl.includes('bunny.net') || 
                     imageUrl.includes('bunnycdn.com') ||
                     (BUNNY_NET_CDN_HOSTNAME && imageUrl.includes(BUNNY_NET_CDN_HOSTNAME)) ||
                     (BUNNY_NET_STORAGE_ZONE && imageUrl.includes(`${BUNNY_NET_STORAGE_ZONE}.b-cdn.net`));
  
  if (!isBunnyUrl) {
    return false;
  }

  try {
    // Verify user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      warn('[BunnyNet] No session - cannot delete');
      return false;
    }

    // Call secure Edge Function
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      warn('[BunnyNet] Supabase URL not configured');
      return false;
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/bunny-net-proxy`;
    
    const deleteResponse = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'delete',
        imageUrl,
      }),
    });

    const data = await deleteResponse.json();

    if (data.success) {
      log('[BunnyNet] ✅ Deleted:', imageUrl);
      return true;
    } else {
      warn('[BunnyNet] ⚠️ Delete failed:', data.error || data);
      return false;
    }
  } catch (error: any) {
    warn('[BunnyNet] ⚠️ Delete error:', error?.message || error);
    return false;
  }
};

/**
 * Check if URL is a Bunny.net URL
 */
export const isBunnyNetUrl = (url: string): boolean => {
  if (!url) return false;
  return url.includes('bunny.net') || 
         url.includes('bunnycdn.com') ||
         (BUNNY_NET_CDN_HOSTNAME && url.includes(BUNNY_NET_CDN_HOSTNAME)) ||
         (BUNNY_NET_STORAGE_ZONE && url.includes(`${BUNNY_NET_STORAGE_ZONE}.b-cdn.net`));
};
