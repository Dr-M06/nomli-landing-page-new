/**
 * Profile View Tracker
 * 
 * Tracks profile views and sends notifications in a non-intrusive way:
 * - Rate limiting: Max 1 notification per viewer per 24 hours
 * - Daily limits: Max 10 profile view notifications per day
 * - Privacy controls: Respects user preferences
 * - Smart filtering: Excludes own views, blocked users, etc.
 */

import { supabase } from './supabase';
import { triggerProcessNotification } from './triggerProcessNotification';
import { getBlockedUserIds, isUserBlocked } from './blockUser';
import { log, warn, error } from './productionLogger';


// Rate limiting configuration
const VIEW_NOTIFICATION_COOLDOWN_HOURS = 24; // Don't notify if same person views within 24 hours
const MAX_DAILY_PROFILE_VIEW_NOTIFICATIONS = 10; // Max notifications per day per user
const MIN_VIEW_DURATION_SECONDS = 3; // User must view profile for at least 3 seconds

// Track views in memory to prevent duplicate tracking
const viewTrackingCache = new Map<string, { timestamp: number; notified: boolean }>();
const dailyNotificationCounts = new Map<string, { count: number; resetTime: number }>();

/**
 * Track a profile view and potentially send notification
 * This is called when a user views someone's profile
 */
export const trackProfileView = async (
  viewerId: string,
  profileOwnerId: string
): Promise<void> => {
  try {
    // Skip if viewing own profile
    if (!viewerId || !profileOwnerId || viewerId === profileOwnerId) {
      return;
    }

    // Skip if viewer is blocked by profile owner
    const isBlocked = await isUserBlocked(profileOwnerId, viewerId);
    if (isBlocked) {
      log('[ProfileViewTracker] Skipping - viewer is blocked');
      return;
    }

    // Skip if profile owner blocked the viewer
    const hasBlocked = await isUserBlocked(viewerId, profileOwnerId);
    if (hasBlocked) {
      log('[ProfileViewTracker] Skipping - profile owner is blocked by viewer');
      return;
    }

    // Check if we should send notification (rate limiting)
    const shouldNotify = await shouldSendProfileViewNotification(viewerId, profileOwnerId);
    
    if (!shouldNotify) {
      log('[ProfileViewTracker] Skipping notification - rate limited or daily limit reached');
      return;
    }

    // Check if profile owner wants profile view notifications
    const { data: profile } = await supabase
      .from('profiles')
      .select('profile_view_notifications_enabled')
      .eq('id', profileOwnerId)
      .single();

    // Default to enabled if preference not set
    const notificationsEnabled = profile?.profile_view_notifications_enabled !== false;

    if (!notificationsEnabled) {
      log('[ProfileViewTracker] Profile owner has disabled profile view notifications');
      return;
    }

    // Get viewer's profile info for notification
    const { data: viewerProfile } = await supabase
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', viewerId)
      .single();

    if (!viewerProfile) {
      log('[ProfileViewTracker] Viewer profile not found');
      return;
    }

    // Use viewer's display name for notification (full_name or username)
    const viewerName = (viewerProfile.full_name && viewerProfile.full_name.trim()) || viewerProfile.username || 'Someone';

    // Create notification with viewer name for context
    await createProfileViewNotification(
      profileOwnerId,
      viewerId,
      viewerName
    );

    // Mark as notified in cache
    const cacheKey = `${profileOwnerId}_${viewerId}`;
    viewTrackingCache.set(cacheKey, {
      timestamp: Date.now(),
      notified: true
    });

    // Increment daily notification count
    incrementDailyNotificationCount(profileOwnerId);
  } catch (error) {
    error('[ProfileViewTracker] Error tracking profile view:', error);
    // Fail silently - don't break profile viewing experience
  }
};

/**
 * Check if we should send a profile view notification
 * Implements rate limiting and daily limits
 */
