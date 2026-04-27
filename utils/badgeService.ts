import { supabase } from './supabase';
import { UserBadgeData } from '../components/UserBadge';
import { getProfileById } from './profilesManager';
import { log, warn, error } from './productionLogger';


/**
 * Check if user qualifies for Top Gifter badge and auto-assign it
 * This is called automatically when users send credits or gifts
 */
export const checkAndAssignTopGifterBadge = async (userId: string): Promise<void> => {
  try {
    // Check if user already has the badge
    const existingBadges = await getUserBadges(userId);
    const hasTopGifterBadge = existingBadges.some(badge => badge.badge_key === 'top_gifter');
    
    if (hasTopGifterBadge) {
      return; // Already has the badge
    }

    // Get user's total sent amount (gifts + credits)
    const { data: transactions, error } = await supabase
      .from('wallet_transactions')
      .select('amount, transaction_type')
      .eq('user_id', userId)
      .in('transaction_type', ['gift_sent', 'user_credit_sent']);

    if (error || !transactions || transactions.length === 0) {
      return; // No transactions or error
    }

    // Calculate total sent (use absolute value for credits since they're negative)
    let totalSent = 0;
    let transactionCount = 0;
    
    transactions.forEach((tx: any) => {
      const isCredit = tx.transaction_type === 'user_credit_sent';
      const amount = isCredit ? Math.abs(tx.amount || 0) : (tx.amount || 0);
      totalSent += amount;
      transactionCount++;
    });

    // Auto-assign badge if user has sent at least 1000 tokens (10.00) across at least 3 transactions
    const MIN_TOKENS_THRESHOLD = 1000; // 10.00 in penny tokens
    const MIN_TRANSACTIONS_THRESHOLD = 3;

    if (totalSent >= MIN_TOKENS_THRESHOLD && transactionCount >= MIN_TRANSACTIONS_THRESHOLD) {
      // Get user's email or username for badge assignment
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, username')
        .eq('id', userId)
        .single();

      if (profile) {
        const identifier = profile.email || profile.username;
        if (identifier) {
          const result = await assignBadgeToUser('top_gifter', identifier, `Auto-assigned: Sent ${totalSent.toLocaleString()} tokens across ${transactionCount} transactions`);
          
          if (result.success) {
            log(`✅ [BadgeService] Auto-assigned Top Gifter badge to user ${userId} (${totalSent} tokens, ${transactionCount} transactions)`);
          } else {
            warn(`⚠️ [BadgeService] Failed to auto-assign Top Gifter badge:`, result.error);
          }
        }
      }
    }
  } catch (error) {
    error('[BadgeService] Error checking/assigning Top Gifter badge:', error);
    // Don't throw - this is a background process, shouldn't block the main operation
  }
};

/**
 * Helper function to validate UUID format
 */
const isValidUUID = (id: string | undefined | null): boolean => {
  if (!id) return false;
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

/**
 * Get badges for a user
 */
export const getUserBadges = async (userId: string): Promise<UserBadgeData[]> => {
  try {
    // Validate UUID before making the RPC call
    if (!isValidUUID(userId)) {
      warn('[BadgeService] Invalid UUID provided:', userId);
      return [];
    }

    const { data, error } = await supabase.rpc('get_user_badges', {
      p_user_id: userId,
    });

    if (error) {
      error('[BadgeService] Error fetching user badges:', error);
      return [];
    }

    return (data || []).map((badge: any) => ({
      badge_key: badge.badge_key,
      badge_name: badge.badge_name,
      icon_name: badge.icon_name,
      color: badge.color,
      badge_description: badge.badge_description,
    }));
  } catch (error) {
    error('[BadgeService] Exception fetching user badges:', error);
    return [];
  }
};

/**
 * Assign badge to user by email or username (admin only)
 */
export const assignBadgeToUser = async (
  badgeKey: string,
  userIdentifier: string, // email or username
  notes?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    log('[BadgeService] Assigning badge:', { badgeKey, userIdentifier, notes });
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<{ success: boolean; error: string }>((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'Request timeout - please try again' });
      }, 10000); // 10 second timeout
    });

    const rpcPromise = supabase.rpc('assign_badge_to_user', {
      p_badge_key: badgeKey,
      p_user_identifier: userIdentifier,
      p_notes: notes || null,
    }).then(({ data, error }) => {
      log('[BadgeService] RPC response:', { data, error });

      if (error) {
        error('[BadgeService] Error assigning badge:', error);
        return { success: false, error: error.message || error.details || 'Failed to assign badge' };
      }

      // Check if data exists and has success property
      if (data && typeof data === 'object') {
        if (data.success === false) {
          return { success: false, error: data.error || 'Failed to assign badge' };
        }
        // If success is true or data exists, consider it successful
        return { success: true };
      }

      // If no data returned but no error, assume success (legacy behavior)
      return { success: true };
    });

    const result = await Promise.race([rpcPromise, timeoutPromise]);
    return result;
  } catch (error: any) {
    error('[BadgeService] Exception assigning badge:', error);
    return { success: false, error: error.message || 'Failed to assign badge' };
  }
};

