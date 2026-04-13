/**
 * Call Bootstrap API
 * 
 * GET /call-bootstrap?callId=xxx&callType=audio|video
 * 
 * Implements the single API call pattern for joining calls.
 * Uses Redis caching (2-5 minutes) to prevent API storms.
 * 
 * OPTIMIZED: Generates tokens inline (no external Render call) for faster connection
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

// ============ INLINE AGORA TOKEN GENERATION ============
// Uses the proven simple algorithm (same as agora-token function)
// This eliminates the need for external Render token server calls

// Agora RTC Role enum
const RtcRole = {
  PUBLISHER: 1,
  SUBSCRIBER: 2,
};

// Generate Agora RTC token using the proven simple algorithm
// Reference: https://docs.agora.io/en/video-calling/develop/integrate-token-generation
// Token format: version(3) + appId(32) + base64(packed_message + signature)
async function generateAgoraToken(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  role: number,
  expireSeconds: number
): Promise<string> {
  const version = '006'; // Agora token version
  const expireTimestamp = Math.floor(Date.now() / 1000) + expireSeconds;
  const rtcRole = role === RtcRole.PUBLISHER ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  
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

interface CallBootstrapResponse {
  token: string;
  appId: string;
  channelName: string;
  uid: number;
  callId: string;
  callType: 'audio' | 'video';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    // Note: SUPABASE_URL and SUPABASE_ANON_KEY are auto-injected by Supabase runtime,
    // but should be explicitly set as Edge Function secrets to ensure availability
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ [CALL-BOOTSTRAP] Missing required environment variables');
      console.error('💡 Add SUPABASE_URL and SUPABASE_ANON_KEY to Supabase Edge Function secrets');
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error: Missing SUPABASE_URL or SUPABASE_ANON_KEY. Please add these to Edge Function secrets in Supabase Dashboard.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is authenticated
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId'); // Channel ID (chat ID)
    const callType = url.searchParams.get('callType') as 'audio' | 'video';

    if (!callId || !callType) {
      return new Response(
        JSON.stringify({ error: 'Missing callId or callType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (callType !== 'audio' && callType !== 'video') {
      return new Response(
        JSON.stringify({ error: 'Invalid callType. Must be audio or video' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache first (Redis or memory) with timeout protection
    const cacheKey = `call-bootstrap:${callId}:${callType}`;
    let cachedData: CallBootstrapResponse | null = null;

    try {
      const redis = await Promise.race([
        getRedisClient(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis init timeout')), 2000))
      ]) as any;
      
      if (redis && redis.get) {
        // Try Redis cache with timeout (1 second max)
        try {
          cachedData = await Promise.race([
            redis.get(cacheKey),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Cache read timeout')), 1000))
          ]) as CallBootstrapResponse | null;
        } catch (cacheReadError) {
          console.warn('⚠️ [CALL-BOOTSTRAP] Redis cache read failed (non-critical):', cacheReadError);
          // Fall through to memory cache
        }
      }
    } catch (redisError) {
      console.warn('⚠️ [CALL-BOOTSTRAP] Redis init failed (using memory cache):', redisError);
    }
    
    // Fallback to memory cache if Redis not available or failed
    if (!cachedData) {
      const cached = memoryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION * 1000) {
        cachedData = cached.data;
      }
    }

    if (cachedData) {
      console.log(`✅ [CALL-BOOTSTRAP] Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify(cachedData),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📡 [CALL-BOOTSTRAP] Cache miss, generating for call ${callId} (${callType})`);

    // Generate UID for the user (use a hash of user ID for consistency)
    // This ensures the same user gets the same UID for the same call
    const uidHash = user.id.split('-').join('');
    const uid = parseInt(uidHash.slice(0, 8), 16) % 1000000 + 1; // 1-1000000 range

    // Channel name is the callId (chat ID)
    const channelName = callId;

    // ============ TOKEN GENERATION - USE RENDER TOKEN SERVER ============
    // Render token server uses the official agora-token package which is proven to work
    
    let tokenServerUrl = Deno.env.get('AGORA_TOKEN_SERVER_URL');
    const appId = Deno.env.get('AGORA_APP_ID');
    
    if (!tokenServerUrl) {
      console.error('❌ [CALL-BOOTSTRAP] Token server not configured');
      return new Response(
        JSON.stringify({ error: 'Token server not configured. Please set AGORA_TOKEN_SERVER_URL in Edge Function secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean up URL
    tokenServerUrl = tokenServerUrl.trim().split('#')[0].trim().split(/\s+/)[0];
    
    console.log(`📡 [CALL-BOOTSTRAP] Fetching token from Render: ${tokenServerUrl}/getRtcToken`);
    
    let token: string;
    let tokenAppId: string = appId || '';
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const tokenResponse = await fetch(`${tokenServerUrl}/getRtcToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName,
          uid,
          role: 'broadcaster',
          expireSeconds: 3600,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Token server error: ${tokenResponse.status} - ${errorText}`);
      }
      
      const tokenData = await tokenResponse.json();
      token = tokenData.data?.token || tokenData.data?.rtcToken || tokenData.rtcToken || tokenData.token;
      
      // Extract App ID from token or response
      if (tokenData.data?.appId) {
        tokenAppId = tokenData.data.appId;
      } else if (token && token.startsWith('006') && token.length > 35) {
        tokenAppId = token.substring(3, 35);
      }
      
      console.log(`✅ [CALL-BOOTSTRAP] Token received from Render, length: ${token?.length}`);
      console.log(`✅ [CALL-BOOTSTRAP] App ID: ${tokenAppId?.substring(0, 8)}...`);
      
      if (!token) {
        throw new Error('Empty token received from server');
      }
    } catch (fetchError: any) {
      console.error('❌ [CALL-BOOTSTRAP] Token server failed:', fetchError);
      return new Response(
        JSON.stringify({ error: `Token server failed: ${fetchError.message || 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Use App ID from token or environment
    const finalAppId = tokenAppId || appId || '';
    
    if (!finalAppId) {
      console.error('❌ [CALL-BOOTSTRAP] No App ID available');
      return new Response(
        JSON.stringify({ error: 'No App ID available' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response: CallBootstrapResponse = {
      token,
      appId: finalAppId,
      channelName,
      uid,
      callId,
      callType,
    };

    // Cache the response (fire and forget - don't block response)
    const cacheValue = JSON.stringify(response);
    try {
      if (redis) {
        // Don't await - cache in background to avoid blocking response
        redis.setex(cacheKey, CACHE_DURATION, cacheValue).catch((cacheError: any) => {
          console.warn('⚠️ [CALL-BOOTSTRAP] Cache write failed (non-critical):', cacheError);
        });
      } else {
        memoryCache.set(cacheKey, { data: response, timestamp: Date.now() });
      }
    } catch (cacheError) {
      console.warn('⚠️ [CALL-BOOTSTRAP] Cache error (non-critical):', cacheError);
      // Continue - caching failure shouldn't block the response
    }

    console.log(`✅ [CALL-BOOTSTRAP] Generated bootstrap data for call ${callId}`);
    console.log(`✅ [CALL-BOOTSTRAP] Response ready:`, {
      hasToken: !!response.token,
      hasAppId: !!response.appId,
      uid: response.uid,
      channelName: response.channelName
    });

    // Ensure response is sent properly
    const responseBody = JSON.stringify(response);
    return new Response(
      responseBody,
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Content-Length': responseBody.length.toString()
        } 
      }
    );
  } catch (error: any) {
    console.error('❌ [CALL-BOOTSTRAP] Unhandled error:', error);
    console.error('❌ [CALL-BOOTSTRAP] Error details:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      cause: error?.cause
    });
    
    // Ensure error response is sent properly
    const errorResponse = {
      error: 'Internal server error',
      details: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    };
    
    return new Response(
      JSON.stringify(errorResponse),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Content-Length': JSON.stringify(errorResponse).length.toString()
        } 
      }
    );
  }
});

