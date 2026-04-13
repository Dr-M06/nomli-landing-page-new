import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { router, Stack, useRouter } from 'expo-router';
import { Eye, EyeOff, Lock, Shield, ChevronLeft } from 'lucide-react-native';
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
import { checkTOTPEnabled } from '../../utils/totpService';
import GoogleLogo from '../../components/GoogleLogo';
import { linkGoogleAccount, unlinkGoogleAccount, checkLinkedProviders } from '../../utils/linkedAccounts';
import { log, warn, error } from '../../utils/productionLogger';


export default function SecurityScreen() {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState('');
  const [errors, setErrors] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const validateForm = () => {
    const newErrors = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    };
    let isValid = true;

    // Validate current password
    if (!currentPassword.trim()) {
      newErrors.currentPassword = 'Current password is required';
      isValid = false;
    }

    // Validate new password
    if (!newPassword.trim()) {
      newErrors.newPassword = 'New password is required';
      isValid = false;
    } else if ((newPassword?.length || 0) < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters';
      isValid = false;
    }

    // Validate password confirmation
    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      isValid = false;
    }

    // Check if new password is different from current password
    if (newPassword === currentPassword && newPassword.trim()) {
      newErrors.newPassword = 'New password must be different from current password';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleChangePassword = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Verify current password by trying to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setErrors({
          ...errors,
          currentPassword: 'Current password is incorrect',
        });
        Toast.show({
          type: 'error',
          text1: 'Authentication failed',
          text2: 'Current password is incorrect',
        });
        setLoading(false);
        return;
      }

      // Get session before updating password
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        Toast.show({
          type: 'error',
          text1: 'Password update failed',
          text2: updateError.message,
        });
        setLoading(false);
        return;
      }

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Force signout to invalidate current user's sessions only (not global)
      await supabase.auth.signOut({ scope: 'local' });
      
      // Success message
      Toast.show({
        type: 'success',
        text1: 'Password updated successfully',
      });
      
      // Show alert and redirect to sign in
      Alert.alert(
        'Password Updated',
        'Your password has been changed successfully. Please sign in with your new password.',
        [{ 
          text: 'OK', 
          onPress: () => {
            router.replace('/auth/signin');
          }
        }]
      );
    } catch (error) {
      error('Error changing password:', error);
      Toast.show({
        type: 'error',
        text1: 'Password update failed',
        text2: 'An unexpected error occurred',
      });
      setLoading(false);
    }
  };

  const renderPasswordInput = (
    label: string,
    value: string,
    setValue: (text: string) => void,
    placeholder: string,
    showPassword: boolean,
    setShowPassword: (show: boolean) => void,
    error: string,
    testID: string
  ) => {
    const isFocused = focusedField === testID;
    
    return (
      <View style={styles.inputContainer}>
        <View style={[
          styles.inputWrapper, 
          {
            backgroundColor: themeColors.neutral.card,
            borderColor: error 
              ? Colors.error.main 
              : isFocused 
              ? themeColors.primary.main 
              : themeColors.neutral.border,
            shadowColor: isFocused ? themeColors.primary.main : '#000',
          },
          error ? styles.inputError : null,
          isFocused && styles.inputFocused
        ]}>
          <Lock 
            size={18} 
            color={isFocused ? themeColors.primary.main : themeColors.neutral.textSecondary} 
            style={styles.inputIcon} 
          />
          <TextInput
            style={[styles.input, { color: themeColors.text }]}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={themeColors.neutral.textSecondary}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            testID={testID}
            onFocus={() => setFocusedField(testID)}
            onBlur={() => setFocusedField('')}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff size={18} color={themeColors.neutral.textSecondary} />
            ) : (
              <Eye size={18} color={themeColors.neutral.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
        {error ? <Text style={[styles.errorText, { color: Colors.error.main }]}>{error}</Text> : null}
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
          colors={[themeColors.background, themeColors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Subtle gradient accent */}
        <LinearGradient
          colors={[
            isDarkMode ? 'rgba(231, 121, 185, 0.12)' : 'rgba(231, 121, 185, 0.08)',
            isDarkMode ? 'rgba(183, 148, 246, 0.12)' : 'rgba(183, 148, 246, 0.08)',
            'transparent'
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.6 }]}
        />
      </View>
      
      {/* Custom Premium Header */}
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
        <Text style={[styles.headerTitle, { color: themeColors.neutral.text }]}>Security Settings</Text>
        <View style={styles.headerRight} />
      </View>
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={styles.container}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <MotiView
              from={{ translateY: 20, opacity: 0 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, delay: 100 }}
              style={styles.header}
            >
              <View style={[styles.iconContainer, { backgroundColor: isDarkMode ? 'rgba(183, 148, 246, 0.15)' : 'rgba(183, 148, 246, 0.1)' }]}>
                <Shield size={32} color={themeColors.primary.main} strokeWidth={1.5} />
              </View>
              <Text style={[styles.title, { color: themeColors.text }]}>Change Password</Text>
              <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                Update your password to keep your account secure
              </Text>
            </MotiView>

            <View style={styles.section}>

              {renderPasswordInput(
                'Current Password',
                currentPassword,
                setCurrentPassword,
                'Enter your current password',
                showCurrentPassword,
                setShowCurrentPassword,
                errors.currentPassword,
                'current-password'
              )}

              {renderPasswordInput(
                'New Password',
                newPassword,
                setNewPassword,
                'Enter your new password',
                showNewPassword,
                setShowNewPassword,
                errors.newPassword,
                'new-password'
              )}

              {renderPasswordInput(
                'Confirm New Password',
                confirmPassword,
                setConfirmPassword,
                'Confirm your new password',
                showConfirmPassword,
                setShowConfirmPassword,
                errors.confirmPassword,
                'confirm-password'
              )}

              <TouchableOpacity
                style={[
                  styles.submitButton, 
                  { backgroundColor: themeColors.primary.main },
                  loading && styles.submitButtonDisabled
                ]}
                onPress={handleChangePassword}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={[styles.infoSection, { 
              backgroundColor: isDarkMode ? 'rgba(183, 148, 246, 0.12)' : 'rgba(183, 148, 246, 0.08)',
              borderColor: isDarkMode ? 'rgba(183, 148, 246, 0.3)' : 'rgba(183, 148, 246, 0.2)',
            }]}>
              <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                💡 After changing your password, you'll need to sign in again on all your devices.
              </Text>
            </View>

            {/* TOTP Section */}
            <TOTPSection />

            {/* Google Account Linking Section */}
            <GoogleLinkSection />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaWrapper>
  );
}

// TOTP Section Component
function TOTPSection() {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    checkTOTPStatus();
  }, [user]);

  const checkTOTPStatus = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const enabled = await checkTOTPEnabled(user.id);
      setTotpEnabled(enabled);
    } catch (error) {
      error('Error checking TOTP status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTOTP = async () => {
    if (totpEnabled) {
      // Disable TOTP
      Alert.alert(
        'Disable Two-Factor Authentication?',
        'Disabling TOTP will make your account less secure. Are you sure you want to continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              setChecking(true);
              try {
                const { unenrollTOTP } = await import('../../utils/totpAuth');
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  const result = await unenrollTOTP(user.id);
                  if (result.success) {
                    setTotpEnabled(false);
                    Toast.show({
                      type: 'success',
                      text1: 'TOTP Disabled',
                      text2: 'Two-factor authentication has been disabled',
                    });
                  } else {
                    Toast.show({
                      type: 'error',
                      text1: 'Error',
                      text2: result.error || 'Failed to disable TOTP',
                    });
                  }
                }
              } catch (error: any) {
                Toast.show({
                  type: 'error',
                  text1: 'Error',
                  text2: error.message || 'Failed to disable TOTP',
                });
              } finally {
                setChecking(false);
                await checkTOTPStatus();
              }
            },
          },
        ]
      );
    } else {
      // Enable TOTP - navigate to setup screen
      router.push('/settings/totp-setup');
    }
  };

  if (loading) {
    return (
      <View style={styles.totpSection}>
        <ActivityIndicator size="small" color={themeColors.primary.main} />
      </View>
    );
  }

  return (
    <View style={styles.totpSection}>
      <MotiView
        from={{ translateY: 20, opacity: 0 }}
        animate={{ translateY: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, delay: 200 }}
      >
        <View style={styles.totpHeader}>
          <View style={[
            styles.totpIconContainer,
            { backgroundColor: isDarkMode ? 'rgba(183, 148, 246, 0.15)' : 'rgba(183, 148, 246, 0.1)' }
          ]}>
            <Shield 
              size={24} 
              color={totpEnabled ? '#10B981' : themeColors.neutral.textSecondary} 
              strokeWidth={1.5} 
            />
          </View>
          <View style={styles.totpContent}>
            <Text style={[styles.totpTitle, { color: themeColors.text }]}>
              Two-Factor Authentication (TOTP)
            </Text>
            <Text style={[styles.totpSubtitle, { color: themeColors.textSecondary }]}>
              {totpEnabled
                ? 'Enabled - Your account is protected with an authenticator app'
                : 'Add an extra layer of security to your account'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.totpButton,
            {
              backgroundColor: totpEnabled
                ? (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)')
                : (isDarkMode ? 'rgba(183, 148, 246, 0.15)' : 'rgba(183, 148, 246, 0.1)'),
              borderColor: totpEnabled ? Colors.error.main : themeColors.primary.main,
            },
            checking && styles.totpButtonDisabled,
          ]}
          onPress={handleToggleTOTP}
          disabled={checking}
          activeOpacity={0.7}
        >
          {checking ? (
            <ActivityIndicator
              size="small"
              color={totpEnabled ? Colors.error.main : themeColors.primary.main}
            />
          ) : (
            <Text
              style={[
                styles.totpButtonText,
                {
                  color: totpEnabled ? Colors.error.main : themeColors.primary.main,
                },
              ]}
            >
              {totpEnabled ? 'Disable TOTP' : 'Enable TOTP'}
            </Text>
          )}
        </TouchableOpacity>

        {totpEnabled && (
          <View style={[
            styles.totpInfoBox,
            {
              backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
              borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)',
            }
          ]}>
            <Text style={[styles.totpInfoText, { color: themeColors.textSecondary }]}>
              ✓ TOTP is enabled. You'll need to enter a code from your authenticator app when signing in.
            </Text>
          </View>
        )}
      </MotiView>
    </View>
  );
}

