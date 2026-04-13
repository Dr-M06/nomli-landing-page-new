import { supabase } from './supabase';
import { SUPABASE_URL } from '../constants/Endpoints';
import { log, warn, error } from './productionLogger';


export interface DailyTokenClaim {
  id: string;
  user_id: string;
  claim_date: string;
  contribution_score: number;
  rank: number | null;
  base_tokens: number;
  bonus_tokens: number;
  total_tokens: number;
  claimed_at: string;
}

export interface ClaimResult {
  success: boolean;
  tokens?: number;
  base_tokens?: number;
  bonus_tokens?: number;
  contribution_score?: number;
  rank?: number | null;
  claim_id?: string;
  error?: string;
  claimed_at?: string;
}

/**
 * Check if user has already claimed tokens today
 */
export const hasClaimedToday = async (userId: string): Promise<boolean> => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const { data, error } = await supabase
      .from('daily_token_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('claim_date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      error('[DailyTokenRewards] Error checking claim status:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    error('[DailyTokenRewards] Error in hasClaimedToday:', error);
    return false;
  }
};

/**
 * Get today's claim status for a user
 */
export const getTodayClaim = async (userId: string): Promise<DailyTokenClaim | null> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('daily_token_claims')
      .select('*')
      .eq('user_id', userId)
      .eq('claim_date', today)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No claim today
      }
      error('[DailyTokenRewards] Error fetching today claim:', error);
      return null;
    }

    return data;
  } catch (error) {
    error('[DailyTokenRewards] Error in getTodayClaim:', error);
    return null;
  }
};

/**
 * Claim daily contributor tokens
 * This function:
 * 1. Calculates user's contribution score (likes + comments) for today
 * 2. Determines their rank
 * 3. Calculates token reward based on score and rank
 * 4. Credits tokens to wallet
 * 5. Records the claim
 * 
 * Can only be called once per day per user.
 * Uses Edge Function to bypass RLS policies.
 */
export const claimDailyTokens = async (userId?: string): Promise<ClaimResult> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;

    if (!targetUserId) {
      return {
        success: false,
        error: 'User not authenticated',
      };
    }

    log('[DailyTokenRewards] Claiming tokens for user:', targetUserId);

    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'No active session',
      };
    }

    // Try Edge Function first (bypasses RLS), fall back to RPC if not deployed
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/claim-daily-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
        },
      });

      // Check if function not found before parsing JSON
      if (response.status === 404) {
        log('[DailyTokenRewards] Edge Function not deployed (404), falling back to RPC');
        throw new Error('EDGE_FUNCTION_NOT_FOUND');
      }

      const result = await response.json();

      // Check for NOT_FOUND error in response body
      if (result.code === 'NOT_FOUND' || result.message?.includes('not found') || result.message?.includes('Requested function was not found')) {
        log('[DailyTokenRewards] Edge Function not deployed (NOT_FOUND), falling back to RPC');
        throw new Error('EDGE_FUNCTION_NOT_FOUND');
      }

      if (!response.ok || !result.success) {
        error('[DailyTokenRewards] Error claiming tokens via Edge Function:', result);
        return {
          success: false,
          error: result.error || 'Failed to claim tokens',
          claimed_at: result.claimed_at,
          tokens: result.tokens,
          contribution_score: result.contribution_score,
          rank: result.rank,
        };
      }

      log('[DailyTokenRewards] ✅ Tokens claimed successfully via Edge Function:', {
        tokens: result.tokens,
        base: result.base_tokens,
        bonus: result.bonus_tokens,
        score: result.contribution_score,
        rank: result.rank,
      });

      return {
        success: true,
        tokens: result.tokens,
        base_tokens: result.base_tokens,
        bonus_tokens: result.bonus_tokens,
        contribution_score: result.contribution_score,
        rank: result.rank,
        claim_id: result.claim_id,
      };
    } catch (edgeFunctionError: any) {
      // Fall back to RPC if Edge Function not available
      if (edgeFunctionError.message === 'EDGE_FUNCTION_NOT_FOUND' || edgeFunctionError.message?.includes('NOT_FOUND')) {
        log('[DailyTokenRewards] Falling back to RPC function');
        
        // Call the database function directly (may fail with RLS error, but worth trying)
        const { data, error } = await supabase.rpc('claim_daily_contributor_tokens', {
          p_user_id: targetUserId,
        });

        if (error) {
          error('[DailyTokenRewards] Error claiming tokens via RPC:', error);
          return {
            success: false,
            error: error.message || 'Failed to claim tokens. Please deploy Edge Functions for full functionality.',
          };
        }

        if (!data) {
          return {
            success: false,
            error: 'No data returned from claim function',
          };
        }

        // Parse the JSON response
        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to claim tokens',
            claimed_at: result.claimed_at,
            tokens: result.tokens,
            contribution_score: result.contribution_score,
            rank: result.rank,
          };
        }

        log('[DailyTokenRewards] ✅ Tokens claimed successfully via RPC:', {
          tokens: result.tokens,
          base: result.base_tokens,
          bonus: result.bonus_tokens,
          score: result.contribution_score,
          rank: result.rank,
        });

        return {
          success: true,
          tokens: result.tokens,
          base_tokens: result.base_tokens,
          bonus_tokens: result.bonus_tokens,
          contribution_score: result.contribution_score,
          rank: result.rank,
          claim_id: result.claim_id,
        };
      }
      
      // Re-throw if it's a different error
      throw edgeFunctionError;
    }
  } catch (error: any) {
    error('[DailyTokenRewards] Error in claimDailyTokens:', error);
    return {
      success: false,
      error: error.message || 'Failed to claim tokens',
    };
  }
};

