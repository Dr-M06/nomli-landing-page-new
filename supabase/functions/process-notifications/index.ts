import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationQueueItem {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  sender_name: string | null;
  message_content: string;
  notification_type: string;
  expo_push_token: string | null;
  fcm_token: string | null;
  onesignal_player_id: string | null;
  status: string;
  attempts: number;
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
  metadata: any;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if processing a specific notification (real-time mode)
    const body = await req.json().catch(() => ({}))
    // Support: body.notification_id (client), body.record?.id (Supabase Database Webhook), body.new?.id (trigger payload)
    let specificNotificationId = body.notification_id ?? body.record?.id ?? body.new?.id

    // DM send path: sender cannot read notification_queue (RLS). Client sends message_id + participants;
    // service role resolves the pending row and processes it immediately (WhatsApp-style).
    if (!specificNotificationId && body.message_id && body.sender_id && body.recipient_id) {
      const mid = String(body.message_id)
      const { data: metaHit } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('status', 'pending')
        .eq('recipient_id', body.recipient_id)
        .eq('sender_id', body.sender_id)
        .contains('metadata', { message_id: mid })
        .maybeSingle()
      if (metaHit?.id) {
        specificNotificationId = metaHit.id
      } else {
        const since = new Date(Date.now() - 120_000).toISOString()
        const { data: legacyHit } = await supabase
          .from('notification_queue')
          .select('id')
          .eq('status', 'pending')
          .eq('recipient_id', body.recipient_id)
          .eq('sender_id', body.sender_id)
          .or('notification_type.eq.message,notification_type.is.null')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (legacyHit?.id) specificNotificationId = legacyHit.id
      }
    }

    // If invoked by Database Webhook on UPDATE or DELETE, skip - we only process INSERT (new notifications)
    // Processing UPDATE would re-process notifications we just marked as 'sent', causing a loop
    if (body.type === 'UPDATE' || body.type === 'DELETE') {
      console.log(`⏭️ Skipping ${body.type} webhook event - only process INSERT`)
      return new Response(JSON.stringify({ processed: 0, message: 'Skipped non-INSERT event' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let pendingNotifications: NotificationQueueItem[] = []

    if (specificNotificationId) {
      // Real-time mode: Process specific notification immediately
      console.log(`🚀 Processing notification ${specificNotificationId} in real-time...`)
      
      // Idempotency: if already sent, return success (avoids duplicate push from webhook + client)
      const { data: existingRow } = await supabase
        .from('notification_queue')
        .select('id, status')
        .eq('id', specificNotificationId)
        .single()
      if (existingRow && existingRow.status === 'sent') {
        console.log(`⏭️ Notification ${specificNotificationId} already sent (idempotent skip)`)
        return new Response(JSON.stringify({ processed: 0, message: 'Notification already sent' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Atomically mark as 'processing' to prevent duplicate processing
      const { data: currentNotification, error: fetchError } = await supabase
        .from('notification_queue')
        .select('attempts')
        .eq('id', specificNotificationId)
        .eq('status', 'pending')
        .single()

      if (fetchError || !currentNotification) {
        console.log(`⚠️ Notification ${specificNotificationId} not found or already processed`)
        return new Response(JSON.stringify({ processed: 0, message: 'Notification already processed' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Now atomically update to 'processing' status
      const { data: updateResult, error: updateError } = await supabase
        .from('notification_queue')
        .update({ 
          status: 'processing',
          attempts: (currentNotification.attempts || 0) + 1
        })
        .eq('id', specificNotificationId)
        .eq('status', 'pending')  // Only update if still pending (prevents race condition)
        .select()
        .single()

      if (updateError || !updateResult) {
        console.log(`⚠️ Notification ${specificNotificationId} not found or already processed by another instance`)
        return new Response(JSON.stringify({ processed: 0, message: 'Notification already processed' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      pendingNotifications = [updateResult]
    } else {
      // Batch mode: Process all pending notifications (fallback)
      console.log('🔄 Processing notification queue (batch mode)...')

      const batchLimit = 20
      let data: NotificationQueueItem[] | null = null
      let fetchError: any = null

      const rpcRes = await supabase.rpc('dequeue_notification_batch', { p_limit: batchLimit })
      if (rpcRes.error) {
        console.warn('⚠️ dequeue_notification_batch unavailable, using legacy ordering:', rpcRes.error?.message || rpcRes.error)
        const legacy = await supabase
          .from('notification_queue')
          .select('*')
          .eq('status', 'pending')
          .lt('attempts', 3)
          .order('created_at', { ascending: true })
          .limit(batchLimit)
        data = legacy.data as NotificationQueueItem[] | null
        fetchError = legacy.error
      } else {
        data = rpcRes.data as NotificationQueueItem[] | null
      }

      if (fetchError) {
        console.error('❌ Error fetching notifications:', fetchError)
        return new Response(JSON.stringify({ error: 'Failed to fetch notifications' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      pendingNotifications = data || []
      
      // Atomically mark selected notifications as 'processing' to prevent duplicates
      if (pendingNotifications.length > 0) {
        const ids = pendingNotifications.map(n => n.id)
        const { error: updateError } = await supabase
          .from('notification_queue')
          .update({ status: 'processing' })
          .in('id', ids)
          .eq('status', 'pending')  // Only update if still pending (prevents race condition)
        
        if (updateError) {
          console.warn('⚠️ Warning: Could not mark notifications as processing:', updateError)
        } else {
          console.log(`✅ Marked notifications as 'processing' to prevent duplicates`)
        }
        // Only process rows we actually claimed (still 'processing'). Avoids duplicate sends when
        // a concurrent specific-id or webhook invocation already claimed some of these rows.
        const { data: claimed, error: claimedErr } = await supabase
          .from('notification_queue')
          .select('*')
          .in('id', ids)
          .eq('status', 'processing')
          .order('created_at', { ascending: true })
        if (!claimedErr && claimed && claimed.length > 0) {
          pendingNotifications = claimed
          if (claimed.length < ids.length) {
            console.log(`📌 Batch: only processing ${claimed.length}/${ids.length} rows we claimed (others already processed)`)
          }
        }
      }

      const batchPri = (t: string) =>
        ['message', 'message_reaction', 'call', 'livestream'].includes(t || '') ? 0 : 1
      pendingNotifications.sort((a, b) => {
        const d = batchPri(a.notification_type) - batchPri(b.notification_type)
        if (d !== 0) return d
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      console.log('✅ No pending notifications to process')
      return new Response(JSON.stringify({ processed: 0, message: 'No pending notifications' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`📱 Processing ${pendingNotifications.length} notifications...`)

    let processedCount = 0
    let failedCount = 0

    // Process each notification
    for (const notification of pendingNotifications) {
      try {
        // Skip notifications where sender is the same as recipient (self-notifications)
        if (notification.sender_id && notification.recipient_id && notification.sender_id === notification.recipient_id) {
          console.log(`⏭️ Skipping self-notification ${notification.id} (sender_id === recipient_id)`)
          await supabase
            .from('notification_queue')
            .update({ status: 'sent', processed_at: new Date().toISOString() })
            .eq('id', notification.id)
          continue
        }

        // Profile views: in-app only (no push) - like TikTok, Instagram, etc.
        // User sees "who viewed" when they open the app, not as push spam
        if (notification.notification_type === 'profile_view') {
          console.log(`📱 Profile view ${notification.id}: in-app only (no push)`)
          await supabase
            .from('notification_queue')
            .update({ status: 'sent', processed_at: new Date().toISOString() })
            .eq('id', notification.id)
          processedCount++
          continue
        }

        // Private chat: don't push if the message was already read (e.g. user had app open and read it before push was sent)
        if (notification.notification_type === 'message' || notification.notification_type === 'message_reaction') {
          let meta = notification.metadata || notification.data || {}
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta) } catch { meta = {} }
          }
          const messageId = meta?.message_id
          if (messageId && notification.recipient_id) {
            const { data: msg, error: msgErr } = await supabase
              .from('private_messages')
              .select('id, read')
              .eq('id', messageId)
              .eq('recipient_id', notification.recipient_id)
              .maybeSingle()
            if (!msgErr && msg?.read === true) {
              console.log(`📱 Message ${messageId} already read by ${notification.recipient_id}; skipping push for notification ${notification.id}`)
              await supabase
                .from('notification_queue')
                .update({ status: 'sent', processed_at: new Date().toISOString() })
                .eq('id', notification.id)
              processedCount++
              continue
            }
          }
        }

        // New post: don't push if the user already viewed the post (e.g. had feed open and saw it before push was sent)
        if (notification.notification_type === 'new_post') {
          let meta = notification.metadata || notification.data || {}
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta) } catch { meta = {} }
          }
          const postId = meta?.post_id
          if (postId && notification.recipient_id) {
            const recipientId = notification.recipient_id
            // Video posts: check post_video_views (user_id = recipient)
            const { data: videoView } = await supabase
              .from('post_video_views')
              .select('post_id')
              .eq('post_id', postId)
              .eq('user_id', recipientId)
              .limit(1)
              .maybeSingle()
            if (videoView) {
              console.log(`📱 Post ${postId} already viewed by ${recipientId} (video); skipping push for notification ${notification.id}`)
              await supabase
                .from('notification_queue')
                .update({ status: 'sent', processed_at: new Date().toISOString() })
                .eq('id', notification.id)
              processedCount++
              continue
            }
            // Any post: check post_views (viewer_id = recipient) if table exists
            const { data: postView } = await supabase
              .from('post_views')
              .select('post_id')
              .eq('post_id', postId)
              .eq('viewer_id', recipientId)
              .limit(1)
              .maybeSingle()
            if (postView) {
              console.log(`📱 Post ${postId} already viewed by ${recipientId}; skipping push for notification ${notification.id}`)
              await supabase
                .from('notification_queue')
                .update({ status: 'sent', processed_at: new Date().toISOString() })
                .eq('id', notification.id)
              processedCount++
              continue
            }
          }
        }

        // HARD DEDUPE: Already sent a push for this (recipient, type, sender) recently. Stops loops when duplicate rows or multiple invokers.
        // Never dedupe calls — every call attempt must ring. Short window for messages/livestream (real-time), longer for the rest.
        const dedupeTypes = ['like', 'new_post', 'profile_view', 'follow', 'comment', 'message', 'message_reaction', 'event_join', 'livestream', 'discover_like'];
        if (dedupeTypes.includes(notification.notification_type)) {
          const isRealtimeType = notification.notification_type === 'message' || notification.notification_type === 'message_reaction' || notification.notification_type === 'livestream';
          const dedupeWindowMs = isRealtimeType ? 25 * 1000 : 5 * 60 * 1000; // 25s for chat/livestream, 5 min for rest
          const windowAgo = new Date(Date.now() - dedupeWindowMs).toISOString();
          let q = supabase
            .from('notification_queue')
            .select('id')
            .eq('recipient_id', notification.recipient_id)
            .eq('notification_type', notification.notification_type)
            .eq('status', 'sent')
            .gte('processed_at', windowAgo)
            .neq('id', notification.id)
            .limit(1);
          if (notification.sender_id != null) {
            q = q.eq('sender_id', notification.sender_id);
          } else {
            q = q.is('sender_id', null);
          }
          const { data: recentSent } = await q.maybeSingle();
          if (recentSent) {
            console.log(`⏭️ Dedupe: already sent same (recipient, type, sender) in last ${isRealtimeType ? '25s' : '5 min'} for ${notification.id}; marking sent and skipping push`)
            await supabase
              .from('notification_queue')
              .update({ status: 'sent', processed_at: new Date().toISOString() })
              .eq('id', notification.id);
            processedCount++;
            continue;
          }
        }

        console.log(`📤 Processing notification ${notification.id} for user ${notification.recipient_id}`)
        
        // If tokens are missing on the queue item, fetch from profile (service role can bypass RLS).
        // This makes queue inserts work even if they only provide recipient_id + metadata.
        if (!notification.expo_push_token && !notification.fcm_token && !notification.onesignal_player_id) {
          try {
            const { data: profileTokens, error: tokenError } = await supabase
              .from('profiles')
              .select('expo_push_token, fcm_token, onesignal_player_id')
              .eq('id', notification.recipient_id)
              .single()
            
            if (!tokenError && profileTokens) {
              notification.expo_push_token = profileTokens.expo_push_token || notification.expo_push_token
              notification.fcm_token = profileTokens.fcm_token || notification.fcm_token
              notification.onesignal_player_id = profileTokens.onesignal_player_id || notification.onesignal_player_id
              
              // Best effort: persist tokens onto queue row for faster processing next time
              await supabase
                .from('notification_queue')
                .update({
                  expo_push_token: notification.expo_push_token,
                  fcm_token: notification.fcm_token,
                  onesignal_player_id: notification.onesignal_player_id,
                })
                .eq('id', notification.id)
            }
          } catch (e) {
            console.warn(`⚠️ Could not fetch tokens for recipient ${notification.recipient_id}:`, e)
          }
        }
        
        // Get notification data from metadata (ensure object; PostgREST may return JSONB as string)
        let metadata = notification.metadata || notification.data || {}
        if (typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata)
          } catch {
            metadata = {}
          }
        }
        if (!metadata || typeof metadata !== 'object') metadata = {}
        
        const senderName = notification.sender_name || metadata?.sender_name
        
        // Debug log for event_join notifications
        if (notification.notification_type === 'event_join') {
          console.log(`📅 Event join notification:`, {
            notification_type: notification.notification_type,
            sender_name: notification.sender_name,
            message_content: notification.message_content,
            metadata: JSON.stringify(metadata)
          })
        }
        
        // Debug log for livestream notifications
        if (notification.notification_type === 'livestream') {
          console.log(`🎥 Livestream notification:`, {
            notification_type: notification.notification_type,
            sender_name: notification.sender_name,
            sender_id: notification.sender_id,
            recipient_id: notification.recipient_id,
            message_content: notification.message_content,
            metadata: JSON.stringify(metadata),
            expo_token: notification.expo_push_token ? 'present' : 'missing',
            fcm_token: notification.fcm_token ? 'present' : 'missing'
          })
        }
        
        let title = getNotificationTitle(notification)
        let body = getNotificationBody(notification)
        // Ensure profile_view never sends empty title/body (fixes empty push)
        if (notification.notification_type === 'profile_view') {
          if (!title || !title.trim()) title = 'Someone viewed your profile'
          if (!body || !body.trim()) body = 'Tap to see who viewed your profile'
        }
        // Ensure new_post has name and context (fixes generic/empty push)
        if (notification.notification_type === 'new_post') {
          const nameForPost = senderName || 'Someone'
          if (!title || !title.trim()) title = `${nameForPost} shared a new post`
          if (!body || !body.trim()) body = `${nameForPost} shared a new post • Tap to view`
        }
        // Never send generic "New notification" when we have sender info (fixes wrong/missing type)
        if (senderName && (title === 'New notification' || body === 'You have a new notification')) {
          if (title === 'New notification') title = `${senderName}`
          if (body === 'You have a new notification') body = notification.message_content?.trim() || 'Tap to view'
        }
        const notificationData = buildNotificationData(notification, title, body, metadata)

        // Never send push with empty title/body (final safeguard so lock-screen push has context)
        const hasTitle = title && String(title).trim()
        const hasBody = body && String(body).trim()
        if (!hasTitle) title = senderName ? `${senderName}` : 'New notification'
        if (!hasBody) {
          const msg = notification.message_content && String(notification.message_content).trim()
          body = msg ? (msg.length > 100 ? msg.substring(0, 100) + '...' : msg) : 'Tap to view'
        }

        // Include title/body in data payload so client can display them if OS strips
        if (notificationData.data && typeof notificationData.data === 'object') {
          notificationData.data.title = title
          notificationData.data.body = body
        }

        let sent = false

        // Debug: Log token status
        console.log(`🔍 [ProcessNotifications] Notification ${notification.id} token status:`, {
          has_expo_token: !!notification.expo_push_token,
          has_fcm_token: !!notification.fcm_token,
          expo_token_preview: notification.expo_push_token ? `${notification.expo_push_token.substring(0, 30)}...` : 'NULL',
          notification_type: notification.notification_type,
          recipient_id: notification.recipient_id,
        })

        // Try Expo push notification first (if token exists)
        if (notification.expo_push_token) {
          // Validate token format
          const tokenFormat = notification.expo_push_token.trim()
          const isValidFormat = tokenFormat.startsWith('ExponentPushToken[') || tokenFormat.startsWith('ExpoPushToken[')
          
          if (!isValidFormat) {
            console.error(`❌ [ProcessNotifications] Invalid Expo push token format for notification ${notification.id}:`, {
              token_preview: tokenFormat.substring(0, 50),
              expected_format: 'ExponentPushToken[...] or ExpoPushToken[...]',
            })
            ;(notification as any).expoError = `Invalid token format: expected ExponentPushToken[...] or ExpoPushToken[...], got: ${tokenFormat.substring(0, 30)}...`
            // Skip Expo, try FCM/OneSignal instead
          } else {
            console.log(`📤 [ProcessNotifications] Sending Expo push notification for ${notification.id}`)
            console.log(`📤 [ProcessNotifications] Token format valid: ${tokenFormat.substring(0, 30)}...`)
            
            try {
              // Build Expo notification payload
              const expoPayload: any = {
                to: notification.expo_push_token,
                sound: 'default',
                title,
                body,
                data: notificationData.data,
                badge: 1,
                priority: notification.notification_type === 'call' ? 'high' : 'default',
                ...(notificationData.ios ? { ios: notificationData.ios } : {}),
                ...(notificationData.android ? { android: notificationData.android } : {}),
              }
              
              // Add categoryId for iOS notification actions (reply, mark read, etc.)
              if (notification.notification_type === 'message' || notification.notification_type === 'message_reaction') {
                expoPayload.categoryId = 'chat_message'
                // Also add iOS-specific category identifier
                if (!expoPayload.ios) {
                  expoPayload.ios = {}
                }
                expoPayload.ios.categoryIdentifier = 'chat_message'
              } else if (notification.notification_type === 'call') {
                expoPayload.categoryId = 'incoming_call'
                if (!expoPayload.ios) {
                  expoPayload.ios = {}
                }
                expoPayload.ios.categoryIdentifier = 'incoming_call'
              }
              
              console.log(`📤 [ProcessNotifications] Expo payload for ${notification.id}:`, {
                to: notification.expo_push_token.substring(0, 30) + '...',
                title,
                body,
                data_type: notificationData.data?.type,
                priority: expoPayload.priority,
                categoryId: expoPayload.categoryId,
                has_ios: !!notificationData.ios,
                has_android: !!notificationData.android,
              })
              
            const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(expoPayload),
            })

            if (expoResponse.ok) {
              const expoResult = await expoResponse.json()
              console.log(`📬 [ProcessNotifications] Expo API response for ${notification.id}:`, JSON.stringify(expoResult))
              
              // Handle different Expo API response formats
              let expoStatus: string | null = null
              let expoMessage: string = 'No message'
              let expoDetails: any = {}
              
              // Check if response has data array (standard format)
              if (expoResult.data && Array.isArray(expoResult.data) && expoResult.data[0]) {
                expoStatus = expoResult.data[0].status
                expoMessage = expoResult.data[0].message || 'No message'
                expoDetails = expoResult.data[0].details || {}
              } 
              // Check if response has data object directly (alternative format)
              else if (expoResult.data && expoResult.data.status) {
                expoStatus = expoResult.data.status
                expoMessage = expoResult.data.message || 'No message'
                expoDetails = expoResult.data.details || {}
              }
              // Check if response itself has status (fallback)
              else if (expoResult.status) {
                expoStatus = expoResult.status
                expoMessage = expoResult.message || 'No message'
                expoDetails = expoResult.details || {}
              }
              
              // Check if notification was sent successfully
              if (expoStatus === 'ok') {
                console.log(`✅ Expo notification ${notification.id} sent successfully`)
                sent = true
              } else if (expoStatus) {
                // Log detailed error info
                console.error(`❌ Expo notification ${notification.id} failed:`, {
                  status: expoStatus,
                  message: expoMessage,
                  details: expoDetails,
                  fullResponse: expoResult
                })
                
                // Store the Expo error for reporting
                const expoErrorMsg = `Expo push failed: ${expoStatus} - ${expoMessage}${expoDetails ? ` (${JSON.stringify(expoDetails)})` : ''}`
                ;(notification as any).expoError = expoErrorMsg
                
                // Check if token is invalid/expired
                if (expoStatus === 'error' && (expoMessage.includes('Invalid') || expoMessage.includes('DeviceNotRegistered') || expoMessage.includes('NotRegistered') || expoMessage.includes('expo') || expoMessage.includes('token'))) {
                  console.error(`🚨 [ProcessNotifications] Push token appears to be invalid/expired for notification ${notification.id}: ${expoMessage}`)
                  // Don't throw - let it try FCM/OneSignal as fallback, but mark the error
                } else {
                  // For other errors, still store but don't throw immediately (let FCM/OneSignal try)
                  console.error(`❌ [ProcessNotifications] Expo returned error status: ${expoStatus} - ${expoMessage}`)
                }
              } else {
                // If we can't parse the status, but response was OK, assume success
                // This handles edge cases where Expo API format might differ
                console.warn(`⚠️ [ProcessNotifications] Could not parse Expo response status, but HTTP was OK. Assuming success. Response:`, JSON.stringify(expoResult))
                console.log(`✅ Expo notification ${notification.id} sent successfully (assumed from HTTP 200)`)
                sent = true
              }
            } else {
              const errorText = await expoResponse.text()
              console.error(`❌ [ProcessNotifications] Expo HTTP error ${expoResponse.status} for notification ${notification.id}:`, errorText)
              const httpError = new Error(`Expo HTTP error: ${expoResponse.status} - ${errorText}`)
              ;(notification as any).expoError = httpError.message
              throw httpError
            }
          } catch (expoError: any) {
            // Only log as error if we haven't already marked as sent
            if (!sent) {
              const expoErrorMessage = expoError?.message || String(expoError)
              console.error(`❌ [ProcessNotifications] Expo notification failed for ${notification.id}:`, {
                error: expoErrorMessage,
                stack: expoError?.stack,
                fullError: JSON.stringify(expoError),
              })
              // Store Expo error for later reporting
              ;(notification as any).expoError = expoErrorMessage
            } else {
              // If already sent, just log warning
              console.warn(`⚠️ [ProcessNotifications] Expo notification ${notification.id} had parsing error but was already marked as sent`)
            }
            // Continue to FCM - don't rethrow if we haven't sent yet
          }
          } // Close the else block for isValidFormat
        } else {
          console.warn(`⚠️ [ProcessNotifications] No Expo push token for notification ${notification.id} - skipping Expo push`)
          // Try to get token from profile as fallback
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('expo_push_token')
              .eq('id', notification.recipient_id)
              .single()
            
            if (profile?.expo_push_token) {
              console.log(`🔄 [ProcessNotifications] Found token in profile, using it for notification ${notification.id}`)
              // Update notification with token and retry
              notification.expo_push_token = profile.expo_push_token
              // Retry sending with token from profile
              const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  'Accept': 'application/json',
                  'Accept-encoding': 'gzip, deflate',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: profile.expo_push_token,
                  sound: 'default',
                  title,
                  body,
                  data: notificationData.data,
                  badge: 1,
                  priority: notification.notification_type === 'call' ? 'high' : 'default',
                  ...(notificationData.ios ? { ios: notificationData.ios } : {}),
                  ...(notificationData.android ? { android: notificationData.android } : {}),
                }),
              })

              if (expoResponse.ok) {
                const expoResult = await expoResponse.json()
                if (expoResult.data && expoResult.data[0] && expoResult.data[0].status === 'ok') {
                  console.log(`✅ Expo notification ${notification.id} sent successfully (using profile token)`)
                  sent = true
                }
              }
            } else {
              console.warn(`⚠️ [ProcessNotifications] No Expo push token in profile either for user ${notification.recipient_id}`)
            }
          } catch (fallbackError) {
            console.error(`❌ [ProcessNotifications] Error fetching token from profile:`, fallbackError)
          }
        }

        // Try FCM if Expo failed or if FCM token exists
        if (!sent && notification.fcm_token) {
          try {
            console.log(`📱 Attempting FCM notification for ${notification.id}`)
            
            // Try service account first (FCM HTTP v1 API - recommended)
            const serviceAccountBase64 = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_BASE64')
            const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY') // Fallback to legacy API
            
            if (serviceAccountBase64) {
              // Use FCM HTTP v1 API with service account
              try {
                // Decode service account JSON
                const serviceAccountJson = JSON.parse(atob(serviceAccountBase64))
                const projectId = serviceAccountJson.project_id || 'nomli-mingle-fcm'
                
                // Get OAuth2 access token using service account
                const accessToken = await getAccessTokenFromServiceAccount(serviceAccountJson)
                
                if (!accessToken) {
                  throw new Error('Failed to get access token from service account')
                }
                
                // Build FCM v1 API payload
                const fcmV1Payload: any = {
                  message: {
                    token: notification.fcm_token,
                    notification: {
                      title,
                      body,
                    },
                    data: {
                      // Send everything as string data (FCM requirement)
                      ...Object.fromEntries(
                        Object.entries(notificationData.data).map(([k, v]) => [k, String(v)])
                      ),
                    },
                    android: {
                      priority: notification.notification_type === 'call' ? 'high' : 'normal',
                      notification: {
                        sound: 'default',
                        channelId: notification.notification_type === 'call' ? 'critical_calls' : 'default',
                      },
                    },
                    apns: {
                      headers: {
                        'apns-priority': notification.notification_type === 'call' ? '10' : '5',
                      },
                      payload: {
                        aps: {
                          sound: 'default',
                          badge: 1,
                        },
                      },
                    },
                  },
                }
                
                // For call notifications, enhance payload
                if (notification.notification_type === 'call') {
                  fcmV1Payload.message.android.notification.priority = 'max'
                  fcmV1Payload.message.android.notification.visibility = 'public'
                  fcmV1Payload.message.apns.headers['apns-push-type'] = 'alert'
                  fcmV1Payload.message.apns.payload.aps['interruption-level'] = 'critical'
                  fcmV1Payload.message.apns.payload.aps.category = 'incoming_call'
                }
                
                // For message notifications, add category for iOS reply support
                if (notification.notification_type === 'message' || notification.notification_type === 'message_reaction') {
                  fcmV1Payload.message.apns.payload.aps.category = 'chat_message'
                  // Also add categoryId to data for Expo compatibility
                  if (!fcmV1Payload.message.data.categoryId) {
                    fcmV1Payload.message.data.categoryId = 'chat_message'
                  }
                }
                
                const fcmV1Response = await fetch(
                  `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify(fcmV1Payload),
                  }
                )
                
                if (fcmV1Response.ok) {
                  const fcmV1Result = await fcmV1Response.json()
                  console.log(`✅ FCM v1 notification ${notification.id} sent successfully:`, fcmV1Result)
                  sent = true
                } else {
                  const errorText = await fcmV1Response.text()
                  console.error(`❌ FCM v1 API error: ${fcmV1Response.status} - ${errorText}`)
                  throw new Error(`FCM v1 API error: ${fcmV1Response.status} - ${errorText}`)
                }
              } catch (serviceAccountError: any) {
                console.warn(`⚠️ FCM v1 API failed, trying legacy API:`, serviceAccountError.message)
                console.warn(`⚠️ FCM v1 error details:`, JSON.stringify(serviceAccountError))
                // Don't throw - let it fall through to legacy API
                // Only throw if legacy API is also not available
              }
            }
            
            // Fallback to legacy FCM API if service account failed or not available
            if (!sent && firebaseServerKey) {
              console.log(`📱 Using legacy FCM API for ${notification.id}`)
              
              const fcmPayload: any = {
                to: notification.fcm_token,
                notification: {
                  title,
                  body,
                  sound: 'default',
                },
                data: {
                  // Send everything as string data (FCM requirement)
                  ...Object.fromEntries(
                    Object.entries(notificationData.data).map(([k, v]) => [k, String(v)])
                  ),
                },
                priority: notification.notification_type === 'call' ? 'high' : 'normal',
                content_available: true,
              }

              // For call notifications, add platform-specific configs for better delivery
              if (notification.notification_type === 'call') {
                fcmPayload.android = {
                  priority: 'high',
                  notification: {
                    channel_id: 'critical_calls',
                    priority: 'max',
                    visibility: 'public',
                    sound: 'ringtone',
                    click_action: 'FLUTTER_NOTIFICATION_CLICK',
                    actions: [
                      {
                        action: 'answer',
                        title: 'Answer',
                        icon: 'ic_call_answer'
                      },
                      {
                        action: 'decline',
                        title: 'Decline',
                        icon: 'ic_call_decline'
                      }
                    ]
                  }
                }
                fcmPayload.apns = {
                  headers: {
                    'apns-priority': '10',
                    'apns-push-type': 'alert',
                  },
                  payload: {
                    aps: {
                      sound: 'call-ringtone.caf',
                      'interruption-level': 'critical',
                      'relevance-score': 1.0,
                      category: 'incoming_call',
                    }
                  }
                }
              }

              const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `key=${firebaseServerKey}`
                },
                body: JSON.stringify(fcmPayload)
              })

              if (fcmResponse.ok) {
                const fcmResult = await fcmResponse.json()
                console.log(`✅ FCM legacy notification ${notification.id} sent successfully:`, fcmResult)
                sent = true
              } else {
                const errorText = await fcmResponse.text()
                throw new Error(`FCM legacy API error: ${errorText}`)
              }
            } else if (!sent && !serviceAccountBase64 && !firebaseServerKey) {
              const errorMsg = '⚠️ Firebase service account or server key not configured, skipping FCM'
              console.warn(errorMsg)
              // Don't throw here - continue to OneSignal, but log the issue
              ;(notification as any).fcmError = errorMsg
            }
          } catch (fcmError: any) {
            const fcmErrorMessage = fcmError?.message || String(fcmError)
            console.error(`❌ [ProcessNotifications] FCM notification failed for ${notification.id}:`, {
              error: fcmErrorMessage,
              stack: fcmError?.stack,
            })
            // Store FCM error for later reporting
            ;(notification as any).fcmError = fcmErrorMessage
            // Continue to OneSignal - don't rethrow yet
          }
        }

        // Try OneSignal if FCM and Expo failed or if only OneSignal token exists
        if (!sent && notification.onesignal_player_id) {
          try {
            const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID')
            const oneSignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')
            
            if (oneSignalAppId && oneSignalApiKey) {
              const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Basic ${oneSignalApiKey}`
                },
                body: JSON.stringify({
                  app_id: oneSignalAppId,
                  include_player_ids: [notification.onesignal_player_id],
                  contents: { en: body },
                  headings: { en: title },
                  data: notificationData.data,
                  ios_sound: 'default',
                  android_sound: 'default',
                  priority: notification.notification_type === 'call' ? 10 : 5,
                  content_available: true,
                  mutable_content: true,
                  ios_badgeType: 'Increase',
                  ios_badgeCount: 1,
                  android_channel_id: notification.notification_type === 'call' ? 'critical_calls' : 'default',
                  android_visibility: 1,
                })
              })

              if (oneSignalResponse.ok) {
                const oneSignalResult = await oneSignalResponse.json()
                console.log(`✅ OneSignal notification ${notification.id} sent successfully:`, oneSignalResult.id)
                sent = true
              } else {
                const errorText = await oneSignalResponse.text()
                throw new Error(`OneSignal API error: ${errorText}`)
              }
            }
          } catch (oneSignalError: any) {
            const oneSignalErrorMessage = oneSignalError?.message || String(oneSignalError)
            console.error(`❌ [ProcessNotifications] OneSignal notification failed for ${notification.id}:`, {
              error: oneSignalErrorMessage,
              stack: oneSignalError?.stack,
            })
            // Store OneSignal error for later reporting
            ;(notification as any).oneSignalError = oneSignalErrorMessage
          }
        }

        // Mark as sent if either method succeeded
        // Only update if still in 'processing' state (prevents duplicate sends)
        if (sent) {
          const { error: updateError } = await supabase
            .from('notification_queue')
            .update({ 
              status: 'sent', 
              processed_at: new Date().toISOString() 
            })
            .eq('id', notification.id)
            .in('status', ['processing', 'pending'])  // Only update if still processing/pending
            
          if (updateError) {
            console.warn(`⚠️ Could not update status for ${notification.id} - may have been processed by another instance:`, updateError)
          } else {
            console.log(`✅ Marked notification ${notification.id} as sent`)
          }
          
          processedCount++
        } else {
          // Build detailed error message showing which services were tried and WHY they failed
          const triedServices = []
          const serviceErrors: string[] = []
          
          // Debug: Log what errors we have stored
          console.log(`🔍 [ProcessNotifications] Building error message for ${notification.id}, stored errors:`, {
            expoError: (notification as any).expoError,
            fcmError: (notification as any).fcmError,
            oneSignalError: (notification as any).oneSignalError,
          })
          
          // Check if Expo was tried and failed
          if (notification.expo_push_token) {
            triedServices.push('Expo')
            const expoError = (notification as any).expoError
            if (expoError) {
              serviceErrors.push(`Expo: ${expoError}`)
              console.log(`✅ [ProcessNotifications] Found Expo error for ${notification.id}: ${expoError}`)
            } else {
              serviceErrors.push('Expo: Unknown error (check Edge Function logs)')
              console.warn(`⚠️ [ProcessNotifications] No Expo error stored for ${notification.id} despite having token`)
            }
          }
          
          if (notification.fcm_token) {
            const serviceAccountBase64 = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_BASE64')
            const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY')
            if (serviceAccountBase64 || firebaseServerKey) {
              triedServices.push('FCM')
              const fcmError = (notification as any).fcmError
              if (fcmError) {
                serviceErrors.push(`FCM: ${fcmError}`)
              } else {
                serviceErrors.push('FCM: Unknown error (check Edge Function logs)')
              }
            } else {
              triedServices.push('FCM (service account or server key not configured)')
              serviceErrors.push('FCM: Service account or server key not configured in environment variables')
            }
          }
          
          if (notification.onesignal_player_id) {
            triedServices.push('OneSignal')
            const oneSignalError = (notification as any).oneSignalError
            if (oneSignalError) {
              serviceErrors.push(`OneSignal: ${oneSignalError}`)
            } else {
              serviceErrors.push('OneSignal: Unknown error (check Edge Function logs)')
            }
          }
          
          const errorMsg = triedServices.length > 0
            ? `All notification services failed: ${triedServices.join(', ')}. Details: ${serviceErrors.join('; ')}`
            : 'No push tokens available (expo_push_token, fcm_token, and onesignal_player_id all missing)'
          
          console.error(`❌ [ProcessNotifications] All services failed for notification ${notification.id}:`, errorMsg)
          throw new Error(errorMsg)
        }

      } catch (error) {
        console.error(`❌ Failed to process notification ${notification.id}:`, error)
        
        // Increment attempts and mark as failed if max attempts reached
        const newAttempts = notification.attempts + 1
        const newStatus = newAttempts >= 3 ? 'failed' : 'pending'
        
        await supabase
          .from('notification_queue')
          .update({ 
            attempts: newAttempts,
            status: newStatus,
            error_message: error.message,
            processed_at: newStatus === 'failed' ? new Date().toISOString() : null
          })
          .eq('id', notification.id)
        
        failedCount++
      }
    }

    console.log(`✅ Processed ${processedCount} notifications, ${failedCount} failed`)

    return new Response(JSON.stringify({ 
      processed: processedCount, 
      failed: failedCount,
      total: pendingNotifications.length 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Error in notification processor:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Helper functions

/**
 * Get OAuth2 access token from Firebase service account
 * Uses JWT signing to authenticate with Google OAuth2
 */
async function getAccessTokenFromServiceAccount(serviceAccount: any): Promise<string | null> {
  try {
    // Create JWT claim
    const now = Math.floor(Date.now() / 1000)
    const jwtClaim = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
      exp: now + 3600, // Token expires in 1 hour
      iat: now,
    }

    // Sign JWT with private key using Web Crypto API
    const jwt = await signJWT(jwtClaim, serviceAccount.private_key)
    
    // Exchange JWT for access token
    const tokenResponse = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error(`❌ Failed to get access token: ${tokenResponse.status} - ${errorText}`)
      return null
    }

    const tokenData = await tokenResponse.json()
    return tokenData.access_token || null
  } catch (error) {
    console.error(`❌ Error getting access token from service account:`, error)
    return null
  }
}

/**
 * Sign JWT using RSA private key
 * Uses Web Crypto API for Deno Edge Functions
 */
async function signJWT(claim: any, privateKey: string): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const encodedClaim = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  
  const message = `${encodedHeader}.${encodedClaim}`
  
  // Parse private key
  const keyData = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  
  const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyBuffer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    )
    
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(message)
    )
    
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    
    return `${message}.${encodedSignature}`
  } catch (error) {
    console.error(`❌ Error signing JWT:`, error)
    throw error
  }
}

function getNotificationTitle(notification: NotificationQueueItem): string {
  let metadata = notification.metadata || notification.data || {}
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata) } catch { metadata = {} }
  }
  if (!metadata || typeof metadata !== 'object') metadata = {}
  const senderName = notification.sender_name || (metadata as any).sender_name || 'Someone'
  
  switch (notification.notification_type) {
    case 'message':
      return `${senderName} sent you a message`
    case 'message_reaction':
      return `${senderName} reacted to your message`
    case 'call': {
      const callType = metadata.call_type || 'audio'
      return `Incoming ${callType} call`
    }
    case 'like':
      return `${senderName} liked your post`
    case 'comment':
      return `${senderName} commented on your post`
    case 'follow':
      return `${senderName} started following you`
    case 'announcement':
      return metadata.title || 'New announcement'
    case 'event_join': {
      const eventTitle = metadata.event_title || 'your event'
      const joinerName = metadata.joiner_name || senderName || 'Someone'
      return `${joinerName} joined "${eventTitle}"`
    }
    case 'event':
      return metadata.event_title || 'Event update'
    case 'livestream': {
      const streamerName = metadata.streamer_name || senderName || 'Someone'
      return `🔴 ${streamerName} is LIVE!`
    }
    case 'new_post': {
      // Use sender name from metadata or notification for context-rich title
      const postSenderName = (metadata as any).sender_name || senderName || 'Someone'
      const hasVideo = (metadata as any).has_video === true
      const hasImages = (metadata as any).has_images === true
      if (hasVideo) return `${postSenderName} shared a new video`
      if (hasImages) return `${postSenderName} shared a new photo`
      return `${postSenderName} shared a new post`
    }
    case 'profile_view': {
      // Try to get viewer name from metadata, fallback to sender_name, then "Someone"
      const viewerName = metadata.viewer_name || notification.sender_name || 'Someone'
      const title = viewerName ? `${viewerName} viewed your profile` : 'Someone viewed your profile'
      return title.trim() || 'Someone viewed your profile'
    }
    case 'discover_like':
      return 'Someone liked your profile'
    case 'credit': {
      const t = (metadata as any).title
      return (t && String(t).trim()) || 'You received tokens'
    }
    case 'friend_request_accepted':
      return 'Friend request accepted'
    default:
      // When type is missing/unknown, still show sender name if we have it (avoid generic "New notification")
      if (senderName && senderName !== 'Someone') return `${senderName}`
      return 'New notification'
  }
}

function getNotificationBody(notification: NotificationQueueItem): string {
  let metadata = notification.metadata || notification.data || {}
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata) } catch { metadata = {} }
  }
  if (!metadata || typeof metadata !== 'object') metadata = {}
  const defaultSenderName = notification.sender_name || (metadata as any).sender_name || 'Someone'
  
  switch (notification.notification_type) {
    case 'message': {
      const content = notification.message_content || 'You have a new message';
      
      // Check if it's a media message (photo/video)
      if (content.startsWith('📷 Photo') || content.startsWith('🎥 Video')) {
        // Return just the media type indicator
        return content.split(':')[0]; // Returns "📷 Photo" or "🎥 Video" without caption
      }
      
      // Check if it's a voice note (starts with 🎤 Voice Message and contains URL)
      if (content.startsWith('🎤 Voice Message')) {
        // Extract duration if available
        const durationMatch = content.match(/Duration:\s*(\d+(?:\.\d+)?)s?/i);
        if (durationMatch) {
          const duration = parseFloat(durationMatch[1]);
          const minutes = Math.floor(duration / 60);
          const seconds = Math.floor(duration % 60);
          if (minutes > 0) {
            return `🎤 Voice message (${minutes}:${seconds.toString().padStart(2, '0')})`;
          } else {
            return `🎤 Voice message (${seconds}s)`;
          }
        }
        return '🎤 Voice message';
      }
      
      // For regular messages, truncate if too long
      return content.length > 100 ? content.substring(0, 100) + '...' : content;
    }
    case 'message_reaction': {
      const emoji = metadata.emoji || metadata.reaction_emoji || '❤️'
      const reactedPreview = metadata.message_preview || metadata.reacted_message_preview || notification.message_content || ''
      const preview = reactedPreview.length > 80 ? reactedPreview.substring(0, 80) + '...' : reactedPreview
      return preview ? `${emoji} "${preview}"` : `${emoji} Reacted to your message`
    }
    case 'call': {
      const callerName = metadata.caller_name || defaultSenderName
      return `${callerName} is calling you`
    }
    case 'like':
      return 'Tap to view'
    case 'comment': {
      const commentPreview = notification.message_content || metadata.comment_content || 'commented on your post'
      return commentPreview.length > 100 ? commentPreview.substring(0, 100) + '...' : commentPreview
    }
    case 'follow':
      return 'Tap to view their profile'
    case 'announcement':
      return notification.message_content || metadata.message || 'You have a new announcement'
    case 'event_join': {
      const eventTitle = metadata.event_title || 'your event'
      const joinerName = metadata.joiner_name || defaultSenderName || 'Someone'
      return notification.message_content || `${joinerName} joined "${eventTitle}"`
    }
    case 'event':
      return notification.message_content || metadata.message || 'You have an event update'
    case 'new_post': {
      const postContent = metadata.post_content || notification.message_content || ''
      const hasVideo = metadata.has_video === true
      const hasImages = metadata.has_images === true
      const senderName = metadata.sender_name || notification.sender_name || 'Someone'
      const preview = postContent && postContent.trim().length > 0
        ? (postContent.length > 80 ? postContent.substring(0, 80).trim() + '...' : postContent.trim())
        : ''
      if (hasVideo) return `${senderName} shared a new video • Tap to watch`
      if (hasImages) return `${senderName} shared a new photo • Tap to view`
      if (preview) return preview
      return `${senderName} shared a new post • Tap to view`
    }
    case 'livestream': {
      const streamTitle = metadata.stream_title || ''
      // Body without name (name is already in title)
      if (streamTitle) {
        return `"${streamTitle}" • Tap to join now!`
      }
      return `Tap to watch their livestream!`
    }
    case 'profile_view': {
      // Try to get viewer name from metadata, fallback to sender_name, then "Someone"
      const viewerName = metadata.viewer_name || notification.sender_name || 'Someone'
      const body = viewerName ? `${viewerName} viewed your profile • Tap to see who` : 'Someone viewed your profile • Tap to see who'
      return body.trim() || 'Tap to see who viewed your profile'
    }
    case 'discover_like':
      return 'Tap to see who in Discover'
    case 'credit': {
      const msg = notification.message_content?.trim()
      if (msg) return msg.length > 100 ? msg.substring(0, 100) + '...' : msg
      return 'Tap to view your wallet'
    }
    case 'friend_request_accepted': {
      const msg = notification.message_content?.trim()
      if (msg) return msg.length > 100 ? msg.substring(0, 100) + '...' : msg
      return 'Tap to view'
    }
    default:
      // When type is missing/unknown, use message_content or a generic tap message (avoid empty/generic body)
      const fallbackBody = notification.message_content?.trim()
      if (fallbackBody && fallbackBody.length > 0) {
        return fallbackBody.length > 100 ? fallbackBody.substring(0, 100) + '...' : fallbackBody
      }
      if (defaultSenderName && defaultSenderName !== 'Someone') return 'Tap to view'
      return 'You have a new notification'
  }
}

function buildNotificationData(notification: NotificationQueueItem, title: string, body: string, metadata: any): any {
  const baseData: any = {
    type: notification.notification_type,
    sender_id: notification.sender_id,
    ...metadata,
  }

  // Add type-specific data
  switch (notification.notification_type) {
    case 'message':
      baseData.message_id = metadata.message_id || null
      baseData.conversation_id = metadata.conversation_id || null
      break
    case 'message_reaction':
      // Make reactions behave like messages for routing/suppression in the app
      baseData.type = 'message'
      baseData.notification_subtype = 'reaction'
      baseData.reaction_emoji = metadata.emoji || metadata.reaction_emoji || null
      baseData.message_id = metadata.message_id || null
      baseData.conversation_id = metadata.conversation_id || null
      break
    case 'call':
      baseData.type = 'incoming_call'
      baseData.callId = metadata.call_id
      baseData.callType = metadata.call_type || 'audio'
      baseData.callerId = metadata.caller_id || notification.sender_id
      baseData.callerName = metadata.caller_name || notification.sender_name
      baseData.isIncoming = true
      break
    case 'like':
      baseData.post_id = metadata.post_id
      baseData.like_id = metadata.like_id
      break
    case 'comment':
      baseData.post_id = metadata.post_id
      baseData.comment_id = metadata.comment_id
      break
    case 'follow':
      baseData.follower_id = metadata.follower_id || notification.sender_id
      baseData.following_id = metadata.following_id || notification.recipient_id
      break
    case 'announcement':
      baseData.announcement_id = metadata.announcement_id
      baseData.priority = metadata.priority || 'normal'
      break
    case 'event_join':
      baseData.event_id = metadata.event_id
      baseData.event_title = metadata.event_title
      baseData.joiner_id = metadata.joiner_id || notification.sender_id
      baseData.joiner_name = metadata.joiner_name || notification.sender_name
      baseData.attendee_count = metadata.attendee_count || 0
      break
    case 'event':
      baseData.event_id = metadata.event_id
      baseData.event_title = metadata.event_title
      break
    case 'new_post':
      baseData.post_id = metadata.post_id
      baseData.post_content = metadata.post_content
      baseData.has_video = metadata.has_video || false
      baseData.has_images = metadata.has_images || false
      baseData.location = metadata.location
      baseData.mutual_follow = metadata.mutual_follow || false
      break
    case 'livestream':
      baseData.stream_id = metadata.stream_id
      baseData.streamer_id = metadata.streamer_id || notification.sender_id
      baseData.streamer_name = metadata.streamer_name || notification.sender_name
      baseData.stream_title = metadata.stream_title
      baseData.stream_description = metadata.stream_description
      baseData.channel_id = metadata.channel_id
      baseData.started_at = metadata.started_at
      break
    case 'profile_view':
      baseData.viewer_id = metadata.viewer_id || notification.sender_id
      baseData.viewer_name = metadata.viewer_name || notification.sender_name
      break
    case 'discover_like':
      baseData.liker_id = metadata.liker_id || notification.sender_id
      baseData.screen = 'discover'
      break
    case 'credit':
      baseData.credited_by_id = metadata.credited_by_id || notification.sender_id
      baseData.credited_by_name = metadata.credited_by_name || notification.sender_name
      baseData.credited_by_avatar = metadata.credited_by_avatar
      baseData.amount = metadata.amount
      break
    case 'friend_request_accepted':
      baseData.request_id = metadata.request_id
      break
  }

  const result: any = {
    data: baseData,
  }

  // Special handling for call notifications
  if (notification.notification_type === 'call') {
    result.ios = {
      sound: 'default',
      critical: true,
      interruptionLevel: 'critical',
      relevanceScore: 1.0,
      categoryIdentifier: 'incoming_call',
    }
    result.android = {
      channelId: 'critical_calls',
      priority: 'max',
      visibility: 'public',
      sound: 'default',
    }
  }

  return result
}

