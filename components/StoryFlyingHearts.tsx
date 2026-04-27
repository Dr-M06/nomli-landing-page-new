import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { Heart } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface HeartAnimation {
  id: string;
  translateY: Animated.Value;
  translateX: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  rotate: Animated.Value;
  x: number; // Starting X position
}

interface ConfettiPiece {
  id: string;
  translateY: Animated.Value;
  translateX: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  rotate: Animated.Value;
  x: number;
  y: number;
  color: string;
  size: number;
}

interface StoryFlyingHeartsProps {
  onHeartAdded?: (x: number) => void;
}

export interface StoryFlyingHeartsRef {
  addHeart: (x: number) => void;
  addConfetti: (x: number, y: number) => void;
}

const StoryFlyingHearts = forwardRef<StoryFlyingHeartsRef, StoryFlyingHeartsProps>(
  ({ onHeartAdded }, ref) => {
  const [hearts, setHearts] = useState<HeartAnimation[]>([]);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const heartIdCounter = useRef(0);
  const confettiIdCounter = useRef(0);
  
  // Elegant, minimal color palette - Instagram/TikTok inspired
  const confettiColors = [
    '#FF3B5C', // Vibrant Red
    '#FF6B9D', // Soft Pink
    '#FFD93D', // Golden Yellow
    '#6BCB77', // Fresh Green
    '#4D96FF', // Sky Blue
    '#A8E6CF', // Mint
  ];

  const addHeart = (x: number) => {
    const heartId = `heart_${Date.now()}_${heartIdCounter.current++}`;
    
    // Create animated values
    const translateY = new Animated.Value(0);
    const translateX = new Animated.Value(0);
    const opacity = new Animated.Value(0); // Start invisible for smooth fade in
    const scale = new Animated.Value(0);
    const rotate = new Animated.Value(0);

    const newHeart: HeartAnimation = {
      id: heartId,
      translateY,
      translateX,
      opacity,
      scale,
      rotate,
      x,
    };

    setHearts(prev => [...prev, newHeart]);

    // Random horizontal drift with more variation (-50 to 50 pixels)
    const horizontalDrift = (Math.random() - 0.5) * 100;
    
    // Random rotation direction and amount (more natural rotation)
    const rotationDirection = Math.random() > 0.5 ? 1 : -1;
    const rotationAmount = rotationDirection * (0.5 + Math.random() * 0.8); // More rotation for natural feel

    // Animation duration (2 to 3 seconds for smoother, slower motion)
    const duration = 2000 + Math.random() * 1000;
    const fadeInDuration = 150; // Quick fade in
    const fadeOutStart = duration * 0.6; // Start fading out at 60% of duration

    // Smooth bezier easing for natural motion
    const smoothEasing = Easing.bezier(0.25, 0.1, 0.25, 1); // Ease-in-out cubic
    const easeOut = Easing.out(Easing.quad); // Ease-out for upward motion

    // Start animations
    Animated.parallel([
      // Fly upward with smooth easing
      Animated.timing(translateY, {
        toValue: -SCREEN_HEIGHT * 0.7, // Fly up 70% of screen height
        duration,
        easing: easeOut, // Smooth deceleration as it goes up
        useNativeDriver: true,
      }),
      // Horizontal drift with smooth easing
      Animated.timing(translateX, {
        toValue: horizontalDrift,
        duration,
        easing: smoothEasing, // Smooth horizontal motion
        useNativeDriver: true,
      }),
      // Scale and opacity animation sequence
      Animated.sequence([
        // Quick fade in and pop
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: fadeInDuration,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1.15, // Slightly larger pop
            tension: 120, // Higher tension for snappier pop
            friction: 8, // Higher friction for smoother settle
            useNativeDriver: true,
          }),
        ]),
        // Settle to normal size
        Animated.timing(scale, {
          toValue: 1,
          duration: 200,
          easing: smoothEasing,
          useNativeDriver: true,
        }),
        // Hold at full opacity, then fade out smoothly
        Animated.delay(fadeOutStart - fadeInDuration - 200),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: duration - fadeOutStart,
            easing: Easing.out(Easing.quad), // Smooth fade out
            useNativeDriver: true,
          }),
          // Slight scale down as it fades
          Animated.timing(scale, {
            toValue: 0.8,
            duration: duration - fadeOutStart,
            easing: smoothEasing,
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Rotate with smooth easing
      Animated.timing(rotate, {
        toValue: rotationAmount,
        duration,
        easing: smoothEasing, // Smooth rotation
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Remove heart after animation completes
      setHearts(prev => prev.filter(heart => heart.id !== heartId));
    });

    // Notify parent component
    onHeartAdded?.(x);
  };

  const addConfetti = (x: number, y: number) => {
    // Create 20 elegant confetti pieces
    const pieces: ConfettiPiece[] = [];
    
    for (let i = 0; i < 20; i++) {
      const confettiId = `confetti_${Date.now()}_${confettiIdCounter.current++}`;
      
      // Random angle for explosion (360 degrees)
      const angle = (Math.PI * 2 * i) / 20 + (Math.random() - 0.5) * 0.3;
      const distance = 80 + Math.random() * 120; // Controlled explosion
      const finalX = x + Math.cos(angle) * distance;
      const finalY = y + Math.sin(angle) * distance - 60; // Gentle fall
      
      const translateY = new Animated.Value(0);
      const translateX = new Animated.Value(0);
      const opacity = new Animated.Value(1);
      const scale = new Animated.Value(0);
      const rotate = new Animated.Value(0);
      
      const piece: ConfettiPiece = {
        id: confettiId,
        translateY,
        translateX,
        opacity,
        scale,
        rotate,
        x,
        y,
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        size: 6 + Math.random() * 6, // Smaller, elegant pieces
      };
      
      pieces.push(piece);
      
      // Subtle rotation
      const rotationAmount = (Math.random() - 0.5) * 3; // -1.5 to 1.5 rotations
      
      // Animation duration - smooth and elegant
      const duration = 1000 + Math.random() * 300;
      
      // Start animations - Smooth and elegant
      Animated.parallel([
        // Fly outward smoothly
        Animated.timing(translateX, {
          toValue: finalX - x,
          duration,
          easing: Easing.out(Easing.cubic), // Smooth easing
          useNativeDriver: true,
        }),
        // Fall down naturally
        Animated.timing(translateY, {
          toValue: finalY - y,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Scale and fade elegantly
        Animated.sequence([
          Animated.spring(scale, {
            toValue: 1,
            tension: 100,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: duration * 0.5,
            delay: duration * 0.5,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        // Rotate smoothly
        Animated.timing(rotate, {
          toValue: rotationAmount,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Remove confetti piece after animation
        setConfetti(prev => prev.filter(p => p.id !== confettiId));
      });
    }
    
    setConfetti(prev => [...prev, ...pieces]);
  };

    // Expose addHeart and addConfetti functions via ref
    useImperativeHandle(ref, () => ({
      addHeart,
      addConfetti,
    }));

    return (
    <View style={styles.container} pointerEvents="none">
      {hearts.map((heart) => {
        const rotateInterpolate = heart.rotate.interpolate({
          inputRange: [-2, 2],
          outputRange: ['-30deg', '30deg'], // More rotation range for natural feel
        });

        return (
          <Animated.View
            key={heart.id}
            style={[
              styles.heartContainer,
              {
                left: heart.x - 14, // Center the heart (28px width / 2)
                transform: [
                  { translateY: heart.translateY },
                  { translateX: heart.translateX },
                  { scale: heart.scale },
                  { rotate: rotateInterpolate },
                ],
                opacity: heart.opacity,
              },
            ]}
          >
            <Heart
              size={28}
              color="#FF1744"
              fill="#FF1744"
              strokeWidth={2.5}
            />
          </Animated.View>
        );
      })}
      
      {/* Confetti pieces */}
      {confetti.map((piece) => {
        const rotateInterpolate = piece.rotate.interpolate({
          inputRange: [-1.5, 1.5],
          outputRange: ['-540deg', '540deg'], // Subtle rotations
        });

        return (
          <Animated.View
            key={piece.id}
            style={[
              styles.confettiPiece,
              {
                left: piece.x - piece.size / 2,
                top: piece.y - piece.size / 2,
                width: piece.size,
                height: piece.size,
                backgroundColor: piece.color,
                borderRadius: piece.size / 2, // Perfect circles for clean look
                transform: [
                  { translateY: piece.translateY },
                  { translateX: piece.translateX },
                  { scale: piece.scale },
                  { rotate: rotateInterpolate },
                ],
                opacity: piece.opacity,
                shadowColor: piece.color,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 3,
                elevation: 3,
              },
            ]}
          />
        );
      })}
    </View>
  );
  }
);

StoryFlyingHearts.displayName = 'StoryFlyingHearts';

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  heartContainer: {
    position: 'absolute',
    bottom: 120, // Start slightly higher for better visibility
    width: 28, // Slightly larger for better visibility
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiPiece: {
    position: 'absolute',
    borderRadius: 2,
  },
});

export default StoryFlyingHearts;

