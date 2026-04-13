import { supabase } from './supabase';
import { updateWalletBalance } from './walletService';
import { log, warn, error } from './productionLogger';


/**
 * Livestream Penny Token Reward System
 * 
 * Rewards livestream creators with penny tokens (not full tokens) based on viewer count:
 * - Only streams with 10+ viewers are eligible
 * - Credits 1 penny token per viewer above 10, every 5 minutes
 * - 1 penny token = $0.01 (1 token = 1 penny)
 * - Example: 15 viewers = 5 penny tokens per 5 minutes
 * - Designed to accumulate slowly over time (takes forever to accumulate)
 * 
 * Note: These are PENNY tokens, not full tokens. The system credits pennies directly.
 */

const REWARD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_VIEWERS_FOR_REWARD = 10; // Minimum viewers to start earning
const PENNIES_PER_VIEWER_PER_INTERVAL = 1; // 1 penny token per viewer above threshold per interval

interface StreamReward {
  streamId: string;
  streamerId: string;
  viewerCount: number;
  eligibleViewers: number; // Viewers above threshold
  rewardAmount: number; // Total pennies to credit
}

interface RewardRecord {
  stream_id: string;
  streamer_id: string;
  viewer_count: number;
  reward_amount: number;
  credited_at: string;
}

/**
 * Calculate reward amount for a stream based on viewer count
 */
const calculateReward = (viewerCount: number): { eligibleViewers: number; rewardAmount: number } => {
  if (viewerCount < MIN_VIEWERS_FOR_REWARD) {
    return { eligibleViewers: 0, rewardAmount: 0 };
  }
  
  const eligibleViewers = viewerCount - MIN_VIEWERS_FOR_REWARD;
  const rewardAmount = eligibleViewers * PENNIES_PER_VIEWER_PER_INTERVAL;
  
  return { eligibleViewers, rewardAmount };
};

/**
 * Get all active livestreams with their current viewer counts
 */
const getActiveStreams = async (): Promise<StreamReward[]> => {
  try {
    const { data: streams, error } = await supabase
      .from('live_streams')
      .select('id, streamer_id, viewer_count')
      .eq('is_live', true)
      .is('ended_at', null)
      .gte('viewer_count', MIN_VIEWERS_FOR_REWARD); // Only streams with 10+ viewers
    
    if (error) {
      error('❌ [LIVESTREAM_REWARDS] Error fetching active streams:', error);
      return [];
    }
    
    if (!streams || streams.length === 0) {
      return [];
    }
    
    const rewards: StreamReward[] = streams
      .map(stream => {
        const { eligibleViewers, rewardAmount } = calculateReward(stream.viewer_count || 0);
        
        if (rewardAmount <= 0) {
          return null;
        }
        
        return {
          streamId: stream.id,
          streamerId: stream.streamer_id,
          viewerCount: stream.viewer_count || 0,
          eligibleViewers,
          rewardAmount,
        };
      })
      .filter((reward): reward is StreamReward => reward !== null);
    
    return rewards;
  } catch (error) {
    error('❌ [LIVESTREAM_REWARDS] Error in getActiveStreams:', error);
    return [];
  }
};

/**
 * Check if reward was already credited in the last interval to prevent duplicates
 */
const wasRewardCreditedRecently = async (streamId: string): Promise<boolean> => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - REWARD_INTERVAL_MS).toISOString();
    
    const { data, error } = await supabase
      .from('live_stream_rewards')
      .select('id')
      .eq('stream_id', streamId)
      .gte('credited_at', fiveMinutesAgo)
      .limit(1);
    
    if (error) {
      error('❌ [LIVESTREAM_REWARDS] Error checking recent rewards:', error);
      // If table doesn't exist, return false to allow first reward
      return false;
    }
    
    return (data?.length || 0) > 0;
  } catch (error) {
    error('❌ [LIVESTREAM_REWARDS] Error in wasRewardCreditedRecently:', error);
    return false;
  }
};

/**
 * Record reward credit in database
 */
const recordRewardCredit = async (reward: StreamReward): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('live_stream_rewards')
      .insert({
        stream_id: reward.streamId,
        streamer_id: reward.streamerId,
        viewer_count: reward.viewerCount,
        reward_amount: reward.rewardAmount,
        credited_at: new Date().toISOString(),
      });
    
    if (error) {
      error('❌ [LIVESTREAM_REWARDS] Error recording reward:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    error('❌ [LIVESTREAM_REWARDS] Error in recordRewardCredit:', error);
    return false;
  }
};

