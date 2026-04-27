import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WifiOff, RefreshCw, X, AlertCircle } from 'lucide-react-native';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SlowNetworkAlertProps {
  visible: boolean;
  onDismiss: () => void;
  onRefresh?: () => void;
}

// Global state to track slow network detection
let slowNetworkDetected = false;
let slowNetworkListeners: Set<() => void> = new Set();

export const detectSlowNetwork = () => {
  if (!slowNetworkDetected) {
    slowNetworkDetected = true;
    slowNetworkListeners.forEach(listener => listener());
  }
};

export const resetSlowNetworkDetection = () => {
  slowNetworkDetected = false;
};

export const addSlowNetworkListener = (listener: () => void) => {
  slowNetworkListeners.add(listener);
  return () => {
    slowNetworkListeners.delete(listener);
  };
};

const SlowNetworkAlert: React.FC<SlowNetworkAlertProps> = ({
  visible,
  onDismiss,
  onRefresh,
}) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [showModal, setShowModal] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowModal(false);
      });
    }
  }, [visible]);

  const handleDismiss = () => {
    resetSlowNetworkDetection();
    onDismiss();
  };

  const handleRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onRefresh) {
      onRefresh();
    }
    handleDismiss();
  };

  if (!showModal) return null;

  return (
    <Modal
      visible={showModal}
      transparent={true}
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={isDarkMode 
                ? ['rgba(20, 20, 20, 0.98)', 'rgba(30, 30, 30, 0.98)']
                : ['rgba(255, 255, 255, 0.98)', 'rgba(250, 250, 250, 0.98)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalContent}
            >
              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleDismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={themeColors.textSecondary} strokeWidth={2.5} />
              </TouchableOpacity>

              {/* Icon */}
              <View style={[styles.iconContainer, { backgroundColor: themeColors.warning?.main + '20' }]}>
                <WifiOff size={40} color={themeColors.warning?.main || '#F59E0B'} strokeWidth={2} />
              </View>

              {/* Title */}
              <Text style={[styles.title, { color: themeColors.text }]}>
                Slow Internet Connection
              </Text>

              {/* Message */}
              <Text style={[styles.message, { color: themeColors.textSecondary }]}>
                Your internet connection appears to be slow. This may affect app performance.
              </Text>

              {/* Instructions */}
              <View style={styles.instructionsContainer}>
                <View style={styles.instructionItem}>
                  <View style={[styles.instructionBullet, { backgroundColor: themeColors.primary.main }]} />
                  <Text style={[styles.instructionText, { color: themeColors.text }]}>
                    Try refreshing the app by pulling down
                  </Text>
                </View>
                <View style={styles.instructionItem}>
                  <View style={[styles.instructionBullet, { backgroundColor: themeColors.primary.main }]} />
                  <Text style={[styles.instructionText, { color: themeColors.text }]}>
                    Close and reopen the app
                  </Text>
                </View>
                <View style={styles.instructionItem}>
                  <View style={[styles.instructionBullet, { backgroundColor: themeColors.primary.main }]} />
                  <Text style={[styles.instructionText, { color: themeColors.text }]}>
                    Check your Wi-Fi or mobile data connection
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonsContainer}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleDismiss}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>
                    Dismiss
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleRefresh}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[themeColors.primary.main, themeColors.primary.dark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryButtonGradient}
                  >
                    <RefreshCw size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.primaryButtonText}>Refresh App</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
  modalContent: {
    borderRadius: 24,
    padding: 24,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
    } : {
      elevation: 16,
    }),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  instructionsContainer: {
    marginBottom: 24,
    gap: 12,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  instructionBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    flexShrink: 0,
  },
  instructionText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    } : {
      elevation: 8,
    }),
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

export default SlowNetworkAlert;

