import { Platform } from 'react-native';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL } from '../constants/Endpoints';
import { log, warn, error } from './productionLogger';

// Lightweight in-memory pub/sub so UI (e.g. WalletButton) can refresh
// immediately after token balance changes (spends, purchases, gifts, etc).
type WalletChangeListener = () => void;
const walletChangeListeners = new Set<WalletChangeListener>();

export const subscribeWalletChanges = (listener: WalletChangeListener): (() => void) => {
  walletChangeListeners.add(listener);
  return () => walletChangeListeners.delete(listener);
};

export const notifyWalletChanged = (): void => {
  for (const listener of walletChangeListeners) {
    try {
      listener();
    } catch (e) {
      // Never let a listener break wallet updates
      warn('[WalletService] Wallet change listener error:', e);
    }
  }
};


// Cache keys for AsyncStorage
const WALLET_CACHE_KEY_PREFIX = 'user_wallet_cache_';
const WALLET_CACHE_TIMESTAMP_KEY_PREFIX = 'user_wallet_timestamp_';
const PACKAGES_CACHE_KEY = 'token_packages_cache';
const PACKAGES_CACHE_TIMESTAMP_KEY = 'token_packages_timestamp';
const WALLET_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for wallet (balance changes frequently)
const PACKAGES_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for packages (rarely change)

/**
 * Load wallet from persistent cache (AsyncStorage)
 */
const loadCachedWallet = async (userId: string): Promise<UserWallet | null> => {
  try {
    const cacheKey = WALLET_CACHE_KEY_PREFIX + userId;
    const cachedData = await AsyncStorage.getItem(cacheKey);
    const timestampStr = await AsyncStorage.getItem(WALLET_CACHE_TIMESTAMP_KEY_PREFIX + userId);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      // Check if cache is still valid (within 5 minutes)
      if (now - timestamp < WALLET_CACHE_DURATION) {
        log(`[WalletService] Loading wallet from persistent cache (age: ${Math.round((now - timestamp) / 1000)}s)`);
        return JSON.parse(cachedData);
      } else {
        log('[WalletService] Wallet cache expired, clearing...');
        await AsyncStorage.multiRemove([cacheKey, timestampStr]);
      }
    }
  } catch (error) {
    error('[WalletService] Error loading cached wallet:', error);
  }
  return null;
};

/**
 * Save wallet to persistent cache (AsyncStorage)
 */
const saveCachedWallet = async (userId: string, wallet: UserWallet): Promise<void> => {
  try {
    const cacheKey = WALLET_CACHE_KEY_PREFIX + userId;
    const timestampKey = WALLET_CACHE_TIMESTAMP_KEY_PREFIX + userId;
    const now = Date.now();
    
    await AsyncStorage.multiSet([
      [cacheKey, JSON.stringify(wallet)],
      [timestampKey, now.toString()]
    ]);
    
    log(`[WalletService] ✅ Saved wallet to persistent cache for user ${userId.substring(0, 8)}...`);
  } catch (error: any) {
    error('[WalletService] Error saving cached wallet:', error);
    if (error?.message?.includes('quota') || error?.message?.includes('storage')) {
      warn('[WalletService] Storage quota exceeded, skipping wallet cache save...');
    }
  }
};

/**
 * Load packages from persistent cache (AsyncStorage)
 */
const loadCachedPackages = async (): Promise<TokenPackage[] | null> => {
  try {
    const cachedData = await AsyncStorage.getItem(PACKAGES_CACHE_KEY);
    const timestampStr = await AsyncStorage.getItem(PACKAGES_CACHE_TIMESTAMP_KEY);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      // Check if cache is still valid (within 24 hours)
      if (now - timestamp < PACKAGES_CACHE_DURATION) {
        log(`[WalletService] Loading packages from persistent cache (age: ${Math.round((now - timestamp) / 1000 / 60)} minutes)`);
        return JSON.parse(cachedData);
      } else {
        log('[WalletService] Packages cache expired, clearing...');
        await AsyncStorage.multiRemove([PACKAGES_CACHE_KEY, PACKAGES_CACHE_TIMESTAMP_KEY]);
      }
    }
  } catch (error) {
    error('[WalletService] Error loading cached packages:', error);
  }
  return null;
};

/**
 * Save packages to persistent cache (AsyncStorage)
 */
