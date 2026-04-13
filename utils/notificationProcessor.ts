import { supabase } from './supabase';
import { sendPushNotification } from './pushNotificationService';
import { log, warn, error } from './productionLogger';


interface QueuedNotification {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  sender_name: string;
  message_content?: string;
  notification_type: 'message' | 'call' | 'like' | 'comment' | 'follow' | 'announcement';
  expo_push_token?: string | null;
  status: 'pending' | 'sent' | 'failed';
  attempts?: number;
  created_at: string;
}

// Process pending notifications from the queue
export const processNotificationQueue = async (): Promise<number> => {
  try {
    log('Processing notification queue...');
    
    // Get pending notifications
    const { data: pendingNotifications, error } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('status', 'pending')
      .or('attempts.is.null,attempts.lte.3') // Only process notifications with less than 3 attempts or no attempts
      .order('created_at', { ascending: true })
      .limit(10); // Process 10 at a time
    
    if (error) {
      error('Error fetching pending notifications:', error);
      return 0;
    }
    
    if (!pendingNotifications || pendingNotifications.length === 0) {
      log('No pending notifications to process');
      return 0;
    }
    
    log(`Processing ${pendingNotifications.length} pending notifications`);
    
    let processedCount = 0;
    
    for (const notification of pendingNotifications) {
      try {
        const success = await processNotification(notification);
        if (success) {
          processedCount++;
        }
      } catch (error) {
        error('Error processing notification:', notification.id, error);
        await markNotificationAsFailed(notification.id, error as Error);
      }
    }
    
    log(`Successfully processed ${processedCount}/${pendingNotifications.length} notifications`);
    return processedCount;
    
  } catch (error) {
    error('Error in processNotificationQueue:', error);
    return 0;
  }
};

// Process a single notification
const processNotification = async (notification: QueuedNotification): Promise<boolean> => {
  try {
    log(`Processing notification ${notification.id} for user ${notification.recipient_id}`);
    
    // Prepare notification data
    const notificationData = {
      title: getNotificationTitle(notification),
      body: getNotificationBody(notification),
      data: getNotificationData(notification),
      sound: 'default',
      badge: 1,
    };
    
    // Send push notification
    const success = await sendPushNotification(notification.recipient_id, notificationData);
    
    if (success) {
      // Mark as sent
      await markNotificationAsSent(notification.id);
      log(`Notification ${notification.id} sent successfully`);
      return true;
    } else {
      // Mark as failed
      await markNotificationAsFailed(notification.id, new Error('Failed to send push notification'));
      return false;
    }
    
  } catch (error) {
    error(`Error processing notification ${notification.id}:`, error);
    await markNotificationAsFailed(notification.id, error as Error);
    return false;
  }
};

// Get notification title based on type
const getNotificationTitle = (notification: QueuedNotification): string => {
  switch (notification.notification_type) {
    case 'message':
      return `New message from ${notification.sender_name}`;
    case 'call':
      return `Incoming call from ${notification.sender_name}`;
    case 'like':
      return `${notification.sender_name} liked your post`;
    case 'comment':
      return `${notification.sender_name} commented on your post`;
    case 'follow':
      return `${notification.sender_name} started following you`;
    case 'announcement':
      return notification.sender_name || 'New announcement';
    default:
      return `Notification from ${notification.sender_name || 'System'}`;
  }
};

// Get notification body based on type
const getNotificationBody = (notification: QueuedNotification): string => {
  switch (notification.notification_type) {
    case 'message':
      return notification.message_content || 'New message received';
    case 'call':
      return notification.message_content || 'Open the app for activity updates';
    case 'like':
      return 'Tap to view';
    case 'comment':
      return notification.message_content || 'commented on your post';
    case 'follow':
      return 'Tap to view their profile';
    case 'announcement':
      return notification.message_content || 'You have a new announcement';
    default:
      return 'New notification received';
  }
};

// Get notification data for navigation
const getNotificationData = (notification: QueuedNotification): any => {
  switch (notification.notification_type) {
    case 'message':
      return {
        type: 'message',
        sender_id: notification.sender_id,
        sender_name: notification.sender_name,
        message_content: notification.message_content,
      };
    case 'call':
      return {
        type: 'general',
        sender_id: notification.sender_id,
        sender_name: notification.sender_name,
        message_content: notification.message_content,
      };
    default:
      return {
        type: notification.notification_type,
        sender_id: notification.sender_id,
        sender_name: notification.sender_name,
      };
  }
};

// Mark notification as sent
const markNotificationAsSent = async (notificationId: string): Promise<void> => {
  const { error } = await supabase
    .from('notification_queue')
    .update({
      status: 'sent',
      processed_at: new Date().toISOString(),
    })
    .eq('id', notificationId);
  
  if (error) {
    error('Error marking notification as sent:', error);
  }
};

// Mark notification as failed
const markNotificationAsFailed = async (notificationId: string, error: Error): Promise<void> => {
  try {
    // First, get the current attempts count
    const { data: currentNotification } = await supabase
      .from('notification_queue')
      .select('attempts')
      .eq('id', notificationId)
      .single();
    
    const currentAttempts = currentNotification?.attempts || 0;
    
    // Update with incremented attempts
    const { error: updateError } = await supabase
      .from('notification_queue')
      .update({
        status: 'failed',
        attempts: currentAttempts + 1,
        error_message: error.message,
        processed_at: new Date().toISOString(),
      })
      .eq('id', notificationId);
    
    if (updateError) {
      error('Error marking notification as failed:', updateError);
    }
  } catch (err) {
    error('Error in markNotificationAsFailed:', err);
  }
};

// Start the notification processor (call this periodically)
export const startNotificationProcessor = (): NodeJS.Timeout => {
  // Process notifications every 30 seconds
  return setInterval(processNotificationQueue, 30000);
};

// Stop the notification processor
export const stopNotificationProcessor = (intervalId: NodeJS.Timeout): void => {
  clearInterval(intervalId);
};
