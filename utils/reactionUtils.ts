import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from './productionLogger';


// In-memory cache for reaction counts
const reactionCountsCache = new Map<string, { counts: { total: number; likes: number; loves: number; laughs: number }; timestamp: number }>();
const REACTION_COUNTS_CACHE_DURATION = 60000; // 1 minute cache duration

// In-memory cache for user reactions
const userReactionsCache = new Map<string, { reactions: ReactionType[]; timestamp: number }>();
const USER_REACTIONS_CACHE_DURATION = 60000; // 1 minute cache duration

// Persistent cache keys for AsyncStorage
const REACTION_COUNTS_CACHE_KEY_PREFIX = 'reaction_counts_cache_';
const REACTION_COUNTS_CACHE_TIMESTAMP_KEY_PREFIX = 'reaction_counts_timestamp_';
const REACTION_COUNTS_PERSISTENT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for persistent cache

const USER_REACTIONS_CACHE_KEY_PREFIX = 'user_reactions_cache_';
const USER_REACTIONS_CACHE_TIMESTAMP_KEY_PREFIX = 'user_reactions_timestamp_';
const USER_REACTIONS_PERSISTENT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for persistent cache

/**
 * Load reaction counts from persistent cache (AsyncStorage)
 */
const loadCachedReactionCounts = async (postId: string): Promise<{ total: number; likes: number; loves: number; laughs: number } | null> => {
  try {
    const cachedData = await AsyncStorage.getItem(REACTION_COUNTS_CACHE_KEY_PREFIX + postId);
    const timestampStr = await AsyncStorage.getItem(REACTION_COUNTS_CACHE_TIMESTAMP_KEY_PREFIX + postId);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      // Check if cache is still valid (within 5 minutes)
      if (now - timestamp < REACTION_COUNTS_PERSISTENT_CACHE_DURATION) {
        log(`[ReactionUtils] Loading reaction counts from persistent cache for post ${postId} (age: ${Math.round((now - timestamp) / 1000)} seconds)`);
        return JSON.parse(cachedData);
      } else {
        // Silently clear expired cache - no logging to reduce noise
        await AsyncStorage.multiRemove([
          REACTION_COUNTS_CACHE_KEY_PREFIX + postId,
          REACTION_COUNTS_CACHE_TIMESTAMP_KEY_PREFIX + postId
        ]);
      }
    }
  } catch (error) {
    error('[ReactionUtils] Error loading cached reaction counts:', error);
  }
  return null;
};

/**
 * Save reaction counts to persistent cache (AsyncStorage)
 */
const saveCachedReactionCounts = async (postId: string, counts: { total: number; likes: number; loves: number; laughs: number }): Promise<void> => {
  try {
    const now = Date.now();
    const countsString = JSON.stringify(counts);
    
    await AsyncStorage.multiSet([
      [REACTION_COUNTS_CACHE_KEY_PREFIX + postId, countsString],
      [REACTION_COUNTS_CACHE_TIMESTAMP_KEY_PREFIX + postId, now.toString()]
    ]);
    
    log(`[ReactionUtils] ✅ Saved reaction counts to persistent cache for post ${postId}`);
  } catch (error: any) {
    error('[ReactionUtils] Error saving cached reaction counts:', error);
    
    // Handle iOS-specific storage quota errors
    if (error?.message?.includes('quota') || error?.message?.includes('storage') || error?.code === 'EUNSPECIFIED') {
      warn('[ReactionUtils] Storage quota exceeded, skipping reaction counts cache save...');
    }
  }
};

/**
 * Load user reactions from persistent cache (AsyncStorage)
 */
