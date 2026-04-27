/**
 * Lightweight Valentine's Day Animation
 * Renders subtle floating hearts that auto-disable after the celebration
 */
import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { isValentinesActive, VALENTINES_2026 } from '../constants/SeasonalEvents';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Heart emoji options for variety
const HEART_EMOJIS = ['❤️', '💕', '💗', '💖', '🩷', '💝'];

interface FloatingHeartProps {
  delay: number;
  startX: number;
  duration: number;
  size: number;
  emoji: string;
}

const FloatingHeart: React.FC<FloatingHeartProps> = ({
  delay,
  startX,
  duration,
  size,
  emoji,
}) => {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Fade in, float up, fade out - repeat (slower, gentler)
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.5, { duration: 1500 }), // Slower fade in
          withTiming(0.5, { duration: duration - 4000 }), // Stay visible longer
          withTiming(0, { duration: 2500 }) // Slower fade out
        ),
        -1, // Infinite
        false
      )
    );

    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration, easing: Easing.out(Easing.quad) }) // Gentler easing
        ),
        -1,
        false
      )
    );
  }, [delay, duration]);

  const animatedStyle = useAnimatedStyle(() => {
    // Float upward slowly with very gentle horizontal sway
    const translateY = interpolate(progress.value, [0, 1], [30, -SCREEN_HEIGHT * 0.25]);
    const translateX = interpolate(
      progress.value,
      [0, 0.25, 0.5, 0.75, 1],
      [0, 8, 0, -8, 0] // Gentler sway
    );
    const scale = interpolate(progress.value, [0, 0.3, 0.7, 1], [0.6, 1, 1, 0.8]);
    const rotate = interpolate(progress.value, [0, 1], [0, 8]); // Less rotation

    return {
      opacity: opacity.value,
      transform: [
        { translateY },
        { translateX },
        { scale },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  return (
    <Animated.Text
      style={[
        styles.heart,
        { left: startX, fontSize: size },
        animatedStyle,
      ]}
    >
      {emoji}
    </Animated.Text>
  );
};

interface ValentinesAnimationProps {
  /** Number of hearts to render (default: 5 for performance) */
  heartCount?: number;
  /** Position: 'header' for top, 'fab' for bottom center, 'full' for whole screen */
  position?: 'header' | 'fab' | 'full';
}

const ValentinesAnimation: React.FC<ValentinesAnimationProps> = ({
  heartCount = 5,
  position = 'header',
}) => {
  // Check if Valentine's is active - return null if not
  if (!isValentinesActive()) {
    return null;
  }

  // Generate random heart configurations - slower, more relaxed timing
  const hearts = useMemo(() => {
    return Array.from({ length: heartCount }, (_, i) => {
      const xRange = position === 'fab' 
        ? { min: SCREEN_WIDTH * 0.3, max: SCREEN_WIDTH * 0.7 }
        : { min: 10, max: SCREEN_WIDTH - 30 };
      
      return {
        id: i,
        delay: i * 1500 + Math.random() * 1000, // More staggered, slower start
        startX: xRange.min + Math.random() * (xRange.max - xRange.min),
        duration: 8000 + Math.random() * 4000, // Much slower: 8-12 seconds
        size: 12 + Math.random() * 8, // Slightly smaller
        emoji: HEART_EMOJIS[Math.floor(Math.random() * HEART_EMOJIS.length)],
      };
    });
  }, [heartCount, position]);

  const containerStyle = useMemo(() => {
    switch (position) {
      case 'header':
        return styles.headerContainer;
      case 'fab':
        return styles.fabContainer;
      case 'full':
        return styles.fullContainer;
      default:
        return styles.headerContainer;
    }
  }, [position]);

  return (
    <View style={containerStyle} pointerEvents="none">
      {hearts.map((heart) => (
        <FloatingHeart
          key={heart.id}
          delay={heart.delay}
          startX={heart.startX}
          duration={heart.duration}
          size={heart.size}
          emoji={heart.emoji}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150, // Taller to appear above stories
    overflow: 'hidden',
    zIndex: 999, // Higher z-index to appear above stories
    elevation: 999, // For Android
  },
  fabContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    height: 100,
    overflow: 'hidden',
    zIndex: 999,
    elevation: 999,
  },
  fullContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 999,
    elevation: 999,
  },
  heart: {
    position: 'absolute',
    bottom: 0,
  },
});

export default ValentinesAnimation;
