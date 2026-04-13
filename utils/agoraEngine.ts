import { log, warn, error } from './productionLogger';
/**
 * 🚀 AGORA ENGINE SINGLETON (NO RESTART BUGS)
 * 
 * Clean, production-ready Agora engine manager.
 * Never recreates the engine - prevents auto-rejoin bugs and UI resets.
 */

// Dynamic import for Agora to prevent immediate native module access
let AgoraModule: any = null;
const getAgoraModule = async () => {
  if (!AgoraModule) {
    try {
      AgoraModule = require('react-native-agora');
      log('✅ [AGORA_ENGINE] Module loaded successfully');
    } catch (error) {
      error('❌ [AGORA_ENGINE] Failed to load Agora module:', error);
      return null;
    }
  }
  return AgoraModule;
};

let engine: any = null;
let isInitializing = false;

/**
 * Get or create the Agora engine singleton
 * @param appId - Agora App ID
 * @returns The Agora RTC engine instance
 */
export const getAgoraEngine = async (appId: string) => {
  if (engine) {
    log('✅ [AGORA_ENGINE] Engine already exists, returning singleton');
    return engine;
  }

  if (isInitializing) {
    log('🔄 [AGORA_ENGINE] Initialization already in progress, waiting...');
    // Wait for initialization to complete
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (engine) {
      return engine;
    }
  }

  isInitializing = true;

  try {
    log('🔄 [AGORA_ENGINE] Creating new engine singleton...');
    
    const AgoraRTC = await getAgoraModule();
    if (!AgoraRTC) {
      throw new Error('Agora module failed to load');
    }

    // Create engine instance
    const rtcEngine = AgoraRTC.createAgoraRtcEngine();
    if (!rtcEngine) {
      throw new Error('Failed to create Agora RTC engine');
    }

    // Use RtcEngineContext instance to avoid "right operand of 'instanceof' is not callable" (Hermes)
    const context = AgoraRTC.RtcEngineContext
      ? Object.assign(new AgoraRTC.RtcEngineContext(), { appId })
      : { appId };
    const initResult = await rtcEngine.initialize(context);
    log('✅ [AGORA_ENGINE] Engine initialized:', initResult);

    // Enable video and audio
    await rtcEngine.enableVideo();
    await rtcEngine.enableAudio();

    // Set channel profile to LIVE_BROADCASTING for multihost streaming
    const { ChannelProfileType } = AgoraRTC;
    await rtcEngine.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);

    engine = rtcEngine;
    log('✅ [AGORA_ENGINE] Engine singleton created successfully');
    
    return engine;
  } catch (error) {
    error('❌ [AGORA_ENGINE] Failed to create engine:', error);
    throw error;
  } finally {
    isInitializing = false;
  }
};

/**
 * Join a channel as host or guest
 * @param params - Join parameters
 * @returns The Agora engine instance
 */
export interface JoinStreamParams {
  appId: string;
  token: string;
  channelName: string;
  uid: number;
  isHost: boolean;
}

export const joinStream = async ({
  appId,
  token,
  channelName,
  uid,
  isHost,
}: JoinStreamParams) => {
  const engine = await getAgoraEngine(appId);

  // Set client role - both host and guests are broadcasters (so they can show video)
  const AgoraRTC = await getAgoraModule();
  const { ClientRoleType } = AgoraRTC;
  
  await engine.setClientRole(
    ClientRoleType.ClientRoleBroadcaster
  );

  // Join channel
  await engine.joinChannel(token, channelName, null, uid);
  
  log(`✅ [AGORA_ENGINE] Joined channel as ${isHost ? 'HOST' : 'GUEST'}:`, {
    channelName,
    uid,
  });

  return engine;
};

/**
 * Leave the current channel
 */
export const leaveStream = async () => {
  if (engine) {
    try {
      await engine.leaveChannel();
      log('✅ [AGORA_ENGINE] Left channel');
    } catch (error) {
      error('❌ [AGORA_ENGINE] Error leaving channel:', error);
    }
  }
};

/**
 * Cleanup engine (use with caution - only when completely done with Agora)
 */
export const cleanupEngine = async () => {
  if (engine) {
    try {
      await engine.leaveChannel();
      await engine.release();
      engine = null;
      log('✅ [AGORA_ENGINE] Engine cleaned up');
    } catch (error) {
      error('❌ [AGORA_ENGINE] Error cleaning up engine:', error);
    }
  }
};

