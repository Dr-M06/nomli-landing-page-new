/**
 * Enhanced Biometric Authentication
 * 
 * Improved security for biometric auth by using session tokens instead of storing passwords
 * 
 * This approach:
 * 1. Stores only the session token (not password) after successful login
 * 2. Uses the session token for biometric re-authentication
 * 3. Automatically refreshes expired sessions
 * 4. Falls back to password prompt if session is invalid
 */

import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const STORED_SESSION_KEY = 'biometric_session_token';
const STORED_EMAIL_KEY = 'biometric_email';
const LAST_AUTH_ATTEMPT_KEY = 'last_biometric_attempt';
const BIOMETRIC_DISABLED_FLAG = 'biometric_disabled_temporarily';
const AUTH_COOLDOWN_MS = 5000;

export interface BiometricAuthResult {
  success: boolean;
  session?: any;
  error?: string;
}

/**
 * Check if biometric authentication is available
 */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch (error) {
    error('[BiometricAuth] Error checking availability:', error);
    return false;
  }
}

/**
 * Check if biometric auth is enabled
 */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    return false;
  }
}

/**
 * Enable biometric authentication using session token (not password)
 * Call this after successful login
 */
export async function enableBiometricAuth(email: string, session: any): Promise<boolean> {
  try {
    const available = await isBiometricAvailable();
    if (!available) {
      throw new Error('Biometric authentication is not available on this device');
    }

    // Store session token and email (not password)
    await SecureStore.setItemAsync(STORED_SESSION_KEY, JSON.stringify(session));
    await SecureStore.setItemAsync(STORED_EMAIL_KEY, email);
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
    
    return true;
  } catch (error) {
    error('[BiometricAuth] Error enabling biometric auth:', error);
    return false;
  }
}

/**
 * Authenticate using biometrics and restore session
 */
export async function authenticateWithBiometrics(): Promise<BiometricAuthResult> {
  try {
    const enabled = await isBiometricEnabled();
    if (!enabled) {
      return { success: false, error: 'Biometric authentication is not enabled' };
    }

    const available = await isBiometricAvailable();
    if (!available) {
      return { success: false, error: 'Biometric authentication is not available' };
    }

    // Check cooldown
    const lastAttempt = await SecureStore.getItemAsync(LAST_AUTH_ATTEMPT_KEY);
    if (lastAttempt) {
      const lastAttemptTime = parseInt(lastAttempt, 10);
      const now = Date.now();
      if (now - lastAttemptTime < AUTH_COOLDOWN_MS) {
        return { success: false, error: 'Please wait before trying again' };
      }
    }

    // Perform biometric authentication
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to continue',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      await SecureStore.setItemAsync(LAST_AUTH_ATTEMPT_KEY, Date.now().toString());
      return { success: false, error: result.error || 'Biometric authentication failed' };
    }

    // Get stored session token
    const sessionStr = await SecureStore.getItemAsync(STORED_SESSION_KEY);
    if (!sessionStr) {
      return { success: false, error: 'No stored session found' };
    }

    const session = JSON.parse(sessionStr);

    // Verify session is still valid
    const { data: { user }, error } = await supabase.auth.setSession(session);
    
    if (error || !user) {
      // Session expired or invalid - need to re-authenticate with password
      await disableBiometricAuth();
      return { 
        success: false, 
        error: 'Session expired. Please sign in with your password.' 
      };
    }

    // Session is valid - return success
    return { success: true, session };
  } catch (error: any) {
    error('[BiometricAuth] Error during biometric authentication:', error);
    return { success: false, error: error.message || 'Authentication failed' };
  }
}

/**
 * Disable biometric authentication
 */
export async function disableBiometricAuth(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    await SecureStore.deleteItemAsync(STORED_SESSION_KEY);
    await SecureStore.deleteItemAsync(STORED_EMAIL_KEY);
    return true;
  } catch (error) {
    error('[BiometricAuth] Error disabling biometric auth:', error);
    return false;
  }
}

/**
 * Update stored session when user signs in again
 * Call this after successful login to refresh the stored session
 */
export async function updateStoredSession(session: any): Promise<boolean> {
  try {
    const enabled = await isBiometricEnabled();
    if (!enabled) {
      return false;
    }

    await SecureStore.setItemAsync(STORED_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch (error) {
    error('[BiometricAuth] Error updating stored session:', error);
    return false;
  }
}

/**
 * Get stored email (for display purposes only)
 */
export async function getStoredEmail(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORED_EMAIL_KEY);
  } catch (error) {
    return null;
  }
}
