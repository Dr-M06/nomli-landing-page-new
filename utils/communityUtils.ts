import { supabase } from './supabase';
import { ensureDbSetup } from './ensureDbSetup';
import { ensurePostBookmarksTable } from './ensurePostBookmarksTable';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBlockedUserIds, isUserBlocked } from './blockUser';
import { normalizeLitePosts, normalizeLitePost } from './liteModeUtils';
import {
  checkRateLimit,
  validateInputSecurity,
  logSecurityEvent,
  SecurityEventType,
  SecurityRiskLevel,
  sanitizeInput,
} from './securityManager';
import { validatePostContent, validateComment } from './contentFilter';
import { uploadToBunnyNet, isBunnyNetEnabled } from './bunnyNetStorage';
import { addGalleryItem } from './businessGallery';
import { getUserWallet, updateWalletBalance } from './walletService';
import { log, warn, error as logError } from './productionLogger';


/**
 * Types for community functionality
 */
export interface Post {
  id: string;
  user_id: string;
  user_email: string;
  content: string;
  location?: string;
  image_url?: string; // Single image URL
  image_urls?: string[]; // Array of image URLs
  video_url?: string; // Video URL for video posts
  created_at: string;
  updated_at: string;
  likes_count?: number;
  comments_count?: number;
  views_count?: number; // View count for video posts
  liked_by_user?: boolean;
  liked?: boolean; // Alias for liked_by_user
  /** First reactor's username for "Liked by X" display */
  liked_by_username?: string;
  bookmarked?: boolean; // Bookmark status
  bookmarks_count?: number; // Total bookmark count (without showing users)
  profile?: any;
  isBookmarked?: boolean;
  username?: string;
  display_name?: string;
  user_avatar_url?: string; // User's avatar URL
  surfaceVariant?: string; // Theme property
  isDeleting?: boolean; // Whether post is being deleted
  timing?: string | number; // Timing property for animations
  is_business?: boolean; // Business promotion post flag
  comments_disabled?: boolean; // Whether comments are locked/disabled
  is_verified?: boolean; // User verification status (from profile)
  is_pinned?: boolean; // Whether post is pinned by admin
  post_type?: 'standard' | 'poll' | 'question';
  /** When true, show as 18+ sensitive (blurred until user taps Show) */
  adult_content?: boolean;

  // Optional music attachment (library track or user's own song)
  audio_url?: string | null;
  audio_title?: string | null;
  audio_artist?: string | null;
  boost_expires_at?: string | null;

  // Poll/Q&A enrichments (loaded client-side)
  poll?: {
    question: string;
    expires_at?: string | null;
    locked_at?: string | null;
    show_results_mode?: 'after_vote' | 'after_expiry' | 'always';
    options: Array<{
      id: string;
      text: string;
      sort_order: number;
      vote_count: number;
    }>;
    my_vote_option_id?: string | null;
    total_votes: number;
  };
  question?: {
    question: string;
    answers_count: number;
    my_has_answered?: boolean;
    top_answers: Array<{
      id: string;
      user_id: string;
      answer: string;
      created_at: string;
      user?: { username?: string; full_name?: string; avatar_url?: string | null; is_verified?: boolean };
    }>;
  };

  // Client-only optimistic upload fields (not persisted in DB)
  client_temp_id?: string;
  client_upload_status?: 'queued' | 'uploading' | 'processing' | 'ready' | 'failed';
  client_upload_progress?: number;
  client_error?: string;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  user_email?: string; // User's email
  content: string;
  created_at: string;
  updated_at: string;
  username?: string;
  user_avatar?: string;
  profiles?: any;
  edited?: boolean;
  display_name?: string;
  likes_count?: number; // Number of likes on comment
  liked?: boolean; // Whether current user liked this comment
  reply_to?: string; // ID of comment being replied to
  reply_to_id?: string; // Alias for reply_to
  reply_to_username?: string; // Username of person being replied to
  currentReplyTo?: string; // Current reply target
  newComment?: string; // New comment input value
  is_pinned?: boolean; // Whether comment is pinned by admin
}

export interface Like {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface UserMetadata {
  id?: string;
  username?: string;
  avatar_url?: string;
  display_name?: string;
  email?: string;
}

// Simple in-memory caching for posts (for quick access)
const postsCache = new Map();
// Increased cache duration for slower connections (Nigeria) - cache lasts 3 minutes instead of 1
const POSTS_CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

/**
 * Clear posts cache (useful after blocking/unblocking users)
 */
export const clearPostsCache = async () => {
  log('[CommunityUtils] Clearing posts cache');
  postsCache.clear();
  
  // ⚠️ SKIP cloud cache deletion for posts - they're not cached in Cloudflare anymore
  // This prevents exceeding Cloudflare KV free tier limits
  // Posts are only cached locally in AsyncStorage (72 hour TTL)
  
  // Note: Persistent cache in AsyncStorage will be filtered on next load
};

// Persistent cache keys
const CACHE_KEY_PREFIX = 'community_posts_cache_';
const CACHE_TIMESTAMP_KEY_PREFIX = 'community_posts_timestamp_';
// NIGERIA-OPTIMIZED: Increased cache duration to 72 hours for faster loading
const PERSISTENT_CACHE_DURATION = 72 * 60 * 60 * 1000; // 72 hours for persistent cache (Nigeria-optimized)

/**
 * Load posts from persistent cache (AsyncStorage)
 * MEMORY-SAFE: Limits cache size to prevent heap overflow
 */
const loadCachedPosts = async (cacheKey: string): Promise<Post[] | null> => {
  try {
    // 1. Try local cache first (fastest)
    const cachedData = await AsyncStorage.getItem(CACHE_KEY_PREFIX + cacheKey);
    const timestampStr = await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY_PREFIX + cacheKey);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      // Check if cache is still valid (within 72 hours)
      if (now - timestamp < PERSISTENT_CACHE_DURATION) {
        // MEMORY-SAFE: Check cache size before parsing
        const cacheSizeKB = (cachedData.length * 2) / 1024; // UTF-16 encoding
        const MAX_CACHE_SIZE_KB = 2000; // 2MB limit to prevent memory issues
        
        if (cacheSizeKB > MAX_CACHE_SIZE_KB) {
          warn(`[CommunityUtils] ⚠️ Cache too large (${cacheSizeKB.toFixed(2)}KB), limiting parse to prevent memory issues`);
          // Parse in chunks or limit the data
          try {
            const allPosts: Post[] = JSON.parse(cachedData);
            // Limit to most recent 50 posts to prevent memory overflow
            const limitedPosts = allPosts.slice(0, 50);
            log(`[CommunityUtils] ✅ Loaded ${limitedPosts.length} posts from cache (limited from ${allPosts.length} to prevent memory issues)`);
            return limitedPosts;
          } catch (parseError) {
            logError('[CommunityUtils] Error parsing large cache, clearing it:', parseError);
            // Clear corrupted cache
            await AsyncStorage.multiRemove([
              CACHE_KEY_PREFIX + cacheKey,
              CACHE_TIMESTAMP_KEY_PREFIX + cacheKey
            ]);
            return null;
          }
        }
        
        try {
          const posts: Post[] = JSON.parse(cachedData);
          // MEMORY-SAFE: Limit to 100 posts max even if cache is valid
          const MAX_POSTS_TO_LOAD = 100;
          if (posts.length > MAX_POSTS_TO_LOAD) {
            log(`[CommunityUtils] ✅ Loading ${MAX_POSTS_TO_LOAD} posts from cache (limited from ${posts.length} for memory safety)`);
            return posts.slice(0, MAX_POSTS_TO_LOAD);
          }
          log(`[CommunityUtils] ✅ Loading posts from local cache (age: ${Math.round((now - timestamp) / 1000 / 60)} minutes, ${posts.length} posts)`);
          return posts;
        } catch (parseError) {
          logError('[CommunityUtils] Error parsing cache, clearing it:', parseError);
          // Clear corrupted cache
          await AsyncStorage.multiRemove([
            CACHE_KEY_PREFIX + cacheKey,
            CACHE_TIMESTAMP_KEY_PREFIX + cacheKey
          ]);
          return null;
        }
      } else {
        // Local cache expired, try cloud cache
        log(`[CommunityUtils] ⏰ Local cache expired, trying cloud cache...`);
      }
    }
    
    // ⚠️ SKIP cloud cache for posts - they change too frequently
    // This prevents exceeding Cloudflare KV free tier limits
    // Local AsyncStorage cache (72 hours) is sufficient for posts
    // Only profiles and nearby users use cloud cache (they change less frequently)
  } catch (error) {
    logError('[CommunityUtils] Error loading cached posts:', error);
  }
  return null;
};

/**
 * Save posts to persistent cache (AsyncStorage + Cloudflare)
 * Improved error handling for iOS storage limits
 * Also saves to Cloudflare for persistence across app reinstalls
 */
export const saveCachedPosts = async (cacheKey: string, posts: Post[]): Promise<void> => {
  try {
    const now = Date.now();
    
    // MEMORY-SAFE: Limit posts saved to cache to prevent memory issues
    const MAX_POSTS_TO_CACHE = 100; // Limit to 100 most recent posts
    const postsToCache = posts.slice(0, MAX_POSTS_TO_CACHE);
    
    const postsString = JSON.stringify(postsToCache);
    
    // Check cache size (iOS has stricter AsyncStorage limits ~6MB)
    // Estimate size: UTF-16 encoding uses 2 bytes per character
    const cacheSizeKB = (postsString.length * 2) / 1024;
    const MAX_CACHE_SIZE_KB = 2000; // 2MB hard limit
    
    if (cacheSizeKB > MAX_CACHE_SIZE_KB) {
      warn(`[CommunityUtils] ⚠️ Cache size (${cacheSizeKB.toFixed(2)}KB) exceeds limit, reducing further...`);
      // Reduce to 50 posts if still too large
      const reducedPosts = posts.slice(0, 50);
      const reducedString = JSON.stringify(reducedPosts);
      const reducedSizeKB = (reducedString.length * 2) / 1024;
      
      if (reducedSizeKB <= MAX_CACHE_SIZE_KB) {
        await AsyncStorage.multiSet([
          [CACHE_KEY_PREFIX + cacheKey, reducedString],
          [CACHE_TIMESTAMP_KEY_PREFIX + cacheKey, now.toString()]
        ]);
        log(`[CommunityUtils] ✅ Saved ${reducedPosts.length} posts to cache (${reducedSizeKB.toFixed(2)}KB, reduced from ${posts.length})`);
        return;
      } else {
        // Last resort: save only 20 posts
        const minimalPosts = posts.slice(0, 20);
        const minimalString = JSON.stringify(minimalPosts);
        await AsyncStorage.multiSet([
          [CACHE_KEY_PREFIX + cacheKey, minimalString],
          [CACHE_TIMESTAMP_KEY_PREFIX + cacheKey, now.toString()]
        ]);
        log(`[CommunityUtils] ✅ Saved minimal cache (${minimalPosts.length} posts) to stay under size limit`);
        return;
      }
    }
    
    if (cacheSizeKB > 1000) { // 1MB warning
      warn(`[CommunityUtils] ⚠️ Large cache size: ${cacheSizeKB.toFixed(2)}KB for key ${cacheKey}`);
    }
    
    // Save to local cache (AsyncStorage) - instant access
    await AsyncStorage.multiSet([
      [CACHE_KEY_PREFIX + cacheKey, postsString],
      [CACHE_TIMESTAMP_KEY_PREFIX + cacheKey, now.toString()]
    ]);
    
    // Verify cache was saved (important for iOS reliability)
    const verifyCache = await AsyncStorage.getItem(CACHE_KEY_PREFIX + cacheKey);
    if (verifyCache) {
      log(`[CommunityUtils] ✅ Saved ${postsToCache.length} posts to local cache (${cacheSizeKB.toFixed(2)}KB)`);
    } else {
      logError(`[CommunityUtils] ⚠️ Cache verification failed for key ${cacheKey} - data not saved!`);
    }
    
    // ⚠️ SKIP Cloudflare cache for posts - they change too frequently
    // This prevents exceeding Cloudflare KV free tier limits (1k writes/day)
    // Local AsyncStorage cache (72 hour TTL) is sufficient for posts
    // Only profiles and nearby users are cached in Cloudflare (they change less frequently)
  } catch (error: any) {
    logError('[CommunityUtils] Error saving cached posts:', error);
    
    // Handle iOS-specific storage quota errors
    if (error?.message?.includes('quota') || error?.message?.includes('storage') || error?.code === 'EUNSPECIFIED') {
      warn('[CommunityUtils] Storage quota exceeded, trying to save smaller cache...');
      try {
        // Save only essential posts (limit to 20 most recent)
        const limitedPosts = posts.slice(0, 20);
        const limitedString = JSON.stringify(limitedPosts);
        await AsyncStorage.multiSet([
          [CACHE_KEY_PREFIX + cacheKey, limitedString],
          [CACHE_TIMESTAMP_KEY_PREFIX + cacheKey, Date.now().toString()]
        ]);
        log(`[CommunityUtils] ✅ Saved limited cache (${limitedPosts.length} posts) after quota error`);
      } catch (retryError) {
        logError('[CommunityUtils] Failed to save even limited cache:', retryError);
      }
    }
  }
};

/**
 * Bootstrap posts cache at app startup - loads from persistent storage into in-memory
 * so getCachedPostsSync returns data instantly when community tab mounts.
 * Call this during splash/prepare in _layout.tsx.
 */
export const bootstrapPostsCacheForInstantLoad = async (): Promise<Post[] | null> => {
  const CACHE_KEYS_TO_TRY = [
    'posts_40_0_novideos',   // Community INITIAL_BATCH_SIZE
    'posts_50_0_novideos',
    'posts_all_0_novideos',
    'posts_all_0',
    'posts_5_0_novideos',    // Prefetch uses 5
  ];
  for (const key of CACHE_KEYS_TO_TRY) {
    try {
      const posts = await loadCachedPosts(key);
      if (posts && posts.length > 0) {
        const now = Date.now();
        postsCache.set(key, { posts, timestamp: now });
        // Populate posts_all_0 so getCachedPostsSync(undefined, 0) finds it
        postsCache.set('posts_all_0', { posts, timestamp: now });
        log(`[CommunityUtils] ✅ Bootstrapped ${posts.length} posts into memory (key: ${key})`);
        return posts;
      }
    } catch {
      // Try next key
    }
  }
  return null;
};

/**
 * Remove posts whose authors have profiles.is_suspended = true (home + community feeds).
 */
async function filterOutSuspendedAuthorPosts(postsToFilter: Post[]): Promise<Post[]> {
  if (!postsToFilter?.length) return postsToFilter;
  const ids = [...new Set(postsToFilter.map((p) => p.user_id).filter(Boolean))];
  if (ids.length === 0) return postsToFilter;
  try {
    const { data, error } = await supabase.from('profiles').select('id').in('id', ids).eq('is_suspended', true);
    if (error) {
      warn('[CommunityUtils] Suspended-author filter skipped:', error);
      return postsToFilter;
    }
    const suspended = new Set((data || []).map((r: { id: string }) => r.id));
    if (suspended.size === 0) return postsToFilter;
    const out = postsToFilter.filter((p) => !suspended.has(p.user_id));
    if (out.length < postsToFilter.length) {
      log(`[CommunityUtils] Dropped ${postsToFilter.length - out.length} post(s) from suspended author(s)`);
    }
    return out;
  } catch (e) {
    warn('[CommunityUtils] Suspended-author filter exception (non-fatal):', e);
    return postsToFilter;
  }
}

