import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Simple follow function that definitely works
 */
export const followUser = async (followingId: string): Promise<boolean> => {
  try {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      error('[Follow] Authentication error:', authError);
      return false;
    }

    // Allow following placeholder users - track in AsyncStorage (no database)
    if (followingId.startsWith('placeholder-user-')) {
      log(`[Follow] Following placeholder user ${followingId} - allowing (local only)`);
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const followKey = `placeholder_follow_${user.id}_${followingId}`;
        await AsyncStorage.setItem(followKey, 'true');
        // Clear cache
        clearFollowCache(user.id, followingId);
      } catch (error) {
        log('[Follow] Error saving placeholder follow status:', error);
      }
      return true; // Return true to indicate success (optimistic UI)
    }

    log(`[Follow] Attempting to follow ${followingId} as ${user.id}`);

    // Simple insert with duplicate handling
    const { error: insertError } = await supabase
      .from('user_followers')
      .insert([{
        follower_id: user.id,
        following_id: followingId
      }]);

    if (insertError) {
      // If duplicate key, user is already following
      if (insertError.code === '23505') {
        log('[Follow] Already following this user');
        return true;
      }
      error('[Follow] Insert error:', insertError);
      return false;
    }

    log('[Follow] Successfully followed user');
    
    // Clear cache for this relationship
    clearFollowCache(user.id, followingId);
    
    return true;

  } catch (error) {
    error('[Follow] Unexpected error:', error);
    return false;
  }
};

/**
 * Simple unfollow function that definitely works
 */
export const unfollowUser = async (followingId: string): Promise<boolean> => {
  try {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      error('[Unfollow] Authentication error:', authError);
      return false;
    }

    // Allow unfollowing placeholder users - remove from AsyncStorage (no database)
    if (followingId.startsWith('placeholder-user-')) {
      log(`[Unfollow] Unfollowing placeholder user ${followingId} - allowing (local only)`);
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const followKey = `placeholder_follow_${user.id}_${followingId}`;
        await AsyncStorage.removeItem(followKey);
        // Clear cache
        clearFollowCache(user.id, followingId);
      } catch (error) {
        log('[Unfollow] Error removing placeholder follow status:', error);
      }
      return true; // Return true to indicate success (optimistic UI)
    }

    log(`[Unfollow] Attempting to unfollow ${followingId} as ${user.id}`);

    // Simple delete
    const { error: deleteError } = await supabase
      .from('user_followers')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', followingId);

    if (deleteError) {
      error('[Unfollow] Delete error:', deleteError);
      return false;
    }

    log('[Unfollow] Successfully unfollowed user');
    
    // Clear cache for this relationship
    clearFollowCache(user.id, followingId);
    
    return true;

  } catch (error) {
    error('[Unfollow] Unexpected error:', error);
    return false;
  }
};

// Cache for follow status to prevent repeated API calls
const followStatusCache = new Map<string, { status: boolean; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

/**
 * Check if following a user with caching
 */
export const isFollowing = async (followingId: string, currentUserId?: string): Promise<boolean> => {
  try {
    let userId = currentUserId;
    
    // Only make auth call if userId not provided
    if (!userId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return false;
      }
      userId = user.id;
    }

    // For placeholder users, check AsyncStorage for follow status
    if (followingId.startsWith('placeholder-user-')) {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const followKey = `placeholder_follow_${userId}_${followingId}`;
        const followStatus = await AsyncStorage.getItem(followKey);
        return followStatus === 'true';
      } catch (error) {
        log('[IsFollowing] Error checking placeholder follow status:', error);
        return false;
      }
    }

    // Check cache first
    const cacheKey = `${userId}_${followingId}`;
    const cached = followStatusCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.status;
    }

    // Check if relationship exists
    const { data, error } = await supabase
      .from('user_followers')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', followingId)
      .maybeSingle();

    if (error) {
      error('[IsFollowing] Error:', error);
      return false;
    }

    const isFollowingResult = !!data;
    
    // Cache the result
    followStatusCache.set(cacheKey, {
      status: isFollowingResult,
      timestamp: now
    });

    return isFollowingResult;

  } catch (error) {
    error('[IsFollowing] Unexpected error:', error);
    return false;
  }
};

/**
 * Clear follow status cache for a specific user relationship
 */
export const clearFollowCache = (followerId: string, followingId: string) => {
  const cacheKey = `${followerId}_${followingId}`;
  followStatusCache.delete(cacheKey);
};

/**
 * Clear all follow status cache
 */
export const clearAllFollowCache = () => {
  followStatusCache.clear();
};

/**
 * Batch check follow status for multiple users - much more efficient
 */
export const batchCheckFollowStatus = async (userIds: string[], currentUserId: string): Promise<Record<string, boolean>> => {
  try {
    if (!userIds.length || !currentUserId) {
      return {};
    }

    // Check cache first for all users
    const result: Record<string, boolean> = {};
    const uncachedUserIds: string[] = [];
    const now = Date.now();

    for (const userId of userIds) {
      const cacheKey = `${currentUserId}_${userId}`;
      const cached = followStatusCache.get(cacheKey);
      
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        result[userId] = cached.status;
      } else {
        uncachedUserIds.push(userId);
      }
    }

    // If all users are cached, return early
    if (uncachedUserIds.length === 0) {
      return result;
    }

    // Batch query for uncached users
    const { data, error } = await supabase
      .from('user_followers')
      .select('following_id')
      .eq('follower_id', currentUserId)
      .in('following_id', uncachedUserIds);

    if (error) {
      error('[BatchFollowCheck] Error:', error);
      // Return cached results if any
      return result;
    }

    // Process results
    const followingSet = new Set(data?.map(item => item.following_id) || []);
    
    for (const userId of uncachedUserIds) {
      const isFollowing = followingSet.has(userId);
      result[userId] = isFollowing;
      
      // Cache the result
      const cacheKey = `${currentUserId}_${userId}`;
      followStatusCache.set(cacheKey, {
        status: isFollowing,
        timestamp: now
      });
    }

    return result;
  } catch (error) {
    error('[BatchFollowCheck] Unexpected error:', error);
    return {};
  }
};
