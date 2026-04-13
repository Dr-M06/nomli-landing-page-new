/**
 * 🚀 ENGAGEMENT BOOSTER EDGE FUNCTION
 * 
 * Supabase Edge Function to boost engagement on posts with low likes/views.
 * Can be run manually or scheduled via cron.
 * 
 * Usage:
 * - Manual: POST /functions/v1/boost-engagement
 * - Cron: Set up in Supabase Dashboard → Edge Functions → Cron Jobs
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function getPlaceholderUserIds(supabase: any): Promise<string[]> {
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
    console.error('Error fetching placeholder profiles:', error);
    return [];
  }

  if (placeholderProfiles && placeholderProfiles.length > 0) {
    return placeholderProfiles.map((p: any) => p.id);
  }

  return [];
}

async function getPlaceholderUsersForPost(supabase: any, postId: string, count: number): Promise<string[]> {
  const placeholderIds = await getPlaceholderUserIds(supabase);
  
  if (placeholderIds.length === 0) {
    return [];
  }
  
  const hash = postId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const startIndex = hash % placeholderIds.length;
  
  const selected: string[] = [];
  for (let i = 0; i < count; i++) {
    const index = (startIndex + i * 3) % placeholderIds.length;
    selected.push(placeholderIds[index]);
  }
  
  return selected;
}

async function boostPostLikes(supabase: any, postId: string, targetLikes: number): Promise<number> {
  // Placeholder accounts are not allowed to like posts (disabled)
  return 0;
}

async function boostVideoPostViews(supabase: any, postId: string, targetViews: number): Promise<number> {
  try {
    if (postId.startsWith('placeholder-post-')) {
      return 0;
    }

    const { data: post } = await supabase
      .from('posts')
      .select('id, video_url')
      .eq('id', postId)
      .single();

    if (!post || !post.video_url) {
      return 0;
    }

    // ✅ FIXED: Use post_video_views table (correct table name from migration)
    const { data: existingViews } = await supabase
      .from('post_video_views')
      .select('user_id')
      .eq('post_id', postId);

    const existingViewerIds = new Set(existingViews?.map((view: any) => view.user_id) || []);
    const placeholderUsers = await getPlaceholderUsersForPost(supabase, postId, targetViews + 10);
    
    if (placeholderUsers.length === 0) {
      return 0;
    }
    
    const usersToView = placeholderUsers
      .filter((userId: string) => !existingViewerIds.has(userId))
      .slice(0, targetViews);

    if (usersToView.length === 0) {
      return 0;
    }

    const now = new Date();
    const viewInserts = usersToView.map((userId: string, index: number) => ({
      post_id: postId,
      user_id: userId, // ✅ FIXED: Use user_id (not viewer_id)
      created_at: new Date(now.getTime() - (index * 300000) - Math.random() * 7200000).toISOString(),
    }));

    const { data, error } = await supabase
      .from('post_video_views') // ✅ FIXED: Use correct table name
      .insert(viewInserts)
      .select();

    if (error) {
      console.error(`Error adding views:`, error);
      return 0;
    }

    // ✅ FIXED: Update views_count by counting unique viewers from table
    // CRITICAL: Get current count first to prevent decreasing
    const { data: currentPost } = await supabase
      .from('posts')
      .select('views_count')
      .eq('id', postId)
      .single();
    
    const currentViewsCount = (currentPost?.views_count as number) || 0;
    
    const { count: uniqueViewers } = await supabase
      .from('post_video_views')
      .select('user_id', { count: 'exact', head: true })
      .eq('post_id', postId);

    if (uniqueViewers !== null) {
      // CRITICAL: Use Math.max to ensure we NEVER decrease the count
      // This preserves existing high counts even if table has fewer entries
      const safeViewsCount = Math.max(uniqueViewers, currentViewsCount);

      if (safeViewsCount > currentViewsCount) {
        await supabase
          .from('posts')
          .update({ views_count: safeViewsCount })
          .eq('id', postId);
      }
    }

    return data.length;
  } catch (error) {
    console.error(`Exception boosting views:`, error);
    return 0;
  }
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Options: maxAgeHours, minLikes, minViews, videoOnly, viewsPerVideoMin, viewsPerVideoMax, limit
    const {
      maxAgeHours = 24,
      minLikes = 5,
      minViews = 10,
      videoOnly = false,
      viewsPerVideoMin = 3, // Reduced from 15 - more realistic
      viewsPerVideoMax = 8, // Reduced from 50 - more realistic
      limit = 50,
    } = await req.json().catch(() => ({}));

    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, video_url, created_at')
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !posts) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch posts', details: error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const postsToBoost: string[] = [];
    const videoPostsToBoost: string[] = [];

    for (const post of posts) {
      const { count: likesCount } = await supabase
        .from('post_likes')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', post.id);

      const needsLikes = (likesCount || 0) < minLikes;

      if (post.video_url) {
        const { count: viewsCount } = await supabase
          .from('post_video_views') // ✅ FIXED: Use correct table name
          .select('id', { count: 'exact', head: true })
          .eq('post_id', post.id);

        const needsViews = (viewsCount || 0) < minViews;

        if (videoOnly) {
          // Video-only mode: boost every video that is below minViews
          if (needsViews) {
            videoPostsToBoost.push(post.id);
          }
        } else if (needsLikes || needsViews) {
          videoPostsToBoost.push(post.id);
        }
      } else if (!videoOnly && needsLikes) {
        postsToBoost.push(post.id);
      }
    }

    let totalLikes = 0;
    let totalViews = 0;

    const viewsRange = viewsPerVideoMax - viewsPerVideoMin;

    // Boost regular posts (skip when videoOnly)
    if (!videoOnly) {
      for (const postId of postsToBoost) {
        const likes = await boostPostLikes(supabase, postId, Math.floor(Math.random() * 10) + 3);
        totalLikes += likes;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Boost video posts: add more views for low-performing videos when videoOnly or always
    for (const postId of videoPostsToBoost) {
      if (!videoOnly) {
        const likes = await boostPostLikes(supabase, postId, Math.floor(Math.random() * 10) + 3);
        totalLikes += likes;
      }
      const viewsToAdd = viewsPerVideoMin + Math.floor(Math.random() * (viewsRange + 1));
      const views = await boostVideoPostViews(supabase, postId, viewsToAdd);
      totalViews += views;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const boosted = postsToBoost.length + videoPostsToBoost.length;

    return new Response(
      JSON.stringify({
        success: true,
        boosted,
        videoOnly,
        totalLikes,
        totalViews,
        videoPostsBoosted: videoPostsToBoost.length,
        message: videoOnly
          ? `Boosted ${videoPostsToBoost.length} low-view videos: ${totalViews} views`
          : `Boosted ${boosted} posts: ${totalLikes} likes, ${totalViews} views`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

