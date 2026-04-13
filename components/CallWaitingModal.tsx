import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Vibration,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import useAuth from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming,
  withSequence,
  SlideInDown,
  SlideOutDown
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { log, warn, error } from '../utils/productionLogger';


interface CallWaitingModalProps {
  visible: boolean;
  incomingCall: {
    id: string;
    caller_id: string;
    caller_name?: string;
    call_type: 'audio' | 'video';
    channel_id?: string;
    caller_avatar?: string;
  } | null;
  currentCall: {
    id: string;
    caller_name?: string;
    call_type: 'audio' | 'video';
    channel_id?: string;
  } | null;
  onAccept: () => void;
  onReject: () => void;
  onEndAndAccept: () => void;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

export default function CallWaitingModal({ 
  visible, 
  incomingCall,
  currentCall,
  onAccept,
  onReject,
  onEndAndAccept,
  onClose
}: CallWaitingModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [isProcessing, setIsProcessing] = useState(false);

  // If currentCall is a placeholder (user is on call screen), show a generic message
  const isPlaceholderCall = currentCall?.id === 'on-call-screen' || currentCall?.isOnCallScreen;

  // Animation values for pulsing effect
  const pulseScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.6);

  // Vibrate when modal is shown and start pulsing animation
  useEffect(() => {
    if (visible && incomingCall) {
      // Dismiss keyboard when call waiting modal appears so user can interact with buttons
      Keyboard.dismiss();
      
      // Start vibration pattern (softer than regular call)
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 500, 200, 500], true);
      }
      
      // Start pulsing animation
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        true
      );
      
      // Start ring opacity animation
      ringOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0.4, { duration: 800 })
        ),
        -1,
        true
      );
    } else {
      // Stop animations when hidden
      pulseScale.value = 1;
      ringOpacity.value = 0.6;
      Vibration.cancel();
    }

    return () => {
      Vibration.cancel();
    };
  }, [visible, incomingCall]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
  }));

  const handleAccept = async () => {
    if (!incomingCall || isProcessing) return;
    setIsProcessing(true);
    Vibration.cancel();
    onAccept();
    setIsProcessing(false);
  };

  const handleReject = async () => {
    if (!incomingCall || isProcessing) return;
    setIsProcessing(true);
    
    try {
      // Update call status to rejected
      const { error } = await supabase
        .from('call_notifications')
        .update({ 
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .eq('id', incomingCall.id);

      if (error) {
        error('Error rejecting call:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to reject call',
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Call Rejected',
          text2: 'The call has been rejected',
        });
      }
    } catch (error) {
      error('Error handling reject:', error);
    } finally {
      Vibration.cancel();
      onReject();
      setIsProcessing(false);
    }
  };

  const handleEndAndAccept = async () => {
    if (!incomingCall || !currentCall || isProcessing) return;
    setIsProcessing(true);
    Vibration.cancel();
    onEndAndAccept();
    setIsProcessing(false);
  };

  if (!visible || !incomingCall) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View 
        entering={SlideInDown.duration(300)}
        exiting={SlideOutDown.duration(200)}
        style={styles.container}
      >
        <LinearGradient
          colors={isDarkMode 
            ? ['rgba(15, 23, 42, 0.98)', 'rgba(30, 41, 59, 0.98)'] 
            : ['rgba(255, 255, 255, 0.98)', 'rgba(240, 245, 250, 0.98)']
          }
          style={styles.modal}
        >
          {/* Current Call Info */}
          {currentCall && (
            <View style={styles.currentCallSection}>
              <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
                Current Call
              </Text>
              <View style={styles.currentCallInfo}>
                <Ionicons 
                  name={isPlaceholderCall 
                    ? 'call' 
                    : (currentCall.call_type === 'video' ? 'videocam' : 'call')
                  } 
                  size={20} 
                  color={themeColors.textSecondary} 
                />
                <Text style={[styles.currentCallName, { color: themeColors.text }]}>
                  {isPlaceholderCall 
                    ? 'Active Call' 
                    : (currentCall.caller_name || 'Unknown')
                  }
                </Text>
              </View>
            </View>
          )}

          {/* Divider */}
          {currentCall && (
            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
          )}

          {/* Incoming Call Info */}
          <View style={styles.incomingCallSection}>
            <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
              Incoming Call
            </Text>
            
            {/* Avatar */}
            <Animated.View style={[styles.avatarContainer, pulseAnimatedStyle]}>
              {incomingCall.caller_avatar ? (
                <Animated.Image
                  source={{ uri: incomingCall.caller_avatar }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: themeColors.primary.main }]}>
                  <Text style={styles.avatarText}>
                    {incomingCall.caller_name?.charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              {/* Pulsing ring */}
              <Animated.View 
                style={[
                  styles.pulseRing, 
                  ringAnimatedStyle,
                  { borderColor: themeColors.primary.main }
                ]} 
              />
            </Animated.View>

            {/* Caller Name */}
            <Text style={[styles.callerName, { color: themeColors.text }]}>
              {incomingCall.caller_name || 'Unknown Caller'}
            </Text>
            
            {/* Call Type */}
            <Text style={[styles.callType, { color: themeColors.textSecondary }]}>
              {incomingCall.call_type === 'video' ? 'Video Call' : 'Audio Call'}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {/* Reject Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={handleReject}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['#EF4444', '#DC2626']}
                style={styles.actionButtonGradient}
              >
                <Ionicons name="close" size={32} color="white" />
              </LinearGradient>
              <Text style={styles.actionButtonLabel}>Reject</Text>
            </TouchableOpacity>

            {/* Accept & Hold Current Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={handleAccept}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={styles.actionButtonGradient}
              >
                <Ionicons name="checkmark" size={32} color="white" />
              </LinearGradient>
              <Text style={styles.actionButtonLabel}>Accept & Hold</Text>
            </TouchableOpacity>

            {/* End Current & Accept Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.endAndAcceptButton]}
              onPress={handleEndAndAccept}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                style={styles.actionButtonGradient}
              >
                <Ionicons name="swap-horizontal" size={32} color="white" />
              </LinearGradient>
              <Text style={styles.actionButtonLabel}>End & Accept</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    width: width * 0.9,
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  currentCallSection: {
    width: '100%',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  currentCallInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currentCallName: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    width: '100%',
    height: 1,
    marginVertical: 20,
  },
  incomingCallSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'white',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  callerName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  callType: {
    fontSize: 14,
    textAlign: 'center',
  },
  actionsContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  actionButton: {
    alignItems: 'center',
    flex: 1,
  },
  actionButtonGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  rejectButton: {
    // Styles handled by gradient
  },
  acceptButton: {
    // Styles handled by gradient
  },
  endAndAcceptButton: {
    // Styles handled by gradient
  },
});

