import { Platform } from 'react-native';
import { supabase } from './supabase';
import Constants from 'expo-constants';
import { log, warn, error } from './productionLogger';


// Import OneSignal - version 5.x exports as named export { OneSignal }
let OneSignal: any = null;
try {
  const OneSignalModule = require('react-native-onesignal');
  // Version 5.x exports OneSignal as a named export: { OneSignal }
  OneSignal = OneSignalModule.OneSignal;
  
  if (!OneSignal) {
    error('[OneSignal] ❌ OneSignal namespace not found in module');
    error('[OneSignal] Module exports:', Object.keys(OneSignalModule));
    OneSignal = null;
  } else if (typeof OneSignal.initialize !== 'function' && typeof OneSignal.setAppId !== 'function') {
    warn('[OneSignal] OneSignal namespace found but initialize/setAppId is not available');
    warn('[OneSignal] OneSignal namespace keys:', Object.keys(OneSignal).slice(0, 20));
    OneSignal = null;
  } else {
    log('[OneSignal] ✅ OneSignal namespace imported successfully');
    log('[OneSignal] OneSignal type:', typeof OneSignal);
    log('[OneSignal] Available methods:', Object.keys(OneSignal).filter(k => typeof OneSignal[k] === 'function').slice(0, 10));
  }
} catch (error: any) {
  error('[OneSignal] ❌ Failed to import OneSignal module:', error?.message || error);
  error('[OneSignal] Error stack:', error?.stack);
  error('[OneSignal] This usually means the native module needs to be linked or rebuilt');
}

// Initialize OneSignal
const ONESIGNAL_APP_ID = Constants.expoConfig?.extra?.onesignalAppId || process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;

class OneSignalService {
  private isInitialized = false;
  private playerId: string | null = null;

