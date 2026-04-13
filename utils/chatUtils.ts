import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Extracts the recipient ID from a chat ID for direct messaging
 * 
 * @param chatId - The chat ID to parse
 * @param currentUserId - The current user's ID
 * @returns Promise resolving to the recipient ID or null if it couldn't be determined
 */
export async function getRecipientFromChatId(chatId: string, currentUserId: string): Promise<string | null> {
  if (!chatId || !currentUserId) {
    error('[ChatUtils] Missing required parameters:', { chatId, currentUserId });
    return null;
  }

  // If chatId is same as currentUserId, this is definitely wrong
  if (chatId === currentUserId) {
    return null;
  }
  
  // Case 1: Direct chat format (user1_user2)
  if (chatId.includes('_')) {
    const chatParts = chatId.split('_');
    log('🔍 [CHAT UTILS DEBUG] Chat parts:', chatParts);
    
    if ((chatParts?.length || 0) === 2) {
      log('🔍 [CHAT UTILS DEBUG] Checking parts:');
      log('🔍 [CHAT UTILS DEBUG] - Part 0:', chatParts[0], '(equals current user?', chatParts[0] === currentUserId, ')');
      log('🔍 [CHAT UTILS DEBUG] - Part 1:', chatParts[1], '(equals current user?', chatParts[1] === currentUserId, ')');
      
      const recipientId = chatParts[0] === currentUserId ? chatParts[1] : chatParts[0];
      log('🔍 [CHAT UTILS DEBUG] Direct chat detected, resolved recipient ID:', recipientId);
      
      // SAFETY CHECK: Make sure we're not returning the current user ID
      if (recipientId === currentUserId) {
        error('🚨 [CHAT UTILS DEBUG] ERROR: Resolved recipient is same as current user!');
        error('🚨 [CHAT UTILS DEBUG] This indicates a problem with chat ID format or logic');
        return null;
      }
      
      return recipientId;
    }
  
    // Case 2: Private chat format (private_user1_user2)
    if (chatId.startsWith('private_') && (chatParts?.length || 0) === 3) {
      log('🔍 [CHAT UTILS DEBUG] Private chat format detected:');
      log('🔍 [CHAT UTILS DEBUG] - Part 1:', chatParts[1], '(equals current user?', chatParts[1] === currentUserId, ')');
      log('🔍 [CHAT UTILS DEBUG] - Part 2:', chatParts[2], '(equals current user?', chatParts[2] === currentUserId, ')');
      
      const recipientId = chatParts[1] === currentUserId ? chatParts[2] : chatParts[1];
      log('🔍 [CHAT UTILS DEBUG] Private chat detected, resolved recipient ID:', recipientId);
      
      // SAFETY CHECK: Make sure we're not returning the current user ID
      if (recipientId === currentUserId) {
        error('🚨 [CHAT UTILS DEBUG] ERROR: Private chat resolved recipient is same as current user!');
        return null;
      }
      
      return recipientId;
    }
  }
  
  // Case 3: Country chat (not supported for direct messaging)
  if (chatId.startsWith('country_')) {
    log('[ChatUtils] Country chat detected, not supported for direct messaging');
    return null;
  }
  
  // Case 4: UUID format chat
  if (chatId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    // If the chat ID is a UUID and it's NOT the current user's ID, 
    // it's likely the other user's ID directly (not a conversation ID)
    if (chatId !== currentUserId) {
      return chatId;
    }
    
    log('[ChatUtils] UUID matches current user, looking up participants');
    
    try {
      // First try to get chat participants
      const { data: participants, error: participantsError } = await supabase
        .from('chat_participants')
        .select('user_id, profiles(username, full_name)')
        .eq('chat_id', chatId)
        .neq('user_id', currentUserId);
      
      log('[ChatUtils] Participants query result:', 
        participants ? `Found ${participants.length} participants` : 'No participants found', 
        participantsError ? `Error: ${participantsError.message}` : 'No error');
      
      if (participants && (participants?.length || 0) > 0) {
        // Use the first participant that isn't the current user
        const recipientId = participants[0].user_id;
        log('[ChatUtils] Using participant as recipient:', recipientId);
        return recipientId;
      }
      
      // Try country_chat_participants table
      log('[ChatUtils] Trying country_chat_participants table');
      const { data: countryParticipants, error: countryParticipantsError } = await supabase
        .from('country_chat_participants')
        .select('user_id')
        .eq('country_chat_id', chatId)
        .neq('user_id', currentUserId)
        .limit(10);
        
      log('[ChatUtils] Country participants query result:', 
        countryParticipants ? `Found ${countryParticipants.length} participants` : 'No participants found', 
        countryParticipantsError ? `Error: ${countryParticipantsError.message}` : 'No error');
        
      if (countryParticipants && (countryParticipants?.length || 0) > 0) {
        // Use the first participant that isn't the current user
        const recipientId = countryParticipants[0].user_id;
        log('[ChatUtils] Using country participant as recipient:', recipientId);
        return recipientId;
      }
      
      // If no participants found in chat_participants, try looking in messages
      log('[ChatUtils] No participants found in chat_participants, trying messages table');
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('user_id, profiles(username, full_name)')
        .eq('chat_id', chatId)
        .neq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(10);
      
      log('[ChatUtils] Messages query result:', 
        messages ? `Found ${messages.length} messages` : 'No messages found', 
        messagesError ? `Error: ${messagesError.message}` : 'No error');
      
      if (messages && (messages?.length || 0) > 0) {
        // Get unique user IDs from messages
        const uniqueUserIds = [...new Set(messages.map(m => m.user_id))];
        if ((uniqueUserIds?.length || 0) > 0) {
          log('[ChatUtils] Found recipient from messages:', uniqueUserIds[0]);
          return uniqueUserIds[0];
        }
      }
      
      // If still not found, try direct_messages table
      log('[ChatUtils] No participants found in messages, trying direct_messages table');
      const { data: directMessages, error: directMessagesError } = await supabase
        .from('direct_messages')
        .select('sender_id, recipient_id')
        .eq('conversation_id', chatId)
        .order('created_at', { ascending: false })
        .limit(10);
      
      log('[ChatUtils] Direct messages query result:', 
        directMessages ? `Found ${directMessages.length} messages` : 'No messages found', 
        directMessagesError ? `Error: ${directMessagesError.message}` : 'No error');
      
      if (directMessages && (directMessages?.length || 0) > 0) {
        // Find a user ID that isn't the current user
        for (const msg of directMessages) {
          if (msg.sender_id !== currentUserId) {
            log('[ChatUtils] Found recipient from direct_messages (sender):', msg.sender_id);
            return msg.sender_id;
          }
          if (msg.recipient_id !== currentUserId) {
            log('[ChatUtils] Found recipient from direct_messages (recipient):', msg.recipient_id);
            return msg.recipient_id;
          }
        }
      }
      
      // Try to find messages with chat_id as the conversation_id
      log('[ChatUtils] Trying direct_messages with chat_id as conversation_id');
      const { data: dmMessages, error: dmError } = await supabase
        .from('direct_messages')
        .select('sender_id, recipient_id')
        .eq('chat_id', chatId)  // Some implementations use chat_id instead of conversation_id
        .order('created_at', { ascending: false })
        .limit(10);
      
      log('[ChatUtils] DM messages query result:', 
        dmMessages ? `Found ${dmMessages.length} messages` : 'No messages found', 
        dmError ? `Error: ${dmError.message}` : 'No error');
      
      if (dmMessages && (dmMessages?.length || 0) > 0) {
        // Find a user ID that isn't the current user
        for (const msg of dmMessages) {
          if (msg.sender_id !== currentUserId) {
            log('[ChatUtils] Found recipient from dm_messages (sender):', msg.sender_id);
            return msg.sender_id;
          }
          if (msg.recipient_id !== currentUserId) {
            log('[ChatUtils] Found recipient from dm_messages (recipient):', msg.recipient_id);
            return msg.recipient_id;
          }
        }
      }
      
      // Try private_messages table
      log('[ChatUtils] Trying private_messages table');
      const { data: privateMessages, error: privateMessagesError } = await supabase
        .from('private_messages')
        .select('sender_id, recipient_id')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false })
        .limit(10);
        
      log('[ChatUtils] Private messages query result:', 
        privateMessages ? `Found ${privateMessages.length} messages` : 'No messages found', 
        privateMessagesError ? `Error: ${privateMessagesError.message}` : 'No error');
        
      if (privateMessages && (privateMessages?.length || 0) > 0) {
        // Find a user ID that isn't the current user
        for (const msg of privateMessages) {
          if (msg.sender_id !== currentUserId) {
            log('[ChatUtils] Found recipient from private_messages (sender):', msg.sender_id);
            return msg.sender_id;
          }
          if (msg.recipient_id !== currentUserId) {
            log('[ChatUtils] Found recipient from private_messages (recipient):', msg.recipient_id);
            return msg.recipient_id;
          }
        }
      }
      
      // Last resort: try to get the chat details
      log('[ChatUtils] Trying to get chat details');
      const { data: chatDetails, error: chatDetailsError } = await supabase
        .from('chats')
        .select('*')
        .eq('id', chatId)
        .single();
      
      log('[ChatUtils] Chat details:', 
        chatDetails ? 'Found chat details' : 'No chat details found', 
        chatDetailsError ? `Error: ${chatDetailsError.message}` : 'No error');
      
      if (chatDetails) {
        // Check if there's a recipient_id or other user field
        if (chatDetails.recipient_id && chatDetails.recipient_id !== currentUserId) {
          log('[ChatUtils] Found recipient from chat details (recipient):', chatDetails.recipient_id);
          return chatDetails.recipient_id;
        }
        if (chatDetails.user_id && chatDetails.user_id !== currentUserId) {
          log('[ChatUtils] Found recipient from chat details (user):', chatDetails.user_id);
          return chatDetails.user_id;
        }
        if (chatDetails.created_by && chatDetails.created_by !== currentUserId) {
          log('[ChatUtils] Found recipient from chat details (created_by):', chatDetails.created_by);
          return chatDetails.created_by;
        }
      }
      
      // Final attempt: Check if this is a group chat and use a default name
      log('[ChatUtils] Checking if this is a group chat...');
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .select('name, type')
        .eq('id', chatId)
        .single();
      
      if (chatData && (chatData.type === 'group' || chatData.name)) {
        log('[ChatUtils] This appears to be a group chat:', chatData.name);
        // For group chats, we'll return a special format that the UI can recognize
        return `group:${chatData.name || 'Group Chat'}`;
      }
      
      error('[ChatUtils] Could not find any participants for chat ID:', chatId);
      return null;
    } catch (error) {
      error('[ChatUtils] Error querying participants:', error);
      return null;
    }
  }
  
  // Case 5: URL-like format
  if (chatId.includes('/')) {
    log('[ChatUtils] URL-like chat ID detected, extracting last segment');
    const segments = chatId.split('/');
    const lastSegment = segments[(segments?.length || 0) - 1];
    log('[ChatUtils] Last segment:', lastSegment);
    
    // Try to extract from the last segment
    if (lastSegment.includes('_')) {
      const idParts = lastSegment.split('_');
      log('[ChatUtils] ID parts from URL:', idParts);
      if ((idParts?.length || 0) === 2) {
        const recipientId = idParts[0] === currentUserId ? idParts[1] : idParts[0];
        log('[ChatUtils] Extracted recipient ID from URL:', recipientId);
        return recipientId;
      }
    }
    
    // If the last segment is a UUID, try to get participants
    if (lastSegment.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return getRecipientFromChatId(lastSegment, currentUserId);
    }
  }
  
  // Case 6: Try to get the conversation ID from the database based on the participants
  log('[ChatUtils] Trying to find conversation by participants');
  
  error('[ChatUtils] Could not determine recipient from chat ID:', chatId);
  return null;
}

/**
 * Checks if a chat ID represents a direct chat between two users
 * 
 * @param chatId - The chat ID to check
 * @returns boolean indicating if it's a direct chat
 */
export function isDirectChat(chatId: string): boolean {
  if (!chatId) return false;
  
  // Direct chats have format user1_user2
  const chatParts = chatId.split('_');
  if ((chatParts?.length || 0) === 2) {
    // Check that both parts look like user IDs (not special prefixes like 'country')
    return !chatParts[0].includes('-') && !chatParts[1].includes('-') && 
           chatParts[0] !== 'country' && chatParts[1] !== 'country';
  }
  
  // Private chats have format private_user1_user2
  if (chatId.startsWith('private_') && (chatParts?.length || 0) === 3) {
    return true;
  }
  
  return false;
}

/**
 * Gets the chat ID in a consistent format for direct messaging
 * 
 * @param userId1 - First user ID
 * @param userId2 - Second user ID
 * @returns Formatted chat ID (sorted user IDs joined with underscore)
 */
export function getDirectChatId(userId1: string, userId2: string): string {
  // Sort user IDs to ensure consistent chat ID regardless of who initiates
  const sortedIds = [userId1, userId2].sort();
  return `${sortedIds[0]}_${sortedIds[1]}`;
} 