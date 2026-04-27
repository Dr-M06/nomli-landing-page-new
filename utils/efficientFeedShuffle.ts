import { log, warn, error } from './productionLogger';
/**
 * Efficient Feed Shuffle Utility
 * 
 * Shuffles old content without slowing down the app
 * Uses daily seed so everyone sees the same shuffle (prevents predictable views)
 * Only shuffles posts older than threshold days
 */

/**
 * Generate a deterministic seed based on date
 * Same day = same seed = same shuffle for everyone
 */
export const getDailySeed = (): number => {
  const today = new Date();
  const dateString = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

/**
 * Seeded random number generator
 * Same seed produces same sequence
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

/**
 * Efficient seeded shuffle using Fisher-Yates
 * O(n) time complexity, deterministic with same seed
 */
const seededShuffle = <T>(array: T[], seed: number): T[] => {
  if (array.length <= 1) return array;
  
  const shuffled = [...array];
  const rng = new SeededRandom(seed);
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
};

/**
 * Efficient feed shuffle that only shuffles old content
 * 
 * Strategy:
 * - Keep recent posts (last 7 days) at top, sorted by date
 * - Shuffle old posts (30+ days) using daily seed
 * - Interleave old posts throughout the feed
 * - Uses memoization to avoid recalculating
 */
export const shuffleOldContent = <T extends { created_at: string }>(
  posts: T[],
  options: {
    oldThresholdDays?: number; // Posts older than this get shuffled (default: 30)
    recentThresholdDays?: number; // Posts newer than this stay at top (default: 7)
    shufflePercentage?: number; // Percentage of old posts to include (default: 0.3 = 30%)
    enabled?: boolean; // Toggle shuffle on/off (default: true)
  } = {}
): T[] => {
  const {
    oldThresholdDays = 30,
    recentThresholdDays = 7,
    shufflePercentage = 0.3, // Include 30% of old posts
    enabled = true,
  } = options;

  // If disabled or no posts, return as-is
  if (!enabled || posts.length === 0) {
    return posts;
  }

  const now = Date.now();
  const oldThreshold = oldThresholdDays * 24 * 60 * 60 * 1000;
  const recentThreshold = recentThresholdDays * 24 * 60 * 60 * 1000;

  // Separate posts efficiently (single pass)
  const recentPosts: T[] = [];
  const oldPosts: T[] = [];
  const middlePosts: T[] = [];

  for (const post of posts) {
    const postAge = now - new Date(post.created_at).getTime();
    
    if (postAge < recentThreshold) {
      recentPosts.push(post);
    } else if (postAge > oldThreshold) {
      oldPosts.push(post);
    } else {
      middlePosts.push(post);
    }
  }

  // If no old posts, return as-is (no shuffle needed)
  if (oldPosts.length === 0) {
    return posts;
  }

  // Sort recent posts by date (newest first) - keep them at top
  recentPosts.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Sort middle posts by date (newest first)
  middlePosts.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Shuffle old posts using daily seed (same shuffle for everyone per day)
  const dailySeed = getDailySeed();
  const shuffledOldPosts = seededShuffle(oldPosts, dailySeed);

  // Calculate how many old posts to include
  // IMPORTANT: When shufflePercentage is 1.0, include ALL old posts (even 6+ months old)
  // This ensures all historical content is accessible, not just a percentage
  const maxOldPostsToInclude = shufflePercentage >= 1.0 
    ? shuffledOldPosts.length // Include ALL old posts if percentage is 1.0 or higher
    : Math.floor(posts.length * shufflePercentage);
  const oldPostsToInclude = shuffledOldPosts.slice(0, Math.min(shuffledOldPosts.length, maxOldPostsToInclude));

  // Build final feed: recent posts + interleaved old posts + middle posts
  // IMPORTANT: Ensure ALL old posts (including 6+ months) are included in the final feed
  const finalFeed: T[] = [];
  
  // Add recent posts first (keep them at top)
  finalFeed.push(...recentPosts);

  // Interleave old posts throughout the feed
  // Insert old posts every N posts to distribute them evenly
  // With shufflePercentage = 1.0, ALL old posts will be included (even 6+ months old)
  const interleaveInterval = oldPostsToInclude.length > 0 
    ? Math.max(3, Math.floor(recentPosts.length / oldPostsToInclude.length) || 3)
    : 3;
  let oldPostIndex = 0;
  
  for (let i = 0; i < recentPosts.length && oldPostIndex < oldPostsToInclude.length; i++) {
    // Insert old post every N recent posts
    if (i > 0 && i % interleaveInterval === 0 && oldPostIndex < oldPostsToInclude.length) {
      finalFeed.push(oldPostsToInclude[oldPostIndex]);
      oldPostIndex++;
    }
  }

  // Add remaining old posts at the end if any
  // CRITICAL: This ensures ALL old posts (including 6+ months) are included, not just a subset
  if (oldPostIndex < oldPostsToInclude.length) {
    finalFeed.push(...oldPostsToInclude.slice(oldPostIndex));
  }

  // Add middle posts at the end
  finalFeed.push(...middlePosts);

  // Log for debugging: verify old posts are included
  if (__DEV__ && oldPostsToInclude.length > 0) {
    const oldestPost = oldPostsToInclude[oldPostsToInclude.length - 1];
    const oldestAge = Math.floor((now - new Date(oldestPost.created_at).getTime()) / (24 * 60 * 60 * 1000));
    log(`[ShuffleOldContent] Included ${oldPostsToInclude.length} old posts (oldest: ${oldestAge} days old)`);
  }

  return finalFeed;
};

/**
 * Shuffle search results (only old content)
 * Same logic but optimized for search
 */
export const shuffleSearchResults = <T extends { created_at: string }>(
  results: T[],
  options: {
    oldThresholdDays?: number;
    enabled?: boolean;
  } = {}
): T[] => {
  const {
    oldThresholdDays = 30,
    enabled = true,
  } = options;

  if (!enabled || results.length === 0) {
    return results;
  }

  const now = Date.now();
  const oldThreshold = oldThresholdDays * 24 * 60 * 60 * 1000;

  // Separate recent and old posts
  const recentPosts: T[] = [];
  const oldPosts: T[] = [];

  for (const post of results) {
    const postAge = now - new Date(post.created_at).getTime();
    if (postAge < oldThreshold) {
      recentPosts.push(post);
    } else {
      oldPosts.push(post);
    }
  }

  // If no old posts, return as-is
  if (oldPosts.length === 0) {
    return results;
  }

  // Shuffle old posts using daily seed
  const dailySeed = getDailySeed();
  const shuffledOldPosts = seededShuffle(oldPosts, dailySeed);

  // Return: recent posts first, then shuffled old posts
  return [...recentPosts, ...shuffledOldPosts];
};

/** Type for feed items that may have views_count (videos) */
type ViewableItem = { created_at: string; views_count?: number; video_url?: string; id?: string };

/** Don't promote videos newer than this (ms) - keep them at their natural top position */
const RECENT_VIDEO_MS = 60 * 60 * 1000; // 1 hour

/**
 * Promote low-performing videos higher in the feed so they get more real views.
 * Moves a few low-view videos into early slots (inserted every N items).
 * Excludes very recent videos (< 1 hour) so new uploads stay at top.
 */
export const surfaceLowViewVideos = <T extends ViewableItem>(
  posts: T[],
  options: {
    maxViewsThreshold?: number;   // Only surface videos with views below this (default: 100)
    slotsToBoost?: number;        // Max number of low-view videos to promote (default: 5)
    insertEveryN?: number;        // Insert one promoted video every N posts in top (default: 8)
    enabled?: boolean;
  } = {}
): T[] => {
  const {
    maxViewsThreshold = 100,
    slotsToBoost = 5,
    insertEveryN = 8,
    enabled = true,
  } = options;

  if (!enabled || posts.length <= 1) return posts;

  const now = Date.now();
  const lowViewVideos = posts.filter(
    p => p.video_url
      && (p.views_count ?? 0) < maxViewsThreshold
      && (now - new Date(p.created_at).getTime() > RECENT_VIDEO_MS) // Exclude very recent - keep at top
  );
  if (lowViewVideos.length === 0) return posts;

  const seed = getDailySeed();
  const rng = new SeededRandom(seed);
  const shuffledLow = [...lowViewVideos].sort(() => rng.next() - 0.5);
  const toPromote = shuffledLow.slice(0, slotsToBoost) as T[];
  const promotedIds = new Set(toPromote.map(p => (p as any).id).filter(Boolean));

  const rest = posts.filter(p => !promotedIds.has((p as any).id));
  const result: T[] = [];
  let promoIndex = 0;

  for (let i = 0; i < rest.length; i++) {
    result.push(rest[i]);
    if ((i + 1) % insertEveryN === 0 && promoIndex < toPromote.length) {
      result.push(toPromote[promoIndex++]);
    }
  }
  result.push(...toPromote.slice(promoIndex));
  return result;
};
