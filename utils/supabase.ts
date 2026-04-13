import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants/Endpoints';
import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';


// Ensure polyfills are loaded before creating Supabase client
// Supabase real-time client may use ReadableStream internally
// NOTE: Polyfills are loaded in index.js before any modules load, so ReadableStream
// should already be available. This is just a verification check.
// Wrap in try-catch to prevent any errors during module evaluation from breaking imports
try {
  if (Platform && Platform.OS && Platform.OS !== 'web' && typeof global !== 'undefined' && global) {
    // Verify ReadableStream is available (should be set by polyfills in index.js)
    // Use a safe check to avoid any potential issues during Metro static analysis
    const hasReadableStream = typeof global.ReadableStream !== 'undefined' && global.ReadableStream !== null;
    if (!hasReadableStream) {
      error('[supabase] ❌ WARNING: ReadableStream not available - Supabase real-time may fail');
      error('[supabase] ❌ This usually means polyfills failed to load in index.js');
      error('[supabase] ❌ Try: npm start -- --reset-cache');
    }
  }
} catch (polyfillCheckError: any) {
  // Silently handle any errors during polyfill check - don't break module loading
  const errorMsg = polyfillCheckError?.message || String(polyfillCheckError);
  if (!errorMsg.includes('unknown module') && !errorMsg.includes('undefined')) {
    warn('[supabase] ⚠️ Error checking ReadableStream:', errorMsg);
  }
}

// Validate Supabase configuration before creating client
if (!SUPABASE_URL || SUPABASE_URL === '' || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === '') {
  const errorMsg = '❌ Supabase configuration missing!\n\n' +
    'Please ensure your .env file contains:\n' +
    '  EXPO_PUBLIC_SUPABASE_URL=your_supabase_url\n' +
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key\n\n' +
    'After updating .env, restart Metro bundler with: npx expo start --clear\n\n' +
    'Current values:\n' +
    `  SUPABASE_URL: ${SUPABASE_URL ? 'Present but empty' : 'Missing'}\n` +
    `  SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? 'Present but empty' : 'Missing'}\n` +
    `  process.env.EXPO_PUBLIC_SUPABASE_URL: ${process.env.EXPO_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing'}\n` +
    `  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY: ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing'}`;
  error(errorMsg);
  
  // In development, provide more helpful error
  if (__DEV__) {
    error('\n📝 To fix this:\n' +
      '1. Open your .env file in the project root\n' +
      '2. Add these lines:\n' +
      '   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n' +
      '   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here\n' +
      '3. Save the file\n' +
      '4. Restart Metro: npx expo start --clear\n' +
      '5. Rebuild the app if needed\n');
  }
  
  throw new Error('Supabase configuration missing. Check console for details.');
}

// Create Supabase client using environment variables
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// CRITICAL: Throttle refresh calls globally to prevent excessive API calls
// Track last refresh time and pending refresh promise
let lastRefreshTime = 0;
let pendingRefreshPromise: Promise<boolean> | null = null;
const MIN_REFRESH_INTERVAL_MS = 30000; // 30 seconds minimum between refreshes

