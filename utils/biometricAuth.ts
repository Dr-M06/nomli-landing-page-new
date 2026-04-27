import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from './productionLogger';


const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const STORED_EMAIL_KEY = 'stored_email';
const STORED_PASSWORD_KEY = 'stored_password';
const LAST_AUTH_ATTEMPT_KEY = 'last_biometric_attempt';
const BIOMETRIC_DISABLED_FLAG = 'biometric_disabled_temporarily';
const AUTH_COOLDOWN_MS = 5000; // Increased to 5 seconds cooldown between attempts

export interface BiometricAuthResult {
  success: boolean;
  email?: string;
  password?: string;
  error?: string;
}

export interface BiometricCapabilities {
  isAvailable: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
}

// Add a function to completely disable biometric authentication temporarily
export const disableTemporaryBiometricAuth = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(BIOMETRIC_DISABLED_FLAG, 'true');
    log('Biometric authentication temporarily disabled');
  } catch (error) {
    error('Error disabling biometric auth temporarily:', error);
  }
};

// Add a function to re-enable biometric authentication
export const enableTemporaryBiometricAuth = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(BIOMETRIC_DISABLED_FLAG);
    log('Biometric authentication enabled again');
  } catch (error) {
    error('Error enabling biometric auth:', error);
  }
};

/**
 * Check if biometric authentication is available on the device
 */
export const checkBiometricCapabilities = async (): Promise<BiometricCapabilities> => {
  try {
    // Check if biometric is temporarily disabled
    const isDisabled = await AsyncStorage.getItem(BIOMETRIC_DISABLED_FLAG);
    if (isDisabled === 'true') {
      log('Biometric authentication is temporarily disabled');
      return {
        isAvailable: false,
        hasHardware: false,
        isEnrolled: false,
        supportedTypes: [],
      };
    }
    
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    return {
      isAvailable: hasHardware && isEnrolled,
      hasHardware,
      isEnrolled,
      supportedTypes,
    };
  } catch (error) {
    error('Error checking biometric capabilities:', error);
    return {
      isAvailable: false,
      hasHardware: false,
      isEnrolled: false,
      supportedTypes: [],
    };
  }
};

/**
 * Get a human-readable description of available biometric types
 */
export const getBiometricTypeDescription = (types: LocalAuthentication.AuthenticationType[]): string => {
  // Always return "Biometric" regardless of the specific type
  return 'Biometric';
};

/**
 * Check if biometric authentication is enabled for the user
 */
export const isBiometricEnabled = async (): Promise<boolean> => {
  try {
    // Check if biometric is temporarily disabled
    const isDisabled = await AsyncStorage.getItem(BIOMETRIC_DISABLED_FLAG);
    if (isDisabled === 'true') {
      log('Biometric authentication is temporarily disabled');
      return false;
    }
    
    const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    error('Error checking biometric enabled status:', error);
    return false;
  }
};

/**
 * Enable biometric authentication and store user credentials securely
 */
