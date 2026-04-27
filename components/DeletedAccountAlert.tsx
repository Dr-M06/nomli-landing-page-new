import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Linking, Animated } from 'react-native';
import { X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { SUPPORT_EMAIL } from '../constants/ContactEmails';

interface DeletedAccountAlertProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function DeletedAccountAlert({ visible, onDismiss }: DeletedAccountAlertProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  
  // Animation values
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Reset animations
      scaleAnim.setValue(0);
      rotateAnim.setValue(0);
      
      // Scale and rotate animation
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();

      // Continuous pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [visible]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleCreateNewAccount = () => {
    onDismiss();
    router.push('/auth/signup');
  };

  const handleContactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Account%20Deletion%20Issue`);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <BlurView intensity={20} style={StyleSheet.absoluteFillObject} />
        
        <View style={[styles.container, { backgroundColor: isDarkMode ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)' }]}>
          {/* Close button */}
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={onDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={18} color={themeColors.neutral.subtext} strokeWidth={2.5} />
          </TouchableOpacity>

          {/* Icon - sleek animated design */}
          <Animated.View 
            style={[
              styles.iconContainer,
              {
                transform: [
                  { scale: scaleAnim },
                  { rotate: rotate },
                ],
              },
            ]}
          >
            <Animated.View
              style={{
                transform: [{ scale: pulseAnim }],
              }}
            >
              <LinearGradient
                colors={['#FF6B6B', '#EE5A6F']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <View style={styles.iconCircle}>
                  <View style={styles.iconSlash} />
                </View>
              </LinearGradient>
            </Animated.View>
            
            {/* Outer ring animation */}
            <Animated.View
              style={[
                styles.iconRing,
                {
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 1.15],
                    outputRange: [0.4, 0],
                  }),
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
          </Animated.View>

          {/* Title - shorter and punchier */}
          <Text style={[styles.title, { color: themeColors.neutral.text }]}>
            Account Deleted
          </Text>

          {/* Message - more casual, Gen Z tone */}
          <Text style={[styles.message, { color: themeColors.neutral.subtext }]}>
            This account no longer exists and can't be recovered
          </Text>

          {/* Primary action - Create new account */}
          <TouchableOpacity 
            style={styles.button}
            onPress={handleCreateNewAccount}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#FF6B6B', '#EE5A6F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>create new account</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Secondary actions */}
          <View style={styles.secondaryActions}>
            <TouchableOpacity 
              onPress={handleContactSupport}
              style={styles.linkButton}
            >
              <Text style={[styles.linkText, { color: themeColors.neutral.subtext }]}>
                email support
              </Text>
            </TouchableOpacity>
            
            <Text style={[styles.separator, { color: themeColors.neutral.subtext }]}>•</Text>
            
            <TouchableOpacity 
              onPress={onDismiss}
              style={styles.linkButton}
            >
              <Text style={[styles.linkText, { color: themeColors.neutral.subtext }]}>
                go back
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.2)',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(120, 120, 120, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  iconSlash: {
    width: 26,
    height: 2.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 1.25,
    transform: [{ rotate: '45deg' }],
    position: 'absolute',
  },
  iconRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  title: {
    fontSize: 20,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  message: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    letterSpacing: -0.2,
    paddingHorizontal: 8,
  },
  button: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  linkButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  linkText: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    letterSpacing: -0.2,
    opacity: 0.7,
  },
  separator: {
    fontSize: 13,
    opacity: 0.4,
  },
});