const loadCachedUserReactions = async (postId: string, userId: string): Promise<ReactionType[] | null> => {
  try {
    const cacheKey = `${postId}_${userId}`;
    const cachedData = await AsyncStorage.getItem(USER_REACTIONS_CACHE_KEY_PREFIX + cacheKey);
    const timestampStr = await AsyncStorage.getItem(USER_REACTIONS_CACHE_TIMESTAMP_KEY_PREFIX + cacheKey);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      // Check if cache is still valid (within 5 minutes)
      if (now - timestamp < USER_REACTIONS_PERSISTENT_CACHE_DURATION) {
        log(`[ReactionUtils] Loading user reactions from persistent cache for post ${postId} (age: ${Math.round((now - timestamp) / 1000)} seconds)`);
        return JSON.parse(cachedData);
      } else {
        // Silently clear expired cache - no logging to reduce noise
        await AsyncStorage.multiRemove([
          USER_REACTIONS_CACHE_KEY_PREFIX + cacheKey,
          USER_REACTIONS_CACHE_TIMESTAMP_KEY_PREFIX + cacheKey
        ]);
      }
    }
  } catch (error) {
    error('[ReactionUtils] Error loading cached user reactions:', error);
  }
  return null;
};

/**
 * Save user reactions to persistent cache (AsyncStorage)
 */
const saveCachedUserReactions = async (postId: string, userId: string, reactions: ReactionType[]): Promise<void> => {
  try {
    const cacheKey = `${postId}_${userId}`;
    const now = Date.now();
    const reactionsString = JSON.stringify(reactions);
    
    await AsyncStorage.multiSet([
      [USER_REACTIONS_CACHE_KEY_PREFIX + cacheKey, reactionsString],
      [USER_REACTIONS_CACHE_TIMESTAMP_KEY_PREFIX + cacheKey, now.toString()]
    ]);
    
    log(`[ReactionUtils] ✅ Saved user reactions to persistent cache for post ${postId}`);
  } catch (error: any) {
    error('[ReactionUtils] Error saving cached user reactions:', error);
    
    // Handle iOS-specific storage quota errors
    if (error?.message?.includes('quota') || error?.message?.includes('storage') || error?.code === 'EUNSPECIFIED') {
      warn('[ReactionUtils] Storage quota exceeded, skipping user reactions cache save...');
    }
  }
};

/**
 * Clear reaction cache for a specific post
 */
export const clearReactionCache = async (postId: string, userId?: string): Promise<void> => {
  try {
    // Clear in-memory cache
    reactionCountsCache.delete(postId);
    if (userId) {
      userReactionsCache.delete(`${postId}_${userId}`);
    }
    
    // Clear persistent cache
    await AsyncStorage.multiRemove([
      REACTION_COUNTS_CACHE_KEY_PREFIX + postId,
      REACTION_COUNTS_CACHE_TIMESTAMP_KEY_PREFIX + postId,
      ...(userId ? [
        USER_REACTIONS_CACHE_KEY_PREFIX + `${postId}_${userId}`,
        USER_REACTIONS_CACHE_TIMESTAMP_KEY_PREFIX + `${postId}_${userId}`
      ] : [])
    ]);
    
    log(`[ReactionUtils] ✅ Cleared reaction cache for post ${postId}`);
  } catch (error) {
    error('[ReactionUtils] Error clearing reaction cache:', error);
  }
};

export type ReactionType = 'like' | 'laugh'; // Removed 'love' (pink heart) - only like (red heart) and laugh now

export type Reaction = {
  id: string;
  user_id: string;
  post_id: string;
  reaction_type: ReactionType;
  created_at: string;
  user?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string;
  };
};

/**
 * Toggle a reaction on a post
 * @param postId - The ID of the post
 * @param reactionType - The type of reaction ('like', 'love', 'laugh')
 * @returns A promise resolving to the result of the toggle operation
 */
