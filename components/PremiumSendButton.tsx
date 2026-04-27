import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Animated,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Send, MessageCircle, PaperPlane } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

interface PremiumSendButtonProps {
  onPress?: () => void;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'outline' | 'minimal';
  loading?: boolean;
  disabled?: boolean;
  style?: any;
  icon?: 'send' | 'message' | 'paperplane';
}

export default function PremiumSendButton({
  onPress,
  size = 'medium',
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  icon = 'send'
}: PremiumSendButtonProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // Animation for premium feedback
  const scaleAnim = new Animated.Value(1);
  const pulseAnim = new Animated.Value(1);

  const handlePress = () => {
    if (loading || disabled) return;

    // Premium animation sequence
    Animated.sequence([
      // Press down
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.92,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 80,
          useNativeDriver: true,
        }),
      ]),
      // Release with bounce
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 300,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.spring(pulseAnim, {
          toValue: 1,
          tension: 300,
          friction: 10,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    onPress?.();
  };

  // Get size styles - TikTok style compact sizing
  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 16,
          fontSize: 12,
          iconSize: 14,
          height: 36, // Match follow button height
          minWidth: 36,
        };
      case 'large':
        return {
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 24,
          fontSize: 15,
          iconSize: 18,
          height: 48, // Match follow button height
          minWidth: 48,
        };
      default: // medium
        return {
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 20,
          fontSize: 13,
          iconSize: 16,
          height: 40, // Match follow button height
          minWidth: 40,
        };
    }
  };

  // Get variant styles with premium design
  const getVariantStyles = () => {
    switch (variant) {
      case 'outline':
        return {
          backgroundColor: isDarkMode 
            ? 'rgba(99, 102, 241, 0.08)' 
            : 'rgba(99, 102, 241, 0.06)',
          borderWidth: 1.5,
          borderColor: '#6366F1',
          textColor: '#6366F1',
          shadowColor: 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
        };
      case 'minimal':
        return {
          backgroundColor: isDarkMode 
            ? 'rgba(99, 102, 241, 0.12)' 
            : 'rgba(99, 102, 241, 0.08)',
          borderWidth: 0,
          textColor: '#6366F1',
          shadowColor: 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
        };
      default: // primary
        return {
          backgroundColor: '#6366F1', // Fallback color for gradient
          borderWidth: 0,
          textColor: 'white',
          shadowColor: 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
        };
    }
  };

  const sizeStyles = getSizeStyles();
  const variantStyles = getVariantStyles();

  const renderIcon = () => {
    if (loading) {
      return <ActivityIndicator size="small" color={variantStyles.textColor} />;
    }
    
    const iconProps = {
      size: sizeStyles.iconSize,
      color: variantStyles.textColor,
      strokeWidth: 2
    };

    switch (icon) {
      case 'message':
        return <MessageCircle {...iconProps} />;
      case 'paperplane':
        return <PaperPlane {...iconProps} />;
      default:
        return <Send {...iconProps} />;
    }
  };

  // Render button with premium styling
  const ButtonWrapper = ({ children, buttonStyle }: any) => {
    if (variant === 'primary') {
      // Use gradient for primary state
      return (
        <LinearGradient
          colors={['#6366F1', '#4F46E5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.button,
            {
              height: sizeStyles.height,
              minWidth: sizeStyles.minWidth,
              paddingHorizontal: sizeStyles.paddingHorizontal,
              borderRadius: sizeStyles.borderRadius,
              borderWidth: variantStyles.borderWidth,
              borderColor: variantStyles.borderColor,
              shadowColor: variantStyles.shadowColor,
              shadowOffset: variantStyles.shadowOffset,
              shadowOpacity: variantStyles.shadowOpacity,
              shadowRadius: variantStyles.shadowRadius,
              elevation: variantStyles.elevation,
            },
            buttonStyle
          ]}
        >
          {children}
        </LinearGradient>
      );
    }
    
    // Regular view for other variants
    return (
      <View
        style={[
          styles.button,
          {
            height: sizeStyles.height,
            minWidth: sizeStyles.minWidth,
            paddingHorizontal: sizeStyles.paddingHorizontal,
            borderRadius: sizeStyles.borderRadius,
            backgroundColor: variantStyles.backgroundColor,
            borderWidth: variantStyles.borderWidth,
            borderColor: variantStyles.borderColor,
            shadowColor: variantStyles.shadowColor,
            shadowOffset: variantStyles.shadowOffset,
            shadowOpacity: variantStyles.shadowOpacity,
            shadowRadius: variantStyles.shadowRadius,
            elevation: variantStyles.elevation,
          },
          buttonStyle
        ]}
      >
        {children}
      </View>
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.85 : 1,
        },
        style
      ]}
    >
      <ButtonWrapper>
        <Animated.View
          style={[
            styles.buttonContent,
            {
              transform: [
                { scale: scaleAnim },
                { scale: pulseAnim }
              ],
            }
          ]}
        >
          {renderIcon()}
        </Animated.View>
      </ButtonWrapper>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow and elevation are handled in variant styles
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
});
