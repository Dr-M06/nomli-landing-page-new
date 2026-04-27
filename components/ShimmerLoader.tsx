import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

interface ShimmerLoaderProps {
  fullScreen?: boolean;
  style?: any;
  isDarkMode?: boolean; // Optional prop to avoid requiring theme context
}

export default function ShimmerLoader({ fullScreen = true, style, isDarkMode = false }: ShimmerLoaderProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Continuous shimmer animation
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    
    shimmerAnimation.start();
    
    return () => {
      shimmerAnimation.stop();
    };
  }, []);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-width * 2, width * 2],
  });

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.8, 0.3],
  });

  const baseColor = isDarkMode ? '#1E293B' : '#F1F5F9';
  const highlightColor = isDarkMode ? '#334155' : '#E2E8F0';
  const shimmerColor = isDarkMode ? '#475569' : '#CBD5E1';

  return (
    <View 
      style={[
        fullScreen ? styles.fullScreenContainer : styles.container,
        { 
          backgroundColor: baseColor,
          borderWidth: 0,
          borderColor: 'transparent',
        },
        style,
      ]}
    >
      {/* Base gradient background */}
      <LinearGradient
        colors={[baseColor, highlightColor, baseColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Animated shimmer overlay */}
      <Animated.View
        style={[
          styles.shimmerOverlay,
          {
            opacity: shimmerOpacity,
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient
          colors={[
            'transparent',
            shimmerColor,
            shimmerColor,
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.shimmerGradient}
        />
      </Animated.View>

      {/* Content placeholders for better visual feedback */}
      <View style={styles.contentPlaceholder}>
        {/* Logo placeholder */}
        <View style={[styles.logoPlaceholder, { backgroundColor: highlightColor }]} />
        
        {/* Text placeholders */}
        <View style={styles.textPlaceholderContainer}>
          <View style={[styles.textPlaceholder, { backgroundColor: highlightColor, width: '60%' }]} />
          <View style={[styles.textPlaceholder, { backgroundColor: highlightColor, width: '40%', marginTop: 12 }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderWidth: 0,
    borderColor: 'transparent',
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: width * 2,
  },
  shimmerGradient: {
    flex: 1,
    width: '100%',
  },
  contentPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 40,
    opacity: 0.6,
    borderWidth: 0, // No borders on placeholders
    borderColor: 'transparent',
  },
  textPlaceholderContainer: {
    alignItems: 'center',
    width: '100%',
  },
  textPlaceholder: {
    height: 20,
    borderRadius: 10,
    opacity: 0.5,
    borderWidth: 0, // No borders on placeholders
    borderColor: 'transparent',
  },
});

