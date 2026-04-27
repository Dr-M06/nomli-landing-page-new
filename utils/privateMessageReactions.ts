/**
 * Private chat message reactions (emoji replies).
 * Uses table private_message_reactions. Lightweight: no extra realtime beyond one subscription.
 */
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export type PrivateMessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

/**
 * Add or toggle a reaction to a private message. 
 * Only one reaction per user per message - clicking same emoji removes it, clicking different emoji switches it.
 */
export async function addPrivateMessageReaction(
  messageId: string,
  userId: string,
  emoji: string
): Promise<{ success: boolean; action: 'added' | 'removed' | 'switched' }> {
  try {
    // Check if user already has a reaction on this message
    const { data: existingReactions, error: checkError } = await supabase
      .from('private_message_reactions')
      .select('id, emoji')
      .eq('message_id', messageId)
      .eq('user_id', userId);

    if (checkError) {
      error('[PrivateMessageReactions] Error checking existing reactions:', checkError);
      return { success: false, action: 'added' };
    }

    // If user has existing reactions
    if (existingReactions && existingReactions.length > 0) {
      const existingReaction = existingReactions[0];
      
      // If clicking the same emoji, remove it (toggle off)
      if (existingReaction.emoji === emoji) {
        const { error: deleteError } = await supabase
          .from('private_message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId)
          .eq('emoji', emoji);
        
        if (deleteError) {
          error('[PrivateMessageReactions] Error removing reaction:', deleteError);
          return { success: false, action: 'removed' };
        }
        return { success: true, action: 'removed' };
      } else {
        // If clicking different emoji, remove old one and add new one (switch)
        const { error: deleteError } = await supabase
          .from('private_message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId);
        
        if (deleteError) {
          error('[PrivateMessageReactions] Error removing old reaction:', deleteError);
          return { success: false, action: 'switched' };
        }

        // Add the new reaction
        const { error: insertError } = await supabase
          .from('private_message_reactions')
          .insert({
            message_id: messageId,
            user_id: userId,
            emoji,
          });
        
        if (insertError) {
          error('[PrivateMessageReactions] Error adding new reaction:', insertError);
          return { success: false, action: 'switched' };
        }
        return { success: true, action: 'switched' };
      }
    }

    // No existing reaction - add new one
    const { error } = await supabase.from('private_message_reactions').insert({
      message_id: messageId,
      user_id: userId,
      emoji,
    });
    
    if (error) {
      if (error.code === '23505') {
        // Duplicate - already exists, treat as success
        return { success: true, action: 'added' };
      }
      error('[PrivateMessageReactions] Error adding reaction:', error);
      return { success: false, action: 'added' };
    }
    return { success: true, action: 'added' };
  } catch (error) {
    error('[PrivateMessageReactions] Exception adding reaction:', error);
    return { success: false, action: 'added' };
  }
}

/**
 * Remove a reaction from a private message.
 */
export async function removePrivateMessageReaction(
  messageId: string,
  userId: string,
  emoji: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('private_message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Get all reactions for a set of message IDs (one query for merge into messages).
 */
export async function getReactionsForMessageIds(
  messageIds: string[]
): Promise<Map<string, PrivateMessageReaction[]>> {
  const map = new Map<string, PrivateMessageReaction[]>();
  if (!messageIds.length) return map;
  const { data, error } = await supabase
    .from('private_message_reactions')
    .select('id, message_id, user_id, emoji, created_at')
    .in('message_id', messageIds)
    .order('created_at', { ascending: true });
  if (error || !data) return map;
  data.forEach((row) => {
    const list = map.get(row.message_id) ?? [];
    list.push(row as PrivateMessageReaction);
    map.set(row.message_id, list);
  });
  return map;
}
