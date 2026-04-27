import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { useWatermark } from '../contexts/WatermarkContext';
import { FontSizes, FontFamily, BorderRadius, Spacing } from '../constants/Theme';
import AppLogo from '../components/AppLogo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AppWatermarkProps {
  visible?: boolean;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'bottom-center';
  size?: 'small' | 'medium' | 'large';
  opacity?: number;
  style?: any;
  variant?: 'gradient' | 'solid' | 'outline' | 'minimal';
  showIcon?: boolean;
  text?: string;
}

export default function AppWatermark({
  visible = true,
  position = 'bottom-right',
  size = 'medium',
  opacity = 0.8,
  style,
  variant = 'gradient',
  showIcon = true,
  text = 'Nomli Mingle'
}: AppWatermarkProps) {
  const { isDarkMode } = useTheme();
  const { showWatermarks } = useWatermark();
  const themeColors = getThemeColors(isDarkMode);

  // TikTok-style slow animation: moves left-right and top-bottom
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || !showWatermarks) return;

    // Horizontal animation: slow left-right movement (TikTok style)
    // Moves ~15-20 pixels left and right over 8-10 seconds
    const horizontalAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: 15, // Move right
          duration: 8000, // 8 seconds
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: -15, // Move left
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0, // Return to center
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // Vertical animation: slow top-bottom movement (TikTok style)
    // Moves ~10-15 pixels up and down over 6-8 seconds (slightly faster than horizontal)
    const verticalAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: 12, // Move down
          duration: 7000, // 7 seconds
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -12, // Move up
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0, // Return to center
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // Start both animations
    horizontalAnimation.start();
    verticalAnimation.start();

    return () => {
      horizontalAnimation.stop();
      verticalAnimation.stop();
    };
  }, [visible, showWatermarks, translateX, translateY]);

  if (!visible || !showWatermarks) return null;

  const getPositionStyle = () => {
    const baseStyle = {
      position: 'absolute' as const,
      zIndex: 10,
    };

    switch (position) {
      case 'bottom-right':
        return {
          ...baseStyle,
          bottom: Spacing.sm,
          right: Spacing.sm,
        };
      case 'bottom-left':
        return {
          ...baseStyle,
          bottom: Spacing.sm,
          left: Spacing.sm,
        };
      case 'top-right':
        return {
          ...baseStyle,
          top: Spacing.sm,
          right: Spacing.sm,
        };
      case 'top-left':
        return {
          ...baseStyle,
          top: Spacing.sm,
          left: Spacing.sm,
        };
      case 'center':
        return {
          ...baseStyle,
          top: '50%',
          left: '50%',
          transform: [{ translateX: -50 }, { translateY: -50 }],
        };
      case 'bottom-center':
        return {
          ...baseStyle,
          bottom: Spacing.sm,
          left: 0,
          right: 0,
          alignItems: 'center',
        };
      default:
        return baseStyle;
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return {
          paddingVertical: 2,
          paddingHorizontal: Spacing.xs,
          borderRadius: BorderRadius.sm,
        };
      case 'large':
        return {
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.md,
          borderRadius: BorderRadius.md,
        };
      case 'medium':
      default:
        return {
          paddingVertical: 3,
          paddingHorizontal: Spacing.sm,
          borderRadius: BorderRadius.sm,
        };
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'small':
        return 8;
      case 'large':
        return 12;
      case 'medium':
      default:
        return 9;
    }
  };

  const getVariantStyle = () => {
    switch (variant) {
      case 'solid':
        return {
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(10px)',
        };
      case 'outline':
        return {
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderWidth: 0.5,
          borderColor: 'rgba(255,255,255,0.3)',
          backdropFilter: 'blur(20px)',
        };
      case 'minimal':
        return {
          backgroundColor: 'transparent',
        };
      case 'gradient':
      default:
        return {
          backgroundColor: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(15px)',
        };
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'outline':
      case 'minimal':
        return 'white';
      default:
        return 'white';
    }
  };

  const getLogoSize = () => {
    switch (size) {
      case 'small':
        return 8;
      case 'large':
        return 14;
      case 'medium':
      default:
        return 10;
    }
  };

  const renderContent = () => {
    if (variant === 'minimal') {
      return (
        <View style={styles.watermarkContent}>
          {showIcon && (
            <AppLogo
              size={getLogoSize()}
              style={styles.logoIcon}
            />
          )}
          <Text
            style={[
              styles.watermarkText,
              {
                color: getTextColor(),
                fontSize: getTextSize(),
                fontFamily: FontFamily.medium,
                textShadowColor: 'rgba(0, 0, 0, 0.8)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
              }
            ]}
          >
            {text}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.watermarkContent}>
        {showIcon && (
          <AppLogo
            size={getLogoSize()}
            style={styles.logoIcon}
          />
        )}
        <Text
          style={[
            styles.watermarkText,
            {
              color: getTextColor(),
              fontSize: getTextSize(),
              fontFamily: FontFamily.medium,
            }
          ]}
        >
          {text}
        </Text>
      </View>
    );
  };

  const containerStyle = [
    styles.watermarkContainer,
    getSizeStyle(),
    getVariantStyle(),
    { opacity },
    style
  ];

  // Animated transform for TikTok-style movement
  const animatedStyle = {
    transform: [
      { translateX },
      { translateY },
    ],
  };

  // For bottom-center, wrap in a View to center properly
  if (position === 'bottom-center') {
    if (variant === 'gradient') {
      return (
        <Animated.View style={[getPositionStyle(), animatedStyle, style]}>
          <View style={{ alignItems: 'center' }}>
            <LinearGradient
              colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={containerStyle}
            >
              {renderContent()}
            </LinearGradient>
          </View>
        </Animated.View>
      );
    }
    return (
      <Animated.View style={[getPositionStyle(), animatedStyle, style]}>
        <View style={{ alignItems: 'center' }}>
          <View style={containerStyle}>
            {renderContent()}
          </View>
        </View>
      </Animated.View>
    );
  }

  if (variant === 'gradient') {
    return (
      <Animated.View style={[getPositionStyle(), animatedStyle, style]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={containerStyle}
        >
          {renderContent()}
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[getPositionStyle(), animatedStyle, containerStyle]}>
      {renderContent()}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  watermarkContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    // Remove shadow to eliminate white line near watermark
  },
  watermarkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermarkText: {
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    fontWeight: '500',
  },
  icon: {
    marginRight: Spacing.xs,
  },
  logoIcon: {
    marginRight: 2,
    // Remove shadow to eliminate any additional white line effects
  },
});
