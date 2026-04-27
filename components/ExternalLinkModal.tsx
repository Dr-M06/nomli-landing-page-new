import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { ExternalLink, X, Shield } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontSizes, Spacing } from '../constants/Theme';

interface ExternalLinkModalProps {
  visible: boolean;
  url: string;
  onCancel: () => void;
  onOpen: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ExternalLinkModal({
  visible,
  url,
  onCancel,
  onOpen,
}: ExternalLinkModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0.8,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // Truncate URL for display
  const displayUrl = url.length > 50 ? `${url.substring(0, 47)}...` : url;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: backdropOpacity,
          },
        ]}
      >
        <BlurView
          intensity={isDarkMode ? 20 : 30}
          tint={isDarkMode ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={styles.container}>
        <Animated.View
          style={[
            styles.modal,
            {
              backgroundColor: isDarkMode
                ? 'rgba(30, 30, 30, 0.95)'
                : 'rgba(255, 255, 255, 0.95)',
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Icon */}
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: isDarkMode
                  ? 'rgba(255, 107, 107, 0.15)'
                  : 'rgba(255, 107, 107, 0.1)',
              },
            ]}
          >
            <Shield
              size={32}
              color={isDarkMode ? '#FF6B6B' : '#FF6B6B'}
              strokeWidth={2}
            />
          </View>

          {/* Title */}
          <Text
            style={[
              styles.title,
              {
                color: themeColors.text,
              },
            ]}
          >
            external link
          </Text>

          {/* URL Preview */}
          <View
            style={[
              styles.urlContainer,
              {
                backgroundColor: isDarkMode
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(0, 0, 0, 0.03)',
              },
            ]}
          >
            <ExternalLink
              size={14}
              color={themeColors.textSecondary}
              style={styles.urlIcon}
            />
            <Text
              style={[
                styles.urlText,
                {
                  color: themeColors.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {displayUrl}
            </Text>
          </View>

          {/* Warning Text */}
          <Text
            style={[
              styles.warningText,
              {
                color: themeColors.textSecondary,
              },
            ]}
          >
            be careful about sharing personal info, downloading files, or entering passwords
          </Text>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                {
                  backgroundColor: isDarkMode
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.05)',
                },
              ]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.buttonText,
                  styles.cancelButtonText,
                  {
                    color: themeColors.text,
                  },
                ]}
              >
                cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.openButton,
                {
                  backgroundColor: themeColors.primary.main,
                },
              ]}
              onPress={onOpen}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.buttonText,
                  styles.openButtonText,
                ]}
              >
                open link
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modal: {
    width: SCREEN_WIDTH - Spacing.xl * 2,
    maxWidth: 400,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 20,
    },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.md,
    letterSpacing: -0.5,
  },
  urlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    width: '100%',
  },
  urlIcon: {
    marginRight: Spacing.xs,
  },
  urlText: {
    fontSize: FontSizes.sm,
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  warningText: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    // Styled via backgroundColor in component
  },
  openButton: {
    // Styled via backgroundColor in component
  },
  buttonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  cancelButtonText: {
    // Styled via color in component
  },
  openButtonText: {
    color: '#FFFFFF',
  },
});

