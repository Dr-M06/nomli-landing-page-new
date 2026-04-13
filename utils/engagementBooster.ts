/**
 * 🚀 ENGAGEMENT BOOSTER - Boost Likes & Views Using Placeholder Accounts
 * 
 * Automatically boosts engagement on real user posts using placeholder accounts.
 * Makes the app look more active and helps new users get initial engagement.
 * 
 * Features:
 * - Adds realistic likes from placeholder accounts
 * - Adds views for video posts
 * - Natural distribution (not all accounts like everything)
 * - Respects existing engagement (doesn't duplicate)
 */

import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


// Placeholder user IDs (these are the demo accounts)
// Note: These should be actual UUIDs from profiles table, not strings
// For now, we'll use a deterministic approach to generate consistent "virtual" user IDs
// that can be used for boosting. In production, you may want to create actual placeholder
// user profiles in the database.
const PLACEHOLDER_USER_IDS = [
  'placeholder-user-0',
  'placeholder-user-1',
  'placeholder-user-2',
  'placeholder-user-3',
  'placeholder-user-4',
  'placeholder-user-5',
  'placeholder-user-6',
  'placeholder-user-7',
  'placeholder-user-8',
  'placeholder-user-9',
];

/**
 * Get placeholder user IDs from database
 * These should be actual user profiles created via migration
 */
const getPlaceholderUserIds = async (): Promise<string[]> => {
  // Fetch actual placeholder user profiles from database
  const { data: placeholderProfiles, error } = await supabase
    .from('profiles')
    .select('id')
    .in('username', [
      'alexmartinez',
      'sarahjones',
      'mikechen',
      'emilywilson',
      'jamestaylor',
      'lisabrown',
      'davidlee',
      'amandagarcia',
      'chrisanderson',
      'jessicamoore',
    ])
    .limit(10);

  if (error) {
    error('[ENGAGEMENT_BOOSTER] Error fetching placeholder profiles:', error);
  }

  if (placeholderProfiles && placeholderProfiles.length > 0) {
    const ids = placeholderProfiles.map(p => p.id);
    log(`[ENGAGEMENT_BOOSTER] Found ${ids.length} placeholder user profiles`);
    return ids;
  }

  // Fallback: log warning and return empty array (boosting will be skipped)
  warn('[ENGAGEMENT_BOOSTER] ⚠️ No placeholder user profiles found. Please run the migration to create them.');
  warn('[ENGAGEMENT_BOOSTER] Run: supabase/migrations/20250101000001_create_placeholder_user_profiles.sql');
  return [];
};

/**
 * Generate a deterministic but varied set of placeholder users for a post
 * This ensures the same post always gets likes from the same accounts (no duplicates)
 * but different posts get different accounts
 */
const getPlaceholderUsersForPost = async (postId: string, count: number): Promise<string[]> => {
  // Get actual placeholder user IDs (from database or fallback)
  const placeholderIds = await getPlaceholderUserIds();
  
  if (placeholderIds.length === 0) {
    return [];
  }
  
  // Create a hash from post ID to get consistent but varied selection
  const hash = postId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const startIndex = hash % placeholderIds.length;
  
  const selected: string[] = [];
  for (let i = 0; i < count; i++) {
    const index = (startIndex + i * 3) % placeholderIds.length; // Spread out selection
    selected.push(placeholderIds[index]);
  }
  
  return selected;
};

/**
 * Boost likes on a post using placeholder accounts
 * @param postId - The post ID to boost
 * @param targetLikes - Target number of likes (default: 3-8 random)
 * @returns Number of likes added
 */
export const boostPostLikes = async (
  postId: string,
  targetLikes?: number
): Promise<number> => {
  // Placeholder accounts are not allowed to like posts (disabled)
  return 0;
};

/**
 * Boost views on a video post using placeholder accounts
 * @param postId - The video post ID to boost
 * @param targetViews - Target number of views (default: 10-30 random)
 * @returns Number of views added
 */
