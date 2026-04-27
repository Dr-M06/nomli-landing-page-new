import { supabase } from './supabase';
import { Platform } from 'react-native';
import { createURL } from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { log, warn, error } from './productionLogger';


/**
 * Check if user has completed their profile (has username and basic info)
 */
export const checkProfileComplete = async (userId: string): Promise<boolean> => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return false;
    }

    // Profile is complete if they have a username that's not auto-generated
    const hasValidUsername = profile.username && 
      !profile.username.startsWith('user_') && 
      profile.username.length > 3;
    
    return !!hasValidUsername;
  } catch (error) {
    error('Error checking profile:', error);
    return false;
  }
};

// Get the redirect URL helper
const getRedirectUrl = () => {
  try {
    // Use expo-linking's createURL function (named export)
    return createURL('/auth/callback');
  } catch (e) {
    warn('createURL not available, using fallback');
    // Fallback: construct URL manually using the scheme from app.config.js
    const scheme = 'nomlimingle';
    return `${scheme}://auth/callback`;
  }
};

// Complete the OAuth session in the browser
WebBrowser.maybeCompleteAuthSession();

/**
 * Sign in with Google using Supabase OAuth (Web-based)
 * This uses Supabase's built-in OAuth flow which opens a browser/webview
 * Returns isNewUser: true if user needs to complete profile setup
 */
export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string; isNewUser?: boolean }> => {
  try {
    // Get the redirect URL for OAuth callback
    // This should match what's configured in Supabase Dashboard
    const redirectUrl = getRedirectUrl();
    
    log('Starting Google OAuth with redirect URL:', redirectUrl);

    // Start Supabase OAuth flow
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      error('Supabase Google OAuth error:', error);
      return { success: false, error: error.message };
    }

    if (!data.url) {
      return { success: false, error: 'Failed to get OAuth URL' };
    }

    // Open the OAuth URL in browser/webview
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

    if (result.type === 'success') {
      // The callback URL contains the tokens in the hash fragment
      // Format: redirectUrl#access_token=...&refresh_token=...&expires_in=...
      const callbackUrl = result.url;
      
      // Extract hash fragment from URL
      const hashFragment = callbackUrl.split('#')[1];
      
      if (hashFragment) {
        // Parse the hash fragment to get tokens
        const params = new URLSearchParams(hashFragment);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const expiresIn = params.get('expires_in');

        if (accessToken && refreshToken) {
          // Set the session manually with the tokens from the callback
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            error('Session error after OAuth:', sessionError);
            return { success: false, error: sessionError.message };
          }

          if (!sessionData.session) {
            return { success: false, error: 'Failed to create session after OAuth' };
          }

          // Check if user needs to complete profile setup
          const isNewUser = !(await checkProfileComplete(sessionData.session.user.id));
          log('✅ Google OAuth sign-in successful', isNewUser ? '(new user)' : '(existing user)');
          return { success: true, isNewUser };
        }
      }

      // Fallback: Wait and check session (Supabase might have processed it automatically)
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (sessionData.session) {
        const isNewUser = !(await checkProfileComplete(sessionData.session.user.id));
        log('✅ Google OAuth sign-in successful (auto-detected)', isNewUser ? '(new user)' : '(existing user)');
        return { success: true, isNewUser };
      }

      return { success: false, error: 'Failed to create session after OAuth' };
    } else if (result.type === 'cancel') {
      return { success: false, error: 'Sign in cancelled' };
    } else {
      return { success: false, error: 'OAuth flow failed' };
    }
  } catch (error: any) {
    error('Google OAuth error:', error);
    return { success: false, error: error.message || 'Google Sign-In failed' };
  }
};

/**
 * Sign in with Apple using Native Apple Sign-In (NO web browser)
 * Note: Requires Apple Sign-In to be configured in Supabase Dashboard
 * Only works on iOS devices
 */