export const enableBiometricAuth = async (email: string, password: string): Promise<boolean> => {
  try {
    log('Attempting to enable biometric authentication...');
    
    // First check if biometric is available
    const capabilities = await checkBiometricCapabilities();
    log('Biometric capabilities:', {
      available: capabilities.isAvailable,
      hasHardware: capabilities.hasHardware,
      isEnrolled: capabilities.isEnrolled,
      types: capabilities.supportedTypes
    });
    
    if (!capabilities.isAvailable) {
      error('Biometric authentication is not available on this device');
      throw new Error('Biometric authentication is not available on this device');
    }

    // Clean up any existing credentials first to prevent issues
    await SecureStore.deleteItemAsync(STORED_EMAIL_KEY);
    await SecureStore.deleteItemAsync(STORED_PASSWORD_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    
    // Store credentials securely
    log('Storing credentials securely...');
    
    // First set the credentials
    await SecureStore.setItemAsync(STORED_EMAIL_KEY, email);
    await SecureStore.setItemAsync(STORED_PASSWORD_KEY, password);
    
    // Verify storage worked correctly before setting the enabled flag
    const storedEmail = await SecureStore.getItemAsync(STORED_EMAIL_KEY);
    const storedPassword = await SecureStore.getItemAsync(STORED_PASSWORD_KEY);
    
    if (!storedEmail || !storedPassword) {
      error('Failed to store credentials securely');
      throw new Error('Failed to store credentials securely');
    }
    
    // Finally set the enabled flag after verifying credentials were stored
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
    
    log('Biometric authentication enabled successfully');
    return true;
  } catch (error) {
    error('Error enabling biometric authentication:', error);
    return false;
  }
};

/**
 * Disable biometric authentication and clear stored credentials
 */
export const disableBiometricAuth = async (): Promise<boolean> => {
  try {
    // First disable temporary authentication to prevent prompts
    await disableTemporaryBiometricAuth();
    
    // Then clear stored credentials
    await SecureStore.deleteItemAsync(STORED_EMAIL_KEY);
    await SecureStore.deleteItemAsync(STORED_PASSWORD_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    
    // Also clear any authentication attempt timestamps
    await AsyncStorage.removeItem(LAST_AUTH_ATTEMPT_KEY);
    
    log('Biometric authentication disabled and credentials cleared');
    return true;
  } catch (error) {
    error('Error disabling biometric authentication:', error);
    return false;
  }
};

/**
 * Authenticate user with biometrics and retrieve stored credentials
 */
export const authenticateWithBiometrics = async (): Promise<BiometricAuthResult> => {
  try {
    // Check if biometric is temporarily disabled
    const isDisabled = await AsyncStorage.getItem(BIOMETRIC_DISABLED_FLAG);
    if (isDisabled === 'true') {
      log('Biometric authentication is temporarily disabled');
      return {
        success: false,
        error: 'Biometric authentication is temporarily disabled',
      };
    }
    
    // Check for recent authentication attempts to prevent rapid consecutive prompts
    const lastAttemptTime = await AsyncStorage.getItem(LAST_AUTH_ATTEMPT_KEY);
    const now = Date.now();
    
    if (lastAttemptTime) {
      const timeSinceLastAttempt = now - parseInt(lastAttemptTime);
      if (timeSinceLastAttempt < AUTH_COOLDOWN_MS) {
        log(`Biometric authentication attempted too soon (${timeSinceLastAttempt}ms since last attempt)`);
        return {
          success: false,
          error: 'Please wait before trying again',
        };
      }
    }
    
    // Record this attempt
    await AsyncStorage.setItem(LAST_AUTH_ATTEMPT_KEY, now.toString());
    
    // Check if biometric is enabled
    const enabled = await isBiometricEnabled();
    if (!enabled) {
      return {
        success: false,
        error: 'Biometric authentication is not enabled',
      };
    }

    // Check biometric capabilities
    const capabilities = await checkBiometricCapabilities();
    if (!capabilities.isAvailable) {
      return {
        success: false,
        error: 'Biometric authentication is not available',
      };
    }

    // Get biometric type description for prompt
    const biometricType = getBiometricTypeDescription(capabilities.supportedTypes);

    // Authenticate with biometrics
    const authResult = await LocalAuthentication.authenticateAsync({
      promptMessage: `Use Biometric to sign in`,
      fallbackLabel: 'Use password instead',
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });

    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error || 'Biometric authentication failed',
      };
    }

    // Retrieve stored credentials
    const email = await SecureStore.getItemAsync(STORED_EMAIL_KEY);
    const password = await SecureStore.getItemAsync(STORED_PASSWORD_KEY);

    if (!email || !password) {
      return {
        success: false,
        error: 'Stored credentials not found',
      };
    }

    return {
      success: true,
      email,
      password,
    };
  } catch (error) {
    error('Error authenticating with biometrics:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

/**
 * Show a prompt asking user if they want to enable biometric authentication
 */
export const promptForBiometricSetup = async (email: string, password: string): Promise<boolean> => {
  try {
    // Check if biometric is available
    const capabilities = await checkBiometricCapabilities();
    if (!capabilities.isAvailable) {
      log('Biometric authentication not available, skipping setup');
      return false;
    }

    // Check if already enabled
    const alreadyEnabled = await isBiometricEnabled();
    if (alreadyEnabled) {
      log('Biometric authentication already enabled');
      return true;
    }

    // Enable biometric authentication
    const success = await enableBiometricAuth(email, password);
    if (success) {
      log('Biometric authentication setup completed');
    }
    
    return success;
  } catch (error) {
    error('Error setting up biometric authentication:', error);
    return false;
  }
};

/**
 * Update stored credentials (when user changes password)
 */
export const updateStoredCredentials = async (email: string, password: string): Promise<boolean> => {
  try {
    const enabled = await isBiometricEnabled();
    if (!enabled) {
      return false;
    }

    await SecureStore.setItemAsync(STORED_EMAIL_KEY, email);
    await SecureStore.setItemAsync(STORED_PASSWORD_KEY, password);
    
    log('Stored credentials updated');
    return true;
  } catch (error) {
    error('Error updating stored credentials:', error);
    return false;
  }
}; 