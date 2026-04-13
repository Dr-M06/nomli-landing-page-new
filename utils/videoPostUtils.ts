import { Post } from './communityUtils';
import { VideoPost } from '../components/VideoFeed';
import { getAvatarUrl, getPostImageUrl } from './cdnConfig';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { log, warn, error } from './productionLogger';


/** Race a promise against a timeout; on timeout reject with a clear error so callers can return partial results. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Convert Post objects to VideoPost format for video feed
 */
export const convertPostsToVideoFeed = (posts: Post[]): VideoPost[] => {
  // Filter out posts without video URLs.
  // IMPORTANT: Do NOT exclude Cloudinary here, because the main home feed still plays them.
  // The fullscreen video feed should mirror the regular feed’s behaviour and show every playable video.
  if (!Array.isArray(posts)) return [];
  const videoPosts = posts.filter(post => post != null && !!post.video_url && typeof post.id === 'string');
  // Only log in development mode and when processing a significant batch
  if (__DEV__ && videoPosts.length > 0) {
    log(`[VideoPostUtils] Converting ${videoPosts.length} video posts from ${posts.length} total posts`);
  }
  
  return videoPosts.map(post => {
    // Handle user data properly
    // Prefer explicit usernames; never fall back to raw email for display
    const username = post.username || 
                    post.profile?.username || 
                    post.display_name ||
                    post.profile?.full_name ||
                    'user';
    
    const displayName = post.display_name || 
                       post.profile?.display_name || 
                       post.profile?.full_name ||
                       username;

    const rawAvatarUrl = post.user_avatar_url || 
                        post.profile?.avatar_url ||
                        generateDefaultAvatar(username);
    
    // Convert to CDN URL if enabled (faster for Nigeria/Africa)
    const avatarUrl = rawAvatarUrl ? getAvatarUrl(rawAvatarUrl) : generateDefaultAvatar(username);

    // Only log individual posts in development mode when explicitly debugging
    if (__DEV__ && false) { // Disabled by default - set to true for debugging
      log(`[VideoPostUtils] Processing video post ${post.id}:`, {
        username,
        displayName,
        avatarUrl,
        likes: post.likes_count,
        comments: post.comments_count,
        video_url: post.video_url
      });
    }

    // Convert image URLs to CDN if enabled
    const rawThumbnailUrl = post.image_url || generateThumbnailFromVideo(post.video_url!);
    const thumbnailUrl = rawThumbnailUrl && !rawThumbnailUrl.includes('image.mux.com') 
      ? getPostImageUrl(rawThumbnailUrl) 
      : rawThumbnailUrl;

    return {
      id: post.id,
      video_url: post.video_url!,
      thumbnail_url: thumbnailUrl,
      title: post.content?.substring(0, 100) || '',
      description: post.content || '',
      user: {
        id: post.user_id,
        username: username,
        display_name: displayName,
        avatar_url: avatarUrl,
        is_verified: post.is_verified || post.profile?.is_verified || false,
      },
      is_verified: post.is_verified || post.profile?.is_verified || false, // Include verification status
      profile: post.profile, // Include full profile for verification check
      likes_count: Number(post.likes_count) || 0,
      comments_count: Number(post.comments_count) || 0,
      views_count: Number(post.views_count) || 0, // Include view count for videos
      bookmarks_count: Number(post.bookmarks_count) || 0, // Include bookmark count
      shares_count: 0, // Not implemented yet
      is_liked: Boolean(post.liked_by_user || post.liked),
      is_bookmarked: Boolean(post.bookmarked || post.isBookmarked),
      created_at: post.created_at,
      location: post.location,
      tags: extractTagsFromContent(post.content || ''),
      comments_disabled: post.comments_disabled ?? false, // Include comments_disabled for videos
      adult_content: !!(post.adult_content === true || post.adult_content === 1),
      boost_expires_at: post.boost_expires_at ?? null,
    };
  });
};