/**
 * Credit wallet for a stream reward
 */
const creditStreamReward = async (reward: StreamReward): Promise<boolean> => {
  try {
    log(`💰 [LIVESTREAM_REWARDS] Crediting ${reward.rewardAmount} penny tokens to streamer ${reward.streamerId} for stream ${reward.streamId} (${reward.viewerCount} viewers, ${reward.eligibleViewers} eligible)`);
    
    // Credit wallet with penny tokens (1 penny token = $0.01)
    const result = await updateWalletBalance(
      reward.streamerId,
      reward.rewardAmount, // This is in penny tokens (not full tokens)
      'livestream_reward',
      reward.streamId,
      `Livestream reward: ${reward.eligibleViewers} viewers × ${PENNIES_PER_VIEWER_PER_INTERVAL} penny token = ${reward.rewardAmount} penny tokens`
    );
    
    if (!result.success) {
      error('❌ [LIVESTREAM_REWARDS] Failed to credit wallet:', result.error);
      return false;
    }
    
    // Record reward credit
    const recorded = await recordRewardCredit(reward);
    if (!recorded) {
      warn('⚠️ [LIVESTREAM_REWARDS] Wallet credited but failed to record reward');
    }
    
    log(`✅ [LIVESTREAM_REWARDS] Successfully credited ${reward.rewardAmount} pennies. New balance: ${result.newBalance}`);
    return true;
  } catch (error) {
    error('❌ [LIVESTREAM_REWARDS] Error in creditStreamReward:', error);
    return false;
  }
};

/**
 * Process rewards for all eligible livestreams
 * This should be called periodically (every 5 minutes)
 */
export const processLivestreamRewards = async (): Promise<{
  processed: number;
  credited: number;
  skipped: number;
  errors: number;
}> => {
  const stats = {
    processed: 0,
    credited: 0,
    skipped: 0,
    errors: 0,
  };
  
  try {
    log('🔄 [LIVESTREAM_REWARDS] Processing rewards for active livestreams...');
    
    const eligibleStreams = await getActiveStreams();
    stats.processed = eligibleStreams.length;
    
    if (eligibleStreams.length === 0) {
      log('📊 [LIVESTREAM_REWARDS] No eligible streams found');
      return stats;
    }
    
    log(`📊 [LIVESTREAM_REWARDS] Found ${eligibleStreams.length} eligible streams`);
    
    // Process each stream
    for (const reward of eligibleStreams) {
      try {
        // Check if reward was already credited recently
        const alreadyCredited = await wasRewardCreditedRecently(reward.streamId);
        
        if (alreadyCredited) {
          log(`⏭️ [LIVESTREAM_REWARDS] Skipping stream ${reward.streamId} - already credited recently`);
          stats.skipped++;
          continue;
        }
        
        // Credit the reward
        const success = await creditStreamReward(reward);
        
        if (success) {
          stats.credited++;
        } else {
          stats.errors++;
        }
      } catch (error) {
        error(`❌ [LIVESTREAM_REWARDS] Error processing stream ${reward.streamId}:`, error);
        stats.errors++;
      }
    }
    
    log(`✅ [LIVESTREAM_REWARDS] Processing complete. Processed: ${stats.processed}, Credited: ${stats.credited}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
    
    return stats;
  } catch (error) {
    error('❌ [LIVESTREAM_REWARDS] Error in processLivestreamRewards:', error);
    stats.errors++;
    return stats;
  }
};

/**
 * Start the automatic reward processing service
 * This runs every 5 minutes to credit penny tokens
 */
export const startLivestreamRewardService = (): (() => void) => {
  log('🚀 [LIVESTREAM_REWARDS] Starting reward service...');
  
  // Process immediately on start
  processLivestreamRewards().catch(error => {
    error('❌ [LIVESTREAM_REWARDS] Error in initial reward processing:', error);
  });
  
  // Then process every 5 minutes
  const interval = setInterval(() => {
    processLivestreamRewards().catch(error => {
      error('❌ [LIVESTREAM_REWARDS] Error in periodic reward processing:', error);
    });
  }, REWARD_INTERVAL_MS);
  
  // Return cleanup function
  return () => {
    log('🛑 [LIVESTREAM_REWARDS] Stopping reward service...');
    clearInterval(interval);
  };
};

