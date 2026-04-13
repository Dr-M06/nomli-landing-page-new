import RNCallKeep, { IOptions } from 'react-native-callkeep';
import { Platform, Linking, NativeModules } from 'react-native';
import { log, warn, error } from './productionLogger';


interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callType: 'audio' | 'video';
  channelId?: string;
}

class CallKitService {
  private static instance: CallKitService;
  private isInitialized = false;
  private currentCallId: string | null = null;
  private router: any = null;
  private callDataMap: Map<string, IncomingCallData> = new Map();
  private answerCallCallback: ((callData: IncomingCallData) => void) | null = null;
  private endCallCallback: ((callId: string) => void) | null = null;

  private constructor() {}

  public static getInstance(): CallKitService {
    if (!CallKitService.instance) {
      CallKitService.instance = new CallKitService();
    }
    return CallKitService.instance;
  }

  /**
   * Check if device is in China region
   * CallKit must be disabled in China per MIIT requirements
   */
  private isChinaRegion(): boolean {
    try {
      // Check locale/region using multiple methods
      const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
      const region = locale.split('-')[1] || '';
      
      // Check if locale indicates China (zh-CN, zh-Hans-CN, etc.)
      if (locale.toLowerCase().includes('cn') || locale.toLowerCase().includes('zh-cn')) {
        log('[CallKit] 🇨🇳 China region detected, CallKit disabled');
        return true;
      }
      
      // Check region code
      if (region === 'CN') {
        log('[CallKit] 🇨🇳 China region detected (CN), CallKit disabled');
        return true;
      }
      
      // Fallback: Check using NativeModules if available
      if (Platform.OS === 'ios' && NativeModules.SettingsManager) {
        const appleLocale = NativeModules.SettingsManager?.settings?.AppleLocale || 
                           NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] || '';
        if (appleLocale.toLowerCase().includes('cn') || appleLocale.toLowerCase().includes('zh-cn')) {
          log('[CallKit] 🇨🇳 China region detected via NativeModules, CallKit disabled');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      warn('[CallKit] Error detecting region, defaulting to CallKit enabled:', error);
      return false;
    }
  }

  /**
   * Initialize CallKit service
   */
  public async initialize(router?: any): Promise<void> {
    if (this.isInitialized) {
      log('[CallKit] Already initialized');
      return;
    }

    // Disable CallKit for China region (per MIIT requirements)
    if (Platform.OS === 'ios' && this.isChinaRegion()) {
      log('[CallKit] ⚠️ CallKit disabled for China region per MIIT requirements');
      log('[CallKit] VoIP calls will still work, but without CallKit UI');
      this.isInitialized = false;
      return;
    }

    if (router) {
      this.router = router;
    }

    try {
      const options: IOptions = {
        ios: {
          appName: 'Nomli Mingle',
          supportsVideo: true,
          maximumCallGroups: 1,
          maximumCallsPerCallGroup: 1,
          // Icon and ringtone are optional - will use system defaults if not found
          // imageName: 'callkit-icon', // Optional: add to iOS bundle if you want custom icon
          // ringtoneSound: 'ringtone.mp3', // Optional: add to iOS bundle if you want custom ringtone
          includesCallsInRecents: true,
        },
        android: {
          alertTitle: 'Permissions required',
          alertDescription: 'This application needs to access your phone accounts',
          cancelButton: 'Cancel',
          okButton: 'ok',
          imageName: 'callkit-icon',
          additionalPermissions: [],
          // Required to get audio in background when using Android 11+
          selfManaged: false,
          foregroundService: {
            channelId: 'com.nomli.mingle2.call',
            channelName: 'Incoming Calls',
            notificationTitle: 'Incoming Call',
            notificationIcon: 'ic_notification',
          },
        },
      };

      await RNCallKeep.setup(options);
      
      // Wait a bit for setup to fully complete before adding listeners
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Try to set up event handlers, but don't fail if it doesn't work
      try {
        this.setupEventHandlers();
      } catch (listenerError) {
        warn('[CallKit] ⚠️ Some event listeners failed to register, but CallKit setup completed:', listenerError);
        // Continue anyway - CallKit will still work for displaying calls
      }
      
      this.isInitialized = true;
      log('[CallKit] ✅ Initialized successfully');
    } catch (error) {
      error('[CallKit] ❌ Initialization failed:', error);
      // Don't throw - allow app to continue without CallKit
      // The app will fall back to in-app call UI
      this.isInitialized = false;
    }
  }

  /**
   * Set up CallKit event handlers
   */
  private setupEventHandlers(): void {
    try {
      // Handle when user answers call from native UI
      RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
        log('[CallKit] 📞 Call answered:', callUUID);
        this.handleAnswerCall(callUUID);
      });
    } catch (error) {
      warn('[CallKit] Failed to add answerCall listener:', error);
    }