const saveCachedPackages = async (packages: TokenPackage[]): Promise<void> => {
  try {
    const now = Date.now();
    
    await AsyncStorage.multiSet([
      [PACKAGES_CACHE_KEY, JSON.stringify(packages)],
      [PACKAGES_CACHE_TIMESTAMP_KEY, now.toString()]
    ]);
    
    log(`[WalletService] ✅ Saved ${packages.length} packages to persistent cache`);
  } catch (error: any) {
    error('[WalletService] Error saving cached packages:', error);
    if (error?.message?.includes('quota') || error?.message?.includes('storage')) {
      warn('[WalletService] Storage quota exceeded, skipping packages cache save...');
    }
  }
};

export interface TokenPackage {
  id: string;
  name: string;
  description: string | null;
  token_amount: number;
  price_usd: number;
  bonus_tokens: number;
  is_active: boolean;
  display_order: number;
  iap_product_id?: string | null;
}

export interface UserWallet {
  id: string;
  user_id: string;
  token_balance: number;
  total_purchased: number;
  total_redeemed: number;
  earned_tokens_balance?: number; // Total earned tokens available for redemption
  earned_tokens_redeemed?: number; // Total earned tokens already redeemed
  created_at: string;
  updated_at: string;
}

export interface TokenPurchase {
  id: string;
  user_id: string;
  package_id: string | null;
  token_amount: number;
  bonus_tokens: number;
  total_tokens: number;
  price_usd: number;
  payment_method: string | null;
  payment_id: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  created_at: string;
  completed_at: string | null;
}

export interface TokenRedemption {
  id: string;
  streamer_id: string;
  token_amount: number;
  redemption_method: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payout_details: any;
  created_at: string;
  processed_at: string | null;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  transaction_type: 'purchase' | 'gift_sent' | 'gift_received' | 'redemption' | 'refund' | 'bonus' | 'user_credit_sent' | 'user_credit' | string; // Allow string for flexibility
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

// Get user's wallet (with caching)
export const getUserWallet = async (userId?: string, useCache = true): Promise<UserWallet | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;
    
    if (!targetUserId) {
      error('No user ID provided for wallet lookup');
      return null;
    }

    // Check cache first (if enabled)
    if (useCache) {
      const cachedWallet = await loadCachedWallet(targetUserId);
      if (cachedWallet) {
        log('[WalletService] Using cached wallet');
        return cachedWallet;
      }
    }

    // Fetch fresh data
    const { data, error } = await supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    if (error) {
      error('Error fetching user wallet:', error);
      return null;
    }

    // Save to cache in background (non-blocking)
    if (data && useCache) {
      saveCachedWallet(targetUserId, data).catch(err => {
        error('[WalletService] Error saving wallet to cache (non-fatal):', err);
      });
    }

    return data;
  } catch (error) {
    error('Error in getUserWallet:', error);
    return null;
  }
};

/**
 * Get cached wallet synchronously (for immediate display)
 */
export const getCachedWallet = async (userId?: string): Promise<UserWallet | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;
    
    if (!targetUserId) {
      return null;
    }

    return await loadCachedWallet(targetUserId);
  } catch (error) {
    error('[WalletService] Error getting cached wallet:', error);
    return null;
  }
};

// Get available token packages (with caching)
export const getTokenPackages = async (useCache = true): Promise<TokenPackage[]> => {
  try {
    // Check cache first (if enabled)
    if (useCache) {
      const cachedPackages = await loadCachedPackages();
      if (cachedPackages && cachedPackages.length > 0) {
        log(`[WalletService] 🚀 Using ${cachedPackages.length} cached packages`);
        return cachedPackages;
      }
    }

    log('🔍 [WALLET] Fetching token packages...');
    
    const { data, error } = await supabase
      .from('token_packages')
      .select('*')
      .or('is_active.is.null,is_active.eq.true')
      .order('display_order', { ascending: true });

    if (error) {
      error('❌ [WALLET] Error fetching token packages:', error);
      return [];
    }

    // Only log summary, not individual packages (too verbose)
    if (data && data.length > 0) {
      log(`📦 [WALLET] Fetched ${data.length} packages from DB`);
    }

    // Save to cache in background (non-blocking)
    if (data && data.length > 0 && useCache) {
      saveCachedPackages(data).catch(err => {
        error('[WalletService] Error saving packages to cache (non-fatal):', err);
      });
    }

    return data || [];
  } catch (error) {
    error('❌ [WALLET] Error in getTokenPackages:', error);
    return [];
  }
};

/**
 * Get cached packages synchronously (for immediate display)
 */
export const getCachedPackages = async (): Promise<TokenPackage[] | null> => {
  try {
    return await loadCachedPackages();
  } catch (error) {
    error('[WalletService] Error getting cached packages:', error);
    return null;
  }
};

/**
 * Clear wallet cache (useful after balance updates)
 */