export const signInWithApple = async (): Promise<{ success: boolean; error?: string; isNewUser?: boolean }> => {
  try {
    // Check if Apple Sign-In is available (iOS only)
    if (Platform.OS !== 'ios') {
      return { success: false, error: 'Apple Sign-In is only available on iOS' };
    }

    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, error: 'Apple Sign-In is not available on this device' };
    }

    // Perform native Apple Sign-In
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { success: false, error: 'Failed to get Apple identity token' };
    }

    // Sign in to Supabase with the Apple identity token
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      error('Supabase Apple OAuth error:', error);
      return { success: false, error: error.message };
    }

    if (!data.session) {
      return { success: false, error: 'Failed to create session' };
    }

    // Check if user needs to complete profile setup
    const isNewUser = !(await checkProfileComplete(data.session.user.id));
    return { success: true, isNewUser };
  } catch (error: any) {
    // Use console.warn to avoid red screen in dev mode
    warn('Apple Sign-In failed:', error?.message || error);
    
    if (error.code === 'ERR_CANCELED' || error.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, error: 'Sign in cancelled' };
    }
    
    // Handle Expo Go / dev build limitation
    if (error.message?.includes('unknown reason') || error.code === 'ERR_APPLE_AUTHENTICATION_UNAVAILABLE') {
      return { 
        success: false, 
        error: 'Apple Sign-In requires a production build. Please use Google Sign-In or email instead.' 
      };
    }
    
    return { success: false, error: error.message || 'Apple Sign-In failed' };
  }
};

/**
 * Sign in with Facebook using Supabase OAuth (Web-based)
 * This uses Supabase's built-in OAuth flow which opens a browser/webview
 * 
 * IMPORTANT: For Facebook OAuth to work, you must configure:
 * 1. In Supabase Dashboard > Authentication > URL Configuration:
 *    - Add your redirect URL: nomlimingle://auth/callback
 * 2. In Facebook App Settings > Facebook Login > Settings:
 *    - Add Valid OAuth Redirect URIs: https://<YOUR_SUPABASE_REF>.supabase.co/auth/v1/callback
 *    - Add App Domains: <YOUR_SUPABASE_REF>.supabase.co
 */
export const signInWithFacebook = async (): Promise<{ success: boolean; error?: string; isNewUser?: boolean }> => {
  try {
    // Get the redirect URL for OAuth callback
    const redirectUrl = getRedirectUrl();
    
    log('Starting Facebook OAuth with redirect URL:', redirectUrl);

    // Start Supabase OAuth flow
    // Note: Supabase will handle the redirect to Facebook, then back to Supabase callback,
    // then finally to our app's redirectUrl (nomlimingle://auth/callback)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: redirectUrl,
        // Facebook-specific scopes
        scopes: 'email',
        queryParams: {
          // Ensure we get email permission
          auth_type: 'rerequest', // Re-request permissions if user previously denied
        },
      },
    });

    if (error) {
      error('Supabase Facebook OAuth error:', error);
      return { success: false, error: error.message };
    }

    if (!data.url) {
      return { success: false, error: 'Failed to get OAuth URL' };
    }

    // Open the OAuth URL in browser/webview with minimal UI
    // Using openAuthSessionAsync - URL bar visibility depends on platform
    // On iOS, it shows briefly; on Android, it can be minimized
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
      showInRecents: false,
      // Note: URL bar visibility is platform-dependent and required for OAuth security
      // Users will see the Supabase OAuth URL briefly, which is standard OAuth UX
    });

    if (result.type === 'success') {
      // The callback URL contains the tokens in the hash fragment
      const callbackUrl = result.url;
      
      // Extract hash fragment from URL
      const hashFragment = callbackUrl.split('#')[1];
      
      if (hashFragment) {
        // Parse the hash fragment to get tokens
        const params = new URLSearchParams(hashFragment);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          // Set the session manually with the tokens from the callback
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            error('Session error after OAuth:', sessionError);
            return { success: false, error: sessionError.message };
          }

          if (!sessionData.session) {
            return { success: false, error: 'Failed to create session after OAuth' };
          }

          // Check if user needs to complete profile setup
          const isNewUser = !(await checkProfileComplete(sessionData.session.user.id));
          log('✅ Facebook OAuth sign-in successful', isNewUser ? '(new user)' : '(existing user)');
          return { success: true, isNewUser };
        }
      }

      // Fallback: Wait and check session (Supabase might have processed it automatically)
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (sessionData.session) {
        const isNewUser = !(await checkProfileComplete(sessionData.session.user.id));
        log('✅ Facebook OAuth sign-in successful (auto-detected)', isNewUser ? '(new user)' : '(existing user)');
        return { success: true, isNewUser };
      }

      return { success: false, error: 'Failed to create session after OAuth' };
    } else if (result.type === 'cancel') {
      return { success: false, error: 'Sign in cancelled' };
    } else {
      return { success: false, error: 'OAuth flow failed' };
    }
  } catch (error: any) {
    error('Facebook OAuth error:', error);
    return { success: false, error: error.message || 'Facebook Sign-In failed' };
  }
};

// No longer needed - Supabase handles sign out

