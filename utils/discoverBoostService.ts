/**
 * Discover Profile Booster – place your profile at the top of others' discover feed for a duration.
 * Options: 6h or 12h (token spend). Uses purchased tokens only.
 */

import { supabase } from './supabase';
import Constants from 'expo-constants';
import { log, error } from './productionLogger';
import { clearWalletCache, notifyWalletChanged } from './walletService';

export const BOOST_TOKENS_6H = 10;
export const BOOST_TOKENS_12H = 18;

export type BoostOption = '6h' | '12h';

export interface BoostStatus {
  boosted: boolean;
  boostedUntil: string | null;
}

/**
 * Check if the current user's profile is currently boosted (discover_boosted_until > now).
 */
export async function getBoostStatus(userId: string): Promise<BoostStatus> {
  try {
    const { data: profile, error: err } = await supabase
      .from('profiles')
      .select('discover_boosted_until')
      .eq('id', userId)
      .maybeSingle();

    if (err || !profile?.discover_boosted_until) {
      return { boosted: false, boostedUntil: null };
    }

    const until = profile.discover_boosted_until;
    const now = new Date().toISOString();
    if (until > now) {
      return { boosted: true, boostedUntil: until };
    }
    return { boosted: false, boostedUntil: null };
  } catch (e) {
    error('[discoverBoost] getBoostStatus exception:', e);
    return { boosted: false, boostedUntil: null };
  }
}

/**
 * Spend tokens to boost profile (6h or 12h). Calls Edge Function.
 */
export async function purchaseBoost(option: BoostOption): Promise<{
  success: boolean;
  error?: string;
  required?: number;
  newBalance?: number;
  boostedUntil?: string | null;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: 'Not signed in' };
    }

    const url = Constants.expoConfig?.extra?.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const fnUrl = `${url.replace(/\/$/, '')}/functions/v1/discover-boost`;

    const response = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ option }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = result.details || result.error || 'Failed to activate boost';
      return {
        success: false,
        error: message,
        required: result.required,
      };
    }

    if (!result.success) {
      const message = result.details || result.error || 'Failed to activate boost';
      return {
        success: false,
        error: message,
        required: result.required,
      };
    }

    log('[discoverBoost] Boost purchased:', option, result.boostedUntil);
    await clearWalletCache();
    notifyWalletChanged();
    return {
      success: true,
      newBalance: result.newBalance,
      boostedUntil: result.boostedUntil ?? null,
    };
  } catch (e) {
    error('[discoverBoost] purchaseBoost exception:', e);
    return { success: false, error: 'Something went wrong' };
  }
}