// In-memory cache for video posts (fastest, 1 minute TTL)
const videoPostsCache = new Map<string, { posts: Post[]; timestamp: number }>();
const VIDEO_POSTS_CACHE_DURATION = 60 * 1000; // 1 minute for in-memory cache

// Persistent cache keys for AsyncStorage
const VIDEO_POSTS_CACHE_KEY = 'video_posts_cache_all';
const VIDEO_POSTS_CACHE_TIMESTAMP_KEY = 'video_posts_timestamp_all';
const VIDEO_POSTS_PERSISTENT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for persistent cache

/**
 * Load video posts from persistent cache (AsyncStorage)
 */
const loadCachedVideoPosts = async (): Promise<Post[] | null> => {
  try {
    const cachedData = await AsyncStorage.getItem(VIDEO_POSTS_CACHE_KEY);
    const timestampStr = await AsyncStorage.getItem(VIDEO_POSTS_CACHE_TIMESTAMP_KEY);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      // Check if cache is still valid (within 24 hours)
      if (now - timestamp < VIDEO_POSTS_PERSISTENT_CACHE_DURATION) {
        try {
          const posts: Post[] = JSON.parse(cachedData);
          if (__DEV__) {
            log(`[VideoPostUtils] ✅ Loaded ${posts.length} video posts from persistent cache (age: ${Math.round((now - timestamp) / 1000 / 60)} minutes)`);
          }
          return posts;
        } catch (parseError) {
          error('[VideoPostUtils] Error parsing cache, clearing it:', parseError);
          await AsyncStorage.multiRemove([
            VIDEO_POSTS_CACHE_KEY,
            VIDEO_POSTS_CACHE_TIMESTAMP_KEY
          ]);
          return null;
        }
      }
    }
  } catch (error) {
    error('[VideoPostUtils] Error loading cached video posts:', error);
  }
  return null;
};

/**
 * Save video posts to persistent cache (AsyncStorage)
 */
const saveCachedVideoPosts = async (posts: Post[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(VIDEO_POSTS_CACHE_KEY, JSON.stringify(posts));
    await AsyncStorage.setItem(VIDEO_POSTS_CACHE_TIMESTAMP_KEY, Date.now().toString());
    if (__DEV__) {
      log(`[VideoPostUtils] 💾 Cached ${posts.length} video posts to persistent storage`);
    }
  } catch (error) {
    error('[VideoPostUtils] Error saving cached video posts:', error);
  }
};

/**
 * Clear video posts cache (both in-memory and persistent)
 * Call this when a new video is uploaded to ensure it appears immediately
 */
export const clearVideoPostsCache = async (): Promise<void> => {
  try {
    // Clear in-memory cache
    videoPostsCache.clear();
    
    // Clear persistent cache
    await AsyncStorage.multiRemove([
      VIDEO_POSTS_CACHE_KEY,
      VIDEO_POSTS_CACHE_TIMESTAMP_KEY
    ]);
    
    if (__DEV__) {
      log('[VideoPostUtils] 🗑️ Cleared video posts cache (in-memory + persistent)');
    }
  } catch (error) {
    error('[VideoPostUtils] Error clearing video posts cache:', error);
  }
};

/**
 * Fisher-Yates shuffle algorithm for randomizing array order
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Fetch all video posts directly from the database (paginated under the hood).
 * OPTIMIZED: Includes multi-layer caching (in-memory + persistent) for faster loading.
 * This bypasses the regular feed pagination so the fullscreen feed can see
 * both old and new videos.
 * 
 * Performance comparison:
 * - Faster than homescreen: Only fetches videos (not all posts), simpler query
 * - Instant repeat visits: Uses cache (in-memory + persistent)
 * - Stale-while-revalidate: Shows cache immediately, refreshes in background
 * - Offline support: Works without network using cached data
 * 
 * @param shuffle If true, videos will be randomly shuffled (for "For You" feed experience)
 */
