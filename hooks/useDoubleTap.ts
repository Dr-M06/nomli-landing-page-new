import { useRef, useCallback } from 'react';

interface UseDoubleTapOptions {
  onDoubleTap: (event: any) => void;
  onSingleTap?: (event: any) => void;
  delay?: number; // Delay in ms to wait for second tap (default: 300ms)
}

/**
 * Hook to detect double tap gestures
 * Returns handlers for onPress that distinguish between single and double taps
 * 
 * Note: Single tap is delayed by the delay duration to detect double-tap.
 * For immediate single-tap, use the underlying TouchableOpacity/Pressable directly.
 */
export function useDoubleTap({
  onDoubleTap,
  onSingleTap,
  delay = 300,
}: UseDoubleTapOptions) {
  const lastTapRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handlePress = useCallback(
    (event: any) => {
      const now = Date.now();
      const timeSinceLastTap = now - lastTapRef.current;

      // Clear any pending single tap
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (timeSinceLastTap < delay) {
        // Double tap detected
        lastTapRef.current = 0;
        onDoubleTap(event);
      } else {
        // Potential single tap - wait to see if another tap comes
        lastTapRef.current = now;
        timeoutRef.current = setTimeout(() => {
          if (onSingleTap) {
            onSingleTap(event);
          }
          timeoutRef.current = null;
        }, delay);
      }
    },
    [onDoubleTap, onSingleTap, delay]
  );

  return { onPress: handlePress };
}

