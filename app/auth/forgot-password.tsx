import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Mail, ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing } from '../../constants/Theme';
import Button from '../../components/Button';
import { supabase } from '../../utils/supabase';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
import { useTheme } from '../../contexts/ThemeContext';
import { MotiView } from 'moti';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { email: prefilledEmail } = useLocalSearchParams();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [email, setEmail] = useState(prefilledEmail as string || '');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState('');

  
  const validateForm = () => {
    if (!email) {
      setEmailError('Email is required');
      return false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Please enter a valid email');
      return false;
    } else {
      setEmailError('');
      return true;
    }
  };
  
  const handleResetPassword = async () => {
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      // Use OTP-based authentication for password reset
      const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: false, // Don't create user if they don't exist
        }
      });
      
      if (error) throw error;
      
      // Navigate to OTP verification screen
      router.replace({
        pathname: '/auth/verify-otp',
        params: { email }
      });
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  

  
  const isFocused = focusedField === 'email';
  const hasValue = email.length > 0;
  
  return (
    <SafeAreaWrapper>
      <View style={styles.backgroundContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F8F9FA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Subtle gradient accent */}
        <LinearGradient
          colors={['rgba(231, 121, 185, 0.08)', 'rgba(183, 148, 246, 0.08)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.6 }]}
        />
      </View>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => {
                // Small delay to ensure smooth transition
                setTimeout(() => {
                  router.replace('/auth/signin');
                }, 50);
              }}
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.content}>
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15, delay: 100 }}
              style={styles.iconContainer}
            >
              <View style={styles.iconMark} />
            </MotiView>
            
            <MotiView
              from={{ translateY: 20, opacity: 0 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, delay: 300 }}
            >
              <Text style={styles.title}>Forgot Password?</Text>
              <Text style={styles.description}>
                {prefilledEmail 
                  ? `We'll send a verification code to ${prefilledEmail} to reset your password.`
                  : "Enter your email and we'll send you a verification code to reset your password."
                }
              </Text>
            </MotiView>
            
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            
            {message ? (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>{message}</Text>
              </View>
            ) : null}
            
            <View style={styles.inputContainer}>
              {prefilledEmail && (
                <Text style={styles.prefilledIndicator}>
                  ✓ Pre-filled from sign-in
                </Text>
              )}
              <View style={[
                styles.inputWrapper,
                isFocused && styles.inputWrapperFocused,
                emailError && styles.inputWrapperError
              ]}>
                <Mail size={18} color={isFocused ? '#B794F6' : '#9CA3AF'} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (emailError) setEmailError('');
                  }}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => {
                    setFocusedField('');
                    validateForm();
                  }}
                />
              </View>
              {emailError && (
                <Text style={styles.errorText}>{emailError}</Text>
              )}
            </View>
            
            <Button
              title="Send Verification Code"
              onPress={handleResetPassword}
              loading={loading}
              fullWidth
              style={styles.button}
            />
            
            <TouchableOpacity 
              style={styles.backToLoginButton}
              onPress={() => router.replace('/auth/signin')}
              accessibilityLabel="Back to login"
            >
              <Text style={styles.backToLoginText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: Spacing.xl + Spacing.lg,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg + Spacing.xs,
    paddingBottom: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  iconMark: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: '#111827',
  },
  title: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
    color: '#1F2937',
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: Spacing.sm,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  description: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: '#6B7280',
    marginBottom: Spacing.xl + Spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '400',
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  prefilledIndicator: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    color: '#B794F6',
    marginBottom: Spacing.sm,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  inputWrapperFocused: {
    borderColor: '#B794F6',
    borderWidth: 1.5,
    shadowColor: '#B794F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputWrapperError: {
    borderColor: '#EF4444',
    borderWidth: 1.5,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: '#1F2937',
    paddingVertical: Spacing.sm + 2,
    fontWeight: '400',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontFamily: FontFamily.medium,
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs + 2,
  },
  successContainer: {
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  successText: {
    color: '#059669',
    fontSize: 14,
    fontFamily: FontFamily.medium,
  },
  button: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  backToLoginButton: {
    marginTop: Spacing.sm,
    alignItems: 'center',
    padding: Spacing.sm,
  },
  backToLoginText: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: '#B794F6',
    fontWeight: '600',
  },
});