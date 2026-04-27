import { supabase } from './supabase';
import { getUserSubscriptions } from './stripeService';
import { hasActiveWindow, readSubscriptionWindowsCache, writeSubscriptionWindowsCache } from './subscriptionCache';
import { warn } from './productionLogger';

type ProEntitlement = {
  creatorActive: boolean;
  datingActive: boolean;
  anyActive: boolean;
};

const CREATOR_MATCHERS = ['creator', 'pro'];
const DATING_MATCHERS = ['dating', 'date', 'discover', 'match'];

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

function hasCategory(subscription: any, category: 'creator' | 'discover'): boolean {
  const plan = subscription?.payment_plans;
  const planCategory = String(plan?.plan_category || '').toLowerCase().trim();
  if (category === 'creator' && planCategory === 'creator') return true;
  if (category === 'discover' && planCategory === 'discover') return true;

  const haystack = `${plan?.name || ''} ${plan?.description || ''} ${plan?.iap_product_id_apple || ''} ${plan?.iap_product_id_google || ''}`
    .toLowerCase()
    .trim();
  const tokens = category === 'creator' ? CREATOR_MATCHERS : DATING_MATCHERS;
  return tokens.some((token) => haystack.includes(token));
}

function activeByProfiles(profile?: { creator_pro_until?: string | null; discover_premium_until?: string | null } | null): ProEntitlement {
  const creatorActive = hasActiveWindow(profile?.creator_pro_until ?? null);
  const datingActive = hasActiveWindow(profile?.discover_premium_until ?? null);
  return { creatorActive, datingActive, anyActive: creatorActive || datingActive };
}

export async function getProEntitlement(userId: string): Promise<ProEntitlement> {
  if (!userId) return { creatorActive: false, datingActive: false, anyActive: false };
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('creator_pro_until, discover_premium_until')
      .eq('id', userId)
      .maybeSingle();

    if (!error) {
      const fromProfile = activeByProfiles(profile);
      if (fromProfile.anyActive) {
        await writeSubscriptionWindowsCache(userId, {
          discoverPremiumUntil: profile?.discover_premium_until ?? null,
          creatorProUntil: profile?.creator_pro_until ?? null,
        }).catch(() => {});
        return fromProfile;
      }
    }

    const cached = await readSubscriptionWindowsCache(userId);
    if (cached) {
      const fromCache: ProEntitlement = {
        creatorActive: hasActiveWindow(cached.creatorProUntil),
        datingActive: hasActiveWindow(cached.discoverPremiumUntil),
        anyActive: hasActiveWindow(cached.creatorProUntil) || hasActiveWindow(cached.discoverPremiumUntil),
      };
      if (fromCache.anyActive) return fromCache;
    }

    const subs = await getUserSubscriptions(userId);
    const now = Date.now();
    let creator = false;
    let dating = false;
    for (const sub of subs) {
      if (subscriptionPeriodEndMs(sub) <= now) continue;
      if (!creator && hasCategory(sub, 'creator')) creator = true;
      if (!dating && hasCategory(sub, 'discover')) dating = true;
      if (creator && dating) break;
    }
    return { creatorActive: creator, datingActive: dating, anyActive: creator || dating };
  } catch (e) {
    warn('[proEntitlement] getProEntitlement failed:', e);
    const cached = await readSubscriptionWindowsCache(userId);
    if (cached) {
      const creatorActive = hasActiveWindow(cached.creatorProUntil);
      const datingActive = hasActiveWindow(cached.discoverPremiumUntil);
      return { creatorActive, datingActive, anyActive: creatorActive || datingActive };
    }
    return { creatorActive: false, datingActive: false, anyActive: false };
  }
}

