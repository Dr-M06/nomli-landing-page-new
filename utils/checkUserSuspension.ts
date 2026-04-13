/**
 * Check if a user is suspended and get suspension details
 */

import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface SuspensionInfo {
  isSuspended: boolean;
  suspendedAt?: string;
  suspendedBy?: string;
  suspensionReason?: string;
}

/**
 * Check if a user is suspended
 */
export const checkUserSuspension = async (userId: string): Promise<SuspensionInfo> => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_suspended, suspended_at, suspended_by, suspension_reason')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      error('[CheckUserSuspension] Error checking suspension:', error);
      // If column doesn't exist, assume not suspended
      if (error.code === 'PGRST204' || error.message?.includes('column')) {
        return { isSuspended: false };
      }
      return { isSuspended: false };
    }

    if (!profile) {
      return { isSuspended: false };
    }

    return {
      isSuspended: profile.is_suspended === true,
      suspendedAt: profile.suspended_at || undefined,
      suspendedBy: profile.suspended_by || undefined,
      suspensionReason: profile.suspension_reason || undefined,
    };
  } catch (error: any) {
    error('[CheckUserSuspension] Exception checking suspension:', error);
    return { isSuspended: false };
  }
};

/**
 * Get list of possible suspension reasons for display
 */
export const getSuspensionReasons = (): string[] => {
  return [
    'Violation of community guidelines',
    'Inappropriate content or behavior',
    'Harassment or bullying',
    'Spam or fraudulent activity',
    'Sharing prohibited content',
    'Impersonation or fake account',
    'Terms of Service violation',
    'Security concerns',
    'Reported by multiple users',
    'Other policy violations',
  ];
};