export const fetchAllVideoPosts = async (
  pageSize: number = 100,
  maxPages: number = 10,
  useCache: boolean = true,
  shuffle: boolean = false,
  /** When true, fetch only the first page for fast time-to-first-video; caller can fetch full list in background */
  firstPageOnly: boolean = false,
): Promise<Post[]> => {
  const cacheKey = `video_posts_all_${pageSize}_${maxPages}_${shuffle ? 'shuffled' : 'ordered'}`;
  const now = Date.now();

  // 1. Check in-memory cache first (fastest, but only lasts 1 minute)
  if (useCache) {
    const inMemoryCache = videoPostsCache.get(cacheKey);
    if (inMemoryCache && (now - inMemoryCache.timestamp < VIDEO_POSTS_CACHE_DURATION)) {
      if (__DEV__) {
        log(`[VideoPostUtils] ⚡ Using in-memory cached video posts (${inMemoryCache.posts.length} posts)`);
      }
      // If shuffle requested but cache is ordered, shuffle it now
      const cachedPosts = shuffle && !cacheKey.includes('shuffled') ? shuffleArray(inMemoryCache.posts) : inMemoryCache.posts;
      return cachedPosts;
    }
  }

  // 2. Load persistent cache FIRST (makes app feel instant even on slow networks)
  let persistentCache: Post[] | null = null;
  if (useCache) {
    persistentCache = await loadCachedVideoPosts();
    if (persistentCache && persistentCache.length > 0) {
      // Shuffle cached data if shuffle is requested
      const cachedPosts = shuffle ? shuffleArray(persistentCache) : persistentCache;
      
      // Update in-memory cache immediately
      videoPostsCache.set(cacheKey, {
        posts: cachedPosts,
        timestamp: now
      });
      
      // Return cached data immediately and fetch fresh in background (stale-while-revalidate)
      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected) {
        // Fetch fresh data in background (non-blocking)
        const backgroundFetch = async () => {
          try {
            if (__DEV__) {
              log('[VideoPostUtils] 🔄 Background refresh: Fetching fresh video posts from database...');
            }
            const freshPosts = await fetchAllVideoPosts(pageSize, maxPages, false, shuffle); // Pass shuffle parameter
            if (freshPosts && freshPosts.length > 0 && __DEV__) {
              log(`[VideoPostUtils] ✅ Background refresh: Found ${freshPosts.length} fresh video posts (cache had ${cachedPosts.length})`);
            }
          } catch (error) {
            if (__DEV__) {
              warn('[VideoPostUtils] Background refresh failed (non-critical):', error);
            }
          }
        };
        backgroundFetch().catch(() => {});
      }
      
      return cachedPosts;
    }
  }

  // 3. Check network status - if offline, return cached posts immediately
  const netInfo = await NetInfo.fetch();
  if (!netInfo.isConnected) {
    if (persistentCache && persistentCache.length > 0) {
      if (__DEV__) {
        log(`[VideoPostUtils] 📴 Offline - returning ${persistentCache.length} cached video posts`);
      }
      return persistentCache;
    }
    if (__DEV__) {
      log(`[VideoPostUtils] 📴 Offline - no cache, returning empty`);
    }
    return [];
  }

  // 4. Fetch fresh video posts from database (direct query - faster than homescreen)
  if (__DEV__) {
    log(`[VideoPostUtils] 🚀 Fetching fresh video posts directly from database (pageSize=${pageSize}, maxPages=${maxPages}, firstPageOnly=${firstPageOnly})`);
  }
  
  const all: Post[] = [];
  const fetchStartTime = Date.now();

  const FETCH_PAGE_TIMEOUT_MS = 18000; // 18s per page so slow networks still get results
  const pagesToFetch = firstPageOnly ? 1 : maxPages;
  for (let page = 0; page < pagesToFetch; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('posts')
          .select('*')
          .not('video_url', 'is', null)
          .order('created_at', { ascending: false })
          .range(from, to),
        FETCH_PAGE_TIMEOUT_MS,
        'Video posts fetch'
      );

      if (error) {
        if (__DEV__) {
          warn('[VideoPostUtils] Error fetching video posts page', page, error);
        }
        break;
      }

      const batch = (data || []) as Post[];
      if (batch.length === 0) break;

      all.push(...batch);

      if (batch.length < pageSize) {
        break;
      }
      if (firstPageOnly) break; // Fast path: only first page for quick first paint
    } catch (e) {
      if (__DEV__) {
        warn('[VideoPostUtils] Fetch page timeout or error (using partial results):', e instanceof Error ? e.message : e);
      }
      break; // Use whatever we have in `all`
    }
  }

  const fetchDuration = Date.now() - fetchStartTime;
  if (__DEV__) {
    log(`[VideoPostUtils] ✅ Fetched ${all.length} video posts directly from database in ${fetchDuration}ms`);
  }

  // 5. Enrich with profile data so avatars / usernames work like the main feed (timeout so slow network doesn't block)
  const PROFILES_TIMEOUT_MS = 10000;
  try {
    const userIds = [...new Set(all.map(post => post.user_id).filter(Boolean))] as string[];
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await withTimeout(
        supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, is_verified')
          .in('id', userIds),
        PROFILES_TIMEOUT_MS,
        'Profiles enrich'
      );

      if (!profilesError && profiles) {
        const profileMap = profiles.reduce((map: Record<string, any>, profile: any) => {
          map[profile.id] = profile;
          return map;
        }, {});

        all.forEach(post => {
          const profile = profileMap[post.user_id];
          if (profile) {
            (post as any).profile = profile;
            (post as any).is_verified = profile.is_verified || false;
            (post as any).user_avatar_url = profile.avatar_url || null;
          }
        });

        if (__DEV__) {
          log(`[VideoPostUtils] Enriched ${profiles.length} profiles for video posts`);
        }
      } else if (profilesError && __DEV__) {
        warn('[VideoPostUtils] Failed to enrich video posts with profiles:', profilesError);
      }
    }
  } catch (e) {
    if (__DEV__) {
      warn('[VideoPostUtils] Error enriching video posts with profiles (non-critical):', e);
    }
  }

  // 5b. Enrich with real counts from related tables (reactions, comments, bookmarks)
  const postIds = all.map(p => p.id);
  if (postIds.length > 0) {
    try {
      // Fetch all counts in parallel for performance
      const [reactionsResult, commentsResult, bookmarksResult, viewsResult] = await Promise.all([
        // Get reactions/likes count (include user_id to exclude placeholder accounts)
        supabase
          .from('post_reactions')
          .select('post_id, user_id')
          .in('post_id', postIds),
        // Get comments count
        supabase
          .from('post_comments')
          .select('post_id')
          .in('post_id', postIds),
        // Get bookmarks count
        supabase
          .from('post_bookmarks')
          .select('post_id')
          .in('post_id', postIds),
        // Get views count
        supabase
          .from('post_views')
          .select('post_id')
          .in('post_id', postIds),
      ]);

      // Build count maps
      const likesCountMap: Record<string, number> = {};
      const commentsCountMap: Record<string, number> = {};
      const bookmarksCountMap: Record<string, number> = {};
      const viewsCountMap: Record<string, number> = {};

      // Use post_reactions if available, otherwise fallback to post_likes
      let likesData = reactionsResult.data || [];
      if (likesData.length === 0) {
        // Try post_likes as fallback
        const { data: likesResult } = await supabase
          .from('post_likes')
          .select('post_id, user_id')
          .in('post_id', postIds);
        likesData = likesResult || [];
      }
      
      // Exclude placeholder accounts from like/reaction counts
      const likeUserIds = [...new Set((likesData as { post_id: string; user_id: string }[]).map((r: any) => r.user_id))];
      let placeholderIds: Set<string> = new Set();
      if (likeUserIds.length > 0) {
        const { data: placeholders } = await supabase
          .from('profiles')
          .select('id')
          .in('id', likeUserIds)
          .eq('is_placeholder', true);
        if (placeholders?.length) placeholderIds = new Set(placeholders.map((p: { id: string }) => p.id));
      }
      (likesData as { post_id: string; user_id: string }[]).forEach((r: any) => {
        if (placeholderIds.has(r.user_id)) return;
        likesCountMap[r.post_id] = (likesCountMap[r.post_id] || 0) + 1;
      });
      (commentsResult.data || []).forEach(c => {
        commentsCountMap[c.post_id] = (commentsCountMap[c.post_id] || 0) + 1;
      });
      (bookmarksResult.data || []).forEach(b => {
        bookmarksCountMap[b.post_id] = (bookmarksCountMap[b.post_id] || 0) + 1;
      });
      (viewsResult.data || []).forEach(v => {
        viewsCountMap[v.post_id] = (viewsCountMap[v.post_id] || 0) + 1;
      });

      // Apply counts to posts
      // CRITICAL: For views_count, check multiple sources and use the maximum
      // This prevents decreasing counts from old posts
      all.forEach(post => {
        post.likes_count = likesCountMap[post.id] || post.likes_count || 0;
        post.comments_count = commentsCountMap[post.id] || post.comments_count || 0;
        post.bookmarks_count = bookmarksCountMap[post.id] || post.bookmarks_count || 0;
        
        // For video posts, use Math.max to never decrease (will check post_video_views separately)
        if (post.video_url) {
          const viewsFromTable = viewsCountMap[post.id] || 0;
          post.views_count = Math.max(viewsFromTable, post.views_count || 0);
        } else {
          // For non-video posts, use simple max
          const viewsFromTable = viewsCountMap[post.id] || 0;
          post.views_count = Math.max(viewsFromTable, post.views_count || 0);
        }
      });
      
      // Batch check post_video_views for all video posts (more efficient)
      const videoPosts = all.filter(post => post.video_url);
      if (videoPosts.length > 0) {
        try {
          const videoPostIds = videoPosts.map(p => p.id);
          const { data: allVideoViews, error: videoViewsError } = await supabase
            .from('post_video_views')
            .select('post_id, user_id')
            .in('post_id', videoPostIds);
          
          if (!videoViewsError && allVideoViews) {
            // Count unique viewers per post
            const videoViewsCountMap: Record<string, number> = {};
            allVideoViews.forEach((view: any) => {
              videoViewsCountMap[view.post_id] = (videoViewsCountMap[view.post_id] || 0) + 1;
            });
            
            // Apply maximum counts (never decrease)
            videoPosts.forEach(post => {
              const currentViewsCount = post.views_count || 0;
              const videoViewsCount = videoViewsCountMap[post.id] || 0;
              // Use the maximum - never decrease
              post.views_count = Math.max(currentViewsCount, videoViewsCount);
            });
          }
        } catch (error) {
          // Table might not exist, that's okay - keep existing counts
        }
      }

      if (__DEV__) {
        log(`[VideoPostUtils] ✅ Enriched ${postIds.length} video posts with real counts`);
      }
    } catch (e) {
      if (__DEV__) {
        warn('[VideoPostUtils] Error enriching counts (non-critical):', e);
      }
    }
  }

  // 5c. Enrich with current user's like/bookmark state so the feed shows red heart when already liked
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (userId && postIds.length > 0) {
      const [userLikesRes, userBookmarksRes] = await Promise.all([
        supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
        supabase.from('post_bookmarks').select('post_id').eq('user_id', userId).in('post_id', postIds),
      ]);
      const userLikedIds = new Set((userLikesRes.data || []).map((r: { post_id: string }) => r.post_id));
      const userBookmarkedIds = new Set((userBookmarksRes.data || []).map((r: { post_id: string }) => r.post_id));
      all.forEach(post => {
        (post as any).liked_by_user = userLikedIds.has(post.id);
        (post as any).bookmarked = userBookmarkedIds.has(post.id);
      });
      if (__DEV__ && (userLikedIds.size > 0 || userBookmarkedIds.size > 0)) {
        log(`[VideoPostUtils] ✅ Current user liked ${userLikedIds.size} posts, bookmarked ${userBookmarkedIds.size}`);
      }
    }
  } catch (e) {
    if (__DEV__) {
      warn('[VideoPostUtils] Error enriching user like/bookmark state (non-critical):', e);
    }
  }

  // 6. Shuffle if requested (for "For You" feed experience)
  const finalPosts = shuffle ? shuffleArray(all) : all;
  
  if (__DEV__ && shuffle && finalPosts.length > 0) {
    log(`[VideoPostUtils] 🔀 Shuffled ${finalPosts.length} video posts for random feed order`);
  }

  // 7. Update caches (cache the shuffled/ordered version) — skip when firstPageOnly (partial list)
  if (finalPosts.length > 0 && !firstPageOnly) {
    videoPostsCache.set(cacheKey, {
      posts: finalPosts,
      timestamp: now
    });
    
    // Save to persistent cache (non-blocking)
    // Note: We save the shuffled version if shuffle=true, ordered if shuffle=false
    saveCachedVideoPosts(finalPosts).catch(() => {});
  }

  return finalPosts;
};

