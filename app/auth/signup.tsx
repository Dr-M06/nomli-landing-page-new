import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  TextInput,
  Keyboard,
  Alert,
  Animated,
  Modal,
  Linking,
  Image
} from 'react-native';
import { Link, useRouter, useSegments } from 'expo-router';
import { Mail, Lock, User, ChevronLeft, Eye, EyeOff, Check, X, CheckCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing } from '../../constants/Theme';
import { useTheme } from '../../contexts/ThemeContext';
import Button from '../../components/Button';
import useAuth from '../../hooks/useAuth';
import { supabase } from '../../utils/supabase';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
import ErrorMessage from '../../components/ErrorMessage';
import { 
  checkBiometricCapabilities, 
  promptForBiometricSetup, 
  getBiometricTypeDescription 
} from '../../utils/biometricAuth';
import { MotiView } from 'moti';
import { handleOAuthSignIn, checkOAuthAvailability } from '../../utils/oauthAuthHandler';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import GoogleLogo from '../../components/GoogleLogo';
import { log, warn, error } from '../../utils/productionLogger';


export default function SignUpScreen() {
  const router = useRouter();
  const segments = useSegments();
  const { signUp, loading, error, user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const signupInProgress = useRef(false); // Use ref to prevent race conditions
  const hasNavigated = useRef(false); // Track if we've already navigated
  
  // Redirect to main app if already logged in (but NOT during signup process)
  const initialMountRef = useRef(true);
  
  useEffect(() => {
    // Don't redirect during initial mount
    if (initialMountRef.current) {
      log('[SignUp] Initial mount - skipping redirect check');
      setTimeout(() => {
        initialMountRef.current = false;
      }, 1000);
      return;
    }
    
    // CRITICAL: Don't redirect if signup is in progress OR if we're on signup-success or profile/edit screen
    const isOnSuccessScreen = segments.includes('signup-success');
    const isOnProfileEdit = segments.includes('profile') && segments.includes('edit');
    const isOnSignupScreen = segments.includes('signup') && !segments.includes('signup-success');
    
    // Only redirect if we're actually on the signup screen (not success screen or profile edit)
    // and signup is not in progress and we haven't already navigated
    log('[SignUp] useEffect triggered - user:', !!user, 'isSigningUp:', isSigningUp, 'signupInProgress:', signupInProgress.current, 'hasNavigated:', hasNavigated.current, 'isOnSuccessScreen:', isOnSuccessScreen, 'isOnProfileEdit:', isOnProfileEdit, 'isOnSignupScreen:', isOnSignupScreen);
    
    if (user && !isSigningUp && !signupInProgress.current && !hasNavigated.current && !isOnSuccessScreen && !isOnProfileEdit && isOnSignupScreen) {
      // Verify session is actually valid before redirecting
      const verifyAndRedirect = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id && session.user.id === user.id) {
            // Session is valid - safe to redirect
            if (!hasNavigated.current) {
              log('[SignUp] User already exists with valid session, redirecting to community');
              hasNavigated.current = true;
              router.replace('/(tabs)/discovery');
            }
          } else {
            // Session is invalid or expired - don't redirect, let user sign up
            log('[SignUp] User exists but session is invalid/expired - staying on signup screen');
          }
        } catch (error) {
          log('[SignUp] Error verifying session, staying on signup screen:', error);
        }
      };
      
      // Add a delay to prevent race conditions
      setTimeout(() => {
        verifyAndRedirect();
      }, 1000);
    } else if (user) {
      log('[SignUp] ✅ User exists but redirect BLOCKED by guards');
    }
  }, [user, router, isSigningUp, segments]);
  
  // Cleanup: Reset flags when component unmounts
  useEffect(() => {
    return () => {
      log('[SignUp] Component unmounting - resetting flags');
      setIsSigningUp(false);
      signupInProgress.current = false;
      hasNavigated.current = false;
    };
  }, []);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  const [focusedField, setFocusedField] = useState('');
  const [hasInteracted, setHasInteracted] = useState({
    email: false,
    password: false,
  });
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState({ google: true, apple: false, facebook: false });

  // Check OAuth availability
  useEffect(() => {
    checkOAuthAvailability().then(availability => {
      setOauthAvailable(availability);
    });
  }, []);

  // Handle OAuth sign-in (for sign-up, OAuth creates account automatically)
  const handleOAuthSignInPress = async (provider: 'google' | 'apple' | 'facebook') => {
    Keyboard.dismiss();
    setOauthLoading(provider);
    
    try {
      const success = await handleOAuthSignIn(
        provider,
        async (isNewUser: boolean) => {
          // OAuth sign-up/sign-in successful
          log(`${provider} sign-up successful`, isNewUser ? '(new user)' : '(existing user)');
          
          // Register for push notifications
          try {
            const { customNotifications } = await import('../../utils/customNotifications');
            if (customNotifications && typeof customNotifications.initialize === 'function') {
              await customNotifications.initialize();
              const token = customNotifications.getPushToken();
              if (token && user?.id) {
                await customNotifications.saveTokenToProfile(user.id);
                log('✅ Push notification token saved successfully');
              }
            }
          } catch (error) {
            error('Error registering for push notifications:', error);
          }
          
          hasNavigated.current = true;
          
          // Navigate based on whether user needs to complete profile
          if (isNewUser) {
            // New user - redirect to profile edit to complete setup
            router.replace('/profile/edit');
          } else {
            // Existing user (already has account) - go to main app
            router.replace('/(tabs)/discovery');
          }
        },
        (error) => {
          // OAuth sign-up failed
          Toast.show({
            type: 'error',
            text1: 'Sign Up Failed',
            text2: error || `${provider} sign-up failed. Please try again.`,
            position: 'top',
            visibilityTime: 4000,
          });
        }
      );
      
      if (!success) {
        // Error already handled in callback
      }
    } catch (error) {
      error(`${provider} sign-up error:`, error);
      Toast.show({
        type: 'error',
        text1: 'Sign Up Failed',
        text2: `An error occurred during ${provider} sign-up. Please try again.`,
        position: 'top',
        visibilityTime: 4000,
      });
    } finally {
      setOauthLoading(null);
    }
  };

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
  
  const validateField = (field, value) => {
    switch (field) {
      case 'email':
        if (!value) {
          setEmailError('Email is required');
          return false;
        } else if (!/\S+@\S+\.\S+/.test(value)) {
          setEmailError('Please enter a valid email address');
          return false;
        } else {
          setEmailError('');
          return true;
        }
    
      case 'password':
        if (!value) {
          setPasswordError('Password is required');
          return false;
        } else if ((value?.length || 0) < 6) {
          setPasswordError('Password must be at least 6 characters');
          return false;
        } else {
          setPasswordError('');
          return true;
        }
    
      default:
        return true;
    }
  };

  const handleFieldChange = (field, value) => {
    switch (field) {
      case 'email':
        setEmail(value);
        if (hasInteracted.email) validateField(field, value);
        break;
      case 'password':
        setPassword(value);
        if (hasInteracted.password) validateField(field, value);
        break;
    }
  };

  const handleFieldBlur = (field) => {
    setFocusedField('');
    setHasInteracted(prev => ({ ...prev, [field]: true }));
    
    switch (field) {
      case 'email':
        validateField(field, email);
        break;
      case 'password':
        validateField(field, password);
        break;
    }
  };
  
  const validateForm = () => {
    const isEmailValid = validateField('email', email);
    const isPasswordValid = validateField('password', password);
    
    setHasInteracted({
      email: true,
      password: true,
    });
    
    return isEmailValid && isPasswordValid;
  };

  const openTermsOfService = () => {
    Linking.openURL('https://www.nomlimingle.com/terms').catch(err => {
      error('Failed to open Terms of Service:', err);
      Alert.alert('Error', 'Unable to open Terms of Service. Please visit https://www.nomlimingle.com/terms');
    });
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://www.nomlimingle.com/privacy').catch(err => {
      error('Failed to open Privacy Policy:', err);
      Alert.alert('Error', 'Unable to open Privacy Policy. Please visit https://www.nomlimingle.com/privacy');
    });
  };
  
  const handleSignUp = async () => {
    Keyboard.dismiss();
    if (validateForm()) {
      try {
        // Set BOTH state and ref to prevent race conditions
        setIsSigningUp(true);
        signupInProgress.current = true;
        log('[SignUp] Starting signup process...');
        
        const result = await signUp(email, password);
        
        if (result) {
          // Signup successful - navigate IMMEDIATELY to prevent redirects
          log('[SignUp] ✅ Signup successful - navigating immediately...');
          
          // Mark that we've navigated to prevent any redirects
          hasNavigated.current = true;
          
          // Navigate IMMEDIATELY (before any session checks or other logic)
          // This prevents useEffect redirects from firing
          router.replace('/auth/signup-success');
          
          // Keep flags set to prevent redirects - don't reset until user leaves success screen
          // The flags will be reset when component unmounts or user navigates away
          // This prevents the signup screen's useEffect from redirecting
          // Note: We intentionally don't reset these flags here to prevent redirects
        } else {
          log('[SignUp] ❌ Signup failed, result:', result);
          setIsSigningUp(false);
          signupInProgress.current = false;
        }
      } catch (error) {
        error('[SignUp] ❌ Error during signup:', error);
        setIsSigningUp(false);
        signupInProgress.current = false;
      }
    }
  };

  const promptBiometricSetup = async () => {
    try {
      // Check if biometric is available
      const capabilities = await checkBiometricCapabilities();
      
      if (!capabilities.isAvailable) {
        log('Biometric authentication not available, skipping setup');
        return;
      }

      const biometricType = getBiometricTypeDescription(capabilities.supportedTypes);
      
      // Show alert asking if user wants to enable biometric auth
      Alert.alert(
        `Enable ${biometricType}?`,
        `Would you like to use ${biometricType} to sign in quickly and securely? You can change this later in settings.`,
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => {
              log('User declined biometric setup');
            }
          },
          {
            text: `Enable ${biometricType}`,
            onPress: async () => {
              log('User accepted biometric setup');
              const success = await promptForBiometricSetup(email, password);
              if (success) {
                Alert.alert(
                  'Success!',
                  `${biometricType} authentication has been enabled. You can now use it to sign in quickly.`,
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert(
                  'Setup Failed',
                  `Failed to enable ${biometricType} authentication. You can try again later in settings.`,
                  [{ text: 'OK' }]
                );
              }
            }
          }
        ],
        { cancelable: false }
      );
    } catch (error) {
      error('Error setting up biometric authentication:', error);
    }
  };

  const renderPasswordStrengthIndicator = () => {
    if (!password || !hasInteracted.password) return null;
    
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

  const renderInput = (field, placeholder, value, onChangeText, keyboardType = 'default', secureTextEntry = false, showPasswordToggle = false, autoComplete = 'off') => {
    const hasError = {
      email: emailError,
      password: passwordError,
    }[field];
    
    const isFocused = focusedField === field;
    const hasValue = (value?.length || 0) > 0;
    
    return (
      <View style={styles.inputContainer}>
        <View style={[
          styles.inputWrapper,
          isFocused && styles.inputWrapperFocused,
          hasError && styles.inputWrapperError
        ]}>
          {field === 'email' && <Mail size={18} color={isFocused ? '#B794F6' : '#9CA3AF'} style={styles.inputIcon} />}
          {field === 'password' && <Lock size={18} color={isFocused ? '#B794F6' : '#9CA3AF'} style={styles.inputIcon} />}
          
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocusedField(field)}
            onBlur={() => handleFieldBlur(field)}
            keyboardType={keyboardType}
            autoCapitalize={field === 'email' ? 'none' : 'none'}
            autoComplete={autoComplete}
            textContentType={
              field === 'email' ? 'emailAddress' :
              field === 'password' ? 'newPassword' : 'none'
            }
            secureTextEntry={secureTextEntry}
            returnKeyType={
              field === 'email' ? 'next' :
              field === 'password' ? 'done' : 'done'
            }
            onSubmitEditing={field === 'password' ? handleSignUp : undefined}
            accessibilityLabel={`${field} input field`}
            accessibilityHint={`Enter your ${field}`}
          />
          
          {showPasswordToggle && (
            <TouchableOpacity 
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
              accessibilityLabel={`${secureTextEntry ? 'Show' : 'Hide'} password`}
            >
              {secureTextEntry ? (
                <Eye size={18} color="#9CA3AF" />
              ) : (
                <EyeOff size={18} color="#9CA3AF" />
              )}
            </TouchableOpacity>
          )}
        </View>
        
        {hasError && (
          <Text style={styles.errorText}>{hasError}</Text>
        )}
        
        {field === 'password' && renderPasswordStrengthIndicator()}
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>
            
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15, delay: 100 }}
              style={styles.logoContainer}
            >
              <MotiView
                from={{ scale: 1, rotateZ: '0deg' }}
                animate={{ scale: 1.06, rotateZ: '8deg' }}
                transition={{
                  type: 'timing',
                  duration: 1400,
                  loop: true,
                  repeatReverse: true,
                }}
              >
                <View style={styles.logoMark}>
                  <Image
                    source={require('../../assets/images/icon.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              </MotiView>
            </MotiView>
          </View>
          
          <MotiView
            from={{ translateY: 20, opacity: 0 }}
            animate={{ translateY: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 20, delay: 300 }}
          >
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join and start connecting</Text>
          </MotiView>
          
          {/* Form Container */}
          <View style={styles.formContainer}>
            {error && (
              <ErrorMessage 
                message={
                  error === 'This information already exists' ? 
                    'This email is already registered. Please sign in instead.' :
                  error === 'Invalid email or password' ?
                    'Please enter a valid email address and password.' :
                  error === 'An error occurred. Please try again' ?
                    'Unable to create account. Please check your information and try again.' :
                    error
                }
                actionLink={error === 'This information already exists' ? '/auth/signin' : undefined}
                actionText={error === 'This information already exists' ? 'Go to Sign In' : undefined}
              />
            )}
            
            {/* OAuth Sign-Up Buttons - Side by Side */}
            <View style={styles.oauthRow}>
              <TouchableOpacity
                style={[styles.oauthRowButton, styles.googleRowButton, oauthLoading === 'google' && styles.oauthRowButtonLoading]}
                onPress={() => handleOAuthSignInPress('google')}
                disabled={loading || oauthLoading !== null}
                activeOpacity={0.8}
              >
                {oauthLoading === 'google' ? (
                  <ActivityIndicator size="small" color="#4285F4" />
                ) : (
                  <>
                    <GoogleLogo size={18} />
                    <Text style={styles.googleRowText}>Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={[styles.oauthRowButton, styles.appleRowButton, oauthLoading === 'apple' && styles.oauthRowButtonLoading]}
                  onPress={() => handleOAuthSignInPress('apple')}
                  disabled={loading || oauthLoading !== null}
                  activeOpacity={0.8}
                >
                  {oauthLoading === 'apple' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={18} color="#FFFFFF" />
                      <Text style={styles.appleRowText}>Apple</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            
            <View style={styles.separatorContainer}>
              <View style={styles.separatorLine} />
              <Text style={styles.separatorText}>or sign up with email</Text>
              <View style={styles.separatorLine} />
            </View>
            
            {/* Form Fields */}
            {renderInput('email', 'Enter your email', email, (value) => handleFieldChange('email', value), 'email-address', false, false, 'email')}
            {renderInput('password', 'Create a password', password, (value) => handleFieldChange('password', value), 'default', !showPassword, true)}
            
            {/* Create Account Button */}
            <Button
              title="Create Account"
              onPress={handleSignUp}
              loading={loading}
              style={styles.button}
              disabled={loading}
            />
            
            {/* Sign In Link */}
            <View style={styles.signinContainer}>
              <Text style={styles.signinText}>Already have an account? </Text>
              <Link href="/auth/signin" asChild>
                <TouchableOpacity accessibilityLabel="Go to sign in">
                  <Text style={styles.signinLink}>Sign In</Text>
                </TouchableOpacity>
              </Link>
            </View>
            
            {/* Terms Text */}
            <Text style={styles.termsText}>
              By creating an account, you agree to our{' '}
              <Text style={styles.termsLink} onPress={openTermsOfService}>Terms of Service</Text> and{' '}
              <Text style={styles.termsLink} onPress={openPrivacyPolicy}>Privacy Policy</Text>
            </Text>
            
            {/* OTP Hint */}
            <Text style={styles.hintText}>
              💡 Tip: You can enable two-factor authentication (OTP) in your profile settings for extra security
            </Text>
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
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    top: Spacing.lg + Spacing.xs,
    left: Spacing.lg,
    zIndex: 10,
    padding: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  logoContainer: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 54,
    height: 54,
  },
  title: {
    fontSize: 32,
    fontFamily: FontFamily.bold,
    color: '#1F2937',
    marginBottom: Spacing.xs,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '400',
    marginBottom: Spacing.lg,
  },
  formContainer: {
    paddingHorizontal: Spacing.xl,
    flex: 1,
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
  eyeIcon: {
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
    minHeight: 48,
    borderRadius: 12,
  },
  signinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  signinText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: '#6B7280',
  },
  signinLink: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: '#B794F6',
    fontWeight: '600',
  },
  termsText: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: '#9CA3AF',
    lineHeight: 18,
    paddingHorizontal: Spacing.md,
  },
  termsLink: {
    color: '#B794F6',
    fontFamily: FontFamily.medium,
    fontWeight: '500',
  },
  hintText: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: FontFamily.regular,
    color: '#9CA3AF',
    lineHeight: 16,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
  oauthRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.md,
  },
  oauthRowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  oauthRowButtonLoading: {
    opacity: 0.7,
  },
  googleRowButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  appleRowButton: {
    backgroundColor: '#000000',
  },
  googleRowText: {
    fontSize: 14,
    fontFamily: FontFamily.semiBold,
    color: '#1F2937',
  },
  appleRowText: {
    fontSize: 14,
    fontFamily: FontFamily.semiBold,
    color: '#FFFFFF',
  },
  oauthContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  oauthButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  oauthButtonApple: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  oauthButtonFacebook: {
    backgroundColor: '#1877F2',
    borderColor: '#1877F2',
  },
  oauthButtonLoading: {
    opacity: 0.6,
  },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    marginTop: Spacing.xs,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  separatorText: {
    marginHorizontal: Spacing.md,
    fontSize: 13,
    fontFamily: FontFamily.medium,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  errorActionButton: {
    padding: Spacing.md,
    backgroundColor: Colors.primary.main,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  errorActionButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.background,
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  successCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.neutral.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    shadowColor: Colors.success.main,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
    zIndex: 10,
  },
  successGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: Colors.success.main,
    shadowColor: Colors.success.main,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 40,
  },
  checkmarkContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 11,
  },
  successTitle: {
    fontSize: 32,
    fontFamily: FontFamily.bold,
    color: Colors.neutral.white,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  successSubtitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    lineHeight: 22,
  },
  successButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary.main,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl + Spacing.md,
    borderRadius: BorderRadius.full,
    shadowColor: Colors.primary.main,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    marginTop: Spacing.md,
  },
  successButtonText: {
    fontSize: FontSizes.body + 1,
    fontFamily: FontFamily.semiBold,
    color: Colors.neutral.background,
    letterSpacing: 0.3,
  },
  successButtonIconContainer: {
    marginLeft: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confetti: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});