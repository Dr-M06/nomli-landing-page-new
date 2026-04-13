import { supabase } from './supabase';
import { isUserAdmin } from './adminCheck';
import { log, warn, error } from './productionLogger';


/**
 * Find user ID by email address
 * Uses RPC function if available, otherwise tries direct query
 * @param email The email address to search for
 * @returns Promise with user ID or null if not found
 */
export const findUserIdByEmail = async (email: string): Promise<{ userId: string | null; username?: string; error?: string }> => {
  try {
    // Get current user to pass as admin_user_id
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { userId: null, error: 'You must be logged in to search users' };
    }

    // Try RPC function first (if available)
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('find_user_by_email', {
        user_email: email.toLowerCase(),
        admin_user_id: user.id
      });

      if (!rpcError && rpcResult) {
        // Check if result indicates success
        if (rpcResult.success === false) {
          return { userId: null, error: rpcResult.error || 'User not found' };
        }
        
        return {
          userId: rpcResult.user_id,
          username: rpcResult.username
        };
      }
      
      if (rpcError) {
        error('[UserVerification] RPC error:', rpcError);
        // Continue to fallback methods
      }
    } catch (rpcException: any) {
      log('[UserVerification] RPC function error:', rpcException.message);
      // Continue to fallback methods
    }

    // Fallback: Try to get user from auth (if admin access available)
    try {
      // This requires admin privileges - might fail for regular users
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (!authError && user) {
        // Check if current user is admin before trying admin functions
        const isAdmin = await isUserAdmin(user.id);
        
        if (isAdmin) {
          // Try admin list users (might not be available in client SDK)
          // For now, we'll use a different approach
        }
      }
    } catch (authException) {
      log('[UserVerification] Admin auth check failed');
    }

    // Final fallback: Search profiles by username (email prefix)
    // This is not ideal but works if email matches username pattern
    const emailPrefix = email.split('@')[0];
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', emailPrefix)
      .limit(5); // Get multiple matches
    
    if (!profileError && profiles && profiles.length > 0) {
      // If only one match, return it
      if (profiles.length === 1) {
        return { userId: profiles[0].id, username: profiles[0].username };
      }
      // Multiple matches - return first one with a note
      warn('[UserVerification] Multiple users found with similar username, using first match');
      return { userId: profiles[0].id, username: profiles[0].username };
    }
    
    return { userId: null, error: 'User not found with this email. Make sure the email is correct and the user has created a profile.' };
  } catch (error: any) {
    error('[UserVerification] Exception finding user by email:', error);
    return { userId: null, error: error.message || 'Failed to find user' };
  }
};

/**
 * Verify a user by email address (admin only)
 * @param email The email address of the user to verify
 * @returns Promise with success status and message
 */
export const verifyUserByEmail = async (email: string): Promise<{ success: boolean; error?: string; message?: string; userId?: string }> => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in to verify users' };
    }

    const isAdmin = await isUserAdmin(user.id);
    if (!isAdmin) {
      return { success: false, error: 'Only admins can verify users' };
    }

    // Find user by email
    const { userId, username, error: findError } = await findUserIdByEmail(email);
    
    if (findError || !userId) {
      return { success: false, error: findError || 'User not found with this email address' };
    }

    // Verify the user
    const result = await verifyUser(userId);
    
    if (result.success) {
      return { 
        success: true, 
        message: `User ${username || email} has been verified successfully`,
        userId 
      };
    }
    
    return result;
  } catch (error: any) {
    error('[UserVerification] Exception verifying user by email:', error);
    return { success: false, error: error.message || 'Failed to verify user' };
  }
};

/**
 * Unverify a user by email address (admin only)
 * @param email The email address of the user to unverify
 * @returns Promise with success status and message
 */
export const unverifyUserByEmail = async (email: string): Promise<{ success: boolean; error?: string; message?: string; userId?: string }> => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in to unverify users' };
    }

    const isAdmin = await isUserAdmin(user.id);
    if (!isAdmin) {
      return { success: false, error: 'Only admins can unverify users' };
    }

    // Find user by email
    const { userId, username, error: findError } = await findUserIdByEmail(email);
    
    if (findError || !userId) {
      return { success: false, error: findError || 'User not found with this email address' };
    }

    // Unverify the user
    const result = await unverifyUser(userId);
    
    if (result.success) {
      return { 
        success: true, 
        message: `User ${username || email} has been unverified successfully`,
        userId 
      };
    }
    
    return result;
  } catch (error: any) {
    error('[UserVerification] Exception unverifying user by email:', error);
    return { success: false, error: error.message || 'Failed to unverify user' };
  }
};

/**
 * Verify a user (admin only)
 * @param userId The user ID to verify
 * @returns Promise with success status and message
 */
export const verifyUser = async (userId: string): Promise<{ success: boolean; error?: string; message?: string }> => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in to verify users' };
    }

    const isAdmin = await isUserAdmin(user.id);
    if (!isAdmin) {
      return { success: false, error: 'Only admins can verify users' };
    }

    // Call RPC function to verify user
    const { data, error } = await supabase.rpc('verify_user', {
      target_user_id: userId,
      verified_by_user_id: user.id,
    });

    if (error) {
      error('[UserVerification] Error verifying user:', error);
      return { success: false, error: error.message || 'Failed to verify user' };
    }

    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success === false) {
        return { success: false, error: (data as any).error || 'Failed to verify user' };
      }
      return { 
        success: true, 
        message: (data as any).message || 'User verified successfully' 
      };
    }

    return { success: true, message: 'User verified successfully' };
  } catch (error: any) {
    error('[UserVerification] Exception verifying user:', error);
    return { success: false, error: error.message || 'Failed to verify user' };
  }
};

