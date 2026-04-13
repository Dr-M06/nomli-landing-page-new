/**
 * Live Stream Bootstrap API
 * 
 * GET /live/bootstrap?streamId=xxx&role=broadcaster|audience
 * 
 * Implements the single API call pattern for joining live streams.
 * Uses Redis caching (2-5 minutes) to prevent API storms.
 * 
 * Based on: NOMLI MINGLE LIVE STREAMING DOCUMENTATION
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

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
      };
    } else {
      // Redis Cloud (standard Redis protocol)
      // Parse host and port from URL
      const [host, port] = REDIS_URL.split(':');
      const redisPort = port ? parseInt(port) : 6379;
      
      // Use deno-redis library for standard Redis
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
      };
    }
    
    return redisClient;
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error);
    return null;
  }
};

// In-memory cache fallback (if Redis not available)
const memoryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 2 * 60; // 2 minutes in seconds

interface BootstrapResponse {
  token: string;
  appId: string;
  channelName: string;
  uid: number;
  role: 'broadcaster' | 'audience';
  streamId: string;
  streamTitle: string;
  streamerName: string;
  streamerAvatar?: string;
}

// Agora RTC Role mapping
enum RtcRole {
  PUBLISHER = 1,
  SUBSCRIBER = 2,
}

// Convert role string to RtcRole enum
function getRtcRole(role: string): RtcRole {
  switch (role) {
    case 'publisher':
    case 'broadcaster':
      return RtcRole.PUBLISHER;
    case 'subscriber':
    case 'audience':
      return RtcRole.SUBSCRIBER;
    default:
      return RtcRole.SUBSCRIBER;
  }
}

// ============ INLINE AGORA TOKEN GENERATION (PROVEN ALGORITHM) ============
// Uses the proven simple algorithm (same as agora-token function)
// This eliminates the need for external Render token server calls

// Generate Agora RTC token using the proven simple algorithm
// Reference: https://docs.agora.io/en/video-calling/develop/integrate-token-generation
// Token format: version(3) + appId(32) + base64(packed_message + signature)
async function generateAgoraTokenDirectly(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  role: 'publisher' | 'subscriber',
  expireSeconds: number
): Promise<string> {
  const version = '006'; // Agora token version
  const expireTimestamp = Math.floor(Date.now() / 1000) + expireSeconds;
  const rtcRole = getRtcRole(role);
  
  // Pack message in binary format:
  // - channelName (variable length, UTF-8 encoded)
  // - uid (4 bytes, little-endian uint32)
  // - role (1 byte, uint8)
  // - expireTimestamp (4 bytes, little-endian uint32)
  const channelNameBytes = new TextEncoder().encode(channelName);
  const uidBytes = new Uint8Array(4);
  const view = new DataView(uidBytes.buffer);
  view.setUint32(0, uid, true); // little-endian
  
  const roleByte = new Uint8Array([rtcRole]);
  const expireBytes = new Uint8Array(4);
  const expireView = new DataView(expireBytes.buffer);
  expireView.setUint32(0, expireTimestamp, true); // little-endian
  
  // Concatenate all message parts
  const messageLength = channelNameBytes.length + 4 + 1 + 4;
  const message = new Uint8Array(messageLength);
  let offset = 0;
  message.set(channelNameBytes, offset);
  offset += channelNameBytes.length;
  message.set(uidBytes, offset);
  offset += 4;
  message.set(roleByte, offset);
  offset += 1;
  message.set(expireBytes, offset);
  
  // Sign the message with HMAC-SHA256 using app certificate
  const keyData = new TextEncoder().encode(appCertificate);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign the message
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  
  // Concatenate message + signature
  const tokenContent = new Uint8Array(message.length + signature.byteLength);
  tokenContent.set(message, 0);
  tokenContent.set(new Uint8Array(signature), message.length);
  
  // Encode token content to base64
  const tokenContentBase64 = btoa(String.fromCharCode(...tokenContent));
  
  // Final token format: version + appId + base64(message + signature)
  return version + appId + tokenContentBase64;
}
// ============ END INLINE TOKEN GENERATION ============

// Generate token via external token server (fallback)
async function generateTokenViaServer(
  channelName: string,
  uid: number,
  role: 'broadcaster' | 'audience'
): Promise<string> {
  const tokenServerUrl = Deno.env.get('AGORA_TOKEN_SERVER_URL');
  if (!tokenServerUrl) {
    throw new Error('Token server not configured and Agora credentials not available');
  }

  // Clean up URL
  let cleanUrl = tokenServerUrl.trim();
  const commentIndex = cleanUrl.indexOf('#');
  if (commentIndex !== -1) {
    cleanUrl = cleanUrl.substring(0, commentIndex).trim();
  }
  cleanUrl = cleanUrl.replace(/\s+.*$/, '').trim();
  
  // Validate URL format
  try {
    new URL(cleanUrl);
  } catch (urlError) {
    throw new Error(`Invalid token server URL format: ${cleanUrl}`);
  }

  console.log(`📡 [BOOTSTRAP] Calling token server: ${cleanUrl}/getRtcToken`);
  console.log(`📡 [BOOTSTRAP] Token server request:`, { channelName, uid, role, expireSeconds: 3600 });
  
  const tokenResponse = await fetch(`${cleanUrl}/getRtcToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelName,
      uid,
      role,
      expireSeconds: 3600,
    }),
  });

  console.log(`📡 [BOOTSTRAP] Token server response status: ${tokenResponse.status}`);

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error(`❌ [BOOTSTRAP] Token server error: ${tokenResponse.status} - ${errorText}`);
    throw new Error(`Token server returned error: ${tokenResponse.status} - ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  console.log(`📡 [BOOTSTRAP] Token server response:`, {
    hasData: !!tokenData.data,
    hasToken: !!(tokenData.data?.token || tokenData.data?.rtcToken || tokenData.rtcToken || tokenData.token),
    tokenPrefix: (tokenData.data?.token || tokenData.data?.rtcToken || tokenData.rtcToken || tokenData.token)?.substring(0, 20) || 'missing',
  });
  
  const token = tokenData.data?.token || tokenData.data?.rtcToken || tokenData.rtcToken || tokenData.token;
  
  if (!token || token.length === 0) {
    console.error('❌ [BOOTSTRAP] Token server returned empty token');
    throw new Error('Token server returned empty token');
  }
  
  console.log(`✅ [BOOTSTRAP] Token received from server, length: ${token.length}`);
  return token;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // Get authorization header (optional - allow anonymous users for audience role)
    const authHeader = req.headers.get('Authorization');
    
    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Parse query parameters first to check role
    const url = new URL(req.url);
    const streamId = url.searchParams.get('streamId');
    const role = url.searchParams.get('role') as 'broadcaster' | 'audience';
    const bypassCache = url.searchParams.get('bypassCache') === 'true'; // Optional cache bypass

    if (!streamId || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing streamId or role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (role !== 'broadcaster' && role !== 'audience') {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be broadcaster or audience' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Broadcasters MUST be authenticated (security requirement)
    if (role === 'broadcaster' && !authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Broadcasters must be authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let user: any = null;
    let userClient: any = null;

    // Try to authenticate user if auth header is provided
    if (authHeader) {
      userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user: authUser }, error: userError } = await userClient.auth.getUser();
      if (!userError && authUser) {
        user = authUser;
        console.log(`✅ [BOOTSTRAP] Authenticated user: ${user.id}`);
      } else {
        // Auth header provided but invalid - for audience role, allow anonymous fallback
        if (role === 'audience') {
          console.warn('⚠️ [BOOTSTRAP] Invalid auth header for audience role - proceeding as anonymous');
        } else {
          // For broadcaster role, require valid auth
          return new Response(
            JSON.stringify({ error: 'Unauthorized: Invalid authentication token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } else {
      // No auth header - only allowed for audience role
      if (role === 'audience') {
        console.log('👁️ [BOOTSTRAP] Anonymous viewer accessing bootstrap API');
      } else {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Broadcasters must be authenticated' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Query parameters already parsed above

    // Check cache first (Redis or memory) - unless bypassCache is requested
    const cacheKey = `bootstrap:${streamId}:${role}`;
    let cachedData: BootstrapResponse | null = null;
    
    // Get Redis client once (used for both reading and writing cache)
    const redis = await getRedisClient();

    if (!bypassCache) {
      if (redis) {
        // Try Redis cache
        cachedData = await redis.get(cacheKey);
      } else {
        // Fallback to memory cache
        const cached = memoryCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION * 1000) {
          cachedData = cached.data;
        }
      }

      if (cachedData) {
        console.log(`✅ [BOOTSTRAP] Cache hit for ${cacheKey}`);
        // Validate cached App ID is valid (32 hex chars) - if invalid, bypass cache
        const cachedAppId = cachedData.appId || '';
        const appIdRegex = /^[0-9a-f]{32}$/i;
        
        // CRITICAL: Check if cached App ID is the known invalid one
        const INVALID_APP_ID = '__invalid_placeholder__';
        if (cachedAppId === INVALID_APP_ID) {
          console.warn(`⚠️ [BOOTSTRAP] Cached App ID is the known invalid one (${INVALID_APP_ID}), bypassing cache`);
          // Delete invalid cache entry to prevent future issues
          if (redis) {
            try {
              await redis.del(cacheKey);
              console.log(`🗑️ [BOOTSTRAP] Deleted invalid cache entry: ${cacheKey}`);
            } catch (delError) {
              console.warn(`⚠️ [BOOTSTRAP] Failed to delete invalid cache entry:`, delError);
            }
          } else {
            memoryCache.delete(cacheKey);
            console.log(`🗑️ [BOOTSTRAP] Deleted invalid memory cache entry: ${cacheKey}`);
          }
          cachedData = null; // Force fresh fetch
        } else if (cachedAppId && !appIdRegex.test(cachedAppId)) {
          console.warn(`⚠️ [BOOTSTRAP] Cached App ID format is invalid (${cachedAppId}), bypassing cache`);
          // Delete invalid cache entry
          if (redis) {
            try {
              await redis.del(cacheKey);
              console.log(`🗑️ [BOOTSTRAP] Deleted invalid format cache entry: ${cacheKey}`);
            } catch (delError) {
              console.warn(`⚠️ [BOOTSTRAP] Failed to delete invalid cache entry:`, delError);
            }
          } else {
            memoryCache.delete(cacheKey);
            console.log(`🗑️ [BOOTSTRAP] Deleted invalid format memory cache entry: ${cacheKey}`);
          }
          cachedData = null; // Force fresh fetch
        } else {
          console.log(`✅ [BOOTSTRAP] Using cached data with App ID: ${cachedAppId.substring(0, 8)}...`);
          return new Response(
            JSON.stringify(cachedData),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } else {
      console.log(`🔄 [BOOTSTRAP] Cache bypass requested via query parameter`);
    }

    console.log(`📡 [BOOTSTRAP] Cache miss, fetching for stream ${streamId} as ${role}`);

    // Fetch stream data from database
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: stream, error: streamError } = await serviceClient
      .from('live_streams')
      .select('id, title, channel_id, broadcaster_uid, streamer_id, streamer_name, streamer_avatar')
      .eq('id', streamId)
      .eq('is_live', true)
      .single();

    if (streamError || !stream) {
      return new Response(
        JSON.stringify({ error: 'Stream not found or not live' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine UID based on role
    let uid: number;
    if (role === 'broadcaster') {
      // Broadcasters MUST be authenticated (checked above)
      if (!user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Broadcasters must be authenticated' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check if user is the host or a guest
      if (stream.streamer_id === user.id) {
        // User is the host - use broadcaster_uid
        uid = stream.broadcaster_uid || 1000;
        console.log(`✅ [BOOTSTRAP] User is the host, using broadcaster UID: ${uid}`);
      } else {
        // User is a guest - check if they have a guest record
        const { data: guestRecord } = await serviceClient
          .from('live_stream_guests')
          .select('agora_uid')
          .eq('stream_id', streamId)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
        
        if (guestRecord) {
          if (guestRecord.agora_uid) {
            // Guest already has UID assigned - use it
            uid = guestRecord.agora_uid;
            console.log(`✅ [BOOTSTRAP] Guest has existing UID: ${uid}`);
          } else {
            // Guest record exists but no UID - assign next available UID
            // Find the highest assigned UID for this stream
            const { data: existingGuests } = await serviceClient
              .from('live_stream_guests')
              .select('agora_uid')
              .eq('stream_id', streamId)
              .eq('is_active', true)
              .not('agora_uid', 'is', null)
              .order('agora_uid', { ascending: false })
              .limit(1);
            
            const nextUid = existingGuests && existingGuests.length > 0 && existingGuests[0].agora_uid
              ? existingGuests[0].agora_uid + 1
              : 2001; // Start from 2001 for guests
            
            // Update guest record with assigned UID
            const { error: updateError } = await serviceClient
              .from('live_stream_guests')
              .update({ agora_uid: nextUid })
              .eq('stream_id', streamId)
              .eq('user_id', user.id)
              .eq('is_active', true);
            
            if (updateError) {
              console.error('❌ [BOOTSTRAP] Failed to assign UID to guest:', updateError);
              // Continue with assigned UID anyway
            }
            
            uid = nextUid;
            console.log(`✅ [BOOTSTRAP] Assigned new UID to guest: ${uid}`);
          }
        } else {
          // No guest record found - user shouldn't be joining as broadcaster
          // Fallback to random UID (shouldn't happen in normal flow)
          console.warn('⚠️ [BOOTSTRAP] No guest record found for user, using fallback UID');
          uid = Math.floor(Math.random() * 1000000) + 2000;
        }
      }
    } else {
      // Audience role - random UID
      uid = Math.floor(Math.random() * 1000000) + 2000;
      console.log(`✅ [BOOTSTRAP] User is audience, assigning random UID: ${uid}`);
    }

    // ============ TOKEN GENERATION - USE RENDER TOKEN SERVER ============
    // Render token server uses the official agora-token package which is proven to work
    const tokenServerUrl = Deno.env.get('AGORA_TOKEN_SERVER_URL');
    const appId = Deno.env.get('AGORA_APP_ID');
    
    if (!tokenServerUrl) {
      console.error('❌ [BOOTSTRAP] Token server not configured');
      return new Response(
        JSON.stringify({ error: 'Token server not configured. Please set AGORA_TOKEN_SERVER_URL in Edge Function secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('📡 [BOOTSTRAP] Fetching token from Render token server...');
    
    let token: string;
    let finalAppId: string = appId || '';
    
    try {
      token = await generateTokenViaServer(stream.channel_id, uid, role);
      console.log(`✅ [BOOTSTRAP] Token from Render, length: ${token.length}`);
      
      // Extract appId from token or use from response
      if (token && token.startsWith('006') && token.length > 35) {
        const extractedAppId = token.substring(3, 35);
        const appIdRegex = /^[0-9a-f]{32}$/i;
        if (appIdRegex.test(extractedAppId)) {
          finalAppId = extractedAppId;
          console.log(`✅ [BOOTSTRAP] Extracted App ID: ${finalAppId.substring(0, 8)}...`);
        }
      }
    } catch (serverError: any) {
      console.error('❌ [BOOTSTRAP] Render token server failed:', serverError);
      return new Response(
        JSON.stringify({ error: `Token server failed: ${serverError.message || 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!token) {
      console.error('❌ [BOOTSTRAP] No token received');
      return new Response(
        JSON.stringify({ error: 'Token generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!finalAppId) {
      console.error('❌ [BOOTSTRAP] No App ID available');
      return new Response(
        JSON.stringify({ error: 'No App ID available' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Ensure finalAppId is set - extract from token if needed
    if (!finalAppId) {
      if (token.startsWith('006') && token.length > 35) {
        finalAppId = token.substring(3, 35);
        console.log(`✅ [BOOTSTRAP] Extracted App ID from token: ${finalAppId.substring(0, 8)}...`);
      }
    }

    // Validate App ID
    const appIdRegex = /^[0-9a-f]{32}$/i;
    if (!finalAppId || !appIdRegex.test(finalAppId)) {
      console.error('❌ [BOOTSTRAP] Invalid or missing App ID:', finalAppId);
      return new Response(
        JSON.stringify({ error: 'Invalid App ID. Please check AGORA_APP_ID configuration.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bootstrapData: BootstrapResponse = {
      token,
      appId: finalAppId,
      channelName: stream.channel_id,
      uid,
      role,
      streamId: stream.id,
      streamTitle: stream.title,
      streamerName: stream.streamer_name,
      streamerAvatar: stream.streamer_avatar,
    };

    // CRITICAL: Never cache invalid App IDs
    const INVALID_APP_ID = '__invalid_placeholder__';
    const shouldCache = finalAppId !== INVALID_APP_ID && appIdRegex.test(finalAppId);
    
    if (shouldCache) {
      // Cache the result (2-5 minutes)
      const cacheSeconds = 2 * 60; // 2 minutes (can be increased to 5 minutes)
      if (redis) {
        await redis.setex(cacheKey, cacheSeconds, JSON.stringify(bootstrapData));
        console.log(`✅ [BOOTSTRAP] Bootstrap data fetched and cached for ${cacheKey}`);
      } else {
        memoryCache.set(cacheKey, {
          data: bootstrapData,
          timestamp: Date.now(),
        });
        // Clean up old entries (keep cache size manageable)
        if (memoryCache.size > 100) {
          const oldestKey = memoryCache.keys().next().value;
          memoryCache.delete(oldestKey);
        }
        console.log(`✅ [BOOTSTRAP] Bootstrap data fetched and cached (memory) for ${cacheKey}`);
      }
    } else {
      console.warn(`⚠️ [BOOTSTRAP] NOT caching bootstrap data - App ID is invalid: ${finalAppId}`);
      console.warn(`⚠️ [BOOTSTRAP] This will force fresh token generation on every request`);
    }
    
    return new Response(
      JSON.stringify(bootstrapData),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ [BOOTSTRAP] Error:', error);
    console.error('❌ [BOOTSTRAP] Error message:', error?.message);
    console.error('❌ [BOOTSTRAP] Error stack:', error?.stack);
    console.error('❌ [BOOTSTRAP] Error name:', error?.name);
    return new Response(
      JSON.stringify({ 
        error: `Internal server error: ${error?.message || 'Unknown error'}`,
        details: error?.stack || 'No stack trace available'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});