/** Sync strip when cached posts already include profile.is_suspended (e.g. after a fresh fetch). */
function filterOutSuspendedAuthorPostsSync(postsToFilter: Post[]): Post[] {
  if (!postsToFilter?.length) return postsToFilter;
  return postsToFilter.filter((p) => p.profile?.is_suspended !== true);
}

/**
 * Get cached posts synchronously from in-memory cache only (for instant initialization)
 * Returns null if no in-memory cache available
 * 
 * NIGERIA-OPTIMIZED: bootstrapPostsCacheForInstantLoad populates this at app startup
 */
export const getCachedPostsSync = (limit?: number, offset = 0): Post[] | null => {
  const cacheKey = limit ? `posts_${limit}_${offset}` : `posts_all_${offset}`;
  const now = Date.now();
  
  // 1. Check in-memory cache first (fastest)
  const inMemoryCache = postsCache.get(cacheKey);
  if (inMemoryCache && (now - inMemoryCache.timestamp < POSTS_CACHE_DURATION)) {
    return filterOutSuspendedAuthorPostsSync(inMemoryCache.posts);
  }
  
  // 2. Try to load from persistent cache (for Nigeria - prioritize cache)
  // Note: AsyncStorage is async, but we can trigger it and use it in next render
  // For now, return null and let async load handle it
  return null;
};

/**
 * Get cached posts immediately (for instant UI display)
 * Returns null if no cache available
 */
export const getCachedPosts = async (limit?: number, offset = 0): Promise<Post[] | null> => {
  const cacheKey = limit ? `posts_${limit}_${offset}` : `posts_all_${offset}`;

  // Get current user for filtering (works offline via cached session)
  let userId: string | undefined;
  try {
    const { data: currentUser } = await supabase.auth.getUser();
    userId = currentUser?.user?.id;
  } catch {
    try {
      const sessionStr = await AsyncStorage.getItem('supabase.auth.session');
      if (sessionStr) {
        const sessionData = JSON.parse(sessionStr);
        userId = sessionData?.user?.id;
      }
    } catch {
      // Offline / no session - will show all cached posts
    }
  }
  
  // Helper function to filter blocked users (bidirectional check) - OPTIMIZED
  // Use getBlockedUserIds once instead of checking each post individually
  const filterBlockedUsers = async (postsToFilter: Post[]): Promise<Post[]> => {
    if (!userId || !postsToFilter || postsToFilter.length === 0) {
      return postsToFilter || [];
    }
    
    try {
      // Get all blocked user IDs once (much faster than checking each post)
      const blockedUserIds = await getBlockedUserIds(userId);
      const blockedSet = new Set(blockedUserIds);
      
      // Filter posts in memory (fast, synchronous)
      const filtered = postsToFilter.filter(post => {
        // Always show user's own posts
        if (post.user_id === userId) {
          return true;
        }
        
        // Filter out posts from blocked users
        if (blockedSet.has(post.user_id)) {
          log(`[CommunityUtils] 🚫 Filtering cached post ${post.id} from blocked user ${post.user_id}`);
          return false;
        }
        
        return true;
      });
      
      return filtered;
    } catch (error) {
      logError(`[CommunityUtils] Error filtering blocked users in getCachedPosts:`, error);
      // Fail open - return all posts if filtering fails
      return postsToFilter;
    }
  };
  
  // Check in-memory cache first
  const now = Date.now();
  const inMemoryCache = postsCache.get(cacheKey);
  if (inMemoryCache && (now - inMemoryCache.timestamp < POSTS_CACHE_DURATION)) {
    return filterOutSuspendedAuthorPosts(await filterBlockedUsers(inMemoryCache.posts));
  }
  
  // Check persistent cache
  const cachedPosts = await loadCachedPosts(cacheKey);
  return cachedPosts ? filterOutSuspendedAuthorPosts(await filterBlockedUsers(cachedPosts)) : null;
};

const BOOST_COST_TOKENS = 10;
const BOOST_DURATION_HOURS = 24;

const isPostBoostActive = (post: Post, now = Date.now()): boolean => {
  if (!post.boost_expires_at) return false;
  const expiry = new Date(post.boost_expires_at).getTime();
  return Number.isFinite(expiry) && expiry > now;
};

/**
 * Home / feed ranking: active boost first, then engagement (likes + comments),
 * then likes alone, then newest first (so new posts are not pushed to the bottom).
 */
export const sortFeedPosts = (posts: Post[]): Post[] => {
  const now = Date.now();
  const freshWindowMs = 6 * 60 * 60 * 1000; // 6 hours: keep fresh posts visibly prioritized
  // Zaps (likes) weighted above comments so each zap bumps rank more than a single comment.
  const baseEngagement = (p: Post) => (p.likes_count || 0) * 2 + (p.comments_count || 0);
  // Recency assist: prevent brand‑new posts from being tanked by older high‑engagement posts.
  // Gives a meaningful bonus for the first day, then fades out to 0.
  const recencyBonus = (p: Post) => {
    const t = new Date(p.created_at).getTime();
    if (!Number.isFinite(t)) return 0;
    const ageMs = Math.max(0, now - t);
    const windowMs = 24 * 60 * 60 * 1000; // 24h
    if (ageMs >= windowMs) return 0;
    const frac = 1 - ageMs / windowMs; // 1..0
    return frac * 14; // up to ~14 points (≈7 likes) for freshest posts
  };
  const engagement = (p: Post) => baseEngagement(p) + recencyBonus(p);

  return [...posts].sort((a, b) => {
    const aBoosted = isPostBoostActive(a, now);
    const bBoosted = isPostBoostActive(b, now);

    if (aBoosted !== bBoosted) return aBoosted ? -1 : 1;

    if (aBoosted && bBoosted) {
      const aExpiry = new Date(a.boost_expires_at || 0).getTime();
      const bExpiry = new Date(b.boost_expires_at || 0).getTime();
      if (bExpiry !== aExpiry) return bExpiry - aExpiry;
    }

    // Fresh-first: within a short window, always show newest at the top
    // so brand-new posts don’t get buried by older high-engagement content.
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    const aIsFresh = Number.isFinite(aTime) && now - aTime < freshWindowMs;
    const bIsFresh = Number.isFinite(bTime) && now - bTime < freshWindowMs;
    if (aIsFresh || bIsFresh) {
      return bTime - aTime;
    }

    const engDiff = engagement(b) - engagement(a);
    if (engDiff !== 0) return engDiff;

    const likesDiff = (b.likes_count || 0) - (a.likes_count || 0);
    if (likesDiff !== 0) return likesDiff;

    return bTime - aTime;
  });
};

export type PostMediaKind = 'video' | 'photo' | 'text';

/** Classify feed item for even mixing (video vs photo vs text-only / polls / audio-only). */
export const getPostMediaKind = (post: Post): PostMediaKind => {
  const isVideo =
    (post as { isVideo?: boolean }).isVideo === true ||
    (!!post.video_url && String(post.video_url).trim().length > 0);
  if (isVideo) return 'video';

  const urls = post.image_urls;
  const hasMultiImages = Array.isArray(urls) && urls.length > 0;
  const hasSingleImage = !!post.image_url && String(post.image_url).trim().length > 0;
  if (hasMultiImages || hasSingleImage) return 'photo';

  return 'text';
};

/**
 * After ranking, round-robin merge so videos, photos, and text posts alternate evenly
 * while preserving relative order inside each group.
 */
export const interleavePostsByMediaKind = (posts: Post[]): Post[] => {
  const videos: Post[] = [];
  const photos: Post[] = [];
  const texts: Post[] = [];

  for (const p of posts) {
    const k = getPostMediaKind(p);
    if (k === 'video') videos.push(p);
    else if (k === 'photo') photos.push(p);
    else texts.push(p);
  }

  const out: Post[] = [];
  let vi = 0;
  let pi = 0;
  let ti = 0;
  while (vi < videos.length || pi < photos.length || ti < texts.length) {
    if (vi < videos.length) out.push(videos[vi++]);
    if (pi < photos.length) out.push(photos[pi++]);
    if (ti < texts.length) out.push(texts[ti++]);
  }
  return out;
};

/** Home feed: rank first, then interleave video → photo → text so the first card is rarely plain text when media exists. */
export const rankAndMixMediaForHome = (posts: Post[]): Post[] =>
  interleavePostsByMediaKind(sortFeedPosts(posts));

/**
 * If the first post is text-only but any photo/video exists later, move the first media post to the front (one swap).
 * Keeps For You / Following mixers from opening on a full-screen “hi” when richer posts exist.
 */
export const ensureLeadingHasMedia = (posts: Post[]): Post[] => {
  if (posts.length < 2) return posts;
  if (getPostMediaKind(posts[0]) !== 'text') return posts;
  const i = posts.findIndex((p) => getPostMediaKind(p) !== 'text');
  if (i <= 0) return posts;
  const out = posts.slice();
  const [item] = out.splice(i, 1);
  out.unshift(item);
  return out;
};

/**
 * Fetch all posts with additional metadata
 * Uses persistent cache for offline support and faster loading
 * Ranking: active boosts on top, then likes + comments, then recency.
 * @param limit - Maximum number of posts to fetch
 * @param offset - Pagination offset
 * @param useCache - Whether to use cached data
 * @param excludeVideos - Whether to exclude video posts (for community feed, since videos have their own tab)
 */