/**
 * Unverify a user (admin only)
 * @param userId The user ID to unverify
 * @returns Promise with success status and message
 */
export const unverifyUser = async (userId: string): Promise<{ success: boolean; error?: string; message?: string }> => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in to unverify users' };
    }

    const isAdmin = await isUserAdmin(user.id);
    if (!isAdmin) {
      return { success: false, error: 'Only admins can unverify users' };
    }

    // Call RPC function to unverify user
    const { data, error } = await supabase.rpc('unverify_user', {
      target_user_id: userId,
      verified_by_user_id: user.id,
    });

    if (error) {
      error('[UserVerification] Error unverifying user:', error);
      return { success: false, error: error.message || 'Failed to unverify user' };
    }

    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success === false) {
        return { success: false, error: (data as any).error || 'Failed to unverify user' };
      }
      return { 
        success: true, 
        message: (data as any).message || 'User unverified successfully' 
      };
    }

    return { success: true, message: 'User unverified successfully' };
  } catch (error: any) {
    error('[UserVerification] Exception unverifying user:', error);
    return { success: false, error: error.message || 'Failed to unverify user' };
  }
};

/**
 * Verify a user by username (admin only)
 * @param username The username to verify
 * @returns Promise with success status and message
 */
export const verifyUserByUsername = async (username: string): Promise<{ success: boolean; error?: string; message?: string }> => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in to verify users' };
    }

    const isAdmin = await isUserAdmin(user.id);
    if (!isAdmin) {
      return { success: false, error: 'Only admins can verify users' };
    }

    // Call RPC function to verify user by username
    const { data, error } = await supabase.rpc('verify_user_by_username', {
      target_username: username,
      verified_by_user_id: user.id,
    });

    if (error) {
      error('[UserVerification] Error verifying user by username:', error);
      return { success: false, error: error.message || 'Failed to verify user' };
    }

    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success === false) {
        return { success: false, error: (data as any).error || 'Failed to verify user' };
      }
      return { 
        success: true, 
        message: (data as any).message || 'User verified successfully' 
      };
    }

    return { success: true, message: 'User verified successfully' };
  } catch (error: any) {
    error('[UserVerification] Exception verifying user by username:', error);
    return { success: false, error: error.message || 'Failed to verify user' };
  }
};

/**
 * Unverify a user by username (admin only)
 * @param username The username to unverify
 * @returns Promise with success status and message
 */
export const unverifyUserByUsername = async (username: string): Promise<{ success: boolean; error?: string; message?: string }> => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in to unverify users' };
    }

    const isAdmin = await isUserAdmin(user.id);
    if (!isAdmin) {
      return { success: false, error: 'Only admins can unverify users' };
    }

    // Call RPC function to unverify user by username
    const { data, error } = await supabase.rpc('unverify_user_by_username', {
      target_username: username,
      verified_by_user_id: user.id,
    });

    if (error) {
      error('[UserVerification] Error unverifying user by username:', error);
      return { success: false, error: error.message || 'Failed to unverify user' };
    }

    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success === false) {
        return { success: false, error: (data as any).error || 'Failed to unverify user' };
      }
      return { 
        success: true, 
        message: (data as any).message || 'User unverified successfully' 
      };
    }

    return { success: true, message: 'User unverified successfully' };
  } catch (error: any) {
    error('[UserVerification] Exception unverifying user by username:', error);
    return { success: false, error: error.message || 'Failed to unverify user' };
  }
};

/**
 * Get list of verified users (admin only)
 * @param limit Number of users to return (default: 100)
 * @param offset Offset for pagination (default: 0)
 * @returns Promise with list of verified users
 */
export const getVerifiedUsers = async (limit: number = 100, offset: number = 0): Promise<{ 
  success: boolean; 
  users?: any[]; 
  count?: number; 
  error?: string 
}> => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in to view verified users' };
    }

    const isAdmin = await isUserAdmin(user.id);
    if (!isAdmin) {
      return { success: false, error: 'Only admins can view verified users list' };
    }

    // Call RPC function to get verified users
    const { data, error } = await supabase.rpc('get_verified_users', {
      admin_user_id: user.id,
      limit_count: limit,
      offset_count: offset,
    });

    if (error) {
      error('[UserVerification] Error getting verified users:', error);
      return { success: false, error: error.message || 'Failed to get verified users' };
    }

    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success === false) {
        return { success: false, error: (data as any).error || 'Failed to get verified users' };
      }
      return { 
        success: true, 
        users: (data as any).users || [],
        count: (data as any).count || 0
      };
    }

    return { success: false, error: 'Invalid response from server' };
  } catch (error: any) {
    error('[UserVerification] Exception getting verified users:', error);
    return { success: false, error: error.message || 'Failed to get verified users' };
  }
};

/**
 * Direct database update (fallback if RPC functions don't exist)
 * Only use this if RPC functions are not available
 * @param userId The user ID to verify
 * @param verified Whether to verify (true) or unverify (false)
 * @returns Promise with success status
 */
export const updateUserVerificationStatus = async (
  userId: string, 
  verified: boolean
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in' };
    }

    const isAdmin = await isUserAdmin(user.id);
    if (!isAdmin) {
      return { success: false, error: 'Only admins can update verification status' };
    }

    // Direct update (requires RLS to allow admins)
    const { error } = await supabase
      .from('profiles')
      .update({ 
        is_verified: verified,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      error('[UserVerification] Error updating verification status:', error);
      return { success: false, error: error.message || 'Failed to update verification status' };
    }

    return { success: true };
  } catch (error: any) {
    error('[UserVerification] Exception updating verification status:', error);
    return { success: false, error: error.message || 'Failed to update verification status' };
  }
};

