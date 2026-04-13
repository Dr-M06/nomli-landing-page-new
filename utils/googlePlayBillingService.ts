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
  requestPurchase,
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
let purchaseResolve: ((result: { success: boolean; error?: string }) => void) | null = null;

/**
 * Call verify-google-receipt Edge Function, then finish (consume) the transaction on success.
 */
async function verifyAndFinishPurchase(
  purchaseToken: string,
  productId: string,
  userId: string
): Promise<boolean> {
  const url = `${SUPABASE_URL}/functions/v1/verify-google-receipt`;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    iapError('[GooglePlay] SUPABASE_URL or SUPABASE_ANON_KEY missing');
    return false;
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
      return false;
    }
    if (!data.success) {
      iapError('[GooglePlay] verify-google-receipt returned success: false', data?.error);
      return false;
    }
    iapLog('[GooglePlay] ✅ Server verified purchase, tokens credited');
    return true;
  } catch (e: any) {
    iapError('[GooglePlay] verify-google-receipt request error:', e?.message);
    return false;
  }
}

/**
 * Initialize Google Play Billing and set up purchase listener. Call at app root (Android only).
 */
export const initGooglePlayBillingAtAppRoot = () => {
  if (Platform.OS !== 'android') return;

  (async () => {
    try {
      const connected = await initConnection();
      if (!connected) {
        iapWarn('[GooglePlay] initConnection returned false');
        return;
      }
      iapLog('[GooglePlay] ✅ Billing connected');

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
          const verified = await verifyAndFinishPurchase(token, productId, user.id);
          if (verified) {
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
        if (purchaseResolve) {
          purchaseResolve({
            success: false,
            error: err?.message || err?.code || 'Purchase failed',
          });
          purchaseResolve = null;
        }
      });

      isInitialized = true;
      iapLog('[GooglePlay] ✅ Purchase listener set up');
    } catch (e: any) {
      iapError('[GooglePlay] init error:', e?.message);
    }
  })();
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
    if (!isInitialized) {
      const connected = await initConnection();
      if (!connected) {
        return { success: false, error: 'Could not connect to Play Billing' };
      }
      isInitialized = true;
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