export const fetchPosts = async (limit?: number, offset = 0, useCache = true, excludeVideos = true): Promise<Post[]> => {
  const cacheKey = limit ? `posts_${limit}_${offset}${excludeVideos ? '_novideos' : ''}` : `posts_all_${offset}${excludeVideos ? '_novideos' : ''}`;
  
  try {
    // 1. Check in-memory cache first (fastest, but only lasts 1 minute)
    // BUT: Skip cache if useCache is false (for fresh data)
    const now = Date.now();
    if (useCache) {
      const inMemoryCache = postsCache.get(cacheKey);
      if (inMemoryCache && (now - inMemoryCache.timestamp < POSTS_CACHE_DURATION)) {
        log(`[CommunityUtils] Using in-memory cached posts (${inMemoryCache.posts.length} posts)`);
        return inMemoryCache.posts;
      }
    } else {
      log(`[CommunityUtils] 🔄 Cache bypassed - fetching fresh data from database (useCache=false)`);
    }
    
    // 2. NIGERIA-OPTIMIZED: Load persistent cache FIRST (only if useCache=true)
    // This makes the app feel instant even on slow networks
    let persistentCache: Post[] | null = null;
    if (useCache) {
      persistentCache = await loadCachedPosts(cacheKey);
      if (persistentCache && persistentCache.length > 0) {
        log(`[CommunityUtils] ✅ Found persistent cached posts (${persistentCache.length} posts)`);
        // Update in-memory cache immediately
        postsCache.set(cacheKey, {
          posts: persistentCache,
          timestamp: now
        });
      }
    }
    
    // Skip ensureDbSetup for faster loading - database should already be ready
    // Check network before auth check - if offline, use cached data
    const NetInfoModule = await import('@react-native-community/netinfo');
    const NetInfo = NetInfoModule.default;
    const netInfo = await NetInfo.fetch();
    
    // NIGERIA-OPTIMIZED: If offline, return cached posts immediately (don't require auth)
    if (!netInfo.isConnected && persistentCache && persistentCache.length > 0) {
      log(`[CommunityUtils] 📴 Offline detected - returning ${persistentCache.length} cached posts immediately`);
      
      // Try to get user from stored session (don't require network)
      let userId: string | undefined;
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const sessionStr = await AsyncStorage.getItem('supabase.auth.session');
        if (sessionStr) {
          const sessionData = JSON.parse(sessionStr);
          userId = sessionData?.user?.id;
        }
      } catch (error) {
        log('[CommunityUtils] Could not get user from stored session, showing all cached posts');
      }
      
      // If we have a user ID, try to filter blocked users (but don't fail if it doesn't work)
      if (userId) {
        try {
          const { getBlockedUserIds } = await import('./followersServiceFixed');
          // Try to get blocked users from cache (don't require network)
          const blockedUserIds = await getBlockedUserIds(userId);
          if (blockedUserIds && blockedUserIds.length > 0) {
            const blockedSet = new Set(blockedUserIds);
            const filtered = persistentCache.filter(post => 
              post.user_id === userId || !blockedSet.has(post.user_id)
            );
            log(`[CommunityUtils] Filtered ${persistentCache.length - filtered.length} blocked posts offline`);
            return filtered;
          }
        } catch (error) {
          // If filtering fails offline, return all cached posts (better than nothing)
          log('[CommunityUtils] Could not filter blocked users offline, showing all cached posts');
        }
      }
      
      // Return all cached posts if no user or filtering failed
      return persistentCache;
    }
    
    let userId: string | undefined;
    if (netInfo.isConnected) {
      try {
        const { data: currentUser } = await supabase.auth.getUser();
        userId = currentUser?.user?.id;
      } catch (authError) {
        // If auth check fails (network error), try to get user from stored session
        log('Auth check failed - trying to get user from stored session');
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          const sessionStr = await AsyncStorage.getItem('supabase.auth.session');
          if (sessionStr) {
            const sessionData = JSON.parse(sessionStr);
            userId = sessionData?.user?.id;
          }
        } catch (storageError) {
          log('Could not get user from stored session');
        }
      }
    } else {
      // Offline - try to get user from stored session
      log('Offline detected - getting user from stored session');
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const sessionStr = await AsyncStorage.getItem('supabase.auth.session');
        if (sessionStr) {
          const sessionData = JSON.parse(sessionStr);
          userId = sessionData?.user?.id;
        }
      } catch (storageError) {
        log('Could not get user from stored session');
      }
    }
    
    // Get blocked user IDs for filtering (bidirectional - includes both users who blocked current user and users current user blocked)
    let blockedUserIds: string[] = [];
    if (userId) {
      try {
        blockedUserIds = await getBlockedUserIds(userId);
        log(`[CommunityUtils] Found ${blockedUserIds.length} blocked users to filter (bidirectional)`);
        if (blockedUserIds.length > 0) {
          log(`[CommunityUtils] Blocked user IDs:`, blockedUserIds);
        }
      } catch (error) {
        logError('[CommunityUtils] Error getting blocked user IDs:', error);
      }
    }
    
    // Helper function to filter blocked users from posts (bidirectional blocking)
    // OPTIMIZED: Use pre-fetched blockedUserIds Set instead of calling isUserBlocked for each post
    const filterBlockedUsers = (postsToFilter: Post[]): Post[] => {
      if (!userId) {
        // No user logged in, return all posts
        return postsToFilter;
      }
      
      const beforeCount = postsToFilter.length;
      
      // Create a Set for O(1) lookup (much faster than array.includes)
      const blockedSet = new Set(blockedUserIds);
      
      // Filter posts synchronously using the pre-fetched blocked user IDs
      const filtered = postsToFilter.filter(post => {
        // Always show user's own posts
        if (post.user_id === userId) {
          return true;
        }
        
        // Filter out posts from blocked users (bidirectional blocking)
        if (blockedSet.has(post.user_id)) {
          log(`[CommunityUtils] 🚫 Filtering post ${post.id} from blocked user ${post.user_id} (current user: ${userId})`);
          return false;
        }
        
        // Post is not blocked, include it
        return true;
      });
      
      const filteredCount = beforeCount - filtered.length;
      if (filteredCount > 0) {
        log(`[CommunityUtils] ✅ Filtered out ${filteredCount} posts from blocked users (${beforeCount} -> ${filtered.length})`);
      } else if (blockedUserIds.length > 0) {
        log(`[CommunityUtils] No posts filtered (${beforeCount} posts checked, ${blockedUserIds.length} blocked users)`);
      }
      
      return filtered;
    };

    const applyBlockedAndSuspended = async (list: Post[]): Promise<Post[]> => {
      const blocked = filterBlockedUsers(list);
      return filterOutSuspendedAuthorPosts(blocked);
    };
    
    // 3. NIGERIA-OPTIMIZED: If we have cache AND useCache=true, return it immediately and fetch in background (only when online)
    // This ensures instant loading even on slow networks
    // When useCache=false (pull-to-refresh), skip this and go directly to database fetch
    if (persistentCache && persistentCache.length > 0 && useCache) {
      // Return cached data immediately (stale-while-revalidate pattern)
      const cachedResult = await applyBlockedAndSuspended(persistentCache);

      // Only fetch in background when online - don't hit network when offline
      if (netInfo.isConnected) {
        const backgroundFetch = async () => {
          try {
            log('[CommunityUtils] 🔄 Background refresh: Fetching fresh data from database...');
            const freshPosts = await fetchPosts(limit, offset, false, excludeVideos); // Force fresh data
            if (freshPosts && freshPosts.length > 0) {
              log(`[CommunityUtils] ✅ Background refresh: Found ${freshPosts.length} fresh posts (cache had ${cachedResult.length})`);
            } else {
              log('[CommunityUtils] Background refresh: No new posts found');
            }
          } catch (error) {
            warn('[CommunityUtils] Background refresh failed (non-critical):', error);
          }
        };
        backgroundFetch().catch(() => {});
      }

      return cachedResult;
    }
    
    // Check network status - if offline, return cached posts immediately (or empty so app stays usable)
    if (!netInfo.isConnected) {
      if (persistentCache && persistentCache.length > 0) {
        log(`[CommunityUtils] 📴 Offline - returning ${persistentCache.length} cached posts`);
        return applyBlockedAndSuspended(persistentCache);
      }
      log(`[CommunityUtils] 📴 Offline - no cache, returning empty (app remains usable)`);
      return [];
    }

    log(`[CommunityUtils] Fetching fresh posts${limit ? ` with limit ${limit}, offset ${offset}` : ' (all posts)'}`);
    
    // 4. Try to fetch fresh posts from Supabase (preferred over cache)
    let posts: any;
    let postsQueryError: any;
    try {
      let postsPromise;
      
      if (limit) {
        // Fetch with limit and offset (for pagination)
        // Note: We fetch profiles separately to avoid foreign key relationship errors
        log(`[CommunityUtils] Querying posts: limit=${limit}, offset=${offset}, range=${offset} to ${offset + limit - 1}, excludeVideos=${excludeVideos}`);
        let query = supabase
          .from('posts')
          .select('*');
        
        // Exclude video posts if requested (videos have their own dedicated tab)
        if (excludeVideos) {
          query = query.is('video_url', null);
        }
        
        // Keep page size stable across pagination to avoid overlaps/duplicates
        // that can make infinite scroll appear stuck on a small set of posts.
        const fetchLimit = limit;
        
        postsPromise = query
          .order('created_at', { ascending: false })
          .range(offset, offset + fetchLimit - 1);
      } else {
        // Fetch all posts without limit - use comprehensive fetch for large datasets
        // Supabase has a default limit of 1000 rows, so we need pagination
        log(`[CommunityUtils] No limit specified - using comprehensive fetch to get ALL posts (excludeVideos=${excludeVideos})`);
        const { fetchAllPostsComprehensive } = await import('./comprehensiveDataFetch');
        let allPosts = await fetchAllPostsComprehensive(userId, useCache);
        
        // Filter out video posts if requested (videos have their own dedicated tab)
        if (excludeVideos) {
          const beforeCount = allPosts.length;
          allPosts = allPosts.filter(post => !post.video_url);
          log(`[CommunityUtils] Filtered out ${beforeCount - allPosts.length} video posts (${beforeCount} -> ${allPosts.length})`);
        }
        
        // Enrich posts with profile data (including avatar URLs)
        if (allPosts.length > 0) {
          // Get user profiles for posts with retry logic
          const userIds = [...new Set(allPosts.map(post => post.user_id).filter(Boolean))];
          let profileMap: Record<string, any> = {};
          
          if (userIds.length > 0) {
            try {
              // Try to fetch profiles with timeout
              const profilePromise = supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url, is_verified, is_suspended')
                .in('id', userIds);
              
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
              );
              
              const result = await Promise.race([profilePromise, timeoutPromise]) as any;
              const profiles = result.data || [];
              
              profileMap = profiles.reduce((map: Record<string, any>, profile: any) => {
                map[profile.id] = profile;
                return map;
              }, {});
              
              log(`[CommunityUtils] ✅ Loaded ${profiles.length} profiles for ${userIds.length} users`);
            } catch (profileError) {
              warn('[CommunityUtils] Profile fetch failed or timed out, using fallbacks:', profileError);
              // Continue without profiles - will use fallbacks below
            }
          }
          
          // Add profile data to each post with better fallbacks
          allPosts.forEach(post => {
            post.profile = profileMap[post.user_id] || null;
            post.user_avatar_url = post.profile?.avatar_url || null;
            post.is_verified = post.profile?.is_verified || false;
            
            // Set username for display with better fallbacks
            if (post.display_name) {
              post.username = post.display_name;
            } else if (post.profile?.username) {
              post.username = post.profile.username;
            } else if (post.profile?.full_name) {
              post.username = post.profile.full_name;
            } else if (post.user_email) {
              post.username = post.user_email.split('@')[0];
            } else if (post.user_id) {
              // Use user ID as last resort (better than "Unknown User")
              post.username = `user_${post.user_id.substring(0, 8)}`;
            } else {
              post.username = 'Unknown User';
            }
          });

          const beforeSusAll = allPosts.length;
          allPosts = allPosts.filter((post) => post.profile?.is_suspended !== true);
          if (beforeSusAll !== allPosts.length) {
            log(
              `[CommunityUtils] Removed ${beforeSusAll - allPosts.length} post(s) from suspended authors (comprehensive) (${beforeSusAll} -> ${allPosts.length})`
            );
          }
        }
        
        // Apply ranking before cache/return.
        allPosts = sortFeedPosts(allPosts);

        // Cache the results
        if (allPosts.length > 0) {
          postsCache.set(cacheKey, {
            posts: allPosts,
            timestamp: now
          });
          await saveCachedPosts(cacheKey, allPosts);
        }
        return filterBlockedUsers(allPosts);
      }
      
      // Timeout strategy:
      // - For the first page (offset=0), fail fast and fall back to cache for instant UX.
      // - For pagination (offset>0), allow more time so older posts can load reliably on slow networks.
      const timeoutMs = offset > 0 ? 25000 : 10000;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Posts query timeout')), timeoutMs);
      });
      
      const result = await Promise.race([postsPromise, timeoutPromise]) as any;
      posts = result.data;
      postsQueryError = result.error;
    } catch (timeoutError) {
      warn('[CommunityUtils] Posts query timed out or network error');
      // Return cached data if available (offline scenario)
      if (persistentCache && persistentCache.length > 0) {
        log('[CommunityUtils] Returning persistent cached data due to timeout/network error');
        return applyBlockedAndSuspended(persistentCache);
      }
      // Fall back to in-memory cache
      const inMemoryCache = postsCache.get(cacheKey);
      if (inMemoryCache) {
        log('[CommunityUtils] Returning in-memory cached data due to timeout');
        return applyBlockedAndSuspended(inMemoryCache.posts);
      }
      return []; // Return empty array if no cache available
    }
    
    if (postsQueryError) {
      logError('[CommunityUtils] Error fetching posts:', postsQueryError);
      // Return cached data if available (offline scenario)
      if (persistentCache && persistentCache.length > 0) {
        log('[CommunityUtils] Returning persistent cached data due to fetch error');
        return applyBlockedAndSuspended(persistentCache);
      }
      // Fall back to in-memory cache
      const inMemoryCache = postsCache.get(cacheKey);
      if (inMemoryCache) {
        log('[CommunityUtils] Returning in-memory cached data due to fetch error');
        return applyBlockedAndSuspended(inMemoryCache.posts);
      }
      return [];
    }
    
    if (!posts || (posts?.length || 0) === 0) {
      log('[CommunityUtils] No posts found');
      return [];
    }
    
    log(`[CommunityUtils] Fetched ${posts?.length || 0} posts, processing...`);
    
    // Filter blocked users from posts (bidirectional check)
    posts = filterBlockedUsers(posts);
    
    // Filter out posts with Cloudinary video URLs (service deactivated)
    posts = posts.filter(post => {
      if (post.video_url && post.video_url.includes('cloudinary.com')) {
        log(`[CommunityUtils] Filtering out Cloudinary video post (service deactivated): ${post.id}`);
        return false;
      }
      return true;
    });
    
    log(`[CommunityUtils] After filtering: ${posts?.length || 0} posts remaining`);
    
    // Helper function to validate image URLs
    const isValidImageUrl = (url?: string) => {
      if (!url) return false;
      // Accept URLs from Supabase storage
      if (url.includes('supabase.co/storage/v1/object/public/')) {
        return true;
      }
      // Must be a valid http(s) URL or a data URL
      return url.startsWith('http://') || 
             url.startsWith('https://') || 
             url.startsWith('data:image/');
    };
    
    // Get user profiles for posts with retry logic
    const userIds = [...new Set(posts.map(post => post.user_id).filter(Boolean))];
    let profileMap: Record<string, any> = {};
    
    if (userIds.length > 0) {
      try {
        // Try to fetch profiles with timeout
        const profilePromise = supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, is_verified, is_suspended')
          .in('id', userIds);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
        );
        
        const result = await Promise.race([profilePromise, timeoutPromise]) as any;
        const profiles = result.data || [];
        
        profileMap = profiles.reduce((map: Record<string, any>, profile: any) => {
          map[profile.id] = profile;
          return map;
        }, {});
        
        log(`[CommunityUtils] ✅ Loaded ${profiles.length} profiles for ${userIds.length} users`);
      } catch (profileError) {
        warn('[CommunityUtils] Profile fetch failed or timed out, using fallbacks:', profileError);
        // Continue without profiles - will use fallbacks below
      }
    }
    
    // Process each post to ensure it has valid data
    // Note: Lite mode has been disabled - all users use normal mode
    posts.forEach(post => {
      // Normalize post data (handles edge cases and ensures consistent format)
      const normalizedPost = normalizeLitePost(post);
      Object.assign(post, normalizedPost);
      
      // Add profile data
      post.profile = profileMap[post.user_id] || null;
      
      // Set verification status from profile
      post.is_verified = post.profile?.is_verified || false;
      
      // Set avatar URL from profile (ensures avatar displays correctly)
      post.user_avatar_url = post.profile?.avatar_url || null;
      
      // Set username for display with better fallbacks
      if (post.display_name) {
        post.username = post.display_name;
      } else if (post.profile?.username) {
        post.username = post.profile.username;
      } else if (post.profile?.full_name) {
        post.username = post.profile.full_name;
      } else if (post.user_email) {
        // Extract username from email (part before @)
        post.username = post.user_email.split('@')[0];
      } else if (post.user_id) {
        // Use user ID as last resort (better than "Unknown User")
        post.username = `user_${post.user_id.substring(0, 8)}`;
      } else {
        post.username = 'Unknown User';
      }
      
      // Clean up and validate the single image_url field
      // In lite mode, image_url is null - handle gracefully
      if (post.image_url && !isValidImageUrl(post.image_url)) {
        log(`[CommunityUtils] Invalid image_url found for post ${post.id}:`, post.image_url);
        post.image_url = null;
      }
      
      // Ensure image URLs are valid
      if (post.image_urls) {
        // If image_urls is a string, try to parse it as JSON
        if (typeof post.image_urls === 'string') {
          try {
            post.image_urls = JSON.parse(post.image_urls);
          } catch (e) {
            log('[CommunityUtils] Could not parse image_urls as JSON:', post.image_urls);
            post.image_urls = [];
          }
        }
        
        // Filter out any invalid URLs or null values
        if (Array.isArray(post.image_urls)) {
          post.image_urls = post.image_urls.filter(url => 
            url && typeof url === 'string' && url.trim() !== '' && isValidImageUrl(url)
          );
        } else {
          post.image_urls = [];
        }
      }
      
      // If we have no image_urls but have a single image_url, add it to image_urls
      if ((!post.image_urls || (post.image_urls?.length || 0) === 0) && post.image_url) {
        post.image_urls = [post.image_url];
      }
      
      // Ensure null/undefined video_url is handled gracefully
      if (post.video_url && !isValidImageUrl(post.video_url)) {
        post.video_url = null;
      }
      
      // Initialize counts if missing
      post.likes_count = post.likes_count || 0;
      post.comments_count = post.comments_count || 0;
    });

    const beforeSuspended = posts.length;
    posts = posts.filter((post) => post.profile?.is_suspended !== true);
    if (beforeSuspended !== posts.length) {
      log(
        `[CommunityUtils] Removed ${beforeSuspended - posts.length} post(s) from suspended author(s) (${beforeSuspended} -> ${posts.length})`
      );
    }

    const postIds = posts.map((post) => post.id);
    // Filter out placeholder posts - they're in-app only, not from database
    const realPostIds = postIds.filter(
      (id) => !id.startsWith('placeholder-post-') && !id.startsWith('bundled-offline-post-')
    );
    
    // Merge post_reactions + post_likes (Zap/home uses post_likes; some surfaces use post_reactions).
    // Previously we used only one table when the other had rows, which dropped likes after reload.
    let allLikesCombined: { post_id: string; user_id: string }[] = [];
    
    if (realPostIds.length > 0) {
      const seenLikeKeys = new Set<string>();
      const pushLike = (post_id: string, user_id: string) => {
        if (!post_id || !user_id) return;
        const k = `${post_id}\0${user_id}`;
        if (seenLikeKeys.has(k)) return;
        seenLikeKeys.add(k);
        allLikesCombined.push({ post_id, user_id });
      };

      const { data: reactionRows, error: reactionsError } = await supabase
        .from('post_reactions')
        .select('post_id, user_id')
        .in('post_id', realPostIds);
      if (reactionsError) {
        warn('[CommunityUtils] post_reactions fetch failed (non-critical):', reactionsError);
      } else if (reactionRows?.length) {
        for (const r of reactionRows) {
          pushLike(r.post_id, r.user_id);
        }
      }

      const { data: likeRows, error: likesError } = await supabase
        .from('post_likes')
        .select('post_id, user_id')
        .in('post_id', realPostIds);
      if (likesError) {
        logError('Error fetching post_likes:', likesError);
      } else if (likeRows?.length) {
        for (const l of likeRows) {
          pushLike(l.post_id, l.user_id);
        }
      }
    }
    
    // Filter out likes from blocked users (bidirectional blocking)
    let filteredLikes = allLikesCombined;
    if (userId && blockedUserIds.length > 0) {
      const beforeCount = filteredLikes.length;
      filteredLikes = filteredLikes.filter(like => !blockedUserIds.includes(like.user_id));
      const filteredCount = beforeCount - filteredLikes.length;
      if (filteredCount > 0) {
        log(`[CommunityUtils] 🚫 Filtered out ${filteredCount} likes from blocked users`);
      }
    }
    
    // Filter out placeholder accounts so they never contribute to reaction counts or "Liked by"
    const likerIds = [...new Set(filteredLikes.map(like => like.user_id))];
    let placeholderUserIds: Set<string> = new Set();
    if (likerIds.length > 0) {
      const { data: likerProfilesCheck } = await supabase
        .from('profiles')
        .select('id')
        .in('id', likerIds)
        .eq('is_placeholder', true);
      if (likerProfilesCheck?.length) {
        placeholderUserIds = new Set(likerProfilesCheck.map((p: { id: string }) => p.id));
        const beforeCount = filteredLikes.length;
        filteredLikes = filteredLikes.filter(like => !placeholderUserIds.has(like.user_id));
        if (beforeCount > filteredLikes.length) {
          log(`[CommunityUtils] 🚫 Excluded ${beforeCount - filteredLikes.length} placeholder likes from counts`);
        }
      }
    }
    
    // Group likes by post ID and count them (excluding blocked and placeholder users)
    const likesCountMap: Record<string, number> = {};
    const userLikedPosts = new Set<string>();
    const likedByUserMap: Record<string, string> = {}; // Store first liker's username per post
    
    // Initialize all posts with 0 likes
    postIds.forEach(postId => {
      likesCountMap[postId] = 0;
    });
    
    // Get user profiles for all likers to get usernames
    const likerUserIds = [...new Set(filteredLikes.map(like => like.user_id))];
    let likerProfiles: Record<string, any> = {};
    
    if (likerUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name')
        .in('id', likerUserIds);
      
      if (profiles) {
        likerProfiles = profiles.reduce((acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        }, {} as Record<string, any>);
      }
    }
    
    filteredLikes.forEach(like => {
      const postId = like.post_id;
      likesCountMap[postId] = (likesCountMap[postId] || 0) + 1;
      
      // Store first liker's username for "Liked by" display (oldest like first)
      if (!likedByUserMap[postId] && likerProfiles[like.user_id]) {
        likedByUserMap[postId] = likerProfiles[like.user_id].username || likerProfiles[like.user_id].full_name || 'someone';
      }
      
      if (like.user_id === userId) {
        userLikedPosts.add(postId);
      }
    });
    
    // Update likes info in posts
    // Use live count (from post_reactions/post_likes, excluding placeholders) so placeholder removal is reflected
    posts.forEach(post => {
      post.likes_count = (likesCountMap[post.id] ?? post.likes_count) ?? 0;
      post.liked_by_user = userLikedPosts.has(post.id);
      post.liked_by_username = likedByUserMap[post.id]; // Add first liker's username
    });
    
    // Live comment counts from post_comments (stored posts.comments_count can stay 0 if not maintained)
    if (realPostIds.length > 0) {
      const { data: allComments, error: commentsError } = await supabase
        .from('post_comments')
        .select('post_id')
        .in('post_id', realPostIds);
      
      if (commentsError) {
        logError('Error fetching comments:', commentsError);
      } else {
        const commentsCountMap = allComments?.reduce((acc, comment) => {
          acc[comment.post_id] = (acc[comment.post_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        posts.forEach(post => {
          if (realPostIds.includes(post.id)) {
            post.comments_count = commentsCountMap?.[post.id] ?? 0;
          }
        });
      }
    }
    
    // Get view counts for video posts from post_views table (if it exists)
    // This ensures accurate counts for old videos
    const videoPostIds = posts.filter(p => p.video_url).map(p => p.id);
    if (videoPostIds.length > 0) {
      try {
        // Check if post_views table exists by trying to query it
        const { data: postViewsData, error: viewsError } = await supabase
          .from('post_views')
          .select('post_id')
          .in('post_id', videoPostIds)
          .limit(1);
        
        // If table exists and query succeeded, get actual counts
        if (!viewsError && postViewsData !== null) {
          const { data: allViews, error: allViewsError } = await supabase
            .from('post_views')
            .select('post_id')
            .in('post_id', videoPostIds);
          
          if (!allViewsError && allViews) {
            // Count views per post
            const viewsCountMap = allViews.reduce((acc, view) => {
              acc[view.post_id] = (acc[view.post_id] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            
            // Update views_count for video posts
            // CRITICAL: Never decrease counts - always use the highest value from all sources
            // Priority: database views_count > post_video_views table > post_views table
            const videoPosts = posts.filter(post => post.video_url);
            if (videoPosts.length > 0) {
              // Batch check post_video_views for all video posts at once (more efficient)
              const videoPostIds = videoPosts.map(p => p.id);
              
              try {
                // Get counts from post_video_views table for all posts at once
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
                    const postViewsCount = viewsCountMap[post.id] || 0;
                    const videoViewsCount = videoViewsCountMap[post.id] || 0;
                    
                    // Use the maximum of all sources
                    const maxCount = Math.max(currentViewsCount, postViewsCount, videoViewsCount);
                    
                    // Only update if we found a higher count
                    if (maxCount > currentViewsCount) {
                      post.views_count = maxCount;
                    }
                  });
                } else {
                  // If post_video_views query fails, just use Math.max of current and post_views
                  videoPosts.forEach(post => {
                    const currentViewsCount = post.views_count || 0;
                    const postViewsCount = viewsCountMap[post.id] || 0;
                    post.views_count = Math.max(currentViewsCount, postViewsCount);
                  });
                }
              } catch (error) {
                // If error, just use Math.max of current and post_views (never decrease)
                videoPosts.forEach(post => {
                  const currentViewsCount = post.views_count || 0;
                  const postViewsCount = viewsCountMap[post.id] || 0;
                  post.views_count = Math.max(currentViewsCount, postViewsCount);
                });
              }
            }
          }
        }
      } catch (error) {
        // If post_views table doesn't exist or query fails, just use views_count column
        log('[CommunityUtils] post_views table not available, using views_count column');
      }
    }
    
    // Get all bookmarks for these posts (both for user status and counts)
    const { data: allBookmarks, error: bookmarksError } = await supabase
        .from('post_bookmarks')
      .select('post_id, user_id')
        .in('post_id', postIds);
      
      if (bookmarksError) {
        logError('Error fetching bookmarks:', bookmarksError);
      } else {
      // Group bookmarks by post ID and count them
      const bookmarksCountMap: Record<string, number> = {};
      const bookmarkedPostIds = new Set<string>();
      
      allBookmarks?.forEach(bookmark => {
        bookmarksCountMap[bookmark.post_id] = (bookmarksCountMap[bookmark.post_id] || 0) + 1;
        
        // Check if current user bookmarked this post
        if (userId && bookmark.user_id === userId) {
          bookmarkedPostIds.add(bookmark.post_id);
        }
      });
        
      // Update bookmarked status and count in posts
        posts.forEach(post => {
          post.isBookmarked = bookmarkedPostIds.has(post.id);
        post.bookmarks_count = bookmarksCountMap[post.id] || 0;
        });
    }

    // Enrich poll + Q&A metadata for this page of posts
    try {
      const pollPostIds = posts.filter(p => p.post_type === 'poll').map(p => p.id);
      const questionPostIds = posts.filter(p => p.post_type === 'question').map(p => p.id);

      if (pollPostIds.length > 0) {
        const [{ data: polls }, { data: options }, { data: votes }, myVotesRes] = await Promise.all([
          supabase.from('post_polls').select('post_id, question, expires_at, locked_at, show_results_mode').in('post_id', pollPostIds),
          supabase.from('post_poll_options').select('id, post_id, option_text, sort_order').in('post_id', pollPostIds),
          supabase.from('post_poll_votes').select('post_id, option_id, user_id').in('post_id', pollPostIds),
          userId
            ? supabase.from('post_poll_votes').select('post_id, option_id').eq('user_id', userId).in('post_id', pollPostIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const voteCountsByOption: Record<string, number> = {};
        const totalVotesByPost: Record<string, number> = {};
        (votes || []).forEach(v => {
          voteCountsByOption[v.option_id] = (voteCountsByOption[v.option_id] || 0) + 1;
          totalVotesByPost[v.post_id] = (totalVotesByPost[v.post_id] || 0) + 1;
        });

        const myVoteByPost: Record<string, string> = {};
        (myVotesRes as any)?.data?.forEach((v: any) => {
          myVoteByPost[v.post_id] = v.option_id;
        });

        const pollByPost: Record<string, any> = {};
        (polls || []).forEach(p => {
          pollByPost[p.post_id] = p;
        });

        const optionsByPost: Record<string, any[]> = {};
        (options || []).forEach(o => {
          if (!optionsByPost[o.post_id]) optionsByPost[o.post_id] = [];
          optionsByPost[o.post_id].push({
            id: o.id,
            text: o.option_text,
            sort_order: o.sort_order,
            vote_count: voteCountsByOption[o.id] || 0,
          });
        });

        posts.forEach(p => {
          if (p.post_type !== 'poll') return;
          const pp = pollByPost[p.id];
          if (!pp) return;
          p.poll = {
            question: pp.question,
            expires_at: pp.expires_at,
            locked_at: pp.locked_at,
            show_results_mode: pp.show_results_mode,
            options: (optionsByPost[p.id] || []).sort((a, b) => a.sort_order - b.sort_order),
            my_vote_option_id: myVoteByPost[p.id] || null,
            total_votes: totalVotesByPost[p.id] || 0,
          };
        });
      }

      if (questionPostIds.length > 0) {
        const [{ data: questions }, { data: answers }] = await Promise.all([
          supabase.from('post_questions').select('post_id, question').in('post_id', questionPostIds),
          supabase
            .from('post_question_answers')
            .select('id, post_id, user_id, answer, created_at, is_hidden')
            .in('post_id', questionPostIds)
            .order('created_at', { ascending: false })
            .limit(250),
        ]);

        const questionByPost: Record<string, any> = {};
        (questions || []).forEach(q => {
          questionByPost[q.post_id] = q;
        });

        const answersByPost: Record<string, any[]> = {};
        const answersCountByPost: Record<string, number> = {};
        const myAnsweredByPost: Record<string, boolean> = {};

        (answers || []).forEach(a => {
          if (a.is_hidden) return;
          answersCountByPost[a.post_id] = (answersCountByPost[a.post_id] || 0) + 1;
          if (!answersByPost[a.post_id]) answersByPost[a.post_id] = [];
          if ((answersByPost[a.post_id]?.length || 0) < 2) {
            answersByPost[a.post_id].push(a);
          }
          if (userId && a.user_id === userId) myAnsweredByPost[a.post_id] = true;
        });

        posts.forEach(p => {
          if (p.post_type !== 'question') return;
          const qq = questionByPost[p.id];
          if (!qq) return;
          p.question = {
            question: qq.question,
            answers_count: answersCountByPost[p.id] || 0,
            my_has_answered: !!myAnsweredByPost[p.id],
            top_answers: (answersByPost[p.id] || []).map(a => ({
              id: a.id,
              user_id: a.user_id,
              answer: a.answer,
              created_at: a.created_at,
            })),
          };
        });
      }
    } catch (e) {
      // Non-critical: if these tables/columns aren't available yet, the feed should still work.
      warn('[CommunityUtils] Poll/Q&A enrich failed (non-critical):', e);
    }
    
    // Ranking: apply only for the first page. Pagination should remain stable and non-overlapping.
    if (offset === 0) {
      posts = sortFeedPosts(posts);
      // If we fetched more than requested (for ranking), take only the top posts
      if (limit && posts.length > limit) {
        const originalLength = posts.length;
        posts = posts.slice(0, limit);
        log(`[CommunityUtils] ✅ Ranked and selected top ${limit} posts from ${originalLength} fetched`);
      } else {
        log(`[CommunityUtils] ✅ Applied feed ranking (boost + engagement) for ${posts.length} posts`);
      }
    } else {
      // Keep DB order (created_at desc) for pagination.
      log(`[CommunityUtils] Pagination page (offset=${offset}) - skipping ranking to avoid duplicates`);
    }
    
    // Cache the results (both in-memory and persistent)
    postsCache.set(cacheKey, {
      posts: posts,
      timestamp: now
    });
    
    // Save to persistent cache (AsyncStorage) for offline support
    await saveCachedPosts(cacheKey, posts);
    
    return posts;
  } catch (error) {
    logError('Exception in fetchPosts:', error);
    return [];
  }
};

/**
 * Fetch a single post by ID with comments
 */
export const fetchPostById = async (postId: string): Promise<Post | null> => {
  try {
    await ensureDbSetup();
    
    const { data: currentUser } = await supabase.auth.getUser();
    const userId = currentUser?.user?.id;
    
    // Fetch the post
    const { data: post, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle(); // Use maybeSingle() to handle 0 rows gracefully
    
    if (error) {
      // PGRST116 means "no rows returned" - post doesn't exist
      if (error.code === 'PGRST116') {
        log(`[CommunityUtils] Post ${postId} not found (may have been deleted)`);
      } else {
        logError('Error fetching post:', error);
      }
      return null;
    }
    
    if (!post) {
      log(`[CommunityUtils] Post ${postId} not found`);
      return null;
    }
    
    // Check if users are blocked (bidirectional check)
    if (userId && userId !== post.user_id) {
      try {
        const blocked = await isUserBlocked(userId, post.user_id);
        if (blocked) {
          log(`[CommunityUtils] Post ${postId} is from blocked user ${post.user_id}, returning null`);
          return null;
        }
      } catch (error) {
        logError('[CommunityUtils] Error checking block status for post:', error);
        // Continue if check fails
      }
    }
    
    // Get the post author's profile
    if (post.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', post.user_id)
        .single();
      
      if (profile) {
        post.profile = profile;
      }
      
      // Set username for display with better fallbacks
      if (post.display_name) {
        post.username = post.display_name;
      } else if (post.profile?.username) {
        post.username = post.profile.username;
      } else if (post.profile?.full_name) {
        post.username = post.profile.full_name;
      } else if (post.user_email) {
        // Extract username from email (part before @)
        post.username = post.user_email.split('@')[0];
      } else if (post.user_id) {
        // Use user ID as last resort (better than "Unknown User")
        post.username = `user_${post.user_id.substring(0, 8)}`;
      } else {
        post.username = 'Unknown User';
      }
    }
    
    // If it's a placeholder post, fetch likes from placeholder_post_likes table
    // Placeholders are in-app only - no database queries needed
    if (postId.startsWith('placeholder-post-') || postId.startsWith('bundled-offline-post-')) {
        // Check bookmark status (still using AsyncStorage for bookmarks)
      if (userId) {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const bookmarkKey = `bookmark_placeholder_${userId}_${postId}`;
            const bookmarked = await AsyncStorage.getItem(bookmarkKey);
        post.isBookmarked = bookmarked === 'true';
      }
      
      // Keep original likes_count and liked_by_user from placeholder data (in-app only)
      return post;
    }
    
    // Get accurate like and comment counts in parallel (only for real posts)
    const [likesData, commentsData, userLikeData, userBookmarkData] = await Promise.all([
      // Get likes count
      supabase
        .from('post_likes')
        .select('id', { count: 'exact' })
        .eq('post_id', postId),
        
      // Get comments count
      supabase
        .from('post_comments')
        .select('id', { count: 'exact' })
        .eq('post_id', postId),
        
      // Check if current user liked this post
      userId ? 
        supabase
          .from('post_likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', userId)
          .maybeSingle() 
        : Promise.resolve({ data: null }),
        
      // Check if current user bookmarked this post
      userId ? 
        supabase
          .from('post_bookmarks')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', userId)
          .maybeSingle() 
        : Promise.resolve({ data: null })
    ]);
    
    // Set counts and statuses
    post.likes_count = likesData.count || 0;
    post.comments_count = commentsData.count || 0;
    post.liked_by_user = !!userLikeData.data;
    post.isBookmarked = !!userBookmarkData.data;

    // First reactor's username for "Liked by X" (post_reactions then post_likes)
    if ((post.likes_count || 0) > 0) {
      const { data: firstReaction } = await supabase
        .from('post_reactions')
        .select('user_id')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      let firstUserId = firstReaction?.user_id;
      if (!firstUserId) {
        const { data: firstLike } = await supabase
          .from('post_likes')
          .select('user_id')
          .eq('post_id', postId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        firstUserId = firstLike?.user_id;
      }
      if (firstUserId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, full_name')
          .eq('id', firstUserId)
          .maybeSingle();
        const name = profile?.username || profile?.full_name || 'someone';
        post.liked_by_username = (typeof name === 'string' ? name : 'someone').trim() || 'someone';
      }
    }

    return post;
  } catch (error) {
    logError('Exception in fetchPostById:', error);
    return null;
  }
};

/**
 * Ensure the post-images bucket exists in Supabase storage
 */
export const ensurePostImagesBucketExists = async (): Promise<boolean> => {
  try {
    log('[PostImages] Checking if post-images bucket exists...');
    
    // Check if the post-images bucket exists
    const { data: buckets, error } = await supabase
      .storage
      .listBuckets();
      
    if (error) {
      logError('[PostImages] Error checking storage buckets:', error);
      return false;
    }
    
    // Check if post-images bucket exists
    const postImagesBucketExists = buckets.some(bucket => bucket.name === 'post-images');
    
    // If it doesn't exist, create it
    if (!postImagesBucketExists) {
      log('[PostImages] Creating post-images bucket...');
      const { error: createError } = await supabase
        .storage
        .createBucket('post-images', {
          public: true,
          fileSizeLimit: 1024 * 1024 * 5, // 5MB
        });
        
      if (createError) {
        // Check if error is because bucket already exists (race condition)
        if (createError.message?.includes('already exists') || 
            createError.message?.includes('duplicate') ||
            createError.message?.includes('The resource already exists')) {
          log('[PostImages] post-images bucket already exists (race condition)');
          return true;
        }
        
        logError('[PostImages] Error creating post-images bucket:', createError);
        return false;
      }
      
      log('[PostImages] post-images bucket created successfully');
    } else {
      log('[PostImages] post-images bucket already exists');
    }
    
    return true;
  } catch (error) {
    logError('[PostImages] Error in ensurePostImagesBucketExists:', error);
    
    // If it's an "already exists" error, treat it as success
    if (error instanceof Error && error.message?.includes('already exists')) {
      log('[PostImages] Bucket already exists - treating as success');
      return true;
    }
    
    return false;
  }
};

/** Bucket name for post audio uploads (user's own song). */
const POST_AUDIO_BUCKET = 'post-audio';

/**
 * Ensure the post-audio bucket exists in Supabase storage.
 */
export const ensurePostAudioBucketExists = async (): Promise<boolean> => {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      logError('[PostAudio] Error checking storage buckets:', error);
      return false;
    }
    const exists = buckets.some(b => b.name === POST_AUDIO_BUCKET);
    if (!exists) {
      const { error: createError } = await supabase.storage.createBucket(POST_AUDIO_BUCKET, {
        public: true,
        fileSizeLimit: 1024 * 1024 * 15, // 15MB for audio
      });
      if (createError && !createError.message?.includes('already exists')) {
        logError('[PostAudio] Error creating bucket:', createError);
        return false;
      }
    }
    return true;
  } catch (e) {
    logError('[PostAudio] ensurePostAudioBucketExists:', e);
    return false;
  }
};

/** Map file extension to Content-Type for audio upload. */
function getAudioContentType(fileUri: string): string {
  const ext = (fileUri.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
  };
  return map[ext] || 'audio/mpeg';
}

/**
 * Upload post audio (user's own song) to Supabase storage.
 * Returns public URL or null on failure.
 */
export const uploadPostAudio = async (fileUri: string, userId: string): Promise<string | null> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      logError('[PostAudio] File does not exist:', fileUri);
      return null;
    }
    const timestamp = Date.now();
    const ext = fileUri.split('.').pop() || 'mp3';
    const fileName = `post_${userId}_${timestamp}.${ext}`;
    const contentType = getAudioContentType(fileUri);

    const bucketOk = await ensurePostAudioBucketExists();
    if (!bucketOk) return null;

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(POST_AUDIO_BUCKET)
      .createSignedUploadUrl(fileName, { upsert: true });

    if (signedUrlError || !signedUrlData?.signedUrl) {
      logError('[PostAudio] Signed URL error:', signedUrlError);
      return null;
    }

    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    if (!base64) return null;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    const uploadResponse = await fetch(signedUrlData.signedUrl, {
      method: 'PUT',
      body: bytes,
      headers: { 'Content-Type': contentType },
    });
    if (!uploadResponse.ok) {
      logError('[PostAudio] Upload failed:', uploadResponse.status);
      return null;
    }

    const { data: urlData } = supabase.storage.from(POST_AUDIO_BUCKET).getPublicUrl(fileName);
    if (!urlData?.publicUrl) return null;
    return `${urlData.publicUrl}?t=${timestamp}`;
  } catch (e: any) {
    logError('[PostAudio] uploadPostAudio error:', e?.message ?? e);
    return null;
  }
};

/**
 * Upload post image to Bunny.net CDN or Supabase storage.
 * Tries Bunny.net first if enabled, then Supabase Storage.
 */
export const uploadPostImage = async (fileUri: string, userId: string): Promise<string | null> => {
  try {
    log('[PostImages] ====== STARTING IMAGE UPLOAD ======');
    log('[PostImages] File URI:', fileUri);
    log('[PostImages] User ID:', userId);
    
    // First check if the file exists
    log('[PostImages] Step 1: Checking if file exists...');
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      logError('[PostImages] ❌ FAILED: File does not exist:', fileUri);
      return null;
    }
    
    log('[PostImages] ✅ File exists, size:', fileInfo.size);
    
    // Content moderation is now done manually - no API calls
    log('[PostImages] Step 2: Skipping automated moderation (manual moderation enabled)');
    
    // Create a unique filename
    const timestamp = Date.now();
    const fileExtension = fileUri.split('.').pop() || 'jpg';
    const fileName = `post_${userId}_${timestamp}.${fileExtension}`;
    
    // Try Bunny.net first (if enabled) - Best performance for Africa
    try {
      if (isBunnyNetEnabled()) {
        log('[PostImages] Step 3: Attempting Bunny.net upload (Africa-optimized)...');
        
        const bunnyUrl = await uploadToBunnyNet(fileUri, fileName, 'post-images');
        
        if (bunnyUrl) {
          log('[PostImages] ✅✅✅ Bunny.net upload successful! CDN URL:', bunnyUrl);
          return bunnyUrl;
        } else {
          log('[PostImages] ⚠️ Bunny.net upload failed, falling back to Supabase...');
        }
      } else {
        log('[PostImages] Step 3: Bunny.net not enabled, using Supabase...');
      }
    } catch (bunnyError: any) {
      warn('[PostImages] ⚠️ Bunny.net upload error (non-critical), falling back:', bunnyError?.message || bunnyError);
    }
    
    // Fallback to Supabase Storage
    log('[PostImages] Step 4: Uploading to Supabase Storage...');
    
    // Ensure the post-images bucket exists
    const bucketExists = await ensurePostImagesBucketExists();
    if (!bucketExists) {
      logError('[PostImages] Failed to ensure post-images bucket exists');
      return null;
    }
    
    log('[PostImages] Bucket confirmed to exist, proceeding with upload');
    
    log('[PostImages] Target filename:', fileName);
    
    // Use signed URL approach to avoid ReadableStream issues (same as mediaStorage.ts)
    // This is the React Native compatible way to upload files
    log('[PostImages] Getting signed upload URL...');
    
    // Create signed upload URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('post-images')
      .createSignedUploadUrl(fileName, {
        upsert: true
      });
    
    if (signedUrlError || !signedUrlData?.signedUrl) {
      logError('[PostImages] Error creating signed URL:', signedUrlError);
      throw new Error(`Failed to create upload URL: ${signedUrlError?.message || 'Unknown error'}`);
    }
    
    log('[PostImages] ✅ Got signed upload URL');
    
    // Read file as base64 and convert to Uint8Array (React Native compatible)
    log('[PostImages] Reading file as base64...');
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    if (!base64) {
      throw new Error('[PostImages] Failed to read file');
    }
    
    // Convert base64 to Uint8Array
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    log('[PostImages] File read, size:', bytes.length, 'bytes');
    
    // Upload file using signed URL via fetch (avoids ReadableStream issues)
    log('[PostImages] Uploading to signed URL...');
    const uploadResponse = await fetch(signedUrlData.signedUrl, {
      method: 'PUT',
      body: bytes,
      headers: {
        'Content-Type': 'image/jpeg',
      },
    });
    
    if (!uploadResponse.ok) {
      logError('[PostImages] ❌ Upload failed:', uploadResponse.status, uploadResponse.statusText);
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }
    
    log('[PostImages] ✅ Upload successful!');
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('post-images')
      .getPublicUrl(fileName);
    
    if (!urlData?.publicUrl) {
      throw new Error('[PostImages] Failed to get public URL');
    }
    
    // Add cache busting parameter
    const publicUrl = `${urlData.publicUrl}?t=${timestamp}`;
    log('[PostImages] Public URL generated:', publicUrl);
    
    log('[PostImages] ✅✅✅ Upload successful! Public URL:', publicUrl);
    return publicUrl;
  } catch (error: any) {
    logError('[PostImages] ====== UPLOAD FAILED ======');
    logError('[PostImages] ❌ Error uploading image:', error);
    logError('[PostImages] ❌ Error type:', typeof error);
    logError('[PostImages] ❌ Error details:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack?.substring(0, 500),
      code: error?.code,
    });
    
    // Log specific error types
    if (error?.message) {
      logError('[PostImages] ❌ Error message:', error.message);
      
      if (error.message.includes('cancelled')) {
        logError('[PostImages] ❌ USER CANCELLED: User clicked "No, Cancel" in confirmation dialog');
      } else if (error.message.includes('File does not exist')) {
        logError('[PostImages] ❌ FILE ERROR: File does not exist at path:', fileUri);
      } else if (error.message.includes('moderation')) {
        logError('[PostImages] ❌ MODERATION ERROR: Content moderation blocked the upload');
      } else if (error.message.includes('bucket')) {
        logError('[PostImages] ❌ BUCKET ERROR: Storage bucket issue');
      } else if (error.message.includes('base64')) {
        logError('[PostImages] ❌ CONVERSION ERROR: Failed to convert image to base64');
      } else if (error.message.includes('Upload failed')) {
        logError('[PostImages] ❌ SUPABASE ERROR: Supabase storage upload failed');
      } else if (error.message.includes('public URL')) {
        logError('[PostImages] ❌ URL ERROR: Failed to get public URL from Supabase');
      } else {
        logError('[PostImages] ❌ UNKNOWN ERROR TYPE');
      }
    } else {
      logError('[PostImages] ❌ ERROR HAS NO MESSAGE');
    }
    
    logError('[PostImages] ====== END ERROR LOG ======');
    return null;
  }
};