// Helper function to refresh auth session
export const refreshAuthSession = async (): Promise<boolean> => {
  // CRITICAL: Throttle refresh calls globally
  // If a refresh is already in progress, return that promise instead of starting a new one
  if (pendingRefreshPromise) {
    log('⏳ [AUTH] Refresh already in progress, waiting for existing refresh...');
    return pendingRefreshPromise;
  }
  
  // Check if we've refreshed recently (within last 30 seconds)
  const now = Date.now();
  const timeSinceLastRefresh = now - lastRefreshTime;
  
  if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL_MS) {
    const remainingSeconds = Math.ceil((MIN_REFRESH_INTERVAL_MS - timeSinceLastRefresh) / 1000);
    log(`⏳ [AUTH] Refresh throttled - last refresh was ${Math.floor(timeSinceLastRefresh / 1000)}s ago. Waiting ${remainingSeconds}s...`);
    
    // Return the last refresh result (check current session instead of refreshing again)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession && currentSession.access_token) {
        // Session exists and is likely still valid (we just refreshed recently)
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }
  
  // Create a new refresh promise
  pendingRefreshPromise = (async () => {
    try {
      // Check network before attempting refresh
      const NetInfo = (await import('@react-native-community/netinfo')).default;
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        log('Offline detected - skipping session refresh');
        return false; // Return false but don't throw - allows fallback to stored session
      }
      
      // CRITICAL: Check if there's a session before attempting to refresh
      // refreshSession() requires an existing session with a refresh token
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        log('No session available to refresh - skipping refresh attempt');
        return false; // No session to refresh, return false gracefully
      }
      
      // Update last refresh time BEFORE making the API call
      lastRefreshTime = Date.now();
      
      // Only refresh if we have a valid session
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        // Check if it's the "session missing" error - this is expected if no session exists
        if (error.message?.includes('Auth session missing') || error.message?.includes('session missing') || error.message?.includes('No session')) {
          log('No session to refresh - this is expected if user is not logged in');
          return false; // Return false gracefully - not an error condition
        }
        // Check if it's a rate limit error - this is critical to detect
        if (error.message?.includes('rate limit') || error.message?.includes('Rate limit') || error.message?.includes('Request rate limit')) {
          log('⚠️ Rate limit reached during session refresh - will use stored session');
          return false; // Return false but don't throw - allows fallback to stored session
        }
        // Check if it's a network error
        if (error.message?.includes('Network request failed') || error.message?.includes('network')) {
          log('Network error during session refresh - will use stored session');
          return false; // Return false but don't throw - allows fallback to stored session
        }
        log('Auth session refresh failed:', error.message);
        return false;
      }
      
      // Verify we got a refreshed session
      if (data?.session) {
        log('Auth session refreshed successfully');
        return true;
      } else {
        log('Session refresh returned no session');
        return false;
      }
    } catch (error: any) {
      // Check if it's the "session missing" error - this is expected if no session exists
      if (error?.message?.includes('Auth session missing') || error?.message?.includes('session missing') || error?.message?.includes('No session')) {
        log('No session to refresh - this is expected if user is not logged in');
        return false; // Return false gracefully - not an error condition
      }
      // Check if it's a rate limit error - this is critical to detect
      if (error?.message?.includes('rate limit') || error?.message?.includes('Rate limit') || error?.message?.includes('Request rate limit')) {
        log('⚠️ Rate limit reached refreshing auth session - will use stored session');
        return false; // Return false but don't throw - allows fallback to stored session
      }
      // Check if it's a network error
      if (error?.message?.includes('Network request failed') || error?.message?.includes('network')) {
        log('Network error refreshing auth session - will use stored session');
        return false; // Return false but don't throw - allows fallback to stored session
      }
      log('Error refreshing auth session:', error);
      return false;
    } finally {
      // Always clear pending promise when done
      pendingRefreshPromise = null;
    }
  })();
  
  // Return the promise
  return pendingRefreshPromise;
};

// Types for private conversations
export interface PrivateConversation {
  id: string;
  conversation_with: string;
  conversation_with_name: string;
  conversation_with_avatar: string;
  last_message_at: string;
  unread_count: number;
  last_message_content?: string;
  // WhatsApp-style status indicators for the last message
  last_message_sender_id?: string;
  last_message_read?: boolean;
  last_message_delivered?: boolean;
}

// Profile type
export interface Profile {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  is_placeholder?: boolean; // Demo/placeholder account flag
  created_at?: string;
  updated_at?: string;
  date_of_birth?: string; // ISO date (YYYY-MM-DD) for age-gating
  // Business account (optional, lite)
  account_type?: 'regular' | 'business';
  business_name?: string; // display name for business (distinct from full_name)
  business_logo_url?: string; // optional logo image url
  business_tagline?: string; // short tagline/slogan (e.g. 60 chars)
  business_type?: string; // e.g. restaurant, retail, other
  business_category?: string; // custom when business_type === 'other'
  business_address?: string;
  business_website?: string; // optional url
  business_social_media?: string; // optional e.g. Instagram, Facebook links
  business_phone?: string; // optional contact phone
  business_email?: string; // optional contact email
  business_hours?: string; // optional e.g. "Mon–Fri 9am–5pm"
  business_photo_urls?: string[]; // optional, max 5 (business profile only, lite)
  last_seen?: string | null; // presence: updated when in chat/call/stream; 90s threshold for "online"
}

// Chat message type
export interface ChatMessage {
  id: string;
  content: string;
  user_id: string;
  conversation_id: string;
  created_at: string;
  updated_at?: string;
  reply_to_message_id?: string;
  is_deleted?: boolean;
}

