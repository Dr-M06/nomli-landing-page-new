/**
 * Comprehensive cache clearing utility
 * Clears all user caches including messages, images, posts, profiles, etc.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Image } from 'expo-image';
import { 
  clearAllMessageCaches,
  clearConversationCache 
} from './messageCache';
import { 
  clearAllProfileCaches 
} from './profileCache';
import { 
  clearPostsCache 
} from './communityUtils';
import { 
  clearEventCache 
} from './eventUtils';
import { 
  clearPrefetchCache 
} from './prefetchService';
import { 
  clearAggressiveCache 
} from './aggressiveCacheService';
import { 
  clearChatCache 
} from './chatCacheOptimizer';
import { 
  clearConversationCache as clearConvCache 
} from './conversationCache';
import { 
  clearImageCache 
} from './imageCacheConfig';
import { log, warn, error } from './productionLogger';
import { 
  clearWalletCache 
} from './walletService';

/**
 * Clear all user caches
 * This will clear:
 * - Message caches
 * - Profile caches
 * - Post/comment caches
 * - Event caches
 * - Image caches
 * - Prefetch caches
 * - Chat caches
 * - Wallet caches
 * - Aggressive caches
 * - File system caches
 */
export const clearAllUserCache = async (userId?: string): Promise<{
  success: boolean;
  cleared: string[];
  errors: string[];
}> => {
  const cleared: string[] = [];
  const errors: string[] = [];

  try {
    log('[ClearCache] 🗑️ Starting comprehensive cache clear...');

    // 1. Clear message caches
    try {
      await clearAllMessageCaches();
      cleared.push('Messages');
      log('[ClearCache] ✅ Cleared message caches');
    } catch (error) {
      errors.push('Messages');
      error('[ClearCache] ❌ Error clearing messages:', error);
    }

    // 2. Clear conversation caches
    try {
      await clearConversationCache();
      await clearConvCache();
      cleared.push('Conversations');
      log('[ClearCache] ✅ Cleared conversation caches');
    } catch (error) {
      errors.push('Conversations');
      error('[ClearCache] ❌ Error clearing conversations:', error);
    }

    // 3. Clear profile caches
    try {
      await clearAllProfileCaches();
      cleared.push('Profiles');
      log('[ClearCache] ✅ Cleared profile caches');
    } catch (error) {
      errors.push('Profiles');
      error('[ClearCache] ❌ Error clearing profiles:', error);
    }

    // 4. Clear post/comment caches
    try {
      clearPostsCache();
      cleared.push('Posts & Comments');
      log('[ClearCache] ✅ Cleared post/comment caches');
    } catch (error) {
      errors.push('Posts & Comments');
      error('[ClearCache] ❌ Error clearing posts:', error);
    }

    // 5. Clear event caches
    try {
      await clearEventCache();
      cleared.push('Events');
      log('[ClearCache] ✅ Cleared event caches');
    } catch (error) {
      errors.push('Events');
      error('[ClearCache] ❌ Error clearing events:', error);
    }

    // 6. Clear image caches
    try {
      await clearImageCache();
      cleared.push('Images');
      log('[ClearCache] ✅ Cleared image caches');
    } catch (error) {
      errors.push('Images');
      error('[ClearCache] ❌ Error clearing images:', error);
    }

    // 7. Clear prefetch caches
    try {
      await clearPrefetchCache();
      cleared.push('Prefetch Data');
      log('[ClearCache] ✅ Cleared prefetch caches');
    } catch (error) {
      errors.push('Prefetch Data');
      error('[ClearCache] ❌ Error clearing prefetch:', error);
    }

    // 8. Clear chat caches
    try {
      await clearChatCache();
      cleared.push('Chat History');
      log('[ClearCache] ✅ Cleared chat caches');
    } catch (error) {
      errors.push('Chat History');
      error('[ClearCache] ❌ Error clearing chat:', error);
    }

    // 9. Clear wallet caches (if userId provided)
    if (userId) {
      try {
        await clearWalletCache(userId);
        cleared.push('Wallet');
        log('[ClearCache] ✅ Cleared wallet caches');
      } catch (error) {
        errors.push('Wallet');
        error('[ClearCache] ❌ Error clearing wallet:', error);
      }
    }

    // 10. Clear aggressive caches
    try {
      await clearAggressiveCache();
      cleared.push('Aggressive Cache');
      log('[ClearCache] ✅ Cleared aggressive caches');
    } catch (error) {
      errors.push('Aggressive Cache');
      error('[ClearCache] ❌ Error clearing aggressive cache:', error);
    }

    // 11. Clear file system caches (video, media, etc.)
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        // Clear video cache
        const videoCacheDir = `${cacheDir}videos/`;
        await FileSystem.deleteAsync(videoCacheDir, { idempotent: true });
        
        // Clear media cache
        const mediaCacheDir = `${cacheDir}media/`;
        await FileSystem.deleteAsync(mediaCacheDir, { idempotent: true });
        
        cleared.push('File System');
        log('[ClearCache] ✅ Cleared file system caches');
      }
    } catch (error) {
      errors.push('File System');
      error('[ClearCache] ❌ Error clearing file system:', error);
    }

    // 12. Clear any remaining AsyncStorage cache keys (safety net)
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(key => 
        key.includes('cache') || 
        key.includes('Cache') ||
        key.includes('CACHE') ||
        key.startsWith('prefetch_') ||
        key.startsWith('cache_') ||
        key.startsWith('CACHE_')
      );
      
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
        cleared.push('Additional Cache Keys');
        log(`[ClearCache] ✅ Cleared ${cacheKeys.length} additional cache keys`);
      }
    } catch (error) {
      errors.push('Additional Cache Keys');
      error('[ClearCache] ❌ Error clearing additional cache keys:', error);
    }

    // 13. Clear trusted device tokens (will require TOTP on next login)
    if (userId) {
      try {
        const SecureStore = await import('expo-secure-store');
        const trustedDeviceKey = `totp_trusted_${userId}`;
        await SecureStore.default.deleteItemAsync(trustedDeviceKey);
        cleared.push('Trusted Device Token');
        log('[ClearCache] ✅ Cleared trusted device token - TOTP will be required on next login');
      } catch (error) {
        errors.push('Trusted Device Token');
        warn('[ClearCache] ⚠️ Error clearing trusted device token:', error);
      }
    }

    log(`[ClearCache] ✅ Cache clear completed. Cleared: ${cleared.length}, Errors: ${errors.length}`);

    return {
      success: errors.length === 0,
      cleared,
      errors
    };
  } catch (error) {
    error('[ClearCache] ❌ Fatal error during cache clear:', error);
    return {
      success: false,
      cleared,
      errors: [...errors, 'Fatal Error']
    };
  }
};
