import { Alert } from 'react-native';
import { supabase } from './supabase';
import { getUserSubscriptions } from './stripeService';
import { log, warn } from './productionLogger';
import { hasActiveWindow, readSubscriptionWindowsCache, writeSubscriptionWindowsCache } from './subscriptionCache';

const CALL_PLAN_MATCHERS = ['dating', 'date', 'match', 'creator', 'pro', 'call'];

function hasFuturePeriodEnd(subscription: any): boolean {
  const raw =
    subscription?.current_period_end ??
    subscription?.expires_at ??
    subscription?.period_end ??
    subscription?.ends_at;
  if (!raw) return true; // status gate already limits to active/trialing
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

function isCallEligiblePlan(subscription: any): boolean {
  const plan = subscription?.payment_plans;
  const planCategory = String(plan?.plan_category || '').toLowerCase();
  if (planCategory === 'discover' || planCategory === 'creator') return true;

  const haystack = `${plan?.name || ''} ${plan?.description || ''} ${plan?.iap_product_id_apple || ''} ${plan?.iap_product_id_google || ''}`.toLowerCase();
  return CALL_PLAN_MATCHERS.some((token) => haystack.includes(token));
}

export async function hasCallEntitlement(userId: string): Promise<boolean> {
  try {
    if (!userId) {
      log('[callEntitlement] deny: missing user id');
      return false;
    }
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('discover_premium_until, creator_pro_until')
      .eq('id', userId)
      .maybeSingle();

    if (!profileErr) {
      const activeNow = hasActiveWindow(profile?.discover_premium_until) || hasActiveWindow(profile?.creator_pro_until);
      if (activeNow) {
        await writeSubscriptionWindowsCache(userId, {
          discoverPremiumUntil: profile?.discover_premium_until ?? null,
          creatorProUntil: profile?.creator_pro_until ?? null,
        }).catch(() => {});
        log('[callEntitlement] allow: active profile premium window');
        return true;
      }
      log('[callEntitlement] profile windows inactive');
    } else {
      warn('[callEntitlement] profile read failed, using fallback checks:', profileErr);
    }

    const cached = await readSubscriptionWindowsCache(userId);
    if (cached && (hasActiveWindow(cached.discoverPremiumUntil) || hasActiveWindow(cached.creatorProUntil))) {
      log('[callEntitlement] allow: active cached premium window');
      return true;
    }
    log('[callEntitlement] cache window inactive or missing');

    const subs = await getUserSubscriptions(userId);
    const allowedBySub = subs.some((sub) => hasFuturePeriodEnd(sub) && isCallEligiblePlan(sub));
    if (allowedBySub) {
      log('[callEntitlement] allow: active subscription fallback');
      return true;
    }
    log('[callEntitlement] deny: no active premium window or eligible subscription');
    return false;
  } catch (e) {
    warn('[callEntitlement] hasCallEntitlement failed:', e);
    return false;
  }
}

export function showCallEntitlementAlert(router: any): void {
  Alert.alert(
    'Calls are a premium feature',
    'Audio and video calls unlock with Creator Pro or Dating Pro.',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Upgrade',
        onPress: () =>
          router.push({
            pathname: '/(tabs)/discovery',
            params: { openPaywall: '1', paywallTitle: 'Unlock calls with Creator Pro or Dating Pro' },
          }),
      },
    ]
  );
}

