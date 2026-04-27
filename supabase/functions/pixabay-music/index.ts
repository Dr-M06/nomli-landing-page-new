// Edge Function: Pixabay Music Search Proxy
// Proxies Pixabay music API server-side so the API key is never exposed to the client

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

const PIXABAY_MUSIC_API = 'https://pixabay.com/api/music/'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight()
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const url = new URL(req.url)
    const query = url.searchParams.get('query')

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing parameter: query' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('PIXABAY_API_KEY')
    if (!apiKey) {
      console.error('[Pixabay] PIXABAY_API_KEY not set in Edge Function secrets')
      return new Response(
        JSON.stringify({ success: false, error: 'Pixabay API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const page = url.searchParams.get('page') || '1'
    const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '15', 10) || 15, 20)
    const pixabayUrl = `${PIXABAY_MUSIC_API}?key=${apiKey}&q=${encodeURIComponent(query.trim())}&page=${page}&per_page=${perPage}`

    const response = await fetch(pixabayUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[Pixabay] API error:', response.status, text)
      return new Response(
        JSON.stringify({ success: false, data: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const hits = data?.hits ?? []

    const tracks = hits
      .map((hit: any) => {
        const audioUrl = hit?.preview_url ?? hit?.url ?? hit?.preview_URL ?? hit?.audio_url ?? hit?.audios?.mp3 ?? ''
        if (!audioUrl || typeof audioUrl !== 'string') return null
        const title = hit?.title ?? hit?.tags?.split(',')[0]?.trim() ?? 'Track'
        const artist = hit?.user ?? hit?.artist ?? 'Pixabay'
        return {
          id: `pixabay-${hit?.id ?? Math.random()}`,
          title: String(title).slice(0, 80),
          artist: String(artist).slice(0, 80),
          url: audioUrl,
          duration: hit?.duration,
          license: 'Pixabay License',
        }
      })
      .filter(Boolean)

    return new Response(
      JSON.stringify({ success: true, data: tracks }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Pixabay] Error:', error)
    return new Response(
      JSON.stringify({ success: false, data: [], error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
