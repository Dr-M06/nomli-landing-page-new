/**
 * Send push notifications when a user goes live.
 * Called by the app after creating a live_streams row. Uses service role so we can
 * read all profiles' expo_push_token (bypasses RLS). Respects livestream_notifications_enabled.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 100

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Require auth so only the streamer (or authenticated client) can trigger
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const streamId = body.stream_id
    const streamerId = body.streamer_id
    const streamerName = (body.streamer_name || 'Someone').trim()
    const streamTitle = body.stream_title ? String(body.stream_title).trim() : ''
    const adultContent = !!body.adult_content

    if (!streamId || !streamerId) {
      return new Response(JSON.stringify({ error: 'stream_id and streamer_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch all profiles with push tokens (exclude streamer); use service role so RLS doesn't block
    let profiles: { id: string; expo_push_token: string | null; livestream_notifications_enabled?: boolean | null }[] = []
    let profilesError: any = null

    const { data: withPref, error: errWithPref } = await supabase
      .from('profiles')
      .select('id, expo_push_token, livestream_notifications_enabled')
      .neq('id', streamerId)
      .not('expo_push_token', 'is', null)

    if (errWithPref && (errWithPref.message?.includes('livestream_notifications_enabled') || errWithPref.code === 'PGRST204')) {
      // Column may not exist; retry without it
      const { data: withoutPref, error: errWithout } = await supabase
        .from('profiles')
        .select('id, expo_push_token')
        .neq('id', streamerId)
        .not('expo_push_token', 'is', null)
      profiles = withoutPref || []
      profilesError = errWithout
    } else {
      profiles = withPref || []
      profilesError = errWithPref
    }

    if (profilesError) {
      console.error('❌ [send-livestream-notifications] Failed to fetch profiles:', profilesError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch recipients', details: profilesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (profiles.length === 0) {
      console.log('ℹ️ [send-livestream-notifications] No users with push tokens found')
      return new Response(JSON.stringify({ sent: 0, total: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Filter by livestream_notifications_enabled when present (default true = opt-in)
    const withPreference = profiles.filter((p) => {
      const enabled = (p as any).livestream_notifications_enabled
      return enabled === true || enabled === null || enabled === undefined
    })

    const tokens = withPreference
      .map((p) => p.expo_push_token)
      .filter((t): t is string => !!t && typeof t === 'string' && t.trim().length > 0)

    if (tokens.length === 0) {
      console.log('ℹ️ [send-livestream-notifications] No valid push tokens after filtering')
      return new Response(JSON.stringify({ sent: 0, total: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const notificationTitle = `🔴 ${streamerName} is LIVE!`
    const notificationBody = streamTitle
      ? `"${streamTitle}" • Tap to join now!`
      : `Tap to watch their livestream!`

    const messages = tokens.map((token: string) => ({
      to: token,
      sound: 'default',
      title: notificationTitle,
      body: notificationBody,
      data: {
        type: 'livestream',
        stream_id: streamId,
        streamer_id: streamerId,
        adult: adultContent ? 1 : 0,
      },
      badge: 1,
      priority: 'high',
      android: { channelId: 'default', priority: 'high' },
    }))

    let totalSuccess = 0
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      })
      const result = await response.json()
      if (response.ok && result.data && Array.isArray(result.data)) {
        const batchSuccess = result.data.filter((r: any) => r.status === 'ok').length
        totalSuccess += batchSuccess
      }
    }

    console.log(`✅ [send-livestream-notifications] Sent ${totalSuccess}/${tokens.length} livestream notifications`)
    return new Response(JSON.stringify({ sent: totalSuccess, total: tokens.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('❌ [send-livestream-notifications] Error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
