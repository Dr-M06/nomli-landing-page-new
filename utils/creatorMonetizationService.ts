import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { createStripeCheckout, getUserSubscriptions, type PaymentPlan } from './stripeService';
import { error as logError, warn as logWarn } from './productionLogger';

export type CreatorBreakdownRow = { label: string; points: number };

export type CreatorTopPostRow = {
  post_id: string;
  title_snippet: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  est_usd: number;
};

export type CreatorPayoutRow = {
  period_label: string;
  sublabel: string;
  amount_usd: number;
  status: string;
  paid_at: string | null;
};

export type CreatorGiftRow = {
  amount: number;
  description: string | null;
  created_at: string;
};

export type CreatorMonetizationSnapshot = {
  creator_pro_active: boolean;
  creator_pro_until: string | null;
  /** Ledger-backed founding credit (default $1). */
  founding_credit_amount_usd: number;
  founding_credit_state: 'awaiting_pro' | 'vesting' | 'credited' | 'ineligible' | string;
  founding_credit_vest_at: string | null;
  /** Extra USD to show on Go Pro paywall while awaiting_pro (0 if ineligible / already past paywall). */
  founding_credit_paywall_usd: number;
  token_usd_rate: number;
  engagement_score_month: number;
  engagement_score_last_month: number;
  estimated_content_usd_month: number;
  estimated_content_usd_last_month: number;
  views_month: number;
  likes_month: number;
  comments_month: number;
  views_last_month: number;
  likes_last_month: number;
  comments_last_month: number;
  gift_tokens_all_time: number;
  gift_tokens_this_month: number;
  gift_tokens_last_month: number;
  estimated_gift_usd_month: number;
  estimated_gift_usd_last_month: number;
  wallet_token_balance: number;
  wallet_earned_token_balance: number;
  total_paid_out_usd: number;
  next_payout_label: string;
  top_posts: CreatorTopPostRow[];
  recent_gifts: CreatorGiftRow[];
  payouts: CreatorPayoutRow[];
  breakdown_month: CreatorBreakdownRow[];
};

const CREATOR_PRO_CACHE_KEY = 'creator_pro_until_cache_v1';

type CreatorProCacheRecord = {
  userId: string;
  creatorProUntil: string;
  cachedAt: number;
};

async function readCachedCreatorProUntil(userId: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(CREATOR_PRO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreatorProCacheRecord>;
    if (!parsed || parsed.userId !== userId || typeof parsed.creatorProUntil !== 'string') return null;
    return parsed.creatorProUntil;
  } catch {
    return null;
  }
}

async function writeCachedCreatorProUntil(userId: string, creatorProUntil: string): Promise<void> {
  try {
    const payload: CreatorProCacheRecord = {
      userId,
      creatorProUntil,
      cachedAt: Date.now(),
    };
    await AsyncStorage.setItem(CREATOR_PRO_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Non-critical cache write.
  }
}

async function clearCachedCreatorProUntil(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CREATOR_PRO_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<CreatorProCacheRecord>;
    if (parsed?.userId === userId) {
      await AsyncStorage.removeItem(CREATOR_PRO_CACHE_KEY);
    }
  } catch {
    // Non-critical cache cleanup.
  }
}