export async function toggleReaction(postId: string, reactionType: ReactionType) {
  try {
    // Check if this is a placeholder post - cannot react to placeholder posts
    if (postId.startsWith('placeholder-post-')) {
      log(`[ReactionUtils] Cannot react to placeholder post: ${postId}`);
      throw new Error('Cannot react to placeholder posts');
    }

    // Validate UUID format before querying database
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(postId)) {
      warn(`[ReactionUtils] Invalid UUID format for postId: ${postId}`);
      throw new Error('Invalid post ID format');
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw new Error('User not authenticated');
    }
    
    const { data, error } = await supabase.rpc('toggle_post_reaction', {
      p_post_id: postId,
      p_user_id: userData.user.id,
      p_reaction_type: reactionType
    });

    if (error) {
      error('Error toggling reaction:', error);
      throw error;
    }

    // Clear cache after toggling reaction
    await clearReactionCache(postId, userData.user.id);

    return data;
  } catch (error) {
    error('Error in toggleReaction:', error);
    throw error;
  }
}

/**
 * Get all reactions for a post
 * @param postId - The ID of the post
 * @returns A promise resolving to an array of reactions
 */
export async function getPostReactions(postId: string): Promise<Reaction[]> {
  try {
    // Check if this is a placeholder post - return empty array without querying database
    if (postId.startsWith('placeholder-post-')) {
      log(`[ReactionUtils] Placeholder post detected, returning empty reactions for ${postId}`);
      return [];
    }

    // Validate UUID format before querying database
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(postId)) {
      warn(`[ReactionUtils] Invalid UUID format for postId: ${postId}, returning empty reactions`);
      return [];
    }

    // First try the new post_reactions table
    const { data: reactionsData, error: reactionsError } = await supabase
      .from('post_reactions')
      .select('id, user_id, post_id, reaction_type, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });

    let likesData: any[] = [];
    
    // If no reactions found, fallback to old post_likes table
    if (reactionsError || !reactionsData || reactionsData.length === 0) {
      // Try post_likes first
      const { data: postLikesData, error: postLikesError } = await supabase
        .from('post_likes')
        .select('id, user_id, post_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });

      if (!postLikesError && postLikesData && postLikesData.length > 0) {
        likesData = postLikesData;
      } else {
        // Try community_post_likes as another fallback
        const { data: communityLikesData, error: communityError } = await supabase
          .from('community_post_likes')
          .select('id, user_id, post_id, created_at')
          .eq('post_id', postId)
          .order('created_at', { ascending: false });

        if (!communityError && communityLikesData && communityLikesData.length > 0) {
          likesData = communityLikesData;
        }
      }

      // If we have old likes, convert them to reactions format
      if (likesData.length > 0) {
        const userIds = likesData.map(l => l.user_id);
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url, is_verified')
          .in('id', userIds);

        if (profilesError) {
          error('Error fetching profiles:', profilesError);
        }

        // Convert old likes to reactions (all treated as 'like' type)
        return likesData.map(like => ({
          id: like.id,
          user_id: like.user_id,
          post_id: like.post_id,
          reaction_type: 'like' as ReactionType,
          created_at: like.created_at,
          user: profilesData?.find(p => p.id === like.user_id) || undefined
        }));
      }

      // No reactions found in any table
      return [];
    }

    // We have reactions from post_reactions table
    const userIds = reactionsData.map(r => r.user_id);
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, is_verified')
      .in('id', userIds);

    if (profilesError) {
      error('Error fetching profiles:', profilesError);
      // Return reactions without profiles if profile fetch fails
      return reactionsData.map(r => ({
        ...r,
        reaction_type: r.reaction_type as ReactionType,
        user: undefined
      }));
    }

    // Combine reactions with profiles
    return reactionsData.map(reaction => ({
      ...reaction,
      reaction_type: reaction.reaction_type as ReactionType,
      user: profilesData?.find(p => p.id === reaction.user_id) || undefined
    }));
  } catch (error) {
    error('Error in getPostReactions:', error);
    return [];
  }
}

/**
 * Get reaction counts for a post
 * @param postId - The ID of the post
 * @param useCache - Whether to use cache (default: true)
 * @returns A promise resolving to an object with reaction counts
 */
export async function getReactionCounts(postId: string, useCache: boolean = true) {
  try {
    // Check if this is a placeholder post - return default counts without querying database
    if (postId.startsWith('placeholder-post-')) {
      log(`[ReactionUtils] Placeholder post detected, returning default counts for ${postId}`);
      return { total: 0, likes: 0, loves: 0, laughs: 0 };
    }

    // Validate UUID format before querying database
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(postId)) {
      warn(`[ReactionUtils] Invalid UUID format for postId: ${postId}, returning default counts`);
      return { total: 0, likes: 0, loves: 0, laughs: 0 };
    }

    // Check in-memory cache first
    if (useCache) {
      const cached = reactionCountsCache.get(postId);
      if (cached && Date.now() - cached.timestamp < REACTION_COUNTS_CACHE_DURATION) {
        log(`[ReactionUtils] Using in-memory cached reaction counts for post ${postId}`);
        return cached.counts;
      }

      // Check persistent cache
      const persistentCached = await loadCachedReactionCounts(postId);
      if (persistentCached) {
        // Update in-memory cache
        reactionCountsCache.set(postId, { counts: persistentCached, timestamp: Date.now() });
        return persistentCached;
      }
    }

    // First try the new post_reactions table (include user_id to exclude placeholder accounts)
    const { data: reactionsData, error: reactionsError } = await supabase
      .from('post_reactions')
      .select('reaction_type, user_id')
      .eq('post_id', postId);

    let counts: { total: number; likes: number; loves: number; laughs: number };

    if (!reactionsError && reactionsData && reactionsData.length > 0) {
      // Exclude placeholder accounts from counts
      const userIds = [...new Set(reactionsData.map(r => r.user_id))];
      let placeholderIds: Set<string> = new Set();
      if (userIds.length > 0) {
        const { data: placeholders } = await supabase
          .from('profiles')
          .select('id')
          .in('id', userIds)
          .eq('is_placeholder', true);
        if (placeholders?.length) placeholderIds = new Set(placeholders.map((p: { id: string }) => p.id));
      }
      const filtered = reactionsData.filter(r => !placeholderIds.has(r.user_id));
      const total = filtered.length;
      const likes = filtered.filter(r => r.reaction_type === 'like').length;
      const loves = 0; // DISABLED: 'love' reaction removed - only like and laugh now
      const laughs = filtered.filter(r => r.reaction_type === 'laugh').length;

      counts = { total, likes, loves, laughs };
    } else {
      // Fallback to old post_likes table (include user_id to exclude placeholder accounts)
      const { data: likesData, error: likesError } = await supabase
        .from('post_likes')
        .select('id, user_id')
        .eq('post_id', postId);

      if (likesError) {
        // Try community_post_likes as another fallback
        const { data: communityLikesData, error: communityError } = await supabase
          .from('community_post_likes')
          .select('id')
          .eq('post_id', postId);

        if (communityError) {
          error('Error fetching reaction counts from all sources:', { reactionsError, likesError, communityError });
          counts = { total: 0, likes: 0, loves: 0, laughs: 0 };
        } else {
          // Use community_post_likes count
          const count = communityLikesData?.length || 0;
          counts = { total: count, likes: count, loves: 0, laughs: 0 };
        }
      } else {
        // Exclude placeholder accounts from post_likes count
        const likeUserIds = (likesData || []).map((l: { user_id: string }) => l.user_id);
        let placeholderIds: Set<string> = new Set();
        if (likeUserIds.length > 0) {
          const { data: placeholders } = await supabase
            .from('profiles')
            .select('id')
            .in('id', likeUserIds)
            .eq('is_placeholder', true);
          if (placeholders?.length) placeholderIds = new Set(placeholders.map((p: { id: string }) => p.id));
        }
        const count = (likesData || []).filter((l: { user_id: string }) => !placeholderIds.has(l.user_id)).length;
        counts = { total: count, likes: count, loves: 0, laughs: 0 };
      }
    }

    // Save to cache
    if (useCache) {
      reactionCountsCache.set(postId, { counts, timestamp: Date.now() });
      await saveCachedReactionCounts(postId, counts);
    }

    return counts;
  } catch (error) {
    error('Error in getReactionCounts:', error);
    return { total: 0, likes: 0, loves: 0, laughs: 0 };
  }
}

