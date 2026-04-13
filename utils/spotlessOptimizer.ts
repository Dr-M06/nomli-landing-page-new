/**
 * SPOTLESS OPTIMIZATION SYSTEM
 * 
 * This module implements advanced optimizations to make the entire app
 * feel instant and spotless, similar to Spotify/TikTok/Instagram.
 * 
 * Features:
 * - Predictive prefetching based on user behavior
 * - Background preloading of all screens
 * - Aggressive caching with smart invalidation
 * - Component lazy loading
 * - Memory-efficient rendering
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { log, warn, error } from './productionLogger';


// ============================================
// PREDICTIVE PREFETCHING
// ============================================

interface PrefetchStrategy {
  screen: string;
  priority: 'high' | 'medium' | 'low';
  prefetchOn: string[]; // Screens that trigger this prefetch
  dataTypes: string[];
}

const PREFETCH_STRATEGIES: PrefetchStrategy[] = [
  {
    screen: 'chat',
    priority: 'high',
    prefetchOn: ['community', 'chats', 'profile'],
    dataTypes: ['conversations', 'recent_messages'],
  },
  {
    screen: 'live',
    priority: 'high',
    prefetchOn: ['community', 'profile'],
    dataTypes: ['live_streams', 'stream_metadata'],
  },
  {
    screen: 'events',
    priority: 'medium',
    prefetchOn: ['community', 'profile'],
    dataTypes: ['upcoming_events', 'event_details'],
  },
  {
    screen: 'nearby',
    priority: 'medium',
    prefetchOn: ['community'],
    dataTypes: ['nearby_profiles', 'profile_avatars'],
  },
];

/**
 * Predictively prefetch data for likely next screens
 */
export async function predictivePrefetch(currentScreen: string, userId?: string): Promise<void> {
  if (!userId) return;

  try {
    const strategies = PREFETCH_STRATEGIES.filter(s => 
      s.prefetchOn.includes(currentScreen)
    );

    // Execute high-priority prefetches immediately
    const highPriority = strategies.filter(s => s.priority === 'high');
    await Promise.allSettled(
      highPriority.map(strategy => executePrefetch(strategy, userId))
    );

    // Execute medium/low priority in background (non-blocking)
    const lowerPriority = strategies.filter(s => s.priority !== 'high');
    setTimeout(() => {
      Promise.allSettled(
        lowerPriority.map(strategy => executePrefetch(strategy, userId))
      );
    }, 500);
  } catch (error) {
    warn('[SpotlessOptimizer] Predictive prefetch failed:', error);
  }
}

async function executePrefetch(strategy: PrefetchStrategy, userId: string): Promise<void> {
  try {
    log(`[SpotlessOptimizer] Prefetching ${strategy.screen} data...`);

    // Import services dynamically to avoid circular dependencies
    if (strategy.dataTypes.includes('conversations')) {
      const { prefetchChatHistory } = await import('./chatCacheOptimizer');
      await prefetchChatHistory(userId);
    }

    if (strategy.dataTypes.includes('live_streams')) {
      // Prefetch live streams metadata (lazy import to reduce bundle size)
      try {
        const supabaseModule = await import('./supabase');
        const { supabase } = supabaseModule;
        if (supabase) {
          await supabase
            .from('live_streams')
            .select('id, title, streamer_id, is_live, started_at')
            .eq('is_live', true)
            .limit(10)
            .then(() => {
              AsyncStorage.setItem('@prefetched_live_streams', JSON.stringify({ timestamp: Date.now() })).catch(() => {});
            })
            .catch(() => {}); // Silent fail for prefetch
        }
      } catch (error) {
        // Silent fail - prefetch is non-critical
      }
    }

    if (strategy.dataTypes.includes('upcoming_events')) {
      // Prefetch upcoming events (lazy import to reduce bundle size)
      try {
        const supabaseModule = await import('./supabase');
        const { supabase } = supabaseModule;
        if (supabase) {
          await supabase
            .from('events')
            .select('id, title, start_date, location')
            .gte('start_date', new Date().toISOString())
            .order('start_date', { ascending: true })
            .limit(5)
            .then(() => {
              AsyncStorage.setItem('@prefetched_events', JSON.stringify({ timestamp: Date.now() })).catch(() => {});
            })
            .catch(() => {}); // Silent fail for prefetch
        }
      } catch (error) {
        // Silent fail - prefetch is non-critical
      }
    }

    log(`[SpotlessOptimizer] ✅ Prefetched ${strategy.screen} data`);
  } catch (error) {
    warn(`[SpotlessOptimizer] Failed to prefetch ${strategy.screen}:`, error);
  }
}

