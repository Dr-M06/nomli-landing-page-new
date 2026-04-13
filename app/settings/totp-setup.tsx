import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Linking,
  Image,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Shield, ChevronLeft, QrCode, Copy, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../utils/supabase';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing } from '../../constants/Theme';
import useAuth from '../../hooks/useAuth';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
import Toast from 'react-native-toast-message';
import { MotiView } from 'moti';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { enrollTOTP, verifyTOTPEnrollment } from '../../utils/totpAuth';
import { generateTOTPSecret } from '../../utils/totpService';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { log, warn, error } from '../../utils/productionLogger';


export default function TOTPSetupScreen() {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  
  const [step, setStep] = useState<'enroll' | 'verify'>('enroll');
  const [loading, setLoading] = useState(true); // Start with loading true to show loading state
  const [enrolling, setEnrolling] = useState(true); // Start with enrolling true so loading shows immediately
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [uri, setUri] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [factorId, setFactorId] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [copied, setCopied] = useState(false);
  
  const inputRefs = React.useRef<TextInput[]>([]);
  
  const startEnrollment = useCallback(async () => {
    setEnrolling(true);
    setLoading(true);
    setError('');
    
    try {
      if (!user?.id) {
        setError('User not authenticated');
        setLoading(false);
        setEnrolling(false);
        return;
      }

      // Use backend Edge Function directly to get backup codes
      log('[TOTP Setup] Starting enrollment for user:', user.id);
      const totpData = await generateTOTPSecret(user.id);
      log('[TOTP Setup] Received TOTP data:', {
        hasSecret: !!totpData.secret,
        hasQrData: !!totpData.qr_data,
        backupCodesCount: totpData.backup_codes?.length || 0,
      });
      
      if (!totpData.secret || !totpData.qr_data) {
        throw new Error('Invalid TOTP data received from server');
      }
      
      setSecret(totpData.secret);
      setUri(totpData.qr_data); // otpauth:// URL
      setBackupCodes(totpData.backup_codes || []);
      setFactorId(user.id); // Use user ID as factor ID
      setStep('verify');
      setError(''); // Clear any previous errors
    } catch (error: any) {
      error('[TOTP Setup] Enrollment failed:', error);
      const errorMessage = error.message || 'Failed to generate TOTP setup. Please check your connection and try again.';
      setError(errorMessage);
      setStep('enroll'); // Stay on enroll step if error
    } finally {
      setEnrolling(false);
      setLoading(false);
    }
  }, [user?.id]);
  
  useEffect(() => {
    startEnrollment();
  }, [startEnrollment]);
  
  const handleOtpChange = (value: string, index: number) => {
    if (value && !/^\d+$/.test(value)) return;
    
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = ['', '', '', '', '', ''];
      digits.forEach((digit, i) => {
        if (i < 6) newOtp[i] = digit;
      });
      setVerificationCode(newOtp);
      setError('');
      
      const lastFilledIndex = Math.min(digits.length - 1, 5);
      inputRefs.current[lastFilledIndex]?.focus();
    } else {
      const newOtp = [...verificationCode];
      newOtp[index] = value;
      setVerificationCode(newOtp);
      setError('');
      
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };
  
  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !verificationCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };
  
  const handleVerify = async () => {
    const code = verificationCode.join('');
    
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    
    setVerifying(true);
    setError('');
    
    try {
      const result = await verifyTOTPEnrollment(factorId, code);
      
      if (result.success) {
        Toast.show({
          type: 'success',
          text1: 'TOTP Enabled',
          text2: 'Two-factor authentication has been successfully enabled',
        });
        
        // Navigate back to security settings
        router.back();
      } else {
        setError(result.error || 'Invalid verification code');
        setVerificationCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (error: any) {
      setError(error.message || 'Failed to verify code');
      setVerificationCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };
  
  const handleCopySecret = async () => {
    if (secret) {
      await Clipboard.setStringAsync(secret);
      setCopied(true);
      Toast.show({
        type: 'success',
        text1: 'Copied',
        text2: 'Secret key copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  const handleOpenAuthenticator = () => {
    // Suggest popular authenticator apps
    Alert.alert(
      'Authenticator Apps',
      'You can use any authenticator app like Google Authenticator, Authy, or Microsoft Authenticator. Install one from your app store and scan the QR code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open App Store',
          onPress: () => {
            const url = Platform.OS === 'ios'
              ? 'https://apps.apple.com/search?term=authenticator'
              : 'https://play.google.com/store/search?q=authenticator';
            Linking.openURL(url).catch(() => {});
          },
        },
      ]
    );
  };
  
  // Render QR code - Backend returns qr_data as otpauth:// URL
  const renderQRCode = () => {
    // Use URI (which contains qr_data from backend) to generate QR code
    const qrData = uri || qrCode;
    
    if (!qrData) {
      return (
        <View style={styles.qrCodeContainer}>
          <ActivityIndicator size="large" color="#B794F6" />
          <Text style={[styles.qrCodePlaceholder, { color: themeColors.neutral.textSecondary }]}>
            Generating QR code...
          </Text>
        </View>
      );
    }
    
    // Backend returns otpauth:// URL - use it to generate QR code
    return (
      <View style={styles.qrCodeContainer}>
        <QRCode
          value={qrData}
          size={180}
          color={isDarkMode ? '#000000' : '#000000'}
          backgroundColor={isDarkMode ? '#FFFFFF' : '#FFFFFF'}
          quietZone={8}
        />
      </View>
    );
  };
  
  return (
    <SafeAreaWrapper>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Stack.Screen 
        options={{ 
          headerShown: false,
        }} 
      />
      
      <View style={styles.backgroundContainer}>
        <LinearGradient
          colors={isDarkMode ? ['#1F2937', '#111827'] : ['#FFFFFF', '#F8F9FA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
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
          Setup Two-Factor Authentication
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
          showsVerticalScrollIndicator={true}
          bounces={true}
          alwaysBounceVertical={false}
        >
          {loading || enrolling ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.primary.main} />
              <Text style={[styles.loadingText, { color: themeColors.neutral.textSecondary }]}>
                Generating TOTP setup...
              </Text>
            </View>
          ) : error && step === 'enroll' ? (
            <MotiView
              from={{ translateY: 20, opacity: 0 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20 }}
              style={styles.content}
            >
              <View style={styles.iconContainer}>
                <Shield size={36} color={Colors.error.main} strokeWidth={1.5} />
              </View>
              
              <Text style={[styles.title, { color: themeColors.text }]}>
                Setup Failed
              </Text>
              
              <View style={[styles.errorContainer, { backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)' }]}>
                <Text style={[styles.errorText, { color: Colors.error.main }]}>{error}</Text>
              </View>
              
              <TouchableOpacity
                style={[styles.verifyButton, { backgroundColor: themeColors.primary.main }]}
                onPress={startEnrollment}
                activeOpacity={0.8}
              >
                <Text style={styles.verifyButtonText}>Try Again</Text>
              </TouchableOpacity>
            </MotiView>
          ) : step === 'verify' ? (
            <MotiView
              from={{ translateY: 20, opacity: 0 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20 }}
              style={styles.content}
            >
              <View style={styles.iconContainer}>
                <Shield size={36} color="#B794F6" strokeWidth={1.5} />
              </View>
              
              <Text style={[styles.title, { color: themeColors.neutral.text }]}>
                Scan QR Code
              </Text>
              
              <Text style={[styles.subtitle, { color: themeColors.neutral.textSecondary }]}>
                Open your authenticator app and scan this QR code, or enter the secret key manually.
              </Text>
              
              {renderQRCode()}
              
              <View style={styles.secretContainer}>
                <Text style={[styles.secretLabel, { color: themeColors.neutral.textSecondary }]}>
                  Secret Key (for manual entry):
                </Text>
                <TouchableOpacity
                  style={[styles.secretBox, { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border }]}
                  onPress={handleCopySecret}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.secretText, { color: themeColors.neutral.text }]} selectable>
                    {secret}
                  </Text>
                  {copied ? (
                    <Check size={18} color="#10B981" />
                  ) : (
                    <Copy size={18} color={themeColors.neutral.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>

              {backupCodes.length > 0 && (
                <View style={styles.backupCodesContainer}>
                  <Text style={[styles.secretLabel, { color: themeColors.neutral.textSecondary }]}>
                    Backup Codes (save these in a safe place):
                  </Text>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={true}
                    contentContainerStyle={styles.backupCodesScrollContent}
                    style={styles.backupCodesScrollView}
                  >
                    {backupCodes.map((code, index) => (
                      <View 
                        key={index}
                        style={[styles.backupCodeItem, { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border }]}
                      >
                        <Text style={[styles.backupCodeText, { color: themeColors.neutral.text }]} selectable>
                          {code}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
              
              <TouchableOpacity
                style={styles.helpButton}
                onPress={handleOpenAuthenticator}
                activeOpacity={0.7}
              >
                <Text style={[styles.helpButtonText, { color: themeColors.primary.main }]}>
                  Need an authenticator app?
                </Text>
              </TouchableOpacity>
              
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              
              <Text style={[styles.verifyTitle, { color: themeColors.neutral.text }]}>
                Enter Verification Code
              </Text>
              
              <Text style={[styles.verifySubtitle, { color: themeColors.neutral.textSecondary }]}>
                Enter the 6-digit code from your authenticator app to complete setup.
              </Text>
              
              <View style={styles.otpContainer}>
                {verificationCode.map((digit, index) => (
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
                    maxLength={1}
                    selectTextOnFocus
                    autoFocus={index === 0}
                  />
                ))}
              </View>
              
              <TouchableOpacity
                style={[styles.verifyButton, (verifying || verificationCode.join('').length !== 6) && styles.verifyButtonDisabled]}
                onPress={handleVerify}
                disabled={verifying || verificationCode.join('').length !== 6}
                activeOpacity={0.8}
              >
                {verifying ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.verifyButtonText}>Verify & Enable</Text>
                )}
              </TouchableOpacity>
            </MotiView>
          ) : null}
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
    paddingBottom: Spacing.xxl + Spacing.lg, // Extra padding to ensure all content is visible
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.sm,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    alignItems: 'center',
    paddingBottom: Spacing.md, // Add bottom padding to content
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(183, 148, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 18,
    paddingHorizontal: Spacing.sm,
  },
  qrCodeContainer: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    padding: Spacing.sm,
  },
  qrCodePlaceholder: {
    marginTop: Spacing.md,
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  qrCodeNote: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  secretContainer: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  secretLabel: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.xs,
  },
  secretBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  secretText: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.mono || FontFamily.regular,
    marginRight: Spacing.sm,
  },
  helpButton: {
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  helpButtonText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
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
  verifyTitle: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  verifySubtitle: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  otpInput: {
    width: 44,
    height: 52,
    borderRadius: 10,
    borderWidth: 2,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: FontFamily.bold,
  },
  verifyButton: {
    backgroundColor: '#B794F6',
    borderRadius: 10,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    width: '100%',
    minHeight: 44,
    marginBottom: Spacing.md, // Add bottom margin to ensure button is visible
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
  backupCodesContainer: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  backupCodesScrollView: {
    marginTop: Spacing.xs,
  },
  backupCodesScrollContent: {
    paddingRight: Spacing.md, // Add padding at the end for better scrolling
    gap: Spacing.xs,
  },
  backupCodeItem: {
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90, // Fixed width for consistent appearance
    marginRight: Spacing.xs,
  },
  backupCodeText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.mono || FontFamily.regular,
  },
});
