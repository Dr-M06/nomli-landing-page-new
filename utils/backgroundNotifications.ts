import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { badgeCounter } from './badgeCounter';
import { log, warn, error } from './productionLogger';


// Note: Notification handler is configured in app/_layout.tsx
// This file only handles notification listeners, not the handler itself

// Handle notification received while app is in background
export const handleNotificationReceived = async (notification: Notifications.Notification) => {
  const data: any = notification.request?.content?.data || {};
  // Ignore internal badge pings to avoid loops/log spam
  if (data?.type === 'badge') {
    return;
  }
  // Ignore notifications we created locally (BackgroundNotificationHandler re-broadcast) to prevent loops
  if (data?._internalLocal) {
    return;
  }
  log('Notification received in background:', notification);
  
  // Update badge count when real notification is received
  try {
    await badgeCounter.updateBadgeCount();
    log('[BackgroundNotifications] Badge count updated after notification received');
  } catch (error) {
    error('[BackgroundNotifications] Error updating badge count:', error);
  }
  
  // Call notifications are handled by the notification system itself
  // No special handling needed here - the system notification will display
};

// Handle notification response (when user taps notification)
export const handleNotificationResponseReceived = async (response: Notifications.NotificationResponse) => {
  log('Notification response received:', response);
  
  const { notification } = response;
  const data = notification.request.content.data;
  
  // Clear badge count when user taps notification
  try {
    await badgeCounter.clearBadgeCount();
    log('[BackgroundNotifications] Badge count cleared after notification response');
  } catch (error) {
    error('[BackgroundNotifications] Error clearing badge count:', error);
  }
  
  // Navigate to the appropriate screen based on notification data
  if (data?.type === 'message' && data?.sender_id) {
    // Store the navigation intent for when app opens
    // This will be handled by the app when it becomes active
    await storeNavigationIntent(data);
  } else if (data?.type === 'call' && data?.caller_id) {
    // Handle call notification response
    await storeCallIntent(data);
  } else if (data?.type === 'like' || data?.type === 'comment' || data?.type === 'new_post') {
    // Store navigation intent for post - will be handled when app opens
    const postId = data?.post_id;
    if (postId) {
      await storeNavigationIntent({ type: 'post', post_id: postId });
      log('[BackgroundNotifications] Stored post navigation intent:', postId);
    }
  } else if (data?.type === 'follow' || data?.type === 'friend_request_accepted' || data?.type === 'profile_view') {
    // Store navigation intent for profile
    const senderId = data?.sender_id || data?.follower_id || data?.viewer_id;
    if (senderId) {
      await storeNavigationIntent({ type: 'profile', user_id: senderId });
      log('[BackgroundNotifications] Stored profile navigation intent:', senderId);
    }
  } else if (data?.type === 'event_join') {
    // Store navigation intent for event
    const eventId = data?.event_id;
    if (eventId) {
      await storeNavigationIntent({ type: 'event', event_id: eventId });
      log('[BackgroundNotifications] Stored event navigation intent:', eventId);
    }
  } else if (data?.type === 'discover_like') {
    // Navigate to Discover to see who liked you
    await storeNavigationIntent({ type: 'discover', screen: 'nearby' });
    log('[BackgroundNotifications] Stored discover navigation intent');
  }
};

// Store navigation intent for when app becomes active
const storeNavigationIntent = async (data: any) => {
  try {
    // Store in AsyncStorage or similar for later use
    // This will be read when the app becomes active
    log('Storing navigation intent:', data);
  } catch (error) {
    log('Error storing navigation intent:', error);
  }
};

// Store call intent for when app becomes active
const storeCallIntent = async (data: any) => {
  try {
    // Store call intent for when app opens
    log('Storing call intent:', data);
  } catch (error) {
    log('Error storing call intent:', error);
  }
};

// Configure notification channels for Android
export const configureNotificationChannels = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      description: 'Chat message notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#19444d',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      description: 'Incoming call notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 500, 200, 500, 200, 500], // Ring pattern
      lightColor: '#FF4444', // Red for calls
      sound: 'ringtone', // Use device ringtone for calls
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      description: 'Default notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#19444d',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  }
};

// Send a test notification (for debugging)
export const sendTestNotification = async () => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Test Notification',
      body: 'This is a test notification',
      data: { type: 'test' },
      sound: 'default',
    },
    trigger: { seconds: 1 },
  });
};
