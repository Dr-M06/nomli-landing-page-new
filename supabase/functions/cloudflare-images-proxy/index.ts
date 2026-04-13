// Edge Function: Secure Cloudflare Images Proxy
// Keeps Cloudflare API token server-side only
// Prevents token exposure in client-side code

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://nomli.cc',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE',
}

const ALLOWED_ORIGINS = [
  'https://nomli.cc',
  'https://www.nomli.cc',
  'exp://localhost:8081', // Development only
]

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('Origin') || ''
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'null'
    return new Response('ok', { 
      headers: { 
        ...corsHeaders,
        'Access-Control-Allow-Origin': allowedOrigin,
      } 
    })
  }

  try {
    // Get Cloudflare credentials from environment (server-side only)
    const cloudflareAccountHash = Deno.env.get('CLOUDFLARE_ACCOUNT_HASH')
    const cloudflareApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN')

    if (!cloudflareAccountHash || !cloudflareApiToken) {
      console.error('[CloudflareProxy] Missing Cloudflare credentials')
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
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

    // Parse request
    const { action, ...params } = await req.json()

    // Validate origin
    const origin = req.headers.get('Origin') || ''
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'null'

    // Route based on action
    switch (action) {
      case 'upload':
        return handleUpload(cloudflareAccountHash, cloudflareApiToken, params, allowedOrigin)
      
      case 'delete':
        return handleDelete(cloudflareAccountHash, cloudflareApiToken, params, allowedOrigin)
      
      case 'get':
        return handleGet(cloudflareAccountHash, cloudflareApiToken, params, allowedOrigin)
      
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('[CloudflareProxy] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleUpload(
  accountHash: string,
  apiToken: string,
  params: any,
  allowedOrigin: string
): Promise<Response> {
  const { imageData, filename, metadata } = params

  if (!imageData) {
    return new Response(
      JSON.stringify({ error: 'Missing imageData' }),
      { status: 400, headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json' } }
    )
  }

  // Convert base64 to blob
  const base64Data = imageData.split(',')[1] || imageData
  const byteCharacters = atob(base64Data)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  
  const extension = filename?.split('.').pop()?.toLowerCase() || 'jpg'
  const contentType = extension === 'png' ? 'image/png' : 
                     extension === 'gif' ? 'image/gif' : 
                     extension === 'webp' ? 'image/webp' : 'image/jpeg'
  
  const blob = new Blob([byteArray], { type: contentType })
  const formData = new FormData()
  formData.append('file', blob as any)
  
  if (metadata) {
    formData.append('metadata', JSON.stringify(metadata))
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v1`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
      body: formData,
    }
  )

  const data = await response.json()

  return new Response(
    JSON.stringify(data),
    { 
      status: response.status, 
      headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json' } 
    }
  )
}

async function handleDelete(
  accountHash: string,
  apiToken: string,
  params: any,
  allowedOrigin: string
): Promise<Response> {
  const { imageId } = params

  if (!imageId) {
    return new Response(
      JSON.stringify({ error: 'Missing imageId' }),
      { status: 400, headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json' } }
    )
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v1/${imageId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    }
  )

  const data = await response.json()

  return new Response(
    JSON.stringify(data),
    { 
      status: response.status, 
      headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json' } 
    }
  )
}

async function handleGet(
  accountHash: string,
  apiToken: string,
  params: any,
  allowedOrigin: string
): Promise<Response> {
  const { imageId, variant } = params

  if (!imageId) {
    return new Response(
      JSON.stringify({ error: 'Missing imageId' }),
      { status: 400, headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json' } }
    )
  }

  const url = variant
    ? `https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v1/${imageId}/variants/${variant}`
    : `https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v1/${imageId}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
    },
  })

  const data = await response.json()

  return new Response(
    JSON.stringify(data),
    { 
      status: response.status, 
      headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json' } 
    }
  )
}