/**
 * Create a new post
 */
export const createPost = async (
  content: string,
  userId: string,
  username: string,
  userEmail: string,
  location?: string,
  imageUrls?: string[],
  imageUrl?: string,
  videoUrl?: string,
  isBusiness?: boolean,
  postType: 'standard' | 'poll' | 'question' = 'standard',
  audio?: { url: string; title?: string | null; artist?: string | null } | null,
  adultContent?: boolean
): Promise<Post | null> => {
  try {
    await ensureDbSetup();
    
    // Security: Rate limiting
    const rateLimitResult = await checkRateLimit({
      maxRequests: 10, // Max 10 posts per minute
      windowMs: 60 * 1000,
      key: `create_post_${userId}`,
    });
    
    if (!rateLimitResult.allowed) {
      await logSecurityEvent({
        type: SecurityEventType.RATE_LIMIT_EXCEEDED,
        level: SecurityRiskLevel.MEDIUM,
        userId,
        details: 'Post creation rate limit exceeded',
        metadata: { action: 'create_post' },
        timestamp: new Date().toISOString(),
      });
      throw new Error('Rate limit exceeded. Please wait before creating another post.');
    }
    
    // Security: Input validation removed - admins will manually review content
    // Only basic sanitization for XSS prevention, no content blocking
    const sanitizedContent = sanitizeInput(content);
    
    // Content validation removed - users can post anything, admins will manually flag
    
    // Process image URLs - upload local file URIs to Supabase
    let finalImageUrls: string[] = [];
    
    if (imageUrls && (imageUrls?.length || 0) > 0) {
      log('[CreatePost] 📸 Processing image URLs:', imageUrls);
      log('[CreatePost] 📸 Total images to process:', imageUrls.length);
      log('[CreatePost] 📸 Image URL types:', imageUrls.map((url, i) => ({
        index: i + 1,
        url: url?.substring(0, 100) + '...',
        isFile: url?.startsWith('file://'),
        isHttp: url?.startsWith('http://') || url?.startsWith('https://'),
      })));
      
      // Upload each image to Supabase storage if it's a local file
      const uploadPromises = imageUrls.map(async (url, index) => {
        try {
          if (url && url.startsWith('file://')) {
            log(`[CreatePost] 📤 Uploading local image ${index + 1}/${imageUrls.length} to Supabase`);
            log(`[CreatePost] 📤 File URI: ${url.substring(0, 100)}...`);
            const uploadedUrl = await uploadPostImage(url, userId);
            if (uploadedUrl) {
              log(`[CreatePost] ✅ Successfully uploaded image ${index + 1}:`, uploadedUrl);
              return uploadedUrl;
            } else {
              logError(`[CreatePost] ❌ Failed to upload image ${index + 1} - uploadPostImage returned null`);
              logError(`[CreatePost] ❌ File URI was: ${url}`);
              return null;
            }
          }
          // Keep remote URLs as they are
          if (url) {
            log(`[CreatePost] Keeping remote URL ${index + 1}:`, url);
            return url;
          } else {
            warn(`[CreatePost] Skipping undefined/null URL at index ${index + 1}`);
            return null;
          }
        } catch (error: any) {
          logError(`[CreatePost] ❌ Error uploading image ${index + 1}:`, error?.message || error);
          return null;
        }
      });
      
      // Wait for all uploads to complete
      log('[CreatePost] Waiting for all image uploads to complete...');
      const uploadResults = await Promise.all(uploadPromises);
      log('[CreatePost] Upload results:', uploadResults);
      log('[CreatePost] Successful uploads:', uploadResults.filter(url => url !== null).length);
      log('[CreatePost] Failed uploads:', uploadResults.filter(url => url === null).length);
      
      // Filter out null results (failed uploads)
      finalImageUrls = uploadResults.filter(url => url !== null) as string[];
      log('[CreatePost] Final image URLs after processing:', finalImageUrls);
      log('[CreatePost] Final image count:', finalImageUrls.length);
      
      // If we had images to upload but all failed, show a warning
      if ((imageUrls?.length || 0) > 0 && (finalImageUrls?.length || 0) === 0) {
        warn('[CreatePost] ⚠️ All image uploads failed - proceeding with text-only post');
        throw new Error('Failed to upload images. Please try again.');
      }
    } else if (imageUrl) {
      // Handle single imageUrl if provided
      log('[CreatePost] Processing single image URL:', imageUrl);
      if (imageUrl.startsWith('file://')) {
        log('[CreatePost] Uploading single local image to Supabase:', imageUrl);
        const uploadedUrl = await uploadPostImage(imageUrl, userId);
        if (uploadedUrl) {
          finalImageUrls = [uploadedUrl];
          log('[CreatePost] Successfully uploaded single image:', uploadedUrl);
        } else {
          logError('[CreatePost] Failed to upload single image:', imageUrl);
        }
      } else {
        finalImageUrls = [imageUrl];
        log('[CreatePost] Using remote single image URL:', imageUrl);
      }
    }
    
    // Set both image_urls and image_url for backward compatibility
    const postData: any = {
      user_id: userId,
      user_email: userEmail,
      content: sanitizedContent.trim(),
      location,
      image_urls: (finalImageUrls?.length || 0) > 0 ? finalImageUrls : undefined,
      image_url: (finalImageUrls?.length || 0) > 0 ? finalImageUrls[0] : undefined,
      video_url: videoUrl || undefined,
      is_business: isBusiness || false,
      post_type: postType,
      adult_content: adultContent || false,
      ...(audio?.url && {
        audio_url: audio.url,
        audio_title: audio.title ?? null,
        audio_artist: audio.artist ?? null,
      }),
    };
    
    // Video posts start with 10 views (auto-boost), but view count won't show instantly
    if (videoUrl) {
      postData.views_count = 10;
    }
    
    log('[CreatePost] Creating post with data:', {
      ...postData,
      image_urls: postData.image_urls ? `${(postData.image_urls?.length || 0)} images` : 'no images',
      video_url: postData.video_url ? `VIDEO: ${postData.video_url.substring(0, 100)}...` : 'no video'
    });
    
    log('[CreatePost] Full video URL being saved:', videoUrl);
    
    const { data, error } = await supabase
      .from('posts')
      .insert(postData)
      .select()
      .single();
    
    if (error) {
      logError('[CreatePost] Error creating post:', error);
      logError('[CreatePost] Error code:', error.code);
      logError('[CreatePost] Error message:', error.message);
      logError('[CreatePost] Error details:', error.details);
      logError('[CreatePost] Error hint:', error.hint);
      
      // Provide user-friendly error messages based on error code
      let errorMessage = 'Failed to create post. Please try again.';
      
      if (error.code === '23503') {
        // Foreign key violation - user_id doesn't exist in profiles
        errorMessage = 'Your account information is missing. Please log out and log back in, then try again.';
      } else if (error.code === '23502') {
        // Not null violation - required field is missing
        errorMessage = 'Required information is missing. Please check your post content and try again.';
      } else if (error.code === '42501' || error.code === '42503') {
        // Permission denied
        errorMessage = 'You do not have permission to create posts. Please contact support if this issue persists.';
      } else if (error.message) {
        // Use the database error message if available
        errorMessage = `Failed to create post: ${error.message}`;
      }
      
      throw new Error(errorMessage);
    }
    
    log('[CreatePost] ✅ Post created successfully with ID:', data.id);
    log('[CreatePost] Post details:', {
      id: data.id,
      user_id: data.user_id,
      video_url: data.video_url ? `${data.video_url.substring(0, 50)}...` : 'none',
      created_at: data.created_at,
      content: data.content ? `${data.content.substring(0, 50)}...` : 'none'
    });
    
    // Verify the post was actually inserted by fetching it back
    try {
      const { data: verifyPost, error: verifyError } = await supabase
        .from('posts')
        .select('id, user_id, video_url, created_at')
        .eq('id', data.id)
        .single();
      
      if (verifyError) {
        logError('[CreatePost] ⚠️ WARNING: Could not verify post creation:', verifyError);
      } else if (verifyPost) {
        log('[CreatePost] ✅ Verified post exists in database:', verifyPost.id);
      }
    } catch (verifyErr) {
      logError('[CreatePost] Error verifying post:', verifyErr);
    }
    
    // Automatically boost engagement using placeholder accounts
    // This helps new users get initial engagement and makes the app look more active
    try {
      const { boostPostEngagement } = await import('./engagementBooster');
      const isVideoPost = !!videoUrl;
      
      // Boost in the background (don't wait for it)
      boostPostEngagement(data.id, isVideoPost).then(({ likes, views }) => {
        log(`[CreatePost] ✅ Auto-boosted post ${data.id}: ${likes} likes, ${views} views`);
      }).catch((error) => {
        logError('[CreatePost] Error auto-boosting post:', error);
        // Don't fail post creation if boosting fails
      });
    } catch (importError) {
      warn('[CreatePost] Could not import engagement booster:', importError);
      // Continue without boosting - not critical
    }
    
    // If this is a promoted business post with media, mirror it once into the business gallery
    try {
      if (isBusiness && (finalImageUrls?.length || 0) > 0) {
        const primaryImage = finalImageUrls![0];
        const caption = (sanitizedContent || '').slice(0, 140);
        await addGalleryItem(userId, primaryImage, 'photo', undefined, caption);
      } else if (isBusiness && videoUrl) {
        const caption = (sanitizedContent || '').slice(0, 140);
        await addGalleryItem(userId, videoUrl, 'video', undefined, caption);
      }
    } catch (galleryError) {
      warn('[CreatePost] Failed to mirror business post into gallery:', galleryError);
      // Non‑critical: do not block post creation if gallery insert fails
    }
    
    // Clear posts cache so new post appears immediately on community feed
    log('[CreatePost] Clearing posts cache to show new content');
    clearPostsCache();
    
    // Clear current user's profile cache so new post appears on their profile
    clearUserPostsCache(userId).catch((err: Error) => {
      warn('[CreatePost] Failed to clear user posts cache:', err);
    });
    
    // Also clear persistent cache in AsyncStorage
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => 
        key.startsWith(CACHE_KEY_PREFIX) || 
        key.startsWith(CACHE_TIMESTAMP_KEY_PREFIX)
      );
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
        log(`[CreatePost] Cleared ${cacheKeys.length} persistent cache entries`);
      }
    } catch (cacheError) {
      logError('[CreatePost] Error clearing persistent cache:', cacheError);
      // Don't fail post creation if cache clearing fails
    }
    
    return data;
  } catch (error) {
    logError('[CreatePost] Exception in createPost:', error);
    
    // If it's already an Error object with a message, re-throw it
    if (error instanceof Error) {
      throw error;
    }
    
    // Otherwise, wrap it in an Error
    const errorMessage = typeof error === 'string' 
      ? error 
      : error?.message || 'Failed to create post. Please try again.';
    
    throw new Error(errorMessage);
  }
};

