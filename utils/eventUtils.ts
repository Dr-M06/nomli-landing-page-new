import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OFFICIAL_ACCOUNT_EMAIL, OFFICIAL_ACCOUNT_ID, OFFICIAL_ACCOUNT_HANDLE } from '../constants/ContactEmails';
import { log, warn, error } from './productionLogger';


export interface Event {
  id: string;
  title: string;
  description: string;
  date: string | null;
  time: string | null;
  location: string | null;
  category: string;
  max_attendees?: number;
  host_id: string;
  image_url?: string;
  created_at: string;
  host_name?: string;
  host_avatar?: string;
  host_is_verified?: boolean; // Whether the host is verified
  host_is_admin?: boolean; // Whether the host is an admin
  attendee_count?: number;
  latitude?: number;
  longitude?: number;
  distance?: number; // in kilometers
  post_type?: 'event' | 'ad'; // Type of post: event or ad
}

export interface EventFilters {
  category?: string;
  date?: string;
  location?: string;
  limit?: number;
  offset?: number;
}

// Caching for events
const eventsCache = new Map();
const EVENTS_CACHE_DURATION = 60000; // 1 minute for in-memory cache

// Persistent cache keys
const EVENTS_CACHE_KEY_PREFIX = 'events_cache_';
const EVENTS_TIMESTAMP_KEY_PREFIX = 'events_timestamp_';
const EVENTS_PERSISTENT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for persistent cache

/**
 * Generate cache key from filters
 */
const getCacheKey = (filters: EventFilters): string => {
  const parts = [
    filters.category || 'all',
    filters.date || 'all',
    filters.location || 'all',
    filters.limit || 'all',
    filters.offset || 0,
  ];
  return parts.join('_');
};

/**
 * Load events from persistent cache (AsyncStorage)
 */
const loadCachedEvents = async (cacheKey: string): Promise<Event[] | null> => {
  try {
    const cachedData = await AsyncStorage.getItem(EVENTS_CACHE_KEY_PREFIX + cacheKey);
    const timestampStr = await AsyncStorage.getItem(EVENTS_TIMESTAMP_KEY_PREFIX + cacheKey);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      // Check if cache is still valid (within 24 hours)
      if (now - timestamp < EVENTS_PERSISTENT_CACHE_DURATION) {
        log(`[EventUtils] Loading events from persistent cache (age: ${Math.round((now - timestamp) / 1000 / 60)} minutes)`);
        return JSON.parse(cachedData);
      } else {
        // Silently clear expired cache - no logging to reduce noise
        await AsyncStorage.multiRemove([EVENTS_CACHE_KEY_PREFIX + cacheKey, EVENTS_TIMESTAMP_KEY_PREFIX + cacheKey]);
      }
    }
  } catch (error) {
    error('[EventUtils] Error loading cached events:', error);
  }
  return null;
};

/**
 * Save events to persistent cache (AsyncStorage)
 */
const saveCachedEvents = async (cacheKey: string, events: Event[]): Promise<void> => {
  try {
    const now = Date.now();
    await AsyncStorage.multiSet([
      [EVENTS_CACHE_KEY_PREFIX + cacheKey, JSON.stringify(events)],
      [EVENTS_TIMESTAMP_KEY_PREFIX + cacheKey, now.toString()]
    ]);
    log(`[EventUtils] Saved ${events.length} events to persistent cache`);
  } catch (error) {
    error('[EventUtils] Error saving cached events:', error);
  }
};

/**
 * Get cached events immediately (for instant UI display)
 * Returns null if no cache available
 */
export const getCachedEvents = async (filters: EventFilters = {}): Promise<Event[] | null> => {
  const cacheKey = getCacheKey(filters);
  
  // Check in-memory cache first
  const now = Date.now();
  const inMemoryCache = eventsCache.get(cacheKey);
  if (inMemoryCache && (now - inMemoryCache.timestamp < EVENTS_CACHE_DURATION)) {
    return inMemoryCache.events;
  }
  
  // Check persistent cache
  return await loadCachedEvents(cacheKey);
};

/**
 * Fetch events with optional filters
 * Uses persistent cache for offline support and faster loading
 */