// ============================================
// BACKGROUND PRELOADING
// ============================================

/**
 * Preload all critical screens in background when app is idle
 */
export async function backgroundPreloadAll(userId?: string): Promise<void> {
  if (!userId) return;

  try {
    log('[SpotlessOptimizer] Starting background preload of all screens...');

    // Preload in parallel (non-blocking)
    await Promise.allSettled([
      preloadChatScreen(userId),
      preloadLiveScreen(),
      preloadEventsScreen(),
      preloadNearbyScreen(userId),
      preloadProfileScreen(userId),
    ]);

    log('[SpotlessOptimizer] ✅ Background preload complete');
  } catch (error) {
    warn('[SpotlessOptimizer] Background preload failed:', error);
  }
}

async function preloadChatScreen(userId: string): Promise<void> {
  try {
    const { prefetchChatHistory } = await import('./chatCacheOptimizer');
    await prefetchChatHistory(userId);
  } catch (error) {
    warn('[SpotlessOptimizer] Chat preload failed:', error);
  }
}

async function preloadLiveScreen(): Promise<void> {
  try {
    // Livestream feature removed; keep as no-op for backward compatibility
  } catch (error) {
    // Silent fail - preload is non-critical
  }
}

async function preloadEventsScreen(): Promise<void> {
  try {
    // Use existing eventUtils instead of direct query (reduces bundle size)
    const { fetchUpcomingEvents } = await import('./eventUtils');
    await fetchUpcomingEvents(5, true).catch(() => {}); // Use cache if available
  } catch (error) {
    // Silent fail - preload is non-critical
  }
}

async function preloadNearbyScreen(userId: string): Promise<void> {
  try {
    const { getCachedNearbyProfiles } = await import('./profileCache');
    await getCachedNearbyProfiles(userId);
  } catch (error) {
    warn('[SpotlessOptimizer] Nearby preload failed:', error);
  }
}

async function preloadProfileScreen(userId: string): Promise<void> {
  try {
    const { getCachedProfile } = await import('./profileCache');
    await getCachedProfile(userId);
  } catch (error) {
    warn('[SpotlessOptimizer] Profile preload failed:', error);
  }
}

// ============================================
// AGORA PRE-CONNECTION
// ============================================

/**
 * Pre-initialize Agora engine in background for instant calls
 */
let agoraPreInitialized = false;

export async function preInitializeAgora(): Promise<void> {
  if (agoraPreInitialized) return;

  try {
    // OPTIMIZED: Lazy import with delay to reduce initial bundle size
    // The AgoraContext will handle actual initialization when needed
    // We just ensure the module is available, but don't block startup
    setTimeout(async () => {
      try {
        await import('../contexts/AgoraContext');
        agoraPreInitialized = true;
        log('[SpotlessOptimizer] ✅ Agora pre-initialized (lazy)');
      } catch (error) {
        warn('[SpotlessOptimizer] Agora pre-initialization failed:', error);
      }
    }, 2000); // Delay 2 seconds to not block app startup
  } catch (error) {
    warn('[SpotlessOptimizer] Agora pre-initialization setup failed:', error);
  }
}

// ============================================
// SMART CACHE WARMING
// ============================================

/**
 * Warm up all caches when app starts
 */
export async function warmupAllCaches(userId?: string): Promise<void> {
  if (!userId) return;

  try {
    log('[SpotlessOptimizer] Warming up all caches...');

    await Promise.allSettled([
      warmupPostCache(),
      warmupStoryCache(),
      warmupProfileCache(userId),
      warmupChatCache(userId),
    ]);

    log('[SpotlessOptimizer] ✅ Cache warmup complete');
  } catch (error) {
    warn('[SpotlessOptimizer] Cache warmup failed:', error);
  }
}

async function warmupPostCache(): Promise<void> {
  try {
    const { getCachedPostsSync } = await import('./communityUtils');
    getCachedPostsSync(20); // Load 20 cached posts
  } catch (error) {
    warn('[SpotlessOptimizer] Post cache warmup failed:', error);
  }
}

async function warmupStoryCache(): Promise<void> {
  try {
    // Stories are cached internally in storyUtils, just trigger a fetch with cache
    const { fetchStories } = await import('./storyUtils');
    await fetchStories(true); // Use cache if available
  } catch (error) {
    warn('[SpotlessOptimizer] Story cache warmup failed:', error);
  }
}

async function warmupProfileCache(userId: string): Promise<void> {
  try {
    const { getCachedProfile } = await import('./profileCache');
    await getCachedProfile(userId);
  } catch (error) {
    warn('[SpotlessOptimizer] Profile cache warmup failed:', error);
  }
}