/**
 * Create a poll post (creates base post + poll records)
 */
export const createPollPost = async (
  bodyContent: string,
  userId: string,
  username: string,
  userEmail: string,
  poll: {
    question: string;
    options: string[];
    expiresAt?: string | null;
    showResultsMode?: 'after_vote' | 'after_expiry' | 'always';
  }
): Promise<Post | null> => {
  const effectiveContent = (bodyContent || '').trim() || (poll.question || '').trim();
  const post = await createPost(effectiveContent, userId, username, userEmail, undefined, undefined, undefined, undefined, false, 'poll');
  if (!post) return null;
  const { createPollForPost } = await import('./pollService');
  await createPollForPost(post.id, {
    question: poll.question,
    options: poll.options,
    expiresAt: poll.expiresAt ?? null,
    showResultsMode: poll.showResultsMode ?? 'after_vote',
  });
  return post;
};

/**
 * Create a Q&A post (creates base post + question record)
 */
export const createQuestionPost = async (
  bodyContent: string,
  userId: string,
  username: string,
  userEmail: string,
  question: { question: string }
): Promise<Post | null> => {
  const effectiveContent = (bodyContent || '').trim() || (question.question || '').trim();
  const post = await createPost(effectiveContent, userId, username, userEmail, undefined, undefined, undefined, undefined, false, 'question');
  if (!post) return null;
  const { createQuestionForPost } = await import('./questionService');
  await createQuestionForPost(post.id, question);
  return post;
};

