import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SafeAreaWrapper from '../components/SafeAreaWrapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Colors, getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { Globe, MessageCircle, Shield, KeyboardOff } from 'lucide-react-native';
import { computeAge } from '../utils/ageGate';

const { height } = Dimensions.get('window');

// App onboarding: post-pivot social experience
const STEPS = [
  {
    id: 'express',
    Icon: Globe,
    title: 'Share what is real',
    description: 'Create text, photo, and video posts to express what is on your mind. Nomli is content-first and low-pressure.',
    iconColor: Colors.primary.main,
    iconBg: Colors.primary[50],
  },
  {
    id: 'chat',
    Icon: MessageCircle,
    title: 'Chat with context',
    description: 'Start conversations through post interactions and reply privately with context so chats begin naturally.',
    iconColor: Colors.primary.main,
    iconBg: Colors.primary[50],
  },
  {
    id: 'stories',
    Icon: Shield,
    title: 'Stories and authentic profile',
    description: 'Share stories, react to posts, and build a profile around your voice, not dating preferences or swipe behavior.',
    iconColor: Colors.primary.main,
    iconBg: Colors.primary[50],
  },
  {
    id: 'age',
    Icon: Shield,
    title: 'Your birthday',
    description: 'This helps keep Nomli safe and age-appropriate.',
    iconColor: Colors.primary.main,
    iconBg: Colors.primary[50],
  },
];

