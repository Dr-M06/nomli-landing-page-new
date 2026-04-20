/**
 * Google Play Billing Service - Android In-App Purchase
 * Uses react-native-iap for token packages; verifies with verify-google-receipt Edge Function.
 * Only imported on Android (_layout.tsx); static import so Metro bundles the native module.
 */

import { Platform } from 'react-native';
import {
  initConnection,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  getProducts,
  getSubscriptions,
  requestPurchase,
  requestSubscription,
  acknowledgePurchaseAndroid,
} from 'react-native-iap';
import { supabase } from './supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants/Endpoints';
import { log, warn, error } from './productionLogger';

const IAP_DEBUG = __DEV__;
const iapLog = (...args: any[]) => (IAP_DEBUG ? console.log(...args) : log(...args));
const iapWarn = (...args: any[]) => (IAP_DEBUG ? console.warn(...args) : warn(...args));
const iapError = (...args: any[]) => (IAP_DEBUG ? console.error(...args) : error(...args));

// Same product IDs as iOS / Play Console
const IAP_PRODUCT_IDS = [
  'com.nomli.mingle.coins.micro',
  'com.nomli.mingle.coins.small',
  'com.nomli.mingle.coins.medium',
  'com.nomli.mingle.coins.large',
  'com.nomli.mingle.coins.mega',
];

let isInitialized = false;
/** Single-flight bootstrap: initConnection + listeners (react-native-iap must not init twice in parallel). */
let billingBootstrapPromise: Promise<boolean> | null = null;
let purchaseListenersAttached = false;
let purchaseResolve: ((result: { success: boolean; error?: string }) => void) | null = null;
let creatorProPurchaseResolve: ((result: { success: boolean; error?: string }) => void) | null = null;
let creatorProPendingGoogleSku: string | null = null;

function googleSkuMatchesPending(purchaseProductId: string | undefined): boolean {
  if (!creatorProPendingGoogleSku || !purchaseProductId) return false;
  return (
    String(purchaseProductId).trim().toLowerCase() === String(creatorProPendingGoogleSku).trim().toLowerCase()
  );
}

/**
 * Call verify-google-receipt Edge Function, then finish or acknowledge on success.
 */
async function verifyAndFinishPurchase(
  purchaseToken: string,
  productId: string,
  userId: string,
  purchase: any
): Promise<{ success: boolean; kind?: string }> {
  const url = `${SUPABASE_URL}/functions/v1/verify-google-receipt`;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    iapError('[GooglePlay] SUPABASE_URL or SUPABASE_ANON_KEY missing');
    return { success: false };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        purchaseToken,
        productId,
        userId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      iapError('[GooglePlay] verify-google-receipt failed:', res.status, data?.error || data);
      return { success: false };
    }
    if (!data.success) {
      iapError('[GooglePlay] verify-google-receipt returned success: false', data?.error);
      return { success: false };
    }
    iapLog('[GooglePlay] ✅ Server verified purchase', data?.kind || 'tokens');
    return { success: true, kind: data.kind };
  } catch (e: any) {
    iapError('[GooglePlay] verify-google-receipt request error:', e?.message);
    return { success: false };
  }
}

/**
 * Connect to Play Billing and register listeners once. Safe to call from root and before purchases.
 */
function ensureGooglePlayBilling(): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  if (billingBootstrapPromise) return billingBootstrapPromise;

  billingBootstrapPromise = (async (): Promise<boolean> => {
    try {
      const connected = await initConnection();
      if (!connected) {
        iapWarn('[GooglePlay] initConnection returned false');
        billingBootstrapPromise = null;
        return false;
      }
      iapLog('[GooglePlay] ✅ Billing connected');

      if (!purchaseListenersAttached) {
        purchaseListenersAttached = true;

        purchaseUpdatedListener(async (purchase: any) => {
          try {
            const token = purchase.purchaseToken || purchase.purchaseTokenAndroid;
            const productId = purchase.productId || purchase.productIds?.[0];
            if (!token || !productId) {
              iapError('[GooglePlay] Purchase event missing purchaseToken or productId', purchase);
              return;
            }
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              iapError('[GooglePlay] No user session for purchase');
              return;
            }

            iapLog('[GooglePlay] 🔔 Purchase update:', productId);
            const vr = await verifyAndFinishPurchase(token, productId, user.id, purchase);
            if (vr.success && vr.kind === 'creator_pro') {
              try {
                await acknowledgePurchaseAndroid({ token });
              } catch (ackErr: any) {
                iapWarn('[GooglePlay] acknowledgePurchaseAndroid:', ackErr?.message);
              }
              if (creatorProPurchaseResolve && googleSkuMatchesPending(productId)) {
                creatorProPurchaseResolve({ success: true });
              }
            } else if (vr.success) {
              await finishTransaction({ purchase, isConsumable: true });
              if (purchaseResolve) {
                purchaseResolve({ success: true });
                purchaseResolve = null;
              }
              const { notifyWalletChanged } = await import('./walletService');
              notifyWalletChanged();
            } else {
              if (purchaseResolve) {
                purchaseResolve({ success: false, error: 'Verification failed' });
                purchaseResolve = null;
              }
              if (creatorProPurchaseResolve && googleSkuMatchesPending(productId)) {
                creatorProPurchaseResolve({ success: false, error: 'Verification failed' });
              }
            }
          } catch (e: any) {
            iapError('[GooglePlay] Purchase listener error:', e?.message);
            if (purchaseResolve) {
              purchaseResolve({ success: false, error: e?.message });
              purchaseResolve = null;
            }
          }
        });

        purchaseErrorListener((err: any) => {
          iapWarn('[GooglePlay] Purchase error:', err?.message || err);
          const msg = err?.message || err?.code || 'Purchase failed';
          if (purchaseResolve) {
            purchaseResolve({ success: false, error: msg });
            purchaseResolve = null;
          }
          if (creatorProPurchaseResolve) {
            creatorProPurchaseResolve({ success: false, error: msg });
            creatorProPurchaseResolve = null;
            creatorProPendingGoogleSku = null;
          }
        });
      }

      isInitialized = true;
      iapLog('[GooglePlay] ✅ Purchase listener set up');
      return true;
    } catch (e: any) {
      iapError('[GooglePlay] init error:', e?.message);
      billingBootstrapPromise = null;
      return false;
    }
  })();

  return billingBootstrapPromise;
}

