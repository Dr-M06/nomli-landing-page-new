/**
 * Safely get avatar URL with proper fallback handling
 * This prevents the "Double cannot be cast to ReadableArray" error
 * that occurs when null/undefined values are passed to Image sources
 * 
 * Now includes CDN support for faster loading in Nigeria and other regions
 */

import { getAvatarUrl } from './cdnConfig';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';

/** DB often stores only the object key (e.g. "avatar" or "userId/photo.jpg") under bucket `avatars`. */
function tryResolveAvatarsBucketPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('..')) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  let key = trimmed;
  if (key.startsWith('avatars/')) {
    key = key.slice('avatars/'.length);
  }
  if (!key) return null;

  try {
    const { data } = supabase.storage.from('avatars').getPublicUrl(key);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}

export const getSafeAvatarUrl = (avatarUrl?: string | null, userId?: string): string | null => {
  // If no avatar URL, return null (will use default image)
  if (!avatarUrl) return null;
  
  // Handle DiceBear avatars (these don't need CDN)
  if (avatarUrl.startsWith('dicebear:')) {
    const avatarData = avatarUrl.replace('dicebear:', '');
    if (avatarData.includes(':')) {
      const [style, seed] = avatarData.split(':');
      return `https://api.dicebear.com/9.x/${style}/png?seed=${seed}&size=100`;
    } else {
      // Handle old format (style only) - use userId as seed
      const seed = userId || 'default';
      return `https://api.dicebear.com/9.x/${avatarData}/png?seed=${seed}&size=100`;
    }
  }
  
  // Ensure the URL is a valid string
  if (typeof avatarUrl !== 'string') {
    warn('[SafeAvatarUrl] Invalid avatar URL type:', typeof avatarUrl, avatarUrl);
    return null;
  }

  const trimmed = avatarUrl.trim();
  if (!trimmed) return null;

  let urlToUse = trimmed;
  if (!urlToUse.startsWith('http://') && !urlToUse.startsWith('https://') && !urlToUse.startsWith('data:')) {
    const resolved = tryResolveAvatarsBucketPath(urlToUse);
    if (!resolved) {
      warn('[SafeAvatarUrl] Invalid avatar URL format (not http(s)/data and not a storage path):', avatarUrl);
      return null;
    }
    urlToUse = resolved;
  }
  
  try {
    // Remove cache-busting query parameters for better caching
    // These parameters (like ?t=timestamp) prevent expo-image from caching properly
    let cleanUrl = urlToUse;
    try {
      const url = new URL(urlToUse);
      // Remove cache-busting parameters: t, cache, timestamp, _t, v
      const paramsToRemove = ['t', 'cache', 'timestamp', '_t', 'v', 'cb'];
      paramsToRemove.forEach(param => url.searchParams.delete(param));
      cleanUrl = url.toString();
    } catch (urlError) {
      // If URL parsing fails, try simple string replacement
      cleanUrl = urlToUse
        .replace(/[?&]t=\d+/g, '')
        .replace(/[?&]cache=[^&]*/g, '')
        .replace(/[?&]timestamp=\d+/g, '')
        .replace(/[?&]_t=\d+/g, '')
        .replace(/[?&]v=\d+/g, '')
        .replace(/[?&]cb=\d+/g, '')
        .replace(/\?$/, ''); // Remove trailing ?
    }
    
    // Use CDN URL if enabled (faster for Nigeria)
    // getAvatarUrl automatically handles CDN conversion and optimization
    const optimizedUrl = getAvatarUrl(cleanUrl);
    
    // Ensure we got a valid URL back
    if (!optimizedUrl || typeof optimizedUrl !== 'string') {
      warn('[SafeAvatarUrl] getAvatarUrl returned invalid URL:', optimizedUrl);
      // Fallback to cleaned URL if optimization failed
      return cleanUrl;
    }
    
    return optimizedUrl;
  } catch (e) {
    error('[SafeAvatarUrl] Error optimizing avatar URL:', e);
    return urlToUse;
  }
};

/**
 * Get safe image source for React Native Image component
 * This ensures we never pass invalid values that could cause casting errors
 */
export const getSafeImageSource = (avatarUrl?: string | null, userId?: string) => {
  const safeUrl = getSafeAvatarUrl(avatarUrl, userId);
  
  if (safeUrl) {
    return { uri: safeUrl };
  }
  
  // Return null to indicate we should use default image
  return null;
};

/**
 * Check if an avatar URL is valid and safe to use
 */
export const isValidAvatarUrl = (avatarUrl?: string | null): boolean => {
  if (!avatarUrl) return false;
  
  // Handle DiceBear URLs
  if (avatarUrl.startsWith('dicebear:')) return true;
  
  // Check if it's a valid string URL
  if (typeof avatarUrl !== 'string') return false;
  
  // Basic URL validation
  try {
    new URL(avatarUrl);
    return true;
  } catch {
    return false;
  }
};
