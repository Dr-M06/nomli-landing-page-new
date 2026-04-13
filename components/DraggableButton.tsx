import React, { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, Animated, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DraggableButtonProps {
  children: React.ReactNode;
  initialX?: number;
  initialY?: number;
  buttonSize?: number;
  onPositionChange?: (x: number, y: number) => void;
  style?: any;
}

export default function DraggableButton({
  children,
  initialX = SCREEN_WIDTH - 60,
  initialY = SCREEN_HEIGHT / 2,
  buttonSize = 48,
  onPositionChange,
  style,
}: DraggableButtonProps) {
  const pan = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      // Only capture if there's significant movement (drag), not on initial touch
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only start dragging if movement is significant (more than 8 pixels)
        return Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        // Store the current position as offset
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        // Reset the value to zero for the gesture
        pan.setValue({ x: 0, y: 0 });
        // Store initial touch position
        dragStartRef.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
        };
        isDraggingRef.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        // Check if this is a drag (movement > 10 pixels)
        const moveDistance = Math.sqrt(gestureState.dx ** 2 + gestureState.dy ** 2);
        if (moveDistance > 10) {
          isDraggingRef.current = true;
        }
        
        // Update position during drag
        pan.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (evt) => {
        pan.flattenOffset();
        
        // Get current position
        const currentX = (pan.x as any)._value;
        const currentY = (pan.y as any)._value;
        
        // Check if this was a tap (not a drag)
        const moveDistance = Math.sqrt(
          (evt.nativeEvent.pageX - dragStartRef.current.x) ** 2 +
          (evt.nativeEvent.pageY - dragStartRef.current.y) ** 2
        );
        
        // If it was a tap (small movement), allow the TouchableOpacity to handle it
        if (moveDistance < 15 && !isDraggingRef.current) {
          // Don't update position, let the tap go through
          // Reset pan to current position
          pan.setValue({ x: currentX, y: currentY });
          isDraggingRef.current = false;
          return;
        }
        
        // Keep button within screen bounds
        const minX = buttonSize / 2;
        const maxX = SCREEN_WIDTH - buttonSize / 2;
        const minY = buttonSize / 2;
        const maxY = SCREEN_HEIGHT - buttonSize / 2;
        
        const boundedX = Math.max(minX, Math.min(maxX, currentX));
        const boundedY = Math.max(minY, Math.min(maxY, currentY));
        
        // Animate to bounded position
        Animated.spring(pan, {
          toValue: { x: boundedX, y: boundedY },
          useNativeDriver: false,
          tension: 50,
          friction: 7,
        }).start();
        
        // Update position state
        const newPosition = { x: boundedX, y: boundedY };
        setPosition(newPosition);
        
        // Notify parent of position change
        if (onPositionChange) {
          onPositionChange(boundedX, boundedY);
        }
        
        isDraggingRef.current = false;
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.draggableButton,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
        style,
      ]}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  draggableButton: {
    position: 'absolute',
    zIndex: 1000,
  },
});

