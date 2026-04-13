import { supabase } from './supabase';
import { AppState } from 'react-native';
import { log, warn, error } from './productionLogger';


/**
 * User-Specific Online Status Manager
 * Handles user online/offline status for individual users
 */

// Store user-specific data in a Map to prevent cross-user interference
const userStatusData = new Map<string, {
  statusUpdateInterval: NodeJS.Timeout | null;
  inactivityTimeout: NodeJS.Timeout | null;
  appStateListener: any;
  lastActivityTime: number;
}>();

let currentUserId: string | null = null;

// Track app lifecycle - Made more responsive for better real-time updates
const INACTIVITY_TIMEOUT = 3 * 60 * 1000; // 3 minutes (reduced from 5)
const STATUS_UPDATE_INTERVAL = 30 * 1000; // 30 seconds (reduced from 1 minute)
const HEARTBEAT_INTERVAL = 15 * 1000; // 15 seconds (reduced from 30)
const ACTIVITY_UPDATE_THROTTLE = 5 * 1000; // 5 seconds - minimum time between activity updates

/**
 * Initialize online status tracking for a user
 */
export const initializeOnlineStatusManager = async (userId: string) => {
  log('🟢 Initializing online status manager for user:', userId);
  
  // Clean up any existing data for this user first
  await cleanupOnlineStatusManager(userId);
  
  currentUserId = userId;
  
  // Initialize user-specific data
  userStatusData.set(userId, {
    statusUpdateInterval: null,
    inactivityTimeout: null,
    appStateListener: null,
    lastActivityTime: Date.now()
  });
  
  // Set user as online immediately
  await setUserOnline();
  
  // Start periodic status updates
  startStatusUpdates(userId);
  
  // Set up app state monitoring
  setupAppStateMonitoring(userId);
  
  // Set up inactivity detection
  resetInactivityTimer(userId);
  
  log('✅ Online status manager initialized for user:', userId);
};

/**
 * Clean up online status manager for a specific user
 */
export const cleanupOnlineStatusManager = async (userId?: string) => {
  const targetUserId = userId || currentUserId;
  log('🔴 Cleaning up online status manager for user:', targetUserId);
  
  if (!targetUserId) {
    log('⚠️ No user ID provided for cleanup');
    return;
  }
  
  // Get user-specific data
  const userData = userStatusData.get(targetUserId);
  if (!userData) {
    log('⚠️ No user data found for user:', targetUserId);
    return;
  }
  
  // Set user offline
  if (targetUserId === currentUserId) {
    await setUserOffline();
  }
  
  // Clear user-specific timers
  if (userData.statusUpdateInterval) {
    clearInterval(userData.statusUpdateInterval);
  }
  
  if (userData.inactivityTimeout) {
    clearTimeout(userData.inactivityTimeout);
  }
  
  // Remove user-specific app state listener
  if (userData.appStateListener) {
    userData.appStateListener.remove();
  }
  
  // Remove user data from map
  userStatusData.delete(targetUserId);
  
  // Clear current user if this was the current user
  if (targetUserId === currentUserId) {
    currentUserId = null;
  }
  
  log('✅ Online status manager cleaned up for user:', targetUserId);
};

/**
 * Set user as online with current timestamp
 */
export const setUserOnline = async () => {
  if (!currentUserId) return;
  
  try {
    await supabase
      .from('profiles')
      .update({
        online_status: 'online',
        last_active: new Date().toISOString()
      })
      .eq('id', currentUserId);
    
    log('🟢 User set as online');
  } catch (error) {
    error('❌ Error setting user online:', error);
  }
};

/**
 * Set user as offline
 */
export const setUserOffline = async () => {
  if (!currentUserId) return;
  
  try {
    await supabase
      .from('profiles')
      .update({
        online_status: 'offline',
        last_active: new Date().toISOString()
      })
      .eq('id', currentUserId);
    
    log('🔴 User set as offline');
  } catch (error) {
    error('❌ Error setting user offline:', error);
  }
};

// Track last activity update time to throttle updates
let lastActivityUpdateTime = 0;

/**
 * Update user activity (call this on user interactions)
 * This function is throttled to prevent excessive database writes
 */
