import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import SafeAreaWrapper from '../components/SafeAreaWrapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { Heart, MessageCircle, Shield } from 'lucide-react-native';

const { height } = Dimensions.get('window');

// App onboarding: post-pivot social experience
const STEPS = [
  {
    id: 'social',
    Icon: Heart,
    title: 'Share what is real',
    description: 'Post text, photos, and videos in Social to express your vibe without pressure.',
    iconColor: '#FF6FAE',
    iconBg: 'rgba(255,111,174,0.16)',
  },
  {
    id: 'connect',
    Icon: MessageCircle,
    title: 'Match and connect',
    description: 'In Connect, like profiles around you. Mutual likes become matches and open chat.',
    iconColor: '#FF6FAE',
    iconBg: 'rgba(255,111,174,0.16)',
  },
  {
    id: 'inbox',
    Icon: Shield,
    title: 'One inbox for both worlds',
    description: 'Keep social conversations and dating matches in one Inbox with your full control.',
    iconColor: '#FF6FAE',
    iconBg: 'rgba(255,111,174,0.16)',
  },
];

const HERO_IMAGE_LEFT = 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1000&q=80';
const HERO_IMAGE_RIGHT = 'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1000&q=80';
const BG_DOODLES = ['💕', '🦩', '💘', '💞', '💌', '🫶'];

export default function OnboardingScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      router.replace('/auth/signin');
    } catch {
      router.replace('/auth/signin');
    }
  };

  const onPrimary = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      completeOnboarding();
    }
  };

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const primaryColor = '#FF6FAE';

  const body = (
    <>
      <View pointerEvents="none" style={styles.bgDoodleLayer}>
        {BG_DOODLES.map((emoji, i) => (
          <Text key={`${emoji}:${i}`} style={[styles.bgDoodle, styles[`bgDoodle${i}` as keyof typeof styles] as any]}>
            {emoji}
          </Text>
        ))}
      </View>

      {/* Skip */}
      <View style={[styles.skipWrap, { top: insets.top + 8 }]}>
        <TouchableOpacity onPress={completeOnboarding} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.skipText, { color: '#E5E7EB' }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Content - lowered, less top space */}
      <View style={styles.content}>
        <View style={styles.heroVisualWrap}>
          <View style={[styles.heroDoodleCircle, styles.heroDoodleCircleLeft]} />
          <View style={[styles.heroDoodleCircle, styles.heroDoodleCircleRight]} />
          <View style={[styles.heroPhotoCard, styles.heroPhotoLeft]}>
            <ExpoImage source={{ uri: HERO_IMAGE_LEFT }} style={styles.heroPhotoImage} contentFit="cover" transition={250} />
          </View>
          <View style={[styles.heroPhotoCard, styles.heroPhotoRight]}>
            <ExpoImage source={{ uri: HERO_IMAGE_RIGHT }} style={styles.heroPhotoImage} contentFit="cover" transition={250} />
          </View>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>real vibes</Text>
          </View>
        </View>
        <Text style={[styles.title, { color: '#F9FAFB' }]}>{step.title}</Text>
        <Text style={[styles.description, { color: '#CBD5E1' }]}>{step.description}</Text>
      </View>

      {/* Bottom - dots + CTA only */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentStep && styles.dotActive,
                { backgroundColor: i === currentStep ? primaryColor : 'rgba(148,163,184,0.55)' },
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: primaryColor }]}
          onPress={onPrimary}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>{isLast ? 'Continue' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <SafeAreaWrapper
      topInset={false}
      bottomInset={false}
      backgroundColor="#0B133A"
    >
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <View style={[styles.container, { backgroundColor: '#0B133A' }]}>
        {body}
      </View>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgDoodleLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  bgDoodle: {
    position: 'absolute',
    fontSize: 22,
    opacity: 0.12,
  },
  bgDoodle0: { top: '14%', left: '10%', transform: [{ rotate: '-10deg' }] },
  bgDoodle1: { top: '22%', right: '12%', transform: [{ rotate: '8deg' }] },
  bgDoodle2: { top: '42%', left: '7%', transform: [{ rotate: '-6deg' }] },
  bgDoodle3: { top: '58%', right: '10%', transform: [{ rotate: '12deg' }] },
  bgDoodle4: { bottom: '20%', left: '16%', transform: [{ rotate: '-8deg' }] },
  bgDoodle5: { bottom: '12%', right: '14%', transform: [{ rotate: '7deg' }] },
  skipWrap: {
    position: 'absolute',
    right: Spacing.lg,
    zIndex: 10,
  },
  skipText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.medium,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xxl,
    paddingTop: height < 700 ? height * 0.04 : height * 0.06,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroVisualWrap: {
    width: '100%',
    maxWidth: 280,
    height: 140,
    alignSelf: 'center',
    marginBottom: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroDoodleCircle: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1,
    borderColor: 'rgba(255,111,174,0.24)',
    backgroundColor: 'rgba(255,111,174,0.08)',
  },
  heroDoodleCircleLeft: {
    left: 22,
    top: 18,
  },
  heroDoodleCircleRight: {
    right: 22,
    top: 8,
  },
  heroPhotoCard: {
    position: 'absolute',
    width: 94,
    height: 126,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.82)',
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  heroPhotoLeft: {
    left: 58,
    top: 10,
    transform: [{ rotate: '-8deg' }],
  },
  heroPhotoRight: {
    right: 54,
    top: 16,
    transform: [{ rotate: '8deg' }],
  },
  heroPhotoImage: {
    width: '100%',
    height: '100%',
  },
  heroChip: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,111,174,0.9)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  heroChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: height < 700 ? FontSizes.xxxl : 30,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: height < 700 ? 36 : 40,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  description: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Spacing.sm,
    maxWidth: 320,
  },
  bottom: {
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    borderRadius: 3,
  },
  primaryButton: {
    width: '100%',
    maxWidth: 320,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
  },
});
