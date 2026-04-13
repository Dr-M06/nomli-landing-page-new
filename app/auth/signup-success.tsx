import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors } from '../../constants/Colors';
import { FontSizes, FontFamily, Spacing, BorderRadius } from '../../constants/Theme';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
import useAuth from '../../hooks/useAuth';
import { log, warn, error } from '../../utils/productionLogger';


const { width, height } = Dimensions.get('window');

export default function SignupSuccessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const hasNavigatedAway = useRef(false);
  
  log('[SignupSuccess] Component mounted - starting Gen Z animations...');
  
  // Prevent any redirects while on this screen
  useFocusEffect(
    React.useCallback(() => {
      log('[SignupSuccess] Screen focused - preventing redirects');
      hasNavigatedAway.current = false;
      
      return () => {
        log('[SignupSuccess] Screen unfocused');
        hasNavigatedAway.current = true;
      };
    }, [])
  );
  
  // Background animations
  const backgroundOpacity = useRef(new Animated.Value(0)).current;
  
  // Success circle animations (like splash logo)
  const circleScale = useRef(new Animated.Value(0)).current;
  const circleOpacity = useRef(new Animated.Value(0)).current;
  const circleRotation = useRef(new Animated.Value(0)).current;
  const circleGlow = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  
  // Checkmark animation
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.3)).current;
  const checkRotation = useRef(new Animated.Value(-20)).current;
  
  // Text animations
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(30)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;
  
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(20)).current;
  
  // Button animation
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(0.9)).current;
  const buttonTranslateY = useRef(new Animated.Value(20)).current;
  
  // Animated particles (like splash screen)
  const particles = useRef(
    Array.from({ length: 12 }, () => new Animated.Value(0))
  ).current;
  
  // Bottom accent bar
  const accentWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    log('[SignupSuccess] Starting Gen Z animation sequence...');
    
    // Background fade in
    Animated.timing(backgroundOpacity, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Animate particles (continuous loop)
    particles.forEach((particle, index) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(particle, {
            toValue: 1,
            duration: 2000 + index * 200,
            useNativeDriver: true,
          }),
          Animated.timing(particle, {
            toValue: 0,
            duration: 2000 + index * 200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });

    // Main animation sequence
    Animated.sequence([
      // 1. Circle scale, fade, and rotation (like splash logo)
      Animated.parallel([
        Animated.spring(circleScale, {
          toValue: 1,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(circleOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(circleRotation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      // 2. Circle glow effect
      Animated.timing(circleGlow, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      // 3. Checkmark pop-in
      Animated.parallel([
        Animated.spring(checkScale, {
          toValue: 1,
          tension: 80,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(checkOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(checkRotation, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // 4. Title animation with scale
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(titleTranslateY, {
          toValue: 0,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.spring(titleScale, {
          toValue: 1,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      // 5. Subtitle animation
      Animated.parallel([
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(subtitleTranslateY, {
          toValue: 0,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      // 6. Accent bar animation
      Animated.timing(accentWidth, {
        toValue: 1,
        duration: 800,
        useNativeDriver: false,
      }),
      // 7. Button animation
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(buttonScale, {
          toValue: 1,
          tension: 70,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.spring(buttonTranslateY, {
          toValue: 0,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      // 8. Pulse effect (continuous)
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseScale, {
              toValue: 1.05,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(circleGlow, {
              toValue: 0.6,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(circleGlow, {
              toValue: 1,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
        ])
      ),
    ]).start();
  }, []);

  const handleContinueToProfile = () => {
    log('[SignupSuccess] User clicked continue – following old logic: go to sign-in then app');
    // Old logic: after creating account, go through sign-in screen (signin then redirects to app)
    router.replace('/auth/signin');
  };

  return (
    <SafeAreaWrapper>
      <View style={styles.container}>
        {/* Background Gradient (like splash screen) */}
        <Animated.View style={[styles.background, { opacity: backgroundOpacity }]}>
          <LinearGradient
            colors={['#0F172A', '#1E293B', '#334155']}
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Blur Overlay */}
        <BlurView intensity={20} style={styles.blurOverlay} />

        {/* Animated Particles */}
        {particles.map((particle, index) => {
          const angle = (index / particles.length) * Math.PI * 2;
          const radius = 120 + (index % 3) * 40;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          
          return (
            <Animated.View
              key={index}
              style={[
                styles.particle,
                {
                  left: width / 2 + x,
                  top: height * 0.35 + y,
                  opacity: particle,
                  transform: [
                    {
                      translateY: particle.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -30 - index * 5],
                      }),
                    },
                    {
                      scale: particle.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1.2],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}

        {/* Content Container */}
        <View style={styles.contentContainer}>
          {/* Success Circle with Glow (like splash logo) */}
          <Animated.View
            style={[
              styles.circleContainer,
              {
                transform: [
                  { scale: circleScale },
                  { scale: pulseScale },
                  {
                    rotate: circleRotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
                opacity: circleOpacity,
              },
            ]}
          >
            {/* Glow Effect */}
            <Animated.View
              style={[
                styles.circleGlow,
                {
                  opacity: circleGlow,
                  transform: [
                    {
                      scale: circleGlow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1.3],
                      }),
                    },
                  ],
                },
              ]}
            />
            
            {/* Success Circle */}
            <View style={styles.successCircle}>
              <Animated.View
                style={[
                  styles.checkmarkContainer,
                  {
                    opacity: checkOpacity,
                    transform: [
                      { scale: checkScale },
                      {
                        rotate: checkRotation.interpolate({
                          inputRange: [-20, 0],
                          outputRange: ['-20deg', '0deg'],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Check size={52} color="#FFFFFF" strokeWidth={3.5} />
              </Animated.View>
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.View
            style={[
              styles.titleContainer,
              {
                opacity: titleOpacity,
                transform: [
                  { translateY: titleTranslateY },
                  { scale: titleScale },
                ],
              },
            ]}
          >
            <Text style={styles.title}>Welcome! 🎉</Text>
          </Animated.View>

          {/* Subtitle */}
          <Animated.View
            style={[
              styles.subtitleContainer,
              {
                opacity: subtitleOpacity,
                transform: [{ translateY: subtitleTranslateY }],
              },
            ]}
          >
            <Text style={styles.subtitle}>Your account has been created{'\n'}Let's set up your profile</Text>
          </Animated.View>

          {/* Continue Button (Glassmorphism style) */}
          <Animated.View
            style={[
              styles.buttonContainer,
              {
                opacity: buttonOpacity,
                transform: [
                  { scale: buttonScale },
                  { translateY: buttonTranslateY },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.button}
              onPress={handleContinueToProfile}
              activeOpacity={0.85}
            >
              <BlurView intensity={80} tint="light" style={styles.buttonBlur}>
                <LinearGradient
                  colors={[Colors.primary.main, Colors.primary.dark]}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.buttonText}>Continue</Text>
                </LinearGradient>
              </BlurView>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Animated Bottom Accent (like splash screen) */}
        <Animated.View
          style={[
            styles.bottomAccent,
            {
              width: accentWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl * 2,
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary.main,
    shadowColor: Colors.primary.main,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  circleContainer: {
    marginBottom: Spacing.xl * 2,
  },
  circleGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.success.main,
    opacity: 0.3,
    shadowColor: Colors.success.main,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 24,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.success.main,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.success.main,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  checkmarkContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 42,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
    letterSpacing: -1,
    textAlign: 'center',
  },
  subtitleContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl * 2,
    paddingHorizontal: Spacing.xl,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: FontFamily.regular,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 26,
    letterSpacing: 0.3,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 200,
    marginTop: Spacing.xl,
    alignSelf: 'center',
  },
  button: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: Colors.primary.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonBlur: {
    borderRadius: 30,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: FontFamily.semiBold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  bottomAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 4,
    backgroundColor: Colors.primary.main,
    shadowColor: Colors.primary.main,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
});
