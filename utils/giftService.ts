import { supabase } from './supabase';
import { updateWalletBalance } from './walletService';
import { SUPABASE_URL } from '../constants/Endpoints';
import { checkAndAssignTopGifterBadge } from './badgeService';
import { log, warn, error } from './productionLogger';


export interface GiftTransaction {
  id: string;
  sender_id: string;
  receiver_id: string;
  stream_id: string | null;
  gift_id: string;
  gift_name: string;
  gift_emoji: string;
  gift_price: number;
  gift_rarity: string;
  created_at: string;
}

export interface GiftStats {
  totalGiftsReceived: number;
  totalCoinsEarned: number;
  mostPopularGift: string;
  recentGifts: GiftTransaction[];
}

export type GiftPayload = {
  id: string;
  name: string;
  emoji: string;
  usdPrice: number;
  rarity: string;
  quantity?: number;
};

export const sendGift = async (
  receiverId: string,
  streamId: string,
  gift: GiftPayload
): Promise<{ success: boolean; error?: string }> => {
  return sendGiftInternal(receiverId, streamId, gift);
};

/** Row returned when a direct gift message is inserted (for chat history). */
export interface DirectGiftMessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read: boolean;
  message_type?: string;
}

/**
 * Send a gift in direct/private chat (no livestream). Uses same wallet and
 * gift_transactions flow with stream_id = null, and adds a private message
 * so the chat thread shows the gift. Returns the inserted message so the sender
 * can add it to chat history immediately.
 */
export const sendDirectGift = async (
  receiverId: string,
  gift: GiftPayload
): Promise<{ success: boolean; error?: string; message?: DirectGiftMessageRow }> => {
  return sendGiftInternal(receiverId, null, gift);
};

/**
 * Check if the current user has ever sent a direct (DM) gift to the given receiver.
 * Used for "break the ice" / vibe_mode gift_required: allow chat only after a gift was sent.
 */
export const hasSentDirectGiftTo = async (receiverId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from('gift_transactions')
      .select('id')
      .eq('sender_id', user.id)
      .eq('receiver_id', receiverId)
      .is('stream_id', null)
      .limit(1);
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
};

