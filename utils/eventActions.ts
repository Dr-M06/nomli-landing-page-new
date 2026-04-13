import { supabase } from './supabase';
import { initializeEventAttendeesTable } from './createEventAttendeesTable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from './productionLogger';


// Cache for user-specific events
const userEventsCache = new Map<string, { data: any; timestamp: number }>();
const USER_EVENTS_CACHE_DURATION = 48 * 60 * 60 * 1000; // 48 hours (events don't change frequently)
const USER_EVENTS_CACHE_KEY_PREFIX = 'user_events_cache_';
const USER_EVENTS_CACHE_TIMESTAMP_PREFIX = 'user_events_timestamp_';

/**
 * Load cached user events from AsyncStorage
 */
const loadCachedUserEvents = async (userId: string): Promise<any | null> => {
  try {
    const cacheKey = USER_EVENTS_CACHE_KEY_PREFIX + userId;
    const timestampKey = USER_EVENTS_CACHE_TIMESTAMP_PREFIX + userId;
    
    const cachedData = await AsyncStorage.getItem(cacheKey);
    const timestampStr = await AsyncStorage.getItem(timestampKey);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      if (now - timestamp < USER_EVENTS_CACHE_DURATION) {
        log(`[EventActions] ✅ Loaded cached user events for ${userId} (${Math.round((now - timestamp) / 1000 / 60)} minutes old)`);
        return JSON.parse(cachedData);
      } else {
        log(`[EventActions] ⏰ User events cache expired for ${userId}`);
        await AsyncStorage.multiRemove([cacheKey, timestampKey]);
      }
    }
  } catch (error) {
    error(`[EventActions] Error loading cached user events for ${userId}:`, error);
  }
  return null;
};

/**
 * Save user events to AsyncStorage cache
 */
const saveCachedUserEvents = async (userId: string, data: any): Promise<void> => {
  try {
    const cacheKey = USER_EVENTS_CACHE_KEY_PREFIX + userId;
    const timestampKey = USER_EVENTS_CACHE_TIMESTAMP_PREFIX + userId;
    
    await AsyncStorage.multiSet([
      [cacheKey, JSON.stringify(data)],
      [timestampKey, Date.now().toString()]
    ]);
    
    log(`[EventActions] ✅ Cached user events for ${userId}`);
  } catch (error) {
    error(`[EventActions] Error caching user events for ${userId}:`, error);
  }
};

/**
 * Get cached user events (exported for use in profile screen)
 */
export const getCachedUserEvents = async (userId: string): Promise<any | null> => {
  // Check in-memory cache first
  const now = Date.now();
  const inMemoryCache = userEventsCache.get(userId);
  if (inMemoryCache && (now - inMemoryCache.timestamp < USER_EVENTS_CACHE_DURATION)) {
    return inMemoryCache.data;
  }
  
  // Check persistent cache
  return await loadCachedUserEvents(userId);
};

/**
 * Join an event as a participant
 * @param eventId The ID of the event to join
 * @param userId The ID of the user joining the event
 * @returns Success status and error message if applicable
 */
