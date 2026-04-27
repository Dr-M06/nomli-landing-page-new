/**
 * Discover "Who Liked You" reveal – check status and purchase (token spend).
 */

import { supabase } from './supabase';
import Constants from 'expo-constants';
import { log, warn, error } from './productionLogger';
import { clearWalletCache, notifyWalletChanged } from './walletService';

export const REVEAL_TOKENS_24H = 15;
export const REVEAL_TOKENS_7D = 120;
export const REVEAL_TOKENS_PERMANENT = 500;

export interface RevealStatus {
  revealed: boolean;
  expiresAt: string | null;
  option: '24h' | '7d' | 'permanent' | null;
}

/**
 * Check if the user can see who liked them.
 * Only subscribers (discover_premium_until > now) or users with an active token reveal can see.
 * Free users without a purchased reveal must not see identities.
 */
export async function getRevealStatus(userId: string): Promise<RevealStatus> {
  try {
    const now = new Date().toISOString();

    // 1) Token reveal: has active row in discover_who_liked_reveals
    const { data: rows, error: err } = await supabase
      .from('discover_who_liked_reveals')
      .select('option, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!err && rows?.length) {
      for (const row of rows) {
        if (row.expires_at === null) {
          return { revealed: true, expiresAt: null, option: 'permanent' };
        }
        if (row.expires_at > now) {
          return { revealed: true, expiresAt: row.expires_at, option: (row.option as '24h' | '7d' | 'permanent') || '24h' };
        }
      }
    }

    // 2) Subscriber: discover_premium_until in the future => can see who liked them
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('discover_premium_until')
      .eq('id', userId)
      .maybeSingle();

    if (!profileErr && profile?.discover_premium_until) {
      const until = profile.discover_premium_until;
      if (until > now) {
        return { revealed: true, expiresAt: until, option: null };
      }
    }

    return { revealed: false, expiresAt: null, option: null };
  } catch (e) {
    error('[discoverReveal] getRevealStatus exception:', e);
    return { revealed: false, expiresAt: null, option: null };
  }
}

/**
 * Spend tokens to unlock "Who liked you" (24h, 7 days or 30 days). Calls Edge Function.
 */
export async function purchaseReveal(option: '24h' | '7d' | 'permanent'): Promise<{
  success: boolean;
  error?: string;
  required?: number;
  newBalance?: number;
  expiresAt?: string | null;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: 'Not signed in' };
    }

    const url = Constants.expoConfig?.extra?.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const fnUrl = `${url.replace(/\/$/, '')}/functions/v1/discover-reveal`;

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
      log('[discoverReveal] purchaseReveal non-OK:', response.status, result);
      return {
        success: false,
        error: result.error || 'Failed to unlock',
        required: result.required,
      };
    }

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to unlock',
        required: result.required,
      };
    }

    log('[discoverReveal] Reveal purchased:', option, result.newBalance);
    // Make sure any header balance (WalletButton) refreshes immediately
    await clearWalletCache();
    notifyWalletChanged();
    return {
      success: true,
      newBalance: result.newBalance,
      expiresAt: result.expiresAt ?? null,
    };
  } catch (e) {
    error('[discoverReveal] purchaseReveal exception:', e);
    return { success: false, error: 'Something went wrong' };
  }
}
