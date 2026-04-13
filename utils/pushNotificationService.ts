import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


interface PushNotificationData {
  title: string;
  body: string;
  data?: any;
  sound?: string;
  badge?: number;
}

// Send push notification to a specific user
export const sendPushNotification = async (
  userId: string,
  notification: PushNotificationData
): Promise<boolean> => {
  try {
    // Get the user's Expo push token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.expo_push_token) {
      log('No push token found for user:', userId);
      return false;
    }

    // Send the notification using Expo's push service
    const message: any = {
      to: profile.expo_push_token,
      sound: notification.sound || 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      badge: notification.badge || 1,
      priority: 'high',
    };

    // Android: ensure we target a high-importance channel when present
    // (Expo will map this when using `expo-notifications` channels).
    if (!message.android) message.android = {};
    message.android.channelId = notification.data?.type === 'message' || notification.data?.type === 'chat'
      ? 'messages'
      : 'default';

    // Add category for iOS notification actions (reply, mark read, etc.)
    if (notification.data?.type === 'message' || notification.data?.type === 'chat') {
      message.categoryId = 'chat_message';
      // Also add iOS-specific category identifier for better compatibility
      if (!message.ios) {
        message.ios = {};
      }
      message.ios.categoryIdentifier = 'chat_message';
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

    const result = await response.json();
    
    if (response.ok) {
      // Check the actual response from Expo
      if (result.data && result.data[0]) {
        if (result.data[0].status === 'ok') {
          log('✅ Push notification sent successfully to user:', userId);
          return true;
        } else {
          error('❌ Expo Push API error:', result.data[0].status, result.data[0].message);
          error('Token used:', profile.expo_push_token);
          return false;
        }
      }
      log('✅ Push notification sent successfully to user:', userId);
      return true;
    } else {
      error('❌ Failed to send push notification:', response.status, response.statusText);
      error('Response:', result);
      error('Token used:', profile.expo_push_token);
      return false;
    }
  } catch (error) {
    error('Error sending push notification:', error);
    return false;
  }
};

// Send message notification
export const sendMessageNotification = async (
  recipientId: string,
  senderName: string,
  messageContent: string,
  senderId: string
): Promise<boolean> => {
  const notification: PushNotificationData = {
    title: `New message from ${senderName}`,
    body: messageContent,
    data: {
      type: 'message',
      chatId: senderId, // For 1-on-1 chats, chatId is the sender's ID
      chat_id: senderId, // Also include for compatibility
      senderId: senderId,
      sender_id: senderId, // Also include for compatibility
      sender_name: senderName,
      message_content: messageContent,
    },
    sound: 'default',
    badge: 1,
  };

  return await sendPushNotification(recipientId, notification);
};

// Send incoming call notification
export const sendCallNotification = async (
  recipientId: string,
  callerName: string,
  callerId: string,
  callType: 'audio' | 'video' = 'audio'
): Promise<boolean> => {
  const notification: PushNotificationData = {
    title: `Incoming ${callType} call from ${callerName}`,
    body: `Tap to answer or decline`,
    data: {
      type: 'call',
      caller_id: callerId,
      caller_name: callerName,
      call_type: callType,
      action: 'incoming_call',
    },
    sound: 'default',
    badge: 1,
  };

  return await sendPushNotification(recipientId, notification);
};

// Send missed call notification
export const sendMissedCallNotification = async (
  recipientId: string,
  callerName: string,
  callerId: string,
  callType: 'audio' | 'video' = 'audio'
): Promise<boolean> => {
  const notification: PushNotificationData = {
    title: `Missed ${callType} call from ${callerName}`,
    body: `Tap to call back`,
    data: {
      type: 'call',
      caller_id: callerId,
      caller_name: callerName,
      call_type: callType,
      action: 'missed_call',
    },
    sound: 'default',
    badge: 1,
  };

  return await sendPushNotification(recipientId, notification);
};

// Send notification to multiple users (PARALLEL for speed)
export const sendPushNotificationToUsers = async (
  userIds: string[],
  notification: PushNotificationData,
  options?: { forceEnable?: boolean } // Allow forcing notifications even in dev mode
): Promise<number> => {
  // Skip notifications in development mode to avoid disturbing users during testing
  // UNLESS forceEnable is true (for critical notifications like livestreams)
  const isDevMode = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  if (isDevMode && !options?.forceEnable) {
    log('🚫 [NOTIFICATION] Dev mode detected - skipping push notification');
    return 0;
  }

  if (userIds.length === 0) {
    return 0;
  }

  try {
    // Get all push tokens in one query (much faster)
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, expo_push_token')
      .in('id', userIds)
      .not('expo_push_token', 'is', null);

    if (error || !profiles || profiles.length === 0) {
      log('No push tokens found for users');
      return 0;
    }

    const tokens = profiles.map(p => p.expo_push_token).filter(Boolean) as string[];
    
    if (tokens.length === 0) {
      return 0;
    }

    // Use Expo's batch API - send all notifications in one request
    const messages = tokens.map(token => ({
      to: token,
      sound: notification.sound || 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      badge: notification.badge || 1,
      priority: 'high', // High priority for livestream notifications
    }));

    log(`📢 [NOTIFICATION] Sending ${messages.length} notifications in parallel...`);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    
    if (response.ok && result.data) {
      // Count successful notifications
      const successCount = result.data.filter((r: any) => r.status === 'ok').length;
      log(`✅ [NOTIFICATION] Sent ${successCount}/${messages.length} notifications successfully`);
      return successCount;
    } else {
      error('❌ Failed to send batch notifications:', response.status, result);
      return 0;
    }
  } catch (error) {
    error('❌ Error sending batch notifications:', error);
    return 0;
  }
};