// Server-side hidden conversation helpers
export const hideConversationServer = async (partnerId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase
      .from('hidden_conversations')
      .insert({ user_id: user.id, partner_id: partnerId });
    if (error && error.code !== '23505') { // ignore unique violation
      error('Error hiding conversation server-side:', error);
      return false;
    }
    return true;
  } catch (e) {
    error('hideConversationServer exception:', e);
    return false;
  }
};

export const unhideConversationServer = async (partnerId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase
      .from('hidden_conversations')
      .delete()
      .eq('user_id', user.id)
      .eq('partner_id', partnerId);
    if (error) {
      error('Error un-hiding conversation server-side:', error);
      return false;
    }
    return true;
  } catch (e) {
    error('unhideConversationServer exception:', e);
    return false;
  }
};

interface HiddenRow { partner_id: string; created_at: string }

const getHiddenRows = async (): Promise<HiddenRow[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('hidden_conversations')
      .select('partner_id, created_at')
      .eq('user_id', user.id);
    if (error) {
      error('Error fetching hidden_conversations:', error);
      return [];
    }
    return (data as any) || [];
  } catch (e) {
    error('getHiddenPartnerIds exception:', e);
    return [];
  }
};

/**
 * Get when the current user hid a conversation with a partner.
 * Returns the created_at timestamp if hidden, null otherwise.
 * Used to filter out old messages when a user "deleted" a conversation.
 */
export const getHiddenAtForPartner = async (partnerId: string): Promise<string | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('hidden_conversations')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('partner_id', partnerId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as any).created_at ?? null;
  } catch (e) {
    error('getHiddenAtForPartner exception:', e);
    return null;
  }
};

/**
 * Get preview text for a message (used in conversation list and notifications)
 */
export const getMessagePreview = (message: any): string => {
  // For media messages
  if (message.message_type === 'media') {
    const mediaType = message.file_type?.startsWith('video/') ? '🎥 Video' : '📷 Photo';
    // If there's a caption, show it with the media icon
    if (message.content && message.content.trim()) {
      return `${mediaType}: ${message.content}`;
    }
    // Otherwise just show the media type
    return mediaType;
  }
  
  // For voice notes
  if (message.message_type === 'voice_note') {
    return '🎤 Voice message';
  }
  
  // For regular text messages
  return message.content || 'Message';
};

