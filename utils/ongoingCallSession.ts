import { DeviceEventEmitter } from 'react-native';

export type OngoingCallSession = {
  callId: string;
  name: string;
  callType: 'audio' | 'video';
  returnTo?: string;
  remoteUid?: number | null;
  connectedAtMs?: number | null;
  isVideoMinimized?: boolean;
  bootstrap?: {
    token: string;
    appId: string;
    channelName: string;
    uid: number;
  };
};

const ONGOING_CALL_CHANGED_EVENT = 'ongoingCallSessionChanged';

let currentSession: OngoingCallSession | null = null;

export function getOngoingCallSession(): OngoingCallSession | null {
  return currentSession;
}

export function setOngoingCallSession(next: OngoingCallSession | null): void {
  currentSession = next;
  DeviceEventEmitter.emit(ONGOING_CALL_CHANGED_EVENT, next);
}

export function getOngoingCallSessionEventName(): string {
  return ONGOING_CALL_CHANGED_EVENT;
}
