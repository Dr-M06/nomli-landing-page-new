import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Mic } from 'lucide-react-native';

interface MicIndicatorProps {
  isActive: boolean;
  isMuted?: boolean;
}

export default function MicIndicator({ isActive, isMuted }: MicIndicatorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0)).current;
  const waveAnim2 = useRef(new Animated.Value(0)).current;
  const waveAnim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive && !isMuted) {
      // Pulse animation for the mic icon
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Wave animations - staggered ripple effect
      const createWaveAnimation = (anim: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
              Animated.timing(anim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
              }),
            ]),
            Animated.timing(anim, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ])
        );
      };

      createWaveAnimation(waveAnim1, 0).start();
      createWaveAnimation(waveAnim2, 200).start();
      createWaveAnimation(waveAnim3, 400).start();
    } else {
      // Stop animations
      pulseAnim.setValue(1);
      waveAnim1.setValue(0);
      waveAnim2.setValue(0);
      waveAnim3.setValue(0);
    }
  }, [isActive, isMuted, pulseAnim, waveAnim1, waveAnim2, waveAnim3]);

  if (!isActive || isMuted) return null;

  return (
    <View style={styles.container}>
      {/* Ripple waves */}
      {[waveAnim1, waveAnim2, waveAnim3].map((anim, index) => (
        <Animated.View
          key={index}
          style={[
            styles.wave,
            {
              opacity: anim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.6, 0.3, 0],
              }),
              transform: [
                {
                  scale: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 2.5],
                  }),
                },
              ],
            },
          ]}
        />
      ))}

      {/* Mic icon with pulse */}
      <Animated.View
        style={[
          styles.micContainer,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <Mic size={10} color="#00D9FF" strokeWidth={2.5} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wave: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#00D9FF',
  },
  micContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 217, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#00D9FF',
  },
});