  /**
   * Initialize OneSignal service
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) {
        return true;
      }

      log('[OneSignal] Checking OneSignal module...');
      
      // Check if OneSignal module is available
      if (!OneSignal) {
        error('[OneSignal] ❌ OneSignal native module is not available');
        error('[OneSignal] This usually means the native module is not linked properly');
        error('[OneSignal] Try:');
        error('[OneSignal] 1. Clean build: cd android && ./gradlew clean && cd ..');
        error('[OneSignal] 2. Rebuild: npx expo run:android');
        error('[OneSignal] 3. Make sure you are using a development build (not Expo Go)');
        return false;
      }

      log('[OneSignal] ✅ OneSignal module loaded');

      log('[OneSignal] Checking App ID...');
      log('[OneSignal] ONESIGNAL_APP_ID value:', ONESIGNAL_APP_ID ? `${ONESIGNAL_APP_ID.substring(0, 8)}...` : 'NOT FOUND');
      log('[OneSignal] Constants.expoConfig?.extra?.onesignalAppId:', Constants.expoConfig?.extra?.onesignalAppId);
      log('[OneSignal] process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID:', process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID);

      if (!ONESIGNAL_APP_ID) {
        error('[OneSignal] App ID not found. Please set EXPO_PUBLIC_ONESIGNAL_APP_ID in .env');
        error('[OneSignal] Make sure .env file is in the root directory and contains: EXPO_PUBLIC_ONESIGNAL_APP_ID=your-app-id');
        return false;
      }

      log('[OneSignal] Initializing OneSignal service with App ID:', ONESIGNAL_APP_ID.substring(0, 8) + '...');

      // Initialize OneSignal - version 5.x uses initialize(), older versions use setAppId()
      try {
        if (typeof OneSignal.initialize === 'function') {
          // Version 5.x API
          OneSignal.initialize(ONESIGNAL_APP_ID);
          log('[OneSignal] ✅ Initialized using OneSignal.initialize()');
        } else if (typeof OneSignal.setAppId === 'function') {
          // Older API
          OneSignal.setAppId(ONESIGNAL_APP_ID);
          log('[OneSignal] ✅ Initialized using OneSignal.setAppId()');
        } else {
          throw new Error('Neither initialize() nor setAppId() methods are available');
        }
      } catch (initError: any) {
        error('[OneSignal] ❌ Failed to initialize OneSignal:', initError);
        error('[OneSignal] Error details:', {
          message: initError?.message,
          name: initError?.name,
          stack: initError?.stack
        });
        throw new Error(`Failed to initialize OneSignal: ${initError?.message || 'Unknown error'}`);
      }

      // Request permission - check which API is available
      log('[OneSignal] Requesting notification permissions...');
      let permissionResult = false;
      
      if (typeof OneSignal.Notifications?.requestPermission === 'function') {
        // Version 5.x API
        permissionResult = await OneSignal.Notifications.requestPermission(true);
        log('[OneSignal] Permission result (v5):', permissionResult);
      } else if (typeof OneSignal.promptForPushNotificationsWithUserResponse === 'function') {
        // Older API
        permissionResult = await OneSignal.promptForPushNotificationsWithUserResponse();
        log('[OneSignal] Permission result (legacy):', permissionResult);
      } else {
        warn('[OneSignal] No permission request method found');
      }

      // Get user ID (OneSignal's unique device identifier) - API changed in v5
      log('[OneSignal] Getting user state...');
      let userId: string | null = null;
      
      if (typeof OneSignal.User?.onesignalId === 'function') {
        // Version 5.x - get user ID
        userId = await OneSignal.User.onesignalId();
        log('[OneSignal] User ID (v5):', userId);
      } else if (typeof OneSignal.getDeviceState === 'function') {
        // Older API
        const deviceState = await OneSignal.getDeviceState();
        userId = deviceState?.userId || null;
        log('[OneSignal] User ID (legacy):', userId);
      } else {
        warn('[OneSignal] No method to get user ID found');
      }
      
      this.playerId = userId;

      if (this.playerId) {
        log('[OneSignal] Player ID obtained:', this.playerId);
      } else {
        warn('[OneSignal] Player ID not available yet');
        warn('[OneSignal] Device state:', deviceState);
      }

      // Set up notification handlers
      log('[OneSignal] Setting up notification handlers...');
      this.setupNotificationHandlers();

      this.isInitialized = true;
      log('[OneSignal] ✅ Initialization complete!');
      return true;
    } catch (error: any) {
      // Use console.log instead of console.error to avoid triggering error handler
      log('[OneSignal] ❌ Error initializing:', error);
      log('[OneSignal] Error message:', error?.message);
      if (__DEV__) {
        log('[OneSignal] Error stack:', error?.stack);
      }
      return false;
    }
  }

  /**
   * Set up notification received and opened handlers
   */
  private setupNotificationHandlers(): void {
    if (!OneSignal) {
      warn('[OneSignal] Cannot setup handlers - OneSignal not initialized');
      return;
    }

    // Handler for when notification is received - check for v5 API
    if (OneSignal.Notifications?.addForegroundLifecycleListener) {
      // Version 5.x API
      OneSignal.Notifications.addForegroundLifecycleListener((event) => {
        log('[OneSignal] Notification received in foreground (v5):', event);
        // In v5, notifications are shown automatically unless you call event.preventDefault()
      });
    } else if (typeof OneSignal.setNotificationWillShowInForegroundHandler === 'function') {
      // Legacy API
      OneSignal.setNotificationWillShowInForegroundHandler((notificationReceivedEvent) => {
        log('[OneSignal] Notification received in foreground (legacy):', notificationReceivedEvent);
        const notification = notificationReceivedEvent.getNotification();
        notificationReceivedEvent.complete(notification);
      });
    }

    // Handler for when notification is opened
    if (OneSignal.Notifications?.addClickListener) {
      // Version 5.x API
      OneSignal.Notifications.addClickListener((event) => {
        log('[OneSignal] Notification opened (v5):', event);
        const data = event.notification.additionalData;
        this.handleNotificationClick(data);
      });
    } else if (typeof OneSignal.setNotificationOpenedHandler === 'function') {
      // Legacy API
      OneSignal.setNotificationOpenedHandler((result) => {
        log('[OneSignal] Notification opened (legacy):', result);
        const data = result.notification.additionalData;
        this.handleNotificationClick(data);
      });
    }
  }

  private handleNotificationClick(data: any): void {
    // Handle deep linking based on notification data
    if (data?.type === 'message' && data?.sender_id) {
      log('[OneSignal] Opening chat with:', data.sender_id);
    } else if (data?.type === 'call' && data?.call_id) {
      log('[OneSignal] Opening call:', data.call_id);
    }
  }

