import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { UserX, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface KickedFromStreamModalProps {
  visible: boolean;
  reason?: string;
  onClose: () => void;
}

export default function KickedFromStreamModal({
  visible,
  reason,
  onClose,
}: KickedFromStreamModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const iconRotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset animations
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      iconRotateAnim.setValue(0);

      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(iconRotateAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(iconRotateAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [visible]);

  const iconRotation = iconRotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '15deg'],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <BlurView intensity={80} style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={[styles.modalCard, { backgroundColor: themeColors.neutral.card }]}>
            {/* Icon Container with Gradient Background */}
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={['#FF3B30', '#FF6B6B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <Animated.View
                  style={{
                    transform: [{ rotate: iconRotation }],
                  }}
                >
                  <UserX size={32} color="#FFFFFF" strokeWidth={2.5} />
                </Animated.View>
              </LinearGradient>
            </View>

            {/* Title */}
            <Text style={[styles.title, { color: themeColors.neutral.text }]}>
              You have been removed
            </Text>

            {/* Subtitle */}
            <Text style={[styles.subtitle, { color: themeColors.neutral.subtext }]}>
              {reason || 'You have been removed by a moderator.'}
            </Text>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: themeColors.neutral.border }]} />

            {/* Info Message */}
            <View style={styles.infoContainer}>
              <AlertCircle size={16} color={themeColors.neutral.subtext} strokeWidth={2} />
              <Text style={[styles.infoText, { color: themeColors.neutral.subtext }]}>
                You can no longer view this stream
              </Text>
            </View>

            {/* Action Button */}
            <TouchableOpacity
              style={styles.button}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#FF3B30', '#FF6B6B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>OK</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  container: {
    width: width - 40,
    maxWidth: 400,
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
  },
  iconContainer: {
    marginBottom: 20,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 8,
    letterSpacing: -0.2,
  },
  divider: {
    width: '100%',
    height: 1,
    marginBottom: 20,
    opacity: 0.2,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 12,
    width: '100%',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  button: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
});

