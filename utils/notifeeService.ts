// Temporarily using mock while Notifee native module is disabled
import notifee, { AndroidImportance, EventType } from './notifeeServiceMock';
import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { log, warn, error } from './productionLogger';


class NotifeeService {
  private static instance: NotifeeService;
  private isInitialized = false;

  public static getInstance(): NotifeeService {
    if (!NotifeeService.instance) {
      NotifeeService.instance = new NotifeeService();
    }
    return NotifeeService.instance;
  }

  /**
   * Initialize Notifee service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      log('[NotifeeService] Already initialized');
      return;
    }

    try {
      log('[NotifeeService] Initializing Notifee service...');
      
      // Create notification channels for Android
      await this.createChannels();
      
      // Set up notification action handlers
      this.setupActionHandlers();
      
      // Set up FCM display handler
      this.setupFCMDisplayHandler();
      
      this.isInitialized = true;
      log('[NotifeeService] Notifee service initialized successfully');
    } catch (error) {
      error('[NotifeeService] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Create notification channels for Android
   */
  private async createChannels(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      log('[NotifeeService] Creating notification channels...');

      // Critical calls channel with full-screen intent
      await notifee.createChannel({
        id: 'critical_calls',
        name: 'Incoming Calls',
        importance: AndroidImportance.HIGH,
        sound: 'ringtone', // Use device ringtone for calls
        vibration: true,
        vibrationPattern: [300, 500],
      });

      // Default channel
      await notifee.createChannel({
        id: 'default',
        name: 'Default Notifications',
        importance: AndroidImportance.DEFAULT,
        sound: 'default',
      });

      log('[NotifeeService] Notification channels created');
    } catch (error) {
      error('[NotifeeService] Error creating channels:', error);
    }
  }

  /**
   * Set up FCM display handler to show notifications with Notifee
   * Note: Background message handler is now set up in index.js
   */
  private setupFCMDisplayHandler(): void {
    log('[NotifeeService] FCM display handler setup (background handler is in index.js)');
    // Background message handler must be registered outside of any component lifecycle
    // See index.js for the actual implementation
  }

  /**
   * Display a call notification with action buttons
   */
  public async displayCallNotification(payload: {
    title: string;
    body: string;
    data: any;
  }): Promise<string> {
    try {
      log('[NotifeeService] Displaying call notification:', payload);

      const notificationId = await notifee.displayNotification({
        title: payload.title,
        body: payload.body,
        data: payload.data,
        android: {
          channelId: 'critical_calls',
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: '📞 Answer',
              pressAction: {
                id: 'answer',
                launchActivity: 'default',
              },
            },
            {
              title: '❌ Decline',
              pressAction: {
                id: 'decline',
              },
            },
          ],
          sound: 'ringtone', // Use device ringtone for calls
          vibrationPattern: [300, 500],
          fullScreenAction: {
            id: 'default',
            launchActivity: 'default',
          },
          category: 'call',
          ongoing: true, // Make it persistent until answered/declined
        },
        ios: {
          categoryId: 'incoming_call',
          sound: 'call-ringtone.mp3', // Use custom ringtone sound
          critical: true,
          criticalVolume: 1.0,
        },
      });

      log('[NotifeeService] Call notification displayed:', notificationId);
      return notificationId;
    } catch (error) {
      error('[NotifeeService] Error displaying call notification:', error);
      throw error;
    }
  }

  /**
   * Set up notification action handlers
   */
  private setupActionHandlers(): void {
    log('[NotifeeService] Setting up action handlers...');

    // Handle foreground events
    notifee.onForegroundEvent(async ({ type, detail }) => {
      log('[NotifeeService] Foreground event:', type, detail);

      if (type === EventType.ACTION_PRESS) {
        const { pressAction, notification } = detail;
        
        if (pressAction?.id === 'answer') {
          log('[NotifeeService] Answer button pressed');
          await this.handleAnswerCall(notification?.data);
          
          // Remove the notification
          if (notification?.id) {
            await notifee.cancelNotification(notification.id);
          }
        } else if (pressAction?.id === 'decline') {
          log('[NotifeeService] Decline button pressed');
          await this.handleDeclineCall(notification?.data);
          
          // Remove the notification
          if (notification?.id) {
            await notifee.cancelNotification(notification.id);
          }
        }
      } else if (type === EventType.PRESS) {
        log('[NotifeeService] Notification pressed - opening app');
        // Notification body pressed - open the app
        const { notification } = detail;
        if (notification?.data?.type === 'incoming_call') {
          await this.handleAnswerCall(notification.data);
        }
      }
    });

    // Handle background events
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      log('[NotifeeService] Background event:', type, detail);

      if (type === EventType.ACTION_PRESS) {
        const { pressAction, notification } = detail;
        
        if (pressAction?.id === 'answer') {
          log('[NotifeeService] Answer button pressed (background)');
          await this.handleAnswerCall(notification?.data);
          
          // Remove the notification
          if (notification?.id) {
            await notifee.cancelNotification(notification.id);
          }
        } else if (pressAction?.id === 'decline') {
          log('[NotifeeService] Decline button pressed (background)');
          await this.handleDeclineCall(notification?.data);
          
          // Remove the notification
          if (notification?.id) {
            await notifee.cancelNotification(notification.id);
          }
        }
      }
    });

    log('[NotifeeService] Action handlers set up successfully');
  }

  /**
   * Handle answer call action
   */
  private async handleAnswerCall(data: any): Promise<void> {
    try {
      log('[NotifeeService] Handling answer call:', data);
      
      // Import dynamically to avoid circular dependencies
      const { supabase } = await import('./supabase');
      
      const callId = data?.callId || data?.call_id;
      
      if (!callId) {
        error('[NotifeeService] No call ID provided');
        return;
      }

      // Update call status to accepted
      const { error } = await supabase
        .from('call_notifications')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', callId);

      if (error) {
        error('[NotifeeService] Error updating call status:', error);
      } else {
        log('[NotifeeService] Call accepted successfully');
      }
    } catch (error) {
      error('[NotifeeService] Error handling answer call:', error);
    }
  }

  /**
   * Handle decline call action
   */
  private async handleDeclineCall(data: any): Promise<void> {
    try {
      log('[NotifeeService] Handling decline call:', data);
      
      // Import dynamically to avoid circular dependencies
      const { supabase } = await import('./supabase');
      
      const callId = data?.callId || data?.call_id;
      
      if (!callId) {
        error('[NotifeeService] No call ID provided');
        return;
      }

      // Update call status to declined
      const { error } = await supabase
        .from('call_notifications')
        .update({
          status: 'declined',
          updated_at: new Date().toISOString(),
        })
        .eq('id', callId);

      if (error) {
        error('[NotifeeService] Error updating call status:', error);
      } else {
        log('[NotifeeService] Call declined successfully');
      }
    } catch (error) {
      error('[NotifeeService] Error handling decline call:', error);
    }
  }

  /**
   * Cancel all notifications
   */
  public async cancelAllNotifications(): Promise<void> {
    try {
      await notifee.cancelAllNotifications();
      log('[NotifeeService] All notifications cancelled');
    } catch (error) {
      error('[NotifeeService] Error cancelling notifications:', error);
    }
  }

  /**
   * Cancel a specific notification
   */
  public async cancelNotification(notificationId: string): Promise<void> {
    try {
      await notifee.cancelNotification(notificationId);
      log('[NotifeeService] Notification cancelled:', notificationId);
    } catch (error) {
      error('[NotifeeService] Error cancelling notification:', error);
    }
  }
}

export const notifeeService = NotifeeService.getInstance();