  /**
   * Get the current player ID (OneSignal's device identifier)
   */
  async getPlayerId(): Promise<string | null> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.playerId && OneSignal) {
        // Try v5 API first
        if (typeof OneSignal.User?.onesignalId === 'function') {
          this.playerId = await OneSignal.User.onesignalId();
        } else if (typeof OneSignal.getDeviceState === 'function') {
          const deviceState = await OneSignal.getDeviceState();
          this.playerId = deviceState?.userId || null;
        }
      }

      return this.playerId;
    } catch (error) {
      error('[OneSignal] Error getting player ID:', error);
      return null;
    }
  }

  /**
   * Save player ID to user's profile in Supabase
   */
  async savePlayerIdToProfile(userId: string): Promise<boolean> {
    try {
      const playerId = await this.getPlayerId();
      
      if (!playerId) {
        log('[OneSignal] No player ID available to save');
        return false;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          onesignal_player_id: playerId,
          onesignal_player_id_updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        error('[OneSignal] Error saving player ID:', error);
        return false;
      }

      log('[OneSignal] Player ID saved to profile for user:', userId);
      return true;
    } catch (error) {
      error('[OneSignal] Error saving player ID:', error);
      return false;
    }
  }

  /**
   * Remove player ID from user's profile (on logout)
   */
  async removePlayerIdFromProfile(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          onesignal_player_id: null,
          onesignal_player_id_updated_at: null,
        })
        .eq('id', userId);

      if (error) {
        error('[OneSignal] Error removing player ID:', error);
        return false;
      }

      log('[OneSignal] Player ID removed from profile for user:', userId);
      return true;
    } catch (error) {
      error('[OneSignal] Error removing player ID:', error);
      return false;
    }
  }

  /**
   * Set user ID for OneSignal (for targeting and analytics)
   */
  async setUserId(userId: string): Promise<void> {
    try {
      if (!OneSignal) {
        warn('[OneSignal] Cannot set user ID - OneSignal not initialized');
        return;
      }

      // Version 5.x uses login(), older versions use setExternalUserId()
      if (typeof OneSignal.login === 'function') {
        OneSignal.login(userId);
        log('[OneSignal] User logged in (v5):', userId);
      } else if (typeof OneSignal.setExternalUserId === 'function') {
        OneSignal.setExternalUserId(userId);
        log('[OneSignal] External user ID set (legacy):', userId);
      } else {
        warn('[OneSignal] No method to set user ID found');
      }
    } catch (error) {
      error('[OneSignal] Error setting user ID:', error);
    }
  }

  /**
   * Remove user ID (on logout)
   */
  async removeUserId(): Promise<void> {
    try {
      if (!OneSignal) {
        return;
      }

      // Version 5.x uses logout(), older versions use removeExternalUserId()
      if (typeof OneSignal.logout === 'function') {
        OneSignal.logout();
        log('[OneSignal] User logged out (v5)');
      } else if (typeof OneSignal.removeExternalUserId === 'function') {
        OneSignal.removeExternalUserId();
        log('[OneSignal] External user ID removed (legacy)');
      }
    } catch (error) {
      error('[OneSignal] Error removing user ID:', error);
    }
  }

  /**
   * Send tags (custom user properties) to OneSignal
   */
  async setTags(tags: Record<string, string>): Promise<void> {
    try {
      if (!OneSignal) return;

      // Version 5.x uses User.addTags(), older versions use sendTags()
      if (typeof OneSignal.User?.addTags === 'function') {
        await OneSignal.User.addTags(tags);
        log('[OneSignal] Tags added (v5):', tags);
      } else if (typeof OneSignal.sendTags === 'function') {
        OneSignal.sendTags(tags);
        log('[OneSignal] Tags sent (legacy):', tags);
      } else {
        warn('[OneSignal] No method to set tags found');
      }
    } catch (error) {
      error('[OneSignal] Error sending tags:', error);
    }
  }

  /**
   * Enable/disable notifications
   */
  async setEnabled(enabled: boolean): Promise<void> {
    try {
      if (!OneSignal) return;

      // Version 5.x API - check if there's a method to disable
      if (typeof OneSignal.disablePush === 'function') {
        OneSignal.disablePush(!enabled);
        log('[OneSignal] Push notifications:', enabled ? 'enabled' : 'disabled');
      } else {
        warn('[OneSignal] No method to enable/disable push notifications found');
      }
    } catch (error) {
      error('[OneSignal] Error setting enabled state:', error);
    }
  }

  /**
   * Get notification permission status
   */
  async getPermissionStatus(): Promise<boolean> {
    try {
      if (!OneSignal) return false;

      // Version 5.x API
      if (typeof OneSignal.Notifications?.permissionNative === 'function') {
        const permission = await OneSignal.Notifications.permissionNative();
        return permission === 1; // 1 = granted
      } else if (typeof OneSignal.getDeviceState === 'function') {
        // Legacy API
        const deviceState = await OneSignal.getDeviceState();
        return deviceState?.isSubscribed || false;
      }
      return false;
    } catch (error) {
      error('[OneSignal] Error getting permission status:', error);
      return false;
    }
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (!OneSignal) return false;

      // Version 5.x API
      if (typeof OneSignal.Notifications?.requestPermission === 'function') {
        return await OneSignal.Notifications.requestPermission(true);
      } else if (typeof OneSignal.promptForPushNotificationsWithUserResponse === 'function') {
        // Legacy API
        return await OneSignal.promptForPushNotificationsWithUserResponse();
      }
      return false;
    } catch (error) {
      error('[OneSignal] Error requesting permissions:', error);
      return false;
    }
  }
}

// Create and export singleton instance
export const onesignalService = new OneSignalService();

// Export class for testing
export default OneSignalService;