/**
 * Mix videos into a "For You" style order:
 * - Favors fresh content
 * - Sprinkles in high‑engagement older videos
 * - Adds some random exploration
 *
 * IMPORTANT: This uses a deterministic seed based on video IDs to ensure
 * the shuffle is consistent per session (same videos = same order).
 * This prevents the "wrong video opens" bug when clicking fullscreen.
 */
export const mixVideoFeed = (videos: VideoPost[]): VideoPost[] => {
  if (videos.length <= 1) return videos;

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Shallow copy so we never mutate caller arrays
  // Safety: filter out any invalid or undefined entries before processing
  let invalidCount = 0;
  const all = videos.filter((v) => {
    if (!v || !v.id) {
      invalidCount++;
      return false;
    }
    return true;
  });
  if (__DEV__ && invalidCount > 0) {
    warn(`[VideoPostUtils] mixVideoFeed: filtered ${invalidCount} invalid video entry(ies)`);
  }

  if (all.length <= 1) return all;

  // Deterministic shuffle: use video IDs as seed so same videos = same order
  // This ensures clicking a video always opens the correct one in fullscreen
  const deterministicShuffle = <T extends { id: string }>(arr: T[]): T[] => {
    const copy = [...arr];
    // Create a simple hash from all video IDs combined
    const seed = copy.map(v => v.id).join('').split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    
    // Use seed to create a pseudo-random generator
    let rng = seed;
    const next = () => {
      rng = (rng * 9301 + 49297) % 233280;
      return rng / 233280;
    };
    
    // Fisher-Yates with deterministic RNG
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // Score for "hotness" – crude but effective
  const score = (v: VideoPost) => {
    const likes = v.likes_count ?? 0;
    const comments = v.comments_count ?? 0;
    const views = v.views_count ?? 0;
    return likes * 2 + comments * 3 + views * 0.1;
  };

  // Buckets
  const fresh: VideoPost[] = [];
  const hot: VideoPost[] = [];
  const longTail: VideoPost[] = [];

  for (const v of all) {
    // Safety: default to now if created_at is missing or invalid
    let createdAt = now;
    if (v.created_at) {
      const ts = new Date(v.created_at).getTime();
      if (!isNaN(ts)) {
        createdAt = ts;
      }
    }
    const ageDays = (now - createdAt) / DAY_MS;

    if (ageDays <= 3) {
      fresh.push(v);
    } else {
      const s = score(v);
      if (s > 50) {
        hot.push(v);
      } else {
        longTail.push(v);
      }
    }
  }

  // Sort hot by score desc, then shuffle deterministically
  hot.sort((a, b) => score(b) - score(a));

  const freshShuffled = deterministicShuffle(fresh);
  const hotShuffled = deterministicShuffle(hot);
  const tailShuffled = deterministicShuffle(longTail);

  const result: VideoPost[] = [];
  let iFresh = 0;
  let iHot = 0;
  let iTail = 0;

  // Interleave: new, hot, new, hot, random...
  while (
    iFresh < freshShuffled.length ||
    iHot < hotShuffled.length ||
    iTail < tailShuffled.length
  ) {
    if (iFresh < freshShuffled.length) result.push(freshShuffled[iFresh++]);
    if (iHot < hotShuffled.length) result.push(hotShuffled[iHot++]);
    if (iFresh < freshShuffled.length) result.push(freshShuffled[iFresh++]);
    if (iHot < hotShuffled.length) result.push(hotShuffled[iHot++]);
    if (iTail < tailShuffled.length) result.push(tailShuffled[iTail++]);
  }

  // As a safety, if something went wrong and result is empty, fall back to deterministic shuffle
  if (result.length === 0) {
    return deterministicShuffle(all);
  }

  return result;
};

/**
 * Generate a default avatar URL for users
 */
const generateDefaultAvatar = (username: string): string => {
  const name = username || 'User';
  // Use ui-avatars.com for nice generated avatars
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366F1&color=FFFFFF&size=150&bold=true&format=png`;
};

/**
 * Generate thumbnail URL from video URL (placeholder implementation)
 * In a real implementation, this could extract a frame from the video
 */
export const generateThumbnailFromVideo = (videoUrl: string): string => {
  // Only log in development mode when debugging
  if (__DEV__ && false) { // Disabled by default - set to true for debugging
    log('🎬 [VideoPostUtils] Generating thumbnail for:', videoUrl);
  }
  
  // For Mux videos, we can generate thumbnails by modifying the URL
  if (videoUrl.includes('stream.mux.com')) {
    try {
      // Extract playback ID from Mux URL
      const playbackId = extractPlaybackIdFromMuxUrl(videoUrl);
      
      if (__DEV__ && false) { // Disabled by default
        log('🎬 [VideoPostUtils] Extracted playback ID:', playbackId);
      }
      
      if (playbackId) {
        const thumbnailUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0&width=400&height=600&fit_mode=smartcrop`;
        
        if (__DEV__ && false) { // Disabled by default
          log('🖼️ [VideoPostUtils] Generated Mux thumbnail:', thumbnailUrl);
        }
        
        return thumbnailUrl;
      }
    } catch (error) {
      if (__DEV__) {
        log('❌ [VideoPostUtils] Error generating Mux thumbnail:', error);
      }
    }
  }
  
  if (__DEV__ && false) { // Disabled by default
    log('⚠️ [VideoPostUtils] No thumbnail generated, returning empty string');
  }
  
  // Fallback: return a generic video icon
  return '';
};

