import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface DailyUserStats {
  user_id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  likes_given: number;
  comments_made: number;
  total_score: number; // likes + comments
  rank?: number;
}

export interface UserDailyStats {
  likes_given: number;
  comments_made: number;
  total_score: number;
  rank: number;
  total_users: number;
}

/**
 * Get the start and end of today in UTC
 */
const getTodayRange = () => {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return {
    start: startOfDay.toISOString(),
    end: endOfDay.toISOString(),
  };
};

/**
 * Get daily stats for a specific user (likes given and comments made today)
 */
export const getUserDailyStats = async (userId: string): Promise<UserDailyStats | null> => {
  try {
    const { start, end } = getTodayRange();

    // Get likes given today (from post_reactions table)
    const { count: likesGiven } = await supabase
      .from('post_reactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', start)
      .lte('created_at', end);

    // Fallback to post_likes if post_reactions doesn't exist or has no data
    let likesCount = likesGiven || 0;
    if (likesCount === 0) {
      const { count: legacyLikes } = await supabase
        .from('post_likes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', start)
        .lte('created_at', end);
      likesCount = legacyLikes || 0;
    }

    // Get comments made today (from post_comments table)
    const { count: commentsMade } = await supabase
      .from('post_comments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', start)
      .lte('created_at', end);

    const totalScore = (likesCount || 0) + (commentsMade || 0);

    // Get user's rank (how many users have a higher score)
    const leaderboard = await getDailyLeaderboard(1000); // Get top 1000 to calculate rank
    const userRank = leaderboard && Array.isArray(leaderboard) 
      ? leaderboard.findIndex(user => user.user_id === userId) + 1 
      : null;
    const totalUsers = leaderboard && Array.isArray(leaderboard) ? leaderboard.length : 0;

    return {
      likes_given: likesCount || 0,
      comments_made: commentsMade || 0,
      total_score: totalScore,
      rank: userRank || (totalUsers > 0 ? totalUsers + 1 : 1), // If not in top 1000, rank is beyond that
      total_users: totalUsers,
    };
  } catch (error) {
    error('[DailyScoreboard] Error getting user daily stats:', error);
    return null;
  }
};

/**
 * Get daily leaderboard (top users by likes + comments today)
 * @param limit - Number of users to return (default: 5)
 */
export const getDailyLeaderboard = async (limit: number = 5): Promise<DailyUserStats[]> => {
  try {
    const { start, end } = getTodayRange();

    // Get all users who have given likes or made comments today
    // We'll aggregate in JavaScript for now, but could be optimized with a database function
    
    // Get all likes given today (user_id only, no foreign key relationship)
    const { data: likesData, error: likesError } = await supabase
      .from('post_reactions')
      .select('user_id')
      .gte('created_at', start)
      .lte('created_at', end);

    // Fallback to post_likes if post_reactions doesn't exist
    let likes = likesData || [];
    if (likesError || !likesData || likesData.length === 0) {
      const { data: legacyLikes } = await supabase
        .from('post_likes')
        .select('user_id')
        .gte('created_at', start)
        .lte('created_at', end);
      likes = legacyLikes || [];
    }

    // Get all comments made today (user_id only, no foreign key relationship)
    const { data: commentsData, error: commentsError } = await supabase
      .from('post_comments')
      .select('user_id')
      .gte('created_at', start)
      .lte('created_at', end);

    if (commentsError) {
      error('[DailyScoreboard] Error fetching comments:', commentsError);
    }

    const comments = commentsData || [];
    
    // Get unique user IDs
    const userIds = new Set<string>();
    likes.forEach((like: any) => {
      if (like.user_id) userIds.add(like.user_id);
    });
    comments.forEach((comment: any) => {
      if (comment.user_id) userIds.add(comment.user_id);
    });
    
    // Fetch profiles for all users in one query
    let profilesMap = new Map<string, { username?: string; full_name?: string; avatar_url?: string }>();
    if (userIds.size > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', Array.from(userIds));
      
      if (profilesData) {
        profilesData.forEach((profile: any) => {
          profilesMap.set(profile.id, {
            username: profile.username,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
          });
        });
      }
    }

    // Aggregate stats by user
    const userStatsMap = new Map<string, DailyUserStats>();

    // Count likes given
    likes.forEach((like: any) => {
      const userId = like.user_id;
      if (!userId) return;
      
      if (!userStatsMap.has(userId)) {
        const profile = profilesMap.get(userId) || {};
        userStatsMap.set(userId, {
          user_id: userId,
          username: profile.username,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          likes_given: 0,
          comments_made: 0,
          total_score: 0,
        });
      }
      const stats = userStatsMap.get(userId)!;
      stats.likes_given++;
      stats.total_score++;
    });

    // Count comments made
    comments.forEach((comment: any) => {
      const userId = comment.user_id;
      if (!userId) return;
      
      if (!userStatsMap.has(userId)) {
        const profile = profilesMap.get(userId) || {};
        userStatsMap.set(userId, {
          user_id: userId,
          username: profile.username,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          likes_given: 0,
          comments_made: 0,
          total_score: 0,
        });
      }
      const stats = userStatsMap.get(userId)!;
      stats.comments_made++;
      stats.total_score++;
    });

    // Convert to array and sort by total score
    const leaderboard = Array.from(userStatsMap.values())
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, limit)
      .map((user, index) => ({
        ...user,
        rank: index + 1,
      }));

    return leaderboard;
  } catch (error) {
    error('[DailyScoreboard] Error getting daily leaderboard:', error);
    return [];
  }
};

/**
 * Get daily leaderboard using a more efficient database query
 * This version uses a database function for better performance
 */
export const getDailyLeaderboardOptimized = async (limit: number = 5): Promise<DailyUserStats[]> => {
  try {
    const { start, end } = getTodayRange();

    // Try to use a database function if it exists
    const { data, error } = await supabase.rpc('get_daily_leaderboard', {
      start_date: start,
      end_date: end,
      result_limit: limit,
    });

    if (!error && data) {
      return data.map((user: any, index: number) => ({
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        likes_given: user.likes_given || 0,
        comments_made: user.comments_made || 0,
        total_score: user.total_score || 0,
        rank: index + 1,
      }));
    }

    // Fallback to JavaScript aggregation if function doesn't exist
    log('[DailyScoreboard] Database function not available, using JavaScript aggregation');
    return await getDailyLeaderboard(limit);
  } catch (error) {
    error('[DailyScoreboard] Error getting optimized leaderboard:', error);
    // Fallback to JavaScript aggregation
    return await getDailyLeaderboard(limit);
  }
};
