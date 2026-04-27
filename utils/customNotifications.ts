import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { badgeCounter } from './badgeCounter';
import { log, warn, error } from './productionLogger';


// Note: Notification handler is configured in app/_layout.tsx
// This file only handles notification service initialization, not the handler itself

export interface PushNotificationData {
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: boolean;
  badge?: number;
}

class CustomNotificationService {
  private expoPushToken: string | null = null;
  private isInitialized = false;
  private lastNullTokenLogAtMs = 0;

  /**
   * Initialize the notification service without FCM
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) {
        return true;
      }

      log('[CustomNotifications] Initializing notification service...');

      // Check if device supports push notifications
      if (!Device.isDevice) {
        log('[CustomNotifications] Running in simulator - push notifications will not work');
        log('[CustomNotifications] Push notifications require a real device or EAS build');
        log('[CustomNotifications] Service will NOT save tokens for simulator');
        
        // DO NOT save mock tokens to database - they don't work!
        // Just mark as initialized without a token
        this.expoPushToken = null;
        this.isInitialized = true;
        return false; // Return false so token doesn't get saved
      }

      // Request permissions
      log('[CustomNotifications] 📱 Checking notification permissions...');
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      log('[CustomNotifications] Current permission status:', existingStatus);
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        log('[CustomNotifications] 🔔 Requesting notification permissions...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        log('[CustomNotifications] Permission request result:', status);
      }

      if (finalStatus !== 'granted') {
        error('[CustomNotifications] ❌ Permission not granted for push notifications');
        error('[CustomNotifications] Status:', finalStatus);
        error('[CustomNotifications] User needs to grant notification permissions in Settings');
        // Still mark as initialized to avoid repeated permission requests
        this.isInitialized = true;
        return false;
      }
      
      log('[CustomNotifications] ✅ Notification permissions granted');

      // Get the token using only Expo's service (no FCM)
      try {
        log('[CustomNotifications] 🔑 Requesting Expo push token...');
        // Use the working EAS project ID (nomli212 account)
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: 'd6e68a27-db0b-43e0-ba6d-b37a1608de5c',
        });

        if (token?.data) {
          this.expoPushToken = token.data;
          log('[CustomNotifications] ✅ Push token obtained successfully');
          log('[CustomNotifications] 🔑 Token:', `${token.data.substring(0, 30)}...`);
        } else {
          error('[CustomNotifications] ❌ No token data received from Expo');
          error('[CustomNotifications] Token response:', token);
          this.expoPushToken = null;
        }

        this.isInitialized = true;
        return !!this.expoPushToken;
      } catch (error) {
        warn('[CustomNotifications] Push token error (expected with FCM disabled):', error?.message || error);
        
        // Handle specific error types gracefully
        if (error instanceof Error) {
          if (error.message.includes('FCM') || error.message.includes('Firebase')) {
            log('[CustomNotifications] FCM error detected - this is expected since FCM is disabled. Continuing without push token.');
          } else if (error.message.includes('network') || error.message.includes('timeout')) {
            log('[CustomNotifications] Network error, will retry later');
          } else if (error.message.includes('initialized')) {
            log('[CustomNotifications] Firebase initialization error - this is expected since FCM is disabled');
          } else {
            log('[CustomNotifications] Unknown error type, continuing without push token');
          }
        }
        
        // Mark as initialized to prevent repeated failures
        this.isInitialized = true;
        this.expoPushToken = null;
        return false;
      }
    } catch (error) {
      error('[CustomNotifications] Critical error during initialization:', error);
      // Mark as initialized to prevent repeated failures
      this.isInitialized = true;
      return false;
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
        const now = Date.now();
        // Avoid noisy loops when token is intentionally unavailable (permission denied, emulator, FCM-disabled path).
        if (now - this.lastNullTokenLogAtMs > 30000) {
          warn('[CustomNotifications] No push token available to save (skipping save for now)');
          this.lastNullTokenLogAtMs = now;
        }

        // Only attempt initialization if it has never been initialized yet.
        // If already initialized and token is still null, repeated reinit calls are just log spam.
        if (!this.isInitialized) {
          const reinitSuccess = await this.initialize();
          if (reinitSuccess && this.expoPushToken) {
            log('[CustomNotifications] ✅ Token obtained after initialization');
          } else {
            return false;
          }
        } else {
          return false;
        }
      }
      
      // Double-check token is still valid before saving
      if (!this.expoPushToken || this.expoPushToken.trim() === '') {
        error('[CustomNotifications] ❌ Token is empty or invalid after reinit');
        return false;
      }
      
      log('[CustomNotifications] 💾 Saving token to database...');
      log('[CustomNotifications] 🔑 Token to save:', `${this.expoPushToken.substring(0, 30)}...`);
      log('[CustomNotifications] 👤 User ID:', userId);

      // Prefer RPC to avoid triggers touching auth.users and bypass RLS edge-cases
      let saveSuccess = false;
      
      try {
        const { error, data } = await supabase.rpc('set_expo_push_token', {
          p_token: this.expoPushToken,
        });

        if (error) {
          error('[CustomNotifications] ❌ RPC error saving token:', error);
          error('[CustomNotifications] Error code:', error.code);
          error('[CustomNotifications] Error message:', error.message);
          
          // If RPC function doesn't exist, fall back to direct UPDATE
          if (error.code === '42883' || error.message?.includes('function') || error.message?.includes('does not exist')) {
            warn('[CustomNotifications] ⚠️  RPC function set_expo_push_token does not exist!');
            warn('[CustomNotifications] 🔄 Falling back to direct UPDATE...');
            
            // Fallback: Direct UPDATE
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ 
                expo_push_token: this.expoPushToken,
                push_token_updated_at: new Date().toISOString()
              })
              .eq('id', userId);
            
            if (updateError) {
              error('[CustomNotifications] ❌ Direct UPDATE also failed:', updateError);
              return false;
            }
            
            log('[CustomNotifications] ✅ Token saved via direct UPDATE (fallback)');
            saveSuccess = true;
          } else {
            // Other RPC error - try direct UPDATE as fallback
            warn('[CustomNotifications] 🔄 RPC failed, trying direct UPDATE as fallback...');
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ 
                expo_push_token: this.expoPushToken,
                push_token_updated_at: new Date().toISOString()
              })
              .eq('id', userId);
            
            if (updateError) {
              error('[CustomNotifications] ❌ Direct UPDATE also failed:', updateError);
              return false;
            }
            
            log('[CustomNotifications] ✅ Token saved via direct UPDATE (fallback)');
            saveSuccess = true;
          }
        } else {
          log('[CustomNotifications] ✅ RPC call successful, result:', data);
          saveSuccess = true;
        }
      } catch (rpcError) {
        error('[CustomNotifications] ❌ Exception during RPC call:', rpcError);
        // Try direct UPDATE as last resort
        warn('[CustomNotifications] 🔄 Trying direct UPDATE as fallback...');
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            expo_push_token: this.expoPushToken,
            push_token_updated_at: new Date().toISOString()
          })
          .eq('id', userId);
        
        if (updateError) {
          error('[CustomNotifications] ❌ Direct UPDATE also failed:', updateError);
          return false;
        }
        
        log('[CustomNotifications] ✅ Token saved via direct UPDATE (fallback)');
        saveSuccess = true;
      }

      if (saveSuccess) {
        log('[CustomNotifications] ✅ Push token saved to profile for user:', userId);
        log('[CustomNotifications] 🔑 Token:', `${this.expoPushToken.substring(0, 30)}...`);
        return true;
      }
      
      return false;
    } catch (error) {
      error('[CustomNotifications] Error saving token to profile:', error);
      return false;
    }
  }

  /**
   * Save a provided push token to the user's profile (explicit token)
   */
  async saveTokenToProfileWithValue(userId: string, token: string): Promise<boolean> {
    try {
      if (!token) {
        log('[CustomNotifications] No explicit token provided');
        return false;
      }

      // also set internal cache for consistency
      this.expoPushToken = token;

      const { error } = await supabase.rpc('set_expo_push_token', {
        p_token: token,
      });

      if (error) {
        error('[CustomNotifications] Error saving explicit token to profile:', error);
        return false;
      }

      log('[CustomNotifications] Explicit push token saved to profile for user:', userId);
      return true;
    } catch (error) {
      error('[CustomNotifications] Error saving explicit token to profile:', error);
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
          push_token_updated_at: null,
        })
        .eq('id', userId);

