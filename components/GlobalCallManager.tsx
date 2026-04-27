import React, { useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhoneOff } from 'lucide-react-native';
import { supabase } from '../utils/supabase';
import useAuth from '../hooks/useAuth';
import IncomingCallModal from './IncomingCallModal';
import { warn } from '../utils/productionLogger';
import { callAlertService } from '../utils/callAlertService';
import { leaveLivestreamChannel } from '../utils/agoraLivestreamEngine';
import {
  getOngoingCallSession,
  getOngoingCallSessionEventName,
  setOngoingCallSession,
  type OngoingCallSession,
} from '../utils/ongoingCallSession';

type IncomingCall = {
  id: string;
  caller_id: string;
  caller_name?: string | null;
  call_type?: 'audio' | 'video' | null;
  channel_id?: string | null;
};

export default function GlobalCallManager() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const appState = useRef(AppState.currentState);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [ongoingCall, setCurrentOngoingCall] = useState<OngoingCallSession | null>(getOngoingCallSession());
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const isOnCallScreen = segments[0] === 'chat' && segments[1] === 'video-call';

  useEffect(() => {
    const eventName = getOngoingCallSessionEventName();
    const sub = DeviceEventEmitter.addListener(eventName, (next: OngoingCallSession | null) => {
      setCurrentOngoingCall(next);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`incoming-calls:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload: any) => {
          const call = payload?.new as IncomingCall;
          if (!call || call.status === 'rejected' || call.status === 'ended') return;
          if (appState.current === 'active') {
            setIncomingCall(call);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          warn('[GlobalCallManager] call_notifications subscription issue:', status);
        }
      });

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [user?.id]);

  const closeModal = () => {
    callAlertService.stopIncomingAlert();
    setIncomingCall(null);
    setAccepting(false);
    setDeclining(false);
  };

  useEffect(() => {
    if (incomingCall) {
      callAlertService.startIncomingAlert();
    } else {
      callAlertService.stopIncomingAlert();
    }
    return () => {
      callAlertService.stopIncomingAlert();
    };
  }, [incomingCall]);

  const onDecline = async () => {
    if (!incomingCall) return;
    setDeclining(true);
    await supabase
      .from('call_notifications')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', incomingCall.id)
      .then(() => {})
      .catch(() => {});
    closeModal();
  };

  const onAccept = async () => {
    if (!incomingCall || !user?.id) return;
    setAccepting(true);

    await supabase
      .from('call_notifications')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', incomingCall.id)
      .then(() => {})
      .catch(() => {});

    const callType = incomingCall.call_type === 'audio' ? 'audio' : 'video';
    router.push({
      pathname: '/chat/video-call',
      params: {
        id: incomingCall.channel_id || incomingCall.id,
        name: incomingCall.caller_name || 'Unknown',
        callType,
        isIncoming: 'true',
        timestamp: Date.now().toString(),
      },
    });
    closeModal();
  };

  const resumeOngoingCall = () => {
    if (!ongoingCall) return;
    router.push({
      pathname: '/chat/video-call',
      params: {
        id: ongoingCall.callId,
        name: ongoingCall.name,
        callType: ongoingCall.callType,
        isIncoming: 'true',
        returnTo: ongoingCall.returnTo || '/(tabs)/community',
        timestamp: Date.now().toString(),
      },
    });
  };

  const endOngoingCall = async () => {
    if (!ongoingCall || !user?.id) return;
    await supabase
      .from('call_notifications')
      .update({ status: 'ended', updated_at: new Date().toISOString() })
      .eq('channel_id', ongoingCall.callId)
      .or(`caller_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .in('status', ['pending', 'accepted'])
      .then(() => {})
      .catch(() => {});
    await leaveLivestreamChannel().catch(() => {});
    callAlertService.stopAll();
    setOngoingCallSession(null);
  };

  return (
    <>
      <IncomingCallModal
        visible={!!incomingCall}
        callerName={incomingCall?.caller_name || 'Unknown'}
        callType={incomingCall?.call_type === 'audio' ? 'audio' : 'video'}
        onAccept={onAccept}
        onDecline={onDecline}
        accepting={accepting}
        declining={declining}
      />
      {ongoingCall && !isOnCallScreen ? (
        <View style={[styles.ongoingCallPillWrap, { top: insets.top + 10 }]}>
          <TouchableOpacity style={styles.ongoingCallPill} onPress={resumeOngoingCall} activeOpacity={0.92}>
            <View style={styles.ongoingCallInfo}>
              <Text style={styles.ongoingCallTitle} numberOfLines={1}>On call: {ongoingCall.name}</Text>
              <Text style={styles.ongoingCallSub}>Tap to resume</Text>
            </View>
            <TouchableOpacity style={styles.endMiniBtn} onPress={endOngoingCall} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <PhoneOff size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  ongoingCallPillWrap: {
    position: 'absolute',
    right: 12,
    zIndex: 80,
  },
  ongoingCallPill: {
    minWidth: 180,
    maxWidth: 250,
    borderRadius: 999,
    backgroundColor: 'rgba(2,6,23,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ongoingCallInfo: {
    flex: 1,
    minWidth: 0,
  },
  ongoingCallTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  ongoingCallSub: {
    color: '#CBD5E1',
    fontSize: 10,
    marginTop: 1,
    fontWeight: '600',
  },
  endMiniBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

