/**
 * Redis Cache Client for React Native
 * 
 * Provides cached API calls to backend Redis cache endpoints.
 * Falls back to direct database queries if cache is unavailable.
 */

import { supabase } from './supabase';
import { SUPABASE_URL } from '../constants/Endpoints';
import { log, warn, error } from './productionLogger';


interface CacheOptions {
  ttl?: number; // Time to live in seconds
  forceRefresh?: boolean; // Skip cache and fetch fresh data
}

/**
 * Get cached profiles
 */
export async function getCachedProfiles(options: CacheOptions = {}): Promise<any[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const params = new URLSearchParams();
    if (options.forceRefresh) {
      params.append('_t', Date.now().toString());
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/app-cache/profiles?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      return await response.json();
    } else {
      // Fallback to direct query
      return await fallbackProfilesQuery();
    }
  } catch (error) {
    warn('⚠️ [REDIS-CACHE] Cache fetch failed, using fallback:', error);
    return await fallbackProfilesQuery();
  }
}

/**
 * Get cached posts
 */
export async function getCachedPosts(options: CacheOptions = {}): Promise<any[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const params = new URLSearchParams();
    if (options.forceRefresh) {
      params.append('_t', Date.now().toString());
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/app-cache/posts?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      return await response.json();
    } else {
      return await fallbackPostsQuery();
    }
  } catch (error) {
    warn('⚠️ [REDIS-CACHE] Cache fetch failed, using fallback:', error);
    return await fallbackPostsQuery();
  }
}

/**
 * Get cached events
 */
export async function getCachedEvents(options: CacheOptions = {}): Promise<any[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const params = new URLSearchParams();
    if (options.forceRefresh) {
      params.append('_t', Date.now().toString());
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/app-cache/events?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      return await response.json();
    } else {
      return await fallbackEventsQuery();
    }
  } catch (error) {
    warn('⚠️ [REDIS-CACHE] Cache fetch failed, using fallback:', error);
    return await fallbackEventsQuery();
  }
}

/**
 * Get cached live streams
 */
export async function getCachedLiveStreams(options: CacheOptions = {}): Promise<any[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const params = new URLSearchParams();
    if (options.forceRefresh) {
      params.append('_t', Date.now().toString());
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/app-cache/live-streams?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      return await response.json();
    } else {
      return await fallbackLiveStreamsQuery();
    }
  } catch (error) {
    warn('⚠️ [REDIS-CACHE] Cache fetch failed, using fallback:', error);
    return await fallbackLiveStreamsQuery();
  }
}

/**
 * Get cached conversations
 */
export async function getCachedConversations(options: CacheOptions = {}): Promise<any[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const params = new URLSearchParams();
    if (options.forceRefresh) {
      params.append('_t', Date.now().toString());
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/app-cache/conversations?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      return await response.json();
    } else {
      return await fallbackConversationsQuery();
    }
  } catch (error) {
    warn('⚠️ [REDIS-CACHE] Cache fetch failed, using fallback:', error);
    return await fallbackConversationsQuery();
  }
}

/**
 * Invalidate cache by pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch(
      `${SUPABASE_URL}/functions/v1/app-cache/invalidate?pattern=${encodeURIComponent(pattern)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    warn('⚠️ [REDIS-CACHE] Cache invalidation failed:', error);
  }
}

// Fallback queries (direct database access)
async function fallbackProfilesQuery(): Promise<any[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, bio, location, interests, age, marital_status, is_verified, online_status')
    .order('created_at', { ascending: false })
    .limit(50);
  
  return data || [];
}

async function fallbackPostsQuery(): Promise<any[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, user_id, content, media_url, created_at, likes_count, comments_count, views_count')
    .order('created_at', { ascending: false })
    .limit(20);
  
  return data || [];
}

async function fallbackEventsQuery(): Promise<any[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, location, start_time, end_time, created_at, organizer_id')
    .order('start_time', { ascending: true })
    .limit(20);
  
  return data || [];
}

async function fallbackLiveStreamsQuery(): Promise<any[]> {
  const { data, error } = await supabase
    .from('live_streams')
    .select('id, title, channel_id, streamer_id, streamer_name, streamer_avatar, viewer_count, is_live, started_at, ended_at, description, thumbnail_url, adult_content, allow_guests, music_mode')
    .eq('is_live', true)
    .is('ended_at', null)
    .order('started_at', { ascending: false });
  
  return data || [];
}

async function fallbackConversationsQuery(): Promise<any[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('chats')
    .select('id, user1_id, user2_id, last_message, last_message_at, updated_at')
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .order('last_message_at', { ascending: false });
  
  return data || [];
}