const shouldSendProfileViewNotification = async (
  viewerId: string,
  profileOwnerId: string
): Promise<boolean> => {
  try {
    // Check cooldown: Don't notify if same person viewed within last 24 hours
    const cacheKey = `${profileOwnerId}_${viewerId}`;
    const cached = viewTrackingCache.get(cacheKey);
    
    if (cached?.notified) {
      const hoursSinceNotification = (Date.now() - cached.timestamp) / (1000 * 60 * 60);
      if (hoursSinceNotification < VIEW_NOTIFICATION_COOLDOWN_HOURS) {
        log(`[ProfileViewTracker] Cooldown active - ${hoursSinceNotification.toFixed(1)} hours since last notification`);
        return false;
      }
    }

    // Check daily limit: Don't notify if already sent max notifications today
    const dailyCount = getDailyNotificationCount(profileOwnerId);
    if (dailyCount >= MAX_DAILY_PROFILE_VIEW_NOTIFICATIONS) {
      log(`[ProfileViewTracker] Daily limit reached: ${dailyCount}/${MAX_DAILY_PROFILE_VIEW_NOTIFICATIONS}`);
      return false;
    }

    // Check database for recent notification (fallback)
    const { data: recentNotification } = await supabase
      .from('notification_queue')
      .select('created_at')
      .eq('recipient_id', profileOwnerId)
      .eq('sender_id', viewerId)
      .eq('notification_type', 'profile_view')
      .gte('created_at', new Date(Date.now() - VIEW_NOTIFICATION_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentNotification) {
      log('[ProfileViewTracker] Recent notification found in database, skipping');
      return false;
    }

    return true;
  } catch (error) {
    error('[ProfileViewTracker] Error checking notification eligibility:', error);
    return false; // Fail safe - don't send notification if check fails
  }
};

/**
 * Create a profile view notification
 */
const createProfileViewNotification = async (
  profileOwnerId: string,
  viewerId: string,
  viewerName: string
): Promise<void> => {
  try {
    const { data: queued, error: insertError } = await supabase
      .from('notification_queue')
      .insert({
        recipient_id: profileOwnerId,
        sender_id: viewerId,
        sender_name: viewerName || 'Someone', // Use actual viewer name for better UX
        notification_type: 'profile_view',
        message_content: `${viewerName || 'Someone'} viewed your profile`,
        metadata: {
          viewer_id: viewerId,
          viewer_name: viewerName || 'Someone', // Store actual viewer name in metadata
        },
        status: 'pending'
      })
      .select('id')
      .single();

    if (insertError) {
      error('[ProfileViewTracker] Error creating notification:', insertError);
    } else {
      log(`[ProfileViewTracker] ✅ Profile view notification created for ${profileOwnerId} from ${viewerId}`);
      triggerProcessNotification(queued?.id);
    }
  } catch (error) {
    error('[ProfileViewTracker] Error creating profile view notification:', error);
  }
};

/**
 * Get daily notification count for a user
 */
const getDailyNotificationCount = (userId: string): number => {
  const cached = dailyNotificationCounts.get(userId);
  const now = Date.now();
  
  // Reset if it's a new day
  if (!cached || now >= cached.resetTime) {
    dailyNotificationCounts.set(userId, {
      count: 0,
      resetTime: now + (24 * 60 * 60 * 1000) // Reset in 24 hours
    });
    return 0;
  }
  
  return cached.count;
};

/**
 * Increment daily notification count
 */
const incrementDailyNotificationCount = (userId: string): void => {
  const cached = dailyNotificationCounts.get(userId);
  const now = Date.now();
  
  if (!cached || now >= cached.resetTime) {
    dailyNotificationCounts.set(userId, {
      count: 1,
      resetTime: now + (24 * 60 * 60 * 1000)
    });
  } else {
    dailyNotificationCounts.set(userId, {
      count: cached.count + 1,
      resetTime: cached.resetTime
    });
  }
};

/**
 * Track profile view with duration (for better accuracy)
 * Call this when user leaves the profile screen
 */
export const trackProfileViewWithDuration = async (
  viewerId: string,
  profileOwnerId: string,
  viewDurationSeconds: number
): Promise<void> => {
  // Only track if user viewed for minimum duration
  if (viewDurationSeconds < MIN_VIEW_DURATION_SECONDS) {
    log(`[ProfileViewTracker] View duration too short: ${viewDurationSeconds}s (min: ${MIN_VIEW_DURATION_SECONDS}s)`);
    return;
  }

  await trackProfileView(viewerId, profileOwnerId);
};

/**
 * Get user's profile view notification preference
 */
export const getProfileViewNotificationPreference = async (userId: string): Promise<boolean> => {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('profile_view_notifications_enabled')
      .eq('id', userId)
      .single();

    // Default to enabled if preference not set
    return data?.profile_view_notifications_enabled !== false;
  } catch (error) {
    error('[ProfileViewTracker] Error getting preference:', error);
    return true; // Default to enabled
  }
};

/**
 * Update user's profile view notification preference
 */
export const updateProfileViewNotificationPreference = async (
  userId: string,
  enabled: boolean
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ profile_view_notifications_enabled: enabled })
      .eq('id', userId);

    if (error) {
      error('[ProfileViewTracker] Error updating preference:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('[ProfileViewTracker] Error updating preference:', error);
    return false;
  }
};
