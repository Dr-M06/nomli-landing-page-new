import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import { getSafeImageSource } from '../utils/safeAvatarUrl';

interface AnimatedAvatarProps {
  avatarUrl?: string | null;
  size?: number;
  isDarkMode?: boolean;
  colorMode?: 'pastel' | 'vibrant' | 'ocean' | 'sunset';
  userId?: string;
}

const AnimatedAvatar: React.FC<AnimatedAvatarProps> = ({ 
  avatarUrl, 
  size = 100, 
  isDarkMode = false,
  colorMode = 'vibrant',
  userId
}) => {
  // Animation values
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;
  const rotationAnimReverse = useRef(new Animated.Value(0)).current;
  
  // Helper function to generate DiceBear URL
  const generateDiceBearUrl = (style: string, seed: string = 'default') => {
    return `https://api.dicebear.com/9.x/${style}/png?seed=${seed}&size=${size}`;
  };
  
  // Helper function to get the correct avatar URL
  const getAvatarUrl = (url?: string | null) => {
    if (!url) return null;
    
    // Handle DiceBear avatars
    if (url.startsWith('dicebear:')) {
      const avatarData = url.replace('dicebear:', '');
      if (avatarData.includes(':')) {
        const [style, seed] = avatarData.split(':');
        return generateDiceBearUrl(style, seed);
      } else {
        // Handle old format (style only) - use userId as seed
        return generateDiceBearUrl(avatarData, userId);
      }
    }
    
    // Add cache-busting timestamp only for uploaded images
    return url + (url.includes('?') ? '' : '?t=' + Date.now());
  };
  
  // Set up animations when component mounts
  useEffect(() => {
    startAnimations();
    
    // Clean up animations when component unmounts
    return () => {
      // Stop all animations
      rotationAnim.stopAnimation();
      scaleAnim.stopAnimation();
      rotationAnimReverse.stopAnimation();
    };
  }, []);
  
  // Start all animations
  const startAnimations = () => {
    // Create the rotation animation
    Animated.loop(
      Animated.timing(rotationAnim, {
        toValue: 1,
        duration: 15000, // 15 seconds for a full rotation - slower is more soothing
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
    
    // Create counter-rotation for inner gradient (creates a shimmering effect)
    Animated.loop(
      Animated.timing(rotationAnimReverse, {
        toValue: 1,
        duration: 25000, // Slower than the outer rotation
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
    
    // Create the pulsing animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.03, // More subtle scale
          duration: 2500, // Slower pulse (2.5s)
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.97, // More subtle scale
          duration: 2500, // Slower pulse (2.5s)
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };
  
  // Create the rotation interpolations
  const spin = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  
  const spinReverse = rotationAnimReverse.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });
  
  // Calculated values
  const ringSize = size + 16; // Make the ring slightly larger than the avatar
  const innerRingSize = ringSize - 6; // Size of the inner space
  
  // Different color schemes
  const colorSchemes = {
    vibrant: {
      outer: [
        '#8B5CF6', // Purple
        '#EC4899', // Pink
        '#3B82F6', // Blue
        '#10B981', // Green
        '#8B5CF6', // Back to purple for seamless gradient
      ],
      inner: [
        '#EC4899', // Pink
        '#3B82F6', // Blue
        '#10B981', // Green
        '#F59E0B', // Amber
        '#EC4899', // Back to pink for seamless gradient
      ]
    },
    pastel: {
      outer: [
        '#C7D2FE', // Pastel purple
        '#FBCFE8', // Pastel pink
        '#BFDBFE', // Pastel blue
        '#A7F3D0', // Pastel green
        '#C7D2FE', // Back to pastel purple
      ],
      inner: [
        '#FBCFE8', // Pastel pink
        '#BFDBFE', // Pastel blue
        '#A7F3D0', // Pastel green
        '#FDE68A', // Pastel yellow
        '#FBCFE8', // Back to pastel pink
      ]
    },
    ocean: {
      outer: [
        '#0EA5E9', // Sky blue
        '#0284C7', // Blue
        '#0C4A6E', // Dark blue
        '#0891B2', // Cyan
        '#0EA5E9', // Back to sky blue
      ],
      inner: [
        '#0891B2', // Cyan
        '#0EA5E9', // Sky blue
        '#38BDF8', // Light blue
        '#7DD3FC', // Lighter blue
        '#0891B2', // Back to cyan
      ]
    },
    sunset: {
      outer: [
        '#F59E0B', // Amber
        '#EF4444', // Red
        '#B91C1C', // Dark red
        '#7F1D1D', // Darker red
        '#F59E0B', // Back to amber
      ],
      inner: [
        '#F97316', // Orange
        '#F59E0B', // Amber
        '#FBBF24', // Yellow
        '#F97316', // Orange again
        '#F97316', // Back to orange
      ]
    }
  };
  
  // Get the selected color scheme
  const colors = colorSchemes[colorMode];
  
  // Use dark mode appropriate colors for the inner parts
  const backgroundColor = isDarkMode ? Colors.neutral.background : 'white';
  const borderColor = isDarkMode ? Colors.primary.dark : Colors.primary.light;
  
  return (
    <View style={[styles.container, { width: ringSize, height: ringSize }]}>
      {/* Outer animated gradient ring */}
      <Animated.View
        style={[
          styles.ringContainer,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            transform: [
              { rotate: spin },
              { scale: scaleAnim }
            ],
          }
        ]}
      >
        <LinearGradient
          colors={colors.outer}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={{
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            position: 'absolute',
          }}
        />
      </Animated.View>
      
      {/* Inner circle with second gradient */}
      <Animated.View
        style={{
          position: 'absolute',
          width: innerRingSize,
          height: innerRingSize,
          borderRadius: innerRingSize / 2,
          backgroundColor: backgroundColor,
          borderWidth: 3,
          borderColor: 'transparent',
          overflow: 'hidden',
          transform: [
            { rotate: spinReverse }
          ],
        }}
      >
        <LinearGradient
          colors={colors.inner}
          start={{x: 0, y: 1}}
          end={{x: 1, y: 0}}
          style={{
            width: innerRingSize,
            height: innerRingSize,
            borderRadius: innerRingSize / 2,
            position: 'absolute',
            opacity: 0.2, // Subtle inner gradient
          }}
        />
      </Animated.View>

      {/* Inner white space in the middle */}
      <View
        style={{
          position: 'absolute',
          width: innerRingSize - 6,
          height: innerRingSize - 6,
          borderRadius: (innerRingSize - 6) / 2,
          backgroundColor: backgroundColor,
        }}
      />
      
      {/* Avatar image */}
      <Image
        source={
          getSafeImageSource(avatarUrl, userId) || 
          require('../assets/images/default-avatar.png')
        }
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: borderColor,
          }
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center', 
    justifyContent: 'center',
  },
  ringContainer: {
    position: 'absolute',
    overflow: 'hidden',
  },
  avatar: {
    backgroundColor: Colors.neutral.disabled,
    borderWidth: 3,
  },
});

export default AnimatedAvatar; 