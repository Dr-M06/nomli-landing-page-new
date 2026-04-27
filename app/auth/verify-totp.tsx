import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing } from '../../constants/Theme';
import Button from '../../components/Button';
import { supabase } from '../../utils/supabase';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
import { MotiView } from 'moti';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { challengeTOTP, verifyTOTPChallenge, getMFAFactors } from '../../utils/totpAuth';
import * as SecureStore from 'expo-secure-store';
import useAuth from '../../hooks/useAuth';
import { log, warn, error } from '../../utils/productionLogger';


export default function VerifyTOTPScreen() {
  const router = useRouter();
  const { factorId, userId, email } = useLocalSearchParams();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  
  // CRITICAL: Prevent navigation away from TOTP screen during auth state changes
  // The flood of SIGNED_OUT events might cause navigation issues
  const preventNavigationRef = useRef(false);
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challenging, setChallenging] = useState(false);
  
  const inputRefs = useRef<TextInput[]>([]);
  const autoVerifyTriggered = useRef(false);
  
  // Use userId if provided, otherwise fall back to factorId
  const actualUserId = (userId || factorId) as string;
  const userEmail = (email || '') as string;
  
  // CRITICAL: Prevent navigation away from TOTP screen
  // Set flag to prevent TabLayout from redirecting during TOTP flow
  useEffect(() => {
    preventNavigationRef.current = true;
    return () => {
      preventNavigationRef.current = false;
    };
  }, []);
  
  // Challenge TOTP on mount
  useEffect(() => {
    if (actualUserId && !challengeId && !challenging) {
      log('[TOTP] Initiating challenge on mount', { actualUserId, challengeId });
      initiateChallenge();
    } else if (!actualUserId) {
      warn('[TOTP] No actualUserId provided', { factorId, userId, email });
      setError('Missing authentication information. Please try signing in again.');
    }
  }, [actualUserId]);

  // Auto-verify when all 6 digits are entered
  useEffect(() => {
    const otpCode = otp.join('');
    
    // Reset auto-verify flag when OTP changes (user is typing)
    if (otpCode.length < 6) {
      autoVerifyTriggered.current = false;
      return;
    }
    
    // Only auto-verify if:
    // 1. We have exactly 6 digits
    // 2. We're not already loading/verifying
    // 3. We have a valid challenge ID
    // 4. There's no error
    // 5. We haven't already triggered auto-verify for this code
    if (
      otpCode.length === 6 &&
      !loading &&
      !challenging &&
      challengeId &&
      !error &&
      !autoVerifyTriggered.current
    ) {
      autoVerifyTriggered.current = true; // Mark as triggered to prevent duplicate calls
      
      // Small delay to ensure state is fully updated and UI is responsive
      const autoVerifyTimer = setTimeout(() => {
        // Double-check we still have 6 digits and aren't loading
        const currentOtp = otp.join('');
        if (currentOtp.length === 6 && !loading && !challenging && challengeId) {
          // Blur all inputs to dismiss keyboard
          inputRefs.current.forEach(ref => ref?.blur());
          // Auto-verify
          handleVerifyTOTP();
        } else {
          // Reset flag if conditions changed
          autoVerifyTriggered.current = false;
        }
      }, 300); // Delay to ensure state is stable
      
      return () => clearTimeout(autoVerifyTimer);
    }
  }, [otp, loading, challenging, challengeId, error]);
  
  const initiateChallenge = async () => {
    if (!actualUserId || typeof actualUserId !== 'string') {
      const errorMsg = 'Invalid authentication factor. Please try signing in again.';
      error('[TOTP] Invalid actualUserId:', { actualUserId, factorId, userId });
      setError(errorMsg);
      setChallenging(false);
      return;
    }
    
    setChallenging(true);
    setError('');
    
    try {
      log('[TOTP] Challenging TOTP for userId:', actualUserId);
      const result = await challengeTOTP(actualUserId);
      
      if (result.success && result.challengeId) {
        log('[TOTP] Challenge successful, challengeId:', result.challengeId);
        setChallengeId(result.challengeId);
      } else {
        const errorMsg = result.error || 'Failed to initiate authentication challenge. Please try again.';
        error('[TOTP] Challenge failed:', result);
        setError(errorMsg);
        // Still allow user to try entering code - they can use "Get New Code" button
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start authentication. Please try again.';
      error('[TOTP] Challenge exception:', error);
      setError(errorMsg);
      // Still allow user to try entering code - they can use "Get New Code" button
    } finally {
      setChallenging(false);
    }
  };
  
  const handleOtpChange = (value: string, index: number) => {
    // Handle paste - if value is longer than 1, it's a paste operation
    if (value.length > 1) {
      // Extract all digits from pasted value (handles spaces, dashes, etc.)
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = ['', '', '', '', '', ''];
      digits.forEach((digit, i) => {
        if (i < 6) newOtp[i] = digit;
      });
      
      // Update state immediately
      setOtp(newOtp);
      setError('');
      
      // If we have exactly 6 digits, auto-submit
      if (digits.length === 6) {
        // Blur all inputs to dismiss keyboard
        inputRefs.current.forEach(ref => ref?.blur());
        // Auto-submit after a short delay to ensure state is updated
        setTimeout(() => {
          handleVerifyTOTP();
        }, 200);
        return;
      }
      
      // If less than 6 digits, focus the next empty input
      const nextIndex = Math.min(digits.length, 5);
      if (nextIndex < 6) {
        setTimeout(() => {
          inputRefs.current[nextIndex]?.focus();
        }, 50);
      }
      return;
    }
    
    // Single character input
    // Only allow digits
    if (value && !/^\d+$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');
    
    // Auto-focus next input
    if (value && index < 5) {
      setTimeout(() => {
        inputRefs.current[index + 1]?.focus();
      }, 50);
    } else if (value && index === 5) {
      // Last digit entered - blur the input to dismiss keyboard
      // Auto-verification will be handled by useEffect
      setTimeout(() => {
        inputRefs.current[index]?.blur();
      }, 50);
    }
  };
  
  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };
  
  const handleVerifyTOTP = async () => {
    const otpCode = otp.join('');
    
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    
    // Prevent multiple submissions
    if (loading) {
      return;
    }
    
    // If no challengeId, try to initiate challenge first
    if (!challengeId) {
      log('[TOTP] No challengeId, initiating challenge before verification');
      setError('Initializing authentication challenge...');
      await initiateChallenge();
      
      // Wait a moment for challenge to complete, then retry if we got a challengeId
      setTimeout(async () => {
        if (challengeId) {
          // Retry verification with the new challengeId
          await handleVerifyTOTP();
        } else {
          setError('Failed to initialize challenge. Please click "Get New Code" and try again.');
        }
      }, 1000);
      return;
    }
    
    setLoading(true);
    setError('');
    
    // Blur all inputs to dismiss keyboard
    inputRefs.current.forEach(ref => ref?.blur());
    
    try {
      // Verify TOTP code
      const result = await verifyTOTPChallenge(challengeId, otpCode);
      
      if (result.success) {
        // TOTP verified successfully - mark device as trusted BEFORE re-authenticating
        // This ensures the TOTP check during sign-in will skip TOTP requirement
        if (actualUserId) {
          try {
            const trustedDeviceKey = `totp_trusted_${actualUserId}`;
            const trustedData = {
              sessionId: 'totp_verified', // Placeholder, will be updated after re-auth
              timestamp: Date.now(),
              userId: actualUserId,
            };
            await SecureStore.setItemAsync(trustedDeviceKey, JSON.stringify(trustedData));
            log('[TOTP] Device marked as trusted BEFORE re-authentication');
          } catch (trustError) {
            warn('[TOTP] Error marking device as trusted:', trustError);
          }
        }
        
        // Now sign in with password again to get session
        // We need to re-authenticate since we signed out earlier
        if (!userEmail) {
          setError('Email not found. Please sign in again.');
          router.back();
          return;
        }
        
        // Get password from secure storage
        let password: string | null = null;
        try {
          password = await SecureStore.getItemAsync('temp_password_for_totp');
          if (password) {
            // Clear the temp password immediately after retrieving
            await SecureStore.deleteItemAsync('temp_password_for_totp');
          }
        } catch (error) {
          error('Error retrieving temp password:', error);
        }
        
        if (!password) {
          setError('Please sign in again with your password. TOTP verification was successful.');
          setTimeout(() => {
            router.back();
          }, 2000);
          return;
        }
        
        // Re-authenticate with email and password
        // Device is already marked as trusted, so TOTP check should skip
        log('[TOTP] Re-authenticating after TOTP verification');
        const signInResult = await signIn(userEmail, password);
        
        if (signInResult === true) {
          // Update trusted device token with actual session
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && actualUserId) {
              const trustedDeviceKey = `totp_trusted_${actualUserId}`;
              const trustedData = {
                sessionId: session.access_token,
                timestamp: Date.now(),
                userId: actualUserId,
              };
              await SecureStore.setItemAsync(trustedDeviceKey, JSON.stringify(trustedData));
              log('[TOTP] Device trust updated with actual session');
            }
          } catch (trustError) {
            warn('[TOTP] Error updating trusted device:', trustError);
            // Don't fail sign-in if trust storage fails
          }
          
          // Sign-in complete - navigate to main app
          Toast.show({
            type: 'success',
            text1: 'Sign in successful',
            text2: 'Welcome back!',
          });
          
          router.replace('/(tabs)/discovery');
        } else {
          setError('Failed to complete sign in. Please try again.');
        }
      } else {
        setError(result.error || 'Invalid verification code. Please try again.');
        // Clear OTP on error and reset auto-verify flag
        setOtp(['', '', '', '', '', '']);
        autoVerifyTriggered.current = false;
        inputRefs.current[0]?.focus();
      }
    } catch (error: any) {
      error('[TOTP] Verification error:', error);
      setError(error.message || 'Failed to verify code. Please try again.');
      // Clear OTP on error and reset auto-verify flag
      setOtp(['', '', '', '', '', '']);
      autoVerifyTriggered.current = false;
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };
  
  const handleResendChallenge = async () => {
    setError('');
    await initiateChallenge();
    Toast.show({
      type: 'info',
      text1: 'New challenge initiated',
      text2: 'Please enter the code from your authenticator app',
    });
  };
  
  return (
    <SafeAreaWrapper>
      <View style={styles.backgroundContainer}>
        <LinearGradient
          colors={isDarkMode ? ['#1F2937', '#111827'] : ['#FFFFFF', '#F8F9FA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Subtle gradient accent */}
        <LinearGradient
          colors={['rgba(183, 148, 246, 0.1)', 'rgba(231, 121, 185, 0.1)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.6 }]}
        />
      </View>
      
      {/* Custom Header */}
      <View style={[styles.customHeader, { 
        backgroundColor: 'transparent',
        paddingTop: Platform.OS === 'ios' ? insets.top : 0,
      }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.6}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <View style={[styles.backButtonContainer, { 
            backgroundColor: themeColors.neutral.card,
            borderColor: themeColors.neutral.border,
          }]}>
            <ChevronLeft 
              size={18} 
              color={themeColors.neutral.text} 
              strokeWidth={3} 
            />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.neutral.text }]}>
          Two-Factor Authentication
        </Text>
        <View style={styles.headerRight} />
      </View>
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <MotiView
            from={{ translateY: 20, opacity: 0 }}
            animate={{ translateY: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 20 }}
            style={styles.content}
          >
            <View style={styles.iconContainer}>
              <Shield size={48} color="#B794F6" strokeWidth={1.5} />
            </View>
            
            <Text style={[styles.title, { color: themeColors.neutral.text }]}>
              Enter Authentication Code
            </Text>
            
            <Text style={[styles.subtitle, { color: themeColors.neutral.textSecondary }]}>
              Open your authenticator app and enter the 6-digit code to complete sign in.
            </Text>
            
            {challenging && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#B794F6" />
                <Text style={[styles.loadingText, { color: themeColors.neutral.textSecondary }]}>
                  Initializing authentication...
                </Text>
              </View>
            )}
            
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            
            {/* CRITICAL: Always show OTP inputs - they should always be visible */}
            {/* Even if challenge hasn't completed, user can still enter code */}
            {!actualUserId && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  Missing authentication information. Please go back and sign in again.
                </Text>
              </View>
            )}
            
            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    if (ref) inputRefs.current[index] = ref;
                  }}
                  style={[
                    styles.otpInput,
                    {
                      borderColor: error 
                        ? Colors.error.main 
                        : digit 
                        ? '#B794F6' 
                        : themeColors.neutral.border,
                      backgroundColor: themeColors.neutral.card,
                      color: themeColors.neutral.text,
                    },
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                  keyboardType="number-pad"
                  maxLength={6} // Allow paste of full code
                  selectTextOnFocus
                  autoFocus={index === 0}
                  autoComplete="off"
                  textContentType="oneTimeCode" // iOS will auto-fill from SMS/keyboard suggestions
                />
              ))}
            </View>
            
            <TouchableOpacity
              style={[styles.verifyButton, (loading || challenging) && styles.verifyButtonDisabled]}
              onPress={handleVerifyTOTP}
              disabled={loading || challenging}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.verifyButtonText}>
                  {!challengeId ? 'Initialize First' : 'Verify Code'}
                </Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.resendButton}
              onPress={handleResendChallenge}
              disabled={challenging}
              activeOpacity={0.6}
            >
              <Text style={[styles.resendButtonText, { color: themeColors.primary.main }]}>
                {challenging ? 'Initializing...' : 'Get New Code'}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.infoContainer}>
              <Text style={[styles.infoText, { color: themeColors.neutral.textSecondary }]}>
                💡 Having trouble? Make sure your device time is set correctly and try entering a new code.
              </Text>
            </View>
          </MotiView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    zIndex: 10,
  },
  backButton: {
    padding: 0,
  },
  backButtonContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.bold,
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 36,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(183, 148, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 24,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  loadingText: {
    marginLeft: Spacing.sm,
    fontSize: FontSizes.sm,
  },
  errorContainer: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.error.main,
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
    minHeight: 60, // Ensure container has minimum height
    opacity: 1, // Ensure it's always visible
  },
  otpInput: {
    width: 50,
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: FontFamily.bold,
    opacity: 1, // Ensure inputs are always visible
    zIndex: 1, // Ensure inputs are above other elements
  },
  verifyButton: {
    backgroundColor: '#B794F6',
    borderRadius: 12,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.md,
    minHeight: 52,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
  },
  resendButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  resendButtonText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  infoContainer: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: 'rgba(183, 148, 246, 0.08)',
    borderRadius: 12,
    width: '100%',
  },
  infoText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
    textAlign: 'center',
  },
});