/**
 * Initialize Google Play Billing and set up purchase listener. Call at app root (Android only).
 */
export const initGooglePlayBillingAtAppRoot = () => {
  if (Platform.OS !== 'android') return;
  void ensureGooglePlayBilling();
};

/**
 * Purchase tokens via Google Play (Android only). Resolves when purchase is verified and finished.
 */
export const purchaseTokensWithGooglePlay = async (
  iapProductId: string
): Promise<{ success: boolean; error?: string }> => {
  if (Platform.OS !== 'android') {
    return { success: false, error: 'Google Play IAP only available on Android' };
  }

  try {
    const billingOk = await ensureGooglePlayBilling();
    if (!billingOk || !isInitialized) {
      return {
        success: false,
        error:
          'Google Play Billing is not available. Use a device with the Play Store app, sign in to Google, or test on a Google Play system image (not AOSP without Play).',
      };
    }

    const products = await getProducts({ skus: IAP_PRODUCT_IDS });
    const product = products.find((p: any) => (p.productId || p.sku) === iapProductId);
    if (!product) {
      iapError('[GooglePlay] Product not found:', iapProductId);
      return {
        success: false,
        error: `Product "${iapProductId}" not found. Check Play Console.`,
      };
    }

    return new Promise((resolve) => {
      purchaseResolve = resolve;
      // Android requires skus (array)
      requestPurchase({ skus: [iapProductId] }).catch((err: any) => {
        iapError('[GooglePlay] requestPurchase error:', err?.message);
        if (purchaseResolve) {
          purchaseResolve({
            success: false,
            error: err?.message || err?.code || 'Purchase failed',
          });
          purchaseResolve = null;
        }
      });
      // Timeout so we don't hang forever if user cancels or listener never fires
      setTimeout(() => {
        if (purchaseResolve) {
          purchaseResolve({ success: false, error: 'Purchase timed out' });
          purchaseResolve = null;
        }
      }, 120000);
    });
  } catch (e: any) {
    iapError('[GooglePlay] purchaseTokensWithGooglePlay error:', e?.message);
    return { success: false, error: e?.message || 'Purchase failed' };
  }
};

/**
 * Nomli Creator Pro (auto-renewing subscription) on Google Play.
 */
export const purchaseCreatorProWithGooglePlay = async (
  sku: string
): Promise<{ ok: boolean; error?: string }> => {
  if (Platform.OS !== 'android') {
    return { ok: false, error: 'Google Play is only on Android' };
  }

  try {
    const billingOk = await ensureGooglePlayBilling();
    if (!billingOk || !isInitialized) {
      return {
        ok: false,
        error:
          'Google Play Billing is not available. Use a device with the Play Store app, sign in to Google, or an emulator with Google Play (not “Google APIs” only).',
      };
    }

    // Play Billing v5+: subscriptions require offer tokens from getSubscriptions (not { sku } alone).
    const subs = await getSubscriptions({ skus: [sku] });
    const sub = subs.find((s: any) => String(s.productId || s.id || '').trim() === sku.trim());
    if (!sub) {
      iapError('[GooglePlay] Subscription not in catalog:', sku, 'returned:', subs.map((s: any) => s.productId));
      return {
        ok: false,
        error: `Play Store did not return "${sku}". In Play Console, check the Product ID matches Supabase exactly (e.g. …monthly not …monthl) and the subscription has an active base plan.`,
      };
    }

    const offers = (sub as { subscriptionOfferDetails?: { offerToken: string }[] }).subscriptionOfferDetails;
    if (!offers?.length || !offers[0]?.offerToken) {
      iapError('[GooglePlay] No subscriptionOfferDetails for', sku, sub);
      return {
        ok: false,
        error: `No active subscription offer for "${sku}". In Play Console, add a base plan and activate it.`,
      };
    }

    const productId = String((sub as { productId?: string }).productId || sku);
    const offerToken = offers[0].offerToken;

    return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      creatorProPendingGoogleSku = sku;
      creatorProPurchaseResolve = (r) => {
        creatorProPurchaseResolve = null;
        creatorProPendingGoogleSku = null;
        resolve({ ok: !!r.success, error: r.error });
      };

      requestSubscription({
        subscriptionOffers: [{ sku: productId, offerToken }],
      }).catch((err: any) => {
        iapError('[GooglePlay] requestSubscription error:', err?.message);
        creatorProPurchaseResolve = null;
        creatorProPendingGoogleSku = null;
        resolve({ ok: false, error: err?.message || err?.code || 'Purchase failed' });
      });

      setTimeout(() => {
        if (creatorProPurchaseResolve && creatorProPendingGoogleSku === sku) {
          const fn = creatorProPurchaseResolve;
          creatorProPurchaseResolve = null;
          creatorProPendingGoogleSku = null;
          fn({ success: false, error: 'Purchase timed out' });
        }
      }, 120000);
    });
  } catch (e: any) {
    iapError('[GooglePlay] purchaseCreatorProWithGooglePlay error:', e?.message);
    return { ok: false, error: e?.message || 'Purchase failed' };
  }
};
