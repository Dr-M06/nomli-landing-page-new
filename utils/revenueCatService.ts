/**
 * RevenueCat (react-native-purchases) — Creator Pro subscriptions on iOS / Android.
 *
 * Token coin packs still use expo-in-app-purchases (iOS) and react-native-iap (Android).
 * Configure products + optional entitlements in the RevenueCat dashboard; set Supabase secrets
 * for the sync Edge Function (see `sync-revenuecat-creator-pro`).
 */

import { NativeModules, Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { getRevenueCatPublicApiKey, isRevenueCatEnabled } from '../constants/revenueCat';
import { supabase } from './supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants/Endpoints';
import { log, warn, error } from './productionLogger';
import { writeSubscriptionWindowsCache } from './subscriptionCache';

const RC_DEBUG = __DEV__;
const rcLog = (...a: unknown[]) => (RC_DEBUG ? console.log('[RevenueCat]', ...a) : log('[RevenueCat]', ...a));
const rcWarn = (...a: unknown[]) => (RC_DEBUG ? console.warn('[RevenueCat]', ...a) : warn('[RevenueCat]', ...a));
const rcError = (...a: unknown[]) => (RC_DEBUG ? console.error('[RevenueCat]', ...a) : error('[RevenueCat]', ...a));

/**
 * RevenueCat / Apple 7712 INVALID_RECEIPT — "purchased product was missing in the receipt".
 * Almost always Sandbox / StoreKit environment, not bad app code.
 */
function userFacingPurchaseError(e: unknown, storeProductId: string): string {
  const msg = e instanceof Error ? e.message : '';
  let code = '';
  let readable = '';
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (o.code !== undefined && o.code !== null) code = String(o.code);
    if (typeof o.readableErrorCode === 'string') readable = o.readableErrorCode;
  }
  const hay = `${msg} ${code} ${readable} ${String(e)}`.toLowerCase();
  const invalidReceipt =
    hay.includes('invalid_receipt') ||
    hay.includes('7712') ||
    (hay.includes('missing in the receipt') && hay.includes('receipt'));

  if (invalidReceipt && Platform.OS === 'ios') {
    return (
      'Apple could not validate the subscription receipt (StoreKit / Sandbox). Try a physical device, sign out and back into your Sandbox Apple ID under Settings → App Store, or use a new Sandbox tester. Ensure this product id exists in App Store Connect and matches RevenueCat: ' +
      storeProductId
    );
  }
  if (invalidReceipt) {
    return 'The store could not validate the purchase receipt. Check Play Console product setup and try again.';
  }
  return msg || 'Purchase failed';
}

function productIdCandidates(storeProductId: string): string[] {
  const base = storeProductId.trim();
  const candidates = new Set<string>([base]);
  // Support both historical naming styles:
  // - underscore: nomli_dating_pro_monthly
  // - dot:        nomli.dating.pro_monthly
  if (base.includes('_')) candidates.add(base.replace(/_/g, '.'));
  if (base.includes('.')) candidates.add(base.replace(/\./g, '_'));
  return Array.from(candidates);
}

let purchasesConfigured = false;
/** Throttle RevenueCat → Supabase sync (same Edge call as after purchase). */
let lastCreatorProBackendSyncAttemptMs = 0;
let lastSubscriptionsBackendSyncAttemptMs = 0;

/** Native `RNPurchases` is only present after a dev-client / release build that includes `react-native-purchases` (not Expo Go). */
function isRevenueCatNativeModuleLinked(): boolean {
  return !!(NativeModules as { RNPurchases?: unknown }).RNPurchases;
}

export { isRevenueCatEnabled };

/**
 * Call once at app root. We intentionally do **not** call `Purchases.configure` here: configuring
 * without `appUserID` creates an anonymous subscriber; the SDK may then sync attributes and hit
 * RevenueCat backend errors ("subscriber was not found"). Configure runs on first checkout with
 * the Supabase user id (see `ensurePurchasesConfigured`).
 */
export function initRevenueCatAtRoot(): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
}

/**
 * @param appUserID Supabase auth user id — pass on first configure so RevenueCat creates/links the right subscriber.
 */
