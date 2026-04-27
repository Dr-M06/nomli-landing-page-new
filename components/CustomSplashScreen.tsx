import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors } from '../constants/Colors';
import { FontFamily, FontSizes } from '../constants/Theme';

interface CustomSplashScreenProps {
  onAnimationFinish?: () => void;
}

const { width, height } = Dimensions.get('window');

export default function CustomSplashScreen({ onAnimationFinish }: CustomSplashScreenProps) {
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(30)).current;
  const backgroundOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    startAnimation();
  }, []);

  const startAnimation = () => {
    // Background fade in
    Animated.timing(backgroundOpacity, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Logo animation sequence
    Animated.sequence([
      // Logo scale and fade in
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      // Text animation
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(textTranslateY, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      // Pulse effect
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.05,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        { iterations: 2 }
      ),
    ]).start(() => {
      // Animation finished
      setTimeout(() => {
        onAnimationFinish?.();
      }, 500);
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Ultra Modern Gradient Background */}
      <Animated.View style={[styles.background, { opacity: backgroundOpacity }]}>
        <LinearGradient
          colors={['#0a0a0f', '#1a0a1e', '#0f0a1a']}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Content Container */}
      <View style={styles.contentContainer}>
        {/* Logo Container */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [
                { scale: logoScale },
                { scale: pulseScale },
              ],
              opacity: logoOpacity,
            },
          ]}
        >
          {/* Logo Image */}
          <Image
            source={require('../assets/images/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* App Name */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={styles.appName}>Nomli Mingle</Text>
          <Text style={styles.tagline}>Beyond borders. Beyond limits.</Text>
        </Animated.View>
      </View>

      {/* Bottom Accent */}
      <View style={styles.bottomAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradient: {
    flex: 1,
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    marginBottom: 60,
  },
  logoImage: {
    width: 400,
    height: 400,
  },
  textContainer: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 34,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    fontFamily: FontFamily.medium,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 1,
  },
  bottomAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 0,
    backgroundColor: 'transparent',
  },
});
