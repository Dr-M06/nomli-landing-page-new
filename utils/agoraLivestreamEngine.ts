/**
 * 🚀 AGORA LIVESTREAM ENGINE MANAGER
 * 
 * Clean, production-ready implementation based on official Agora samples
 * and community best practices. Handles Hermes compatibility automatically.
 */

import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';


// Dynamic import for Agora to prevent immediate native module access
let AgoraModule: any = null;
const getAgoraModule = async () => {
  if (!AgoraModule) {
    try {
      AgoraModule = require('react-native-agora');
      log('✅ [LIVESTREAM_ENGINE] Agora module loaded');
    } catch (error) {
      error('❌ [LIVESTREAM_ENGINE] Failed to load Agora module:', error);
      return null;
    }
  }
  return AgoraModule;
};

// Engine singleton
let engine: any = null;
let engineAppId: string | null = null; // Track the App ID used to initialize the engine
let isInitializing = false;
let initializationPromise: Promise<any> | null = null;
let joinedChannelName: string | null = null;
let joinedUid: number | null = null;

/**
 * Initialize the Agora RTC engine for livestreaming
 * Based on official Agora samples and best practices
 */
export const initializeLivestreamEngine = async (appId: string): Promise<any> => {
  // Check if engine exists and App ID matches
  if (engine && engineAppId === appId) {
    log('✅ [LIVESTREAM_ENGINE] Engine already initialized with matching App ID');
    return engine;
  }
  
  // If engine exists but App ID doesn't match, release it first
  if (engine && engineAppId !== appId) {
    warn('⚠️ [LIVESTREAM_ENGINE] Engine exists but App ID mismatch. Releasing old engine...', {
      oldAppId: engineAppId?.substring(0, 8) + '...',
      newAppId: appId.substring(0, 8) + '...'
    });
    try {
      await releaseLivestreamEngine();
    } catch (error) {
      error('❌ [LIVESTREAM_ENGINE] Error releasing old engine:', error);
      // Force reset even if release failed
      engine = null;
      engineAppId = null;
      isInitializing = false;
      initializationPromise = null;
    }
  }

  // Wait for ongoing initialization
  if (isInitializing && initializationPromise) {
    log('🔄 [LIVESTREAM_ENGINE] Waiting for ongoing initialization...');
    return initializationPromise;
  }

  isInitializing = true;
  initializationPromise = (async () => {
    try {
      log('🎬 [LIVESTREAM_ENGINE] Initializing Agora engine for livestreaming...');
      
      const AgoraRTC = await getAgoraModule();
      if (!AgoraRTC) {
        throw new Error('Agora module not available');
      }

      // Create engine instance
      const rtcEngine = AgoraRTC.createAgoraRtcEngine();
      if (!rtcEngine) {
        throw new Error('Failed to create Agora RTC engine');
      }

      log('✅ [LIVESTREAM_ENGINE] Engine instance created');

      // Initialize engine
      // Note: With our patch, the SDK now uses native JSON for native bridge calls
      // This avoids the Hermes "instanceof is not callable" error
      const context = { appId };
      const initResult = rtcEngine.initialize(context);
      
      if (initResult !== 0) {
        throw new Error(`Engine initialization failed with code: ${initResult}`);
      }

      log('✅ [LIVESTREAM_ENGINE] Engine initialized successfully');

      // Configure for livestreaming
      const { ChannelProfileType, ClientRoleType, AudioProfileType, AudioScenarioType } = AgoraRTC;

      // Set channel profile to LIVE_BROADCASTING
      await rtcEngine.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);
      log('✅ [LIVESTREAM_ENGINE] Channel profile set to LIVE_BROADCASTING');

      // Enable video and audio
      await rtcEngine.enableVideo();
      await rtcEngine.enableAudio();
      log('✅ [LIVESTREAM_ENGINE] Video and audio enabled');

      // Set default client role to BROADCASTER
      // This can be changed per user (broadcaster vs audience)
      await rtcEngine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      log('✅ [LIVESTREAM_ENGINE] Client role set to BROADCASTER');

      // Configure audio profile for high-quality livestreaming
      try {
        await rtcEngine.setAudioProfile(
          AudioProfileType.AudioProfileMusicHighQuality,
          AudioScenarioType.AudioScenarioGameStreaming
        );
        log('✅ [LIVESTREAM_ENGINE] Audio profile configured');
      } catch (error) {
        warn('⚠️ [LIVESTREAM_ENGINE] Failed to set audio profile:', error);
      }

      // Enable dual stream mode for adaptive quality
      try {
        await rtcEngine.enableDualStreamMode(true);
        log('✅ [LIVESTREAM_ENGINE] Dual stream mode enabled');
      } catch (error) {
        warn('⚠️ [LIVESTREAM_ENGINE] Failed to enable dual stream:', error);
      }

      // Store engine and App ID
      engine = rtcEngine;
      engineAppId = appId;
      log('✅ [LIVESTREAM_ENGINE] Engine initialization complete with App ID:', appId.substring(0, 8) + '...');

      return engine;
    } catch (error) {
      error('❌ [LIVESTREAM_ENGINE] Initialization failed:', error);
      engine = null;
      throw error;
    } finally {
      isInitializing = false;
      initializationPromise = null;
    }
  })();

  return initializationPromise;
};

/**
 * Get the current engine instance
 */
export const getLivestreamEngine = (): any => {
  return engine;
};

export const getLivestreamJoinState = (): { isJoined: boolean; channelName: string | null; uid: number | null } => {
  return {
    isJoined: !!joinedChannelName,
    channelName: joinedChannelName,
    uid: joinedUid,
  };
};

/**
 * Join a livestream channel
 */
