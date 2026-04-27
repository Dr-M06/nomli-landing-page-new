import { supabase } from './supabase';
import Constants from 'expo-constants';
import { log, warn, error } from './productionLogger';


export interface PaymentPlan {
  id: string;
  name: string;
  description: string | null;
  price_usd: number;
  price_ngn: number;
  currency: 'USD' | 'NGN';
  token_amount: number;
  bonus_tokens: number;
  total_tokens: number;
  plan_type: 'one_time' | 'recurring';
  interval_type?: string | null;
  interval_count?: number | null;
  stripe_price_id_usd?: string | null;
  stripe_price_id_ngn?: string | null;
  stripe_product_id?: string | null;
  is_active: boolean;
  display_order: number;
  /** discover = dating premium; creator = Nomli Creator Pro; tokens = wallet allowance only */
  plan_category?: 'discover' | 'creator' | 'tokens' | string;
  /** App Store subscription product id when selling Creator Pro via Apple IAP */
  iap_product_id_apple?: string | null;
  /** Google Play subscription SKU for Creator Pro */
  iap_product_id_google?: string | null;
}

export interface CheckoutResponse {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Get all active payment plans
 */
export const getPaymentPlans = async (
  currency?: 'USD' | 'NGN',
  planType?: 'one_time' | 'recurring'
): Promise<PaymentPlan[]> => {
  try {
    let query = supabase
      .from('payment_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (currency) {
      query = query.eq('currency', currency);
    }

    if (planType) {
      query = query.eq('plan_type', planType);
    }

    const { data, error } = await query;

    if (error) {
      error('❌ [STRIPE] Error fetching payment plans:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('❌ [STRIPE] Error in getPaymentPlans:', error);
    return [];
  }
};

/**
 * Create Stripe checkout session
 */
export const createStripeCheckout = async (
  planId: string,
  currency: 'USD' | 'NGN',
  successUrl?: string,
  cancelUrl?: string
): Promise<CheckoutResponse> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                        process.env.EXPO_PUBLIC_SUPABASE_URL || '';

    // Default success/cancel URLs
    const defaultSuccessUrl = `${supabaseUrl.replace('/rest/v1', '')}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${supabaseUrl.replace('/rest/v1', '')}/payment-cancel`;

    const response = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        planId,
        currency,
        userId: user.id,
        successUrl: successUrl || defaultSuccessUrl,
        cancelUrl: cancelUrl || defaultCancelUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      error('❌ [STRIPE] Checkout creation failed:', errorData);
      return { 
        success: false, 
        error: errorData.error || 'Failed to create checkout session' 
      };
    }

    const data = await response.json();
    return {
      success: true,
      checkoutUrl: data.checkoutUrl,
      sessionId: data.sessionId,
    };
  } catch (error) {
    error('❌ [STRIPE] Error in createStripeCheckout:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create checkout' 
    };
  }
};

/**
 * Get user's active subscriptions
 */
export const getUserSubscriptions = async (userId?: string): Promise<any[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;

    if (!targetUserId) {
      return [];
    }

    const { data, error } = await supabase
      .from('user_subscriptions')
      .select(`
        *,
        payment_plans (*)
      `)
      .eq('user_id', targetUserId)
      .in('status', ['active', 'trialing']);

    if (error) {
      error('❌ [STRIPE] Error fetching subscriptions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('❌ [STRIPE] Error in getUserSubscriptions:', error);
    return [];
  }
};

/**
 * Cancel a subscription
 */
export const cancelSubscription = async (subscriptionId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Verify subscription belongs to user
    const { data: subscription, error: fetchError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !subscription) {
      return { success: false, error: 'Subscription not found' };
    }

    // Call Stripe API to cancel subscription
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                        process.env.EXPO_PUBLIC_SUPABASE_URL || '';

    const response = await fetch(`${supabaseUrl}/functions/v1/stripe-cancel-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        subscriptionId: subscription.stripe_subscription_id,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || 'Failed to cancel subscription' };
    }

    return { success: true };
  } catch (error) {
    error('❌ [STRIPE] Error in cancelSubscription:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to cancel subscription' 
    };
  }
};

