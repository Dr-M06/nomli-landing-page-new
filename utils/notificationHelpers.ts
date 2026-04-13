import { customNotifications, PushNotificationData } from './customNotifications';
import { lockscreenCallService } from './lockscreenCallNotifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';


/**
 * Send a chat message notification
 */
export const sendChatNotification = async (
  recipientId: string,
  senderName: string,
  message: string,
  chatId: string,
  senderId: string
): Promise<boolean> => {
  // Check if app is active - if so, skip sending notification
  // The in-app chat UI will handle it via Supabase realtime
  const { appStateTracker } = await import('./appStateTracker');
  if (appStateTracker.isAppActive()) {
    log('[ChatNotification] App is active - skipping notification, UI will handle it');
    // Still return true to indicate "handled" (by UI)
    return true;
  }

  const notification: PushNotificationData = {
    title: `New message from ${senderName}`,
    body: message.length > 50 ? `${message.substring(0, 50)}...` : message,
    data: {
      type: 'chat',
      chatId,
      senderId,
      senderName,
    },
    sound: true,
    badge: 1,
  };

  return await customNotifications.sendNotificationToUser(recipientId, notification);
};

/**
 * Send a call notification with lockscreen support (WhatsApp-like ringing)
 */
export const sendCallNotification = async (
  recipientId: string,
  callerName: string,
  callType: 'audio' | 'video',
  callId: string,
  callerId?: string,
  callerAvatar?: string
): Promise<boolean> => {
  try {
    // Check if app is active - if so, skip sending notifications
    // The in-app UI (GlobalCallManager) will handle it instead
    const { appStateTracker } = await import('./appStateTracker');
    const isAppActive = appStateTracker.isAppActive();
    
    if (isAppActive) {
      log('[CallNotification] App is active - skipping notification, UI will handle it');
      // Still return true to indicate "handled" (by UI)
      return true;
    }

    // Initialize lockscreen call service if not already done
    await lockscreenCallService.initialize();

    // Send lockscreen call notification (works when app is closed/background)
    await lockscreenCallService.sendLockscreenCallNotification({
      callId,
      callerId: callerId || callId,
      callerName,
      callerAvatar,
      callType,
      isIncoming: true,
    });

    // Also send regular push notification as backup
    const notification: PushNotificationData = {
      title: `Incoming ${callType} call`,
      body: `${callerName} is calling you`,
      data: {
        type: 'incoming_call', // Important: use 'incoming_call' to trigger call UI
        callId,
        callerId: callerId || callId,
        callType,
        callerName,
        callerAvatar,
        isIncoming: true,
      },
      sound: true,
      badge: 1,
    };

    // Send push notification with call-specific configuration
    const pushToken = await customNotifications.getPushToken();
    if (pushToken) {
      // Get recipient's push token from their profile
      const { supabase } = await import('./supabase');
      const { data: profile } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', recipientId)
        .single();

      if (profile?.expo_push_token) {
        // Send enhanced push notification via Expo API
        const message: any = {
          to: profile.expo_push_token,
          sound: 'default',
          title: `Incoming ${callType} call`,
          body: `${callerName} is calling you`,
          data: {
            type: 'incoming_call',
            callId,
            callerId: callerId || callId,
            callType,
            callerName,
            callerAvatar,
            isIncoming: true,
          },
          badge: 1,
          priority: 'high',
          categoryId: 'incoming_call', // iOS category identifier
        };

        // Platform-specific configurations
        if (Platform.OS === 'ios') {
          message.ios = {
            sound: 'default',
            critical: true,
            interruptionLevel: 'critical',
            relevanceScore: 1.0,
            categoryIdentifier: 'incoming_call',
          };
        } else {
          message.android = {
            channelId: 'critical_calls',
            priority: 'max',
            visibility: 'public',
            sound: 'default',
          };
        }

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        if (response.ok) {
          log('[CallNotification] Push notification sent successfully');
        }
      }
    }

    return await customNotifications.sendNotificationToUser(recipientId, notification);
  } catch (error) {
    error('[CallNotification] Error sending call notification:', error);
    // Fallback to basic notification
  const notification: PushNotificationData = {
    title: `Incoming ${callType} call`,
    body: `${callerName} is calling you`,
    data: {
        type: 'incoming_call',
      callId,
      callType,
      callerName,
    },
    sound: true,
    badge: 1,
  };
  return await customNotifications.sendNotificationToUser(recipientId, notification);
  }
};

/**
 * Send an event invitation notification
 */
export const sendEventInvitationNotification = async (
  recipientId: string,
  eventName: string,
  inviterName: string,
  eventId: string
): Promise<boolean> => {
  const notification: PushNotificationData = {
    title: `Event invitation`,
    body: `${inviterName} invited you to ${eventName}`,
    data: {
      type: 'event_invitation',
      eventId,
      inviterName,
      eventName,
    },
    sound: true,
    badge: 1,
  };

  return await customNotifications.sendNotificationToUser(recipientId, notification);
};

/**
 * Send a profile match notification
 */
export const sendProfileMatchNotification = async (
  recipientId: string,
  matchedUserName: string
): Promise<boolean> => {
  const notification: PushNotificationData = {
    title: `New match!`,
    body: `You matched with ${matchedUserName}`,
    data: {
      type: 'profile_match',
      matchedUserId: recipientId,
      matchedUserName,
    },
    sound: true,
    badge: 1,
  };

  return await customNotifications.sendNotificationToUser(recipientId, notification);
};

/**
 * Send a general notification
 */
export const sendGeneralNotification = async (
  recipientId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<boolean> => {
  const notification: PushNotificationData = {
    title,
    body,
    data: data || {},
    sound: true,
    badge: 1,
  };

  return await customNotifications.sendNotificationToUser(recipientId, notification);
};

/**
 * Send notifications to multiple users
 */
export const sendBulkNotification = async (
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<boolean> => {
  const notification: PushNotificationData = {
    title,
    body,
    data: data || {},
    sound: true,
    badge: 1,
  };

  return await customNotifications.sendNotificationToUsers(userIds, notification);
}; 