export const joinEvent = async (eventId: string, userId: string): Promise<{success: boolean, message?: string}> => {
  try {
    log(`[EventActions] Attempting to join event: ${eventId} for user: ${userId}`);
    
    // First, let's check what fields exist in the event_attendees table
    log('[EventActions] Checking existing event_attendees records');
    const { data: sampleData, error: sampleError } = await supabase
      .from('event_attendees')
      .select('*')
      .limit(1);
      
    // Debug what fields exist in the table
    if (!sampleError && sampleData && (sampleData?.length || 0) > 0) {
      log('[EventActions] event_attendees table fields:', Object.keys(sampleData[0]));
    } else {
      log('[EventActions] No existing records found in event_attendees or error:', sampleError);
    }
    
    // Check if the user is already a participant
    const { data: existingData, error: checkError } = await supabase
      .from('event_attendees')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', userId);
      
    if (!checkError && existingData && (existingData?.length || 0) > 0) {
      log('[EventActions] User is already a participant in this event');
      return { success: true, message: 'Already joined this event' };
    }
    
    // Insert with user_id (correct column name based on our analysis)
    log('[EventActions] Inserting attendance record with user_id');
    const { error } = await supabase
      .from('event_attendees')
      .insert([{ event_id: eventId, user_id: userId }]);
    
    if (!error) {
      log('[EventActions] Successfully joined event with user_id');
      return { success: true };
    }
    
    // Handle duplicate key error (23505) - user is already joined, treat as success
    if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
      log('[EventActions] User is already a participant (duplicate key) - treating as success');
      return { success: true, message: 'Already joined this event' };
    }
    
    error('[EventActions] Error joining event with user_id:', error);
    
    // If the first approach failed, let's try to see what fields the table expects
    if (error.message.includes('violates foreign key constraint')) {
      log('[EventActions] Foreign key constraint violation - likely schema mismatch');
      
      // Create a diagnostic record to see what fields are actually available
      const diagnosticRecord: any = {
        event_id: eventId,
      };
      
      // Try several possible column names
      const possibleUserColumns = ['user_id', 'profile_id', 'attendee_id', 'participant_id'];
      for (const column of possibleUserColumns) {
        diagnosticRecord[column] = userId;
      }
      
      // Try to insert with multiple columns and see which one works
      log('[EventActions] Attempting diagnostic insert with multiple columns:', diagnosticRecord);
      const { error: diagError } = await supabase
        .from('event_attendees')
        .insert([diagnosticRecord]);
        
      if (!diagError) {
        log('[EventActions] Diagnostic insert succeeded! Columns accepted:', diagnosticRecord);
        return { success: true };
      } else {
        error('[EventActions] Diagnostic insert failed:', diagError);
      }
    }
    
    // If all attempts failed, return the error
    return { 
      success: false, 
      message: `Failed to join event: ${error.message}` 
    };
  } catch (error: any) {
    error('[EventActions] Exception when joining event:', error);
    return { 
      success: false, 
      message: `Exception joining event: ${error.message || error}` 
    };
  }
};

/**
 * Leave an event as a participant
 * @param eventId The ID of the event to leave
 * @param userId The ID of the user leaving the event
 * @returns Success status and error message if applicable
 */
export const leaveEvent = async (eventId: string, userId: string): Promise<{success: boolean, message?: string}> => {
  try {
    log(`[EventActions] Attempting to leave event: ${eventId} for user: ${userId}`);
    
    // Delete with user_id (correct column name)
    const { error } = await supabase
      .from('event_attendees')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);
    
    if (!error) {
      log('[EventActions] Successfully left event using user_id');
      return { success: true };
    }
    
    error('[EventActions] Error leaving event:', error);
    return { 
      success: false, 
      message: `Failed to leave event: ${error.message}` 
    };
  } catch (error: any) {
    error('[EventActions] Exception when leaving event:', error);
    return { 
      success: false, 
      message: `Exception leaving event: ${error.message || error}` 
    };
  }
};

/**
 * Check if a user is already participating in an event
 * @param eventId The ID of the event to check
 * @param userId The ID of the user
 * @returns Whether the user is participating
 */
export const isParticipatingInEvent = async (eventId: string, userId: string): Promise<boolean> => {
  try {
    log(`[EventActions] Checking if user ${userId} is participating in event ${eventId}`);
    
    // Check with user_id
    const { data, error } = await supabase
      .from('event_attendees')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .limit(1);
    
    if (!error && data && (data?.length || 0) > 0) {
      log('[EventActions] User is participating in the event');
      return true;
    }
    
    log('[EventActions] User is not participating in the event');
    return false;
  } catch (error) {
    error('[EventActions] Error checking event participation:', error);
    return false;
  }
};

/**
 * Fetch events for a user (both created by the user and joined by the user)
 * @param userId The ID of the user
 * @returns Object with both hosted events and joined events
 */
