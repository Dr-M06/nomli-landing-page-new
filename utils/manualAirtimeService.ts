import { supabase } from './supabase';
import useAuth from '../hooks/useAuth';
import { log, warn, error } from './productionLogger';


export interface ManualAirtimeRequest {
  username: string;
  phoneNumber: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  amount: number;
  tokenAmount: number;
  redemptionType: 'airtime' | 'data';
  bundleCode?: string;
}

export interface AirtimeRequestRecord {
  id: string;
  user_id: string;
  username: string;
  phone_number: string;
  network: string;
  amount: number;
  token_amount: number;
  redemption_type: 'airtime' | 'data';
  bundle_code?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  processed_by?: string;
  processed_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Submit a manual airtime request (for support to process)
 */
export const submitManualAirtimeRequest = async (
  request: ManualAirtimeRequest,
  userId: string
): Promise<{ success: boolean; requestId?: string; error?: string }> => {
  try {
    log('📱 [MANUAL_AIRTIME] Submitting manual request:', {
      username: request.username,
      phoneNumber: request.phoneNumber,
      network: request.network,
      amount: request.amount,
      tokenAmount: request.tokenAmount,
      redemptionType: request.redemptionType,
    });

    const { data, error } = await supabase
      .from('airtime_requests')
      .insert({
        user_id: userId,
        username: request.username,
        phone_number: request.phoneNumber,
        network: request.network,
        amount: request.amount,
        token_amount: request.tokenAmount,
        redemption_type: request.redemptionType,
        bundle_code: request.bundleCode || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      error('❌ [MANUAL_AIRTIME] Error submitting request:', error);
      return {
        success: false,
        error: error.message || 'Failed to submit airtime request',
      };
    }

    log('✅ [MANUAL_AIRTIME] Request submitted successfully:', data.id);
    return {
      success: true,
      requestId: data.id,
    };
  } catch (error) {
    error('❌ [MANUAL_AIRTIME] Exception submitting request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit request',
    };
  }
};

/**
 * Get user's airtime requests
 */
export const getUserAirtimeRequests = async (
  userId: string
): Promise<AirtimeRequestRecord[]> => {
  try {
    const { data, error } = await supabase
      .from('airtime_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      error('❌ [MANUAL_AIRTIME] Error fetching requests:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('❌ [MANUAL_AIRTIME] Exception fetching requests:', error);
    return [];
  }
};

/**
 * Get all pending airtime requests (admin only)
 */
export const getAllAirtimeRequests = async (
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
): Promise<AirtimeRequestRecord[]> => {
  try {
    let query = supabase
      .from('airtime_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      error('❌ [MANUAL_AIRTIME] Error fetching all requests:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('❌ [MANUAL_AIRTIME] Exception fetching all requests:', error);
    return [];
  }
};

/**
 * Update airtime request status (admin only)
 */
export const updateAirtimeRequestStatus = async (
  requestId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled',
  adminId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const updateData: any = {
      status,
      processed_by: adminId,
      processed_at: new Date().toISOString(),
    };

    if (notes) {
      updateData.notes = notes;
    }

    const { error } = await supabase
      .from('airtime_requests')
      .update(updateData)
      .eq('id', requestId);

    if (error) {
      error('❌ [MANUAL_AIRTIME] Error updating request:', error);
      return {
        success: false,
        error: error.message || 'Failed to update request',
      };
    }

    // If status is completed, deduct tokens from user
    if (status === 'completed') {
      const { data: request } = await supabase
        .from('airtime_requests')
        .select('user_id, token_amount')
        .eq('id', requestId)
        .single();

      if (request) {
        // Deduct tokens using wallet service
        const { redeemTokens } = await import('./walletService');
        await redeemTokens(request.user_id, request.token_amount, 'airtime_manual', {
          request_id: requestId,
        });
      }
    }

    return { success: true };
  } catch (error) {
    error('❌ [MANUAL_AIRTIME] Exception updating request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update request',
    };
  }
};
