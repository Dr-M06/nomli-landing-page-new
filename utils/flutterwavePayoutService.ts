import { supabase } from './supabase';
import Constants from 'expo-constants';
import { log, warn, error } from './productionLogger';


export interface PayoutLimits {
  user_tier: string;
  currency: 'NGN' | 'USD';
  min_payout_amount: number;
  max_payout_amount: number;
  daily_limit: number;
  monthly_limit: number;
  max_transactions_per_day: number;
  token_to_cash_rate: number;
  transaction_fee: number;
  transaction_fee_percentage: number;
}

export interface PayoutTracking {
  daily_payout_amount: number;
  daily_transaction_count: number;
  monthly_payout_amount: number;
  monthly_transaction_count: number;
  last_payout_date: string | null;
}

export interface TransferRequest {
  tokenAmount: number;
  currency: 'NGN' | 'USD';
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  narration?: string;
}

export interface TransferResponse {
  success: boolean;
  transferId?: string;
  amount?: number;
  currency?: string;
  fees?: number;
  status?: string;
  error?: string;
}

/**
 * Get payout limits for current user
 */
export const getPayoutLimits = async (currency: 'NGN' | 'USD' = 'NGN'): Promise<PayoutLimits | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    // Get user profile to determine tier
    const { data: profile } = await supabase
      .from('profiles')
      .select('payout_tier')
      .eq('id', user.id)
      .single();

    const userTier = profile?.payout_tier || 'tier1';

    // Get payout limits
    const { data, error } = await supabase
      .from('payout_limits')
      .select('*')
      .eq('user_tier', userTier)
      .eq('currency', currency)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      error('❌ [PAYOUT] Error fetching limits:', error);
      return null;
    }

    return data;
  } catch (error) {
    error('❌ [PAYOUT] Error in getPayoutLimits:', error);
    return null;
  }
};

/**
 * Get user payout tracking
 */
export const getPayoutTracking = async (currency: 'NGN' | 'USD' = 'NGN'): Promise<PayoutTracking | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('user_payout_tracking')
      .select('*')
      .eq('user_id', user.id)
      .eq('currency', currency)
      .single();

    if (error && error.code !== 'PGRST116') {
      error('❌ [PAYOUT] Error fetching tracking:', error);
      return null;
    }

    if (!data) {
      // Return default tracking if not found
      return {
        daily_payout_amount: 0,
        daily_transaction_count: 0,
        monthly_payout_amount: 0,
        monthly_transaction_count: 0,
        last_payout_date: null,
      };
    }

    return {
      daily_payout_amount: data.daily_payout_amount || 0,
      daily_transaction_count: data.daily_transaction_count || 0,
      monthly_payout_amount: data.monthly_payout_amount || 0,
      monthly_transaction_count: data.monthly_transaction_count || 0,
      last_payout_date: data.last_payout_date,
    };
  } catch (error) {
    error('❌ [PAYOUT] Error in getPayoutTracking:', error);
    return null;
  }
};

/**
 * Calculate payout amount from tokens
 */
export const calculatePayoutAmount = (
  tokenAmount: number,
  limits: PayoutLimits
): { cashAmount: number; fees: number; payoutAmount: number } => {
  const cashAmount = tokenAmount * limits.token_to_cash_rate;
  const fixedFee = limits.transaction_fee || 0;
  const percentageFee = (cashAmount * (limits.transaction_fee_percentage || 0)) / 100;
  const totalFees = fixedFee + percentageFee;
  const payoutAmount = cashAmount - totalFees;

  return {
    cashAmount,
    fees: totalFees,
    payoutAmount,
  };
};

/**
 * Validate payout request
 */
export const validatePayoutRequest = async (
  tokenAmount: number,
  currency: 'NGN' | 'USD',
  limits: PayoutLimits,
  tracking: PayoutTracking | null
): Promise<{ valid: boolean; error?: string }> => {
  // Calculate amounts
  const { cashAmount, payoutAmount } = calculatePayoutAmount(tokenAmount, limits);

  // Check minimum
  if (payoutAmount < limits.min_payout_amount) {
    return {
      valid: false,
      error: `Minimum payout is ${currency} ${limits.min_payout_amount.toFixed(2)}`,
    };
  }

  // Check maximum
  if (cashAmount > limits.max_payout_amount) {
    return {
      valid: false,
      error: `Maximum payout is ${currency} ${limits.max_payout_amount.toFixed(2)}`,
    };
  }

  // Check daily limits
  if (tracking) {
    const today = new Date().toISOString().split('T')[0];
    const isToday = tracking.last_payout_date === today;

    const dailyAmount = isToday ? tracking.daily_payout_amount : 0;
    const dailyCount = isToday ? tracking.daily_transaction_count : 0;

    if (dailyAmount + cashAmount > limits.daily_limit) {
      const remaining = limits.daily_limit - dailyAmount;
      return {
        valid: false,
        error: `Daily limit exceeded. Remaining: ${currency} ${remaining.toFixed(2)}`,
      };
    }

    if (dailyCount >= limits.max_transactions_per_day) {
      return {
        valid: false,
        error: 'Daily transaction limit reached',
      };
    }

    // Check monthly limits
    if (tracking.monthly_payout_amount + cashAmount > limits.monthly_limit) {
      const remaining = limits.monthly_limit - tracking.monthly_payout_amount;
      return {
        valid: false,
        error: `Monthly limit exceeded. Remaining: ${currency} ${remaining.toFixed(2)}`,
      };
    }
  }

  return { valid: true };
};

/**
 * Initiate Flutterwave transfer
 */
export const initiatePayout = async (request: TransferRequest): Promise<TransferResponse> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Get limits and tracking
    const [limits, tracking] = await Promise.all([
      getPayoutLimits(request.currency),
      getPayoutTracking(request.currency),
    ]);

    if (!limits) {
      return { success: false, error: 'Payout limits not configured' };
    }

    // Validate request
    const validation = await validatePayoutRequest(
      request.tokenAmount,
      request.currency,
      limits,
      tracking
    );

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Get user session
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                        process.env.EXPO_PUBLIC_SUPABASE_URL || '';

    // Call Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/flutterwave-transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        error: errorData.error || 'Failed to initiate payout' 
      };
    }

    const data = await response.json();
    return {
      success: true,
      transferId: data.transferId,
      amount: data.amount,
      currency: data.currency,
      fees: data.fees,
      status: data.status,
    };
  } catch (error) {
    error('❌ [PAYOUT] Error in initiatePayout:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to initiate payout' 
    };
  }
};

/**
 * Get Nigerian bank codes
 */
export const NIGERIAN_BANKS = [
  { code: '044', name: 'Access Bank' },
  { code: '063', name: 'Access Bank (Diamond)' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '030', name: 'Heritage Bank' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '526', name: 'Parallex Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'Suntrust Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank For Africa' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
];

/**
 * Verify bank account
 */
export const verifyBankAccount = async (
  bankCode: string,
  accountNumber: string
): Promise<{ success: boolean; accountName?: string; error?: string }> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                        process.env.EXPO_PUBLIC_SUPABASE_URL || '';

    // Call Edge Function to verify account (you'll need to create this)
    const response = await fetch(`${supabaseUrl}/functions/v1/flutterwave-verify-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        bank_code: bankCode,
        account_number: accountNumber,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || 'Verification failed' };
    }

    const data = await response.json();
    return {
      success: true,
      accountName: data.account_name,
    };
  } catch (error) {
    error('❌ [PAYOUT] Error verifying account:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Verification failed' 
    };
  }
};

