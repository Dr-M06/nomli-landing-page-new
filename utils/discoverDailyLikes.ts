/**
 * Discover daily like limits: free = 10/day (reset every 24h), premium = unlimited.
 * Unlimited is tied to active subscriptions (dating/creator), not legacy token reveals.
 */

import { supabase } from './supabase';
import { log, warn } from './productionLogger';
import { hasActiveWindow, readSubscriptionWindowsCache, writeSubscriptionWindowsCache } from './subscriptionCache';

/** Free tier: daily like limit for dating home. */
export const DAILY_LIKES_LIMIT = 10;

/** Start of today UTC (for consistent 24h reset). */
function getTodayStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** End of today UTC (exclusive). */
function getTodayEnd(): string {
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
}

/**
 * Check if user has unlimited discover likes.
 * True if: profiles.discover_premium_until or profiles.creator_pro_until is in the future.
 */
export async function hasUnlimitedDiscoverLikes(userId: string): Promise<boolean> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('discover_premium_until, creator_pro_until')
      .eq('id', userId)
      .maybeSingle();
    if (!profileError) {
      const hasUnlimited =
        hasActiveWindow(profile?.discover_premium_until) || hasActiveWindow(profile?.creator_pro_until);
      if (hasUnlimited) {
        await writeSubscriptionWindowsCache(userId, {
          discoverPremiumUntil: profile?.discover_premium_until ?? null,
          creatorProUntil: profile?.creator_pro_until ?? null,
        }).catch(() => {});
        return true;
      }
    }
    const cached = await readSubscriptionWindowsCache(userId);
    if (cached) {
      return hasActiveWindow(cached.discoverPremiumUntil) || hasActiveWindow(cached.creatorProUntil);
    }
    return false;
  } catch (e) {
    warn('[discoverDailyLikes] hasUnlimitedDiscoverLikes exception:', e);
    const cached = await readSubscriptionWindowsCache(userId);
    if (cached) {
      return hasActiveWindow(cached.discoverPremiumUntil) || hasActiveWindow(cached.creatorProUntil);
    }
    return false;
  }
}

/**
 * Number of discover likes the user has given today (liker_id = userId, created_at in today UTC).
 */
export async function getDiscoverDailyLikesUsed(userId: string): Promise<number> {
  try {
    const start = getTodayStart();
    const end = getTodayEnd();
    const { count, error } = await supabase
      .from('discover_likes')
      .select('*', { count: 'exact', head: true })
      .eq('liker_id', userId)
      .gte('created_at', start)
      .lt('created_at', end);
    if (error) {
      warn('[discoverDailyLikes] getDiscoverDailyLikesUsed error:', error);
      return 0;
    }
    return count ?? 0;
  } catch (e) {
    warn('[discoverDailyLikes] getDiscoverDailyLikesUsed exception:', e);
    return 0;
  }
}

export interface DailyLikesStatus {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
  resetAt: string;
}

/**
 * Get current daily likes status for the user.
 * Premium (discover_premium_until > now): unlimited.
 * Free: used today, limit DAILY_LIKES_LIMIT, remaining = max(0, limit - used).
 */
export async function getDiscoverDailyLikesStatus(userId: string): Promise<DailyLikesStatus> {
  const unlimited = await hasUnlimitedDiscoverLikes(userId);
  if (unlimited) {
    return {
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      unlimited: true,
      resetAt: '',
    };
  }
  const used = await getDiscoverDailyLikesUsed(userId);
  const limit = DAILY_LIKES_LIMIT;
  const remaining = Math.max(0, limit - used);
  const d = new Date();
  const tomorrowStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return {
    used,
    limit,
    remaining,
    unlimited: false,
    resetAt: tomorrowStart.toISOString(),
  };
}

/**
 * Returns true if the user can like one more profile today (under limit or unlimited).
 */
export async function canLikeOneMore(userId: string): Promise<boolean> {
  const status = await getDiscoverDailyLikesStatus(userId);
  return status.remaining > 0 || status.unlimited;
}
