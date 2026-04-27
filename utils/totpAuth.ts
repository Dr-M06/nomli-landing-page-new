import { supabase } from './supabase';
import { checkTOTPEnabled as checkTOTPEnabledService, verifyTOTPCode } from './totpService';
import { log, warn, error } from './productionLogger';


/**
 * TOTP/MFA Authentication Utilities
 * Handles TOTP setup, verification, and management for users
 * Uses backend Edge Function (verify-totp) - same as web app
 */

export interface MFAFactor {
  id: string;
  type: 'totp';
  friendly_name?: string;
  status: 'verified' | 'unverified';
}

export interface TOTPEnrollResponse {
  id: string;
  qr_code: string;
  secret: string;
  uri: string;
}

/**
 * Check if user has TOTP/MFA enabled
 * Uses profiles table instead of Supabase MFA
 */
export const checkTOTPEnabled = async (): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    return await checkTOTPEnabledService(user.id);
  } catch (error) {
    error('[TOTP] Error checking TOTP status:', error);
    return false;
  }
};

/**
 * Get all enrolled MFA factors
 * Returns empty array if TOTP is enabled (for compatibility)
 */
export const getMFAFactors = async (): Promise<MFAFactor[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const isEnabled = await checkTOTPEnabledService(user.id);
    
    // Return a dummy factor if enabled (for compatibility with existing code)
    if (isEnabled) {
      return [{
        id: user.id, // Use user ID as factor ID
        type: 'totp',
        friendly_name: 'Authenticator App',
        status: 'verified',
      }];
    }

    return [];
  } catch (error) {
    error('[TOTP] Error getting MFA factors:', error);
    return [];
  }
};

/**
 * Enroll a new TOTP factor
 * Returns QR code data for user to scan with authenticator app
 * Uses backend Edge Function instead of Supabase MFA
 */
export const enrollTOTP = async (): Promise<{
  success: boolean;
  data?: TOTPEnrollResponse;
  error?: string;
}> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Check if TOTP is already enabled
    const isEnabled = await checkTOTPEnabledService(user.id);
    if (isEnabled) {
      return { success: false, error: 'TOTP is already enabled for this account' };
    }

    // Generate TOTP secret using backend Edge Function
    const { generateTOTPSecret } = await import('./totpService');
    const totpData = await generateTOTPSecret(user.id);

    // Convert to expected format
    return {
      success: true,
      data: {
        id: user.id, // Use user ID as factor ID
        qr_code: '', // QR code will be generated from qr_data
        secret: totpData.secret,
        uri: totpData.qr_data, // otpauth:// URL
      },
    };
  } catch (error: any) {
    error('[TOTP] Exception enrolling TOTP:', error);
    return { success: false, error: error.message || 'Failed to enroll TOTP' };
  }
};

/**
 * Verify and activate TOTP factor
 * Call this after user scans QR code and enters the code from their authenticator app
 * Uses backend Edge Function instead of Supabase MFA
 */
export const verifyTOTPEnrollment = async (
  factorId: string, // This is actually userId
  code: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { enableTOTP } = await import('./totpService');
    const result = await enableTOTP(factorId, code);

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to enable TOTP' };
    }

    return { success: true };
  } catch (error: any) {
    error('[TOTP] Exception verifying TOTP enrollment:', error);
    return { success: false, error: error.message || 'Failed to verify TOTP' };
  }
};

/**
 * Challenge TOTP for sign-in
 * Not needed with backend Edge Function - verification happens directly
 */
export const challengeTOTP = async (factorId: string): Promise<{
  success: boolean;
  challengeId?: string;
  error?: string;
}> => {
  // No challenge needed - return success with userId as challengeId
  return {
    success: true,
    challengeId: factorId, // Use userId as challengeId
  };
};

/**
 * Verify TOTP code during sign-in
 * Uses backend Edge Function instead of Supabase MFA
 */
export const verifyTOTPChallenge = async (
  challengeId: string, // This is actually userId
  code: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const result = await verifyTOTPCode(challengeId, code);

    if (!result.valid) {
      return { success: false, error: 'Invalid verification code' };
    }

    return { success: true };
  } catch (error: any) {
    error('[TOTP] Exception verifying TOTP challenge:', error);
    return { success: false, error: error.message || 'Invalid verification code' };
  }
};

/**
 * Unenroll (disable) TOTP factor
 * Uses backend RPC function instead of Supabase MFA
 */
export const unenrollTOTP = async (factorId: string): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { disableTOTP } = await import('./totpService');
    const success = await disableTOTP(user.id);

    if (!success) {
      return { success: false, error: 'Failed to disable TOTP' };
    }

    return { success: true };
  } catch (error: any) {
    error('[TOTP] Exception unenrolling TOTP:', error);
    return { success: false, error: error.message || 'Failed to disable TOTP' };
  }
};

/**
 * Check if current session requires MFA verification
 * Uses profiles table instead of Supabase MFA
 */
export const requiresMFAVerification = async (): Promise<{
  requiresMFA: boolean;
  factors?: MFAFactor[];
  error?: string;
}> => {
  try {
    const { data: { session, user } } = await supabase.auth.getSession();
    
    if (!session || !user) {
      return { requiresMFA: false };
    }

    // Check if TOTP is enabled in profiles table
    const isEnabled = await checkTOTPEnabledService(user.id);

    if (isEnabled) {
      return {
        requiresMFA: true,
        factors: [{
          id: user.id,
          type: 'totp',
          friendly_name: 'Authenticator App',
          status: 'verified',
        }],
      };
    }

    return { requiresMFA: false };
  } catch (error: any) {
    error('[TOTP] Error checking MFA requirement:', error);
    return { requiresMFA: false };
  }
};
