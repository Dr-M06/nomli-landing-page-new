/**
 * Feed Randomization Utilities
 * Helps make the feed less predictable by randomizing post order
 * and surfacing older content
 */

/**
 * Fisher-Yates shuffle algorithm for true randomization
 */
export const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Generate a deterministic random seed based on date
 * This ensures the same shuffle for the same day, but different each day
 */
export const getDailySeed = (): number => {
  const today = new Date();
  const dateString = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

/**
 * Seeded shuffle - same seed produces same shuffle
 * Useful for consistent randomization per day
 */
export const seededShuffle = <T>(array: T[], seed: number): T[] => {
  const shuffled = [...array];
  let random = seed;
  
  // Simple seeded random number generator
  const seededRandom = () => {
    random = (random * 9301 + 49297) % 233280;
    return random / 233280;
  };
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Randomize posts with strategy:
 * - Prioritize recent posts (last 7 days) at the top
 * - Small chance (15%) to show old posts at top for discovery
 * - Mix older content throughout feed but keep recent posts prominent
 * - Ensure latest posts are always visible
 */
export const randomizeFeed = <T extends { created_at: string }>(
  posts: T[],
  options: {
    oldPostChance?: number; // 0-1, default 0.15 (15%)
    oldPostThresholdDays?: number; // default 30
    recentThresholdDays?: number; // default 7
    useDailySeed?: boolean; // default true
    oldPostPercentage?: number; // Percentage of old posts to include, default 0.25 (25%)
    prioritizeRecent?: boolean; // Always show recent posts first, default true
  } = {}
): T[] => {
  const {
    oldPostChance = 0.15, // Reduced to 15% - less aggressive
    oldPostThresholdDays = 30,
    recentThresholdDays = 7,
    useDailySeed = true,
    oldPostPercentage = 0.25, // Reduced to 25% - prioritize recent content
    prioritizeRecent = true, // Always prioritize recent posts
  } = options;

  if (posts.length === 0) return posts;

  const now = Date.now();
  const oldThreshold = oldPostThresholdDays * 24 * 60 * 60 * 1000;
  const recentThreshold = recentThresholdDays * 24 * 60 * 60 * 1000;

  // Separate posts by age
  const recentPosts: T[] = [];
  const oldPosts: T[] = [];
  const middlePosts: T[] = [];

  posts.forEach(post => {
    const postAge = now - new Date(post.created_at).getTime();
    
    if (postAge < recentThreshold) {
      recentPosts.push(post);
    } else if (postAge > oldThreshold) {
      oldPosts.push(post);
    } else {
      middlePosts.push(post);
    }
  });

  // Decide if we should surface old posts at the top
  const shouldShowOldPosts = Math.random() < oldPostChance;
  
  // Sort recent posts by date (newest first) - DON'T shuffle these, keep them in order
  // This ensures the latest posts are always at the top
  const sortedRecentPosts = [...recentPosts].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA; // Newest first
  });
  
  // Shuffle old and middle posts, but keep recent posts sorted by date
  const seed = useDailySeed ? getDailySeed() : Date.now();
  // Keep recent posts in date order (newest first) - don't shuffle them
  const shuffledRecent = sortedRecentPosts; // No shuffle - keep newest at top
  const shuffledOld = seededShuffle(oldPosts, seed + 1);
  const shuffledMiddle = seededShuffle(middlePosts, seed + 2);

  // Build randomized feed prioritizing recent posts
  let randomizedFeed: T[] = [];

  // Calculate how many posts from each category to include
  // Target: ~50% recent posts, ~25% middle posts, ~25% old posts
  const totalPostsToShow = Math.min(posts.length, 200); // Increased limit to show more content
  
  const targetRecentCount = Math.floor(totalPostsToShow * 0.5); // 50% recent posts
  const targetOldCount = Math.floor(totalPostsToShow * oldPostPercentage); // 25% old posts
  const targetMiddleCount = totalPostsToShow - targetRecentCount - targetOldCount; // Remaining for middle

  // Take posts from each category
  const recentPostsToInclude = shuffledRecent.slice(0, Math.min(shuffledRecent.length, targetRecentCount));
  const oldPostsToInclude = shuffledOld.slice(0, Math.min(shuffledOld.length, targetOldCount));
  const middlePostsToInclude = shuffledMiddle.slice(0, Math.min(shuffledMiddle.length, targetMiddleCount));

  if (prioritizeRecent) {
    // Strategy: Show recent posts first, then interleave older content
    
    // 1. Add top recent posts first (ensures latest content is visible)
    const topRecentCount = Math.min(15, recentPostsToInclude.length);
    const topRecentPosts = recentPostsToInclude.slice(0, topRecentCount);
    randomizedFeed.push(...topRecentPosts);
    
    // 2. Remaining posts to mix
    const remainingRecent = recentPostsToInclude.slice(topRecentCount);
    
    // 3. Interleave remaining posts: recent > middle > old priority
    const allPostsToMix = [
      ...remainingRecent.map(p => ({ post: p, category: 'recent', priority: 3 })),
      ...middlePostsToInclude.map(p => ({ post: p, category: 'middle', priority: 2 })),
      ...oldPostsToInclude.map(p => ({ post: p, category: 'old', priority: 1 })),
    ];
    
    // Sort by priority (recent first), then shuffle within each priority group
    allPostsToMix.sort((a, b) => b.priority - a.priority);
    const shuffledMixed = seededShuffle(allPostsToMix, seed + 5);
    const mixedPosts = shuffledMixed.map(item => item.post);
    
    // 4. Small chance to add 1-2 old posts at very top (for discovery, but rare)
    if (shouldShowOldPosts && oldPostsToInclude.length > 0) {
      const discoveryOldPosts = oldPostsToInclude.slice(0, Math.min(2, oldPostsToInclude.length));
      randomizedFeed.unshift(...discoveryOldPosts);
    }
    
    // 5. Add mixed posts after top recent posts
    randomizedFeed.push(...mixedPosts);
  } else {
    // Fallback: Mix all posts but still prioritize recent
    const allPostsToMix = [
      ...recentPostsToInclude.map(p => ({ post: p, category: 'recent', priority: 3 })),
      ...middlePostsToInclude.map(p => ({ post: p, category: 'middle', priority: 2 })),
      ...oldPostsToInclude.map(p => ({ post: p, category: 'old', priority: 1 })),
    ];
    
    allPostsToMix.sort((a, b) => b.priority - a.priority);
    const shuffledMixed = seededShuffle(allPostsToMix, seed + 5);
    randomizedFeed = shuffledMixed.map(item => item.post);
    
    // Small chance to add old posts at top
    if (shouldShowOldPosts && oldPostsToInclude.length > 0) {
      const oldPostsAtTop = oldPostsToInclude.slice(0, Math.min(3, oldPostsToInclude.length));
      randomizedFeed.unshift(...oldPostsAtTop);
    }
  }

  return randomizedFeed;
};

