import { supabase } from './supabase';
import { Post } from './communityUtils';
import { extractHashtags } from './textFormatting';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from './productionLogger';


export interface HashtagTrend {
  hashtag: string;
  count: number;
  recentPosts: number;
}

export interface UserSearchResult {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_premium: boolean;
}

const SEARCH_HISTORY_KEY = 'search_history';
const MAX_SEARCH_HISTORY = 10;

// Cache for search results
const searchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache

const getCached = <T>(key: string): T | null => {
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  searchCache.delete(key);
  return null;
};

const setCache = (key: string, data: any) => {
  searchCache.set(key, { data, timestamp: Date.now() });
};

/**
 * Extract hashtags from a post's content
 */
export const extractHashtagsFromPost = (post: Post): string[] => {
  if (!post.content) return [];
  return extractHashtags(post.content);
};

/**
 * Search for users by username or full name - OPTIMIZED
 * Uses single efficient database query with caching
 */
export const searchUsers = async (
  query: string,
  limit: number = 20
): Promise<UserSearchResult[]> => {
  try {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = query.trim().toLowerCase();
    const cacheKey = `users:${searchTerm}:${limit}`;
    
    // Check cache first
    const cached = getCached<UserSearchResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Single efficient query with index-friendly pattern
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, is_verified')
      .or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
      .order('is_verified', { ascending: false }) // Verified users first
      .limit(limit);

    if (error) {
      error('[Search] User search error:', error);
      return [];
    }

    const results = (data || []).map(user => ({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      is_verified: user.is_verified || false,
      is_premium: false,
    }));

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    error('[Search] User search error:', error);
    return [];
  }
};

/** Profile shape for Discover search (only non-hidden profiles) */
export interface DiscoverSearchProfile {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  country?: string | null;
  age?: number | null;
  interests?: string[] | null;
  is_verified?: boolean;
  is_placeholder?: boolean;
  gender?: string | null;
  show_me?: string | null;
}

/**
 * Search users on Discover: only profiles that are not hidden (profile_visible = true).
 * Use for the Discover screen search bar.
 */
export const searchDiscoverUsers = async (
  query: string,
  currentUserId?: string,
  limit: number = 30
): Promise<DiscoverSearchProfile[]> => {
  try {
    if (!query || query.trim().length < 2) return [];

    const term = query.trim();
    const cacheKey = `discover:${term}:${currentUserId || ''}:${limit}`;
    const cached = getCached<DiscoverSearchProfile[]>(cacheKey);
    if (cached) return cached;

    let q = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, country, age, interests, is_verified, is_placeholder, gender, show_me')
      .eq('profile_visible', true)
      .or(`username.ilike.%${term}%,full_name.ilike.%${term}%`)
      .limit(limit);

    if (currentUserId) {
      q = q.not('id', 'eq', currentUserId);
    }

    const { data, error } = await q;

    if (error) {
      if (error.message?.includes('profile_visible') || error.code === '42703') {
        const fallback = supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, bio, country, age, interests, is_verified, is_placeholder, gender, show_me')
          .or(`username.ilike.%${term}%,full_name.ilike.%${term}%`)
          .limit(limit);
        const res = currentUserId ? fallback.not('id', 'eq', currentUserId) : fallback;
        const { data: d } = await res;
        const list = ((d || []) as any[]).filter((p) => p?.profile_visible !== false);
        setCache(cacheKey, list);
        return list;
      }
      warn('[Search] Discover search error:', error);
      return [];
    }

    const list = (data || []) as DiscoverSearchProfile[];
    setCache(cacheKey, list);
    return list;
  } catch (e) {
    warn('[Search] Discover search error:', e);
    return [];
  }
};

/**
 * Search posts by query - OPTIMIZED
 * Uses efficient database query instead of client-side filtering
 */
