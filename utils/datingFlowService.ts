import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getDiscoverDailyLikesStatus } from './discoverDailyLikes';
import { getProfilesByIds, getWhoLikedMeIds, likeProfile, passProfile } from './discoverLikes';
import { fetchAllDiscoverProfiles } from './paginatedDataFetch';
import { warn } from './productionLogger';

export type DatingIntent = 'serious' | 'open' | 'vibing';
export type DatingLookingFor = 'male' | 'female' | 'others' | 'everyone';

export type DatingPromptAnswer = {
  prompt: string;
  answer: string;
};

export type DatingProfileSetup = {
  intent: DatingIntent;
  lookingFor?: DatingLookingFor;
  prompts: DatingPromptAnswer[];
  photos: string[];
};

export type DatingCandidate = {
  id: string;
  created_at?: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  age?: number;
  gender?: string;
  country?: string;
  distance?: number;
  interests?: string[];
  dating_intent?: DatingIntent;
  last_seen?: string;
  last_active?: string;
  online_status?: 'online' | 'offline' | 'away' | string;
  is_online_now?: boolean;
  is_verified?: boolean;
  profile_visible?: boolean;
  is_placeholder?: boolean;
};

const LOCAL_SETUP_KEY_PREFIX = 'dating_setup_v2:';
const LOCAL_SETUP_SKIPPED_KEY_PREFIX = 'dating_setup_skipped_v1:';
const LOCAL_SETUP_COMPLETED_KEY_PREFIX = 'dating_setup_completed_v1:';

function setupKey(userId: string) {
  return `${LOCAL_SETUP_KEY_PREFIX}${userId}`;
}

function skippedKey(userId: string) {
  return `${LOCAL_SETUP_SKIPPED_KEY_PREFIX}${userId}`;
}

function completedKey(userId: string) {
  return `${LOCAL_SETUP_COMPLETED_KEY_PREFIX}${userId}`;
}

function normalizeIntent(raw: unknown): DatingIntent | null {
  if (raw === 'serious' || raw === 'open' || raw === 'vibing') return raw;
  return null;
}

function normalizeLookingFor(raw: unknown): DatingLookingFor | null {
  if (raw === 'male' || raw === 'female' || raw === 'others' || raw === 'everyone') return raw;
  if (raw === 'non_binary' || raw === 'nonbinary' || raw === 'other') return 'others';
  if (raw === 'anyone' || raw === 'all') return 'everyone';
  return null;
}

function normalizePrompts(raw: unknown): DatingPromptAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const prompt = String((p as any).prompt || '').trim();
      const answer = String((p as any).answer || '').trim();
      if (!prompt || !answer) return null;
      return { prompt, answer };
    })
    .filter((p): p is DatingPromptAnswer => !!p);
}

function normalizePhotos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v || '').trim()).filter(Boolean);
}

function hasRealPhoto(avatarUrl?: string | null): boolean {
  if (!avatarUrl) return false;
  const lowerUrl = avatarUrl.toLowerCase();
  if (lowerUrl.includes('dicebear') || lowerUrl.includes('api.dicebear')) return false;
  const hasImageExtension =
    lowerUrl.includes('.jpg') ||
    lowerUrl.includes('.jpeg') ||
    lowerUrl.includes('.png') ||
    lowerUrl.includes('.webp') ||
    lowerUrl.includes('.gif');
  const isKnownImageStorage =
    lowerUrl.includes('supabase') ||
    lowerUrl.includes('bunny.net') ||
    lowerUrl.includes('bunnycdn.com');
  return hasImageExtension || isKnownImageStorage;
}

function pickCoords(row: any): { lat: number; lng: number } | null {
  const lat = typeof row?.estimated_latitude === 'number' ? row.estimated_latitude : row?.latitude;
  const lng = typeof row?.estimated_longitude === 'number' ? row.estimated_longitude : row?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sa = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
  return R * c;
}

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function isRecentlyActive(iso?: string): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return false;
  // Treat "online now" as a short freshness window to avoid stale green badges.
  return Date.now() - ts <= 2 * 60 * 1000;
}

function deriveIsOnlineNow(row: any): boolean {
  const status = typeof row?.online_status === 'string' ? row.online_status.toLowerCase() : '';
  if (status === 'online') {
    return isRecentlyActive(
      typeof row?.last_active === 'string'
        ? row.last_active
        : typeof row?.last_seen === 'string'
          ? row.last_seen
          : undefined
    );
  }
  return false;
}

