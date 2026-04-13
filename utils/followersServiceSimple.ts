import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface FollowerUser {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  is_verified: boolean;
  followed_at: string;
}

export interface FollowCounts {
  followers_count: number;
  following_count: number;
}

/**
 * Follow a user (simplified version without FCM)
 */
export const followUser = async (followingId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      error('User not authenticated');
      return false;
    }

    log(`[Follow] Following user ${followingId} as ${user.id}`);

    // Use a more robust approach with error handling
    const { data, error } = await supabase
      .from('user_followers')
      .insert({
        follower_id: user.id,
        following_id: followingId
      })
      .select();

    if (error) {
      // If it's a duplicate key error, that means they're already following
      if (error.code === '23505') {
        log(`[Follow] Already following user ${followingId}`);
        return true;
      }
      error('Error following user:', error);
      return false;
    }

    log(`[Follow] Successfully followed user ${followingId}`);
    return true;
  } catch (error) {
    error('Error in followUser:', error);
    return false;
  }
};

/**
 * Unfollow a user (simplified version without FCM)
 */
export const unfollowUser = async (followingId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      error('User not authenticated');
      return false;
    }

    log(`[Unfollow] Unfollowing user ${followingId} as ${user.id}`);

    // Use a more robust approach with error handling
    const { data, error } = await supabase
      .from('user_followers')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', followingId)
      .select();

    if (error) {
      error('Error unfollowing user:', error);
      return false;
    }

    // If no rows were deleted, they weren't following in the first place
    if (!data || data.length === 0) {
      log(`[Unfollow] User ${followingId} was not being followed`);
      return true; // Still return true since the desired state is achieved
    }

    log(`[Unfollow] Successfully unfollowed user ${followingId}`);
    return true;
  } catch (error) {
    error('Error in unfollowUser:', error);
    return false;
  }
};

/**
 * Check if current user follows a specific user
 */
export const isFollowing = async (followingId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }

    const { data, error } = await supabase
      .from('user_followers')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', followingId)
      .single();

    if (error) {
      // Not following if error (likely no record found)
      return false;
    }

    return !!data;
  } catch (error) {
    error('Error in isFollowing:', error);
    return false;
  }
};

/**
 * Get followers for a user
 */
export const getUserFollowers = async (userId: string): Promise<FollowerUser[]> => {
  try {
    const { data, error } = await supabase
      .from('user_followers')
      .select(`
        created_at,
        profiles!user_followers_follower_id_fkey (
          id,
          username,
          full_name,
          avatar_url,
          is_verified
        )
      `)
      .eq('following_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      error('Error getting followers:', error);
      return [];
    }

    return (data || []).map(item => ({
      id: item.profiles.id,
      username: item.profiles.username,
      full_name: item.profiles.full_name,
      avatar_url: item.profiles.avatar_url,
      is_verified: item.profiles.is_verified,
      followed_at: item.created_at
    }));
  } catch (error) {
    error('Error in getUserFollowers:', error);
    return [];
  }
};

/**
 * Get users that a user is following
 */
export const getUserFollowing = async (userId: string): Promise<FollowerUser[]> => {
  try {
    const { data, error } = await supabase
      .from('user_followers')
      .select(`
        created_at,
        profiles!user_followers_following_id_fkey (
          id,
          username,
          full_name,
          avatar_url,
          is_verified
        )
      `)
      .eq('follower_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      error('Error getting following:', error);
      return [];
    }

    return (data || []).map(item => ({
      id: item.profiles.id,
      username: item.profiles.username,
      full_name: item.profiles.full_name,
      avatar_url: item.profiles.avatar_url,
      is_verified: item.profiles.is_verified,
      followed_at: item.created_at
    }));
  } catch (error) {
    error('Error in getUserFollowing:', error);
    return [];
  }
};

/**
 * Get follower counts for a user
 */
export const getFollowCounts = async (userId: string): Promise<FollowCounts> => {
  try {
    // Guard: Supabase `user_followers` columns are UUIDs. Avoid querying with invalid IDs.
    // This prevents `22P02 invalid input syntax for type uuid` crashes when a route param
    // like "placeholder" is passed in.
    const isUuid =
      typeof userId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);

    // Check if this is a placeholder user - return placeholder counts
    if (userId.startsWith('placeholder-user-')) {
      const { generatePlaceholderProfile } = await import('./placeholderProfile');
      const placeholderProfile = generatePlaceholderProfile(userId);
      if (placeholderProfile) {
        return {
          followers_count: placeholderProfile.followers_count,
          following_count: placeholderProfile.following_count,
        };
      }
    }

    if (!isUuid) {
      return { followers_count: 0, following_count: 0 };
    }
    
    // Read counters from profile row first.
    const { data, error: profileErr } = await supabase
      .from('profiles')
      .select('followers_count, following_count')
      .eq('id', userId)
      .maybeSingle();

    // Also attempt direct relationship counts (can be RLS-limited for visitors).
    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from('user_followers')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', userId),
      supabase
        .from('user_followers')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', userId),
    ]);

    // Choose the highest value from available sources.
    // This prevents non-owner RLS-restricted 0/1 counts from overriding real totals.
    const profileFollowers = Number((data as any)?.followers_count ?? 0);
    const profileFollowing = Number((data as any)?.following_count ?? 0);
    const relationFollowers = Number(followersRes.count ?? 0);
    const relationFollowing = Number(followingRes.count ?? 0);
    const followers = Math.max(profileFollowers, relationFollowers);
    const following = Math.max(profileFollowing, relationFollowing);

    // Auto-heal stale profile counters when owner is viewing self:
    // viewers often rely on profiles.followers_count/following_count, while owners
    // may see higher live counts from user_followers.
    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id;
      const relationCountsReliable = !followersRes.error && !followingRes.error;
      const profileStale =
        relationCountsReliable &&
        (relationFollowers !== profileFollowers || relationFollowing !== profileFollowing);

      if (authUserId === userId && profileStale) {
        await supabase
          .from('profiles')
          .update({
            followers_count: relationFollowers,
            following_count: relationFollowing,
          })
          .eq('id', userId);
      }
    } catch {
      // best-effort repair only
    }

    if (profileErr && (profileErr as any)?.code !== 'PGRST116') {
      error('Error getting follow counts from profiles:', profileErr);
    }
    if (followersRes.error) {
      error('Error getting followers count from user_followers:', followersRes.error);
    }
    if (followingRes.error) {
      error('Error getting following count from user_followers:', followingRes.error);
    }

    return {
      followers_count: followers,
      following_count: following,
    };
  } catch (error) {
    error('Error in getFollowCounts:', error);
    return { followers_count: 0, following_count: 0 };
  }
};

/**
 * Real-time subscription for follower updates (simplified)
 */
export const subscribeToFollowerUpdates = (
  userId: string,
  onFollowerChange: (event: 'INSERT' | 'DELETE', follower: any) => void
) => {
  const subscription = supabase
    .channel(`followers:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_followers',
        filter: `following_id=eq.${userId}`
      },
      (payload) => {
        onFollowerChange(payload.eventType as 'INSERT' | 'DELETE', payload.new || payload.old);
      }
    )
    .subscribe();

  return subscription;
};
