/**
 * StoreKit Service - Apple In-App Purchase Integration
 * 
 * Handles iOS IAP purchases for token packages
 * Uses expo-in-app-purchases for StoreKit integration
 * 
 * Logging: IAP logs are disabled in production (__DEV__ only). Use Xcode console in Debug scheme for [StoreKit] logs.
 */

import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants/Endpoints';
import { log as devLog, warn as devWarn, error as devError } from './productionLogger';

// IAP logs only in development; never in production (no env override)
const IAP_DEBUG = __DEV__;

const iapLog = (...args: any[]) => {
  if (IAP_DEBUG) {
    console.log(...args);
  } else {
    devLog(...args);
  }
};
const iapWarn = (...args: any[]) => {
  if (IAP_DEBUG) {
    console.warn(...args);
  } else {
    devWarn(...args);
  }
};
const iapError = (...args: any[]) => {
  if (IAP_DEBUG) {
    console.error(...args);
  } else {
    devError(...args);
  }
};


// Import expo-in-app-purchases using require() to avoid Metro bundler dynamic import issues
// Cache the module to avoid repeated requires
let InAppPurchasesModule: any = null;

const getInAppPurchases = () => {
  if (Platform.OS !== 'ios') {
    return null;
  }
  
  if (InAppPurchasesModule) {
    return InAppPurchasesModule;
  }
  
  try {
    // Use require() instead of dynamic import() to avoid Metro bundler issues
    // require() is synchronous and works better with native modules
    InAppPurchasesModule = require('expo-in-app-purchases');
    
    // Handle both default export and named exports
    if (InAppPurchasesModule && InAppPurchasesModule.default) {
      InAppPurchasesModule = InAppPurchasesModule.default;
    }
    
    // Verify module has required functions
    if (!InAppPurchasesModule || typeof InAppPurchasesModule.connectAsync !== 'function') {
      iapError('[StoreKit] InAppPurchases module not loaded correctly:', InAppPurchasesModule);
      InAppPurchasesModule = null; // Reset on error
      return null;
    }
    
    return InAppPurchasesModule;
  } catch (err: any) {
    iapError('[StoreKit] Error loading InAppPurchases module:', err);
    InAppPurchasesModule = null; // Reset on error
    return null;
  }
};

export interface IAPProduct {
  productId: string;
  price: string;
  currency: string;
  title: string;
  description: string;
}

export interface PurchaseResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

// Product IDs matching App Store Connect
// 5-tier consumable IAP products
const IAP_PRODUCT_IDS = [
  'com.nomli.mingle.coins.micro',    // $0.99 - 50 tokens
  'com.nomli.mingle.coins.small',    // $4.99 - 300 tokens
  'com.nomli.mingle.coins.medium',   // $9.99 - 700 tokens
  'com.nomli.mingle.coins.large',    // $24.99 - 2000 tokens
  'com.nomli.mingle.coins.mega',     // $49.99 - 4166 tokens
];

/** Merged into StoreKit product queries (e.g. Nomli Creator Pro subscription SKU from payment_plans). */
let extraIapProductIds: string[] = [];

export function addIapProductIdsForFetching(productIds: string[]) {
  let added = false;
  for (const id of productIds) {
    if (!id || IAP_PRODUCT_IDS.includes(id) || extraIapProductIds.includes(id)) continue;
    extraIapProductIds.push(id);
    added = true;
  }
  if (added) {
    fetchProductsPromise = null;
    // Next getProductsAsync must merge new IDs; a coin-only cache cannot contain Creator Pro.
    availableProducts = [];
  }
}

let creatorProPurchaseResolve: ((r: { ok: boolean; error?: string }) => void) | null = null;
let creatorProPendingProductId: string | null = null;
let creatorProPurchaseTimeout: ReturnType<typeof setTimeout> | null = null;

function iapProductIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Clear timeout + resolve the checkout promise; always clear pending SKU (flow finished or failed). */
function settlePendingCreatorProPurchase(result: { ok: boolean; error?: string }) {
  if (!creatorProPurchaseResolve) return;
  if (creatorProPurchaseTimeout) {
    clearTimeout(creatorProPurchaseTimeout);
    creatorProPurchaseTimeout = null;
  }
  const fn = creatorProPurchaseResolve;
  creatorProPurchaseResolve = null;
  creatorProPendingProductId = null;
  fn(result);
}

function settlePendingCreatorProIfProductMatches(
  storeProductId: string | undefined,
  result: { ok: boolean; error?: string }
) {
  if (!creatorProPendingProductId) return;
  if (!iapProductIdsMatch(storeProductId, creatorProPendingProductId)) return;
  if (creatorProPurchaseResolve) {
    settlePendingCreatorProPurchase(result);
  } else {
    creatorProPendingProductId = null;
  }
}

let isInitialized = false;
let availableProducts: IAPProduct[] = [];
let purchaseListener: ((transactionId: string, productId: string) => void) | null = null;
let errorListener: ((error: string, details?: any) => void) | null = null;
let fetchProductsPromise: Promise<IAPProduct[]> | null = null; // Prevent concurrent calls
let clearPendingPurchasesPromise: Promise<{ success: boolean; cleared: number; verified: number; errors: string[] }> | null = null; // Prevent concurrent calls

