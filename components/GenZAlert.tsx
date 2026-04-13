import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { CheckCircle2, X } from 'lucide-react-native';
import { Colors, getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { useTheme } from '../contexts/ThemeContext';

interface GenZAlertProps {
  visible: boolean;
  message: string;
  submessage?: string;
  onClose: () => void;
  duration?: number;
}

export default function GenZAlert({
  visible,
  message,
  submessage,
  onClose,
  duration = 4000,
}: GenZAlertProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
      ]).start();

      // Auto dismiss after longer duration (6 seconds instead of 4)
      autoDismissTimerRef.current = setTimeout(() => {
        handleClose();
      }, duration || 6000);

      return () => {
        if (autoDismissTimerRef.current) {
          clearTimeout(autoDismissTimerRef.current);
        }
      };
    } else {
      // Clear timer if alert is hidden
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
      
      // Animate out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    // Clear auto-dismiss timer
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }

    // Animate out
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleClose}
        style={styles.touchableArea}
      >
        <Animated.View
          style={[
            styles.alert,
            {
              backgroundColor: themeColors.neutral.card,
              borderColor: themeColors.neutral.border,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim },
              ],
              opacity: opacityAnim,
            },
          ]}
        >
          <View style={styles.content}>
            <View style={[styles.iconCircle, { backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
              <CheckCircle2 size={20} color="#22C55E" strokeWidth={2.5} />
            </View>
            
            <View style={styles.textContainer}>
              <Text style={[styles.message, { color: themeColors.neutral.text }]}>
                {message}
              </Text>
              {submessage && (
                <Text style={[styles.submessage, { color: themeColors.neutral.subtext }]}>
                  {submessage}
                </Text>
              )}
            </View>

            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={18} color={themeColors.neutral.subtext} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'box-none',
  },
  touchableArea: {
    width: '100%',
    alignItems: 'center',
  },
  alert: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    minWidth: 280,
    maxWidth: '90%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  message: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.semibold,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  submessage: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    letterSpacing: -0.2,
    lineHeight: FontSizes.caption * 1.4,
  },
  closeButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.xs,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'transparent',
  },
});

