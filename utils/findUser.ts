/**
 * Utility to find a user by ID
 * Can be used for admin purposes or debugging
 */

import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Find user by ID - returns full profile information
 */
export const findUserById = async (userId: string): Promise<{
  success: boolean;
  profile?: any;
  error?: string;
}> => {
  try {
    if (!userId || !userId.trim()) {
      return { success: false, error: 'User ID is required' };
    }

    log(`[FindUser] Searching for user: ${userId}`);

    // Add timeout to prevent hanging
    const queryPromise = supabase
      .from('profiles')
      .select('*')
      .eq('id', userId.trim())
      .maybeSingle();

    const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'Query timeout - database request took too long' });
      }, 5000); // 5 second timeout
    });

    // Race between query and timeout
    const result = await Promise.race([
      queryPromise.then(({ data, error }) => {
        if (error) {
          error('[FindUser] Database error:', error);
          return { success: false, error: `Database error: ${error.message}` };
        }

        if (!data) {
          log('[FindUser] User not found in profiles table');
          return { success: false, error: 'User not found in profiles table' };
        }

        // User found
        const userData = {
          ...data,
        };

        log(`[FindUser] ✅ Found user: ${data.username || data.full_name || data.email || 'Unknown'}`);
        return {
          success: true,
          profile: userData,
        };
      }),
      timeoutPromise,
    ]);

    return result as { success: boolean; profile?: any; error?: string };
  } catch (error: any) {
    error('[FindUser] Exception:', error);
    return { success: false, error: error.message || 'Failed to find user' };
  }
};

/**
 * Find user and display information (for console/debugging)
 */
export const findAndDisplayUser = async (userId: string) => {
  const result = await findUserById(userId);
  
  if (result.success && result.profile) {
    log('\n=== USER FOUND ===');
    log('ID:', result.profile.id);
    log('Username:', result.profile.username || 'N/A');
    log('Full Name:', result.profile.full_name || 'N/A');
    log('Email:', result.profile.email || 'N/A');
    log('Avatar:', result.profile.avatar_url || 'N/A');
    log('Bio:', result.profile.bio || 'N/A');
    log('Created At:', result.profile.created_at || 'N/A');
    log('Verified:', result.profile.is_verified || false);
    log('==================\n');
    return result.profile;
  } else {
    error('\n❌ USER NOT FOUND');
    error('Error:', result.error);
    error('==================\n');
    return null;
  }
};