async function sendGiftInternal(
  receiverId: string,
  streamId: string | null,
  gift: GiftPayload
): Promise<{ success: boolean; error?: string; message?: DirectGiftMessageRow }> {
  try {
    const quantity = gift.quantity || 1;
    const totalCost = Math.ceil(gift.usdPrice * 100) * quantity;

    log('🎁 [GIFT] Attempting to send gift:', {
      giftName: gift.name,
      quantity,
      totalCost,
      receiverId,
      streamId: streamId ?? 'direct',
    });
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Check if user has enough tokens in wallet
    // IMPORTANT: Only purchased tokens can be used for gifts, not earned tokens
    let { data: wallet } = await supabase
      .from('user_wallets')
      .select('token_balance, earned_tokens_redeemed')
      .eq('user_id', user.id)
      .single();
    
    // If no wallet exists, create one with zero balance (no demo tokens)
    if (!wallet) {
      log('🔧 [GIFT] Creating wallet for user:', user.id);
      const startingBalance = 0; // No demo tokens - purchases disabled
      const { data: newWallet, error: walletError } = await supabase
        .from('user_wallets')
            .insert({
              user_id: user.id,
              token_balance: startingBalance,
              total_purchased: 0,
              total_redeemed: 0,
              earned_tokens_redeemed: 0
            })
        .select('token_balance, earned_tokens_redeemed')
        .single();
      
      if (walletError) {
        error('❌ [GIFT] Error creating wallet:', walletError);
        return { success: false, error: 'Failed to create wallet' };
      }
      
      wallet = newWallet;
      log('🎉 [GIFT] Created wallet with zero balance (no demo tokens)');
    }
    
    // Calculate available purchased tokens (exclude redeemed earned tokens)
    const totalBalance = wallet.token_balance || 0;
    const redeemedEarnedTokens = wallet.earned_tokens_redeemed || 0;
    const availablePurchasedTokens = totalBalance - redeemedEarnedTokens;
    
    log('💰 [GIFT] User wallet - Total:', totalBalance, 'Redeemed Earned:', redeemedEarnedTokens, 'Available Purchased:', availablePurchasedTokens, 'Required:', totalCost);
    
    if (availablePurchasedTokens < totalCost) {
      return { success: false, error: 'Insufficient purchased tokens. Earned tokens cannot be used for gifts.' };
    }

    // Record gift transaction FIRST (before spending coins)
    const giftData: any = {
      sender_id: user.id,
      receiver_id: receiverId,
      gift_id: gift.id,
      gift_name: gift.name,
      gift_emoji: gift.emoji,
      gift_price: totalCost,
      gift_rarity: gift.rarity,
    };
    if (streamId != null) {
      giftData.stream_id = streamId;
    }

    // Note: Not including gift_quantity for now since column doesn't exist in database
    // The quantity will be calculated from totalCost / basePrice in the display logic

    log('🎁 [GIFT] Inserting gift data:', giftData);
    
    // Insert gift transaction and get the ID in one call
    const { data: insertedGift, error: giftError } = await supabase
      .from('gift_transactions')
      .insert(giftData)
      .select('id')
      .single();

    if (giftError || !insertedGift) {
      error('❌ [GIFT] Error recording gift transaction:', giftError);
      return { success: false, error: 'Failed to record gift' };
    }

    const giftTransactionId = insertedGift.id;
    log('✅ [GIFT] Gift transaction recorded successfully, ID:', giftTransactionId);

    // Only spend tokens AFTER successful database insert
    try {
      log('💰 [GIFT] Spending tokens:', totalCost);
      const spendResult = await updateWalletBalance(
        user.id,
        -totalCost,
        'gift_sent',
        giftTransactionId,
        `Gift sent: ${gift.name}`
      );
      
      if (!spendResult.success) {
        error('❌ [GIFT] Error spending tokens:', spendResult.error);
        return { success: false, error: 'Failed to spend tokens' };
      }
      log('✅ [GIFT] Tokens spent successfully');
    } catch (spendError) {
      error('❌ [GIFT] Error spending tokens:', spendError);
      return { success: false, error: 'Failed to spend tokens' };
    }

    // Update streamer's token balance (they earn tokens from gifts)
    // Use Edge Function to bypass RLS policies
    log('💰 [GIFT] Updating streamer wallet via Edge Function:', { receiverId, totalCost, giftName: gift.name, giftTransactionId });
    
    try {
      // Call Edge Function to update wallet
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/update-wallet-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({
          userId: receiverId,
          amount: totalCost,
          transactionType: 'gift_received',
          referenceId: giftTransactionId,
          description: `Gift received: ${gift.name}`,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        error('❌ [GIFT] Error updating receiver tokens via Edge Function:', result.error);
        error('❌ [GIFT] Receiver ID:', receiverId);
        error('❌ [GIFT] Amount:', totalCost);
        // If streamer update fails, restore the sender's tokens
        await updateWalletBalance(
          user.id,
          totalCost,
          'refund',
          giftTransactionId,
          'Gift refund due to receiver error'
        );
        return { success: false, error: `Failed to update streamer tokens: ${result.error}` };
      }

      log('✅ [GIFT] Streamer wallet updated successfully via Edge Function!', {
        receiverId,
        newBalance: result.newBalance,
        amountAdded: totalCost
      });
    } catch (error: any) {
      error('❌ [GIFT] Error calling Edge Function to update wallet:', error);
      error('❌ [GIFT] Error details:', error.message || error);
      
      // If Edge Function fails, try fallback to direct update (may fail due to RLS)
      log('🔄 [GIFT] Attempting fallback to direct wallet update...');
      const receiveResult = await updateWalletBalance(
        receiverId,
        totalCost,
        'gift_received',
        giftTransactionId,
        `Gift received: ${gift.name}`
      );

      if (!receiveResult.success) {
        error('❌ [GIFT] Fallback update also failed:', receiveResult.error);
        // Restore sender's tokens
        await updateWalletBalance(
          user.id,
          totalCost,
          'refund',
          giftTransactionId,
          'Gift refund due to receiver error'
        );
        return { success: false, error: `Failed to update streamer tokens: ${receiveResult.error || error.message}` };
      }
      
      log('✅ [GIFT] Fallback wallet update succeeded');
    }
    
    // Check and auto-assign Top Gifter badge if user qualifies
    checkAndAssignTopGifterBadge(user.id).catch(err => {
      warn('⚠️ [GIFT] Error checking badge eligibility:', err);
    });
    
    // Livestream only: add gift as a comment
    if (streamId != null) {
      try {
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('username, full_name')
          .eq('id', user.id)
          .single();
        const senderName = senderProfile?.full_name || senderProfile?.username || 'Someone';
        const giftMessage = quantity > 1
          ? `🎁 sent ${quantity}x ${gift.emoji} ${gift.name}`
          : `🎁 sent ${gift.emoji} ${gift.name}`;
        await supabase
          .from('live_stream_comments')
          .insert({
            stream_id: streamId,
            user_id: user.id,
            message: giftMessage,
          });
      } catch (commentError) {
        warn('⚠️ [GIFT] Failed to add gift comment:', commentError);
      }
    }

    // Direct gift: add a message to the private chat so both see it (with Nomli token value)
    let insertedMessage: DirectGiftMessageRow | undefined;
    if (streamId == null) {
      try {
        const content = quantity > 1
          ? `${gift.emoji} ${gift.name} x${quantity} · ${totalCost} Nomli tokens`
          : `${gift.emoji} ${gift.name} · ${totalCost} Nomli tokens`;
        const { data: msg, error: msgError } = await supabase
          .from('private_messages')
          .insert({
            sender_id: user.id,
            recipient_id: receiverId,
            content,
            read: false,
            message_type: 'text',
          })
          .select('id, sender_id, recipient_id, content, created_at, read, message_type')
          .single();
        if (!msgError && msg) {
          insertedMessage = msg as DirectGiftMessageRow;
        } else {
          warn('⚠️ [GIFT] Failed to add gift message to chat:', msgError);
        }
      } catch (msgError) {
        warn('⚠️ [GIFT] Failed to add gift message to chat:', msgError);
      }
    }

    log('🎉 [GIFT] Gift sent successfully!');
    return { success: true, message: insertedMessage };
  } catch (error) {
    error('Error sending gift:', error);
    return { success: false, error: 'Failed to send gift' };
  }
};

export const getGiftStats = async (userId: string): Promise<GiftStats> => {
  try {
    const { data: gifts, error } = await supabase
      .from('gift_transactions')
      .select('*')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      error('Error fetching gift stats:', error);
      return {
        totalGiftsReceived: 0,
        totalCoinsEarned: 0,
        mostPopularGift: 'None',
        recentGifts: [],
      };
    }

    const totalGiftsReceived = gifts?.length || 0;
    const totalCoinsEarned = gifts?.reduce((sum, gift) => sum + gift.gift_price, 0) || 0;
    
    // Find most popular gift
    const giftCounts: { [key: string]: number } = {};
    gifts?.forEach(gift => {
      giftCounts[gift.gift_name] = (giftCounts[gift.gift_name] || 0) + 1;
    });
    
    const mostPopularGift = Object.keys(giftCounts).reduce((a, b) => 
      giftCounts[a] > giftCounts[b] ? a : b, 'None'
    );

    return {
      totalGiftsReceived,
      totalCoinsEarned,
      mostPopularGift,
      recentGifts: gifts || [],
    };
  } catch (error) {
    error('Error getting gift stats:', error);
    return {
      totalGiftsReceived: 0,
      totalCoinsEarned: 0,
      mostPopularGift: 'None',
      recentGifts: [],
    };
  }
};