function parseSnapshot(raw: unknown): CreatorMonetizationSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && !Number.isNaN(v) ? v : d);
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  const boolish = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const vestAt = (v: unknown): string | null => {
    if (v == null || v === 'null') return null;
    if (typeof v === 'string') return v;
    return null;
  };

  const creatorProUntil = str(o.creator_pro_until);
  const untilMs = creatorProUntil ? new Date(creatorProUntil).getTime() : NaN;
  const untilActive = !Number.isNaN(untilMs) && untilMs > Date.now();

  return {
    // Coerce JSON/PostgREST oddities; fall back to subscription end date so Pro unlocks reliably.
    creator_pro_active: boolish(o.creator_pro_active) || untilActive,
    creator_pro_until: creatorProUntil,
    founding_credit_amount_usd: num(o.founding_credit_amount_usd, 1),
    founding_credit_state:
      typeof o.founding_credit_state === 'string' ? o.founding_credit_state : 'awaiting_pro',
    founding_credit_vest_at: vestAt(o.founding_credit_vest_at),
    founding_credit_paywall_usd: num(o.founding_credit_paywall_usd, 1),
    token_usd_rate: num(o.token_usd_rate, 0.01),
    engagement_score_month: num(o.engagement_score_month),
    engagement_score_last_month: num(o.engagement_score_last_month),
    estimated_content_usd_month: num(o.estimated_content_usd_month),
    estimated_content_usd_last_month: num(o.estimated_content_usd_last_month),
    views_month: Math.round(num(o.views_month)),
    likes_month: Math.round(num(o.likes_month)),
    comments_month: Math.round(num(o.comments_month)),
    views_last_month: Math.round(num(o.views_last_month)),
    likes_last_month: Math.round(num(o.likes_last_month)),
    comments_last_month: Math.round(num(o.comments_last_month)),
    gift_tokens_all_time: Math.round(num(o.gift_tokens_all_time)),
    gift_tokens_this_month: Math.round(num(o.gift_tokens_this_month)),
    gift_tokens_last_month: Math.round(num(o.gift_tokens_last_month)),
    estimated_gift_usd_month: num(o.estimated_gift_usd_month),
    estimated_gift_usd_last_month: num(o.estimated_gift_usd_last_month),
    wallet_token_balance: Math.round(num(o.wallet_token_balance)),
    wallet_earned_token_balance: Math.round(num(o.wallet_earned_token_balance)),
    total_paid_out_usd: num(o.total_paid_out_usd),
    next_payout_label: typeof o.next_payout_label === 'string' ? o.next_payout_label : '—',
    top_posts: arr<CreatorTopPostRow>(o.top_posts).map((p) => ({
      post_id: String((p as any).post_id ?? ''),
      title_snippet: (p as any).title_snippet ?? '',
      views_count: num((p as any).views_count),
      likes_count: num((p as any).likes_count),
      comments_count: num((p as any).comments_count),
      est_usd: num((p as any).est_usd),
    })),
    recent_gifts: arr<CreatorGiftRow>(o.recent_gifts).map((g) => ({
      amount: Math.round(num((g as any).amount)),
      description: (g as any).description ?? null,
      created_at: String((g as any).created_at ?? ''),
    })),
    payouts: arr<CreatorPayoutRow>(o.payouts).map((p) => ({
      period_label: String((p as any).period_label ?? ''),
      sublabel: String((p as any).sublabel ?? ''),
      amount_usd: num((p as any).amount_usd),
      status: String((p as any).status ?? 'paid'),
      paid_at: str((p as any).paid_at),
    })),
    breakdown_month: arr<CreatorBreakdownRow>(o.breakdown_month).map((b) => ({
      label: String((b as any).label ?? ''),
      points: num((b as any).points),
    })),
  };
}

/** When the snapshot RPC fails or returns null, still represent active Pro from `profiles.creator_pro_until`. */
function emptyCreatorSnapshotWithPro(creatorProUntil: string): CreatorMonetizationSnapshot {
  return {
    creator_pro_active: true,
    creator_pro_until: creatorProUntil,
    founding_credit_amount_usd: 1,
    founding_credit_state: 'awaiting_pro',
    founding_credit_vest_at: null,
    founding_credit_paywall_usd: 1,
    token_usd_rate: 0.01,
    engagement_score_month: 0,
    engagement_score_last_month: 0,
    estimated_content_usd_month: 0,
    estimated_content_usd_last_month: 0,
    views_month: 0,
    likes_month: 0,
    comments_month: 0,
    views_last_month: 0,
    likes_last_month: 0,
    comments_last_month: 0,
    gift_tokens_all_time: 0,
    gift_tokens_this_month: 0,
    gift_tokens_last_month: 0,
    estimated_gift_usd_month: 0,
    estimated_gift_usd_last_month: 0,
    wallet_token_balance: 0,
    wallet_earned_token_balance: 0,
    total_paid_out_usd: 0,
    next_payout_label: '—',
    top_posts: [],
    recent_gifts: [],
    payouts: [],
    breakdown_month: [],
  };
}

const CREATOR_PLAN_MATCHERS = ['creator', 'pro'];

function isCreatorPlanFromSubscription(subscription: any): boolean {
  const plan = subscription?.payment_plans;
  const category = String(plan?.plan_category || '').toLowerCase().trim();
  if (category === 'creator') return true;
  const haystack = `${plan?.name || ''} ${plan?.description || ''} ${plan?.iap_product_id_apple || ''} ${plan?.iap_product_id_google || ''}`
    .toLowerCase()
    .trim();
  return CREATOR_PLAN_MATCHERS.some((token) => haystack.includes(token));
}

