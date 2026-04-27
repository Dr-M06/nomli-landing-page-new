import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, Diamond, Star } from 'lucide-react-native';
import { FontFamily, FontSizes } from '../constants/Theme';

interface VipPlateProps {
  type?: 'vip' | 'verified' | 'premium';
  style?: any;
  isDarkMode?: boolean;
}

const VipPlate: React.FC<VipPlateProps> = ({
  type = 'vip',
  style,
  isDarkMode = false,
}) => {
  // Animation values
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.98)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in animation
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();

    // Shimmer animation
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.02,
          duration: 1200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.98,
          duration: 1200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => {
      // Cleanup animations
      shimmerAnim.stopAnimation();
      scaleAnim.stopAnimation();
      opacityAnim.stopAnimation();
    };
  }, []);

  // Interpolate shimmer position
  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  // Plate configuration based on type
  const plateConfig = {
    vip: {
      colors: ['#FFD700', '#FFA500', '#FF8C00'],
      text: 'VIP',
      icon: Crown,
      textColor: '#FFFFFF',
    },
    verified: {
      colors: ['#3B82F6', '#6366F1', '#8B5CF6'],
      text: 'VERIFIED',
      icon: Star,
      textColor: '#FFFFFF',
    },
    premium: {
      colors: ['#9333EA', '#7E22CE', '#6B21A8'],
      text: 'PREMIUM',
      icon: Diamond,
      textColor: '#FFFFFF',
    },
  };

  const config = plateConfig[type];
  const Icon = config.icon;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
          shadowColor: 'transparent',
        },
        style,
      ]}
    >
      <LinearGradient
        colors={config.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {/* Shimmer effect */}
        <Animated.View
          style={[
            styles.shimmer,
            {
              transform: [{ translateX: shimmerTranslate }],
            },
          ]}
        />

        <View style={styles.contentContainer}>
          <Icon size={16} color={config.textColor} />
          <Text style={[styles.text, { color: config.textColor }]}>
            {config.text}
          </Text>
          <Icon size={16} color={config.textColor} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    marginVertical: 8,
    overflow: 'hidden',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  gradient: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  text: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.caption,
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    transform: [{ skewX: '-20deg' }],
  },
});

export default VipPlate; 