// Google Account Linking Section
function GoogleLinkSection() {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [isLinked, setIsLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    checkLinkStatus();
  }, [user]);

  const checkLinkStatus = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const providers = await checkLinkedProviders();
      setIsLinked(providers.google);
    } catch (error) {
      error('Error checking Google link status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkGoogle = async () => {
    setProcessing(true);
    try {
      const result = await linkGoogleAccount();
      if (result.success) {
        setIsLinked(true);
        Toast.show({
          type: 'success',
          text1: 'Google Linked',
          text2: 'You can now sign in with Google',
        });
      } else {
        if (result.error !== 'Sign in cancelled') {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: result.error || 'Failed to link Google',
          });
        }
      }
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to link Google',
      });
    } finally {
      setProcessing(false);
      await checkLinkStatus();
    }
  };

  const handleUnlinkGoogle = async () => {
    Alert.alert(
      'Unlink Google Account?',
      'You will no longer be able to sign in with this Google account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const result = await unlinkGoogleAccount();
              if (result.success) {
                setIsLinked(false);
                Toast.show({
                  type: 'success',
                  text1: 'Google Unlinked',
                  text2: 'Google sign-in has been removed',
                });
              } else {
                Toast.show({
                  type: 'error',
                  text1: 'Error',
                  text2: result.error || 'Failed to unlink Google',
                });
              }
            } catch (error: any) {
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: error.message || 'Failed to unlink Google',
              });
            } finally {
              setProcessing(false);
              await checkLinkStatus();
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.googleSection}>
        <ActivityIndicator size="small" color={themeColors.primary.main} />
      </View>
    );
  }

  return (
    <View style={styles.googleSection}>
      <MotiView
        from={{ translateY: 20, opacity: 0 }}
        animate={{ translateY: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, delay: 300 }}
      >
        <View style={styles.googleHeader}>
          <View style={[
            styles.googleIconContainer,
            { backgroundColor: isDarkMode ? 'rgba(66, 133, 244, 0.15)' : 'rgba(66, 133, 244, 0.1)' }
          ]}>
            <GoogleLogo size={24} />
          </View>
          <View style={styles.googleContent}>
            <Text style={[styles.googleTitle, { color: themeColors.text }]}>
              Google Account
            </Text>
            <Text style={[styles.googleSubtitle, { color: themeColors.textSecondary }]}>
              {isLinked
                ? 'Connected - You can sign in with Google'
                : 'Link your Google account for quick sign-in'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.googleLinkButton,
            {
              backgroundColor: isLinked
                ? (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)')
                : '#FFFFFF',
              borderColor: isLinked ? Colors.error.main : '#E5E7EB',
            },
            processing && styles.googleButtonDisabled,
          ]}
          onPress={isLinked ? handleUnlinkGoogle : handleLinkGoogle}
          disabled={processing}
          activeOpacity={0.7}
        >
          {processing ? (
            <ActivityIndicator
              size="small"
              color={isLinked ? Colors.error.main : '#4285F4'}
            />
          ) : (
            <>
              {!isLinked && <GoogleLogo size={18} />}
              <Text
                style={[
                  styles.googleLinkButtonText,
                  { color: isLinked ? Colors.error.main : '#1F2937' },
                ]}
              >
                {isLinked ? 'Unlink Google' : 'Link Google Account'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {isLinked && (
          <View style={[
            styles.googleInfoBox,
            {
              backgroundColor: isDarkMode ? 'rgba(66, 133, 244, 0.12)' : 'rgba(66, 133, 244, 0.08)',
              borderColor: isDarkMode ? 'rgba(66, 133, 244, 0.3)' : 'rgba(66, 133, 244, 0.2)',
            }
          ]}>
            <Text style={[styles.googleInfoText, { color: themeColors.textSecondary }]}>
              ✓ Google is linked. You can use "Continue with Google" on the sign-in screen.
            </Text>
          </View>
        )}
      </MotiView>
    </View>
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
    borderBottomWidth: 0,
    zIndex: 10,
  },
  backButton: {
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.bold,
    flex: 1,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerRight: {
    width: 36,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl + Spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl + Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    fontWeight: '400',
    lineHeight: 22,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  inputFocused: {
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputError: {
    borderWidth: 1.5,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    paddingVertical: Spacing.sm + 2,
    fontWeight: '400',
  },
  eyeButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  errorText: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs + 2,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
    marginTop: Spacing.lg,
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
  infoSection: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
    padding: Spacing.md + 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
  },
  totpSection: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  totpHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  totpIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  totpContent: {
    flex: 1,
  },
  totpTitle: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    marginBottom: Spacing.xs,
  },
  totpSubtitle: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
  },
  totpButton: {
    borderRadius: 12,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: Spacing.md,
    minHeight: 48,
  },
  totpButtonDisabled: {
    opacity: 0.6,
  },
  totpButtonText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
  },
  totpInfoBox: {
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  totpInfoText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
  },
  // Google Account Linking Styles
  googleSection: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  googleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  googleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  googleContent: {
    flex: 1,
  },
  googleTitle: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    marginBottom: Spacing.xs,
  },
  googleSubtitle: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
  },
  googleLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    minHeight: 48,
    gap: 10,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleLinkButtonText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
  },
  googleInfoBox: {
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  googleInfoText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
  },
}); 