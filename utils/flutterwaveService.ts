import { supabase } from './supabase';
import Constants from 'expo-constants';
import { log, warn, error } from './productionLogger';


/**
 * Flutterwave Payment Service
 * Handles token purchases via Flutterwave for Nigerian users
 */

/** Client-safe config: only public key. Secret/encryption keys stay server-side (Edge Functions). */
export interface FlutterwaveConfig {
  publicKey: string;
  currency: string;
  country: string;
}

export interface PaymentRequest {
  packageId: string;
  packageName: string;
  tokenAmount: number;
  bonusTokens: number;
  totalTokens: number;
  amount: number; // Amount in Naira
  userEmail: string;
  userName: string;
  userId: string;
}

export interface PaymentResponse {
  success: boolean;
  paymentLink?: string;
  transactionId?: string;
  error?: string;
}

/**
 * Get Flutterwave configuration from environment (client-safe: public key only).
 * Payment creation/verification use Edge Functions; secret keys never leave the server.
 */
const getFlutterwaveConfig = (): FlutterwaveConfig => {
  const publicKey = Constants.expoConfig?.extra?.flutterwavePublicKey ||
                    process.env.EXPO_PUBLIC_FLUTTERWAVE_PUBLIC_KEY || '';

  if (!publicKey) {
    warn('⚠️ Flutterwave public key not configured. Payments may be unavailable.');
  }

  return {
    publicKey,
    currency: 'NGN',
    country: 'NG',
  };
};

/**
 * Initialize Flutterwave payment
 * Creates a payment link that user can complete
 */
export const initializeFlutterwavePayment = async (
  request: PaymentRequest
): Promise<PaymentResponse> => {
  try {
    log('💰 [FLUTTERWAVE] Initializing payment:', {
      packageId: request.packageId,
      amount: request.amount,
      userId: request.userId,
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Generate unique transaction reference
    const txRef = `nomli_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create payment record in database (pending status)
    const { data: purchaseRecord, error: purchaseError } = await supabase
      .from('token_purchases')
      .insert({
        user_id: user.id,
        package_id: request.packageId,
        token_amount: request.tokenAmount,
        bonus_tokens: request.bonusTokens,
        total_tokens: request.totalTokens,
        price_usd: request.amount / 1500, // Approximate USD conversion (adjust as needed)
        payment_method: 'flutterwave',
        payment_id: txRef,
        status: 'pending',
      })
      .select()
      .single();

    if (purchaseError) {
      error('❌ [FLUTTERWAVE] Error creating purchase record:', purchaseError);
      return { success: false, error: 'Failed to create purchase record' };
    }

    // Call Supabase Edge Function to create Flutterwave payment
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                        process.env.EXPO_PUBLIC_SUPABASE_URL || '';

    // Use minimal redirect URL - Flutterwave requires a redirect URL
    // The webhook handles payment processing, polling will detect completion when user returns to app
    // For native apps, user will just close the browser and return to app
    let baseUrl = supabaseUrl;
    if (baseUrl.includes('/rest/v1')) {
      baseUrl = baseUrl.replace('/rest/v1', '');
    }
    const redirectUrl = `${baseUrl}/functions/v1/flutterwave-payment-callback?tx_ref=${encodeURIComponent(txRef)}`;
    
    log('🔗 [FLUTTERWAVE] Redirect URL:', redirectUrl);

    const response = await fetch(`${supabaseUrl}/functions/v1/flutterwave-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: request.amount,
        currency: 'NGN',
        customer: {
          email: request.userEmail,
          name: request.userName,
        },
        customizations: {
          title: 'Nomli Mingle Token Purchase',
          description: `Purchase ${request.totalTokens} tokens (${request.tokenAmount} + ${request.bonusTokens} bonus)`,
          logo: 'https://your-logo-url.com/logo.png', // Update with your logo URL
        },
        meta: {
          user_id: user.id,
          purchase_id: purchaseRecord.id,
          package_id: request.packageId,
          token_amount: request.tokenAmount,
          bonus_tokens: request.bonusTokens,
          total_tokens: request.totalTokens,
        },
        redirect_url: redirectUrl, // HTTP URL that Flutterwave can redirect to
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      error('❌ [FLUTTERWAVE] Error from edge function:', errorData);
      return { success: false, error: errorData.error || 'Failed to initialize payment' };
    }

    const data = await response.json();
    
    if (data.success && data.paymentLink) {
      log('✅ [FLUTTERWAVE] Payment initialized successfully:', data.transactionId);
      return {
        success: true,
        paymentLink: data.paymentLink,
        transactionId: txRef,
      };
    }

    return { success: false, error: data.error || 'Failed to get payment link' };
  } catch (error) {
    error('❌ [FLUTTERWAVE] Error initializing payment:', error);
    return { success: false, error: 'Failed to initialize payment' };
  }
};

/**
 * Verify payment status
 * Called after user completes payment to check if it was successful
 */
export const verifyFlutterwavePayment = async (
  transactionId: string
): Promise<{ success: boolean; verified: boolean; error?: string }> => {
  try {
    log('🔍 [FLUTTERWAVE] Verifying payment:', transactionId);

    // First, check database directly (faster and more reliable)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: purchase } = await supabase
        .from('token_purchases')
        .select('status')
        .eq('payment_id', transactionId)
        .eq('user_id', user.id)
        .single();

      if (purchase && purchase.status === 'completed') {
        log('✅ [FLUTTERWAVE] Payment already completed in database');
        return { success: true, verified: true };
      }
    }

    // If not in DB, verify with Edge Function
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                        process.env.EXPO_PUBLIC_SUPABASE_URL || '';

    const response = await fetch(`${supabaseUrl}/functions/v1/flutterwave-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        tx_ref: transactionId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      error('❌ [FLUTTERWAVE] Verification error:', errorData);
      return { success: false, verified: false, error: errorData.error || 'Verification failed' };
    }

    const data = await response.json();
    log('📊 [FLUTTERWAVE] Verification result:', { verified: data.verified, alreadyProcessed: data.alreadyProcessed });
    
    return {
      success: true,
      verified: data.verified || false,
    };
  } catch (error) {
    error('❌ [FLUTTERWAVE] Error verifying payment:', error);
    return { success: false, verified: false, error: 'Verification failed' };
  }
};

/**
 * Get supported payment methods for Nigeria
 */
export const getSupportedPaymentMethods = () => {
  return [
    { id: 'card', name: 'Card', description: 'Visa, Mastercard, Verve' },
    { id: 'bank', name: 'Bank Transfer', description: 'Direct bank transfer' },
    { id: 'ussd', name: 'USSD', description: 'Mobile banking USSD' },
    { id: 'mobile_money', name: 'Mobile Money', description: 'MTN, Airtel, Glo' },
  ];
};