export const clearWalletCache = async (userId?: string): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;
    
    if (targetUserId) {
      await AsyncStorage.multiRemove([
        WALLET_CACHE_KEY_PREFIX + targetUserId,
        WALLET_CACHE_TIMESTAMP_KEY_PREFIX + targetUserId
      ]);
      log('[WalletService] Cleared wallet cache');
    }
  } catch (error) {
    error('[WalletService] Error clearing wallet cache:', error);
  }
};

// Process token purchase with Flutterwave, Stripe, or IAP
export const purchaseTokens = async (
  packageId: string,
  paymentProvider?: 'flutterwave' | 'stripe' | 'iap'
): Promise<{ success: boolean; purchaseId?: string; paymentLink?: string; transactionId?: string; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const defaultProvider: 'flutterwave' | 'iap' = Platform.OS === 'ios' ? 'iap' : Platform.OS === 'android' ? 'iap' : 'flutterwave';
    log('💰 [WALLET] Processing token purchase:', {
      packageId,
      paymentProvider: paymentProvider || defaultProvider,
      userId: user.id
    });

    // Use Apple IAP on iOS
    if (Platform.OS === 'ios' && (!paymentProvider || paymentProvider === 'iap')) {
      // Get IAP product ID from package (include name and token_amount for debugging)
      const { data: tokenPackage, error: packageError } = await supabase
        .from('token_packages')
        .select('iap_product_id, name, token_amount, price_usd')
        .eq('id', packageId)
        .eq('is_active', true)
        .single();

      if (packageError || !tokenPackage) {
        error('❌ [WALLET] Package not found:', packageError);
        return { success: false, error: 'Token package not found' };
      }

      if (!tokenPackage.iap_product_id) {
        error('❌ [WALLET] IAP product ID not found for package:', {
          packageId,
          packageName: tokenPackage.name,
          tokenAmount: tokenPackage.token_amount,
          priceUsd: tokenPackage.price_usd
        });
        error('❌ [WALLET] Please run the migration to set iap_product_id for this package');
        return { 
          success: false, 
          error: `IAP product ID not found for package "${tokenPackage.name}". Please contact support or run database migration.` 
        };
      }

      const { purchaseTokensWithIAP } = await import('./storeKitService');
      return await purchaseTokensWithIAP(tokenPackage.iap_product_id);
    }

    // Use Google Play Billing on Android
    if (Platform.OS === 'android' && (!paymentProvider || paymentProvider === 'iap')) {
      const { data: tokenPackage, error: packageError } = await supabase
        .from('token_packages')
        .select('iap_product_id, name, token_amount, price_usd')
        .eq('id', packageId)
        .eq('is_active', true)
        .single();

      if (packageError || !tokenPackage) {
        error('❌ [WALLET] Package not found:', packageError);
        return { success: false, error: 'Token package not found' };
      }

      if (!tokenPackage.iap_product_id) {
        error('❌ [WALLET] IAP product ID not found for package:', tokenPackage.name);
        return { success: false, error: `IAP product ID not found for package "${tokenPackage.name}".` };
      }

      const { purchaseTokensWithGooglePlay } = await import('./googlePlayBillingService');
      const result = await purchaseTokensWithGooglePlay(tokenPackage.iap_product_id);
      if (result.success) {
        return { success: true };
      }
      return { success: false, error: result.error || 'Purchase failed' };
    }

    // Get token package details for Flutterwave/Stripe
    const { data: tokenPackage, error: packageError } = await supabase
      .from('token_packages')
      .select('*')
      .eq('id', packageId)
      .eq('is_active', true)
      .single();

    if (packageError || !tokenPackage) {
      error('❌ [WALLET] Package not found:', packageError);
      return { success: false, error: 'Token package not found' };
    }

    // Get user profile for payment
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, username')
      .eq('id', user.id)
      .single();

    const userEmail = profile?.email || user.email || '';
    const userName = profile?.full_name || profile?.username || 'User';

    // Convert USD to Naira (approximate rate, you may want to use a currency API)
    const exchangeRate = 1500; // 1 USD = 1500 NGN (update with real-time rate)
    const amountNGN = Math.ceil(tokenPackage.price_usd * exchangeRate);

    if (paymentProvider === 'flutterwave') {
      // Use Flutterwave for payment
      const { initializeFlutterwavePayment } = await import('./flutterwaveService');
      
      const paymentRequest = {
        packageId: tokenPackage.id,
        packageName: tokenPackage.name,
        tokenAmount: tokenPackage.token_amount,
        bonusTokens: tokenPackage.bonus_tokens || 0,
        totalTokens: tokenPackage.token_amount + (tokenPackage.bonus_tokens || 0),
        amount: amountNGN,
        userEmail,
        userName,
        userId: user.id,
      };

      const result = await initializeFlutterwavePayment(paymentRequest);
      
      if (result.success && result.paymentLink) {
        return {
          success: true,
          paymentLink: result.paymentLink,
          transactionId: result.transactionId,
        };
      }

      return { success: false, error: result.error || 'Failed to initialize payment' };
    }

    // Fallback to old method for other providers
    const paymentId = 'mock_payment_' + Date.now();
    const { data, error } = await supabase.rpc('process_token_purchase', {
      p_user_id: user.id,
      p_package_id: packageId,
      p_payment_id: paymentId,
      p_payment_method: paymentProvider
    });

    if (error) {
      error('❌ [WALLET] Error processing purchase:', error);
      return { success: false, error: error.message };
    }

    log('✅ [WALLET] Token purchase completed:', data);
    return { success: true, purchaseId: data };
  } catch (error) {
    error('❌ [WALLET] Error in purchaseTokens:', error);
    return { success: false, error: 'Failed to process purchase' };
  }
};

