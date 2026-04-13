import { supabase, Profile } from './supabase';
import { markConversationAsRead } from './supabase';
import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';
import { OFFICIAL_ACCOUNT_ID } from '../constants/ContactEmails';
import {
  clearDmAwaitingReciprocity,
  getDmAwaitingReciprocity,
} from './dmAwaitingStorage';


export interface MessageReaction {
  id: string;
  emoji: string;
  user_id: string;
  created_at?: string;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read: boolean;
  sender?: Partial<Profile>;
  receiver?: Partial<Profile>;
  // Media fields
  message_type?: 'text' | 'media' | 'voice_note';
  file_url?: string | null;
  thumbnail_url?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  expiry_at?: string | null;
  downloaded?: boolean;
  file_deleted?: boolean;
  // Voice note fields
  media_url?: string | null;
  media_duration?: number | null;
  // Emoji reactions (from private_message_reactions)
  reactions?: MessageReaction[];
  // Reply/quote
  reply_to_id?: string | null;
  reply_to_message?: {
    id: string;
    content: string;
    user_id: string;
    username?: string;
  };
}

export type MessagingGateReason = 'not_mutual_follow' | 'missing_context' | 'awaiting_reciprocity';

export async function hasExistingConversation(targetUserId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return false;
    if (!targetUserId) return false;

    const { data, error: qErr } = await supabase
      .from('private_messages')
      .select('id')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},recipient_id.eq.${user.id})`)
      .limit(1);

    if (qErr) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function isMutualFollowingBetween(userAId: string, userBId: string): Promise<boolean> {
  try {
    const [aFollowsB, bFollowsA] = await Promise.all([
      supabase
        .from('user_followers')
        .select('follower_id', { count: 'exact', head: true })
        .eq('follower_id', userAId)
        .eq('following_id', userBId),
      supabase
        .from('user_followers')
        .select('follower_id', { count: 'exact', head: true })
        .eq('follower_id', userBId)
        .eq('following_id', userAId),
    ]);
    if (aFollowsB.error || bFollowsA.error) return false;
    return (aFollowsB.count ?? 0) > 0 && (bFollowsA.count ?? 0) > 0;
  } catch {
    return false;
  }
}

async function hasRecipientReplied(senderId: string, targetUserId: string): Promise<boolean> {
  try {
    const { data, error: qErr } = await supabase
      .from('private_messages')
      .select('id')
      .eq('sender_id', targetUserId)
      .eq('recipient_id', senderId)
      .limit(1);
    if (qErr) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/** Survives hard-delete of all outbound messages (see ensureDmInitiationIfColdThread). */
async function hasDmInitiationRow(senderId: string, targetUserId: string): Promise<boolean> {
  try {
    const { data, error: qErr } = await supabase
      .from('dm_initiations')
      .select('initiator_id')
      .eq('initiator_id', senderId)
      .eq('recipient_id', targetUserId)
      .maybeSingle();
    if (qErr) {
      if (!String(qErr.message || '').includes('does not exist')) {
        warn('[Chat] dm_initiations read:', qErr.message);
      }
      return false;
    }
    return data != null;
  } catch {
    return false;
  }
}

async function hasSenderInitiated(senderId: string, targetUserId: string): Promise<boolean> {
  try {
    const { data, error: qErr } = await supabase
      .from('private_messages')
      .select('id')
      .eq('sender_id', senderId)
      .eq('recipient_id', targetUserId)
      .limit(1);
    if (qErr) return false;
    if (Array.isArray(data) && data.length > 0) return true;
    return await hasDmInitiationRow(senderId, targetUserId);
  } catch {
    return false;
  }
}

/** Persist cold-DM initiation server-side (survives deleting all outbound private_messages). */
async function upsertDmInitiationRow(senderId: string, recipientId: string): Promise<void> {
  if (!senderId || !recipientId || senderId === recipientId) return;
  if (recipientId === OFFICIAL_ACCOUNT_ID) return;
  try {
    const mutual = await isMutualFollowingBetween(senderId, recipientId);
    if (mutual) return;
    const { error: upErr } = await supabase.from('dm_initiations').upsert(
      { initiator_id: senderId, recipient_id: recipientId },
      { onConflict: 'initiator_id,recipient_id' }
    );
    if (upErr) {
      warn('[Chat] dm_initiations upsert:', upErr.message, upErr.code ?? '');
    }
  } catch (e) {
    warn('[Chat] upsertDmInitiationRow:', e);
  }
}

/**
 * After the initiator deletes their last outbound message to this recipient, persist initiation so
 * reciprocity rules still apply (private_messages no longer has a row).
 */
async function ensureDmInitiationIfColdThread(senderId: string, recipientId: string): Promise<void> {
  if (!senderId || !recipientId || senderId === recipientId) return;
  if (recipientId === OFFICIAL_ACCOUNT_ID) return;
  try {
    const mutual = await isMutualFollowingBetween(senderId, recipientId);
    if (mutual) return;
    if (await hasRecipientReplied(senderId, recipientId)) return;

    const { count, error: cntErr } = await supabase
      .from('private_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', senderId)
      .eq('recipient_id', recipientId);
    if (cntErr) {
      warn('[Chat] ensureDmInitiation count:', cntErr.message);
      return;
    }
    if ((count ?? 0) > 0) return;

    await upsertDmInitiationRow(senderId, recipientId);
  } catch (e) {
    warn('[Chat] ensureDmInitiationIfColdThread:', e);
  }
}

/**
 * Same as canMessageUser, plus AsyncStorage when the DB has no dm_initiations row yet (e.g. migration
 * not applied) so “wait for reply” still holds after refresh/delete.
 */
export async function evaluateDmGateWithLocalPersistence(
  viewerId: string,
  partnerId: string
): Promise<{ allowed: boolean; reason: MessagingGateReason | null }> {
  const gate = await canMessageUser(partnerId);
  if (!gate.allowed) {
    return gate;
  }

  const mutual = await isMutualFollowingBetween(viewerId, partnerId);
  if (mutual) {
    await clearDmAwaitingReciprocity(viewerId, partnerId);
    return { allowed: true, reason: null };
  }

  if (await hasRecipientReplied(viewerId, partnerId)) {
    await clearDmAwaitingReciprocity(viewerId, partnerId);
    return { allowed: true, reason: null };
  }

  if (await getDmAwaitingReciprocity(viewerId, partnerId)) {
    return { allowed: false, reason: 'awaiting_reciprocity' };
  }

  await clearDmAwaitingReciprocity(viewerId, partnerId);
  return { allowed: true, reason: null };
}

export async function canMessageUser(targetUserId: string): Promise<{ allowed: boolean; reason: MessagingGateReason | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  const senderId = user?.id;
  if (!senderId || !targetUserId) return { allowed: false, reason: 'missing_context' };
  if (senderId === targetUserId) return { allowed: true, reason: null };

  // Official/support handle is always messageable
  if (targetUserId === OFFICIAL_ACCOUNT_ID) return { allowed: true, reason: null };

  // Mutual followers can chat freely.
  const mutual = await isMutualFollowingBetween(senderId, targetUserId);
  if (mutual) return { allowed: true, reason: null };

  // Non-mutual flow:
  // - allow first outgoing message
  // - then block further outgoing messages until recipient replies at least once
  const recipientHasReplied = await hasRecipientReplied(senderId, targetUserId);
  if (recipientHasReplied) return { allowed: true, reason: null };

  const senderHasInitiated = await hasSenderInitiated(senderId, targetUserId);
  if (senderHasInitiated) return { allowed: false, reason: 'awaiting_reciprocity' };

  return { allowed: true, reason: null };
}

/** True when the next successful outbound DM is the first from us, non-mutual, and we have not received a reply yet — after sending, UI should wait for reciprocity or mutual follow. */
export async function shouldAwaitReciprocityAfterOutbound(targetUserId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  const senderId = user?.id;
  if (!senderId || !targetUserId) return false;
  if (senderId === targetUserId) return false;
  if (targetUserId === OFFICIAL_ACCOUNT_ID) return false;
  const mutual = await isMutualFollowingBetween(senderId, targetUserId);
  if (mutual) return false;
  if (await hasRecipientReplied(senderId, targetUserId)) return false;
  return !(await hasSenderInitiated(senderId, targetUserId));
}

const buildContextStarterMessage = (postId: string, postText?: string) => {
  const clean = (postText ?? '').replace(/\s+/g, ' ').trim();
  const excerpt = clean.length > 140 ? clean.slice(0, 140).trimEnd() + '…' : clean;
  const quote = excerpt ? `“${excerpt}”` : 'a post';
  // Post id included for traceability/debug; UI can hide it later if desired.
  return `Replying to: ${quote}\nPost: ${postId}`;
};

export async function startContextChat(params: {
  targetUserId: string;
  contextPostId: string;
  contextPostText?: string;
}): Promise<{ ok: true } | { ok: false; reason: MessagingGateReason | 'not_authenticated' | 'error' }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return { ok: false, reason: 'not_authenticated' };
    if (!params.targetUserId || !params.contextPostId) return { ok: false, reason: 'missing_context' };

    const gate = await canMessageUser(params.targetUserId);
    if (!gate.allowed) return { ok: false, reason: gate.reason ?? 'error' };

    const starter = buildContextStarterMessage(params.contextPostId, params.contextPostText);
    const sent = await sendMessage(user.id, params.targetUserId, starter);
    if (!sent) return { ok: false, reason: 'error' };
    return { ok: true };
  } catch (e) {
    error('[Chat] startContextChat failed:', e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Get user profile by ID
 * @param userId The user ID to fetch
 * @returns The user profile or null
 */
export async function getUserProfile(userId: string): Promise<Partial<Profile> | null> {
  try {
    log(`[Chat] Fetching profile for user: ${userId}`);
    
    // Check if this is a placeholder user - return placeholder profile
    if (userId.startsWith('placeholder-user-')) {
      const { generatePlaceholderProfile } = await import('./placeholderProfile');
      const placeholderProfile = generatePlaceholderProfile(userId);
      if (placeholderProfile) {
        log(`[Chat] Returning placeholder profile for: ${placeholderProfile.username}`);
        return placeholderProfile as Partial<Profile>;
      }
    }
    
    // Check cache first for faster loading
    try {
      const { getCachedProfile } = await import('./profileCache');
      const cachedProfile = await getCachedProfile(userId);
      if (cachedProfile) {
        log(`[Chat] ✅ Using cached profile for: ${userId}`);
        // Return cached profile immediately, then fetch fresh data in background
        // Check if profile needs refresh
        const { shouldRefreshProfile } = await import('./profileCache');
        const needsRefresh = await shouldRefreshProfile(userId);
        
        if (!needsRefresh) {
          // Cache is still valid, return it
          return cachedProfile as Partial<Profile>;
        }
        
        // Cache expired or profile updated, fetch fresh but return cached for now
        // Fetch fresh data in background (don't await)
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
          .then(async ({ data, error }) => {
            if (!error && data) {
              // Cache the fresh profile
              const { cacheProfile } = await import('./profileCache');
              await cacheProfile(data);
              log(`[Chat] ✅ Cached fresh profile for: ${userId}`);
            }
          })
          .catch(err => error('[Chat] Error fetching fresh profile in background:', err));
        
        // Return cached profile immediately
        return cachedProfile as Partial<Profile>;
      }
    } catch (cacheError) {
      warn('[Chat] Cache check failed, fetching from database:', cacheError);
    }
    
    // No cache or cache miss - fetch from database
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      // PGRST116 means no rows found - user doesn't exist, return null silently
      if (error.code === 'PGRST116') {
        return null;
      }
      // Only log non-404 errors
      error('[Chat] Error fetching user profile:', error);
      return null;
    }

    // Cache the fetched profile
    if (data) {
      try {
        const { cacheProfile } = await import('./profileCache');
        await cacheProfile(data);
        log(`[Chat] ✅ Cached profile for: ${userId}`);
      } catch (cacheError) {
        warn('[Chat] Failed to cache profile:', cacheError);
      }
    }

    log(`[Chat] Profile fetched successfully for: ${userId}`);
    return data;
  } catch (error) {
    error('[Chat] Exception fetching user profile:', error);
    return null;
  }
}

// Helper function to validate UUID format
const isValidUUID = (id: string | undefined | null): boolean => {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

/**
 * Get messages between two users with blocking check
 * @param userId1 First user ID
 * @param userId2 Second user ID
 * @returns Array of messages or empty array if blocked
 */
export async function getMessages(userId1: string, userId2: string): Promise<Message[]> {
  try {
    // Validate UUIDs before querying
    if (!isValidUUID(userId1) || !isValidUUID(userId2)) {
      warn(`[Chat] Invalid UUID format - userId1: ${userId1}, userId2: ${userId2}`);
      return [];
    }
    // Check if users are blocked (bidirectional)
    const blockUserModule = await import('./blockUser');
    const blocked = await blockUserModule.isUserBlocked(userId1, userId2);
    
    if (blocked) {
      log('[Chat] Users are blocked, returning empty messages');
      return [];
    }

    // Check if current user (userId1) deleted this conversation - only show messages after that
    const { getHiddenAtForPartner } = await import('./supabase');
    const hiddenAt = await getHiddenAtForPartner(userId2);
    const filterAfter = hiddenAt ? new Date(hiddenAt).getTime() : 0;

    // Fetch messages from private_messages table
    const { data: messages, error } = await supabase
      .from('private_messages')
      .select('*')
      .or(`and(sender_id.eq.${userId1},recipient_id.eq.${userId2}),and(sender_id.eq.${userId2},recipient_id.eq.${userId1})`)
      .order('created_at', { ascending: true });

    if (error) {
      error('[Chat] Error fetching messages:', error);
      return [];
    }

    if (!messages || messages.length === 0) {
      return [];
    }

    // If user deleted this conversation, only return messages created after the delete
    const filteredMessages = filterAfter
      ? messages.filter((m: { created_at: string }) => new Date(m.created_at).getTime() > filterAfter)
      : messages;

    // Fetch profiles for all unique user IDs
    const userIds = new Set<string>();
    filteredMessages.forEach((msg: { sender_id?: string; recipient_id?: string }) => {
      if (msg.sender_id) userIds.add(msg.sender_id);
      if (msg.recipient_id) userIds.add(msg.recipient_id);
    });

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', Array.from(userIds));

    const profileMap = new Map<string, Partial<Profile>>();
    profiles?.forEach(profile => {
      profileMap.set(profile.id, profile);
    });

    const messageIds = filteredMessages.map((m: { id: string }) => m.id);
    const { getReactionsForMessageIds } = await import('./privateMessageReactions');
    const reactionsMap = await getReactionsForMessageIds(messageIds);

    const msgById = new Map<string, any>();
    filteredMessages.forEach((m: any) => msgById.set(m.id, m));

    const enrichedMessages: Message[] = filteredMessages.map((msg: any) => {
      let reply_to_message: Message['reply_to_message'] = undefined;
      if (msg.reply_to_id) {
        const replied = msgById.get(msg.reply_to_id);
        if (replied) {
          const profile = profileMap.get(replied.sender_id);
          reply_to_message = {
            id: replied.id,
            content: replied.content ?? '',
            user_id: replied.sender_id,
            username: profile?.username ?? undefined,
          };
        }
      }
      return {
        id: msg.id,
        sender_id: msg.sender_id,
        recipient_id: msg.recipient_id,
        content: msg.content,
        created_at: msg.created_at,
        read: msg.read || false,
        sender: profileMap.get(msg.sender_id),
        receiver: profileMap.get(msg.recipient_id),
        message_type: msg.message_type || 'text',
        file_url: msg.file_url,
        thumbnail_url: msg.thumbnail_url,
        file_type: msg.file_type,
        file_size: msg.file_size,
        expiry_at: msg.expiry_at,
        downloaded: msg.downloaded || false,
        file_deleted: msg.file_deleted || false,
        media_url: msg.media_url,
        media_duration: msg.media_duration,
        reactions: reactionsMap.get(msg.id)?.map(r => ({ id: r.id, emoji: r.emoji, user_id: r.user_id, created_at: r.created_at })) ?? [],
        reply_to_id: msg.reply_to_id ?? null,
        reply_to_message,
      };
    });

    return enrichedMessages;
  } catch (error) {
    error('[Chat] Exception fetching messages:', error);
    return [];
  }
}

/**
 * Send a voice note with blocking check and 24-hour expiry
 * @param senderId Sender user ID
 * @param receiverId Receiver user ID
 * @param mediaUrl Voice note audio URL
 * @param duration Duration in seconds
 * @param expiryAt Expiry timestamp (24 hours from now)
 * @returns The sent message or null if blocked/error
 */
export async function sendVoiceNote(
  senderId: string,
  receiverId: string,
  mediaUrl: string,
  duration: number,
  expiryAt: string
): Promise<Message | null> {
  try {
    // Check if users are blocked (bidirectional)
    const blockUserModule = await import('./blockUser');
    const blocked = await blockUserModule.isUserBlocked(senderId, receiverId);
    
    if (blocked) {
      log('[Chat] Cannot send voice note - users are blocked');
      return null;
    }

    const messageData: any = {
      sender_id: senderId,
      recipient_id: receiverId,
      content: '🎤 Voice Message',
      read: false,
      message_type: 'voice_note',
      media_url: mediaUrl,
      media_duration: duration,
      expiry_at: expiryAt,
    }

    const { data, error: voiceInsertErr } = await supabase
      .from('private_messages')
      .insert(messageData)
      .select('*')
      .single();

    if (voiceInsertErr) {
      error('[Chat] Error sending voice note:', voiceInsertErr);
      return null;
    }

    try {
      const { requestImmediateMessagePush } = await import('./triggerProcessNotification');
      requestImmediateMessagePush({
        id: data.id,
        sender_id: data.sender_id,
        recipient_id: data.recipient_id,
      });
    } catch {
      // best-effort
    }

    await upsertDmInitiationRow(senderId, receiverId);

    // Fetch profiles for sender and receiver
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', [senderId, receiverId]);

    const profileMap = new Map<string, Partial<Profile>>();
    profiles?.forEach(profile => {
      profileMap.set(profile.id, profile);
    });

    return {
      id: data.id,
      sender_id: data.sender_id,
      recipient_id: data.recipient_id,
      content: data.content,
      created_at: data.created_at,
      read: data.read || false,
      sender: profileMap.get(senderId),
      receiver: profileMap.get(receiverId),
      message_type: data.message_type || 'voice_note',
      media_url: data.media_url,
      media_duration: data.media_duration,
      expiry_at: data.expiry_at,
      downloaded: data.downloaded || false,
      file_deleted: data.file_deleted || false,
    };
  } catch (err) {
    error('[Chat] Exception sending voice note:', err);
    return null;
  }
}

/**
 * Send a message with blocking check
 * @param senderId Sender user ID
 * @param receiverId Receiver user ID
 * @param content Message content
 * @param mediaData Optional media data (fileUrl, thumbnailUrl, etc.)
 * @param replyToId Optional ID of the message being replied to
 * @returns The sent message or null if blocked/error
 */
export async function sendMessage(
  senderId: string,
  receiverId: string,
  content: string,
  mediaData?: {
    fileUrl: string;
    thumbnailUrl?: string | null;
    fileType: string;
    fileSize?: number;
    expiryAt: string;
  },
  replyToId?: string | null
): Promise<Message | null> {
  try {
    // Check if users are blocked (bidirectional)
    const blockUserModule = await import('./blockUser');
    const blocked = await blockUserModule.isUserBlocked(senderId, receiverId);
    
    if (blocked) {
      log('[Chat] Cannot send message - users are blocked');
      return null;
    }

    const messageData: any = {
      sender_id: senderId,
      recipient_id: receiverId,
      content,
      read: false,
    }

    // Add media fields if provided
    if (mediaData) {
      messageData.message_type = 'media'
      messageData.file_url = mediaData.fileUrl
      messageData.thumbnail_url = mediaData.thumbnailUrl
      messageData.file_type = mediaData.fileType
      messageData.file_size = mediaData.fileSize
      messageData.expiry_at = mediaData.expiryAt
    } else {
      messageData.message_type = 'text'
    }

    if (replyToId) {
      messageData.reply_to_id = replyToId;
    }

    const { data, error: insertErr } = await supabase
      .from('private_messages')
      .insert(messageData)
      .select('*')
      .single();

    if (insertErr) {
      error('[Chat] Error sending message:', insertErr);
      return null;
    }

    try {
      const { requestImmediateMessagePush } = await import('./triggerProcessNotification');
      requestImmediateMessagePush({
        id: data.id,
        sender_id: data.sender_id,
        recipient_id: data.recipient_id,
      });
    } catch {
      // best-effort: cron still drains the queue
    }

    await upsertDmInitiationRow(senderId, receiverId);

    // Fetch profiles for sender and receiver
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', [senderId, receiverId]);

    const profileMap = new Map<string, Partial<Profile>>();
    profiles?.forEach(profile => {
      profileMap.set(profile.id, profile);
    });

    return {
      id: data.id,
      sender_id: data.sender_id,
      recipient_id: data.recipient_id,
      content: data.content,
      created_at: data.created_at,
      read: data.read || false,
      sender: profileMap.get(senderId),
      receiver: profileMap.get(receiverId),
      message_type: data.message_type || 'text',
      file_url: data.file_url,
      thumbnail_url: data.thumbnail_url,
      file_type: data.file_type,
      file_size: data.file_size,
      expiry_at: data.expiry_at,
      downloaded: data.downloaded || false,
      file_deleted: data.file_deleted || false,
      media_url: data.media_url,
      media_duration: data.media_duration,
      reply_to_id: data.reply_to_id ?? null,
    };
  } catch (err) {
    error('[Chat] Exception sending message:', err);
    return null;
  }
}

/**
 * Mark messages as read
 * @param userId Current user ID
 * @param partnerId Partner user ID
 */
export async function markMessagesAsRead(userId: string, partnerId: string): Promise<void> {
  try {
    await markConversationAsRead(userId, partnerId);
  } catch (error) {
    error('[Chat] Error marking messages as read:', error);
  }
}

/**
 * Subscribe to new messages between two users
 * @param userId1 First user ID
 * @param userId2 Second user ID
 * @param callback Callback function for new messages
 * @returns Subscription object
 */
export function subscribeToMessages(
  userId1: string,
  userId2: string,
  callback: (message: Message) => void
) {
  const channelName = `messages:${userId1}:${userId2}`;
  log('[Chat] Setting up subscription channel:', channelName);
  
  const channel = supabase
    .channel(channelName, {
      config: {
        // Use broadcast mode for better reliability on both platforms
        broadcast: { self: false },
        // Preserve messages across reconnections
        presence: { key: channelName },
        // iOS: Add reconnect configuration for better reliability
        ...(Platform.OS === 'ios' && {
          reconnectAfterMs: (tries: number) => Math.min(tries * 1000, 5000), // Faster reconnection on iOS
        }),
      },
    })
    // Subscribe to INSERT events (new messages)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'private_messages',
        filter: `or(and(sender_id.eq.${userId1},recipient_id.eq.${userId2}),and(sender_id.eq.${userId2},recipient_id.eq.${userId1}))`,
      },
      async (payload) => {
        try {
          log('[Chat] 🔔 New message received in subscription:', {
            messageId: payload.new?.id,
            senderId: payload.new?.sender_id,
            recipientId: payload.new?.recipient_id,
            content: payload.new?.content?.substring(0, 30),
            eventType: payload.eventType
          });
          
          // Use payload.new directly - no need to fetch from database!
          const message = payload.new;
          
          if (!message || !message.id) {
            error('[Chat] Invalid message in payload:', payload);
            return;
          }

          // Fetch profiles in parallel (fast, but we'll wait for it)
          // Using Promise.all for parallel execution
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url')
            .in('id', [message.sender_id, message.recipient_id]);

          const profileMap = new Map<string, Partial<Profile>>();
          profiles?.forEach(profile => {
            profileMap.set(profile.id, profile);
          });

          // Create enriched message with profiles
          const enrichedMessage: Message = {
            id: message.id,
            sender_id: message.sender_id,
            recipient_id: message.recipient_id,
            content: message.content,
            created_at: message.created_at,
            read: message.read || false,
            sender: profileMap.get(message.sender_id),
            receiver: profileMap.get(message.recipient_id),
            message_type: message.message_type || 'text',
            file_url: message.file_url,
            thumbnail_url: message.thumbnail_url,
            file_type: message.file_type,
            file_size: message.file_size,
            expiry_at: message.expiry_at,
            downloaded: message.downloaded || false,
            file_deleted: message.file_deleted || false,
            media_url: message.media_url,
            media_duration: message.media_duration,
          };

          // Call callback immediately (no extra database fetch delay!)
          log('[Chat] ✅ Calling callback with enriched message:', enrichedMessage.id);
          callback(enrichedMessage);
        } catch (error) {
          error('[Chat] ❌ Error processing INSERT event:', error);
        }
      }
    )
    // Subscribe to UPDATE events (read status, delivery status, etc.)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'private_messages',
        filter: `or(and(sender_id.eq.${userId1},recipient_id.eq.${userId2}),and(sender_id.eq.${userId2},recipient_id.eq.${userId1}))`,
      },
      async (payload) => {
        try {
          log('[Chat] 🔔 Message UPDATE received in subscription:', {
            messageId: payload.new?.id,
            oldRead: payload.old?.read,
            newRead: payload.new?.read,
            oldDeleted: payload.old?.deleted_at,
            newDeleted: payload.new?.deleted_at,
            eventType: payload.eventType
          });
          
          const message = payload.new;
          
          if (!message || !message.id) {
            error('[Chat] Invalid message in UPDATE payload:', payload);
            return;
          }

          // Fetch profiles for the message
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url')
            .in('id', [message.sender_id, message.recipient_id]);

          const profileMap = new Map<string, Partial<Profile>>();
          profiles?.forEach(profile => {
            profileMap.set(profile.id, profile);
          });

          // Create enriched message with UPDATE flag
          const enrichedMessage: Message & { isUpdate?: boolean; isDelete?: boolean } = {
            id: message.id,
            sender_id: message.sender_id,
            recipient_id: message.recipient_id,
            content: message.content,
            created_at: message.created_at,
            read: message.read || false,
            sender: profileMap.get(message.sender_id),
            receiver: profileMap.get(message.recipient_id),
            message_type: message.message_type || 'text',
            file_url: message.file_url,
            thumbnail_url: message.thumbnail_url,
            file_type: message.file_type,
            file_size: message.file_size,
            expiry_at: message.expiry_at,
            downloaded: message.downloaded || false,
            file_deleted: message.file_deleted || false,
            media_url: message.media_url,
            media_duration: message.media_duration,
            isUpdate: true, // Mark as UPDATE event
            isDelete: !!message.deleted_at, // Check if message was deleted
          };

          // Call callback with UPDATE flag
          log('[Chat] ✅ Calling callback with UPDATE message:', enrichedMessage.id);
          callback(enrichedMessage as Message);
        } catch (error) {
          error('[Chat] ❌ Error processing UPDATE event:', error);
        }
      }
    )
    // Subscribe to DELETE events (message deletions)
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'private_messages',
        filter: `or(and(sender_id.eq.${userId1},recipient_id.eq.${userId2}),and(sender_id.eq.${userId2},recipient_id.eq.${userId1}))`,
      },
      async (payload) => {
        try {
          log('[Chat] 🔔 Message DELETE received in subscription:', {
            messageId: payload.old?.id,
            eventType: payload.eventType
          });
          
          const message = payload.old;
          
          if (!message || !message.id) {
            error('[Chat] Invalid message in DELETE payload:', payload);
            return;
          }

          // Create minimal message object for deletion
          const deletedMessage: Message & { isDelete?: boolean } = {
            id: message.id,
            sender_id: message.sender_id,
            recipient_id: message.recipient_id,
            content: message.content || '',
            created_at: message.created_at || new Date().toISOString(),
            read: false,
            message_type: message.message_type || 'text',
            isDelete: true, // Mark as DELETE event
          };

          // Call callback with DELETE flag
          log('[Chat] ✅ Calling callback with DELETE message:', deletedMessage.id);
          callback(deletedMessage as Message);
        } catch (error) {
          error('[Chat] ❌ Error processing DELETE event:', error);
        }
      }
    )
    .subscribe((status) => {
      log('[Chat] 📡 Message subscription status:', status, Platform.OS === 'android' ? '(Android)' : Platform.OS === 'ios' ? '(iOS)' : '(Other)');
      if (status === 'SUBSCRIBED') {
        log('[Chat] ✅ Successfully subscribed to real-time messages (INSERT, UPDATE, DELETE)');
      } else if (status === 'CHANNEL_ERROR') {
        error('[Chat] ❌ Channel subscription error');
        // Don't auto-reconnect on error - let the component handle it via useEffect
        // Auto-reconnection was causing infinite loops
      } else if (status === 'TIMED_OUT') {
        warn('[Chat] ⏱️ Channel subscription timed out - using polling fallback');
        // Don't auto-reconnect on timeout - let the component handle it via useEffect
      } else if (status === 'CLOSED') {
        log('[Chat] 🔒 Channel subscription closed');
        // Don't auto-reconnect on close - let the component handle it via useEffect
        // The polling fallback will catch messages while subscription is down
      }
    });
  
  return channel;
}

/**
 * Delete a message
 * @param messageId Message ID to delete
 * @param userId Current user ID (must be sender)
 * @returns Success boolean
 */
export async function deleteMessage(messageId: string, userId: string): Promise<boolean> {
  try {
    const { data: row, error: fetchErr } = await supabase
      .from('private_messages')
      .select('recipient_id')
      .eq('id', messageId)
      .eq('sender_id', userId)
      .maybeSingle();

    if (fetchErr) {
      warn('[Chat] deleteMessage prefetch:', fetchErr.message);
    }

    const recipientId = row?.recipient_id as string | undefined;

    const { error: deleteErr } = await supabase
      .from('private_messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', userId); // Only sender can delete

    if (deleteErr) {
      error('[Chat] Error deleting message:', deleteErr);
      return false;
    }

    if (recipientId) {
      await ensureDmInitiationIfColdThread(userId, recipientId);
    }

    return true;
  } catch (err) {
    error('[Chat] Exception deleting message:', err);
    return false;
  }
}

/**
 * Refresh message read status
 * @param messageIds Array of message IDs to check
 * @returns Map of message ID to read status
 */
export async function refreshMessageStatus(messageIds: string[]): Promise<Map<string, boolean>> {
  const statusMap = new Map<string, boolean>();
  
  try {
    if (messageIds.length === 0) return statusMap;

    const { data, error } = await supabase
      .from('private_messages')
      .select('id, read')
      .in('id', messageIds);

    if (error) {
      error('[Chat] Error refreshing message status:', error);
      return statusMap;
    }

    data?.forEach((msg) => {
      statusMap.set(msg.id, msg.read || false);
    });

    return statusMap;
  } catch (error) {
    error('[Chat] Exception refreshing message status:', error);
    return statusMap;
  }
}