// Fetch private conversations for the current user
export const fetchPrivateConversations = async (): Promise<PrivateConversation[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('No authenticated user found');
      return [];
    }

    log('Fetching conversations for user:', user.id);

    // Get all messages for the current user (both sent and received)
    const { data: messages, error: messagesError } = await supabase
      .from('private_messages')
      // Only select fields needed for conversation list (much lighter than '*')
      .select('id,sender_id,recipient_id,content,created_at,read,delivered,message_type,file_type')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (messagesError) {
      error('Error fetching messages:', messagesError);
      return [];
    }

    log('Found', messages.length, 'total messages');

    // Get blocked user IDs for filtering (bidirectional blocking)
    const blockUserModule = await import('./blockUser');
    const blockedUserIds = await blockUserModule.getBlockedUserIds(user.id);
    log(`[fetchPrivateConversations] Filtering ${blockedUserIds.length} blocked users from conversations`);

    // Load server-side hidden list with timestamps
    const hiddenRows = await getHiddenRows();
    const hiddenMap = new Map<string, string>(hiddenRows.map(r => [r.partner_id, r.created_at]));
    
    // Group messages by conversation partner
    const conversationMap = new Map<string, {
      last_message_at: string;
      last_message_content: string;
      last_message_sender_id?: string;
      last_message_read?: boolean;
      last_message_delivered?: boolean;
    }>();
    const unreadCountMap = new Map<string, number>();
    
    for (const message of messages) {
      const partnerId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
      
      // Skip messages from/to blocked users (bidirectional blocking)
      if (blockedUserIds.includes(partnerId)) {
        log(`[fetchPrivateConversations] 🚫 Skipping message from blocked user ${partnerId}`);
        continue;
      }
      const hiddenAt = hiddenMap.get(partnerId);
      if (hiddenAt) {
        // If there is a newer incoming message than the hide time, auto-unhide
        // This allows deleted conversations to reappear when the user receives a new message
        const isIncoming = message.sender_id === partnerId;
        if (isIncoming && new Date(message.created_at) > new Date(hiddenAt)) {
          // New message received - auto-unhide the conversation
          log(`[fetchPrivateConversations] Auto-unhiding conversation with ${partnerId} (new message received)`);
          unhideConversationServer(partnerId).catch(() => {});
        } else if (!conversationMap.has(partnerId)) {
          // Still hidden; skip entire conversation (we're iterating newest->oldest)
          continue;
        }
      }
      
      // Track unread incoming messages
      const isIncoming = message.sender_id !== user.id;
      const isUnread = (message as any).read === false && (message as any).recipient_id === user.id;
      if (isIncoming && isUnread) {
        unreadCountMap.set(partnerId, (unreadCountMap.get(partnerId) || 0) + 1);
      }

      if (!conversationMap.has(partnerId)) {
        // First (newest) message seen for this partner becomes the snippet
        conversationMap.set(partnerId, {
          last_message_at: message.created_at,
          last_message_content: getMessagePreview(message),
          last_message_sender_id: message.sender_id,
          last_message_read: (message as any).read ?? false,
          last_message_delivered: (message as any).delivered ?? true,
        });
      }
    }

    // Batch fetch profiles for all partners (avoids N sequential network calls)
    const partnerIds = Array.from(conversationMap.keys());
    const profileMap = new Map<string, { full_name?: string; username?: string; avatar_url?: string }>();
    if (partnerIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', partnerIds);
      if (profilesError) {
        warn('[fetchPrivateConversations] Error fetching profiles (non-critical):', profilesError);
      } else if (profiles) {
        profiles.forEach((p: any) => {
          profileMap.set(p.id, { full_name: p.full_name, username: p.username, avatar_url: p.avatar_url });
        });
      }
    }

    // Convert map to array and sort by last message time
    const conversations: PrivateConversation[] = partnerIds
      .map((partnerId) => {
        const conv = conversationMap.get(partnerId)!;
        const profile = profileMap.get(partnerId);
        return {
          id: partnerId,
          conversation_with: partnerId,
          conversation_with_name: profile?.full_name || profile?.username || 'Unknown User',
          conversation_with_avatar: profile?.avatar_url || '',
          last_message_at: conv.last_message_at,
          last_message_content: conv.last_message_content,
          unread_count: unreadCountMap.get(partnerId) || 0,
          last_message_sender_id: conv.last_message_sender_id,
          last_message_read: conv.last_message_read,
          last_message_delivered: conv.last_message_delivered,
        };
      })
      .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

    log('Returning', conversations.length, 'conversations');
    return conversations;
  } catch (error) {
    error('Error in fetchPrivateConversations:', error);
    return [];
  }
};

