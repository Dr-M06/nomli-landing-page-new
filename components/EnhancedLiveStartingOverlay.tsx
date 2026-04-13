import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, ActivityIndicator } from 'react-native';
import { MotiView, MotiText } from 'moti';

const { width } = Dimensions.get('window');

interface EnhancedLiveStartingOverlayProps {
  message?: string;
  estimatedTime?: number; // in seconds
  showCountdown?: boolean;
  isFirstTime?: boolean; // Show first-time setup message
}

export default function EnhancedLiveStartingOverlay({ 
  message = 'Starting your live stream...',
  estimatedTime = 5,
  showCountdown = true,
  isFirstTime = false
}: EnhancedLiveStartingOverlayProps) {
  const [countdown, setCountdown] = useState(estimatedTime);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  // Countdown timer
  useEffect(() => {
    if (!showCountdown) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showCountdown, estimatedTime]);

  // Fade in animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Backdrop */}
      <View style={styles.backdrop} />

      {/* Content */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Lightweight built-in loader (no external json dependency) */}
        <MotiView
          from={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: 'timing',
            duration: 600,
            delay: 100,
          }}
          style={styles.animationContainer}
        >
          <View style={styles.loaderRing}>
            <ActivityIndicator size="large" color="#00D9FF" />
          </View>
        </MotiView>

        {/* Message */}
        <MotiText
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            type: 'timing',
            duration: 500,
            delay: 200,
          }}
          style={styles.message}
        >
          {message}
        </MotiText>

        {/* Countdown */}
        {showCountdown && countdown > 0 && (
          <MotiView
            from={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              type: 'spring',
              damping: 15,
            }}
            key={countdown}
            style={styles.countdownContainer}
          >
            <MotiText
              from={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{
                type: 'spring',
                damping: 10,
              }}
              style={styles.countdown}
            >
              {countdown}
            </MotiText>
          </MotiView>
        )}

        {/* First time message */}
        {isFirstTime && (
          <MotiText
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              type: 'timing',
              duration: 400,
              delay: 400,
            }}
            style={styles.firstTimeText}
          >
            First time? Setup may take a bit longer
          </MotiText>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: width * 0.85,
    maxWidth: 320,
  },
  animationContainer: {
    width: 140,
    height: 140,
    marginBottom: 32,
  },
  animation: {
    width: '100%',
    height: '100%',
  },
  loaderRing: {
    width: '100%',
    height: '100%',
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 24,
  },
  countdownContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  countdown: {
    fontSize: 56,
    fontWeight: '700',
    color: '#00D9FF',
    letterSpacing: -1,
    textShadowColor: 'rgba(0, 217, 255, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  firstTimeText: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    letterSpacing: -0.1,
    marginTop: 8,
  },
});
