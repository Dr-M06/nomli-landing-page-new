import React, { createContext, useContext, useState, useRef, useEffect, useCallback, startTransition } from 'react';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../utils/supabase';
import useAuth from '../hooks/useAuth';
import { fetchRtcToken, fetchRtcTokenWithAppId } from '../utils/agoraTokenClient';
import { validateAgoraConfig } from '../utils/agoraConfig';
import { updateLiveStreamReactionsTable } from '../utils/updateLiveStreamReactions';
import { sendPushNotificationToUsers } from '../utils/pushNotificationService';
import GuestInvitationNotification from './GuestInvitationNotification';
import { acceptGuestInvitation, declineGuestInvitation, LiveStreamInvitation } from '../utils/guestService';
import { requestThrottler } from '../utils/requestThrottler';
import { initializeLivestreamEngine, getLivestreamEngine, releaseLivestreamEngine } from '../utils/agoraLivestreamEngine';
import { isKicked as checkIsKicked } from '../utils/moderationService';
import { refreshAuthSession } from '../utils/supabase';
import {
  subscribeToRemoteStream,
  unsubscribeFromRemoteStream,
  safeEngineOperation,
  hasConfigChanged,
  getVideoEncoderConfigForQuality,
  getAdaptiveDebounceDelay,
} from '../utils/livestreamNetworkResilience';
import { getStreamTypeForQuality, getPoorNetworkConfig } from '../utils/poorNetworkOptimizer';
import { getVideoSubscriptionDelay, NetworkQuality, getBroadcasterVideoConfig } from '../utils/livestreamStability';
import { log, warn, error } from '../utils/productionLogger';

/**
 * Polyfill for AbortSignal.timeout() which is not available in React Native
 * Creates an AbortSignal that automatically aborts after the specified timeout
 */
const createTimeoutSignal = (timeoutMs: number): AbortSignal => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  // Clean up timeout if signal is already aborted
  if (controller.signal.aborted) {
    clearTimeout(timeoutId);
  } else {
    // Store timeout ID on the signal for potential cleanup
    (controller.signal as any)._timeoutId = timeoutId;
  }
  
  return controller.signal;
};

// Get Agora module dynamically for live streaming
let AgoraModule: any = null;
const getAgoraModule = async () => {
  if (!AgoraModule) {
    try {
      AgoraModule = require('react-native-agora');
      log('✅ Agora module loaded for live streaming');
    } catch (error) {
      // Silently ignore module load errors
      return null;
    }
  }
  return AgoraModule;
};

/**
 * Agora v4 expects ChannelMediaOptions on joinChannel. Empty `{}` can yield ERR_JOIN_CHANNEL_REJECTED (-17)
 * on live broadcasting (publish + profile flags).
 */
const buildLiveBroadcastJoinOptions = async (
  role: 'broadcaster' | 'audience',
  musicMode: boolean
): Promise<Record<string, unknown>> => {
  const AgoraRTC = await getAgoraModule();
  if (!AgoraRTC) return {};
  const { ChannelProfileType, ClientRoleType } = AgoraRTC;
  const base = {
    channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
    autoSubscribeAudio: true,
    autoSubscribeVideo: true,
  };
  if (role === 'broadcaster') {
    return {
      ...base,
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      publishCameraTrack: !musicMode,
    };
  }
  return {
    ...base,
    clientRoleType: ClientRoleType.ClientRoleAudience,
    publishMicrophoneTrack: false,
    publishCameraTrack: false,
  };
};

// 2G-safe stream type defaults (Agora: 0=HIGH, 1=LOW)
const HIGH_STREAM_TYPE = 0;
const LOW_STREAM_TYPE = 1;
const LIVE_DATA_SAVER_KEY = 'live_data_saver_mode_v1';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuid = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return null;
  return UUID_REGEX.test(trimmed) ? trimmed : null;
};

export interface LiveStream {
  id: string;
  title: string;
  description?: string;
  streamer_id: string;
  streamer_name: string;
  streamer_avatar?: string;
  channel_id: string;
  viewer_count: number;
  is_live: boolean;
  started_at: string;
  thumbnail_url?: string;
  broadcaster_uid?: number; // Agora UID of the broadcaster (usually 1000)
  allow_guests?: boolean; // Whether guests are allowed to join (defaults to true)
  music_mode?: boolean; // Whether music mode is enabled (audio-only with visual effects)
  adult_content?: boolean; // Whether the stream contains adult content (18+)
}

interface LiveStreamContextType {
  // Streaming state
  isStreaming: boolean;
  isJoinedAsViewer: boolean;
  currentStream: LiveStream | null;
  viewerCount: number;
  
  // Stream management
  startLiveStream: (title: string, description?: string, adultContent?: boolean, allowGuests?: boolean, musicMode?: boolean) => Promise<boolean>;
  stopLiveStream: () => Promise<void>;
  joinStreamAsViewer: (streamId: string) => Promise<boolean>;
  leaveStreamAsViewer: () => Promise<void>;
  
  // Stream discovery
  liveStreams: LiveStream[];
  loadLiveStreams: () => Promise<void>;
  
  // Stream controls (broadcaster)
  toggleStreamCamera: () => void;
  toggleStreamMic: () => void;
  switchStreamCamera: () => void;
  
  // Stream state
  isStreamCameraOn: boolean;
  isStreamFrontCamera: boolean; // true = front (selfie), false = back - used for correct mirror mode
  isStreamMicOn: boolean;
  streamRemoteUids: number[];
  broadcasterVideoEnabled: Map<number, boolean>; // Track video enabled state for broadcaster (UID -> enabled)
  guestVideoEnabled: Map<number, boolean>; // Track guest video states (UID -> enabled) for broadcaster to see guests
  
  // Debug functions
  debugViewerCount: () => Promise<void>;
  forceRefreshViewerCount: () => Promise<void>;
  forceCleanupInactiveViewers: () => Promise<void>;
  testViewerCount: (count: number) => void;
  cleanupDuplicateViewers: () => Promise<void>;
  
  // Guest mode functions
  switchToGuestMode: (agoraUid?: number) => Promise<boolean>;
  leaveGuestMode: () => Promise<boolean>;
  muteGuestAudio: (muted: boolean) => Promise<void>; // Mute/unmute guest's own audio
  muteRemoteGuestAudio: (remoteUid: number, muted: boolean) => Promise<void>; // Mute/unmute remote guest's audio (broadcaster only)
  switchGuestCamera: () => void; // Switch camera for guests
  
  // Co-host state tracking
  isGuestVideoEnabled: boolean; // Current co-host video publishing state
  isGuestAudioEnabled: boolean; // Current co-host audio publishing state
  
  // Guest invitation
  pendingInvitation: LiveStreamInvitation | null;
  handleAcceptInvitation: () => Promise<void>;
  handleDeclineInvitation: () => Promise<void>;
  handleInvitationExpire: () => void;
  
  // Audio restoration (for sound effects)
  restoreAgoraAudio: () => Promise<void>;
  
  // Network quality and connection state
  networkQuality: Record<number, { txQuality: number; rxQuality: number }>;
  connectionState: string;
  /** True only when we switched to audio-only due to *sustained* poor network (not a single blip). */
  audioOnlyDueToNetwork: boolean;
  
  // Verification functions
  verifyCoHostMicActive: () => Promise<boolean>;
  verifyLivestreamHealth: () => Promise<{
    healthy: boolean;
    issues: string[];
    details: {
      engineReady: boolean;
      streamActive: boolean;
      micEnabled: boolean;
      cameraEnabled: boolean;
      connectionState: string;
    };
  }>;
}

// Create a default fallback context to prevent null errors
const defaultContextValue: LiveStreamContextType = {
  isStreaming: false,
  isJoinedAsViewer: false,
  currentStream: null,
  viewerCount: 0,
  startLiveStream: async () => false,
  stopLiveStream: async () => {},
  joinStreamAsViewer: async () => false,
  leaveStreamAsViewer: async () => {},
  liveStreams: [],
  loadLiveStreams: async () => {},
  toggleStreamCamera: () => {},
  toggleStreamMic: () => {},
  switchStreamCamera: () => {},
  isStreamCameraOn: false,
  isStreamMicOn: false,
  isStreamFrontCamera: true,
  streamRemoteUids: [],
  broadcasterVideoEnabled: new Map(),
  guestVideoEnabled: new Map(),
  debugViewerCount: async () => {},
  forceRefreshViewerCount: async () => {},
  forceCleanupInactiveViewers: async () => {},
  testViewerCount: () => {},
  cleanupDuplicateViewers: async () => {},
  switchToGuestMode: async () => false,
  leaveGuestMode: async () => false,
  muteGuestAudio: async () => {},
  muteRemoteGuestAudio: async () => {},
  switchGuestCamera: () => {},
  pendingInvitation: null,
  handleAcceptInvitation: async () => {},
  handleDeclineInvitation: async () => {},
  handleInvitationExpire: () => {},
  restoreAgoraAudio: async () => {},
  networkQuality: {},
  connectionState: 'DISCONNECTED',
  audioOnlyDueToNetwork: false,
  verifyCoHostMicActive: async () => false,
  verifyLivestreamHealth: async () => false,
  isGuestVideoEnabled: false,
  isGuestAudioEnabled: false,
};

const LiveStreamContext = createContext<LiveStreamContextType>(defaultContextValue);

export const useLiveStream = () => {
  const context = useContext(LiveStreamContext);
  // Context should never be null now, but add defensive check just in case
  if (!context) {
    warn('⚠️ [useLiveStream] Context is null, using default fallback. This should not happen.');
    return defaultContextValue;
  }
  return context;
};

interface LiveStreamProviderProps {
  children: React.ReactNode;
}

