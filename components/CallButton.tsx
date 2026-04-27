import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, Alert, View } from 'react-native';
import { Video, Phone } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import useAuth from '../hooks/useAuth';
import { supabase } from '../utils/supabase';
import { getRecipientFromChatId } from '../utils/chatUtils';
import { getUserDmPreference } from '../utils/privacySettings';
import { hasCallEntitlement, showCallEntitlementAlert } from '../utils/callEntitlement';

interface CallButtonProps {
  chatId: string;
  recipientName?: string;
}

export default function CallButton({ chatId, recipientName }: CallButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

  const initCall = async (callType: 'audio' | 'video') => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to make calls');
      return;
    }
    const hasEntitlement = await hasCallEntitlement(user.id);
    if (!hasEntitlement) {
      showCallEntitlementAlert(router);
      return;
    }
    if (callType === 'audio') setIsLoadingAudio(true);
    else setIsLoadingVideo(true);

    try {
      let recipientId = await getRecipientFromChatId(chatId, user.id);
      if (!recipientId || recipientId === user.id) {
        Alert.alert('Recipient not found', 'Could not determine the recipient in this chat.');
        return;
      }
      const allowsDms = await getUserDmPreference(recipientId);
      if (!allowsDms) {
        Alert.alert('Call not allowed', 'This user has disabled direct messages and calls.');
        return;
      }

      const { data: recipientProfile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', recipientId)
        .maybeSingle();
      const recipientDisplayName =
        recipientProfile?.full_name || recipientProfile?.username || recipientName || 'User';

      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', user.id)
        .maybeSingle();
      const callerName =
        callerProfile?.full_name ||
        callerProfile?.username ||
        user.user_metadata?.full_name ||
        user.user_metadata?.username ||
        'User';

      // Best-effort call notification write (non-blocking if table missing).
      await supabase
        .from('call_notifications')
        .insert({
          caller_id: user.id,
          recipient_id: recipientId,
          channel_id: chatId,
          caller_name: callerName,
          status: 'pending',
          call_type: callType,
        })
        .then(() => {})
        .catch(() => {});

      router.push({
        pathname: '/chat/video-call',
        params: {
          id: chatId,
          name: recipientDisplayName,
          callType,
          isIncoming: 'false',
          timestamp: Date.now().toString(),
          returnTo: `/chat/${chatId}`,
        },
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to start call. Please try again.');
    } finally {
      setIsLoadingAudio(false);
      setIsLoadingVideo(false);
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.btn}
        activeOpacity={0.8}
        onPress={() => initCall('audio')}
        disabled={isLoadingAudio || isLoadingVideo}
      >
        {isLoadingAudio ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Phone size={16} color="#FFFFFF" />}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.btn}
        activeOpacity={0.8}
        onPress={() => initCall('video')}
        disabled={isLoadingAudio || isLoadingVideo}
      >
        {isLoadingVideo ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Video size={16} color="#FFFFFF" />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,111,174,0.88)',
  },
});