export const updateUserActivity = async () => {
  if (!currentUserId) return;
  
  const userData = userStatusData.get(currentUserId);
  if (!userData) return;
  
  // Update in-memory activity time immediately (for inactivity detection)
  userData.lastActivityTime = Date.now();
  
  // Throttle database updates to prevent rapid-fire writes
  const now = Date.now();
  if (now - lastActivityUpdateTime < ACTIVITY_UPDATE_THROTTLE) {
    // Skip database update if called too recently, but still update in-memory time
    return;
  }
  
  lastActivityUpdateTime = now;
  
  try {
    // Update last_active timestamp in database
    await supabase
      .from('profiles')
      .update({
        online_status: 'online',
        last_active: new Date().toISOString()
      })
      .eq('id', currentUserId);
    
    // Reset inactivity timer
    resetInactivityTimer(currentUserId);
    
    log('🔄 User activity updated');
  } catch (error) {
    error('❌ Error updating user activity:', error);
  }
};

/**
 * Start periodic status updates for a specific user
 */
const startStatusUpdates = (userId: string) => {
  const userData = userStatusData.get(userId);
  if (!userData) return;
  
  // Clear existing interval for this user
  if (userData.statusUpdateInterval) {
    clearInterval(userData.statusUpdateInterval);
  }
  
  userData.statusUpdateInterval = setInterval(async () => {
    if (userId !== currentUserId) return;
    
    // Check if user has been inactive
    const timeSinceLastActivity = Date.now() - userData.lastActivityTime;
    
    if (timeSinceLastActivity > INACTIVITY_TIMEOUT) {
      log('😴 User inactive, setting as away');
      await setUserAway();
    } else {
      // Send heartbeat to keep online status fresh
      await sendHeartbeat();
    }
  }, STATUS_UPDATE_INTERVAL);
  
  log('⏰ Status update interval started for user:', userId);
};

/**
 * Set user as away due to inactivity
 */
const setUserAway = async () => {
  if (!currentUserId) return;
  
  try {
    await supabase
      .from('profiles')
      .update({
        online_status: 'away',
        last_active: new Date().toISOString()
      })
      .eq('id', currentUserId);
    
    log('😴 User set as away');
  } catch (error) {
    error('❌ Error setting user away:', error);
  }
};

/**
 * Send heartbeat to maintain online status
 */
const sendHeartbeat = async () => {
  if (!currentUserId) return;
  
  try {
    await supabase
      .from('profiles')
      .update({
        last_active: new Date().toISOString()
      })
      .eq('id', currentUserId);
    
    log('💓 Heartbeat sent');
  } catch (error) {
    error('❌ Error sending heartbeat:', error);
  }
};

/**
 * Set up app state monitoring for a specific user
 */
const setupAppStateMonitoring = (userId: string) => {
  const userData = userStatusData.get(userId);
  if (!userData) return;
  
  // Remove existing listener for this user
  if (userData.appStateListener) {
    userData.appStateListener.remove();
  }
  
  userData.appStateListener = AppState.addEventListener('change', async (nextAppState) => {
    // Only handle app state changes for the current user
    if (userId !== currentUserId) return;
    
    log('📱 App state changed to:', nextAppState, 'for user:', userId);
    
    switch (nextAppState) {
      case 'active':
        // App became active - set user online
        userData.lastActivityTime = Date.now();
        await setUserOnline();
        resetInactivityTimer(userId);
        break;
        
      case 'background':
      case 'inactive':
        // App went to background - set user offline after delay
        setTimeout(async () => {
          if (AppState.currentState !== 'active' && userId === currentUserId) {
            await setUserOffline();
          }
        }, 30000); // 30 second delay before marking offline
        break;
    }
  });
  
  log('📱 App state monitoring enabled for user:', userId);
};

/**
 * Reset inactivity timer for a specific user
 */
const resetInactivityTimer = (userId: string) => {
  const userData = userStatusData.get(userId);
  if (!userData) return;
  
  // Clear existing timeout for this user
  if (userData.inactivityTimeout) {
    clearTimeout(userData.inactivityTimeout);
  }
  
  userData.inactivityTimeout = setTimeout(async () => {
    if (userId === currentUserId) {
      log('😴 Inactivity timeout reached for user:', userId);
      await setUserAway();
    }
  }, INACTIVITY_TIMEOUT);
};

/**
 * Get online status for a specific user
 * Improved logic: More responsive and accurate status detection
 */