export const boostVideoPostViews = async (
  postId: string,
  targetViews?: number
): Promise<number> => {
  try {
    // Skip if it's a placeholder post
    if (postId.startsWith('placeholder-post-')) {
      log(`[ENGAGEMENT_BOOSTER] Skipping placeholder post: ${postId}`);
      return 0;
    }

    // Check if post_views table exists, if not, we'll just update a views_count field
    // First, check if the post is a video post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, video_url')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      error(`[ENGAGEMENT_BOOSTER] Error fetching post:`, postError);
      return 0;
    }

    if (!post.video_url) {
      log(`[ENGAGEMENT_BOOSTER] Post ${postId} is not a video post, skipping views`);
      return 0;
    }

    // Determine target views (realistic range: 10-40 for new videos)
    const viewsToAdd = targetViews ?? Math.floor(Math.random() * 31) + 10;

    // Check if post_views table exists
    const { data: tableCheck } = await supabase
      .from('post_views')
      .select('id')
      .limit(1);

    // If table doesn't exist, we'll use a views_count field on posts table
    if (!tableCheck) {
      // Try to get existing views count
      const { data: currentPost } = await supabase
        .from('posts')
        .select('views_count')
        .eq('id', postId)
        .single();

      const currentViews = (currentPost?.views_count as number) || 0;
      const newViews = currentViews + viewsToAdd;

      // Update views_count directly
      const { error: updateError } = await supabase
        .from('posts')
        .update({ views_count: newViews })
        .eq('id', postId);

      if (updateError) {
        error(`[ENGAGEMENT_BOOSTER] Error updating views_count:`, updateError);
        return 0;
      }

      log(`[ENGAGEMENT_BOOSTER] ✅ Added ${viewsToAdd} views to video post ${postId} (total: ${newViews})`);
      return viewsToAdd;
    }

    // If post_views table exists, use it
    const { data: existingViews, error: viewsError } = await supabase
      .from('post_views')
      .select('viewer_id')
      .eq('post_id', postId);

    if (viewsError) {
      error(`[ENGAGEMENT_BOOSTER] Error fetching existing views:`, viewsError);
      return 0;
    }

    const existingViewerIds = new Set(existingViews?.map(view => view.viewer_id) || []);

    // Get placeholder users for views (can be more than likes)
    const placeholderUsers = await getPlaceholderUsersForPost(postId, viewsToAdd + 10);
    
    if (placeholderUsers.length === 0) {
      log(`[ENGAGEMENT_BOOSTER] No placeholder users available for boosting views`);
      return 0;
    }
    
    // Filter out placeholder users who already viewed
    const usersToView = placeholderUsers
      .filter(userId => !existingViewerIds.has(userId))
      .slice(0, viewsToAdd);

    if (usersToView.length === 0) {
      log(`[ENGAGEMENT_BOOSTER] Post ${postId} already has views from all placeholder users`);
      return 0;
    }

    // Insert views with staggered timestamps
    const now = new Date();
    const viewInserts = usersToView.map((userId, index) => ({
      post_id: postId,
      viewer_id: userId,
      viewed_at: new Date(now.getTime() - (index * 300000) - Math.random() * 7200000).toISOString(), // Staggered over last 2 hours
    }));

    const { data, error } = await supabase
      .from('post_views')
      .insert(viewInserts)
      .select();

    if (error) {
      error(`[ENGAGEMENT_BOOSTER] Error adding views:`, error);
      return 0;
    }

    // Update views_count on posts table
    const { data: currentPost } = await supabase
      .from('posts')
      .select('views_count')
      .eq('id', postId)
      .single();

    const currentViews = (currentPost?.views_count as number) || 0;
    await supabase
      .from('posts')
      .update({ views_count: currentViews + data.length })
      .eq('id', postId);

    log(`[ENGAGEMENT_BOOSTER] ✅ Added ${data.length} views to video post ${postId}`);
    return data.length;
  } catch (error) {
    error(`[ENGAGEMENT_BOOSTER] Exception boosting views:`, error);
    return 0;
  }
};

/**
 * Boost both likes and views on a post
 * @param postId - The post ID to boost
 * @param isVideoPost - Whether this is a video post (for views)
 * @returns Object with likes and views added
 */
export const boostPostEngagement = async (
  postId: string,
  isVideoPost: boolean = false
): Promise<{ likes: number; views: number }> => {
  const likes = await boostPostLikes(postId);
  // Views come only from real viewers (post_video_views / record_post_video_view)
  const views = 0;

  return { likes, views };
};

/**
 * Boost engagement on multiple posts (batch operation)
 * @param postIds - Array of post IDs to boost
 * @param isVideoPost - Whether these are video posts
 * @returns Total likes and views added
 */
export const boostMultiplePosts = async (
  postIds: string[],
  isVideoPost: boolean = false
): Promise<{ totalLikes: number; totalViews: number }> => {
  let totalLikes = 0;
  let totalViews = 0;

  // Process in batches to avoid overwhelming the database
  const batchSize = 5;
  for (let i = 0; i < postIds.length; i += batchSize) {
    const batch = postIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(postId => boostPostEngagement(postId, isVideoPost))
    );

    totalLikes += results.reduce((sum, r) => sum + r.likes, 0);
    totalViews += results.reduce((sum, r) => sum + r.views, 0);

    // Small delay between batches
    if (i + batchSize < postIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { totalLikes, totalViews };
};

/**
 * Boost posts with low engagement (helper for background jobs)
 * Finds posts with low likes/views and boosts them
 */
export const boostLowEngagementPosts = async (
  maxAgeHours: number = 24,
  minLikes: number = 5,
  minViews: number = 10
): Promise<{ boosted: number; totalLikes: number; totalViews: number }> => {
  try {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

    // Find posts with low engagement
    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, video_url, created_at')
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !posts) {
      error(`[ENGAGEMENT_BOOSTER] Error fetching posts:`, error);
      return { boosted: 0, totalLikes: 0, totalViews: 0 };
    }

    // Check each post's engagement and boost if needed
    const postsToBoost: string[] = [];
    const videoPostsToBoost: string[] = [];

    for (const post of posts) {
      // Check likes count
      const { count: likesCount } = await supabase
        .from('post_likes')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', post.id);

      const needsLikes = (likesCount || 0) < minLikes;

      if (post.video_url) {
        // Check views count for video posts
        const { count: viewsCount } = await supabase
          .from('post_views')
          .select('id', { count: 'exact', head: true })
          .eq('post_id', post.id);

        const needsViews = (viewsCount || 0) < minViews;

        if (needsLikes || needsViews) {
          videoPostsToBoost.push(post.id);
        }
      } else if (needsLikes) {
        postsToBoost.push(post.id);
      }
    }

    // Boost regular posts
    const regularResults = await boostMultiplePosts(postsToBoost, false);
    
    // Boost video posts
    const videoResults = await boostMultiplePosts(videoPostsToBoost, true);

    const totalLikes = regularResults.totalLikes + videoResults.totalLikes;
    const totalViews = videoResults.totalViews;
    const boosted = postsToBoost.length + videoPostsToBoost.length;

    log(`[ENGAGEMENT_BOOSTER] ✅ Boosted ${boosted} posts: ${totalLikes} likes, ${totalViews} views`);

    return { boosted, totalLikes, totalViews };
  } catch (error) {
    error(`[ENGAGEMENT_BOOSTER] Exception boosting low engagement posts:`, error);
    return { boosted: 0, totalLikes: 0, totalViews: 0 };
  }
};

