// OPTIMIZED: Lazy import Firebase messaging to reduce bundle size and handle not-initialized case
// The app uses Expo notifications primarily, FCM is optional
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


// Lazy load Firebase app and messaging
let messaging: any = null;
let firebaseApp: any = null;

const initializeFirebase = async () => {
  try {
    // Initialize Firebase app first
    if (!firebaseApp) {
      const firebaseAppModule = await import('@react-native-firebase/app');
      firebaseApp = firebaseAppModule.default;
    }
    
    // Explicitly initialize Firebase app if not already initialized
    try {
      // Check if Firebase app is already initialized
      firebaseApp.app();
      log('[FCMService] ✅ Firebase app already initialized');
    } catch (error) {
      // Firebase app not initialized - React Native Firebase auto-initializes from config files
      // Try to explicitly initialize if the method exists
      try {
        // Check if initializeApp method exists (React Native Firebase may not have it)
        if (typeof firebaseApp.initializeApp === 'function') {
          if (!firebaseApp.apps || firebaseApp.apps.length === 0) {
            firebaseApp.initializeApp();
            log('[FCMService] ✅ Firebase app initialized explicitly');
          } else {
            log('[FCMService] ✅ Firebase app already exists');
          }
        } else {
          // React Native Firebase auto-initializes from google-services.json / GoogleService-Info.plist
          log('[FCMService] ⚠️ Firebase will auto-initialize from config files (initializeApp not available)');
        }
      } catch (initError) {
        // If explicit initialization fails, it will auto-initialize from config files
        log('[FCMService] ⚠️ Firebase will auto-initialize from config files:', initError.message);
      }
    }
    
    // Then get messaging
    if (!messaging) {
    const messagingModule = await import('@react-native-firebase/messaging');
    messaging = messagingModule.default;
    }
    
    return messaging;
  } catch (error) {
    warn('[FCMService] Firebase not available:', error);
    return null;
  }
};

const getMessaging = async () => {
  if (messaging) return messaging;
  return await initializeFirebase();
};

export interface FCMToken {
  token: string;
  platform: 'ios' | 'android';
  timestamp: number;
}

export interface FCMMessage {
  title?: string;
  body?: string;
  data?: { [key: string]: string };
  notification?: {
    title?: string;
    body?: string;
  };
}

class FCMService {
  private static instance: FCMService;
  private token: string | null = null;
  private isInitialized = false;

  public static getInstance(): FCMService {
    if (!FCMService.instance) {
      FCMService.instance = new FCMService();
    }
    return FCMService.instance;
  }