/**
 * Initialize StoreKit connection
 */
export const initializeStoreKit = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') {
    iapWarn('[StoreKit] Only available on iOS');
    return false;
  }

  if (isInitialized) {
    return true;
  }

  try {
    const InAppPurchases = getInAppPurchases();
    
    if (!InAppPurchases) {
      iapError('[StoreKit] InAppPurchases module not available');
      return false;
    }

    // Connect to StoreKit (will throw error if IAP is not available)
    await InAppPurchases.connectAsync();
    isInitialized = true;
    iapLog('[StoreKit] ✅ Initialized successfully');

    // Fetch available products
    await fetchProducts();

    return true;
  } catch (err: any) {
    iapError('[StoreKit] Initialization error:', err);
    // If connection fails, IAP is likely not available on this device
    if (err.message?.includes('not available') || err.code === 'E_IAP_NOT_AVAILABLE') {
      iapWarn('[StoreKit] In-App Purchases not available on this device');
    }
    return false;
  }
};

/**
 * Fetch available IAP products from App Store
 * Prevents concurrent calls to getProductsAsync which is not allowed
 */
export const fetchProducts = async (): Promise<IAPProduct[]> => {
  // If there's already a fetch in progress, wait for it
  if (fetchProductsPromise) {
    iapLog('[StoreKit] Fetch already in progress, waiting...');
    return fetchProductsPromise;
  }

  // Create a new fetch promise
  fetchProductsPromise = (async (): Promise<IAPProduct[]> => {
  try {
    if (!isInitialized) {
      await initializeStoreKit();
    }

    if (Platform.OS !== 'ios') {
      return [];
    }

      const InAppPurchases = getInAppPurchases();
      if (!InAppPurchases) {
        return [];
      }
      
    const allIds = [...new Set([...IAP_PRODUCT_IDS, ...extraIapProductIds])];
    const { results } = await InAppPurchases.getProductsAsync(allIds);

    const returnedIds = new Set((results || []).map((p: { productId: string }) => p.productId));
    const missingFromApple = allIds.filter((id) => !returnedIds.has(id));
    if (missingFromApple.length) {
      iapWarn(
        '[StoreKit] App Store did not return these IDs (typo, wrong app, or IAP not Ready for Sale):',
        missingFromApple.join(', ')
      );
    }

    iapLog('[StoreKit] 📦 Requested product ID count:', allIds.length);
    iapLog('[StoreKit] 📦 Products returned from App Store:', results?.length ?? 0);
    
    const resultRows = results || [];
    if (resultRows.length === 0) {
      iapWarn('[StoreKit] ⚠️ No products returned from App Store Connect. This could mean:');
      iapWarn('[StoreKit]   1. Products are still pending review in App Store Connect');
      iapWarn('[StoreKit]   2. Products are not available in sandbox environment');
      iapWarn('[StoreKit]   3. Product IDs don\'t match App Store Connect');
      iapWarn('[StoreKit]   4. You need to test with a sandbox tester account');
    } else {
      resultRows.forEach((product: { productId: string; title: string; price: string }) => {
        iapLog(`[StoreKit]   - ${product.productId}: ${product.title} (${product.price})`);
      });
    }
    
    availableProducts = resultRows.map((product: { productId: string; price: string; currency?: string; title: string; description?: string }) => ({
      productId: product.productId,
      price: product.price,
      currency: product.currency || 'USD',
      title: product.title,
      description: product.description || '',
    }));

    iapLog('[StoreKit] ✅ Fetched products:', availableProducts.length);
    return availableProducts;
  } catch (err: any) {
    iapError('[StoreKit] Fetch products error:', err);
    return [];
    } finally {
      // Clear the promise so future calls can proceed
      fetchProductsPromise = null;
  }
  })();

  return fetchProductsPromise;
};

/**
 * Get available products
 */
export const getAvailableProducts = (): IAPProduct[] => {
  return availableProducts;
};

/**
 * Purchase tokens using IAP
 */