export async function getDatingSetup(userId: string): Promise<DatingProfileSetup | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('dating_intent, dating_prompts, dating_photos, interested_in')
      .eq('id', userId)
      .maybeSingle();
    if (!error && data) {
      const intent = normalizeIntent((data as any).dating_intent);
      const lookingFor = normalizeLookingFor((data as any).interested_in);
      const prompts = normalizePrompts((data as any).dating_prompts);
      const photos = normalizePhotos((data as any).dating_photos);
      if (intent && prompts.length >= 2) {
        return { intent, lookingFor: lookingFor ?? undefined, prompts, photos };
      }
    }
  } catch {
    // Fallback to local data
  }

  try {
    const local = await AsyncStorage.getItem(setupKey(userId));
    if (!local) return null;
    const parsed = JSON.parse(local);
    const intent = normalizeIntent(parsed?.intent);
    const lookingFor = normalizeLookingFor(parsed?.lookingFor);
    const prompts = normalizePrompts(parsed?.prompts);
    const photos = normalizePhotos(parsed?.photos);
    if (!intent || prompts.length < 2) return null;
    return { intent, lookingFor: lookingFor ?? undefined, prompts, photos };
  } catch {
    return null;
  }
}

export async function saveDatingSetup(userId: string, setup: DatingProfileSetup): Promise<void> {
  const payload = {
    dating_intent: setup.intent,
    interested_in: setup.lookingFor || null,
    dating_prompts: setup.prompts,
    dating_photos: setup.photos,
  };

  // Always save local for reliability.
  await AsyncStorage.setItem(setupKey(userId), JSON.stringify(setup));
  await AsyncStorage.removeItem(skippedKey(userId));
  await AsyncStorage.setItem(completedKey(userId), '1');

  // Try remote persist; ignore if schema not deployed.
  try {
    await supabase.from('profiles').update(payload).eq('id', userId);
  } catch (e) {
    warn('[datingFlowService] saveDatingSetup remote fallback to local only', e);
  }
}

export async function markDatingSetupSkipped(userId: string): Promise<void> {
  await AsyncStorage.setItem(skippedKey(userId), '1');
}

export async function hasSkippedDatingSetup(userId: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(skippedKey(userId));
  return v === '1';
}

export async function hasCompletedDatingSetup(userId: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(completedKey(userId));
  return v === '1';
}

export async function isDatingSetupComplete(userId: string): Promise<boolean> {
  const setup = await getDatingSetup(userId);
  if (setup) return true;
  return hasCompletedDatingSetup(userId);
}

export async function getWhoLikedCount(userId: string): Promise<number> {
  const ids = await getWhoLikedMeIds(userId);
  return ids.length;
}

export async function getWhoLikedPreview(userId: string, limit = 4): Promise<DatingCandidate[]> {
  const ids = await getWhoLikedMeIds(userId);
  if (!ids.length) return [];
  const rows = await getProfilesByIds(ids.slice(0, limit));
  return (rows as DatingCandidate[]).filter((r) => r.is_placeholder !== true);
}

export async function fetchDatingCandidates(userId: string, limit = 30): Promise<DatingCandidate[]> {
  try {
    // Get current user's latest coordinates for distance calculation.
    const { data: me } = await supabase
      .from('profiles')
      .select('estimated_latitude, estimated_longitude, latitude, longitude')
      .eq('id', userId)
      .maybeSingle();
    const myCoords = pickCoords(me);

    // Reuse old Discover pipeline (pagination + column-fallback + block filtering) for stability.
    const { profiles } = await fetchAllDiscoverProfiles(userId, true, undefined, Math.max(limit * 4, 120));
    const filtered = ((profiles || []) as any[])
      .filter((r) => r?.is_placeholder !== true)
      .filter((r) => (typeof r?.hide_from_discover === 'boolean' ? !r.hide_from_discover : true))
      .filter((r) => (typeof r?.profile_visible === 'boolean' ? r.profile_visible : true))
      .filter((r) => (typeof r?.is_suspended === 'boolean' ? !r.is_suspended : true))
      .filter((r) => (typeof r?.age === 'number' ? r.age >= 18 : true))
      .filter((r) => hasRealPhoto(r?.avatar_url));

    // Shuffle before slicing so pull-to-refresh can surface different profiles.
    return shuffleArray(filtered)
      .slice(0, limit)
      .map((r) => ({
      id: r.id,
      created_at: typeof r.created_at === 'string' ? r.created_at : undefined,
      username: r.username,
      full_name: r.full_name,
      avatar_url: r.avatar_url,
      bio: r.bio,
      age: r.age,
      gender: typeof r.gender === 'string' ? r.gender : undefined,
      country: r.country,
      distance: (() => {
        const targetCoords = pickCoords(r);
        if (!myCoords || !targetCoords) return undefined;
        const km = haversineKm(myCoords, targetCoords);
        return Number.isFinite(km) ? km : undefined;
      })(),
      interests: Array.isArray(r.interests) ? r.interests : [],
      dating_intent: normalizeIntent(r.dating_intent) || undefined,
      last_seen: typeof r.last_seen === 'string' ? r.last_seen : undefined,
      last_active: typeof r.last_active === 'string' ? r.last_active : undefined,
      online_status: typeof r.online_status === 'string' ? r.online_status : undefined,
      is_online_now: deriveIsOnlineNow(r),
      is_verified: r.is_verified,
      profile_visible: r.profile_visible,
      is_placeholder: r.is_placeholder,
    }));
  } catch (e) {
    warn('[datingFlowService] fetchDatingCandidates error', e);
    return [];
  }
}

