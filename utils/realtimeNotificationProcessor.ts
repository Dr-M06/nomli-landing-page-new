import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { log, warn, error } from './productionLogger';


/**
 * Hybrid notification processor: Realtime + Polling fallback
 * Uses Realtime when available, falls back to polling every 5 seconds
 */
class RealtimeNotificationProcessor {
  private channel: RealtimeChannel | null = null;
  private isSubscribed = false;
  private processingQueue = new Set<string>(); // Track notifications being processed
  // Never remove IDs here - otherwise polling re-fetches old 'pending' rows and re-sends (loop)
  private processedNotifications = new Set<string>(); // Track successfully processed notifications
  private pollingInterval: NodeJS.Timeout | null = null;
  private useRealtime = true;
  private loggedNoTokenErrors = new Set<string>(); // Track which notifications we've already logged errors for
  private loggedNoTokenUsers = new Set<string>(); // Track which users we've already logged "no token" errors for

  /**
   * Start real-time notification processing with polling fallback
   */
  start(): void {
    // Try Realtime first
    this.startRealtime();
    
    // Always start polling as fallback (faster than before: 5 seconds instead of 30)
    this.startPolling();
  }

  /**
   * Start Realtime subscription (only for current user's notifications)
   */
  private startRealtime(): void {
    if (!this.useRealtime || this.isSubscribed) {
      return;
    }

    log('[RealtimeProcessor] 🔌 Starting Realtime subscription for notification_queue...');

    // Only subscribe for the current user's notifications - otherwise we receive EVERY user's
    // INSERT and process thousands, causing log flood and unnecessary Edge Function calls
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user?.id;
      if (!userId) {
        log('[RealtimeProcessor] No user session - skipping Realtime (polling will run when user logs in)');
        return;
      }
      if (this.isSubscribed) return;

      const filter = `recipient_id=eq.${userId}`;
      this.channel = supabase
        .channel('notification_queue_realtime', {
          config: {
            broadcast: { self: false },
            presence: { key: '' },
          },
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notification_queue',
            filter,
          },
          async (payload) => {
            const notification = payload.new as any;
            if (notification.status !== 'pending') {
              return;
            }
            // Avoid duplicate send: already processed or in progress in this session
            if (this.processingQueue.has(notification.id) || this.processedNotifications.has(notification.id)) {
              return;
            }
            log(`[RealtimeProcessor] 📨 Realtime notification received: ${notification.id}`);
            await this.processNotificationImmediately(notification);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.isSubscribed = true;
            log(`[RealtimeProcessor] ✅ Realtime subscription active (recipient_id=${userId})`);
          } else if (status === 'CHANNEL_ERROR') {
            warn('[RealtimeProcessor] ⚠️ Realtime channel error - falling back to polling');
            this.isSubscribed = false;
            this.useRealtime = false;
          } else if (status === 'TIMED_OUT') {
            warn('[RealtimeProcessor] ⚠️ Realtime subscription timed out - falling back to polling');
            this.isSubscribed = false;
            this.useRealtime = false;
          } else if (status === 'CLOSED') {
            warn('[RealtimeProcessor] ⚠️ Realtime subscription closed - falling back to polling');
            this.isSubscribed = false;
            this.useRealtime = false;
          } else {
            log(`[RealtimeProcessor] 📡 Realtime subscription status: ${status}`);
          }
        });
    }).catch((err) => {
      warn('[RealtimeProcessor] Failed to get session for Realtime filter:', err);
    });
  }

  /**
   * Start polling as fallback (slower during development to reduce memory pressure)
   */
  private startPolling(): void {
    if (this.pollingInterval) {
      return;
    }

    // Use faster interval for real-time feel: 2 seconds in production, 5 seconds in dev
    const pollInterval = __DEV__ ? 5000 : 2000; // 5 seconds in dev, 2 seconds in production
    
    log(`[RealtimeProcessor] 🔄 Starting polling fallback (interval: ${pollInterval}ms)`);
    
    // Process immediately on start
    this.processPendingNotifications();

    // Poll at appropriate interval
    this.pollingInterval = setInterval(() => {
      this.processPendingNotifications();
    }, pollInterval);
  }

  /**
   * Process pending notifications (polling fallback)
   */
  private async processPendingNotifications(): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        return; // Only poll for current user's notifications
      }

      // Polling window: must be long enough that a user who opens the app hours later still picks up
      // rows that never ran through Realtime (app killed, network blip, no server-side processor).
      // A 5-minute window caused pushes to sit in `pending` until something else ran — felt like "next day" delivery.
      // Rows are still gated by status=pending, attempts<3, and the Edge Function marks `sent` after success
      // so we don't re-send once the DB is updated. Cap at 7d to ignore abandoned queue junk.
      const oldestPending = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const query = supabase
        .from('notification_queue')
        .select('*')
        .eq('recipient_id', userId)
        .eq('status', 'pending')
        .lt('attempts', 3)
        .gte('created_at', oldestPending)
        .order('created_at', { ascending: true })
        .limit(20);

      const { data: pendingNotifications, error } = await query;

      if (error) {
        // Check if it's a network/API error (500, Cloudflare errors, etc.)
        const errorMessage = error.message || JSON.stringify(error);
        const isNetworkError = errorMessage.includes('500') || 
                              errorMessage.includes('Internal Server Error') ||
                              errorMessage.includes('cloudflare') ||
                              errorMessage.includes('html');
        
        if (!isNetworkError && __DEV__) {
          // Other errors (RLS, permissions, etc.) - log full error in dev mode only
          error('[RealtimeProcessor] Error fetching pending notifications:', error);
        }
        return;
      }

      if (!pendingNotifications || pendingNotifications.length === 0) {
        return; // No pending notifications
      }

      // Filter out notifications that are already processed, being processed, or skipped
      // Also double-check status in case Edge Function already updated it
      const notificationsToProcess = pendingNotifications.filter(
        (notification) => 
          notification.status === 'pending' && // Double-check status (not 'processing', 'sent', or 'skipped')
          !this.processingQueue.has(notification.id) && 
          !this.processedNotifications.has(notification.id)
      );

      if (notificationsToProcess.length === 0) {
        return; // All notifications already processed
      }

      // Silently process notifications - only log errors

      // Process each notification
      for (const notification of notificationsToProcess) {
        await this.processNotificationImmediately(notification);
      }
    } catch (error) {
      error('[RealtimeProcessor] Error in polling:', error);
    }
  }

  /**
   * Process a notification immediately when it's queued
   */
  private async processNotificationImmediately(notification: any): Promise<void> {
    const notificationId = notification.id;

    // Prevent duplicate processing
    if (this.processingQueue.has(notificationId) || this.processedNotifications.has(notificationId)) {
      return;
    }

    this.processingQueue.add(notificationId);

    try {
      // Check if notification has required data
      if (!notification.expo_push_token && !notification.fcm_token) {
        const userId = notification.recipient_id;
        
        // Try to get token from user's profile as fallback
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('expo_push_token, fcm_token')
            .eq('id', userId)
            .single();
          
          if (profile?.expo_push_token || profile?.fcm_token) {
            // Found token in profile - update notification and continue
            notification.expo_push_token = profile.expo_push_token || notification.expo_push_token;
            notification.fcm_token = profile.fcm_token || notification.fcm_token;
          } else {
            // No token found - mark as skipped and only log once per user
            if (!this.loggedNoTokenUsers.has(userId) && __DEV__) {
              this.loggedNoTokenUsers.add(userId);
              warn(`[RealtimeProcessor] ⚠️ No push token found for user ${userId} (notifications disabled or token not saved)`);
            }
            
            // Mark notification as skipped in database to prevent reprocessing
            await supabase
              .from('notification_queue')
              .update({ 
                status: 'skipped',
                processed_at: new Date().toISOString(),
              })
              .eq('id', notificationId);
            
            this.processingQueue.delete(notificationId);
            this.processedNotifications.add(notificationId);
            return;
          }
        } catch (profileError) {
          // If profile lookup fails, still mark as skipped to prevent spam
          if (!this.loggedNoTokenUsers.has(userId) && __DEV__) {
            this.loggedNoTokenUsers.add(userId);
            warn(`[RealtimeProcessor] ⚠️ Could not check profile for user ${userId}, skipping notification`);
          }
          
          await supabase
            .from('notification_queue')
            .update({ 
              status: 'skipped',
              processed_at: new Date().toISOString(),
            })
            .eq('id', notificationId);
          
          this.processingQueue.delete(notificationId);
          this.processedNotifications.add(notificationId);
          return;
        }
      }

      // Get notification title/body for logging (Edge Function handles actual payload building)
      const title = this.getNotificationTitle(notification);
      const body = this.getNotificationBody(notification);

      // Call Edge Function which handles Expo → FCM → OneSignal fallback
      // This is the same approach as the old working build
      const { data, error } = await supabase.functions.invoke('process-notifications', {
        body: { notification_id: notificationId },
      });

      if (error) {
        error(`[RealtimeProcessor] ❌ Edge Function error for ${notificationId}:`, error);

        // Profile views: in-app only, never send push (like TikTok)
        if (notification.notification_type === 'profile_view') {
          this.processedNotifications.add(notificationId);
          this.processingQueue.delete(notificationId);
          return;
        }

        // If Edge Function fails, try direct Expo as fallback (for backwards compatibility)
        if (notification.expo_push_token) {
          try {
            const expoPayload = {
              to: notification.expo_push_token,
              sound: 'default',
              title,
              body,
              data: {
                type: notification.notification_type,
                sender_id: notification.sender_id,
                message_id: notification.message_id || null,
                conversation_id: notification.conversation_id || null,
              },
              badge: 1,
              priority: notification.notification_type === 'call' ? 'high' : 'default',
              channelId: notification.notification_type === 'call' ? 'calls' : 'default',
            };

            const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(expoPayload),
            });

            const expoResult = await expoResponse.json();
            
            if (expoResult.data && expoResult.data[0] && expoResult.data[0].status === 'ok') {
              await supabase
                .from('notification_queue')
                .update({ 
                  processed_at: new Date().toISOString(),
                  status: 'sent'
                })
                .eq('id', notificationId);

              this.processedNotifications.add(notificationId);
              setTimeout(() => this.processingQueue.delete(notificationId), 2000);
              return;
            } else {
              if (__DEV__) {
                error(`[RealtimeProcessor] ❌ Fallback Expo also failed for ${notificationId}:`, expoResult);
              }
            }
          } catch (expoError) {
            if (__DEV__) {
              error(`[RealtimeProcessor] ❌ Fallback Expo exception for ${notificationId}:`, expoError);
            }
          }
        }
        
        // If both Edge Function and fallback failed, mark as failed
        this.processingQueue.delete(notificationId);
        return;
      }

      // Edge Function succeeded (processed > 0 or already processed/sent idempotent)
      if (data && (data.processed > 0 || data.message === 'Notification already processed' || data.message === 'Notification already sent')) {
        this.processedNotifications.add(notificationId);
        setTimeout(() => this.processingQueue.delete(notificationId), 2000);
        return;
      }

      // Edge Function ran but failed to send (e.g. no tokens / all services failed): try client fallback
      // Skip fallback for profile_view - in-app only (no push), like TikTok
      if (data && data.failed > 0 && data.processed === 0 && notification.expo_push_token && notification.notification_type !== 'profile_view') {
        try {
          const meta = notification.metadata || {};
          const expoPayload = {
            to: notification.expo_push_token,
            sound: 'default',
            title,
            body,
            data: {
              type: notification.notification_type,
              sender_id: notification.sender_id,
              message_id: notification.message_id || null,
              conversation_id: notification.conversation_id || null,
              post_id: meta.post_id || notification.post_id || null,
              title,
              body,
            },
            badge: 1,
            priority: notification.notification_type === 'call' ? 'high' : 'default',
            channelId: notification.notification_type === 'call' ? 'calls' : 'default',
          };
          const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(expoPayload),
          });
          const expoResult = await expoResponse.json();
          if (expoResult.data?.[0]?.status === 'ok') {
            await supabase
              .from('notification_queue')
              .update({ processed_at: new Date().toISOString(), status: 'sent' })
              .eq('id', notificationId);
            this.processedNotifications.add(notificationId);
            setTimeout(() => this.processingQueue.delete(notificationId), 2000);
            return;
          }
        } catch (fallbackErr) {
          if (__DEV__) warn(`[RealtimeProcessor] Fallback Expo failed for ${notificationId}:`, fallbackErr);
        }
      }

      if (__DEV__ && data) {
        warn(`[RealtimeProcessor] ⚠️ Edge Function returned unexpected response for ${notificationId}:`, data);
      }
      // Mark as "processed" so duplicate realtime events don't trigger a second send.
      // Also set status = 'sent' in DB so polling (or another session) never re-fetches this row.
      try {
        await supabase
          .from('notification_queue')
          .update({ status: 'sent', processed_at: new Date().toISOString() })
          .eq('id', notificationId);
      } catch (_) { /* ignore */ }
      this.processedNotifications.add(notificationId);
      this.processingQueue.delete(notificationId);
    } catch (error) {
      error(`[RealtimeProcessor] ❌ Exception processing ${notificationId}:`, error);
      this.processingQueue.delete(notificationId);
    }
  }

  /**
   * Get notification title based on type (used when Edge Function fallback sends push)
   */
  private getNotificationTitle(notification: any): string {
    const meta = notification.metadata || {};
    const senderName = meta.sender_name || notification.sender_name || 'Someone';

    switch (notification.notification_type) {
      case 'message':
        return `New message from ${senderName}`;
      case 'call':
        const callType = notification.call_type === 'video' ? 'Video' : 'Voice';
        return `${callType} call from ${senderName}`;
      case 'reaction':
      case 'message_reaction':
        return `${senderName} reacted to your message`;
      case 'comment':
        return `${senderName} commented on your post`;
      case 'event_join':
        return `${senderName} joined your event`;
      case 'like':
        return `${senderName} liked your post`;
      case 'follow':
        return `${senderName} started following you`;
      case 'profile_view': {
        const viewerName = meta.viewer_name || senderName;
        return `${viewerName} viewed your profile`;
      }
      case 'new_post': {
        const hasVideo = meta.has_video === true;
        const hasImages = meta.has_images === true;
        if (hasVideo) return `${senderName} shared a new video`;
        if (hasImages) return `${senderName} shared a new photo`;
        return `${senderName} shared a new post`;
      }
      case 'discover_like':
        return 'Someone liked your profile';
      default:
        return senderName !== 'Someone' ? `Update from ${senderName}` : 'New notification';
    }
  }

  /**
   * Get notification body based on type (used when Edge Function fallback sends push)
   */
  private getNotificationBody(notification: any): string {
    const meta = notification.metadata || {};
    const senderName = meta.sender_name || notification.sender_name || 'Someone';

    // Special-case message reactions so the body can include the emoji + preview
    if (notification.notification_type === 'message_reaction') {
      const emoji = meta.emoji || meta.reaction_emoji || '❤️';
      const preview = meta.message_preview || notification.message_content || '';
      const truncated = preview.length > 80 ? preview.substring(0, 80) + '...' : preview;
      return truncated ? `${emoji} "${truncated}"` : `${emoji} Reacted to your message`;
    }

    // new_post: use context (video/photo/text) and name
    if (notification.notification_type === 'new_post') {
      const hasVideo = meta.has_video === true;
      const hasImages = meta.has_images === true;
      const postContent = meta.post_content || notification.message_content || '';
      const preview = postContent && postContent.trim().length > 0
        ? (postContent.length > 80 ? postContent.substring(0, 80).trim() + '...' : postContent.trim())
        : '';
      if (hasVideo) return `${senderName} shared a new video • Tap to watch`;
      if (hasImages) return `${senderName} shared a new photo • Tap to view`;
      if (preview) return preview;
      return `${senderName} shared a new post • Tap to view`;
    }

    if (notification.message_content) {
      return notification.message_content.length > 100
        ? notification.message_content.substring(0, 100) + '...'
        : notification.message_content;
    }

    switch (notification.notification_type) {
      case 'call':
        return 'Tap to answer';
      case 'reaction':
        return notification.reaction_type || '❤️';
      case 'comment':
        return 'Check out the comment';
      case 'event_join':
        return 'Check who joined';
      case 'like':
        return 'Tap to view';
      case 'follow':
        return 'Tap to view their profile';
      case 'profile_view':
        return `${senderName} viewed your profile • Tap to see who`;
      case 'discover_like':
        return 'Tap to see who in Discover';
      default:
        return senderName !== 'Someone' ? 'Tap to view' : 'You have a new notification';
    }
  }

  /**
   * Stop real-time notification processing
   */
  stop(): void {
    
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
      this.isSubscribed = false;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.processingQueue.clear();
    // Clear processed notifications after a delay to allow cleanup
    setTimeout(() => {
      this.processedNotifications.clear();
    }, 5000);
    // Silently stopped
  }
}

// Singleton instance
let realtimeProcessorInstance: RealtimeNotificationProcessor | null = null;

/**
 * Start real-time notification processing
 */
export const startRealtimeNotificationProcessor = (): RealtimeNotificationProcessor => {
  if (!realtimeProcessorInstance) {
    realtimeProcessorInstance = new RealtimeNotificationProcessor();
  }
  realtimeProcessorInstance.start();
  return realtimeProcessorInstance;
};

/**
 * Stop real-time notification processing
 */
export const stopRealtimeNotificationProcessor = (): void => {
  if (realtimeProcessorInstance) {
    realtimeProcessorInstance.stop();
    realtimeProcessorInstance = null;
  }
};

