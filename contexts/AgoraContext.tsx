import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import useAuth from '../hooks/useAuth';
import { fetchRtcToken } from '../utils/agoraTokenClient';
import { validateAgoraConfig } from '../utils/agoraConfig';

// Dynamic import for Agora to prevent immediate native module access
let AgoraModule: any = null;
const getAgoraModule = async () => {
  if (!AgoraModule) {
    try {
      // Use require instead of dynamic import for better compatibility
      AgoraModule = require('react-native-agora');
      console.log('✅ Agora module loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load Agora module:', error);
      return null;
    }
  }
  return AgoraModule;
};

// Type definitions for TypeScript (these don't import the actual module)
type IRtcEngine = any;
type ChannelMediaOptions = any;
type ClientRoleType = any;
type ConnectionStateType = any;
type RtcConnection = any;

// Token server (required for security)
const TOKEN_SERVER_URL = process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL;

interface AgoraContextType {
  isEngineReady: boolean;
  isInitialized: boolean;
  currentChannel: string | null;
  localUid: number | null;
  remoteUids: number[];
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed' | 'unknown';
  joinChannel: (channelName: string, isAudioOnly?: boolean) => Promise<boolean>;
  leaveChannel: () => Promise<void>;
  requestPermissions: (isAudioOnly?: boolean) => Promise<boolean>;
  initializeEngine: () => Promise<void>;
  cleanupAgoraEngine: () => Promise<void>;
  
  // Call functionality
  toggleCamera: () => void;
  toggleMic: () => void;
  switchCamera: () => void;
  setAudioOutput: (speakerOn: boolean) => void;
  startCameraPreview: () => Promise<void>;
  isCameraOn: boolean;
  isMicOn: boolean;
  hasCameraPermission: boolean;
  hasMicPermission: boolean;
  remoteUserCameraStates: Record<number, boolean>; // Track remote users' camera states
}

const AgoraContext = createContext<AgoraContextType | undefined>(undefined);

export const useAgoraContext = () => {
  const context = useContext(AgoraContext);
  if (!context) {
    throw new Error('useAgoraContext must be used within an AgoraProvider');
  }
  return context;
};

interface AgoraProviderProps {
  children: React.ReactNode;
}

