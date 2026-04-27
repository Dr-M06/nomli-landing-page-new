/**
 * Instant DM / reaction pushes — no notification_queue pending row.
 * Caller must be authenticated; sender_id must match JWT. Uses service role only for reads + Expo send.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildDmBody(content: string, messageType: string | null | undefined): string {
  const c = content || 'You have a new message'
  if (c.startsWith('📷 Photo') || c.startsWith('🎥 Video')) {
    return c.split(':')[0] || c
  }
  if (c.startsWith('🎤 Voice Message')) {
    const durationMatch = c.match(/Duration:\s*(\d+(?:\.\d+)?)s?/i)
    if (durationMatch) {
      const duration = parseFloat(durationMatch[1])
      const minutes = Math.floor(duration / 60)
      const seconds = Math.floor(duration % 60)
      if (minutes > 0) {
        return `🎤 Voice message (${minutes}:${seconds.toString().padStart(2, '0')})`
      }
      return `🎤 Voice message (${seconds}s)`
    }
    return '🎤 Voice message'
  }
  return c.length > 100 ? c.substring(0, 100) + '...' : c
}

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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: authErr,
    } = await authClient.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    const admin = createClient(supabaseUrl, supabaseServiceKey)

    if (action === 'private_message') {
      const messageId = body.message_id as string
      const senderId = body.sender_id as string
      const recipientId = body.recipient_id as string

      if (!messageId || !senderId || !recipientId) {
        return new Response(JSON.stringify({ error: 'message_id, sender_id, recipient_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (senderId !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: msg, error: msgErr } = await admin
        .from('private_messages')
        .select('id, sender_id, recipient_id, content, message_type')
        .eq('id', messageId)
        .maybeSingle()

      if (msgErr || !msg) {
        return new Response(JSON.stringify({ error: 'Message not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (msg.sender_id !== senderId || msg.recipient_id !== recipientId) {
        return new Response(JSON.stringify({ error: 'Message does not match participants' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: senderProfile } = await admin
        .from('profiles')
        .select('username, full_name')
        .eq('id', senderId)
        .maybeSingle()

      const senderName =
        (senderProfile?.username && String(senderProfile.username).trim()) ||
        (senderProfile?.full_name && String(senderProfile.full_name).trim()) ||
        'Someone'

      const { data: recipientProfile, error: recErr } = await admin
        .from('profiles')
        .select('expo_push_token')
        .eq('id', recipientId)
        .maybeSingle()

      if (recErr || !recipientProfile?.expo_push_token) {
        return new Response(JSON.stringify({ ok: true, skipped: 'no_expo_token' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const token = recipientProfile.expo_push_token.trim()
      const valid =
        token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')
      if (!valid) {
        return new Response(JSON.stringify({ ok: true, skipped: 'invalid_expo_token' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const title = `${senderName} sent you a message`
      const notificationBody = buildDmBody(msg.content || '', msg.message_type)

      const expoPayload = {
        to: token,
        sound: 'default',
        title,
        body: notificationBody,
        data: {
          type: 'message',
          sender_id: senderId,
          message_id: messageId,
          conversation_id: senderId,
          sender_name: senderName,
        },
        badge: 1,
        priority: 'high',
        categoryId: 'chat_message',
        ios: { categoryIdentifier: 'chat_message' },
        android: { channelId: 'messages', priority: 'high' },
      }

      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(expoPayload),
      })

      const expoJson = await expoRes.json().catch(() => ({}))
      if (!expoRes.ok) {
        console.error('[send-instant-chat-push] Expo HTTP error', expoRes.status, expoJson)
        return new Response(JSON.stringify({ error: 'Expo push failed', details: expoJson }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const status = expoJson?.data?.[0]?.status ?? expoJson?.data?.status
      if (status && status !== 'ok') {
        console.error('[send-instant-chat-push] Expo ticket error', expoJson)
        return new Response(JSON.stringify({ error: 'Expo rejected push', details: expoJson }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ ok: true, sent: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'message_reaction') {
      const senderId = body.sender_id as string
      const recipientId = body.recipient_id as string
      const messageId = body.message_id as string
      const emoji = (body.emoji as string) || '❤️'
      const senderName = ((body.sender_name as string) || 'Someone').trim()
      const messagePreview = (body.message_preview as string) || ''

      if (!senderId || !recipientId || !messageId) {
        return new Response(
          JSON.stringify({ error: 'sender_id, recipient_id, message_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (senderId !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: msg, error: msgErr } = await admin
        .from('private_messages')
        .select('id, sender_id, recipient_id')
        .eq('id', messageId)
        .maybeSingle()

      if (msgErr || !msg) {
        return new Response(JSON.stringify({ error: 'Message not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const pair = new Set([msg.sender_id, msg.recipient_id])
      if (!pair.has(senderId) || !pair.has(recipientId)) {
        return new Response(JSON.stringify({ error: 'Invalid reaction context' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: recipientProfile } = await admin
        .from('profiles')
        .select('expo_push_token')
        .eq('id', recipientId)
        .maybeSingle()

      if (!recipientProfile?.expo_push_token) {
        return new Response(JSON.stringify({ ok: true, skipped: 'no_expo_token' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const token = recipientProfile.expo_push_token.trim()
      const valid =
        token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')
      if (!valid) {
        return new Response(JSON.stringify({ ok: true, skipped: 'invalid_expo_token' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const title = `${senderName} reacted to your message`
      const preview =
        messagePreview.length > 80 ? messagePreview.substring(0, 80) + '...' : messagePreview
      const notificationBody = preview ? `${emoji} "${preview}"` : `${emoji} Reacted to your message`

      const expoPayload = {
        to: token,
        sound: 'default',
        title,
        body: notificationBody,
        data: {
          type: 'message',
          notification_subtype: 'reaction',
          reaction_emoji: emoji,
          message_id: messageId,
          conversation_id: senderId,
          sender_id: senderId,
          sender_name: senderName,
          message_preview: preview,
        },
        badge: 1,
        priority: 'high',
        categoryId: 'chat_message',
        ios: { categoryIdentifier: 'chat_message' },
        android: { channelId: 'messages', priority: 'high' },
      }

      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(expoPayload),
      })

      const expoJson = await expoRes.json().catch(() => ({}))
      if (!expoRes.ok) {
        console.error('[send-instant-chat-push] Expo HTTP error (reaction)', expoRes.status, expoJson)
        return new Response(JSON.stringify({ error: 'Expo push failed', details: expoJson }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const status = expoJson?.data?.[0]?.status ?? expoJson?.data?.status
      if (status && status !== 'ok') {
        console.error('[send-instant-chat-push] Expo ticket error (reaction)', expoJson)
        return new Response(JSON.stringify({ error: 'Expo rejected push', details: expoJson }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ ok: true, sent: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-instant-chat-push]', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