export const getRecentGifts = async (streamId: string): Promise<any[]> => {
  try {
    // First get the gift transactions
    const { data: gifts, error: giftsError } = await supabase
      .from('gift_transactions')
      .select('*')
      .eq('stream_id', streamId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (giftsError) {
      error('Error fetching recent gifts:', giftsError);
      return [];
    }

    if (!gifts || gifts.length === 0) {
      return [];
    }

    // Get sender IDs
    const senderIds = gifts.map(gift => gift.sender_id).filter(Boolean);
    
    // Fetch profiles separately
    let profiles: any[] = [];
    if (senderIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', senderIds);

      if (profilesError) {
        error('Error loading profiles:', profilesError);
        // Don't throw here, just use anonymous names
      } else if (profilesData) {
        profiles = profilesData;
      }
    }

    // Create a map for quick lookup
    const profilesMap = profiles.reduce((acc, profile) => {
      acc[profile.id] = profile;
      return acc;
    }, {});

    // Combine gifts with profile data
    const giftsWithProfiles = gifts.map(gift => ({
      ...gift,
      sender: profilesMap[gift.sender_id] || {
        username: 'Anonymous',
        full_name: 'Anonymous User',
        avatar_url: null
      }
    }));

    return giftsWithProfiles;
  } catch (error) {
    error('Error getting recent gifts:', error);
    return [];
  }
};
