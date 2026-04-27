import { signInWithGoogle, signInWithApple, signInWithFacebook } from './oauthAuth';
import { supabase } from './supabase';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { log, warn, error } from './productionLogger';


/**
 * Handle OAuth sign-in and follow the same flow as regular email/password sign-in
 * This includes: push notifications, navigation, etc.
 * onSuccess receives isNewUser flag - true if user needs to complete profile setup
 */
export const handleOAuthSignIn = async (
  provider: 'google' | 'apple' | 'facebook',
  onSuccess?: (isNewUser: boolean) => void,
  onError?: (error: string) => void
): Promise<boolean> => {
  try {
    let result: { success: boolean; error?: string; isNewUser?: boolean };
    
    switch (provider) {
      case 'google':
        result = await signInWithGoogle();
        break;
      case 'apple':
        // Check if Apple Sign-In is available
        if (Platform.OS !== 'ios') {
          onError?.('Apple Sign-In is only available on iOS');
          return false;
        }
        try {
          const isAvailable = await AppleAuthentication.isAvailableAsync();
          if (!isAvailable) {
            onError?.('Apple Sign-In is not available on this device');
            return false;
          }
        } catch (e) {
          // expo-apple-authentication might not be installed
          onError?.('Apple Sign-In is not configured. Please install expo-apple-authentication');
          return false;
        }
        result = await signInWithApple();
        break;
      case 'facebook':
        result = await signInWithFacebook();
        break;
      default:
        onError?.('Invalid OAuth provider');
        return false;
    }

    if (!result.success) {
      onError?.(result.error || 'OAuth sign-in failed');
      return false;
    }

    // Get the current session to verify sign-in was successful
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !sessionData.session) {
      onError?.('Failed to create session after OAuth sign-in');
      return false;
    }

    // OAuth sign-in successful - trigger success callback with isNewUser flag
    // The caller should handle push notifications and navigation based on isNewUser
    onSuccess?.(result.isNewUser || false);
    return true;
  } catch (error: any) {
    error(`OAuth sign-in error (${provider}):`, error);
    onError?.(error.message || 'An unexpected error occurred');
    return false;
  }
};

/**
 * Check if OAuth providers are available
 */
export const checkOAuthAvailability = async () => {
  const availability = {
    google: true, // Google Sign-In is always available if configured
    apple: false,
    facebook: false,
  };

  // Check Apple Sign-In availability (iOS only)
  if (Platform.OS === 'ios') {
    try {
      const AppleAuth = await import('expo-apple-authentication');
      availability.apple = await AppleAuth.default.isAvailableAsync();
    } catch (e) {
      // expo-apple-authentication not installed
      availability.apple = false;
    }
  }

  // Facebook OAuth is always available via Supabase (no SDK needed)
  availability.facebook = true;

  return availability;
};