// Process token redemption
export const redeemTokens = async (
  tokenAmount: number,
  redemptionMethod: string,
  payoutDetails: any
): Promise<{ success: boolean; redemptionId?: string; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    log('💸 [WALLET] Processing token redemption:', {
      tokenAmount,
      redemptionMethod,
      payoutDetails,
      userId: user.id
    });

    // Call the database function to process the redemption
    const { data, error } = await supabase.rpc('process_token_redemption', {
      p_streamer_id: user.id,
      p_token_amount: tokenAmount,
      p_redemption_method: redemptionMethod,
      p_payout_details: { details: payoutDetails, method: redemptionMethod }
    });

    if (error) {
      error('❌ [WALLET] Error processing redemption:', error);
      return { success: false, error: error.message };
    }

    log('✅ [WALLET] Token redemption completed:', data);
    return { success: true, redemptionId: data };
  } catch (error) {
    error('❌ [WALLET] Error in redeemTokens:', error);
    return { success: false, error: 'Failed to process redemption' };
  }
};

// Get wallet transactions
export const getWalletTransactions = async (
  userId?: string,
  limit: number = 50
): Promise<WalletTransaction[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;
    
    if (!targetUserId) {
      error('No user ID provided for transaction lookup');
      return [];
    }

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      error('Error fetching wallet transactions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('Error in getWalletTransactions:', error);
    return [];
  }
};

// Get token purchases
export const getTokenPurchases = async (
  userId?: string,
  limit: number = 20
): Promise<TokenPurchase[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;
    
    if (!targetUserId) {
      error('No user ID provided for purchase lookup');
      return [];
    }

    const { data, error } = await supabase
      .from('token_purchases')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      error('Error fetching token purchases:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('Error in getTokenPurchases:', error);
    return [];
  }
};

// Get token redemptions
export const getTokenRedemptions = async (
  userId?: string,
  limit: number = 20
): Promise<TokenRedemption[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;
    
    if (!targetUserId) {
      error('No user ID provided for redemption lookup');
      return [];
    }

    const { data, error } = await supabase
      .from('token_redemptions')
      .select('*')
      .eq('streamer_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      error('Error fetching token redemptions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('Error in getTokenRedemptions:', error);
    return [];
  }
};

// Update wallet balance (for internal use)
// Uses Edge Function to bypass RLS policies that prevent direct SQL updates
export const updateWalletBalance = async (
  userId: string,
  amount: number,
  transactionType: string,
  referenceId?: string,
  description?: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> => {
  try {
    log('💰 [WALLET] Updating balance via Edge Function:', { userId, amount, transactionType, description });
    
    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      error('❌ [WALLET] No active session');
      return { success: false, error: 'No active session' };
    }

    // Call Edge Function to update wallet balance
    const response = await fetch(`${SUPABASE_URL}/functions/v1/update-wallet-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        userId,
        amount,
        transactionType,
        referenceId,
        description,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      error('❌ [WALLET] Edge Function error:', result);
      return { success: false, error: result.error || 'Failed to update wallet balance' };
    }

    log('✅ [WALLET] Balance updated successfully via Edge Function:', { newBalance: result.newBalance, transactionType });
    
    // Clear wallet cache after successful update
    await clearWalletCache(userId);
    
    return { success: true, newBalance: result.newBalance };
  } catch (error) {
    error('❌ [WALLET] Error in updateWalletBalance:', error);
    return { success: false, error: 'Failed to update wallet balance' };
  }
};
