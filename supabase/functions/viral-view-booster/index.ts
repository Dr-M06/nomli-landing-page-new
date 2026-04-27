/**
 * 🔥 VIRAL VIEW BOOSTER - Boost the view count shown in the app for all videos
 *
 * Two modes (via body.directBoost):
 * - directBoost: true (default) — Adds views directly to posts.views_count.
 *   No placeholder users needed. The number shown in the app goes up for every video.
 * - directBoost: false — Uses post_video_views + placeholder users (one view per user per video).
 *
 * Both modes: process all videos in batches, newer/popular videos get slightly more.
 * Run on a cron every 15–30 minutes.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Get placeholder user IDs for synthetic views
 */
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

  if (error || !placeholderProfiles || placeholderProfiles.length === 0) {
    // Fallback: create synthetic user IDs if placeholders don't exist
    return [];
  }

  return placeholderProfiles.map((p: any) => p.id);
}

/**
 * Get placeholder users for a specific post (deterministic selection)
 */
async function getPlaceholderUsersForPost(
  supabase: any,
  postId: string,
  count: number
): Promise<string[]> {
  const placeholderIds = await getPlaceholderUserIds(supabase);
  
  if (placeholderIds.length === 0) {
    return [];
  }
  
  // Deterministic selection based on post ID
  const hash = postId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const startIndex = hash % placeholderIds.length;
  
  const selected: string[] = [];
  for (let i = 0; i < count; i++) {
    const index = (startIndex + i * 3) % placeholderIds.length;
    selected.push(placeholderIds[index]);
  }
  
  return selected;
}

/**
 * Calculate views to add based on video age and current popularity
 * Mimics TikTok's viral algorithm feel
 */
