import { customNotifications, PushNotificationData } from './customNotifications';
import { log } from './productionLogger';


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
 * Voice/video calls are not supported in-app (CallKit / native call UI removed).
 * Kept as a no-op for any legacy callers.
 */
export const sendCallNotification = async (
  _recipientId: string,
  _callerName: string,
  _callType: 'audio' | 'video',
  _callId: string,
  _callerId?: string,
  _callerAvatar?: string
): Promise<boolean> => {
  log('[CallNotification] Skipping — calls are disabled');
  return false;
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