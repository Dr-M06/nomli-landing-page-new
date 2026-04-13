import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Server-side notification processor
 * This should be called from a server or scheduled job
 * to process notifications when the app is closed
 */
export class ServerNotificationProcessor {
  private static instance: ServerNotificationProcessor;
  private isProcessing = false;

  static getInstance(): ServerNotificationProcessor {
    if (!ServerNotificationProcessor.instance) {
      ServerNotificationProcessor.instance = new ServerNotificationProcessor();
    }
    return ServerNotificationProcessor.instance;
  }

  /**
   * Process all pending notifications
   */
  async processAllPendingNotifications(): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) {
      log('⚠️ Notification processor already running, skipping...');
      return { processed: 0, failed: 0 };
    }

    this.isProcessing = true;
    log('🔄 [ServerProcessor] Starting notification processing...');

    try {
      // Get pending notifications
      const { data: pendingNotifications, error: fetchError } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('status', 'pending')
        .lt('attempts', 3)
        .order('created_at', { ascending: true })
        .limit(50);

      if (fetchError) {
        error('❌ [ServerProcessor] Error fetching notifications:', fetchError);
        return { processed: 0, failed: 0 };
      }

      if (!pendingNotifications || pendingNotifications.length === 0) {
        log('✅ [ServerProcessor] No pending notifications');
        return { processed: 0, failed: 0 };
      }

      log(`📱 [ServerProcessor] Processing ${pendingNotifications.length} notifications...`);

      let processedCount = 0;
      let failedCount = 0;

      // Process each notification
      for (const notification of pendingNotifications) {
        try {
          const success = await this.processSingleNotification(notification);
          if (success) {
            processedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          error(`❌ [ServerProcessor] Error processing notification ${notification.id}:`, error);
          await this.markNotificationAsFailed(notification.id, error.message);
          failedCount++;
        }
      }

      log(`✅ [ServerProcessor] Processed ${processedCount} notifications, ${failedCount} failed`);
      return { processed: processedCount, failed: failedCount };

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single notification
   */
  private async processSingleNotification(notification: any): Promise<boolean> {
    log(`📤 [ServerProcessor] Processing notification ${notification.id}`);

    // Prepare notification data
    const notificationData = {
      to: notification.expo_push_token,
      sound: 'default',
      title: this.getNotificationTitle(notification),
      body: this.getNotificationBody(notification),
      data: {
        type: notification.notification_type,
        sender_id: notification.sender_id,
        message_id: notification.metadata?.message_id || null,
        conversation_id: notification.metadata?.conversation_id || null,
      },
      badge: 1,
    };

    // Send push notification via Expo
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notificationData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.data && result.data[0] && result.data[0].status === 'ok') {
      // Mark as sent
      await this.markNotificationAsSent(notification.id);
      log(`✅ [ServerProcessor] Notification ${notification.id} sent successfully`);
      return true;
    } else {
      throw new Error(`Expo API error: ${JSON.stringify(result)}`);
    }
  }

  /**
   * Mark notification as sent
   */
  private async markNotificationAsSent(notificationId: string): Promise<void> {
    await supabase
      .from('notification_queue')
      .update({ 
        status: 'sent', 
        processed_at: new Date().toISOString() 
      })
      .eq('id', notificationId);
  }

  /**
   * Mark notification as failed
   */
  private async markNotificationAsFailed(notificationId: string, errorMessage: string): Promise<void> {
    await supabase
      .from('notification_queue')
      .update({ 
        status: 'failed',
        error_message: errorMessage,
        processed_at: new Date().toISOString()
      })
      .eq('id', notificationId);
  }

  /**
   * Get notification title
   */
  private getNotificationTitle(notification: any): string {
    switch (notification.notification_type) {
      case 'message':
        return `${notification.sender_name} sent you a message`;
      case 'call':
        return `Incoming call from ${notification.sender_name}`;
      default:
        return 'New notification';
    }
  }

  /**
   * Get notification body
   */
  private getNotificationBody(notification: any): string {
    switch (notification.notification_type) {
      case 'message':
        return notification.message_content || 'You have a new message';
      case 'call':
        return 'Tap to answer';
      default:
        return 'You have a new notification';
    }
  }

  /**
   * Start periodic processing (for testing)
   */
  startPeriodicProcessing(intervalMs: number = 30000): NodeJS.Timeout {
    log(`🔄 [ServerProcessor] Starting periodic processing every ${intervalMs}ms`);
    return setInterval(() => {
      this.processAllPendingNotifications();
    }, intervalMs);
  }

  /**
   * Stop periodic processing
   */
  stopPeriodicProcessing(intervalId: NodeJS.Timeout): void {
    log('🛑 [ServerProcessor] Stopping periodic processing');
    clearInterval(intervalId);
  }
}

// Export singleton instance
export const serverNotificationProcessor = ServerNotificationProcessor.getInstance();
