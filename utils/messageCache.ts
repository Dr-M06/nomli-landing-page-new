/**
 * Message Cache Utility
 * Implements WhatsApp-style caching with real-time sync
 * - Instant load from cache
 * - Real-time updates still work
 * - Smart cache invalidation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message } from './chat';
import { log, warn, error } from './productionLogger';


const CACHE_PREFIX = 'chat_messages_';
const CACHE_TIMESTAMP_PREFIX = 'chat_timestamp_';
// AFRICA-OPTIMIZED: Extended cache to 48 hours for instant chat loading
// Longer cache = less data usage = faster app = better for Africa
const CACHE_EXPIRY = 48 * 60 * 60 * 1000; // 48 hours (Africa-optimized)

interface CachedData {
  messages: Message[];
  timestamp: number;
}

/**
 * Get cached messages for a conversation
 */
export async function getCachedMessages(conversationId: string): Promise<Message[] | null> {
  try {
    const cacheKey = CACHE_PREFIX + conversationId;
    const cached = await AsyncStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }

    const data: CachedData = JSON.parse(cached);
    
    // Check if cache is expired
    const now = Date.now();
    if (now - data.timestamp > CACHE_EXPIRY) {
      log('[MessageCache] Cache expired for', conversationId);
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    log('[MessageCache] Loaded', data.messages.length, 'cached messages for', conversationId);
    return data.messages;
  } catch (error) {
    error('[MessageCache] Error reading cache:', error);
    return null;
  }
}

/**
 * Save messages to cache
 */
export async function cacheMessages(conversationId: string, messages: Message[]): Promise<void> {
  try {
    const cacheKey = CACHE_PREFIX + conversationId;
    const data: CachedData = {
      messages,
      timestamp: Date.now(),
    };
    
    await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    log('[MessageCache] Cached', messages.length, 'messages for', conversationId);
  } catch (error) {
    error('[MessageCache] Error writing cache:', error);
  }
}

/**
 * Update cache with new message (append)
 */
export async function addMessageToCache(conversationId: string, message: Message): Promise<void> {
  try {
    const cached = await getCachedMessages(conversationId);
    if (!cached) {
      // If no cache, just cache this single message
      await cacheMessages(conversationId, [message]);
      return;
    }

    // Check if message already exists (avoid duplicates)
    const exists = cached.some(m => m.id === message.id);
    if (exists) {
      return;
    }

    // Add new message at the beginning (messages are in reverse chronological order)
    const updated = [message, ...cached];
    
    // Keep only last 200 messages in cache to avoid bloat
    const trimmed = updated.slice(0, 200);
    
    await cacheMessages(conversationId, trimmed);
  } catch (error) {
    error('[MessageCache] Error adding message to cache:', error);
  }
}

/**
 * Update a specific message in cache (for status updates, edits, etc.)
 */
export async function updateMessageInCache(
  conversationId: string, 
  messageId: string, 
  updates: Partial<Message>
): Promise<void> {
  try {
    const cached = await getCachedMessages(conversationId);
    if (!cached) {
      return;
    }

    const updated = cached.map(msg => 
      msg.id === messageId ? { ...msg, ...updates } : msg
    );

    await cacheMessages(conversationId, updated);
  } catch (error) {
    error('[MessageCache] Error updating message in cache:', error);
  }
}

/**
 * Remove a message from cache (for deletions)
 */
export async function removeMessageFromCache(conversationId: string, messageId: string): Promise<void> {
  try {
    const cached = await getCachedMessages(conversationId);
    if (!cached) {
      return;
    }

    const filtered = cached.filter(msg => msg.id !== messageId);
    await cacheMessages(conversationId, filtered);
  } catch (error) {
    error('[MessageCache] Error removing message from cache:', error);
  }
}

/**
 * Clear cache for a specific conversation
 */
export async function clearConversationCache(conversationId: string): Promise<void> {
  try {
    const cacheKey = CACHE_PREFIX + conversationId;
    await AsyncStorage.removeItem(cacheKey);
    log('[MessageCache] Cleared cache for', conversationId);
  } catch (error) {
    error('[MessageCache] Error clearing cache:', error);
  }
}

/**
 * Clear all message caches (for logout, etc.)
 */
export async function clearAllMessageCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
    await AsyncStorage.multiRemove(cacheKeys);
    log('[MessageCache] Cleared all message caches');
  } catch (error) {
    error('[MessageCache] Error clearing all caches:', error);
  }
}

/**
 * Get cache timestamp (to check freshness)
 */
export async function getCacheTimestamp(conversationId: string): Promise<number | null> {
  try {
    const cached = await getCachedMessages(conversationId);
    if (!cached) {
      return null;
    }
    
    const cacheKey = CACHE_PREFIX + conversationId;
    const data = await AsyncStorage.getItem(cacheKey);
    if (data) {
      const parsed: CachedData = JSON.parse(data);
      return parsed.timestamp;
    }
    return null;
  } catch (error) {
    error('[MessageCache] Error getting cache timestamp:', error);
    return null;
  }
}