export const purchaseTokensWithIAP = async (
  iapProductId: string
): Promise<PurchaseResult> => {
  try {
    if (Platform.OS !== 'ios') {
      return {
        success: false,
        error: 'IAP only available on iOS',
      };
    }

    if (!isInitialized) {
      const initialized = await initializeStoreKit();
      if (!initialized) {
        return {
          success: false,
          error: 'StoreKit not available',
        };
      }
    }

    // Ensure products are fetched (if list is empty, fetch again)
    if (availableProducts.length === 0) {
      iapLog('[StoreKit] Products list empty, fetching products...');
      await fetchProducts();
    }

    // DB-driven subscription SKUs (Creator Pro) are merged via extraIapProductIds after first fetch.
    // If we only ever fetched the static coin list, availableProducts omits them — refetch before purchase.
    if (!IAP_PRODUCT_IDS.includes(iapProductId)) {
      iapLog('[StoreKit] Non-coin SKU — invalidating cache and refetching product catalog...');
      fetchProductsPromise = null;
      await fetchProducts();
    }

    // Verify product exists
    const product = availableProducts.find((p) => p.productId === iapProductId);
    if (!product) {
      iapError('[StoreKit] Product not found:', iapProductId);
      iapLog('[StoreKit] Available products:', availableProducts.map(p => p.productId));
      
      // Try fetching products one more time in case they weren't loaded
      iapLog('[StoreKit] Attempting to fetch products again...');
      await fetchProducts();
      const retryProduct = availableProducts.find((p) => p.productId === iapProductId);
      
      if (!retryProduct) {
        const bundleId = Constants.expoConfig?.ios?.bundleIdentifier || 'this iOS app';
        return {
          success: false,
          error: `Product "${iapProductId}" was not returned by Apple. In App Store Connect, add this subscription to bundle ${bundleId}, complete IAP metadata, attach it to an app version, then match the exact product ID in Supabase payment_plans. Apple returned: ${availableProducts.map((p) => p.productId).join(', ') || 'none'}.`,
        };
      }
    }

    // Start purchase
    iapLog('[StoreKit] Starting purchase for:', iapProductId);
    const InAppPurchases = getInAppPurchases();
    if (!InAppPurchases) {
      return {
        success: false,
        error: 'StoreKit not available',
      };
    }
    
    try {
      iapLog('[StoreKit] 🛒 Calling purchaseItemAsync for:', iapProductId);
      iapLog('[StoreKit] 📋 Purchase listener status:', {
        hasPurchaseListener: !!purchaseListener,
        isInitialized,
      });
      
      await InAppPurchases.purchaseItemAsync(iapProductId);
      
      iapLog('[StoreKit] ✅ purchaseItemAsync completed - waiting for purchase listener...');
      // Purchase will be handled by purchase listener
      return {
        success: true,
      };
    } catch (err: any) {
      iapError('[StoreKit] ❌ purchaseItemAsync error:', err);
      iapError('[StoreKit] Error details:', {
        code: err.code,
        message: err.message,
        name: err.name,
      });
      
      // Handle case where purchase might be blocked (e.g., already purchased in sandbox)
      if (err.code === 'E_ITEM_UNAVAILABLE' || err.message?.includes('already')) {
        iapWarn('[StoreKit] Purchase might be blocked - this is normal for sandbox repurchases');
        // Still return success - listener will handle it
        return {
          success: true,
        };
      }
      throw err; // Re-throw other errors
    }
  } catch (err: any) {
    iapError('[StoreKit] Purchase error:', err);
    
    if (err.code === 'E_USER_CANCELLED') {
      return {
        success: false,
        error: 'Purchase cancelled by user',
      };
    }

    return {
      success: false,
      error: err.message || 'Purchase failed',
    };
  }
};

/**
 * Initialize IAP connection and set up purchase listener at APP ROOT.
 * MUST be called on app start - not when user opens wallet.
 * Apple delivers transactions asynchronously; if listener isn't registered, nothing happens after purchase popup.
 */