async function ensurePurchasesConfigured(appUserID: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { ok: false, error: 'RevenueCat is only available on iOS and Android.' };
  }
  const apiKey = getRevenueCatPublicApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error:
        'Missing RevenueCat public API key. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY (iOS) or EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY (Android) in .env / EAS, restart Metro with --clear, then rebuild the dev client if needed.',
    };
  }
  if (!isRevenueCatNativeModuleLinked()) {
    rcWarn(
      'Native module RNPurchases is missing. Rebuild the dev client so react-native-purchases is compiled in: npx expo run:ios (or :android), then open that build — not Expo Go.'
    );
    return {
      ok: false,
      error:
        'RevenueCat needs a custom dev build. From the project folder run: npx expo run:ios — then open that app (not Expo Go).',
    };
  }

  try {
    if (purchasesConfigured) {
      const currentId = await Purchases.getAppUserID();
      if (currentId !== appUserID) {
        await Purchases.logIn(appUserID);
        rcLog('Purchases.logIn ok', { from: currentId, to: appUserID });
      }
      return { ok: true };
    }

    await Purchases.setLogLevel(RC_DEBUG ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID });
    purchasesConfigured = true;
    rcLog('Purchases.configure ok', { appUserID });
    return { ok: true };
  } catch (e: unknown) {
    rcError('configure failed', e);
    return {
      ok: false,
      error: (e as Error)?.message || 'RevenueCat failed to configure. Rebuild the app and try again.',
    };
  }
}

async function ensureLoggedInToRevenueCat(): Promise<{ ok: boolean; error?: string }> {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) return { ok: false, error: 'You must be signed in to subscribe.' };

  const configured = await ensurePurchasesConfigured(user.id);
  if (!configured.ok) return { ok: false, error: configured.error };

  return { ok: true };
}

export async function syncCreatorProFromServer(): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, error: 'App is missing Supabase configuration.' };
  }
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: 'No session — sign in again.' };

  const url = `${SUPABASE_URL}/functions/v1/sync-revenuecat-creator-pro`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; expiresAt?: string };
    if (!res.ok) {
      return { ok: false, error: data?.error || `Server error (${res.status})` };
    }
    if (!data.success) {
      return { ok: false, error: data?.error || 'Sync failed' };
    }
    return { ok: true };
  } catch (e: unknown) {
    rcError('sync-revenuecat-creator-pro request', e);
    return { ok: false, error: (e as Error)?.message || 'Network error' };
  }
}

