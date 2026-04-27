/**
 * App Security Utilities
 * 
 * Provides security checks to prevent:
 * - Reverse engineering
 * - App tampering
 * - Root/jailbreak detection
 * - Debugging detection
 * - Repackaging detection
 */

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Device from 'expo-device';
import { log, warn, error } from './productionLogger';


/**
 * Check if the app is running on a rooted/jailbroken device
 * Note: This is a basic check. Advanced root detection requires native modules.
 */
export const checkRootedDevice = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return false; // iOS jailbreak detection would need additional libraries
  }

  try {
    // Check for common root indicators
    const suspiciousPaths = [
      '/system/app/Superuser.apk',
      '/sbin/su',
      '/system/bin/su',
      '/system/xbin/su',
      '/data/local/xbin/su',
      '/data/local/bin/su',
      '/system/sd/xbin/su',
      '/system/bin/failsafe/su',
      '/data/local/su',
      '/su/bin/su',
    ];

    // Note: File system checks require native modules
    // For now, we'll use basic heuristics
    
    // Check if device is an emulator (often used for reverse engineering)
    if (Device.isDevice === false) {
      // In production, you might want to be more strict
      // For now, we allow emulators but log it
      warn('[Security] Running on emulator');
    }

    // Check for developer options (basic check)
    // More advanced checks would require native modules
    
    return false; // Basic implementation - enhance with native modules for production
  } catch (error) {
    error('[Security] Error checking rooted device:', error);
    return false;
  }
};

/**
 * Verify app signature to detect repackaging
 * This should be done server-side for better security
 */
export const verifyAppSignature = async (): Promise<boolean> => {
  try {
    // Get app signature
    const signature = await Application.getIosIdForVendorAsync();
    
    // In production, compare with expected signature from server
    // For now, just return true
    // TODO: Implement server-side signature verification
    
    return true;
  } catch (error) {
    error('[Security] Error verifying app signature:', error);
    return false;
  }
};

/**
 * Check if app is being debugged
 */
export const checkDebugging = (): boolean => {
  // Basic check - in production, use native modules for more robust detection
  if (__DEV__) {
    return true;
  }
  
  // Additional checks would require native modules
  return false;
};

/**
 * Comprehensive security check
 * Call this on app startup
 */
export const performSecurityCheck = async (): Promise<{
  isSecure: boolean;
  issues: string[];
}> => {
  const issues: string[] = [];
  
  // Check for rooted device
  const isRooted = await checkRootedDevice();
  if (isRooted) {
    issues.push('Rooted device detected');
  }
  
  // Check for debugging
  const isDebugging = checkDebugging();
  if (isDebugging && !__DEV__) {
    issues.push('Debugging detected in production');
  }
  
  // Verify app signature
  const isValidSignature = await verifyAppSignature();
  if (!isValidSignature) {
    issues.push('Invalid app signature - possible repackaging');
  }
  
  return {
    isSecure: issues.length === 0,
    issues,
  };
};

/**
 * Exit app if security check fails
 * Use this in production builds
 */
export const enforceSecurity = async (): Promise<void> => {
  if (__DEV__) {
    // Skip security checks in development
    return;
  }
  
  const securityCheck = await performSecurityCheck();
  
  if (!securityCheck.isSecure) {
    error('[Security] Security check failed:', securityCheck.issues);
    // In production, you might want to:
    // 1. Log to server
    // 2. Show error message
    // 3. Exit app
    // For now, we'll just log it
  }
};