export const fetchEvents = async (filters: EventFilters = {}, useCache = true): Promise<Event[]> => {
  const cacheKey = getCacheKey(filters);
  
  try {
    // 1. Check in-memory cache first (fastest, but only lasts 1 minute)
    const now = Date.now();
    const inMemoryCache = eventsCache.get(cacheKey);
    if (inMemoryCache && (now - inMemoryCache.timestamp < EVENTS_CACHE_DURATION)) {
      log(`[EventUtils] Using in-memory cached events`);
      return inMemoryCache.events;
    }
    
    // 2. Load persistent cache as fallback (we'll use it if fetch fails)
    let persistentCache: Event[] | null = null;
    if (useCache) {
      persistentCache = await loadCachedEvents(cacheKey);
      if (persistentCache && persistentCache.length > 0) {
        log(`[EventUtils] Found persistent cached events (${persistentCache.length} events) - will use if fetch fails`);
        // Also update in-memory cache
        eventsCache.set(cacheKey, {
          events: persistentCache,
          timestamp: now
        });
      }
    }
    
    log(`[EventUtils] Fetching fresh events${filters.date ? ` from ${filters.date}` : ''}${filters.limit ? ` (limit: ${filters.limit})` : ''} - including both events and ads`);
    
    // 3. Try to fetch fresh events from Supabase (preferred over cache)
    let query = supabase
      .from('events')
      .select(`
        *,
        profiles!events_host_id_fkey (
          id,
          full_name,
          username,
          avatar_url,
          is_verified,
          email,
          is_admin
        ),
        event_attendees (
          id
        )
      `);

    // Filter out deleted events from public listings (but allow them in user's own profile)
    // Only filter by deleted_at if not fetching user's own events
    if (!filters.userId) {
      query = query.is('deleted_at', null);
    }

    // Explicitly include both events and ads (post_type can be 'event', 'ad', or null/undefined)
    // Don't filter by post_type - we want both events and ads

    // Apply filters
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    
    // For date filter:
    // - Events: show if date >= filter_date OR date is null (events without dates)
    // - Ads: use date as END date
    //   - Ads with no date (null): ALWAYS show (no expiration)
    //   - Ads with date >= today: show (not expired)
    //   - Ads with date < today: hide (expired)
    // This ensures:
    //   1. Events with dates >= filter_date are shown
    //   2. Events without dates (null) are shown
    //   3. Ads with no end date (null) are ALWAYS shown (regardless of date filter)
    //   4. Ads with end date >= today are shown (not expired)
    //   5. Ads with end date < today are hidden (expired)
    if (filters.date) {
      // Include items where:
      // - date >= filter_date (events/ads with dates in the future)
      // - date is null (events/ads without dates - this includes ads with no expiration)
      // Note: Ads without dates will always pass this filter, which is correct
      // The date.is.null condition ensures ads without expiration dates are always included
      query = query.or(`date.gte.${filters.date},date.is.null`);
    }
    
    // Order by date for events, then by created_at for ads
    query = query.order('date', { ascending: true, nullsFirst: false });
    query = query.order('time', { ascending: true, nullsFirst: false });
    query = query.order('created_at', { ascending: false }); // Newer ads/events first
    
    if (filters.location) {
      query = query.ilike('location', `%${filters.location}%`);
    }
    
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    let data, error;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Events query timeout')), 15000);
      });
      
      const result = await Promise.race([query, timeoutPromise]) as any;
      data = result.data;
      error = result.error;
    } catch (timeoutError) {
      warn('[EventUtils] Events query timed out or network error');
      // Return cached data if available (offline scenario)
      if (persistentCache && persistentCache.length > 0) {
        log('[EventUtils] Returning persistent cached events due to timeout/network error');
        return persistentCache;
      }
      // Fall back to in-memory cache
      const inMemoryCache = eventsCache.get(cacheKey);
      if (inMemoryCache) {
        log('[EventUtils] Returning in-memory cached events due to timeout');
        return inMemoryCache.events;
      }
      return [];
    }

    if (error) {
      error('[EventUtils] Error fetching events:', error);
      // Return cached data if available (offline scenario)
      if (persistentCache && persistentCache.length > 0) {
        log('[EventUtils] Returning persistent cached events due to fetch error');
        return persistentCache;
      }
      // Fall back to in-memory cache
      const inMemoryCache = eventsCache.get(cacheKey);
      if (inMemoryCache) {
        log('[EventUtils] Returning in-memory cached events due to fetch error');
        return inMemoryCache.events;
      }
      return [];
    }

    // Transform the data to include host info and attendee count
    const events: Event[] = data?.map(event => {
      const profile = event.profiles;
      const isOfficialAccount = 
        event.host_id === OFFICIAL_ACCOUNT_ID ||
        profile?.id === OFFICIAL_ACCOUNT_ID ||
        profile?.username === OFFICIAL_ACCOUNT_HANDLE.replace('@', '') ||
        profile?.email?.toLowerCase() === OFFICIAL_ACCOUNT_EMAIL.toLowerCase();
      
      return {
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date,
        time: event.time,
        location: event.location,
        category: event.category,
        max_attendees: event.max_attendees,
        host_id: event.host_id,
        image_url: event.image_url,
        created_at: event.created_at,
        post_type: event.post_type, // Include post_type in the transformed event
        host_name: profile?.full_name,
        host_avatar: profile?.avatar_url,
        host_is_verified: profile?.is_verified === true || isOfficialAccount,
        host_is_admin: profile?.is_admin === true || isOfficialAccount, // Official account is treated as admin
        attendee_count: event.event_attendees?.length || 0,
      };
    }) || [];
    
    log(`[EventUtils] Fetched ${events.length} total events/ads. Breakdown:`, {
      total: events.length,
      with_images: events.filter(e => e.image_url && e.image_url.trim().length > 0).length,
      from_admin: events.filter(e => e.host_is_admin === true).length,
      from_official: events.filter(e => e.host_id === OFFICIAL_ACCOUNT_ID).length,
      post_type_ad: events.filter(e => e.post_type === 'ad').length,
      post_type_event: events.filter(e => e.post_type === 'event').length,
      post_type_null: events.filter(e => !e.post_type).length,
      ads_without_date: events.filter(e => e.post_type === 'ad' && !e.date).length,
      ads_with_date: events.filter(e => e.post_type === 'ad' && e.date).length,
    });

    // Cache the results (both in-memory and persistent)
    eventsCache.set(cacheKey, {
      events: events,
      timestamp: now
    });
    
    // Save to persistent cache (AsyncStorage) for offline support
    await saveCachedEvents(cacheKey, events);

    return events;
  } catch (error) {
    error('Error in fetchEvents:', error);
    // Return cached data if available
    const persistentCache = await loadCachedEvents(cacheKey);
    if (persistentCache && persistentCache.length > 0) {
      return persistentCache;
    }
    return [];
  }
};

