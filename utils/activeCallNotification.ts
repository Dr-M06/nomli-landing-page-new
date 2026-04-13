/**
 * Active Call Notification Service
 * 
 * Shows a persistent notification with call controls when a call is active
 * and the app is in the background. This provides a call UI even when
 * the app is not visible.
 */

// Temporarily using mock while Notifee native module is disabled
import notifee, { AndroidImportance, EventType } from './notifeeServiceMock';
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { log, warn, error } from './productionLogger';


interface ActiveCallData {
  channelId: string;
  callerName: string;
  callType: 'audio' | 'video';
  isMuted: boolean;
  isCameraOn: boolean;
  callDuration?: number;
}

class ActiveCallNotificationService {
  private static instance: ActiveCallNotificationService;
  private currentNotificationId: string | null = null;
  private callData: ActiveCallData | null = null;
  private appStateListener: any = null;
  private updateTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    log('[ActiveCallNotification] Service initialized');
  }

  public static getInstance(): ActiveCallNotificationService {
    if (!ActiveCallNotificationService.instance) {
      ActiveCallNotificationService.instance = new ActiveCallNotificationService();
    }
    return ActiveCallNotificationService.instance;
  }

  /**
   * Show persistent call notification when call is active
   */
  public async showActiveCallNotification(callData: ActiveCallData): Promise<void> {
    try {
      this.callData = callData;
      
      // Always set up listener for app state changes
      this.setupAppStateListener();
      
      // Only show notification if app is in background
      const appState = AppState.currentState;
      if (appState === 'active') {
        log('[ActiveCallNotification] App is active - notification will show when backgrounded');
        return;
      }

      // App is already in background - show notification immediately
      await this.displayNotification(callData);
    } catch (error) {
      error('[ActiveCallNotification] Error showing active call notification:', error);
    }
  }

  /**
   * Update the active call notification (e.g., call duration, mute status)
   * Debounced to prevent rapid updates that cause jumping
   */
  public async updateActiveCallNotification(updates: Partial<ActiveCallData>): Promise<void> {
    if (!this.callData) {
      return;
    }

    // Clear any pending update
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    // Update call data immediately
    this.callData = { ...this.callData, ...updates };
    
    const appState = AppState.currentState;
    if (appState === 'active') {
      // Don't update notification if app is active (user sees in-app UI)
      return;
    }

    // Debounce updates to prevent jumping (update every 1 second max)
    this.updateTimeout = setTimeout(async () => {
      try {
        // Only update if notification already exists
        if (!this.currentNotificationId) {
          // Notification doesn't exist yet - create it
          await this.displayNotification(this.callData!);
          return;
        }

        // Update existing notification using the same ID to prevent jumping
        await this.displayNotification(this.callData!);
      } catch (error) {
        error('[ActiveCallNotification] Error updating notification:', error);
      }
    }, 1000); // Update max once per second
  }

  /**
   * Hide the active call notification
   */
  public async hideActiveCallNotification(): Promise<void> {
    try {
      // Clear any pending updates
      if (this.updateTimeout) {
        clearTimeout(this.updateTimeout);
        this.updateTimeout = null;
      }

      if (this.currentNotificationId) {
        await notifee.cancelNotification(this.currentNotificationId);
        log('[ActiveCallNotification] Notification cancelled');
        this.currentNotificationId = null;
      }

      if (this.appStateListener) {
        this.appStateListener.remove();
        this.appStateListener = null;
      }

      this.callData = null;
    } catch (error) {
      error('[ActiveCallNotification] Error hiding notification:', error);
    }
  }

  /**
   * Display the notification
   */
  private async displayNotification(callData: ActiveCallData): Promise<void> {
    try {
      const durationText = callData.callDuration 
        ? this.formatDuration(callData.callDuration)
        : 'Active call';

      const notificationId = await notifee.displayNotification({
        id: 'active_call',
        title: callData.callerName,
        body: `${callData.callType === 'video' ? '📹 Video' : '📞 Audio'} call • ${durationText}`,
        data: {
          type: 'active_call',
          channelId: callData.channelId,
          callType: callData.callType,
        },
        android: {
          channelId: 'active_calls',
          importance: AndroidImportance.HIGH,
          ongoing: true, // Persistent notification - can't be dismissed
          autoCancel: false, // Don't auto-cancel
          pressAction: {
            id: 'open_call',
            launchActivity: 'default',
          },
          actions: [
            {
              title: callData.isMuted ? '🔊 Unmute' : '🔇 Mute',
              pressAction: {
                id: 'toggle_mute',
              },
            },
            {
              title: callData.callType === 'video' 
                ? (callData.isCameraOn ? '📹 Camera Off' : '📹 Camera On')
                : '📹 Switch to Video',
              pressAction: {
                id: callData.callType === 'video' ? 'toggle_camera' : 'switch_to_video',
              },
            },
            {
              title: '📞 End Call',
              pressAction: {
                id: 'end_call',
              },
            },
          ],
          smallIcon: 'notification_icon', // Use notification icon from AndroidManifest
          color: '#19444d',
          category: 'call',
        },
        ios: {
          categoryId: 'active_call',
          interruptionLevel: 'active',
          // Don't specify sound property - iOS will use default behavior
        },
      });

      this.currentNotificationId = notificationId;
      log('[ActiveCallNotification] Notification displayed:', notificationId);

      // Set up action handlers if not already set up
      this.setupActionHandlers();
    } catch (error) {
      error('[ActiveCallNotification] Error displaying notification:', error);
    }
  }

  /**
   * Set up app state listener to show notification when app goes to background
   */
  private setupAppStateListener(): void {
    if (this.appStateListener) {
      return; // Already set up
    }

    this.appStateListener = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' && this.callData && !this.currentNotificationId) {
        // Only show notification if it doesn't already exist (prevent jumping)
        log('[ActiveCallNotification] App backgrounded - showing notification');
        this.displayNotification(this.callData);
      } else if (nextAppState === 'active' && this.currentNotificationId) {
        log('[ActiveCallNotification] App active - keeping notification for quick access');
        // Keep notification visible even when app is active for quick access
        // User can still see it in notification center
      }
    });
  }

  /**
   * Set up action handlers for notification buttons
   */
  private setupActionHandlers(): void {
    // Handle foreground events
    notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        await this.handleAction(detail.pressAction?.id, detail.notification?.data);
      } else if (type === EventType.PRESS) {
        // User tapped notification body - open app to call screen
        await this.handleOpenCall(detail.notification?.data);
      }
    });

    // Handle background events
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        await this.handleAction(detail.pressAction?.id, detail.notification?.data);
      } else if (type === EventType.PRESS) {
        await this.handleOpenCall(detail.notification?.data);
      }
    });
  }

  /**
   * Handle notification action button press
   */
  private async handleAction(actionId: string | undefined, data: any): Promise<void> {
    if (!actionId || !data) {
      return;
    }

    log('[ActiveCallNotification] Action pressed:', actionId);

    switch (actionId) {
      case 'toggle_mute':
        // Emit event that call screen can listen to
        this.emitCallAction('toggle_mute');
        // Update notification
        if (this.callData) {
          await this.updateActiveCallNotification({ isMuted: !this.callData.isMuted });
        }
        break;

      case 'toggle_camera':
        // Emit event that call screen can listen to
        this.emitCallAction('toggle_camera');
        // Update notification
        if (this.callData) {
          await this.updateActiveCallNotification({ isCameraOn: !this.callData.isCameraOn });
        }
        break;

      case 'switch_to_video':
        // Emit event to switch to video call
        this.emitCallAction('switch_to_video');
        break;

      case 'end_call':
        // Emit event to end call
        this.emitCallAction('end_call');
        await this.hideActiveCallNotification();
        break;

      case 'open_call':
        // Open app to call screen
        await this.handleOpenCall(data);
        break;
    }
  }

  /**
   * Handle opening call screen
   */
  private async handleOpenCall(data: any): Promise<void> {
    try {
      // This will be handled by the component that uses this service
      // The notification press action will launch the app, and the app
      // should navigate to the call screen based on the data
      log('[ActiveCallNotification] Opening call screen:', data);
      
      // Emit event to open call screen
      if (this.onOpenCallCallback) {
        this.onOpenCallCallback(data);
      }
    } catch (error) {
      error('[ActiveCallNotification] Error opening call screen:', error);
    }
  }

  /**
   * Callback for opening call screen
   */
  private onOpenCallCallback: ((data: any) => void) | null = null;

  /**
   * Set callback for opening call screen
   */
  public setOpenCallCallback(callback: (data: any) => void): void {
    this.onOpenCallCallback = callback;
  }

  /**
   * Emit call action event (to be handled by call screen)
   */
  private emitCallAction(action: string): void {
    // Use a custom event or callback system
    // For now, we'll use a simple approach with a callback
    if (this.onCallActionCallback) {
      this.onCallActionCallback(action);
    }
  }

  /**
   * Callback for call actions
   */
  private onCallActionCallback: ((action: string) => void) | null = null;

  /**
   * Set callback for call actions
   */
  public setCallActionCallback(callback: (action: string) => void): void {
    this.onCallActionCallback = callback;
  }

  /**
   * Format call duration
   */
  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Create notification channel for active calls (Android)
   */
  public async createNotificationChannel(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      await notifee.createChannel({
        id: 'active_calls',
        name: 'Active Calls',
        importance: AndroidImportance.HIGH,
        // Don't specify sound - will use channel default (no sound)
        vibration: false,
        lights: false,
      });
      log('[ActiveCallNotification] Channel created');
    } catch (error) {
      error('[ActiveCallNotification] Error creating channel:', error);
    }
  }
}

export const activeCallNotification = ActiveCallNotificationService.getInstance();

