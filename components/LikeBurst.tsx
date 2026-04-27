import React, { useEffect, useRef } from 'react';
import { ViewStyle } from 'react-native';
import { Zap } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

export interface LikeBurstProps {
  /** When true, the burst animation runs once then onComplete is called */
  visible: boolean;
  onComplete?: () => void;
  /** Icon size (default 44) */
  size?: number;
  /** Burst color (default electric yellow) */
  color?: string;
  /** Container style for positioning (e.g. overlay on like icon) */
  style?: ViewStyle;
  /** Animation duration in ms (default 400). Use smaller for lighter feel (e.g. 280). */
  duration?: number;
}

const DEFAULT_DURATION = 400;

/**
 * Zap burst (scale + fade) over the reaction button.
 */
export default function LikeBurst({
  visible,
  onComplete,
  size = 44,
  color = '#FACC15',
  style,
  duration = DEFAULT_DURATION,
}: LikeBurstProps) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(1);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    if (!visible) return;
    scale.value = 0.6;
    opacity.value = 1;
    scale.value = withTiming(1.15, { duration });
    opacity.value = withTiming(0, { duration }, (finished) => {
      if (finished) {
        const fn = onCompleteRef.current;
        if (fn) runOnJS(fn)();
      }
    });
  }, [visible, scale, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size + 8,
          height: size + 8,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10,
        },
        style,
      ]}
      pointerEvents="none"
    >
      <Animated.View style={animatedStyle}>
        <Zap size={size} color={color} fill={color} strokeWidth={1.5} />
      </Animated.View>
    </Animated.View>
  );
}
