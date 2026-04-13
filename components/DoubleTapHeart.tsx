import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Zap } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
const ICON_SIZE = 44;
const DURATION = 280;

interface DoubleTapHeartProps {
  visible: boolean;
  x: number;
  y: number;
  onAnimationComplete?: () => void;
}

/**
 * Double-tap zap overlay on images (scale + fade).
 * Positioned at tap; uses Reanimated for smooth, light animation.
 */
export default function DoubleTapHeart({
  visible,
  x,
  y,
  onAnimationComplete,
}: DoubleTapHeartProps) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(1);
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    if (!visible) return;
    scale.value = 0.6;
    opacity.value = 1;
    scale.value = withTiming(1.1, { duration: DURATION });
    opacity.value = withTiming(0, { duration: DURATION }, (finished) => {
      if (finished) {
        const fn = onCompleteRef.current;
        if (fn) runOnJS(fn)();
      }
    });
  }, [visible, scale, opacity]);

  if (!visible) return null;

  const half = ICON_SIZE / 2;
  const zapColor = '#FACC15';

  return (
    <View
      style={[
        styles.container,
        { left: x - half, top: y - half, width: ICON_SIZE, height: ICON_SIZE },
      ]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.heartContainer, animatedStyle]}>
        <Zap size={ICON_SIZE} color={zapColor} fill={zapColor} strokeWidth={1.5} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