/**
 * Get user's claim history (last 30 days)
 */
export const getClaimHistory = async (userId: string, limit: number = 30): Promise<DailyTokenClaim[]> => {
  try {
    const { data, error } = await supabase
      .from('daily_token_claims')
      .select('*')
      .eq('user_id', userId)
      .order('claim_date', { ascending: false })
      .limit(limit);

    if (error) {
      error('[DailyTokenRewards] Error fetching claim history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('[DailyTokenRewards] Error in getClaimHistory:', error);
    return [];
  }
};

/**
 * Sync earned tokens balance from daily claims
 */
export const syncEarnedTokensBalance = async (userId: string): Promise<number | null> => {
  try {
    const { data, error } = await supabase.rpc('sync_earned_tokens_balance', {
      p_user_id: userId,
    });

    if (error) {
      error('[DailyTokenRewards] Error syncing earned tokens balance:', error);
      return null;
    }

    return data || 0;
  } catch (error) {
    error('[DailyTokenRewards] Error in syncEarnedTokensBalance:', error);
    return null;
  }
};

/**
 * Redeem earned tokens for airtime/data bundles
 */
export const redeemEarnedTokens = async (
  tokenAmount: number,
  redemptionMethod: string = 'airtime_data',
  payoutDetails: any = {}
): Promise<{ success: boolean; redemptionId?: string; newBalance?: number; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    log('💸 [EARNED_TOKENS] Processing earned tokens redemption:', {
      tokenAmount,
      redemptionMethod,
      userId: user.id
    });

    const { data, error } = await supabase.rpc('redeem_earned_tokens', {
      p_user_id: user.id,
      p_token_amount: tokenAmount,
      p_redemption_method: redemptionMethod,
      p_payout_details: payoutDetails,
    });

    if (error) {
      error('❌ [EARNED_TOKENS] Error processing redemption:', error);
      return { success: false, error: error.message };
    }

    if (!data || !data.success) {
      return { success: false, error: data?.error || 'Redemption failed' };
    }

    log('✅ [EARNED_TOKENS] Earned tokens redemption completed:', data);
    return {
      success: true,
      redemptionId: data.redemption_id,
      newBalance: data.new_balance,
    };
  } catch (error) {
    error('❌ [EARNED_TOKENS] Error in redeemEarnedTokens:', error);
    return { success: false, error: 'Failed to process redemption' };
  }
};

/**
 * Withdraw/revoke a daily token claim
 * This allows users to withdraw their claim before the daily reset
 * Useful to prevent multiple users from claiming first place in one session
 * Uses Edge Function to bypass RLS policies.
 */
export const withdrawDailyClaim = async (userId?: string): Promise<ClaimResult> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;

    if (!targetUserId) {
      return {
        success: false,
        error: 'User not authenticated',
      };
    }

    log('[DailyTokenRewards] Withdrawing claim for user:', targetUserId);

    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'No active session',
      };
    }

    // Try Edge Function first (bypasses RLS), fall back to RPC if not deployed
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/withdraw-daily-claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
        },
      });

      // Check if function not found before parsing JSON
      if (response.status === 404) {
        log('[DailyTokenRewards] Edge Function not deployed (404), falling back to RPC');
        throw new Error('EDGE_FUNCTION_NOT_FOUND');
      }

      const result = await response.json();

      // Check for NOT_FOUND error in response body
      if (result.code === 'NOT_FOUND' || result.message?.includes('not found') || result.message?.includes('Requested function was not found')) {
        log('[DailyTokenRewards] Edge Function not deployed (NOT_FOUND), falling back to RPC');
        throw new Error('EDGE_FUNCTION_NOT_FOUND');
      }

      if (!response.ok || !result.success) {
        error('[DailyTokenRewards] Error withdrawing claim via Edge Function:', result);
        return {
          success: false,
          error: result.error || 'Failed to withdraw claim',
        };
      }

      log('[DailyTokenRewards] ✅ Claim withdrawn successfully via Edge Function:', {
        tokens_withdrawn: result.tokens,
        new_balance: result.new_balance,
      });

      return {
        success: true,
        tokens: result.tokens,
        contribution_score: result.contribution_score,
        rank: result.rank,
      };
    } catch (edgeFunctionError: any) {
      // Fall back to RPC if Edge Function not available
      if (edgeFunctionError.message === 'EDGE_FUNCTION_NOT_FOUND' || edgeFunctionError.message?.includes('NOT_FOUND')) {
        log('[DailyTokenRewards] Falling back to RPC function');
        
        // Call the database function directly (may fail with RLS error, but worth trying)
        const { data, error } = await supabase.rpc('withdraw_daily_contributor_claim', {
          p_user_id: targetUserId,
        });

        if (error) {
          error('[DailyTokenRewards] Error withdrawing claim via RPC:', error);
          return {
            success: false,
            error: error.message || 'Failed to withdraw claim. Please deploy Edge Functions for full functionality.',
          };
        }

        if (!data) {
          return {
            success: false,
            error: 'No data returned from withdraw function',
          };
        }

        // Parse the JSON response
        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to withdraw claim',
          };
        }

        log('[DailyTokenRewards] ✅ Claim withdrawn successfully via RPC:', {
          tokens_withdrawn: result.tokens_withdrawn,
          new_balance: result.new_balance,
        });

        return {
          success: true,
          tokens: result.tokens_withdrawn,
          contribution_score: result.contribution_score,
          rank: result.rank,
        };
      }
      
      // Re-throw if it's a different error
      throw edgeFunctionError;
    }
  } catch (error: any) {
    error('[DailyTokenRewards] Error in withdrawDailyClaim:', error);
    return {
      success: false,
      error: error.message || 'Failed to withdraw claim',
    };
  }
};

/**
 * Get estimated token reward for a given contribution score and rank
 * (Does not claim, just calculates)
 */
export const estimateTokenReward = async (
  contributionScore: number,
  rank: number | null
): Promise<{ base_tokens: number; bonus_tokens: number; total_tokens: number }> => {
  try {
    const { data, error } = await supabase.rpc('calculate_daily_token_reward', {
      p_contribution_score: contributionScore,
      p_rank: rank,
    });

    if (error || !data || data.length === 0) {
      error('[DailyTokenRewards] Error estimating reward:', error);
      return {
        base_tokens: contributionScore > 0 ? 1 : 0,
        bonus_tokens: 0,
        total_tokens: contributionScore > 0 ? 1 : 0,
      };
    }

    return {
      base_tokens: data[0].base_tokens,
      bonus_tokens: data[0].bonus_tokens,
      total_tokens: data[0].total_tokens,
    };
  } catch (error) {
    error('[DailyTokenRewards] Error in estimateTokenReward:', error);
    return {
      base_tokens: contributionScore > 0 ? 1 : 0,
      bonus_tokens: 0,
      total_tokens: contributionScore > 0 ? 1 : 0,
    };
  }
};
