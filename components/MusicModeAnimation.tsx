import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Music, Disc, Radio } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

interface MusicModeAnimationProps {
  style?: any;
}

export default function MusicModeAnimation({ style }: MusicModeAnimationProps) {
  // Animated values for turntable rotation
  const turntableRotation = useRef(new Animated.Value(0)).current;
  
  // Animated values for music keys (reduced 8→4 for performance)
  const keys = useRef(
    Array.from({ length: 4 }, (_, i) => ({
      scale: new Animated.Value(1),
      opacity: new Animated.Value(0.6),
      delay: i * 100,
    }))
  ).current;

  // Animated values for disco lights (reduced 6→3 for performance)
  const discoLights = useRef(
    Array.from({ length: 3 }, () => ({
      x: new Animated.Value(Math.random() * width),
      y: new Animated.Value(Math.random() * height),
      scale: new Animated.Value(0.8 + Math.random() * 0.4),
      opacity: new Animated.Value(0.3 + Math.random() * 0.4),
      color: ['#FF0050', '#D946EF', '#00D9FF', '#FF6B00', '#FFD700', '#FF1493'][Math.floor(Math.random() * 6)],
    }))
  ).current;

  // Animated values for gradient waves (disco room atmosphere)
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const wave3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Rotate turntable continuously
    const turntableAnimation = Animated.loop(
      Animated.timing(turntableRotation, {
        toValue: 1,
        duration: 8000, // 8 seconds per rotation
        useNativeDriver: true,
        easing: (t) => t, // Linear rotation
      })
    );

    // Animate music keys (piano keys bouncing effect)
    const keyAnimations = keys.map((key, index) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(key.delay),
          Animated.parallel([
            Animated.sequence([
              Animated.timing(key.scale, {
                toValue: 1.2,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(key.scale, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
            ]),
            Animated.sequence([
              Animated.timing(key.opacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(key.opacity, {
                toValue: 0.6,
                duration: 200,
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.delay(800 - key.delay),
        ])
      );
    });

    // Animate disco lights (floating and pulsing)
    const discoAnimations = discoLights.map((light, index) => {
      const duration = 3000 + Math.random() * 2000;
      return Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(light.x, {
              toValue: Math.random() * width,
              duration,
              useNativeDriver: true,
            }),
            Animated.timing(light.x, {
              toValue: Math.random() * width,
              duration,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(light.y, {
              toValue: Math.random() * height,
              duration,
              useNativeDriver: true,
            }),
            Animated.timing(light.y, {
              toValue: Math.random() * height,
              duration,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(light.scale, {
              toValue: 1.3,
              duration: duration / 2,
              useNativeDriver: true,
            }),
            Animated.timing(light.scale, {
              toValue: 0.7,
              duration: duration / 2,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(light.opacity, {
              toValue: 0.8,
              duration: duration / 2,
              useNativeDriver: true,
            }),
            Animated.timing(light.opacity, {
              toValue: 0.3,
              duration: duration / 2,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
    });

    // Animate gradient waves (disco room atmosphere)
    const wave1Animation = Animated.loop(
      Animated.sequence([
        Animated.timing(wave1, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(wave1, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    );

    const wave2Animation = Animated.loop(
      Animated.sequence([
        Animated.timing(wave2, {
          toValue: 1,
          duration: 5000,
          useNativeDriver: true,
        }),
        Animated.timing(wave2, {
          toValue: 0,
          duration: 5000,
          useNativeDriver: true,
        }),
      ])
    );

    const wave3Animation = Animated.loop(
      Animated.sequence([
        Animated.timing(wave3, {
          toValue: 1,
          duration: 6000,
          useNativeDriver: true,
        }),
        Animated.timing(wave3, {
          toValue: 0,
          duration: 6000,
          useNativeDriver: true,
        }),
      ])
    );

    // Start all animations
    turntableAnimation.start();
    keyAnimations.forEach(anim => anim.start());
    discoAnimations.forEach(anim => anim.start());
    wave1Animation.start();
    wave2Animation.start();
    wave3Animation.start();

    return () => {
      turntableAnimation.stop();
      keyAnimations.forEach(anim => anim.stop());
      discoAnimations.forEach(anim => anim.stop());
      wave1Animation.stop();
      wave2Animation.stop();
      wave3Animation.stop();
    };
  }, []);

  // Calculate gradient colors based on wave animations (dark disco room theme)
  const gradient1Opacity = wave1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.7],
  });

  const gradient2Opacity = wave2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const gradient3Opacity = wave3.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.5],
  });

  // Turntable rotation
  const turntableRotationDeg = turntableRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, style]}>
      {/* Dark disco room gradient background */}
      <Animated.View style={[styles.gradientContainer, { opacity: gradient1Opacity }]}>
        <LinearGradient
          colors={['#1a0033', '#4a0066', '#8b00ff']} // Dark purple disco theme
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.gradientContainer, { opacity: gradient2Opacity }]}>
        <LinearGradient
          colors={['#330033', '#660066', '#9900cc']} // Dark magenta
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.gradientContainer, { opacity: gradient3Opacity }]}>
        <LinearGradient
          colors={['#000033', '#330066', '#6600cc']} // Dark blue-purple
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Disco lights */}
      {discoLights.map((light, index) => (
        <Animated.View
          key={index}
          style={[
            styles.discoLight,
            {
              backgroundColor: light.color,
              transform: [
                { translateX: light.x },
                { translateY: light.y },
                { scale: light.scale },
              ],
              opacity: light.opacity,
            },
          ]}
        />
      ))}

      {/* Turntable in center */}
      <View style={styles.turntableContainer}>
        <Animated.View
          style={[
            styles.turntable,
            {
              transform: [{ rotate: turntableRotationDeg }],
            },
          ]}
        >
          <Disc size={120} color="rgba(255, 255, 255, 0.3)" strokeWidth={2} />
          <View style={styles.turntableCenter}>
            <View style={styles.turntableCenterDot} />
          </View>
        </Animated.View>
        <View style={styles.turntableBase}>
          <Radio size={24} color="rgba(255, 255, 255, 0.5)" />
        </View>
      </View>

      {/* Music keys (piano keys effect) at bottom */}
      <View style={styles.keysContainer}>
        {keys.map((key, index) => (
          <Animated.View
            key={index}
            style={[
              styles.musicKey,
              {
                transform: [{ scale: key.scale }],
                opacity: key.opacity,
                backgroundColor: index % 2 === 0 
                  ? 'rgba(255, 255, 255, 0.2)' 
                  : 'rgba(255, 255, 255, 0.1)',
              },
            ]}
          />
        ))}
      </View>

      {/* Music icon overlay */}
      <View style={styles.musicIconOverlay}>
        <Music size={32} color="rgba(255, 255, 255, 0.4)" strokeWidth={2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#000033', // Dark base color
  },
  gradientContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  discoLight: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  turntableContainer: {
    position: 'absolute',
    top: '35%',
    left: '50%',
    marginLeft: -80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turntable: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  turntableCenter: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turntableCenterDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  turntableBase: {
    marginTop: 20,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  keysContainer: {
    position: 'absolute',
    bottom: 60,
    left: '10%',
    right: '10%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 80,
  },
  musicKey: {
    flex: 1,
    marginHorizontal: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  musicIconOverlay: {
    position: 'absolute',
    top: '20%',
    right: '15%',
    opacity: 0.3,
  },
});

