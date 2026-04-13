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
  ScrollView,
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
import { sendMessage } from '../utils/chat';
import Toast from 'react-native-toast-message';
import { log, warn, error } from '../utils/productionLogger';


interface IncomingCallModalProps {
  visible: boolean;
  callData: {
    id: string;
    caller_id: string;
    caller_name?: string;
    call_type: 'audio' | 'video';
    channel_id?: string;
  } | null;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

export default function IncomingCallModal({ 
  visible, 
  callData, 
  onClose 
}: IncomingCallModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  // Prepopulated messages
  const quickMessages = [
    "Sorry, I can't talk right now",
    "I'll call you back later",
    "I'm in a meeting",
    "I'm driving, can't answer",
    "I'm busy, will message you soon",
    "Can't talk now, what's up?",
  ];

  // Animation values for pulsing effect
  const pulseScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.6);

  // Vibrate when modal is shown and start pulsing animation
  useEffect(() => {
    if (visible && callData) {
      // Start vibration pattern
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 1000, 200, 1000], true);
      }
      
      // Start pulsing animation
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        true
      );
      
      // Start ring opacity animation
      ringOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(0.3, { duration: 1000 })
        ),
        -1,
        true
      );
      
      // Stop vibration and animation when modal is closed
      return () => {
        Vibration.cancel();
        pulseScale.value = 1;
        ringOpacity.value = 0.6;
      };
    }
  }, [visible, callData]);

  const handleAnswer = async () => {
    if (!callData || !user || isAnswering) return;
    
    log('[IncomingCallModal] 📞 Answering call:', callData);
    setIsAnswering(true);
    
    try {
      // Update call status to accepted
      log('[IncomingCallModal] 📞 Updating call status to accepted for call ID:', callData.id);
      const { data, error: updateError } = await supabase
        .from('call_notifications')
        .update({ 
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', callData.id)
        .select();
      
      log('[IncomingCallModal] 📞 Call status update result:', { data, updateError });
      
      if (updateError) {
        error('[IncomingCallModal] Error accepting call:', updateError);
        return;
      }
      
      log('[IncomingCallModal] Call accepted, navigating to call screen');
      
      // Stop vibration
      Vibration.cancel();
      
      // Navigate to video call screen (use push to keep current screen in stack)
      log('[IncomingCallModal] 📞 Navigating to video call with params:', {
        id: callData.channel_id || callData.id,
        name: callData.caller_name || 'Unknown',
        callType: callData.call_type,
        isIncoming: 'true'
      });
      
      // Use push so call appears as modal overlay (WhatsApp-style)
      router.push({
        pathname: '/chat/video-call',
        params: {
          id: callData.channel_id || callData.id,
          name: callData.caller_name || 'Unknown',
          callType: callData.call_type,
          isIncoming: 'true', // Pass as string for URL parameters
          timestamp: Date.now().toString(), // Force parameter refresh
        }
      });
      
      onClose();
      
    } catch (error) {
      error('[IncomingCallModal] Error handling answer:', error);
    } finally {
      setIsAnswering(false);
    }
  };

  const handleReject = async () => {
    if (!callData || !user || isRejecting) return;
    
    setIsRejecting(true);
    
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
        error('[IncomingCallModal] Error rejecting call:', updateError);
        return;
      }
      
      log('[IncomingCallModal] Call rejected');
      
      // Stop vibration
      Vibration.cancel();
      
      onClose();
      
    } catch (error) {
      error('[IncomingCallModal] Error handling reject:', error);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDecline = () => {
    handleReject();
  };

  const handleSendQuickMessage = async (message: string) => {
    if (!callData || !user || sendingMessage) return;

    setSendingMessage(true);
    try {
      // Send the message
      const result = await sendMessage(user.id, callData.caller_id, message);
      
      if (result) {
        Toast.show({
          type: 'success',
          text1: 'Message sent',
          text2: `"${message}"`,
          visibilityTime: 2000,
        });
        
        // Close message modal
        setShowMessageModal(false);
        
        // Decline the call
        await handleReject();
        
        // Navigate to chat
        router.push(`/chat/${callData.caller_id}`);
      } else {
        Toast.show({
          type: 'error',
          text1: 'Failed to send message',
          text2: 'Please try again',
        });
      }
    } catch (error) {
      error('[IncomingCallModal] Error sending quick message:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to send message',
        text2: 'Please try again',
      });
    } finally {
      setSendingMessage(false);
    }
  };

  if (!callData || !themeColors) return null;

  // Animated styles
  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
  }));

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleDecline}
      statusBarTranslucent={true}
      hardwareAccelerated={true}
    >
      <View style={styles.container}>
        {/* Background overlay with gradient */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.9)', 'rgba(0, 0, 0, 0.95)']}
          style={styles.overlay}
        />
        
        {/* Call content with enhanced visibility */}
        <Animated.View style={[
          styles.content, 
          pulseAnimatedStyle,
          showMessageModal && styles.contentHidden
        ]}>
          {/* Caller info */}
          <View style={styles.callerInfo}>
            {/* Animated ring around avatar */}
            <Animated.View style={[styles.ringContainer, ringAnimatedStyle]}>
              <View style={styles.avatarContainer}>
                <Ionicons 
                  name="person" 
                  size={60} 
                  color={themeColors.primary.main} 
                />
              </View>
            </Animated.View>
            
            <Text style={[styles.callerName, { color: themeColors.text.primary }]}>
              {callData.caller_name || 'Unknown Caller'}
            </Text>
            
            <Text style={[styles.callType, { color: themeColors.text.secondary }]}>
              {callData.call_type === 'video' ? 'Video Call' : 'Audio Call'}
            </Text>
            
            <Text style={[styles.incomingText, { color: themeColors.text.secondary }]}>
              Incoming call...
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
              <Ionicons name="call" size={30} color="#FFFFFF" />
              <Text style={styles.buttonText}>Decline</Text>
            </TouchableOpacity>
            
            {/* Answer button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.answerButton]}
              onPress={handleAnswer}
              disabled={isAnswering}
            >
              <Ionicons 
                name={callData.call_type === 'video' ? 'videocam' : 'call'} 
                size={30} 
                color="#FFFFFF" 
              />
              <Text style={styles.buttonText}>
                {callData.call_type === 'video' ? 'Video' : 'Answer'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Additional options */}
          <View style={styles.additionalOptions}>
            <TouchableOpacity 
              style={styles.optionButton}
              onPress={() => {
                log('[IncomingCallModal] Message button pressed, opening modal');
                log('[IncomingCallModal] Current showMessageModal state:', showMessageModal);
                setShowMessageModal(true);
                log('[IncomingCallModal] Set showMessageModal to true');
              }}
            >
              <Ionicons name="chatbubble" size={24} color={themeColors.text.secondary} />
              <Text style={[styles.optionText, { color: themeColors.text.secondary }]}>
                Message
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.optionButton}>
              <Ionicons name="notifications-off" size={24} color={themeColors.text.secondary} />
              <Text style={[styles.optionText, { color: themeColors.text.secondary }]}>
                Remind me
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Quick Message Popup - Small alert style */}
        {showMessageModal && (
          <>
            {/* Backdrop */}
            <TouchableOpacity
              style={styles.popupBackdrop}
              activeOpacity={1}
              onPress={() => setShowMessageModal(false)}
            />
            
            {/* Popup Content */}
            <Animated.View 
              style={[
                styles.messagePopup,
                { backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF' }
              ]}
              entering={SlideInDown.duration(200)}
              exiting={SlideOutDown.duration(200)}
              pointerEvents="auto"
            >
              {/* Header */}
              <View style={styles.popupHeader}>
                <Text style={[
                  styles.popupTitle, 
                  { color: isDarkMode ? '#FFFFFF' : '#000000' }
                ]}>
                  Quick Reply
                </Text>
                <TouchableOpacity
                  onPress={() => setShowMessageModal(false)}
                  style={styles.popupCloseButton}
                >
                  <Ionicons 
                    name="close" 
                    size={18} 
                    color={isDarkMode ? '#FFFFFF' : '#000000'} 
                  />
                </TouchableOpacity>
              </View>

              {/* Quick Messages List */}
              <ScrollView 
                style={styles.popupMessagesList} 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.popupMessagesContent}
              >
                {quickMessages.map((message, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.popupMessageButton,
                      { 
                        backgroundColor: isDarkMode ? '#2C2C2E' : '#F2F2F7',
                        borderColor: isDarkMode ? '#3A3A3C' : '#E5E5EA',
                      }
                    ]}
                    onPress={() => {
                      log('[IncomingCallModal] Quick message selected:', message);
                      handleSendQuickMessage(message);
                    }}
                    disabled={sendingMessage}
                  >
                    <Text style={[
                      styles.popupMessageText, 
                      { color: isDarkMode ? '#FFFFFF' : '#000000' }
                    ]}>
                      {message}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Decline Call Button */}
              <TouchableOpacity
                style={styles.popupDeclineButton}
                onPress={async () => {
                  log('[IncomingCallModal] Decline call from popup');
                  setShowMessageModal(false);
                  await handleReject();
                }}
                disabled={sendingMessage}
              >
                <Ionicons name="call" size={16} color="#FFFFFF" />
                <Text style={styles.popupDeclineText}>Decline Call</Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    width: width * 0.95,
    maxWidth: 450,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 25,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 15,
    },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 15,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  contentHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  callerInfo: {
    alignItems: 'center',
    marginBottom: 40,
  },
  ringContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: 'rgba(52, 199, 89, 0.6)',
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callerName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  callType: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  incomingText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    color: '#34C759',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 30,
  },
  actionButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  answerButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  additionalOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  optionButton: {
    alignItems: 'center',
    padding: 10,
  },
  optionText: {
    fontSize: 12,
    marginTop: 4,
  },
  popupBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 999,
  },
  messagePopup: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    width: width * 0.85,
    maxWidth: 400,
    borderRadius: 16,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 1000,
    maxHeight: height * 0.5,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    marginBottom: 8,
  },
  popupTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  popupCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupMessagesList: {
    maxHeight: height * 0.35,
  },
  popupMessagesContent: {
    paddingBottom: 8,
  },
  popupMessageButton: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  popupMessageText: {
    fontSize: 14,
    fontWeight: '500',
  },
  popupDeclineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    gap: 6,
  },
  popupDeclineText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
}); 