/**
 * Update an existing post
 */
export const updatePost = async (
  postId: string,
  userId: string,
  content: string,
  location?: string,
  imageUrls?: string[]
): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    // Security: Rate limiting
    const rateLimitResult = await checkRateLimit({
      maxRequests: 20, // Max 20 updates per minute
      windowMs: 60 * 1000,
      key: `update_post_${userId}`,
    });
    
    if (!rateLimitResult.allowed) {
      await logSecurityEvent({
        type: SecurityEventType.RATE_LIMIT_EXCEEDED,
        level: SecurityRiskLevel.MEDIUM,
        userId,
        details: 'Post update rate limit exceeded',
        metadata: { action: 'update_post', postId },
        timestamp: new Date().toISOString(),
      });
      throw new Error('Rate limit exceeded. Please wait before updating again.');
    }
    
    // Security: Input validation removed - admins will manually review content
    // Only basic sanitization for XSS prevention, no content blocking
    const sanitizedContent = sanitizeInput(content);
    
    // Content validation removed - users can post anything, admins will manually flag
    
    // Make sure the user is the owner of the post
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single();
    
    if (fetchError || !post) {
      logError('Error fetching post to update:', fetchError);
      return false;
    }
    
    if (post.user_id !== userId) {
      logError('User does not have permission to update this post');
      return false;
    }
    
    // Process image URLs - upload local file URIs to Supabase
    let finalImageUrls: string[] = [];
    
    if (imageUrls && (imageUrls?.length || 0) > 0) {
      // Upload each image to Supabase storage if it's a local file
      const uploadPromises = imageUrls.map(async (url) => {
        if (url.startsWith('file://')) {
          const uploadedUrl = await uploadPostImage(url, userId);
          return uploadedUrl || null;
        }
        // Keep remote URLs as they are
        return url;
      });
      
      // Wait for all uploads to complete
      const uploadResults = await Promise.all(uploadPromises);
      
      // Filter out null results (failed uploads)
      finalImageUrls = uploadResults.filter(url => url !== null) as string[];
    }
    
    const updateData: any = { content: sanitizedContent.trim() };
    
    if (location !== undefined) {
      updateData.location = location;
    }
    
    if (imageUrls !== undefined) {
      updateData.image_urls = (finalImageUrls?.length || 0) > 0 ? finalImageUrls : null;
    }
    
    const { error: updatePostErr } = await supabase
      .from('posts')
      .update(updateData)
      .eq('id', postId);
    
    if (updatePostErr) {
      logError('Error updating post:', updatePostErr);
      return false;
    }
    
    return true;
  } catch (err: unknown) {
    logError('Exception in updatePost:', err);
    return false;
  }
};

/**
 * Toggle comments disabled status for a post
 */
export const togglePostComments = async (postId: string, userId: string, commentsDisabled: boolean): Promise<boolean> => {
  try {
    log(`[togglePostComments] Starting - postId: ${postId}, userId: ${userId}, commentsDisabled: ${commentsDisabled}`);
    await ensureDbSetup();
    
    // Make sure the user is the owner of the post
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single();
    
    if (fetchError || !post) {
      logError('[togglePostComments] Error fetching post to toggle comments:', fetchError);
      return false;
    }
    
    log(`[togglePostComments] Post owner: ${post.user_id}, Current user: ${userId}`);
    
    if (post.user_id !== userId) {
      logError('[togglePostComments] User does not have permission to toggle comments on this post');
      return false;
    }
    
    log(`[togglePostComments] Updating comments_disabled to: ${commentsDisabled}`);
    const { error: toggleCommentsErr } = await supabase
      .from('posts')
      .update({ comments_disabled: commentsDisabled })
      .eq('id', postId);
    
    if (toggleCommentsErr) {
      logError('[togglePostComments] Error toggling post comments:', toggleCommentsErr);
      return false;
    }
    
    log('[togglePostComments] Successfully toggled comments');
    return true;
  } catch (err: unknown) {
    logError('[togglePostComments] Exception in togglePostComments:', err);
    return false;
  }
};

/**
 * Delete a post
 */
export const deletePost = async (postId: string, userId: string): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    // Make sure the user is the owner of the post
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully
    
    // Handle case where post doesn't exist (already deleted or never existed)
    if (fetchError) {
      // PGRST116 means "no rows returned" - post doesn't exist
      if (fetchError.code === 'PGRST116') {
        log('Post does not exist (may have been already deleted):', postId);
        // Consider it a success since the post is already gone
        return true;
      }
      logError('Error fetching post to delete:', fetchError);
      return false;
    }
    
    // If post doesn't exist, consider it already deleted
    if (!post) {
      log('Post does not exist (may have been already deleted):', postId);
      return true;
    }
    
    if (post.user_id !== userId) {
      logError('User does not have permission to delete this post');
      return false;
    }
    
    // Delete the post
    const { error: deletePostErr } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);
    
    if (deletePostErr) {
      logError('Error deleting post:', deletePostErr);
      return false;
    }
    
    return true;
  } catch (err: unknown) {
    logError('Exception in deletePost:', err);
    return false;
  }
};

/**
 * Fetch comments for a post
 */
export const fetchComments = async (postId: string): Promise<Comment[]> => {
  try {
    // MEMORY LEAK FIX: Check if this is a placeholder post - return empty array without querying database
    if (postId.startsWith('placeholder-post-') || postId.startsWith('bundled-offline-post-')) {
      log(`[CommunityUtils] Placeholder post detected, returning empty comments for ${postId}`);
      return [];
    }

    // Validate UUID format before querying database
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(postId)) {
      warn(`[CommunityUtils] Invalid UUID format for postId: ${postId}, returning empty comments`);
      return [];
    }

    await ensureDbSetup();
    
    // Fetch comments for the post (order by created_at only — many DBs have no is_pinned on post_comments;
    // ordering by a missing column makes the whole query fail so the sheet stays empty while counts still work).
    const { data: commentsRaw, error: fetchCommentsError } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    
    if (fetchCommentsError) {
      logError('Error fetching comments:', fetchCommentsError);
      return [];
    }

    const comments = [...(commentsRaw || [])].sort((a, b) => {
      const ap = (a as { is_pinned?: boolean }).is_pinned ? 1 : 0;
      const bp = (b as { is_pinned?: boolean }).is_pinned ? 1 : 0;
      if (bp !== ap) return bp - ap;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    
    // For each comment, get the user profile with retry logic
    if (comments && (comments?.length || 0) > 0) {
      const userIds = [...new Set(comments.map(comment => comment.user_id).filter(Boolean))];
      let profileMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        try {
          // Try to fetch profiles with timeout
          const profilePromise = supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, is_verified')
            .in('id', userIds);
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
          );
          
          const result = await Promise.race([profilePromise, timeoutPromise]) as any;
          const profiles = result.data || [];
          
          profileMap = profiles.reduce((map: Record<string, any>, profile: any) => {
            map[profile.id] = profile;
            return map;
          }, {});
          
          log(`[CommunityUtils] ✅ Loaded ${profiles.length} profiles for comments`);
        } catch (profileError) {
          warn('[CommunityUtils] Comment profile fetch failed or timed out, using fallbacks:', profileError);
          // Continue without profiles - will use fallbacks below
        }
      }
      
      // Add username and avatar to each comment
      return comments.map(comment => {
        const userProfile = profileMap[comment.user_id];
        
        // Set username with fallbacks, prioritizing display_name
        // Better fallback for username
        let username = comment.user_id ? `user_${comment.user_id.substring(0, 8)}` : 'Unknown User';
        if (comment.display_name) {
          username = comment.display_name;
        } else if (userProfile?.username) {
          username = userProfile.username;
        } else if (userProfile?.full_name) {
          username = userProfile.full_name;
        } else if (comment.user_email) {
          username = comment.user_email.split('@')[0];
        }
        
        return {
          ...comment,
          username,
          user_avatar: userProfile?.avatar_url,
          profiles: userProfile
        };
      });
    }
    
    return comments || [];
  } catch (err) {
    logError('Exception in fetchComments:', err);
    return [];
  }
};

