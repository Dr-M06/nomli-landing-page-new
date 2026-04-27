/**
 * Notification Preferences Utility
 * Handles saving and loading notification preferences from the database
 */

import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Get all notification preferences for a user
 */
export const getNotificationPreferences = async (userId: string): Promise<{
  push_notifications_enabled: boolean;
  message_notifications_enabled: boolean;
  event_notifications_enabled: boolean;
  livestream_notifications_enabled: boolean;
} | null> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('push_notifications_enabled, message_notifications_enabled, event_notifications_enabled, livestream_notifications_enabled')
      .eq('id', userId)
      .single();

    if (error) {
      error('[NotificationPreferences] Error getting preferences:', error);
      return null;
    }

    // Default to true if not set
    return {
      push_notifications_enabled: data?.push_notifications_enabled ?? true,
      message_notifications_enabled: data?.message_notifications_enabled ?? true,
      event_notifications_enabled: data?.event_notifications_enabled ?? true,
      livestream_notifications_enabled: data?.livestream_notifications_enabled ?? true,
    };
  } catch (error) {
    error('[NotificationPreferences] Error getting preferences:', error);
    return null;
  }
};

/**
 * Update push notifications preference
 */
export const updatePushNotificationsPreference = async (userId: string, enabled: boolean): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ push_notifications_enabled: enabled })
      .eq('id', userId);

    if (error) {
      error('[NotificationPreferences] Error updating push notifications preference:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('[NotificationPreferences] Error updating push notifications preference:', error);
    return false;
  }
};

/**
 * Update message notifications preference
 */
export const updateMessageNotificationsPreference = async (userId: string, enabled: boolean): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ message_notifications_enabled: enabled })
      .eq('id', userId);

    if (error) {
      error('[NotificationPreferences] Error updating message notifications preference:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('[NotificationPreferences] Error updating message notifications preference:', error);
    return false;
  }
};

/**
 * Update event notifications preference
 */
export const updateEventNotificationsPreference = async (userId: string, enabled: boolean): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ event_notifications_enabled: enabled })
      .eq('id', userId);

    if (error) {
      error('[NotificationPreferences] Error updating event notifications preference:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('[NotificationPreferences] Error updating event notifications preference:', error);
    return false;
  }
};

/**
 * Update livestream notifications preference
 */
export const updateLivestreamNotificationsPreference = async (userId: string, enabled: boolean): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ livestream_notifications_enabled: enabled })
      .eq('id', userId);

    if (error) {
      error('[NotificationPreferences] Error updating livestream notifications preference:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('[NotificationPreferences] Error updating livestream notifications preference:', error);
    return false;
  }
};

/**
 * Update all notification preferences at once
 */
export const updateAllNotificationPreferences = async (
  userId: string,
  preferences: {
    push_notifications_enabled?: boolean;
    message_notifications_enabled?: boolean;
    event_notifications_enabled?: boolean;
    livestream_notifications_enabled?: boolean;
  }
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update(preferences)
      .eq('id', userId);

    if (error) {
      error('[NotificationPreferences] Error updating notification preferences:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('[NotificationPreferences] Error updating notification preferences:', error);
    return false;
  }
};