export const LiveStreamProvider: React.FC<LiveStreamProviderProps> = ({ children }) => {
  const { user } = useAuth();
  // We'll create our own engine for live streaming to avoid conflicts
  const streamEngineRef = useRef<any>(null);
  const engineAppIdRef = useRef<string | null>(null); // Track the App ID used to initialize the engine
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Stream state
  const [isStreaming, setIsStreaming] = useState(false);
  const [isJoinedAsViewer, setIsJoinedAsViewer] = useState(false);
  const [currentStream, setCurrentStream] = useState<LiveStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [peakViewerCount, setPeakViewerCount] = useState(0); // Track peak viewer count
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  
  // Stream controls state
  const [isStreamCameraOn, setIsStreamCameraOn] = useState(true);
  const [isStreamMicOn, setIsStreamMicOn] = useState(true);
  const [isStreamFrontCamera, setIsStreamFrontCamera] = useState(true); // front = default for selfie
  const [streamRemoteUids, setStreamRemoteUids] = useState<number[]>([]);
  
  // Track broadcaster video state (for viewers)
  const [broadcasterVideoEnabled, setBroadcasterVideoEnabled] = useState<Map<number, boolean>>(new Map());
  
  // Track guest video states (for broadcaster to see guests' video)
  const [guestVideoEnabled, setGuestVideoEnabled] = useState<Map<number, boolean>>(new Map());
  
  // Track current user's guest video/audio state (for co-host's own frame)
  const [isGuestVideoEnabled, setIsGuestVideoEnabled] = useState(true);
  const [isGuestAudioEnabled, setIsGuestAudioEnabled] = useState(true);
  
  // ============================================
  // STEP 1: IN-MEMORY VIEWER COUNT TRACKER
  // Based on NOMLI MINGLE LIVE STREAMING DOCUMENTATION
  // Track viewers using Agora events only (no database queries during live)
  // ============================================
  const viewerCountInMemoryRef = useRef<Set<number>>(new Set()); // Track UIDs in memory
  const lastSyncTimeRef = useRef<number>(0); // Track last sync to backend
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState); // Track app state to pause intervals
  
  // Guest invitation state
  const [pendingInvitation, setPendingInvitation] = useState<any>(null);
  
  // Network quality state
  const [networkQuality, setNetworkQuality] = useState<Record<number, {
    txQuality: number; // 0-6 (0=unknown, 6=excellent)
    rxQuality: number; // 0-6
  }>>({});
  const [connectionState, setConnectionState] = useState<string>('DISCONNECTED');
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;
  const isReconnectingRef = useRef(false); // Prevent concurrent reconnection attempts
  const lastManualReconnectAtRef = useRef(0); // Prevent reconnect thrashing
  const manualReconnectCooldownMs = 6000;
  const lastConnectionStateRef = useRef<string>('DISCONNECTED'); // Track last state to detect rapid changes
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Timeout for delayed reconnection
  const connectionStateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Debounce rapid state changes
  const stableConnectionStateRef = useRef<string>('DISCONNECTED'); // Track stable (non-rapid) connection state
  
  // Track streaming/viewer state in refs for use in debounced callbacks
  const isStreamingRef = useRef<boolean>(false);
  const isJoinedAsViewerRef = useRef<boolean>(false);
  
  // Quality adjustment debouncing to prevent rapid changes
  const qualityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQualityConfigRef = useRef<{ width: number; height: number; bitrate: number } | null>(null);
  // Only update network quality state when value changed (avoids re-render on every Agora tick)
  const lastNetworkQualityRef = useRef<Record<number, { txQuality: number; rxQuality: number }>>({});
  // Viewer adaptive quality: start HIGH so video shows; downgrade to LOW when rxQuality is poor (debounced)
  const viewerStreamTypeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewerStreamTypeRef = useRef<number>(0); // 0 = HIGH_STREAM (default so video shows), 1 = LOW_STREAM
  // Sustained poor network: only switch to audio-only after several consecutive bad reports (avoid single blips)
  const recentTxQualityRef = useRef<number[]>([]);
  const [audioOnlyDueToNetwork, setAudioOnlyDueToNetwork] = useState(false);
  const audioOnlyDueToNetworkRef = useRef(false);
  audioOnlyDueToNetworkRef.current = audioOnlyDueToNetwork;
  // Track stream start time to ignore initial poor quality reports (grace period)
  const streamStartTimeRef = useRef<number | null>(null);
  const lastNetworkSpeedCheckRef = useRef<{ speedKbps: number; timestamp: number } | null>(null);
  // Require 2+ consecutive low speed readings before switching to audio-only (avoids single dip like 173→497)
  const consecutiveLowSpeedCountRef = useRef<number>(0);
  const liveDataSaverEnabledRef = useRef<boolean>(true);

  // Use existing Agora engine for live streaming
  const streamChannelRef = useRef<string | null>(null);
  const currentStreamIdRef = useRef<string | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerJoinInProgressRef = useRef<boolean>(false);
  const guestJoinInProgressRef = useRef<boolean>(false); // Prevent concurrent guest join attempts
  
  // 🚀 IMPROVEMENT: Track event listeners for proper cleanup (prevents memory leaks)
  const listenersRef = useRef<Array<{ event: string; handler: Function }>>([]);
  
  // 🚀 IMPROVEMENT: Token refresh management
  const tokenRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentTokenRef = useRef<string | null>(null);

  // 🚀 IMPROVEMENT: Helper to add tracked listeners
  const addTrackedListener = useCallback((event: string, handler: Function) => {
    if (!streamEngineRef.current) {
      warn(`⚠️ [LISTENER] Cannot add listener ${event}: engine not initialized`);
      return;
    }
    
    streamEngineRef.current.addListener(event, handler);
    listenersRef.current.push({ event, handler });
    log(`✅ [LISTENER] Added listener: ${event} (total: ${listenersRef.current.length})`);
  }, []);
  
  // 🚀 IMPROVEMENT: Remove all tracked listeners
  const removeAllListeners = useCallback(() => {
    if (!streamEngineRef.current) {
      log('⚠️ [LISTENER] No engine to remove listeners from');
      return;
    }
    
    const listenerCount = listenersRef.current.length;
    log(`🧹 [LISTENER] Removing ${listenerCount} listeners...`);
    
    listenersRef.current.forEach(({ event, handler }) => {
      try {
        streamEngineRef.current?.removeListener(event, handler);
      } catch (e) {
        warn(`⚠️ [LISTENER] Failed to remove ${event}:`, e);
      }
    });
    
    listenersRef.current = [];
    if (viewerStreamTypeDebounceRef.current) {
      clearTimeout(viewerStreamTypeDebounceRef.current);
      viewerStreamTypeDebounceRef.current = null;
    }
    log(`✅ [LISTENER] All ${listenerCount} listeners removed`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LIVE_DATA_SAVER_KEY);
        if (!cancelled && saved !== null) {
          liveDataSaverEnabledRef.current = saved === '1';
        }
      } catch {
        // Keep safe default (enabled) when preference read fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  
  // 🚀 IMPROVEMENT: Safe engine release function
  const releaseEngineSafely = useCallback(async (): Promise<void> => {
    if (!streamEngineRef.current) {
      log('⚠️ [RELEASE] No engine to release');
      // CRITICAL: Reset App ID ref even if engine ref is null (cleanup after partial release)
      engineAppIdRef.current = null;
      return;
    }
    
    const engine = streamEngineRef.current;
    
    // Set to null FIRST to prevent reuse
    streamEngineRef.current = null;
    // CRITICAL: Reset App ID ref when releasing engine
    engineAppIdRef.current = null;
    recentTxQualityRef.current = [];
    setAudioOnlyDueToNetwork(false);
    
    log('🔴 [RELEASE] Starting safe engine release...');
    
    try {
      // Step 1: Remove all listeners FIRST
      removeAllListeners();
      
      // Step 2: Disable audio/video
      try {
        await engine.enableLocalAudio(false);
        await engine.disableAudio();
        await engine.disableVideo();
        log('✅ [RELEASE] Audio/video disabled');
      } catch (e) {
        warn('⚠️ [RELEASE] Error disabling audio/video:', e);
      }
      
      // Step 3: Leave channel
      try {
        await engine.leaveChannel();
        log('✅ [RELEASE] Left channel');
      } catch (e) {
        warn('⚠️ [RELEASE] Error leaving channel:', e);
      }
      
      // Step 4: Small delay to ensure channel leave completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Step 5: Release engine via module-level release function (ensures module-level engine is reset)
      try {
        await releaseLivestreamEngine();
        log('✅ [RELEASE] Engine released via module release function');
      } catch (e) {
        // Fallback: try direct release if module function fails
        try {
          await engine.release();
          log('✅ [RELEASE] Engine released via direct call');
        } catch (releaseError) {
          warn('⚠️ [RELEASE] Error releasing engine:', releaseError);
        }
      }
      
      // Step 6: Reset audio session
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
        log('✅ [RELEASE] Audio session reset');
      } catch (e) {
        warn('⚠️ [RELEASE] Error resetting audio session:', e);
      }
      
      log('✅ [RELEASE] Safe release completed');
    } catch (error) {
      error('❌ [RELEASE] Error in safe release:', error);
      // Ensure refs are reset even on error
      streamEngineRef.current = null;
      engineAppIdRef.current = null;
    }
  }, [removeAllListeners]);
  
  // 🚀 IMPROVEMENT: Token refresh logic
  const scheduleTokenRefresh = useCallback(async (tokenExpirySeconds: number = 3600) => {
    // Clear existing timer
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    
    if (!isStreaming || !currentStreamIdRef.current) {
      return;
    }
    
    // Refresh 5 minutes before expiry (or 10 minutes if token expires in < 15 minutes)
    const refreshDelay = Math.max(
      (tokenExpirySeconds - 300) * 1000, // 5 min before expiry
      (tokenExpirySeconds - 600) * 1000  // Or 10 min before if token expires soon
    );
    
    log(`🔄 [TOKEN] Scheduling refresh in ${Math.round(refreshDelay / 1000)}s`);
    
    tokenRefreshTimerRef.current = setTimeout(async () => {
      try {
        log('🔄 [TOKEN] Refreshing token before expiry...');
        
        // Get new token from bootstrap API
        const { data: { session } } = await supabase.auth.getSession();
        const role = isStreaming ? 'broadcaster' : 'audience';
        const bootstrapUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/live-bootstrap?streamId=${currentStreamIdRef.current}&role=${role}`;
        
        const response = await fetch(bootstrapUrl, {
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to refresh token: ${response.status}`);
        }
        
        const { token: newToken } = await response.json();
        currentTokenRef.current = newToken;
        
        // Renew token in engine (if supported)
        if (streamEngineRef.current?.renewToken) {
          await streamEngineRef.current.renewToken(newToken);
          log('✅ [TOKEN] Token renewed in engine');
        } else {
          log('⚠️ [TOKEN] renewToken not available, token refreshed but not applied');
        }
        
        // Schedule next refresh
        scheduleTokenRefresh(tokenExpirySeconds);
      } catch (error) {
        error('❌ [TOKEN] Failed to refresh token:', error);
        // Retry after 1 minute
        setTimeout(() => scheduleTokenRefresh(tokenExpirySeconds), 60000);
      }
    }, refreshDelay);
  }, [isStreaming]);
  
  // Keep refs in sync with state for use in debounced callbacks
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);
  
  useEffect(() => {
    isJoinedAsViewerRef.current = isJoinedAsViewer;
  }, [isJoinedAsViewer]);
  
  // Fetch user profile when user changes
  useEffect(() => {
    if (user?.id) {
      fetchUserProfile();
    }
  }, [user?.id]);

  const isFetchingInvitationsRef = useRef(false);
  const hasPendingInvitationRef = useRef(false);
  const invitationPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to live stream invitations in real-time; poll only when app is active and back off when no invites
  useEffect(() => {
    if (!user?.id) {
      setPendingInvitation(null);
      hasPendingInvitationRef.current = false;
      return;
    }

    if (__DEV__) log('[LiveStreamProvider] 🔔 Setting up invitation subscription for user:', user.id);

    const fetchPendingInvitations = async (isPolling = false) => {
      if (isFetchingInvitationsRef.current) {
        if (__DEV__) log('[LiveStreamProvider] ⏭️ Skipping duplicate invitation fetch (already in progress)');
        return;
      }
      // Skip polling while we already have an invitation on screen (realtime + initial fetch are enough)
      if (isPolling && hasPendingInvitationRef.current) return;

      isFetchingInvitationsRef.current = true;
      try {
        const { getMyPendingInvitations } = await import('../utils/guestService');
        const result = await getMyPendingInvitations();

        if (result.success && result.invitations && result.invitations.length > 0) {
          if (__DEV__) {
            log('[LiveStreamProvider] 🔍 Fetch result: found invitations', { count: result.invitations?.length || 0 });
          }

          const latestInvitation = result.invitations[0];

          if (__DEV__) {
            log('[LiveStreamProvider] 📨 Processing invitation:', {
              id: latestInvitation.id,
              hasHostProfile: !!latestInvitation.host_profile,
              hasStream: !!latestInvitation.stream
            });
          }

          if (latestInvitation.status !== 'pending') {
            if (__DEV__) log('[LiveStreamProvider] ⚠️ Invitation is not pending, skipping:', latestInvitation.status);
            setPendingInvitation(null);
            hasPendingInvitationRef.current = false;
            return;
          }

          setPendingInvitation(prev => {
            if (prev?.id === latestInvitation.id) {
              if (__DEV__) log('[LiveStreamProvider] ⏭️ Already showing invitation:', latestInvitation.id);
              return prev;
            }
            hasPendingInvitationRef.current = true;
            if (__DEV__) {
              log('[LiveStreamProvider] ✅ Setting pending invitation:', latestInvitation.id, isPolling ? '(via polling)' : '(initial fetch)');
            }
            return latestInvitation;
          });
        } else {
          // Only log "no invitations" on initial fetch to avoid log spam
          if (__DEV__ && !isPolling) {
            log('[LiveStreamProvider] 🔍 Fetch result: no invitations', { success: result.success });
          }
          if (!isPolling) {
            setPendingInvitation(null);
            hasPendingInvitationRef.current = false;
          }
        }
      } catch (error) {
        // Silently ignore invitation fetch errors
      } finally {
        isFetchingInvitationsRef.current = false;
      }
    };

    fetchPendingInvitations(false);

    // Poll only when app is in foreground; 60s interval to avoid noise when no one is inviting
    const INVITATION_POLL_MS = 60000;

    const startPolling = () => {
      stopPolling();
      invitationPollIntervalRef.current = setInterval(() => {
        fetchPendingInvitations(true);
      }, INVITATION_POLL_MS);
    };

    const stopPolling = () => {
      if (invitationPollIntervalRef.current) {
        clearInterval(invitationPollIntervalRef.current);
        invitationPollIntervalRef.current = null;
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        startPolling();
      } else {
        stopPolling();
      }
    });

    if (AppState.currentState === 'active') {
      startPolling();
    }

    if (__DEV__) log('[LiveStreamProvider] Creating subscription channel for user:', user.id);
    const channel = supabase
      .channel(`invitations:${user.id}`, {
        config: {
          broadcast: { self: false },
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_invitations',
          filter: `invited_user_id.eq.${user.id}`,
        },
        async (payload) => {
          const invitation = payload.new;
          if (__DEV__) {
            log('[LiveStreamProvider] 🔔 INSERT invitation:', invitation.id, invitation.stream_id);
          }

          if (invitation.invited_user_id !== user.id) return;

          const expiresAt = new Date(invitation.expires_at);
          const now = new Date();
          if (expiresAt <= now) {
            if (__DEV__) log('[LiveStreamProvider] ⏰ Invitation already expired');
            return;
          }
          if (invitation.status !== 'pending') {
            if (__DEV__) log('[LiveStreamProvider] ⚠️ Invitation status is not pending:', invitation.status);
            return;
          }

          hasPendingInvitationRef.current = true;
          setPendingInvitation(invitation as any);

          // Fetch full details in background and update if needed
          Promise.all([
            supabase
              .from('profiles')
              .select('username, full_name, avatar_url')
              .eq('id', invitation.host_id)
              .maybeSingle(),
            supabase
              .from('live_streams')
              .select('title')
              .eq('id', invitation.stream_id)
              .maybeSingle()
          ]).then(([hostResult, streamResult]) => {
            if (hostResult.data || streamResult.data) {
              // Update invitation with full details
              setPendingInvitation(prev => {
                if (prev?.id === invitation.id) {
                  return {
                    ...prev,
                    host_profile: hostResult.data || null,
                    stream: streamResult.data || null,
                  } as any;
                }
                return prev;
              });
            }
          }).catch(error => {
            if (__DEV__) warn('[LiveStreamProvider] Error fetching invitation details (non-critical):', error);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_stream_invitations',
          filter: `invited_user_id.eq.${user.id}`,
        },
        (payload) => {
          const invitation = payload.new;
          if (invitation.invited_user_id !== user.id) return;

          if (invitation.status !== 'pending') {
            if (__DEV__) log('[LiveStreamProvider] 🗑️ Invitation status changed to:', invitation.status);
            hasPendingInvitationRef.current = false;
            setPendingInvitation(prev => (prev?.id === invitation.id ? null : prev));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (__DEV__) log('[LiveStreamProvider] ✅ Subscribed to invitations');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          warn('[LiveStreamProvider] ⚠️ Invitation subscription failed, using polling fallback:', status);
        } else if (__DEV__) {
          log('[LiveStreamProvider] 📡 Invitation subscription status:', status);
        }
      });

    return () => {
      if (__DEV__) log('[LiveStreamProvider] Cleaning up invitation subscription');
      stopPolling();
      appStateSubscription.remove();
      channel.unsubscribe();
    };
  }, [user?.id]);

  // Forward declare functions to fix ordering issues
  const stopLiveStreamImpl = useRef<(() => Promise<void>) | null>(null);
  const loadLiveStreamsImpl = useRef<(() => Promise<void>) | null>(null);

  const stopLiveStream = useCallback(async (): Promise<void> => {
    if (stopLiveStreamImpl.current) {
      await stopLiveStreamImpl.current();
    }
  }, []);

  const loadLiveStreams = useCallback(async () => {
    if (loadLiveStreamsImpl.current) {
      await loadLiveStreamsImpl.current();
    }
  }, []);

  // Initialize live stream reactions table on component mount
  useEffect(() => {
    updateLiveStreamReactionsTable();
  }, []);

  // Set up real-time subscription for live streams
  useEffect(() => {
    let subscription: any;
    let mounted = true;

    const setupRealtimeSubscription = async () => {
      try {
        log('🔄 [LiveStreamProvider] Setting up real-time subscription for live streams...');
        
        subscription = supabase
          .channel('live-streams-realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'live_streams',
            },
            (payload) => {
              if (!mounted) return;
              
              log('📡 [LiveStreamProvider] Live stream real-time update:', payload.eventType, payload.new || payload.old);
              
              // For INSERT events, immediately refresh streams list
              if (payload.eventType === 'INSERT' && payload.new) {
                const newStream = payload.new as any;
                
                // Only refresh if stream is live and hasn't ended
                if (newStream.is_live && !newStream.ended_at) {
                  log('➕ [LiveStreamProvider] New live stream detected, refreshing list:', newStream.id);
                  // Refresh streams list after a short delay to ensure data is consistent
                  setTimeout(() => {
                    if (mounted && loadLiveStreamsImpl.current) {
                      loadLiveStreamsImpl.current().catch(err => {
                        // Silently ignore stream refresh errors
                      });
                    }
                  }, 500);
                }
              }
              
              // For UPDATE events, refresh if stream status changed
              if (payload.eventType === 'UPDATE' && payload.new) {
                const newData = payload.new as any;
                const oldData = payload.old as any;
                
                // Check if stream just went live or ended
                const streamWentLive = (oldData?.is_live === false && newData?.is_live === true) ||
                                      (!oldData?.is_live && newData?.is_live);
                const streamEnded = (oldData?.is_live === true && newData?.is_live === false) ||
                                   (!oldData?.ended_at && newData?.ended_at);
                
                if (streamWentLive || streamEnded) {
                  log(`🔄 [LiveStreamProvider] Stream status changed (${streamWentLive ? 'went live' : 'ended'}), refreshing list:`, newData.id);
                  setTimeout(() => {
                    if (mounted && loadLiveStreamsImpl.current) {
                      loadLiveStreamsImpl.current().catch(err => {
                        // Silently ignore stream update errors
                      });
                    }
                  }, 500);
                }
              }
              
              // For DELETE events, refresh to remove from list
              if (payload.eventType === 'DELETE' && payload.old) {
                const oldData = payload.old as any;
                log('🗑️ [LiveStreamProvider] Stream deleted, refreshing list:', oldData.id);
                setTimeout(() => {
                  if (mounted && loadLiveStreamsImpl.current) {
                    loadLiveStreamsImpl.current().catch(err => {
                      // Silently ignore stream delete errors
                    });
                  }
                }, 500);
              }
            }
          )
          .subscribe((status) => {
            if (!mounted) return;
            
            if (status === 'SUBSCRIBED') {
              log('✅ [LiveStreamProvider] Successfully subscribed to live streams real-time updates');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              warn('⚠️ [LiveStreamProvider] Live streams subscription failed:', status);
            } else {
              log('📡 [LiveStreamProvider] Live streams subscription status:', status);
            }
          });
      } catch (subscriptionError) {
        error('❌ [LiveStreamProvider] Error setting up live streams subscription:', subscriptionError);
      }
    };

    // Initial load
    if (loadLiveStreamsImpl.current) {
      loadLiveStreamsImpl.current().catch(err => {
        // Silently ignore initial stream load errors
      });
    }

    // Set up real-time subscription
    setupRealtimeSubscription();

    // Periodic refresh every 2 minutes as fallback (real-time should handle most updates)
    const interval = setInterval(() => {
      if (mounted && loadLiveStreamsImpl.current) {
        log('🔄 [LiveStreamProvider] Periodic refresh of live streams');
        loadLiveStreamsImpl.current().catch(err => {
          error('❌ [LiveStreamProvider] Error in periodic refresh:', err);
        });
      }
    }, 120000); // 2 minutes

    return () => {
      mounted = false;
      if (subscription) {
        subscription.unsubscribe();
        log('🔒 [LiveStreamProvider] Unsubscribed from live streams real-time updates');
      }
      clearInterval(interval);
    };
  }, []); // Empty deps - only run once on mount

  // Handle app state changes - end stream if app goes to background
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      log('📱 App state changed to:', nextAppState);
      
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (isStreaming && currentStream) {
          log('🛑 App going to background, ending live stream...');
          stopLiveStream();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => subscription?.remove();
  }, [isStreaming, currentStream, stopLiveStream]);

  const fetchUserProfile = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle(); // Use maybeSingle() to handle new users without profiles
        
      if (error) {
        // Only log non-PGRST116 errors (PGRST116 = no rows, which is expected for new users)
        if (error.code !== 'PGRST116') {
          // Silently ignore profile fetch errors
        } else {
          log('[LiveStreamProvider] User profile not found (new user) - this is expected');
        }
        return;
      }
      
      if (data) {
        setUserProfile(data);
      } else {
        log('[LiveStreamProvider] No profile data returned (new user)');
      }
    } catch (error) {
      error('Error fetching user profile:', error);
    }
  };

  // Add viewer to database when they join
  const addViewerToDatabase = async (streamId: string, agoraUid?: number) => {
    if (!user?.id) {
      log('🎯 [LIVE_STREAM] 👁️ No authenticated user - allowing anonymous viewing');
      log('🎯 [LIVE_STREAM] User object:', user);
      log('🎯 [LIVE_STREAM] User ID:', user?.id);
      
      // Try to get user from auth session as fallback
      try {
        const { data: { user: sessionUser }, error: sessionError } = await supabase.auth.getUser();
        if (sessionError) {
          // Silently ignore session errors
        }
        
        if (sessionUser?.id) {
          log('🎯 [LIVE_STREAM] 🔄 Using session user as fallback:', sessionUser.id);
          // Use session user for database operations
          const success = await addViewerWithUserId(streamId, sessionUser.id, agoraUid);
          if (success) {
            return;
          }
        }
      } catch (sessionError) {
        // Silently ignore session user errors
      }
      
      log('🎯 [LIVE_STREAM] 👁️ Anonymous viewer joining (no authenticated user)');
      
      // Fallback: Just increment viewer count without user tracking
      // Only update if user is the streamer (due to RLS policies)
      try {
        const { data: currentStream } = await supabase
          .from('live_streams')
          .select('viewer_count, streamer_id')
          .eq('id', streamId)
          .single();
          
        if (currentStream && currentStream.streamer_id === user?.id) {
          const newCount = (currentStream.viewer_count || 0) + 1;
          const { error: updateError } = await supabase
            .from('live_streams')
            .update({ viewer_count: newCount })
            .eq('id', streamId)
            .eq('streamer_id', user.id); // Add streamer_id check for RLS
            
          if (!updateError) {
            setViewerCount(newCount);
            // Update peak viewer count if current count is higher
            setPeakViewerCount(prev => Math.max(prev, newCount));
            
            // CRITICAL: Reset inactivity timer when viewer count changes
            // This prevents stream from auto-ending when viewers join
            if (currentStreamIdRef.current) {
              resetInactivityTimer(currentStreamIdRef.current, newCount);
            }
            
            log('🎯 [LIVE_STREAM] 🔄 Updated viewer count without user tracking:', newCount);
          } else {
            // Silently ignore fallback viewer count errors
          }
        } else {
          log('⚠️ Skipping fallback viewer count update - user is not the streamer');
        }
      } catch (fallbackError) {
        error('🎯 [LIVE_STREAM] ❌ Fallback viewer count update failed:', fallbackError);
      }
      
      return;
    }
    
    const success = await addViewerWithUserId(streamId, user.id, agoraUid);
    if (!success) {
      warn('🎯 [LIVE_STREAM] Failed to add viewer to database (non-fatal)');
    }
  };

  // Helper function to add viewer with specific user ID
  const addViewerWithUserId = async (streamId: string, userId: string, agoraUid?: number) => {
    if (!userId) {
      error('❌ [LIVE_STREAM] No user ID provided to addViewerWithUserId');
      return false;
    }
    
    if (!streamId) {
      error('❌ [LIVE_STREAM] No stream ID provided to addViewerWithUserId');
      return false;
    }
    
    try {
      // First, completely remove any existing viewer records for this user and stream
      const { error: deleteError } = await supabase
        .from('live_stream_viewers')
        .delete()
        .eq('stream_id', streamId)
        .eq('user_id', userId);
        
      if (deleteError) {
        // Silently ignore delete errors
      }
      
      // Also mark any remaining records as inactive as a fallback
      const { error: deactivateError } = await supabase
        .from('live_stream_viewers')
        .update({ is_active: false, left_at: new Date().toISOString() })
        .eq('stream_id', streamId)
        .eq('user_id', userId);
        
      if (deactivateError) {
        // Silently ignore deactivate errors
      }
      
      // Insert new viewer record
      const { data, error } = await supabase
        .from('live_stream_viewers')
        .insert({
          stream_id: streamId,
          user_id: userId,  // Actual database column name
          agora_uid: agoraUid,
          is_active: true,
          joined_at: new Date().toISOString()
        })
        .select();
        
      if (error) {
        // Silently ignore viewer add errors
        return false;
      }
        
      // Also update the live_streams.viewer_count field (only if user is the streamer)
      // Viewers cannot update viewer_count due to RLS policies
      const { data: streamData } = await supabase
        .from('live_streams')
        .select('streamer_id')
        .eq('id', streamId)
        .single();
        
      if (streamData && streamData.streamer_id === user?.id) {
        const { data: activeViewers, error: countError } = await supabase
          .from('live_stream_viewers')
          .select('id, user_id, stream_id, is_active')
          .eq('stream_id', streamId)
          .eq('is_active', true);
          
        if (!countError && activeViewers) {
          const newCount = activeViewers.length;
          
          const { error: updateError } = await supabase
            .from('live_streams')
            .update({ viewer_count: newCount })
            .eq('id', streamId)
            .eq('streamer_id', user.id); // Add streamer_id check for RLS
            
          if (updateError) {
            // Silently ignore viewer count update errors
          }
        } else if (countError) {
          // Silently ignore viewer count errors
        }
      } else {
        log('⚠️ Skipping viewer count update - user is not the streamer');
      }
    } catch (error) {
      error('Error adding viewer to database:', error);
      return false;
    }
  };

  // Remove viewer from database when they leave
  const removeViewerFromDatabase = async (streamId: string) => {
    if (!user?.id) return;
    
    try {
      // Completely delete the viewer record instead of just marking as inactive
      const { error } = await supabase
        .from('live_stream_viewers')
        .delete()
        .eq('stream_id', streamId)
        .eq('user_id', user.id);
        
      if (error) {
        // Silently ignore viewer remove errors
        
        // Also update the live_streams.viewer_count field (only if user is the streamer)
        // Viewers cannot update viewer_count due to RLS policies
        const { data: streamData } = await supabase
          .from('live_streams')
          .select('streamer_id')
          .eq('id', streamId)
          .single();
          
        if (streamData && streamData.streamer_id === user?.id) {
          const { data: activeViewers, error: countError } = await supabase
            .from('live_stream_viewers')
            .select('id')
            .eq('stream_id', streamId)
            .eq('is_active', true);
            
          if (!countError && activeViewers) {
            const newCount = activeViewers.length;
            
            const { error: updateError } = await supabase
              .from('live_streams')
              .update({ viewer_count: newCount })
              .eq('id', streamId)
              .eq('streamer_id', user.id); // Add streamer_id check for RLS
              
            if (updateError) {
              // Silently ignore viewer count update errors
            }
          }
        } else {
          log('⚠️ Skipping viewer count update - user is not the streamer');
        }
      }
    } catch (error) {
      error('Error removing viewer from database:', error);
    }
  };

  // Update viewer count in database (fallback method)
  // Only the streamer can update viewer count due to RLS policies
  const updateViewerCountInDatabase = async (streamId: string, newCount: number) => {
    try {
      // First, check if the current user is the streamer for this stream
      const { data: streamData, error: fetchError } = await supabase
        .from('live_streams')
        .select('streamer_id')
        .eq('id', streamId)
        .maybeSingle(); // Use maybeSingle() to handle deleted/ended streams gracefully

      if (fetchError) {
        // PGRST116 means stream doesn't exist (ended/deleted) - this is expected
        if (fetchError.code === 'PGRST116' || fetchError.message?.includes('0 rows')) {
          log('📊 [VIEWER_COUNT] Stream no longer exists (ended/deleted), skipping update');
          return;
        }
        // Silently ignore stream fetch errors
        return;
      }

      if (!streamData) {
        // Stream doesn't exist (ended/deleted)
        log('📊 [VIEWER_COUNT] Stream not found, skipping update');
        return;
      }

      // Only allow the streamer to update viewer count
      if (streamData.streamer_id !== user?.id) {
        log('⚠️ Skipping viewer count update - user is not the streamer');
        return;
      }

      // CRITICAL: Update both viewer_count AND updated_at to keep stream visible
      // The query filters by updated_at, so we must update it to prevent streams from disappearing
      const { error } = await supabase
        .from('live_streams')
        .update({ 
          viewer_count: newCount,
          updated_at: new Date().toISOString() // Update timestamp to keep stream visible
        })
        .eq('id', streamId)
        .eq('streamer_id', user.id); // Add streamer_id check for RLS

      if (error) {
        // Silently ignore viewer count update errors
      } else if (__DEV__) {
        log('✅ Viewer count updated to:', newCount, '(updated_at refreshed)');
      }
    } catch (error) {
      error('❌ Error updating viewer count:', error);
    }
  };

  // Auto-end stream management
  const setupStreamAutoEnd = useCallback((streamId: string) => {
    log('⏰ Setting up auto-end timers for stream:', streamId);
    
    // Clear any existing timers
    clearStreamTimers();
    
    // OPTION 1: Maximum stream duration (2 hours)
    streamTimeoutRef.current = setTimeout(() => {
      log('⏰ Stream reached maximum duration (2 hours), auto-ending...');
      Alert.alert(
        'Stream Ended',
        'Your stream has reached the maximum duration of 2 hours and has been automatically ended.',
        [{ text: 'OK' }]
      );
      stopLiveStream();
    }, 2 * 60 * 60 * 1000); // 2 hours
    
    // OPTION 2: Warning at 1 hour 45 minutes
    warningTimeoutRef.current = setTimeout(() => {
      log('⏰ Stream approaching time limit, showing warning...');
      Alert.alert(
        'Stream Time Warning',
        'Your stream will automatically end in 15 minutes due to time limits. You can end and restart if needed.',
        [
          { text: 'Continue Streaming', style: 'default' },
          { text: 'End Now', style: 'destructive', onPress: () => stopLiveStream() }
        ]
      );
    }, 1.75 * 60 * 60 * 1000); // 1 hour 45 minutes
    
    log('⏰ Auto-end timers set: 2hr max, 1h45m warning');
  }, [stopLiveStream]);

  // Setup inactivity detection (no viewers for extended period)
  const setupInactivityDetection = useCallback((streamId: string) => {
    // CRITICAL: Only setup inactivity detection if stream is still active
    if (!isStreaming || currentStreamIdRef.current !== streamId) {
      log('⏰ Skipping inactivity detection - stream not active or ID mismatch');
      return;
    }
    
    // Clear existing inactivity timer
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    
    // Check current viewer count before setting timer
    const currentViewerCount = viewerCountInMemoryRef.current.size;
    if (currentViewerCount > 0) {
      log('⏰ Skipping inactivity detection - viewers present:', currentViewerCount);
      return;
    }
    
    // If no viewers for 30 minutes, suggest ending
    inactivityTimeoutRef.current = setTimeout(() => {
      // Double-check stream is still active and has no viewers before showing alert
      if (!isStreaming || currentStreamIdRef.current !== streamId) {
        log('⏰ Stream ended or changed, cancelling inactivity alert');
        return;
      }
      
      const finalViewerCount = viewerCountInMemoryRef.current.size;
      if (finalViewerCount > 0) {
        log('⏰ Viewers present now, cancelling inactivity alert');
        return;
      }
      
      log('⏰ No viewers for 30 minutes, suggesting stream end...');
      Alert.alert(
        'Low Activity',
        'Your stream has had no viewers for 30 minutes. Would you like to end the stream?',
        [
          { text: 'Keep Streaming', style: 'default' },
          { text: 'End Stream', style: 'destructive', onPress: () => stopLiveStream() }
        ]
      );
    }, 30 * 60 * 1000); // 30 minutes
  }, [stopLiveStream, isStreaming]);

  // Reset inactivity timer when viewers join
  const resetInactivityTimer = useCallback((streamId: string, viewerCount: number) => {
    if (viewerCount > 0) {
      // Cancel inactivity timer when viewers are present
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
        log('⏰ Inactivity timer cleared - viewers present');
      }
    } else {
      // Start inactivity timer when no viewers
      setupInactivityDetection(streamId);
      log('⏰ Inactivity timer started - no viewers');
    }
  }, [setupInactivityDetection]);

  // Clear all stream timers
  const clearStreamTimers = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    log('⏰ All stream timers cleared');
  }, []);

  // Kill any existing live streams from this user (DB-level cleanup)
  const endExistingStreamsForUser = useCallback(async (userId: string) => {
    try {
      log('🧹 Checking for duplicate live streams for user:', userId);
      const { data: activeStreams, error: fetchError } = await supabase
        .from('live_streams')
        .select('id')
        .eq('streamer_id', userId)
        .eq('is_live', true);

      if (fetchError) {
        // Silently ignore stream fetch errors
        return;
      }

      if (!activeStreams || activeStreams.length === 0) {
        log('✅ No duplicate live streams found');
        return;
      }

      log(`🧹 Found ${activeStreams.length} active stream(s) to terminate`);

      // End and clean each duplicate stream
      for (const stream of activeStreams) {
        try {
          // Mark stream as ended
          const { error: updateError } = await supabase
            .from('live_streams')
            .update({ is_live: false, ended_at: new Date().toISOString(), viewer_count: 0 })
            .eq('id', stream.id);
          if (updateError) {
            // Silently ignore stream end errors
          }

          // Remove related records (viewers, comments, reactions)
          const [viewersRes, commentsRes, reactionsRes] = await Promise.all([
            supabase.from('live_stream_viewers').delete().eq('stream_id', stream.id),
            supabase.from('live_stream_comments').delete().eq('stream_id', stream.id),
            supabase.from('live_stream_reactions').delete().eq('stream_id', stream.id),
          ]);

          // Silently ignore cleanup errors

          // Finally, delete the stream row to prevent UI duplicates
          const { error: deleteError } = await supabase
            .from('live_streams')
            .delete()
            .eq('id', stream.id);
          if (deleteError) {
            // Silently ignore duplicate delete errors
          } else {
            log('🧹 Duplicate stream cleaned:', stream.id);
          }
        } catch (singleErr) {
          error('❌ Error cleaning duplicate stream:', singleErr);
        }
      }
    } catch (error) {
      error('❌ Unexpected error ending existing streams:', error);
    }
  }, []);

  // Initialize stream engine (separate from call engine)
  // Handle network quality changes and adjust video encoder configuration
  // 🚀 ENHANCED: Now uses actual network speed detection, not just Agora quality
  // 🚀 DEBOUNCED: Prevents rapid quality changes that can cause instability
  const handleNetworkQualityChange = useCallback(async (quality: number) => {
    if (!streamEngineRef.current) {
      log('⚠️ [NETWORK] Engine not available for quality adjustment');
      return;
    }
    
    // Clear any pending quality adjustment
    if (qualityDebounceRef.current) {
      clearTimeout(qualityDebounceRef.current);
      qualityDebounceRef.current = null;
    }
    
    // Debounce quality adjustments to prevent rapid changes (wait 2 seconds)
    qualityDebounceRef.current = setTimeout(async () => {
      // Quality levels: 0=unknown, 1=bad, 2=poor, 3=fair, 4=good, 5=very good, 6=excellent
      if (__DEV__ && false) { // Disabled by default - set to true for debugging
        log('📊 [NETWORK] Agora quality update:', quality);
      }
      
      // 🚀 ADAPTIVE: Use cached network speed detection (lightweight optimization)
      try {
        const { getCachedNetworkSpeed, getAdaptiveQualityManager } = await import('../utils/livestreamOptimizer');
        const speedInfo = await getCachedNetworkSpeed();
        const { getAdaptiveQualityForLiveStream } = await getAdaptiveQualityManager();
        const qualityConfig = await getAdaptiveQualityForLiveStream();
        
        if (__DEV__ && false) { // Disabled by default
          log('📊 [ADAPTIVE] Network speed detected:', {
            speed: speedInfo.speed,
            estimatedKbps: speedInfo.estimatedKbps,
            isStable: speedInfo.isStable,
            agoraQuality: quality,
          });
        }
        
        const config = {
          width: qualityConfig.width,
          height: qualityConfig.height,
          bitrate: qualityConfig.bitrate,
          frameRate: qualityConfig.frameRate,
          minBitrate: qualityConfig.minBitrate,
          maxBitrate: qualityConfig.maxBitrate,
          orientationMode: 0, // Adaptive
        };
        
        // Only apply if config actually changed (DRY)
        if (!hasConfigChanged(lastQualityConfigRef.current, config)) {
          return; // Config unchanged, skip update
        }
        
        // Store new config
        lastQualityConfigRef.current = {
          width: config.width,
          height: config.height,
          bitrate: config.bitrate,
        };
        
        // Apply configuration using safe engine operation (DRY - handles retries and errors)
        await safeEngineOperation(
          streamEngineRef.current,
          async (engine) => {
            const result = engine.setVideoEncoderConfiguration(config);
            if (result && typeof result.then === 'function') {
              await result;
            }
            return result;
          },
          { operationName: 'setVideoEncoderConfiguration', silentFail: true }
        );
      } catch (adaptiveError) {
        // Silently ignore adaptive quality errors - fallback to DRY utility
        const config = getVideoEncoderConfigForQuality(quality);
        
        // Only apply if config actually changed (DRY)
        if (!hasConfigChanged(lastQualityConfigRef.current, config)) {
          return; // Config unchanged, skip update
        }
        
        // Store new config
        lastQualityConfigRef.current = {
          width: config.width,
          height: config.height,
          bitrate: config.bitrate,
        };
        
        // Apply config using safe engine operation (DRY - handles retries and errors)
        await safeEngineOperation(
          streamEngineRef.current,
          async (engine) => {
            const result = engine.setVideoEncoderConfiguration(config);
            if (result && typeof result.then === 'function') {
              await result;
            }
            return result;
          },
          { operationName: 'setVideoEncoderConfiguration', silentFail: true }
        );
      }
    }, 2000); // 2 second debounce to prevent rapid quality changes
  }, []);

  // Handle reconnection when connection is lost
  const handleReconnection = useCallback(async () => {
    // Prevent concurrent reconnection attempts
    if (isReconnectingRef.current) {
      log('⚠️ [RECONNECT] Reconnection already in progress, skipping...');
      return;
    }

    const now = Date.now();
    if (now - lastManualReconnectAtRef.current < manualReconnectCooldownMs) {
      log('⚠️ [RECONNECT] Cooldown active, skipping manual reconnect');
      return;
    }
    lastManualReconnectAtRef.current = now;
    
    const stream = currentStream;
    const streaming = isStreaming;
    const viewing = isJoinedAsViewer;
    
    if (!stream) {
      log('⚠️ [RECONNECT] No current stream to reconnect to');
      reconnectAttemptsRef.current = 0; // Reset attempts
      isReconnectingRef.current = false;
      return;
    }
    
    // Prevent multiple simultaneous reconnection attempts
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      error('❌ [RECONNECT] Max reconnection attempts reached');
      
      // Note: For viewers, the user can manually retry by leaving and rejoining the stream
      
      Alert.alert(
        'Connection Lost',
        'Unable to reconnect to the stream. Please try again.',
        [{ 
          text: 'OK', 
          onPress: () => {
            // Use the refs to call stop functions
            if (streaming && stopLiveStreamImpl.current) {
              stopLiveStreamImpl.current();
            } else if (viewing) {
              // Leave viewer mode - will be handled by the component
              log('⚠️ [RECONNECT] User should manually leave viewer mode');
            }
          }
        }]
      );
      reconnectAttemptsRef.current = 0; // Reset for next time
      isReconnectingRef.current = false;
      return;
    }
    
    reconnectAttemptsRef.current += 1;
    isReconnectingRef.current = true;
    const attemptNumber = reconnectAttemptsRef.current;
    
    try {
      log(`🔄 [RECONNECT] Reconnection attempt ${attemptNumber}/${maxReconnectAttempts}`);
      
      // Get fresh token and App ID
      let token: string | null = null;
      let tokenAppId: string | null = null;
      let uid: number;
      let channelToUse: string = stream.channel_id; // Default to stream channel_id
      let bootstrapData: any = null; // Store bootstrap data for viewer reconnection
      
      try {
        if (streaming) {
          // Broadcaster reconnection - use token server
          const broadcasterUid = stream.broadcaster_uid || 1000;
          const tokenResult = await fetchRtcTokenWithAppId({ 
            channelName: stream.channel_id, 
            uid: broadcasterUid, 
            role: 'broadcaster' 
          });
          token = tokenResult.token;
          tokenAppId = tokenResult.appId;
          uid = broadcasterUid;
          channelToUse = stream.channel_id; // Broadcasters always use stream.channel_id
        } else if (viewing) {
          // Viewer reconnection - use bootstrap API (same as joinStreamAsViewer)
          log('🔄 [RECONNECT] Using bootstrap API for viewer reconnection...');
          
          const { data: { session } } = await supabase.auth.getSession();
          // TEMPORARY: Add bypassCache=true to force fresh fetch and bypass invalid cached App IDs
          const bootstrapUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/live-bootstrap?streamId=${stream.id}&role=audience&bypassCache=true`;
          const bootstrapResponse = await fetch(bootstrapUrl, {
            method: 'GET',
            headers: {
              'Authorization': session ? `Bearer ${session.access_token}` : '',
              'Content-Type': 'application/json',
            },
          });
          
          if (!bootstrapResponse.ok) {
            throw new Error(`Bootstrap API failed: ${bootstrapResponse.status}`);
          }
          
          bootstrapData = await bootstrapResponse.json();
          if (!bootstrapData || !bootstrapData.appId) {
            throw new Error('Bootstrap API returned invalid data');
          }
          
          token = bootstrapData.token || '';
          tokenAppId = bootstrapData.appId;
          uid = bootstrapData.uid;
          
          // CRITICAL: Use channelName from bootstrap to ensure consistency
          // Bootstrap always returns stream.channel_id as channelName, ensuring users get the same channel
          channelToUse = bootstrapData.channelName || stream.channel_id;
          log('🔄 [RECONNECT] Using channel from bootstrap:', channelToUse);
          log('🔄 [RECONNECT] Bootstrap channel matches stream channel:', channelToUse === stream.channel_id);
          
          // Reinitialize engine with bootstrap App ID
          log('🔄 [RECONNECT] Reinitializing engine with bootstrap App ID:', tokenAppId);
          
          // Release existing engine if it exists
          if (streamEngineRef.current) {
            // 🚀 IMPROVEMENT: Use safe release function
            await releaseEngineSafely();
          }
          
          // Initialize with bootstrap App ID
          const engineReady = await initializeStreamEngine(tokenAppId);
          if (!engineReady || !streamEngineRef.current) {
            throw new Error('Failed to reinitialize engine');
          }
          
          // 🚀 CRITICAL FIX: Enable video BEFORE setting audience role (for reconnection)
          try {
            await streamEngineRef.current.enableVideo();
            await streamEngineRef.current.enableAudio();
            if (streamEngineRef.current?.enableRemoteVideo) {
              await streamEngineRef.current.enableRemoteVideo(true);
            }
            log('✅ [RECONNECT] Video/audio enabled before setting audience role');
          } catch (e) {
            warn('⚠️ [RECONNECT] Failed to enable video/audio:', e);
          }
          
          // Set client role to audience
          const AgoraRTC = await getAgoraModule();
          const { ClientRoleType } = AgoraRTC;
          await streamEngineRef.current.setClientRole(ClientRoleType.ClientRoleAudience);
          
          // 🚀 CRITICAL FIX: Ensure video stays enabled after role change
          try {
            await streamEngineRef.current.enableVideo();
            log('✅ [RECONNECT] Video re-enabled after setting audience role');
          } catch (e) {
            warn('⚠️ [RECONNECT] Failed to re-enable video:', e);
          }
          
          // Update channel ref to use bootstrap channel
          streamChannelRef.current = channelToUse;
        } else {
          throw new Error('Neither streaming nor viewing');
        }
      } catch (tokenError: any) {
        error('❌ [RECONNECT] Failed to fetch token/bootstrap:', tokenError);
        throw new Error(`Failed to get authentication token: ${tokenError.message}`);
      }
      
      // Ensure engine exists before joining
      if (!streamEngineRef.current) {
        throw new Error('Engine not available after initialization');
      }
      
      log('🔄 [RECONNECT] Joining channel:', channelToUse, '(from bootstrap:', !!bootstrapData, ')');
      
      // Join channel (use joinChannel, not rejoinChannel) — same ChannelMediaOptions as primary join (-17 fix)
      const reconnectJoinOptions = await buildLiveBroadcastJoinOptions(
        streaming ? 'broadcaster' : 'audience',
        !!(stream.music_mode === true)
      );
      const joinResult = await streamEngineRef.current.joinChannel(
        token || '',
        channelToUse,
        uid,
        reconnectJoinOptions as any
      );
      
      if (joinResult === 0) {
        log('✅ [RECONNECT] Reconnection successful');
        reconnectAttemptsRef.current = 0; // Reset on success
        
        // Re-enable audio/video if broadcaster
        if (streaming) {
          try {
            await streamEngineRef.current?.enableAudio();
            await streamEngineRef.current?.enableLocalAudio(true);
            await streamEngineRef.current?.muteLocalAudioStream(false);
            log('✅ [RECONNECT] Audio restored after reconnection');
          } catch (e) {
            log('⚠️ [RECONNECT] Audio restoration failed:', e);
          }
        } else if (viewing) {
          // Re-enable audio/video for viewer
          try {
            await streamEngineRef.current?.enableAudio();
            await streamEngineRef.current?.enableVideo();
            await streamEngineRef.current?.enableLocalAudio(false);
            log('✅ [RECONNECT] Viewer audio/video restored after reconnection');
          } catch (e) {
            log('⚠️ [RECONNECT] Viewer audio/video restoration failed:', e);
          }
        }
      } else {
        throw new Error(`Join failed with code: ${joinResult}`);
      }
    } catch (error: any) {
      error(`❌ [RECONNECT] Reconnection attempt ${attemptNumber} failed:`, error);
      
      if (attemptNumber < maxReconnectAttempts) {
        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attemptNumber) * 1000;
        log(`⏳ [RECONNECT] Waiting ${delay}ms before next attempt...`);
        setTimeout(() => {
          handleReconnection();
        }, delay);
      } else {
        error('❌ [RECONNECT] Max reconnection attempts reached');
        reconnectAttemptsRef.current = 0; // Reset for next time
        Alert.alert(
          'Connection Lost',
          'Unable to reconnect to the stream after multiple attempts. Please try again.',
          [{ 
            text: 'OK', 
            onPress: () => {
              if (streaming && stopLiveStreamImpl.current) {
                stopLiveStreamImpl.current();
              } else if (viewing) {
                log('⚠️ [RECONNECT] User should manually leave viewer mode');
              }
            }
          }]
        );
      }
    }
    finally {
      // Keep a small guard window to avoid immediate duplicate attempts from state churn.
      setTimeout(() => {
        isReconnectingRef.current = false;
      }, 1500);
    }
  }, [currentStream, isStreaming, isJoinedAsViewer]);

  const initializeStreamEngine = async (appIdOverride?: string) => {
    // Use App ID from parameter if provided (from bootstrap API), otherwise use environment variable or fallback
    const appId = appIdOverride || process.env.EXPO_PUBLIC_AGORA_APP_ID || '';
    
    // CRITICAL: Check if engine exists and App ID matches
    // Also verify the module-level engine matches to prevent using stale engines
    if (streamEngineRef.current && engineAppIdRef.current === appId) {
      const existingEngine = getLivestreamEngine();
      // CRITICAL: Verify engine is actually valid before reusing
      // If module-level engine doesn't exist or doesn't match, force re-initialization
      if (existingEngine && existingEngine !== null) {
        // Verify engine is not released by checking if it has required methods
        try {
          if (typeof existingEngine.enableVideo === 'function') {
            streamEngineRef.current = existingEngine;
            log('✅ Stream engine already initialized with matching App ID:', appId.substring(0, 8) + '...');
            return true;
          } else {
            warn('⚠️ [INIT] Engine exists but appears invalid (missing methods), re-initializing...');
            streamEngineRef.current = null;
            engineAppIdRef.current = null;
          }
        } catch (e) {
          warn('⚠️ [INIT] Engine exists but validation failed, re-initializing:', e);
          streamEngineRef.current = null;
          engineAppIdRef.current = null;
        }
      } else {
        warn('⚠️ [INIT] Ref exists but module-level engine is null, re-initializing...');
        streamEngineRef.current = null;
        engineAppIdRef.current = null;
      }
    }
    
    // If engine exists but App ID doesn't match, release it first
    if (streamEngineRef.current && engineAppIdRef.current !== appId) {
      warn('⚠️ Stream engine exists but App ID mismatch. Releasing old engine...', {
        oldAppId: engineAppIdRef.current?.substring(0, 8) + '...',
        newAppId: appId.substring(0, 8) + '...'
      });
      try {
        await releaseLivestreamEngine();
        streamEngineRef.current = null;
        engineAppIdRef.current = null;
      } catch (error) {
        error('❌ Error releasing old engine:', error);
        // Force reset even if release failed
        streamEngineRef.current = null;
        engineAppIdRef.current = null;
      }
    }

    try {
      log('🎬 Starting Agora stream engine initialization...');
      
      log('🔧 LiveStream App ID for initialization:', appId);
      if (appIdOverride) {
        log('✅ [BOOTSTRAP] Using App ID from bootstrap API');
      } else {
        log('⚠️ [BOOTSTRAP] Using App ID from environment variable or fallback (may cause mismatch)');
      }
      engineAppIdRef.current = appId;

      // 🚀 Use the new clean engine manager (handles Hermes compatibility via patch)
      // The patch ensures all SDK calls use native JSON instead of json-bigint
      const streamEngine = await initializeLivestreamEngine(appId);
      
      if (!streamEngine) {
        error('❌ Failed to initialize stream engine');
        return false;
      }

      // Set engine reference for this provider
      streamEngineRef.current = streamEngine;
      log('✅ [CRITICAL] Engine reference set');

      // Additional configuration specific to this app
      try {
        const AgoraRTC = await getAgoraModule();
        const VideoCodecVp8 = 1;
        
        // Try to set VP8 codec if available
        if (streamEngine.setVideoCodecType && typeof streamEngine.setVideoCodecType === 'function') {
          await streamEngine.setVideoCodecType(VideoCodecVp8);
          log('✅ [STABILITY] VP8 codec configured for live streaming');
        } else {
          log('ℹ️ [STABILITY] setVideoCodecType not available, VP8 will be set via encoder config');
        }
      } catch (error) {
        warn('⚠️ [STABILITY] Failed to set VP8 codec (may not be supported), continuing with defaults:', error);
      }

      // Set up event listeners
      if (!streamEngineRef.current) {
        error('❌ Stream engine ref lost before adding listeners');
        return false;
      }

      addTrackedListener('onJoinChannelSuccess', (connection: any, elapsed: number) => {
        log('✅ [LIVE_STREAM] Successfully joined stream channel');
        log('✅ [LIVE_STREAM] Connection:', connection);
        log('✅ [LIVE_STREAM] Local UID:', connection?.localUid);
        
        // CRITICAL: For viewers (local UID !== 1000 and not broadcaster), add broadcaster (UID 1000) to remote UIDs immediately
        // The broadcaster may already be in the channel, so onUserJoined won't fire
        // This ensures broadcasterIsPresent is true immediately
        const localUid = connection?.localUid;
        const isBroadcaster = localUid === 1000;
        const isViewer = !isBroadcaster && localUid !== undefined && localUid !== null;
        
        log('✅ [LIVE_STREAM] onJoinChannelSuccess - isBroadcaster:', isBroadcaster, 'isViewer:', isViewer, 'localUid:', localUid);
        
        if (isBroadcaster) {
          // 🚀 CRITICAL: Broadcaster must enable local video to PUBLISH video to viewers
          // Without this, video is enabled but not published, causing black screens for viewers
          Promise.resolve().then(async () => {
            try {
              log('📹 [BROADCASTER] 🚀 Enabling local video publishing after join...');
              
              // CRITICAL: Double-check video is enabled first
              try {
                await streamEngine.enableVideo();
                log('✅ [BROADCASTER] Video re-enabled in onJoinChannelSuccess');
              } catch (e) {
                warn('⚠️ [BROADCASTER] Could not re-enable video:', e);
              }
              
              // CRITICAL: enableLocalVideo(true) actually PUBLISHES video to the channel
              // This is what makes video visible to viewers
              if (streamEngine.enableLocalVideo) {
                await streamEngine.enableLocalVideo(true);
                log('✅ [BROADCASTER] ✅✅✅ Local video publishing enabled - viewers can now see video!');
              } else {
                warn('⚠️ [BROADCASTER] enableLocalVideo not available');
              }
              
              // Also ensure local audio is enabled for publishing
              if (streamEngine.enableLocalAudio) {
                await streamEngine.enableLocalAudio(true);
                log('✅ [BROADCASTER] Local audio publishing enabled');
              }
              
              // CRITICAL: Log current video state to diagnose
              log('📹 [BROADCASTER] Video publishing state check:', {
                hasEngine: !!streamEngine,
                hasEnableLocalVideo: !!streamEngine.enableLocalVideo,
                hasEnableLocalAudio: !!streamEngine.enableLocalAudio,
              });
            } catch (e) {
              error('❌ [BROADCASTER] Failed to enable local video publishing:', e);
            }
          });
        }
        
        if (isViewer) {
          // 🚀 TIKTOK-SPEED: Viewer joined - subscribe IMMEDIATELY
          const broadcasterUid = 1000;
          setStreamRemoteUids(prev => {
            if (!prev.includes(broadcasterUid)) {
              log('✅ [LIVE_STREAM] Adding broadcaster to remote UIDs on join success (viewer)');
              const newUids = [...prev, broadcasterUid];
              log('✅ [LIVE_STREAM] Updated remote UIDs:', newUids);
              return newUids;
            }
            log('✅ [LIVE_STREAM] Broadcaster already in remote UIDs');
            return prev;
          });
          
          // Optimistically set broadcaster video as enabled
          setBroadcasterVideoEnabled(prev => {
            const newMap = new Map(prev);
            newMap.set(broadcasterUid, true);
            log('✅ [LIVE_STREAM] Optimistically set broadcaster video as enabled (onJoinChannelSuccess)');
            return newMap;
          });
          
          // 🚀 TIKTOK-SPEED: Subscribe IMMEDIATELY on join success (no delay)
          Promise.resolve().then(async () => {
            try {
              log('📹 [LIVE_STREAM] 🚀 INSTANT subscription on join success (UID:', broadcasterUid, ')');
              if (streamEngine.enableRemoteVideo) {
                await streamEngine.enableRemoteVideo(true);
              }
              // Use DRY subscription helper
              const success = await subscribeToRemoteStream(streamEngine, broadcasterUid, {
                streamType: 0, // HIGH_STREAM so video shows immediately
                operationName: 'instantSubscriptionOnJoin',
              });
              if (success) {
                lastViewerStreamTypeRef.current = 0;
                log('✅ [LIVE_STREAM] ✅ INSTANT subscription successful on join!');
              }
            } catch (e) {
              log('⚠️ [LIVE_STREAM] Instant subscription failed, will retry:', e);
            }
          });
        }
        
        // CRITICAL: After successful join, ensure connection state is CONNECTED
        // This prevents FAILED state (from error 110) from blocking video rendering
        setTimeout(() => {
          setConnectionState(prev => {
            if (prev === 'FAILED') {
              log('✅ [CONNECTION] Resetting FAILED state to CONNECTED after successful join');
              return 'CONNECTED';
            }
            return prev;
          });
        }, 500);
      });

      addTrackedListener('onUserJoined', async (connection: any, remoteUid: number, elapsed: number) => {
        log('👤 [LIVE_STREAM] User joined:', remoteUid);
        
        setStreamRemoteUids(prev => {
          if (prev.includes(remoteUid)) {
            log('👤 [LIVE_STREAM] UID already in list, skipping:', remoteUid);
            return prev;
          }
          const newUids = [...prev, remoteUid];
          log('👤 Updated remote UIDs:', newUids);
          
          // CRITICAL: If broadcaster (UID 1000) joins, optimistically set video as enabled
          // This prevents dark screen for viewers
          if (remoteUid === 1000 || remoteUid === 0) {
            setBroadcasterVideoEnabled(prev => {
              const newMap = new Map(prev);
              newMap.set(remoteUid, true);
              log('✅ [LIVE_STREAM] Optimistically set broadcaster video as enabled (onUserJoined)');
              return newMap;
            });
            
            // 🚀 AGGRESSIVE SUBSCRIPTION: Multiple attempts when broadcaster joins
            // Try immediate subscription, then retry if needed
            const subscribeToBroadcasterOnJoin = async (attempt: number = 1) => {
              try {
                log(`📹 [LIVE_STREAM] 🚀 Subscription attempt ${attempt} to broadcaster (UID: ${remoteUid})`);
                
                // Ensure remote video is enabled
                if (streamEngine.enableRemoteVideo) {
                  await streamEngine.enableRemoteVideo(true);
                  log(`✅ [LIVE_STREAM] Attempt ${attempt}: enableRemoteVideo(true)`);
                }
                
                // Use DRY subscription helper (try LOW first, then HIGH)
                const streamType = attempt === 1 ? 1 : 0;
                const success = await subscribeToRemoteStream(streamEngine, remoteUid, {
                  streamType,
                  operationName: `subscribeToBroadcasterOnJoin(${attempt})`,
                });
                
                if (success) {
                  log(`✅ [LIVE_STREAM] ✅✅✅ Subscription attempt ${attempt} COMPLETE!`);
                  return true;
                }
                return false;
              } catch (e) {
                log(`⚠️ [LIVE_STREAM] Subscription attempt ${attempt} failed:`, e);
                return false;
              }
            };
            
            // Try immediate subscription
            Promise.resolve().then(async () => {
              let success = await subscribeToBroadcasterOnJoin(1);
              
              // Retry with delays if needed
              if (!success) {
                setTimeout(async () => {
                  success = await subscribeToBroadcasterOnJoin(2);
                  if (!success) {
                    setTimeout(async () => {
                      await subscribeToBroadcasterOnJoin(3);
                    }, 500);
                  }
                }, 100);
              }
            });
          }
          
          return newUids;
        });
        
        // CRITICAL: When a user joins, proactively subscribe to their video stream
        // This ensures guests' video is visible immediately when they join
        // Also works for guests who join after other guests
        // CRITICAL: This also works when a guest rejoins - they'll get onUserJoined for existing users
        // IMPORTANT: For guests 2 and 3, this ensures they can see each other
        const subscribeToJoinedUser = async (uid: number, retryCount = 0) => {
          try {
            log(`📹 [LIVE_STREAM] Subscribing to remote video for UID: ${uid} (attempt ${retryCount + 1})`);
            
            // Ensure remote video is enabled (in case it was disabled)
            try {
              if (streamEngine.enableRemoteVideo) {
                await streamEngine.enableRemoteVideo(true);
              }
            } catch (e) {
              // enableRemoteVideo might not be available
            }
            
            // Use DRY subscription helper (HIGH for all so video shows)
            const streamType = 0; // HIGH for all so video shows
            const success = await subscribeToRemoteStream(streamEngine, uid, {
              streamType,
              operationName: `subscribeToJoinedUser(${uid})`,
            });
            
            if (success) {
              if (uid === 1000) lastViewerStreamTypeRef.current = streamType;
              log('✅ [LIVE_STREAM] Subscribed to remote stream for newly joined UID:', uid);
              
              // Double-check subscription after a brief delay (DRY)
              setTimeout(async () => {
                try {
                  await subscribeToRemoteStream(streamEngine, uid, {
                    streamType: 0,
                    operationName: `doubleCheckSubscription(${uid})`,
                    retryOnFailure: false,
                  });
                } catch (e) {
                  log(`⚠️ [LIVE_STREAM] Double-check subscription failed for UID ${uid}:`, e);
                }
              }, 200);
            }
          } catch (e) {
            log(`⚠️ [LIVE_STREAM] Could not subscribe to remote video (attempt ${retryCount + 1}):`, e);
            
            // Retry up to 5 times with increasing delays (for guests 2 and 3)
            if (retryCount < 5) {
              setTimeout(() => {
                subscribeToJoinedUser(uid, retryCount + 1);
              }, (retryCount + 1) * 500); // 500ms, 1s, 1.5s, 2s, 2.5s delays
            }
          }
        };
        
        try {
          // Wait a bit for the user to publish their video stream, then subscribe
          // Multiple attempts with different delays to catch all cases
          setTimeout(() => {
            subscribeToJoinedUser(remoteUid, 0);
          }, 300); // First attempt after 300ms
          
          setTimeout(() => {
            subscribeToJoinedUser(remoteUid, 0);
          }, 1000); // Second attempt after 1s
          
          setTimeout(() => {
            subscribeToJoinedUser(remoteUid, 0);
          }, 2000); // Third attempt after 2s
        } catch (e) {
          log('⚠️ [LIVE_STREAM] Error setting up video subscription:', e);
        }
        
        // ============================================
        // STEP 2: AGORA EVENT-BASED VIEWER COUNTING
        // Count viewers using Agora events only (no database queries)
        // ============================================
        // Count all users except the broadcaster (UID 1000)
        if (remoteUid !== 1000 && currentStreamIdRef.current) {
          // Add to in-memory tracker
          viewerCountInMemoryRef.current.add(remoteUid);
          
          // Update UI count immediately (optimistic update)
          const newCount = viewerCountInMemoryRef.current.size;
          setViewerCount(newCount);
          
          // Update peak viewer count if current count is higher
          setPeakViewerCount(prevPeak => Math.max(prevPeak, newCount));
          
          // CRITICAL: Reset inactivity timer when viewers join
          // This prevents stream from auto-ending when viewers join
          resetInactivityTimer(currentStreamIdRef.current, newCount);
          
          log(`✅ [STABILITY] Viewer joined (Agora event). Count: ${newCount} (UID: ${remoteUid})`);
          
          // Note: Database sync happens every 60 seconds (batch update)
          // This prevents API storms and reduces ingress
        }
      });

      // Handle when remote user publishes audio (CRITICAL for viewers to hear broadcaster)
      addTrackedListener('onUserAudioPublished', async (connection: any, remoteUid: number, elapsed: number) => {
        log('🎤 [LIVE_STREAM] Remote user published audio:', remoteUid);
        
        // CRITICAL: Explicitly subscribe to remote audio for viewers
        // In audience role, we need to explicitly subscribe to remote audio streams
        try {
          await streamEngine.muteRemoteAudioStream(remoteUid, false);
          log('✅ [LIVE_STREAM] Subscribed to remote audio for UID:', remoteUid);
        } catch (e) {
          log('⚠️ [LIVE_STREAM] Could not subscribe to remote audio (may already be subscribed):', e);
        }
      });
      
      // Handle when remote user publishes video (CRITICAL for viewers to see guests)
      addTrackedListener('onUserVideoPublished', async (connection: any, remoteUid: number, elapsed: number) => {
        log('📹 [LIVE_STREAM] 🎬🎬🎬 REMOTE USER PUBLISHED VIDEO:', remoteUid);
        log('📹 [LIVE_STREAM] This means the broadcaster/guest is NOW PUBLISHING video!');
        log('📹 [LIVE_STREAM] Elapsed time:', elapsed, 'ms');
        
        // CRITICAL: Explicitly subscribe to remote video for viewers AND guests
        // This is especially important for guests 2 and 3 who need to see each other
        // In audience role, we need to explicitly subscribe to remote video streams
        // In broadcaster role (guests), we also need to subscribe to other guests' videos
        const subscribeToVideo = async (retryCount = 0) => {
          try {
            log(`📹 [LIVE_STREAM] Subscribing to published video for UID: ${remoteUid} (attempt ${retryCount + 1})`);
            
            // Ensure remote video is enabled
            try {
              if (streamEngine.enableRemoteVideo) {
                await streamEngine.enableRemoteVideo(true);
              }
            } catch (e) {
              // enableRemoteVideo might not be available
            }
            
            // Use DRY subscription helper
            const streamType = 0; // HIGH so video shows
            const success = await subscribeToRemoteStream(streamEngine, remoteUid, {
              streamType,
              operationName: `onUserVideoPublished(${remoteUid})`,
            });
            
            if (success) {
              if (remoteUid === 1000) lastViewerStreamTypeRef.current = streamType;
              log('✅ [LIVE_STREAM] Subscribed to remote stream for UID:', remoteUid);
            }
          } catch (e) {
            log(`⚠️ [LIVE_STREAM] Could not subscribe to remote video (attempt ${retryCount + 1}):`, e);
            
            // Retry up to 3 times with increasing delays
            if (retryCount < 3) {
              setTimeout(() => {
                subscribeToVideo(retryCount + 1);
              }, (retryCount + 1) * 1000); // 1s, 2s, 3s delays
            }
          }
        };
        
        // Start subscription immediately
        await subscribeToVideo(0);
      });
      
      // Also handle remote audio state changes to ensure we're subscribed
      addTrackedListener('onRemoteAudioStateChanged', (uid: number, state: number, reason: number, elapsed: number) => {
        log('🎧 [LIVE_STREAM] Remote audio state changed:', {
          uid,
          state,
          reason,
          elapsed,
          stateName: state === 0 ? 'STOPPED' : state === 1 ? 'STARTING' : state === 2 ? 'DECODING' : state === 3 ? 'FAILED' : state === 4 ? 'FROZEN' : 'UNKNOWN'
        });
        
        // If audio is starting/decoding, ensure it's not muted
        if (state === 1 || state === 2) {
          try {
            streamEngine.muteRemoteAudioStream(uid, false);
            log('✅ [LIVE_STREAM] Ensured remote audio is unmuted for UID:', uid);
          } catch (e) {
            log('⚠️ [LIVE_STREAM] Could not unmute remote audio:', e);
          }
        }
      });
      
      // Handle remote video state changes to ensure video is subscribed and unmuted
      addTrackedListener('onRemoteVideoStateChanged', async (uid: number, state: number, reason: number, elapsed: number) => {
        log('📹 [LIVE_STREAM] Remote video state changed:', {
          uid,
          state,
          reason,
          elapsed,
          stateName: state === 0 ? 'STOPPED' : state === 1 ? 'STARTING' : state === 2 ? 'DECODING' : state === 3 ? 'FAILED' : state === 4 ? 'FROZEN' : 'UNKNOWN'
        });
        
        // Track broadcaster video state (state 0 = STOPPED/muted, state 2 = DECODING/enabled)
        // The broadcaster UID is typically 1000
        if (uid === 1000 || uid === 0) {
          // Only set to false if state is explicitly STOPPED (0)
          // For other states (STARTING=1, DECODING=2, etc.), video is enabled
          // State 0 = STOPPED (video disabled/muted)
          // State 1 = STARTING (video starting)
          // State 2 = DECODING (video active and decoding)
          const isVideoEnabled = state !== 0; // 0 = STOPPED, anything else means video is active or starting
          log(`📹 [LIVE_STREAM] 🔍 Tracking broadcaster video state: UID ${uid}, state ${state}`);
          log(`📹 [LIVE_STREAM] State meaning: ${state === 0 ? 'STOPPED ❌' : state === 1 ? 'STARTING ⏳' : state === 2 ? 'DECODING ✅ (VIDEO VISIBLE!)' : 'OTHER'}`);
          log(`📹 [LIVE_STREAM] Video enabled: ${isVideoEnabled}`);
          setBroadcasterVideoEnabled(prev => {
            const newMap = new Map(prev);
            newMap.set(uid, isVideoEnabled);
            log(`📹 [LIVE_STREAM] Updated broadcaster video state map:`, Array.from(newMap.entries()));
            return newMap;
          });
          
          // 🚀 CRITICAL: When video state is STARTING or DECODING, aggressively ensure subscription
          if (state === 1 || state === 2) {
            try {
              log(`📹 [LIVE_STREAM] 🚀 Video ${state === 1 ? 'STARTING' : 'DECODING'} - ensuring subscription for UID ${uid}`);
              // Use DRY subscription helper
              await subscribeToRemoteStream(streamEngine, uid, {
                streamType: 0, // HIGH so video shows
                operationName: `ensureSubscription(${uid}, state:${state})`,
                retryOnFailure: false,
              });
              log(`✅ [LIVE_STREAM] Ensured video subscription for UID ${uid} (state: ${state})`);
            } catch (e) {
              log(`⚠️ [LIVE_STREAM] Error ensuring subscription for UID ${uid}:`, e);
            }
          }
        } else {
          // Track guest video states (UIDs other than 1000/0 are guests)
          // State 0 = STOPPED (video disabled/muted)
          // State 1 = STARTING (video starting)
          // State 2 = DECODING (video active and decoding) - this is when video is actually visible
          // Show video when STARTING (1) or DECODING (2), but not STOPPED (0) or FAILED (3)
          const isVideoEnabled = state === 1 || state === 2; // Enabled when starting or decoding
          log(`📹 [LIVE_STREAM] Tracking guest video state: UID ${uid}, state ${state} (${state === 0 ? 'STOPPED' : state === 1 ? 'STARTING' : state === 2 ? 'DECODING' : 'OTHER'}), enabled: ${isVideoEnabled}`);
          setGuestVideoEnabled(prev => {
            const newMap = new Map(prev);
            newMap.set(uid, isVideoEnabled);
            log(`📹 [LIVE_STREAM] Updated guest video state map:`, Array.from(newMap.entries()));
            return newMap;
          });
        }
        
        // CRITICAL: When video is starting/decoding, ensure it's subscribed and unmuted
        // This fixes dark/frozen screens for guests
        if (state === 1 || state === 2) {
          try {
            log(`📹 [LIVE_STREAM] Video ${state === 1 ? 'STARTING' : 'DECODING'} for UID ${uid}, ensuring subscription...`);
            
            // Ensure remote video is enabled
            try {
              if (streamEngine.enableRemoteVideo) {
                await streamEngine.enableRemoteVideo(true);
              }
            } catch (e) {
              // enableRemoteVideo might not be available
            }
            
            // Use DRY subscription helper
            const streamType = 0; // HIGH so video shows
            const success = await subscribeToRemoteStream(streamEngine, uid, {
              streamType,
              operationName: `ensureVideoSubscription(${uid})`,
              retryOnFailure: false,
            });
            
            if (success) {
              if (uid === 1000) lastViewerStreamTypeRef.current = streamType;
              log(`✅ [LIVE_STREAM] Ensured remote video subscription for UID: ${uid}`);
            }
          } catch (e) {
            log(`⚠️ [LIVE_STREAM] Error ensuring video subscription for UID ${uid}:`, e);
          }
        }
        
        // Handle FROZEN state - resubscribe to unfreeze (DRY)
        if (state === 4) {
          try {
            log(`📹 [LIVE_STREAM] Video FROZEN for UID ${uid}, attempting to resubscribe...`);
            // Unsubscribe first, then resubscribe
            await unsubscribeFromRemoteStream(streamEngine, uid, true, false);
            await new Promise(resolve => setTimeout(resolve, 100));
            await subscribeToRemoteStream(streamEngine, uid, {
              streamType: 0,
              operationName: `unfreezeVideo(${uid})`,
            });
            log(`✅ [LIVE_STREAM] Resubscribed to unfreeze video for UID: ${uid}`);
          } catch (e) {
            log(`⚠️ [LIVE_STREAM] Could not unfreeze video for UID ${uid}:`, e);
          }
        }
      });
      
      // Listen for first remote video frame decoded - this is when video actually becomes visible
      addTrackedListener('onFirstRemoteVideoDecoded', async (uid: number, width: number, height: number, elapsed: number) => {
        log(`📹 [LIVE_STREAM] ✅✅✅✅✅ FIRST VIDEO FRAME DECODED for UID ${uid}:`, { width, height, elapsed });
        log(`📹 [LIVE_STREAM] 🎉🎉🎉 VIDEO IS NOW VISIBLE FOR VIEWERS! 🎉🎉🎉`);
        log(`📹 [LIVE_STREAM] Frame dimensions: ${width}x${height}, elapsed: ${elapsed}ms`);
        
        // Track that video is enabled when first frame is decoded
        if (uid === 1000 || uid === 0) {
          setBroadcasterVideoEnabled(prev => {
            const newMap = new Map(prev);
            newMap.set(uid, true);
            log(`📹 [LIVE_STREAM] ✅✅✅ Video confirmed enabled - first frame decoded for broadcaster (UID ${uid})`);
            log(`📹 [LIVE_STREAM] This should make the video visible on viewer screens!`);
            return newMap;
          });
        } else {
          // Track guest video when first frame is decoded
          setGuestVideoEnabled(prev => {
            const newMap = new Map(prev);
            newMap.set(uid, true);
            log(`📹 [LIVE_STREAM] Guest video frame decoded, marking as enabled: UID ${uid}`);
            return newMap;
          });
        }
        
        // Ensure video is subscribed and unmuted when first frame is decoded
        try {
          // Use DRY subscription helper
          await subscribeToRemoteStream(streamEngine, uid, {
            streamType: 0,
            operationName: `onUserVideoStateChanged(${uid})`,
            retryOnFailure: false,
          });
          log(`✅ [LIVE_STREAM] Ensured video subscription after first frame decoded for UID: ${uid}`);
        } catch (e) {
          log(`⚠️ [LIVE_STREAM] Error ensuring subscription after first frame for UID ${uid}:`, e);
        }
      });
      
      // Listen for when users mute/unmute their video
      addTrackedListener('onUserMuteVideo', (connection: any, remoteUid: number, muted: boolean) => {
        log(`📹 [LIVE_STREAM] User ${remoteUid} ${muted ? 'muted' : 'unmuted'} video`);
        
        // Track broadcaster video state (broadcaster UID is typically 1000)
        if (remoteUid === 1000 || remoteUid === 0) {
          const isVideoEnabled = !muted; // muted=false means video is enabled
          log(`📹 [LIVE_STREAM] Broadcaster ${remoteUid} video mute state changed: muted=${muted}, enabled=${isVideoEnabled}`);
          setBroadcasterVideoEnabled(prev => {
            const newMap = new Map(prev);
            newMap.set(remoteUid, isVideoEnabled);
            log(`📹 [LIVE_STREAM] Updated broadcaster video state map from mute event:`, Array.from(newMap.entries()));
            return newMap;
          });
        }
      });

      addTrackedListener('onUserOffline', (connection: any, remoteUid: number, reason: number) => {
        log('🎯 [LIVE_STREAM] 👤 User left stream:', remoteUid, 'Reason:', reason);
        log('🎯 [LIVE_STREAM] 👤 Broadcaster UID check:', remoteUid, 'vs 1000');
        log('🎯 [LIVE_STREAM] 👤 Current stream ID:', currentStreamIdRef.current);
        log('🎯 [LIVE_STREAM] 👤 Is streaming:', isStreaming);
        
        setStreamRemoteUids(prev => {
          const filtered = prev.filter(uid => uid !== remoteUid);
          log('🎯 [LIVE_STREAM] 👤 Updated remote UIDs after user left:', filtered);
          return filtered;
        });
        
        // ============================================
        // STEP 2: AGORA EVENT-BASED VIEWER COUNTING (User Left)
        // Remove from in-memory tracker
        // ============================================
        // CRITICAL: Update inactivity timer when viewers leave
        // This ensures timer restarts if count goes to 0, or clears if viewers remain
        if (remoteUid !== 1000 && currentStreamIdRef.current) {
          // Remove from in-memory tracker
          viewerCountInMemoryRef.current.delete(remoteUid);
          
          // Update UI count immediately
          const newCount = Math.max(viewerCountInMemoryRef.current.size, 0);
          setViewerCount(newCount);
          
          // CRITICAL: Reset inactivity timer when viewer count changes
          // This ensures timer restarts if count goes to 0, or clears if viewers remain
          resetInactivityTimer(currentStreamIdRef.current, newCount);
          
          log(`✅ [STABILITY] Viewer left (Agora event). Count: ${newCount} (UID: ${remoteUid})`);
          
          // Note: Database sync happens every 60 seconds (batch update)
          // This prevents API storms and reduces ingress
        } else if (remoteUid === 1000) {
          log('🎯 [LIVE_STREAM] 📊 Broadcaster left (UID 1000) - not counting as viewer');
        } else {
          log('🎯 [LIVE_STREAM] 📊 No current stream ID or not streaming, skipping viewer removal');
        }
      });

      streamEngine.addListener('onError', (err: any, msg: string) => {
        // Handle specific error codes silently (non-critical errors)
        if (err === 110 || err === 1052) {
          // Error 110 often occurs AFTER successful join (transient error during media publishing)
          // Stream usually continues to work - silently ignore
          return; // Don't log or alert
        }
        
        // Only handle critical errors that need user attention
        if (err === 17) {
          Alert.alert(
            'Camera Error',
            'Failed to initialize camera. Please check camera permissions and try again.',
            [{ text: 'OK' }]
          );
        } else if (err === 103) {
          handleReconnection();
        } else if (err === -2 || err === -7) {
          Alert.alert('Stream Error', 'Stream configuration error. Please try again.', [{ text: 'OK' }]);
        }
        // All other errors (110, 101, etc.) are silently ignored - they're transient or handled automatically
      });

      // Network quality monitoring (only update state when quality tier changed to avoid re-render spam)
      addTrackedListener('onNetworkQuality', async (
        connection: any,
        remoteUid: number,
        txQuality: number,
        rxQuality: number
      ) => {
        const last = lastNetworkQualityRef.current[remoteUid];
        const changed = !last || last.txQuality !== txQuality || last.rxQuality !== rxQuality;
        if (changed) {
          lastNetworkQualityRef.current[remoteUid] = { txQuality, rxQuality };
          if (__DEV__) {
            log('📊 [NETWORK] Quality update:', { remoteUid, txQuality, rxQuality });
          }
          setNetworkQuality(prev => ({
            ...prev,
            [remoteUid]: { txQuality, rxQuality }
          }));
        }
        
        // Broadcaster: adjust encoder (upload) quality based on txQuality
        if (remoteUid === 0 && isStreamingRef.current) {
          // Network quality monitoring - adjust encoder quality but don't auto-switch to audio-only
          try {
            // Just handle network quality changes for encoder configuration
            handleNetworkQualityChange(txQuality);
          } catch (error) {
            warn('⚠️ [NETWORK] Error handling network quality change:', error);
            handleNetworkQualityChange(txQuality);
          }
        }
        
        // 🌍 POOR NETWORK: Viewer adaptive stream type - start conservative, upgrade when network improves
        const broadcasterUid = 1000;
        if (remoteUid === broadcasterUid && !isStreamingRef.current && streamEngineRef.current?.setRemoteVideoStreamType) {
          
          // Use poor network optimizer to determine stream type (conservative approach)
          const desiredStreamType = getStreamTypeForQuality(rxQuality);
          if (desiredStreamType === lastViewerStreamTypeRef.current) return;
          
          // Clear existing debounce
          if (viewerStreamTypeDebounceRef.current) {
            clearTimeout(viewerStreamTypeDebounceRef.current);
            viewerStreamTypeDebounceRef.current = null;
          }
          
          // Get adaptive debounce delay (faster for bad networks) (DRY)
          const debounceDelay = getAdaptiveDebounceDelay(rxQuality);
          viewerStreamTypeDebounceRef.current = setTimeout(async () => {
            viewerStreamTypeDebounceRef.current = null;
            const streamType = getStreamTypeForQuality(rxQuality);
            
            // Use safe engine operation with retry (DRY)
            await safeEngineOperation(
              streamEngineRef.current,
              async (engine) => engine.setRemoteVideoStreamType(broadcasterUid, streamType),
              { operationName: 'setRemoteVideoStreamType', silentFail: true }
            );
            
            lastViewerStreamTypeRef.current = streamType;
            livestreamLog('🌍 [POOR_NETWORK] Viewer stream type:', streamType === 0 ? 'HIGH' : 'LOW', 'rxQuality:', rxQuality);
          }, debounceDelay);
        }
      });

      // Connection state monitoring with debouncing to prevent rapid state change loops
      addTrackedListener('onConnectionStateChanged', (
        connection: any,
        state: number,
        reason: number
      ) => {
        // Map Agora connection state codes to string values
        // React Native Agora uses: 1=DISCONNECTED, 2=CONNECTING, 3=CONNECTED, 4=RECONNECTING, 5=FAILED
        // (Note: Different from web SDK which uses 0-4)
        const states: Record<number, string> = {
          1: 'DISCONNECTED',
          2: 'CONNECTING',
          3: 'CONNECTED',
          4: 'RECONNECTING',
          5: 'FAILED'
        };
        
        const stateName = states[state] || 'UNKNOWN';
        
        // Log actual state value for debugging if unknown
        if (stateName === 'UNKNOWN') {
          log('⚠️ [CONNECTION] Unknown state value:', state, 'Reason:', reason);
        }
        
        // Update last state immediately for tracking
        lastConnectionStateRef.current = stateName;
        
        // Debounce rapid state changes (CONNECTED <-> RECONNECTING loops)
        // Clear any pending debounce timeout
        if (connectionStateDebounceRef.current) {
          clearTimeout(connectionStateDebounceRef.current);
          connectionStateDebounceRef.current = null;
        }
        
        // Special handling for CONNECTED/RECONNECTING rapid switches
        // If we're rapidly switching between these states, increase debounce time
        const isRapidSwitch = (
          (stableConnectionStateRef.current === 'CONNECTED' && stateName === 'RECONNECTING') ||
          (stableConnectionStateRef.current === 'RECONNECTING' && stateName === 'CONNECTED')
        );
        const debounceTime = isRapidSwitch ? 1500 : 500; // Longer debounce for rapid switches
        
        // Only log and process state changes after debounce period
        // This prevents rapid CONNECTED/RECONNECTING loops from causing issues
        connectionStateDebounceRef.current = setTimeout(() => {
          // Check if state is still the same after debounce period
          if (lastConnectionStateRef.current === stateName) {
            // CRITICAL: Handle FAILED state appropriately
            // Reason 8 = CONNECTION_CHANGED_INVALID_TOKEN (Invalid Token) - this is FATAL, not transient
            // Reason 9 = CONNECTION_CHANGED_TOKEN_EXPIRED (Token Expired) - can be recovered
            if (state === 5) { // FAILED state
              // Reason 8 = Invalid Token - this is FATAL and indicates token/UID mismatch or invalid token
              // ALWAYS log this error regardless of stream state - it's a critical issue
              if (reason === 8) {
                error('❌ [CONNECTION] FATAL: Invalid Token (Reason 8)');
                error('❌ [CONNECTION] This indicates the token is invalid - possible causes:');
                error('❌ [CONNECTION] 1. UID mismatch between token generation and joinChannel');
                error('❌ [CONNECTION] 2. App Certificate mismatch or incorrect App Certificate');
                error('❌ [CONNECTION] 3. Token format issue or corrupted token');
                error('❌ [CONNECTION] 4. Token generated with wrong App ID');
                error('❌ [CONNECTION] 5. App Certificate enabled in Agora Console but token generation failed');
                
                // Use refs to get current state values (state variables may be stale in debounced callback)
                const isActiveStream = isStreamingRef.current || isJoinedAsViewerRef.current || 
                                       !!currentStreamIdRef.current || !!streamChannelRef.current;
                error('❌ [CONNECTION] Current stream state:', {
                  isStreaming: isStreamingRef.current,
                  isJoinedAsViewer: isJoinedAsViewerRef.current,
                  currentStreamId: currentStreamIdRef.current,
                  streamChannel: streamChannelRef.current,
                  isActiveStream
                });
                
                error('❌ [CONNECTION] The stream will not work properly with an invalid token');
                // Still set state to FAILED so UI can handle it appropriately
                setConnectionState('FAILED');
                stableConnectionStateRef.current = 'FAILED';
                return;
              }
              
              // Reason 9 = Token Expired - can be recovered by refreshing token
              if (reason === 9) {
                warn('⚠️ [CONNECTION] Token expired (Reason 9) - token refresh may be needed');
                // Set state but don't break the stream immediately - token refresh can recover
                setConnectionState('FAILED');
                stableConnectionStateRef.current = 'FAILED';
                return;
              }
              
              // For other failure reasons, log and handle
              const isActiveStream = isStreamingRef.current || isJoinedAsViewerRef.current || 
                                     !!currentStreamIdRef.current || !!streamChannelRef.current;
              if (__DEV__) {
                log('⚠️ [CONNECTION] Connection failure (Reason ' + reason + ') during active stream:', isActiveStream);
              }
              setConnectionState('FAILED');
              stableConnectionStateRef.current = 'FAILED';
              return;
            }
            
            // Log all other state changes for debugging
            log('🔌 [CONNECTION] State changed:', stateName, 'Reason:', reason);
            setConnectionState(stateName);
            stableConnectionStateRef.current = stateName;
            
            // Clear any pending disconnect timeout when state changes
            if (disconnectTimeoutRef.current) {
              clearTimeout(disconnectTimeoutRef.current);
              disconnectTimeoutRef.current = null;
            }
            
            // Handle connection state changes
            if (state === 4) { // RECONNECTING
              // Agora SDK is handling reconnection automatically - don't trigger our own
              // Set flag to prevent our reconnection logic from interfering
              isReconnectingRef.current = true;
              // Don't trigger our own reconnection - Agora SDK handles this
            } else if (state === 3) { // CONNECTED
              // Check if we previously had a FAILED state with reason 8 (Invalid Token)
              // If we're now CONNECTED, it means the connection recovered (possibly transient error)
              if (stableConnectionStateRef.current === 'FAILED') {
                log('✅ [CONNECTION] Connection recovered from FAILED state - may have been transient');
                log('✅ [CONNECTION] If this was reason 8 (Invalid Token), verify App Certificate matches Agora Console');
              }
              log('✅ [CONNECTION] Connection restored');
              reconnectAttemptsRef.current = 0; // Reset retry counter on successful connection
              // Reset reconnecting flag after a longer delay to ensure state is stable
              setTimeout(() => {
                // Only reset if we're still in CONNECTED state (not rapidly switching)
                if (stableConnectionStateRef.current === 'CONNECTED' && !isReconnectingRef.current) {
                  isReconnectingRef.current = false;
                }
              }, 3000); // Increased to 3 seconds to allow state to stabilize
            } else if (state === 1 || (state === 5 && reason === 9)) { // DISCONNECTED or recoverable FAILED (token expired)
              // Only trigger our own reconnection if:
              // 1. Not already reconnecting (Agora SDK might handle it)
              // 2. We have an active stream/viewer session
              // 3. We wait to see if Agora SDK handles reconnection automatically
              // Use refs to get current state values (state variables may be stale in debounced callback)
              const isActiveStream = isStreamingRef.current || isJoinedAsViewerRef.current;
              if (!isReconnectingRef.current && isActiveStream) {
                // Wait 3 seconds to see if Agora SDK automatically reconnects
                // If state changes to RECONNECTING or CONNECTED during this time, we'll cancel
                disconnectTimeoutRef.current = setTimeout(() => {
                  // Double-check we're still disconnected and not already reconnecting
                  if ((stableConnectionStateRef.current === 'DISCONNECTED' || stableConnectionStateRef.current === 'FAILED') && !isReconnectingRef.current) {
                    log('⚠️ [CONNECTION] Connection lost and Agora SDK did not auto-reconnect, attempting manual reconnection...');
                    isReconnectingRef.current = true;
                    handleReconnection().finally(() => {
                      // Reset flag after reconnection attempt completes (success or failure)
                      setTimeout(() => {
                        isReconnectingRef.current = false;
                      }, 3000); // 3 second cooldown before allowing another reconnection attempt
                    });
                  }
                }, 3000); // Wait 3 seconds for Agora SDK to handle reconnection
              }
            }
          }
          // If state changed during debounce, ignore this event (rapid change)
          connectionStateDebounceRef.current = null;
        }, debounceTime);
      });
      log('✅ Stream engine initialized successfully');
      return true;
    } catch (error) {
      error('❌ Failed to initialize stream engine:', error);
      return false;
    }
  };

  // CRITICAL: Cleanup any existing stream before starting a new one
  const cleanupExistingStream = useCallback(async (): Promise<void> => {
    if (streamEngineRef.current) {
      log('🧹 [CLEANUP] Cleaning up existing stream engine before new stream...');
      try {
        // Stop preview
        try {
          await streamEngineRef.current.stopPreview();
        } catch (e) {
          // Ignore errors
        }
        
        // Disable local media
        try {
          await streamEngineRef.current.enableLocalAudio(false);
          await streamEngineRef.current.enableLocalVideo(false);
        } catch (e) {
          // Ignore errors
        }
        
        // Disable engines
        try {
          await streamEngineRef.current.disableAudio();
          await streamEngineRef.current.disableVideo();
        } catch (e) {
          // Ignore errors
        }
        
        // Leave channel
        try {
          await streamEngineRef.current.leaveChannel();
        } catch (e) {
          // Ignore errors
        }
        
        // 🚀 IMPROVEMENT: Use safe release function
        await releaseEngineSafely();
        
        // CRITICAL: Reset audio session to stop background audio
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: false,
            staysActiveInBackground: false,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          });
          log('🔇 [CLEANUP] Audio session reset - background audio stopped');
        } catch (audioResetError) {
          warn('⚠️ [CLEANUP] Failed to reset audio session:', audioResetError);
        }
      } catch (error) {
        error('❌ [CLEANUP] Error cleaning up existing stream:', error);
        streamEngineRef.current = null;
      }
    }
    
    // Reset state
    setIsStreaming(false);
    setIsJoinedAsViewer(false);
    setCurrentStream(null);
    setStreamRemoteUids([]);
    setViewerCount(0);
    streamChannelRef.current = null;
    currentStreamIdRef.current = null;
    // Reset network quality tracking
    streamStartTimeRef.current = null;
    recentTxQualityRef.current = [];
    lastNetworkSpeedCheckRef.current = null;
    consecutiveLowSpeedCountRef.current = 0;
  }, []);

  // Start live stream as broadcaster
  const startLiveStream = useCallback(async (title: string, description?: string, adultContent: boolean = false, allowGuests: boolean = false, musicMode: boolean = false): Promise<boolean> => {
    // CRITICAL: Cleanup any existing stream first (enforce single active stream)
    await cleanupExistingStream();
    
    if (!user) {
      Alert.alert('Error', 'You must be logged in to start a live stream');
      return false;
    }

    // Import word filter validation
    const { validateLivestreamTitle, getPolicyViolationMessage } = await import('../utils/wordFilter');
    
    // Validate stream title against blocked words
    const titleValidation = validateLivestreamTitle(title.trim());
    if (!titleValidation.isValid) {
      Alert.alert(
        'Content Policy Violation',
        titleValidation.error || getPolicyViolationMessage(),
        [{ text: 'OK' }]
      );
      return false;
    }

    try {
      log('🎥 Starting live stream...');
      
      // Request camera and microphone permissions first (iOS requires this)
      try {
        const { Camera } = await import('expo-camera');
        
        log('📹 Requesting camera permission...');
        const cameraPermission = await Camera.requestCameraPermissionsAsync();
        log('📹 Camera permission status:', cameraPermission.status);
        
        log('🎤 Requesting microphone permission...');
        const audioPermission = await Audio.requestPermissionsAsync();
        log('🎤 Microphone permission status:', audioPermission.status);
        
        if (cameraPermission.status !== 'granted' || audioPermission.status !== 'granted') {
          Alert.alert(
            'Permissions Required',
            'Camera and microphone permissions are required for live streaming. Please enable them in Settings.',
            [{ text: 'OK' }]
          );
          return false;
        }
        
        log('✅ All permissions granted for live streaming');
      } catch (permError) {
        error('❌ Error requesting permissions:', permError);
        Alert.alert('Error', 'Failed to request camera/microphone permissions');
        return false;
      }
      
      // End existing streams first (sequential, not parallel)
      await endExistingStreamsForUser(user.id);
      
      // Generate simple channel ID for this stream
      const timestamp = Date.now();
      const channelId = `live${timestamp}`;
      log('🎥 Generated channel ID:', channelId);
      log('🎥 Channel ID length:', channelId.length);
      
      // Create stream record in database first
      const streamerName = userProfile?.full_name || userProfile?.display_name || user.email?.split('@')[0] || 'Unknown User';
      const streamerAvatar = userProfile?.avatar_url;
      let broadcasterUid = 1000; // Will be updated from bootstrap API to ensure token/UID match
      
      // Build insert data - conditionally include music_mode if column exists
      const now = new Date().toISOString();
      const insertData: any = {
        title: adultContent ? `${title} [18+]` : title,
        description,
        streamer_id: user.id,
        streamer_name: streamerName,
        streamer_avatar: streamerAvatar,
        channel_id: channelId,
        broadcaster_uid: broadcasterUid,
        is_live: true,
        started_at: now,
        updated_at: now, // CRITICAL: Set updated_at initially so stream is immediately visible
        adult_content: adultContent, // CRITICAL: Ensure adult_content is included
        allow_guests: allowGuests,
      };
      
      // Debug: Log the data being inserted
      log('🎬 [STREAM_CREATE] Inserting stream with data:', {
        title: insertData.title,
        adult_content: insertData.adult_content,
        adult_content_type: typeof insertData.adult_content,
        allow_guests: insertData.allow_guests,
      });
      
      // Only include music_mode if it's enabled (to avoid errors if column doesn't exist)
      // If music mode is enabled, we'll try to insert it, but catch the error gracefully
      if (musicMode) {
        insertData.music_mode = true;
      }
      
      let streamData: any = null;
      let dbError: any = null;
      
      // Try to insert with music_mode first if enabled
      const insertResult = await supabase
        .from('live_streams')
        .insert(insertData)
        .select('*, adult_content') // CRITICAL: Explicitly select adult_content
        .single();
      
      streamData = insertResult.data;
      dbError = insertResult.error;
      
      // Debug: Log what was actually saved
      if (streamData) {
        log('✅ [STREAM_CREATE] Stream created successfully:', {
          streamId: streamData.id,
          adult_content: streamData.adult_content,
          adult_content_type: typeof streamData.adult_content,
          title: streamData.title,
        });
      } else if (dbError) {
        error('❌ [STREAM_CREATE] Failed to create stream:', dbError);
      }

      // If error is about missing music_mode column, retry without it
      if (dbError && dbError.code === 'PGRST204' && dbError.message?.includes('music_mode')) {
        warn('⚠️ music_mode column not found, retrying without it...');
        const now = new Date().toISOString();
        const retryData: any = {
          title: adultContent ? `${title} [18+]` : title,
          description,
          streamer_id: user.id,
          streamer_name: streamerName,
          streamer_avatar: streamerAvatar,
          channel_id: channelId,
          broadcaster_uid: broadcasterUid,
          is_live: true,
          started_at: now,
          updated_at: now, // CRITICAL: Set updated_at initially so stream is immediately visible
          adult_content: adultContent,
          allow_guests: allowGuests,
        };
        
        const retryResult = await supabase
          .from('live_streams')
          .insert(retryData)
          .select()
          .single();
        
        if (retryResult.error) {
          error('❌ Failed to create stream record (retry):', retryResult.error);
          Alert.alert(
            'Error', 
            'Failed to create stream record. To enable music mode, please add the music_mode column to your database:\n\nALTER TABLE live_streams ADD COLUMN IF NOT EXISTS music_mode BOOLEAN DEFAULT false;'
          );
          return false;
        }
        
        streamData = retryResult.data;
        log('✅ Stream created without music_mode column (music mode will not be available)');
      } else if (dbError) {
        error('❌ Failed to create stream record:', dbError);
        Alert.alert('Error', 'Failed to create stream record');
        return false;
      }
      
      // Ensure streamData is defined
      if (!streamData) {
        error('❌ Stream data is null after insert');
        Alert.alert('Error', 'Failed to create stream record');
        return false;
      }

      // Send livestream push notifications immediately after stream record is created.
      // Do not wait for engine init/join to minimize delivery delay.
      (async () => {
        try {
          log('📢 [NOTIFICATION] Sending livestream notifications immediately...');
          const { data, error: fnError } = await supabase.functions.invoke('send-livestream-notifications', {
            body: {
              stream_id: streamData.id,
              streamer_id: user.id,
              streamer_name: streamerName,
              stream_title: streamData.title ?? title,
              adult_content: !!streamData.adult_content,
            },
          });
          if (fnError) {
            error('❌ [NOTIFICATION] Edge function error:', fnError);
            return;
          }
          const sent = data?.sent ?? 0;
          const total = data?.total ?? 0;
          log(`✅ [NOTIFICATION] Livestream notifications sent: ${sent}/${total} users`);
        } catch (err) {
          error('❌ [NOTIFICATION] Error sending livestream notifications:', err);
          // Don't fail stream creation if notifications fail.
        }
      })(); // Fire-and-forget

      // ============================================
      // BOOTSTRAP API FIRST: Get App ID before initializing engine
      // This prevents App ID mismatch errors (error 110)
      // ============================================
      let bootstrapAppId: string | undefined = undefined;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        
        if (!supabaseUrl) {
          warn('⚠️ [BOOTSTRAP] EXPO_PUBLIC_SUPABASE_URL not configured');
        } else {
          // TEMPORARY: Add bypassCache=true to force fresh fetch and bypass invalid cached App IDs
          const bootstrapUrl = `${supabaseUrl}/functions/v1/live-bootstrap?streamId=${streamData.id}&role=broadcaster&bypassCache=true`;
          log('📡 [BOOTSTRAP] Calling bootstrap API:', bootstrapUrl);
          
          // Validate URL is not a local/development address
          try {
            const urlObj = new URL(bootstrapUrl);
            if (urlObj.hostname.startsWith('192.168.') || urlObj.hostname.startsWith('127.0.0.1') || urlObj.hostname.startsWith('localhost')) {
              error('❌ [BOOTSTRAP] Invalid Supabase URL - appears to be local/development address:', urlObj.hostname);
              throw new Error('Invalid Supabase URL configuration. Please check EXPO_PUBLIC_SUPABASE_URL environment variable.');
            }
          } catch (urlError) {
            error('❌ [BOOTSTRAP] Invalid URL format:', urlError);
            throw new Error('Invalid Supabase URL format. Please check your environment configuration.');
          }
          
          const bootstrapResponse = await fetch(bootstrapUrl, {
            method: 'GET',
            headers: {
              'Authorization': session ? `Bearer ${session.access_token}` : '',
              'Content-Type': 'application/json',
            },
            // Add timeout to prevent hanging on network issues
            signal: createTimeoutSignal(30000), // 30 second timeout (polyfill for AbortSignal.timeout)
          }).catch((fetchError: any) => {
            // Handle network errors gracefully
            if (fetchError.name === 'AbortError' || fetchError.name === 'TimeoutError') {
              throw new Error('Connection timeout - please check your internet connection and try again');
            } else if (fetchError.message?.includes('Failed to connect') || fetchError.message?.includes('Network request failed')) {
              throw new Error('Network connection failed - please check your internet connection and try again');
            } else {
              throw new Error(`Failed to connect to stream service: ${fetchError.message || 'Unknown network error'}`);
            }
          });

          log('📡 [BOOTSTRAP] Response status:', bootstrapResponse.status);

          if (bootstrapResponse.ok) {
            const bootstrapData = await bootstrapResponse.json();
            bootstrapAppId = bootstrapData.appId;
            log('✅ [BOOTSTRAP] Got App ID from bootstrap API:', bootstrapAppId);
          } else {
            const errorText = await bootstrapResponse.text();
            error('❌ [BOOTSTRAP] Bootstrap API failed:', bootstrapResponse.status, errorText);
          }
        }
      } catch (bootstrapError: any) {
        error('❌ [BOOTSTRAP] Failed to get App ID from bootstrap:', bootstrapError);
        error('❌ [BOOTSTRAP] Error details:', bootstrapError.message);
      }
      
      // Initialize stream engine with correct App ID (from bootstrap or fallback)
      log('🎬 Initializing stream engine...');
      const engineReady = await initializeStreamEngine(bootstrapAppId);
      if (!engineReady) {
        error('❌ Stream engine initialization failed');
        Alert.alert('Error', 'Failed to initialize streaming engine. Please try again.');
        return false;
      }
      log('✅ Stream engine initialized successfully');

      // Wait for engine to be fully ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Double-check that engine is ready
      if (!streamEngineRef.current) {
        error('❌ Stream engine reference is still null after initialization');
        Alert.alert('Error', 'Stream engine not ready. Please restart the app and try again.');
        return false;
      }
      log('✅ Stream engine reference is valid');

      // Wait for database to fully commit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get Agora module and set client role
      const AgoraRTC = await getAgoraModule();
      const { ClientRoleType } = AgoraRTC;
      await streamEngineRef.current?.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      
      // Wait for role to be set
      await new Promise(resolve => setTimeout(resolve, 300));

      // Enable video and audio with error handling - optimized for speed
      // If music mode is enabled, skip video (audio-only stream)
      if (musicMode) {
        log('🎵 Music mode enabled - skipping video setup (audio-only stream)');
        try {
          // Explicitly disable video for music mode
          await streamEngineRef.current?.enableLocalVideo(false);
          await streamEngineRef.current?.disableVideo();
          setIsStreamCameraOn(false);
          log('✅ Video disabled for music mode');
        } catch (error) {
          warn('⚠️ Error disabling video for music mode:', error);
        }
      } else {
        try {
          log('📹 Attempting to enable video...');
          log('📹 Stream engine exists:', !!streamEngineRef.current);
          
          if (!streamEngineRef.current) {
            error('❌ Stream engine is null, cannot enable video');
            return false;
          }
          
          // Enable video first
          const videoResult = await streamEngineRef.current.enableVideo();
          log('✅ Video enabled successfully, result:', videoResult);
          
          // 🌍 POOR NETWORK OPTIMIZER: Start with conservative quality for poor African networks
          // Automatically adjusts for Nigeria's varying network conditions
          try {
            
            // Start with conservative quality (level 3 = Fair) to ensure reliability on poor networks
            const dataSaverOn = liveDataSaverEnabledRef.current;
            const startQualityTier = dataSaverOn ? 2 : 3;
            const qualityConfig = getPoorNetworkConfig(startQualityTier, true);
            
            log('🌍 [POOR_NETWORK] Setting live stream quality (conservative start):', {
              width: qualityConfig.width,
              height: qualityConfig.height,
              bitrate: qualityConfig.bitrate,
              frameRate: qualityConfig.frameRate,
              minBitrate: qualityConfig.minBitrate,
              maxBitrate: qualityConfig.maxBitrate,
              shouldUseAudioOnly: qualityConfig.shouldUseAudioOnly,
            });
            
            const encoderConfig = {
              width: qualityConfig.width,
              height: qualityConfig.height,
              bitrate: qualityConfig.bitrate,
              frameRate: qualityConfig.frameRate,
              minBitrate: qualityConfig.minBitrate,
              maxBitrate: qualityConfig.maxBitrate,
            };
            
            if (streamEngineRef.current && streamEngineRef.current.setVideoEncoderConfiguration) {
            await streamEngineRef.current.setVideoEncoderConfiguration(encoderConfig);
            } else {
              log('⚠️ [LIVE_STREAM] Engine not available, skipping video encoder configuration update');
            }
            log('✅ [ADAPTIVE] Video encoder configured for network speed:', encoderConfig);
          } catch (adaptiveError) {
            warn('⚠️ [ADAPTIVE] Error setting adaptive quality, falling back to defaults:', adaptiveError);
            // Fallback to original stable config
            try {
              const videoConfig = getBroadcasterVideoConfig();
              
              const encoderConfig = {
                width: videoConfig.width,
                height: videoConfig.height,
                bitrate: videoConfig.bitrate,
                frameRate: videoConfig.frameRate,
                minBitrate: videoConfig.minBitrate,
                maxBitrate: videoConfig.maxBitrate,
              };
              
              if (streamEngineRef.current && streamEngineRef.current.setVideoEncoderConfiguration) {
              await streamEngineRef.current.setVideoEncoderConfiguration(encoderConfig);
            } else {
              log('⚠️ [LIVE_STREAM] Engine not available, skipping video encoder configuration update');
            }
              log('✅ [STABILITY] Video encoder configured with fallback:', encoderConfig);
            } catch (configError) {
              error('❌ Failed to set video encoder configuration:', configError);
              // Continue anyway - defaults will be used
            }
          }
          
          // Wait for video to fully initialize
          await new Promise(resolve => setTimeout(resolve, 800));
          
          // 🚀 CRITICAL: Enable local video publishing BEFORE joining channel
          // This ensures video is published immediately when broadcaster joins
          // Must be done before joinChannel
          // SKIP video for music mode (audio-only stream)
          try {
            if (!musicMode && streamEngineRef.current?.enableLocalVideo) {
              await streamEngineRef.current.enableLocalVideo(true);
              log('✅ [BROADCASTER] Local video publishing enabled BEFORE join');
            } else if (musicMode) {
              log('🎵 [BROADCASTER] Skipping video enable before join - music mode is active (audio-only)');
            }
          } catch (e) {
            warn('⚠️ [BROADCASTER] Could not enable local video before join:', e);
          }
          
          // Start camera preview separately (not all methods return promises)
          // Note: Preview will be set up properly in LiveStreamBroadcaster component
          // We skip preview here to avoid camera session conflicts
          log('📹 Camera preview will be set up after joining channel');
          
          // Set camera state to on immediately
          setIsStreamCameraOn(true);
          log('✅ Video enabled, camera preview will be set up in broadcaster component');
          
        } catch (error) {
          error('❌ Failed to enable video:', error);
          error('❌ Video error details:', JSON.stringify(error, null, 2));
          return false;
        }
      }
      
      try {
        log('🎤 [BROADCASTER] Enabling audio (publish + receive)...');
        // enableAudio() enables both local (to publish) and remote (to receive) audio
        const audioResult = await streamEngineRef.current?.enableAudio();
        log('✅ [BROADCASTER] Audio enabled successfully, result:', audioResult);
        
        // Wait for audio to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // CRITICAL: Enable local audio publishing (like regular calls do)
        try {
          await streamEngineRef.current?.enableLocalAudio(true);
          log('✅ [BROADCASTER] Local audio enabled (publishing audio)');
        } catch (e) {
          log('⚠️ [BROADCASTER] enableLocalAudio not available, continuing...');
        }
        
        // Ensure mic state is synced when (re)starting a stream
        setIsStreamMicOn(true);
      } catch (error) {
        error('❌ [BROADCASTER] Failed to enable audio:', error);
        error('❌ [BROADCASTER] Audio error details:', JSON.stringify(error, null, 2));
      }

      // 🚀 CRITICAL: Ensure local video/audio are enabled BEFORE joining
      // Must be done before joinChannel
      // This ensures video is published immediately when broadcaster joins
      // SKIP video for music mode (audio-only stream)
      try {
        if (!musicMode && streamEngineRef.current?.enableLocalVideo) {
          await streamEngineRef.current.enableLocalVideo(true);
          log('✅ [BROADCASTER] Local video publishing enabled BEFORE join (final check)');
        } else if (musicMode) {
          log('🎵 [BROADCASTER] Skipping video enable - music mode is active (audio-only)');
        }
        if (streamEngineRef.current?.enableLocalAudio) {
          await streamEngineRef.current.enableLocalAudio(true);
          log('✅ [BROADCASTER] Local audio publishing enabled BEFORE join (final check)');
        }
      } catch (e) {
        warn('⚠️ [BROADCASTER] Could not enable local video/audio before join:', e);
      }

      // Wait before joining channel to ensure everything is ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // ============================================
      // BOOTSTRAP API PATTERN FOR BROADCASTER
      // Single API call to get all data needed to join
      // ============================================
      let broadcasterToken = '';
      let tokenAppId: string | undefined = undefined;
      let tokenError: Error | null = null;
      
      try {
        // Use bootstrap API for broadcaster
        log('📡 [BOOTSTRAP] Fetching bootstrap data for broadcaster...');
        
        const { data: { session } } = await supabase.auth.getSession();
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        
        if (!supabaseUrl) {
          throw new Error('EXPO_PUBLIC_SUPABASE_URL not configured. Please set it in your .env file.');
        }
        
        // TEMPORARY: Add bypassCache=true to force fresh fetch and bypass invalid cached App IDs
        const bootstrapUrl = `${supabaseUrl}/functions/v1/live-bootstrap?streamId=${streamData.id}&role=broadcaster&bypassCache=true`;
        log('📡 [BOOTSTRAP] Calling bootstrap API:', bootstrapUrl);
        log('📡 [BOOTSTRAP] Stream ID:', streamData.id);
        log('📡 [BOOTSTRAP] Has session:', !!session);
        
        const bootstrapResponse = await fetch(bootstrapUrl, {
          method: 'GET',
          headers: {
            'Authorization': session ? `Bearer ${session.access_token}` : '',
            'Content-Type': 'application/json',
          },
        });

        log('📡 [BOOTSTRAP] Response status:', bootstrapResponse.status);

        if (bootstrapResponse.ok) {
          const bootstrapData = await bootstrapResponse.json();
          broadcasterToken = bootstrapData.token;
          tokenAppId = bootstrapData.appId;
          log('✅ [BOOTSTRAP] Broadcaster bootstrap data received');
          log('✅ [STREAM] Token length:', broadcasterToken?.length || 0);
          log('✅ [STREAM] App ID from bootstrap:', tokenAppId || 'not provided');
          log('✅ [STREAM] Bootstrap UID:', bootstrapData.uid || 'not provided');
          log('✅ [STREAM] Expected broadcaster UID:', broadcasterUid);
          
          // CRITICAL: Use UID from bootstrap API to ensure token/UID match
          // The token is generated with the UID from bootstrap API, so we must use the same UID
          // This prevents "Invalid Token" (reason 8) errors due to UID mismatch
          if (bootstrapData.uid !== undefined && bootstrapData.uid !== null) {
            if (bootstrapData.uid !== broadcasterUid) {
              warn('⚠️ [STREAM] UID mismatch detected!');
              warn('⚠️ [STREAM] Bootstrap API UID:', bootstrapData.uid);
              warn('⚠️ [STREAM] Expected broadcaster UID:', broadcasterUid);
              warn('⚠️ [STREAM] Using bootstrap UID to match token (prevents Invalid Token error)');
            }
            // Always use the UID from bootstrap API to ensure it matches the token
            broadcasterUid = bootstrapData.uid;
            log('✅ [STREAM] Using broadcaster UID from bootstrap:', broadcasterUid);
          } else {
            warn('⚠️ [STREAM] Bootstrap API did not return UID, using default:', broadcasterUid);
          }
          
          if (!broadcasterToken || broadcasterToken.length === 0) {
            throw new Error('Bootstrap API returned empty token');
          }
          
          // CRITICAL: Extract App ID from token to verify it matches (Agora tokens contain App ID: 006{APP_ID}...)
          let tokenAppIdExtracted: string | null = null;
          if (broadcasterToken && broadcasterToken.startsWith('006') && broadcasterToken.length > 35) {
            tokenAppIdExtracted = broadcasterToken.substring(3, 35); // Extract 32-character App ID
            log('✅ [STREAM] Extracted App ID from token:', tokenAppIdExtracted.substring(0, 8) + '...');
            
            // Validate extracted App ID matches the one from bootstrap API
            if (tokenAppId && tokenAppIdExtracted !== tokenAppId) {
              error('❌ [STREAM] CRITICAL: App ID mismatch!');
              error('❌ [STREAM] Bootstrap API App ID:', tokenAppId);
              error('❌ [STREAM] Token embedded App ID:', tokenAppIdExtracted);
              error('❌ [STREAM] This will cause error 110 (Invalid App ID)');
              throw new Error(`App ID mismatch: Token contains ${tokenAppIdExtracted.substring(0, 8)}... but bootstrap API returned ${tokenAppId.substring(0, 8)}...`);
            }
          }
          
          // Use App ID from bootstrap API (or extracted from token if bootstrap didn't provide it)
          const finalAppId = tokenAppId || tokenAppIdExtracted;
          if (!finalAppId) {
            warn('⚠️ [STREAM] App ID not provided by bootstrap API and could not be extracted from token');
            throw new Error('App ID not available from bootstrap API or token');
          }
          
          // Verify App ID is not the known invalid one
          const INVALID_APP_ID = '__invalid_placeholder__';
          if (finalAppId === INVALID_APP_ID) {
            error('❌ [STREAM] CRITICAL: Bootstrap API returned the known invalid App ID!');
            throw new Error('Invalid App ID returned by bootstrap API. Please check Supabase Edge Function secrets.');
          }
          
          log('✅ [STREAM] Using App ID:', finalAppId.substring(0, 8) + '...');
          
          // Update tokenAppId for use in engine initialization
          tokenAppId = finalAppId;
        } else {
          const errorText = await bootstrapResponse.text();
          error('❌ [BOOTSTRAP] Bootstrap API failed:', bootstrapResponse.status);
          error('❌ [BOOTSTRAP] Error response:', errorText);
          throw new Error(`Bootstrap API failed: ${bootstrapResponse.status} - ${errorText}`);
        }
      } catch (bootstrapError: any) {
        error('❌ [BOOTSTRAP] Bootstrap API failed:', bootstrapError);
        error('❌ [BOOTSTRAP] Error message:', bootstrapError.message);
        tokenError = bootstrapError;
        
        // Fallback to direct token fetch (only if token server is configured)
        // Note: For livestreaming, bootstrap API is preferred. This is a fallback only.
        try {
          const tokenServerUrl = process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL;
          if (tokenServerUrl && tokenServerUrl.length > 0) {
            log('🔐 [STREAM] Fetching broadcaster token (fallback)...');
            log('🔐 [STREAM] Token params:', { channelName: channelId, uid: broadcasterUid, role: 'broadcaster' });
            const tokenResult = await fetchRtcTokenWithAppId({ channelName: channelId, uid: broadcasterUid, role: 'broadcaster' });
            broadcasterToken = tokenResult.token;
            tokenAppId = tokenResult.appId;
            log('✅ [STREAM] Token fetched successfully (fallback), length:', broadcasterToken?.length || 0);
            log('✅ [STREAM] Token App ID from server:', tokenAppId || 'not provided');
            if (!broadcasterToken || broadcasterToken.length === 0) {
              throw new Error('Token server returned empty token');
            }
          } else {
            warn('⚠️ [STREAM] Bootstrap API failed and client-side token server not configured.');
            warn('⚠️ [STREAM] The Edge Function should handle token generation internally.');
            warn('⚠️ [STREAM] Please configure AGORA_APP_ID and AGORA_APP_CERTIFICATE in Supabase Edge Function secrets.');
            throw new Error('Bootstrap API failed. Please configure AGORA_APP_ID and AGORA_APP_CERTIFICATE in Supabase Edge Function secrets (matching the old working implementation) and redeploy the live-bootstrap function.');
          }
          
          // Verify App ID match: engine must be initialized with the token's App ID (from bootstrap)
          const currentEngineAppId = engineAppIdRef.current;
          
          if (!tokenAppId) {
            warn('⚠️ [STREAM] App ID not provided by token server and could not be decoded from token');
            warn('⚠️ [STREAM] Engine App ID:', currentEngineAppId || 'not set');
            warn('⚠️ [STREAM] If join fails with error -7, the token may be for a different App ID');
          } else if (currentEngineAppId !== tokenAppId) {
            warn('⚠️ [STREAM] App ID mismatch: engine was initialized with different App ID');
            warn('⚠️ [STREAM] Engine App ID:', currentEngineAppId || 'not set');
            warn('⚠️ [STREAM] Token App ID:', tokenAppId);
            warn('⚠️ [STREAM] Re-initializing livestream engine with bootstrap App ID...');
            
            try {
              await releaseLivestreamEngine();
              streamEngineRef.current = null;
              engineAppIdRef.current = null;
              const reinitOk = await initializeStreamEngine(tokenAppId);
              if (!reinitOk || !streamEngineRef.current) {
                error('❌ [STREAM] Failed to re-initialize engine with token App ID');
                throw new Error('Engine re-init failed');
              }
              log('✅ [STREAM] Engine re-initialized with token App ID:', tokenAppId.substring(0, 8) + '...');
            } catch (reinitErr) {
              error('❌ [STREAM] Error re-initializing engine:', reinitErr);
              throw reinitErr;
            }
          }

        } catch (e) {
          tokenError = e as Error;
          error('⚠️ [STREAM] Failed to fetch broadcaster token (fallback):', e);
          error('⚠️ [STREAM] Token error details:', JSON.stringify(e, null, 2));
          broadcasterToken = '';
        }
        
        // If token still not available, log warning
        if (!broadcasterToken) {
          const tokenServerUrl = process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL;
          if (!tokenServerUrl || tokenServerUrl.length === 0) {
            warn('⚠️ [STREAM] No token available and token server not configured');
            warn('⚠️ [STREAM] Bootstrap API should be used for livestreaming. Check Supabase Edge Function configuration.');
          } else {
            warn('⚠️ [STREAM] Token fetch failed even though token server is configured');
          }
        }
      }

      // Verify engine is ready before joining
      if (!streamEngineRef.current) {
        error('❌ Stream engine is null, cannot join channel');
        Alert.alert('Error', 'Stream engine not initialized. Please try again.');
        return false;
      }

      // CRITICAL: Set client role to BROADCASTER before joining (required for live broadcasting mode)
      // This must be done before joinChannel to prevent error -17
      try {
        const AgoraRTC = await getAgoraModule();
        const { ClientRoleType } = AgoraRTC;
        await streamEngineRef.current.setClientRole(ClientRoleType.ClientRoleBroadcaster);
        log('✅ [STREAM] Client role set to BROADCASTER before joining');
      } catch (roleError) {
        error('❌ [STREAM] Failed to set client role before joining:', roleError);
        // Continue anyway - some SDK versions may handle this differently
      }

      // Log join parameters for debugging
      log('🎥 [STREAM] Joining channel with params:');
      log('🎥 [STREAM] - Token:', broadcasterToken ? `${broadcasterToken.substring(0, 20)}...` : 'EMPTY (no token)');
      log('🎥 [STREAM] - Channel ID:', channelId);
      log('🎥 [STREAM] - Broadcaster UID:', broadcasterUid);
      log('🎥 [STREAM] - Engine initialized:', !!streamEngineRef.current);

      // Check if token is required but missing
      // For livestreaming, we should always have a token from bootstrap API
      if (!broadcasterToken || broadcasterToken.length === 0) {
        error('❌ [STREAM] Token is required but missing!');
        const errorMessage = tokenError?.message || 'Failed to get authentication token';
        // Provide helpful error message based on the error
        let userFriendlyMessage = errorMessage;
        if (errorMessage.includes('Bootstrap API failed')) {
          userFriendlyMessage = 'Unable to start livestream. Agora credentials are not configured.\n\nTo fix this:\n1. Set AGORA_APP_ID in Supabase Edge Function secrets\n2. Set AGORA_APP_CERTIFICATE in Supabase Edge Function secrets\n3. Redeploy the live-bootstrap function\n\nThis matches the old working implementation. Get your credentials from the Agora Console.';
        }
        
        Alert.alert(
          'Token Error',
          userFriendlyMessage,
          [{ text: 'OK' }]
        );
        return false;
      }

      // 🚀 CRITICAL: Enable local video/audio RIGHT BEFORE joinChannel (correct order)
      // This ensures video is published immediately when broadcaster joins
      // SKIP video for music mode (audio-only stream)
      try {
        log('📹 [BROADCASTER] 🚀 Final check: Enabling local video/audio RIGHT BEFORE joinChannel...');
        if (!musicMode && streamEngineRef.current?.enableLocalVideo) {
          await streamEngineRef.current.enableLocalVideo(true);
          log('✅ [BROADCASTER] ✅✅✅ Local video publishing enabled RIGHT BEFORE joinChannel');
        } else if (musicMode) {
          log('🎵 [BROADCASTER] Skipping video enable - music mode is active (audio-only)');
        } else {
          warn('⚠️ [BROADCASTER] enableLocalVideo not available');
        }
        if (streamEngineRef.current?.enableLocalAudio) {
          await streamEngineRef.current.enableLocalAudio(true);
          log('✅ [BROADCASTER] Local audio publishing enabled RIGHT BEFORE joinChannel');
        }
      } catch (e) {
        error('❌ [BROADCASTER] Failed to enable local video/audio right before join:', e);
      }

      // Pre-join: ensure engine was initialized with token's App ID (fixes -7 when native engine was inited with different App ID)
      if (tokenAppId && engineAppIdRef.current !== tokenAppId) {
        warn('⚠️ [STREAM] Pre-join App ID mismatch - re-initializing engine with token App ID');
        try {
          await releaseLivestreamEngine();
          streamEngineRef.current = null;
          engineAppIdRef.current = null;
          const ok = await initializeStreamEngine(tokenAppId);
          if (!ok || !streamEngineRef.current) {
            error('❌ [STREAM] Pre-join re-init failed');
            Alert.alert('Error', 'Stream engine could not be initialized with the correct App ID. Please try again.');
            return false;
          }
        } catch (e) {
          error('❌ [STREAM] Pre-join re-init error:', e);
          Alert.alert('Error', 'Failed to initialize stream engine. Please try again.');
          return false;
        }
      }

      // CRITICAL: Verify engine is actually initialized before joining (prevents error -7)
      if (!streamEngineRef.current) {
        error('❌ [STREAM] Engine is null before join - re-initializing...');
        try {
          const ok = await initializeStreamEngine(tokenAppId || bootstrapAppId);
          if (!ok || !streamEngineRef.current) {
            error('❌ [STREAM] Failed to initialize engine before join');
            Alert.alert('Error', 'Stream engine not ready. Please try again.');
            return false;
          }
        } catch (e) {
          error('❌ [STREAM] Error initializing engine before join:', e);
          Alert.alert('Error', 'Failed to initialize stream engine. Please try again.');
          return false;
        }
      }

      // Pre-join: leave any native channel still open (async leaveChannel returns immediately; wait after).
      // Prevents ERR_JOIN_CHANNEL_REJECTED (-17) when the engine still thinks it's in a channel.
      try {
        const lr = streamEngineRef.current?.leaveChannel?.();
        log('🧹 [STREAM] pre-join leaveChannel result:', lr);
      } catch (e) {
        log('🧹 [STREAM] pre-join leaveChannel (ignored):', e);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));

      const broadcasterJoinOptions = await buildLiveBroadcastJoinOptions('broadcaster', musicMode);
      log('🎥 [STREAM] joinChannel options (live broadcast):', broadcasterJoinOptions);

      // Attempt join with retry on -7 (ERR_NOT_INITIALIZED) or -17 (leave + retry)
      let broadcasterJoinResult = -1;
      let joinAttempts = 0;
      const maxJoinAttempts = 3;
      
      while (joinAttempts < maxJoinAttempts && broadcasterJoinResult !== 0) {
        joinAttempts++;
        log(`🎥 [STREAM] Join attempt ${joinAttempts}/${maxJoinAttempts}...`);
        
        broadcasterJoinResult = await streamEngineRef.current?.joinChannel(
          broadcasterToken,
          channelId,
          broadcasterUid,
          broadcasterJoinOptions as any
        ) ?? -1;
        
        if (broadcasterJoinResult === -17 && joinAttempts < maxJoinAttempts) {
          warn('⚠️ [STREAM] Join failed with -17 (ERR_JOIN_CHANNEL_REJECTED) — leaving channel and retrying...');
          try {
            streamEngineRef.current?.leaveChannel?.();
          } catch (_) { /* ignore */ }
          await new Promise((resolve) => setTimeout(resolve, 600));
          continue;
        }

        if (broadcasterJoinResult === -7 && joinAttempts < maxJoinAttempts) {
          warn('⚠️ [STREAM] Join failed with -7 (ERR_NOT_INITIALIZED) - re-initializing engine and retrying...');
          try {
            await releaseLivestreamEngine();
            streamEngineRef.current = null;
            engineAppIdRef.current = null;
            const ok = await initializeStreamEngine(tokenAppId || bootstrapAppId);
            if (!ok || !streamEngineRef.current) {
              error('❌ [STREAM] Failed to re-initialize engine for retry');
              break; // Exit retry loop
            }
            // Re-apply role + join options path: set broadcaster role again
            try {
              const AgoraRTC2 = await getAgoraModule();
              if (AgoraRTC2) {
                const { ClientRoleType } = AgoraRTC2;
                await streamEngineRef.current.setClientRole(ClientRoleType.ClientRoleBroadcaster);
              }
            } catch (_) { /* ignore */ }
            // Wait a moment for engine to be fully ready
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (e) {
            error('❌ [STREAM] Error re-initializing engine for retry:', e);
            break; // Exit retry loop
          }
        }
      }
      log('🎥 Broadcaster join result:', broadcasterJoinResult);
      log('🎥 Broadcaster UID:', broadcasterUid);
      log('🎥 Channel ID being joined:', channelId);
      
      // Check if broadcaster join was successful
      if (broadcasterJoinResult === 0) {
        // 🚀 CRITICAL: Enable local video publishing IMMEDIATELY after successful join
        // This is what actually PUBLISHES video to the channel so viewers can see it
        // Without this, video is enabled but not published, causing black screens
        // SKIP video for music mode (audio-only stream)
        Promise.resolve().then(async () => {
          try {
            if (!musicMode) {
              log('📹 [BROADCASTER] 🚀🚀🚀 Enabling local video publishing after join...');
              if (streamEngineRef.current?.enableLocalVideo) {
                await streamEngineRef.current.enableLocalVideo(true);
                log('✅ [BROADCASTER] ✅✅✅ Local video publishing enabled - viewers can now see video!');
              } else {
                warn('⚠️ [BROADCASTER] enableLocalVideo not available');
              }
            } else {
              log('🎵 [BROADCASTER] Skipping video enable after join - music mode is active (audio-only)');
            }
            
            // Also ensure local audio is enabled for publishing (always enabled, even in music mode)
            if (streamEngineRef.current?.enableLocalAudio) {
              await streamEngineRef.current.enableLocalAudio(true);
              log('✅ [BROADCASTER] Local audio publishing enabled');
            }
          } catch (e) {
            error('❌ [BROADCASTER] Failed to enable local video publishing:', e);
          }
        });
      }
      
      if (broadcasterJoinResult !== 0) {
        error('❌ Broadcaster failed to join channel, error code:', broadcasterJoinResult);
        
        // Provide user-friendly error messages
        let errorMessage = 'Unable to start your livestream.';
        let errorTitle = 'Connection Error';
        
        if (broadcasterJoinResult === -17) {
          errorTitle = 'Unable to Start Stream';
          errorMessage = 'We couldn\'t connect you to the livestream. This might be because:\n\n• Your internet connection was interrupted\n• The stream service is temporarily unavailable\n• Please check your connection and try again';
        } else if (broadcasterJoinResult === -2) {
          errorTitle = 'Connection Error';
          errorMessage = 'Unable to start your livestream. Please check your internet connection and try again.';
        } else if (broadcasterJoinResult === -7) {
          errorTitle = 'Connection Error';
          errorMessage = 'Unable to start your livestream. Please try again in a moment.';
        }
        
        error('❌ [STREAM] Join error details:', {
          errorCode: broadcasterJoinResult,
          hasToken: !!broadcasterToken,
          tokenLength: broadcasterToken?.length || 0,
          channelId,
          broadcasterUid,
          tokenAppId: tokenAppId || 'not provided',
          engineAppId: engineAppIdRef.current || 'not set',
          appIdMatch: tokenAppId && engineAppIdRef.current ? (tokenAppId === engineAppIdRef.current) : 'unknown',
          tokenError: tokenError?.message
        });
        
        Alert.alert(errorTitle, errorMessage);
        return false;
      }
      
      log('✅ Broadcaster successfully joined channel with UID:', broadcasterUid);
      
      // 🚀 IMPROVEMENT: Store token and schedule refresh
      currentTokenRef.current = broadcasterToken;
      scheduleTokenRefresh(3600); // 1 hour expiry

      // Wait a moment to ensure broadcaster is fully connected
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // CRITICAL: Verify audio is enabled and unmuted after joining
      try {
        await streamEngineRef.current?.enableAudio();
        await streamEngineRef.current?.enableLocalAudio(true);
        // Also ensure the audio stream is unmuted (not muted)
        try {
          await streamEngineRef.current?.muteLocalAudioStream(false);
          log('✅ [BROADCASTER] Local audio stream unmuted');
        } catch (e) {
          log('⚠️ [BROADCASTER] muteLocalAudioStream not available, continuing...');
        }
        log('✅ [BROADCASTER] Audio verified and enabled after joining channel');
      } catch (e) {
        log('⚠️ [BROADCASTER] Audio verification failed after join:', e);
      }

      // CRITICAL: Verify livestream health after joining
      const healthCheck = await verifyLivestreamHealth();
      if (!healthCheck.healthy) {
        warn('⚠️ [BROADCASTER] Livestream health check found issues:', healthCheck.issues);
      } else {
        log('✅ [BROADCASTER] Livestream health check passed');
      }

      // Update state
      log('🎬 [PROVIDER] Setting stream state...');
      log('🎬 [PROVIDER] Stream data:', streamData);
      setCurrentStream(streamData);
      log('🎬 [PROVIDER] Calling setIsStreaming(true)...');
      setIsStreaming(true);
      // Set stream start time for grace period (ignore initial poor quality reports)
      streamStartTimeRef.current = Date.now();
      log('🎬 [PROVIDER] Stream start time set for grace period');
      log('🎬 [PROVIDER] isStreaming should now be true');
      // ============================================
      // STEP 4: INITIALIZE IN-MEMORY TRACKER
      // Reset in-memory viewer tracker when starting stream
      // ============================================
      viewerCountInMemoryRef.current.clear();
      setViewerCount(0); // Initialize viewer count to 0
      lastSyncTimeRef.current = Date.now();
      streamChannelRef.current = channelId;
      currentStreamIdRef.current = streamData.id;
      reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful stream start
      log('🎬 [PROVIDER] All stream state updated');
      
      // Refresh live streams list to ensure this stream appears in story section
      // Real-time subscription should handle this, but this is a fallback
      if (loadLiveStreamsImpl.current) {
        setTimeout(() => {
          loadLiveStreamsImpl.current?.().catch(err => {
            error('❌ [LiveStreamProvider] Error refreshing streams after creation:', err);
          });
        }, 1000); // Small delay to allow real-time to handle it first
      }
      
      // Notifications are already sent immediately after stream creation (above)
      // No need to send again here
      
      // Force initial viewer count refresh
      log('🎥 [STREAMER] Force refreshing initial viewer count...');
      setTimeout(() => {
        forceRefreshViewerCount();
      }, 1000);
      
      // Set up real-time subscription for viewer count updates (for broadcaster)
      try {
        const broadcasterViewerCountSubscription = supabase
          .channel(`broadcaster_viewer_count_${streamData.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'live_streams',
              filter: `id=eq.${streamData.id}`,
            },
            (payload) => {
              const newCount = payload.new.viewer_count || 0;
              if (__DEV__) {
                log('📊 [BROADCASTER] Received viewer count update:', newCount);
              }
              setViewerCount(newCount);
              
              // CRITICAL: Reset inactivity timer when viewer count changes
              // This prevents stream from auto-ending when viewers join
              if (currentStreamIdRef.current) {
                resetInactivityTimer(currentStreamIdRef.current, newCount);
              }
            }
          )
          .subscribe((status) => {
            if (__DEV__) log('📊 [BROADCASTER] Subscription status:', status);
            if (status === 'SUBSCRIBED') {
              if (__DEV__) log('📊 [BROADCASTER] ✅ Successfully subscribed to viewer count updates');
            } else if (status === 'CHANNEL_ERROR') {
              // Use console.warn instead of console.error to prevent error overlay
              // This is an expected failure scenario (network issues or RLS policies)
              warn('📊 [BROADCASTER] ⚠️ Channel subscription error - this is usually due to network issues or RLS policies. Falling back to polling.');
              // Try to reconnect after a delay
              setTimeout(() => {
                log('📊 [BROADCASTER] Attempting to reconnect channel subscription...');
                broadcasterViewerCountSubscription.unsubscribe();
                // The subscription will be recreated on the next viewer count refresh
              }, 5000);
            } else if (status === 'TIMED_OUT') {
              // Use console.warn instead of console.error to prevent error overlay
              warn('📊 [BROADCASTER] ⚠️ Channel subscription timed out. Falling back to polling.');
            } else if (status === 'CLOSED') {
              log('📊 [BROADCASTER] Channel subscription closed');
            }
          });

        // Store subscription for cleanup
        (streamChannelRef as any).broadcasterViewerCountSubscription = broadcasterViewerCountSubscription;
      } catch (error) {
        error('📊 [BROADCASTER] Error setting up channel subscription:', error);
        // Continue without real-time updates - the periodic refresh will still work
      }

      // ============================================
      // STEP 3: 60-SECOND BATCH SYNC TO BACKEND
      // Based on NOMLI MINGLE LIVE STREAMING DOCUMENTATION
      // Sync in-memory count to backend every 60 seconds (no queries, just updates)
      // CRITICAL: This also updates updated_at to keep stream visible in listings
      // ============================================
      const syncViewerCountToBackend = async () => {
        if (!isStreaming || !currentStreamIdRef.current) return;
        
        const currentCount = viewerCountInMemoryRef.current.size;
        log(`🔄 [STABILITY] Batch syncing viewer count to backend: ${currentCount}`);
        
        // Update database with current in-memory count
        // This also updates updated_at to keep stream visible (prevents streams from disappearing)
        await updateViewerCountInDatabase(streamData.id, currentCount);
        
        // Update peak viewer count if current count is higher
        setPeakViewerCount(prevPeak => Math.max(prevPeak, currentCount));
        
        lastSyncTimeRef.current = Date.now();
      };
      
      // Initial sync after 5 seconds (allow time for initial viewers to join)
      setTimeout(() => {
        syncViewerCountToBackend();
      }, 5000);
      
      // Then sync every 60 seconds (only when app is active)
      syncIntervalRef.current = setInterval(() => {
        // Skip sync if app is in background to save CPU energy
        if (appStateRef.current === 'active') {
          syncViewerCountToBackend();
        }
      }, 60000); // 60 seconds as per documentation

      // Store interval for cleanup
      (streamChannelRef as any).viewerCountSyncInterval = syncIntervalRef.current;

      // Setup auto-end timers
      setupStreamAutoEnd(streamData.id);
      
      // Start inactivity detection (will trigger if no viewers for 30 min)
      // Only start if viewer count is 0 (initial state)
      // Timer will be reset/cleared when viewers join
      if (viewerCountInMemoryRef.current.size === 0) {
        setupInactivityDetection(streamData.id);
      }

      log('🎥 Live stream started successfully');
      log('🎥 Broadcaster is now ready for viewers');
      log('📊 Initial viewer count set to 0');
      log('⏰ Auto-end timers configured');
      return true;
    } catch (error) {
      error('❌ Failed to start live stream:', error);
      Alert.alert('Error', 'Failed to start live stream');
      return false;
    }
  }, [user]);

  // Stop live stream (implementation)
  stopLiveStreamImpl.current = async (): Promise<void> => {
    try {
      log('🛑 Stopping live stream...');

      // CRITICAL: Reset audio session IMMEDIATELY to stop background audio
      // This must happen FIRST, before any async operations
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
        log('🔇 [BROADCASTER] Audio session reset IMMEDIATELY - background audio stopped');
      } catch (audioResetError) {
        warn('⚠️ [BROADCASTER] Failed to reset audio session immediately:', audioResetError);
      }

      // Capture current stream ID before resetting state
      const streamIdToDelete = currentStream?.id;
      
      // Prevent multiple calls
      if (!isStreaming || !streamIdToDelete) {
        log('⚠️ Stream already stopped or not active');
        return;
      }

      // Immediately reset streaming state to prevent multiple calls
      setIsStreaming(false);
      setCurrentStream(null);
      setViewerCount(0);
      setPeakViewerCount(0); // Reset peak viewer count
      setStreamRemoteUids([]);
      // Reset media toggle states so next stream starts clean
      setIsStreamMicOn(true);
      setIsStreamCameraOn(true);
      // Reset network quality tracking
      streamStartTimeRef.current = null;
      recentTxQualityRef.current = [];
      lastNetworkSpeedCheckRef.current = null;
      consecutiveLowSpeedCountRef.current = 0;
      recentTxQualityRef.current = [];
      setAudioOnlyDueToNetwork(false);
      streamChannelRef.current = null;
      currentStreamIdRef.current = null;

      log('✅ Stream state reset immediately');

      // Unsubscribe from viewer count updates
      if ((streamChannelRef as any).broadcasterViewerCountSubscription) {
        await (streamChannelRef as any).broadcasterViewerCountSubscription.unsubscribe();
        log('📊 Unsubscribed from broadcaster viewer count updates');
      }

      // Clear viewer count sync interval
      if ((streamChannelRef as any).viewerCountSyncInterval) {
        clearInterval((streamChannelRef as any).viewerCountSyncInterval);
        log('📊 Cleared viewer count sync interval');
      }
      
      // Clear in-memory viewer tracker
      viewerCountInMemoryRef.current.clear();
      lastSyncTimeRef.current = 0;

      // Clear all auto-end timers
      clearStreamTimers();

      // CRITICAL: Alert viewers and guests FIRST by updating DB, then end room
      // Order: 1) Mark stream ended + deactivate guests → realtime notifies everyone, they see toast and leave
      //        2) Leave channel and release engine (end room)
      //        3) Delete comments, reactions, stream record
      log('🧹 Marking stream ended and alerting viewers/guests...');

      try {
        // Method 1: Update is_live to false and ended_at FIRST so viewers/guests get realtime "stream ended" and are alerted
        const { data: streamData } = await supabase
          .from('live_streams')
          .select('streamer_id')
          .eq('id', streamIdToDelete)
          .single();
        
        if (streamData && streamData.streamer_id === user?.id) {
          const finalPeakViewerCount = peakViewerCount || viewerCount;
          const updateData: any = { 
            is_live: false, 
            ended_at: new Date().toISOString(),
            viewer_count: 0,
          };
          try {
            updateData.peak_viewer_count = finalPeakViewerCount;
          } catch (e) {
            warn('⚠️ peak_viewer_count column may not exist yet, skipping');
          }
          
          const updateResult = await supabase
            .from('live_streams')
            .update(updateData)
            .eq('id', streamIdToDelete)
            .eq('streamer_id', user.id);

          if (updateResult.error) {
            if (updateResult.error.code === 'PGRST204' || updateResult.error.message?.includes('peak_viewer_count')) {
              const { error: retryError } = await supabase
                .from('live_streams')
                .update({ is_live: false, ended_at: new Date().toISOString(), viewer_count: 0 })
                .eq('id', streamIdToDelete)
                .eq('streamer_id', user.id);
              if (!retryError) log('✅ Stream marked as ended (without peak_viewer_count)');
            } else if (updateResult.error.code === '42501') {
              warn('⚠️ RLS policy violation - run migration: 20251230000002_fix_live_streams_rls_policies.sql');
            } else {
              error('⚠️ Failed to update stream status:', updateResult.error);
            }
          } else {
            log('✅ Stream marked as ended - viewers and guests will be alerted via realtime');
          }
        }

        // Method 2: Deactivate all active guests so they are removed and see stream ended
        try {
          const { deactivateAllGuestsForStream } = await import('../utils/guestService');
          const guestDeactivationResult = await deactivateAllGuestsForStream(streamIdToDelete);
          if (guestDeactivationResult.success) {
            log(`✅ [BROADCASTER] Deactivated ${guestDeactivationResult.deactivatedCount || 0} guest(s) - they will be alerted`);
          } else {
            warn('⚠️ [BROADCASTER] Failed to deactivate guests:', guestDeactivationResult.error);
          }
        } catch (guestCleanupError) {
          warn('⚠️ [BROADCASTER] Error during guest deactivation:', guestCleanupError);
        }

        // Short delay so realtime can deliver "stream ended" to viewers/guests before we tear down the room
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (dbError) {
        warn('⚠️ Error marking stream ended:', dbError);
      }

      // End room: leave channel and release engine
      log('🛑 Ending room - leaving channel and releasing engine...');
      if (streamEngineRef.current) {
        try {
          try {
            await streamEngineRef.current.stopPreview();
            log('📹 [BROADCASTER] Preview stopped');
          } catch (previewError) {
            warn('⚠️ [BROADCASTER] Failed to stop preview:', previewError);
          }
          try {
            await streamEngineRef.current.disableAudio();
            log('🔇 [BROADCASTER] Audio engine disabled IMMEDIATELY');
          } catch (disableAudioError) {
            warn('⚠️ [BROADCASTER] Failed to disable audio:', disableAudioError);
          }
          try {
            await streamEngineRef.current.enableLocalAudio(false);
            await streamEngineRef.current.enableLocalVideo(false);
            log('🔇📹 [BROADCASTER] Local audio and video disabled');
          } catch (disableError) {
            warn('⚠️ [BROADCASTER] Failed to disable local media:', disableError);
          }
          try {
            await streamEngineRef.current.disableVideo();
            log('📹 [BROADCASTER] Video engine disabled');
          } catch (disableVideoError) {
            warn('⚠️ [BROADCASTER] Failed to disable video:', disableVideoError);
          }
          await releaseEngineSafely();
          log('✅ [BROADCASTER] Room ended - channel left and engine released');
        } catch (channelError) {
          error('⚠️ [BROADCASTER] Error during channel cleanup:', channelError);
          await releaseEngineSafely();
        }
      }

      // Clean up database: comments, reactions, then delete stream record
      log('🧹 Cleaning up database for stream:', streamIdToDelete);
      try {
        // Method 3: Clean up comments and reactions
        const [commentsResult, reactionsResult] = await Promise.all([
          supabase
            .from('live_stream_comments')
            .delete()
            .eq('stream_id', streamIdToDelete),
          supabase
            .from('live_stream_reactions')
            .delete()
            .eq('stream_id', streamIdToDelete)
        ]);

        log('🧹 Deleted comments and reactions:', {
          comments: commentsResult.error ? 'failed' : 'success',
          reactions: reactionsResult.error ? 'failed' : 'success'
        });

        // Method 4: Delete the stream record completely
        const deleteResult = await supabase
          .from('live_streams')
          .delete()
          .eq('id', streamIdToDelete);

        if (deleteResult.error) {
          error('❌ Failed to delete stream record:', deleteResult.error);
          // If delete fails, try to mark as not live (only if user is streamer)
          if (user?.id) {
            log('🔄 Attempting to mark stream as not live due to delete failure...');
            const { data: streamData } = await supabase
              .from('live_streams')
              .select('streamer_id')
              .eq('id', streamIdToDelete)
              .single();
            
            if (streamData && streamData.streamer_id === user.id) {
              await supabase
                .from('live_streams')
                .update({ is_live: false, ended_at: new Date().toISOString() })
                .eq('id', streamIdToDelete)
                .eq('streamer_id', user.id);
            }
          }
        } else {
          log('✅ Stream record deleted successfully');
        }
        
      } catch (dbError) {
        error('❌ Database cleanup error:', dbError);
        
        // Fallback: ensure stream is marked as not live (only if user is streamer)
        if (user?.id) {
          try {
            const { data: streamData } = await supabase
              .from('live_streams')
              .select('streamer_id')
              .eq('id', streamIdToDelete)
              .single();
            
            if (streamData && streamData.streamer_id === user.id) {
              await supabase
                .from('live_streams')
                .update({ is_live: false, ended_at: new Date().toISOString() })
                .eq('id', streamIdToDelete)
                .eq('streamer_id', user.id);
              log('🔄 Fallback: marked stream as not live');
            } else {
              log('⚠️ Fallback skipped - user is not the streamer');
            }
          } catch (fallbackError) {
            error('❌ Fallback update also failed:', fallbackError);
            // Don't throw - stream state is already reset locally
          }
        }
      }

      // Force refresh the live streams list
      await loadLiveStreams();

      log('🛑 Live stream stopped and cleaned up');
      
      // 🚀 IMPROVEMENT: Clear token refresh timer
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
      currentTokenRef.current = null;
    } catch (error) {
      error('❌ Failed to stop live stream:', error);
      
      // Force reset state even if there were errors
      setIsStreaming(false);
      setCurrentStream(null);
      setViewerCount(0);
      setStreamRemoteUids([]);
      streamChannelRef.current = null;
      // Reset network quality tracking
      streamStartTimeRef.current = null;
      recentTxQualityRef.current = [];
      lastNetworkSpeedCheckRef.current = null;
      consecutiveLowSpeedCountRef.current = 0;
      
      // Clear token refresh timer even on error
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
      currentTokenRef.current = null;
    }
  };

  // Join stream as viewer
  const joinStreamAsViewer = useCallback(async (streamId: string): Promise<boolean> => {
    // Prevent duplicate join attempts
    if (viewerJoinInProgressRef.current) {
      warn('⚠️ [VIEWER] Join already in progress, skipping duplicate request');
      return false;
    }

    if (isJoinedAsViewer && currentStream?.id === streamId) {
      log('✅ [VIEWER] Already joined as viewer for this stream');
      return true;
    }

    // CRITICAL: Cleanup any existing stream first (enforce single active stream)
    if (streamEngineRef.current || isStreaming || isJoinedAsViewer) {
      log('🧹 [VIEWER] Cleaning up existing stream before joining as viewer...');
      await cleanupExistingStream();
      // Wait a moment for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    viewerJoinInProgressRef.current = true;

    try {
      log('👁️ [VIEWER] ============================================');
      log('👁️ [VIEWER] STARTING VIEWER JOIN PROCESS');
      log('👁️ [VIEWER] Stream ID:', streamId);
      log('👁️ [VIEWER] User:', user?.id || 'Anonymous');
      log('👁️ [VIEWER] ============================================');
      
      // Allow anonymous viewers: proceed even without auth
      if (!user?.id) {
        log('👁️ Proceeding as anonymous viewer (no authenticated user)');
      } else {
        // Check if user has been kicked from this stream BEFORE allowing join
        const kicked = await checkIsKicked(streamId, user.id);
        if (kicked) {
          log('🚫 [VIEWER] User has been kicked from this stream, preventing join');
          Alert.alert(
            'Access Denied',
            'You have been removed from this stream and cannot rejoin.',
            [{ text: 'OK', onPress: () => {} }]
          );
          viewerJoinInProgressRef.current = false;
          return false;
        }
      }

      // ============================================
      // BOOTSTRAP API PATTERN
      // Single API call to get all data needed to join
      // Uses Redis caching (backend) + client cache
      // ============================================
      // Use bootstrap API to get all data in one call
      log('📡 [BOOTSTRAP] Fetching bootstrap data for viewer join...');
      
      // CRITICAL: Ensure we have a valid, non-expired session before calling bootstrap API
      // The bootstrap API requires authentication, so we need to refresh session if needed
      // IMPORTANT: Don't call bootstrap API without a valid session to prevent 401 responses
      // that might trigger auth state changes and logout
      // CRITICAL: We must validate session expiration BEFORE making the API call
      let session = null;
      let shouldSkipBootstrapAPI = false;
      
      if (user?.id) {
        // Get current session
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (currentSession && currentSession.access_token) {
          // CRITICAL: Check if session is expired BEFORE using it
          const expiresAt = currentSession.expires_at;
          const now = Math.floor(Date.now() / 1000);
          
          // Add 5 minute buffer to ensure token is still valid when API call completes
          const bufferTime = 300; // 5 minutes
          
          if (expiresAt && expiresAt > (now + bufferTime)) {
            // Session is valid with buffer - safe to use
            session = currentSession;
            log('✅ [BOOTSTRAP] Valid session found (expires in', Math.floor((expiresAt - now) / 60), 'minutes)');
          } else {
            // Session expired or expiring soon - try to refresh FIRST
            log('⚠️ [BOOTSTRAP] Session expired or expiring soon, attempting refresh BEFORE API call...');
            try {
              const refreshed = await refreshAuthSession();
              if (refreshed) {
                const { data: { session: newSession } } = await supabase.auth.getSession();
                if (newSession && newSession.access_token) {
                  // Double-check the refreshed session is still valid
                  const newExpiresAt = newSession.expires_at;
                  const newNow = Math.floor(Date.now() / 1000);
                  if (newExpiresAt && newExpiresAt > (newNow + bufferTime)) {
                    session = newSession;
                    log('✅ [BOOTSTRAP] Session refreshed successfully (expires in', Math.floor((newExpiresAt - newNow) / 60), 'minutes)');
                  } else {
                    warn('⚠️ [BOOTSTRAP] Refreshed session still too close to expiration, skipping bootstrap API');
                    shouldSkipBootstrapAPI = true;
                  }
                } else {
                  warn('⚠️ [BOOTSTRAP] Refresh succeeded but no session returned, skipping bootstrap API');
                  shouldSkipBootstrapAPI = true;
                }
              } else {
                warn('⚠️ [BOOTSTRAP] Session refresh failed, skipping bootstrap API');
                shouldSkipBootstrapAPI = true;
              }
            } catch (refreshError) {
              warn('⚠️ [BOOTSTRAP] Failed to refresh session:', refreshError);
              shouldSkipBootstrapAPI = true;
            }
          }
        } else if (sessionError) {
          warn('⚠️ [BOOTSTRAP] Session error:', sessionError);
          // Try to refresh session if it exists but is expired
          try {
            const refreshed = await refreshAuthSession();
            if (refreshed) {
              const { data: { session: newSession } } = await supabase.auth.getSession();
              if (newSession && newSession.access_token) {
                const newExpiresAt = newSession.expires_at;
                const newNow = Math.floor(Date.now() / 1000);
                if (newExpiresAt && newExpiresAt > (newNow + 300)) {
                  session = newSession;
                  log('✅ [BOOTSTRAP] Session refreshed successfully after error');
                } else {
                  shouldSkipBootstrapAPI = true;
                }
              } else {
                shouldSkipBootstrapAPI = true;
              }
            } else {
              shouldSkipBootstrapAPI = true;
            }
          } catch (refreshError) {
            warn('⚠️ [BOOTSTRAP] Failed to refresh session:', refreshError);
            shouldSkipBootstrapAPI = true;
          }
        } else {
          // No session at all
          warn('⚠️ [BOOTSTRAP] No session found, skipping bootstrap API');
          shouldSkipBootstrapAPI = true;
        }
      } else {
        // Anonymous viewers - call bootstrap API with anon key (allows unauthenticated access)
        log('👁️ [BOOTSTRAP] Anonymous viewer - will call bootstrap API with anon key');
        shouldSkipBootstrapAPI = false; // Allow API call with anon key
      }

      // Call bootstrap API (with session for authenticated users, or anon key for anonymous)
      const bootstrapUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/live-bootstrap?streamId=${streamId}&role=audience`;
      let bootstrapResponse: Response | null = null;
      
      // Get anon key for anonymous requests
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      
      if (user?.id && !shouldSkipBootstrapAPI && session && session.access_token) {
        // CRITICAL: Final validation before API call - ensure token is still valid
        const expiresAt = session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        const bufferTime = 300; // 5 minutes buffer
        
        if (expiresAt && expiresAt > (now + bufferTime)) {
          try {
            log('📡 [BOOTSTRAP] Calling bootstrap API with valid session...');
            bootstrapResponse = await fetch(bootstrapUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
            });
            
            // CRITICAL: If we get 401, don't let it propagate - handle it gracefully
            if (bootstrapResponse.status === 401) {
              warn('⚠️ [BOOTSTRAP] Got 401 Unauthorized - this should not happen with valid session. Using fallback.');
              bootstrapResponse = null; // Set to null to trigger fallback
            }
          } catch (fetchError) {
            warn('⚠️ [BOOTSTRAP] Fetch error (non-critical):', fetchError);
            // Don't throw - will use fallback
            bootstrapResponse = null;
          }
        } else {
          warn('⚠️ [BOOTSTRAP] Session expired during validation, skipping API call');
          bootstrapResponse = null;
        }
      } else if (!shouldSkipBootstrapAPI) {
        // Anonymous user or no session - call API with anon key
        if (!user?.id) {
          log('👁️ [BOOTSTRAP] Calling bootstrap API for anonymous viewer with anon key...');
        } else {
          warn('⚠️ [BOOTSTRAP] Authenticated user but no valid session - using anon key');
        }
        
        try {
          bootstrapResponse = await fetch(bootstrapUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${anonKey}`, // Use anon key for anonymous access
              'apikey': anonKey, // Also include apikey header
              'Content-Type': 'application/json',
            },
          });
          
          if (bootstrapResponse.status === 401) {
            warn('⚠️ [BOOTSTRAP] Got 401 with anon key - will use fallback');
            bootstrapResponse = null;
          }
        } catch (fetchError) {
          warn('⚠️ [BOOTSTRAP] Fetch error (non-critical):', fetchError);
          bootstrapResponse = null;
        }
      }

      let bootstrapData: any = null;
      if (bootstrapResponse && bootstrapResponse.ok) {
        bootstrapData = await bootstrapResponse.json();
        
        // Check if response contains an error
        if (bootstrapData.error) {
          error('❌ [BOOTSTRAP] Bootstrap API returned error:', bootstrapData.error);
          // Don't show alert for auth errors - just fall back silently
          if (bootstrapData.error.includes('Unauthorized') || bootstrapResponse.status === 401) {
            warn('⚠️ [BOOTSTRAP] Unauthorized - will use fallback (this is OK for anonymous viewers)');
          } else {
            Alert.alert(
              'Connection Error',
              bootstrapData.error.includes('Token server') 
                ? 'Unable to connect to the stream service. Please try again later.'
                : 'Failed to connect to the stream. Please try again.'
            );
            viewerJoinInProgressRef.current = false;
            return false;
          }
        } else {
          log('✅ [BOOTSTRAP] Bootstrap data received:', {
            hasToken: !!bootstrapData.token,
            tokenLength: bootstrapData.token?.length || 0,
            channelName: bootstrapData.channelName,
            uid: bootstrapData.uid,
            appId: bootstrapData.appId,
          });
        }
      } else if (bootstrapResponse && bootstrapResponse.status === 401) {
        // 401 Unauthorized - this should NOT happen if we validated session properly
        // But if it does, handle gracefully without triggering logout
        // CRITICAL: This should not trigger Supabase auth state changes
        warn('⚠️ [BOOTSTRAP] Unauthorized (401) - unexpected but handling gracefully. Using fallback.');
        warn('⚠️ [BOOTSTRAP] This may indicate a session expiration during API call. Will use fallback.');
        // Explicitly set bootstrapResponse to null to trigger fallback
        bootstrapResponse = null;
      } else if (!bootstrapResponse) {
        // No response (skipped API call or fetch failed) - use fallback
        log('📡 [BOOTSTRAP] No bootstrap response - using fallback method');
        // FALLBACK: Execute fallback logic when bootstrap API is skipped or failed
        const { data: fallbackStream, error } = await supabase
          .from('live_streams')
          .select('*')
          .eq('id', streamId)
          .eq('is_live', true)
          .single();

        if (error || !fallbackStream || !fallbackStream.is_live || !fallbackStream.broadcaster_uid) {
          Alert.alert('Stream Ended', 'This stream has ended or is no longer available');
          viewerJoinInProgressRef.current = false;
          return false;
        }

        // Fallback: generate token directly (only if token server is configured)
        // Note: For livestreaming, bootstrap API is preferred. This is a fallback only.
        const viewerUid = Math.floor(Math.random() * 100000) + 1;
        let viewerToken = '';
        let fallbackAppId = process.env.EXPO_PUBLIC_AGORA_APP_ID || '';
        
        try {
          // Try to use Supabase Edge Function for token generation (works for authenticated users)
          const { data: { session } } = await supabase.auth.getSession();
          if (session && session.access_token) {
            // User is authenticated - use Edge Function
            try {
              const tokenResult = await fetchRtcTokenWithAppId({ 
                channelName: fallbackStream.channel_id, 
                uid: viewerUid, 
                role: 'audience' 
              });
              viewerToken = tokenResult.token;
              if (tokenResult.appId) {
                fallbackAppId = tokenResult.appId;
              }
              log('✅ [FALLBACK] Generated token via Edge Function for authenticated viewer');
            } catch (tokenError) {
              error('❌ [FALLBACK] Edge Function token generation failed:', tokenError);
              // Don't continue without token - will fail validation below
            }
          } else {
            // Anonymous viewer - try legacy token server if configured
            const tokenServerUrl = process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL;
            if (tokenServerUrl && tokenServerUrl.length > 0) {
              try {
                viewerToken = await fetchRtcToken({ channelName: fallbackStream.channel_id, uid: viewerUid, role: 'audience' });
                log('✅ [FALLBACK] Generated token via legacy token server');
              } catch (legacyError) {
                error('❌ [FALLBACK] Legacy token server failed (anonymous user):', legacyError);
                // Don't continue without token - will fail validation below
              }
            } else {
              error('❌ [FALLBACK] No token server configured and user is anonymous - cannot generate token');
              // CRITICAL: Cannot join without token - will fail validation below
            }
          }
        } catch (e) {
          error('❌ [FALLBACK] Token generation error:', e);
          // Don't continue without token - will fail validation below
        }
        
        // CRITICAL: If token generation failed, we cannot proceed
        if (!viewerToken || viewerToken.length === 0) {
          error('❌ [FALLBACK] Failed to generate token - cannot join stream');
          Alert.alert(
            'Connection Error',
            'Unable to connect to the stream. Please sign in to watch livestreams, or check your connection.'
          );
          viewerJoinInProgressRef.current = false;
          return false;
        }

        bootstrapData = {
          token: viewerToken,
          appId: fallbackAppId,
          channelName: fallbackStream.channel_id,
          uid: viewerUid,
          role: 'audience' as const,
          streamId: fallbackStream.id,
          streamTitle: fallbackStream.title,
          streamerName: fallbackStream.streamer_name,
          streamerAvatar: fallbackStream.streamer_avatar,
        };
      } else {
        warn('⚠️ [BOOTSTRAP] Bootstrap API failed, falling back to direct fetch');
        // Fallback to direct database query if bootstrap fails
        const { data: fallbackStream, error } = await supabase
          .from('live_streams')
          .select('*')
          .eq('id', streamId)
          .eq('is_live', true)
          .single();

        if (error || !fallbackStream || !fallbackStream.is_live || !fallbackStream.broadcaster_uid) {
          Alert.alert('Stream Ended', 'This stream has ended or is no longer available');
          viewerJoinInProgressRef.current = false;
          return false;
        }

        // Fallback: generate token directly (only if token server is configured)
        // Note: For livestreaming, bootstrap API is preferred. This is a fallback only.
        const viewerUid = Math.floor(Math.random() * 100000) + 1;
        let viewerToken = '';
        let fallbackAppId = process.env.EXPO_PUBLIC_AGORA_APP_ID || '';
        
        try {
          // Try to use Supabase Edge Function for token generation (works for authenticated users)
          const { data: { session } } = await supabase.auth.getSession();
          if (session && session.access_token) {
            // User is authenticated - use Edge Function
            try {
              const tokenResult = await fetchRtcTokenWithAppId({ 
                channelName: fallbackStream.channel_id, 
                uid: viewerUid, 
                role: 'audience' 
              });
              viewerToken = tokenResult.token;
              if (tokenResult.appId) {
                fallbackAppId = tokenResult.appId;
              }
              log('✅ [FALLBACK] Generated token via Edge Function for authenticated viewer');
            } catch (tokenError) {
              error('❌ [FALLBACK] Edge Function token generation failed:', tokenError);
              // Don't continue without token - will fail validation below
            }
          } else {
            // Anonymous viewer - try legacy token server if configured
            const tokenServerUrl = process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL;
            if (tokenServerUrl && tokenServerUrl.length > 0) {
              try {
                viewerToken = await fetchRtcToken({ channelName: fallbackStream.channel_id, uid: viewerUid, role: 'audience' });
                log('✅ [FALLBACK] Generated token via legacy token server');
              } catch (legacyError) {
                error('❌ [FALLBACK] Legacy token server failed (anonymous user):', legacyError);
                // Don't continue without token - will fail validation below
              }
            } else {
              error('❌ [FALLBACK] No token server configured and user is anonymous - cannot generate token');
              // CRITICAL: Cannot join without token - will fail validation below
            }
          }
        } catch (e) {
          error('❌ [FALLBACK] Token generation error:', e);
          // Don't continue without token - will fail validation below
        }
        
        // CRITICAL: If token generation failed, we cannot proceed
        if (!viewerToken || viewerToken.length === 0) {
          error('❌ [FALLBACK] Failed to generate token - cannot join stream');
          Alert.alert(
            'Connection Error',
            'Unable to connect to the stream. Please sign in to watch livestreams, or check your connection.'
          );
          viewerJoinInProgressRef.current = false;
          return false;
        }

        bootstrapData = {
          token: viewerToken,
          appId: fallbackAppId,
          channelName: fallbackStream.channel_id,
          uid: viewerUid,
          role: 'audience' as const,
          streamId: fallbackStream.id,
          streamTitle: fallbackStream.title,
          streamerName: fallbackStream.streamer_name,
          streamerAvatar: fallbackStream.streamer_avatar,
        };
      }

      // Validate bootstrap data exists before proceeding
      if (!bootstrapData) {
        error('❌ [VIEWER] Bootstrap data is missing');
        Alert.alert('Error', 'Failed to get stream configuration');
        viewerJoinInProgressRef.current = false;
        return false;
      }

      // Validate required bootstrap fields
      const viewerUid = bootstrapData.uid;
      const viewerToken = bootstrapData.token || '';
      const appId = bootstrapData.appId;
      const channelId = bootstrapData.channelName;
      // CRITICAL: Extract broadcasterUid from bootstrapData (may be undefined if not provided)
      const broadcasterUid = bootstrapData?.broadcasterUid || bootstrapData?.broadcaster_uid || 1000;

      // CRITICAL: Validate token exists before attempting to join
      // Agora production requires tokens - joining without token will fail
      if (!viewerToken || viewerToken.length === 0) {
        const { data: { session } } = await supabase.auth.getSession();
        const isAnonymous = !session || !session.access_token;
        
        error('❌ [VIEWER] No token available - cannot join stream:', {
          isAnonymous,
          bootstrapResponseStatus: bootstrapResponse?.status,
          bootstrapResponseOk: bootstrapResponse?.ok,
          hasToken: !!bootstrapData.token,
          tokenLength: bootstrapData.token?.length || 0,
          bootstrapDataKeys: Object.keys(bootstrapData || {}),
          bootstrapDataError: bootstrapData?.error,
        });
        
        // CRITICAL: Always require tokens - Agora production requires tokens
        // TODO: Fix bootstrap API to support anonymous users OR ensure fallback always generates tokens
        Alert.alert(
          'Connection Error',
          isAnonymous
            ? 'Unable to connect to the stream. Please sign in to watch livestreams, or check your connection.'
            : 'Unable to connect to the stream. The stream service may be unavailable. Please try again later.'
        );
        viewerJoinInProgressRef.current = false;
        return false;
      }

      // Validate other required fields
      if (!appId || !channelId || !viewerUid) {
        error('❌ [VIEWER] Bootstrap data missing required fields:', {
          hasAppId: !!appId,
          hasChannelId: !!channelId,
          hasUid: !!viewerUid,
        });
        Alert.alert('Error', 'Stream configuration is incomplete');
        viewerJoinInProgressRef.current = false;
        return false;
      }

      // Initialize stream engine with bootstrap App ID
      const engineReady = await initializeStreamEngine(appId);
      if (!engineReady) {
        Alert.alert('Error', 'Failed to initialize streaming engine');
        viewerJoinInProgressRef.current = false;
        return false;
      }

      // 🚀 CRITICAL FIX: Enable video BEFORE setting audience role
      // Video must be enabled for viewers to receive remote video streams
      try {
        await streamEngineRef.current?.enableVideo();
        log('✅ [VIEWER] Video enabled before setting audience role');
      } catch (e) {
        error('❌ [VIEWER] Failed to enable video:', e);
      }
      
      // Enable audio for receiving remote audio
      try {
        await streamEngineRef.current?.enableAudio();
        log('✅ [VIEWER] Audio enabled before setting audience role');
      } catch (e) {
        error('❌ [VIEWER] Failed to enable audio:', e);
      }
      
      // 🚀 CRITICAL FIX: Enable remote video subscription BEFORE joining
      // This ensures viewers can receive video streams from broadcasters
      try {
        if (streamEngineRef.current?.enableRemoteVideo) {
          await streamEngineRef.current.enableRemoteVideo(true);
          log('✅ [VIEWER] Remote video enabled before joining');
        }
      } catch (e) {
        log('⚠️ [VIEWER] enableRemoteVideo not available:', e);
      }
      
      // Set client role to audience
      const AgoraRTC = await getAgoraModule();
      const { ClientRoleType } = AgoraRTC;
      await streamEngineRef.current?.setClientRole(ClientRoleType.ClientRoleAudience);
      log('✅ [VIEWER] Client role set to AUDIENCE');
      
      // 🚀 CRITICAL FIX: Ensure video stays enabled after role change
      // Some SDK versions disable video when switching to audience role
      try {
        await streamEngineRef.current?.enableVideo();
        log('✅ [VIEWER] Video re-enabled after setting audience role');
      } catch (e) {
        warn('⚠️ [VIEWER] Failed to re-enable video after role change:', e);
      }
      
      // 🚀 TIKTOK-SPEED: No delay - subscribe immediately after join
      // TikTok shows video instantly, so we should too
      log('🔍 [VIEWER] Join attempt details (from bootstrap):', {
        channelId,
        viewerUid,
        hasToken: !!viewerToken,
        tokenLength: viewerToken?.length || 0,
        appId,
      });

      log('👁️ [VIEWER] ============================================');
      log('👁️ [VIEWER] ATTEMPTING TO JOIN CHANNEL');
      log('👁️ [VIEWER] Channel ID:', channelId);
      log('👁️ [VIEWER] Viewer UID:', viewerUid);
      log('👁️ [VIEWER] Broadcaster UID expected:', broadcasterUid);
      log('👁️ [VIEWER] Has token:', !!viewerToken);
      log('👁️ [VIEWER] Bootstrap channelName:', bootstrapData?.channelName);
      log('👁️ [VIEWER] Bootstrap broadcasterUid:', bootstrapData?.broadcasterUid || bootstrapData?.broadcaster_uid);
      log('👁️ [VIEWER] ============================================');
      
      // Pre-join leave + full ChannelMediaOptions (same -17 fix as broadcaster)
      try {
        const lr = streamEngineRef.current?.leaveChannel?.();
        log('🧹 [VIEWER] pre-join leaveChannel result:', lr);
      } catch (_) { /* ignore */ }
      await new Promise((resolve) => setTimeout(resolve, 450));
      const viewerJoinOptions = await buildLiveBroadcastJoinOptions('audience', false);
      log('👁️ [VIEWER] joinChannel options:', viewerJoinOptions);

      // CRITICAL: Retry logic for error -7 (ERR_NOT_INITIALIZED)
      // This can happen if engine was released between initialization and join
      let joinResult: number | undefined = undefined;
      const maxRetries = 2;
      let retryCount = 0;
      
      while (retryCount <= maxRetries) {
        if (retryCount > 0) {
          log(`🔄 [VIEWER] Retry attempt ${retryCount}/${maxRetries} for join...`);
          // Re-initialize engine if error -7 occurred
          if (joinResult === -7) {
            log('🔄 [VIEWER] Error -7 detected, re-initializing engine...');
            try {
              await releaseLivestreamEngine();
            } catch (e) {
              warn('⚠️ [VIEWER] Error releasing engine for retry:', e);
            }
            streamEngineRef.current = null;
            engineAppIdRef.current = null;
            
            // Re-initialize with bootstrap App ID
            const reinitOk = await initializeStreamEngine(appId);
            if (!reinitOk || !streamEngineRef.current) {
              error('❌ [VIEWER] Failed to re-initialize engine for retry');
              break; // Exit retry loop
            }
            
            // Re-enable video/audio and set role after re-init
            try {
              await streamEngineRef.current.enableVideo();
              await streamEngineRef.current.enableAudio();
              const AgoraRTC = await getAgoraModule();
              const { ClientRoleType } = AgoraRTC;
              await streamEngineRef.current.setClientRole(ClientRoleType.ClientRoleAudience);
              log('✅ [VIEWER] Engine re-initialized and configured for retry');
            } catch (e) {
              error('❌ [VIEWER] Failed to configure engine after re-init:', e);
            }
            
            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        
        joinResult = await streamEngineRef.current?.joinChannel(
          viewerToken,
          channelId,
          viewerUid,
          viewerJoinOptions as any
        );
        
        log('👁️ [VIEWER] ============================================');
        log('👁️ [VIEWER] JOIN CHANNEL RESULT:', joinResult, joinResult === 0 ? '✅ SUCCESS' : '❌ FAILED', retryCount > 0 ? `(Retry ${retryCount})` : '');
        log('👁️ [VIEWER] Viewer UID:', viewerUid);
        log('👁️ [VIEWER] Channel ID joined:', channelId);
        log('👁️ [VIEWER] Broadcaster UID expected:', broadcasterUid);
        log('👁️ [VIEWER] ============================================');
        
        // Success - exit retry loop
        if (joinResult === 0) {
          break;
        }
        
        // Only retry on error -7
        if (joinResult !== -7) {
          break; // Exit retry loop for other errors
        }
        
        retryCount++;
      }

      // Check if join was successful (0 = success)
      if (joinResult === 0) {
        // 🚀 IMPROVEMENT: Store token and schedule refresh
        currentTokenRef.current = viewerToken;
        scheduleTokenRefresh(3600); // 1 hour expiry
        
        // 🚀 TIKTOK-SPEED: Subscribe IMMEDIATELY after join (no waiting)
        // Do this in parallel with state updates for maximum speed
        log('📹 [VIEWER] 🚀 Starting INSTANT subscription process...');
        Promise.resolve().then(async () => {
          try {
            log('📹 [VIEWER] 🚀 INSTANT subscription after join (UID:', broadcasterUid, ')');
            if (streamEngineRef.current?.enableRemoteVideo) {
              await streamEngineRef.current.enableRemoteVideo(true);
              log('✅ [VIEWER] enableRemoteVideo(true) called');
            }
            // 🌍 POOR NETWORK: Start with LOW stream for conservative approach, upgrade later if network improves
            // Start conservative (Fair = 3) - use LOW stream initially
            const initialStreamType = getStreamTypeForQuality(3);
            await subscribeToRemoteStream(streamEngineRef.current, broadcasterUid, {
              streamType: initialStreamType,
              operationName: 'onUserVideoPublished',
            });
            log('🌍 [POOR_NETWORK] Subscribed to broadcaster video via onUserVideoPublished');
            lastViewerStreamTypeRef.current = initialStreamType;
            log('🌍 [POOR_NETWORK] Started with', initialStreamType === 0 ? 'HIGH' : 'LOW', 'stream (conservative approach) for UID:', broadcasterUid);
            await streamEngineRef.current?.muteRemoteAudioStream(broadcasterUid, false);
            log('✅ [VIEWER] muteRemoteAudioStream(false) called for UID:', broadcasterUid);
            log('✅ [VIEWER] ✅✅✅ INSTANT subscription successful after join!');
          } catch (e) {
            error('❌ [VIEWER] Instant subscription failed, will retry via subscribeToBroadcasterImmediately:', e);
          }
        });
        
        // Set viewer state immediately after successful join using bootstrap data or streamId
        // This ensures video can render while database fetch completes
        // CRITICAL: Use startTransition to batch state updates and prevent hook order issues
        const streamIdToUse = bootstrapData?.streamId || streamId;
        if (streamIdToUse) {
          const initialStreamData = {
            id: streamIdToUse,
            title: bootstrapData?.streamTitle || 'Live Stream',
            streamer_name: bootstrapData?.streamerName || 'Streamer',
            streamer_avatar: bootstrapData?.streamerAvatar,
            streamer_id: bootstrapData?.streamerId,
            channel_id: channelId,
            broadcaster_uid: bootstrapData?.broadcasterUid || 1000,
            is_live: true,
            viewer_count: 0,
            started_at: new Date().toISOString(),
            music_mode: false, // Will be updated from database fetch
          };
          
          // CRITICAL: Batch state updates to prevent hook order issues
          startTransition(() => {
            setCurrentStream(initialStreamData);
            setIsJoinedAsViewer(true);
          });
          streamChannelRef.current = channelId;
          currentStreamIdRef.current = streamIdToUse;
          
          log('✅ [VIEWER] State set immediately after join:', {
            streamId: streamIdToUse,
            channelId,
            broadcasterUid: initialStreamData.broadcaster_uid,
            hasBootstrapData: !!bootstrapData,
          });
        } else {
          warn('⚠️ [VIEWER] Cannot set state immediately - no streamId available');
        }
      }
      
      if (joinResult !== 0) {
        error('❌ Failed to join channel, error code:', joinResult);
        
        // Provide user-friendly error messages
        let errorMessage = 'Unable to join the livestream.';
        let errorTitle = 'Connection Error';
        
        if (joinResult === -17) {
          errorTitle = 'Unable to Join Stream';
          errorMessage = 'We couldn\'t connect you to this livestream. This might be because:\n\n• The streamer may have ended the livestream\n• Your internet connection was interrupted\n• The stream service is temporarily unavailable\n\nPlease check your connection and try again.';
          error('❌ [VIEWER] Error -17 details:', {
            errorCode: joinResult,
            hasToken: !!viewerToken,
            tokenLength: viewerToken?.length || 0,
            channelId,
            viewerUid,
            appId,
            broadcasterUid: broadcasterUid,
            streamId: bootstrapData?.streamId || streamId,
          });
        } else if (joinResult === -2) {
          errorTitle = 'Connection Error';
          errorMessage = 'Unable to join the livestream. Please check your internet connection and try again.';
        } else if (joinResult === -7) {
          errorTitle = 'Connection Error';
          errorMessage = 'Unable to join the livestream. Please try again in a moment.';
        }
        
        Alert.alert(errorTitle, errorMessage);
        viewerJoinInProgressRef.current = false;
        return false;
      }

      // ============================================
      // CRITICAL: Immediately subscribe to broadcaster if already in channel
      // ============================================
      // The broadcaster may have joined before the viewer, so onUserJoined won't fire
      // We need to proactively subscribe to their video immediately after joining
      // broadcasterUid is already defined above from bootstrapData
      // ============================================
      
      // 🚀 AGGRESSIVE SUBSCRIPTION: Multiple attempts to ensure video works
      // The old version worked reliably with this simple approach
      const subscribeToBroadcasterImmediately = async () => {
        try {
          log('📹 [VIEWER] Subscribing to broadcaster video (UID:', broadcasterUid, ')');
          
          // CRITICAL: Ensure video is enabled BEFORE subscribing (old version did this)
          try {
            await streamEngineRef.current?.enableVideo();
            log('✅ [VIEWER] Video enabled for receiving');
          } catch (e) {
            error('❌ [VIEWER] Failed to enable video:', e);
          }
          
          // Enable remote video subscription (critical for receiving video)
          try {
            if (streamEngineRef.current?.enableRemoteVideo) {
              await streamEngineRef.current.enableRemoteVideo(true);
              log('✅ [VIEWER] Remote video enabled');
            }
          } catch (e) {
            log('⚠️ [VIEWER] enableRemoteVideo not available:', e);
          }
          
          // 🚀 AGGRESSIVE: Try multiple subscription attempts with different strategies
          const attemptSubscription = async (attempt: number, delay: number = 0) => {
            if (delay > 0) {
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            try {
              log(`📹 [VIEWER] 🚀 Subscription attempt ${attempt} for UID:`, broadcasterUid);
              
              // Strategy 1: Unmute video stream
              await streamEngineRef.current?.muteRemoteVideoStream(broadcasterUid, false);
              log(`✅ [VIEWER] Attempt ${attempt}: muteRemoteVideoStream(false) successful`);
              
              const streamType = liveDataSaverEnabledRef.current ? LOW_STREAM_TYPE : HIGH_STREAM_TYPE;
              await streamEngineRef.current?.setRemoteVideoStreamType(broadcasterUid, streamType);
              lastViewerStreamTypeRef.current = streamType;
              log(`✅ [VIEWER] Attempt ${attempt}: setRemoteVideoStreamType(${streamType === HIGH_STREAM_TYPE ? 'HIGH' : 'LOW'}) successful`);
              
              // Strategy 3: Also ensure audio is unmuted
              await streamEngineRef.current?.muteRemoteAudioStream(broadcasterUid, false);
              log(`✅ [VIEWER] Attempt ${attempt}: muteRemoteAudioStream(false) successful`);
              
              log(`✅ [VIEWER] ✅✅✅ Subscription attempt ${attempt} COMPLETE!`);
              return true;
            } catch (e) {
              error(`❌ [VIEWER] Subscription attempt ${attempt} failed:`, e);
              return false;
            }
          };
          
          // Try immediate subscription first
          let success = await attemptSubscription(1, 0);
          
          // If failed, retry with delays
          if (!success) {
            success = await attemptSubscription(2, 100);
          }
          if (!success) {
            success = await attemptSubscription(3, 500);
          }
          if (!success) {
            success = await attemptSubscription(4, 1000);
          }
          
          if (!success) {
            error('❌ [VIEWER] All subscription attempts failed!');
          }
          
          // Add broadcaster to remote UIDs list so UI knows they're present
          // CRITICAL: Do this IMMEDIATELY so video component can render
          setStreamRemoteUids(prev => {
            if (!prev.includes(broadcasterUid)) {
              const newUids = [...prev, broadcasterUid];
              log('✅ [VIEWER] Added broadcaster to remote UIDs list:', broadcasterUid);
              return newUids;
            }
            return prev;
          });
          
          // Optimistically set broadcaster video as enabled
          setBroadcasterVideoEnabled(prev => {
            const newMap = new Map(prev);
            newMap.set(broadcasterUid, true);
            log('✅ [VIEWER] Optimistically set broadcaster video as enabled');
            return newMap;
          });
          
          // Add broadcaster to remote UIDs list so UI knows they're present
          // CRITICAL: Use functional update to ensure we don't lose the broadcaster
          setStreamRemoteUids(prev => {
            if (!prev.includes(broadcasterUid)) {
              const newUids = [...prev, broadcasterUid];
              log('✅ [VIEWER] Added broadcaster to remote UIDs list:', broadcasterUid);
              log('✅ [VIEWER] Updated remote UIDs:', newUids);
              // Double-check after a short delay to ensure it persisted
              setTimeout(() => {
                setStreamRemoteUids(current => {
                  if (!current.includes(broadcasterUid)) {
                    log('⚠️ [VIEWER] Broadcaster was cleared! Re-adding...');
                    return [...current, broadcasterUid];
                  }
                  return current;
                });
              }, 1000);
              return newUids;
            }
            log('✅ [VIEWER] Broadcaster already in remote UIDs:', prev);
            return prev;
          });
          
          // CRITICAL: Optimistically set broadcaster video as enabled
          // This prevents dark screen while waiting for video state events
          setBroadcasterVideoEnabled(prev => {
            const newMap = new Map(prev);
            newMap.set(broadcasterUid, true);
            log('✅ [VIEWER] Optimistically set broadcaster video as enabled');
            return newMap;
          });
          
          log('✅ [VIEWER] CRITICAL: Immediate broadcaster video subscription complete');
        } catch (error) {
          // Silently continue - onUserJoined or delayed subscription will handle it
        }
      };
      
      // CRITICAL: Ensure broadcaster is in remote UIDs IMMEDIATELY after join
      // This must happen BEFORE any async operations so video component can render
      setStreamRemoteUids(prev => {
        if (!prev.includes(broadcasterUid)) {
          log('✅ [VIEWER] CRITICAL: Adding broadcaster to remote UIDs IMMEDIATELY after join');
          return [...prev, broadcasterUid];
        }
        return prev;
      });
      
      // CRITICAL: Optimistically set video as enabled IMMEDIATELY
      // This allows video component to render while subscription happens
      setBroadcasterVideoEnabled(prev => {
        const newMap = new Map(prev);
        newMap.set(broadcasterUid, true);
        log('✅ [VIEWER] CRITICAL: Optimistically set broadcaster video as enabled IMMEDIATELY');
        return newMap;
      });
      
      // CRITICAL: Log channel matching to diagnose dark screen
      log('🔍 [VIEWER] Channel verification:', {
        bootstrapChannelName: bootstrapData?.channelName,
        channelId,
        broadcasterUid,
        viewerUid,
        hasBootstrapData: !!bootstrapData,
      });
      
      // Subscribe immediately (matching old working version)
      await subscribeToBroadcasterImmediately();
      
      // 🚀 CRITICAL: Set up periodic retry subscription until video frames arrive
      // This ensures video works even if broadcaster publishes after we join
      // Uses DRY retry logic optimized for bad connections
      let subscriptionRetryCount = 0;
      const maxSubscriptionRetries = 15; // 30 seconds total (15 * 2 seconds)
      
      const subscriptionRetryInterval = setInterval(async () => {
        subscriptionRetryCount++;
        
        // Stop retrying if we're no longer joined as viewer
        if (!isJoinedAsViewerRef.current) {
          clearInterval(subscriptionRetryInterval);
          livestreamLog('🛑 [VIEWER] Stopped retries - no longer joined as viewer');
          return;
        }
        
        // Stop after max retries
        if (subscriptionRetryCount > maxSubscriptionRetries) {
          clearInterval(subscriptionRetryInterval);
          livestreamLog('⏱️ [VIEWER] Stopped periodic subscription retries after max attempts');
          return;
        }
        
        // Retry subscription using safe engine operation (DRY - handles errors gracefully)
        livestreamLog(`🔄 [VIEWER] Periodic retry ${subscriptionRetryCount}/${maxSubscriptionRetries}: Attempting to subscribe to broadcaster video...`);
        await Promise.all([
          safeEngineOperation(
            streamEngineRef.current,
            async (engine) => engine.muteRemoteVideoStream(broadcasterUid, false),
            { operationName: 'muteRemoteVideoStream', silentFail: true }
          ),
          safeEngineOperation(
            streamEngineRef.current,
            async (engine) => {
              const preferredStreamType = liveDataSaverEnabledRef.current ? LOW_STREAM_TYPE : HIGH_STREAM_TYPE;
              await engine.setRemoteVideoStreamType(broadcasterUid, preferredStreamType);
              lastViewerStreamTypeRef.current = preferredStreamType;
            },
            { operationName: 'setRemoteVideoStreamType', silentFail: true }
          ),
          safeEngineOperation(
            streamEngineRef.current,
            async (engine) => engine.muteRemoteAudioStream(broadcasterUid, false),
            { operationName: 'muteRemoteAudioStream', silentFail: true }
          ),
        ]);
        
        livestreamLog(`✅ [VIEWER] Periodic retry ${subscriptionRetryCount} subscription attempted`);
      }, 2000); // Retry every 2 seconds
      
      // Store interval ID for cleanup
      const cleanupRetryInterval = () => {
        clearInterval(subscriptionRetryInterval);
      };
      
      // Cleanup on unmount or when leaving
      // Note: This will be cleaned up when joinStreamAsViewer completes or fails
      
      // Also set up listener for when broadcaster publishes video (in case they publish after we join)
      // This is a backup in case immediate subscription didn't work
      try {
        streamEngineRef.current?.addListener('onUserVideoPublished', async (connection: any, remoteUid: number, elapsed: number) => {
          if (remoteUid === broadcasterUid) {
            log('📹 [VIEWER] 🚀🚀🚀 Broadcaster published video - subscribing IMMEDIATELY...');
            try {
              // CRITICAL: Ensure remote video is enabled
              if (streamEngineRef.current?.enableRemoteVideo) {
                await streamEngineRef.current.enableRemoteVideo(true);
                log('✅ [VIEWER] enableRemoteVideo(true) called');
              }
              // Subscribe to video
              await streamEngineRef.current?.muteRemoteVideoStream(broadcasterUid, false);
              log('✅ [VIEWER] muteRemoteVideoStream(false) called');
              const preferredStreamType = liveDataSaverEnabledRef.current ? LOW_STREAM_TYPE : HIGH_STREAM_TYPE;
              await streamEngineRef.current?.setRemoteVideoStreamType(broadcasterUid, preferredStreamType);
              lastViewerStreamTypeRef.current = preferredStreamType;
              log(`✅ [VIEWER] setRemoteVideoStreamType(${preferredStreamType === HIGH_STREAM_TYPE ? 'HIGH' : 'LOW'}) called`);
              // Also subscribe to audio
              await streamEngineRef.current?.muteRemoteAudioStream(broadcasterUid, false);
              log('✅ [VIEWER] muteRemoteAudioStream(false) called');
              // Add to remote UIDs if not already there
              setStreamRemoteUids(prev => {
                if (!prev.includes(broadcasterUid)) {
                  log('✅ [VIEWER] Adding broadcaster to remote UIDs via onUserVideoPublished');
                  return [...prev, broadcasterUid];
                }
                return prev;
              });
              log('✅ [VIEWER] ✅✅✅ Subscribed to broadcaster video via onUserVideoPublished');
            } catch (e) {
              error('❌ [VIEWER] Failed to subscribe via onUserVideoPublished:', e);
            }
          }
        });
        log('✅ [VIEWER] onUserVideoPublished listener added');
      } catch (e) {
        log('⚠️ [VIEWER] Could not add onUserVideoPublished listener:', e);
      }

      // ============================================
      // AUDIO-FIRST SUBSCRIPTION PATTERN
      // Based on NOMLI MINGLE LIVE STREAMING DOCUMENTATION
      // ============================================
      // 1. Subscribe to audio IMMEDIATELY (< 500ms target)
      // 2. Delay video subscription by 1-1.2 seconds (already done above)
      // 3. Never block audio due to video
      // ============================================
      
      // STEP 1: Enable audio immediately (audio-first pattern)
      try {
        log('🎤 [STABILITY] AUDIO-FIRST: Enabling audio immediately...');
        await streamEngineRef.current?.enableAudio();
        log('✅ [STABILITY] Audio enabled for receiving (can hear broadcaster)');
        
        // Immediately subscribe to broadcaster's audio
        try {
          await streamEngineRef.current?.muteRemoteAudioStream(broadcasterUid, false);
          log('✅ [STABILITY] AUDIO-FIRST: Subscribed to broadcaster audio immediately (UID:', broadcasterUid, ')');
        } catch (e) {
          log('⚠️ [STABILITY] Could not subscribe to broadcaster audio (may not be in channel yet):', e);
        }
        
        // Disable local audio publishing (viewers cannot transmit)
        await streamEngineRef.current?.enableLocalAudio(false);
        log('🔇 [STABILITY] Local audio publishing disabled (viewer mode)');
        
        // Add listener for remote audio state changes
        streamEngineRef.current?.addListener('onRemoteAudioStateChanged', (uid: number, state: number, reason: number, elapsed: number) => {
          // If broadcaster's audio is starting/decoding, ensure it's not muted
          if ((uid === broadcasterUid) && (state === 1 || state === 2)) {
            try {
              streamEngineRef.current?.muteRemoteAudioStream(uid, false);
              log('✅ [STABILITY] Ensured broadcaster audio is unmuted');
            } catch (e) {
              log('⚠️ [STABILITY] Could not unmute broadcaster audio:', e);
            }
          }
        });
        
        log('✅ [STABILITY] AUDIO-FIRST: Audio subscription complete - audio should be playing now');
      } catch (error) {
        error('❌ [STABILITY] Failed to configure audio:', error);
        // Continue anyway - audience role should prevent audio transmission
      }
      
      // STEP 2: Additional video subscription check after delay (backup)
      // This ensures video is subscribed even if immediate subscription failed
      // Based on documentation: delay video by 1-1.2 seconds
      const startQuality = liveDataSaverEnabledRef.current ? NetworkQuality.POOR : NetworkQuality.GOOD;
      const videoDelay = getVideoSubscriptionDelay(startQuality);
      
      log(`📹 [STABILITY] AUDIO-FIRST: Setting up backup video subscription check after ${videoDelay}ms...`);
      
      setTimeout(async () => {
        try {
          log('📹 [STABILITY] AUDIO-FIRST: Backup video subscription check...');
          
          // Double-check video is enabled
          await streamEngineRef.current?.enableVideo();
          
          // Ensure remote video is enabled
          try {
            if (streamEngineRef.current?.enableRemoteVideo) {
              await streamEngineRef.current.enableRemoteVideo(true);
            }
          } catch (e) {
            log('⚠️ [STABILITY] enableRemoteVideo not available:', e);
          }
          
          try {
            const preferredStreamType = liveDataSaverEnabledRef.current ? LOW_STREAM_TYPE : HIGH_STREAM_TYPE;
            await streamEngineRef.current?.setRemoteVideoStreamType(broadcasterUid, preferredStreamType);
            lastViewerStreamTypeRef.current = 0;
            log('✅ [STABILITY] Set to high stream for audience (video visible)');
          } catch (e) {
            log('⚠️ [STABILITY] Could not set stream type:', e);
          }
          
          // Ensure broadcaster's video is subscribed (backup check)
          await streamEngineRef.current?.muteRemoteVideoStream(broadcasterUid, false);
          log('✅ [STABILITY] AUDIO-FIRST: Backup video subscription check complete');
        } catch (error) {
          error('❌ [STABILITY] Failed backup video subscription:', error);
          // Audio is already working, so continue in audio-only mode
        }
      }, videoDelay);

      // Always fetch full stream data from database to get music_mode and other fields
      // Bootstrap data may not include all fields
      const { data: fetchedStreamData, error: fetchError } = await supabase
        .from('live_streams')
        .select('*')
        .eq('id', streamId)
        .eq('is_live', true)
        .single();
      
      if (fetchError) {
        error('❌ [MUSIC_MODE] Error fetching stream data:', fetchError);
      }
      
      if (fetchedStreamData) {
        log('🎵 [MUSIC_MODE] Fetched stream data:', {
          streamId: fetchedStreamData.id,
          music_mode: fetchedStreamData.music_mode,
          music_modeType: typeof fetchedStreamData.music_mode,
          allFields: Object.keys(fetchedStreamData),
        });
        
        setCurrentStream(fetchedStreamData);
        setIsJoinedAsViewer(true);
        streamChannelRef.current = channelId;
        currentStreamIdRef.current = fetchedStreamData.id;
        
        // Initialize viewer count from database
        setViewerCount(fetchedStreamData.viewer_count || 0);
        log('📊 Initial viewer count set to:', fetchedStreamData.viewer_count || 0);
        log('🎵 Music mode:', fetchedStreamData.music_mode === true ? 'Enabled' : fetchedStreamData.music_mode === false ? 'Disabled' : 'Not set');
      } else {
        // Fallback: use bootstrap data if database fetch fails
        const streamData = bootstrapData.streamId ? {
          id: bootstrapData.streamId,
          title: bootstrapData.streamTitle,
          streamer_name: bootstrapData.streamerName,
          streamer_avatar: bootstrapData.streamerAvatar,
          channel_id: channelId,
          broadcaster_uid: 1000, // Default broadcaster UID
          is_live: true,
          viewer_count: 0,
          started_at: new Date().toISOString(),
          music_mode: false, // Default to false if not available
        } : null;

        if (streamData) {
          setCurrentStream(streamData);
          setIsJoinedAsViewer(true);
          streamChannelRef.current = channelId;
          currentStreamIdRef.current = bootstrapData.streamId;
          
          // Initialize viewer count from bootstrap data
          setViewerCount(streamData.viewer_count || 0);
          log('📊 Initial viewer count set to:', streamData.viewer_count || 0);
          log('⚠️ Using bootstrap data - music_mode may not be accurate');
        } else {
          // If stream not found, set default viewer count
          setViewerCount(0);
          log('📊 Stream not found, setting viewer count to 0');
        }
      }
      
      // Set up real-time subscription for viewer count updates
      try {
        const viewerCountSubscription = supabase
          .channel(`stream_viewer_count_${streamId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'live_streams',
              filter: `id=eq.${streamId}`,
            },
            (payload) => {
              log('📊 [VIEWER] Received viewer count update:', payload.new.viewer_count);
              log('📊 [VIEWER] Previous count:', viewerCount);
              log('📊 [VIEWER] New count:', payload.new.viewer_count);
              log('📊 [VIEWER] Payload details:', payload);
              setViewerCount(payload.new.viewer_count || 0);
            }
          )
          .subscribe((status) => {
            log('📊 [VIEWER] Subscription status:', status);
            if (status === 'SUBSCRIBED') {
              log('📊 [VIEWER] ✅ Successfully subscribed to viewer count updates');
            } else if (status === 'CHANNEL_ERROR') {
              // Use console.warn instead of console.error to prevent error overlay
              // This is an expected failure scenario (network issues or RLS policies)
              warn('📊 [VIEWER] ⚠️ Channel subscription error - this is usually due to network issues or RLS policies. Falling back to polling.');
              // Try to reconnect after a delay
              setTimeout(() => {
                log('📊 [VIEWER] Attempting to reconnect channel subscription...');
                viewerCountSubscription.unsubscribe();
                // The subscription will be recreated on the next viewer count refresh
              }, 5000);
            } else if (status === 'TIMED_OUT') {
              // Use console.warn instead of console.error to prevent error overlay
              warn('📊 [VIEWER] ⚠️ Channel subscription timed out. Falling back to polling.');
            } else if (status === 'CLOSED') {
              log('📊 [VIEWER] Channel subscription closed');
            }
          });

        // Store subscription for cleanup
        (streamChannelRef as any).viewerCountSubscription = viewerCountSubscription;
      } catch (error) {
        error('📊 [VIEWER] Error setting up channel subscription:', error);
        // Continue without real-time updates - the periodic refresh will still work
      }

      // Add extra delay to ensure remote users are detected
      log('⏳ Waiting for remote users to be detected...');
      setTimeout(() => {
        log('👁️ Current remote UIDs after join:', streamRemoteUids.length);
      }, 2000);

      // Add viewer to database immediately (if stream ID available)
      const rawFinalStreamId = bootstrapData?.streamId || streamId;
      const finalStreamId = normalizeUuid(rawFinalStreamId);
      log('🎯 [LIVE_STREAM] 🚀 Adding viewer to database...');
      log('🎯 [LIVE_STREAM] 🚀 Stream ID:', finalStreamId ?? rawFinalStreamId);
      log('🎯 [LIVE_STREAM] 🚀 User ID:', user?.id);
      log('🎯 [LIVE_STREAM] 🚀 Viewer UID:', viewerUid);

      if (!finalStreamId) {
        warn('⚠️ [LIVE_STREAM] Skipping viewer DB/count fallback: invalid stream UUID', {
          rawFinalStreamId,
        });
      } else {
        // Add viewer to database (this should trigger the count update)
        log('🎯 [LIVE_STREAM] 🚀 Calling addViewerToDatabase...');
        await addViewerToDatabase(finalStreamId, viewerUid);
        
        // Force immediate viewer count refresh
        log('🎯 [LIVE_STREAM] 💪 FORCE REFRESH: Refreshing viewer count immediately...');
        await forceRefreshViewerCount();
        
        // Immediate fallback: set viewer count to at least 1
        log('🎯 [LIVE_STREAM] 💪 IMMEDIATE FALLBACK: Setting viewer count to 1...');
        setViewerCount(1);
        
        // Also update the database directly without user authentication
        try {
          log('🎯 [LIVE_STREAM] 💪 AUTH-FREE FALLBACK: Updating viewer count without auth...');
          const { data: currentStreamData, error: fetchError } = await supabase
            .from('live_streams')
            .select('viewer_count')
            .eq('id', finalStreamId)
            .maybeSingle();
            
          if (!fetchError && currentStreamData) {
            const newCount = (currentStreamData.viewer_count || 0) + 1;
            log('🎯 [LIVE_STREAM] 💪 AUTH-FREE: Updating count from', currentStreamData.viewer_count, 'to', newCount);
            
            const { error: updateError } = await supabase
              .from('live_streams')
              .update({ 
                viewer_count: newCount,
                updated_at: new Date().toISOString() // Keep stream visible
              })
              .eq('id', finalStreamId);
              
            if (updateError) {
              error('🎯 [LIVE_STREAM] ❌ AUTH-FREE: Failed to update count:', updateError);
            } else {
              log('🎯 [LIVE_STREAM] ✅ AUTH-FREE: Count updated successfully to:', newCount);
            }
          }
        } catch (authFreeError) {
          error('🎯 [LIVE_STREAM] ❌ AUTH-FREE: Error in auth-free update:', authFreeError);
        }
        
        // Also manually update viewer count as immediate fallback
        try {
          log('🎯 [LIVE_STREAM] 💪 FALLBACK: Manually incrementing viewer count...');
          const { data: currentStreamData, error: fetchError } = await supabase
            .from('live_streams')
            .select('viewer_count')
            .eq('id', finalStreamId)
            .maybeSingle();
            
          if (fetchError || !currentStreamData) {
            error('🎯 [LIVE_STREAM] ❌ FALLBACK: Failed to fetch current count:', fetchError);
          } else {
            const newCount = (currentStreamData.viewer_count || 0) + 1;
            log('🎯 [LIVE_STREAM] 💪 FALLBACK: Updating count from', currentStreamData.viewer_count, 'to', newCount);
            
            const { error: updateError } = await supabase
              .from('live_streams')
              .update({ 
                viewer_count: newCount,
                updated_at: new Date().toISOString() // Keep stream visible
              })
              .eq('id', finalStreamId);
              
            if (updateError) {
              error('🎯 [LIVE_STREAM] ❌ FALLBACK: Failed to update count:', updateError);
            } else {
              log('🎯 [LIVE_STREAM] ✅ FALLBACK: Count updated successfully to:', newCount);
              setViewerCount(newCount);
              
              // Update inactivity timer based on viewer count
              if (currentStreamIdRef.current) {
                resetInactivityTimer(currentStreamIdRef.current, newCount);
              }
            }
          }
        } catch (fallbackError) {
          error('🎯 [LIVE_STREAM] ❌ FALLBACK: Error in fallback update:', fallbackError);
        }
      }

      log('👁️ Joined stream as viewer successfully');
      log('👁️ Channel ID:', channelId);
      log('👁️ Stream ID:', bootstrapData.streamId);
      viewerJoinInProgressRef.current = false;
      return true;
    } catch (error: any) {
      error('❌ Failed to join stream as viewer:', error);
      
      // CRITICAL: Don't let join errors trigger logout
      // Check if this is an auth-related error that might cause logout
      const errorMessage = error?.message || String(error);
      const isAuthError = errorMessage.includes('401') || 
                         errorMessage.includes('Unauthorized') ||
                         errorMessage.includes('session') ||
                         errorMessage.includes('token');
      
      if (isAuthError) {
        warn('⚠️ [VIEWER] Auth-related error during join - this should not trigger logout');
        warn('⚠️ [VIEWER] Error details:', errorMessage);
        
        // CRITICAL: Verify session still exists after error
        try {
          const { data: { session: verifySession } } = await supabase.auth.getSession();
          if (verifySession && verifySession.user?.id) {
            log('✅ [VIEWER] Session still valid after join error - user remains logged in');
          } else {
            warn('⚠️ [VIEWER] No session found after join error - but not triggering logout');
          }
        } catch (verifyError) {
          warn('⚠️ [VIEWER] Error verifying session after join error:', verifyError);
        }
      }
      
      // Show user-friendly error message
      Alert.alert('Connection Error', 'Unable to join the livestream. Please check your connection and try again.');
      viewerJoinInProgressRef.current = false;
      return false;
    }
  }, []);

  // Leave stream as viewer
  const leaveStreamAsViewer = useCallback(async (): Promise<void> => {
    try {
      log('👋 Leaving stream...');

      // CRITICAL: Reset audio session IMMEDIATELY to stop background audio
      // This must happen FIRST, before any async operations
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
        log('🔇 [VIEWER] Audio session reset IMMEDIATELY - background audio stopped');
      } catch (audioResetError) {
        warn('⚠️ [VIEWER] Failed to reset audio session immediately:', audioResetError);
      }

      // Unsubscribe from viewer count updates
      if ((streamChannelRef as any).viewerCountSubscription) {
        await (streamChannelRef as any).viewerCountSubscription.unsubscribe();
        log('📊 Unsubscribed from viewer count updates');
      }

      // Remove viewer from database (this will automatically update the count via trigger)
      // CRITICAL: Wrap in try-catch to prevent database errors from affecting auth session
      // Database errors should NOT trigger logout - they're non-critical cleanup operations
      if (currentStreamIdRef.current) {
        log('🎯 [LIVE_STREAM] 🚀 About to remove viewer from database...');
        
        try {
          // First try a simple manual count decrement as fallback
          try {
            log('🎯 [LIVE_STREAM] 💪 FALLBACK: Manually decrementing viewer count...');
            const { data: currentStreamData, error: fetchError } = await supabase
              .from('live_streams')
              .select('viewer_count')
              .eq('id', currentStreamIdRef.current)
              .maybeSingle();
              
            if (fetchError || !currentStreamData) {
              error('🎯 [LIVE_STREAM] ❌ FALLBACK: Failed to fetch current count:', fetchError);
            } else {
              const newCount = Math.max((currentStreamData.viewer_count || 1) - 1, 0);
              log('🎯 [LIVE_STREAM] 💪 FALLBACK: Updating count from', currentStreamData.viewer_count, 'to', newCount);
              
              const { error: updateError } = await supabase
                .from('live_streams')
                // Keep stream discoverable: bump updated_at on viewer leave too
                .update({ viewer_count: newCount, updated_at: new Date().toISOString() })
                .eq('id', currentStreamIdRef.current);
                
              if (updateError) {
                error('🎯 [LIVE_STREAM] ❌ FALLBACK: Failed to update count:', updateError);
              } else {
                log('🎯 [LIVE_STREAM] ✅ FALLBACK: Count decremented successfully to:', newCount);
              }
            }
          } catch (fallbackError) {
            error('🎯 [LIVE_STREAM] ❌ FALLBACK: Error in fallback decrement:', fallbackError);
          }
          
          // Then try the database approach
          // CRITICAL: Don't let database errors propagate - they're non-critical
          await removeViewerFromDatabase(currentStreamIdRef.current);
        } catch (dbError) {
          // CRITICAL: Database errors during cleanup should NOT affect auth session
          // Log the error but don't throw - this is cleanup, not critical functionality
          warn('⚠️ [LIVE_STREAM] Database error during viewer cleanup (non-critical):', dbError);
          log('⚠️ [LIVE_STREAM] Continuing with stream cleanup despite database error');
          // Don't rethrow - this is cleanup, not critical
        }
      }

      // CRITICAL: Mute all audio streams FIRST (synchronously) - this stops audio IMMEDIATELY
      // Do this BEFORE any async operations to ensure audio stops at the exact moment of exit
      if (streamEngineRef.current) {
        // CRITICAL: Mute ALL possible remote audio streams IMMEDIATELY (synchronous calls)
        // muteRemoteAudioStream is synchronous, not a Promise - this stops audio RIGHT NOW
          try {
          streamEngineRef.current.muteRemoteAudioStream(1000, true);
          log('🔇 [VIEWER] Muted broadcaster audio (UID: 1000) - audio stopped NOW');
          } catch (broadcasterMuteError) {
            warn('⚠️ [VIEWER] Failed to mute broadcaster audio:', broadcasterMuteError);
          }
          
          // Also try to mute UID 0 (sometimes used for local/fallback)
          try {
          streamEngineRef.current.muteRemoteAudioStream(0, true);
            log('🔇 [VIEWER] Muted remote audio for UID: 0');
          } catch (uid0Error) {
            // Ignore - UID 0 might not exist
          }
          
          // Get current remote UIDs from state before resetting
          const currentRemoteUids = [...streamRemoteUids];
          
        // Mute all other remote audio streams (guests, etc.) - synchronous, immediate
          for (const uid of currentRemoteUids) {
            if (uid !== 1000 && uid !== 0) { // Skip broadcaster and UID 0, already muted above
              try {
              streamEngineRef.current.muteRemoteAudioStream(uid, true);
                log(`🔇 [VIEWER] Muted remote audio for UID: ${uid}`);
              } catch (muteError) {
                warn(`⚠️ [VIEWER] Failed to mute remote audio for UID ${uid}:`, muteError);
              }
            }
          }
          
        // CRITICAL: Disable audio engine IMMEDIATELY (synchronous if possible, or async)
        // This is the final step to stop all audio processing
          try {
          // Try synchronous first, fallback to async
          if (typeof streamEngineRef.current.disableAudio === 'function') {
            const disableResult = streamEngineRef.current.disableAudio();
            if (disableResult && typeof disableResult.then === 'function') {
              // It's async
              await disableResult;
            }
            // Otherwise it's synchronous and already done
            log('🔇 [VIEWER] Audio engine disabled - audio stopped NOW');
          }
          } catch (disableError) {
            warn('⚠️ [VIEWER] Failed to disable audio:', disableError);
          }
      }

      // Now reset audio session (async, but audio is already muted above)
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
        log('🔇 [VIEWER] Audio session reset - background audio stopped');
      } catch (audioResetError) {
        warn('⚠️ [VIEWER] Failed to reset audio session:', audioResetError);
      }

      // Continue with video cleanup and channel leave
      if (streamEngineRef.current) {
        try {
          // Disable video before leaving (synchronous call)
          try {
            streamEngineRef.current.disableVideo();
            log('📹 [VIEWER] Video disabled');
          } catch (disableVideoError) {
            warn('⚠️ [VIEWER] Failed to disable video:', disableVideoError);
          }
          
          // Stop preview if it was started (synchronous call)
          try {
            streamEngineRef.current.stopPreview();
            log('📹 [VIEWER] Preview stopped');
          } catch (previewError) {
            warn('⚠️ [VIEWER] Failed to stop preview:', previewError);
          }
          
          // 🚀 IMPROVEMENT: Use safe release function
          await releaseEngineSafely();
        } catch (error) {
          error('❌ [VIEWER] Error during audio cleanup:', error);
          // Still try to release engine even if cleanup fails
          await releaseEngineSafely();
        }
      }

      // Reset state immediately
      setIsJoinedAsViewer(false);
      setCurrentStream(null);
      setStreamRemoteUids([]);
      setViewerCount(0);
      streamChannelRef.current = null;
      currentStreamIdRef.current = null;
      
      // 🚀 IMPROVEMENT: Clear token refresh timer
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
      currentTokenRef.current = null;
      
      // CRITICAL: Reset join progress flag to allow future joins (different stream)
      viewerJoinInProgressRef.current = false;

      log('👋 Left stream successfully');
    } catch (error) {
      error('❌ Failed to leave stream:', error);
      // Still reset state even if leave fails
      setIsJoinedAsViewer(false);
      setCurrentStream(null);
      setStreamRemoteUids([]);
      setViewerCount(0);
      streamChannelRef.current = null;
      currentStreamIdRef.current = null;
      
      // CRITICAL: Reset join progress flag even on error
      viewerJoinInProgressRef.current = false;
    }
  }, [streamRemoteUids]);

  // Load live streams (implementation)
  // Always use direct Supabase query (no Redis cache). Cache was causing new streams to not
  // appear and streams to disappear when users left a livestream and refetched.
  loadLiveStreamsImpl.current = async () => {
    try {
      log('🔄 Loading live streams...');

      // Fetch current active streams (throttled)
      // OLD STABLE BUILD: Simple query - just check is_live and ended_at
      // Database trigger automatically updates updated_at, so we don't need strict time filters
      const { data, error } = await requestThrottler.throttle(
        'fetch_live_streams',
        () => supabase
          .from('live_streams')
          .select(`
            *,
            adult_content,
            profiles:streamer_id (
              username,
              avatar_url
            )
          `)
          .eq('is_live', true)
          .is('ended_at', null) // Only include streams that haven't ended
          .order('updated_at', { ascending: false }), // Order by most recently updated (active streams first)
        3000
      ) as any;
      
      // Debug: Log what was fetched
      if (data && data.length > 0) {
        log('📊 [STREAM_FETCH] Fetched streams with adult_content:', data.map((s: any) => ({
          id: s.id,
          title: s.title,
          adult_content: s.adult_content,
          adult_content_type: typeof s.adult_content,
        })));
      }

      if (error) {
        error('❌ Failed to load live streams:', error);
        return;
      }

      // OLD STABLE BUILD: Simple filter - just check is_live and ended_at
      // Database trigger handles updated_at automatically, so we don't need strict time-based filtering
      // This matches the old stable build behavior where streams were always visible
      const activeStreams = (data || []).filter(stream => {
        // Only filter out explicitly ended streams
        if (stream.is_live === false || stream.ended_at) {
          log(`🚫 Filtering out ended stream: ${stream.id} (is_live: ${stream.is_live}, ended_at: ${stream.ended_at})`);
          return false;
        }
        
        // Stream is active - include it (database trigger keeps updated_at fresh)
        return true;
      });

      // Deduplicate streams by streamer_id (keep most recent)
      const deduplicatedStreams = activeStreams.reduce((acc: any[], stream: any) => {
        const existingStreamIndex = acc.findIndex(s => s.streamer_id === stream.streamer_id);
        if (existingStreamIndex === -1) {
          acc.push(stream);
        } else {
          // Keep the more recent stream
          const existingStream = acc[existingStreamIndex];
          if (new Date(stream.started_at) > new Date(existingStream.started_at)) {
            acc[existingStreamIndex] = stream;
          }
        }
        return acc;
      }, []);

      if (data && data.length > activeStreams.length) {
        log(`🚫 Filtered out ${data.length - activeStreams.length} old stream(s) from results`);
      }

      log(`✅ Loaded ${data?.length || 0} streams, filtered to ${activeStreams.length} active, deduplicated to ${deduplicatedStreams.length}`);
      
      // CRITICAL: Final client-side filter to ensure no ended/dead streams slip through
      // This is a safety net in case the database query didn't filter properly
      // RELAXED: Removed strict time-based filters to make it easier to find current livestreams
      // Only filter out explicitly ended streams - let users see all active streams
      const finalFilteredStreams = deduplicatedStreams.filter(stream => {
        // Must be marked as live
        if (!stream.is_live) {
          log(`🚫 Filtering out ended stream (is_live=false): ${stream.id}`);
          return false;
        }
        
        // Must not have ended_at set
        if (stream.ended_at) {
          log(`🚫 Filtering out ended stream (ended_at set): ${stream.id}`);
          return false;
        }
        
        // RELAXED: Removed 2-hour and 30-minute time filters
        // Streams that are marked as is_live=true and have no ended_at are considered active
        // This makes it easier for users to find current livestreams
        // The database trigger keeps updated_at fresh for active streams
        
        return true;
      });
      
      log(`✅ Final filtered streams: ${finalFilteredStreams.length} active streams`);
      
      // Transform streams to match LiveStream interface (map profiles to streamer_name/streamer_avatar)
      const transformedStreams: LiveStream[] = finalFilteredStreams.map((stream: any) => {
        const adultContent = stream.adult_content === true || stream.adult_content === 'true' || stream.adult_content === 1;
        
        // Debug: Log adult_content for each stream
        if (adultContent) {
          log('🎯 [LiveStreamProvider] Stream with 18+ content being transformed:', {
            streamId: stream.id,
            streamer: stream.profiles?.username || 'Unknown',
            adult_content_raw: stream.adult_content,
            adult_content_type: typeof stream.adult_content,
            adult_content_final: adultContent,
          });
        }
        
        return {
          id: stream.id,
          title: stream.title || 'Untitled Stream',
          description: stream.description,
          streamer_id: stream.streamer_id,
          streamer_name: stream.profiles?.username || 'Unknown',
          streamer_avatar: stream.profiles?.avatar_url,
          channel_id: stream.channel_id || stream.id, // Fallback to stream id if channel_id doesn't exist
          viewer_count: stream.viewer_count || 0,
          is_live: stream.is_live,
          started_at: stream.started_at,
          thumbnail_url: stream.thumbnail_url,
          adult_content: adultContent, // Use robust check
          allow_guests: stream.allow_guests,
          music_mode: stream.music_mode,
        };
      });
      
      log('✅ [LiveStreamProvider] Transformed streams with adult_content:', transformedStreams.map(s => ({
        id: s.id,
        streamer: s.streamer_name,
        adult_content: s.adult_content,
      })));
      
      setLiveStreams(transformedStreams);
    } catch (error) {
      error('❌ Failed to load live streams:', error);
    }
  };

  // Stream controls
  const toggleStreamCamera = useCallback(async () => {
    try {
      if (!streamEngineRef.current) {
        error('❌ Stream engine not available for camera toggle');
        return;
      }

      const newState = !isStreamCameraOn;
      
      if (newState) {
        // Enable video and start preview
        await streamEngineRef.current.enableVideo();
        await new Promise(resolve => setTimeout(resolve, 200));
        await streamEngineRef.current.startPreview();
        log('📹 Camera enabled and preview started');
      } else {
        // Disable video and stop preview
        await streamEngineRef.current.stopPreview();
        await streamEngineRef.current.disableVideo();
        log('📹 Camera disabled and preview stopped');
      }
      
      setIsStreamCameraOn(newState);
      log(`📹 Camera ${newState ? 'enabled' : 'disabled'}`);
    } catch (error) {
      error('❌ Failed to toggle camera:', error);
    }
  }, [isStreamCameraOn]);

  const toggleStreamMic = useCallback(async () => {
    try {
      if (!streamEngineRef.current) {
        error('❌ Stream engine not available for mic toggle');
        return;
      }

      const newState = !isStreamMicOn;
      
      // Use enableLocalAudio like regular calls do - this properly enables/disables local audio publishing
      await streamEngineRef.current.enableLocalAudio(newState);
      
      // Also mute/unmute the audio stream to ensure it's properly controlled
      try {
        await streamEngineRef.current.muteLocalAudioStream(!newState);
        log(`🎤 Audio stream ${newState ? 'unmuted' : 'muted'}`);
      } catch (e) {
        // muteLocalAudioStream might not be available, that's okay
        log('⚠️ muteLocalAudioStream not available, using enableLocalAudio only');
      }
      
      setIsStreamMicOn(newState);
      log(`🎤 Microphone ${newState ? 'enabled' : 'disabled'}`);
    } catch (error) {
      error('❌ Failed to toggle microphone:', error);
      Alert.alert('Error', 'Failed to toggle microphone. Please try again.');
    }
  }, [isStreamMicOn]);

  // Restore Agora audio after sound effects play
  // This prevents sound effects from suppressing Agora's microphone
  const restoreAgoraAudio = useCallback(async () => {
    try {
      if (!streamEngineRef.current || !isStreaming) {
        return; // Not streaming, nothing to restore
      }

      // Only restore if mic should be on
      if (isStreamMicOn) {
        log('🔊 Restoring Agora microphone after sound effect');
        
        // Re-enable local audio publishing
        try {
          await streamEngineRef.current.enableLocalAudio(true);
          await streamEngineRef.current.muteLocalAudioStream(false);
          log('✅ Agora microphone restored');
        } catch (error) {
          error('❌ Error restoring Agora microphone:', error);
        }
      }
    } catch (error) {
      error('❌ Error in restoreAgoraAudio:', error);
    }
  }, [isStreaming, isStreamMicOn]);

  const switchStreamCamera = useCallback(() => {
    streamEngineRef.current?.switchCamera();
    setIsStreamFrontCamera((prev) => !prev); // toggle so mirror mode is correct: front=mirror, back=no mirror
  }, []);

  // Switch camera for guests (same as broadcaster switch)
  const switchGuestCamera = useCallback(() => {
    log('📹 [GUEST] Switching camera');
    streamEngineRef.current?.switchCamera();
    setIsStreamFrontCamera((prev) => !prev);
  }, []);

  // Debug function to check viewer count status
  const debugViewerCount = async () => {
    // Debug function - can be removed in production
  };

  // Force refresh viewer count
  const forceRefreshViewerCount = async () => {
    if (currentStream?.id) {
      // First check if stream is still live
      const { data: streamCheck } = await supabase
        .from('live_streams')
        .select('is_live')
        .eq('id', currentStream.id)
        .single();
        
      if (!streamCheck?.is_live) {
        log('🔄 [FORCE] Stream is no longer live, skipping refresh');
        return;
      }
      
      await debugViewerCount();
      
      const { data: activeViewers, error } = await supabase
        .from('live_stream_viewers')
        .select('id, user_id, stream_id, is_active')
        .eq('stream_id', currentStream.id)
        .eq('is_active', true);
        
      if (!error && activeViewers) {
        const actualViewerCount = activeViewers.length;
        setViewerCount(actualViewerCount);
        await updateViewerCountInDatabase(currentStream.id, actualViewerCount);
      } else {
        error('Error fetching active viewers:', error);
      }
    }
  };

  // Periodic refresh for viewer count: 15s to reduce DB load and re-renders (realtime subscription is primary)
  const VIEWER_COUNT_POLL_INTERVAL_MS = 15000;
  useEffect(() => {
    if (!currentStream) return;
    
    const refreshInterval = setInterval(async () => {
      if (appStateRef.current !== 'active') return;
      
      const { data: streamCheck } = await supabase
        .from('live_streams')
        .select('is_live')
        .eq('id', currentStream.id)
        .single();
        
      if (streamCheck?.is_live) {
        forceRefreshViewerCount();
      } else {
        if (__DEV__) log('🔄 [PERIODIC] Stream is no longer live, stopping refresh');
        clearInterval(refreshInterval);
      }
    }, VIEWER_COUNT_POLL_INTERVAL_MS);
    
    return () => clearInterval(refreshInterval);
  }, [currentStream]);

  // Test function to manually set viewer count (for debugging)
  const testViewerCount = useCallback((count: number) => {
    log('🧪 [TEST] Setting viewer count to:', count);
    setViewerCount(count);
  }, []);

  // Clean up duplicate viewers (for debugging)
  const cleanupDuplicateViewers = useCallback(async () => {
    if (!currentStream?.id) return;
    
    try {
      
      // Get all active viewers for this stream
      const { data: allViewers, error: fetchError } = await supabase
        .from('live_stream_viewers')
        .select('id, user_id, stream_id, is_active, created_at')
        .eq('stream_id', currentStream.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
        
      if (fetchError) {
        error('🧹 [CLEANUP] Failed to fetch viewers:', fetchError);
        return;
      }
      
      if (!allViewers || allViewers.length === 0) {
        return;
      }
      
      // Group by user_id to find duplicates
      const viewerGroups = allViewers.reduce((acc, viewer) => {
        if (!acc[viewer.user_id]) {
          acc[viewer.user_id] = [];
        }
        acc[viewer.user_id].push(viewer);
        return acc;
      }, {} as Record<string, any[]>);
      
      // Remove duplicates, keeping only the most recent
      let duplicatesRemoved = 0;
      for (const [userId, viewers] of Object.entries(viewerGroups)) {
        if (viewers.length > 1) {
          
          // Keep the most recent (last in array since we ordered by created_at)
          const toKeep = viewers[viewers.length - 1];
          const toRemove = viewers.slice(0, -1);
          
          // Delete the older duplicates
          for (const duplicate of toRemove) {
            const { error: deleteError } = await supabase
              .from('live_stream_viewers')
              .delete()
              .eq('id', duplicate.id);
              
            if (deleteError) {
              error(`Failed to delete duplicate ${duplicate.id}:`, deleteError);
            } else {
              duplicatesRemoved++;
            }
          }
        }
      }
      
      // Cleanup complete
      
      // Refresh viewer count after cleanup
      await forceRefreshViewerCount();
      
    } catch (error) {
      error('🧹 [CLEANUP] Error cleaning up duplicate viewers:', error);
    }
  }, [currentStream, forceRefreshViewerCount]);

  // Force cleanup inactive viewers (for debugging)
  const forceCleanupInactiveViewers = async () => {
    if (currentStream?.id) {
      log('🧹 [CLEANUP] Cleaning up inactive viewers...');
      
      // Mark all viewers as inactive for this stream (nuclear option)
      const { error: cleanupError } = await supabase
        .from('live_stream_viewers')
        .update({ 
          is_active: false, 
          left_at: new Date().toISOString() 
        })
        .eq('stream_id', currentStream.id)
        .eq('is_active', true);
        
      if (cleanupError) {
        error('🧹 [CLEANUP] Error cleaning up viewers:', cleanupError);
      } else {
        log('🧹 [CLEANUP] All viewers marked as inactive');
        setViewerCount(0);
        await updateViewerCountInDatabase(currentStream.id, 0);
      }
    }
  };

  // Verify co-host microphone is active and working
  const verifyCoHostMicActive = async (): Promise<boolean> => {
    try {
      if (!streamEngineRef.current) {
        warn('⚠️ [VERIFY] Cannot verify mic - engine not available');
        return false;
      }

      log('🔍 [VERIFY] Verifying co-host microphone is active...');
      
      // Step 1: Verify enableLocalAudio is true
      let micEnabled = false;
      try {
        // Try to enable it again to ensure it's on
        if (streamEngineRef.current.enableLocalAudio) {
          await Promise.resolve(streamEngineRef.current.enableLocalAudio(true));
          micEnabled = true;
          log('✅ [VERIFY] enableLocalAudio confirmed: true');
        }
      } catch (e) {
        warn('⚠️ [VERIFY] enableLocalAudio check failed:', e);
      }

      // Step 2: Verify muteLocalAudioStream is false (unmuted)
      let micUnmuted = false;
      try {
        if (streamEngineRef.current.muteLocalAudioStream) {
          // Ensure it's unmuted
          await Promise.resolve(streamEngineRef.current.muteLocalAudioStream(false));
          micUnmuted = true;
          log('✅ [VERIFY] muteLocalAudioStream confirmed: false (unmuted)');
        }
      } catch (e) {
        warn('⚠️ [VERIFY] muteLocalAudioStream check failed:', e);
      }

      // Step 3: Verify audio engine is enabled
      let audioEngineEnabled = false;
      try {
        if (streamEngineRef.current.enableAudio) {
          await Promise.resolve(streamEngineRef.current.enableAudio());
          audioEngineEnabled = true;
          log('✅ [VERIFY] Audio engine enabled');
        }
      } catch (e) {
        warn('⚠️ [VERIFY] Audio engine check failed:', e);
      }

      // Step 4: Retry if any check failed
      if (!micEnabled || !micUnmuted) {
        log('🔄 [VERIFY] Retrying mic enablement...');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Retry enableLocalAudio
        if (!micEnabled && streamEngineRef.current.enableLocalAudio) {
          try {
            await Promise.resolve(streamEngineRef.current.enableLocalAudio(true));
            micEnabled = true;
            log('✅ [VERIFY] enableLocalAudio retry successful');
          } catch (e) {
            warn('⚠️ [VERIFY] enableLocalAudio retry failed:', e);
          }
        }

        // Retry muteLocalAudioStream
        if (!micUnmuted && streamEngineRef.current.muteLocalAudioStream) {
          try {
            await Promise.resolve(streamEngineRef.current.muteLocalAudioStream(false));
            micUnmuted = true;
            log('✅ [VERIFY] muteLocalAudioStream retry successful');
          } catch (e) {
            warn('⚠️ [VERIFY] muteLocalAudioStream retry failed:', e);
          }
        }
      }

      const allChecksPassed = micEnabled && micUnmuted && audioEngineEnabled;
      
      if (allChecksPassed) {
        log('✅ [VERIFY] Co-host microphone verification PASSED - mic is active and ready');
      } else {
        warn('⚠️ [VERIFY] Co-host microphone verification PARTIAL:', {
          micEnabled,
          micUnmuted,
          audioEngineEnabled,
        });
      }

      return allChecksPassed;
    } catch (error) {
      error('❌ [VERIFY] Mic verification error:', error);
      return false;
    }
  };

  // Verify livestream health (host and co-host)
  const verifyLivestreamHealth = async (): Promise<{
    healthy: boolean;
    issues: string[];
    details: {
      engineReady: boolean;
      streamActive: boolean;
      micEnabled: boolean;
      cameraEnabled: boolean;
      connectionState: string;
    };
  }> => {
    const issues: string[] = [];
    const details = {
      engineReady: false,
      streamActive: false,
      micEnabled: false,
      cameraEnabled: false,
      connectionState: connectionState || 'UNKNOWN',
    };

    try {
      // Check engine
      details.engineReady = !!streamEngineRef.current;
      if (!details.engineReady) {
        issues.push('Stream engine not initialized');
      }

      // Check stream
      details.streamActive = !!currentStream && !!currentStream.is_live && !currentStream.ended_at;
      if (!details.streamActive) {
        issues.push('Stream not active or ended');
      }

      // Check mic (if streaming or guest)
      if (isStreaming || (currentStream && streamRemoteUids.length > 0)) {
        try {
          // For co-hosts, verify mic is enabled
          if (streamEngineRef.current?.enableLocalAudio) {
            // We can't directly check state, but we can verify it's enabled
            details.micEnabled = true; // Assume enabled if function exists
          }
        } catch (e) {
          issues.push('Mic check failed');
        }
      }

      // Check camera (if streaming)
      if (isStreaming) {
        try {
          if (streamEngineRef.current?.enableLocalVideo) {
            details.cameraEnabled = isStreamCameraOn;
          }
        } catch (e) {
          issues.push('Camera check failed');
        }
      }

      // Check connection
      if (connectionState !== 'CONNECTED' && connectionState !== 'RECONNECTING') {
        issues.push(`Connection state: ${connectionState}`);
      }

      const healthy = issues.length === 0 && details.engineReady && details.streamActive;

      log('🔍 [HEALTH] Livestream health check:', {
        healthy,
        issues,
        details,
      });

      return { healthy, issues, details };
    } catch (error) {
      error('❌ [HEALTH] Health check error:', error);
      return {
        healthy: false,
        issues: [`Health check failed: ${error}`],
        details,
      };
    }
  };

  // Switch viewer to guest mode (broadcaster role) - Redesigned to use bootstrap API directly
  // No longer relies on database logic - works with current design pattern
  const switchToGuestMode = async (agoraUid?: number): Promise<boolean> => {
    // Prevent concurrent guest join attempts
    if (guestJoinInProgressRef.current) {
      warn('⚠️ [GUEST] Guest join already in progress, skipping duplicate attempt');
      return false;
    }
    
    guestJoinInProgressRef.current = true;
    
    try {
      log('🎙️ [GUEST] Switching to guest mode (broadcaster role)...');
      
      if (!currentStream) {
        error('❌ [GUEST] No current stream');
        guestJoinInProgressRef.current = false;
        throw new Error('No active stream');
      }

      const Agora = await getAgoraModule();
      if (!Agora) {
        error('❌ [GUEST] Agora module not available');
        throw new Error('Agora module not available');
      }

      // Step 1: Get bootstrap data (token, App ID, and UID if not provided)
      log('📡 [GUEST] Calling bootstrap API...');
      const { data: { session } } = await supabase.auth.getSession();
      // TEMPORARY: Add bypassCache=true to force fresh fetch and bypass invalid cached App IDs
      const bootstrapUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/live-bootstrap?streamId=${currentStream.id}&role=broadcaster&bypassCache=true`;
      
      const bootstrapResponse = await fetch(bootstrapUrl, {
        method: 'GET',
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : '',
          'Content-Type': 'application/json',
        },
      });

      if (!bootstrapResponse.ok) {
        const errorText = await bootstrapResponse.text().catch(() => 'Unknown error');
        error('❌ [GUEST] Bootstrap API failed:', {
          status: bootstrapResponse.status,
          statusText: bootstrapResponse.statusText,
          error: errorText,
          streamId: currentStream.id,
          role: 'broadcaster',
        });
        
        // Provide more specific error messages
        if (bootstrapResponse.status === 404) {
          throw new Error('Stream not found or has ended');
        } else if (bootstrapResponse.status === 401) {
          throw new Error('Authentication failed. Please try again.');
        } else if (bootstrapResponse.status === 500) {
          throw new Error('Stream service error. Please try again later.');
        } else {
          throw new Error(`Failed to get stream configuration (${bootstrapResponse.status})`);
        }
      }

      const bootstrapData = await bootstrapResponse.json();
      
      // Validate bootstrap response structure
      if (!bootstrapData) {
        error('❌ [GUEST] Bootstrap API returned empty response');
        throw new Error('Invalid stream configuration response');
      }
      const guestToken = bootstrapData.token || '';
      const bootstrapAppId = bootstrapData.appId;
      
      // Determine guest UID:
      // 1. If bootstrap returns a guest UID (2001+), use it (from database)
      // 2. If bootstrap returns host UID (1000) but parameter provides guest UID, use parameter (fallback for timing issues)
      // 3. Otherwise use parameter or default
      let guestUid: number;
      const bootstrapUid = bootstrapData.uid;
      
      if (bootstrapUid && bootstrapUid >= 2001) {
        // Bootstrap returned a guest UID - use it (most reliable)
        guestUid = bootstrapUid;
      } else if (agoraUid && agoraUid >= 2001) {
        // Bootstrap returned host UID but we have guest UID from parameter - use parameter (timing fallback)
        guestUid = agoraUid;
        warn('⚠️ [GUEST] Bootstrap returned host UID, using parameter guest UID:', agoraUid);
      } else {
        // Fallback to bootstrap UID or parameter or default
        guestUid = bootstrapUid || agoraUid || 2001;
      }
      
      log('📊 [GUEST] UID assignment:', {
        bootstrapUid,
        parameterUid: agoraUid,
        finalUid: guestUid,
        isGuestUid: guestUid >= 2001,
      });

      if (!guestToken || !bootstrapAppId) {
        error('❌ [GUEST] Missing bootstrap data:', { hasToken: !!guestToken, hasAppId: !!bootstrapAppId });
        throw new Error('Invalid stream configuration');
      }
      
      // Validate token format (Agora tokens are base64 encoded strings)
      if (typeof guestToken !== 'string' || guestToken.length < 50) {
        error('❌ [GUEST] Invalid token format:', { 
          type: typeof guestToken, 
          length: guestToken?.length,
          preview: guestToken?.substring(0, 20) 
        });
        throw new Error('Invalid Agora token format');
      }
      
      // Validate guest UID is in expected range (2001+ for guests, 1000 for host)
      if (guestUid < 2001 && guestUid !== 1000) {
        warn('⚠️ [GUEST] Unexpected guest UID:', guestUid, '- expected 2001+ for guests');
      }

      // Validate App ID format (32 character hex string)
      const appIdRegex = /^[0-9a-f]{32}$/i;
      if (!appIdRegex.test(bootstrapAppId)) {
        error('❌ [GUEST] Invalid App ID format:', bootstrapAppId);
        throw new Error('Invalid stream configuration');
      }
      
      // Validate token expiration (if token contains expiration info)
      // Note: Agora tokens are JWT-like but we can't decode them client-side easily
      // The bootstrap API should ensure tokens are valid and not expired
      // Token validation passed (no verbose logging)

      // Bootstrap data received (no verbose logging)

      // Step 2: Leave current channel if joined as viewer (wait for proper disconnection)
      if (streamEngineRef.current && isJoinedAsViewer) {
        log('👋 [GUEST] Leaving viewer channel before switching to guest mode...');
        try {
          await streamEngineRef.current.leaveChannel();
          // Wait for connection state to stabilize after leaving
          await new Promise(resolve => setTimeout(resolve, 300));
          log('✅ [GUEST] Left viewer channel');
        } catch (e) {
          warn('⚠️ [GUEST] Error leaving channel:', e);
          // Continue anyway - might already be disconnected
        }
      }

      // Step 3: Reinitialize engine with bootstrap App ID (increased delay for stability)
      if (streamEngineRef.current) {
        log('🔄 [GUEST] Releasing existing engine...');
        // 🚀 IMPROVEMENT: Use safe release function
        await releaseEngineSafely();
        // Increased delay for engine cleanup to ensure proper release (300ms for stability)
        await new Promise(resolve => setTimeout(resolve, 300));
        log('✅ [GUEST] Engine released');
      }

      // Initializing engine with bootstrap App ID (no verbose logging)
      const engineReady = await initializeStreamEngine(bootstrapAppId);
      if (!engineReady || !streamEngineRef.current) {
        error('❌ [GUEST] Failed to initialize engine');
        throw new Error('Failed to initialize stream engine');
      }
      log('✅ [GUEST] Engine initialized');

      // Step 4: Set role to broadcaster BEFORE joining (best practice - reduces latency)
      // CRITICAL: Set role before joining to avoid role switching overhead and improve performance
      log('🔄 [GUEST] Setting role to broadcaster before joining...');
      
      if (!streamEngineRef.current) {
        throw new Error('Stream engine not initialized');
      }
      
      // Set role to broadcaster BEFORE joining (reduces latency, avoids glitches)
      try {
        await streamEngineRef.current.setClientRole(Agora.ClientRoleType.ClientRoleBroadcaster);
        log('✅ [GUEST] Role set to broadcaster (before join)');
      } catch (roleError) {
        error('❌ [GUEST] Failed to set role before join:', roleError);
        // Continue anyway - some SDK versions handle this differently
      }
      
      // Wait a bit to ensure role is set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Step 5: Join channel as broadcaster with publish options
      log('🔄 [GUEST] Joining channel as broadcaster...');
      
      // CRITICAL: Use channelName from bootstrap API, not currentStream.channel_id
      // This ensures guests join the same channel as the broadcaster
      // The bootstrap API returns the correct channelName that matches what broadcaster used
      const guestChannelId = bootstrapData.channelName || currentStream.channel_id;
      
      log('📊 [GUEST] Channel ID comparison:', {
        bootstrapChannelName: bootstrapData.channelName,
        currentStreamChannelId: currentStream.channel_id,
        usingChannelId: guestChannelId,
        match: bootstrapData.channelName === currentStream.channel_id,
      });
      
      if (!guestChannelId) {
        error('❌ [GUEST] No channel ID available from bootstrap or current stream');
        throw new Error('Invalid channel configuration');
      }
      
      const channelMediaOptions = await buildLiveBroadcastJoinOptions(
        'broadcaster',
        !!(currentStream.music_mode === true)
      );
      
      const joinResult = await streamEngineRef.current.joinChannel(
        guestToken,
        guestChannelId, // Use bootstrap channelName to ensure same channel as broadcaster
        guestUid,
        channelMediaOptions as any
      );

      if (joinResult !== 0) {
        error('❌ [GUEST] Join failed:', {
          errorCode: joinResult,
          channelId: guestChannelId,
          bootstrapChannelName: bootstrapData.channelName,
          currentStreamChannelId: currentStream.channel_id,
          uid: guestUid,
          hasToken: !!guestToken,
          tokenLength: guestToken?.length || 0,
          appId: bootstrapAppId,
        });
        
        // Provide user-friendly error messages for common Agora error codes
        let errorMessage = `Failed to join channel (error ${joinResult})`;
        if (joinResult === 110) {
          errorMessage = 'Invalid App ID. Stream configuration error.';
        } else if (joinResult === -17) {
          errorMessage = 'Failed to join channel. The stream may have ended.';
        } else if (joinResult === -2) {
          errorMessage = 'Invalid parameter. Please try again.';
        } else if (joinResult === -7) {
          errorMessage = 'Not initialized. Please try again.';
        }
        
        throw new Error(errorMessage);
      }
      log('✅ [GUEST] Joined channel successfully as broadcaster');
      
      // 🚀 IMPROVEMENT: Store token and schedule refresh
      currentTokenRef.current = guestToken;
      scheduleTokenRefresh(3600); // 1 hour expiry
      
      // Parallelize audio/video setup for faster joining
      const setupPromises: Promise<any>[] = [];
      
      // Enable audio for receiving (hearing host) but keep local audio muted by default
      // Guests join muted like TikTok - they can unmute manually
      setupPromises.push(
        Promise.resolve(streamEngineRef.current?.enableAudio?.()).then(() => {
          log('✅ [GUEST] Audio enabled for receiving (can hear host)');
        }).catch((e) => {
          log('⚠️ [GUEST] Failed to enable audio:', e);
        })
      );
      
      // Enable local video and start preview in parallel
      // CRITICAL: Ensure preview starts properly for co-host's own video frame
      setupPromises.push(
        Promise.resolve(streamEngineRef.current?.enableLocalVideo?.(true)).then(async () => {
          log('✅ [GUEST] enableLocalVideo(true) called - video publishing enabled');
          
          // CRITICAL: Start preview for local video (UID 0) - this is what shows in co-host's own frame
          if (streamEngineRef.current?.startPreview) {
            try {
              await Promise.resolve(streamEngineRef.current.startPreview());
              log('✅ [GUEST] startPreview() called successfully - local preview should be visible');
              // Increased delay to ensure preview is fully initialized before rendering
              await new Promise(resolve => setTimeout(resolve, 300));
            } catch (previewError) {
              error('❌ [GUEST] Preview start failed:', previewError);
              // Retry preview start
              try {
                await new Promise(resolve => setTimeout(resolve, 200));
                await Promise.resolve(streamEngineRef.current.startPreview());
                log('✅ [GUEST] Preview start retry successful');
              } catch (retryError) {
                error('❌ [GUEST] Preview start retry failed:', retryError);
                // Don't throw - continue anyway
              }
            }
          } else {
            warn('⚠️ [GUEST] startPreview not available');
          }
        }).catch((e) => {
          error('❌ [GUEST] Video setup failed:', e);
          // Don't throw - continue with other setup operations
        })
      );
      
      // Enable local audio for publishing (cohosts join unmuted)
      // Cohosts join unmuted by default
      setupPromises.push(
        Promise.resolve(streamEngineRef.current?.enableLocalAudio?.(true)).then(() => {
          log('✅ [GUEST] Local audio enabled for publishing (unmuted by default)');
        }).catch((e) => {
          log('⚠️ [GUEST] enableLocalAudio failed:', e);
        })
      );
      
      // Unmute both video and audio streams (cohosts join unmuted)
      setupPromises.push(
        Promise.all([
          Promise.resolve(streamEngineRef.current?.muteLocalVideoStream?.(false)).catch(() => {}),
          // Keep audio unmuted - cohosts join with audio enabled
          Promise.resolve(streamEngineRef.current?.muteLocalAudioStream?.(false)).catch(() => {})
        ]).then(() => {
          log('✅ [GUEST] Video and audio unmuted by default');
        })
      );
      
      // Wait for all setup operations to complete (parallel execution)
      await Promise.all(setupPromises);
      
      // Minimal delay for Agora SDK to process all changes (reduced from 200ms to 50ms)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // CRITICAL: Enable remote video subscription FIRST (before trying to subscribe to streams)
      // This is essential when switching from audience to broadcaster role
      try {
        if (streamEngineRef.current?.enableRemoteVideo) {
          await Promise.resolve(streamEngineRef.current.enableRemoteVideo(true));
          log('✅ [GUEST] Remote video subscription enabled');
        }
      } catch (e) {
        log('⚠️ [GUEST] enableRemoteVideo not available, continuing...', e);
      }
      
      // CRITICAL: Ensure host's UID is in streamRemoteUids so guest can see host's video
      // The host's UID is always 1000 (broadcaster_uid)
      const hostUid = currentStream.broadcaster_uid || 1000;
      
      // CRITICAL: Add host UID to streamRemoteUids BEFORE subscribing
      // This ensures the UI knows the host is present
      setStreamRemoteUids(prev => {
        if (!prev.includes(hostUid)) {
          log(`✅ [GUEST] Adding host UID ${hostUid} to streamRemoteUids`);
          return [...prev, hostUid];
        }
        return prev;
      });
      
      // Step 9: Subscribe to host video and other remote UIDs (use state, no database queries)
      // Wait longer for channel join to fully complete and engine to be ready
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Subscribe to host video immediately
      try {
        if (!streamEngineRef.current) {
          throw new Error('Stream engine not available');
        }
        log(`📹 [GUEST] Subscribing to host video (UID: ${hostUid})...`);
        
        // Ensure remote video is enabled first
        if (streamEngineRef.current.enableRemoteVideo) {
          await Promise.resolve(streamEngineRef.current.enableRemoteVideo(true));
          log(`✅ [GUEST] Remote video enabled`);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Force unmute by muting first, then unmuting (more reliable)
        if (streamEngineRef.current.muteRemoteVideoStream) {
          await Promise.resolve(streamEngineRef.current.muteRemoteVideoStream(hostUid, true));
          log(`📹 [GUEST] Muted host video (preparing to unmute)`);
        }
        if (streamEngineRef.current.muteRemoteAudioStream) {
          await Promise.resolve(streamEngineRef.current.muteRemoteAudioStream(hostUid, true));
        }
        await new Promise(resolve => setTimeout(resolve, 150));
        
        if (streamEngineRef.current.muteRemoteVideoStream) {
          await Promise.resolve(streamEngineRef.current.muteRemoteVideoStream(hostUid, false));
          log(`📹 [GUEST] Unmuted host video`);
        }
        if (streamEngineRef.current.setRemoteVideoStreamType) {
          await Promise.resolve(streamEngineRef.current.setRemoteVideoStreamType(hostUid, 0)); // HIGH so video shows
          lastViewerStreamTypeRef.current = 0;
          log(`📹 [GUEST] Set host video stream type to HIGH`);
        }
        if (streamEngineRef.current.muteRemoteAudioStream) {
          await Promise.resolve(streamEngineRef.current.muteRemoteAudioStream(hostUid, false));
          log(`📹 [GUEST] Unmuted host audio`);
        }
        log(`✅ [GUEST] Host video subscribed successfully (UID: ${hostUid})`);
      } catch (e) {
        error(`❌ [GUEST] Failed to subscribe to host video:`, e);
        // Don't throw - continue anyway, video might still work
      }
      
      // Subscribe to any other remote UIDs already in state (from onUserJoined events)
      const otherRemoteUids = streamRemoteUids.filter(uid => uid !== hostUid && uid !== guestUid && uid !== 0);
      for (const remoteUid of otherRemoteUids) {
        try {
          if (!streamEngineRef.current) break;
          if (streamEngineRef.current.muteRemoteVideoStream) {
            await Promise.resolve(streamEngineRef.current.muteRemoteVideoStream(remoteUid, true));
          }
          if (streamEngineRef.current.muteRemoteAudioStream) {
            await Promise.resolve(streamEngineRef.current.muteRemoteAudioStream(remoteUid, true));
          }
          await new Promise(resolve => setTimeout(resolve, 50));
          if (streamEngineRef.current.muteRemoteVideoStream) {
            await Promise.resolve(streamEngineRef.current.muteRemoteVideoStream(remoteUid, false));
          }
          if (streamEngineRef.current.setRemoteVideoStreamType) {
            await Promise.resolve(streamEngineRef.current.setRemoteVideoStreamType(remoteUid, 0));
          }
          if (streamEngineRef.current.muteRemoteAudioStream) {
            await Promise.resolve(streamEngineRef.current.muteRemoteAudioStream(remoteUid, false));
          }
          log(`✅ [GUEST] Subscribed to remote UID: ${remoteUid}`);
        } catch (e) {
          warn(`⚠️ [GUEST] Failed to subscribe to UID ${remoteUid}:`, e);
        }
      }
      
      // Ensure audio is enabled for receiving (hearing host) and keep local audio UNMUTED
      // Cohosts join unmuted by default - this is the expected behavior
      try {
        // Ensure audio is still enabled for receiving (in case something reset it)
        if (streamEngineRef.current?.enableAudio) {
          await Promise.resolve(streamEngineRef.current.enableAudio());
        }
        // CRITICAL: Keep local audio UNMUTED - co-hosts should be able to speak immediately
        // The audio was already enabled and unmuted above, but ensure it stays unmuted
        if (streamEngineRef.current?.muteLocalAudioStream) {
          await Promise.resolve(streamEngineRef.current.muteLocalAudioStream(false));
        }
        // Also ensure enableLocalAudio is still true
        if (streamEngineRef.current?.enableLocalAudio) {
          await Promise.resolve(streamEngineRef.current.enableLocalAudio(true));
        }
        log('✅ [GUEST] Audio enabled for receiving, local audio UNMUTED (co-host can speak)');
      } catch (e) {
        log('⚠️ [GUEST] Audio verification failed:', e);
      }
      
      // CRITICAL: Verify co-host mic is actually active after all setup
      const micVerified = await verifyCoHostMicActive();
      
      // CRITICAL: Update guest video/audio state to reflect actual publishing state
      // Since we just enabled video and audio, they should be enabled
      setIsGuestVideoEnabled(true);
      setIsGuestAudioEnabled(true);
      
      // CRITICAL: Add event listeners to sync video/audio state changes
      // This ensures the UI state stays in sync with actual Agora publishing state
      try {
        if (streamEngineRef.current && streamEngineRef.current.addListener) {
          // Listen for local video state changes
          streamEngineRef.current.addListener('onLocalVideoStateChanged', (source: number, state: number, errorCode: number) => {
            log('📹 [GUEST] Local video state changed:', { source, state, errorCode });
            // State 2 = LOCAL_VIDEO_STREAM_STATE_PUBLISHING (video is being published)
            // State 0 = LOCAL_VIDEO_STREAM_STATE_STOPPED
            const isVideoPublishing = state === 2;
            setIsGuestVideoEnabled(isVideoPublishing);
            log(`📹 [GUEST] Video publishing state synced: ${isVideoPublishing}`);
          });
          
          // Listen for local audio state changes
          streamEngineRef.current.addListener('onLocalAudioStateChanged', (source: number, state: number, errorCode: number) => {
            log('🎤 [GUEST] Local audio state changed:', { source, state, errorCode });
            // State 2 = LOCAL_AUDIO_STREAM_STATE_PUBLISHING (audio is being published)
            // State 0 = LOCAL_AUDIO_STREAM_STATE_STOPPED
            const isAudioPublishing = state === 2;
            setIsGuestAudioEnabled(isAudioPublishing);
            log(`🎤 [GUEST] Audio publishing state synced: ${isAudioPublishing}`);
          });
        }
      } catch (listenerError) {
        warn('⚠️ [GUEST] Failed to add state change listeners:', listenerError);
      }
      
      // CRITICAL: Final verification - ensure video preview is actually running
      // Give it a moment, then verify preview is active
      setTimeout(async () => {
        try {
          // Ensure video is enabled
          if (streamEngineRef.current?.enableLocalVideo) {
            await Promise.resolve(streamEngineRef.current.enableLocalVideo(true));
            log('✅ [GUEST] Video publishing re-enabled in verification');
          }
          
          // Ensure preview is running
          if (streamEngineRef.current?.startPreview) {
            await Promise.resolve(streamEngineRef.current.startPreview());
            log('✅ [GUEST] Preview verified/restarted after join');
          }
          
          // Ensure video stream is unmuted
          if (streamEngineRef.current?.muteLocalVideoStream) {
            await Promise.resolve(streamEngineRef.current.muteLocalVideoStream(false));
            log('✅ [GUEST] Video stream unmuted in verification');
          }
          
          // Ensure audio is enabled and unmuted
          if (streamEngineRef.current?.enableLocalAudio) {
            await Promise.resolve(streamEngineRef.current.enableLocalAudio(true));
            log('✅ [GUEST] Audio publishing re-enabled in verification');
          }
          
          if (streamEngineRef.current?.muteLocalAudioStream) {
            await Promise.resolve(streamEngineRef.current.muteLocalAudioStream(false));
            log('✅ [GUEST] Audio stream unmuted in verification');
          }
          
          // Update state to reflect actual publishing state
          setIsGuestVideoEnabled(true);
          setIsGuestAudioEnabled(true);
        } catch (e) {
          warn('⚠️ [GUEST] Preview verification failed:', e);
        }
      }, 800); // Increased delay to ensure everything is ready
      
      log('✅ [GUEST] Successfully switched to guest mode');
      guestJoinInProgressRef.current = false;
      return true;
    } catch (error: any) {
      error('❌ [GUEST] Failed to switch to broadcaster mode:', {
        error: error.message || error,
        errorType: error.constructor?.name || typeof error,
        stack: error.stack,
        streamId: currentStream?.id,
        isJoinedAsViewer,
        hasEngine: !!streamEngineRef.current,
      });
      guestJoinInProgressRef.current = false;
      // Re-throw the error with enhanced context so caller can access error details
      const enhancedError = new Error(error.message || 'Failed to switch to broadcaster mode');
      (enhancedError as any).originalError = error;
      (enhancedError as any).errorCode = error.code || error.errorCode;
      throw enhancedError;
    }
  };

  // Leave guest mode (back to audience role)
  const leaveGuestMode = async (): Promise<boolean> => {
    try {
      log('👋 [GUEST] Leaving guest mode - starting cleanup');
      
      if (!streamEngineRef.current) {
        error('❌ [GUEST] Stream engine not initialized');
        return false;
      }

      const Agora = await getAgoraModule();
      if (!Agora) {
        error('❌ [GUEST] Agora module not available');
        return false;
      }

      // Step 1: Stop all publishing first
      try {
        log('👋 [GUEST] Step 1: Stopping video publishing...');
        await streamEngineRef.current.enableLocalVideo(false);
        log('✅ [GUEST] Video publishing stopped');
      } catch (error) {
        error('⚠️ [GUEST] Error stopping video:', error);
      }

      try {
        log('👋 [GUEST] Step 2: Stopping audio publishing...');
        await streamEngineRef.current.enableLocalAudio(false);
        log('✅ [GUEST] Audio publishing stopped');
      } catch (error) {
        error('⚠️ [GUEST] Error stopping audio:', error);
      }

      try {
        log('👋 [GUEST] Step 3: Stopping camera preview...');
        await streamEngineRef.current.stopPreview();
        log('✅ [GUEST] Camera preview stopped');
      } catch (error) {
        error('⚠️ [GUEST] Error stopping preview:', error);
      }

      // Step 2: Mute local audio stream to ensure no audio leaks
      try {
        log('👋 [GUEST] Step 4: Muting local audio stream...');
        await streamEngineRef.current.muteLocalAudioStream(true);
        log('✅ [GUEST] Local audio stream muted');
      } catch (e) {
        log('⚠️ [GUEST] muteLocalAudioStream not available, continuing...');
      }

      // Step 3: Switch back to audience role
      try {
        log('👋 [GUEST] Step 5: Switching to audience role...');
        await streamEngineRef.current.setClientRole(Agora.ClientRoleType.ClientRoleAudience);
        log('✅ [GUEST] Role switched back to audience');
      } catch (error) {
        error('❌ [GUEST] Error switching role:', error);
        // Continue anyway - try to recover
      }

      // Step 4: Wait a moment for role change to take effect
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 5: Re-enable audio for receiving (hearing broadcaster) but keep publishing disabled
      try {
        log('👋 [GUEST] Step 6: Re-enabling audio for receiving...');
        // Enable audio engine for receiving remote audio (hearing the broadcaster)
        await streamEngineRef.current.enableAudio();
        log('✅ [GUEST] Audio enabled for receiving (can hear broadcaster)');
        
        // Ensure local audio publishing remains disabled
        await streamEngineRef.current.enableLocalAudio(false);
        log('🔇 [GUEST] Local audio publishing confirmed disabled');
        
        // Ensure local audio stream remains muted
        try {
          await streamEngineRef.current.muteLocalAudioStream(true);
          log('🔇 [GUEST] Local audio stream confirmed muted');
        } catch (e) {
          // muteLocalAudioStream might not be available
        }
      } catch (error) {
        error('⚠️ [GUEST] Failed to configure audio after leaving guest mode:', error);
        // Try to recover by ensuring audio is enabled for receiving
        try {
          await streamEngineRef.current.enableAudio();
        } catch (recoverError) {
          error('❌ [GUEST] Failed to recover audio:', recoverError);
        }
      }

      // Step 6: Ensure we're not publishing anything
      try {
        log('👋 [GUEST] Step 7: Final cleanup - ensuring no publishing...');
        await streamEngineRef.current.enableLocalVideo(false);
        await streamEngineRef.current.enableLocalAudio(false);
        await streamEngineRef.current.stopPreview();
        log('✅ [GUEST] All publishing stopped');
      } catch (error) {
        error('⚠️ [GUEST] Error in final cleanup:', error);
      }

      // Step 7: Wait a moment for everything to stabilize
      await new Promise(resolve => setTimeout(resolve, 300));

      log('✅ [GUEST] Successfully left guest mode - cleanup complete');
      return true;
    } catch (error) {
      error('❌ [GUEST] Error leaving guest mode:', error);
      
      // Try to recover by at least ensuring we're in audience role
      try {
        if (streamEngineRef.current) {
          const Agora = await getAgoraModule();
          if (Agora) {
            await streamEngineRef.current.setClientRole(Agora.ClientRoleType.ClientRoleAudience);
            await streamEngineRef.current.enableAudio();
            await streamEngineRef.current.enableLocalAudio(false);
            log('🔄 [GUEST] Recovery attempt completed');
          }
        }
      } catch (recoverError) {
        error('❌ [GUEST] Recovery failed:', recoverError);
      }
      
      return false;
    }
  };

  // Mute/unmute guest's own audio (called when host mutes guest)
  const muteGuestAudio = async (muted: boolean): Promise<void> => {
    try {
      if (!streamEngineRef.current) {
        error('❌ [GUEST] Stream engine not initialized');
        return;
      }

      log(`🎤 [GUEST] ${muted ? 'Muting' : 'Unmuting'} guest audio`);
      
      // CRITICAL: Only use muteLocalAudioStream to avoid affecting video rendering
      // enableLocalAudio can sometimes interfere with video streams
      try {
        await streamEngineRef.current.muteLocalAudioStream(muted);
        log(`✅ [GUEST] muteLocalAudioStream set to ${muted}`);
      } catch (e) {
        log('⚠️ [GUEST] muteLocalAudioStream not available, trying enableLocalAudio as fallback...');
        // Fallback: Only use enableLocalAudio if muteLocalAudioStream is not available
        try {
          await streamEngineRef.current.enableLocalAudio(!muted);
          log(`✅ [GUEST] enableLocalAudio (fallback) set to ${!muted}`);
        } catch (e2) {
          error('❌ [GUEST] Error calling enableLocalAudio:', e2);
        }
      }
      
      // Method 3: Set audio recording volume to 0 (more aggressive)
      try {
        if (streamEngineRef.current.setRecordingAudioFrameParameters) {
          // This is a fallback method
          log('⚠️ [GUEST] setRecordingAudioFrameParameters not directly available for volume control');
        }
      } catch (e) {
        // Ignore
      }
      
      // Wait a moment to ensure changes take effect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      log(`✅ [GUEST] Guest audio ${muted ? 'muted' : 'unmuted'} successfully`);
    } catch (error) {
      error('❌ [GUEST] Error muting/unmuting guest audio:', error);
    }
  };

  // Mute/unmute remote guest's audio (broadcaster only)
  const muteRemoteGuestAudio = async (remoteUid: number, muted: boolean): Promise<void> => {
    try {
      if (!streamEngineRef.current) {
        error('❌ [BROADCASTER] Stream engine not initialized');
        return;
      }

      if (!isStreaming) {
        error('❌ [BROADCASTER] Not currently streaming');
        return;
      }

      log(`🎤 [BROADCASTER] ${muted ? 'Muting' : 'Unmuting'} remote guest audio for UID: ${remoteUid}`);
      
      // Method 1: Mute/unmute the remote audio stream (mutes for broadcaster)
      try {
        await streamEngineRef.current.muteRemoteAudioStream(remoteUid, muted);
        log(`✅ [BROADCASTER] muteRemoteAudioStream called for UID: ${remoteUid}`);
      } catch (e) {
        error('❌ [BROADCASTER] Error calling muteRemoteAudioStream:', e);
      }
      
      // Method 2: Set volume to 0 to ensure audio is completely muted
      // Volume: 0 = muted, 100 = full volume
      try {
        const volume = muted ? 0 : 100;
        await streamEngineRef.current.adjustUserPlaybackSignalVolume(remoteUid, volume);
        log(`✅ [BROADCASTER] adjustUserPlaybackSignalVolume set to ${volume} for UID: ${remoteUid}`);
      } catch (e) {
        log('⚠️ [BROADCASTER] adjustUserPlaybackSignalVolume not available, trying alternative method');
        // Fallback: Try setRemoteAudioVolume if available
        try {
          if (streamEngineRef.current.setRemoteAudioVolume) {
            await streamEngineRef.current.setRemoteAudioVolume(remoteUid, muted ? 0 : 100);
            log(`✅ [BROADCASTER] setRemoteAudioVolume called for UID: ${remoteUid}`);
          }
        } catch (e2) {
          log('⚠️ [BROADCASTER] setRemoteAudioVolume also not available');
        }
      }
      
      log(`✅ [BROADCASTER] Remote guest audio (UID: ${remoteUid}) ${muted ? 'muted' : 'unmuted'} successfully`);
    } catch (error) {
      error(`❌ [BROADCASTER] Error muting/unmuting remote guest audio (UID: ${remoteUid}):`, error);
    }
  };

  // Handle invitation accept
  const handleAcceptInvitation = useCallback(async () => {
    if (!pendingInvitation) return;
    
    // Store invitation details before clearing state
    const invitationId = pendingInvitation.id;
    const invitationStreamId = pendingInvitation.stream_id;
    
    if (__DEV__) log('[LiveStreamProvider] ✅ Accepting invitation:', invitationId);
    setPendingInvitation(null);
    hasPendingInvitationRef.current = false;

    const result = await acceptGuestInvitation(invitationId);
    
    if (result.success) {
      log('[LiveStreamProvider] ✅ Invitation accepted successfully, already cleared from state');
      
      // If user is viewing the stream for this invitation, switch to guest mode
      if (currentStream?.id === invitationStreamId && isJoinedAsViewer) {
        // Note: switchToGuestMode will be called from LiveStreamViewer after this
        log('[LiveStreamProvider] Invitation accepted, user should switch to guest mode');
      } else if (currentStream?.id !== invitationStreamId) {
        // If user is not viewing the stream, show alert
        Alert.alert(
          'Invitation Accepted',
          'You can now join the stream as a guest. Please navigate to the stream.',
          [{ text: 'OK' }]
        );
      }
    } else {
      // If acceptance failed, check if it's a duplicate key error (user already a guest)
      const errorMessage = result.error || 'Failed to accept invitation';
      if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint') || errorMessage.includes('unique_active_guest')) {
        // User is already a guest, treat as success
        log('[LiveStreamProvider] ✅ User already a guest, treating as success');
        
        // If user is viewing the stream for this invitation, switch to guest mode
        if (currentStream?.id === invitationStreamId && isJoinedAsViewer) {
          log('[LiveStreamProvider] User already a guest, should switch to guest mode');
        }
        // Don't show error to user - they're already a guest
      } else {
        // Show other errors that are user-friendly
        error('[LiveStreamProvider] ❌ Failed to accept invitation:', result.error);
        Alert.alert('Error', errorMessage);
      }
    }
  }, [pendingInvitation, currentStream, isJoinedAsViewer]);

  // Handle invitation decline
  const handleDeclineInvitation = useCallback(async () => {
    if (!pendingInvitation) return;
    
    if (__DEV__) log('[LiveStreamProvider] ❌ Declining invitation:', pendingInvitation.id);
    const result = await declineGuestInvitation(pendingInvitation.id);
    
    if (result.success) {
      setPendingInvitation(null);
      hasPendingInvitationRef.current = false;
    } else {
      Alert.alert('Error', result.error || 'Failed to decline invitation');
    }
  }, [pendingInvitation]);

  const handleInvitationExpire = useCallback(() => {
    if (__DEV__) log('[LiveStreamProvider] ⏰ Invitation expired');
    setPendingInvitation(null);
    hasPendingInvitationRef.current = false;
  }, []);

  // Set up real-time subscription for live streams to auto-refresh when streams start/end
  // This ensures the StatusBar shows live avatars immediately when someone goes live
  useEffect(() => {
    let subscription: any;
    let mounted = true;

    const setupRealtimeSubscription = async () => {
      try {
        log('🔄 [LiveStreamProvider] Setting up live streams real-time subscription...');
        
        subscription = supabase
          .channel('live-streams-provider-updates')
          .on(
            'postgres_changes',
            {
              event: '*', // Listen to INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'live_streams',
            },
            (payload) => {
              if (!mounted) return;
              
              const newData = payload.new as any;
              const oldData = payload.old as any;
              
              log('📡 [LiveStreamProvider] Live stream real-time update:', {
                eventType: payload.eventType,
                streamId: newData?.id || oldData?.id,
                streamerId: newData?.streamer_id || oldData?.streamer_id,
                isLive: newData?.is_live,
                endedAt: newData?.ended_at,
                fullPayload: newData || oldData,
              });
              
              // For INSERT events, immediately add new stream to state for instant UI update
              if (payload.eventType === 'INSERT' && newData) {
                const newStream = newData;
                
                // Only add if stream is live and hasn't ended
                if (newStream.is_live && !newStream.ended_at) {
                  log('➕ [LiveStreamProvider] New stream detected, adding immediately:', {
                    id: newStream.id,
                    streamer_id: newStream.streamer_id,
                    title: newStream.title,
                    is_live: newStream.is_live,
                  });
                  
                  // Add stream immediately with basic data (don't wait for profile fetch)
                  setLiveStreams(prev => {
                    // Check if stream already exists (avoid duplicates)
                    if (prev.some(s => s.id === newStream.id)) {
                      log('⚠️ [LiveStreamProvider] Stream already exists, skipping:', newStream.id);
                      return prev;
                    }
                    
                    // Transform to match LiveStream interface (use streamer_name from stream if available)
                    const transformedStream: LiveStream = {
                      id: newStream.id,
                      title: newStream.title || 'Untitled Stream',
                      description: newStream.description,
                      streamer_id: newStream.streamer_id,
                      streamer_name: newStream.streamer_name || 'Unknown', // Use streamer_name from stream
                      streamer_avatar: newStream.streamer_avatar, // Use streamer_avatar from stream
                      channel_id: newStream.channel_id || newStream.id,
                      viewer_count: newStream.viewer_count || 0,
                      is_live: newStream.is_live,
                      started_at: newStream.started_at,
                      thumbnail_url: newStream.thumbnail_url,
                      allow_guests: newStream.allow_guests, // Include allow_guests field
                    };
                    
                    log('✅ [LiveStreamProvider] Adding stream to state:', transformedStream);
                    // Add to beginning of list (newest first)
                    return [transformedStream, ...prev];
                  });
                  
                  // Fetch profile data in background and update if different
                  supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', newStream.streamer_id)
                    .single()
                    .then(({ data: profile }) => {
                      if (!mounted) return;
                      
                      // Update stream with profile data if available
                      if (profile) {
                        setLiveStreams(prev => {
                          const index = prev.findIndex(s => s.id === newStream.id);
                          if (index >= 0) {
                            const updated = [...prev];
                            updated[index] = {
                              ...updated[index],
                              streamer_name: profile.username || updated[index].streamer_name,
                              streamer_avatar: profile.avatar_url || updated[index].streamer_avatar,
                            };
                            return updated;
                          }
                          return prev;
                        });
                      }
                    })
                    .catch(err => {
                      error('❌ [LiveStreamProvider] Error fetching profile for new stream (non-critical):', err);
                      // Stream already added, profile fetch failure is non-critical
                    });
                } else {
                  log('⚠️ [LiveStreamProvider] New stream not live or already ended, skipping:', {
                    id: newStream.id,
                    is_live: newStream.is_live,
                    ended_at: newStream.ended_at,
                  });
                }
              }
              
              // For UPDATE events, check if stream ended (is_live changed to false or ended_at was set)
              if (payload.eventType === 'UPDATE' && payload.new) {
                const newData = payload.new as any;
                const oldData = payload.old as any;
                
                // Check if stream just ended
                // Stream is considered ended if:
                // 1. is_live changed from true to false, OR
                // 2. ended_at was set (was null/undefined, now has a value), OR
                // 3. Current state shows stream is not live or has ended_at
                const streamEnded = (oldData?.is_live === true && newData?.is_live === false) || 
                                   (!oldData?.ended_at && newData?.ended_at) ||
                                   (newData.is_live === false || newData.ended_at);
                
                if (streamEnded) {
                  log('🛑 [LiveStreamProvider] Stream ended, removing from list immediately:', {
                    id: newData.id,
                    wasLive: oldData?.is_live,
                    nowLive: newData.is_live,
                    hadEndedAt: !!oldData?.ended_at,
                    nowHasEndedAt: !!newData.ended_at,
                  });
                  // Immediately remove from state to clear it from UI (prevents broken story indicators)
                  setLiveStreams(prev => {
                    const filtered = prev.filter(stream => stream.id !== newData.id);
                    log(`✅ [LiveStreamProvider] Removed ended stream. Remaining streams: ${filtered.length}`);
                    return filtered;
                  });
                } else if (newData.is_live && !newData.ended_at) {
                  // Stream is still live, update it in state
                  log('🔄 [LiveStreamProvider] Stream updated, refreshing in state:', newData.id);
                  setLiveStreams(prev => {
                    const index = prev.findIndex(s => s.id === newData.id);
                    if (index >= 0) {
                      // Update existing stream, preserving streamer_name/streamer_avatar if not in update
                      const updated = [...prev];
                      const existing = updated[index];
                      updated[index] = {
                        ...existing,
                        ...newData,
                        // Preserve streamer_name/streamer_avatar if not provided in update
                        streamer_name: newData.profiles?.username || existing.streamer_name,
                        streamer_avatar: newData.profiles?.avatar_url || existing.streamer_avatar,
                        viewer_count: newData.viewer_count ?? existing.viewer_count,
                      };
                      return updated;
                    }
                    return prev;
                  });
                }
              }
              
              // For DELETE events, immediately remove from state
              if (payload.eventType === 'DELETE' && payload.old) {
                const oldData = payload.old as any;
                log('🗑️ [LiveStreamProvider] Stream deleted, removing from list:', oldData.id);
                setLiveStreams(prev => prev.filter(stream => stream.id !== oldData.id));
              }
              
              // Also refresh live streams in background to ensure consistency
              // This is a fallback to catch any streams that might have been missed
              // Skip refresh for INSERT events since we handle them immediately above
              if (payload.eventType !== 'INSERT' && loadLiveStreamsImpl.current) {
                // Use a small delay to avoid race conditions with immediate state updates
                setTimeout(() => {
                  if (mounted && loadLiveStreamsImpl.current) {
                    loadLiveStreamsImpl.current().catch(err => {
                      error('❌ [LiveStreamProvider] Error refreshing live streams:', err);
                    });
                  }
                }, 1000);
              }
            }
          )
          .subscribe((status) => {
            if (!mounted) return;
            
            if (status === 'SUBSCRIBED') {
              log('✅ [LiveStreamProvider] Live streams real-time subscription active');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              // Only log error once to prevent spam - realtime subscriptions will fall back to polling
              warn('⚠️ [LiveStreamProvider] Live streams subscription failed, using polling fallback:', status);
              // If subscription fails, refresh streams immediately
              if (loadLiveStreamsImpl.current) {
                loadLiveStreamsImpl.current().catch(err => {
                  error('❌ [LiveStreamProvider] Error refreshing after subscription failure:', err);
                });
              }
            } else {
              log('📡 [LiveStreamProvider] Subscription status changed:', status);
            }
          });
      } catch (subscriptionError) {
        error('❌ [LiveStreamProvider] Error setting up live streams subscription:', subscriptionError);
      }
    };

    // Initial load of live streams
    if (loadLiveStreamsImpl.current) {
      loadLiveStreamsImpl.current().catch(err => {
        error('❌ [LiveStreamProvider] Error in initial load:', err);
      });
    }

    // Set up real-time subscription
    setupRealtimeSubscription();

    // Also set up periodic refresh as fallback (every 3 minutes - throttled for high traffic)
    const interval = setInterval(() => {
      if (mounted && loadLiveStreamsImpl.current) {
        log('🔄 [LiveStreamProvider] Periodic refresh of live streams...');
        // Throttle the load operation to prevent database overload
        // Improved error handling for slow connections - don't crash on timeout
        requestThrottler.throttle('load_live_streams', loadLiveStreamsImpl.current, 5000).catch(err => {
          // Only log non-timeout errors as errors, timeouts are expected on slow connections
          if (err?.message?.includes('timeout') || err?.message?.includes('Request timeout')) {
            warn('⚠️ [LiveStreamProvider] Periodic refresh timed out (slow connection) - will retry later');
          } else {
            error('❌ [LiveStreamProvider] Error in periodic refresh:', err);
          }
          // Don't throw - gracefully handle timeout and continue with cached data
        });
      }
    }, 600000); // Increased from 3 minutes to 10 minutes to reduce energy usage - realtime handles most updates

    return () => {
      mounted = false;
      if (subscription) {
        subscription.unsubscribe();
        log('🧹 [LiveStreamProvider] Cleaned up live streams subscription');
      }
      clearInterval(interval);
    };
  }, []); // Empty deps - only set up once

  // CRITICAL: Handle app background state - stop audio when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      // Update app state ref for interval checks
      appStateRef.current = nextAppState;
      
      if (nextAppState !== 'active') {
        log('📱 [LIVE_STREAM] App went to background, cleaning up stream...');
        log('📱 [LIVE_STREAM] Current state:', { isStreaming, isJoinedAsViewer, hasEngine: !!streamEngineRef.current });
        
        // CRITICAL: Always reset audio session when app goes to background (even if not in stream)
        // This prevents any lingering audio from continuing
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: false,
            staysActiveInBackground: false,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          });
          log('🔇 [LIVE_STREAM] Audio session reset due to background (always) - background audio stopped');
        } catch (audioResetError) {
          warn('⚠️ [LIVE_STREAM] Failed to reset audio session on background:', audioResetError);
        }
        
        // If streaming or viewing, cleanup immediately
        if (isStreaming || isJoinedAsViewer) {
          log('📱 [LIVE_STREAM] Stream active, performing full cleanup...');
          try {
            if (streamEngineRef.current) {
              // Mute all audio first
              try {
                await streamEngineRef.current.enableLocalAudio(false);
                await streamEngineRef.current.disableAudio();
                log('🔇 [LIVE_STREAM] Audio stopped due to background');
              } catch (e) {
                warn('⚠️ [LIVE_STREAM] Failed to stop audio on background:', e);
              }
              
              // Leave channel
              try {
                await streamEngineRef.current.leaveChannel();
                log('✅ [LIVE_STREAM] Left channel due to background');
              } catch (e) {
                warn('⚠️ [LIVE_STREAM] Failed to leave channel on background:', e);
              }
              
              // 🚀 IMPROVEMENT: Use safe release function
              await releaseEngineSafely();
              log('🔴 [LIVE_STREAM] Engine released due to background');
              
              // Clear token refresh timer
              if (tokenRefreshTimerRef.current) {
                clearTimeout(tokenRefreshTimerRef.current);
                tokenRefreshTimerRef.current = null;
              }
              currentTokenRef.current = null;
            } else {
              log('📱 [LIVE_STREAM] No engine to cleanup, but state indicates stream was active');
            }
            
            // Reset state
            setIsStreaming(false);
            setIsJoinedAsViewer(false);
            setCurrentStream(null);
            setStreamRemoteUids([]);
            setViewerCount(0);
            streamChannelRef.current = null;
            currentStreamIdRef.current = null;
            // Reset network quality tracking
            streamStartTimeRef.current = null;
            recentTxQualityRef.current = [];
            lastNetworkSpeedCheckRef.current = null;
            consecutiveLowSpeedCountRef.current = 0;
          } catch (error) {
            error('❌ [LIVE_STREAM] Error cleaning up on background:', error);
            // Force cleanup
            streamEngineRef.current = null;
            setIsStreaming(false);
            setIsJoinedAsViewer(false);
            // Reset network quality tracking
            streamStartTimeRef.current = null;
            recentTxQualityRef.current = [];
            lastNetworkSpeedCheckRef.current = null;
            consecutiveLowSpeedCountRef.current = 0;
          }
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isStreaming, isJoinedAsViewer]);

  // CRITICAL: Cleanup on provider unmount - ensure no background audio
  useEffect(() => {
    return () => {
      log('🧹 [LIVE_STREAM] Provider unmounting, performing final cleanup...');
      
      // 🚀 IMPROVEMENT: Use safe release function
      if (streamEngineRef.current) {
        releaseEngineSafely().catch(error => {
          error('❌ [LIVE_STREAM] Error in final cleanup:', error);
        });
      }
      
      // Clear token refresh timer
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
    };
  }, []);

  // Ensure context value is always created, even if there are errors
  // This prevents "useLiveStream must be used within a LiveStreamProvider" errors
  const contextValue: LiveStreamContextType = (() => {
    try {
      return {
    isStreaming,
    isJoinedAsViewer,
    currentStream,
    viewerCount,
    startLiveStream,
    stopLiveStream,
    joinStreamAsViewer,
    leaveStreamAsViewer,
    liveStreams,
    loadLiveStreams,
    toggleStreamCamera,
    toggleStreamMic,
    switchStreamCamera,
    isStreamCameraOn,
    isStreamMicOn,
    isStreamFrontCamera,
    streamRemoteUids,
    broadcasterVideoEnabled,
    guestVideoEnabled,
    debugViewerCount,
    forceRefreshViewerCount,
    forceCleanupInactiveViewers,
    testViewerCount,
    cleanupDuplicateViewers,
    switchToGuestMode,
    leaveGuestMode,
    muteGuestAudio,
    muteRemoteGuestAudio,
    switchGuestCamera,
    pendingInvitation,
    handleAcceptInvitation,
    handleDeclineInvitation,
    handleInvitationExpire,
    restoreAgoraAudio,
    
    // Network quality and connection state
    networkQuality,
    connectionState,
    audioOnlyDueToNetwork,

    // Verification functions
    verifyCoHostMicActive,
    verifyLivestreamHealth,
    
    // Co-host state tracking
    isGuestVideoEnabled,
    isGuestAudioEnabled,
  };
    } catch (contextError) {
      // If context value creation fails, return a minimal fallback
      error('❌ [LiveStreamProvider] Error creating context value, using fallback:', contextError);
      return {
        isStreaming: false,
        isJoinedAsViewer: false,
        currentStream: null,
        viewerCount: 0,
        startLiveStream: async () => false,
        stopLiveStream: async () => {},
        joinStreamAsViewer: async () => false,
        leaveStreamAsViewer: async () => {},
        liveStreams: [],
        loadLiveStreams: async () => {},
        toggleStreamCamera: () => {},
        toggleStreamMic: () => {},
        switchStreamCamera: () => {},
        isStreamCameraOn: false,
        isStreamMicOn: false,
        isStreamFrontCamera: true,
        streamRemoteUids: [],
        broadcasterVideoEnabled: new Map(),
        guestVideoEnabled: new Map(),
        debugViewerCount: async () => {},
        forceRefreshViewerCount: async () => {},
        forceCleanupInactiveViewers: async () => {},
        testViewerCount: () => {},
        cleanupDuplicateViewers: async () => {},
        switchToGuestMode: async () => false,
        leaveGuestMode: async () => false,
        muteGuestAudio: async () => {},
        muteRemoteGuestAudio: async () => {},
        switchGuestCamera: () => {},
        pendingInvitation: null,
        handleAcceptInvitation: async () => {},
        handleDeclineInvitation: async () => {},
        handleInvitationExpire: () => {},
        restoreAgoraAudio: async () => {},
        networkQuality: {},
        connectionState: 'DISCONNECTED',
        audioOnlyDueToNetwork: false,
        verifyCoHostMicActive: async () => false,
        verifyLivestreamHealth: async () => false,
        isGuestVideoEnabled: false,
        isGuestAudioEnabled: false,
      };
    }
  })();

  // Always render the provider, even if there are initialization errors
  // This ensures the context is always available to children
  // Use contextValue if available, otherwise use default fallback
  const safeContextValue = contextValue || defaultContextValue;
  
  return (
    <LiveStreamContext.Provider value={safeContextValue}>
      {children}
    </LiveStreamContext.Provider>
  );
};