export const getUserEvents = async (userId: string, useCache: boolean = true): Promise<{
  hostedEvents: any[];
  joinedEvents: any[];
  success: boolean;
  message?: string;
}> => {
  try {
    // Check in-memory cache first
    if (useCache) {
      const now = Date.now();
      const inMemoryCache = userEventsCache.get(userId);
      if (inMemoryCache && (now - inMemoryCache.timestamp < USER_EVENTS_CACHE_DURATION)) {
        log(`[EventActions] ✅ Using in-memory cached user events for ${userId}`);
        return inMemoryCache.data;
      }
      
      // Check persistent cache
      const persistentCache = await loadCachedUserEvents(userId);
      if (persistentCache) {
        log(`[EventActions] ✅ Using persistent cached user events for ${userId}`);
        // Update in-memory cache
        userEventsCache.set(userId, { data: persistentCache, timestamp: now });
        // Return cached data immediately, then refresh in background
        setTimeout(() => {
          getUserEvents(userId, false).catch(err => {
            warn(`[EventActions] Background refresh failed for user ${userId}:`, err);
          });
        }, 100);
        return persistentCache;
      }
    }
    
    log(`[EventActions] Fetching fresh events for user: ${userId}`);
    
    // Fetch events hosted by the user
    // Don't filter by deleted_at - show all events including admin-deleted ones on user's profile
    const { data: hostedEvents, error: hostedError } = await supabase
      .from('events')
      .select(`
        *,
        host:profiles(id, username, full_name, avatar_url)
      `)
      .eq('host_id', userId)
      .order('date', { ascending: false });
    
    if (hostedError) {
      error('[EventActions] Error fetching hosted events:', hostedError);
      return { 
        hostedEvents: [], 
        joinedEvents: [], 
        success: false, 
        message: `Failed to fetch hosted events: ${hostedError.message}` 
      };
    }
    
    // Fetch event IDs where the user is a participant
    const { data: joinedEventIds, error: joinedError } = await supabase
      .from('event_attendees')
      .select('event_id')
      .eq('user_id', userId);
    
    if (joinedError) {
      error('[EventActions] Error fetching joined event IDs:', joinedError);
      return { 
        hostedEvents: hostedEvents || [], 
        joinedEvents: [], 
        success: true 
      };
    }
    
    // If the user hasn't joined any events, return early
    if (!joinedEventIds || (joinedEventIds?.length || 0) === 0) {
      log('[EventActions] User has not joined any events');
      return { 
        hostedEvents: hostedEvents || [], 
        joinedEvents: [], 
        success: true 
      };
    }
    
    // Extract the event IDs from the result
    const eventIds = joinedEventIds.map(item => item.event_id);
    
    // Fetch the full event details for joined events
    // Filter by deleted_at for joined events (user shouldn't see deleted events they joined)
    const { data: joinedEvents, error: joinedDetailsError } = await supabase
      .from('events')
      .select(`
        *,
        host:profiles(id, username, full_name, avatar_url)
      `)
      .in('id', eventIds)
      .is('deleted_at', null)
      .order('date', { ascending: false });
    
    if (joinedDetailsError) {
      error('[EventActions] Error fetching joined event details:', joinedDetailsError);
      return { 
        hostedEvents: hostedEvents || [], 
        joinedEvents: [], 
        success: true,
        message: `Note: Failed to fetch joined event details: ${joinedDetailsError.message}`
      };
    }
    
    // For each event, fetch the participant count
    const allEvents = [...(hostedEvents || []), ...(joinedEvents || [])];
    const participantCounts: Record<string, number> = {};
    
    if ((allEvents?.length || 0) > 0) {
      const allEventIds = allEvents.map(event => event.id);
      
      // Fetch all attendees for these events
      const { data: attendees, error: countError } = await supabase
        .from('event_attendees')
        .select('event_id')
        .in('event_id', allEventIds);
      
      if (!countError && attendees) {
        // Count attendees for each event
        attendees.forEach(item => {
          if (item.event_id) {
            participantCounts[item.event_id] = (participantCounts[item.event_id] || 0) + 1;
          }
        });
      }
    }
    
    // Add participant count to each event
    const hostedWithCounts = (hostedEvents || []).map(event => ({
      ...event,
      participant_count: participantCounts[event.id] || 0
    }));
    
    const joinedWithCounts = (joinedEvents || []).map(event => ({
      ...event,
      participant_count: participantCounts[event.id] || 0
    }));
    
    const result = { 
      hostedEvents: hostedWithCounts, 
      joinedEvents: joinedWithCounts, 
      success: true 
    };
    
    // Cache the results (both in-memory and persistent)
    const now = Date.now();
    userEventsCache.set(userId, { data: result, timestamp: now });
    await saveCachedUserEvents(userId, result);
    
    return result;
  } catch (error: any) {
    error('[EventActions] Exception fetching user events:', error);
    // Try to return cached data if fetch fails
    if (useCache) {
      const cached = await loadCachedUserEvents(userId);
      if (cached) {
        log(`[EventActions] ⚠️ Fetch failed, returning cached user events for ${userId}`);
        return cached;
      }
    }
    return { 
      hostedEvents: [], 
      joinedEvents: [], 
      success: false, 
      message: `Exception fetching events: ${error.message || error}` 
    };
  }
}; 

