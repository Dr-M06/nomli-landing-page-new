// Edge Function: Geoapify Autocomplete Proxy
// This function proxies Geoapify API calls server-side, keeping the API key secure

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

// Geoapify API base URL
const GEOAPIFY_API_BASE = 'https://api.geoapify.com/v1'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight()
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    // Get authenticated user (optional - can be made public for location services)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') || '' },
        },
      }
    )

    // Optional: Require authentication (uncomment if needed)
    // const {
    //   data: { user },
    // } = await supabaseClient.auth.getUser()
    // if (!user) {
    //   return new Response(
    //     JSON.stringify({ error: 'Unauthorized' }),
    //     {
    //       status: 401,
    //       headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    //     }
    //   )
    // }

    // Parse request
    const url = new URL(req.url)
    const query = url.searchParams.get('query')

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: query' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get Geoapify API key from Edge Function secrets
    const apiKey = Deno.env.get('GEOAPIFY_API_KEY')

    if (!apiKey) {
      console.error('❌ [Geoapify] API key missing!')
      console.error('❌ [Geoapify] Please add GEOAPIFY_API_KEY to Edge Function secrets')
      
      return new Response(
        JSON.stringify({ 
          error: 'Geoapify API key not configured. Please add GEOAPIFY_API_KEY to Edge Function secrets in Supabase Dashboard.' 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Build Geoapify API URL
    const limit = url.searchParams.get('limit') || '5'
    const geoapifyUrl = `${GEOAPIFY_API_BASE}/geocode/autocomplete?text=${encodeURIComponent(query)}&limit=${limit}&apiKey=${apiKey}`

    console.log(`[Geoapify] Fetching suggestions for query: ${query}`)

    // Call Geoapify API
    const response = await fetch(geoapifyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Geoapify] API error: ${response.status} - ${errorText}`)
      
      return new Response(
        JSON.stringify({ 
          error: 'Geoapify API request failed',
          status: response.status,
          details: errorText
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const data = await response.json()

    // Extract and format suggestions
    const suggestions = data.features
      ? data.features.map((feature: any) => ({
          formatted: feature.properties.formatted,
          address: feature.properties.address_line1,
          city: feature.properties.city,
          country: feature.properties.country,
          lat: feature.geometry.coordinates[1],
          lon: feature.geometry.coordinates[0],
        }))
      : []

    console.log(`✅ [Geoapify] Found ${suggestions.length} suggestions`)

    return new Response(
      JSON.stringify({
        success: true,
        data: suggestions,
        query,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('❌ [Geoapify] Function error:', error)
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

