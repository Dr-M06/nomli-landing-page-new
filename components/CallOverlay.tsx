import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Platform,
  AppState,
  Vibration,
  StatusBar,
  Modal,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
  runOnJS
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Phone, PhoneOff, Video, Mic, MicOff, X } from 'lucide-react-native';
import { Image } from 'expo-image';
import { supabase } from '../utils/supabase';
import { useRouter } from 'expo-router';
import useAuth from '../hooks/useAuth';
import { sendMessage } from '../utils/chat';
import Toast from 'react-native-toast-message';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CallOverlayProps {
  visible: boolean;
  callData: {
    id: string;
    caller_id: string;
    caller_name: string;
    caller_avatar?: string;
    call_type: 'audio' | 'video';
    channel_id: string;
  } | null;
  onAnswer: () => void;
  onReject: () => void;
  onClose: () => void;
}

export default function CallOverlay({
  visible,
  callData,
  onAnswer,
  onReject,
  onClose
}: CallOverlayProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [isAnswering, setIsAnswering] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  const quickMessages = [
    "Sorry, I can't talk right now",
    "I'll call you back later",
    "I'm in a meeting",
    "I'm driving, can't answer",
    "I'm busy, will message you soon",
    "Can't talk now, what's up?",
  ];
  
  // Audio management
  const ringtoneRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Animations
  const pulseAnimation = useSharedValue(0);
  const slideAnimation = useSharedValue(SCREEN_HEIGHT);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible && callData) {
      // Dismiss keyboard when call overlay appears so user can interact with buttons
      Keyboard.dismiss();
      
      // Show overlay with animation
      slideAnimation.value = withTiming(0, { duration: 300 });
      
      // Simplified pulsing animation (slower for better performance)
      pulseAnimation.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500 }),
          withTiming(0, { duration: 1500 })
        ),
        -1,
        false
      );
      
      // Simplified ring animation (slower for better performance)
      ringOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 1500 }),
          withTiming(0.7, { duration: 1500 })
        ),
        -1,
        true
      );
      
      // Play ringtone and start vibration
      startRingtone();
      startVibration();
      
      // Auto-reject after 30 seconds
      const autoRejectTimer = setTimeout(() => {
        if (!isCallActive) {
          handleReject();
        }
      }, 30000);
      
      return () => {
        clearTimeout(autoRejectTimer);
        stopRingtone();
        Vibration.cancel();
      };
    } else {
      // Hide overlay
      slideAnimation.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
      stopRingtone();
      Vibration.cancel();
    }
  }, [visible, callData]);

  const startRingtone = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/call-ringtone.mp3'),
        { shouldPlay: true, isLooping: true, volume: 0.8 }
      );
      ringtoneRef.current = sound;
    } catch (error) {
      error('Failed to load ringtone:', error);
    }
  };

  const stopRingtone = async () => {
    try {
      if (ringtoneRef.current) {
        await ringtoneRef.current.stopAsync();
        await ringtoneRef.current.unloadAsync();
        ringtoneRef.current = null;
      }
    } catch (error) {
      error('Failed to stop ringtone:', error);
    }
  };

  const startVibration = () => {
    const pattern = [1000, 2000, 1000, 2000];
    Vibration.vibrate(pattern, true);
  };

  const handleAnswer = async () => {
    if (isAnswering || !callData || !user) return;
    
    setIsAnswering(true);
    stopRingtone();
    Vibration.cancel();
    
    try {
      // Update call status to accepted
      const { error: updateError } = await supabase
        .from('call_notifications')
        .update({ 
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', callData.id);
      
      if (updateError) {
        error('Error accepting call:', updateError);
        Alert.alert('Error', 'Failed to accept call. Please try again.');
        return;
      }
      
      // Navigate to video call screen
      router.push({
        pathname: '/chat/video-call',
        params: {
          id: callData.channel_id,
          name: callData.caller_name,
          callType: callData.call_type,
          isIncoming: 'true'
        }
      });
      
      onAnswer();
      onClose();
      
    } catch (error) {
      error('Error handling answer:', error);
      Alert.alert('Error', 'Failed to answer call.');
    } finally {
      setIsAnswering(false);
    }
  };

  const handleReject = async () => {
    if (isRejecting || !callData || !user) return;
    
    setIsRejecting(true);
    stopRingtone();
    Vibration.cancel();
    
    try {
      // Update call status to rejected
      const { error: updateError } = await supabase
        .from('call_notifications')
        .update({ 
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .eq('id', callData.id);
      
      if (updateError) {
        error('Error rejecting call:', updateError);
      }
      
      onReject();
      onClose();
      
    } catch (error) {
      error('Error handling reject:', error);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleSendQuickMessage = async (message: string) => {
    if (!callData || !user || sendingMessage) return;
    setSendingMessage(true);
    try {
      const result = await sendMessage(user.id, callData.caller_id, message);
      if (result) {
        Toast.show({
          type: 'success',
          text1: 'Message sent',
          text2: `"${message}"`,
          visibilityTime: 2000,
        });
        setShowMessageModal(false);
        await handleReject();
        onClose();
        router.push(`/chat/${callData.caller_id}` as any);
      } else {
        Toast.show({
          type: 'error',
          text1: 'Failed to send message',
          text2: 'Please try again',
        });
      }
    } catch (error) {
      error('[CallOverlay] Error sending quick message:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to send message',
        text2: 'Please try again',
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleRemindMe = async () => {
    if (!callData || !user || isRejecting) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Remind Me',
          body: `Call ${callData.caller_name} back`,
          data: { type: 'call_reminder', caller_id: callData.caller_id },
          sound: 'default',
        },
        trigger: { seconds: 5 * 60 },
      });
      Toast.show({
        type: 'success',
        text1: "We'll remind you in 5 minutes",
        text2: `to call ${callData.caller_name} back`,
        visibilityTime: 2500,
      });
    } catch (e) {
      warn('[CallOverlay] Could not schedule reminder:', e);
      Toast.show({
        type: 'info',
        text1: "Call declined",
        text2: "We'll remind you to call back",
        visibilityTime: 2000,
      });
    }
    await handleReject();
    onClose();
  };

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: slideAnimation.value }],
    };
  });

  const animatedPulseStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulseAnimation.value, [0, 1], [1, 1.1]);
    return {
      transform: [{ scale }],
    };
  });

  const animatedRingStyle = useAnimatedStyle(() => {
    const opacityValue = ringOpacity.value ?? 0;
    const scaleValue = interpolate(opacityValue, [0, 1], [1, 1.3]);
    return {
      opacity: opacityValue,
      transform: [{ scale: scaleValue }],
    };
  });

  if (!visible || !callData) {
    return null;
  }

  return (
    <>
      <StatusBar hidden />
      <Animated.View style={[styles.overlay, animatedContainerStyle]}>
        <BlurView intensity={60} style={styles.blurBackground}>
          {/* Background gradient effect */}
          <View style={styles.gradientBackground} />
          
          {/* Call info section */}
          <View style={styles.callInfoSection}>
            <Text style={styles.incomingCallText}>
              {callData.call_type === 'video' ? 'Incoming Video Call' : 'Incoming Call'}
            </Text>
            
            {/* Caller avatar with animation */}
            <View style={styles.avatarContainer}>
              <Animated.View style={[styles.ringAnimation, animatedRingStyle]}>
                <View style={styles.ring} />
              </Animated.View>
              
              <Animated.View style={[styles.avatarWrapper, animatedPulseStyle]}>
                {callData.caller_avatar ? (
                  <Image
                    source={{ uri: callData.caller_avatar }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {callData.caller_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </Animated.View>
            </View>
            
            {/* Caller name */}
            <Text style={styles.callerName}>{callData.caller_name}</Text>
            <Text style={styles.callType}>
              {callData.call_type === 'video' ? 'Video Call' : 'Voice Call'}
            </Text>
          </View>
          
          {/* Action buttons */}
          <View style={styles.actionButtons}>
            {/* Reject button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={handleReject}
              disabled={isRejecting}
            >
              <PhoneOff size={32} color="white" strokeWidth={2} />
            </TouchableOpacity>
            
            {/* Answer button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.answerButton]}
              onPress={handleAnswer}
              disabled={isAnswering}
            >
              <Phone size={32} color="white" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          
          {/* Quick actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => setShowMessageModal(true)}
            >
              <Text style={styles.quickActionText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={handleRemindMe}
              disabled={isRejecting}
            >
              <Text style={styles.quickActionText}>Remind Me</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Animated.View>

      {/* Quick reply modal */}
      <Modal
        visible={showMessageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMessageModal(false)}
      >
        <TouchableOpacity
          style={styles.messageModalBackdrop}
          activeOpacity={1}
          onPress={() => setShowMessageModal(false)}
        />
        <View style={styles.messageModalContainer}>
          <View style={styles.messageModalContent}>
            <View style={styles.messageModalHeader}>
              <Text style={styles.messageModalTitle}>Quick Reply</Text>
              <TouchableOpacity
                onPress={() => setShowMessageModal(false)}
                style={styles.messageModalClose}
              >
                <X size={20} color="#fff" strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.messageModalScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.messageModalScrollContent}
            >
              {quickMessages.map((msg, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.messageModalOption}
                  onPress={() => handleSendQuickMessage(msg)}
                  disabled={sendingMessage}
                >
                  <Text style={styles.messageModalOptionText}>{msg}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.messageModalDecline}
              onPress={async () => {
                setShowMessageModal(false);
                await handleReject();
                onClose();
              }}
              disabled={sendingMessage}
            >
              <PhoneOff size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.messageModalDeclineText}>Decline Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 999,
  },
  blurBackground: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 80,
    paddingHorizontal: 30,
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 128, 128, 0.2)',
  },
  callInfoSection: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  incomingCallText: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 40,
    fontWeight: '500',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 30,
  },
  ringAnimation: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  avatarWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#008080',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
  },
  callerName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  callType: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginBottom: 40,
  },
  actionButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  answerButton: {
    backgroundColor: '#34C759',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  quickActionButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  quickActionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  messageModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  messageModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  messageModalContent: {
    backgroundColor: 'rgba(30, 30, 35, 0.98)',
    borderRadius: 16,
    padding: 16,
    maxHeight: SCREEN_HEIGHT * 0.5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  messageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  messageModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  messageModalClose: {
    padding: 4,
  },
  messageModalScroll: {
    maxHeight: SCREEN_HEIGHT * 0.32,
  },
  messageModalScrollContent: {
    paddingVertical: 4,
  },
  messageModalOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  messageModalOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'white',
  },
  messageModalDecline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    gap: 8,
  },
  messageModalDeclineText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});