/**
 * Remove badge from user (admin only)
 */
export const removeBadgeFromUser = async (
  badgeKey: string,
  userIdentifier: string // email or username
): Promise<{ success: boolean; error?: string }> => {
  try {
    log('[BadgeService] Removing badge:', { badgeKey, userIdentifier });
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<{ success: boolean; error: string }>((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'Request timeout - please try again' });
      }, 10000); // 10 second timeout
    });

    const rpcPromise = supabase.rpc('remove_badge_from_user', {
      p_badge_key: badgeKey,
      p_user_identifier: userIdentifier,
    }).then(({ data, error }) => {
      log('[BadgeService] RPC response:', { data, error });

      if (error) {
        error('[BadgeService] Error removing badge:', error);
        return { success: false, error: error.message || error.details || 'Failed to remove badge' };
      }

      if (data?.success === false) {
        return { success: false, error: data.error || 'Failed to remove badge' };
      }

      return { success: true };
    });

    const result = await Promise.race([rpcPromise, timeoutPromise]);
    return result;
  } catch (error: any) {
    error('[BadgeService] Exception removing badge:', error);
    return { success: false, error: error.message || 'Failed to remove badge' };
  }
};

/**
 * Get all available badge types
 */
export const getBadgeTypes = async (): Promise<Array<{ badge_key: string; name: string; description: string }>> => {
  try {
    const { data, error } = await supabase
      .from('badge_types')
      .select('badge_key, name, description')
      .order('name');

    if (error) {
      error('[BadgeService] Error fetching badge types:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('[BadgeService] Exception fetching badge types:', error);
    return [];
  }
};

/**
 * Get top gifters and credit senders based on wallet transactions (admin only)
 * Includes both gift_sent and user_credit_sent transactions
 * Uses RPC function to bypass RLS policies
 */
export const getTopGifters = async (
  limit: number = 20
): Promise<Array<{ user_id: string; username: string; full_name: string; email: string; avatar_url: string; total_sent: number; gift_count: number; credit_count: number; transaction_count: number }>> => {
  try {
    log('[BadgeService] Fetching top gifters...');
    
    // Try using RPC function first (if it exists) - bypasses RLS
    try {
      log('[BadgeService] Attempting to call RPC function get_top_gifters...');
      const { data: rpcResult, error: rpcError } = await supabase.rpc('get_top_gifters', {
        p_limit: limit,
      });

      log('[BadgeService] RPC call result:', { hasData: !!rpcResult, dataLength: rpcResult?.length, error: rpcError });

      if (rpcError) {
        // Check if function doesn't exist (code 42883 = undefined_function)
        if (rpcError.code === '42883' || rpcError.message?.includes('does not exist') || rpcError.message?.includes('function')) {
          warn('[BadgeService] RPC function get_top_gifters does not exist yet. Please run the migration.');
        } else {
          warn('[BadgeService] RPC function error:', rpcError.message, rpcError.details, rpcError.code);
        }
      } else if (rpcResult && Array.isArray(rpcResult)) {
        if (rpcResult.length > 0) {
          log('[BadgeService] ✅ Top gifters fetched via RPC:', rpcResult.length);
          // Convert numeric types to numbers for TypeScript
          return rpcResult.map((gifter: any) => ({
            user_id: gifter.user_id,
            username: gifter.username || '',
            full_name: gifter.full_name || '',
            email: gifter.email || '',
            avatar_url: gifter.avatar_url || '',
            total_sent: Number(gifter.total_sent) || 0,
            gift_count: Number(gifter.gift_count) || 0,
            credit_count: Number(gifter.credit_count) || 0,
            transaction_count: Number(gifter.transaction_count) || 0,
          }));
        } else {
          log('[BadgeService] RPC returned empty array - no gifters found');
          return [];
        }
      }
    } catch (rpcException: any) {
      warn('[BadgeService] RPC function exception:', rpcException.message, rpcException.code);
    }

    // Fallback: Direct query (may be limited by RLS)
    const { data: transactions, error } = await supabase
      .from('wallet_transactions')
      .select('user_id, amount, transaction_type')
      .in('transaction_type', ['gift_sent', 'user_credit_sent'])
      .order('created_at', { ascending: false })
      .limit(1000); // Get recent transactions

    if (error) {
      error('[BadgeService] Error fetching top gifters:', error);
      error('[BadgeService] Error details:', error.message, error.details, error.hint);
      return [];
    }

    log('[BadgeService] Found transactions:', transactions?.length || 0);

    if (!transactions || transactions.length === 0) {
      warn('[BadgeService] ⚠️ No transactions found via direct query.');
      warn('[BadgeService] This is likely due to RLS policies blocking access.');
      warn('[BadgeService] Please run the migration to create the get_top_gifters RPC function:');
      warn('[BadgeService] supabase/migrations/20250101000001_create_user_badges.sql');
      return [];
    }

    // Group by user_id and sum amounts, tracking gifts and credits separately
    // Note: user_credit_sent transactions have negative amounts (deductions), so we use absolute value
    const gifterMap = new Map<string, { total_sent: number; gift_count: number; credit_count: number; transaction_count: number }>();
    
    transactions.forEach((tx: any) => {
      const current = gifterMap.get(tx.user_id) || { total_sent: 0, gift_count: 0, credit_count: 0, transaction_count: 0 };
      const isCredit = tx.transaction_type === 'user_credit_sent';
      // For credits, amount is negative (deduction), so use absolute value
      // For gifts, amount is already positive
      const amount = isCredit ? Math.abs(tx.amount || 0) : (tx.amount || 0);
      
      gifterMap.set(tx.user_id, {
        total_sent: current.total_sent + amount,
        gift_count: isCredit ? current.gift_count : current.gift_count + 1,
        credit_count: isCredit ? current.credit_count + 1 : current.credit_count,
        transaction_count: current.transaction_count + 1,
      });
    });

    // Get user IDs
    const userIds = Array.from(gifterMap.keys());

    log('[BadgeService] Unique gifters found:', userIds.length);

    if (userIds.length === 0) {
      return [];
    }

    // Fetch user profiles
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, full_name, email, avatar_url')
      .in('id', userIds);

    if (profileError) {
      error('[BadgeService] Error fetching gifter profiles:', profileError);
      return [];
    }

    if (!profiles || profiles.length === 0) {
      log('[BadgeService] No profiles found for gifters');
      return [];
    }

    log('[BadgeService] Profiles fetched:', profiles.length);

    // Combine data and sort by total_sent
    const topGifters = profiles
      .map((profile) => {
        const stats = gifterMap.get(profile.id);
        if (!stats) return null;
        
        return {
          user_id: profile.id,
          username: profile.username || '',
          full_name: profile.full_name || '',
          email: profile.email || '',
          avatar_url: profile.avatar_url || '',
          total_sent: stats.total_sent,
          gift_count: stats.gift_count,
          credit_count: stats.credit_count,
          transaction_count: stats.transaction_count,
        };
      })
      .filter((gifter): gifter is NonNullable<typeof gifter> => gifter !== null)
      .sort((a, b) => b.total_sent - a.total_sent)
      .slice(0, limit);

    log('[BadgeService] Top gifters result:', topGifters.length);
    return topGifters;
  } catch (error) {
    error('[BadgeService] Exception fetching top gifters:', error);
    return [];
  }
};

/**
 * Search for user by email or username (admin only)
 */
export const searchUserByIdentifier = async (
  identifier: string
): Promise<{ success: boolean; profile?: any; error?: string }> => {
  try {
    if (!identifier.trim()) {
      return { success: false, error: 'Please enter an email or username' };
    }

    // Search by email or username
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, email, avatar_url, bio, created_at, is_verified')
      .or(`email.ilike.%${identifier.trim()}%,username.ilike.%${identifier.trim()}%`)
      .limit(1)
      .maybeSingle();

    if (error) {
      error('[BadgeService] Error searching user:', error);
      return { success: false, error: 'Failed to search user' };
    }

    if (!profiles) {
      return { success: false, error: 'User not found' };
    }

    // Get user badges
    const badges = await getUserBadges(profiles.id);

    return {
      success: true,
      profile: {
        ...profiles,
        badges,
      },
    };
  } catch (error: any) {
    error('[BadgeService] Exception searching user:', error);
    return { success: false, error: error.message || 'Failed to search user' };
  }
};

