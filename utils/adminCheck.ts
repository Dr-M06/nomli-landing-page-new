import { supabase } from './supabase';
import { log, error } from './productionLogger';

/**
 * Check if the current user is an admin.
 * Used for livestream admin close, event image upload, etc.
 * @param userId The user ID to check (optional; if omitted returns false)
 * @returns Promise<boolean> - true if user is an admin
 */
export const isUserAdmin = async (userId?: string): Promise<boolean> => {
  if (!userId) return false;
  try {
    // First try using the is_admin RPC function if it exists
    try {
      const { data, error: rpcError } = await supabase.rpc('is_admin', {
        user_id: userId,
      });

      if (!rpcError && data !== null && data !== undefined) {
        return data === true;
      }
    } catch (rpcError) {
      log('[AdminCheck] RPC not available, using direct query');
    }

    // Fallback: Direct query to profiles table
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (queryError) {
      error('[AdminCheck] Error checking admin status:', queryError);
      return false;
    }

    return data?.is_admin === true;
  } catch (err) {
    error('[AdminCheck] Exception checking admin status:', err);
    return false;
  }
};
