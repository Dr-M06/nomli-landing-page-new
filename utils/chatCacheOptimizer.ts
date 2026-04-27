/**
 * Chat Cache Optimizer
 * 
 * Aggressive caching and preloading for chat history and conversations
 * Optimized for Africa/Nigeria - instant loading, less data usage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedMessages, cacheMessages } from './messageCache';
import { getCachedConversations, cacheConversations } from './conversationCache';
import { getMessages } from './chat';
import { fetchPrivateConversations, PrivateConversation } from './supabase';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


const CHAT_PREFETCH_KEY = '@nomli_chat_prefetch';
const RECENT_CONVERSATIONS_KEY = '@nomli_recent_conversations';
const PREFETCH_EXPIRY = 48 * 60 * 60 * 1000; // 48 hours

interface PrefetchData {
  conversations: PrivateConversation[];
  recentMessages: { [conversationId: string]: any[] };
  timestamp: number;
}

/**
 * Prefetch recent conversations and their latest messages
 * This makes chat load instantly
 */
export async function prefetchChatHistory(userId: string): Promise<void> {
  try {
    log('[ChatCache] 🚀 Prefetching chat history for user:', userId.substring(0, 8));
    
    // Check if we have fresh prefetch data
    const cachedPrefetch = await AsyncStorage.getItem(CHAT_PREFETCH_KEY);
    if (cachedPrefetch) {
      const prefetch: PrefetchData = JSON.parse(cachedPrefetch);
      const age = Date.now() - prefetch.timestamp;
      
      if (age < PREFETCH_EXPIRY) {
        log('[ChatCache] ✅ Using cached prefetch data (', Math.round(age / 1000), 's old)');
        return;
      }
    }

    // Fetch conversations
    const conversations = await fetchPrivateConversations();
    log('[ChatCache] Fetched', conversations.length, 'conversations');

    // Prefetch latest messages for top 5 conversations (most recent)
    const topConversations = conversations.slice(0, 5);
    const recentMessages: { [conversationId: string]: any[] } = {};

    await Promise.allSettled(
      topConversations.map(async (conv) => {
        try {
          const messages = await getMessages(userId, conv.conversation_with);
          // Cache only last 20 messages per conversation
          recentMessages[conv.conversation_with] = messages.slice(-20);
          
          // Also cache to message cache
          await cacheMessages(conv.conversation_with, messages);
        } catch (error) {
          warn('[ChatCache] Failed to prefetch messages for', conv.conversation_with, error);
        }
      })
    );

    // Save prefetch data
    const prefetchData: PrefetchData = {
      conversations,
      recentMessages,
      timestamp: Date.now(),
    };

    await AsyncStorage.setItem(CHAT_PREFETCH_KEY, JSON.stringify(prefetchData));
    await cacheConversations(conversations);
    
    log('[ChatCache] ✅ Prefetched chat history:', {
      conversations: conversations.length,
      recentMessages: Object.keys(recentMessages).length,
    });
  } catch (error) {
    error('[ChatCache] Error prefetching chat history:', error);
  }
}

/**
 * Get cached messages for a conversation (instant load)
 */
export async function getCachedChatMessages(conversationId: string): Promise<any[] | null> {
  try {
    // First try message cache
    const cached = await getCachedMessages(conversationId);
    if (cached && cached.length > 0) {
      log('[ChatCache] ✅ Loaded', cached.length, 'cached messages for', conversationId.substring(0, 8));
      return cached;
    }

    // Fallback to prefetch cache
    const prefetchData = await AsyncStorage.getItem(CHAT_PREFETCH_KEY);
    if (prefetchData) {
      const prefetch: PrefetchData = JSON.parse(prefetchData);
      if (prefetch.recentMessages[conversationId]) {
        log('[ChatCache] ✅ Loaded', prefetch.recentMessages[conversationId].length, 'messages from prefetch cache');
        return prefetch.recentMessages[conversationId];
      }
    }

    return null;
  } catch (error) {
    error('[ChatCache] Error getting cached messages:', error);
    return null;
  }
}

/**
 * Preload messages for a conversation in background
 */
export async function preloadConversationMessages(
  userId: string,
  conversationId: string
): Promise<void> {
  try {
    // Check if already cached
    const cached = await getCachedMessages(conversationId);
    if (cached && cached.length > 0) {
      const cacheAge = Date.now() - (await getCacheTimestamp(conversationId) || 0);
      // If cache is less than 1 hour old, skip prefetch
      if (cacheAge < 60 * 60 * 1000) {
        return;
      }
    }

    // Fetch and cache messages
    const messages = await getMessages(userId, conversationId);
    await cacheMessages(conversationId, messages);
    log('[ChatCache] ✅ Preloaded', messages.length, 'messages for', conversationId.substring(0, 8));
  } catch (error) {
    error('[ChatCache] Error preloading messages:', error);
  }
}

/**
 * Get cache timestamp helper
 */
async function getCacheTimestamp(conversationId: string): Promise<number | null> {
  try {
    const { getCacheTimestamp } = await import('./messageCache');
    return await getCacheTimestamp(conversationId);
  } catch {
    return null;
  }
}

/**
 * Preload conversations list (instant load)
 */
export async function preloadConversationsList(): Promise<PrivateConversation[] | null> {
  try {
    // Try cache first
    const cached = await getCachedConversations();
    if (cached && cached.length > 0) {
      log('[ChatCache] ✅ Loaded', cached.length, 'cached conversations');
      return cached;
    }

    // Try prefetch cache
    const prefetchData = await AsyncStorage.getItem(CHAT_PREFETCH_KEY);
    if (prefetchData) {
      const prefetch: PrefetchData = JSON.parse(prefetchData);
      if (prefetch.conversations && prefetch.conversations.length > 0) {
        log('[ChatCache] ✅ Loaded', prefetch.conversations.length, 'conversations from prefetch');
        return prefetch.conversations;
      }
    }

    return null;
  } catch (error) {
    error('[ChatCache] Error preloading conversations:', error);
    return null;
  }
}

/**
 * Background refresh of chat history
 * Called when app goes to background
 */
export async function backgroundRefreshChatHistory(userId: string): Promise<void> {
  try {
    log('[ChatCache] 🔄 Background refreshing chat history...');
    
    // Refresh conversations
    const conversations = await fetchPrivateConversations();
    await cacheConversations(conversations);
    
    // Refresh messages for top 3 conversations
    const topConversations = conversations.slice(0, 3);
    await Promise.allSettled(
      topConversations.map(conv => 
        preloadConversationMessages(userId, conv.conversation_with)
      )
    );
    
    log('[ChatCache] ✅ Background refresh completed');
  } catch (error) {
    error('[ChatCache] Error in background refresh:', error);
  }
}

/**
 * Clear all chat cache
 */
export async function clearChatCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      CHAT_PREFETCH_KEY,
      RECENT_CONVERSATIONS_KEY,
    ]);
    log('[ChatCache] ✅ Cleared all chat cache');
  } catch (error) {
    error('[ChatCache] Error clearing cache:', error);
  }
}

