import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { createStripeCheckout, type PaymentPlan } from './stripeService';
import { error as logError } from './productionLogger';

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

function parseSnapshot(raw: unknown): CreatorMonetizationSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && !Number.isNaN(v) ? v : d);
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  return {
    creator_pro_active: o.creator_pro_active === true,
    creator_pro_until: str(o.creator_pro_until),
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

export async function fetchCreatorMonetizationSnapshot(): Promise<CreatorMonetizationSnapshot | null> {
  try {
    const { data, error } = await supabase.rpc('get_creator_monetization_snapshot');
    if (error) {
      logError('[CreatorMonetization] snapshot RPC error:', error);
      return null;
    }
    return parseSnapshot(data);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('creator_pro_until')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data) return null;
    return data.creator_pro_until ?? null;
  } catch {
    return null;
  }
}

async function fetchCreatorRecurringPlans(): Promise<PaymentPlan[]> {
  const { data, error } = await supabase
    .from('payment_plans')
    .select('*')
    .eq('is_active', true)
    .eq('plan_type', 'recurring')
    .eq('plan_category', 'creator')
    .order('display_order', { ascending: true });
  if (error || !data?.length) return [];
  return data as PaymentPlan[];
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
    return plans.filter((p) => !!p.iap_product_id_apple);
  }
  if (Platform.OS === 'android') {
    return plans.filter((p) => !!p.iap_product_id_google);
  }
  return plans.filter((p) => !!p.stripe_price_id_usd || !!p.stripe_price_id_ngn);
}

/**
 * Creator Pro plan for checkout: `monthly` vs `yearly` (separate `payment_plans` rows per SKU).
 */
export async function getCreatorProPlanForCheckout(
  period: 'monthly' | 'yearly'
): Promise<PaymentPlan | null> {
  const plans = await fetchCreatorRecurringPlans();
  const eligible = plansEligibleForCurrentPlatform(plans);
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
 * iOS / Android: in-app subscription (Apple / Google). Web: Stripe Checkout.
 * @param period `monthly` | `yearly` — must match a `payment_plans` row with the right IAP / Stripe price.
 */
export async function startCreatorProCheckout(
  period: 'monthly' | 'yearly' = 'monthly'
): Promise<{ ok: boolean; error?: string }> {
  const plan = await getCreatorProPlanForCheckout(period);
  if (!plan?.id) {
    return {
      ok: false,
      error:
        period === 'yearly'
          ? 'Creator Pro yearly plan is not configured (add a payment_plans row with yearly IAP / Stripe).'
          : 'Creator Pro plan is not configured yet.',
    };
  }

  if (Platform.OS === 'ios') {
    if (!plan.iap_product_id_apple) {
      return { ok: false, error: 'Add iap_product_id_apple on your Creator Pro payment_plans row.' };
    }
    const { initializeStoreKit, purchaseCreatorProWithStoreKit } = await import('./storeKitService');
    await initializeStoreKit();
    return purchaseCreatorProWithStoreKit(plan.iap_product_id_apple);
  }

  if (Platform.OS === 'android') {
    if (!plan.iap_product_id_google) {
      return { ok: false, error: 'Add iap_product_id_google on your Creator Pro payment_plans row.' };
    }
    const { purchaseCreatorProWithGooglePlay } = await import('./googlePlayBillingService');
    const r = await purchaseCreatorProWithGooglePlay(plan.iap_product_id_google);
    return { ok: r.ok, error: r.error };
  }

  const currency = plan.currency === 'NGN' ? 'NGN' : 'USD';
  const priceId = currency === 'NGN' ? plan.stripe_price_id_ngn : plan.stripe_price_id_usd;
  if (!priceId) {
    return { ok: false, error: 'Stripe price not configured for web checkout.' };
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
