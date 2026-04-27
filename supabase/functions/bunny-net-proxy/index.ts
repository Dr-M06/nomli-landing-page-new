// Edge Function: Secure Bunny.net Storage Proxy
// Keeps Bunny.net Storage Password (AccessKey) server-side only
// Prevents password exposure in client-side code

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, getClientIP, rateLimitResponse, RateLimits } from '../_shared/rateLimit.ts'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight()
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    // Get Bunny.net credentials from environment (server-side only)
    const storageZone = Deno.env.get('BUNNY_NET_STORAGE_ZONE')
    const storagePassword = Deno.env.get('BUNNY_NET_STORAGE_PASSWORD')
    const cdnHostname = Deno.env.get('BUNNY_NET_CDN_HOSTNAME')
    // Storage endpoint (default: Frankfurt, can be overridden with BUNNY_NET_STORAGE_ENDPOINT)
    // Examples: storage.bunnycdn.com (Frankfurt), jh.storage.bunnycdn.com (Johannesburg)
    const storageEndpoint = Deno.env.get('BUNNY_NET_STORAGE_ENDPOINT') || 'storage.bunnycdn.com'

    if (!storageZone || !storagePassword) {
      console.error('[BunnyNetProxy] Missing Bunny.net credentials', {
        hasStorageZone: !!storageZone,
        hasStoragePassword: !!storagePassword,
        hasCdnHostname: !!cdnHostname
      })
      return new Response(
        JSON.stringify({ 
          error: 'Service configuration error',
          details: 'Bunny.net credentials not configured in Edge Function secrets',
          missing: {
            storageZone: !storageZone,
            storagePassword: !storagePassword
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user is authenticated
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
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limiting for uploads
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

    // Parse request
    const { action, ...params } = await req.json()

    // Route based on action
    switch (action) {
      case 'upload':
        return handleUpload(storageZone, storagePassword, cdnHostname, storageEndpoint, params, corsHeaders)
      
      case 'delete':
        return handleDelete(storageZone, storagePassword, storageEndpoint, params, corsHeaders)
      
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error: any) {
    console.error('[BunnyNetProxy] Error:', error)
    console.error('[BunnyNetProxy] Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    })
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error?.message || 'Unknown error',
        type: error?.name || 'Error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleUpload(
  storageZone: string,
  storagePassword: string,
  cdnHostname: string | undefined,
  storageEndpoint: string,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { imageData, fileName, folder } = params

  if (!imageData || !fileName) {
    return new Response(
      JSON.stringify({ error: 'Missing imageData or fileName' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Extract base64 data
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData
    
    // Convert base64 to Uint8Array
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const fileContent = new Uint8Array(byteNumbers)

    // Determine content type from file extension
    const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg'
    const contentType = 
      extension === 'png' ? 'image/png' :
      extension === 'gif' ? 'image/gif' :
      extension === 'webp' ? 'image/webp' :
      'image/jpeg'

    // Construct storage path
    const storagePath = folder ? `${folder}/${fileName}` : fileName
    const storageUrl = `https://${storageEndpoint}/${storageZone}/${storagePath}`

    console.log('[BunnyNetProxy] Uploading to:', storageUrl)
    console.log('[BunnyNetProxy] Storage zone:', storageZone)
    console.log('[BunnyNetProxy] Password length:', storagePassword?.length || 0)
    console.log('[BunnyNetProxy] Password exists:', !!storagePassword)
    
    // Trim password and verify it's not empty
    const trimmedPassword = storagePassword?.trim() || ''
    if (!trimmedPassword) {
      console.error('[BunnyNetProxy] ERROR: Password is empty after trim!')
      return new Response(
        JSON.stringify({ 
          error: 'Configuration error',
          details: 'BUNNY_NET_STORAGE_PASSWORD is empty or not set correctly'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('[BunnyNetProxy] Using trimmed password (length:', trimmedPassword.length, ')')
    console.log('[BunnyNetProxy] File size:', fileContent.length, 'bytes')
    console.log('[BunnyNetProxy] Content-Type:', contentType)

    // Upload to Bunny.net Storage
    const uploadResponse = await fetch(storageUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': trimmedPassword,
        'Content-Type': contentType,
      },
      body: fileContent,
    })

    console.log('[BunnyNetProxy] Response status:', uploadResponse.status)
    console.log('[BunnyNetProxy] Response headers:', Object.fromEntries(uploadResponse.headers.entries()))

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'Unknown error')
      console.error('[BunnyNetProxy] Upload failed:', uploadResponse.status, errorText)
      console.error('[BunnyNetProxy] Full error response:', {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorText,
        url: storageUrl,
        passwordLength: trimmedPassword.length
      })
      return new Response(
        JSON.stringify({ 
          error: 'Upload failed', 
          status: uploadResponse.status,
          details: errorText 
        }),
        { status: uploadResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate CDN URL
    const finalCdnHostname = cdnHostname || `${storageZone}.b-cdn.net`
    const cdnUrl = `https://${finalCdnHostname}/${storagePath}`

    console.log('[BunnyNetProxy] ✅ Upload successful! CDN URL:', cdnUrl)

    return new Response(
      JSON.stringify({ 
        success: true, 
        cdnUrl,
        storagePath 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('[BunnyNetProxy] Upload error:', error)
    return new Response(
      JSON.stringify({ error: 'Upload failed', details: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleDelete(
  storageZone: string,
  storagePassword: string,
  storageEndpoint: string,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { imageUrl } = params

  if (!imageUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing imageUrl' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Extract storage path from CDN URL
    const url = new URL(imageUrl)
    const storagePath = url.pathname.substring(1) // Remove leading slash
    
    const storageUrl = `https://${storageEndpoint}/${storageZone}/${storagePath}`

    // Trim password for delete as well
    const trimmedPassword = storagePassword?.trim() || ''
    
    const deleteResponse = await fetch(storageUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': trimmedPassword,
      },
    })

    if (deleteResponse.ok) {
      console.log('[BunnyNetProxy] ✅ Deleted:', storagePath)
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      console.error('[BunnyNetProxy] ❌ Delete failed:', deleteResponse.status)
      return new Response(
        JSON.stringify({ error: 'Delete failed', status: deleteResponse.status }),
        { status: deleteResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error: any) {
    console.error('[BunnyNetProxy] Delete error:', error)
    return new Response(
      JSON.stringify({ error: 'Delete failed', details: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
