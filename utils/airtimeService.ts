import { supabase } from './supabase';
import Constants from 'expo-constants';
import { log, warn, error } from './productionLogger';


export interface AirtimeRequest {
  phoneNumber: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  amount: number; // Amount in NGN
  currency?: 'NGN';
}

export interface DataBundleRequest {
  phoneNumber: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  bundleCode: string; // Bundle code from network provider
  amount: number; // Amount in NGN
  currency?: 'NGN';
}

export interface AirtimeResponse {
  success: boolean;
  transactionId?: string;
  reference?: string;
  amount?: number;
  phoneNumber?: string;
  network?: string;
  status?: 'success' | 'pending' | 'failed';
  message?: string;
  error?: string;
}

export interface NetworkBundle {
  code: string;
  name: string;
  amount: number; // Price in NGN
  dataSize: string; // e.g., "1GB", "2.5GB", "500MB"
  validity?: string; // e.g., "30 days"
}

// Network-specific data bundle codes
// Only 1GB bundle available: 500 tokens = 1GB
export const NETWORK_BUNDLES: Record<string, NetworkBundle[]> = {
  MTN: [
    { code: 'MTN-1GB-30', name: '1GB', amount: 500, dataSize: '1GB', validity: '30 days' }, // 500 tokens
  ],
  AIRTEL: [
    { code: 'AIRTEL-1GB-30', name: '1GB', amount: 500, dataSize: '1GB', validity: '30 days' }, // 500 tokens
  ],
  GLO: [
    { code: 'GLO-1GB-30', name: '1GB', amount: 500, dataSize: '1GB', validity: '30 days' }, // 500 tokens
  ],
  '9MOBILE': [
    { code: '9MOBILE-1GB-30', name: '1GB', amount: 500, dataSize: '1GB', validity: '30 days' }, // 500 tokens
  ],
};

/**
 * Purchase airtime (mobile top-up)
 */
export const purchaseAirtime = async (
  request: AirtimeRequest,
  tokenAmount: number,
  userId: string
): Promise<AirtimeResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                        process.env.EXPO_PUBLIC_SUPABASE_URL || '';

    log('📱 [AIRTIME] Purchasing airtime:', {
      phoneNumber: request.phoneNumber,
      network: request.network,
      amount: request.amount,
      tokenAmount,
    });

    // Call Edge Function to process airtime purchase
    const response = await fetch(`${supabaseUrl}/functions/v1/flutterwave-airtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        phone_number: request.phoneNumber,
        network: request.network,
        amount: request.amount,
        currency: request.currency || 'NGN',
        token_amount: tokenAmount,
        user_id: userId,
        redemption_type: 'airtime',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        error: errorData.error || 'Failed to purchase airtime' 
      };
    }

    const data = await response.json();
    return {
      success: true,
      transactionId: data.transaction_id,
      reference: data.reference,
      amount: data.amount,
      phoneNumber: data.phone_number,
      network: data.network,
      status: data.status || 'pending',
      message: data.message,
    };
  } catch (error) {
    error('❌ [AIRTIME] Error purchasing airtime:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to purchase airtime' 
    };
  }
};

/**
 * Purchase data bundle
 */
export const purchaseDataBundle = async (
  request: DataBundleRequest,
  tokenAmount: number,
  userId: string
): Promise<AirtimeResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                        process.env.EXPO_PUBLIC_SUPABASE_URL || '';

    log('📱 [DATA] Purchasing data bundle:', {
      phoneNumber: request.phoneNumber,
      network: request.network,
      bundleCode: request.bundleCode,
      amount: request.amount,
      tokenAmount,
    });

    // Call Edge Function to process data bundle purchase
    const response = await fetch(`${supabaseUrl}/functions/v1/flutterwave-airtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        phone_number: request.phoneNumber,
        network: request.network,
        bundle_code: request.bundleCode,
        amount: request.amount,
        currency: request.currency || 'NGN',
        token_amount: tokenAmount,
        user_id: userId,
        redemption_type: 'data',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        error: errorData.error || 'Failed to purchase data bundle' 
      };
    }

    const data = await response.json();
    return {
      success: true,
      transactionId: data.transaction_id,
      reference: data.reference,
      amount: data.amount,
      phoneNumber: data.phone_number,
      network: data.network,
      status: data.status || 'pending',
      message: data.message,
    };
  } catch (error) {
    error('❌ [DATA] Error purchasing data bundle:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to purchase data bundle' 
    };
  }
};

/**
 * Validate phone number format (Nigeria)
 */
export const validatePhoneNumber = (phoneNumber: string): { valid: boolean; network?: string; formatted?: string; error?: string } => {
  // Remove spaces, dashes, and other characters
  const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // Check if starts with country code
  let number = cleaned;
  if (cleaned.startsWith('+234')) {
    number = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('234')) {
    number = '0' + cleaned.slice(3);
  }
  
  // Must be 11 digits starting with 0
  if (!/^0\d{10}$/.test(number)) {
    return { valid: false, error: 'Invalid phone number format. Use: 08012345678' };
  }
  
  // Detect network from first 4 digits
  const prefix = number.substring(0, 4);
  let network: string | undefined;
  
  // MTN: 0803, 0806, 0703, 0706, 0813, 0816, 0810, 0814, 0903, 0906
  if (['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906'].includes(prefix)) {
    network = 'MTN';
  }
  // Airtel: 0802, 0808, 0708, 0812, 0901, 0902, 0904, 0907
  else if (['0802', '0808', '0708', '0812', '0901', '0902', '0904', '0907'].includes(prefix)) {
    network = 'AIRTEL';
  }
  // Glo: 0805, 0807, 0705, 0815, 0811, 0905
  else if (['0805', '0807', '0705', '0815', '0811', '0905'].includes(prefix)) {
    network = 'GLO';
  }
  // 9mobile: 0809, 0817, 0818, 0908, 0909
  else if (['0809', '0817', '0818', '0908', '0909'].includes(prefix)) {
    network = '9MOBILE';
  }
  
  if (!network) {
    return { valid: false, error: 'Unable to detect network. Please select network manually.' };
  }
  
  return { valid: true, network, formatted: number };
};

/**
 * Get available data bundles for a network
 */
export const getDataBundles = (network: string): NetworkBundle[] => {
  return NETWORK_BUNDLES[network.toUpperCase()] || [];
};

/**
 * Calculate tokens needed for airtime amount
 * For airtime: 1 token = ₦15, so amount / 15 = tokens needed
 */
export const calculateTokensForAmount = (amount: number): number => {
  return Math.ceil(amount / 15);
};

/**
 * Calculate amount from tokens (for airtime)
 * For airtime: 1 token = ₦15
 */
export const calculateAmountFromTokens = (tokens: number): number => {
  return tokens * 15;
};

/**
 * Calculate tokens needed for data bundle
 * For data: 500 tokens = 1GB, so 1 token = 0.002GB = 2MB
 * Bundle size in GB * 500 = tokens needed
 */
export const calculateTokensForDataBundle = (dataSizeGB: number): number => {
  return Math.ceil(dataSizeGB * 500);
};

/**
 * Calculate data size from tokens
 * For data: 500 tokens = 1GB, so tokens / 500 = GB
 */
export const calculateDataSizeFromTokens = (tokens: number): number => {
  return tokens / 500;
};