function subscriptionPeriodEndMs(subscription: any): number {
  const raw =
    subscription?.current_period_end ??
    subscription?.expires_at ??
    subscription?.period_end ??
    subscription?.ends_at;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

async function fallbackCreatorProUntilFromSubscriptions(userId: string): Promise<string | null> {
  const subs = await getUserSubscriptions(userId);
  const now = Date.now();
  let bestMs = 0;
  for (const sub of subs) {
    if (!isCreatorPlanFromSubscription(sub)) continue;
    const endMs = subscriptionPeriodEndMs(sub);
    if (endMs > now) bestMs = Math.max(bestMs, endMs);
  }
  if (bestMs <= now) return null;
  return new Date(bestMs).toISOString();
}

export async function fetchCreatorMonetizationSnapshot(): Promise<CreatorMonetizationSnapshot | null> {
  try {
    const { data, error } = await supabase.rpc('get_creator_monetization_snapshot');
    if (error) {
      logError('[CreatorMonetization] snapshot RPC error:', error);
      return null;
    }
    const parsed = parseSnapshot(data);
    if (parsed?.creator_pro_until) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        await writeCachedCreatorProUntil(user.id, parsed.creator_pro_until);
      }
    }
    return parsed;
  } catch (e) {
    logError('[CreatorMonetization] snapshot exception:', e);
    return null;
  }
}

export function isCreatorProActive(until: string | null | undefined): boolean {
  if (!until) return false;
  const t = new Date(until).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

export async function fetchProfileCreatorProUntil(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('creator_pro_until')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data) {
      const cachedUntil = await readCachedCreatorProUntil(user.id);
      if (isCreatorProActive(cachedUntil)) return cachedUntil;
      const fallbackUntil = await fallbackCreatorProUntilFromSubscriptions(user.id);
      if (isCreatorProActive(fallbackUntil)) {
        await writeCachedCreatorProUntil(user.id, fallbackUntil!);
        return fallbackUntil;
      }
      return null;
    }

    const until = data.creator_pro_until ?? null;
    if (until) {
      await writeCachedCreatorProUntil(user.id, until);
      return until;
    }

    // Avoid dropping active Pro during transient backend lag right after login/sync.
    // If we already have an active cached expiry for this same user, keep using it.
    const cachedUntil = await readCachedCreatorProUntil(user.id);
    if (isCreatorProActive(cachedUntil)) {
      return cachedUntil;
    }

    // Last fallback: user_subscriptions can still be correct while profile window is lagging.
    const fallbackUntil = await fallbackCreatorProUntilFromSubscriptions(user.id);
    if (isCreatorProActive(fallbackUntil)) {
      await writeCachedCreatorProUntil(user.id, fallbackUntil!);
      return fallbackUntil;
    }

    // No active backend value and no active cached value -> clear stale cache.
    await clearCachedCreatorProUntil(user.id);
    return null;
  } catch {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return null;
      const cachedUntil = await readCachedCreatorProUntil(user.id);
      if (isCreatorProActive(cachedUntil)) return cachedUntil;
    } catch {
      // Ignore nested fallback failures.
    }
    return null;
  }
}

/**
 * Use the latest of RPC snapshot vs profiles row — Play/Apple verification updates `profiles` first;
 * `get_creator_monetization_snapshot` can lag briefly after purchase.
 */
export function mergeCreatorSnapshotWithProfile(
  s: CreatorMonetizationSnapshot | null,
  profileUntil: string | null
): CreatorMonetizationSnapshot | null {
  if (!profileUntil) return s;

  const msProf = new Date(profileUntil).getTime();
  if (Number.isNaN(msProf)) return s;

  if (!s) {
    return isCreatorProActive(profileUntil) ? emptyCreatorSnapshotWithPro(profileUntil) : null;
  }

  const msSnap = s.creator_pro_until ? new Date(s.creator_pro_until).getTime() : 0;
  const best = Math.max(msSnap, msProf);
  const bestIso = new Date(best).toISOString();
  return {
    ...s,
    creator_pro_until: bestIso,
    creator_pro_active: s.creator_pro_active || isCreatorProActive(bestIso),
  };
}

/** True if Creator Pro should unlock in UI (snapshot RPC and/or profiles row). */
export function hasCreatorProAccess(
  snapshot: CreatorMonetizationSnapshot | null,
  profileUntilDirect: string | null
): boolean {
  if (isCreatorProActive(profileUntilDirect)) return true;
  if (!snapshot) return false;
  return snapshot.creator_pro_active || isCreatorProActive(snapshot.creator_pro_until);
}