async function warmupChatCache(userId: string): Promise<void> {
  try {
    const { getCachedConversations } = await import('./conversationCache');
    await getCachedConversations(userId);
  } catch (error) {
    warn('[SpotlessOptimizer] Chat cache warmup failed:', error);
  }
}

// ============================================
// APP STATE OPTIMIZATION
// ============================================

/**
 * Setup background refresh when app goes to background
 */
export function setupBackgroundRefresh(userId?: string): () => void {
  if (!userId) return () => {};

  const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background') {
      // App going to background - refresh data for when user returns
      log('[SpotlessOptimizer] App going to background - refreshing data...');
      backgroundPreloadAll(userId).catch(err => {
        warn('[SpotlessOptimizer] Background refresh failed:', err);
      });
    } else if (nextAppState === 'active') {
      // App coming to foreground - ensure caches are fresh
      log('[SpotlessOptimizer] App coming to foreground - warming caches...');
      warmupAllCaches(userId).catch(err => {
        warn('[SpotlessOptimizer] Foreground cache warmup failed:', err);
      });
    }
  });

  return () => {
    subscription.remove();
  };
}

// ============================================
// MEMORY OPTIMIZATION
// ============================================

/**
 * Clear old cache entries to free memory
 * MEMORY-SAFE: Also clears oversized cache entries to prevent heap overflow
 */
export async function optimizeMemory(): Promise<void> {
  try {
    log('[SpotlessOptimizer] Optimizing memory...');

    // Clear old cache entries (older than 3 days - more aggressive)
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    
    // Get all AsyncStorage keys
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(key => 
      key.startsWith('@nomli_cache_') || 
      key.startsWith('@nomli_post_') ||
      key.startsWith('@nomli_story_') ||
      key.startsWith('community_posts_cache_') ||
      key.startsWith('prefetch_') ||
      key.includes('cache')
    );

    let removedCount = 0;
    const MAX_CACHE_SIZE_KB = 2000; // 2MB limit per cache entry

    // Check timestamps and size, remove old or oversized entries
    for (const key of cacheKeys) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          // Check size first (faster than parsing)
          const cacheSizeKB = (value.length * 2) / 1024; // UTF-16 encoding
          
          // Remove oversized entries immediately
          if (cacheSizeKB > MAX_CACHE_SIZE_KB) {
            await AsyncStorage.removeItem(key);
            removedCount++;
            log(`[SpotlessOptimizer] Removed oversized cache (${cacheSizeKB.toFixed(2)}KB): ${key}`);
            continue;
          }
          
          // Check timestamp for old entries
          try {
            const data = JSON.parse(value);
            if (data.timestamp && data.timestamp < threeDaysAgo) {
              await AsyncStorage.removeItem(key);
              removedCount++;
              log(`[SpotlessOptimizer] Removed old cache: ${key}`);
            }
          } catch (parseError) {
            // If parsing fails, it might be corrupted - remove it
            await AsyncStorage.removeItem(key);
            removedCount++;
            log(`[SpotlessOptimizer] Removed corrupted cache: ${key}`);
          }
        }
      } catch (error) {
        // Skip invalid entries
        try {
          await AsyncStorage.removeItem(key);
          removedCount++;
        } catch (removeError) {
          // Ignore removal errors
        }
      }
    }

    log(`[SpotlessOptimizer] ✅ Memory optimization complete (removed ${removedCount} cache entries)`);
  } catch (error) {
    warn('[SpotlessOptimizer] Memory optimization failed:', error);
  }
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize all spotless optimizations
 */
export async function initializeSpotlessOptimizer(userId?: string): Promise<void> {
  if (!userId) {
    log('[SpotlessOptimizer] No user ID - skipping initialization');
    return;
  }

  try {
    log('[SpotlessOptimizer] 🚀 Initializing spotless optimization system (lightweight)...');

    // 1. Setup background refresh immediately (lightweight, no heavy imports)
    setupBackgroundRefresh(userId);

    // 2. Defer all heavy operations to not block app startup or increase bundle size
    setTimeout(() => {
      // Warm up all caches (deferred)
      warmupAllCaches(userId).catch(() => {});
      
      // Pre-initialize Agora for instant calls (deferred)
      preInitializeAgora().catch(() => {});
      
      // Optimize memory (deferred)
      optimizeMemory().catch(() => {});
      
      // Background preload all screens (deferred)
      backgroundPreloadAll(userId).catch(() => {});
    }, 3000); // Wait 3 seconds after app start to not block startup

    log('[SpotlessOptimizer] ✅ Spotless optimization system initialized (staggered)');
  } catch (error) {
    error('[SpotlessOptimizer] Initialization failed:', error);
  }
}

