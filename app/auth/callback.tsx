import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../utils/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { log, warn, error } from '../../utils/productionLogger';


/**
 * Check if user has completed their profile (has username and basic info)
 */
const checkProfileComplete = async (userId: string): Promise<boolean> => {
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

/**
 * OAuth Callback Handler
 * This screen handles the OAuth redirect from Supabase
 * Extracts tokens from the callback URL and sets the session
 * For new users, redirects to profile edit to complete setup
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Close the web browser if it's still open
        WebBrowser.dismissBrowser();

        // Get the callback URL from params or from the initial URL
        let callbackUrl = params.url as string;
        
        // If no URL in params, try to get it from the initial URL
        if (!callbackUrl) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl && initialUrl.includes('/auth/callback')) {
            callbackUrl = initialUrl;
          }
        }

        log('OAuth callback URL:', callbackUrl);

        let session = null;

        if (callbackUrl) {
          // Extract hash fragment from URL (Supabase OAuth returns tokens in hash)
          const hashFragment = callbackUrl.split('#')[1];
          
          if (hashFragment) {
            // Parse the hash fragment to get tokens
            const urlParams = new URLSearchParams(hashFragment);
            const accessToken = urlParams.get('access_token');
            const refreshToken = urlParams.get('refresh_token');

            if (accessToken && refreshToken) {
              log('Found tokens in callback URL, setting session...');
              
              // Set the session manually with the tokens from the callback
              const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

              if (sessionError) {
                error('Session error after OAuth callback:', sessionError);
                router.replace('/auth/signin');
                return;
              }

              session = sessionData.session;
            }
          }
        }

        // Fallback: Wait and check if session was set
        if (!session) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            error('Session error after OAuth callback:', sessionError);
            router.replace('/auth/signin');
            return;
          }

          session = sessionData.session;
        }

        if (!session) {
          log('⚠️ No session found after OAuth callback');
          router.replace('/auth/signin');
          return;
        }

        // Check if this is a new user who needs to complete their profile
        const profileComplete = await checkProfileComplete(session.user.id);

        if (profileComplete) {
          // Existing user with complete profile - go to main app
          log('✅ OAuth sign-in successful - existing user');
          router.replace('/(tabs)/discovery');
        } else {
          // New user or incomplete profile - go to profile setup
          log('✅ OAuth sign-in successful - new user, redirecting to profile setup');
          router.replace('/profile/edit');
        }
      } catch (error) {
        error('OAuth callback error:', error);
        router.replace('/auth/signin');
      }
    };

    handleCallback();
  }, [router, params]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#B794F6" />
        <Text style={styles.text}>Signing you in...</Text>
        <Text style={styles.subtext}>Please wait</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    marginTop: 20,
    fontSize: 18,
    fontFamily: 'System',
    fontWeight: '600',
    color: '#1F2937',
  },
  subtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
});