// Mark messages as read for a conversation
export const markConversationAsRead = async (conversationPartnerId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.rpc('mark_messages_as_read', {
      for_user_id: user.id,
      from_user_id: conversationPartnerId
    });

    if (error) {
      error('Error marking messages as read:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('Error in markConversationAsRead:', error);
    return false;
  }
};

// Delete a conversation and all its messages
export const deleteConversation = async (conversationPartnerId: string): Promise<boolean> => {
  try {
    log('[DeleteConversation] Starting deletion process...');
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      error('[DeleteConversation] Auth error:', authError);
      return false;
    }
    
    if (!user) {
      error('[DeleteConversation] No authenticated user found');
      return false;
    }

    log('[DeleteConversation] Attempting to delete conversation between:', user.id, 'and', conversationPartnerId);

    // Use the EXACT same approach as fetchPrivateConversations since that works
    log('[DeleteConversation] Using the same pattern as fetchPrivateConversations...');
    
    // First, get all messages for this conversation using the working pattern
    const { data: messages, error: messagesError } = await supabase
      .from('private_messages')
      .select('*')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (messagesError) {
      error('[DeleteConversation] Error fetching messages (same as fetchPrivateConversations):', messagesError);
      error('[DeleteConversation] Full error details:', JSON.stringify(messagesError, null, 2));
      return false;
    }

    log('[DeleteConversation] Successfully fetched', messages.length, 'total messages');

    // Filter messages for this specific conversation - but only messages WE sent
    // Due to RLS policies, we can only delete messages we sent, not messages received
    const conversationMessages = messages.filter(message => {
      const partnerId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
      const isOurConversation = partnerId === conversationPartnerId;
      const weSentIt = message.sender_id === user.id;
      return isOurConversation && weSentIt;
    });

    log('[DeleteConversation] Found', conversationMessages.length, 'messages we sent in this conversation');
    log('[DeleteConversation] (Note: Due to RLS policies, we can only delete messages we sent, not received messages)');

    if (conversationMessages.length === 0) {
      log('[DeleteConversation] No messages we sent found for this conversation');
      log('[DeleteConversation] This is normal - we can only delete our own sent messages due to security policies');
      return true;
    }

    // Delete messages one by one using their IDs (most reliable approach)
    log('[DeleteConversation] Deleting messages individually by ID...');
    let deletedCount = 0;
    let failedDeletions = 0;

    for (const message of conversationMessages) {
      try {
        log(`[DeleteConversation] Attempting to delete message ${message.id}...`);
        
        const { error: deleteError, data: deleteData } = await supabase
          .from('private_messages')
          .delete()
          .eq('id', message.id)
          .select();

        if (deleteError) {
          error(`[DeleteConversation] Failed to delete message ${message.id}:`, deleteError);
          error(`[DeleteConversation] Delete error details:`, JSON.stringify(deleteError, null, 2));
          failedDeletions++;
        } else {
          log(`[DeleteConversation] Successfully deleted message ${message.id}. Deleted data:`, deleteData);
          deletedCount++;
          
          // Verify this specific message was deleted immediately
          const { data: checkMessage, error: checkError } = await supabase
            .from('private_messages')
            .select('id')
            .eq('id', message.id);
          
          if (checkError) {
            log(`[DeleteConversation] Error checking message ${message.id} after deletion:`, checkError);
          } else if (checkMessage && checkMessage.length > 0) {
            error(`[DeleteConversation] ⚠️ Message ${message.id} still exists after deletion!`);
            log(`[DeleteConversation] Still existing message:`, checkMessage[0]);
          } else {
            log(`[DeleteConversation] ✓ Message ${message.id} successfully removed from database`);
          }
        }
      } catch (msgError) {
        error(`[DeleteConversation] Exception deleting message ${message.id}:`, msgError);
        failedDeletions++;
      }
    }

    log(`[DeleteConversation] Deletion complete: ${deletedCount} deleted, ${failedDeletions} failed`);

    if (failedDeletions > 0) {
      error('[DeleteConversation] Some messages failed to delete');
      return false;
    }

    // Wait a moment for database consistency
    log('[DeleteConversation] Waiting 1 second for database consistency...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify deletion by re-fetching messages for this conversation
    log('[DeleteConversation] Verifying deletion...');
    const { data: verifyMessages, error: verifyError } = await supabase
      .from('private_messages')
      .select('*')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (verifyError) {
      error('[DeleteConversation] Error verifying deletion:', verifyError);
      return false;
    }

    // Check if any messages WE SENT for this conversation still exist
    const remainingOurMessages = verifyMessages.filter(message => {
      const partnerId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
      const isOurConversation = partnerId === conversationPartnerId;
      const weSentIt = message.sender_id === user.id;
      return isOurConversation && weSentIt;
    });

    if (remainingOurMessages.length > 0) {
      error(`[DeleteConversation] ❌ Deletion verification failed: ${remainingOurMessages.length} messages we sent still exist`);
      return false;
    }

    log('[DeleteConversation] ✅ Conversation deletion verified successfully - all our sent messages removed');
    log('[DeleteConversation] (Note: Messages they sent to us remain due to security policies - this is expected)');
    return true;
  } catch (error) {
    error('[DeleteConversation] Unexpected error in deleteConversation:', error);
    error('[DeleteConversation] Error stack:', error.stack);
    return false;
  }
};

/**
 * (Dev only) Remove all active Realtime channels. Use when you hit TooManyChannels or want a clean slate.
 * Call from dev menu, console, or a temporary button:
 *   import { cleanAllRealtimeChannels } from './utils/supabase';
 *   cleanAllRealtimeChannels().then(n => console.log('Cleaned', n, 'channels'));
 */
export async function cleanAllRealtimeChannels(): Promise<number> {
  if (!__DEV__) return 0;
  try {
    const channels = supabase.getChannels();
    const count = channels.length;
    if (count > 0) {
      await supabase.removeAllChannels();
      log(`[Supabase] Cleaned ${count} Realtime channel(s)`);
      return count;
    }
    return 0;
  } catch (e) {
    warn('[Supabase] cleanAllRealtimeChannels error:', e);
    return 0;
  }
}

export default supabase;