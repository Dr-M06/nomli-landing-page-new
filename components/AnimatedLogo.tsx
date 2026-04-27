import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Image } from 'react-native';
import { AnimationTiming } from '../constants/Theme';

interface AnimatedLogoProps {
  size?: number;
  animated?: boolean;
}

export default function AnimatedLogo({ size = 200, animated = true }: AnimatedLogoProps) {
  // Animation values
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  
  // Convert rotation Animated.Value to interpolated style
  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  useEffect(() => {
    if (animated) {
      // Fade in and scale up animation
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: AnimationTiming.medium,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad)
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true
        }),
        Animated.timing(rotation, {
          toValue: 1,
          duration: AnimationTiming.slow * 3,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease)
        })
      ]).start();
    } else {
      // Set to final state without animation
      opacity.setValue(1);
      scale.setValue(1);
      rotation.setValue(0);
    }
  }, [animated]);

  return (
    <Animated.View style={[
      styles.container, 
      { 
        opacity, 
        transform: [
          { scale }, 
          { rotate: spin }
        ] 
      }
    ]}>
      <Image
        source={require('../assets/images/icon.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  }
}); 