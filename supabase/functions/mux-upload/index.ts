// Edge Function: Secure Mux Video Upload
// This function handles video uploads to Mux server-side, keeping credentials secure

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, getClientIP, rateLimitResponse, RateLimits } from '../_shared/rateLimit.ts'

// Mux API base URL
const MUX_API_BASE = 'https://api.mux.com'

// Helper function to create Mux API request
async function createMuxRequest(endpoint: string, method: string, body?: any) {
  const accessTokenId = Deno.env.get('MUX_ACCESS_TOKEN_ID')
  const accessTokenSecret = Deno.env.get('MUX_ACCESS_TOKEN_SECRET')

  if (!accessTokenId || !accessTokenSecret) {
    console.error('❌ [Mux Upload] Mux credentials missing!')
    console.error('❌ [Mux Upload] Access Token ID present:', !!accessTokenId)
    console.error('❌ [Mux Upload] Access Token Secret present:', !!accessTokenSecret)
    console.error('❌ [Mux Upload] Please add MUX_ACCESS_TOKEN_ID and MUX_ACCESS_TOKEN_SECRET to Edge Function secrets')
    throw new Error('Mux credentials not configured in Edge Function. Please add MUX_ACCESS_TOKEN_ID and MUX_ACCESS_TOKEN_SECRET to Edge Function secrets in Supabase Dashboard.')
  }

  // Base64 encode credentials for Basic Auth
  const credentials = btoa(`${accessTokenId}:${accessTokenSecret}`)
  const url = `${MUX_API_BASE}${endpoint}`

  console.log(`[Mux Upload] Making ${method} request to: ${url}`)
  console.log(`[Mux Upload] Credentials configured: ${accessTokenId.substring(0, 8)}...`)

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[Mux Upload] Mux API error: ${response.status} - ${errorText}`)
    
    if (response.status === 401) {
      console.error('❌ [Mux Upload] Authentication failed. Please verify:')
      console.error('❌ [Mux Upload] 1. Mux credentials are set in Edge Function secrets')
      console.error('❌ [Mux Upload] 2. Credentials are valid (not expired)')
      console.error('❌ [Mux Upload] 3. Edge Function was redeployed after adding secrets')
      throw new Error(`Mux authentication failed (401). Please check Edge Function secrets: ${errorText}`)
    }
    
    throw new Error(`Mux API error: ${response.status} - ${errorText}`)
  }

  return await response.json()
}

serve(async (req) => {
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return handleCorsPreflight()
    }
    
    const corsHeaders = getCorsHeaders(req)

    // Health check endpoint (GET) - no auth required
    if (req.method === 'GET') {
      const url = new URL(req.url)
      if (url.pathname.endsWith('/status') || url.searchParams.get('health') === 'check') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            function: 'mux-upload',
            timestamp: new Date().toISOString(),
            muxConfigured: !!(Deno.env.get('MUX_ACCESS_TOKEN_ID') && Deno.env.get('MUX_ACCESS_TOKEN_SECRET')),
            supabaseConfigured: !!(Deno.env.get('SUPABASE_URL') && Deno.env.get('SUPABASE_ANON_KEY')),
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
      // For other GET requests, return 404
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[Mux Upload] Missing Supabase environment variables')
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing Supabase credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') || '' },
        },
      }
    )

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      console.error('[Mux Upload] Authentication failed:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limiting for media uploads
    const ipAddress = getClientIP(req)
    const rateLimitResult = await checkRateLimit(
      supabaseClient,
      user.id,
      ipAddress,
      RateLimits.MEDIA_UPLOAD
    )
    
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult)
    }

    // Parse request body with error handling
    let requestBody: any = {}
    try {
      // Check if request has a body (POST/PUT requests)
      if (req.method === 'POST' || req.method === 'PUT') {
        const bodyText = await req.text()
        if (bodyText && bodyText.trim()) {
          requestBody = JSON.parse(bodyText)
        }
      }
    } catch (parseError: any) {
      console.error('[Mux Upload] Failed to parse request body:', parseError.message)
      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected JSON.', details: parseError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { videoUri, title, description, maxDuration, uploadId: statusCheckUploadId, action } = requestBody

    // Handle status check request (for polling asset creation)
    if (action === 'checkStatus' && statusCheckUploadId) {
      console.log(`[Mux Upload] Checking status for upload: ${statusCheckUploadId}`)
      
      try {
        const uploadStatus = await createMuxRequest(`/video/v1/uploads/${statusCheckUploadId}`, 'GET')
        
        if (uploadStatus.data?.asset_id) {
          const assetId = uploadStatus.data.asset_id
          const assetDetails = await createMuxRequest(`/video/v1/assets/${assetId}`, 'GET')
          
          const playbackId = assetDetails.data?.playback_ids?.[0]?.id || null
          // Mux can attach the asset before playback_ids exist; clients must keep polling until playbackId is set.
          if (!playbackId) {
            console.log('[Mux Upload] Asset exists but playback not ready yet:', assetId)
            return new Response(
              JSON.stringify({
                success: false,
                status: assetDetails.data?.status || 'processing',
                message: 'Playback pending',
              }),
              {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }

          // Return HLS format (.m3u8) for video playback - matches old working format
          const secureUrl = `https://stream.mux.com/${playbackId}.m3u8`
          const thumbnailUrl = assetDetails.data?.thumbnail || `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`
          const duration = assetDetails.data?.duration || 0
          
          console.log('[Mux Upload] Asset ready:', {
            assetId,
            playbackId,
            secureUrl,
            thumbnailUrl,
            duration
          })
          
          return new Response(
            JSON.stringify({
              success: true,
              id: assetId,
              muxId: assetId,
              playbackId,
              secure_url: secureUrl, // HLS format (.m3u8) - matches old working format
              thumbnail: thumbnailUrl,
              duration,
              status: 'ready',
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            status: uploadStatus.data?.status || 'processing',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      } catch (error: any) {
        console.error('[Mux Upload] Error checking status:', error)
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    }

    // Handle new upload request
    if (!videoUri) {
      return new Response(
        JSON.stringify({ error: 'Missing videoUri (file path or URL)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate max duration (default 120 seconds, max 600 seconds)
    const validatedMaxDuration = Math.min(maxDuration || 120, 600)

    console.log(`[Mux Upload] Starting upload for user ${user.id}`)
    console.log(`[Mux Upload] Video URI: ${videoUri}`)
    console.log(`[Mux Upload] Title: ${title || 'Untitled'}`)
    console.log(`[Mux Upload] Max duration: ${validatedMaxDuration}s`)

    // Step 1: Create a direct upload URL from Mux
    const uploadData = {
      cors_origin: '*',
      new_asset_settings: {
        playback_policy: ['public'],
        normalize_audio: true,
        test: false,
        ...(title && { title }),
        ...(description && { description }),
      }
    }

    console.log('[Mux Upload] Creating direct upload URL...')
    const uploadResponse = await createMuxRequest('/video/v1/uploads', 'POST', uploadData)

    if (!uploadResponse.data || !uploadResponse.data.url) {
      throw new Error('Failed to get direct upload URL from Mux')
    }

    const uploadUrl = uploadResponse.data.url
    const uploadId = uploadResponse.data.id

    console.log('[Mux Upload] Direct upload URL created:', uploadId)
    console.log('[Mux Upload] Returning direct upload URL to client for direct upload...')

    // Return the direct upload URL to the client
    // Client will upload directly to Mux (more efficient, avoids base64 encoding)
    // This matches the old working approach but keeps credentials secure
    return new Response(
      JSON.stringify({
        success: true,
        uploadUrl,
        uploadId,
        directUpload: true,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error: any) {
    console.error('[Mux Upload] Error:', error)
    console.error('[Mux Upload] Error stack:', error.stack)
    console.error('[Mux Upload] Error name:', error?.name)
    console.error('[Mux Upload] Error message:', error?.message)
    
    // Ensure we always return a proper response, never throw
    const errorMessage = error?.message || 'Failed to upload video to Mux'
    const errorDetails = error?.toString() || 'Unknown error'
    
    // Determine appropriate status code
    let statusCode = 500
    if (error?.message?.includes('credentials') || error?.message?.includes('Mux')) {
      statusCode = 500 // Server configuration error
    } else if (error?.message?.includes('Unauthorized') || error?.message?.includes('authentication')) {
      statusCode = 401
    }
    
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: errorDetails,
        type: error?.name || 'Error',
        timestamp: new Date().toISOString(),
      }),
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

