/**
 * App-Wide Redis Cache API
 * 
 * Provides cached endpoints for frequently accessed data:
 * - Profiles
 * - Posts/Feed
 * - Events
 * - Live Streams List
 * - User Lists
 * - Chat Conversations
 * 
 * Uses Redis for fast response times and reduced database load.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Redis client (supports both Redis Cloud and Upstash Redis)
let redisClient: any = null;

const getRedisClient = async () => {
  if (redisClient) return redisClient;
  
  try {
    const REDIS_URL = Deno.env.get('REDIS_URL');
    const REDIS_TOKEN = Deno.env.get('REDIS_TOKEN');
    
    if (!REDIS_URL || !REDIS_TOKEN) {
      console.warn('⚠️ Redis not configured, using in-memory cache fallback');
      return null;
    }
    
    // Check if it's Upstash Redis (REST API) or Redis Cloud (standard Redis)
    const isUpstash = REDIS_URL.startsWith('https://');
    
    if (isUpstash) {
      // Upstash Redis REST API
      redisClient = {
        url: REDIS_URL,
        token: REDIS_TOKEN,
        get: async (key: string) => {
          const response = await fetch(`${REDIS_URL}/get/${key}`, {
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
          });
          const data = await response.json();
          return data.result ? JSON.parse(data.result) : null;
        },
        setex: async (key: string, seconds: number, value: string) => {
          await fetch(`${REDIS_URL}/setex/${key}/${seconds}`, {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${REDIS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: value,
          });
        },
        del: async (key: string) => {
          await fetch(`${REDIS_URL}/del/${key}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
          });
        },
      };
    } else {
      // Redis Cloud (standard Redis protocol)
      const [host, port] = REDIS_URL.split(':');
      const redisPort = port ? parseInt(port) : 6379;
      
      const { connect } = await import('https://deno.land/x/redis@v0.29.4/mod.ts');
      
      const redis = await connect({
        hostname: host,
        port: redisPort,
        password: REDIS_TOKEN,
      });
      
      redisClient = {
        redis,
        get: async (key: string) => {
          const value = await redis.get(key);
          return value ? JSON.parse(value as string) : null;
        },
        setex: async (key: string, seconds: number, value: string) => {
          await redis.setex(key, seconds, value);
        },
        del: async (key: string) => {
          await redis.del(key);
        },
      };
    }
    
    return redisClient;
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error);
    return null;
  }
};

// In-memory cache fallback
const memoryCache = new Map<string, { data: any; timestamp: number }>();

// Cache durations (in seconds)
const CACHE_DURATIONS = {
  profiles: 5 * 60,        // 5 minutes
  posts: 2 * 60,          // 2 minutes
  events: 10 * 60,        // 10 minutes
  liveStreams: 30,        // 30 seconds
  userLists: 5 * 60,      // 5 minutes
  conversations: 1 * 60,  // 1 minute
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Route to appropriate handler
    switch (path) {
      case 'profiles':
        return await handleProfiles(serviceClient, user.id, url, redisClient);
      case 'posts':
        return await handlePosts(serviceClient, user.id, url, redisClient);
      case 'events':
        return await handleEvents(serviceClient, user.id, url, redisClient);
      case 'live-streams':
        return await handleLiveStreams(serviceClient, user.id, url, redisClient);
      case 'conversations':
        return await handleConversations(serviceClient, user.id, url, redisClient);
      case 'invalidate':
        return await handleInvalidate(url, redisClient);
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid endpoint' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('❌ [APP-CACHE] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Handler: Profiles
async function handleProfiles(client: any, userId: string, url: URL, redis: any) {
  const cacheKey = `profiles:${userId}:${url.search}`;
  const cached = await getCached(cacheKey, redis);
  
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const limit = parseInt(url.searchParams.get('limit') || '50');
  const { data, error } = await client
    .from('profiles')
    .select('id, username, full_name, avatar_url, bio, location, interests, age, marital_status, is_verified, online_status')
    .neq('id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  await setCached(cacheKey, data, CACHE_DURATIONS.profiles, redis);
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Handler: Posts
async function handlePosts(client: any, userId: string, url: URL, redis: any) {
  const cacheKey = `posts:${userId}:${url.search}`;
  const cached = await getCached(cacheKey, redis);
  
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const limit = parseInt(url.searchParams.get('limit') || '20');
  const { data, error } = await client
    .from('posts')
    .select('id, user_id, content, media_url, created_at, likes_count, comments_count, views_count')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  await setCached(cacheKey, data, CACHE_DURATIONS.posts, redis);
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Handler: Events
async function handleEvents(client: any, userId: string, url: URL, redis: any) {
  const cacheKey = `events:${userId}:${url.search}`;
  const cached = await getCached(cacheKey, redis);
  
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const limit = parseInt(url.searchParams.get('limit') || '20');
  const { data, error } = await client
    .from('events')
    .select('id, title, description, location, start_time, end_time, created_at, organizer_id')
    .order('start_time', { ascending: true })
    .limit(limit);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  await setCached(cacheKey, data, CACHE_DURATIONS.events, redis);
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Handler: Live Streams
async function handleLiveStreams(client: any, userId: string, url: URL, redis: any) {
  const cacheKey = `live_streams:${url.search}`;
  const cached = await getCached(cacheKey, redis);
  
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await client
    .from('live_streams')
    .select('id, title, channel_id, streamer_id, streamer_name, streamer_avatar, viewer_count, is_live, started_at, ended_at, description, thumbnail_url, adult_content, allow_guests, music_mode')
    .eq('is_live', true)
    .is('ended_at', null)
    .order('started_at', { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  await setCached(cacheKey, data, CACHE_DURATIONS.liveStreams, redis);
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Handler: Conversations
async function handleConversations(client: any, userId: string, url: URL, redis: any) {
  const cacheKey = `conversations:${userId}`;
  const cached = await getCached(cacheKey, redis);
  
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch conversations where user is participant
  const { data, error } = await client
    .from('chats')
    .select('id, user1_id, user2_id, last_message, last_message_at, updated_at')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  await setCached(cacheKey, data, CACHE_DURATIONS.conversations, redis);
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Handler: Invalidate cache
async function handleInvalidate(url: URL, redis: any) {
  const pattern = url.searchParams.get('pattern');
  if (!pattern) {
    return new Response(
      JSON.stringify({ error: 'Pattern required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Clear memory cache
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
    }
  }

  // Clear Redis cache (if configured)
  if (redis) {
    // Note: Upstash Redis REST API doesn't support pattern deletion directly
    // You'd need to maintain a list of keys or use a different Redis client
    console.log(`⚠️ [CACHE] Pattern invalidation requested for: ${pattern}`);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Cache helpers
async function getCached(key: string, redis: any): Promise<any | null> {
  if (redis) {
    return await redis.get(key);
  } else {
    const cached = memoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.data;
    }
  }
  return null;
}

async function setCached(key: string, data: any, ttl: number, redis: any): Promise<void> {
  if (redis) {
    await redis.setex(key, ttl, JSON.stringify(data));
  } else {
    memoryCache.set(key, { data, timestamp: Date.now() });
    // Cleanup old entries
    if (memoryCache.size > 1000) {
      const oldestKey = memoryCache.keys().next().value;
      memoryCache.delete(oldestKey);
    }
  }
}

