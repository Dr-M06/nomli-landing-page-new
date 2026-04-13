import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * TOTP Service - Connects to Backend Edge Function
 * Uses the same verify-totp Edge Function as the web app
 */

export interface TOTPGenerateResponse {
  secret: string;
  backup_codes: string[];
  qr_data: string; // otpauth:// URL for QR code
}

export interface TOTPVerifyResponse {
  valid: boolean;
  isBackupCode: boolean;
}

export interface TOTPEnableResponse {
  success: boolean;
  error: string | null;
}

/**
 * Generate TOTP secret and QR code data
 * This calls the backend Edge Function - same as web app
 */
export const generateTOTPSecret = async (userId: string): Promise<TOTPGenerateResponse> => {
  try {
    const { data, error } = await supabase.functions.invoke('verify-totp', {
      body: {
        action: 'generate',
        userId: userId,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to generate TOTP secret');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.data) {
      throw new Error('No data returned from TOTP generation');
    }

    return data.data;
  } catch (err: any) {
    error('[TOTP] Generate error:', err);
    throw new Error(err.message || 'Failed to generate TOTP secret');
  }
};

/**
 * Verify a TOTP code
 * This calls the backend Edge Function - same as web app
 */
export const verifyTOTPCode = async (
  userId: string,
  code: string
): Promise<TOTPVerifyResponse> => {
  try {
    if (!code || code.length !== 6) {
      throw new Error('Code must be 6 digits');
    }

    const { data, error } = await supabase.functions.invoke('verify-totp', {
      body: {
        action: 'verify',
        userId: userId,
        code: code,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to verify TOTP code');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      valid: data?.valid === true,
      isBackupCode: data?.isBackupCode === true,
    };
  } catch (err: any) {
    error('[TOTP] Verify error:', err);
    throw new Error(err.message || 'Failed to verify TOTP code');
  }
};

/**
 * Enable TOTP after verification
 * This calls the backend Edge Function - same as web app
 */
export const enableTOTP = async (
  userId: string,
  verificationCode: string
): Promise<TOTPEnableResponse> => {
  try {
    if (!verificationCode || verificationCode.length !== 6) {
      throw new Error('Verification code must be 6 digits');
    }

    const { data, error } = await supabase.functions.invoke('verify-totp', {
      body: {
        action: 'enable',
        userId: userId,
        code: verificationCode,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to enable TOTP');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      success: data?.success === true,
      error: data?.error || null,
    };
  } catch (err: any) {
    error('[TOTP] Enable error:', err);
    return {
      success: false,
      error: err.message || 'Failed to enable TOTP',
    };
  }
};

/**
 * Check if TOTP is enabled for a user
 */
export const checkTOTPEnabled = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('totp_enabled, totp_secret')
      .eq('id', userId)
      .single();

    if (error) {
      error('[TOTP] Check enabled error:', error);
      return false;
    }

    // TOTP is enabled only if both totp_enabled is true AND totp_secret exists
    return data?.totp_enabled === true && !!data?.totp_secret;
  } catch (err: any) {
    error('[TOTP] Check enabled exception:', err);
    return false;
  }
};

/**
 * Disable TOTP for a user
 */
export const disableTOTP = async (userId: string): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('disable_user_totp', {
      p_user_id: userId,
    });

    if (error) {
      error('[TOTP] Disable error:', error);
      return false;
    }

    return true;
  } catch (err: any) {
    error('[TOTP] Disable exception:', err);
    return false;
  }
};
