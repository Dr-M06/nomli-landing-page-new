/**
 * Cloudflare CDN Cache Purge Utility
 * 
 * Purges cached files from Cloudflare CDN when content is updated
 * This ensures users see the latest version immediately after uploads
 * 
 * NOTE: This now calls a Supabase Edge Function to keep API tokens secure
 * The Edge Function handles the actual Cloudflare API calls server-side
 */

import { supabase } from './supabase';
import { SUPABASE_URL } from '../constants/Endpoints';
import { log, warn, error } from './productionLogger';


const CDN_DOMAIN = process.env.EXPO_PUBLIC_CDN_DOMAIN || '';

/**
 * Purge a specific file from Cloudflare CDN cache
 * Calls Supabase Edge Function to keep API tokens secure
 * @param filePath Path to the file relative to CDN domain (e.g., "avatars/avatar_xxx.jpg")
 * @returns Promise<boolean> True if purge was successful
 */
export async function purgeCdnCache(filePath: string): Promise<boolean> {
  if (!CDN_DOMAIN) {
    log('[CDN Purge] CDN not enabled, skipping');
    return false;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      warn('[CDN Purge] Not authenticated, skipping');
      return false;
    }

    log(`[CDN Purge] Purging cache for: ${filePath}`);
    
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/purge-cdn-cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      error('[CDN Purge] Failed to purge cache:', errorData);
      return false;
    }

    const result = await response.json();
    log('[CDN Purge] Cache purged successfully:', result);
    return result.success === true;
  } catch (error) {
    error('[CDN Purge] Error purging cache:', error);
    return false;
  }
}

/**
 * Purge multiple files from Cloudflare CDN cache
 * Calls Supabase Edge Function for each file (can be optimized later)
 * @param filePaths Array of file paths relative to CDN domain
 * @returns Promise<boolean> True if all purges were successful
 */
export async function purgeCdnCacheMultiple(filePaths: string[]): Promise<boolean> {
  if (!CDN_DOMAIN) {
    log('[CDN Purge] CDN not enabled, skipping');
    return false;
  }

  if (filePaths.length === 0) {
    return true;
  }

  try {
    // Purge each file (can be optimized to batch in Edge Function later)
    const results = await Promise.all(
      filePaths.map(path => purgeCdnCache(path))
    );

    const successCount = results.filter(r => r === true).length;
    log(`[CDN Purge] Purged ${successCount}/${filePaths.length} files`);
    
    return successCount === filePaths.length;
  } catch (error) {
    error('[CDN Purge] Error purging cache:', error);
    return false;
  }
}

/**
 * Extract file path from Supabase Storage URL for CDN purge
 * @param supabaseUrl Full Supabase Storage URL
 * @returns File path relative to CDN domain (e.g., "avatars/avatar_xxx.jpg")
 */
export function extractCdnPath(supabaseUrl: string): string | null {
  if (!supabaseUrl || !CDN_DOMAIN) {
    return null;
  }

  try {
    // Extract path from Supabase Storage URL
    // Pattern: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
    const match = supabaseUrl.match(/supabase\.co\/storage\/v1\/object\/public\/(.+)$/);
    
    if (match) {
      // Remove query parameters if present
      const path = match[1].split('?')[0];
      return path;
    }

    return null;
  } catch (error) {
    error('[CDN Purge] Error extracting path:', error);
    return null;
  }
}

/**
 * Purge CDN cache for a Supabase Storage URL
 * Calls Supabase Edge Function to keep API tokens secure
 * @param supabaseUrl Full Supabase Storage URL
 * @returns Promise<boolean> True if purge was successful
 */
export async function purgeCdnCacheFromUrl(supabaseUrl: string): Promise<boolean> {
  log('[CDN Purge] Starting purge for URL:', supabaseUrl);
  log('[CDN Purge] CDN Domain configured:', CDN_DOMAIN || 'NOT SET');
  
  if (!CDN_DOMAIN) {
    log('[CDN Purge] ⚠️ CDN not enabled (EXPO_PUBLIC_CDN_DOMAIN not set), skipping purge');
    return false;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      warn('[CDN Purge] ⚠️ Not authenticated, skipping purge');
      return false;
    }

    log('[CDN Purge] ✅ Authenticated, calling Edge Function...');
    log(`[CDN Purge] Purging cache for URL: ${supabaseUrl}`);
    
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/purge-cdn-cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileUrl: supabaseUrl }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      error('[CDN Purge] Failed to purge cache:', errorData);
      return false;
    }

    const result = await response.json();
    log('[CDN Purge] Cache purged successfully:', result);
    return result.success === true;
  } catch (error) {
    error('[CDN Purge] Error purging cache:', error);
    return false;
  }
}