export type LikeOutcome =
  | { ok: true; matched: false; remaining: number | 'unlimited'; consumedLike: boolean }
  | { ok: true; matched: true; matchUserId: string; remaining: number | 'unlimited'; consumedLike: boolean }
  | { ok: false; reason: 'limit_reached' | 'error' };

export async function likeDatingProfile(userId: string, targetId: string, isSuperLike = false): Promise<LikeOutcome> {
  if (userId === targetId) return { ok: false, reason: 'error' };

  const status = await getDiscoverDailyLikesStatus(userId);
  if (!status.unlimited && status.remaining <= 0) {
    return { ok: false, reason: 'limit_reached' };
  }

  // Idempotency guard before insert: if already liked, don't consume a daily like.
  const { data: existingLike } = await supabase
    .from('discover_likes')
    .select('target_id')
    .eq('liker_id', userId)
    .eq('target_id', targetId)
    .limit(1);
  const alreadyLiked = !!(existingLike && existingLike.length > 0);

  const res = alreadyLiked ? ({ success: true } as const) : await likeProfile(userId, targetId);
  if (!res.success) {
    if (res.limitReached) return { ok: false, reason: 'limit_reached' };
    return { ok: false, reason: 'error' };
  }

  // Mark super-like best effort.
  if (isSuperLike) {
    try {
      await supabase
        .from('discover_likes')
        .update({ is_super: true })
        .eq('liker_id', userId)
        .eq('target_id', targetId);
    } catch {
      // non-blocking
    }
  }

  // Mutual like check.
  try {
    const { data: reciprocal } = await supabase
      .from('discover_likes')
      .select('liker_id')
      .eq('liker_id', targetId)
      .eq('target_id', userId)
      .limit(1);
    const matched = !!(reciprocal && reciprocal.length > 0);
    if (matched) {
      const [a, b] = [userId, targetId].sort();
      // Best effort match row for inbox query.
      await supabase.from('discover_matches').upsert(
        { user_a_id: a, user_b_id: b },
        { onConflict: 'user_a_id,user_b_id', ignoreDuplicates: true }
      );
      const nextRemaining = status.unlimited
        ? 'unlimited'
        : Math.max(0, status.remaining - (alreadyLiked ? 0 : 1));
      return { ok: true, matched: true, matchUserId: targetId, remaining: nextRemaining, consumedLike: !alreadyLiked };
    }
    const nextRemaining = status.unlimited
      ? 'unlimited'
      : Math.max(0, status.remaining - (alreadyLiked ? 0 : 1));
    return { ok: true, matched: false, remaining: nextRemaining, consumedLike: !alreadyLiked };
  } catch {
    const nextRemaining = status.unlimited
      ? 'unlimited'
      : Math.max(0, status.remaining - (alreadyLiked ? 0 : 1));
    return { ok: true, matched: false, remaining: nextRemaining, consumedLike: !alreadyLiked };
  }
}

export async function passDatingProfile(userId: string, targetId: string): Promise<boolean> {
  return passProfile(userId, targetId);
}

export type InboxMatchPreview = {
  id: string;
  userId: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
};

export async function getInboxMatchPreviews(userId: string, limit = 10): Promise<InboxMatchPreview[]> {
  try {
    // Prefer discover_matches table.
    const { data: rows } = await supabase
      .from('discover_matches')
      .select('user_a_id, user_b_id, created_at')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(limit);
    const otherIds =
      (rows || [])
        .map((r: any) => (r.user_a_id === userId ? r.user_b_id : r.user_a_id))
        .filter(Boolean);
    if (otherIds.length > 0) {
      const profiles = await getProfilesByIds(otherIds);
      return profiles.map((p) => ({
        id: p.id,
        userId: p.id,
        username: p.username,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
      }));
    }
  } catch {
    // fallback below
  }

  // Fallback mutual-like inference if discover_matches table is unavailable.
  try {
    const { data: myLikes } = await supabase
      .from('discover_likes')
      .select('target_id')
      .eq('liker_id', userId);
    const targets = (myLikes || []).map((r: any) => r.target_id).filter(Boolean);
    if (!targets.length) return [];
    const { data: reciprocal } = await supabase
      .from('discover_likes')
      .select('liker_id')
      .eq('target_id', userId)
      .in('liker_id', targets)
      .limit(limit);
    const ids = (reciprocal || []).map((r: any) => r.liker_id).filter(Boolean);
    const profiles = await getProfilesByIds(ids);
    return profiles.map((p) => ({
      id: p.id,
      userId: p.id,
      username: p.username,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
    }));
  } catch {
    return [];
  }
}