export const initIAPAtAppRoot = () => {
  if (Platform.OS !== 'ios') {
    return;
  }

  iapLog('[StoreKit] 🚀 initIAPAtAppRoot - Setting up IAP listener at app root (ALWAYS ACTIVE)');
  iapLog('[StoreKit] ✅ Listener will be active - purchase updates will be received');

  // Set up native listener asynchronously - runs once at app start
  (async () => {
    try {
      iapLog('[StoreKit] 🔄 Initializing StoreKit for purchase listener...');
      if (!isInitialized) {
        const initialized = await initializeStoreKit();
        if (!initialized) {
          throw new Error('Failed to initialize StoreKit');
        }
      }

      const InAppPurchases = getInAppPurchases();
      if (!InAppPurchases) {
        throw new Error('InAppPurchases module not available');
      }

      iapLog('[StoreKit] ✅ StoreKit initialized, setting up purchase listener...');
      
      InAppPurchases.setPurchaseListener(async (result: any) => {
        // iOS sends { results: [transaction], responseCode }. Android may use different shape.
        try {
          iapLog('[StoreKit] 🔔 Purchase listener FIRED (StoreKit transaction update received)');
          iapLog('[StoreKit] 📦 Raw result keys:', result ? Object.keys(result) : 'null');
          iapLog('[StoreKit] 📦 Raw result:', JSON.stringify(result, null, 2));
          
          // iOS: formatResults returns { results: [...], responseCode }. Use results first.
          const purchase = result?.results?.[0] ?? result?.response;
          const errorCode = result?.errorCode;
          const responseCode = result?.responseCode;

          iapLog('[StoreKit] 📦 Parsed:', {
            hasPurchase: !!purchase,
            purchaseKeys: purchase ? Object.keys(purchase) : [],
            responseCode,
            errorCode,
          });

          if (purchase) {
          // Debug: full purchase object (check transactionReceipt, productId, listener firing)
          iapLog('[StoreKit] Purchase received:', JSON.stringify(purchase, null, 2));

          const productId = purchase.productId;
          const transactionId = purchase.orderId ?? purchase.transactionId;
          let transactionReceipt = purchase.transactionReceipt;

          iapLog('[StoreKit] ✅ Purchase successful:', {
            productId,
            transactionId,
            hasReceipt: !!transactionReceipt,
            receiptLength: transactionReceipt?.length || 0,
            purchaseKeys: Object.keys(purchase),
            purchaseObject: JSON.stringify(purchase, null, 2),
          });

          if (!transactionId) {
            const errMsg = 'Purchase completed but transaction ID is missing';
            iapError('[StoreKit] ❌ Missing transaction ID!');
            settlePendingCreatorProIfProductMatches(productId, { ok: false, error: errMsg });
            if (errorListener) errorListener(errMsg); else Alert.alert('Purchase Error', errMsg);
            return;
          }

          // If transactionReceipt is missing or too short (< 100 chars suggests it's not a full receipt),
          // this usually means the app bundle receipt is not available (common in sandbox/testing)
          // or hasn't been refreshed after purchase
          if (!transactionReceipt || transactionReceipt.length < 100) {
            iapLog('[StoreKit] ⚠️ Transaction receipt missing or too short:', {
              hasReceipt: !!transactionReceipt,
              length: transactionReceipt?.length || 0,
              receiptValue: transactionReceipt,
            });
            
            // Log the full purchase object to help diagnose
            iapLog('[StoreKit] 📋 Full purchase object:', JSON.stringify(purchase, null, 2));
            
            // Try to get purchase history which might trigger receipt refresh
            try {
              iapLog('[StoreKit] 🔄 Attempting to refresh receipt by getting purchase history...');
              const { results } = await InAppPurchases.getPurchaseHistoryAsync({
                useGooglePlayCache: false, // Force refresh
              });
              
              // Look for the same transaction in purchase history
              const matchingPurchase = results?.find(
                (p: any) => (p.orderId || p.transactionId) === transactionId && p.productId === productId
              );
              
              if (matchingPurchase?.transactionReceipt && matchingPurchase.transactionReceipt.length >= 100) {
                transactionReceipt = matchingPurchase.transactionReceipt;
                iapLog('[StoreKit] ✅ Got receipt from purchase history, length:', transactionReceipt.length);
              } else {
                iapLog('[StoreKit] ⚠️ Purchase history did not provide a valid receipt');
              }
            } catch (historyError: any) {
              iapError('[StoreKit] ❌ Error getting purchase history:', historyError);
              // Continue with original transactionReceipt if available
            }
          }

          if (!transactionReceipt) {
            const errorMsg = 'Purchase completed but receipt is missing. This may be a sandbox testing issue. Please try again or contact support.';
            iapError('[StoreKit] ❌ Missing transaction receipt after all attempts!');
            iapError('[StoreKit] ❌ RECEIPT MISSING - Edge Function NOT called. Full purchase object:', JSON.stringify(purchase, null, 2));
            settlePendingCreatorProIfProductMatches(productId, { ok: false, error: errorMsg });
            if (errorListener) errorListener(errorMsg); else Alert.alert('Purchase Error', errorMsg);
            // DO NOT call purchaseListener - verification failed, purchase should not be marked as successful
            // The transaction will remain in queue and can be retried
            return;
          }

          // Validate receipt length - Apple receipts are base64 and typically > 100 chars
          if (transactionReceipt.length < 100) {
            const errorMsg = `Receipt data appears invalid (length: ${transactionReceipt.length} chars, expected > 100). This may be a sandbox testing issue. Please try again.`;
            iapError('[StoreKit] ❌ Receipt too short for Apple verification:', {
              length: transactionReceipt.length,
              receipt: transactionReceipt.substring(0, 50) + '...',
              fullReceipt: transactionReceipt,
            });
            iapError('[StoreKit] ❌ RECEIPT TOO SHORT - Edge Function NOT called:', {
              length: transactionReceipt.length,
              receipt: transactionReceipt,
              purchaseObject: JSON.stringify(purchase, null, 2),
            });
            settlePendingCreatorProIfProductMatches(productId, { ok: false, error: errorMsg });
            if (errorListener) errorListener(errorMsg); else Alert.alert('Purchase Error', errorMsg);
            // DO NOT call purchaseListener - verification failed, purchase should not be marked as successful
            // The transaction will remain in queue and can be retried
            return;
          }

          try {
            iapLog('[StoreKit] 🔄 Calling verifyReceiptAndCreditTokens (will invoke Supabase Edge Function)...');
            iapLog('[StoreKit] 📋 Receipt details:', {
              length: transactionReceipt.length,
              firstChars: transactionReceipt.substring(0, 50),
              lastChars: transactionReceipt.substring(transactionReceipt.length - 50),
            });
            // Verify receipt with backend (with timeout handling)
            const verifyResult = await verifyReceiptAndCreditTokens(
              transactionReceipt,
              productId,
              transactionId
            );

            iapLog('[StoreKit] ✅ Receipt verification result:', verifyResult);

            if (verifyResult.success) {
              const isCreatorPro = verifyResult.kind === 'creator_pro';
              const matchesPendingCreatorSku = iapProductIdsMatch(productId, creatorProPendingProductId);
              const treatAsCreatorPro = isCreatorPro || matchesPendingCreatorSku;
              const consume = !treatAsCreatorPro;
              iapLog('[StoreKit] ✅ Backend verification successful', { isCreatorPro, matchesPendingCreatorSku, consume });
              
              try {
                if (typeof InAppPurchases.finishTransactionAsync === 'function') {
                  iapLog('[StoreKit] 🔄 Finishing transaction (backend verified)...');
                  await InAppPurchases.finishTransactionAsync(purchase, consume);
                  iapLog('[StoreKit] ✅ Transaction finished', { consume });
                } else {
                  iapWarn('[StoreKit] finishTransactionAsync not available');
                }
              } catch (finishErr: any) {
                iapError('[StoreKit] finishTransactionAsync error:', finishErr);
                iapWarn('[StoreKit] finishTransactionAsync error (non-fatal):', finishErr?.message);
              }

              if (
                creatorProPurchaseResolve &&
                creatorProPendingProductId &&
                (isCreatorPro || matchesPendingCreatorSku)
              ) {
                settlePendingCreatorProPurchase({ ok: true });
              } else if (
                !creatorProPurchaseResolve &&
                creatorProPendingProductId &&
                (isCreatorPro || matchesPendingCreatorSku) &&
                iapProductIdsMatch(productId, creatorProPendingProductId)
              ) {
                creatorProPendingProductId = null;
              } else if (purchaseListener && !treatAsCreatorPro) {
                iapLog('[StoreKit] 🔔 Calling purchase listener callback (backend verified)...');
                purchaseListener(transactionId, productId);
              } else if (!treatAsCreatorPro) {
                Alert.alert('Success', 'Tokens have been added to your wallet! Open your wallet to see your balance.');
              }
            } else {
              iapError('[StoreKit] ❌ Receipt verification failed - tokens NOT credited');
              iapError('[StoreKit] ⚠️ Transaction NOT finished - will remain in queue for retry');
              
              // Get more detailed error message if available
              const errorDetails = {
                type: 'verification_failed',
                transactionId,
                productId,
                receiptLength: transactionReceipt?.length || 0,
              };
              const errorMsg = 'Failed to verify purchase with server. Tokens were not credited. The purchase will be retried automatically. Please check your internet connection.';
              iapError('[StoreKit] ❌ VERIFICATION FAILED DETAILS:', JSON.stringify(errorDetails, null, 2));
              settlePendingCreatorProIfProductMatches(productId, { ok: false, error: errorMsg });
              if (errorListener) errorListener(errorMsg, errorDetails); else Alert.alert('Purchase Error', errorMsg);
              
              // DO NOT call purchaseListener - verification failed, purchase should not be marked as successful
              // DO NOT finish transaction - leave it in queue so it can be retried
              // The transaction will be picked up again when app restarts or when clearPendingPurchases is called
            }
          } catch (err: any) {
            iapError('[StoreKit] ❌ Receipt verification exception:', err);
            iapError('[StoreKit] Exception details:', {
              message: err.message,
              stack: err.stack,
              name: err.name,
              fullError: JSON.stringify(err, null, 2),
            });
            
            // Log full error to console for device debugging
            iapError('[StoreKit] ❌ EXCEPTION FULL DETAILS:', JSON.stringify(err, null, 2));
            
            // DO NOT call purchaseListener - exception occurred, purchase should not be marked as successful
            // The transaction will remain in queue and can be retried
            
            // Provide user-friendly error message
            let userErrorMsg = 'Failed to verify purchase. Tokens were not credited.';
            if (err.message?.includes('timeout')) {
              userErrorMsg = 'Purchase verification timed out. Tokens were not credited. Please check your internet connection and try again.';
            } else if (err.message) {
              userErrorMsg = `Purchase verification failed: ${err.message}. Tokens were not credited.`;
            }
            settlePendingCreatorProIfProductMatches(productId, { ok: false, error: userErrorMsg });
            if (errorListener) errorListener(userErrorMsg); else Alert.alert('Purchase Error', userErrorMsg);
          }
        } else if (errorCode || (responseCode && responseCode !== 0)) {
          iapError('[StoreKit] ❌ Purchase error:', {
            errorCode,
            responseCode,
            result,
          });
          const errMsg = `Purchase failed: ${errorCode || responseCode}`;
          if (creatorProPurchaseResolve) {
            settlePendingCreatorProPurchase({ ok: false, error: errMsg });
          } else if (creatorProPendingProductId) {
            creatorProPendingProductId = null;
          }
          errorListener?.(errMsg);
          if (!errorListener) Alert.alert('Purchase Error', errMsg);
        } else {
          iapWarn('[StoreKit] ⚠️ Purchase listener called but no purchase or error found:', result);
        }
        } catch (listenerErr: any) {
          iapError('[StoreKit] ❌ Purchase listener threw:', listenerErr);
          iapError('[StoreKit] ❌ LISTENER EXCEPTION:', listenerErr?.message, listenerErr?.stack);
          if (creatorProPurchaseResolve) {
            settlePendingCreatorProPurchase({
              ok: false,
              error: listenerErr?.message || 'Purchase processing failed',
            });
          } else if (creatorProPendingProductId) {
            creatorProPendingProductId = null;
          }
          if (errorListener) errorListener(listenerErr?.message || 'Purchase processing failed');
          else Alert.alert('Purchase Error', listenerErr?.message || 'Purchase processing failed');
        }
      });
      
      iapLog('[StoreKit] ✅ Native purchase listener REGISTERED - will receive transaction updates');
      iapLog('[StoreKit] ✅ LISTENER ACTIVE - Purchase popup success ≠ your code ran. Listener must receive the update.');
    } catch (err: any) {
      iapError('[StoreKit] Error setting up purchase listener:', err);
      const errMsg = err.message || 'Failed to setup purchase listener';
      errorListener?.(errMsg);
      if (!errorListener) Alert.alert('IAP Error', errMsg);
    }
  })();
};

