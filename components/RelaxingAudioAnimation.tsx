import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

interface RelaxingAudioAnimationProps {
  style?: any;
}

export default function RelaxingAudioAnimation({ style }: RelaxingAudioAnimationProps) {
  // Animated values for floating particles (reduced 20→8 for performance)
  const particles = useRef(
    Array.from({ length: 8 }, () => ({
      x: new Animated.Value(Math.random() * width),
      y: new Animated.Value(Math.random() * height),
      scale: new Animated.Value(0.5 + Math.random() * 0.5),
      opacity: new Animated.Value(0.3 + Math.random() * 0.4),
    }))
  ).current;

  // Animated values for gradient waves
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const wave3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate floating particles
    const particleAnimations = particles.map((particle, index) => {
      const duration = 3000 + Math.random() * 2000;
      const delay = index * 100;
      
      return Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(particle.x, {
              toValue: Math.random() * width,
              duration,
              useNativeDriver: true,
            }),
            Animated.timing(particle.y, {
              toValue: Math.random() * height,
              duration,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(particle.scale, {
                toValue: 1.2,
                duration: duration / 2,
                useNativeDriver: true,
              }),
              Animated.timing(particle.scale, {
                toValue: 0.8,
                duration: duration / 2,
                useNativeDriver: true,
              }),
            ]),
            Animated.sequence([
              Animated.timing(particle.opacity, {
                toValue: 0.7,
                duration: duration / 2,
                useNativeDriver: true,
              }),
              Animated.timing(particle.opacity, {
                toValue: 0.3,
                duration: duration / 2,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]),
        { iterations: -1 }
      );
    });

    // Animate gradient waves
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
    particleAnimations.forEach(anim => anim.start());
    wave1Animation.start();
    wave2Animation.start();
    wave3Animation.start();

    return () => {
      particleAnimations.forEach(anim => anim.stop());
      wave1Animation.stop();
      wave2Animation.stop();
      wave3Animation.stop();
    };
  }, []);

  // Calculate gradient colors based on wave animations
  const gradient1Opacity = wave1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const gradient2Opacity = wave2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.5],
  });

  const gradient3Opacity = wave3.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.4],
  });

  return (
    <View style={[styles.container, style]}>
      {/* Animated gradient background */}
      <Animated.View style={[styles.gradientContainer, { opacity: gradient1Opacity }]}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.gradientContainer, { opacity: gradient2Opacity }]}>
        <LinearGradient
          colors={['#f093fb', '#4facfe', '#00f2fe']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.gradientContainer, { opacity: gradient3Opacity }]}>
        <LinearGradient
          colors={['#4facfe', '#00f2fe', '#43e97b']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Floating particles */}
      {particles.map((particle, index) => (
        <Animated.View
          key={index}
          style={[
            styles.particle,
            {
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
                { scale: particle.scale },
              ],
              opacity: particle.opacity,
            },
          ]}
        />
      ))}

      {/* Subtle pulsing circles */}
      <View style={styles.pulseContainer}>
        {[0, 1, 2].map((index) => (
          <Animated.View
            key={index}
            style={[
              styles.pulseCircle,
              {
                opacity: index === 0 ? wave1 : index === 1 ? wave2 : wave3,
                transform: [
                  {
                    scale: index === 0
                      ? wave1.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1.2],
                        })
                      : index === 1
                      ? wave2.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1.1],
                        })
                      : wave3.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.95, 1.05],
                        }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gradientContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  pulseContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 200,
    height: 200,
    marginLeft: -100,
    marginTop: -100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseCircle: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
});