export const AgoraProvider: React.FC<AgoraProviderProps> = ({ children }) => {
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<string | null>(null);
  const [localUid, setLocalUid] = useState<number | null>(null);
  const [remoteUids, setRemoteUids] = useState<number[]>([]);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed' | 'unknown'>('disconnected');
  const joinInProgressRef = useRef(false); // Prevent multiple simultaneous join attempts
  
  // Call functionality state
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [remoteUserCameraStates, setRemoteUserCameraStates] = useState<Record<number, boolean>>({});
  
  const engineRef = useRef<IRtcEngine | null>(null);
  const channelRef = useRef<string | null>(null);
  const isInitializingRef = useRef<boolean>(false);
  const remoteUidsRef = useRef<number[]>([]);

  // Initialize Agora engine using the original working approach
  const initializeEngine = async (appIdOverride?: string) => {
    try {
      // If engine exists and App ID matches, skip reinitialization
      if (engineRef.current && !appIdOverride) {
        console.log('✅ Engine already created, skipping init');
        setIsInitialized(true);
        setIsEngineReady(true);
        return;
      }
      if (isInitializingRef.current) {
        console.log('🔄 Initialization already in progress');
        return;
      }
      isInitializingRef.current = true;
      console.log('🔄 Initializing Agora engine...');
      
      // Reset state before initialization
      setIsInitialized(false);
      setIsEngineReady(false);
      
      // Request permissions first
      console.log('📹 Requesting camera and microphone permissions...');
      const permissionsGranted = await requestPermissions(false); // Request for video calls
      if (!permissionsGranted) {
        console.warn('⚠️ Permissions not granted, but continuing with initialization');
      }
      
      // Get Agora module dynamically (original working approach)
      console.log('🔄 Loading Agora module...');
      const AgoraRTC = await getAgoraModule();
      if (!AgoraRTC) {
        console.error('❌ Agora module not available');
        throw new Error('Agora module failed to load');
      }
      
      console.log('✅ Agora module loaded successfully');
      console.log('🔄 Creating Agora RTC engine...');
      
      // Release existing engine if reinitializing with different App ID
      if (engineRef.current && appIdOverride) {
        try {
          await engineRef.current.release();
          console.log('✅ Old engine released for reinitialization');
        } catch (releaseError) {
          console.warn('⚠️ Error releasing old engine:', releaseError);
        }
        engineRef.current = null;
      }
      
      const rtcEngine = AgoraRTC.createAgoraRtcEngine();
      
      if (!rtcEngine) {
        console.error('❌ Failed to create Agora RTC engine');
        throw new Error('Failed to create Agora RTC engine');
      }
      
      console.log('✅ Agora RTC engine created successfully');
      
      console.log('✅ Agora engine created, initializing...');
      
      // Use provided App ID, environment variable, or fallback to hardcoded App ID
      const appIdToUse = appIdOverride || process.env.EXPO_PUBLIC_AGORA_APP_ID || '';
      console.log('🔧 App ID for initialization:', appIdToUse.substring(0, 8) + '...');
      if (appIdOverride) {
        console.log('🔧 Using App ID from bootstrap/override');
      } else {
        console.log('🔧 Using App ID from environment variable or fallback');
      }
      console.log('🔍 About to initialize Agora with App ID:', appIdToUse.substring(0, 8) + '...');
      console.log('🔍 App ID length:', appIdToUse?.length);
      console.log('🔍 App ID type:', typeof appIdToUse);
      // Use RtcEngineContext instance to avoid "right operand of 'instanceof' is not callable" (Hermes)
      const context = AgoraRTC.RtcEngineContext
        ? Object.assign(new AgoraRTC.RtcEngineContext(), { appId: appIdToUse })
        : { appId: appIdToUse };
      const initResult = await rtcEngine.initialize(context);
      console.log('✅ Agora engine initialized successfully:', initResult);
      console.log('🔍 App ID used for initialization:', appIdToUse);
      engineRef.current = rtcEngine;
      
      // Enable video and audio by default
      try {
        console.log('📹 Enabling video and audio by default...');
        await rtcEngine.enableVideo();
        await rtcEngine.enableAudio();
        
        // Configure audio profile for high-quality calls with background support
        try {
          const { AudioProfileType, AudioScenarioType } = AgoraRTC;
          await rtcEngine.setAudioProfile(
            AudioProfileType.AudioProfileMusicHighQuality, // High quality audio
            AudioScenarioType.AudioScenarioGameStreaming  // Optimized for background audio
          );
          console.log('✅ Audio profile configured for calls (background support enabled)');
        } catch (audioProfileError) {
          console.warn('⚠️ Failed to set audio profile (may not be available):', audioProfileError);
          // Continue - audio will still work with defaults
        }
        
        // Ensure front camera is default (don't switch)
        console.log('📹 Front camera set as default (no switching)');
        console.log('✅ Video and audio enabled by default');
      } catch (mediaError) {
        console.error('❌ Failed to enable media by default:', mediaError);
      }
      
      // Set engine as ready immediately after initialization
      setIsInitialized(true);
      setIsEngineReady(true);
      console.log('🔍 Engine state set - isInitialized: true, isEngineReady: true');
      console.log('✅ Agora initialization complete and ready for use');
      
      // Get connection state types from Agora module
      const { ConnectionStateType } = AgoraRTC;
      
      // Set event handlers (original working approach)
      rtcEngine.addListener('onJoinChannelSuccess', (connection, elapsed) => {
        console.log('✅ Successfully joined channel');
        setLocalUid(connection.localUid || 0);
      });

      // Handle token lifecycle events for secure mode
      rtcEngine.addListener('onTokenPrivilegeWillExpire', async (connection) => {
        try {
          const channelName = channelRef.current;
          const uidToUse = localUid || connection?.localUid || 0;
          if (!channelName || !uidToUse) return;
          
          // Try to renew token using bootstrap API first, then fallback to token server
          try {
            const { fetchCallBootstrap } = await import('../utils/callBootstrap');
            const bootstrapData = await fetchCallBootstrap(channelName, true); // Assume audio for renewal
            await engineRef.current?.renewToken(bootstrapData.token);
            console.log('🔐 Token renewed successfully via bootstrap API');
          } catch (bootstrapError) {
            // Fallback to token server if bootstrap fails
            const tokenServerUrl = process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL;
            if (tokenServerUrl && tokenServerUrl.length > 0) {
              console.log('🔐 Token will expire soon, renewing via token server...');
              const newToken = await fetchRtcToken({ channelName, uid: uidToUse, role: 'broadcaster' });
              await engineRef.current?.renewToken(newToken);
              console.log('🔐 Token renewed successfully via token server');
            } else {
              console.warn('⚠️ Cannot renew token - neither bootstrap API nor token server available');
            }
          }
        } catch (e) {
          console.error('❌ Failed to renew token:', e);
        }
      });
      
      rtcEngine.addListener('onError', (err, msg) => {
        // SUPPRESS ERROR 110 IF NOT IN ACTIVE VIDEO CALL
        // Error 110 might be from LiveStreamProvider's engine, not this one
        // Only show error if we're actually in a video call (have a channel)
        const isInActiveCall = channelRef.current !== null;
        
        console.error('❌ Agora error:', err, msg);
        console.error('❌ Error details:', { err, msg, appIdUsed: appIdToUse, isInActiveCall });
        
        // Handle specific error codes
        if (err === 110) {
          // Only show error if we're actually in a video call
          // This prevents showing errors from LiveStreamProvider's engine
          if (isInActiveCall) {
            console.error('❌ Video Call Error 110: Invalid App ID');
            console.error('❌ App ID that was used:', appIdToUse);
            console.error('❌ App ID length:', appIdToUse?.length);
            console.error('❌ Please check your video call configuration');
            
            // Show user-friendly error without exposing service name
            Alert.alert(
              'Connection Error',
              'Unable to connect to video call service. Please try again later or contact support if the problem persists.',
              [{ text: 'OK' }]
            );
          } else {
            console.log('⚠️ [AgoraProvider] Suppressing error 110 - not in active video call (likely from LiveStreamProvider)');
          }
        } else if (err === 17) {
          console.error('❌ Video Call Error 17: Failed to initialize local video stream');
          console.error('❌ This is usually a camera permission or hardware issue');
          Alert.alert(
            'Camera Error',
            'Failed to initialize camera. Please check camera permissions and try again.',
            [{ text: 'OK' }]
          );
        }
      });
      
      rtcEngine.addListener('onUserJoined', async (connection, remoteUid, elapsed) => {
        console.log('👤 [USER_JOINED] Remote user joined:', remoteUid, 'elapsed:', elapsed);
        setRemoteUids(prev => {
          const newUids = prev.includes(remoteUid) ? prev : [...prev, remoteUid];
          remoteUidsRef.current = newUids; // Update ref
          return newUids;
        });
        // Assume camera is on when user joins (will be updated by onUserMuteVideo)
        setRemoteUserCameraStates(prev => ({ ...prev, [remoteUid]: true }));
        
        // CRITICAL: Explicitly enable and unmute remote audio when user joins
        // This ensures users can hear each other when answering calls
        console.log('🎤 [USER_JOINED] Attempting to unmute remote audio for UID:', remoteUid);
        try {
          // Add small delay to ensure remote stream is ready
          await new Promise(resolve => setTimeout(resolve, 200));
          await rtcEngine.muteRemoteAudioStream(remoteUid, false);
          console.log('✅ [USER_JOINED] Remote audio enabled and unmuted for UID:', remoteUid);
        } catch (error) {
          console.warn('⚠️ [USER_JOINED] Could not enable remote audio (may already be enabled):', error);
          console.warn('⚠️ [USER_JOINED] Error details:', {
            message: error?.message,
            name: error?.name,
            uid: remoteUid
          });
        }
        
        // CRITICAL: Explicitly unmute remote video when user joins (for video calls)
        // This ensures receiver can see caller's video, fixing dark screen issue
        // Even though autoSubscribeVideo is enabled, explicitly unmuting ensures video is visible
        console.log('📹 [USER_JOINED] Attempting to unmute remote video for UID:', remoteUid);
        try {
          // Add delay to ensure remote video stream is ready
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // CRITICAL: Force unmute by muting first, then unmuting (more reliable)
          // This pattern works better than just unmuting directly
          await rtcEngine.muteRemoteVideoStream(remoteUid, true); // Mute first
          await new Promise(resolve => setTimeout(resolve, 50));
          await rtcEngine.muteRemoteVideoStream(remoteUid, false); // Then unmute
          
          console.log('✅ [USER_JOINED] Remote video enabled and unmuted for UID:', remoteUid);
        } catch (error) {
          console.warn('⚠️ [USER_JOINED] Could not enable remote video (may already be enabled):', error);
          console.warn('⚠️ [USER_JOINED] Video error details:', {
            message: error?.message,
            name: error?.name,
            uid: remoteUid
          });
        }
      });
      
      // Also handle when remote user publishes audio stream
      rtcEngine.addListener('onUserAudioPublished', async (connection, remoteUid, elapsed) => {
        console.log('🎤 [AUDIO_PUBLISHED] Remote user published audio:', remoteUid, 'elapsed:', elapsed);
        try {
          await rtcEngine.muteRemoteAudioStream(remoteUid, false);
          console.log('✅ [AUDIO_PUBLISHED] Subscribed to remote audio for UID:', remoteUid);
        } catch (error) {
          console.warn('⚠️ [AUDIO_PUBLISHED] Could not subscribe to remote audio (may already be subscribed):', error);
          console.warn('⚠️ [AUDIO_PUBLISHED] Error details:', {
            message: error?.message,
            name: error?.name,
            uid: remoteUid
          });
        }
      });
      
      // CRITICAL: Handle when remote user publishes video stream
      // This ensures receiver can see caller's video when it's published
      rtcEngine.addListener('onUserVideoPublished', async (connection, remoteUid, elapsed) => {
        console.log('📹 [VIDEO_PUBLISHED] Remote user published video:', remoteUid, 'elapsed:', elapsed);
        try {
          // Force unmute by muting first, then unmuting (more reliable)
          await rtcEngine.muteRemoteVideoStream(remoteUid, true); // Mute first
          await new Promise(resolve => setTimeout(resolve, 50));
          await rtcEngine.muteRemoteVideoStream(remoteUid, false); // Then unmute
          console.log('✅ [VIDEO_PUBLISHED] Subscribed to remote video for UID:', remoteUid);
        } catch (error) {
          console.warn('⚠️ [VIDEO_PUBLISHED] Could not subscribe to remote video (may already be subscribed):', error);
          console.warn('⚠️ [VIDEO_PUBLISHED] Error details:', {
            message: error?.message,
            name: error?.name,
            uid: remoteUid
          });
        }
      });
      
      // Handle remote audio state changes to ensure audio is unmuted
      rtcEngine.addListener('onRemoteAudioStateChanged', (uid: number, state: number, reason: number, elapsed: number) => {
        const stateName = state === 0 ? 'STOPPED' : state === 1 ? 'STARTING' : state === 2 ? 'DECODING' : state === 3 ? 'FAILED' : state === 4 ? 'FROZEN' : 'UNKNOWN';
        console.log('🎧 [AUDIO_STATE] Remote audio state changed:', {
          uid,
          state,
          stateName,
          reason,
          elapsed,
        });
        
        // If audio is starting/decoding, ensure it's not muted
        if (state === 1 || state === 2) {
          console.log('🎧 [AUDIO_STATE] Audio is starting/decoding, ensuring unmuted for UID:', uid);
          try {
            rtcEngine.muteRemoteAudioStream(uid, false);
            console.log('✅ [AUDIO_STATE] Ensured remote audio is unmuted for UID:', uid);
          } catch (error) {
            console.warn('⚠️ [AUDIO_STATE] Could not unmute remote audio:', error);
            console.warn('⚠️ [AUDIO_STATE] Error details:', {
              message: error?.message,
              name: error?.name,
              uid,
              state
            });
          }
        } else if (state === 0) {
          console.log('🎧 [AUDIO_STATE] Remote audio stopped for UID:', uid);
        } else if (state === 3) {
          console.error('❌ [AUDIO_STATE] Remote audio failed for UID:', uid, 'reason:', reason);
        }
      });
      
      rtcEngine.addListener('onUserOffline', (connection, remoteUid, reason) => {
        console.log('👋 [USER_OFFLINE] Remote user left:', remoteUid, 'reason:', reason);
        setRemoteUids(prev => {
          const newUids = prev.filter(uid => uid !== remoteUid);
          remoteUidsRef.current = newUids; // Update ref
          return newUids;
        });
        // Clean up camera state for this user
        setRemoteUserCameraStates(prev => {
          const newStates = { ...prev };
          delete newStates[remoteUid];
          return newStates;
        });
      });
      
      // Track when remote users toggle their camera
      rtcEngine.addListener('onUserMuteVideo', (connection, remoteUid, muted) => {
        console.log(`📹 Remote user ${remoteUid} ${muted ? 'disabled' : 'enabled'} their camera`);
        setRemoteUserCameraStates(prev => ({ ...prev, [remoteUid]: !muted }));
      });
      
      rtcEngine.addListener('onConnectionStateChanged', (connection, state, reason) => {
        // Map Agora connection state codes to string values
        // Agora ConnectionStateType: 0=DISCONNECTED, 1=CONNECTING, 2=CONNECTED, 3=RECONNECTING, 4=FAILED
        const stateMap: { [key: number]: string } = {
          0: 'disconnected',
          1: 'connecting',
          2: 'connected',
          3: 'reconnecting',
          4: 'failed'
        };
        
        const stateString = (stateMap[state] || 'unknown') as 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed' | 'unknown';
        console.log('🔄 [CONNECTION_STATE] Connection state changed:', {
          state,
          stateString,
          reason,
          channel: channelRef.current,
          hasRemoteUsers: remoteUidsRef.current.length > 0
        });
        
        // CRITICAL: Always update connection state - this is how video-call.tsx knows the call is connected
        // This state update triggers the useEffect in video-call.tsx that marks the call as connected
        setConnectionState(stateString);
        
        // Log for calls specifically
        if (channelRef.current) {
          console.log('📞 [CALL] Connection state updated for active call:', {
            state: stateString,
            reason,
            channel: channelRef.current,
            remoteUsers: remoteUidsRef.current.length
          });
        }
        
        // If connected, ensure remote audio is enabled for all existing remote users
        if (stateString === 'connected') {
          // Use setTimeout to ensure remote users are detected and streams are ready
          setTimeout(() => {
            const currentRemoteUids = [...remoteUidsRef.current];
            if (currentRemoteUids.length > 0) {
              console.log('🎤 [CONNECTION_STATE] Connection established, ensuring remote audio for existing users:', currentRemoteUids);
              currentRemoteUids.forEach(async (uid) => {
                try {
                  await rtcEngine.muteRemoteAudioStream(uid, false);
                  console.log('✅ [CONNECTION_STATE] Remote audio unmuted for UID:', uid);
                } catch (error) {
                  console.warn('⚠️ [CONNECTION_STATE] Could not unmute remote audio for UID:', uid, error);
                }
              });
            } else {
              console.log('ℹ️ [CONNECTION_STATE] Connection established but no remote users yet');
            }
          }, 500); // Small delay to ensure remote users are detected and streams are ready
        }
      });
      
      // Request permissions
      await requestPermissions();
      
    } catch (error) {
      console.error('❌ Failed to initialize Agora engine:', error);
      setIsInitialized(false);
      setIsEngineReady(false);
    } finally {
      isInitializingRef.current = false;
    }
  };

  // Request camera and microphone permissions
  const requestPermissions = async (isAudioOnly: boolean = false): Promise<boolean> => {
    try {
      console.log('[AgoraContext] Requesting permissions... Audio only:', isAudioOnly);
      
      // Always request microphone permission
      const audioStatus = await Audio.requestPermissionsAsync();
      setHasMicPermission(audioStatus.status === 'granted');
      
      let cameraStatus = { status: 'granted' }; // Default to granted for audio-only
      
      // Only request camera permission for video calls
      if (!isAudioOnly) {
        cameraStatus = await Camera.requestCameraPermissionsAsync();
        setHasCameraPermission(cameraStatus.status === 'granted');
      } else {
        setHasCameraPermission(false); // Not needed for audio-only
      }
      
      // For audio-only calls, only require microphone permission
      // For video calls, require both camera and microphone
      const hasRequiredPermissions = isAudioOnly 
        ? audioStatus.status === 'granted'
        : (cameraStatus.status === 'granted' && audioStatus.status === 'granted');
      
      if (!hasRequiredPermissions) {
        console.log('[AgoraContext] Required permissions not granted - Camera:', cameraStatus.status, 'Audio:', audioStatus.status);
        const message = isAudioOnly 
          ? 'Microphone permission is required for audio calls.'
          : 'Camera and microphone permissions are required for video calls.';
        Alert.alert(
          'Permissions Required',
          message,
          [{ text: 'OK' }]
        );
      } else {
        console.log('[AgoraContext] All required permissions granted for', isAudioOnly ? 'audio-only' : 'video', 'call');
      }
      
      return hasRequiredPermissions;
    } catch (error) {
      console.error('[AgoraContext] Error requesting permissions:', error);
      return false;
    }
  };

  // Join channel using original working approach
  // LAZY INITIALIZATION: Initialize engine on-demand when joinChannel is called
  const joinChannel = async (channelName: string, isAudioOnly: boolean = false): Promise<boolean> => {
    // CRITICAL: Prevent multiple simultaneous join attempts (prevents error -17)
    if (joinInProgressRef.current) {
      console.warn('⚠️ [JOIN] Join already in progress, skipping duplicate request');
      return false;
    }
    
    joinInProgressRef.current = true;
    
    try {
      // LAZY INITIALIZATION: Initialize engine if not already initialized
      // This prevents AgoraProvider from interfering with LiveStreamProvider
      if (!engineRef.current || !isEngineReady || !isInitialized) {
        console.log('📞 [AgoraProvider] Engine not initialized - initializing on-demand for call...');
        console.log('📞 [AgoraProvider] Current state:', {
          hasEngine: !!engineRef.current,
          isEngineReady,
          isInitialized
        });
        try {
          await initializeEngine();
          // Wait a moment for engine to be ready and state to update
          // The initializeEngine function sets isEngineReady and isInitialized synchronously
          // But we wait a bit to ensure React state has updated
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Double-check state after initialization
          console.log('📞 [AgoraProvider] After initialization:', {
            hasEngine: !!engineRef.current,
            isEngineReady,
            isInitialized
          });
        } catch (initError) {
          console.error('❌ Failed to initialize Agora engine on-demand:', initError);
          return false;
        }
      }
      
      // Final check - ensure engine is ready
      if (!engineRef.current) {
        console.error('❌ Agora engine is null after initialization attempt');
        return false;
      }
      
      if (!isEngineReady || !isInitialized) {
        console.warn('⚠️ Agora engine exists but flags not set:', {
          hasEngine: !!engineRef.current,
          isEngineReady,
          isInitialized,
          note: 'This may be a state update delay - continuing anyway'
        });
        // Continue anyway - the engine exists and should work
        // The flags might just be delayed in updating
      }
      
      console.log('🔄 Joining channel:', channelName, 'Audio only:', isAudioOnly);
      
      // 🚀 ADAPTIVE QUALITY: Detect network speed and adjust quality automatically
      if (!isAudioOnly) {
        try {
          const { getAdaptiveQualityForCall, shouldUseAudioOnly, detectNetworkSpeed } = await import('../utils/adaptiveQualityManager');
          const speedInfo = await detectNetworkSpeed();
          
          // Check if network is too poor for video - switch to audio-only
          if (shouldUseAudioOnly(speedInfo)) {
            console.log('📉 [ADAPTIVE] Network too poor for video, switching to audio-only mode');
            isAudioOnly = true; // Override to audio-only
          } else {
            // Get adaptive quality config
            const qualityConfig = await getAdaptiveQualityForCall();
            console.log('📊 [ADAPTIVE] Setting video quality based on network:', {
              width: qualityConfig.width,
              height: qualityConfig.height,
              bitrate: qualityConfig.bitrate,
              frameRate: qualityConfig.frameRate,
              speed: speedInfo.speed,
              estimatedKbps: speedInfo.estimatedKbps,
            });
            
            // Apply video encoder configuration
            try {
              await engineRef.current.setVideoEncoderConfiguration({
                width: qualityConfig.width,
                height: qualityConfig.height,
                bitrate: qualityConfig.bitrate,
                frameRate: qualityConfig.frameRate,
                minBitrate: qualityConfig.minBitrate,
                maxBitrate: qualityConfig.maxBitrate,
              });
              console.log('✅ [ADAPTIVE] Video quality configured for network speed');
            } catch (configError) {
              console.warn('⚠️ [ADAPTIVE] Failed to set video encoder config:', configError);
            }
          }
        } catch (adaptiveError) {
          console.warn('⚠️ [ADAPTIVE] Error detecting network speed, using defaults:', adaptiveError);
        }
      }
      
      setCurrentChannel(channelName);
      channelRef.current = channelName;
      
      // Get Agora module for types and constants (original working approach)
      const AgoraRTC = await getAgoraModule();
      if (!AgoraRTC) {
        console.error('❌ Agora module not available for joining channel');
        return false;
      }
      
      // Set channel options using dynamic module (original working approach)
      const options = {
        channelProfile: 1, // Communication profile
        clientRoleType: AgoraRTC.ClientRoleType?.ClientRoleBroadcaster || 1,
        publishMicrophoneTrack: true,
        publishCameraTrack: !isAudioOnly,
        autoSubscribeAudio: true,
        autoSubscribeVideo: !isAudioOnly
      };
      
      console.log('🔄 [JOIN] Joining channel with options:', {
        channelProfile: options.channelProfile,
        clientRoleType: options.clientRoleType,
        publishMicrophoneTrack: options.publishMicrophoneTrack,
        publishCameraTrack: options.publishCameraTrack,
        autoSubscribeAudio: options.autoSubscribeAudio,
        autoSubscribeVideo: options.autoSubscribeVideo,
        isAudioOnly
      });
      
      // Note: Remote video is automatically subscribed via autoSubscribeVideo option
      // No need to explicitly enable - it's handled by the SDK
      
      // Use call bootstrap API (same infrastructure as livestreams)
      let uidToUse: number;
      let tokenToUse = '';
      let appIdToUse: string | undefined;
      
      try {
        console.log('📞 [CALL] Using call bootstrap API for token and configuration...');
        console.log('📞 [CALL] Bootstrap request:', { channelName, isAudioOnly, callType: isAudioOnly ? 'audio' : 'video' });
        const { fetchCallBootstrap } = await import('../utils/callBootstrap');
        const bootstrapData = await fetchCallBootstrap(channelName, isAudioOnly ? 'audio' : 'video');
        
        console.log('📞 [CALL] Bootstrap response received:', {
          hasToken: !!bootstrapData.token,
          tokenLength: bootstrapData.token?.length || 0,
          tokenPrefix: bootstrapData.token?.substring(0, 10) || 'N/A',
          hasAppId: !!bootstrapData.appId,
          appId: bootstrapData.appId?.substring(0, 8) + '...' || 'N/A',
          uid: bootstrapData.uid,
          channelName: bootstrapData.channelName,
          callType: bootstrapData.callType
        });
        
        tokenToUse = bootstrapData.token;
        uidToUse = bootstrapData.uid;
        appIdToUse = bootstrapData.appId;
        
        // CRITICAL: Reinitialize engine with correct App ID from bootstrap if different
        if (appIdToUse && engineRef.current) {
          const currentAppId = process.env.EXPO_PUBLIC_AGORA_APP_ID || '';
          
          // Check if App ID from bootstrap is different from what engine was initialized with
          if (appIdToUse !== currentAppId) {
            console.log('🔄 [CALL] App ID mismatch detected! Reinitializing engine with bootstrap App ID...');
            console.log('🔄 [CALL] Old App ID:', currentAppId.substring(0, 8) + '...');
            console.log('🔄 [CALL] New App ID:', appIdToUse.substring(0, 8) + '...');
            
            // Reinitialize with correct App ID (initializeEngine will handle releasing old engine)
            isInitializingRef.current = false; // Reset flag to allow reinitialization
            await initializeEngine(appIdToUse);
            console.log('✅ [CALL] Engine reinitialized with bootstrap App ID');
          } else {
            console.log('✅ [CALL] Using App ID from bootstrap (matches current):', appIdToUse.substring(0, 8) + '...');
          }
        }
        
        setLocalUid(uidToUse);
        console.log('✅ [CALL] Bootstrap data received, UID:', uidToUse);
      } catch (bootstrapError) {
        console.error('⚠️ [CALL] Bootstrap API failed, falling back to direct token fetch:', bootstrapError);
        
        // Fallback to direct token fetching (old method)
        uidToUse = localUid || Math.floor(Math.random() * 100000) + 1;
        setLocalUid(uidToUse);
        
        try {
          // Try fallback token server only if configured
          const tokenServerUrl = process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL;
          if (tokenServerUrl && tokenServerUrl.length > 0) {
            console.log('🔐 [CALL] Fallback: Fetching RTC token from token server...');
            tokenToUse = await fetchRtcToken({ channelName, uid: uidToUse, role: 'broadcaster' });
            console.log('🔐 [CALL] Fallback: Token fetched successfully');
          } else {
            console.log('ℹ️ [CALL] Fallback: Token server not configured, joining without token (bootstrap API is preferred)');
            // Don't show error - bootstrap API is the primary method
          }
        } catch (tokenError) {
          console.error('⚠️ [CALL] Fallback: Failed to fetch token, joining without token:', tokenError);
          tokenToUse = '';
        }
      }

      // For video calls, initialize camera BEFORE joining channel to prevent dark screen
      if (!isAudioOnly) {
        console.log('📹 Initializing camera BEFORE joining channel...');
        setIsCameraOn(true);
        
        // Enable local video first
        try {
          await engineRef.current.enableLocalVideo(true);
          console.log('📹 Local video enabled');
          
          // Start camera preview BEFORE joining to ensure camera is ready
          await engineRef.current.startPreview();
          console.log('📹 Camera preview started successfully BEFORE joining');
          
          // Wait a bit to ensure camera is fully initialized
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (previewError) {
          console.error('📹 Error starting preview before join:', previewError);
          // Try again after a short delay
          try {
            await new Promise(resolve => setTimeout(resolve, 500));
            await engineRef.current.enableLocalVideo(true);
            await engineRef.current.startPreview();
            console.log('📹 Camera preview started on retry');
          } catch (retryError) {
            console.error('📹 Failed to start preview on retry:', retryError);
          }
        }
      } else {
        // For audio-only calls, turn off camera
        setIsCameraOn(false);
        await engineRef.current.enableLocalVideo(false);
      }
      
      // CRITICAL: Leave current channel if already in one (prevents error -17)
      // Error -17 (ERR_JOIN_CHANNEL_REJECTED) often occurs when trying to join while already in a channel
      if (channelRef.current && engineRef.current) {
        const currentChannel = channelRef.current;
        if (currentChannel !== channelName) {
          console.log('🔄 [JOIN] Leaving current channel before joining new one:', currentChannel);
          try {
            await engineRef.current.leaveChannel();
            console.log('✅ [JOIN] Left previous channel');
            // Wait a bit for cleanup
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (leaveError) {
            console.warn('⚠️ [JOIN] Error leaving previous channel (may not be in channel):', leaveError);
          }
        } else {
          console.log('ℹ️ [JOIN] Already in the same channel, skipping leave');
        }
      }
      
      // Ensure engine is ready before joining
      if (!engineRef.current) {
        console.error('❌ [JOIN] Engine not available - cannot join channel');
        return false;
      }
      
      // Now join the channel with camera already initialized
      console.log('🔄 [JOIN] Joining channel now:', {
        channelName,
        uid: uidToUse,
        hasToken: !!tokenToUse,
        tokenLength: tokenToUse?.length || 0,
        tokenPrefix: tokenToUse?.substring(0, 15) || 'N/A',
        isAudioOnly,
        engineReady: isEngineReady,
        hasEngine: !!engineRef.current,
        currentChannel: channelRef.current || 'none'
      });
      
      const joinStartTime = Date.now();
      const joinResult = await engineRef.current.joinChannel(tokenToUse, channelName, uidToUse, options);
      const joinDuration = Date.now() - joinStartTime;
      
      // Check join result - 0 means success
      if (joinResult !== 0) {
        console.error('❌ [JOIN] Channel join failed with code:', joinResult);
        console.error('❌ [JOIN] Join duration:', joinDuration, 'ms');
        
        // Provide detailed error information for -17
        if (joinResult === -17) {
          console.error('❌ [JOIN] Error -17 (ERR_JOIN_CHANNEL_REJECTED) details:', {
            errorCode: joinResult,
            channelName,
            uid: uidToUse,
            hasToken: !!tokenToUse,
            tokenLength: tokenToUse?.length || 0,
            tokenPrefix: tokenToUse?.substring(0, 15) || 'N/A',
            appId: appIdToUse?.substring(0, 8) + '...' || 'N/A',
            engineReady: isEngineReady,
            currentChannel: channelRef.current || 'none',
            possibleCauses: [
              'Already in a channel (should be handled by leaveChannel above)',
              'Invalid token or expired token',
              'Engine not fully initialized',
              'Channel name format invalid',
              'Network issue'
            ]
          });
        }
        
        // Reset join in progress flag on failure
        joinInProgressRef.current = false;
        return false;
      }
      
      console.log('✅ [JOIN] Channel join completed successfully in', joinDuration, 'ms');
      
      // Reset join in progress flag on success
      joinInProgressRef.current = false;

      // Configure audio profile after joining channel for better background audio support
      try {
        const { AudioProfileType, AudioScenarioType } = AgoraRTC;
        await engineRef.current.setAudioProfile(
          AudioProfileType.AudioProfileMusicHighQuality, // High quality audio
          AudioScenarioType.AudioScenarioGameStreaming  // Optimized for background audio
        );
        console.log('✅ Audio profile configured after joining channel (background support)');
      } catch (audioProfileError) {
        console.warn('⚠️ Failed to set audio profile after join:', audioProfileError);
        // Continue - audio will still work
      }

      // Reset mic state to unmuted when joining a new channel
      console.log('🎤 [AUDIO] Resetting mic state to unmuted...');
      setIsMicOn(true);
      
      // Ensure local audio is enabled and unmuted after joining
      console.log('🎤 [AUDIO] Enabling local audio after join...');
      try {
        await engineRef.current.enableLocalAudio(true);
        console.log('✅ [AUDIO] Local audio enabled');
        
        await engineRef.current.muteLocalAudioStream(false);
        console.log('✅ [AUDIO] Local audio stream unmuted');
        
        console.log('✅ [AUDIO] Local audio fully enabled and unmuted after joining channel (mic state reset)');
      } catch (audioError) {
        console.error('⚠️ [AUDIO] Error ensuring local audio after join:', audioError);
        console.error('⚠️ [AUDIO] Error details:', {
          message: audioError?.message,
          stack: audioError?.stack,
          name: audioError?.name
        });
      }
      
      // Note: Remote audio is automatically subscribed via autoSubscribeAudio option
      // Remote audio will be unmuted when users join via onUserJoined event handler
      console.log('🎤 [AUDIO] Remote audio subscription:', {
        autoSubscribeAudio: options.autoSubscribeAudio,
        note: 'Remote audio will be unmuted via event handlers when users join'
      });
      
      // For video calls, ensure camera stays on after joining
      if (!isAudioOnly) {
        try {
          // Double-check camera is still enabled after joining
          await engineRef.current.enableLocalVideo(true);
          console.log('📹 Camera confirmed enabled after joining channel');
          
          // Note: Remote video is automatically subscribed via autoSubscribeVideo option
          // Remote video will be unmuted when users join via onUserJoined event handler
          console.log('📹 Remote video subscription handled automatically via autoSubscribeVideo');
        } catch (error) {
          console.error('📹 Error ensuring video after join:', error);
        }
      }
      
      console.log('✅ Successfully joined channel:', channelName);
      return true;
      
    } catch (error) {
      console.error('❌ Error joining channel:', error);
      // Reset join in progress flag on error
      joinInProgressRef.current = false;
      return false;
    }
  };

  // Leave the current channel
  const leaveChannel = async (): Promise<void> => {
    try {
      // Reset join in progress flag when leaving
      joinInProgressRef.current = false;
      
      if (engineRef.current && currentChannel) {
        console.log('[AgoraContext] Leaving channel:', currentChannel);
        
        // Stop local video preview before leaving
        try {
          await engineRef.current.stopPreview();
          console.log('📹 Stopped local video preview');
        } catch (previewError) {
          console.log('Note: Preview was not running or already stopped');
        }
        
        await engineRef.current.leaveChannel();
        setCurrentChannel(null);
        setLocalUid(null);
        setRemoteUids([]);
        remoteUidsRef.current = []; // Update ref
        channelRef.current = null;
        
        // Reset mic and camera states when leaving channel
        setIsMicOn(true);
        setIsCameraOn(true);
        console.log('[AgoraContext] Left channel successfully and reset mic/camera states');
      }
    } catch (error) {
      console.error('[AgoraContext] Error leaving channel:', error);
    }
  };

  // Toggle camera on/off
  const toggleCamera = async () => {
    if (!engineRef.current) {
      console.error('📹 Engine not ready for camera toggle');
      return;
    }
    
    try {
      const newState = !isCameraOn;
      console.log(`📹 Toggling camera to ${newState ? 'ON' : 'OFF'}...`);
      
      if (newState) {
        // Enable video first
        await engineRef.current.enableLocalVideo(true);
        await new Promise(resolve => setTimeout(resolve, 200)); // Wait for video to initialize
        
        // Start preview when turning camera on
        await engineRef.current.startPreview();
        console.log('📹 Camera enabled and preview started');
      } else {
        // Stop preview first
        await engineRef.current.stopPreview();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Then disable video
        await engineRef.current.enableLocalVideo(false);
        console.log('📹 Camera disabled and preview stopped');
      }
      
      setIsCameraOn(newState);
      console.log('[AgoraContext] Camera toggled:', newState ? 'ON' : 'OFF');
    } catch (error) {
      console.error('[AgoraContext] Error toggling camera:', error);
      
      // Try to recover by forcing the state
      try {
        if (!isCameraOn) {
          await engineRef.current.enableLocalVideo(true);
          await engineRef.current.startPreview();
          setIsCameraOn(true);
          console.log('📹 Camera recovery successful - enabled');
        } else {
          await engineRef.current.stopPreview();
          await engineRef.current.enableLocalVideo(false);
          setIsCameraOn(false);
          console.log('📹 Camera recovery successful - disabled');
        }
      } catch (recoveryError) {
        console.error('[AgoraContext] Camera recovery failed:', recoveryError);
      }
    }
  };

  // Toggle microphone on/off
  const toggleMic = () => {
    if (!engineRef.current) return;
    
    try {
      const newState = !isMicOn;
      engineRef.current.enableLocalAudio(newState);
      setIsMicOn(newState);
      console.log('[AgoraContext] Microphone toggled:', newState ? 'ON' : 'OFF');
    } catch (error) {
      console.error('[AgoraContext] Error toggling microphone:', error);
    }
  };

  // Start camera preview manually
  const startCameraPreview = async (): Promise<void> => {
    if (!engineRef.current) {
      console.error('📹 Engine not ready for camera preview');
      return;
    }
    
    try {
      console.log('📹 Starting camera preview manually...');
      
      // Ensure video is enabled first
      await engineRef.current.enableLocalVideo(true);
      await new Promise(resolve => setTimeout(resolve, 300)); // Wait for video to initialize
      
      // Start preview
      await engineRef.current.startPreview();
      setIsCameraOn(true);
      console.log('📹 Camera preview started successfully with front camera (default)');
      
    } catch (error) {
      console.error('[AgoraContext] Error starting camera preview:', error);
      
      // Try alternative approach with more aggressive retry
      try {
        console.log('📹 Trying alternative camera start...');
        
        // Force disable and re-enable
        await engineRef.current.enableLocalVideo(false);
        await new Promise(resolve => setTimeout(resolve, 200));
        await engineRef.current.enableLocalVideo(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Start preview
        await engineRef.current.startPreview();
        setIsCameraOn(true);
        console.log('📹 Alternative camera start successful');
        
      } catch (retryError) {
        console.error('[AgoraContext] Alternative camera start failed:', retryError);
        
        // Final attempt with minimal setup
        try {
          console.log('📹 Final camera attempt...');
          await engineRef.current.enableLocalVideo(true);
          await engineRef.current.startPreview();
          setIsCameraOn(true);
          console.log('📹 Final camera attempt successful');
        } catch (finalError) {
          console.error('[AgoraContext] All camera attempts failed:', finalError);
        }
      }
    }
  };

  // Switch camera (front/back)
  const switchCamera = () => {
    if (!engineRef.current) return;
    
    try {
      engineRef.current.switchCamera();
      console.log('[AgoraContext] Camera switched');
    } catch (error) {
      console.error('[AgoraContext] Error switching camera:', error);
    }
  };

  // Set audio output (speaker/earpiece)
  const setAudioOutput = (speakerOn: boolean) => {
    if (!engineRef.current) return;
    
    try {
      engineRef.current.setEnableSpeakerphone(speakerOn);
      console.log('[AgoraContext] Audio output set to:', speakerOn ? 'SPEAKER' : 'EARPIECE');
    } catch (error) {
      console.error('[AgoraContext] Error setting audio output:', error);
    }
  };

  // Clean up Agora engine
  const cleanupAgoraEngine = async (): Promise<void> => {
    try {
      console.log('[AgoraContext] Cleaning up Agora engine...');
      
      if (engineRef.current) {
        try {
          await engineRef.current.leaveChannel();
        } catch (e) {
          console.warn('[AgoraContext] Error leaving channel during cleanup:', e);
        }
        
        try {
          engineRef.current.release();
        } catch (e) {
          console.warn('[AgoraContext] Error releasing engine:', e);
        }
        
        engineRef.current = null;
      }
      
      // Reset all state
      setIsEngineReady(false);
      setIsInitialized(false);
      setCurrentChannel(null);
      setLocalUid(null);
      setRemoteUids([]);
      remoteUidsRef.current = []; // Update ref
      setIsCameraOn(true);
      setIsMicOn(true);
      channelRef.current = null;
      
      console.log('[AgoraContext] Cleanup completed');
    } catch (error) {
      console.error('[AgoraContext] Error cleaning up Agora engine:', error);
    }
  };

  // Initialize Agora engine safely with delay
  const initializeAgoraSafely = async () => {
    console.log('🚀 AgoraProvider - starting safe initialization...');
    
    // First, test if we can even load the Agora module
    console.log('🔍 Testing basic Agora module access...');
    try {
      const AgoraTest = require('react-native-agora');
      console.log('✅ Agora module accessible:', !!AgoraTest);
      console.log('✅ createAgoraRtcEngine available:', !!AgoraTest.createAgoraRtcEngine);
    } catch (testError) {
      console.error('❌ Basic Agora module test failed:', testError);
      return; // Don't continue if module can't be loaded
    }
    
    // Test environment variables immediately
    console.log('🔍 Environment variables test:');
    console.log('🔍 process.env.EXPO_PUBLIC_AGORA_APP_ID:', process.env.EXPO_PUBLIC_AGORA_APP_ID);
    console.log('🔍 process.env.NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 All EXPO_PUBLIC_* vars:', Object.keys(process.env).filter(key => key.startsWith('EXPO_PUBLIC_')));
    
    const initAgora = async () => {
      try {
        console.log('🔄 Calling initializeEngine from useEffect...');
        await initializeEngine();
        console.log('✅ initializeEngine completed from useEffect');
      } catch (error) {
        console.error('❌ Failed to initialize Agora in useEffect:', error);
        console.error('❌ Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }
    };

    initAgora();
  };

  // LAZY INITIALIZATION: Only initialize when joinChannel is called (not on mount)
  // This prevents conflicts with LiveStreamProvider which uses its own Agora engine
  // The engine will be initialized on-demand when a video call actually starts
  // This fixes error 110 (Invalid App ID) conflicts between video call and livestream engines
  useEffect(() => {
    // Don't auto-initialize on mount - wait for joinChannel to be called
    // This prevents AgoraProvider from interfering with LiveStreamProvider
    console.log('📞 [AgoraProvider] Lazy initialization enabled - engine will initialize when joinChannel is called');
    
    return () => {
      console.log('🧹 AgoraProvider useEffect cleanup triggered');
      if (engineRef.current) {
        try {
          const releaseResult = engineRef.current.release();
          if (releaseResult && typeof releaseResult.catch === 'function') {
            releaseResult.catch(console.error);
          }
        } catch (error) {
          console.error('Error releasing Agora engine:', error);
        }
      }
    };
  }, []);

  const contextValue: AgoraContextType = {
    isEngineReady,
    isInitialized,
    currentChannel,
    localUid,
    remoteUids,
    connectionState,
    joinChannel,
    leaveChannel,
    requestPermissions,
    initializeEngine,
    cleanupAgoraEngine,
    toggleCamera,
    toggleMic,
    switchCamera,
    setAudioOutput,
    startCameraPreview,
    remoteUserCameraStates,
    isCameraOn,
    isMicOn,
    hasCameraPermission,
    hasMicPermission,
  };

  return (
    <AgoraContext.Provider value={contextValue}>
      {children}
    </AgoraContext.Provider>
  );
};