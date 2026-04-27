import { supabase } from './supabase';
import { updateWalletBalance } from './walletService';
import { triggerProcessNotification } from './triggerProcessNotification';
import { checkAndAssignTopGifterBadge } from './badgeService';
import { SUPABASE_URL } from '../constants/Endpoints';
import { log, warn, error } from './productionLogger';


/**
 * Credit Service
 * Allows users to credit other users (even private accounts)
 * Credits are shown in notifications/announcements screen
 */

const CREDIT_AMOUNT = 10; // 10 penny tokens = $0.10 per credit

export interface CreditNotification {
  id: string;
  type: 'credit';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  data?: {
    credited_by_id: string;
    credited_by_name: string;
    credited_by_avatar?: string;
    amount: number;
  };
}

/**
 * Credit a user
 * @param recipientId - The user ID to credit
 * @param senderId - The user ID sending the credit
 * @param senderName - The name of the user sending the credit
 * @param senderAvatar - Optional avatar URL of the sender
 * @param amount - Amount to credit (in penny tokens). Defaults to CREDIT_AMOUNT
 * @returns Success status and new balance
 */
export const creditUser = async (
  recipientId: string,
  senderId: string,
  senderName: string,
  senderAvatar?: string,
  amount?: number
): Promise<{ success: boolean; newBalance?: number; error?: string }> => {
  try {
    const creditAmount = amount || CREDIT_AMOUNT;
    log('💰 [CREDIT] Crediting user:', { recipientId, senderId, senderName, amount: creditAmount });

    // Prevent self-crediting
    if (recipientId === senderId) {
      return { success: false, error: 'You cannot credit yourself' };
    }

    // Check sender's wallet balance first
    // IMPORTANT: Only purchased tokens can be sent as credits, not earned tokens
    const { data: senderWallet, error: walletError } = await supabase
      .from('user_wallets')
      .select('token_balance, earned_tokens_redeemed')
      .eq('user_id', senderId)
      .single();

    if (walletError && walletError.code !== 'PGRST116') {
      error('❌ [CREDIT] Error checking sender wallet:', walletError);
      return { success: false, error: 'Failed to check wallet balance' };
    }

    // Calculate available purchased tokens (exclude redeemed earned tokens)
    const totalBalance = senderWallet?.token_balance || 0;
    const redeemedEarnedTokens = senderWallet?.earned_tokens_redeemed || 0;
    const availablePurchasedTokens = totalBalance - redeemedEarnedTokens;
    
    if (availablePurchasedTokens < creditAmount) {
      return { success: false, error: 'Insufficient purchased tokens. Earned tokens cannot be sent as credits.' };
    }

    // Get recipient's name for transaction description
    const { data: recipientProfile } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', recipientId)
      .single();
    
    const recipientName = recipientProfile?.full_name || recipientProfile?.username || 'User';

    // Deduct from sender's wallet (using direct update - sender can update their own wallet)
    const deductResult = await updateWalletBalance(
      senderId,
      -creditAmount, // Negative amount to deduct
      'user_credit_sent',
      recipientId,
      `Credit sent to ${recipientName}`
    );

    if (!deductResult.success) {
      error('❌ [CREDIT] Failed to deduct from sender wallet:', deductResult.error);
      return { success: false, error: 'Failed to process credit' };
    }

    // Credit the recipient's wallet using Edge Function (bypasses RLS for wallet creation)
    log('💰 [CREDIT] Updating recipient wallet via Edge Function:', { recipientId, creditAmount });
    
    let recipientNewBalance: number = creditAmount;
    
    try {
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
          userId: recipientId,
          amount: creditAmount,
          transactionType: 'user_credit',
          referenceId: senderId,
          description: `Credit from ${senderName}`,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        error('❌ [CREDIT] Error updating recipient wallet via Edge Function:', result.error);
        // Try to refund sender if recipient credit failed
        await updateWalletBalance(
          senderId,
          creditAmount,
          'user_credit_refund',
          recipientId,
          `Refund for failed credit to ${senderName}`
        );
        return { success: false, error: result.error || 'Failed to credit recipient wallet' };
      }

      // Use the newBalance from Edge Function response
      recipientNewBalance = result.newBalance || creditAmount;

      log('✅ [CREDIT] Recipient wallet updated successfully via Edge Function!', {
        recipientId,
        newBalance: recipientNewBalance,
        amountAdded: creditAmount
      });
    } catch (error: any) {
      error('❌ [CREDIT] Error calling Edge Function to update recipient wallet:', error);
      // Try to refund sender if Edge Function call failed
      await updateWalletBalance(
        senderId,
        creditAmount,
        'user_credit_refund',
        recipientId,
        `Refund for failed credit to ${senderName}`
      );
      return { success: false, error: 'Failed to credit recipient wallet' };
    }

    // Create notification entry in notification_queue table
    const notificationTitle = `You received ${creditAmount} tokens!`;
    const notificationMessage = `${senderName} credited you ${creditAmount} tokens`;

    // Insert into notification_queue table
    const { data: queued, error: notificationError } = await supabase
      .from('notification_queue')
      .insert({
        recipient_id: recipientId,
        sender_id: senderId,
        notification_type: 'credit',
        sender_name: senderName,
        message_content: notificationMessage,
        metadata: {
          title: notificationTitle,
          credited_by_id: senderId,
          credited_by_name: senderName,
          credited_by_avatar: senderAvatar,
          amount: creditAmount,
        },
        status: 'pending',
      })
      .select('id')
      .single();

    if (notificationError) {
      warn('⚠️ [CREDIT] Failed to create notification:', notificationError);
      // Continue even if notification fails - wallet credit succeeded
    } else {
      triggerProcessNotification(queued?.id);
    }

            log(`✅ [CREDIT] Successfully credited ${creditAmount} tokens. Recipient new balance: ${recipientNewBalance}`);
            
            // Check and auto-assign Top Gifter badge if user qualifies
            checkAndAssignTopGifterBadge(senderId).catch(err => {
              warn('⚠️ [CREDIT] Error checking badge eligibility:', err);
            });
            
            return { success: true, newBalance: recipientNewBalance };
          } catch (error) {
            error('❌ [CREDIT] Error crediting user:', error);
            return { success: false, error: 'Failed to credit user' };
          }
        };

/**
 * Get credit notifications for a user
 */
export const getCreditNotifications = async (userId: string): Promise<CreditNotification[]> => {
  try {
    const { data, error } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('recipient_id', userId)
      .eq('notification_type', 'credit')
      .order('created_at', { ascending: false });

    if (error) {
      error('❌ [CREDIT] Error fetching credit notifications:', error);
      return [];
    }

    return (data || []).map((notif: any) => ({
      id: notif.id,
      type: 'credit' as const,
      title: notif.metadata?.title || `You received ${CREDIT_AMOUNT} tokens!`,
      message: notif.message_content,
      timestamp: notif.created_at,
      read: false, // Credit notifications are always unread until user views them
      data: notif.metadata,
    }));
  } catch (error) {
    error('❌ [CREDIT] Error in getCreditNotifications:', error);
    return [];
  }
};

