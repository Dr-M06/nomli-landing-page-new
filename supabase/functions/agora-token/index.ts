// Edge Function: Secure Agora Token Generation
// This function generates Agora RTC tokens server-side, keeping the App Certificate secure

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

// Import Agora token builder (using esm.sh for npm package compatibility)
// Note: We'll implement token generation manually since agora-token may not work in Deno
// Agora token format: https://docs.agora.io/en/video-calling/develop/integrate-token-generation

interface TokenRequest {
  channelName: string;
  uid: number | string;
  role?: 'publisher' | 'subscriber' | 'broadcaster' | 'audience';
  expireSeconds?: number;
}

// Agora RTC Role mapping
enum RtcRole {
  PUBLISHER = 1,
  SUBSCRIBER = 2,
}

// Convert role string to RtcRole enum
function getRtcRole(role?: string): RtcRole {
  switch (role) {
    case 'publisher':
    case 'broadcaster':
      return RtcRole.PUBLISHER;
    case 'subscriber':
    case 'audience':
      return RtcRole.SUBSCRIBER;
    default:
      return RtcRole.PUBLISHER;
  }
}

// Generate Agora RTC token using Deno's Web Crypto API
// Implementation based on Agora token generation algorithm
// Reference: https://docs.agora.io/en/video-calling/develop/integrate-token-generation
// Token format: version(3) + appId(32) + base64(packed_message + signature)
async function generateAgoraTokenWithCrypto(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  role: RtcRole,
  expireTimestamp: number
): Promise<string> {
  const version = '006'; // Agora token version
  
  // Pack message in binary format:
  // - channelName (variable length, UTF-8 encoded)
  // - uid (4 bytes, little-endian uint32)
  // - role (1 byte, uint8)
  // - expireTimestamp (4 bytes, little-endian uint32)
  const channelNameBytes = new TextEncoder().encode(channelName);
  const uidBytes = new Uint8Array(4);
  const view = new DataView(uidBytes.buffer);
  view.setUint32(0, uid, true); // little-endian
  
  const roleByte = new Uint8Array([role]);
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight()
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    // Get authenticated user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request body
    const body: TokenRequest = await req.json()
    const { channelName, uid, role = 'publisher', expireSeconds = 3600 } = body

    // Validate required fields
    if (!channelName || uid === undefined || uid === null) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: channelName and uid are required' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get Agora credentials from Edge Function secrets
    const appId = Deno.env.get('AGORA_APP_ID')
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')

    if (!appId || !appCertificate) {
      console.error('❌ [Agora Token] Agora credentials missing!')
      console.error('❌ [Agora Token] App ID present:', !!appId)
      console.error('❌ [Agora Token] App Certificate present:', !!appCertificate)
      console.error('❌ [Agora Token] Please add AGORA_APP_ID and AGORA_APP_CERTIFICATE to Edge Function secrets')
      
      return new Response(
        JSON.stringify({ 
          error: 'Agora credentials not configured. Please add AGORA_APP_ID and AGORA_APP_CERTIFICATE to Edge Function secrets in Supabase Dashboard.' 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Convert uid to number if it's a string
    const uidNumber = typeof uid === 'string' ? parseInt(uid, 10) : uid
    if (isNaN(uidNumber)) {
      return new Response(
        JSON.stringify({ error: 'Invalid uid format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Calculate expiration timestamp
    const expireTimestamp = Math.floor(Date.now() / 1000) + expireSeconds

    // Get RTC role
    const rtcRole = getRtcRole(role)

    // Generate token using Deno's Web Crypto API (compatible with Deno Edge Functions)
    // Agora token format: https://docs.agora.io/en/video-calling/develop/integrate-token-generation
    console.log(`[Agora Token] Generating token for user ${uidNumber} in channel ${channelName}`)
    console.log(`[Agora Token] Role: ${role}, Expires in: ${expireSeconds}s`)
    
    try {
      // Implement Agora token generation using Deno's Web Crypto API
      const token = await generateAgoraTokenWithCrypto(
        appId,
        appCertificate,
        channelName,
        uidNumber,
        rtcRole,
        expireTimestamp
      )

      console.log(`✅ [Agora Token] Token generated successfully, length: ${token.length}`)

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            token,
            appId,
            channelName,
            uid: uidNumber,
            role,
            expirationTime: expireTimestamp,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    } catch (tokenError) {
      console.error('❌ [Agora Token] Token generation error:', tokenError)
      
      // Fallback: return error with helpful message
      return new Response(
        JSON.stringify({ 
          error: 'Token generation failed',
          details: tokenError instanceof Error ? tokenError.message : 'Unknown error'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  } catch (error) {
    console.error('❌ [Agora Token] Function error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

