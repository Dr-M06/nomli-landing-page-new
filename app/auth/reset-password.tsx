import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  Alert,
  TextInput
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Lock, ChevronLeft, Eye, EyeOff, Check, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing } from '../../constants/Theme';
import Button from '../../components/Button';
import { supabase } from '../../utils/supabase';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
import { MotiView } from 'moti';
import { log, warn, error } from '../../utils/productionLogger';


export default function ResetPasswordScreen() {
  const router = useRouter();
  const { access_token, refresh_token, verified } = useLocalSearchParams();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState('');
  
  // Check if we have valid tokens or OTP verification
  useEffect(() => {
    if (!verified && (!access_token || !refresh_token)) {
      Alert.alert(
        'Invalid Reset Link',
        'This reset link is invalid or has expired. Please request a new password reset.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/auth/forgot-password')
          }
        ]
      );
    }
  }, [access_token, refresh_token, verified]);

  // Password strength validation
  const getPasswordStrength = (password) => {
    if (!password) return { score: 0, text: '', color: Colors.neutral.subtext };
    
    let score = 0;
    const checks = {
      length: (password?.length || 0) >= 8,
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
    
    score = Object.values(checks).filter(Boolean).length;
    
    if (score < 2) return { score, text: 'Weak', color: Colors.error.main, checks };
    if (score < 4) return { score, text: 'Fair', color: '#FF8C00', checks };
    if (score < 5) return { score, text: 'Good', color: '#32CD32', checks };
    return { score, text: 'Strong', color: '#228B22', checks };
  };

  const passwordStrength = getPasswordStrength(password);
  
  const validateForm = () => {
    let isValid = true;
    
    if (!password) {
      setPasswordError('Password is required');
      isValid = false;
    } else if ((password?.length || 0) < 8) {
      setPasswordError('Password must be at least 8 characters');
      isValid = false;
    } else {
      setPasswordError('');
    }
    
    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      isValid = false;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      isValid = false;
    } else {
      setConfirmPasswordError('');
    }
    
    return isValid;
  };
  
  const handleResetPassword = async () => {
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');
    
    try {
      // If coming from OTP verification, we already have a valid session
      if (verified === 'true') {
        // Update the password directly
        const { error: updateError } = await supabase.auth.updateUser({
          password: password
        });
        
        if (updateError) throw updateError;
      } else {
        // Legacy flow: Set the session using the tokens from the email link
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: access_token as string,
          refresh_token: refresh_token as string,
        });
        
        if (sessionError) throw sessionError;
        
        // Update the password
        const { error: updateError } = await supabase.auth.updateUser({
          password: password
        });
        
        if (updateError) throw updateError;
      }
      
      // Show success message and handle navigation carefully
      Alert.alert(
        'Password Reset Successful',
        'Your password has been updated successfully. You can now sign in with your new password.',
        [
          {
            text: 'OK',
            onPress: async () => {
              try {
                // Clear any existing session properly
                log('[ResetPassword] Clearing session and navigating to signin');
                // Local-only sign out: keep other device/app sessions unaffected.
                await supabase.auth.signOut({ scope: 'local' });
                
                // Wait a bit longer for cleanup, then navigate
                setTimeout(() => {
                  log('[ResetPassword] Navigating to signin after successful reset');
                  router.replace('/auth/signin');
                }, 1000); // Increased timeout
              } catch (signOutError) {
                error('[ResetPassword] Error during signOut:', signOutError);
                // If signOut fails, still navigate but with delay
                setTimeout(() => {
                  router.replace('/auth/signin');
                }, 500);
              }
            }
          }
        ]
      );
    } catch (error: any) {
      error('Reset password error:', error);
      setError(error.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderPasswordStrengthIndicator = () => {
    if (!password) return null;
    
    return (
      <View style={styles.passwordStrengthContainer}>
        <View style={styles.passwordStrengthHeader}>
          <Text style={[styles.passwordStrengthText, { color: passwordStrength.color }]}>
            Password strength: {passwordStrength.text}
          </Text>
          <View style={styles.passwordStrengthBar}>
            <View 
              style={[
                styles.passwordStrengthFill, 
                { 
                  width: `${(passwordStrength.score / 5) * 100}%`,
                  backgroundColor: passwordStrength.color 
                }
              ]} 
            />
          </View>
        </View>
        <View style={styles.passwordChecks}>
          {Object.entries({
            'At least 8 characters': passwordStrength.checks?.length,
            'Lowercase letter': passwordStrength.checks?.lowercase,
            'Uppercase letter': passwordStrength.checks?.uppercase,
            'Number': passwordStrength.checks?.number,
            'Special character': passwordStrength.checks?.special,
          }).map(([requirement, met]) => (
            <View key={requirement} style={styles.passwordCheck}>
              {met ? (
                <Check size={12} color="#00FF88" />
              ) : (
                <X size={12} color="#9CA3AF" />
              )}
              <Text style={[styles.passwordCheckText, { color: met ? '#00FF88' : '#6B7280' }]}>
                {requirement}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };
  
  const renderPasswordInput = (
    placeholder: string,
    value: string,
    setValue: (text: string) => void,
    showPassword: boolean,
    setShowPassword: (show: boolean) => void,
    error: string,
    fieldId: string
  ) => {
    const isFocused = focusedField === fieldId;
    
    return (
      <View style={styles.inputContainer}>
        <View style={[
          styles.inputWrapper,
          isFocused && styles.inputWrapperFocused,
          error && styles.inputWrapperError
        ]}>
          <Lock size={18} color={isFocused ? '#B794F6' : '#9CA3AF'} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            value={value}
            onChangeText={setValue}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            onFocus={() => setFocusedField(fieldId)}
            onBlur={() => setFocusedField('')}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff size={18} color="#9CA3AF" />
            ) : (
              <Eye size={18} color="#9CA3AF" />
            )}
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  };
  
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
        >
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
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
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.description}>
                Enter your new password below. Make sure it's strong and secure.
              </Text>
            </MotiView>
            
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorTextMessage}>{error}</Text>
              </View>
            ) : null}
            
            {renderPasswordInput(
              'Enter your new password',
              password,
              setPassword,
              showPassword,
              setShowPassword,
              passwordError,
              'password'
            )}
            
            {renderPasswordStrengthIndicator()}
            
            {renderPasswordInput(
              'Confirm your new password',
              confirmPassword,
              setConfirmPassword,
              showConfirmPassword,
              setShowConfirmPassword,
              confirmPasswordError,
              'confirmPassword'
            )}
            
            <Button
              title="Update Password"
              onPress={handleResetPassword}
              loading={loading}
              fullWidth
              style={styles.button}
            />
            
            <TouchableOpacity 
              style={styles.backToLoginButton}
              onPress={() => router.replace('/auth/signin')}
              accessibilityLabel="Back to sign in"
            >
              <Text style={styles.backToLoginText}>Back to Sign In</Text>
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
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
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
  description: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: '#6B7280',
    marginBottom: Spacing.xl + Spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
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
  errorTextMessage: {
    color: '#EF4444',
    fontSize: 14,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: Spacing.lg,
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
  eyeButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontFamily: FontFamily.medium,
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs + 2,
  },
  passwordStrengthContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    padding: Spacing.sm + 2,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  passwordStrengthHeader: {
    marginBottom: Spacing.xs,
  },
  passwordStrengthText: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.xs,
    fontWeight: '500',
  },
  passwordStrengthBar: {
    height: 3,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  passwordStrengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  passwordChecks: {
    gap: Spacing.xs - 2,
  },
  passwordCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  passwordCheckText: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
  },
  button: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  backToLoginButton: {
    alignItems: 'center',
    marginTop: Spacing.sm,
    padding: Spacing.sm,
  },
  backToLoginText: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: '#B794F6',
    textAlign: 'center',
    fontWeight: '600',
  },
}); 