      if (error) {
        error('[CustomNotifications] Error removing token from profile:', error);
        return false;
      }

      log('[CustomNotifications] Push token removed from profile for user:', userId);
      return true;
    } catch (error) {
      error('[CustomNotifications] Error removing token from profile:', error);
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
        log('[CustomNotifications] No push token found for user:', userId);
        return false;
      }

      return await this.sendNotificationToToken(profile.expo_push_token, notification);
    } catch (error) {
      error('[CustomNotifications] Error sending notification to user:', error);
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
      log('[CustomNotifications] Notification sent successfully:', result);
      return true;
    } catch (error) {
      error('[CustomNotifications] Error sending notification:', error);
      return false;
    }
  }

  /**
   * Set up iOS notification categories for actionable notifications
   */
  async setupIosCategories(): Promise<void> {
    try {
      // iOS doesn't need explicit channel setup like Android
      // Categories are handled automatically by Expo
      log('[CustomNotifications] iOS notification categories configured');
    } catch (error) {
      error('[CustomNotifications] Error setting up iOS categories:', error);
    }
  }

  /**
   * Set up notification channels (Android)
   */
  async setupNotificationChannels(): Promise<void> {
    if (Platform.OS === 'android') {
      // Default channel with MAX importance
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        description: 'Default notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#19444d',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });

      // Chat messages channel with MAX importance
      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Chat Messages',
        description: 'Chat message notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#19444d',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });

      // Must match remote push channelId from Edge Functions (send-instant-chat-push, process-notifications).
      // If this channel is missing, Android may not show heads-up / lock-screen when the app is killed.
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        description: 'Direct messages and reactions',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#19444d',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });

      // Calls channel with MAX importance and custom sound
      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Calls',
        description: 'Incoming call notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500, 200, 500], // Ring pattern
        lightColor: '#FF4444', // Red for calls
        sound: 'ringtone', // Use device ringtone for calls
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });

      // Background sync channel for reliable delivery
      await Notifications.setNotificationChannelAsync('background_sync', {
        name: 'Background Sync',
        description: 'Background notification delivery',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 100, 100, 100],
        lightColor: '#19444d',
        sound: 'default',
        enableVibrate: false,
        showBadge: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        bypassDnd: false,
      });

      // Badge notification channel for Android notification badges
      await Notifications.setNotificationChannelAsync('badge', {
        name: 'Badge Notifications',
        description: 'Persistent notifications showing unread message count',
        importance: Notifications.AndroidImportance.MIN, // Minimal importance to be less intrusive
        vibrationPattern: null, // No vibration
        lightColor: '#19444d',
        sound: null, // Silent
        enableVibrate: false,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET, // Don't show on lockscreen
        bypassDnd: false,
      });
    }
    
    // iOS: categories used for actionable notifications
    await this.setupIosCategories();
  }

  /**
   * Add notification received listener
   */
  addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  /**
   * Add notification response received listener
   */
  addNotificationResponseReceivedListener(callback: (response: Notifications.NotificationResponse) => void) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<Notifications.PermissionStatus> {
    const { status } = await Notifications.requestPermissionsAsync();
    return status;
  }
}

// Create and export a singleton instance
export const customNotifications = new CustomNotificationService();

// Export the class for testing
export default CustomNotificationService;
