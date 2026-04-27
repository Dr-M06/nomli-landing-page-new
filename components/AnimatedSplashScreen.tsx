import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  StatusBar,
  useColorScheme,
  Easing as RNEasing,
} from 'react-native';
import { Easing as ReanimatedEasing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { FontFamily } from '../constants/Theme';
import { MessageCircle, Heart, Video, MapPin, Users, Zap } from 'lucide-react-native';

interface AnimatedSplashScreenProps {
  onAnimationFinish: () => void;
}

const { width, height } = Dimensions.get('window');
const LOGO_SIZE = 100; // Reduced logo size

// Floating icons configuration
const floatingIcons = [
  { Icon: Video, position: { top: '15%', left: '10%' }, delay: 0, size: 28, color: '#8B5CF6' },
  { Icon: MessageCircle, position: { top: '25%', right: '15%' }, delay: 200, size: 24, color: '#A78BFA' },
  { Icon: Heart, position: { top: '60%', left: '12%' }, delay: 400, size: 26, color: '#C4B5FD' },
  { Icon: MapPin, position: { bottom: '25%', right: '10%' }, delay: 600, size: 24, color: '#8B5CF6' },
  { Icon: Users, position: { top: '45%', right: '8%' }, delay: 300, size: 22, color: '#A78BFA' },
  { Icon: Zap, position: { bottom: '35%', left: '15%' }, delay: 500, size: 20, color: '#C4B5FD' },
];

export default function AnimatedSplashScreen({ 
  onAnimationFinish
}: AnimatedSplashScreenProps) {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(10)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    startAnimation();
  }, []);

  const startAnimation = () => {
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 800,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(textTranslateY, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 600,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(taglineTranslateY, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1000),
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 400,
        easing: RNEasing.in(RNEasing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        onAnimationFinish();
      }, 100);
    });
  };

  // Clean, modern background
  const backgroundColor = isDarkMode ? '#000000' : '#FFFFFF';
  const textColor = isDarkMode ? '#FFFFFF' : '#000000';
  const taglineColor = isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)';

  return (
    <Animated.View style={[styles.container, { backgroundColor, opacity: containerOpacity }]}>
      <StatusBar 
        barStyle={isDarkMode ? 'light-content' : 'dark-content'} 
        backgroundColor="transparent" 
        translucent 
      />
      
      {floatingIcons.map((item, index) => {
        return (
          <MotiView
            key={index}
            from={{
              opacity: 0,
              scale: 0.5,
              translateY: 20,
            }}
            animate={{
              opacity: [0, 0.6, 0.4, 0.6],
              scale: 1,
              translateY: 0,
            }}
            transition={{
              type: 'timing',
              duration: 3000,
              delay: item.delay + 500,
              loop: true,
              easing: ReanimatedEasing.inOut(ReanimatedEasing.ease),
            }}
            style={[
              styles.floatingIcon,
              item.position,
            ]}
          >
            <item.Icon 
              size={item.size} 
              color={isDarkMode ? item.color : item.color} 
              strokeWidth={1.5}
            />
          </MotiView>
        );
      })}
      
      {/* Content Container */}
      <View style={styles.contentContainer}>
        {/* Animated Logo with Ring and Pulse */}
        <View style={styles.logoWrapper}>
          <>
              {/* Outer pulsing ring */}
              <MotiView
                from={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 1.3, opacity: 0 }}
              transition={{
                type: 'timing',
                duration: 2000,
                loop: true,
                easing: ReanimatedEasing.out(ReanimatedEasing.ease),
              }}
                style={[
                  styles.pulseRing,
                  {
                    borderColor: isDarkMode 
                      ? 'rgba(139, 92, 246, 0.4)' 
                      : 'rgba(139, 92, 246, 0.3)',
                  },
                ]}
              />
              
              {/* Middle pulsing ring */}
              <MotiView
                from={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.2, opacity: 0 }}
              transition={{
                type: 'timing',
                duration: 2000,
                loop: true,
                delay: 300,
                easing: ReanimatedEasing.out(ReanimatedEasing.ease),
              }}
                style={[
                  styles.pulseRing,
                  {
                    borderColor: isDarkMode 
                      ? 'rgba(167, 139, 250, 0.5)' 
                      : 'rgba(167, 139, 250, 0.4)',
                  },
                ]}
              />
              
              {/* Logo circle with gradient border */}
              <MotiView
                from={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: 'spring',
                  delay: 100,
                  damping: 12,
                  stiffness: 100,
                }}
              >
                <LinearGradient
                  colors={isDarkMode 
                    ? ['#8B5CF6', '#A78BFA', '#C4B5FD'] 
                    : ['#7C3AED', '#8B5CF6', '#A78BFA']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoGradientBorder}
                >
                  <View style={[styles.logoInner, { backgroundColor }]}>
                    {/* Animated pulse effect inside */}
                    <MotiView
                      from={{ scale: 1 }}
                      animate={{ scale: 1.05 }}
                  transition={{
                    type: 'timing',
                    duration: 2000,
                    loop: true,
                    easing: ReanimatedEasing.inOut(ReanimatedEasing.ease),
                  }}
                      style={styles.logoContent}
                    >
                      {/* Logo text/icon */}
                      <LinearGradient
                        colors={['#8B5CF6', '#A78BFA']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.logoTextGradient}
                      >
                        <Text style={styles.logoText}>N</Text>
                      </LinearGradient>
                    </MotiView>
                  </View>
                </LinearGradient>
              </MotiView>
          </>
        </View>

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
          <Text style={[styles.appName, { color: textColor }]}>
            Nomli Mingle
          </Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.View
          style={[
            styles.taglineContainer,
            {
              opacity: taglineOpacity,
              transform: [{ translateY: taglineTranslateY }],
            },
          ]}
        >
          <Text style={[styles.tagline, { color: taglineColor }]}>
            Beyond borders. Beyond limits.
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoWrapper: {
    width: LOGO_SIZE + 60,
    height: LOGO_SIZE + 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 48,
  },
  pulseRing: {
    position: 'absolute',
    width: LOGO_SIZE + 60,
    height: LOGO_SIZE + 60,
    borderRadius: (LOGO_SIZE + 60) / 2,
    borderWidth: 2,
  },
  logoGradientBorder: {
    width: LOGO_SIZE + 8,
    height: LOGO_SIZE + 8,
    borderRadius: (LOGO_SIZE + 8) / 2,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoInner: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoTextGradient: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 48,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  appName: {
    fontSize: 32,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  taglineContainer: {
    alignItems: 'center',
  },
  tagline: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  floatingIcon: {
    position: 'absolute',
    zIndex: 0,
  },
});
