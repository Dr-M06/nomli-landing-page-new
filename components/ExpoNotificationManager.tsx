import React, { useEffect, useRef } from 'react';
import useAuth from '../hooks/useAuth';
import { customNotifications } from '../utils/customNotifications';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { printDiagnostics } from '../utils/diagnosePushNotifications';
import { log, warn, error } from '../utils/productionLogger';


export default function ExpoNotificationManager() {
  const { user } = useAuth();
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Initialize push notifications when component mounts (don't wait for user)
    const initializeNotifications = async () => {
      try {
        log('[ExpoNotificationManager] 🚀 Starting initialization...');
        log('[ExpoNotificationManager] User ID:', user?.id || 'not set yet (will save token when user is available)');
        
        // Set up notification channels for Android
        await customNotifications.setupNotificationChannels();
        log('[ExpoNotificationManager] ✅ Notification channels set up');
        
        // Initialize the push notification service (even without user - token can be saved later)
        log('[ExpoNotificationManager] 📱 Calling customNotifications.initialize()...');
        const success = await customNotifications.initialize();
        log('[ExpoNotificationManager] Initialize result:', success);
        
        if (success) {
          const token = customNotifications.getPushToken();
          log('[ExpoNotificationManager] ✅ Initialization successful');
          log('[ExpoNotificationManager] 🔑 Push token obtained:', token ? `${token.substring(0, 30)}...` : 'NULL');
          
          if (!token) {
            // Check if we're on a simulator/emulator
            if (!Device.isDevice) {
              log('[ExpoNotificationManager] ℹ️ Running on emulator - push notifications unavailable');
              log('[ExpoNotificationManager] ℹ️ Push tokens require a real physical device');
              log('[ExpoNotificationManager] ℹ️ This is normal and expected behavior');
              return;
            }
            
            // On real device but no token - this is a real error
            error('[ExpoNotificationManager] ❌ CRITICAL: Token is NULL on real device!');
            error('[ExpoNotificationManager] This means token generation failed');
            error('[ExpoNotificationManager] Check:');
            error('[ExpoNotificationManager] 1. Notification permissions are granted');
            error('[ExpoNotificationManager] 2. Expo project ID is correct');
            error('[ExpoNotificationManager] 3. Device has internet connection');
            return;
          }
          
          // Save token if user is available, otherwise it will be saved when user becomes available
          if (user?.id) {
            log('[ExpoNotificationManager] 👤 User ID available, saving token immediately...');
            const saveResult = await customNotifications.saveTokenToProfile(user.id);
            log('[ExpoNotificationManager] 💾 Push token save result:', saveResult);
            
            if (saveResult) {
              log('[ExpoNotificationManager] ✅ Push token saved successfully to database');
              
              // Verify token was actually saved
              setTimeout(async () => {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('expo_push_token')
                  .eq('id', user.id)
                  .single();
                
                if (profile?.expo_push_token) {
                  log('[ExpoNotificationManager] ✅ Verified: Token exists in database');
                } else {
                  error('[ExpoNotificationManager] ❌ WARNING: Token not found in database after save!');
                }
              }, 2000);
            } else {
              error('[ExpoNotificationManager] ❌ Failed to save push token to database');
            }
          } else {
            log('[ExpoNotificationManager] ⏳ User ID not available yet - token obtained and will be saved when user logs in');
            log('[ExpoNotificationManager] 🔑 Token ready:', token ? `${token.substring(0, 30)}...` : 'NULL');
          }
        } else {
          // Check if it's because we're on an emulator
          if (!Device.isDevice) {
            log('[ExpoNotificationManager] ℹ️ Initialization skipped: Running on emulator');
            log('[ExpoNotificationManager] ℹ️ Push notifications require a real physical device');
          } else {
            error('[ExpoNotificationManager] ❌ Initialization failed - push notifications may not work');
            error('[ExpoNotificationManager] Check device logs for permission or token errors');
          }
        }
      } catch (error) {
        error('[ExpoNotificationManager] ❌ Error initializing notifications:', error);
        error('[ExpoNotificationManager] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      }
    };

    log('[ExpoNotificationManager] 📲 Component mounted, starting initialization');
    initializeNotifications();
    
    // Run diagnostics after initialization (helpful for debugging)
    setTimeout(() => {
      log('[ExpoNotificationManager] 🔍 Running push notification diagnostics...');
      if (user?.id) {
        log('[ExpoNotificationManager] 👤 User ID available:', user.id);
        printDiagnostics(user.id).catch(err => {
          error('[ExpoNotificationManager] ❌ Diagnostic error:', err);
        });
      } else {
        warn('[ExpoNotificationManager] ⚠️ User ID not available yet, skipping diagnostics');
      }
    }, 5000); // Wait 5 seconds for initialization to complete

    // Set up notification listeners
    // These listeners are for app-side handling (e.g., navigation, badge updates)
    // The actual notification display is handled by the system via setNotificationHandler
    notificationListener.current = customNotifications.addNotificationReceivedListener(notification => {
      const data = notification.request?.content?.data || {};
      
      log('[ExpoNotificationManager] 🔔 Notification received in app:', {
        title: notification.request?.content?.title,
        body: notification.request?.content?.body,
        dataType: data?.type,
        notificationId: notification.request?.identifier,
      });
      
      // Handle badge updates, navigation, etc. here
      // The notification is already displayed by the system handler
    });

    responseListener.current = customNotifications.addNotificationResponseReceivedListener(async response => {
      log('[ExpoNotificationManager] Notification response received:', {
        actionIdentifier: response.actionIdentifier,
        hasUserText: !!(response as any).userText,
        notificationId: response.notification.request.identifier,
        data: response.notification.request.content.data,
      });
      
      // Handle notification reply actions (iOS inline reply)
      const actionIdentifier = response.actionIdentifier;
      const userText = (response as any).userText; // Text input from iOS notification
      const data = response.notification.request.content.data || {};
      
      // Check if this is a reply action
      // actionIdentifier can be 'reply', 'UNKNOWN' (when tapping notification), or 'DEFAULT'
      // We need to check if userText exists (which means it's a reply) OR if actionIdentifier is 'reply'
      const isReplyAction = actionIdentifier === 'reply' || (userText && (data.type === 'message' || data.type === 'chat'));
      
      if (isReplyAction && userText) {
        log('[ExpoNotificationManager] Detected reply action, handling reply...');
        try {
          const { handleNotificationReply } = await import('../utils/notificationReplyService');
          await handleNotificationReply(response);
          return; // Don't navigate if reply was handled
        } catch (error) {
          error('[ExpoNotificationManager] Error handling reply:', error);
          // Fall through to navigation if reply handling fails
        }
      } else if (actionIdentifier === 'reply' && !userText) {
        log('[ExpoNotificationManager] Reply action detected but no userText - might be Android or notification tap');
      }
      
      // Handle notification tap - you can add navigation logic here
      // Note: data is already declared above, so we reuse it
      
      if (data?.type === 'chat' || data?.type === 'message') {
        // Navigate to chat
        const chatId = data.chatId || data.chat_id;
        log('[ExpoNotificationManager] Navigating to chat:', chatId);
        try {
          if (chatId) router.push(`/chat/${chatId}` as any);
        } catch (e) {
          warn('Navigation error (chat):', e);
        }
      } else if (data?.type === 'call') {
        // Calls are deprecated - ignore call notification taps.
        log('[ExpoNotificationManager] Ignoring deprecated call notification:', data);
      } else if (data?.type === 'like' || data?.type === 'comment') {
        // Navigate to post detail screen
        const postId = data?.post_id;
        log('[ExpoNotificationManager] Navigating to post:', postId, 'from notification type:', data?.type);
        try {
          if (postId && typeof postId === 'string' && postId.trim().length > 0) {
            // Navigate directly to post detail screen for better reliability
            router.push(`/community/post/${postId}` as any);
          } else {
            warn('[ExpoNotificationManager] Invalid or missing post_id in notification data:', {
              postId,
              type: typeof postId,
              dataType: data?.type,
              fullData: data,
            });
          }
        } catch (e) {
          error('[ExpoNotificationManager] Navigation error (post):', e);
        }
      } else if (data?.type === 'new_post') {
        // Navigate to post detail screen
        const postId = data?.post_id;
        log('[ExpoNotificationManager] Navigating to post:', postId, 'from new_post notification');
        try {
          if (postId && typeof postId === 'string' && postId.trim().length > 0) {
            router.push(`/community/post/${postId}` as any);
          } else {
            warn('[ExpoNotificationManager] Invalid or missing post_id in notification data:', {
              postId,
              type: typeof postId,
              dataType: data?.type,
              fullData: data,
            });
          }
        } catch (e) {
          error('[ExpoNotificationManager] Navigation error (post):', e);
        }
      } else if (data?.type === 'discover_like') {
        // Nearby was removed; send users to home feed
        log('[ExpoNotificationManager] Navigating to Home from discover_like notification');
        try {
          router.push('/(tabs)/community' as any);
        } catch (e) {
          warn('Navigation error (discover):', e);
        }
      } else if (data?.type === 'follow' || data?.type === 'friend_request_accepted') {
        // Navigate to user profile
        const senderId = data?.sender_id || data?.follower_id;
        log('[ExpoNotificationManager] Navigating to profile:', senderId);
        try {
          if (senderId) {
            router.push(`/profile/${senderId}` as any);
          } else {
            warn('[ExpoNotificationManager] No sender_id or follower_id in notification data:', data);
          }
        } catch (e) {
          warn('Navigation error (profile):', e);
        }
      } else if (data?.type === 'event_join') {
        // Navigate to event
        const eventId = data?.event_id;
        log('[ExpoNotificationManager] Navigating to event:', eventId);
        try {
          if (eventId) {
            router.push(`/events/${eventId}` as any);
          } else {
            warn('[ExpoNotificationManager] No event_id in notification data:', data);
          }
        } catch (e) {
          warn('Navigation error (event):', e);
        }
      }
    });

    // Cleanup function
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []); // Initialize immediately on mount, don't wait for user

  // Update push token when user changes
  useEffect(() => {
    if (user?.id) {
      log('[ExpoNotificationManager] 👤 User ID changed, saving token for:', user.id);
      const token = customNotifications.getPushToken();
      log('[ExpoNotificationManager] 🔑 Current token:', token ? `${token.substring(0, 30)}...` : 'NULL');
      
      if (token) {
        customNotifications.saveTokenToProfile(user.id).then(result => {
          if (result) {
            log('[ExpoNotificationManager] ✅ Token saved successfully for user change');
          } else {
            error('[ExpoNotificationManager] ❌ Failed to save token for user change');
          }
        }).catch(error => {
          error('[ExpoNotificationManager] ❌ Error saving token for user change:', error);
        });
      } else {
        warn('[ExpoNotificationManager] ⚠️ No push token available to save - reinitializing...');
        // Try to reinitialize if no token
        customNotifications.initialize().then(success => {
          if (success && customNotifications.getPushToken()) {
            customNotifications.saveTokenToProfile(user.id).then(result => {
              log('[ExpoNotificationManager] Token save result after reinit:', result);
            });
          }
        });
      }
    }
  }, [user?.id]);

  // This component doesn't render anything
  return null;
}
