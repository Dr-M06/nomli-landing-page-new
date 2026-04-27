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
 * Follow a user
 */
export const followUser = async (followingId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { error } = await supabase
      .from('user_followers')
      .insert({
        follower_id: user.id,
        following_id: followingId
      });

    if (error) {
      error('Error following user:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('Error in followUser:', error);
    return false;
  }
};

/**
 * Unfollow a user
 */
export const unfollowUser = async (followingId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { error } = await supabase
      .from('user_followers')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', followingId);

    if (error) {
      error('Error unfollowing user:', error);
      return false;
    }

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
      .rpc('is_following', {
        follower_id: user.id,
        following_id: followingId
      });

    if (error) {
      error('Error checking follow status:', error);
      return false;
    }

    return data || false;
  } catch (error) {
    error('Error in isFollowing:', error);
    return false;
  }
};

/**
 * True if A follows B and B follows A.
 * (Used for anti-dating guardrails: no cold DMs.)
 */
export const isMutualFollowing = async (otherUserId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return false;

    // Fast path: query both directions in parallel
    const [aFollowsB, bFollowsA] = await Promise.all([
      supabase
        .from('user_followers')
        .select('follower_id', { count: 'exact', head: true })
        .eq('follower_id', user.id)
        .eq('following_id', otherUserId),
      supabase
        .from('user_followers')
        .select('follower_id', { count: 'exact', head: true })
        .eq('follower_id', otherUserId)
        .eq('following_id', user.id),
    ]);

    if (aFollowsB.error) {
      error('[Followers] Error checking mutual (a->b):', aFollowsB.error);
      return false;
    }
    if (bFollowsA.error) {
      error('[Followers] Error checking mutual (b->a):', bFollowsA.error);
      return false;
    }

    return (aFollowsB.count ?? 0) > 0 && (bFollowsA.count ?? 0) > 0;
  } catch (e) {
    error('[Followers] Error in isMutualFollowing:', e);
    return false;
  }
};

/**
 * Get followers for a user
 */
export const getUserFollowers = async (userId: string): Promise<FollowerUser[]> => {
  try {
    const { data, error } = await supabase
      .rpc('get_user_followers', { user_id: userId });

    if (error) {
      error('Error getting followers:', error);
      return [];
    }

    return data || [];
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
      .rpc('get_user_following', { user_id: userId });

    if (error) {
      error('Error getting following:', error);
      return [];
    }

    return data || [];
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
    
    const { data, error } = await supabase
      .from('profiles')
      .select('followers_count, following_count')
      .eq('id', userId)
      .single();

    if (error) {
      // PGRST116 means no rows found - user doesn't exist, return default counts silently
      if (error.code === 'PGRST116') {
        return { followers_count: 0, following_count: 0 };
      }
      // Only log non-404 errors
      error('Error getting follow counts:', error);
      return { followers_count: 0, following_count: 0 };
    }

    return {
      followers_count: data.followers_count || 0,
      following_count: data.following_count || 0
    };
  } catch (error) {
    error('Error in getFollowCounts:', error);
    return { followers_count: 0, following_count: 0 };
  }
};

/**
 * Get mutual followers between two users
 */
export const getMutualFollowers = async (userAId: string, userBId: string): Promise<FollowerUser[]> => {
  try {
    const { data, error } = await supabase
      .rpc('get_mutual_followers', { 
        user_a: userAId, 
        user_b: userBId 
      });

    if (error) {
      error('Error getting mutual followers:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('Error in getMutualFollowers:', error);
    return [];
  }
};

/**
 * Get follow suggestions based on mutual connections
 */
export const getFollowSuggestions = async (limit: number = 10): Promise<FollowerUser[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return [];
    }

    // Get users that current user's followers are following, but current user isn't following
    const { data, error } = await supabase
      .from('user_followers')
      .select(`
        following_id,
        profiles!user_followers_following_id_fkey (
          id,
          username,
          full_name,
          avatar_url,
          is_verified,
          followers_count
        )
      `)
      .in('follower_id', 
        // Subquery to get who current user follows
        supabase
          .from('user_followers')
          .select('following_id')
          .eq('follower_id', user.id)
      )
      .not('following_id', 'eq', user.id) // Don't suggest self
      .not('following_id', 'in', 
        // Subquery to exclude users already followed
        supabase
          .from('user_followers')
          .select('following_id')
          .eq('follower_id', user.id)
      )
      .order('profiles(followers_count)', { ascending: false })
      .limit(limit);

    if (error) {
      error('Error getting follow suggestions:', error);
      return [];
    }

    // Transform the data to match FollowerUser interface
    return (data || []).map(item => ({
      id: item.profiles.id,
      username: item.profiles.username,
      full_name: item.profiles.full_name,
      avatar_url: item.profiles.avatar_url,
      is_verified: item.profiles.is_verified,
      followed_at: new Date().toISOString() // Not applicable for suggestions
    }));
  } catch (error) {
    error('Error in getFollowSuggestions:', error);
    return [];
  }
};

/**
 * Real-time subscription for follower updates
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