    try {
      // Handle when user declines call from native UI
      RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
        log('[CallKit] 📞 Call ended:', callUUID);
        this.handleEndCall(callUUID);
      });
    } catch (error) {
      warn('[CallKit] Failed to add endCall listener:', error);
    }

    try {
      // Handle when user performs call action
      RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ muted, callUUID }) => {
        log('[CallKit] 📞 Call muted:', muted, callUUID);
        // Handle mute action if needed
      });
    } catch (error) {
      warn('[CallKit] Failed to add didPerformSetMutedCallAction listener:', error);
    }

    try {
      // Handle when call is displayed
      RNCallKeep.addEventListener('displayIncomingCall', ({ error, callUUID, handle, localizedCallerName, hasVideo }) => {
        if (error) {
          error('[CallKit] ❌ Error displaying call:', error);
        } else {
          log('[CallKit] ✅ Call displayed:', { callUUID, handle, localizedCallerName, hasVideo });
        }
      });
    } catch (error) {
      warn('[CallKit] Failed to add displayIncomingCall listener:', error);
    }

    try {
      // Handle when call is activated
      RNCallKeep.addEventListener('didActivateAudioSession', () => {
        log('[CallKit] ✅ Audio session activated');
      });
    } catch (error) {
      warn('[CallKit] Failed to add didActivateAudioSession listener:', error);
    }

    try {
      // Handle when call is deactivated
      RNCallKeep.addEventListener('didDeactivateAudioSession', () => {
        log('[CallKit] 📞 Audio session deactivated');
      });
    } catch (error) {
      warn('[CallKit] Failed to add didDeactivateAudioSession listener:', error);
    }

    // Android specific: Handle when app is brought to foreground
    if (Platform.OS === 'android') {
      try {
        RNCallKeep.addEventListener('didReceiveStartCallAction', ({ handle, callUUID }) => {
          log('[CallKit] 📞 Start call action received:', { handle, callUUID });
          // Handle outgoing call if needed
        });
      } catch (error) {
        warn('[CallKit] Failed to add didReceiveStartCallAction listener:', error);
      }
    }
  }

  /**
   * Display incoming call in native UI
   */
  public async displayIncomingCall(callData: IncomingCallData): Promise<void> {
    try {
      // Skip CallKit if in China region
      if (Platform.OS === 'ios' && this.isChinaRegion()) {
        log('[CallKit] ⚠️ CallKit disabled for China region - skipping displayIncomingCall');
        throw new Error('CallKit disabled for China region');
      }
      
      if (!this.isInitialized) {
        warn('[CallKit] Not initialized, initializing now...');
        await this.initialize();
      }
      
      // Double-check initialization after potential async init
      if (!this.isInitialized) {
        throw new Error('CallKit not initialized');
      }

      const { callId, callerName, callType, channelId } = callData;
      this.currentCallId = callId;

      // Store call data for later retrieval
      this.callDataMap.set(callId, callData);

      const callUUID = callId;
      const handle = callData.callerId;
      const hasVideo = callType === 'video';

      log('[CallKit] 📞 Displaying incoming call:', {
        callUUID,
        handle,
        callerName,
        hasVideo,
      });

      log('[CallKit] Attempting to display incoming call on', Platform.OS);
      
      await RNCallKeep.displayIncomingCall(
        callUUID,
        handle,
        callerName,
        'number',
        hasVideo,
        callData.callerAvatar || undefined
      );

      log('[CallKit] ✅ Incoming call displayed successfully');
    } catch (error: any) {
      error('[CallKit] ❌ Error displaying incoming call:', error);
      error('[CallKit] Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
      });
      // Don't throw - let the caller handle fallback
      throw error;
    }
  }

  /**
   * End call in native UI
   */
  public async endCall(callId: string): Promise<void> {
    try {
      log('[CallKit] 📞 Ending call:', callId);
      await RNCallKeep.endCall(callId);
      this.currentCallId = null;
      log('[CallKit] ✅ Call ended successfully');
    } catch (error) {
      error('[CallKit] ❌ Error ending call:', error);
    }
  }

  /**
   * Report call as connected
   */
  public async reportCallConnected(callId: string): Promise<void> {
    try {
      log('[CallKit] 📞 Reporting call as connected:', callId);
      await RNCallKeep.reportConnectedOutgoingCallWithUUID(callId);
      log('[CallKit] ✅ Call reported as connected');
    } catch (error) {
      error('[CallKit] ❌ Error reporting call connected:', error);
    }
  }

  /**
   * Handle when user answers call from native UI
   */
  private async handleAnswerCall(callUUID: string): Promise<void> {
    try {
      log('[CallKit] 📞 Handling answer call:', callUUID);

      // Get stored call data
      const callData = this.callDataMap.get(callUUID);
      if (!callData) {
        error('[CallKit] ❌ Call data not found for:', callUUID);
        return;
      }

      // Update call status in database
      const { supabase } = await import('./supabase');
      await supabase
        .from('call_notifications')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', callUUID);

      // Navigate to call screen
      // Use Linking to navigate if router is not available
      if (this.router) {
        try {
          this.router.push({
            pathname: '/chat/video-call',
            params: {
              id: callData.channelId || callData.callId,
              name: callData.callerName,
              callType: callData.callType,
              isIncoming: 'true',
            },
          });
        } catch (routerError) {
          error('[CallKit] Router push failed, using Linking:', routerError);
          // Fallback to deep link
          const deepLink = `nomlimingle://chat/video-call?id=${callData.channelId || callData.callId}&name=${encodeURIComponent(callData.callerName)}&callType=${callData.callType}&isIncoming=true`;
          Linking.openURL(deepLink);
        }
      } else {
        // Fallback to deep link if router not available
        const deepLink = `nomlimingle://chat/video-call?id=${callData.channelId || callData.callId}&name=${encodeURIComponent(callData.callerName)}&callType=${callData.callType}&isIncoming=true`;
        Linking.openURL(deepLink);
      }

      // Call answer callback if set
      if (this.answerCallCallback) {
        this.answerCallCallback(callData);
      }

      // Report call as answered
      await RNCallKeep.reportConnectedOutgoingCallWithUUID(callUUID);
    } catch (error) {
      error('[CallKit] ❌ Error handling answer call:', error);
    }
  }

  /**
   * Handle when user ends call from native UI
   */
  private async handleEndCall(callUUID: string): Promise<void> {
    try {
      log('[CallKit] 📞 Handling end call:', callUUID);
      
      // Get stored call data
      const callData = this.callDataMap.get(callUUID);
      
      // Update call status in database
      const { supabase } = await import('./supabase');
      if (callUUID) {
        await supabase
          .from('call_notifications')
          .update({
            status: 'rejected',
            updated_at: new Date().toISOString(),
          })
          .eq('id', callUUID);
      }

      // Call end callback if set
      if (this.endCallCallback) {
        this.endCallCallback(callUUID);
      }

      // Clean up
      this.callDataMap.delete(callUUID);
      if (this.currentCallId === callUUID) {
        this.currentCallId = null;
      }
    } catch (error) {
      error('[CallKit] ❌ Error handling end call:', error);
    }
  }

  /**
   * Set router for navigation
   */
  public setRouter(router: any): void {
    this.router = router;
  }

  /**
   * Get current call ID
   */
  public getCurrentCallId(): string | null {
    return this.currentCallId;
  }

  /**
   * Check if CallKit is available
   */
  public isAvailable(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if there's an active call
   */
  public hasActiveCall(): boolean {
    return this.currentCallId !== null;
  }

  /**
   * Set callback for when call is answered
   */
  public setAnswerCallCallback(callback: (callData: IncomingCallData) => void): void {
    this.answerCallCallback = callback;
  }

  /**
   * Set callback for when call is ended
   */
  public setEndCallCallback(callback: (callId: string) => void): void {
    this.endCallCallback = callback;
  }

  /**
   * Get call data by call ID
   */
  public getCallData(callId: string): IncomingCallData | undefined {
    return this.callDataMap.get(callId);
  }
}

// Export singleton instance
export const callKitService = CallKitService.getInstance();
export default callKitService;

