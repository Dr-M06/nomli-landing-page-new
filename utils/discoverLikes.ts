import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/** Minimal profile shape for Discover "who liked you" list (matches NearbyProfile) */
export interface DiscoverProfileRow {
  id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  country?: string;
  age?: number;
  interests?: string[];
  profile_visible?: boolean;
  is_verified?: boolean;
  is_placeholder?: boolean;
  gender?: string;
  show_me?: string;
  is_suspended?: boolean;
  estimated_latitude?: number;
  estimated_longitude?: number;
  latitude?: number;
  longitude?: number;
  last_location_update?: string;
}

/**
 * Fetch profiles by IDs (for "Who liked you" so we show them even if not in current discover feed).
 */
export async function getProfilesByIds(userIds: string[]): Promise<DiscoverProfileRow[]> {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, bio, country, interests, profile_visible, age, is_placeholder, gender, show_me, is_suspended, is_verified, estimated_latitude, estimated_longitude, latitude, longitude, last_location_update, vibe_mode')
    .in('id', userIds)
    .or('is_suspended.is.null,is_suspended.eq.false');
  if (error) {
    warn('[discoverLikes] getProfilesByIds error:', error);
    return [];
  }
  return (data || []) as DiscoverProfileRow[];
}

export type LikeProfileResult = { success: true } | { success: false; limitReached?: boolean };

/**
 * Like a profile in Discover. Idempotent (same like twice = one row).
 * Returns limitReached: true when server rejected due to daily like limit.
 */
export async function likeProfile(likerId: string, targetId: string): Promise<LikeProfileResult> {
  if (likerId === targetId) return { success: false };
  const { error } = await supabase
    .from('discover_likes')
    .insert({ liker_id: likerId, target_id: targetId });

  if (error) {
    if ((error as any)?.code === '23505') return { success: true }; // duplicate = idempotent
    const msg = String((error as any)?.message ?? '');
    const hint = String((error as any)?.hint ?? '');
    const limitReached = msg.includes('DAILY_LIKES_LIMIT') || hint.includes('sparks') || (msg.toLowerCase().includes('daily') && msg.toLowerCase().includes('limit'));
    if (limitReached) return { success: false, limitReached: true };
    warn('[discoverLikes] likeProfile error:', error);
    return { success: false };
  }

  return { success: true };
}

/**
 * Remove a like (unlike).
 */
export async function unlikeProfile(likerId: string, targetId: string): Promise<boolean> {
  const { error } = await supabase
    .from('discover_likes')
    .delete()
    .eq('liker_id', likerId)
    .eq('target_id', targetId);
  if (error) {
    warn('[discoverLikes] unlikeProfile error:', error);
    return false;
  }
  return true;
}

/**
 * Get set of profile IDs the current user has liked.
 */
export async function getLikedProfileIds(likerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('discover_likes')
    .select('target_id')
    .eq('liker_id', likerId);
  if (error) {
    warn('[discoverLikes] getLikedProfileIds error:', error);
    return new Set();
  }
  return new Set((data || []).map((r) => r.target_id));
}

/**
 * Get user IDs who liked the current user (for "Who liked you").
 */
export async function getWhoLikedMeIds(myUserId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('discover_likes')
    .select('liker_id')
    .eq('target_id', myUserId)
    .order('created_at', { ascending: false });
  if (error) {
    warn('[discoverLikes] getWhoLikedMeIds error:', error);
    return [];
  }
  return (data || []).map((r) => r.liker_id);
}

/**
 * Pass a profile in Discover (hide from feed on this device and all devices).
 * Idempotent (same pass twice = one row).
 */
export async function passProfile(userId: string, passedId: string): Promise<boolean> {
  if (userId === passedId) return false;
  const { error } = await supabase
    .from('discover_passes')
    .insert({ user_id: userId, passed_id: passedId });

  if (error) {
    if ((error as any)?.code === '23505') return true; // unique violation = already passed
    warn('[discoverLikes] passProfile error:', error);
    return false;
  }
  return true;
}

/**
 * Get set of profile IDs the current user has passed (for hiding on load on any device).
 * Use getRecentPassedProfileIds(userId, 6) to only hide passes from the last 6h (recycling).
 */
export async function getPassedProfileIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('discover_passes')
    .select('passed_id')
    .eq('user_id', userId);
  if (error) {
    warn('[discoverLikes] getPassedProfileIds error:', error);
    return new Set();
  }
  return new Set((data || []).map((r) => r.passed_id));
}

/** Default hours after which a pass is no longer hidden (profiles can reappear). */
export const DISCOVER_PASS_RECYCLE_HOURS = 6;

/**
 * Dynamic recycle tiers: smaller pool → shorter hide window so users don't hit "no more profiles".
 * Matches/blocks are never recycled; only normal passes.
 */
export const RECYCLE_TIERS = {
  /** Pool >= 50: 6h hide */
  LARGE_HOURS: 6,
  /** Pool 20–49: 4h so more reappear sooner */
  MEDIUM_HOURS: 4,
  /** Pool 10–19: 2h to avoid empty feeling */
  SMALL_HOURS: 2,
  /** Pool < 10: 1h (soft immediate recycle) */
  TINY_HOURS: 1,
} as const;

/**
 * Hours to hide passes based on current pool size (before pass filter).
 * Use when refetching "recent passed" so small regions don't feel dead.
 */
export function getRecycleHoursForPoolSize(poolSize: number): number {
  if (poolSize >= 50) return RECYCLE_TIERS.LARGE_HOURS;
  if (poolSize >= 20) return RECYCLE_TIERS.MEDIUM_HOURS;
  if (poolSize >= 10) return RECYCLE_TIERS.SMALL_HOURS;
  return RECYCLE_TIERS.TINY_HOURS;
}

/**
 * Get profile IDs the user has passed within the last N hours.
 * Use this for feed hiding so passed profiles can recycle (Tinder-style).
 * Use getRecycleHoursForPoolSize(poolSize) for dynamic window in small regions.
 * @param withinHours - Only passes from the last N hours; omit for default 6h.
 */
export async function getRecentPassedProfileIds(
  userId: string,
  withinHours: number = DISCOVER_PASS_RECYCLE_HOURS
): Promise<Set<string>> {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('discover_passes')
    .select('passed_id')
    .eq('user_id', userId)
    .gte('created_at', since);
  if (error) {
    warn('[discoverLikes] getRecentPassedProfileIds error:', error);
    return new Set();
  }
  return new Set((data || []).map((r) => r.passed_id));
}
