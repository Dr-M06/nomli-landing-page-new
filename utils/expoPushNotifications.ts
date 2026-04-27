import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, AppState } from 'react-native';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


// Note: Notification handler is configured in app/_layout.tsx
// This file only handles Expo push notification service, not the handler itself

export interface PushNotificationData {
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: boolean;
  badge?: number;
}

class ExpoPushNotificationService {
  private expoPushToken: string | null = null;
  private isInitialized = false;

  /**
   * Initialize the push notification service
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) {
        return true;
      }

      log('[ExpoPush] Initializing push notification service...');

      // Check if device supports push notifications
      if (!Device.isDevice) {
        log('[ExpoPush] Running in simulator - push notifications will not work');
        log('[ExpoPush] Push notifications require a real device or EAS build');
        log('[ExpoPush] Service will initialize for testing purposes');
        // Don't return false here - allow the service to initialize for testing
      } else {
        log('[ExpoPush] Running on real device - push notifications supported');
      }

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        log('[ExpoPush] Permission not granted for push notifications');
        return false;
      }

      // Get the token
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'd6e68a27-db0b-43e0-ba6d-b37a1608de5c', // Working EAS project ID (nomli212 account)
      });

      this.expoPushToken = token.data;
      this.isInitialized = true;

      if (__DEV__) {
        log('[ExpoPush] Push token obtained successfully');
      }
      return true;
    } catch (error) {
      error('[ExpoPush] Error initializing:', error);
      return false;
    }
  }

  /**
   * Set up iOS notification categories (actions) for calls
   */
  async setupIosCategories(): Promise<void> {
    try {
      await Notifications.setNotificationCategoryAsync('INCOMING_CALL', [
        {
          identifier: 'ANSWER',
          buttonTitle: 'Answer',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'DECLINE',
          buttonTitle: 'Decline',
          options: { isDestructive: true },
        },
      ]);
    } catch (error) {
      warn('[ExpoPush] Unable to set iOS categories:', error);
    }
  }

  /**
   * Get the current push token
   */
  getPushToken(): string | null {
    return this.expoPushToken;
  }

  /**
   * Save the push token to the user's profile
   */
  async saveTokenToProfile(userId: string): Promise<boolean> {
    try {
      if (!this.expoPushToken) {
        log('[ExpoPush] No push token available');
        return false;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ 
          expo_push_token: this.expoPushToken,
          push_token_updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        error('[ExpoPush] Error saving token to profile:', error);
        return false;
      }

      log('[ExpoPush] Push token saved to profile for user:', userId);
      return true;
    } catch (error) {
      error('[ExpoPush] Error saving token to profile:', error);
      return false;
    }
  }

  /**
   * Remove the push token from the user's profile
   */
  async removeTokenFromProfile(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          expo_push_token: null,
          push_token_updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        error('[ExpoPush] Error removing token from profile:', error);
        return false;
      }

      log('[ExpoPush] Push token removed from profile for user:', userId);
      return true;
    } catch (error) {
      error('[ExpoPush] Error removing token from profile:', error);
      return false;
    }
  }

  /**
   * Send a push notification to a specific user
   */
  async sendNotificationToUser(userId: string, notification: PushNotificationData): Promise<boolean> {
    try {
      // Get the user's push token from their profile
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', userId)
        .single();

      if (error || !profile?.expo_push_token) {
        log('[ExpoPush] No push token found for user:', userId);
        return false;
      }

      return await this.sendNotificationToToken(profile.expo_push_token, notification);
    } catch (error) {
      error('[ExpoPush] Error sending notification to user:', error);
      return false;
    }
  }

  /**
   * Send a push notification to a specific token
   */
  async sendNotificationToToken(token: string, notification: PushNotificationData): Promise<boolean> {
    try {
      const message = {
        to: token,
        sound: notification.sound !== false ? 'default' : undefined,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        badge: notification.badge,
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      log('[ExpoPush] Notification sent successfully:', result);
      return true;
    } catch (error) {
      error('[ExpoPush] Error sending notification:', error);
      return false;
    }
  }

  /**
   * Send a push notification to multiple users
   */
  async sendNotificationToUsers(userIds: string[], notification: PushNotificationData): Promise<boolean> {
    try {
      // Get all users' push tokens
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, expo_push_token')
        .in('id', userIds)
        .not('expo_push_token', 'is', null);

      if (error || !profiles || profiles.length === 0) {
        log('[ExpoPush] No push tokens found for users');
        return false;
      }

      // Send notifications to all tokens
      const tokens = profiles.map(p => p.expo_push_token).filter(Boolean);
      const promises = tokens.map(token => 
        this.sendNotificationToToken(token!, notification)
      );

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

      log(`[ExpoPush] Sent notifications to ${successCount}/${tokens.length} users`);
      return successCount > 0;
    } catch (error) {
      error('[ExpoPush] Error sending notifications to users:', error);
      return false;
    }
  }

  /**
   * Set up notification channels (Android)
   */
  async setupNotificationChannels(): Promise<void> {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });

      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Chat Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
      });
    }
    // iOS: categories used for actionable notifications
    await this.setupIosCategories();
  }

  /**
   * Handle notification received while app is in foreground
   */
  addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  /**
   * Handle notification response (when user taps notification)
   */
  addNotificationResponseReceivedListener(callback: (response: Notifications.NotificationResponse) => void) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  /**
   * Get all scheduled notifications
   */
  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return await Notifications.getAllScheduledNotificationsAsync();
  }

  /**
   * Schedule a local notification
   */
  async scheduleNotification(notification: PushNotificationData, trigger: Notifications.NotificationTriggerInputOptions): Promise<string> {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        sound: notification.sound !== false,
        badge: notification.badge,
      },
      trigger,
    });

    log('[ExpoPush] Scheduled notification with ID:', identifier);
    return identifier;
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(identifier: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    log('[ExpoPush] Cancelled notification with ID:', identifier);
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    log('[ExpoPush] Cancelled all scheduled notifications');
  }

  /**
   * Get notification permissions status
   */
  async getPermissionsStatus(): Promise<Notifications.PermissionStatus> {
    return await Notifications.getPermissionsAsync();
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<Notifications.PermissionStatus> {
    return await Notifications.requestPermissionsAsync();
  }
}

// Create and export a singleton instance
export const expoPushNotifications = new ExpoPushNotificationService();

// Export the class for testing
export default ExpoPushNotificationService;
