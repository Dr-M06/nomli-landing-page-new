import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Keyboard,
  ActivityIndicator,
  Image
} from 'react-native';
import { Link, useRouter, useSegments } from 'expo-router';
import { Mail, Lock, Fingerprint, Eye, EyeOff } from 'lucide-react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing } from '../../constants/Theme';
import { useTheme } from '../../contexts/ThemeContext';
import Button from '../../components/Button';
import ErrorMessage from '../../components/ErrorMessage';
import DeletedAccountAlert from '../../components/DeletedAccountAlert';
import useAuth from '../../hooks/useAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
// Import as a namespace
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '../../utils/supabase';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
// Using Expo notifications instead of complex notification system
import { 
  checkBiometricCapabilities, 
  isBiometricEnabled, 
  authenticateWithBiometrics,
  getBiometricTypeDescription,
  enableBiometricAuth,
  enableTemporaryBiometricAuth
} from '../../utils/biometricAuth';
import Toast from 'react-native-toast-message';
import { MotiView } from 'moti';
import { handleOAuthSignIn, checkOAuthAvailability } from '../../utils/oauthAuthHandler';
import GoogleLogo from '../../components/GoogleLogo';
import { Linking } from 'react-native';
import SlowNetworkAlert, { addSlowNetworkListener, resetSlowNetworkDetection } from '../../components/SlowNetworkAlert';
import { log, warn, error } from '../../utils/productionLogger';


