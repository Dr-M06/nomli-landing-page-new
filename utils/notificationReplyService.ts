/**
 * Notification Reply Service
 * 
 * Enables users to reply to messages directly from push notifications
 * without opening the app (iOS) or with quick reply (Android)
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { sendMessage } from './chat';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Setup iOS notification categories with reply actions
 * iOS supports inline text input for replies
 */
export async function setupIOSNotificationCategories(): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }

  try {
    // Chat message category with text input reply
    // IMPORTANT: This MUST include textInput for inline replies to work
    const categoryResult = await Notifications.setNotificationCategoryAsync('chat_message', [
      {
        identifier: 'reply',
        buttonTitle: 'Reply',
        textInput: {
          submitButtonTitle: 'Send',
          placeholder: 'Type a message...',
        },
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
          opensAppToForeground: false, // Don't open app for quick reply
        },
      },
      {
        identifier: 'mark_read',
        buttonTitle: 'Mark Read',
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
          opensAppToForeground: false,
        },
      },
    ], {
      intentIdentifiers: [],
      hiddenPreviewsBodyPlaceholder: 'New message',
      categorySummaryFormat: '%u new messages',
      customDismissAction: true,
      allowInCarPlay: true,
      allowAnnouncement: true,
      showTitle: true,
      showSubtitle: true,
      showBody: true,
    });

    log('✅ [NotificationReply] iOS notification categories set up:', {
      categoryIdentifier: 'chat_message',
      hasReplyAction: true,
      hasTextInput: true,
      result: categoryResult,
    });
    
    // Verify it was set up correctly
    const categories = await Notifications.getNotificationCategoriesAsync();
    const chatCategory = categories.find(cat => cat.identifier === 'chat_message');
    if (chatCategory) {
      const replyAction = chatCategory.actions.find(a => a.identifier === 'reply');
      log('✅ [NotificationReply] Category verified:', {
        identifier: chatCategory.identifier,
        replyActionHasTextInput: !!(replyAction as any).textInput,
        replyButtonTitle: replyAction?.buttonTitle,
      });
    } else {
      error('❌ [NotificationReply] Category not found after setup!');
    }
  } catch (error) {
    error('[NotificationReply] Error setting up iOS categories:', error);
    throw error;
  }
}

/**
 * Setup Android notification actions
 * Android uses notification actions (no inline text input)
 */
export async function setupAndroidNotificationActions(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  // Android notification actions are typically handled via notification channels
  // and the notification data itself. The reply functionality is handled
  // through the notification response listener.
  log('✅ [NotificationReply] Android notification actions ready');
}

/**
 * Handle notification reply response
 * Called when user replies from notification
 */