export async function syncRevenueCatSubscriptionsFromServer(): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, error: 'App is missing Supabase configuration.' };
  }
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: 'No session — sign in again.' };

  const url = `${SUPABASE_URL}/functions/v1/sync-revenuecat-subscriptions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      dating?: { expiresAt?: string | null };
      creator?: { expiresAt?: string | null };
    };
    if (!res.ok) {
      return { ok: false, error: data?.error || `Server error (${res.status})` };
    }
    if (!data.success) {
      return { ok: false, error: data?.error || 'Sync failed' };
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      await writeSubscriptionWindowsCache(user.id, {
        discoverPremiumUntil: data?.dating?.expiresAt ?? null,
        creatorProUntil: data?.creator?.expiresAt ?? null,
      }).catch(() => {});
    }
    return { ok: true };
  } catch (e: unknown) {
    rcError('sync-revenuecat-subscriptions request', e);
    return { ok: false, error: (e as Error)?.message || 'Network error' };
  }
}

/**
 * Purchase Creator Pro by **store** subscription product id (same value as `payment_plans.iap_product_id_*`).
 * After the store sheet completes, the app asks Supabase to read RevenueCat’s REST API and update `profiles`.
 */
export async function purchaseCreatorProWithRevenueCat(storeProductId: string): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { ok: false, error: 'In-app subscription is only available on iOS and Android.' };
  }

  const login = await ensureLoggedInToRevenueCat();
  if (!login.ok) return { ok: false, error: login.error };

  try {
    const candidateIds = productIdCandidates(storeProductId);
    const products = await Purchases.getProducts(candidateIds);
    const product = candidateIds
      .map((id) => products.find((p) => p.identifier === id))
      .find((p) => !!p) ?? products[0];
    if (!product) {
      return {
        ok: false,
        error: `Product "${storeProductId}" was not returned by RevenueCat. Tried: ${candidateIds.join(', ')}.`,
      };
    }

    await Purchases.purchaseStoreProduct(product);
    const sync = await syncCreatorProFromServer();
    if (!sync.ok) {
      return {
        ok: false,
        error:
          sync.error ||
          'Purchase may have succeeded, but the server could not confirm Creator Pro. Pull to refresh or contact support.',
      };
    }
    return { ok: true };
  } catch (e: unknown) {
    const err = e as { code?: string | number; userCancelled?: boolean; message?: string };
    const cancelledEnum = (Purchases as { PURCHASES_ERROR_CODE?: { PURCHASE_CANCELLED_ERROR?: string } })
      .PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR;
    if (err.userCancelled === true || (cancelledEnum != null && err.code === cancelledEnum)) {
      return { ok: false, error: 'Purchase cancelled' };
    }
    rcError('purchaseCreatorProWithRevenueCat', e);
    return { ok: false, error: userFacingPurchaseError(e, storeProductId.trim()) };
  }
}

/**
 * Generic RevenueCat purchase by store product id.
 * Used for Dating Pro and bundle subscriptions.
 */
export async function purchaseSubscriptionWithRevenueCat(storeProductId: string): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { ok: false, error: 'In-app subscription is only available on iOS and Android.' };
  }

  const login = await ensureLoggedInToRevenueCat();
  if (!login.ok) return { ok: false, error: login.error };

  try {
    const candidateIds = productIdCandidates(storeProductId);
    const products = await Purchases.getProducts(candidateIds);
    const product = candidateIds
      .map((id) => products.find((p) => p.identifier === id))
      .find((p) => !!p) ?? products[0];
    if (!product) {
      return {
        ok: false,
        error: `Product "${storeProductId}" was not returned by RevenueCat. Tried: ${candidateIds.join(', ')}.`,
      };
    }
    await Purchases.purchaseStoreProduct(product);
    const sync = await syncRevenueCatSubscriptionsFromServer();
    if (!sync.ok) {
      return {
        ok: false,
        error:
          sync.error ||
          'Purchase may have succeeded, but subscription access could not be synced yet. Pull to refresh or try again shortly.',
      };
    }
    return { ok: true };
  } catch (e: unknown) {
    const err = e as { code?: string | number; userCancelled?: boolean };
    const cancelledEnum = (Purchases as { PURCHASES_ERROR_CODE?: { PURCHASE_CANCELLED_ERROR?: string } })
      .PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR;
    if (err.userCancelled === true || (cancelledEnum != null && err.code === cancelledEnum)) {
      return { ok: false, error: 'Purchase cancelled' };
    }
    rcError('purchaseSubscriptionWithRevenueCat', e);
    return { ok: false, error: userFacingPurchaseError(e, storeProductId.trim()) };
  }
}

/**
 * Pulls the subscriber from RevenueCat (server-side) and refreshes `profiles.creator_pro_until`.
 * Call after login / foreground so Pro stays in sync without opening the paywall again.
 * @param minIntervalMs minimum time between attempts (default 90s)
 */
export async function maybeSyncCreatorProBackendThrottled(
  minIntervalMs = 90_000
): Promise<{ ran: boolean; ok: boolean }> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { ran: false, ok: false };
  }
  if (!isRevenueCatEnabled()) return { ran: false, ok: false };

  const now = Date.now();
  if (now - lastCreatorProBackendSyncAttemptMs < minIntervalMs) {
    return { ran: false, ok: false };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ran: false, ok: false };

  lastCreatorProBackendSyncAttemptMs = now;
  const res = await syncCreatorProFromServer();
  return { ran: true, ok: res.ok };
}

/**
 * Pulls the subscriber from RevenueCat (server-side) and refreshes both
 * `profiles.discover_premium_until` and `profiles.creator_pro_until`.
 * @param minIntervalMs minimum time between attempts (default 90s)
 */
export async function maybeSyncRevenueCatSubscriptionsBackendThrottled(
  minIntervalMs = 90_000
): Promise<{ ran: boolean; ok: boolean }> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { ran: false, ok: false };
  }
  if (!isRevenueCatEnabled()) return { ran: false, ok: false };

  const now = Date.now();
  if (now - lastSubscriptionsBackendSyncAttemptMs < minIntervalMs) {
    return { ran: false, ok: false };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ran: false, ok: false };

  lastSubscriptionsBackendSyncAttemptMs = now;
  const res = await syncRevenueCatSubscriptionsFromServer();
  return { ran: true, ok: res.ok };
}

/** After sign-out, detach this device from the Supabase user id in RevenueCat (anonymous user). */
export async function logOutRevenueCat(): Promise<void> {
  lastCreatorProBackendSyncAttemptMs = 0;
  lastSubscriptionsBackendSyncAttemptMs = 0;
  if (!isRevenueCatEnabled() || !purchasesConfigured) return;
  try {
    await Purchases.logOut();
  } catch (e: unknown) {
    rcWarn('logOut', (e as Error)?.message);
  }
}