export default function SignInScreen() {
  const router = useRouter();
  const segments = useSegments();
  const { signIn, loading: authLoading, error, user, clearError } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const hasNavigated = useRef(false); // Prevent multiple redirects
  const [showDeletedAccountAlert, setShowDeletedAccountAlert] = useState(false);
  const [showSlowNetworkAlert, setShowSlowNetworkAlert] = useState(false);
  
  // Internal component loading state
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Combined loading state - only show loading for actual auth operations
  const loading = authLoading || isSubmitting;
  
  // Debug check on mount to clear any lingering flags (non-blocking)
  useEffect(() => {
    // Clear flags in background without blocking UI
    AsyncStorage.multiRemove(['recently_logged_out', 'biometric_disabled_temporarily'])
      .then(() => log('Cleared biometric flags on signin screen mount'))
      .catch(error => error('Error clearing biometric flags:', error));
  }, []);

  // Monitor slow network detection
  useEffect(() => {
    const unsubscribe = addSlowNetworkListener(() => {
      setShowSlowNetworkAlert(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle refresh from slow network alert
  const handleRefreshApp = useCallback(() => {
    // Reset slow network detection
    resetSlowNetworkDetection();
    // Optionally clear form and let user try again
    // The alert will dismiss automatically
  }, []);
  
  // Redirect to main app if already logged in (but not if on signup-success or profile/edit)
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialMountRef = useRef(true);
  const hasCheckedSessionRef = useRef(false);
  
  useEffect(() => {
    // Clear any pending redirect
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    
    // Prevent multiple redirects
    if (hasNavigated.current) {
      log('[SignIn] Already navigated, skipping redirect');
      return;
    }
    
    // Don't redirect during initial mount or while submitting
    if (initialMountRef.current || isSubmitting) {
      if (initialMountRef.current) {
        log('[SignIn] Initial mount - skipping redirect check');
        // Mark initial mount as complete after a short delay
        setTimeout(() => {
          initialMountRef.current = false;
        }, 1000);
      }
      return;
    }
    
    // Only redirect if we're actually on the signin screen
    const isOnSigninScreen = segments.includes('signin') && !segments.includes('tabs');
    const isOnSignupSuccess = segments.includes('signup-success');
    const isOnProfileEdit = segments.includes('profile') && segments.includes('edit');
    const isAlreadyInTabs = segments.includes('tabs');
    
    // Don't redirect if:
    // 1. We're not on the signin screen
    // 2. We're on signup-success or profile/edit
    // 3. We're already in tabs
    // 4. Auth is still loading
    // 5. User is actively submitting
    if (user && isOnSigninScreen && !isOnSignupSuccess && !isOnProfileEdit && !isAlreadyInTabs && !authLoading && !isSubmitting) {
      // Verify session is actually valid before redirecting
      const verifyAndRedirect = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id && session.user.id === user.id) {
            // Session is valid - safe to redirect
            if (!hasNavigated.current) {
              log('[SignIn] User already logged in with valid session, redirecting to main app');
              hasNavigated.current = true;
              router.replace('/(tabs)/discovery');
            }
          } else {
            // Session is invalid or expired - don't redirect, let user sign in
            log('[SignIn] User exists but session is invalid/expired - staying on signin screen');
            hasCheckedSessionRef.current = true;
          }
        } catch (error) {
          log('[SignIn] Error verifying session, staying on signin screen:', error);
          hasCheckedSessionRef.current = true;
        }
      };
      
      // Add a delay to prevent race conditions with TabLayout redirect
      redirectTimeoutRef.current = setTimeout(() => {
        verifyAndRedirect();
      }, 1000); // Increased delay to allow session to stabilize
    } else if (user && !isOnSigninScreen) {
      log('[SignIn] User exists but not on signin screen, skipping redirect');
    }
    
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, [user, router, segments, authLoading, isSubmitting]);
  
  // Reset navigation flag when user changes or component unmounts
  useEffect(() => {
    return () => {
      hasNavigated.current = false;
    };
  }, [user]);
  
  // Show deleted account alert when error indicates account was deleted
  useEffect(() => {
    if (error && error.includes('deleted')) {
      setShowDeletedAccountAlert(true);
    } else {
      setShowDeletedAccountAlert(false);
    }
  }, [error]);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState('');
  const [checkingBiometric, setCheckingBiometric] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState({ google: true, apple: false, facebook: false });
  
  const [focusedField, setFocusedField] = useState('');
  const [hasInteracted, setHasInteracted] = useState({
    email: false,
    password: false,
  });

  // Check OAuth availability
  useEffect(() => {
    checkOAuthAvailability().then(availability => {
      setOauthAvailable(availability);
    });
  }, []);

  // Check if biometric authentication is available and enabled
  useEffect(() => {
    const initializeBiometric = async () => {
      try {
        setCheckingBiometric(true);
        
        // Check if user just logged out (using a session storage flag)
        const isRecentlyLoggedOut = await AsyncStorage.getItem('recently_logged_out');
        
        if (isRecentlyLoggedOut === 'true') {
          // Clear the flag and skip auto-authentication
          await AsyncStorage.removeItem('recently_logged_out');
          log('Recently logged out, skipping automatic biometric authentication');
          
          // Check biometric capabilities in background (non-blocking)
          checkBiometricCapabilities().then(capabilities => {
            setBiometricAvailable(capabilities.isAvailable);

            if (capabilities.isAvailable) {
              const biometricTypeDesc = getBiometricTypeDescription(capabilities.supportedTypes);
              setBiometricType(biometricTypeDesc);
              
              // Check if user has enabled biometric auth
              isBiometricEnabled().then(enabled => {
                setBiometricEnabled(enabled);
              });
            }
          });
          
          setCheckingBiometric(false);
          return;
        }
        
        // Check biometric capabilities in background (non-blocking)
        checkBiometricCapabilities().then(capabilities => {
          setBiometricAvailable(capabilities.isAvailable);

          if (capabilities.isAvailable) {
            const biometricTypeDesc = getBiometricTypeDescription(capabilities.supportedTypes);
            setBiometricType(biometricTypeDesc);
            
            // Check if user has enabled biometric auth
            isBiometricEnabled().then(enabled => {
              setBiometricEnabled(enabled);
              log('Biometric auth is available and ' + (enabled ? 'enabled' : 'disabled'));
            });
          }
        });
      } catch (error) {
        error('Error initializing biometric auth:', error);
      } finally {
        setCheckingBiometric(false);
      }
    };
    
    initializeBiometric();
  }, []);

  const handleBiometricAuth = async () => {
    try {
      log('Starting biometric authentication...');
      const result = await authenticateWithBiometrics();
      
      if (result.success && result.email && result.password) {
        log('Biometric authentication successful, signing in...');
        
        // For biometric login, check if device is trusted to skip TOTP
        // Biometric itself is a form of 2FA, so we can bypass TOTP if device is trusted
        let isTrustedDevice = false;
        let userId: string | null = null;
        
        try {
          // Try to get user ID from existing session (if any)
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            userId = user.id;
            const trustedDeviceKey = `totp_trusted_${user.id}`;
            const trustedData = await SecureStore.getItemAsync(trustedDeviceKey);
            if (trustedData) {
              const { timestamp } = JSON.parse(trustedData);
              const daysSinceVerification = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
              if (daysSinceVerification < 30) {
                isTrustedDevice = true;
                log('[Biometric] Device is trusted, will skip TOTP');
              }
            }
          }
        } catch (trustError) {
          warn('[Biometric] Error checking trusted device:', trustError);
        }
        
        const signInResult = await signIn(result.email, result.password);
        
        // Handle TOTP requirement for biometric login
        if (signInResult && typeof signInResult === 'object' && 'requiresMFA' in signInResult) {
          const mfaResult = signInResult as any;
          if (mfaResult.requiresMFA && mfaResult.mfaFactors && mfaResult.mfaFactors.length > 0) {
            // If device is trusted, mark it as trusted again and re-authenticate
            // Otherwise, require TOTP verification
            if (isTrustedDevice && mfaResult.userId) {
              // Device is trusted - mark it as trusted with placeholder session
              // then re-authenticate (should skip TOTP now)
              try {
                const trustedDeviceKey = `totp_trusted_${mfaResult.userId}`;
                const trustedData = {
                  sessionId: 'biometric_auth', // Placeholder, will be updated after re-auth
                  timestamp: Date.now(),
                  userId: mfaResult.userId,
                };
                await SecureStore.setItemAsync(trustedDeviceKey, JSON.stringify(trustedData));
                log('[Biometric] Device marked as trusted, re-authenticating...');
                
                // Re-authenticate - should now skip TOTP since device is trusted
                const reSignInResult = await signIn(result.email, result.password);
                if (reSignInResult === true) {
                  // Update trusted device with actual session
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                      const updatedTrustedData = {
                        sessionId: session.access_token,
                        timestamp: Date.now(),
                        userId: mfaResult.userId,
                      };
                      await SecureStore.setItemAsync(trustedDeviceKey, JSON.stringify(updatedTrustedData));
                      log('[Biometric] Device trust updated with session');
                    }
                  } catch (updateError) {
                    warn('[Biometric] Error updating trusted device:', updateError);
                  }
                  
                  log('Biometric sign-in successful, navigating to main app');
                  router.replace('/(tabs)/discovery');
                  return;
                } else if (reSignInResult && typeof reSignInResult === 'object' && 'requiresMFA' in reSignInResult) {
                  // Still requires TOTP - proceed with verification
                  log('[Biometric] TOTP still required, proceeding to verification');
                }
              } catch (trustError) {
                error('[Biometric] Error handling trusted device:', trustError);
              }
            }
            
            // TOTP required - navigate to verification
            const firstFactor = mfaResult.mfaFactors[0];
            log('MFA required for biometric login, navigating to TOTP verification');
            
            // Store password temporarily for re-auth after TOTP
            if (mfaResult.password) {
              try {
                await SecureStore.setItemAsync('temp_password_for_totp', mfaResult.password);
              } catch (error) {
                error('Error storing temp password:', error);
              }
            }
            
            router.push({
              pathname: '/auth/verify-totp',
              params: { 
                factorId: firstFactor.id,
                userId: mfaResult.userId || firstFactor.id,
                email: mfaResult.email || result.email
              }
            });
            return;
          }
        }
        
        if (signInResult === true) {
          log('Biometric sign-in successful, navigating to main app');
          router.replace('/(tabs)/community');
        } else {
          log('Biometric sign-in failed despite successful authentication');
          Toast.show({
            type: 'error',
            text1: 'Sign In Failed',
            text2: 'Please try signing in with your email and password',
            position: 'top',
            visibilityTime: 4000,
          });
        }
      } else {
        // Only show error for non-cancellation errors
        const errorLower = (result.error || '').toLowerCase();
        const isCancelled = errorLower.includes('cancel') || 
                            errorLower.includes('user cancel') || 
                            errorLower.includes('cancelled');
        
        log('Biometric authentication result:', { 
          success: result.success, 
          error: result.error,
          isCancelled 
        });
        
        if (result.error && !isCancelled) {
          Alert.alert(
            'Authentication Failed',
            result.error || 'Biometric authentication failed. Please try again or use your email and password.'
          );
        }
      }
    } catch (error) {
      error('Biometric authentication error:', error);
      // Don't show error dialog for cancellations or invalid state
      const errorStr = String(error).toLowerCase();
      if (!errorStr.includes('cancel') && !errorStr.includes('invalid state')) {
        Alert.alert(
          'Authentication Failed',
          'There was a problem with biometric authentication. Please try again or use your email and password.'
        );
      }
    }
  };
  
  const validateField = (field: string, value: string, isSubmitting = false) => {
    switch (field) {
      case 'email':
        if (!value) {
          // Only set error if submitting or field has been interacted with
          if (isSubmitting || hasInteracted.email) {
            setEmailError('Email is required');
          }
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
          // Only set error if submitting or field has been interacted with
          if (isSubmitting || hasInteracted.password) {
            setPasswordError('Password is required');
          }
          return false;
        } else if (value.length < 6) {
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

  const handleFieldChange = (field: string, value: string) => {
    switch (field) {
      case 'email':
        setEmail(value);
        // Only validate if user has already interacted with this field
        if (hasInteracted.email) {
          validateField(field, value);
        }
        break;
      case 'password':
        setPassword(value);
        // Only validate if user has already interacted with this field
        if (hasInteracted.password) {
          validateField(field, value);
        }
        break;
    }
  };

  const handleFieldBlur = (field: string) => {
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
    // When validating the entire form, pass true for isSubmitting
    const isEmailValid = validateField('email', email, true);
    const isPasswordValid = validateField('password', password, true);
    
    // Mark all fields as interacted
    setHasInteracted({
      email: true,
      password: true,
    });
    
    log('Form validation results:', { isEmailValid, isPasswordValid, email, password });
    return isEmailValid && isPasswordValid;
  };
  
  // Removed popup error toast - using on-screen error message only

  // Add biometric prompt function after successful login
  const promptEnableBiometrics = async () => {
    try {
      // Check if biometric is already enabled
      if (biometricEnabled) return;
      
      // Check if device supports biometrics
      if (!biometricAvailable) return;
      
      // Ask user if they want to enable biometric login
      Alert.alert(
        `Enable Biometric Login`,
        `Would you like to use Biometric to log in next time?`,
        [
          {
            text: 'Not Now',
            style: 'cancel'
          },
          {
            text: 'Enable',
            onPress: async () => {
              try {
                const success = await enableBiometricAuth(email, password);
                if (success) {
                  setBiometricEnabled(true);
                  Toast.show({
                    type: 'success',
                    text1: `Biometric Login Enabled`,
                    text2: 'You can now log in with biometrics',
                    position: 'top',
                    visibilityTime: 3000,
                  });
                }
              } catch (error) {
                error('Error enabling biometric auth:', error);
              }
            }
          }
        ]
      );
    } catch (error) {
      error('Error prompting for biometric setup:', error);
    }
  };

  // Open Terms of Service
  const openTermsOfService = () => {
    Linking.openURL('https://www.nomlimingle.com/terms').catch(err => {
      error('Failed to open Terms of Service:', err);
      Alert.alert('Error', 'Unable to open Terms of Service. Please visit https://www.nomlimingle.com/terms');
    });
  };

  // Open Privacy Policy
  const openPrivacyPolicy = () => {
    Linking.openURL('https://www.nomlimingle.com/privacy').catch(err => {
      error('Failed to open Privacy Policy:', err);
      Alert.alert('Error', 'Unable to open Privacy Policy. Please visit https://www.nomlimingle.com/privacy');
    });
  };

  // Handle OAuth sign-in
  const handleOAuthSignInPress = async (provider: 'google' | 'apple' | 'facebook') => {
    Keyboard.dismiss();
    setOauthLoading(provider);
    
    try {
      const success = await handleOAuthSignIn(
        provider,
        async (isNewUser: boolean) => {
          // OAuth sign-in successful - follow same flow as regular sign-in
          log(`${provider} sign-in successful`, isNewUser ? '(new user)' : '(existing user)');
          
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
          
          // Navigate based on whether user needs to complete profile
          if (isNewUser) {
            // New user - redirect to profile edit to complete setup
            router.replace('/profile/edit');
          } else {
            // Existing user - go to main app
            router.replace('/(tabs)/discovery');
          }
        },
        (error) => {
          // OAuth sign-in failed
          Toast.show({
            type: 'error',
            text1: 'Sign In Failed',
            text2: error || `${provider} sign-in failed. Please try again.`,
            position: 'top',
            visibilityTime: 4000,
          });
        }
      );
      
      if (!success) {
        // Error already handled in callback
      }
    } catch (error) {
      error(`${provider} sign-in error:`, error);
      Toast.show({
        type: 'error',
        text1: 'Sign In Failed',
        text2: `An error occurred during ${provider} sign-in. Please try again.`,
        position: 'top',
        visibilityTime: 4000,
      });
    } finally {
      setOauthLoading(null);
    }
  };

  // Modify handleSignIn to re-enable biometrics after successful manual login
  const handleSignIn = async () => {
    Keyboard.dismiss();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Attempt sign in
      const signInResult = await signIn(email, password);
      
      // Check if MFA/TOTP is required
      if (signInResult && typeof signInResult === 'object' && 'requiresMFA' in signInResult) {
        const mfaResult = signInResult as any;
        if (mfaResult.requiresMFA && mfaResult.mfaFactors && mfaResult.mfaFactors.length > 0) {
          // Navigate to TOTP verification screen
          const firstFactor = mfaResult.mfaFactors[0];
          log('MFA required, navigating to TOTP verification', { 
            factorId: firstFactor.id,
            userId: mfaResult.userId,
            email: mfaResult.email 
          });
          
          // Store password temporarily in SecureStore for re-auth after TOTP
          if (mfaResult.password) {
            try {
              await SecureStore.setItemAsync('temp_password_for_totp', mfaResult.password);
            } catch (error) {
              error('Error storing temp password:', error);
            }
          }
          
          router.push({
            pathname: '/auth/verify-totp',
            params: { 
              factorId: firstFactor.id,
              userId: mfaResult.userId || firstFactor.id,
              email: mfaResult.email || email
            }
          });
          setIsSubmitting(false);
          return;
        }
      }
      
      if (signInResult === true) {
        log('Sign in successful');

        // Apply pending date_of_birth from onboarding (if present)
        try {
          const pendingDob = await AsyncStorage.getItem('pending_date_of_birth');
          if (pendingDob && user?.id) {
            await supabase
              .from('profiles')
              .upsert({ id: user.id, date_of_birth: pendingDob, updated_at: new Date().toISOString() } as any);
            await AsyncStorage.removeItem('pending_date_of_birth');
          }
        } catch (e) {
          // non-blocking
        }
        
        // If biometrics are available but not enabled, prompt to enable
        if (biometricAvailable && !biometricEnabled) {
          promptEnableBiometrics();
        }
        
        // Register for push notifications
        try {
          // Use the customNotifications service to get push token
          const { customNotifications } = await import('../../utils/customNotifications');
          
          // Check if the service is properly loaded
          if (!customNotifications || typeof customNotifications.initialize !== 'function') {
            warn('⚠️ Push notification service not properly loaded, skipping...');
            return;
          }
          
          await customNotifications.initialize();
          const token = customNotifications.getPushToken();
          if (token) {
            await customNotifications.saveTokenToProfile(user.id);
            log('✅ Push notification token saved successfully');
          } else {
            log('⚠️ No push token available');
          }
        } catch (error) {
          error('Error registering for push notifications:', error);
          // Don't fail signin if notifications fail
        }
        
        // Navigate to main app - use specific tab to avoid navigation issues
        log('Navigating to main app after successful signin');
        router.replace('/(tabs)/discovery');
      } else {
        // Error is handled by the useAuth hook
        log('Sign in failed');
      }
    } catch (error) {
      error('Sign in error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInput = (
    field: string, 
    placeholder: string, 
    value: string, 
    onChangeText: (text: string) => void, 
    keyboardType: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad' = 'default', 
    secureTextEntry = false, 
    showPasswordToggle = false, 
    autoComplete: 'off' | 'email' | 'password' | 'username' = 'off'
  ) => {
    const hasError = field === 'email' ? emailError : field === 'password' ? passwordError : '';
    
    const isFocused = focusedField === field;
    const hasValue = value.length > 0;
    
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
              field === 'password' ? 'password' : 'none'
            }
            secureTextEntry={secureTextEntry}
            returnKeyType={field === 'email' ? 'next' : 'done'}
            onSubmitEditing={field === 'password' ? handleSignIn : undefined}
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
      </View>
    );
  };
  
  // Render the Sign-In button section
  const renderSignInButton = () => {
    // Check if form has values (don't check errors until submission)
    const hasValues = email.trim() !== '' && password.trim() !== '';
    
    return (
      <Button
        title="Sign In"
        onPress={handleSignIn}
        loading={loading}
        style={styles.button}
        disabled={loading || !hasValues}
      />
    );
  };

  // Show loading if authentication is still loading
  if (authLoading && !user) {
    return (
      <SafeAreaWrapper>
        <View style={[styles.container, styles.loadingContainer]}>
          <ActivityIndicator size="large" color={Colors.primary.main} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaWrapper>
    );
  }

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
            <MotiView
              from={{ translateY: 20, opacity: 0 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, delay: 300 }}
            >
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to continue</Text>
            </MotiView>
          </View>
          
          {/* Form Container */}
          <View style={styles.formContainer}>
            {error && !error.includes('deleted') && (
              <ErrorMessage 
                message={
                  error === 'Invalid email or password' ? 
                    'Email or password is incorrect. Please try again.' :
                  error === 'Email not confirmed' ?
                    'Please verify your email address before signing in.' :
                  error === 'An error occurred. Please try again' ?
                    'Unable to sign in. Please check your information and try again.' :
                    error
                }
                helpText={error === 'Email not confirmed' ? 
                  'Check your inbox for a verification email.' : undefined}
              />
            )}

            {/* Deleted Account Alert Modal */}
            <DeletedAccountAlert
              visible={showDeletedAccountAlert}
              onDismiss={() => {
                setShowDeletedAccountAlert(false);
                // Clear the error after dismissing
                clearError();
              }}
            />
            
            {/* Biometric Authentication - Prominent placement at top when available */}
            {biometricAvailable && biometricEnabled && !checkingBiometric && (
              <TouchableOpacity 
                style={styles.biometricButtonProminent}
                onPress={handleBiometricAuth}
                accessibilityLabel="Sign in with biometrics"
              >
                <Fingerprint size={32} color={Colors.primary.main} />
                <Text style={styles.biometricTextProminent}>
                  Sign in with Biometric
                </Text>
              </TouchableOpacity>
            )}
            
            {/* Biometric loading state */}
            {checkingBiometric && (
              <View style={styles.biometricLoadingContainer}>
                <ActivityIndicator size="small" color={Colors.primary.main} />
                <Text style={styles.biometricLoadingText}>Checking biometric availability...</Text>
              </View>
            )}
            
            {/* OAuth Sign-In Buttons - Side by Side */}
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
              <Text style={styles.separatorText}>or sign in with email</Text>
              <View style={styles.separatorLine} />
            </View>
            
            {/* Form Fields */}
            {renderInput('email', 'Enter your email', email, (value) => handleFieldChange('email', value), 'email-address', false, false, 'email')}
            {renderInput('password', 'Enter your password', password, (value) => handleFieldChange('password', value), 'default', !showPassword, true)}
            
            {/* Forgot Password Link */}
            <TouchableOpacity 
              style={styles.forgotPasswordContainer}
              onPress={() => router.push(`/auth/forgot-password?email=${encodeURIComponent(email)}`)}
              accessibilityLabel="Forgot password"
            >
                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>
            
            {/* Sign In Button */}
            {renderSignInButton()}
            
            {/* Sign Up Link */}
            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <TouchableOpacity 
                onPress={() => router.push('/auth/signup')}
                accessibilityLabel="Go to sign up"
              >
                <Text style={styles.signupLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
            
            {/* Terms and Privacy Links */}
            <Text style={styles.termsText}>
              By signing in, you agree to our{' '}
              <Text style={styles.termsLink} onPress={openTermsOfService}>Terms of Service</Text> and{' '}
              <Text style={styles.termsLink} onPress={openPrivacyPolicy}>Privacy Policy</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Slow Network Alert */}
      <SlowNetworkAlert
        visible={showSlowNetworkAlert}
        onDismiss={() => setShowSlowNetworkAlert(false)}
        onRefresh={handleRefreshApp}
      />
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
    paddingBottom: Spacing.md,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  logoContainer: {
    marginBottom: Spacing.md,
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
    fontSize: 26,
    fontFamily: FontFamily.bold,
    color: '#1F2937',
    marginBottom: 2,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '400',
  },
  formContainer: {
    paddingHorizontal: Spacing.xl,
    flex: 1,
  },
  inputContainer: {
    marginBottom: Spacing.md,
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
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg + Spacing.sm,
    marginTop: -Spacing.xs,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    color: '#B794F6',
    fontWeight: '500',
  },
  button: {
    marginBottom: Spacing.lg,
    minHeight: 48,
    borderRadius: 12,
  },
  biometricButtonProminent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    minHeight: 52,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  biometricTextProminent: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: '#1F2937',
    fontWeight: '600',
  },
  biometricLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  biometricLoadingText: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    color: '#6B7280',
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
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  signupText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: '#6B7280',
  },
  signupLink: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: '#B794F6',
    fontWeight: '600',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
    fontFamily: FontFamily.medium,
    color: '#6B7280',
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
  termsText: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: FontFamily.regular,
    color: '#9CA3AF',
    lineHeight: 16,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
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
});