/**
 * Check if the current user has reacted to a post
 * @param postId - The ID of the post
 * @param useCache - Whether to use cache (default: true)
 * @returns A promise resolving to the user's reaction types (array) or empty array if no reactions
 * Note: Users can now have multiple reactions (like AND laugh) on the same post
 */
export async function getUserReactions(postId: string, useCache: boolean = true): Promise<ReactionType[]> {
  try {
    // Check if this is a placeholder post - return empty array without querying database
    if (postId.startsWith('placeholder-post-')) {
      log(`[ReactionUtils] Placeholder post detected, returning empty reactions for ${postId}`);
      return [];
    }

    // Validate UUID format before querying database
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(postId)) {
      warn(`[ReactionUtils] Invalid UUID format for postId: ${postId}, returning empty reactions`);
      return [];
    }

    const user = await supabase.auth.getUser();
    if (!user.data.user) return [];

    const cacheKey = `${postId}_${user.data.user.id}`;

    // Check in-memory cache first
    if (useCache) {
      const cached = userReactionsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < USER_REACTIONS_CACHE_DURATION) {
        log(`[ReactionUtils] Using in-memory cached user reactions for post ${postId}`);
        return cached.reactions;
      }

      // Check persistent cache
      const persistentCached = await loadCachedUserReactions(postId, user.data.user.id);
      if (persistentCached !== null) {
        // Update in-memory cache
        userReactionsCache.set(cacheKey, { reactions: persistentCached, timestamp: Date.now() });
        return persistentCached;
      }
    }

    const { data, error } = await supabase
      .from('post_reactions')
      .select('reaction_type')
      .eq('post_id', postId)
      .eq('user_id', user.data.user.id);

    if (error) {
      if (error.code === 'PGRST116') {
        // No reactions found
        const emptyReactions: ReactionType[] = [];
        if (useCache) {
          userReactionsCache.set(cacheKey, { reactions: emptyReactions, timestamp: Date.now() });
          await saveCachedUserReactions(postId, user.data.user.id, emptyReactions);
        }
        return emptyReactions;
      }
      error('Error fetching user reactions:', error);
      return [];
    }

    const reactions = (data?.map(r => r.reaction_type as ReactionType) || []);

    // Save to cache
    if (useCache) {
      userReactionsCache.set(cacheKey, { reactions, timestamp: Date.now() });
      await saveCachedUserReactions(postId, user.data.user.id, reactions);
    }

    return reactions;
  } catch (error) {
    error('Error in getUserReactions:', error);
    return [];
  }
}

