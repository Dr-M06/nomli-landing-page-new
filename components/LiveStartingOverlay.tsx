import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import AnimatedLogo from './AnimatedLogo';

const { width, height } = Dimensions.get('window');

interface LiveStartingOverlayProps {
  message?: string;
}

export default function LiveStartingOverlay({ message = 'Starting your live stream...' }: LiveStartingOverlayProps) {
  const pulse = useRef(new Animated.Value(0.9)).current;
  const shimmerTranslate = useRef(new Animated.Value(-width)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(shimmerTranslate, {
        toValue: width,
        duration: 1600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Subtle gradient backdrop */}
      <View style={styles.backdrop} />

      {/* Animated logo */}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <AnimatedLogo size={140} animated />
      </Animated.View>

      {/* Message with shimmer underline */}
      <View style={styles.messageContainer}>
        <Text style={styles.messageText}>{message}</Text>
        <View style={styles.shimmerTrack}>
          <Animated.View
            style={[
              styles.shimmerBar,
              { transform: [{ translateX: shimmerTranslate }] },
            ]}
          />
        </View>
      </View>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  messageContainer: {
    marginTop: 24,
    width: Math.min(width * 0.7, 320),
    alignItems: 'center',
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  shimmerTrack: {
    marginTop: 10,
    height: 2,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    borderRadius: 1,
  },
  shimmerBar: {
    height: '100%',
    width: width * 0.4,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});


