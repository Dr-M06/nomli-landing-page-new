/**
 * Conversation Cache Utility
 * Caches conversation list for instant loading
 * - Instant load from cache
 * - Real-time updates still work
 * - Smart cache invalidation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrivateConversation } from './supabase';
import { log, warn, error } from './productionLogger';


const CACHE_KEY = 'conversations_list';
const CACHE_TIMESTAMP_KEY = 'conversations_timestamp';
// AFRICA-OPTIMIZED: Extended cache to 48 hours for instant conversation loading
// Longer cache = less data usage = faster app = better for Africa
const CACHE_EXPIRY = 48 * 60 * 60 * 1000; // 48 hours (Africa-optimized)

interface CachedData {
  conversations: PrivateConversation[];
  timestamp: number;
}

/**
 * Get cached conversations
 */
export async function getCachedConversations(): Promise<PrivateConversation[] | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    
    if (!cached) {
      return null;
    }

    const data: CachedData = JSON.parse(cached);
    
    // Check if cache is expired
    const now = Date.now();
    if (now - data.timestamp > CACHE_EXPIRY) {
      log('[ConversationCache] Cache expired');
      await AsyncStorage.removeItem(CACHE_KEY);
      return null;
    }

    log('[ConversationCache] 🚀 Loaded', data.conversations.length, 'cached conversations');
    return data.conversations;
  } catch (error) {
    error('[ConversationCache] Error reading cache:', error);
    return null;
  }
}

/**
 * Save conversations to cache
 */
export async function cacheConversations(conversations: PrivateConversation[]): Promise<void> {
  try {
    const data: CachedData = {
      conversations,
      timestamp: Date.now(),
    };
    
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    log('[ConversationCache] 💾 Cached', conversations.length, 'conversations');
  } catch (error) {
    error('[ConversationCache] Error writing cache:', error);
  }
}

/**
 * Update a specific conversation in cache
 */
export async function updateConversationInCache(
  conversationId: string,
  updates: Partial<PrivateConversation>
): Promise<void> {
  try {
    const cached = await getCachedConversations();
    if (!cached) {
      return;
    }

    const updated = cached.map(conv =>
      conv.conversation_with === conversationId
        ? { ...conv, ...updates }
        : conv
    );

    await cacheConversations(updated);
  } catch (error) {
    error('[ConversationCache] Error updating conversation in cache:', error);
  }
}

/**
 * Add or update a conversation in cache
 */
export async function upsertConversationInCache(conversation: PrivateConversation): Promise<void> {
  try {
    const cached = await getCachedConversations();
    
    if (!cached) {
      // No cache exists, create new one with this conversation
      await cacheConversations([conversation]);
      return;
    }

    // Check if conversation exists
    const existingIndex = cached.findIndex(
      c => c.conversation_with === conversation.conversation_with
    );

    if (existingIndex >= 0) {
      // Update existing conversation
      cached[existingIndex] = conversation;
    } else {
      // Add new conversation at the top
      cached.unshift(conversation);
    }

    // Sort by last message time
    const sorted = cached.sort((a, b) => 
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );

    await cacheConversations(sorted);
  } catch (error) {
    error('[ConversationCache] Error upserting conversation in cache:', error);
  }
}

/**
 * Remove a conversation from cache
 */
export async function removeConversationFromCache(conversationId: string): Promise<void> {
  try {
    const cached = await getCachedConversations();
    if (!cached) {
      return;
    }

    const filtered = cached.filter(conv => conv.conversation_with !== conversationId);
    await cacheConversations(filtered);
    log('[ConversationCache] Removed conversation from cache:', conversationId);
  } catch (error) {
    error('[ConversationCache] Error removing conversation from cache:', error);
  }
}

/**
 * Update unread count for a conversation
 */
export async function updateUnreadCountInCache(
  conversationId: string,
  unreadCount: number
): Promise<void> {
  try {
    await updateConversationInCache(conversationId, { unread_count: unreadCount });
  } catch (error) {
    error('[ConversationCache] Error updating unread count in cache:', error);
  }
}

/**
 * Clear all conversation cache
 */
export async function clearConversationCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([CACHE_KEY, CACHE_TIMESTAMP_KEY]);
    log('[ConversationCache] Cleared conversation cache');
  } catch (error) {
    error('[ConversationCache] Error clearing cache:', error);
  }
}

/**
 * Get cache timestamp
 */
export async function getConversationCacheTimestamp(): Promise<number | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) {
      return null;
    }
    
    const data: CachedData = JSON.parse(cached);
    return data.timestamp;
  } catch (error) {
    error('[ConversationCache] Error getting cache timestamp:', error);
    return null;
  }
}