export const getUserOnlineStatus = async (userId: string): Promise<{
  isOnline: boolean;
  lastSeen: string | null;
  status: 'online' | 'offline' | 'away';
}> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('online_status, last_active')
      .eq('id', userId)
      .single();
    
    if (error || !data) {
      warn(`[OnlineStatus] No data found for user ${userId}:`, error);
      return { isOnline: false, lastSeen: null, status: 'offline' };
    }
    
    const lastActive = data.last_active ? new Date(data.last_active) : null;
    const now = Date.now();
    const lastActiveTime = lastActive ? lastActive.getTime() : 0;
    const timeDiff = now - lastActiveTime;
    
    // RECENT_THRESHOLD: Consider user active if they pinged within this time
    // Increased to 5 minutes for better reliability (accounts for network delays)
    const RECENT_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    // Determine online status with improved logic:
    // 1. If status is explicitly 'offline', user is offline (respect explicit offline)
    // 2. If status is 'online', user is online (trust the status)
    // 3. If status is 'away', check if last_active is recent (might have just become away)
    // 4. If status is null/undefined, check last_active as fallback
    let isOnline = false;
    
    if (data.online_status === 'offline') {
      // Explicitly offline - respect this regardless of last_active
      isOnline = false;
    } else if (data.online_status === 'online') {
      // Status says online - trust it (onlineStatusManager keeps this updated)
      isOnline = true;
    } else if (data.online_status === 'away') {
      // Status says away - check if they were active recently (might have just become away)
      // If active within threshold, consider them online (status might be stale)
      isOnline = timeDiff < RECENT_THRESHOLD;
    } else {
      // No explicit status - use last_active as fallback
      isOnline = timeDiff < RECENT_THRESHOLD;
    }
    
    return {
      isOnline,
      lastSeen: lastActive?.toISOString() || null,
      status: (data.online_status as 'online' | 'offline' | 'away') || 'offline'
    };
  } catch (error) {
    error('❌ Error getting user online status:', error);
    return { isOnline: false, lastSeen: null, status: 'offline' };
  }
};

/**
 * Subscribe to online status changes for a user
 */
export const subscribeToUserStatus = (
  userId: string,
  callback: (status: { isOnline: boolean; lastSeen: string | null; status: string }) => void
) => {
  log('🔔 Subscribing to status updates for user:', userId);
  
  const channelName = `user_status_${userId}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      },
      async (payload) => {
        log('🔔 User status updated for', userId, ':', payload.new);
        
        try {
          // Use the same improved logic as getUserOnlineStatus
          if (payload.new?.online_status !== undefined && payload.new?.last_active) {
            const lastActive = new Date(payload.new.last_active);
            const now = Date.now();
            const timeDiff = now - lastActive.getTime();
            const RECENT_THRESHOLD = 5 * 60 * 1000; // 5 minutes (matches getUserOnlineStatus)
            
            // Use improved logic matching getUserOnlineStatus
            let isOnline = false;
            if (payload.new.online_status === 'offline') {
              isOnline = false; // Explicitly offline - respect this
            } else if (payload.new.online_status === 'online') {
              isOnline = true; // Trust online status
            } else if (payload.new.online_status === 'away') {
              isOnline = timeDiff < RECENT_THRESHOLD; // Check if recent activity
            } else {
              isOnline = timeDiff < RECENT_THRESHOLD; // Fallback to last_active
            }
            
            callback({
              isOnline,
              lastSeen: lastActive.toISOString(),
              status: payload.new.online_status || 'offline'
            });
          } else {
            // Fallback to getting fresh status if payload is incomplete
            warn('[OnlineStatus] Incomplete payload, fetching fresh status');
            const status = await getUserOnlineStatus(userId);
            callback(status);
          }
        } catch (error) {
          error('[OnlineStatus] Error processing status update:', error);
          // Fallback to getting fresh status on error
          try {
            const status = await getUserOnlineStatus(userId);
            callback(status);
          } catch (fetchError) {
            error('[OnlineStatus] Error fetching fresh status:', fetchError);
            // Last resort: return offline
            callback({ isOnline: false, lastSeen: null, status: 'offline' });
          }
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        log('✅ Successfully subscribed to status updates for user:', userId);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Use console.warn instead of console.error - these are expected network issues
        // The subscription will fall back to polling automatically
        warn('⚠️ [OnlineStatus] Channel subscription issue for user:', userId, 'Status:', status, '- falling back to polling');
      }
    });
  
  return () => {
    log('🔕 Unsubscribing from status updates for user:', userId);
    try {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    } catch (error) {
      error('[OnlineStatus] Error unsubscribing:', error);
    }
  };
};

// Export for external activity tracking
export const trackActivity = updateUserActivity;