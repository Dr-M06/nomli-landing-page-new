import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import EnhancedAvatar from './EnhancedAvatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MessageNotificationPopupProps {
  message: {
    id: string;
    content: string;
    sender_id: string;
    sender_name: string;
    sender_avatar?: string;
    created_at: string;
  };
  isVisible: boolean;
  onClose: () => void;
  onOpenChat: () => void;
}

const { width: screenWidth } = Dimensions.get('window');

export default function MessageNotificationPopup({
  message,
  isVisible,
  onClose,
  onOpenChat,
}: MessageNotificationPopupProps) {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  
  const slideAnim = useRef(new Animated.Value(-screenWidth)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible) {
      // Slide in from left
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // No auto-hide - popup stays until manually dismissed
    }
  }, [isVisible]);

  const hidePopup = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -screenWidth,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const handleOpenChat = () => {
    hidePopup();
    onOpenChat();
  };

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: themeColors.surface,
          borderColor: themeColors.border,
          shadowColor: themeColors.shadow,
          transform: [{ translateX: slideAnim }],
          opacity: opacityAnim,
          top: Platform.OS === 'ios' 
            ? insets.top + 16 
            : insets.top + 8, // Less margin on Android
        },
      ]}
    >
      {/* Close button */}
      <TouchableOpacity onPress={hidePopup} style={styles.closeButton}>
        <Ionicons name="close" size={18} color={themeColors.textTertiary} />
      </TouchableOpacity>
      
      {/* Message content */}
      <TouchableOpacity onPress={handleOpenChat} style={styles.messageContent}>
        <View style={styles.avatarContainer}>
          <EnhancedAvatar
            avatarUrl={message.sender_avatar}
            fullName={message.sender_name}
            size={40}
            isDarkMode={isDarkMode}
          />
        </View>

        <View style={styles.textContainer}>
          <Text style={[styles.senderName, { color: themeColors.text }]} numberOfLines={1}>
            {message.sender_name}
          </Text>
          <Text style={[styles.messageText, { color: themeColors.textSecondary }]} numberOfLines={2}>
            {message.content}
          </Text>
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity
            onPress={handleOpenChat}
            style={[styles.replyButton, { backgroundColor: themeColors.primary.main }]}
          >
            <Ionicons name="chatbubble" size={16} color="white" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, // Will be set dynamically
    left: 16,
    right: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingRight: 48, // Extra padding on right for close button
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  messageContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  senderName: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
    lineHeight: 20,
  },
  messageText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    opacity: 0.8,
  },
  actionContainer: {
    alignItems: 'center',
  },
  replyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