export async function handleNotificationReply(
  response: Notifications.NotificationResponse
): Promise<void> {
  try {
    const { notification, actionIdentifier } = response;
    const data = notification.request.content.data || {};
    
    // Get userText - it might be on response.userText or (response as any).userText
    const userText = (response as any).userText || (response as any).response?.userText;

    log('[NotificationReply] Reply received:', {
      actionIdentifier,
      userText,
      chatId: data.chatId,
      senderId: data.senderId,
      type: data.type,
      fullData: data,
      responseKeys: Object.keys(response),
      notificationCategory: notification.request.content.categoryIdentifier,
    });

    // Handle reply actions
    // actionIdentifier can be 'reply', 'UNKNOWN', 'DEFAULT', or empty string
    // We check if userText exists (which indicates a reply) OR if actionIdentifier is explicitly 'reply'
    const isReply = actionIdentifier === 'reply' || 
                   (userText && (data.type === 'message' || data.type === 'chat'));
    
    if (!isReply) {
      log('[NotificationReply] Not a reply action, ignoring. actionIdentifier:', actionIdentifier);
      return;
    }

    // Get user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      error('[NotificationReply] No user authenticated');
      return;
    }

    // Get sender ID from notification data (the person who sent the original message)
    // For 1-on-1 chats, chatId is the sender's ID
    const chatId = data.chatId || data.chat_id;
    const originalSenderId = data.senderId || data.sender_id || chatId;

    if (!originalSenderId) {
      error('[NotificationReply] Missing senderId in notification data');
      return;
    }

    // Get reply text
    let replyText = userText?.trim();
    
    // For Android, if no text input, we need to open the app
    // For iOS, text input should be available
    if (!replyText && Platform.OS === 'android') {
      log('[NotificationReply] Android quick reply - opening app for text input');
      // On Android, we can't get text input without opening the app
      // The notification tap will open the chat screen
      return;
    }

    if (!replyText) {
      error('[NotificationReply] No reply text provided');
      return;
    }

    // Send the message
    // user.id is the current user (replying), originalSenderId is the recipient
    log(`[NotificationReply] Sending reply: "${replyText}" to user ${originalSenderId}`);
    const sentMessage = await sendMessage(user.id, originalSenderId, replyText);

    if (sentMessage) {
      log('✅ [NotificationReply] Reply sent successfully:', sentMessage.id);
      
      // Show a confirmation notification (optional)
      if (Platform.OS === 'ios') {
        // iOS shows the reply automatically in the notification
        // We can optionally show a confirmation
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Message sent',
            body: replyText.length > 30 ? `${replyText.substring(0, 30)}...` : replyText,
            sound: false,
            data: { type: 'reply_sent', chatId },
          },
          trigger: null, // Show immediately
        });
      }
    } else {
      error('[NotificationReply] Failed to send reply');
      
      // Show error notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Failed to send',
          body: 'Could not send your reply. Please try again.',
          sound: false,
          data: { type: 'reply_failed', chatId },
        },
        trigger: null,
      });
    }
  } catch (error) {
    error('[NotificationReply] Error handling reply:', error);
    
    // Show error notification
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Error',
          body: 'Failed to send reply. Please open the app to try again.',
          sound: false,
        },
        trigger: null,
      });
    } catch (notifError) {
      error('[NotificationReply] Error showing error notification:', notifError);
    }
  }
}

/**
 * Verify notification categories are set up correctly
 */
export async function verifyNotificationCategories(): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      const categories = await Notifications.getNotificationCategoriesAsync();
      const chatCategory = categories.find(cat => cat.identifier === 'chat_message');
      
      if (chatCategory) {
        log('✅ [NotificationReply] Category verified:', {
          identifier: chatCategory.identifier,
          actions: chatCategory.actions.map(a => ({
            identifier: a.identifier,
            buttonTitle: a.buttonTitle,
            hasTextInput: !!(a as any).textInput,
          })),
        });
      } else {
        warn('⚠️ [NotificationReply] chat_message category not found. Available categories:', 
          categories.map(c => c.identifier));
      }
    } catch (error) {
      error('[NotificationReply] Error verifying categories:', error);
    }
  }
}

/**
 * Setup notification reply handler
 * Call this on app initialization
 * IMPORTANT: This must be called early, before any notifications are sent
 */
export async function setupNotificationReplyHandler(): Promise<void> {
  // The handler is set up in ExpoNotificationManager component
  // This function sets up the notification categories
  
  log('✅ [NotificationReply] Setting up reply handler...');
  
  // Setup platform-specific notification categories
  // Use await to ensure categories are set up before notifications are sent
  if (Platform.OS === 'ios') {
    try {
      await setupIOSNotificationCategories();
      log('✅ [NotificationReply] iOS categories set up successfully');
    } catch (error) {
      error('[NotificationReply] Failed to setup iOS categories:', error);
      throw error;
    }
  } else {
    try {
      await setupAndroidNotificationActions();
      log('✅ [NotificationReply] Android actions set up successfully');
    } catch (error) {
      warn('[NotificationReply] Failed to setup Android actions:', error);
    }
  }
  
  log('✅ [NotificationReply] Reply handler ready');
  
  // Verify categories were set up correctly
  await verifyNotificationCategories();
}
