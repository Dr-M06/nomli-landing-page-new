import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendCallNotification, sendMissedCallNotification } from '../utils/pushNotificationService';
import { supabase } from '../utils/supabase';

interface CallNotification {
  id: string;
  caller_id: string;
  caller_name: string;
  call_type: 'audio' | 'video';
  action: 'incoming_call' | 'missed_call';
}

export default function CallNotificationManager() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  
  const [currentCall, setCurrentCall] = useState<CallNotification | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for incoming calls via Supabase real-time
  useEffect(() => {
    const channel = supabase
      .channel('incoming_calls')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_requests', // You'll need to create this table
        },
        async (payload) => {
          const callData = payload.new as any;
          
          // Don't show notification for calls initiated by current user
          const { data: { user } } = await supabase.auth.getUser();
          if (user && callData.initiator_id === user.id) {
            return;
          }

          // Get caller profile information
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', callData.initiator_id)
            .single();

          if (profile) {
            const callNotification: CallNotification = {
              id: callData.id,
              caller_id: callData.initiator_id,
              caller_name: profile.full_name || 'Unknown User',
              call_type: callData.call_type || 'audio',
              action: 'incoming_call',
            };

            // Show incoming call notification
            setCurrentCall(callNotification);
            setIsVisible(true);

            // Auto-hide after 30 seconds (call timeout)
            callTimeoutRef.current = setTimeout(() => {
              handleCallTimeout(callNotification);
            }, 30000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }
    };
  }, []);

  const handleCallTimeout = async (call: CallNotification) => {
    // Send missed call notification
    await sendMissedCallNotification(
      call.caller_id,
      call.caller_name,
      call.caller_id,
      call.call_type
    );

    // Hide the notification
    setIsVisible(false);
    setCurrentCall(null);
  };

  const handleAnswerCall = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
    }
    
    setIsVisible(false);
    setCurrentCall(null);
    
    // Navigate to call screen
    if (currentCall) {
      router.push(`/call/${currentCall.caller_id}?type=${currentCall.call_type}`);
    }
  };

  const handleDeclineCall = async () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
    }

    // Send missed call notification
    if (currentCall) {
      await sendMissedCallNotification(
        currentCall.caller_id,
        currentCall.caller_name,
        currentCall.caller_id,
        currentCall.call_type
      );
    }

    setIsVisible(false);
    setCurrentCall(null);
  };

  if (!currentCall || !isVisible) {
    return null;
  }

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: themeColors.surface,
        borderColor: themeColors.border,
        shadowColor: themeColors.shadow,
        top: Platform.OS === 'ios' ? insets.top + 16 : insets.top + 8,
      }
    ]}>
      {/* Caller Info */}
      <View style={styles.callerInfo}>
        <View style={styles.avatarContainer}>
          <Ionicons 
            name={currentCall.call_type === 'video' ? 'videocam' : 'call'} 
            size={24} 
            color={themeColors.primary.main} 
          />
        </View>
        
        <View style={styles.textContainer}>
          <Text style={[styles.callerName, { color: themeColors.text }]}>
            {currentCall.caller_name}
          </Text>
          <Text style={[styles.callType, { color: themeColors.textSecondary }]}>
            Incoming {currentCall.call_type} call
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          onPress={handleAnswerCall}
          style={[styles.answerButton, { backgroundColor: themeColors.primary.main }]}
        >
          <Ionicons name="call" size={20} color="white" />
        </TouchableOpacity>
        
        <TouchableOpacity
          onPress={handleDeclineCall}
          style={[styles.declineButton, { backgroundColor: themeColors.error.main }]}
        >
          <Ionicons name="call-outline" size={20} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  callerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  callerName: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
    lineHeight: 24,
  },
  callType: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 16,
  },
  answerButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