type FetchPlansResult = { plans: PaymentPlan[]; error: string | null };

/**
 * Loads Creator Pro rows from Supabase. Stores (App Store / Play) only work if these rows exist
 * and include the correct `iap_product_id_*` for the current platform.
 */
async function fetchCreatorRecurringPlans(): Promise<FetchPlansResult> {
  const { data, error } = await supabase
    .from('payment_plans')
    .select('*')
    .eq('is_active', true)
    .eq('plan_type', 'recurring')
    // Case-insensitive: avoids "Creator" vs "creator" mismatches in the table
    .ilike('plan_category', 'creator')
    .order('display_order', { ascending: true });

  if (error) {
    logError('[CreatorMonetization] payment_plans query failed:', error);
    return { plans: [], error: error.message };
  }
  if (!data?.length) {
    logWarn(
      '[CreatorMonetization] No creator payment_plans visible to this app. (1) Confirm rows: is_active, plan_type=recurring, plan_category=creator, IAP ids set. (2) If rows show in Supabase Table Editor but not here, add SELECT RLS for authenticated/anon — see supabase/seed_creator_pro_payment_plans.sql section "RLS". (3) Restart Metro with --clear if logs still mention old "No rows:" text.',
    );
    return { plans: [], error: null };
  }
  return { plans: data as PaymentPlan[], error: null };
}

/** Infer tier from IAP ids / name (e.g. *.monthly vs *.yearly). */
function billingPeriodFromPlan(plan: PaymentPlan): 'monthly' | 'yearly' | 'unknown' {
  const hay = `${plan.iap_product_id_apple || ''} ${plan.iap_product_id_google || ''} ${plan.name || ''}`.toLowerCase();
  if (hay.includes('yearly') || hay.includes('annual')) return 'yearly';
  if (hay.includes('monthly')) return 'monthly';
  return 'unknown';
}

function plansEligibleForCurrentPlatform(plans: PaymentPlan[]): PaymentPlan[] {
  if (Platform.OS === 'ios') {
    return plans.filter((p) => !!p.iap_product_id_apple?.trim());
  }
  if (Platform.OS === 'android') {
    return plans.filter((p) => !!p.iap_product_id_google?.trim());
  }
  return plans.filter((p) => !!p.stripe_price_id_usd || !!p.stripe_price_id_ngn);
}

/**
 * Picks monthly vs yearly SKU from plans that already passed platform eligibility (IAP ids present).
 */
function pickEligibleCreatorPlan(eligible: PaymentPlan[], period: 'monthly' | 'yearly'): PaymentPlan | null {
  if (!eligible.length) return null;

  if (period === 'yearly') {
    return eligible.find((p) => billingPeriodFromPlan(p) === 'yearly') ?? null;
  }

  const monthly = eligible.find((p) => billingPeriodFromPlan(p) === 'monthly');
  if (monthly) return monthly;
  const unknown = eligible.filter((p) => billingPeriodFromPlan(p) === 'unknown');
  if (unknown.length) return unknown[0];
  return eligible[0];
}

/**
 * Creator Pro plan for checkout: `monthly` vs `yearly` (separate `payment_plans` rows per SKU).
 */
export async function getCreatorProPlanForCheckout(
  period: 'monthly' | 'yearly'
): Promise<PaymentPlan | null> {
  const { plans } = await fetchCreatorRecurringPlans();
  const eligible = plansEligibleForCurrentPlatform(plans);
  return pickEligibleCreatorPlan(eligible, period);
}

/** Default Creator Pro row for UI (monthly price, primary CTA). */
export async function getActiveCreatorProPlan(): Promise<PaymentPlan | null> {
  return getCreatorProPlanForCheckout('monthly');
}

export async function getCreatorProAnnualPlan(): Promise<PaymentPlan | null> {
  return getCreatorProPlanForCheckout('yearly');
}

export function tokensToUsd(tokens: number, rate: number): number {
  return Math.round(tokens * rate * 10000) / 10000;
}

/**
 * Nominal USD value of gift tokens credited to the wallet (face rate) → amount the creator can withdraw
 * after Nomli’s share. Matches creator dashboard / withdrawal copy (“You keep 70%”).
 */
export const CREATOR_GIFT_PAYOUT_SHARE = 0.7;

