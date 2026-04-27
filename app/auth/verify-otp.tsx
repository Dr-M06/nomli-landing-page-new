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
  Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing } from '../../constants/Theme';
import Button from '../../components/Button';
import { supabase } from '../../utils/supabase';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
import { MotiView } from 'moti';

export default function VerifyOTPScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams();
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  const inputRefs = useRef<TextInput[]>([]);
  
  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);
  
  const handleOtpChange = (value: string, index: number) => {
    if (value.length > 1) return; // Prevent multiple characters
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');
    
    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };
  
  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };
  
  const handleVerifyOTP = async () => {
    const otpCode = otp.join('');
    
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Verify the OTP
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email as string,
        token: otpCode,
        type: 'email'
      });
      
      if (verifyError) throw verifyError;
      
      // Navigate to reset password screen with the verified session
      router.replace({
        pathname: '/auth/reset-password',
        params: { verified: 'true' }
      });
    } catch (error: any) {
      setError(error.message || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    
    setResendLoading(true);
    setError('');
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email as string,
        options: {
          shouldCreateUser: false,
        }
      });
      
      if (error) throw error;
      
      setResendCooldown(60); // 60 second cooldown
      Alert.alert(
        'Code Sent',
        'A new verification code has been sent to your email.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      setError(error.message || 'Failed to resend code. Please try again.');
    } finally {
      setResendLoading(false);
    }
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          {/* Content */}
          <View style={styles.content}>
            {/* Animated Icon */}
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15, delay: 100 }}
              style={styles.iconContainer}
            >
              <View style={styles.iconMark} />
            </MotiView>
            
            {/* Title */}
            <MotiView
              from={{ translateY: 20, opacity: 0 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, delay: 300 }}
            >
              <Text style={styles.title}>Enter Verification Code</Text>
              
              {/* Description */}
              <Text style={styles.description}>
                We've sent a 6-digit verification code to{'\n'}
                <Text style={styles.emailText}>{email}</Text>
              </Text>
            </MotiView>
            
            {/* Error Message */}
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            
            {/* OTP Input */}
            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    if (ref) inputRefs.current[index] = ref;
                  }}
                  style={[
                    styles.otpInput,
                    digit ? styles.otpInputFilled : null,
                    error ? styles.otpInputError : null
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                  keyboardType="numeric"
                  maxLength={1}
                  selectTextOnFocus
                  autoFocus={index === 0}
                />
              ))}
            </View>
            
            {/* Verify Button */}
            <Button
              title="Verify Code"
              onPress={handleVerifyOTP}
              loading={loading}
              fullWidth
              style={styles.verifyButton}
              disabled={otp.join('').length !== 6}
            />
            
            {/* Resend Code */}
            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>Didn't receive the code? </Text>
              <TouchableOpacity
                onPress={handleResendOTP}
                disabled={resendLoading || resendCooldown > 0}
                style={styles.resendButton}
              >
                <Text style={[
                  styles.resendButtonText,
                  (resendLoading || resendCooldown > 0) && styles.resendButtonDisabled
                ]}>
                  {resendLoading ? 'Sending...' : 
                   resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 
                   'Resend Code'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* Back to Login */}
            <TouchableOpacity 
              style={styles.backToLoginButton}
              onPress={() => router.replace('/auth/signin')}
              accessibilityLabel="Back to login"
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
  scrollContent: {
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
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  iconMark: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#111827',
  },
  title: {
    fontSize: 24,
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
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl + Spacing.sm,
    fontWeight: '400',
  },
  emailText: {
    fontFamily: FontFamily.semibold,
    color: '#B794F6',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 10,
    marginBottom: Spacing.lg,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    color: '#EF4444',
    textAlign: 'center',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Spacing.xl + Spacing.sm,
    gap: Spacing.sm,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: FontFamily.bold,
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
    fontWeight: '700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  otpInputFilled: {
    borderColor: '#B794F6',
    borderWidth: 2,
    backgroundColor: 'rgba(183, 148, 246, 0.05)',
  },
  otpInputError: {
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  verifyButton: {
    marginBottom: Spacing.lg,
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  resendText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: '#6B7280',
  },
  resendButton: {
    paddingVertical: Spacing.xs,
  },
  resendButtonText: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: '#B794F6',
    fontWeight: '600',
  },
  resendButtonDisabled: {
    color: '#9CA3AF',
  },
  backToLoginButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  backToLoginText: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: '#B794F6',
    textAlign: 'center',
    fontWeight: '600',
  },
});
