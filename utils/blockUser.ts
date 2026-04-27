import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export async function blockUser(blockerId: string, blockedId: string): Promise<{ success: boolean; error?: string }> {
  try {
    log(`[BlockUser] Attempting to block user: ${blockerId} -> ${blockedId}`);
    
    if (!blockerId || !blockedId) {
      error('[BlockUser] Invalid user IDs provided');
      return { success: false, error: 'Invalid user IDs' };
    }

    if (blockerId === blockedId) {
      error('[BlockUser] Cannot block yourself');
      return { success: false, error: 'Cannot block yourself' };
    }

    // First, verify table access
    const { error: accessError } = await supabase
      .from('blocked_users')
      .select('id')
      .limit(1);

    if (accessError) {
      error('[BlockUser] Cannot access blocked_users table:', accessError);
      if (accessError.code === '42P01') {
        return { 
          success: false, 
          error: 'Database table does not exist. Please run the migration: supabase/migrations/add_blocking_system.sql' 
        };
      }
      return { success: false, error: `Database error: ${accessError.message}` };
    }

    const { data: existing } = await supabase
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .maybeSingle();

    if (existing) {
      log('[BlockUser] User is already blocked');
      return { success: true };
    }

    const { data, error } = await supabase
      .from('blocked_users')
      .insert({
        blocker_id: blockerId,
        blocked_id: blockedId,
      })
      .select();

    if (error) {
      error('[BlockUser] Error blocking user:', error);
      error('[BlockUser] Error details:', JSON.stringify(error, null, 2));
      error('[BlockUser] Error code:', error.code);
      error('[BlockUser] Error hint:', error.hint);
      return { success: false, error: error.message || 'Failed to block user' };
    }

    log('[BlockUser] Successfully blocked user, data:', data);
    return { success: true };
  } catch (error: any) {
    error('[BlockUser] Exception blocking user:', error);
    return { success: false, error: error?.message || 'Failed to block user' };
  }
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<{ success: boolean; error?: string }> {
  try {
    log(`[BlockUser] Attempting to unblock user: ${blockerId} -> ${blockedId}`);
    
    if (!blockerId || !blockedId) {
      error('[BlockUser] Invalid user IDs provided');
      return { success: false, error: 'Invalid user IDs' };
    }

    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);

    if (error) {
      error('[BlockUser] Error unblocking user:', error);
      return { success: false, error: error.message };
    }

    log('[BlockUser] Successfully unblocked user');
    return { success: true };
  } catch (error: any) {
    error('[BlockUser] Exception unblocking user:', error);
    return { success: false, error: error?.message || 'Failed to unblock user' };
  }
}

// Helper function to validate UUID format
const isValidUUID = (id: string | undefined | null): boolean => {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export async function isUserBlocked(userId1: string, userId2: string): Promise<boolean> {
  try {
    if (!userId1 || !userId2) {
      return false;
    }

    // Validate UUIDs before querying
    if (!isValidUUID(userId1) || !isValidUUID(userId2)) {
      warn(`[BlockUser] Invalid UUID format - userId1: ${userId1}, userId2: ${userId2}`);
      return false;
    }

    log(`[BlockUser] Checking if users are blocked: ${userId1} <-> ${userId2}`);

    const { data, error } = await supabase
      .from('blocked_users')
      .select('id')
      .or(`and(blocker_id.eq.${userId1},blocked_id.eq.${userId2}),and(blocker_id.eq.${userId2},blocked_id.eq.${userId1})`);

    if (error) {
      error('[BlockUser] Error checking block status:', error);
      return false;
    }

    const isBlocked = (data && data.length > 0) || false;
    log(`[BlockUser] Block status result: ${isBlocked}`);
    return isBlocked;
  } catch (error) {
    error('[BlockUser] Exception checking block status:', error);
    return false;
  }
}

export async function hasUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  try {
    if (!blockerId || !blockedId) {
      return false;
    }

    log(`[BlockUser] Checking if ${blockerId} has blocked ${blockedId}`);

    const { data, error } = await supabase
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .maybeSingle();

    if (error) {
      error('[BlockUser] Error checking has blocked:', error);
      return false;
    }

    const hasBlocked = !!data;
    log(`[BlockUser] Has blocked result: ${hasBlocked}`);
    return hasBlocked;
  } catch (error) {
    error('[BlockUser] Exception checking has blocked:', error);
    return false;
  }
}

export async function getBlockedUserIds(userId: string): Promise<string[]> {
  try {
    if (!userId) {
      return [];
    }

    log(`[BlockUser] Getting blocked user IDs for: ${userId}`);

    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

    if (error) {
      error('[BlockUser] Error getting blocked user IDs:', error);
      return [];
    }

    if (!data) {
      return [];
    }

    const blockedIds = new Set<string>();
    data.forEach((row) => {
      if (row.blocker_id === userId) {
        // Current user blocked someone
        blockedIds.add(row.blocked_id);
        log(`[BlockUser] User ${userId} blocked ${row.blocked_id}`);
      } else {
        // Someone blocked current user (bidirectional)
        blockedIds.add(row.blocker_id);
        log(`[BlockUser] User ${row.blocker_id} blocked ${userId} (bidirectional)`);
      }
    });

    const result = Array.from(blockedIds);
    log(`[BlockUser] Found ${result.length} blocked user IDs for ${userId}:`, result);
    return result;
  } catch (error) {
    error('[BlockUser] Exception getting blocked user IDs:', error);
    return [];
  }
}

export async function getBlockedUsers(userId: string): Promise<any[]> {
  try {
    if (!userId) {
      return [];
    }

    log(`[BlockUser] Getting blocked users for: ${userId}`);

    const { data, error } = await supabase
      .from('blocked_users')
      .select(`
        blocked_id,
        profiles:blocked_id (
          id,
          username,
          full_name,
          avatar_url,
          bio
        )
      `)
      .eq('blocker_id', userId);

    if (error) {
      error('[BlockUser] Error getting blocked users:', error);
      return [];
    }

    if (!data) {
      return [];
    }

    const profiles = data
      .map((row: any) => row.profiles)
      .filter((profile: any) => profile !== null);
    
    log(`[BlockUser] Found ${profiles.length} blocked users`);
    return profiles;
  } catch (error) {
    error('[BlockUser] Exception getting blocked users:', error);
    return [];
  }
}