function calculateViewsToAdd(
  hoursOld: number,
  currentViews: number,
  baseMultiplier: number = 1
): number {
  // Newer videos get more views (discovery boost)
  let ageMultiplier: number;
  
  if (hoursOld < 1) {
    // First hour: moderate growth (reduced from 4.0)
    ageMultiplier = 2.0;
  } else if (hoursOld < 6) {
    // First 6 hours: steady growth (reduced from 3.0)
    ageMultiplier = 1.5;
  } else if (hoursOld < 24) {
    // First day: slow growth (reduced from 2.0)
    ageMultiplier = 1.2;
  } else if (hoursOld < 72) {
    // 1-3 days: minimal (reduced from 1.2)
    ageMultiplier = 0.8;
  } else if (hoursOld < 168) {
    // 3-7 days: very slow (reduced from 0.6)
    ageMultiplier = 0.4;
  } else if (hoursOld < 720) {
    // 1-4 weeks: trickle (reduced from 0.3)
    ageMultiplier = 0.2;
  } else {
    // Older than a month: minimal (reduced from 0.1)
    ageMultiplier = 0.05;
  }

  // Popularity boost - videos with more views get slightly more (reduced multipliers)
  let popularityMultiplier = 1.0;
  if (currentViews > 50000) {
    popularityMultiplier = 1.2; // Reduced from 1.5
  } else if (currentViews > 10000) {
    popularityMultiplier = 1.15; // Reduced from 1.3
  } else if (currentViews > 5000) {
    popularityMultiplier = 1.1; // Reduced from 1.2
  } else if (currentViews > 1000) {
    popularityMultiplier = 1.05; // Reduced from 1.1
  }

  // Base views per interval (1-2 base views - more realistic)
  const baseViews = 1 + Math.floor(Math.random() * 2); // 1-2 base views (reduced from 2-6)
  
  // Calculate final views with variance
  const calculatedViews = baseViews * ageMultiplier * popularityMultiplier * baseMultiplier;
  
  // Add random variance (±20% - less predictable)
  const variance = 0.8 + Math.random() * 0.4; // 0.8 to 1.2 (reduced from 0.7-1.3)
  const finalViews = Math.max(1, Math.floor(calculatedViews * variance));
  
  return finalViews;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse options: directBoost = true means add directly to views_count (no placeholder users)
    const {
      batchSize = 500,
      baseMultiplier = 1,
      minViewsPerRun = 1,
      maxBatches = 20,
      directBoost = true,  // default: boost the number shown in the app for all videos, no placeholders
    } = await req.json().catch(() => ({}));

    let totalViewsAdded = 0;
    let totalVideosProcessed = 0;
    let offset = 0;
    let batchCount = 0;
    let placeholderUsersCount: number | null = null;

    if (directBoost) {
      // Direct mode: add views to posts.views_count (the number the app shows). No placeholder users.
      console.log('Viral view booster: direct mode — boosting views_count for all videos');
      while (batchCount < maxBatches) {
        const { data: videos, error } = await supabase
          .from('posts')
          .select('id, video_url, created_at, views_count')
          .not('video_url', 'is', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) {
          console.error('Error fetching videos:', error);
          break;
        }
        if (!videos || videos.length === 0) break;

        for (const video of videos) {
          try {
            const createdAt = new Date(video.created_at);
            const hoursOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
            const currentViews = video.views_count || 0;
            const viewsToAdd = Math.max(minViewsPerRun, calculateViewsToAdd(hoursOld, currentViews, baseMultiplier));

            const newCount = currentViews + viewsToAdd;
            const { error: updateError } = await supabase
              .from('posts')
              .update({ views_count: newCount })
              .eq('id', video.id);

            if (!updateError) {
              totalViewsAdded += viewsToAdd;
              totalVideosProcessed++;
            }
          } catch (e) {
            console.error(`Exception boosting ${video.id}:`, e);
          }
        }

        offset += batchSize;
        batchCount++;
        if (videos.length < batchSize) break;
      }
    } else {
      // Legacy mode: use post_video_views + placeholder users (requires placeholder profiles)
      const placeholderUserIds = await getPlaceholderUserIds(supabase);
      if (placeholderUserIds.length === 0) {
        console.error('Viral view booster: no placeholder users (use directBoost: true to skip)');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'no_placeholder_users',
            message: 'Placeholder users required when directBoost is false. Use directBoost: true to boost app view counts without placeholders.',
            videosProcessed: 0,
            totalViewsAdded: 0,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      placeholderUsersCount = placeholderUserIds.length;
      console.log(`Viral view booster: placeholder mode using ${placeholderUserIds.length} users`);

      while (batchCount < maxBatches) {
        const { data: videos, error } = await supabase
          .from('posts')
          .select('id, video_url, created_at, views_count')
          .not('video_url', 'is', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) {
          console.error('Error fetching videos:', error);
          break;
        }
        if (!videos || videos.length === 0) break;

        for (const video of videos) {
          const createdAt = new Date(video.created_at);
          const hoursOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
          const currentViews = video.views_count || 0;
          const viewsToAdd = Math.max(minViewsPerRun, calculateViewsToAdd(hoursOld, currentViews, baseMultiplier));

          try {
            const { data: existingViews } = await supabase
              .from('post_video_views')
              .select('user_id')
              .eq('post_id', video.id);
            const existingViewerIds = new Set(existingViews?.map((v: any) => v.user_id) || []);
            const placeholderUsers = await getPlaceholderUsersForPost(supabase, video.id, viewsToAdd + 10);
            if (placeholderUsers.length === 0) continue;

            const usersToView = placeholderUsers
              .filter((userId: string) => !existingViewerIds.has(userId))
              .slice(0, viewsToAdd);
            if (usersToView.length === 0) continue;

            const now = new Date();
            const viewInserts = usersToView.map((userId: string, index: number) => ({
              post_id: video.id,
              user_id: userId,
              created_at: new Date(now.getTime() - (index * 300000) - Math.random() * 7200000).toISOString(),
            }));

            const { data: insertedViews, error: insertError } = await supabase
              .from('post_video_views')
              .insert(viewInserts)
              .select();
            if (insertError) continue;

            const actualViewsAdded = insertedViews?.length || 0;
            if (actualViewsAdded > 0) {
              const { data: currentPost } = await supabase.from('posts').select('views_count').eq('id', video.id).single();
              const currentViewsCount = (currentPost?.views_count as number) || 0;
              const { count: uniqueViewers } = await supabase
                .from('post_video_views')
                .select('user_id', { count: 'exact', head: true })
                .eq('post_id', video.id);
              if (uniqueViewers !== null) {
                const safeViewsCount = Math.max(uniqueViewers, currentViewsCount);
                if (safeViewsCount > currentViewsCount) {
                  await supabase.from('posts').update({ views_count: safeViewsCount }).eq('id', video.id);
                }
              }
              totalViewsAdded += actualViewsAdded;
            }
            totalVideosProcessed++;
          } catch (err) {
            console.error(`Exception boosting ${video.id}:`, err);
          }
        }

        offset += batchSize;
        batchCount++;
        if (videos.length < batchSize) break;
      }
    }

    console.log(`✅ Boosted ${totalVideosProcessed} videos with ${totalViewsAdded} total views`);

    const body: Record<string, unknown> = {
      success: true,
      directBoost: !!directBoost,
      videosProcessed: totalVideosProcessed,
      batchesProcessed: batchCount,
      totalViewsAdded,
      averagePerVideo: totalVideosProcessed > 0 ? Math.round(totalViewsAdded / totalVideosProcessed) : 0,
      message: `Boosted ${totalVideosProcessed} videos (${totalViewsAdded} views added to app)`,
    };
    if (placeholderUsersCount !== null) body.placeholderUsersCount = placeholderUsersCount;

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Viral view booster error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