/**
 * Delete an event (only by the event host)
 * @param eventId The ID of the event to delete
 * @param userId The ID of the user attempting to delete the event
 * @returns Success status and error message if applicable
 */
export const deleteEvent = async (eventId: string, userId: string): Promise<{success: boolean, message?: string}> => {
  try {
    log(`[EventActions] Attempting to delete event: ${eventId} by user: ${userId}`);
    
    // First, verify that the user is the host of the event
    const { data: event, error: fetchError } = await supabase
      .from('events')
      .select('host_id, deleted_at')
      .eq('id', eventId)
      .single();
    
    if (fetchError || !event) {
      error('[EventActions] Error fetching event to delete:', fetchError);
      return { 
        success: false, 
        message: 'Event not found or could not be accessed' 
      };
    }
    
    if (event.host_id !== userId) {
      error('[EventActions] User does not have permission to delete this event');
      return { 
        success: false, 
        message: 'You do not have permission to delete this event' 
      };
    }
    
    // First, try to delete all attendees for this event
    try {
      const { error: attendeesError } = await supabase
        .from('event_attendees')
        .delete()
        .eq('event_id', eventId);
      
      if (attendeesError) {
        warn('[EventActions] Warning: Could not delete event attendees:', attendeesError);
        // Continue with event deletion even if attendees deletion fails
      } else {
        log('[EventActions] Successfully deleted event attendees');
      }
    } catch (attendeesError) {
      warn('[EventActions] Exception when deleting attendees:', attendeesError);
      // Continue with event deletion even if attendees deletion fails
    }
    
    // Check if the table has deleted_at column and use soft delete if possible
    if ('deleted_at' in event) {
      // Table has deleted_at column, use soft delete
      log('[EventActions] Using soft delete (setting deleted_at)');
      
      // Use RPC to bypass RLS issues when updating
      const { error: softDeleteError } = await supabase.rpc('soft_delete_event', { 
        p_event_id: eventId,
        p_user_id: userId
      }).single();
      
      // If RPC fails or doesn't exist, fall back to direct update
      if (softDeleteError) {
        log('[EventActions] RPC method failed, trying direct update:', softDeleteError);
        
        const { error: updateError } = await supabase
          .from('events')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', eventId)
          .eq('host_id', userId); // Ensure the user is the host
        
        if (updateError) {
          error('[EventActions] Error soft deleting event:', updateError);
          return { 
            success: false, 
            message: `Failed to delete event: ${updateError.message}` 
          };
        }
      }
      
      log('[EventActions] Successfully soft deleted event');
      return { success: true };
    } else {
      // Table doesn't have deleted_at column, use hard delete
      log('[EventActions] Using hard delete (removing record)');
      
      // Try hard delete as a last resort
      const { error: deleteError } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)
        .eq('host_id', userId); // Ensure the user is the host
      
      if (deleteError) {
        error('[EventActions] Error hard deleting event:', deleteError);
        return { 
          success: false, 
          message: `Failed to delete event: ${deleteError.message}` 
        };
      }
      
      log('[EventActions] Successfully hard deleted event');
      return { success: true };
    }
  } catch (error: any) {
    error('[EventActions] Exception when deleting event:', error);
    return { 
      success: false, 
      message: `Exception deleting event: ${error.message || error}` 
    };
  }
}; 