  /**
   * Initialize FCM service
   * OPTIMIZED: Gracefully handles Firebase not being initialized (uses Expo notifications as fallback)
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      log('[FCMService] Already initialized');
      return;
    }

    try {
      log('[FCMService] Initializing FCM service...');
      
      // Check if Firebase is available (may not be initialized in some environments)
      const messagingInstance = await getMessaging();
      
      if (!messagingInstance || typeof messagingInstance !== 'function') {
        log('[FCMService] Firebase not available, using Expo notifications instead');
        this.isInitialized = false;
        return; // Don't throw - app can work with Expo notifications
      }
      
      // Request permission
      await this.requestPermission();
      
      // Get FCM token
      await this.getToken();
      
      // Set up message handlers
      this.setupMessageHandlers();
      
      this.isInitialized = true;
      log('[FCMService] FCM service initialized successfully');
    } catch (error) {
      warn('[FCMService] Failed to initialize (non-critical, using Expo notifications):', error);
      // Don't throw - app can work without FCM
      this.isInitialized = false;
    }
  }

  /**
   * Request notification permission
   */
  public async requestPermission(): Promise<boolean> {
    try {
      log('[FCMService] Requesting notification permission...');
      
      // Get Firebase messaging instance
      const messagingInstance = await getMessaging();
      if (!messagingInstance || typeof messagingInstance !== 'function') {
        throw new Error('Firebase messaging not available');
      }
      
      if (Platform.OS === 'ios') {
        const authStatus = await messagingInstance().requestPermission();
        const enabled =
          authStatus === messagingInstance.AuthorizationStatus.AUTHORIZED ||
          authStatus === messagingInstance.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          log('[FCMService] iOS notification permission granted:', authStatus);
          return true;
        } else {
          log('[FCMService] iOS notification permission denied:', authStatus);
          return false;
        }
      } else {
        // Android - no permission needed for API level 32 and below
        log('[FCMService] Android notification permission (not required for API level 32 and below)');
        return true;
      }
    } catch (error) {
      error('[FCMService] Error requesting permission:', error);
      return false;
    }
  }

  /**
   * Get FCM token
   * OPTIMIZED: Handles Firebase not being initialized
   */
  public async getToken(): Promise<string | null> {
    try {
      log('[FCMService] Getting FCM token...');
      
      // Initialize Firebase app first
      await initializeFirebase();
      
      // Get Firebase messaging instance
      const messagingInstance = await getMessaging();
      if (!messagingInstance || typeof messagingInstance !== 'function') {
        throw new Error('Firebase messaging not available');
      }
      
      // Ensure Firebase app is initialized before getting token
      try {
        if (firebaseApp) {
          firebaseApp.app(); // This will throw if not initialized
          log('[FCMService] ✅ Firebase app is initialized');
        }
      } catch (error) {
        warn('[FCMService] ⚠️ Firebase app not initialized yet, attempting explicit initialization...');
        
        // Try to explicitly initialize if method exists
        try {
          if (firebaseApp && typeof firebaseApp.initializeApp === 'function') {
            if (!firebaseApp.apps || firebaseApp.apps.length === 0) {
              firebaseApp.initializeApp();
              log('[FCMService] ✅ Firebase app initialized explicitly');
            } else {
              // App exists, try to get it
              firebaseApp.app();
              log('[FCMService] ✅ Firebase app accessible');
            }
          } else {
            // React Native Firebase auto-initializes - wait for it
            warn('[FCMService] ⚠️ Waiting for auto-initialization from config files...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time
            
            // Try again
            try {
              if (firebaseApp) {
                firebaseApp.app();
                log('[FCMService] ✅ Firebase app initialized after wait');
              }
            } catch (retryError) {
              error('[FCMService] ❌ Firebase app still not initialized after wait:', retryError);
              // Don't throw - app can work with Expo notifications
              warn('[FCMService] ⚠️ Continuing without FCM - using Expo notifications instead');
              return null;
            }
          }
        } catch (initError) {
          // Wait a bit for auto-initialization from config files
          warn('[FCMService] ⚠️ Waiting for auto-initialization from config files...');
          await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time
          
          // Try again
          try {
            if (firebaseApp) {
              firebaseApp.app();
              log('[FCMService] ✅ Firebase app initialized after wait');
            }
          } catch (retryError) {
            error('[FCMService] ❌ Firebase app still not initialized after wait:', retryError);
            // Don't throw - app can work with Expo notifications
            warn('[FCMService] ⚠️ Continuing without FCM - using Expo notifications instead');
            return null;
          }
        }
      }
      
      const token = await messagingInstance().getToken();
      
      if (token) {
        this.token = token;
        log('[FCMService] FCM token obtained:', token.substring(0, 20) + '...');
        
        // Store token locally
        await AsyncStorage.setItem('fcm_token', token);
        
        // Save token to Supabase
        await this.saveTokenToSupabase(token);
        
        return token;
      } else {
        log('[FCMService] No FCM token available');
        return null;
      }
    } catch (error) {
      error('[FCMService] Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Save FCM token to Supabase profiles table
   */
  private async saveTokenToSupabase(token: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        log('[FCMService] No authenticated user, skipping token save');
        return;
      }

      // Save to profiles.fcm_token column (not user_fcm_tokens table)
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          fcm_token: token,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (updateError) {
        error('[FCMService] Error saving FCM token to profiles:', updateError);
      } else {
        log('[FCMService] FCM token saved to profiles.fcm_token successfully');
      }
    } catch (error) {
      error('[FCMService] Error saving token to Supabase:', error);
    }
  }

  /**
   * Set up message handlers
   */
  private async setupMessageHandlers(): Promise<void> {
    log('[FCMService] Setting up message handlers...');

    // Get Firebase messaging instance
    const messagingInstance = await getMessaging();
    if (!messagingInstance || typeof messagingInstance !== 'function') {
      warn('[FCMService] Cannot setup handlers - Firebase not available');
      return;
    }

    // Handle foreground messages
    const unsubscribeForeground = messagingInstance().onMessage(async (remoteMessage) => {
      log('[FCMService] Foreground message received:', remoteMessage);
      
      // Show local notification or update UI
      this.handleForegroundMessage(remoteMessage);
    });

    // Note: Background message handler is set up in index.js
    // It must be registered outside of any component lifecycle

    // Handle notification opened app
    messagingInstance().onNotificationOpenedApp((remoteMessage) => {
      log('[FCMService] Notification opened app:', remoteMessage);
      
      // Handle navigation based on notification data
      this.handleNotificationOpened(remoteMessage);
    });

    // Handle initial notification (app opened from quit state)
    messagingInstance()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          log('[FCMService] App opened from notification:', remoteMessage);
          this.handleNotificationOpened(remoteMessage);
        }
      });

    // Handle notification action (Answer/Decline buttons)
    if (Platform.OS === 'android') {
      // Android notification actions are handled through notifee
      // We'll set this up separately
      log('[FCMService] Android notification actions will be handled by notifee');
    }

    // Handle token refresh
    messagingInstance().onTokenRefresh(async (token) => {
      log('[FCMService] FCM token refreshed:', token.substring(0, 20) + '...');
      this.token = token;
      await AsyncStorage.setItem('fcm_token', token);
      await this.saveTokenToSupabase(token);
    });

    log('[FCMService] Message handlers set up successfully');
  }

  /**
   * Handle foreground messages
   * NOTE: When app is in foreground, we DON'T show system notifications;
   * in-app UI (e.g. chat) handles relevant types.
   */
  private handleForegroundMessage(remoteMessage: any): void {
    try {
      const { notification, data } = remoteMessage;
      
      log('[FCMService] Foreground message - app will handle UI:', {
        type: data?.type,
        hasNotification: !!notification,
        hasData: !!data
      });

      if (data?.type === 'incoming_call' || data?.type === 'call') {
        log('[FCMService] Call-type push ignored (calls removed from app)');
      } else if (data?.type === 'message') {
        log('[FCMService] Message notification - chat UI will handle');
        // Chat UI will update automatically via Supabase realtime
      } else {
        log('[FCMService] Other notification type:', data?.type);
        // Other notification types handled by their respective components
      }
    } catch (error) {
      error('[FCMService] Error handling foreground message:', error);
    }
  }

  /**
   * Handle background messages
   * Note: Background message handler is now in index.js
   * This method is kept for reference but not actively used
   */
  private handleBackgroundMessage(remoteMessage: any): void {
    // Background messages are now handled in index.js
    log('[FCMService] Background message handling moved to index.js');
  }

  /**
   * Handle notification opened
   */
  private handleNotificationOpened(remoteMessage: any): void {
    try {
      log('[FCMService] Handling notification opened:', remoteMessage);
      
      const { data } = remoteMessage;
      
      if (data) {
        // Navigate based on notification data
        switch (data.type) {
          case 'call':
          case 'incoming_call':
            log('[FCMService] Call notification open ignored (calls removed)');
            break;
          case 'message':
            // Navigate to chat screen
            log('[FCMService] Navigating to chat screen');
            break;
          case 'event':
            // Navigate to event screen
            log('[FCMService] Navigating to event screen');
            break;
          default:
            log('[FCMService] Unknown navigation type:', data.type);
        }
      }
    } catch (error) {
      error('[FCMService] Error handling notification opened:', error);
    }
  }

  /**
   * Subscribe to topic
   */
  public async subscribeToTopic(topic: string): Promise<boolean> {
    try {
      const messagingInstance = await getMessaging();
      if (!messagingInstance || typeof messagingInstance !== 'function') {
        warn('[FCMService] Cannot subscribe - Firebase not available');
        return false;
      }
      
      log('[FCMService] Subscribing to topic:', topic);
      await messagingInstance().subscribeToTopic(topic);
      log('[FCMService] Successfully subscribed to topic:', topic);
      return true;
    } catch (error) {
      error('[FCMService] Error subscribing to topic:', error);
      return false;
    }
  }

  /**
   * Unsubscribe from topic
   */
  public async unsubscribeFromTopic(topic: string): Promise<boolean> {
    try {
      const messagingInstance = await getMessaging();
      if (!messagingInstance || typeof messagingInstance !== 'function') {
        warn('[FCMService] Cannot unsubscribe - Firebase not available');
        return false;
      }
      
      log('[FCMService] Unsubscribing from topic:', topic);
      await messagingInstance().unsubscribeFromTopic(topic);
      log('[FCMService] Successfully unsubscribed from topic:', topic);
      return true;
    } catch (error) {
      error('[FCMService] Error unsubscribing from topic:', error);
      return false;
    }
  }

  /**
   * Get current token
   */
  public getCurrentToken(): string | null {
    return this.token;
  }

  /**
   * Check if FCM is available
   * OPTIMIZED: Async check since we lazy load Firebase
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const messagingInstance = await getMessaging();
      if (!messagingInstance || typeof messagingInstance !== 'function') {
        return false;
      }
      return messagingInstance().isDeviceRegisteredForRemoteMessages !== undefined;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clean up
   */
  public cleanup(): void {
    log('[FCMService] Cleaning up FCM service...');
    this.token = null;
    this.isInitialized = false;
  }
}

export default FCMService;