export function giftNominalUsdToCreatorPayoutUsd(nominalUsd: number): number {
  if (!Number.isFinite(nominalUsd) || nominalUsd <= 0) return 0;
  return Math.round(nominalUsd * CREATOR_GIFT_PAYOUT_SHARE * 10000) / 10000;
}

/**
 * iOS / Android: in-app subscription (Apple / Google). Web: hosted checkout session.
 * @param period `monthly` | `yearly` — must match a `payment_plans` row with the right IAP / web price ids.
 */
export async function startCreatorProCheckout(
  period: 'monthly' | 'yearly' = 'monthly'
): Promise<{ ok: boolean; error?: string }> {
  const { plans, error: fetchError } = await fetchCreatorRecurringPlans();

  if (fetchError) {
    return {
      ok: false,
      error: `Could not load subscription plans (${fetchError}). If products work in App Store Connect but not here, check Supabase RLS: authenticated users need SELECT on payment_plans.`,
    };
  }

  const eligible = plansEligibleForCurrentPlatform(plans);

  if (!plans.length) {
    return {
      ok: false,
      error:
        'No Creator Pro row in Supabase. Add payment_plans: is_active=true, plan_type=recurring, plan_category=creator, plus iap_product_id_apple / iap_product_id_google.',
    };
  }

  if (!eligible.length) {
    const col =
      Platform.OS === 'ios'
        ? 'iap_product_id_apple'
        : Platform.OS === 'android'
          ? 'iap_product_id_google'
          : 'stripe_price_id_usd or stripe_price_id_ngn';
    return {
      ok: false,
      error: `Creator Pro rows exist but none have ${col} set (non-empty) for this device. App Store / Play being “ready” does not fill Supabase—you must copy the product IDs into payment_plans.`,
    };
  }

  const plan = pickEligibleCreatorPlan(eligible, period);

  if (!plan?.id) {
    if (period === 'yearly') {
      return {
        ok: false,
        error:
          'No yearly Creator Pro SKU in payment_plans. Add a row with yearly/annual in the IAP product id or plan name, or a separate yearly subscription row.',
      };
    }
    return {
      ok: false,
      error:
        'No monthly Creator Pro SKU matched. Ensure one row has “monthly” in the Apple/Google product id or plan name, or a single row with unknown period for the default CTA.',
    };
  }

  if (Platform.OS === 'ios') {
    if (!plan.iap_product_id_apple) {
      return { ok: false, error: 'Add iap_product_id_apple on your Creator Pro payment_plans row.' };
    }
    const { isRevenueCatEnabled, purchaseCreatorProWithRevenueCat } = await import('./revenueCatService');
    if (isRevenueCatEnabled()) {
      return purchaseCreatorProWithRevenueCat(plan.iap_product_id_apple);
    }
    const { initializeStoreKit, purchaseCreatorProWithStoreKit } = await import('./storeKitService');
    await initializeStoreKit();
    return purchaseCreatorProWithStoreKit(plan.iap_product_id_apple);
  }

  if (Platform.OS === 'android') {
    if (!plan.iap_product_id_google) {
      return { ok: false, error: 'Add iap_product_id_google on your Creator Pro payment_plans row.' };
    }
    const { isRevenueCatEnabled, purchaseCreatorProWithRevenueCat } = await import('./revenueCatService');
    if (isRevenueCatEnabled()) {
      return purchaseCreatorProWithRevenueCat(plan.iap_product_id_google);
    }
    const { purchaseCreatorProWithGooglePlay } = await import('./googlePlayBillingService');
    const r = await purchaseCreatorProWithGooglePlay(plan.iap_product_id_google);
    return { ok: r.ok, error: r.error };
  }

  const currency = plan.currency === 'NGN' ? 'NGN' : 'USD';
  const priceId = currency === 'NGN' ? plan.stripe_price_id_ngn : plan.stripe_price_id_usd;
  if (!priceId) {
    return { ok: false, error: 'Web checkout is not configured for this plan yet.' };
  }

  const res = await createStripeCheckout(plan.id, currency);
  if (!res.success || !res.checkoutUrl) {
    return { ok: false, error: res.error || 'Could not start checkout.' };
  }
  const can = await Linking.canOpenURL(res.checkoutUrl);
  if (!can) {
    return { ok: false, error: 'Cannot open checkout URL on this device.' };
  }
  await Linking.openURL(res.checkoutUrl);
  return { ok: true };
}