/**
 * Add a comment to a post
 */
export const addComment = async (
  postId: string,
  userId: string,
  content: string
): Promise<Comment | null> => {
  try {
    // Content filter validation
    const contentFilterResult = validateComment(content);
    if (!contentFilterResult.isValid) {
      await logSecurityEvent({
        type: SecurityEventType.INVALID_INPUT,
        level: SecurityRiskLevel.HIGH,
        userId,
        details: `Blocked content in comment: ${contentFilterResult.reason}`,
        metadata: { blockedContent: contentFilterResult.blockedContent },
      });
      throw new Error(contentFilterResult.reason || 'Comment content not allowed');
    }
    
    // Allow comments on placeholder posts - return a mock comment (no database)
    if (postId.startsWith('placeholder-post-') || postId.startsWith('bundled-offline-post-')) {
      log(`[CommunityUtils] Comment on placeholder post ${postId} - allowing (local only)`);
      // Return a mock comment for optimistic UI
      const { data: { user } } = await supabase.auth.getUser();
      return {
        id: `placeholder-comment-${postId}-${Date.now()}`,
        post_id: postId,
        user_id: userId,
        content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        likes_count: 0,
        liked: false,
        username: user?.user_metadata?.username || 'You',
        display_name: user?.user_metadata?.full_name || 'You',
        user_avatar: user?.user_metadata?.avatar_url || null,
      };
    }
    
    await ensureDbSetup();
    
    const commentData = {
      post_id: postId,
      user_id: userId,
      content
    };
    
    const { data, error } = await supabase
      .from('post_comments')
      .insert(commentData)
      .select()
      .single();
    
    if (error) {
      logError('Error adding comment:', error);
      return null;
    }
    
    // Get the user profile for the comment
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    // Format the comment with username and avatar
    void clearPostsCache();
    return {
      ...data,
      username: data.display_name || profile?.username || profile?.full_name || data.user_email?.split('@')[0] || `user_${data.user_id?.substring(0, 8) || 'unknown'}`,
      user_avatar: profile?.avatar_url,
      profiles: profile
    };
  } catch (err) {
    logError('Exception in addComment:', err);
    return null;
  }
};

/**
 * Delete a comment
 */
export const deleteComment = async (commentId: string, userId: string): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    // Make sure the user is the owner of the comment
    const { data: comment, error: fetchError } = await supabase
      .from('post_comments')
      .select('user_id')
      .eq('id', commentId)
      .single();
    
    if (fetchError || !comment) {
      logError('Error fetching comment to delete:', fetchError);
      return false;
    }
    
    if (comment.user_id !== userId) {
      logError('User does not have permission to delete this comment');
      return false;
    }
    
    // Delete the comment
    const { error: deleteCommentErr } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId);
    
    if (deleteCommentErr) {
      logError('Error deleting comment:', deleteCommentErr);
      return false;
    }
    
    void clearPostsCache();
    return true;
  } catch (err: unknown) {
    logError('Exception in deleteComment:', err);
    return false;
  }
};

/**
 * Update a comment
 */
export const updateComment = async (
  commentId: string,
  userId: string,
  content: string
): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    // Make sure the user is the owner of the comment
    const { data: comment, error: fetchError } = await supabase
      .from('post_comments')
      .select('user_id')
      .eq('id', commentId)
      .single();
    
    if (fetchError || !comment) {
      logError('Error fetching comment to update:', fetchError);
      return false;
    }
    
    if (comment.user_id !== userId) {
      logError('User does not have permission to update this comment');
      return false;
    }
    
    // Update the comment
    const { error: updateCommentErr } = await supabase
      .from('post_comments')
      .update({ 
        content,
        updated_at: new Date().toISOString() 
      })
      .eq('id', commentId);
    
    if (updateCommentErr) {
      logError('Error updating comment:', updateCommentErr);
      return false;
    }
    
    return true;
  } catch (err: unknown) {
    logError('Exception in updateComment:', err);
    return false;
  }
};

/**
 * Like a post
 */
export const likePost = async (postId: string, userId: string): Promise<boolean> => {
  try {
    // Placeholders are in-app only - no database interaction
    if (postId.startsWith('placeholder-post-') || postId.startsWith('bundled-offline-post-')) {
      // Placeholder likes are handled in-app only (no database)
      return true;
    }
    
    await ensureDbSetup();
    
    // Check if the user has already liked the post
    const { data: existingLike, error: checkError } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (checkError) {
      logError('Error checking if post is already liked:', checkError);
      return false;
    }
    
    // If already liked, do nothing (already successful)
    if (existingLike) {
      return true;
    }
    
    // Add the like
    const { error: insertLikeErr } = await supabase
      .from('post_likes')
      .insert({
        post_id: postId,
        user_id: userId
      });
    
    if (insertLikeErr) {
      // Duplicate key = already liked (race or RLS); treat as success
      if (insertLikeErr.code === '23505') {
        void clearPostsCache();
        return true;
      }
      logError('Error liking post:', insertLikeErr);
      return false;
    }
    
    void clearPostsCache();
    return true;
  } catch (err: unknown) {
    logError('Exception in likePost:', err);
    return false;
  }
};

/**
 * Unlike a post
 */
export const unlikePost = async (postId: string, userId: string): Promise<boolean> => {
  try {
    // Handle unlikes on placeholder posts - remove from database
    if (postId.startsWith('placeholder-post-') || postId.startsWith('bundled-offline-post-')) {
      log(`[CommunityUtils] Unlike on placeholder post ${postId} - removing from database`);
      await ensureDbSetup();
      
      const { error: placeholderUnlikeErr } = await supabase
        .from('placeholder_post_likes')
        .delete()
        .eq('placeholder_post_id', postId)
        .eq('user_id', userId);
      
      if (placeholderUnlikeErr) {
        // If table doesn't exist, fallback to local storage
        if (placeholderUnlikeErr.code === '42P01' || placeholderUnlikeErr.message?.includes('does not exist')) {
          warn('[CommunityUtils] placeholder_post_likes table does not exist. Using local storage.');
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const likeKey = `like_placeholder_${userId}_${postId}`;
          await AsyncStorage.removeItem(likeKey);
          return true;
        }
        logError('Error unliking placeholder post:', placeholderUnlikeErr);
        return false;
      }
      
      log(`[CommunityUtils] Successfully unliked placeholder post ${postId}`);
      return true;
    }
    
    await ensureDbSetup();
    
    // Remove the like
    const { error: unlikePostErr } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    
    if (unlikePostErr) {
      logError('Error unliking post:', unlikePostErr);
      return false;
    }
    
    void clearPostsCache();
    return true;
  } catch (err: unknown) {
    logError('Exception in unlikePost:', err);
    return false;
  }
};

/**
 * Toggle like status for a post
 */
export const toggleLike = async (postId: string, userId: string): Promise<boolean> => {
  try {
    // Placeholders are in-app only - no database interaction
    if (postId.startsWith('placeholder-post-') || postId.startsWith('bundled-offline-post-')) {
      // Placeholder likes are handled in-app only (no database)
          return true;
    }
    
    await ensureDbSetup();
    
    // Check current like status for real posts
    const { data: existingLike, error: checkError } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (checkError) {
      logError('Error checking like status:', checkError);
      return false;
    }
    
    if (existingLike) {
      // Unlike if already liked
      return await unlikePost(postId, userId);
    } else {
      // Like if not already liked
      return await likePost(postId, userId);
    }
  } catch (error) {
    logError('Exception in toggleLike:', error);
    return false;
  }
};