/**
 * Register purchase callbacks (for WalletScreen).
 * Call this when WalletScreen mounts to receive success/error UI updates.
 * The native listener is already set up by initIAPAtAppRoot at app start.
 * Returns cleanup function to unregister on unmount.
 */
export const setupPurchaseListener = (
  onPurchaseComplete: (transactionId: string, productId: string) => void,
  onPurchaseError: (error: string, details?: any) => void
): (() => void) => {
  if (Platform.OS !== 'ios') {
    return () => {};
  }
  iapLog('[StoreKit] 🔧 WalletScreen registering purchase callbacks');
  purchaseListener = onPurchaseComplete;
  errorListener = onPurchaseError;
  return () => {
    iapLog('[StoreKit] 🔧 WalletScreen unregistering purchase callbacks');
    purchaseListener = null;
    errorListener = null;
  };
};

type VerifyReceiptResult = { success: boolean; kind?: 'creator_pro' | 'tokens' };

/**
 * Verify receipt with backend (token packs or Nomli Creator Pro subscription).
 */
const verifyReceiptAndCreditTokens = async (
  receipt: string,
  productId: string,
  transactionId: string
): Promise<VerifyReceiptResult> => {
  try {
    iapLog('[StoreKit] 🔄 verifyReceiptAndCreditTokens called:', {
      productId,
      transactionId,
      receiptLength: receipt?.length || 0,
      hasReceipt: !!receipt,
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      iapError('[StoreKit] ❌ User not authenticated');
      throw new Error('User not authenticated');
    }

    iapLog('[StoreKit] ✅ User authenticated:', user.id);

    iapLog('[StoreKit] 🔍 Resolving product:', productId);
    const { data: packageRow } = await supabase
      .from('token_packages')
      .select('id')
      .eq('iap_product_id', productId)
      .maybeSingle();

    const { data: creatorPlanRow } = await supabase
      .from('payment_plans')
      .select('id')
      .eq('iap_product_id_apple', productId)
      .eq('plan_category', 'creator')
      .eq('is_active', true)
      .maybeSingle();

    const packageId = packageRow?.id;
    const creatorPlanId = creatorPlanRow?.id;

    if (!packageId && !creatorPlanId) {
      iapError('[StoreKit] ❌ Not a token package or Creator Pro IAP product:', productId);
      return { success: false };
    }

    iapLog('[StoreKit] ✅ Resolved:', { packageId, creatorPlanId });

    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/verify-apple-receipt`;
    const edgeHost = SUPABASE_URL ? new URL(SUPABASE_URL).host : 'unknown';
    iapLog('[StoreKit] 📞 Edge Function URL (verify project matches dashboard):', edgeFunctionUrl);
    iapLog('[StoreKit] 📞 Supabase host:', edgeHost, '- Check this matches your Supabase project in the dashboard');
    iapLog('[StoreKit] 📞 Invoking Edge Function verify-apple-receipt...');
    iapLog('[StoreKit] Request payload:', {
      productId,
      transactionId,
      userId: user.id,
      packageId,
      creatorPlanId,
      receiptLength: receipt?.length || 0,
      hasReceipt: !!receipt,
    });

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      iapError('[StoreKit] ❌ SUPABASE_URL or SUPABASE_ANON_KEY missing - check .env / app config');
      return { success: false };
    }

    const { data: sess } = await supabase.auth.getSession();
    const bearer = sess?.session?.access_token ?? SUPABASE_ANON_KEY;

    const body: Record<string, unknown> = {
      receipt,
      productId,
      transactionId,
      userId: user.id,
    };
    if (packageId) body.packageId = packageId;

    const timeoutMs = 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let data: any = null;
    let error: any = null;

    try {
      iapLog('[StoreKit] 📡 Sending POST to Edge Function...');
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseText = await response.text();
      iapLog('[StoreKit] 📥 Edge Function HTTP status:', response.status, 'body length:', responseText?.length);

      let parsed: any = null;
      try {
        parsed = responseText ? JSON.parse(responseText) : null;
      } catch (_) {
        parsed = null;
      }
      if (response.ok) {
        data = parsed;
      } else {
        error = { message: parsed?.error || responseText || `HTTP ${response.status}`, status: response.status };
      }

      iapLog('[StoreKit] 📥 Edge Function response:', { hasData: !!data, hasError: !!error, data, error });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      error = fetchError;
      iapError('[StoreKit] ❌ Edge Function fetch failed:', fetchError?.message);
      iapError('[StoreKit] ❌ FETCH ERROR:', fetchError?.message, 'URL:', edgeFunctionUrl);
      if (fetchError?.name === 'AbortError') {
        error = { message: 'Receipt verification timeout' };
      }
    }

    if (error) {
      iapError('[StoreKit] ❌ Edge Function error:', error?.message, 'status:', error?.status);
      iapError('[StoreKit] ❌ FULL ERROR:', JSON.stringify(error, null, 2));
      return { success: false };
    }

    // Log full response data (visible on device)
    iapLog('[StoreKit] 📥 Edge Function response received:', {
      success: data?.success,
      message: data?.message,
      error: data?.error,
      statusCode: data?.statusCode,
      tokens: data?.tokens,
      fullResponse: JSON.stringify(data, null, 2),
    });
    
    // Also log to console.error for visibility
    iapLog('[StoreKit] 📥 FULL RESPONSE DATA:', JSON.stringify(data, null, 2));

    if (data?.success) {
      if (data.message === 'Transaction already processed') {
        iapLog('[StoreKit] ✅ Transaction already processed (duplicate purchase)');
        const kind = data.kind === 'creator_pro' ? 'creator_pro' : 'tokens';
        return { success: true, kind };
      }
      const kind = data.kind === 'creator_pro' ? 'creator_pro' : 'tokens';
      iapLog('[StoreKit] ✅ IAP verified:', kind);
      return { success: true, kind };
    }

    if (data?.error) {
      // Log detailed error information (visible on device)
      const errorInfo = {
        error: data.error,
        statusCode: data.statusCode,
        fullResponse: JSON.stringify(data, null, 2),
      };
      
      iapError('[StoreKit] ❌ Receipt verification failed:', errorInfo);
      iapError('[StoreKit] ❌ VERIFICATION ERROR:', JSON.stringify(data, null, 2));
      
      // Log specific error codes for debugging
      if (data.statusCode === 21002) {
        iapError('[StoreKit] ❌ Error 21002: Receipt data malformed or missing');
        iapError('[StoreKit] This usually means the receipt is invalid or corrupted');
        iapError('[StoreKit] Check receipt length and format in logs above');
        iapError('[StoreKit] Receipt length was:', receipt.length);
        iapError('[StoreKit] Receipt preview:', receipt.substring(0, 100));
        iapError('[StoreKit] ❌ ERROR 21002 DETAILS:', {
          receiptLength: receipt.length,
          receiptPreview: receipt.substring(0, 100),
          receiptLastChars: receipt.substring(Math.max(0, receipt.length - 100)),
          productId,
          transactionId,
        });
      }
      
      return { success: false };
    }

    iapError('[StoreKit] ❌ Unexpected response format:', {
      received: JSON.stringify(data, null, 2),
      dataType: typeof data,
      isNull: data === null,
      isUndefined: data === undefined,
    });
    iapError('[StoreKit] ❌ UNEXPECTED RESPONSE:', JSON.stringify(data, null, 2));
    return { success: false };
  } catch (err: any) {
    iapError('[StoreKit] ❌ Receipt verification exception:', err);
    iapError('[StoreKit] Exception details:', {
      message: err.message,
      name: err.name,
      stack: err.stack,
    });
    return { success: false };
  }
};

/** Subscribe to Nomli Creator Pro via App Store (auto-renewable). Resolves when the Store sheet closes; verification runs in the purchase listener. */
export function purchaseCreatorProWithStoreKit(iapProductId: string): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS !== 'ios') {
    return Promise.resolve({ ok: false, error: 'Apple IAP is only available on iOS' });
  }
  addIapProductIdsForFetching([iapProductId]);
  return new Promise((resolve) => {
    if (creatorProPurchaseTimeout) clearTimeout(creatorProPurchaseTimeout);
    creatorProPurchaseResolve = resolve;
    creatorProPendingProductId = iapProductId;
    creatorProPurchaseTimeout = setTimeout(() => {
      if (creatorProPurchaseResolve) {
        creatorProPurchaseResolve({ ok: false, error: 'Purchase timed out' });
        creatorProPurchaseResolve = null;
        creatorProPendingProductId = null;
      }
      creatorProPurchaseTimeout = null;
    }, 120000);

    purchaseTokensWithIAP(iapProductId)
      .then((r) => {
        if (!r.success) {
          settlePendingCreatorProPurchase({ ok: false, error: r.error || 'Purchase failed' });
          return;
        }
        // Do not resolve here: Apple invokes the purchase listener asynchronously after the sheet
        // closes. Resolving early cleared `creatorProPurchaseResolve` so verification success/failure
        // in the listener could not settle the Creator Pro promise (subscriptions looked "broken").
        // `settlePendingCreatorProPurchase` runs from the listener after verify-apple-receipt, or the
        // timeout above fires if nothing arrives.
      })
      .catch((err: any) => {
        settlePendingCreatorProPurchase({
          ok: false,
          error: err?.message || 'Purchase failed',
        });
      });
  });
}

/**
 * Restore previous purchases
 */
export const restorePurchases = async (): Promise<boolean> => {
  try {
    if (Platform.OS !== 'ios') {
      return false;
    }

    if (!isInitialized) {
      await initializeStoreKit();
    }

    const InAppPurchases = getInAppPurchases();
    if (!InAppPurchases) {
      return false;
    }
    
    await InAppPurchases.getPurchaseHistoryAsync();
    iapLog('[StoreKit] ✅ Purchase history restored');
    return true;
  } catch (err: any) {
    iapError('[StoreKit] Restore purchases error:', err);
    return false;
  }
};

/**
 * Clear all pending purchases - finishes any stuck transactions
 * This is useful when purchases get stuck in the payment queue
 */
export const clearPendingPurchases = async (): Promise<{
  success: boolean;
  cleared: number;
  verified: number; // number of purchases actually verified and credited by backend
  errors: string[];
}> => {
  if (Platform.OS !== 'ios') {
    return { success: false, cleared: 0, verified: 0, errors: ['Only available on iOS'] };
  }

  // If there's already a clear in progress, wait for it
  if (clearPendingPurchasesPromise) {
    iapLog('[StoreKit] Clear pending purchases already in progress, waiting...');
    return clearPendingPurchasesPromise;
  }

  // Create the promise and store it
  clearPendingPurchasesPromise = (async () => {
    try {
      iapLog('[StoreKit] 🧹 Starting to clear pending purchases...');

    if (!isInitialized) {
      const initialized = await initializeStoreKit();
      if (!initialized) {
        return { success: false, cleared: 0, verified: 0, errors: ['Failed to initialize StoreKit'] };
      }
    }

    const InAppPurchases = getInAppPurchases();
    if (!InAppPurchases) {
      return { success: false, cleared: 0, verified: 0, errors: ['InAppPurchases module not available'] };
    }

    // Get purchase history - this will return all purchases including pending ones
    // On iOS, this triggers the purchase listener with any pending transactions
    iapLog('[StoreKit] 📜 Fetching purchase history to find pending transactions...');
    const { results, responseCode } = await InAppPurchases.getPurchaseHistoryAsync({
      useGooglePlayCache: false, // Force network request to get latest state
    });

    if (responseCode !== 0) {
      iapLog('[StoreKit] ⚠️ Purchase history fetch returned non-zero response code:', responseCode);
      // Still try to process what we got
    }

    const pendingPurchases = results || [];
    iapLog('[StoreKit] 📦 Found purchases:', pendingPurchases.length);

    let cleared = 0;
    let verified = 0;
    const errors: string[] = [];

    // Process each purchase (including acknowledged ones - we may still need to credit on backend)
    for (const purchase of pendingPurchases) {
      try {
        iapLog('[StoreKit] 🔄 Processing pending purchase:', {
          productId: purchase.productId,
          orderId: purchase.orderId,
          acknowledged: purchase.acknowledged,
        });

        const transactionId = purchase.orderId || purchase.transactionId;
        const transactionReceipt = purchase.transactionReceipt;

        let verifySnapshot: VerifyReceiptResult = { success: false };

        if (transactionReceipt && transactionId && transactionReceipt.length >= 100) {
          iapLog('[StoreKit] 🔍 Verifying pending purchase with backend...');
          verifySnapshot = await verifyReceiptAndCreditTokens(
            transactionReceipt,
            purchase.productId,
            transactionId
          );

          if (verifySnapshot.success) {
            verified++;
            iapLog('[StoreKit] ✅ Pending purchase verified and credited');
          } else {
            iapLog('[StoreKit] ⚠️ Pending purchase verification failed (may already be processed)');
          }
        } else if (purchase.acknowledged) {
          iapLog('[StoreKit] ⏭️ Purchase already acknowledged and no valid receipt - skipping (already finished)');
        } else if (!transactionReceipt || !transactionId) {
          iapLog('[StoreKit] ⚠️ Purchase missing receipt or transactionId - cannot verify');
        }

        if (!purchase.acknowledged) {
          try {
            if (typeof InAppPurchases.finishTransactionAsync === 'function') {
              const consume = verifySnapshot.success ? verifySnapshot.kind !== 'creator_pro' : true;
              await InAppPurchases.finishTransactionAsync(purchase, consume);
              cleared++;
              iapLog('[StoreKit] ✅ Finished transaction:', purchase.productId);
            } else {
              errors.push(`finishTransactionAsync not available for ${purchase.productId}`);
            }
          } catch (finishError: any) {
            const errorMsg = `Failed to finish ${purchase.productId}: ${finishError.message}`;
            errors.push(errorMsg);
            iapError('[StoreKit] ❌ Error finishing transaction:', finishError);
          }
        }
      } catch (err: any) {
        const errorMsg = `Error processing ${purchase.productId}: ${err.message}`;
        errors.push(errorMsg);
        iapError('[StoreKit] ❌ Error processing purchase:', err);
      }
    }

    iapLog('[StoreKit] ✅ Finished clearing pending purchases:', {
      cleared,
      verified,
      total: pendingPurchases.length,
      errors: errors.length,
    });

      return {
        success: errors.length === 0,
        cleared,
        verified,
        errors,
      };
    } catch (err: any) {
      iapError('[StoreKit] ❌ Error clearing pending purchases:', err);
      return {
        success: false,
        cleared: 0,
        verified: 0,
        errors: [err.message || 'Unknown error'],
      };
    } finally {
      // Clear the promise so future calls can proceed
      clearPendingPurchasesPromise = null;
    }
  })();

  return clearPendingPurchasesPromise;
};

/**
 * Disconnect StoreKit (call on app unmount)
 */
export const disconnectStoreKit = async () => {
  if (Platform.OS !== 'ios' || !isInitialized) {
    return;
  }

  try {
    const InAppPurchases = getInAppPurchases();
    if (!InAppPurchases) {
      return;
    }
    
    await InAppPurchases.disconnectAsync();
    isInitialized = false;
    purchaseListener = null;
    errorListener = null;
    iapLog('[StoreKit] Disconnected');
  } catch (error) {
    iapError('[StoreKit] Disconnect error:', error);
  }
};