/**
 * Fetch upcoming events (today and future)
 * Uses caching for offline support and faster loading
 */
export const fetchUpcomingEvents = async (limit: number = 5, useCache = true): Promise<Event[]> => {
  const today = new Date().toISOString().split('T')[0];
  return fetchEvents({ date: today, limit }, useCache);
};

/**
 * Cache events directly (for use after fetching)
 */
export const cacheEvents = async (events: Event[], filters: EventFilters = {}): Promise<void> => {
  const cacheKey = getCacheKey(filters);
  const now = Date.now();
  
  // Update in-memory cache
  eventsCache.set(cacheKey, {
    events: events,
    timestamp: now
  });
  
  // Save to persistent cache
  await saveCachedEvents(cacheKey, events);
};

/**
 * Clear all event caches (in-memory and persistent)
 * Useful when you want to force fresh data
 */
export const clearEventCache = async (): Promise<void> => {
  try {
    // Clear in-memory cache
    eventsCache.clear();
    log('[EventUtils] Cleared in-memory event cache');
    
    // Clear persistent cache
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => 
      key.startsWith(EVENTS_CACHE_KEY_PREFIX) || 
      key.startsWith(EVENTS_TIMESTAMP_KEY_PREFIX)
    );
    
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
      log(`[EventUtils] Cleared ${cacheKeys.length} persistent cache entries`);
    }
  } catch (error) {
    error('[EventUtils] Error clearing event cache:', error);
  }
};

/**
 * Join an event
 */
export const joinEvent = async (eventId: string, userId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('event_attendees')
      .insert([{ event_id: eventId, user_id: userId }]);

    if (error) {
      // Handle duplicate key error (23505) - user is already joined, treat as success
      if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        log('[EventUtils] User is already a participant (duplicate key) - treating as success');
        return true;
      }
      
      error('Error joining event:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('Error in joinEvent:', error);
    return false;
  }
};

/**
 * Leave an event
 */
export const leaveEvent = async (eventId: string, userId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('event_attendees')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) {
      error('Error leaving event:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('Error in leaveEvent:', error);
    return false;
  }
};

function isNetworkError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof (error as any)?.message === 'string'
        ? (error as any).message
        : String(error);
  return msg.includes('Network request failed') || msg.includes('Failed to fetch') || msg.includes('network');
}

/**
 * Check if user is attending an event
 */
export const isUserAttending = async (eventId: string, userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('event_attendees')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      if (isNetworkError(error)) {
        if (__DEV__) warn('[EventUtils] Attendance check failed (network), will retry later');
      } else {
        error('Error checking attendance:', error);
      }
      return false;
    }

    return !!data;
  } catch (error) {
    if (isNetworkError(error)) {
      if (__DEV__) warn('[EventUtils] Attendance check failed (network):', error);
    } else {
      error('Error in isUserAttending:', error);
    }
    return false;
  }
};