export const boostPost = async (
  postId: string,
  userId: string
): Promise<{ success: boolean; boostExpiresAt?: string; error?: string }> => {
  try {
    if (!postId || !userId) {
      return { success: false, error: 'Invalid boost request' };
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, boost_expires_at')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return { success: false, error: 'Post not found' };
    }

    if (post.user_id !== userId) {
      return { success: false, error: 'You can only boost your own posts' };
    }

    const wallet = await getUserWallet(userId, false);
    const balance = wallet?.token_balance || 0;
    if (balance < BOOST_COST_TOKENS) {
      return { success: false, error: `You need ${BOOST_COST_TOKENS} tokens to boost this post` };
    }

    const now = Date.now();
    const currentExpiry = post.boost_expires_at ? new Date(post.boost_expires_at).getTime() : 0;
    // If currently boosted, extend from existing expiry; otherwise from now.
    const boostStart = currentExpiry > now ? currentExpiry : now;
    const boostExpiresAt = new Date(boostStart + BOOST_DURATION_HOURS * 60 * 60 * 1000).toISOString();

    const charge = await updateWalletBalance(
      userId,
      -BOOST_COST_TOKENS,
      'post_boost',
      postId,
      `Post boost for ${BOOST_DURATION_HOURS} hours`
    );

    if (!charge.success) {
      return { success: false, error: charge.error || 'Failed to charge tokens' };
    }

    const { error: boostError } = await supabase
      .from('posts')
      .update({
        boost_expires_at: boostExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .eq('user_id', userId);

    if (boostError) {
      // Refund user if boost update fails after charge.
      await updateWalletBalance(
        userId,
        BOOST_COST_TOKENS,
        'refund',
        postId,
        'Refund: failed to apply post boost'
      );

      const missingColumn =
        boostError.message?.includes('boost_expires_at') ||
        boostError.message?.includes('column') ||
        boostError.code === '42703';
      return {
        success: false,
        error: missingColumn
          ? 'Boost field is missing in database. Add boost_expires_at column to posts.'
          : (boostError.message || 'Failed to apply boost'),
      };
    }

    return { success: true, boostExpiresAt };
  } catch (e: any) {
    logError('[CommunityUtils] boostPost error:', e);
    return { success: false, error: e?.message || 'Failed to boost post' };
  }
};

/**
 * Get like count for a post
 */
export const getLikeCount = async (postId: string): Promise<number> => {
  try {
    // Placeholders are in-app only - return 0 (likes are handled in-app)
    if (postId.startsWith('placeholder-post-') || postId.startsWith('bundled-offline-post-')) {
        return 0;
    }
    
    await ensureDbSetup();
    
    const { count, error } = await supabase
      .from('post_likes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);
    
    if (error) {
      logError('Error getting like count:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    logError('Exception in getLikeCount:', error);
    return 0;
  }
};

/**
 * Check if a user has liked a post
 */
export const hasUserLikedPost = async (postId: string, userId: string): Promise<boolean> => {
  try {
    // Placeholders are in-app only - return false (likes are handled in-app)
    if (postId.startsWith('placeholder-post-') || postId.startsWith('bundled-offline-post-')) {
        return false;
    }
    
    await ensureDbSetup();
    
    const { data, error } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      logError('Error checking if user liked post:', error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    logError('Exception in hasUserLikedPost:', error);
    return false;
  }
};

/**
 * Bookmark a post
 */
export const bookmarkPost = async (postId: string, userId: string): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    // Explicitly ensure the post_bookmarks table exists
    const tableExists = await ensurePostBookmarksTable();
    if (!tableExists) {
      logError('Failed to ensure post_bookmarks table exists - cannot bookmark post');
      return false;
    }
    
    log(`Attempting to bookmark post ${postId} by user ${userId}`);
    
    // Check if the post is already bookmarked
    const { data: existingBookmark, error: checkError } = await supabase
      .from('post_bookmarks')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (checkError) {
      logError('Error checking if post is already bookmarked:', checkError);
      return false;
    }
    
    // If already bookmarked, return true (already successful)
    if (existingBookmark) {
      log(`Post ${postId} is already bookmarked by user ${userId}`);
      return true;
    }
    
    log(`Adding bookmark for post ${postId} by user ${userId}`);
    
    // Add the bookmark
    const { data: newBookmark, error: insertError } = await supabase
      .from('post_bookmarks')
      .insert({
        post_id: postId,
        user_id: userId
      })
      .select()
      .single();
    
    if (insertError) {
      logError('Error bookmarking post:', insertError);
      return false;
    }
    
    log(`Successfully bookmarked post ${postId}:`, newBookmark);
    return true;
  } catch (error) {
    logError('Exception in bookmarkPost:', error);
    return false;
  }
};

/**
 * Remove bookmark from a post
 */
export const unbookmarkPost = async (postId: string, userId: string): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    // Explicitly ensure the post_bookmarks table exists
    const tableExists = await ensurePostBookmarksTable();
    if (!tableExists) {
      logError('Failed to ensure post_bookmarks table exists - cannot unbookmark post');
      return false;
    }
    
    log(`Attempting to unbookmark post ${postId} by user ${userId}`);
    
    // First check if the bookmark exists
    const { data: existingBookmark, error: checkError } = await supabase
      .from('post_bookmarks')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
      
    if (checkError) {
      logError('Error checking if bookmark exists:', checkError);
      return false;
    }
    
    if (!existingBookmark) {
      log(`No bookmark found for post ${postId} by user ${userId}`);
      return true; // Already not bookmarked
    }
    
    log(`Removing bookmark for post ${postId} by user ${userId}`);
    
    // Remove the bookmark
    const { error: removeBookmarkErr } = await supabase
      .from('post_bookmarks')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    
    if (removeBookmarkErr) {
      logError('Error removing bookmark:', removeBookmarkErr);
      return false;
    }
    
    log(`Successfully unbookmarked post ${postId}`);
    return true;
  } catch (err: unknown) {
    logError('Exception in unbookmarkPost:', err);
    return false;
  }
};

/**
 * Toggle bookmark status for a post
 * Returns an object with success status and bookmark action performed
 */
export const toggleBookmark = async (postId: string, userId: string): Promise<{success: boolean, action: 'added'|'removed'}> => {
  try {
    await ensureDbSetup();
    log(`Toggling bookmark for post ${postId} by user ${userId}`);
    
    // Check current bookmark status
    const { data: existingBookmark, error: checkError } = await supabase
      .from('post_bookmarks')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (checkError) {
      logError('Error checking bookmark status:', checkError);
      return { success: false, action: 'added' };
    }
    
    if (existingBookmark) {
      log(`Post is currently bookmarked. Unbookmarking post ${postId}`);
      // Remove bookmark if already bookmarked
      const result = await unbookmarkPost(postId, userId);
      return { success: result, action: 'removed' };
    } else {
      log(`Post is not bookmarked. Bookmarking post ${postId}`);
      // Add bookmark if not already bookmarked
      const result = await bookmarkPost(postId, userId);
      return { success: result, action: 'added' };
    }
  } catch (error) {
    logError('Exception in toggleBookmark:', error);
    return { success: false, action: 'added' };
  }
};

/**
 * Get bookmark count for a post (without showing users)
 */
export const getPostBookmarkCount = async (postId: string): Promise<number> => {
  try {
    await ensureDbSetup();
    
    const tableExists = await ensurePostBookmarksTable();
    if (!tableExists) {
      return 0;
    }
    
    const { count, error } = await supabase
      .from('post_bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);
    
    if (error) {
      logError('Error getting bookmark count:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    logError('Exception in getPostBookmarkCount:', error);
    return 0;
  }
};

/**
 * Check if a post is bookmarked by a user
 */
export const isPostBookmarked = async (postId: string, userId: string): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    // Check if the post is bookmarked
    const { data, error } = await supabase
      .from('post_bookmarks')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      logError('Error checking if post is bookmarked:', error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    logError('Exception in isPostBookmarked:', error);
    return false;
  }
};

/**
 * Get bookmarked posts for a user
 */
export const getBookmarkedPosts = async (userId: string): Promise<Post[]> => {
  try {
    await ensureDbSetup();
    
    // Explicitly ensure the post_bookmarks table exists
    const tableExists = await ensurePostBookmarksTable();
    if (!tableExists) {
      logError('Failed to ensure post_bookmarks table exists - cannot retrieve bookmarked posts');
      return [];
    }
    
    log('Getting bookmarked posts for user:', userId);
    
    // First do a direct check to see if the table has any records at all
    const { count: totalBookmarks, error: countError } = await supabase
      .from('post_bookmarks')
      .select('*', { count: 'exact', head: true });
    
    log('Total bookmarks in post_bookmarks table:', totalBookmarks);
    
    if (countError) {
      logError('Error counting total bookmarks:', countError);
    }
    
    // DEBUG: Let's see all bookmarks in the table to understand the issue
    const { data: allBookmarks, error: allBookmarksError } = await supabase
      .from('post_bookmarks')
      .select('*');
    
    if (!allBookmarksError && allBookmarks) {
      log('ALL bookmarks in table (for debugging):', allBookmarks.map(b => ({
        id: b.id,
        user_id: b.user_id,
        post_id: b.post_id,
        created_at: b.created_at
      })));
    }
    
    // Get all bookmark IDs for the user
    const { data: bookmarks, error: bookmarksError } = await supabase
      .from('post_bookmarks')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (bookmarksError) {
      logError('Error fetching bookmarked posts:', bookmarksError);
      return [];
    }
    
    log(`Bookmarks for user ${userId}:`, bookmarks);
    
    if (!bookmarks || (bookmarks?.length || 0) === 0) {
      log(`No bookmarks found for user ${userId}`);
      return [];
    }
    
    // Get all post IDs from bookmarks
    const postIds = bookmarks.map(bookmark => bookmark.post_id);
    log('Post IDs to fetch:', postIds);
    
    // Fetch the actual posts with their data
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select(`
        *,
        likes: post_likes(count),
        comments: post_comments(count)
      `)
      .in('id', postIds);
    
    if (postsError) {
      logError('Error fetching bookmarked posts data:', postsError);
      return [];
    }
    
    log('Retrieved posts:', posts);
    
    // If no posts are found, return empty array
    if (!posts || (posts?.length || 0) === 0) {
      log('No posts found for the bookmarked IDs');
      return [];
    }
    
    // Create a map of bookmark created dates by post ID
    const bookmarkDatesByPostId = bookmarks.reduce((acc, bookmark) => {
      acc[bookmark.post_id] = bookmark.created_at;
      return acc;
    }, {});
    
    // Process posts and add necessary fields
    const processedPosts = await Promise.all(posts.map(async (post) => {
      log('Processing post:', post.id);
      // Get user profile info
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', post.user_id)
        .single();
      
      // Check if liked by current user
      const { data: likeData } = await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', post.id)
        .eq('user_id', userId)
        .maybeSingle();
      
      return {
        ...post,
        profile,
        likes_count: post.likes?.count || 0,
        comments_count: post.comments?.count || 0,
        liked_by_user: !!likeData,
        isBookmarked: true, // These are bookmarked posts
        username: post.display_name || profile?.username || profile?.full_name || post.user_email?.split('@')[0] || (post.user_id ? `user_${post.user_id.substring(0, 8)}` : 'Unknown User'),
        bookmark_created_at: bookmarkDatesByPostId[post.id]
      };
    }));
    
    // Sort by bookmark creation date
    processedPosts.sort((a, b) => {
      return new Date(b.bookmark_created_at).getTime() - new Date(a.bookmark_created_at).getTime();
    });
    
    log(`Processed posts ready to return for user ${userId}:`, (processedPosts?.length || 0));
    return processedPosts;
  } catch (error) {
    logError('Exception in getBookmarkedPosts:', error);
    return [];
  }
};

// Cache for user-specific posts
const userPostsCache = new Map<string, { posts: Post[]; timestamp: number }>();
const USER_POSTS_CACHE_DURATION = 48 * 60 * 60 * 1000; // 48 hours (profiles don't change frequently)
const USER_POSTS_CACHE_KEY_PREFIX = 'user_posts_cache_';
const USER_POSTS_CACHE_TIMESTAMP_PREFIX = 'user_posts_timestamp_';

/**
 * Get cached user posts (exported for use in profile screen)
 */
export const getCachedUserPosts = async (userId: string): Promise<Post[] | null> => {
  // Check in-memory cache first
  const now = Date.now();
  const inMemoryCache = userPostsCache.get(userId);
  if (inMemoryCache && (now - inMemoryCache.timestamp < USER_POSTS_CACHE_DURATION)) {
    return inMemoryCache.posts;
  }
  
  // Check persistent cache
  return await loadCachedUserPosts(userId);
};

/**
 * Load cached user posts from AsyncStorage
 */
const loadCachedUserPosts = async (userId: string): Promise<Post[] | null> => {
  try {
    const cacheKey = USER_POSTS_CACHE_KEY_PREFIX + userId;
    const timestampKey = USER_POSTS_CACHE_TIMESTAMP_PREFIX + userId;
    
    const cachedData = await AsyncStorage.getItem(cacheKey);
    const timestampStr = await AsyncStorage.getItem(timestampKey);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      if (now - timestamp < USER_POSTS_CACHE_DURATION) {
        log(`[CommunityUtils] ✅ Loaded cached user posts for ${userId} (${Math.round((now - timestamp) / 1000 / 60)} minutes old)`);
        return JSON.parse(cachedData);
      } else {
        log(`[CommunityUtils] ⏰ User posts cache expired for ${userId}`);
        await AsyncStorage.multiRemove([cacheKey, timestampKey]);
      }
    }
  } catch (error) {
    logError(`[CommunityUtils] Error loading cached user posts for ${userId}:`, error);
  }
  return null;
};

/**
 * Save user posts to AsyncStorage cache
 */
const saveCachedUserPosts = async (userId: string, posts: Post[]): Promise<void> => {
  try {
    const cacheKey = USER_POSTS_CACHE_KEY_PREFIX + userId;
    const timestampKey = USER_POSTS_CACHE_TIMESTAMP_PREFIX + userId;
    
    await AsyncStorage.multiSet([
      [cacheKey, JSON.stringify(posts)],
      [timestampKey, Date.now().toString()]
    ]);
    
    log(`[CommunityUtils] ✅ Cached ${posts.length} posts for user ${userId}`);
  } catch (error) {
    logError(`[CommunityUtils] Error caching user posts for ${userId}:`, error);
  }
};

/**
 * Clear cache for a user's posts (call after they create a new post so profile shows it)
 */
export const clearUserPostsCache = async (userId: string): Promise<void> => {
  try {
    userPostsCache.delete(userId);
    const cacheKey = USER_POSTS_CACHE_KEY_PREFIX + userId;
    const timestampKey = USER_POSTS_CACHE_TIMESTAMP_PREFIX + userId;
    await AsyncStorage.multiRemove([cacheKey, timestampKey]);
    if (__DEV__) {
      log(`[CommunityUtils] Cleared profile cache for user ${userId}`);
    }
  } catch (error) {
    logError(`[CommunityUtils] Error clearing user posts cache for ${userId}:`, error);
  }
};

/**
 * Get posts by a specific user (with aggressive caching)
 */
export const getUserPosts = async (userId: string, useCache: boolean = true): Promise<Post[]> => {
  try {
    // Check if this is a placeholder user - return placeholder posts
    if (userId.startsWith('placeholder-user-')) {
      const { generatePlaceholderPosts } = await import('./placeholderData');
      const placeholderPosts = generatePlaceholderPosts(3);
      // Filter to only posts from this specific placeholder user
      const match = userId.match(/placeholder-user-(\d+)/);
      if (match) {
        const index = parseInt(match[1], 10);
        // Return posts from this user (one post per placeholder user)
        return [placeholderPosts[index % placeholderPosts.length]];
      }
      return [];
    }
    
    // Check in-memory cache first
    if (useCache) {
      const now = Date.now();
      const inMemoryCache = userPostsCache.get(userId);
      if (inMemoryCache && (now - inMemoryCache.timestamp < USER_POSTS_CACHE_DURATION)) {
        log(`[CommunityUtils] ✅ Using in-memory cached user posts for ${userId}`);
        return inMemoryCache.posts;
      }
      
      // Check persistent cache
      const persistentCache = await loadCachedUserPosts(userId);
      if (persistentCache && persistentCache.length > 0) {
        log(`[CommunityUtils] ✅ Using persistent cached user posts for ${userId} (${persistentCache.length} posts)`);
        // Update in-memory cache
        userPostsCache.set(userId, { posts: persistentCache, timestamp: now });
        // Return cached data immediately, then refresh in background
        setTimeout(() => {
          getUserPosts(userId, false).catch(err => {
            warn(`[CommunityUtils] Background refresh failed for user ${userId}:`, err);
          });
        }, 100);
        return persistentCache;
      }
    }
    
    // Skip ensureDbSetup for faster loading
    
    // Get current user ID for like/bookmark status
    const { data: currentUser } = await supabase.auth.getUser();
    const currentUserId = currentUser?.user?.id;
    
    // Check if users are blocked (bidirectional check)
    if (currentUserId && currentUserId !== userId) {
      try {
        const blockUserModule = await import('./blockUser');
        const blocked = await blockUserModule.isUserBlocked(currentUserId, userId);
        if (blocked) {
          log(`[CommunityUtils] User ${userId} is blocked, returning empty posts`);
          return [];
        }
      } catch (error) {
        logError('[CommunityUtils] Error checking block status:', error);
        // Continue if check fails
      }
    }
    
    log(`[CommunityUtils] Fetching fresh posts for user: ${userId}`);
    
    // Fetch posts for the specified user
    const { data: posts, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      logError('Error fetching user posts:', error);
      return [];
    }
    
    if (!posts || (posts?.length || 0) === 0) {
      log('No posts found for user:', userId);
      return [];
    }
    
    // Get all post IDs for batch processing
    const postIds = posts.map(post => post.id);
    
    // Filter out placeholder post IDs before querying (they're not valid UUIDs)
    const realPostIds = postIds.filter(id => !id.startsWith('placeholder-post-') && !id.startsWith('bundled-offline-post-'));
    
    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    // Add profile data to each post
    posts.forEach(post => {
      post.profile = profile || null;
      
      // Set avatar URL from profile (ensures avatar displays correctly)
      post.user_avatar_url = post.profile?.avatar_url || null;
      
      // Set username for display with better fallbacks
      if (post.display_name) {
        post.username = post.display_name;
      } else if (post.profile?.username) {
        post.username = post.profile.username;
      } else if (post.profile?.full_name) {
        post.username = post.profile.full_name;
      } else if (post.user_email) {
        // Extract username from email (part before @)
        post.username = post.user_email.split('@')[0];
      } else if (post.user_id) {
        // Use user ID as last resort (better than "Unknown User")
        post.username = `user_${post.user_id.substring(0, 8)}`;
      } else {
        post.username = 'Unknown User';
      }
    });
    
    // Get likes and comments counts (only for real posts)
    const [likesData, commentsData] = await Promise.all([
      // Get all likes for these posts
      realPostIds.length > 0
        ? supabase
            .from('post_likes')
            .select('post_id, user_id')
            .in('post_id', realPostIds)
        : Promise.resolve({ data: [], error: null }),
        
      // Get all comments for these posts
      realPostIds.length > 0
        ? supabase
            .from('post_comments')
            .select('post_id')
            .in('post_id', realPostIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    
    // Process likes data
    if (!likesData.error && likesData.data) {
      // Group likes by post ID and count them
      const likesCountMap = likesData.data.reduce((acc, like) => {
        acc[like.post_id] = (acc[like.post_id] || 0) + 1;
        return acc;
      }, {});
      
      // Track user's liked posts (if viewing as current user)
      const userLikedPosts = new Set(
        likesData.data
          .filter(like => like.user_id === currentUserId)
          .map(like => like.post_id) || []
      );
      
      // Update likes info in posts
      posts.forEach(post => {
        post.likes_count = likesCountMap[post.id] || 0;
        post.liked_by_user = userLikedPosts.has(post.id);
      });
    }
    
    // Process comments data
    if (!commentsData.error && commentsData.data) {
      // Group comments by post ID and count them
      const commentsCountMap = commentsData.data.reduce((acc, comment) => {
        acc[comment.post_id] = (acc[comment.post_id] || 0) + 1;
        return acc;
      }, {});
      
      // Update comments info in posts
      posts.forEach(post => {
        post.comments_count = commentsCountMap[post.id] || 0;
      });
    }
    
    // Get bookmark status if viewing as current user
    if (currentUserId) {
      const { data: bookmarks } = await supabase
        .from('post_bookmarks')
        .select('post_id')
        .eq('user_id', currentUserId)
        .in('post_id', postIds);
      
      if (bookmarks) {
        // Create a set of bookmarked post IDs
        const bookmarkedPostIds = new Set(
          bookmarks.map(bookmark => bookmark.post_id) || []
        );
        
        // Update bookmarked status in posts
        posts.forEach(post => {
          post.isBookmarked = bookmarkedPostIds.has(post.id);
        });
      }
    }
    
    // Cache the results (both in-memory and persistent)
    const now = Date.now();
    userPostsCache.set(userId, { posts, timestamp: now });
    await saveCachedUserPosts(userId, posts);
    
    return posts;
  } catch (error) {
    logError('Exception in getUserPosts:', error);
    // Try to return cached data if fetch fails
    if (useCache) {
      const cached = await loadCachedUserPosts(userId);
      if (cached) {
        log(`[CommunityUtils] ⚠️ Fetch failed, returning cached user posts for ${userId}`);
        return cached;
      }
    }
    return [];
  }
};

/**
 * Test function to verify image upload functionality
 */
export const testImageUpload = async (): Promise<boolean> => {
  try {
    log('[TestImageUpload] Starting image upload test...');
    
    // Test bucket creation/existence
    const bucketExists = await ensurePostImagesBucketExists();
    if (!bucketExists) {
      logError('[TestImageUpload] Failed to ensure bucket exists');
      return false;
    }
    
    log('[TestImageUpload] Bucket test passed');
    
    // Test getting public URL for a dummy file (this shouldn't fail even if file doesn't exist)
    try {
      const { data: urlData } = supabase.storage
        .from('post-images')
        .getPublicUrl('test-file.jpg');
      
      if (urlData?.publicUrl) {
        log('[TestImageUpload] Public URL generation test passed:', urlData.publicUrl);
      } else {
        warn('[TestImageUpload] Public URL generation returned no URL');
      }
    } catch (urlError) {
      logError('[TestImageUpload] Public URL test failed:', urlError);
      return false;
    }
    
    log('[TestImageUpload] All tests passed - image upload should work');
    return true;
  } catch (error) {
    logError('[TestImageUpload] Test failed:', error);
    return false;
  }
}; 

 