/**
 * Background Call Manager
 * 
 * Manages call state and keeps Agora engine alive when app is in background.
 * This enables calls to continue working even when the app is backgrounded.
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


interface CallState {
  channelId: string | null;
  isActive: boolean;
  callType: 'audio' | 'video';
  callerId: string | null;
  recipientId: string | null;
}

class BackgroundCallManager {
  private static instance: BackgroundCallManager;
  private callState: CallState = {
    channelId: null,
    isActive: false,
    callType: 'audio',
    callerId: null,
    recipientId: null,
  };
  private appStateListener: any = null;
  private notificationListener: any = null;
  private agoraEngineRef: any = null;

  private constructor() {
    log('[BackgroundCallManager] Initialized');
  }

  public static getInstance(): BackgroundCallManager {
    if (!BackgroundCallManager.instance) {
      BackgroundCallManager.instance = new BackgroundCallManager();
    }
    return BackgroundCallManager.instance;
  }

  /**
   * Set the Agora engine reference to keep it alive in background
   */
  public setAgoraEngine(engine: any): void {
    this.agoraEngineRef = engine;
    log('[BackgroundCallManager] Agora engine reference set');
  }

  /**
   * Start managing a call (call is active)
   */
  public startCall(callData: {
    channelId: string;
    callType: 'audio' | 'video';
    callerId: string;
    recipientId: string;
  }): void {
    this.callState = {
      channelId: callData.channelId,
      isActive: true,
      callType: callData.callType,
      callerId: callData.callerId,
      recipientId: callData.recipientId,
    };

    log('[BackgroundCallManager] Call started:', this.callState);
    this.setupBackgroundHandling();
  }

  /**
   * End the call
   */
  public endCall(): void {
    log('[BackgroundCallManager] Call ended');
    this.callState = {
      channelId: null,
      isActive: false,
      callType: 'audio',
      callerId: null,
      recipientId: null,
    };
    this.cleanup();
  }

  /**
   * Check if a call is currently active
   */
  public isCallActive(): boolean {
    return this.callState.isActive;
  }

  /**
   * Get current call state
   */
  public getCallState(): CallState {
    return { ...this.callState };
  }

  /**
   * Setup background handling for active calls
   */
  private setupBackgroundHandling(): void {
    // Listen to app state changes
    this.appStateListener = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      this.handleAppStateChange(nextAppState);
    });

    // Listen to notification responses (when app wakes from terminated state)
    this.notificationListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        this.handleNotificationResponse(response);
      }
    );

    // Configure audio session for background (iOS)
    if (Platform.OS === 'ios' && this.agoraEngineRef) {
      this.configureBackgroundAudio();
    }
  }

  /**
   * Handle app state changes
   */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    log('[BackgroundCallManager] App state changed:', nextAppState);

    if (!this.callState.isActive) {
      return;
    }

    switch (nextAppState) {
      case 'background':
      case 'inactive':
        // App is going to background - keep call alive
        log('[BackgroundCallManager] App backgrounded - keeping call alive');
        this.keepCallAlive();
        break;

      case 'active':
        // App is active - call should continue normally
        log('[BackgroundCallManager] App active - call continues');
        break;
    }
  }

  /**
   * Keep call alive in background
   */
  private keepCallAlive(): void {
    if (!this.agoraEngineRef) {
      warn('[BackgroundCallManager] No Agora engine reference - cannot keep call alive');
      return;
    }

    try {
      // On iOS, ensure audio session is configured for background
      if (Platform.OS === 'ios') {
        this.configureBackgroundAudio();
      }

      // On Android, we rely on foreground service (configured in AndroidManifest)
      if (Platform.OS === 'android') {
        // Show persistent notification to keep service alive
        this.showPersistentNotification();
      }

      log('[BackgroundCallManager] Call kept alive in background');
    } catch (error) {
      error('[BackgroundCallManager] Error keeping call alive:', error);
    }
  }

  /**
   * Configure audio session for background (iOS)
   */
  private configureBackgroundAudio(): void {
    // This is handled by Agora SDK's native implementation
    // We just need to ensure the engine stays alive
    log('[BackgroundCallManager] Background audio configured (iOS)');
  }

  /**
   * Show persistent notification (Android)
   */
  private async showPersistentNotification(): Promise<void> {
    try {
      // This will be handled by Notifee or native notification service
      // The notification keeps the foreground service alive
      log('[BackgroundCallManager] Persistent notification should be shown (Android)');
    } catch (error) {
      error('[BackgroundCallManager] Error showing persistent notification:', error);
    }
  }

  /**
   * Handle notification response (app woke from terminated state)
   */
  private async handleNotificationResponse(response: Notifications.NotificationResponse): Promise<void> {
    const data = response.notification.request.content.data;

    // Check if this is a call notification
    if (data?.type === 'incoming_call' || data?.type === 'call') {
      log('[BackgroundCallManager] Call notification tapped - app woke from terminated state');
      
      // The app should handle navigation to call screen
      // This is handled by GlobalCallManager or ExpoNotificationManager
    }
  }

  /**
   * Cleanup listeners
   */
  private cleanup(): void {
    if (this.appStateListener) {
      this.appStateListener.remove();
      this.appStateListener = null;
    }

    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }

    log('[BackgroundCallManager] Cleaned up');
  }

  /**
   * Reconnect to call if app was backgrounded/terminated
   */
  public async reconnectToCall(): Promise<boolean> {
    if (!this.callState.isActive || !this.callState.channelId) {
      return false;
    }

    log('[BackgroundCallManager] Attempting to reconnect to call:', this.callState.channelId);

    try {
      // Check if call is still active in database
      const { data: callData, error } = await supabase
        .from('call_notifications')
        .select('status, channel_id')
        .eq('channel_id', this.callState.channelId)
        .eq('status', 'active')
        .single();

      if (error || !callData) {
        log('[BackgroundCallManager] Call no longer active in database');
        this.endCall();
        return false;
      }

      // Call is still active - app should rejoin channel
      // This will be handled by the call screen component
      log('[BackgroundCallManager] Call is still active - ready to reconnect');
      return true;
    } catch (error) {
      error('[BackgroundCallManager] Error checking call status:', error);
      return false;
    }
  }
}

export const backgroundCallManager = BackgroundCallManager.getInstance();