export interface JoinLivestreamParams {
  token: string;
  channelName: string;
  uid: number;
  role?: 'broadcaster' | 'audience';
}

export const joinLivestreamChannel = async (params: JoinLivestreamParams): Promise<void> => {
  if (!engine) {
    throw new Error('Engine not initialized. Call initializeLivestreamEngine first.');
  }

  const AgoraRTC = await getAgoraModule();
  const { ClientRoleType } = AgoraRTC;

  // Set client role based on user type
  if (params.role === 'audience') {
    await engine.setClientRole(ClientRoleType.ClientRoleAudience);
    log('✅ [LIVESTREAM_ENGINE] Client role set to AUDIENCE');
  } else {
    await engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
    log('✅ [LIVESTREAM_ENGINE] Client role set to BROADCASTER');
  }

  // Agora RN SDK v4 join signature is: joinChannel(token, channelId, uid, options).
  // Passing null as the third arg makes uid null and causes -2 INVALID_ARGUMENT.
  if (joinedChannelName === params.channelName && joinedUid === params.uid) {
    log('✅ [LIVESTREAM_ENGINE] Already joined channel, skipping duplicate join');
    return;
  }

  const joinResult = await engine.joinChannel(params.token, params.channelName, params.uid, {});
  
  if (joinResult !== 0 && joinResult !== -17) {
    throw new Error(`Failed to join channel. Error code: ${joinResult}`);
  }

  joinedChannelName = params.channelName;
  joinedUid = params.uid;

  log('✅ [LIVESTREAM_ENGINE] Joined channel:', {
    channelName: params.channelName,
    uid: params.uid,
    role: params.role || 'broadcaster',
  });
};

/**
 * Leave the current livestream channel
 */
export const leaveLivestreamChannel = async (): Promise<void> => {
  if (!engine) {
    warn('⚠️ [LIVESTREAM_ENGINE] No engine to leave channel');
    return;
  }

  try {
    await engine.leaveChannel();
    joinedChannelName = null;
    joinedUid = null;
    log('✅ [LIVESTREAM_ENGINE] Left channel');
  } catch (error) {
    error('❌ [LIVESTREAM_ENGINE] Error leaving channel:', error);
    throw error;
  }
};

/**
 * Enable/disable local video
 */
export const enableLocalVideo = async (enabled: boolean): Promise<void> => {
  if (!engine) {
    throw new Error('Engine not initialized');
  }

  try {
    if (enabled) {
      await engine.enableVideo();
      if (engine.muteLocalVideoStream) {
        await engine.muteLocalVideoStream(false);
      }
      if (engine.enableLocalVideo) {
        await engine.enableLocalVideo(true);
      }
    } else {
      if (engine.muteLocalVideoStream) {
        await engine.muteLocalVideoStream(true);
      }
      if (engine.enableLocalVideo) {
        await engine.enableLocalVideo(false);
      }
    }
    log(`✅ [LIVESTREAM_ENGINE] Local video ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    error('❌ [LIVESTREAM_ENGINE] Error toggling local video:', error);
    throw error;
  }
};

/**
 * Enable/disable local audio
 */
export const enableLocalAudio = async (enabled: boolean): Promise<void> => {
  if (!engine) {
    throw new Error('Engine not initialized');
  }

  try {
    if (enabled) {
      await engine.enableAudio();
      if (engine.enableLocalAudio) {
        await engine.enableLocalAudio(true);
      }
    } else {
      if (engine.enableLocalAudio) {
        await engine.enableLocalAudio(false);
      }
    }
    log(`✅ [LIVESTREAM_ENGINE] Local audio ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    error('❌ [LIVESTREAM_ENGINE] Error toggling local audio:', error);
    throw error;
  }
};

/**
 * Switch camera (front/back)
 */
export const switchCamera = async (): Promise<void> => {
  if (!engine) {
    throw new Error('Engine not initialized');
  }

  try {
    await engine.switchCamera();
    log('✅ [LIVESTREAM_ENGINE] Camera switched');
  } catch (error) {
    error('❌ [LIVESTREAM_ENGINE] Error switching camera:', error);
    throw error;
  }
};

/**
 * Route call audio to loudspeaker or earpiece.
 */
export const setSpeakerphoneEnabled = async (enabled: boolean): Promise<void> => {
  if (!engine) {
    throw new Error('Engine not initialized');
  }

  try {
    if (typeof engine.setEnableSpeakerphone === 'function') {
      await engine.setEnableSpeakerphone(enabled);
    } else if (typeof engine.setDefaultAudioRouteToSpeakerphone === 'function') {
      await engine.setDefaultAudioRouteToSpeakerphone(enabled);
    } else {
      throw new Error('Speakerphone control is not supported by current Agora runtime');
    }
    log(`✅ [LIVESTREAM_ENGINE] Speakerphone ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    error('❌ [LIVESTREAM_ENGINE] Error toggling speakerphone:', error);
    throw error;
  }
};

/**
 * Cleanup and release engine
 * Use with caution - only when completely done with livestreaming
 */
export const releaseLivestreamEngine = async (): Promise<void> => {
  if (!engine) {
    return;
  }

  try {
    // Leave channel if joined
    try {
      await engine.leaveChannel();
    } catch (e) {
      // Ignore if not in channel
    }

    // Release engine
    await engine.release();
    engine = null;
    engineAppId = null;
    joinedChannelName = null;
    joinedUid = null;
    isInitializing = false;
    initializationPromise = null;
    
    log('✅ [LIVESTREAM_ENGINE] Engine released');
  } catch (error) {
    error('❌ [LIVESTREAM_ENGINE] Error releasing engine:', error);
    throw error;
  }
};
