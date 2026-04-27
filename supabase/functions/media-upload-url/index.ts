// Edge Function: Generate signed upload URL for media files
// This allows clients to upload directly to Supabase Storage

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, getClientIP, rateLimitResponse, RateLimits } from '../_shared/rateLimit.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight()
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limiting for media uploads
    const ipAddress = getClientIP(req);
    const rateLimitResult = await checkRateLimit(
      supabaseClient,
      user.id,
      ipAddress,
      RateLimits.MEDIA_UPLOAD
    );
    
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // Parse request body
    const { fileType, fileName, generateThumbnail } = await req.json()

    if (!fileType || !fileName) {
      return new Response(
        JSON.stringify({ error: 'Missing fileType or fileName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/x-msvideo']
    if (!allowedTypes.includes(fileType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid file type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate unique file path
    const timestamp = Date.now()
    const randomId = crypto.randomUUID()
    const fileExtension = fileName.split('.').pop() || 'bin'
    const filePath = `media/${user.id}/${timestamp}-${randomId}.${fileExtension}`
    
    // Generate thumbnail path (if needed)
    const thumbnailPath = generateThumbnail 
      ? `thumbnails/${user.id}/${timestamp}-${randomId}.jpg`
      : null

    // Generate signed upload URL (valid for 1 hour)
    const { data: uploadData, error: uploadError } = await supabaseClient
      .storage
      .from('chat-media')
      .createSignedUploadUrl(filePath, {
        upsert: false
      })

    if (uploadError) {
      console.error('Error creating upload URL:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Failed to create upload URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate thumbnail upload URL if needed
    let thumbnailUploadUrl = null
    if (thumbnailPath) {
      const { data: thumbData, error: thumbError } = await supabaseClient
        .storage
        .from('chat-media')
        .createSignedUploadUrl(thumbnailPath, {
          upsert: false
        })

      if (!thumbError && thumbData) {
        thumbnailUploadUrl = thumbData.signedUrl
      }
    }

    // Calculate expiry (24 hours from now)
    const expiryAt = new Date()
    expiryAt.setHours(expiryAt.getHours() + 24)

    // Return upload URLs and metadata
    return new Response(
      JSON.stringify({
        uploadUrl: uploadData.signedUrl,
        filePath,
        thumbnailUploadUrl,
        thumbnailPath,
        fileUrl: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/chat-media/${filePath}`,
        thumbnailUrl: thumbnailPath 
          ? `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/chat-media/${thumbnailPath}`
          : null,
        expiryAt: expiryAt.toISOString(),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in media-upload-url function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