export default function OnboardingScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [dobError, setDobError] = useState<string | null>(null);

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      router.replace('/auth/signin');
    } catch {
      router.replace('/auth/signin');
    }
  };

  const onPrimary = () => {
    const step = STEPS[currentStep];
    if (step.id === 'age') {
      const mm = Number(dobMonth);
      const dd = Number(dobDay);
      const yyyy = Number(dobYear);
      if (!mm || !dd || !yyyy) {
        setDobError('Enter your full date of birth.');
        return;
      }
      if (yyyy < 1900 || yyyy > new Date().getFullYear()) {
        setDobError('Enter a valid year.');
        return;
      }
      if (mm < 1 || mm > 12) {
        setDobError('Month must be 1–12.');
        return;
      }
      if (dd < 1 || dd > 31) {
        setDobError('Day must be 1–31.');
        return;
      }

      const dob = new Date(Date.UTC(yyyy, mm - 1, dd));
      // Validate round-trip (reject invalid dates like Feb 30)
      if (
        dob.getUTCFullYear() !== yyyy ||
        dob.getUTCMonth() !== mm - 1 ||
        dob.getUTCDate() !== dd
      ) {
        setDobError('Enter a real date.');
        return;
      }

      const age = computeAge(new Date(yyyy, mm - 1, dd));
      if (age < 13) {
        setDobError('You must be 13 or older to use Nomli.');
        Alert.alert('Not eligible', 'You must be 13 or older to use Nomli.');
        return;
      }

      const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      AsyncStorage.setItem('pending_date_of_birth', iso).catch(() => {});
      setDobError(null);
      completeOnboarding();
      return;
    }

    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      completeOnboarding();
    }
  };

  const step = STEPS[currentStep];
  const Icon = step.Icon;
  const isLast = currentStep === STEPS.length - 1;
  const primaryColor = themeColors.primary?.main ?? Colors.primary.main;
  const inputBg = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const isAgeStep = step.id === 'age';

  const body = (
    <>
      {/* Skip */}
      <View style={[styles.skipWrap, { top: insets.top + 8 }]}>
        <TouchableOpacity onPress={completeOnboarding} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.skipText, { color: themeColors.neutral.subtext }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Content - lowered, less top space */}
      <View style={[styles.content, isAgeStep && styles.contentAgeStep]}>
        <View style={[styles.iconWrap, { backgroundColor: step.iconBg }]}>
          <Icon size={40} color={step.iconColor} strokeWidth={1.5} />
        </View>
        <Text style={[styles.title, { color: themeColors.neutral.text }]}>{step.title}</Text>
        <Text style={[styles.description, { color: themeColors.neutral.subtext }]}>{step.description}</Text>

        {isAgeStep && (
          <View style={styles.dobWrap}>
            <View style={styles.dobRow}>
              <View style={[styles.dobInputWrap, { backgroundColor: inputBg, borderColor: themeColors.neutral.border }]}>
                <TextInput
                  value={dobMonth}
                  onChangeText={(t) => {
                    setDobError(null);
                    const cleaned = t.replace(/[^\d]/g, '').slice(0, 2);
                    setDobMonth(cleaned);
                  }}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="MM"
                  placeholderTextColor={themeColors.neutral.textTertiary}
                  style={[styles.dobInput, { color: themeColors.neutral.text }]}
                  maxLength={2}
                  returnKeyType="next"
                />
              </View>
              <View style={[styles.dobInputWrap, { backgroundColor: inputBg, borderColor: themeColors.neutral.border }]}>
                <TextInput
                  value={dobDay}
                  onChangeText={(t) => {
                    setDobError(null);
                    const cleaned = t.replace(/[^\d]/g, '').slice(0, 2);
                    setDobDay(cleaned);
                  }}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="DD"
                  placeholderTextColor={themeColors.neutral.textTertiary}
                  style={[styles.dobInput, { color: themeColors.neutral.text }]}
                  maxLength={2}
                  returnKeyType="next"
                />
              </View>
              <View style={[styles.dobInputWrap, { flex: 1.2, backgroundColor: inputBg, borderColor: themeColors.neutral.border }]}>
                <TextInput
                  value={dobYear}
                  onChangeText={(t) => {
                    setDobError(null);
                    const cleaned = t.replace(/[^\d]/g, '').slice(0, 4);
                    setDobYear(cleaned);
                  }}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="YYYY"
                  placeholderTextColor={themeColors.neutral.textTertiary}
                  style={[styles.dobInput, { color: themeColors.neutral.text }]}
                  maxLength={4}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
              </View>
            </View>
            <TouchableOpacity
              style={styles.keyboardDismissRow}
              onPress={Keyboard.dismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Hide keyboard"
            >
              <KeyboardOff size={18} color={primaryColor} strokeWidth={2} />
              <Text style={[styles.keyboardDismissText, { color: primaryColor }]}>Hide keyboard</Text>
            </TouchableOpacity>
            {dobError ? (
              <Text style={[styles.dobError, { color: isDarkMode ? '#fca5a5' : '#dc2626' }]}>{dobError}</Text>
            ) : (
              <Text style={[styles.dobHint, { color: themeColors.neutral.subtext }]}>
                We don’t show your age on your profile.
              </Text>
            )}
          </View>
        )}
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
                { backgroundColor: i === currentStep ? primaryColor : themeColors.neutral.border },
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
      backgroundColor={isDarkMode ? themeColors.neutral.background : '#FFFFFF'}
    >
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <View style={[styles.container, { backgroundColor: isDarkMode ? themeColors.neutral.background : '#FFFFFF' }]}>
        {isAgeStep ? (
          <KeyboardAvoidingView
            style={styles.keyboardAvoid}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.ageScrollContent}
              bounces={false}
            >
              <View style={{ minHeight: height }}>{body}</View>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          body
        )}
      </View>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  ageScrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.md,
  },
  contentAgeStep: {
    justifyContent: 'flex-start',
    paddingTop: height < 700 ? height * 0.03 : height * 0.04,
  },
  keyboardDismissRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  keyboardDismissText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
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
  iconWrap: {
    width: height < 700 ? 72 : 80,
    height: height < 700 ? 72 : 80,
    borderRadius: (height < 700 ? 72 : 80) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: height < 700 ? Spacing.lg : Spacing.xl,
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
  dobWrap: {
    marginTop: Spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  dobRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dobInputWrap: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    height: 48,
    justifyContent: 'center',
  },
  dobInput: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.md,
    textAlign: 'center',
    paddingVertical: 10,
  },
  dobHint: {
    marginTop: 10,
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  dobError: {
    marginTop: 10,
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
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
