// Edge Function: LiveKit Token Generation
// This function generates LiveKit JWT tokens server-side, keeping the API secret secure

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

interface TokenRequest {
  roomName: string;
  participantName: string;
  role?: 'broadcaster' | 'viewer';
  expireSeconds?: number;
}

// LiveKit JWT token generation
// Reference: https://docs.livekit.io/realtime/server-api/authentication/
async function generateLiveKitToken(
  apiKey: string,
  apiSecret: string,
  roomName: string,
  participantName: string,
  role: 'broadcaster' | 'viewer',
  expireSeconds: number
): Promise<string> {
  // Import jwt library for Deno
  const { create } = await import('https://deno.land/x/djwt@v2.8/mod.ts')
  
  const now = Math.floor(Date.now() / 1000)
  const exp = now + expireSeconds
  
  // JWT payload for LiveKit
  const payload = {
    iss: apiKey, // Issuer (API Key)
    sub: participantName, // Subject (Participant Identity)
    iat: now, // Issued at
    exp: exp, // Expiration
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: role === 'broadcaster',
      canSubscribe: true,
      canPublishData: true,
    },
    audio: {
      room: roomName,
      roomJoin: true,
      canPublish: role === 'broadcaster',
      canSubscribe: true,
    },
  }
  
  // Create JWT token
  const secret = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const token = await create(
    { alg: 'HS256', typ: 'JWT' },
    payload,
    secret
  )
  
  return token
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
    const { roomName, participantName, role = 'viewer', expireSeconds = 3600 } = body

    // Validate required fields
    if (!roomName || !participantName) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: roomName and participantName are required' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get LiveKit credentials from Edge Function secrets
    const apiKey = Deno.env.get('LIVEKIT_API_KEY')
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')

    if (!apiKey || !apiSecret) {
      console.error('❌ [LiveKit Token] LiveKit credentials missing!')
      console.error('❌ [LiveKit Token] API Key present:', !!apiKey)
      console.error('❌ [LiveKit Token] API Secret present:', !!apiSecret)
      console.error('❌ [LiveKit Token] Please add LIVEKIT_API_KEY and LIVEKIT_API_SECRET to Edge Function secrets')
      
      return new Response(
        JSON.stringify({ 
          error: 'LiveKit credentials not configured. Please add LIVEKIT_API_KEY and LIVEKIT_API_SECRET to Edge Function secrets in Supabase Dashboard.' 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Generate LiveKit JWT token
    console.log(`[LiveKit Token] Generating token for participant ${participantName} in room ${roomName}`)
    console.log(`[LiveKit Token] Role: ${role}, Expires in: ${expireSeconds}s`)
    
    try {
      const token = await generateLiveKitToken(
        apiKey,
        apiSecret,
        roomName,
        participantName,
        role,
        expireSeconds
      )

      console.log(`✅ [LiveKit Token] Token generated successfully`)

      return new Response(
        JSON.stringify({
          success: true,
          token,
          roomName,
          participantName,
          role,
          expirationTime: Math.floor(Date.now() / 1000) + expireSeconds,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    } catch (tokenError) {
      console.error('❌ [LiveKit Token] Token generation error:', tokenError)
      
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
    console.error('❌ [LiveKit Token] Function error:', error)
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