/**
 * Check if the current user has a specific reaction type on a post
 * @param postId - The ID of the post
 * @param reactionType - The reaction type to check for
 * @returns A promise resolving to true if the user has this reaction, false otherwise
 */
export async function hasUserReaction(postId: string, reactionType: ReactionType): Promise<boolean> {
  try {
    const reactions = await getUserReactions(postId);
    return reactions.includes(reactionType);
  } catch (error) {
    error('Error in hasUserReaction:', error);
    return false;
  }
}

/**
 * Get the primary reaction for a user (for backwards compatibility)
 * Returns the first reaction found, prioritizing 'like' > 'laugh' (removed 'love')
 * @param postId - The ID of the post
 * @param useCache - Whether to use cache (default: true)
 * @returns A promise resolving to the user's primary reaction type or null
 * @deprecated Use getUserReactions instead to get all reactions
 */
export async function getUserReaction(postId: string, useCache: boolean = true): Promise<ReactionType | null> {
  try {
    const reactions = await getUserReactions(postId, useCache);
    if (reactions.length === 0) return null;
    
    // Return priority: like > love > laugh
    if (reactions.includes('like')) return 'like';
    // Removed 'love' - only 'like' and 'laugh' now
    if (reactions.includes('laugh')) return 'laugh';
    
    return reactions[0];
  } catch (error) {
    error('Error in getUserReaction:', error);
    return null;
  }
} 