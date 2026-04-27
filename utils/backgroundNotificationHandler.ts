import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


interface BackgroundNotificationData {
  type: 'call' | 'message' | 'event' | 'general';
  userId?: string;
  senderId?: string;
  senderName?: string;
  message?: string;
  callId?: string;
  callType?: 'video' | 'audio';
  eventId?: string;
  eventName?: string;
  [key: string]: any;
}

class BackgroundNotificationHandler {
  private isInitialized = false;
  private notificationListeners: any[] = [];

  /**
   * Initialize background notification handling
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Set up background notification handlers (without requesting permissions)
      this.setupBackgroundHandlers();

      // Set up app state change handlers
      this.setupAppStateHandlers();

      this.isInitialized = true;
      log('[BackgroundNotification] Handler initialized successfully (permissions handled by ExpoNotificationManager)');
    } catch (error) {
      error('[BackgroundNotification] Initialization failed:', error);
    }
  }

  /**
   * Set up background notification handlers
   */
  private setupBackgroundHandlers(): void {
    // Handle notifications received while app is in background/closed
    const receivedListener = Notifications.addNotificationReceivedListener(async (notification) => {
      const data: any = notification.request?.content?.data || {};
      // Quietly handle badge-only pings to avoid log spam and redundant updates
      if (data?.type === 'badge') {
        // Throttle: no need to log/process repeatedly; badgeCounter handles setBadge internally
        return;
      }
      log('[BackgroundNotification] Received while app in background:', notification);
      
      // Handle notification asynchronously so it doesn't block the notification from displaying
      setTimeout(() => {
        this.handleBackgroundNotification(notification).catch(error => {
          error('[BackgroundNotification] Error in handleBackgroundNotification:', error);
        });
      }, 100);
    });

    // Handle notification responses (user tapped notification)
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      log('[BackgroundNotification] User responded to notification:', response);
      this.handleNotificationResponse(response);
    });

    this.notificationListeners.push(receivedListener, responseListener);
  }

  /**
   * Set up app state change handlers
   */
  private setupAppStateHandlers(): void {
    AppState.addEventListener('change', (nextAppState) => {
      log('[BackgroundNotification] App state changed to:', nextAppState);
      
      if (nextAppState === 'active') {
        // App came to foreground, check for missed notifications
        this.handleAppBecameActive();
      } else if (nextAppState === 'background') {
        // App went to background, ensure notifications are working
        this.handleAppWentToBackground();
      }
    });
  }

  /**
   * Handle background notification
   */
  private async handleBackgroundNotification(notification: Notifications.Notification): Promise<void> {
    try {
      const data = notification.request.content.data as BackgroundNotificationData;
      
      // CRITICAL: Ignore notifications we created locally (sendBackgroundNotification) to prevent infinite loop.
      // When we re-broadcast a push as a local notification, it would trigger this handler again.
      if (data?._internalLocal) {
        return;
      }
      
      // Handle both 'call' and 'incoming_call' types
      if (data.type === 'call' || data.type === 'incoming_call') {
        await this.handleCallNotification(data);
        return;
      }
      
      switch (data.type) {
        case 'message':
          await this.handleMessageNotification(data);
          break;
        case 'event':
          await this.handleEventNotification(data);
          break;
        case 'general':
          await this.handleGeneralNotification(data);
          break;
        default:
          log('[BackgroundNotification] Unknown notification type:', data.type);
      }
    } catch (error) {
      error('[BackgroundNotification] Error handling background notification:', error);
    }
  }

  /**
   * Handle call notification
   */
  private async handleCallNotification(_data: BackgroundNotificationData): Promise<void> {
    log('[BackgroundNotification] Ignoring call payload (voice/video calls removed from app)');
  }

  /**
   * Show a local notification (used when re-broadcasting message/event payloads in background).
   */
  private async scheduleLocalNotification(
    title: string,
    body: string,
    data: Record<string, unknown>,
    channelId: string = 'background_sync'
  ): Promise<void> {
    try {
      const notificationContent: Record<string, unknown> = {
        title,
        body,
        data,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
        categoryIdentifier: 'background_notification',
      };

      if (Platform.OS === 'android') {
        notificationContent.android = {
          channelId,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          visibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          lights: {
            color: '#19444d',
            onMs: 500,
            offMs: 500,
          },
        };
      } else if (Platform.OS === 'ios') {
        notificationContent.ios = {
          sound: 'default',
          critical: false,
          interruptionLevel: 'active',
          relevanceScore: 0.5,
          targetContentIdentifier: (data.id as string) || 'background_notification',
          threadIdentifier: (data.type as string) || 'general',
          summaryArgument: (data.senderName as string) || 'Notification',
          summaryArgumentCount: 1,
          categoryIdentifier: 'background_notification',
          badge: 1,
        };
      }

      await Notifications.scheduleNotificationAsync({
        content: notificationContent as Notifications.NotificationContentInput,
        trigger: null,
      });
    } catch (e) {
      error('[BackgroundNotification] scheduleLocalNotification failed:', e);
    }
  }

  /**
   * Handle message notification
   */
  private async handleMessageNotification(data: BackgroundNotificationData): Promise<void> {
    if (data.senderName && data.message) {
      // Mark as internal so we don't re-process it and cause an infinite loop
      const dataWithFlag = { ...data, _internalLocal: true };
      await this.scheduleLocalNotification(
        `New message from ${data.senderName}`,
        data.message,
        dataWithFlag,
        'chat_messages'
      );
    }
  }

  /**
   * Handle event notification
   */
  private async handleEventNotification(data: BackgroundNotificationData): Promise<void> {
    if (data.eventName) {
      const dataWithFlag = { ...data, _internalLocal: true };
      await this.scheduleLocalNotification(
        `Event Update: ${data.eventName}`,
        data.message || 'You have an event update',
        dataWithFlag,
        'background_sync'
      );
    }
  }

  /**
   * Handle general notification
   */
  private async handleGeneralNotification(data: BackgroundNotificationData): Promise<void> {
    const dataWithFlag = { ...data, _internalLocal: true };
    await this.scheduleLocalNotification(
      data.title || 'Notification',
      data.message || 'You have a new notification',
      dataWithFlag,
      'background_sync'
    );
  }

  /**
   * Handle notification response
   */
  private async handleNotificationResponse(response: Notifications.NotificationResponse): Promise<void> {
    const { actionIdentifier, notification } = response;
    const data = notification.request.content.data as BackgroundNotificationData;

    log('[BackgroundNotification] User action:', actionIdentifier, 'for type:', data.type);

    // Handle different notification types
    switch (data.type) {
      case 'call':
      case 'incoming_call':
        await this.handleCallResponse(actionIdentifier, data);
        break;
      case 'message':
        await this.handleMessageResponse(actionIdentifier, data);
        break;
      case 'event':
        await this.handleEventResponse(actionIdentifier, data);
        break;
      default:
        log('[BackgroundNotification] No specific handler for type:', data.type);
    }
  }

  /**
   * Handle call notification response
   */
  private async handleCallResponse(actionIdentifier: string, data: BackgroundNotificationData): Promise<void> {
    log('[BackgroundNotification] Call notification action ignored (calls removed):', actionIdentifier, data?.callId);
  }

  /**
   * Handle message notification response
   */
  private async handleMessageResponse(actionIdentifier: string, data: BackgroundNotificationData): Promise<void> {
    // Navigate to chat screen
    log('[BackgroundNotification] Opening chat with:', data.senderId);
    // You would navigate to your chat screen here
  }

  /**
   * Handle event notification response
   */
  private async handleEventResponse(actionIdentifier: string, data: BackgroundNotificationData): Promise<void> {
    // Navigate to event screen
    log('[BackgroundNotification] Opening event:', data.eventId);
    // You would navigate to your event screen here
  }

  /**
   * Handle app became active
   */
  private async handleAppBecameActive(): Promise<void> {
    try {
      // Check for missed notifications or updates
      log('[BackgroundNotification] App became active, checking for updates');
      
      // You could fetch missed notifications from your backend here
      // and show them to the user
    } catch (error) {
      error('[BackgroundNotification] Error handling app became active:', error);
    }
  }

  /**
   * Handle app went to background
   */
  private async handleAppWentToBackground(): Promise<void> {
    try {
      // Ensure notification services are running
      log('[BackgroundNotification] App went to background, ensuring notifications are active');
      
      // You could start background tasks here if needed
    } catch (error) {
      error('[BackgroundNotification] Error handling app went to background:', error);
    }
  }

  /**
   * Send a background notification to a specific user
   */
  async sendNotificationToUser(
    userId: string,
    notificationData: BackgroundNotificationData
  ): Promise<boolean> {
    try {
      // Get user's push token
      const { data: user, error } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', userId)
        .single();

      if (error || !user?.expo_push_token) {
        error('[BackgroundNotification] No push token for user:', userId);
        return false;
      }

      // Send push notification
      const message = {
        to: user.expo_push_token,
        sound: 'default',
        title: notificationData.title || 'Notification',
        body: notificationData.message || 'You have a new notification',
        data: notificationData,
        priority: 'high',
        channelId: this.getChannelIdForType(notificationData.type),
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();
      
      if (result.data && result.data[0] && result.data[0].status === 'ok') {
        log('[BackgroundNotification] Notification sent successfully to user:', userId);
        return true;
      } else {
        error('[BackgroundNotification] Failed to send notification:', result);
        return false;
      }
    } catch (error) {
      error('[BackgroundNotification] Error sending notification to user:', error);
      return false;
    }
  }

  /**
   * Get channel ID for notification type
   */
  private getChannelIdForType(type: string): string {
    switch (type) {
      case 'call':
      case 'incoming_call':
        return 'default';
      case 'message':
        return 'chat_messages';
      case 'event':
      case 'general':
      default:
        return 'background_sync';
    }
  }

  /**
   * Clean up listeners
   */
  cleanup(): void {
    this.notificationListeners.forEach(listener => {
      listener.remove();
    });
    this.notificationListeners = [];
    this.isInitialized = false;
  }
}

// Export singleton instance
export const backgroundNotificationHandler = new BackgroundNotificationHandler();
export default backgroundNotificationHandler;