export const searchPosts = async (
  query: string,
  limit: number = 50,
  offset: number = 0
): Promise<Post[]> => {
  try {
    if (!query || query.trim().length < 2) {
      return [];
    }

    // Normalize query
    let normalizedQuery = query.trim();
    while (normalizedQuery.startsWith('##')) {
      normalizedQuery = normalizedQuery.substring(1);
    }

    const searchTerm = normalizedQuery.toLowerCase();
    const isHashtag = searchTerm.startsWith('#');
    const hashtagTerm = isHashtag ? searchTerm.substring(1) : searchTerm;

    const cacheKey = `posts:${searchTerm}:${limit}:${offset}`;
    
    // Check cache first
    const cached = getCached<Post[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query - search posts by content
    let postsQuery = supabase
      .from('posts')
      .select('*');

    if (isHashtag) {
      // Search for hashtag in content
      postsQuery = postsQuery.ilike('content', `%#${hashtagTerm}%`);
    } else {
      // General content search
      postsQuery = postsQuery.ilike('content', `%${searchTerm}%`);
    }

    // Order and paginate
    const { data, error } = await postsQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      error('[Search] Post search error:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Get unique user IDs and fetch profiles
    const userIds = [...new Set(data.map((post: any) => post.user_id).filter(Boolean))];
    
    let profileMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_verified')
        .in('id', userIds);
      
      if (profiles) {
        profileMap = profiles.reduce((map: any, p: any) => {
          map[p.id] = p;
          return map;
        }, {});
      }
    }

    // Enrich posts with profile data
    const enrichedPosts = data.map((post: any) => {
      const profile = profileMap[post.user_id];
      return {
        ...post,
        profile: profile || null,
        username: post.display_name || profile?.username || profile?.full_name || 
          post.user_email?.split('@')[0] || 'User',
        display_name: post.display_name || profile?.full_name || profile?.username,
        user_avatar_url: profile?.avatar_url || null,
        is_verified: profile?.is_verified || false,
        likes_count: post.likes_count || 0,
        comments_count: post.comments_count || 0,
        views_count: post.views_count || 0,
      };
    });

    setCache(cacheKey, enrichedPosts);
    return enrichedPosts as Post[];
  } catch (error) {
    error('[Search] Post search error:', error);
    return [];
  }
};

/**
 * Get posts by specific hashtag - OPTIMIZED
 */
export const getPostsByHashtag = async (
  hashtag: string,
  limit: number = 50,
  offset: number = 0
): Promise<Post[]> => {
  const normalizedHashtag = hashtag.startsWith('#') 
    ? hashtag.toLowerCase() 
    : `#${hashtag.toLowerCase()}`;
  return searchPosts(normalizedHashtag, limit, offset);
};

/**
 * Get trending hashtags - OPTIMIZED with caching
 * Fetches fewer posts and caches results
 */
export const getTrendingHashtags = async (limit: number = 20): Promise<HashtagTrend[]> => {
  try {
    const cacheKey = `trending:${limit}`;
    
    // Check cache first (longer TTL for trending)
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
      return cached.data;
    }

    // Fetch only recent posts with content
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentPosts, error } = await supabase
      .from('posts')
      .select('content')
      .gte('created_at', sevenDaysAgo.toISOString())
      .not('content', 'is', null)
      .limit(300); // Reduced from 1000

    if (error || !recentPosts) {
      return [];
    }

    // Count hashtags
    const hashtagCounts = new Map<string, number>();
    
    recentPosts.forEach((post: any) => {
      if (!post.content) return;
      const hashtags = extractHashtags(post.content);
      hashtags.forEach(tag => {
        const normalized = tag.toLowerCase();
        hashtagCounts.set(normalized, (hashtagCounts.get(normalized) || 0) + 1);
      });
    });

    // Convert to sorted array
    const trending: HashtagTrend[] = Array.from(hashtagCounts.entries())
      .map(([hashtag, count]) => ({ hashtag, count, recentPosts: count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    setCache(cacheKey, trending);
    return trending;
  } catch (error) {
    error('[Search] Trending hashtags error:', error);
    return [];
  }
};

/**
 * Get suggested hashtags based on input - OPTIMIZED
 * Uses cached trending hashtags when possible
 */
export const getSuggestedHashtags = async (
  input: string,
  _trendingHashtags: HashtagTrend[] = []
): Promise<HashtagTrend[]> => {
  if (!input || input.trim().length < 2) {
    return [];
  }

  try {
    const searchTerm = input.startsWith('#') 
      ? input.substring(1).toLowerCase().trim()
      : input.toLowerCase().trim();

    if (searchTerm.length === 0) {
      return [];
    }

    const cacheKey = `hashtag_suggest:${searchTerm}`;
    
    // Check cache first
    const cached = getCached<HashtagTrend[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // First try to filter from trending hashtags (fast)
    const trending = await getTrendingHashtags(50);
    const fromTrending = trending.filter(t => 
      t.hashtag.toLowerCase().includes(searchTerm)
    );

    if (fromTrending.length >= 5) {
      const results = fromTrending.slice(0, 10);
      setCache(cacheKey, results);
      return results;
    }

    // If not enough from trending, do a quick database search
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: posts, error } = await supabase
      .from('posts')
      .select('content')
      .ilike('content', `%#${searchTerm}%`)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .limit(100); // Reduced from 500

    if (error || !posts) {
      return fromTrending.slice(0, 10);
    }

    // Count matching hashtags
    const hashtagCounts = new Map<string, number>();
    
    posts.forEach((post: any) => {
      if (!post.content) return;
      const hashtags = extractHashtags(post.content);
      hashtags.forEach(tag => {
        const normalized = tag.toLowerCase();
        if (normalized.includes(searchTerm)) {
          hashtagCounts.set(normalized, (hashtagCounts.get(normalized) || 0) + 1);
        }
      });
    });

    // Merge with trending results
    fromTrending.forEach(t => {
      if (!hashtagCounts.has(t.hashtag)) {
        hashtagCounts.set(t.hashtag, t.count);
      }
    });

    const suggestions: HashtagTrend[] = Array.from(hashtagCounts.entries())
      .map(([hashtag, count]) => ({
        hashtag: hashtag.startsWith('#') ? hashtag : `#${hashtag}`,
        count,
        recentPosts: count
      }))
      .sort((a, b) => {
        // Exact match first
        const aExact = a.hashtag.toLowerCase() === `#${searchTerm}`;
        const bExact = b.hashtag.toLowerCase() === `#${searchTerm}`;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return b.count - a.count;
      })
      .slice(0, 10);

    setCache(cacheKey, suggestions);
    return suggestions;
  } catch (error) {
    error('[Search] Hashtag suggestions error:', error);
    return [];
  }
};

/**
 * Save search query to history
 */
export const saveSearchHistory = async (query: string): Promise<void> => {
  try {
    if (!query || query.trim().length === 0) return;

    const trimmedQuery = query.trim();
    const history = await getSearchHistory();
    const filteredHistory = history.filter(item => item !== trimmedQuery);
    const newHistory = [trimmedQuery, ...filteredHistory].slice(0, MAX_SEARCH_HISTORY);
    
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
  } catch (error) {
    error('[Search] Save history error:', error);
  }
};

/**
 * Get search history
 */
export const getSearchHistory = async (): Promise<string[]> => {
  try {
    const historyJson = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    if (!historyJson) return [];
    const history = JSON.parse(historyJson);
    return Array.isArray(history) ? history : [];
  } catch (error) {
    error('[Search] Get history error:', error);
    return [];
  }
};

/**
 * Clear search history
 */
export const clearSearchHistory = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch (error) {
    error('[Search] Clear history error:', error);
  }
};

/**
 * Clear search cache (call when new posts are created)
 */
export const clearSearchCache = (): void => {
  searchCache.clear();
};