/**
 * Simple random shuffle - completely random order
 */
export const completelyRandomize = <T>(array: T[]): T[] => {
  return shuffleArray(array);
};

/**
 * Weighted randomization - gives older posts a chance to appear
 * Weight decreases with age but never reaches zero
 */
export const weightedRandomize = <T extends { created_at: string }>(
  posts: T[],
  options: {
    maxAgeDays?: number; // Posts older than this get minimum weight
    minWeight?: number; // Minimum weight for very old posts (0-1)
  } = {}
): T[] => {
  const { maxAgeDays = 90, minWeight = 0.1 } = options;
  
  if (posts.length === 0) return posts;

  const now = Date.now();
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;

  // Calculate weights for each post
  const weightedPosts = posts.map(post => {
    const age = now - new Date(post.created_at).getTime();
    const ageDays = age / (24 * 60 * 60 * 1000);
    
    // Weight decreases with age but never below minWeight
    let weight = 1;
    if (ageDays > 7) {
      // After 7 days, weight decreases
      const decayFactor = Math.max(minWeight, 1 - (ageDays - 7) / maxAgeDays);
      weight = Math.max(minWeight, decayFactor);
    }
    
    return { post, weight, random: Math.random() * weight };
  });

  // Sort by random * weight (higher weight = more likely to appear early)
  weightedPosts.sort((a, b) => b.random - a.random);

  return weightedPosts.map(wp => wp.post);
};
