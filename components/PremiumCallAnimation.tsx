import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

interface PremiumCallAnimationProps {
  type: 'ringing' | 'connecting' | 'connected';
  isAudioOnly?: boolean;
  onAnimationComplete?: () => void;
}

export default function PremiumCallAnimation({ 
  type, 
  isAudioOnly = false, 
  onAnimationComplete 
}: PremiumCallAnimationProps) {
  
  // Animation values - reduced for performance
  const pulseScale = useSharedValue(1);
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  // Removed: waveScale, waveOpacity, glowIntensity, shimmerOffset for better performance
  const connectedScale = useSharedValue(0);
  const connectedOpacity = useSharedValue(0);

  useEffect(() => {
    if (type === 'ringing') {
      startRingingAnimation();
    } else if (type === 'connecting') {
      startConnectingAnimation();
    } else if (type === 'connected') {
      startConnectedAnimation();
    }
  }, [type]);

  const startRingingAnimation = () => {
    // Simplified: Only main pulse animation (removed wave, shimmer, glow for performance)
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1500, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 1500, easing: Easing.in(Easing.cubic) })
      ),
      -1,
      false
    );

    // Single ring expansion (removed wave for performance)
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(2, { duration: 2000, easing: Easing.out(Easing.cubic) })
      ),
      -1,
      false
    );

    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 0 }),
        withTiming(0, { duration: 2000, easing: Easing.out(Easing.cubic) })
      ),
      -1,
      false
    );

    // Removed: waveScale, waveOpacity, glowIntensity, shimmerOffset for better performance
  };

  const startConnectingAnimation = () => {
    // Simplified: Only pulse animation (removed glow for performance)
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 1000, easing: Easing.in(Easing.cubic) })
      ),
      -1,
      false
    );

    // Single ring for connecting
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(1.8, { duration: 1500, easing: Easing.out(Easing.cubic) })
      ),
      -1,
      false
    );

    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 0 }),
        withTiming(0, { duration: 1500, easing: Easing.out(Easing.cubic) })
      ),
      -1,
      false
    );

    // Removed: glowIntensity for better performance
  };

  const startConnectedAnimation = () => {
    // Simplified: Single success animation (removed glow, reduced pulse)
    connectedScale.value = withSequence(
      withTiming(1.15, { duration: 300, easing: Easing.out(Easing.back(1.2)) }),
      withTiming(1, { duration: 200, easing: Easing.in(Easing.cubic) })
    );

    connectedOpacity.value = withSequence(
      withTiming(1, { duration: 300 }),
      withTiming(0.9, { duration: 200 })
    );

    // Removed: pulse animation and glow for better performance
    // Call completion callback
    if (onAnimationComplete) {
      setTimeout(() => {
        runOnJS(onAnimationComplete)();
      }, 500); // Reduced delay
    }
  };

  // Animated styles
  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  // Removed: waveAnimatedStyle, glowAnimatedStyle, shimmerAnimatedStyle for better performance

  const connectedAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: connectedScale.value }],
    opacity: connectedOpacity.value,
  }));

  const getGradientColors = () => {
    switch (type) {
      case 'ringing':
        return ['#FF6B6B', '#FF8E8E', '#FFB3B3'];
      case 'connecting':
        return ['#4ECDC4', '#7EDDD6', '#A8E6E0'];
      case 'connected':
        return ['#4CAF50', '#66BB6A', '#81C784'];
      default:
        return ['#6366F1', '#8B5CF6', '#A78BFA'];
    }
  };

  const getIconName = () => {
    if (isAudioOnly) {
      return type === 'connected' ? 'phone' : 'phone-outline';
    }
    return type === 'connected' ? 'videocam' : 'videocam-outline';
  };

  return (
    <View style={styles.container}>
      {/* Main animation container - simplified */}
      <Animated.View style={[styles.animationContainer, pulseAnimatedStyle]}>
        {/* Main ring only (removed wave and glow for performance) */}
        <Animated.View style={[styles.mainRing, ringAnimatedStyle]}>
          <LinearGradient
            colors={getGradientColors()}
            style={styles.ringGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Center content - Transparent */}
        <Animated.View style={[styles.centerContent, connectedAnimatedStyle]}>
          {/* Removed gradient to eliminate gray background */}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  animationContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  mainRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.6,
  },
  ringGradient: {
    flex: 1,
    borderRadius: 90,
  },
  centerContent: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'transparent', // Remove any gray background
    borderWidth: 0, // Remove any border
  },
});
