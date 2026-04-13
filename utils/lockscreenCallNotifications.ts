import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


interface CallNotificationData {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callType: 'video' | 'audio';
  isIncoming: boolean;
}

class LockscreenCallNotificationService {
  private isInitialized = false;

  /**
   * Initialize the lockscreen call notification service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Request critical permissions for lockscreen notifications
      await this.requestCriticalPermissions();
      
      // Set up notification channels with lockscreen support
      await this.setupLockscreenNotificationChannels();
      
      // Configure notification handlers
      this.setupNotificationHandlers();
      
      this.isInitialized = true;
      log('[LockscreenCall] Service initialized successfully');
    } catch (error) {
      error('[LockscreenCall] Initialization failed:', error);
    }
  }

  /**
   * Request critical permissions for lockscreen and background notifications
   */
  private async requestCriticalPermissions(): Promise<void> {
    try {
      // Request notification permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowAnnouncements: true,
            allowCriticalAlerts: true, // Critical for lockscreen
            provideAppNotificationSettings: true,
            allowProvisional: false,
          },
          android: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowVibrate: true,
            allowShowWhenLocked: true, // Critical for lockscreen
            allowDisplayOverOtherApps: true, // For full-screen intents
          },
        });
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        throw new Error('Notification permissions not granted');
      }

      // Request additional iOS permissions for critical alerts
      if (Platform.OS === 'ios') {
        try {
          // Request critical alert permission (iOS 12+)
          const criticalAlertStatus = await Notifications.requestPermissionsAsync({
            ios: {
              allowCriticalAlerts: true,
            },
          });
          log('[LockscreenCall] Critical alert permission status:', criticalAlertStatus.status);
        } catch (error) {
          warn('[LockscreenCall] Critical alert permission not available:', error);
        }
      }

      log('[LockscreenCall] Permissions granted');
    } catch (error) {
      error('[LockscreenCall] Permission request failed:', error);
      throw error;
    }
  }

  /**
   * Set up notification channels optimized for lockscreen display
   */
  private async setupLockscreenNotificationChannels(): Promise<void> {
    if (Platform.OS === 'android') {
      // Critical call channel with maximum visibility
      await Notifications.setNotificationChannelAsync('critical_calls', {
        name: 'Critical Calls',
        description: 'Incoming video and audio calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 1000, 500, 1000, 500, 1000], // Long ring pattern
        lightColor: '#FF0000', // Red for urgency
        sound: 'ringtone', // Use device ringtone for calls
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true, // Bypass Do Not Disturb
        enableLights: true,
        enableVibrate: true,
        groupId: 'calls',
        groupName: 'Calls',
        groupDescription: 'All call notifications',
        // Group alert behavior removed - may not be supported in current expo-notifications version
      });

      // Background sync channel for reliable delivery
      await Notifications.setNotificationChannelAsync('background_sync', {
        name: 'Background Sync',
        description: 'Background notification delivery',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#19444d',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      });

      // Chat messages channel
      await Notifications.setNotificationChannelAsync('chat_messages', {
        name: 'Chat Messages',
        description: 'New chat message notifications',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#19444d',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      });
    }

    // iOS categories for actionable notifications
    await this.setupIosCallCategories();
  }

  /**
   * Set up iOS notification categories for call actions
   */
  private async setupIosCallCategories(): Promise<void> {
    if (Platform.OS === 'ios') {
      // Incoming call category with full-screen actions
      await Notifications.setNotificationCategoryAsync('incoming_call', [
        {
          identifier: 'answer_call',
          buttonTitle: 'Answer',
          options: {
            isDestructive: false,
            isAuthenticationRequired: false,
            opensAppToForeground: true,
          },
        },
        {
          identifier: 'decline_call',
          buttonTitle: 'Decline',
          options: {
            isDestructive: true,
            isAuthenticationRequired: false,
            opensAppToForeground: false,
          },
        },
      ], {
        intentIdentifiers: [],
        hiddenPreviewsBodyPlaceholder: 'Incoming call',
        categorySummaryFormat: '%u more calls',
        customDismissAction: true,
        allowInCarPlay: true,
        allowAnnouncement: true,
        showTitle: true,
        showSubtitle: true,
        showBody: true,
      });

      // Missed call category
      await Notifications.setNotificationCategoryAsync('missed_call', [
        {
          identifier: 'call_back',
          buttonTitle: 'Call Back',
          options: {
            isDestructive: false,
            isAuthenticationRequired: false,
            opensAppToForeground: true,
          },
        },
      ], {
        intentIdentifiers: [],
        hiddenPreviewsBodyPlaceholder: 'Missed call',
        customDismissAction: true,
        allowInCarPlay: true,
        allowAnnouncement: true,
        showTitle: true,
        showSubtitle: true,
        showBody: true,
      });

      // Background notification category
      await Notifications.setNotificationCategoryAsync('background_notification', [
        {
          identifier: 'open_app',
          buttonTitle: 'Open',
          options: {
            isDestructive: false,
            isAuthenticationRequired: false,
            opensAppToForeground: true,
          },
        },
      ], {
        intentIdentifiers: [],
        hiddenPreviewsBodyPlaceholder: 'New notification',
        customDismissAction: true,
        allowInCarPlay: true,
        allowAnnouncement: true,
        showTitle: true,
        showSubtitle: true,
        showBody: true,
      });

      // Chat message category
      await Notifications.setNotificationCategoryAsync('chat_message', [
        {
          identifier: 'reply',
          buttonTitle: 'Reply',
          options: {
            isDestructive: false,
            isAuthenticationRequired: false,
            opensAppToForeground: true,
          },
        },
        {
          identifier: 'mark_read',
          buttonTitle: 'Mark Read',
          options: {
            isDestructive: false,
            isAuthenticationRequired: false,
            opensAppToForeground: false,
          },
        },
      ], {
        intentIdentifiers: [],
        hiddenPreviewsBodyPlaceholder: 'New message',
        categorySummaryFormat: '%u new messages',
        customDismissAction: true,
        allowInCarPlay: true,
        allowAnnouncement: true,
        showTitle: true,
        showSubtitle: true,
        showBody: true,
      });
    }
  }

  /**
   * Set up notification handlers for incoming calls
   */
  private setupNotificationHandlers(): void {
    // Handle notification received while app is in foreground
    Notifications.addNotificationReceivedListener((notification) => {
      log('[LockscreenCall] Notification received:', notification);
      
      // Handle call notifications specially
      if (notification.request.content.categoryIdentifier === 'incoming_call') {
        this.handleIncomingCallNotification(notification);
      }
    });

    // Handle notification response (user tapped notification or action)
    Notifications.addNotificationResponseReceivedListener((response) => {
      log('[LockscreenCall] Notification response:', response);
      
      const { actionIdentifier, notification } = response;
      
      if (notification.request.content.categoryIdentifier === 'incoming_call') {
        this.handleCallAction(actionIdentifier, notification);
      }
    });
  }

  /**
   * Handle incoming call notification
   */
  private handleIncomingCallNotification(notification: Notifications.Notification): void {
    const data = notification.request.content.data as CallNotificationData;
    
    // Show full-screen call UI if app is in background
    if (data.isIncoming) {
      // This would trigger your call UI component
      log('[LockscreenCall] Incoming call from:', data.callerName);
    }
  }

  /**
   * Handle call action (answer/decline)
   */
  private handleCallAction(actionIdentifier: string, notification: Notifications.Notification): void {
    const data = notification.request.content.data as CallNotificationData;
    
    switch (actionIdentifier) {
      case 'answer_call':
        log('[LockscreenCall] Call answered:', data.callId);
        // Navigate to call screen
        break;
      case 'decline_call':
        log('[LockscreenCall] Call declined:', data.callId);
        // Mark call as declined
        break;
      case 'call_back':
        log('[LockscreenCall] Call back requested:', data.callId);
        // Initiate call back
        break;
      default:
        log('[LockscreenCall] Unknown action:', actionIdentifier);
    }
  }

  /**
   * Send a lockscreen call notification
   */
  async sendLockscreenCallNotification(data: CallNotificationData): Promise<void> {
    try {
      // Check if app is active - if so, don't send lockscreen notification
      // The in-app UI (GlobalCallManager) will handle it instead
      const { appStateTracker } = await import('./appStateTracker');
      if (appStateTracker.isAppActive()) {
        log('[LockscreenCall] App is active - skipping lockscreen notification, UI will handle it');
        return;
      }

      const notificationContent = {
        title: `Incoming ${data.callType} call`,
        subtitle: data.callerName,
        body: `Tap to answer the call`,
        data: data,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 1000, 500, 1000, 500, 1000],
        categoryIdentifier: 'incoming_call',
        sticky: true, // Keep notification until user acts
        autoDismiss: false, // Don't auto-dismiss
        launchImageName: 'call_screen', // iOS launch image
      };

      // Platform-specific configurations
      if (Platform.OS === 'android') {
        // Android full-screen intent configuration
        notificationContent['android'] = {
          channelId: 'critical_calls',
          priority: Notifications.AndroidNotificationPriority.MAX,
          visibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          fullScreenAction: {
            intentClass: 'com.nomli.mingle2.MainActivity',
            intentData: {
              callId: data.callId,
              callerId: data.callerId,
              callType: data.callType,
            },
          },
          lights: {
            color: '#FF0000',
            onMs: 1000,
            offMs: 1000,
          },
          ongoing: true, // Make it ongoing so it can't be dismissed
          autoCancel: false, // Don't auto-cancel
        };
      } else if (Platform.OS === 'ios') {
        // iOS critical alert configuration
        notificationContent['ios'] = {
          sound: 'default',
          critical: true, // Critical alert for lockscreen
          criticalVolume: 1.0, // Maximum volume for critical alerts
          interruptionLevel: 'critical', // iOS 15+ critical interruption level
          relevanceScore: 1.0, // Maximum relevance for iOS 15+
          targetContentIdentifier: data.callId, // Unique identifier for iOS 15+
          threadIdentifier: 'incoming_calls', // Group related notifications
          summaryArgument: data.callerName, // Summary argument for grouped notifications
          summaryArgumentCount: 1, // Count for summary
          categoryIdentifier: 'incoming_call',
          launchImageName: 'call_screen',
          badge: 1, // Show badge for missed calls
        };
      }

      await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: null, // Show immediately
      });

      log('[LockscreenCall] Lockscreen call notification sent');
    } catch (error) {
      error('[LockscreenCall] Failed to send lockscreen call notification:', error);
    }
  }

  /**
   * Send a background notification (when app is closed)
   */
  async sendBackgroundNotification(
    title: string,
    body: string,
    data: any = {},
    channelId: string = 'background_sync'
  ): Promise<void> {
    try {
      const notificationContent = {
        title,
        body,
        data,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
        categoryIdentifier: 'background_notification',
      };

      if (Platform.OS === 'android') {
        notificationContent['android'] = {
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
        // iOS background notification configuration
        notificationContent['ios'] = {
          sound: 'default',
          critical: false, // Not critical for background notifications
          interruptionLevel: 'active', // Active interruption level for iOS 15+
          relevanceScore: 0.5, // Medium relevance for background notifications
          targetContentIdentifier: data.id || 'background_notification',
          threadIdentifier: data.type || 'general',
          summaryArgument: data.senderName || 'Notification',
          summaryArgumentCount: 1,
          categoryIdentifier: 'background_notification',
          badge: 1,
        };
      }

      await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: null, // Show immediately
      });

      log('[LockscreenCall] Background notification sent');
    } catch (error) {
      error('[LockscreenCall] Failed to send background notification:', error);
    }
  }

  /**
   * Cancel a specific notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      log('[LockscreenCall] Notification cancelled:', notificationId);
    } catch (error) {
      error('[LockscreenCall] Failed to cancel notification:', error);
    }
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      log('[LockscreenCall] All notifications cancelled');
    } catch (error) {
      error('[LockscreenCall] Failed to cancel all notifications:', error);
    }
  }
}

// Export singleton instance
export const lockscreenCallService = new LockscreenCallNotificationService();
export default lockscreenCallService;
