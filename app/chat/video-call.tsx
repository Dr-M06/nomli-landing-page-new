import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, AudioLines, Volume2, VolumeX } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RtcSurfaceView } from 'react-native-agora';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../constants/Endpoints';
import {
  enableLocalAudio,
  enableLocalVideo,
  getLivestreamJoinState,
  initializeLivestreamEngine,
  joinLivestreamChannel,
  leaveLivestreamChannel,
  setSpeakerphoneEnabled,
  switchCamera,
} from '../../utils/agoraLivestreamEngine';
import { supabase } from '../../utils/supabase';
import useAuth from '../../hooks/useAuth';
import { callAlertService } from '../../utils/callAlertService';
import { getOngoingCallSession, setOngoingCallSession } from '../../utils/ongoingCallSession';

type CallStatus = 'pending' | 'accepted' | 'rejected' | 'ended';
type BootstrapResponse = {
  token: string;
  appId: string;
  channelName: string;
  uid: number;
};

function pickRemoteUid(args: unknown[]): number | null {
  for (const arg of args) {
    if (typeof arg === 'number' && Number.isFinite(arg) && arg > 0) return arg;
    if (arg && typeof arg === 'object') {
      const maybeUid =
        (arg as any).remoteUid ??
        (arg as any).uid ??
        (arg as any).userId;
      if (typeof maybeUid === 'number' && Number.isFinite(maybeUid) && maybeUid > 0) return maybeUid;
    }
  }
  return null;
}