/**
 * Extract playback ID from Mux URL
 */
const extractPlaybackIdFromMuxUrl = (url: string): string | null => {
  try {
    // Handle different Mux URL formats:
    // https://stream.mux.com/playbackId.m3u8
    // https://stream.mux.com/playbackId/high.mp4
    const match = url.match(/stream\.mux\.com\/([^\/\?]+)/);
    if (match) {
      let playbackId = match[1];
      // Remove .m3u8 extension if present
      if (playbackId.endsWith('.m3u8')) {
        playbackId = playbackId.replace('.m3u8', '');
      }
      return playbackId;
    }
    return null;
  } catch {
    return null;
  }
};



/**
 * Extract hashtags from post content
 */
const extractTagsFromContent = (content: string): string[] => {
  const hashtagRegex = /#[\w]+/g;
  const matches = content.match(hashtagRegex);
  return matches ? matches.map(tag => tag.substring(1)) : [];
};

/**
 * Filter posts to only show video posts
 */
export const getVideoPosts = (posts: Post[]): Post[] => {
  return posts.filter(post => post.video_url && post.video_url.trim() !== '');
};

/**
 * Check if a post is a video post
 */
export const isVideoPost = (post: Post): boolean => {
  return !!(post.video_url && post.video_url.trim() !== '');
};