export default function VideoCallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string; name?: string; callType?: string; isIncoming?: string; returnTo?: string }>();
  const name = params.name || 'User';
  const callType = params.callType === 'audio' ? 'Audio call' : 'Video call';
  const isIncoming = params.isIncoming === 'true';
  const isAudioCall = params.callType === 'audio';
  const callId = String(params.id || '');
  const [callStatus, setCallStatus] = useState<CallStatus>(isIncoming ? 'accepted' : 'pending');
  const [isConnecting, setIsConnecting] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(!isAudioCall);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [isRemoteVideoMuted, setIsRemoteVideoMuted] = useState(false);
  const [swapPip, setSwapPip] = useState(false);
  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [connectedAtMs, setConnectedAtMs] = useState<number | null>(null);
  const [acceptedAtMs, setAcceptedAtMs] = useState<number | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const rtcEngineRef = useRef<any>(null);
  const rtcEventsRef = useRef<any>(null);
  const localRtcUidRef = useRef<number | null>(null);
  const isMinimizingRef = useRef(false);
  const bootstrapRef = useRef<BootstrapResponse | null>(null);
  const preMinimizeVideoEnabledRef = useRef<boolean>(true);
  const pipPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const PIP_WIDTH = 96;
  const PIP_HEIGHT = 136;
  const pipMaxX = Math.max(10, screenWidth - PIP_WIDTH - 10);
  const pipMinY = insets.top + 10;
  const pipMaxY = Math.max(pipMinY, screenHeight - insets.bottom - PIP_HEIGHT - 140);

  useEffect(() => {
    pipPosition.setValue({ x: pipMaxX, y: pipMinY });
  }, [pipMaxX, pipMinY, pipPosition]);

  const statusLabel = useMemo(() => {
    if (callStatus === 'rejected') return 'declined';
    if (callStatus === 'ended') return 'ended';
    if (isConnecting) return 'connecting...';
    // "accepted" means signaling accepted. Remote join callbacks can be missed on resume/re-attach,
    // so after a short grace period we treat the call as connected.
    if (callStatus === 'accepted' && remoteUid != null) return 'connected';
    if (callStatus === 'accepted' && remoteUid == null) {
      const acceptedLongEnough = acceptedAtMs != null && Date.now() - acceptedAtMs > 2500;
      if (acceptedLongEnough) return 'connected';
      return `waiting for ${name}...`;
    }
    return 'ringing...';
  }, [acceptedAtMs, callStatus, isConnecting, remoteUid, name]);

  const callDurationLabel = useMemo(() => {
    const mins = Math.floor(callSeconds / 60);
    const secs = callSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [callSeconds]);

  const closeCall = useCallback(() => {
    if (params.returnTo) {
      router.replace(String(params.returnTo) as any);
      return;
    }
    router.back();
  }, [params.returnTo, router]);

  const fetchCallBootstrap = useCallback(async (): Promise<BootstrapResponse> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Session expired. Please sign in again.');
    }
    if (!SUPABASE_URL) {
      throw new Error('Supabase URL missing from app config.');
    }

    const headers = {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY || '',
    };

    const bootstrapUrl = `${SUPABASE_URL}/functions/v1/call-bootstrap?callId=${encodeURIComponent(callId)}&callType=${isAudioCall ? 'audio' : 'video'}`;
    const response = await fetch(bootstrapUrl, {
      method: 'GET',
      headers,
    });

    const json = (await response.json().catch(() => ({}))) as Partial<BootstrapResponse> & { error?: string };
    if (response.ok && json.token && json.appId && json.channelName && typeof json.uid === 'number') {
      return json as BootstrapResponse;
    }

    // Fallback when call-bootstrap is flaky/unavailable: generate token directly from `agora-token`.
    // This keeps calling functional even if the dedicated bootstrap function returns 5xx.
    if (response.status >= 500 && user?.id) {
      const uidHash = user.id.split('-').join('');
      const uid = (parseInt(uidHash.slice(0, 8), 16) % 1000000) + 1;
      const fallbackResp = await fetch(`${SUPABASE_URL}/functions/v1/agora-token`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelName: callId,
          uid,
          role: 'broadcaster',
          expireSeconds: 3600,
        }),
      });
      const fallbackJson = (await fallbackResp.json().catch(() => ({}))) as any;
      const token = fallbackJson?.data?.token;
      const appId = fallbackJson?.data?.appId;
      if (fallbackResp.ok && token && appId) {
        return {
          token,
          appId,
          channelName: callId,
          uid,
        };
      }
    }

    throw new Error(json.error || `Call bootstrap failed (${response.status})`);
  }, [callId, isAudioCall, user?.id]);

  useEffect(() => {
    const session = getOngoingCallSession();
    if (!session || session.callId !== callId) return;
    if (typeof session.remoteUid === 'number' && session.remoteUid > 0) {
      setRemoteUid(session.remoteUid);
      setConnectedAtMs((prev) => prev ?? session.connectedAtMs ?? Date.now());
      setCallStatus('accepted');
      setIsConnecting(false);
    }
    if (typeof session.isVideoMinimized === 'boolean') {
      // Returning from minimized screen during a video call should auto-restore video UI/camera.
      if (!isAudioCall && session.isVideoMinimized) {
        setIsVideoMinimized(false);
        setIsVideoEnabled(true);
      } else {
        setIsVideoMinimized(session.isVideoMinimized);
      }
      if (isAudioCall && session.isVideoMinimized) {
        setIsVideoEnabled(false);
      }
    }
  }, [callId, isAudioCall]);

  const cleanupRtc = useCallback(async () => {
    if (rtcEngineRef.current && rtcEventsRef.current && rtcEngineRef.current.unregisterEventHandler) {
      try {
        await rtcEngineRef.current.unregisterEventHandler(rtcEventsRef.current);
      } catch (_) {}
    }
    rtcEventsRef.current = null;
    rtcEngineRef.current = null;
    setRemoteUid(null);
    setIsRemoteVideoMuted(false);
    await leaveLivestreamChannel().catch(() => {});
  }, []);

  const cleanupRtcHandlersOnly = useCallback(async () => {
    if (rtcEngineRef.current && rtcEventsRef.current && rtcEngineRef.current.unregisterEventHandler) {
      try {
        await rtcEngineRef.current.unregisterEventHandler(rtcEventsRef.current);
      } catch (_) {}
    }
    rtcEventsRef.current = null;
    rtcEngineRef.current = null;
  }, []);

  const onEnd = useCallback(() => {
    setOngoingCallSession(null);
    if (user?.id) {
      supabase
        .from('call_notifications')
        .update({ status: 'ended', updated_at: new Date().toISOString() })
        .eq('channel_id', callId)
        .or(`caller_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .in('status', ['pending', 'accepted'])
        .then(() => {})
        .catch(() => {});
    }
    callAlertService.stopAll();
    cleanupRtc().finally(() => closeCall());
  }, [callId, cleanupRtc, closeCall, user?.id]);

  useEffect(() => {
    if (!callId || !user?.id) return;

    let cancelled = false;

    const connectRtc = async () => {
      setIsConnecting(true);
      try {
        const ongoingSession = getOngoingCallSession();
        const sessionBootstrap = ongoingSession?.callId === callId ? ongoingSession.bootstrap : null;
        const bootstrap =
          sessionBootstrap && sessionBootstrap.channelName
            ? (sessionBootstrap as BootstrapResponse)
            : await fetchCallBootstrap();
        if (cancelled) return;
        bootstrapRef.current = bootstrap;
        localRtcUidRef.current = bootstrap.uid;

        const engine = await initializeLivestreamEngine(bootstrap.appId);
        if (cancelled) return;
        rtcEngineRef.current = engine;

        if (engine?.registerEventHandler) {
          const eventHandler = {
            onJoinChannelSuccess: () => {
              if (!cancelled) {
                setIsConnecting(false);
                setCallStatus('accepted');
                setAcceptedAtMs((prev) => prev ?? Date.now());
                callAlertService.stopDialingAlert();
              }
            },
            onUserJoined: (...args: unknown[]) => {
              if (!cancelled) {
                const joinedUid = pickRemoteUid(args);
                if (joinedUid != null && joinedUid !== localRtcUidRef.current) {
                  setRemoteUid(joinedUid);
                  setIsRemoteVideoMuted(false);
                  setConnectedAtMs((prev) => prev ?? Date.now());
                }
              }
            },
            onFirstRemoteVideoDecoded: (...args: unknown[]) => {
              if (!cancelled) {
                const joinedUid = pickRemoteUid(args);
                if (joinedUid != null && joinedUid !== localRtcUidRef.current) {
                  setRemoteUid(joinedUid);
                  setIsRemoteVideoMuted(false);
                  setConnectedAtMs((prev) => prev ?? Date.now());
                }
              }
            },
            onUserMuteVideo: (...args: unknown[]) => {
              if (!cancelled) {
                const targetUid = pickRemoteUid(args);
                if (targetUid != null && targetUid !== localRtcUidRef.current) {
                  const mutedArg = args.find((v) => typeof v === 'boolean');
                  if (typeof mutedArg === 'boolean') {
                    setIsRemoteVideoMuted(mutedArg);
                  }
                }
              }
            },
            onUserOffline: (...args: unknown[]) => {
              if (!cancelled) {
                const uid = pickRemoteUid(args);
                if (uid == null) return;
                setRemoteUid((current) => (current === uid ? null : current));
                setIsRemoteVideoMuted(false);
              }
            },
          };
          rtcEventsRef.current = eventHandler;
          await engine.registerEventHandler(eventHandler);
        }

        const joinState = getLivestreamJoinState();
        if (!(joinState.isJoined && joinState.channelName === bootstrap.channelName)) {
          await joinLivestreamChannel({
            token: bootstrap.token,
            channelName: bootstrap.channelName,
            uid: bootstrap.uid,
            role: 'broadcaster',
          });
        } else {
          setCallStatus('accepted');
          setIsConnecting(false);
          setAcceptedAtMs((prev) => prev ?? Date.now());
          if (ongoingSession?.callId === callId && typeof ongoingSession.remoteUid === 'number' && ongoingSession.remoteUid > 0) {
            setRemoteUid(ongoingSession.remoteUid);
            setConnectedAtMs((prev) => prev ?? ongoingSession.connectedAtMs ?? Date.now());
          }
        }

        await enableLocalAudio(true);
        await setSpeakerphoneEnabled(true).catch(() => {});
        if (isAudioCall) {
          await enableLocalVideo(false);
          setIsVideoEnabled(false);
        } else {
          await enableLocalVideo(true);
          if (engine?.startPreview) {
            await engine.startPreview();
          }
        }
        if (!cancelled) setIsConnecting(false);
      } catch (error: any) {
        if (cancelled) return;
        setIsConnecting(false);
        callAlertService.stopDialingAlert();
        Alert.alert('Call failed', error?.message || 'Unable to connect this call right now.');
      }
    };

    connectRtc().catch(() => {});

    return () => {
      cancelled = true;
      callAlertService.stopAll();
      if (isMinimizingRef.current) {
        cleanupRtcHandlersOnly().catch(() => {});
        return;
      }
      cleanupRtc().catch(() => {});
    };
  }, [callId, cleanupRtc, cleanupRtcHandlersOnly, fetchCallBootstrap, isAudioCall, user?.id]);

  useEffect(() => {
    if (!callId || !user?.id) return;

    let active = true;

    const loadInitialStatus = async () => {
      const { data } = await supabase
        .from('call_notifications')
        .select('status')
        .eq('channel_id', callId)
        .or(`caller_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active || !data?.status) return;
      const next = data.status as CallStatus;
      setCallStatus(next);
      if (next === 'accepted') {
        setIsConnecting(false);
        setAcceptedAtMs((prev) => prev ?? Date.now());
      }
      if (next === 'rejected' || next === 'ended') {
        setOngoingCallSession(null);
        callAlertService.stopAll();
        Alert.alert('Call ended', next === 'rejected' ? 'Call was declined.' : 'Call has ended.');
        closeCall();
      }
    };

    loadInitialStatus().catch(() => {});

    const channel = supabase
      .channel(`call-status:${callId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_notifications',
          filter: `channel_id=eq.${callId}`,
        },
        (payload: any) => {
          const next = payload?.new?.status as CallStatus | undefined;
          if (!next) return;
          setCallStatus(next);
          if (next === 'accepted') {
            setIsConnecting(false);
            setAcceptedAtMs((prev) => prev ?? Date.now());
            callAlertService.stopDialingAlert();
          }
          if (next === 'rejected' || next === 'ended') {
            setOngoingCallSession(null);
            callAlertService.stopAll();
            Alert.alert('Call ended', next === 'rejected' ? 'Call was declined.' : 'Call has ended.');
            closeCall();
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      active = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {});
      }
      channelRef.current = null;
    };
  }, [callId, closeCall, user?.id]);

  useEffect(() => {
    // Caller hears/feels dialing pulses until connected/rejected/ended.
    if (!isIncoming && callStatus === 'pending') {
      callAlertService.startDialingAlert();
    } else {
      callAlertService.stopDialingAlert();
    }
    return () => {
      callAlertService.stopDialingAlert();
    };
  }, [callStatus, isIncoming]);

  useEffect(() => {
    if (!connectedAtMs || callStatus !== 'accepted' || remoteUid == null) {
      setCallSeconds(0);
      return;
    }
    setCallSeconds(Math.max(0, Math.floor((Date.now() - connectedAtMs) / 1000)));
    const interval = setInterval(() => {
      setCallSeconds(Math.max(0, Math.floor((Date.now() - connectedAtMs) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [callStatus, connectedAtMs, remoteUid]);

  const toggleMic = useCallback(async () => {
    const next = !isAudioMuted;
    setIsAudioMuted(next);
    await enableLocalAudio(!next).catch(() => {
      setIsAudioMuted(!next);
    });
  }, [isAudioMuted]);

  const toggleVideo = useCallback(async () => {
    if (isAudioCall) return;
    const next = !isVideoEnabled;
    setIsVideoEnabled(next);
    await enableLocalVideo(next).catch(() => {
      setIsVideoEnabled(!next);
    });
  }, [isAudioCall, isVideoEnabled]);

  const toggleSpeaker = useCallback(async () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    await setSpeakerphoneEnabled(next).catch(() => {
      setIsSpeakerOn(!next);
      Alert.alert('Audio route', 'Unable to switch speaker right now.');
    });
  }, [isSpeakerOn]);

  const minimizeCall = useCallback(async () => {
    isMinimizingRef.current = true;
    let nextVideoMinimized = isVideoMinimized;
    if (!isAudioCall) {
      preMinimizeVideoEnabledRef.current = isVideoEnabled;
      nextVideoMinimized = true;
      setIsVideoMinimized(true);
      setIsVideoEnabled(false);
      await enableLocalVideo(false).catch(() => {});
    }
    setOngoingCallSession({
      callId,
      name,
      callType: isAudioCall ? 'audio' : 'video',
      returnTo: params.returnTo ? String(params.returnTo) : undefined,
      remoteUid,
      connectedAtMs,
      isVideoMinimized: nextVideoMinimized,
      bootstrap: bootstrapRef.current || undefined,
    });
    router.replace((params.returnTo ? String(params.returnTo) : '/(tabs)/community') as any);
  }, [callId, connectedAtMs, isAudioCall, isVideoEnabled, isVideoMinimized, name, params.returnTo, remoteUid, router]);

  const toggleAudioMode = useCallback(async () => {
    if (isAudioCall) return;
    if (!isVideoMinimized) {
      preMinimizeVideoEnabledRef.current = isVideoEnabled;
      setIsVideoMinimized(true);
      setIsVideoEnabled(false);
      await enableLocalVideo(false).catch(() => {});
      return;
    }
    setIsVideoMinimized(false);
    const shouldRestoreVideo = preMinimizeVideoEnabledRef.current;
    setIsVideoEnabled(shouldRestoreVideo);
    await enableLocalVideo(shouldRestoreVideo).catch(() => {});
  }, [isAudioCall, isVideoEnabled, isVideoMinimized]);

  const pipPanResponder = useMemo(
    () =>
      PanResponder.create({
        // Let tap be handled by TouchableOpacity; PanResponder should activate for drag only.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
        onPanResponderMove: (_, gesture) => {
          const nextX = Math.min(pipMaxX, Math.max(10, gesture.moveX - PIP_WIDTH / 2));
          const nextY = Math.min(pipMaxY, Math.max(pipMinY, gesture.moveY - PIP_HEIGHT / 2));
          pipPosition.setValue({ x: nextX, y: nextY });
        },
        onPanResponderRelease: () => {},
      }),
    [PIP_HEIGHT, PIP_WIDTH, pipMaxX, pipMaxY, pipMinY, pipPosition]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <TouchableOpacity
          style={[styles.topMinBtn, { top: insets.top + 10 }]}
          onPress={minimizeCall}
          activeOpacity={0.9}
        >
          <Text style={styles.topMinBtnText}>Min</Text>
        </TouchableOpacity>
        {!isAudioCall && !isVideoMinimized && (
          <Pressable
            style={styles.videoStageFullscreen}
            onPress={() => setControlsVisible((prev) => !prev)}
          >
            {remoteUid != null && !swapPip ? (
              isRemoteVideoMuted ? (
                <View style={styles.remoteVideoOff}>
                  <VideoOff size={34} color="#FFFFFF" />
                  <Text style={styles.remoteVideoOffText}>{`${name} turned off video`}</Text>
                </View>
              ) : (
                <RtcSurfaceView
                  canvas={{ uid: remoteUid, renderMode: 1 }}
                  style={styles.primaryVideo}
                />
              )
            ) : (
              <RtcSurfaceView
                canvas={{ uid: 0, renderMode: 1, mirrorMode: 1 }}
                style={styles.primaryVideo}
              />
            )}

            {remoteUid != null ? (
              <Animated.View
                style={[
                  styles.pipPreviewWrap,
                  {
                    transform: [{ translateX: pipPosition.x }, { translateY: pipPosition.y }],
                  },
                ]}
                {...pipPanResponder.panHandlers}
              >
                <TouchableOpacity
                  style={styles.pipTouchArea}
                  activeOpacity={1}
                  onPress={() => {
                    setSwapPip((prev) => !prev);
                    setControlsVisible(true);
                  }}
                >
                  {swapPip ? (
                    isRemoteVideoMuted ? (
                      <View style={styles.pipRemoteVideoOff}>
                        <VideoOff size={16} color="#FFFFFF" />
                      </View>
                    ) : (
                      <RtcSurfaceView
                        canvas={{ uid: remoteUid, renderMode: 1 }}
                        style={styles.pipPreview}
                      />
                    )
                  ) : (
                    <RtcSurfaceView
                      canvas={{ uid: 0, renderMode: 1, mirrorMode: 1 }}
                      style={styles.pipPreview}
                    />
                  )}
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <View style={[styles.waitingOverlay, { backgroundColor: 'rgba(2,6,23,0.42)' }]}>
                <Text style={[styles.remotePlaceholderText, { color: '#FFFFFF' }]}>{`Waiting for ${name}...`}</Text>
              </View>
            )}
          </Pressable>
        )}
        {(isAudioCall || isVideoMinimized) && (
          <View style={styles.audioStage}>
            <View style={styles.audioGlowOuter} />
            <View style={styles.audioGlowInner} />
            <View style={styles.avatarCircle}>
              <Phone size={30} color="#FFFFFF" />
            </View>
            <View style={styles.audioBadge}>
              <AudioLines size={14} color="#FBCFE8" />
              <Text style={styles.audioBadgeText}>Audio in progress</Text>
            </View>
          </View>
        )}
      </View>
      {controlsVisible ? (
      <View style={[styles.overlayFooter, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}>
        <View style={styles.metaWrap}>
          <Text style={[styles.name, { color: '#FFFFFF' }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.status, { color: '#E2E8F0' }]}>
            {callType} - {isConnecting ? 'connecting...' : statusLabel}
          </Text>
          {callStatus === 'accepted' && remoteUid != null ? (
            <Text style={styles.counterText}>Call time: {callDurationLabel}</Text>
          ) : null}
          {isConnecting && <ActivityIndicator style={styles.loader} color="#FF6FAE" />}
        </View>
        <View style={styles.secondaryControls}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={toggleMic} activeOpacity={0.9}>
            {isAudioMuted ? <MicOff size={18} color="#FFFFFF" /> : <Mic size={18} color="#FFFFFF" />}
          </TouchableOpacity>
          {(isAudioCall || isVideoMinimized) && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={toggleSpeaker} activeOpacity={0.9}>
              {isSpeakerOn ? <Volume2 size={18} color="#FFFFFF" /> : <VolumeX size={18} color="#FFFFFF" />}
            </TouchableOpacity>
          )}
          {!isAudioCall && !isVideoMinimized && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={toggleVideo} activeOpacity={0.9}>
              {isVideoEnabled ? <Video size={18} color="#FFFFFF" /> : <VideoOff size={18} color="#FFFFFF" />}
            </TouchableOpacity>
          )}
          {!isAudioCall && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={toggleAudioMode} activeOpacity={0.9}>
              <Text style={styles.camText}>{isVideoMinimized ? 'Video' : 'Audio'}</Text>
            </TouchableOpacity>
          )}
          {!isAudioCall && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                switchCamera().catch(() => {});
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.camText}>Cam</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.endBtn}
          onPress={() => {
            Alert.alert('End call', 'Call ended.');
            onEnd();
          }}
          activeOpacity={0.9}
        >
          <PhoneOff size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioStage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07163A',
  },
  audioGlowOuter: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,111,174,0.12)',
  },
  audioGlowInner: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,111,174,0.2)',
  },
  avatarCircle: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: 'rgba(255,111,174,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  audioBadge: {
    marginTop: 22,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioBadgeText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
  },
  status: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
  },
  counterText: {
    marginTop: 6,
    color: '#FFD8EA',
    fontSize: 12,
    fontWeight: '800',
  },
  overlayFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(2,6,23,0.42)',
  },
  metaWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryControls: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  secondaryBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  loader: {
    marginTop: 10,
  },
  videoStage: {
    display: 'none',
  },
  videoStageFullscreen: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  primaryVideo: {
    flex: 1,
  },
  waitingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remotePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  remotePlaceholderText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  remoteVideoOff: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0B1324',
  },
  remoteVideoOffText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
  },
  pipPreviewWrap: {
    position: 'absolute',
    width: 96,
    height: 136,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#111827',
  },
  pipTouchArea: {
    flex: 1,
  },
  pipPreview: {
    flex: 1,
  },
  pipRemoteVideoOff: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1324',
  },
  topMinBtn: {
    position: 'absolute',
    right: 12,
    zIndex: 20,
    minWidth: 56,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(2,6,23,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topMinBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  endBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

