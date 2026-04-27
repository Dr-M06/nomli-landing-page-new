import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, StatusBar, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import useAuth from '../hooks/useAuth';
import { formatTimeAgo } from '../utils/formatters';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow } from '../constants/Theme';
import { Bell, MessageCircle, Megaphone, Settings, UserPlus, Check, XCircle, Coins, Eye, Heart } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { customNotifications } from '../utils/customNotifications';
import Header from '../components/Header';
import SimpleAvatar from '../components/SimpleAvatar';
import { getPendingRequests, acceptFriendRequest, rejectFriendRequest } from '../utils/friendRequestService';
import { getProEntitlement } from '../utils/proEntitlement';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from '../utils/productionLogger';


interface Notification {
  id: string;
  type: 'announcement' | 'like' | 'comment' | 'follow' | 'friend_request' | 'friend_request_accepted' | 'credit' | 'credit_sent' | 'gift_sent' | 'gift_received' | 'new_post' | 'profile_view' | 'discover_like';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  data?: any;
  requestId?: string; // For friend requests
  requesterId?: string; // For friend requests
}


// Cache keys for AsyncStorage
const NOTIFICATIONS_CACHE_KEY = 'notifications_cache';
const NOTIFICATIONS_CACHE_TIMESTAMP_KEY = 'notifications_cache_timestamp';
const NOTIFICATIONS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes - longer cache for faster loading

/**
 * Load notifications from persistent cache
 */
const loadCachedNotifications = async (): Promise<Notification[] | null> => {
  try {
    const cachedData = await AsyncStorage.getItem(NOTIFICATIONS_CACHE_KEY);
    const timestampStr = await AsyncStorage.getItem(NOTIFICATIONS_CACHE_TIMESTAMP_KEY);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      // Check if cache is still valid (within 5 minutes)
      if (now - timestamp < NOTIFICATIONS_CACHE_DURATION) {
        log(`[NotificationsScreen] Loading notifications from persistent cache (age: ${Math.round((now - timestamp) / 1000)}s)`);
        return JSON.parse(cachedData);
      } else {
        log('[NotificationsScreen] Notifications cache expired, clearing...');
        await AsyncStorage.multiRemove([NOTIFICATIONS_CACHE_KEY, NOTIFICATIONS_CACHE_TIMESTAMP_KEY]);
      }
    }
  } catch (error) {
    error('[NotificationsScreen] Error loading cached notifications:', error);
  }
  return null;
};

/**
 * Save notifications to persistent cache
 */
const saveCachedNotifications = async (notifications: Notification[]): Promise<void> => {
  try {
    const now = Date.now();
    
    await AsyncStorage.multiSet([
      [NOTIFICATIONS_CACHE_KEY, JSON.stringify(notifications)],
      [NOTIFICATIONS_CACHE_TIMESTAMP_KEY, now.toString()]
    ]);
    
    log(`[NotificationsScreen] ✅ Saved ${notifications.length} notifications to persistent cache`);
  } catch (error: any) {
    error('[NotificationsScreen] Error saving cached notifications:', error);
    if (error?.message?.includes('quota') || error?.message?.includes('storage')) {
      warn('[NotificationsScreen] Storage quota exceeded, skipping notifications cache save...');
    }
  }
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // 🚀 AGGRESSIVE CACHING: Load cache immediately on mount for instant display
  const initialCachedNotificationsRef = useRef<Notification[] | null>(null);
  const hasCheckedInitialCacheRef = useRef(false);
  const cacheLoadPromiseRef = useRef<Promise<Notification[] | null> | null>(null);
  
  // Load persistent cache immediately (async, but triggered early)
  if (!hasCheckedInitialCacheRef.current) {
    hasCheckedInitialCacheRef.current = true;
    cacheLoadPromiseRef.current = loadCachedNotifications();
  }
  
  // Initialize with empty array, cache will load and update state in useEffect
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Start with loading true, will be set to false when cache loads or data fetches
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [canViewProfileViewers, setCanViewProfileViewers] = useState(false);

  const refreshProfileViewEntitlement = useCallback(async () => {
    if (!user?.id) {
      setCanViewProfileViewers(false);
      return;
    }
    try {
      const ent = await getProEntitlement(user.id);
      setCanViewProfileViewers(ent.anyActive);
    } catch {
      setCanViewProfileViewers(false);
    }
  }, [user?.id]);
  
  const requestPermissions = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      
      if (status === 'granted') {
        await customNotifications.initialize();
        if (user) {
          await customNotifications.saveTokenToProfile(user.id);
        }
        Toast.show({
          type: 'success',
          text1: 'Permissions Granted',
          text2: 'Push notifications are now enabled'
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Permissions Denied',
          text2: 'Push notifications will not work without permissions'
        });
      }
    } catch (error) {
      error('Permission request error:', error);
      Alert.alert('Error', 'Failed to request notification permissions');
    }
  };

  const fetchNotifications = async (useCache = true) => {
    if (!user) return;

    try {
      // 🚀 AGGRESSIVE CACHING: Load cached notifications first for instant display
      if (useCache) {
        // Wait for initial cache load if it's still in progress
        if (cacheLoadPromiseRef.current) {
          await cacheLoadPromiseRef.current;
        }
        
        // If we already have cached data from initial load, use it
        if (initialCachedNotificationsRef.current && initialCachedNotificationsRef.current.length > 0) {
          const cachedNotifications = initialCachedNotificationsRef.current;
          log(`[NotificationsScreen] 🚀 Using ${cachedNotifications.length} cached notifications - showing instantly`);
          setNotifications(cachedNotifications);
          setLoading(false); // Show cached data immediately
          // Continue to fetch fresh data in background (below)
        } else {
          // Try loading cache again (in case initial load failed)
        const cachedNotifications = await loadCachedNotifications();
        if (cachedNotifications && cachedNotifications.length > 0) {
          log(`[NotificationsScreen] 🚀 Using ${cachedNotifications.length} cached notifications - showing instantly`);
          setNotifications(cachedNotifications);
          setLoading(false); // Show cached data immediately
            // Continue to fetch fresh data in background (below)
        } else {
          setLoading(true);
          }
        }
      } else {
        setLoading(true);
      }

      const allNotifications: Notification[] = [];

      // ============ PARALLEL FETCH: Run independent queries simultaneously ============
      // This significantly improves load time by fetching data in parallel
      const [
        dismissedResult,
        readSocialResult,
        readAnnouncementsResult,
        socialNotificationsResult,
        friendRequestsResult,
        announcementsResult
      ] = await Promise.all([
        // 1. Dismissed notifications
        supabase
          .from('notification_dismissals')
          .select('notification_type, notification_id')
          .eq('user_id', user.id),
        
        // 2. Read social notifications
        supabase
          .from('notification_reads')
          .select('notification_queue_id')
          .eq('user_id', user.id)
          .then(result => result)
          .catch(() => ({ data: null, error: null })), // Graceful fallback if table doesn't exist
        
        // 3. Read announcements
        supabase
          .from('announcement_reads')
          .select('announcement_id')
          .eq('user_id', user.id)
          .then(result => result)
          .catch(() => ({ data: null, error: null })),
        
        // 4. Social notifications (limit reduced for performance)
        supabase
          .from('notification_queue')
          .select(`
            id,
            notification_type,
            sender_name,
            message_content,
            created_at,
            metadata,
            sender_id,
            status
          `)
          .eq('recipient_id', user.id)
          .in('notification_type', ['like', 'comment', 'follow', 'friend_request_accepted', 'credit', 'profile_view', 'new_post', 'discover_like'])
          .order('created_at', { ascending: false })
          .limit(30), // Reduced from 50 for faster load
        
        // 5. Friend requests
        getPendingRequests().catch(() => []),
        
        // 6. Announcements (limit reduced)
        supabase
          .from('announcements')
          .select(`
            id,
            title,
            content,
            created_at,
            start_date,
            end_date,
            is_active,
            target_audience,
            priority,
            announcement_type
          `)
          .order('created_at', { ascending: false })
          .limit(20) // Reduced from 50
      ]);

      // Process parallel results
      const dismissedSet = new Set(
        dismissedResult.data?.map(d => `${d.notification_type}_${d.notification_id}`) || []
      );

      const readSocialNotificationIds = new Set<string>(
        readSocialResult.data?.map((r: any) => r.notification_queue_id) || []
      );

      const readAnnouncementIds = new Set<string>(
        readAnnouncementsResult.data?.map((r: any) => r.announcement_id) || []
      );

      const socialNotifications = socialNotificationsResult.data;
      const socialNotifError = socialNotificationsResult.error;
      const friendRequests = friendRequestsResult || [];
      const allAnnouncements = announcementsResult.data;
      const announcementsError = announcementsResult.error;
      // ============ END PARALLEL FETCH ============

      if (socialNotifError) {
        error('Error fetching social notifications:', socialNotifError);
      }

      if (socialNotifications && socialNotifications.length > 0) {
        // Fetch sender profiles for all social notifications
        const senderIds = [...new Set(socialNotifications.map(n => n.sender_id).filter(Boolean))];
        
        let senderProfiles: any = {};
        if (senderIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', senderIds);
          
          if (profiles) {
            profiles.forEach(profile => {
              senderProfiles[profile.id] = profile;
            });
          }
        }

        // Social notifications (likes, comments, follows) should always be shown
        // They are only hidden if explicitly dismissed by the user
        socialNotifications.forEach(notif => {
          const notificationKey = `${notif.notification_type}_${notif.id}`;
          // Only filter out if explicitly dismissed - don't hide just because it was opened
          if (!dismissedSet.has(notificationKey)) {
            const sender = notif.sender_id ? senderProfiles[notif.sender_id] : null;
            const isRead = readSocialNotificationIds.has(notif.id);
            
            let title = '';
            let message = notif.message_content || '';

            switch (notif.notification_type) {
              case 'like':
                title = `${notif.sender_name || sender?.full_name || sender?.username || 'Someone'} liked your post`;
                message = 'Tap to view';
                break;
              case 'comment':
                title = `${notif.sender_name || sender?.full_name || sender?.username || 'Someone'} commented on your post`;
                message = notif.message_content || 'commented on your post';
                break;
              case 'follow':
                title = `${notif.sender_name || sender?.full_name || sender?.username || 'Someone'} started following you`;
                message = 'Tap to view their profile';
                break;
              case 'new_post':
                title = `${notif.sender_name || sender?.full_name || sender?.username || 'Someone'} shared a new post`;
                message = notif.message_content || 'Check out their new post';
                break;
              case 'profile_view':
                title = 'Someone viewed your profile';
                message = 'Tap to view their profile';
                break;
              case 'discover_like':
                title = 'Someone liked your profile';
                message = 'Tap to see who in Discover';
                break;
              case 'credit':
                const creditAmount = notif.metadata?.amount || 10;
                const creditSenderName = notif.sender_name || 
                                        notif.metadata?.credited_by_name || 
                                        sender?.full_name || 
                                        sender?.username || 
                                        'Someone';
                title = `${creditSenderName} credited you ${creditAmount} tokens!`;
                message = notif.message_content || `${creditSenderName} credited you ${creditAmount} tokens`;
                break;
              case 'friend_request_accepted':
                const accepterName = notif.sender_name || sender?.full_name || sender?.username || 'Someone';
                title = `${accepterName} accepted your friend request`;
                message = 'You can now message them';
                break;
            }

            allNotifications.push({
              id: `${notif.notification_type}_${notif.id}`,
              type: notif.notification_type as 'like' | 'comment' | 'follow' | 'friend_request_accepted' | 'credit' | 'new_post' | 'profile_view' | 'discover_like',
              title,
              message,
              timestamp: notif.created_at,
              read: isRead, // Check if notification has been read
              data: {
                ...notif.metadata,
                sender: sender,
                sender_id: notif.sender_id,
                credited_by_id: notif.metadata?.credited_by_id,
                credited_by_name: notif.metadata?.credited_by_name,
                credited_by_avatar: notif.metadata?.credited_by_avatar,
                amount: notif.metadata?.amount
              }
            });
          }
        });
      }

      // Process friend requests (already fetched in parallel)
      friendRequests.forEach((request: any) => {
        if (request.requester) {
          allNotifications.push({
            id: `friend_request_${request.id}`,
            type: 'friend_request',
            title: `${request.requester.full_name || request.requester.username || 'Someone'} sent you a friend request`,
            message: 'Tap to accept or reject',
            timestamp: request.created_at,
            read: false, // Friend requests are always unread until action taken
            requestId: request.id,
            requesterId: request.requester_id,
            data: {
              requester: request.requester,
            }
          });
        }
      });

      // Process announcements (already fetched in parallel)
      if (announcementsError) {
        error('Error fetching announcements:', announcementsError);
      }
      
      // Filter: only show active announcements within date range and matching target_audience
      const now = new Date();
      const userIdStr = user?.id;
      
      const announcements = allAnnouncements?.filter(ann => {
        // Must be active
        if (!ann.is_active) return false;
        
        // Must be within date range
        const endDate = ann.end_date ? new Date(ann.end_date) : null;
        if (endDate && endDate < now) return false;
        
        // Check target_audience
        const targetAudience = ann.target_audience || ['all'];
        if (targetAudience.includes('all')) return true;
        if (userIdStr && targetAudience.includes(userIdStr)) return true;
        
        return false;
      }) || [];

      // Process announcements
      announcements.forEach(announcement => {
        const notificationKey = `announcement_${announcement.id}`;
        const isRead = readAnnouncementIds.has(announcement.id);
        const isDismissed = dismissedSet.has(notificationKey);
        
        if (!isDismissed) {
          allNotifications.push({
            id: `announcement_${announcement.id}`,
            type: 'announcement',
            title: announcement.title,
            message: announcement.content || '',
            timestamp: announcement.created_at,
            read: isRead,
            data: announcement
          });
        }
      });

      // Fetch credit and gift history (reduced limit for faster load)
      const { getWalletTransactions } = await import('../utils/walletService');
      const allTransactions = await getWalletTransactions(user.id, 30); // Reduced from 100
      
      // Filter transactions in single pass for performance
      const creditHistory: any[] = [];
      const giftHistory: any[] = [];
      allTransactions.forEach(tx => {
        if (tx.transaction_type === 'user_credit_sent' || tx.transaction_type === 'user_credit') {
          creditHistory.push(tx);
        } else if (tx.transaction_type === 'gift_sent' || tx.transaction_type === 'gift_received') {
          giftHistory.push(tx);
        }
      });
      
      // Fetch gift transaction details only if needed
      let giftTransactions: any[] = [];
      if (giftHistory.length > 0) {
        const { data } = await supabase
          .from('gift_transactions')
          .select('id, sender_id, receiver_id, stream_id, gift_name, gift_emoji, created_at')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(20); // Reduced from 50
        giftTransactions = data || [];
      }

      if (creditHistory.length > 0) {
        // Fetch profiles for credit history
        const recipientIds = [...new Set(creditHistory.map(tx => tx.reference_id).filter(Boolean))];
        
        let recipientProfiles: any = {};
        if (recipientIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', recipientIds);
          
          if (profiles) {
            profiles.forEach(profile => {
              recipientProfiles[profile.id] = profile;
            });
          }
        }

        // Add credit history as notifications
        creditHistory.forEach(tx => {
          if (tx.transaction_type === 'user_credit_sent') {
            const recipientId = tx.reference_id;
            const recipient = recipientId ? recipientProfiles[recipientId] : null;
            const recipientName = recipient?.full_name || recipient?.username || 'Someone';
            const amount = Math.abs(tx.amount);
            
            allNotifications.push({
              id: `credit_sent_${tx.id}`,
              type: 'credit_sent',
              title: `You credited ${recipientName}`,
              message: `You sent ${amount.toLocaleString()} tokens`,
              timestamp: tx.created_at,
              read: true,
              data: {
                recipient_id: recipientId,
                recipient_name: recipientName,
                recipient_avatar: recipient?.avatar_url,
                amount: amount,
                transaction_id: tx.id
              }
            });
          } else if (tx.transaction_type === 'user_credit') {
            const senderId = tx.reference_id;
            const sender = senderId ? recipientProfiles[senderId] : null;
            const senderName = sender?.full_name || sender?.username || 'Someone';
            const amount = Math.abs(tx.amount);
            
            allNotifications.push({
              id: `credit_received_${tx.id}`,
              type: 'credit',
              title: `${senderName} credited you ${amount} tokens!`,
              message: `${senderName} credited you ${amount.toLocaleString()} tokens`,
              timestamp: tx.created_at,
              read: true,
              data: {
                credited_by_id: senderId,
                credited_by_name: senderName,
                credited_by_avatar: sender?.avatar_url,
                amount: amount,
                transaction_id: tx.id
              }
            });
          }
        });
      }

      // Process gift history
      const giftTxMap = new Map();
      const giftTxByIdMap = new Map();
      
      if (giftTransactions.length > 0) {
        giftTransactions.forEach(gt => giftTxByIdMap.set(gt.id, gt));
        giftHistory.forEach(wt => {
          if (wt.reference_id && giftTxByIdMap.has(wt.reference_id)) {
            giftTxMap.set(wt.id, giftTxByIdMap.get(wt.reference_id));
          }
        });
      }
      
      if (giftHistory.length > 0) {
        // Collect user IDs from gift transactions
        const giftUserIds = new Set<string>();
        giftTransactions.forEach(gt => {
          if (gt.receiver_id) giftUserIds.add(gt.receiver_id);
          if (gt.sender_id) giftUserIds.add(gt.sender_id);
        });
        giftHistory.forEach(tx => {
          if (tx.reference_id) giftUserIds.add(tx.reference_id);
        });
        
        let giftUserProfiles: any = {};
        if (giftUserIds.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', Array.from(giftUserIds));
          
          if (profiles) {
            profiles.forEach(profile => {
              giftUserProfiles[profile.id] = profile;
            });
          }
        }

        // Add gift history as notifications
        giftHistory.forEach(tx => {
          const giftTx = giftTxMap.get(tx.id);
          
          // Get other user ID from gift transaction
          let otherUserId: string | null = null;
          if (tx.transaction_type === 'gift_sent') {
            otherUserId = giftTx?.receiver_id || null;
          } else if (tx.transaction_type === 'gift_received') {
            otherUserId = giftTx?.sender_id || null;
          }
          
          if (!otherUserId) return; // Skip if no user ID found
          
          const otherUser = giftUserProfiles[otherUserId];
          const otherUserName = otherUser?.full_name || otherUser?.username || 'Someone';
          const amount = Math.abs(tx.amount);
          
          if (tx.transaction_type === 'gift_sent') {
            allNotifications.push({
              id: `gift_sent_${tx.id}`,
              type: 'gift_sent',
              title: `You sent a gift to ${otherUserName}`,
              message: giftTx?.gift_name 
                ? `You sent ${giftTx.gift_emoji || '🎁'} ${giftTx.gift_name} (${amount.toLocaleString()} tokens)`
                : `You sent ${amount.toLocaleString()} tokens as a gift`,
              timestamp: tx.created_at,
              read: true, // Gift history is always read
              data: {
                recipient_id: otherUserId,
                recipient_name: otherUserName,
                recipient_avatar: otherUser?.avatar_url,
                amount: amount,
                transaction_id: tx.id,
                stream_id: giftTx?.stream_id,
                gift_name: giftTx?.gift_name,
                gift_emoji: giftTx?.gift_emoji
              }
            });
          } else if (tx.transaction_type === 'gift_received') {
            allNotifications.push({
              id: `gift_received_${tx.id}`,
              type: 'gift_received',
              title: `You received a gift from ${otherUserName}`,
              message: giftTx?.gift_name
                ? `You received ${giftTx.gift_emoji || '🎁'} ${giftTx.gift_name} (${amount.toLocaleString()} tokens)`
                : `You received ${amount.toLocaleString()} tokens as a gift`,
              timestamp: tx.created_at,
              read: true, // Gift history is always read
              data: {
                sender_id: otherUserId,
                sender_name: otherUserName,
                sender_avatar: otherUser?.avatar_url,
                amount: amount,
                transaction_id: tx.id,
                stream_id: giftTx?.stream_id,
                gift_name: giftTx?.gift_name,
                gift_emoji: giftTx?.gift_emoji
              }
            });
          }
        });
      }

      allNotifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setNotifications(allNotifications);

      // Save to cache in background (non-blocking)
      if (allNotifications.length > 0) {
        saveCachedNotifications(allNotifications).catch(err => {
          error('[NotificationsScreen] Error saving notifications to cache (non-fatal):', err);
        });
      }
    } catch (error) {
      error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Don't clear cache before refresh - keep existing notifications visible
      // Fresh data will update cache when it arrives
      await fetchNotifications(false); // Force refresh (bypasses cache, fetches fresh)
    } catch (error) {
      error('[Notifications] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const unreadNotifications = notifications.filter(n => !n.read);
      
      if (unreadNotifications.length === 0) {
        Toast.show({
          type: 'info',
          text1: 'All Read',
          text2: 'All notifications are already marked as read',
          position: 'bottom',
        });
        return;
      }

      // Mark all as read in local state immediately
      setNotifications(prev =>
        prev.map(n => ({ ...n, read: true }))
      );

      // Mark announcements as read
      const announcementNotifications = unreadNotifications.filter(n => n.type === 'announcement');
      for (const notification of announcementNotifications) {
        if (notification.data?.id) {
          await supabase
            .from('announcement_reads')
            .insert({
              announcement_id: notification.data.id,
              user_id: user.id
            })
            .select();
        }
      }

      // Mark social notifications as read
      const socialNotifications = unreadNotifications.filter(n => 
        ['like', 'comment', 'follow'].includes(n.type)
      );
      
      const readRecords = socialNotifications.map(notification => {
        const queueId = notification.id.split('_').pop();
        if (!queueId) return null;
        return {
          notification_queue_id: queueId,
          user_id: user.id
        };
      }).filter(record => record !== null);

      if (readRecords.length > 0) {
        const { error: insertError } = await supabase
          .from('notification_reads')
          .insert(readRecords)
          .select();

        if (insertError && insertError.code !== '42P01') {
          error('Error marking social notifications as read:', insertError);
        }
      }

      Toast.show({
        type: 'success',
        text1: 'All Marked as Read',
        text2: `${unreadNotifications.length} notification${unreadNotifications.length > 1 ? 's' : ''} marked as read`,
        position: 'bottom',
      });
    } catch (error) {
      error('Error marking all as read:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to mark all notifications as read',
        position: 'bottom',
      });
    }
  };

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode(prev => !prev);
    if (isSelectionMode) {
      setSelectedNotifications(new Set());
    }
  }, [isSelectionMode]);

  const toggleNotificationSelection = useCallback((notificationId: string) => {
    setSelectedNotifications(prev => {
      const newSet = new Set(prev);
      if (newSet.has(notificationId)) {
        newSet.delete(notificationId);
      } else {
        newSet.add(notificationId);
      }
      return newSet;
    });
  }, []);

  const selectAllNotifications = useCallback(() => {
    setSelectedNotifications(new Set(notifications.map(n => n.id)));
  }, [notifications]);

  const deselectAllNotifications = useCallback(() => {
    setSelectedNotifications(new Set());
  }, []);

  const clearSelectedNotifications = async () => {
    if (isDeleting || selectedNotifications.size === 0) return;

    Alert.alert(
      'Clear Selected Notifications',
      `Are you sure you want to clear ${selectedNotifications.size} notification${selectedNotifications.size > 1 ? 's' : ''}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              if (!user) return;

              const selectedNotificationsList = notifications.filter(n => selectedNotifications.has(n.id));
              
              // Map all supported notification types to dismissal records
              // Include all types that are in the Notification interface
              const supportedTypes = [
                'announcement', 'like', 'comment', 'follow',
                'friend_request', 'friend_request_accepted', 'credit', 'credit_sent', 
                'gift_sent', 'gift_received', 'new_post', 'profile_view',
                'message'
              ];
              
              const dismissalRecords = selectedNotificationsList
                .filter(notification => supportedTypes.includes(notification.type))
                .map(notification => {
                  let notificationType: string;
                  let notificationId: string;
                  
                  if (notification.type === 'announcement') {
                    notificationType = 'announcement';
                    notificationId = notification.data.id;
                  } else if (supportedTypes.includes(notification.type)) {
                    // For social notifications from notification_queue and credit/gift history from wallet_transactions
                    notificationType = notification.type;
                    notificationId = notification.id.split('_').pop() || notification.id; // Extract the queue ID or transaction ID
                  } else {
                    // Skip unsupported types (shouldn't happen due to filter above, but safety check)
                    return null;
                  }

                  return {
                    user_id: user.id,
                    notification_type: notificationType,
                    notification_id: notificationId
                  };
                })
                .filter(record => record !== null);
              
              // Log if any notifications were filtered out
              const filteredOut = selectedNotificationsList.filter(n => !supportedTypes.includes(n.type));
              if (filteredOut.length > 0) {
                warn(`⚠️ Filtered out ${filteredOut.length} notifications with unsupported types:`, filteredOut.map(n => n.type));
              }

              if (dismissalRecords.length > 0) {
                const { error: dismissError } = await supabase
                  .from('notification_dismissals')
                  .upsert(dismissalRecords, { 
                    onConflict: 'user_id,notification_type,notification_id'
                  });

                if (dismissError) {
                  // If constraint error, try to handle gracefully
                  if (dismissError.code === '23514') {
                    warn('⚠️ Database constraint error - notification_dismissals table may need constraint update');
                    warn('Run utils/fix_notification_dismissals_constraint.sql in Supabase SQL Editor');
                    // Still try to remove from local state
                    setNotifications(prev => 
                      prev.filter(n => !selectedNotifications.has(n.id))
                    );
                    Toast.show({
                      type: 'error',
                      text1: 'Database Error',
                      text2: 'Please update database constraint. See console for details.',
                      position: 'bottom',
                    });
                    return;
                  }
                  throw dismissError;
                }
              }

              await fetchNotifications();
              setSelectedNotifications(new Set());
              setIsSelectionMode(false);

              Toast.show({
                type: 'success',
                text1: 'Notifications Cleared',
                text2: `${selectedNotifications.size} notification${selectedNotifications.size > 1 ? 's' : ''} cleared`,
                position: 'bottom',
              });

            } catch (error) {
              error('Error clearing notifications:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to clear notifications. Please try again.',
                position: 'bottom',
              });
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const clearAllNotifications = async () => {
    if (isDeleting) return;

    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to hide all notifications? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
    try {
      setIsDeleting(true);
      if (!user) return;

      // Map all supported notification types to dismissal records
      // Include all types that are in the Notification interface
      const supportedTypes = [
        'announcement', 'like', 'comment', 'follow',
        'friend_request', 'friend_request_accepted', 'credit', 'credit_sent', 
        'gift_sent', 'gift_received', 'new_post', 'profile_view',
        'message'
      ];
      
      const dismissalRecords = notifications
        .filter(notification => supportedTypes.includes(notification.type))
        .map(notification => {
          let notificationType: string;
          let notificationId: string;
          
          if (notification.type === 'announcement') {
            notificationType = 'announcement';
            notificationId = notification.data.id;
          } else if (supportedTypes.includes(notification.type)) {
            // For social notifications from notification_queue and credit/gift history from wallet_transactions
            notificationType = notification.type;
            notificationId = notification.id.split('_').pop() || notification.id; // Extract the queue ID or transaction ID
          } else {
            // Skip unsupported types (shouldn't happen due to filter above, but safety check)
            return null;
          }

          return {
            user_id: user.id,
            notification_type: notificationType,
            notification_id: notificationId
          };
        })
        .filter(record => record !== null);
      
      // Log if any notifications were filtered out
      const filteredOut = notifications.filter(n => !supportedTypes.includes(n.type));
      if (filteredOut.length > 0) {
        warn(`⚠️ Filtered out ${filteredOut.length} notifications with unsupported types:`, filteredOut.map(n => n.type));
      }

      if (dismissalRecords.length > 0) {
        const { error: dismissError } = await supabase
          .from('notification_dismissals')
          .upsert(dismissalRecords, { 
            onConflict: 'user_id,notification_type,notification_id'
          });

        if (dismissError) {
                  // If constraint error, try to handle gracefully
                  if (dismissError.code === '23514') {
                    warn('⚠️ Database constraint error - notification_dismissals table may need constraint update');
                    warn('Run utils/fix_notification_dismissals_constraint.sql in Supabase SQL Editor');
                    // Still try to remove from local state
                    setNotifications(prev => prev);
                    Toast.show({
                      type: 'error',
                      text1: 'Database Error',
                      text2: 'Please update database constraint. See console for details.',
                      position: 'bottom',
                    });
                    return;
                  }
          throw dismissError;
        }
      }

      await fetchNotifications();

      Toast.show({
        type: 'success',
                text1: 'Notifications Cleared',
                text2: 'All notifications have been cleared from your view',
        position: 'bottom',
      });

    } catch (error) {
      error('Error clearing notifications:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to clear notifications. Please try again.',
        position: 'bottom',
      });
    } finally {
      setIsDeleting(false);
    }
          },
        },
      ]
    );
  };

  const deleteNotification = async (notification: Notification) => {
    if (isDeleting) return;

    try {
      setIsDeleting(true);

      let notificationType: string;
      let notificationId: string;
      
      if (notification.type === 'announcement') {
        notificationType = 'announcement';
        notificationId = notification.data.id;
      } else if (['like', 'comment', 'follow', 'credit_sent', 'profile_view', 'discover_like'].includes(notification.type)) {
        // For social notifications from notification_queue and credit_sent from wallet_transactions
        notificationType = notification.type;
        notificationId = notification.id.split('_').pop() || notification.id; // Extract the queue ID or transaction ID
      } else {
        throw new Error('Unknown notification type');
      }

      const { error: dismissError } = await supabase
        .from('notification_dismissals')
        .upsert({
          user_id: user.id,
          notification_type: notificationType,
          notification_id: notificationId
        }, { 
          onConflict: 'user_id,notification_type,notification_id'
        });

      if (dismissError) {
        throw dismissError;
      }
      
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      
      Toast.show({
        type: 'success',
        text1: 'Notification Hidden',
        text2: 'Notification has been hidden from your view',
        position: 'bottom',
      });
    } catch (error) {
      error('Error deleting notification:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to hide notification',
        position: 'bottom',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const markAsRead = async (notification: Notification) => {
    try {
      if (notification.type === 'announcement') {
        if (!user?.id) {
          warn('⚠️ Cannot mark announcement as read: user not logged in');
          return;
        }

        if (!notification.data?.id) {
          warn('⚠️ Cannot mark announcement as read: missing announcement ID');
          return;
        }

        // Try to insert into announcement_reads table
        const insertResult = await supabase
          .from('announcement_reads')
          .insert({
            announcement_id: notification.data.id,
            user_id: user.id
          })
          .select();
        
        const { data, error: insertError } = insertResult;
        
        // Log the full response for debugging
        log('📝 Insert result:', {
          hasData: !!data,
          hasError: !!insertError,
          dataLength: data?.length,
          errorType: typeof insertError,
          errorIsObject: insertError instanceof Object,
          fullResult: insertResult
        });
        
        if (insertError) {
          // Try to extract error information from various possible structures
          let errorCode: string | null = null;
          let errorMessage: string = '';
          
          // Try different ways to access error properties
          if (insertError.code) {
            errorCode = insertError.code;
          } else if ((insertError as any)?.error?.code) {
            errorCode = (insertError as any).error.code;
      }
      
          if (insertError.message) {
            errorMessage = insertError.message;
          } else if ((insertError as any)?.error?.message) {
            errorMessage = (insertError as any).error.message;
          } else if (typeof insertError === 'string') {
            errorMessage = insertError;
          } else {
            // Try to serialize the error object properly
            try {
              // Try with replacer function to get all properties
              const seen = new WeakSet();
              errorMessage = JSON.stringify(insertError, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                  if (seen.has(value)) {
                    return '[Circular]';
                  }
                  seen.add(value);
                }
                return value;
              });
            } catch (e) {
              // If JSON.stringify fails, try other methods
              try {
                errorMessage = Object.prototype.toString.call(insertError);
              } catch {
                errorMessage = String(insertError);
              }
            }
          }
          
          // Check if error is actually empty (no properties)
          const hasErrorProperties = insertError && (
            insertError.code || 
            insertError.message || 
            insertError.details || 
            insertError.hint ||
            Object.keys(insertError).length > 0 ||
            Object.getOwnPropertyNames(insertError).length > 0
          );
          
          // Log the full error details for debugging
          error('❌ Insert error details:', {
            errorCode,
            errorMessage,
            errorDetails: insertError?.details,
            errorHint: insertError?.hint,
            errorObject: insertError,
            errorKeys: Object.keys(insertError || {}),
            errorOwnProperties: Object.getOwnPropertyNames(insertError || {}),
            errorStringified: JSON.stringify(insertError, null, 2),
            hasErrorProperties,
            announcement_id: notification.data.id,
            user_id: user.id
          });
          
          // If error is empty or has no properties, it might be a silent failure
          // This could mean the table doesn't exist or RLS is blocking it
          if (!hasErrorProperties) {
            warn('⚠️ Empty error object - likely table missing or RLS issue. Marking as read in UI only.');
      setNotifications(prev => 
        prev.map(n => 
          n.id === notification.id 
            ? { ...n, read: true }
            : n
        )
      );
            return;
          }
          
          // Check if table doesn't exist (42P01) or permission denied (42501)
          if (errorCode === '42P01' || errorMessage?.includes('does not exist') || (errorMessage?.includes('relation') && errorMessage?.includes('does not exist'))) {
            warn('⚠️ announcement_reads table does not exist - marking as read in UI only');
            // Still update the UI state even if table doesn't exist
            setNotifications(prev => 
              prev.map(n => 
                n.id === notification.id 
                  ? { ...n, read: true }
                  : n
              )
            );
            return;
          }
          
          // If it's a duplicate key error (23505), that's okay - it's already read
          if (errorCode === '23505' || errorMessage?.includes('duplicate') || errorMessage?.includes('already exists') || errorMessage?.includes('unique constraint')) {
            log('✅ Announcement already marked as read:', notification.data.id);
            // Still update the UI state
            setNotifications(prev => 
              prev.map(n => 
                n.id === notification.id 
                  ? { ...n, read: true }
                  : n
              )
            );
            return;
          }
          
          // For any other error, still mark as read in UI but log the error
          warn('⚠️ Could not mark announcement as read in database, but marking as read in UI:', {
            errorCode,
            errorMessage,
            announcement_id: notification.data.id
          });
          // Still update UI state even if database insert fails
          setNotifications(prev => 
            prev.map(n => 
              n.id === notification.id 
                ? { ...n, read: true }
                : n
            )
          );
          return;
        } else {
          log('✅ Marked announcement as read:', {
            announcement_id: notification.data.id,
            user_id: user.id,
            data
          });
        }
      }
      
      setNotifications(prev => 
        prev.map(n => 
          n.id === notification.id 
            ? { ...n, read: true }
            : n
        )
      );
    } catch (error: any) {
      error('❌ Error marking notification as read:', {
        error,
        errorMessage: error?.message,
        errorCode: error?.code,
        notificationType: notification.type,
        notificationId: notification.id,
        announcementId: notification.data?.id,
        userId: user?.id
      });
      // Still update UI state even if there's an error
      setNotifications(prev => 
        prev.map(n => 
          n.id === notification.id 
            ? { ...n, read: true }
            : n
        )
      );
    }
  };

  const markSocialNotificationAsRead = async (notification: Notification) => {
    if (!user?.id) return;
    
    try {
      // Extract the notification_queue ID from the notification ID
      // Format: "like_<queue_id>" or "comment_<queue_id>" or "follow_<queue_id>"
      const queueId = notification.id.split('_').pop();
      if (!queueId) {
        warn('⚠️ Could not extract queue ID from notification:', notification.id);
        return;
      }

      // Mark as read in local state immediately
      setNotifications(prev =>
        prev.map(n =>
          n.id === notification.id
            ? { ...n, read: true }
            : n
        )
      );

      // Persist read status to database in notification_reads table
      const { error: insertError } = await supabase
        .from('notification_reads')
        .insert({
          notification_queue_id: queueId,
          user_id: user.id
        })
        .select();

      if (insertError) {
        // If table doesn't exist (42P01), that's okay - we'll mark as read in UI only
        if (insertError.code === '42P01' || insertError.message?.includes('does not exist')) {
          log('⚠️ notification_reads table does not exist - marking as read in UI only');
        } else if (insertError.code === '23505') {
          // Duplicate key - already marked as read, that's fine
          log('✅ Notification already marked as read');
        } else {
          error('❌ Error marking social notification as read:', insertError);
        }
      } else {
        log('✅ Marked social notification as read in database:', queueId);
      }
    } catch (error) {
      error('❌ Error marking social notification as read:', error);
      // Still mark as read in UI even if database fails
    }
  };

  const handleAcceptFriendRequest = async (notification: Notification) => {
    if (!notification.requestId) return;
    
    try {
      const success = await acceptFriendRequest(notification.requestId);
      if (success) {
        Toast.show({
          type: 'success',
          text1: 'Request accepted!',
          text2: 'You are now following them',
        });
        // Remove notification from list
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
        // Refresh to update follow status
        await fetchNotifications();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Failed to accept',
          text2: 'Please try again',
        });
      }
    } catch (error) {
      error('Error accepting friend request:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to accept request',
      });
    }
  };

  const handleRejectFriendRequest = async (notification: Notification) => {
    if (!notification.requestId) return;
    
    try {
      const success = await rejectFriendRequest(notification.requestId);
      if (success) {
        Toast.show({
          type: 'info',
          text1: 'Request rejected',
        });
        // Remove notification from list
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      } else {
        Toast.show({
          type: 'error',
          text1: 'Failed to reject',
          text2: 'Please try again',
        });
      }
    } catch (error) {
      error('Error rejecting friend request:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to reject request',
      });
    }
  };

  const handleNotificationPress = (notification: Notification) => {
    // Friend requests don't navigate, they show action buttons
    if (notification.type === 'friend_request') {
      return;
    }

    // Mark social notifications as read when tapped
    if ((notification.type === 'like' || notification.type === 'comment' || notification.type === 'follow' || notification.type === 'friend_request_accepted' || notification.type === 'credit' || notification.type === 'gift_received' || notification.type === 'profile_view' || notification.type === 'new_post' || notification.type === 'discover_like') && !notification.read) {
      markSocialNotificationAsRead(notification);
    }
    
    // Handle gift notifications - navigate to user profile
    if (notification.type === 'gift_sent' || notification.type === 'gift_received') {
      const userId = notification.type === 'gift_sent' 
        ? notification.data?.recipient_id 
        : notification.data?.sender_id;
      if (userId) {
        router.push(`/profile/${userId}`);
        return;
      }
    }
    
    // Handle credit notifications - navigate to user profile
    if (notification.type === 'credit' || notification.type === 'credit_sent') {
      const userId = notification.type === 'credit'
        ? notification.data?.credited_by_id
        : notification.data?.recipient_id;
      if (userId) {
        router.push(`/profile/${userId}`);
        return;
      }
    }

    // Handle profile view notifications - navigate to viewer's profile
    if (notification.type === 'profile_view') {
      if (!canViewProfileViewers) {
        Alert.alert(
          'Dating Pro required',
          'Upgrade to Dating Pro to see who viewed your profile.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Upgrade',
              onPress: () =>
                router.push({
                  pathname: '/(tabs)/discovery',
                  params: { openPaywall: '1', paywallTitle: 'See who viewed your profile' },
                }),
            },
          ]
        );
        return;
      }
      const viewerId = notification.data?.viewer_id || notification.sender_id;
      if (viewerId) {
        router.push(`/profile/${viewerId}`);
        // Mark as read
        if (!notification.read) {
          markSocialNotificationAsRead(notification);
        }
        return;
      }
    }

    // Handle discover_like - nearby was removed, route to home feed
    if (notification.type === 'discover_like') {
      router.push('/(tabs)/community');
      return;
    }

    // Handle navigation for social notifications (likes, comments, follows)
    // IMPORTANT: Social notifications should NOT be hidden or dismissed when opened
    // They remain visible in the list after navigation
    // Note: livestream notifications are push-only and not shown in history
    if (notification.type === 'like' || notification.type === 'comment' || notification.type === 'new_post') {
      // Navigate directly to the post detail screen
      const postId = notification.data?.post_id;
      if (postId && typeof postId === 'string' && postId.trim().length > 0) {
        log(`[NotificationsScreen] Navigating to post ${postId} from ${notification.type} notification`);
        // Navigate to post detail screen for better reliability
        router.push(`/community/post/${postId}`);
        // Don't remove notification from state - it should stay visible
        return;
      } else {
        warn('⚠️ Invalid or missing post_id in notification data:', {
          postId,
          type: typeof postId,
          notificationType: notification.type,
          fullNotification: notification,
        });
        Alert.alert('Error', 'Unable to open post. The post may have been deleted.');
      }
    } else if (notification.type === 'follow' || notification.type === 'friend_request_accepted') {
      // Navigate to the user's profile
      const senderId = notification.data?.sender_id || notification.data?.follower_id;
      if (senderId) {
        router.push(`/profile/${senderId}`);
        // Don't remove notification from state - it should stay visible
        return;
      } else {
        warn('⚠️ No sender_id or follower_id found in notification data:', notification);
      }
    }
    
    // For announcements, mark as read and toggle expansion
    if (notification.type === 'announcement') {
      if (!notification.read) {
        markAsRead(notification);
      }
      
      // Toggle expansion for announcements
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(notification.id)) {
        newSet.delete(notification.id);
      } else {
        newSet.add(notification.id);
      }
      return newSet;
    });
    }
  };

  const handleActionPress = (notification: Notification, action: string) => {
    if (action === 'view') {
      if (notification.type === 'discover_like') {
        router.push('/(tabs)/community');
      } else if (notification.type === 'profile_view') {
        if (!canViewProfileViewers) {
          Alert.alert(
            'Dating Pro required',
            'Upgrade to Dating Pro to see who viewed your profile.',
            [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Upgrade',
                onPress: () =>
                  router.push({
                    pathname: '/(tabs)/discovery',
                    params: { openPaywall: '1', paywallTitle: 'See who viewed your profile' },
                  }),
              },
            ]
          );
          return;
        }
        const senderId = notification.data?.sender_id || notification.data?.viewer_id;
        if (senderId) {
          router.push(`/profile/${senderId}`);
        }
      } else if (notification.type === 'like' || notification.type === 'comment' || notification.type === 'new_post') {
        // Navigate to the post
        const postId = notification.data?.post_id;
        if (postId) {
          router.push(`/(tabs)/community?postId=${postId}`);
        }
      } else if (notification.type === 'follow') {
        // Navigate to the user's profile
        const senderId = notification.data?.sender_id || notification.data?.follower_id;
      if (senderId) {
          router.push(`/profile/${senderId}`);
      }
    }
    }
    // Note: 'read' action for announcements is removed - text expansion is handled inline
  };


  useEffect(() => {
    const initializeNotifications = async () => {
      if (!user) return;
      
      // 🚀 AGGRESSIVE CACHING: Load cache first for instant display
      try {
        const cachedNotifications = await cacheLoadPromiseRef.current;
        if (cachedNotifications && cachedNotifications.length > 0) {
          initialCachedNotificationsRef.current = cachedNotifications;
          log(`[NotificationsScreen] 🚀 Loaded ${cachedNotifications.length} notifications from cache - showing instantly`);
          setNotifications(cachedNotifications);
          setLoading(false); // Show cached data immediately
          
          // Fetch fresh data silently in background
          log('[NotificationsScreen] Cached data showing, fetching fresh data in background...');
          fetchNotifications(true).catch(err => {
            error('[NotificationsScreen] Error fetching fresh notifications:', err);
          });
          return; // Don't fetch again below
        }
      } catch (error) {
        warn('[NotificationsScreen] Error loading cache:', error);
      }
      
      // No cache or cache failed, fetch normally
      await fetchNotifications();
    };

    if (user) {
      initializeNotifications();
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refreshProfileViewEntitlement();
      return () => {};
    }, [refreshProfileViewEntitlement])
  );

  const getIcon = (type: string, read: boolean) => {
    const iconColor = read ? themeColors.neutral.subtext : themeColors.primary.main;
    const iconSize = 20;
    
    switch (type) {
      case 'message': 
        return <MessageCircle size={iconSize} color={iconColor} strokeWidth={2} />;
      case 'announcement': 
        return <Megaphone size={iconSize} color={read ? themeColors.neutral.subtext : themeColors.warning.main} strokeWidth={2} />;
      case 'like':
        return <Ionicons name="heart" size={iconSize} color={read ? themeColors.neutral.subtext : themeColors.error.main} />;
      case 'comment':
        return <MessageCircle size={iconSize} color={iconColor} strokeWidth={2} />;
      case 'follow':
        return <Ionicons name="person-add" size={iconSize} color={iconColor} />;
      case 'new_post':
        return <Ionicons name="image" size={iconSize} color={iconColor} />;
      case 'friend_request':
        return <UserPlus size={iconSize} color={iconColor} strokeWidth={2} />;
      case 'friend_request_accepted':
        return <Check size={iconSize} color={iconColor} strokeWidth={2} />;
      case 'credit':
        return <Coins size={iconSize} color={read ? themeColors.neutral.subtext : '#FFD700'} strokeWidth={2} />;
      case 'credit_sent':
        return <Coins size={iconSize} color={read ? themeColors.neutral.subtext : '#FFA500'} strokeWidth={2} />;
      case 'gift_sent':
        return <Coins size={iconSize} color={read ? themeColors.neutral.subtext : '#FF6B9D'} strokeWidth={2} />;
      case 'gift_received':
        return <Coins size={iconSize} color={read ? themeColors.neutral.subtext : '#FF0050'} strokeWidth={2} />;
      case 'profile_view':
        return <Eye size={iconSize} color={read ? themeColors.neutral.subtext : (themeColors.success?.main || themeColors.primary.main)} strokeWidth={2} />;
      case 'discover_like':
        return <Heart size={iconSize} color={read ? themeColors.neutral.subtext : (themeColors.primary.main || '#FF3B5C')} strokeWidth={2} />;
      default: 
        return <Bell size={iconSize} color={iconColor} strokeWidth={2} />;
      }
    };

  const getTypeColor = (type: string, read: boolean) => {
    if (read) return themeColors.neutral.subtext;
    
    switch (type) {
          case 'message': return themeColors.primary.main;
          case 'announcement': return themeColors.warning.main;
      case 'like': return themeColors.error.main;
      case 'comment': return themeColors.primary.main;
      case 'follow': return themeColors.info?.main || themeColors.primary.main;
      case 'new_post': return themeColors.primary.main;
      case 'profile_view': return themeColors.success?.main || themeColors.primary.main;
      case 'discover_like': return themeColors.primary.main || '#FF3B5C';
      case 'friend_request': return themeColors.info?.main || themeColors.primary.main;
      case 'friend_request_accepted': return themeColors.success?.main || '#22C55E';
      case 'credit': return '#FFD700';
      case 'credit_sent': return '#FFA500';
      case 'gift_sent': return '#FF6B9D';
      case 'gift_received': return '#FF0050';
          default: return themeColors.primary.main;
        }
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    // Friend requests are always "expanded" to show action buttons
    const isExpanded = expandedCards.has(item.id) || item.type === 'friend_request';
    const typeColor = getTypeColor(item.type, item.read);
    const isSelected = selectedNotifications.has(item.id);
    // Get sender avatar for messages and social notifications
    const senderAvatar = (item.type === 'like' || item.type === 'comment' || item.type === 'follow' || item.type === 'friend_request' || item.type === 'friend_request_accepted' || item.type === 'credit' || item.type === 'credit_sent' || item.type === 'gift_sent' || item.type === 'gift_received' || item.type === 'profile_view' || item.type === 'discover_like')
      ? (item.data?.sender?.avatar_url || item.data?.requester?.avatar_url || item.data?.credited_by_avatar || item.data?.recipient_avatar || item.data?.sender_avatar || item.data?.viewer?.avatar_url)
      : null;
    const senderId = (item.type === 'like' || item.type === 'comment' || item.type === 'follow' || item.type === 'friend_request' || item.type === 'friend_request_accepted' || item.type === 'credit' || item.type === 'credit_sent' || item.type === 'gift_sent' || item.type === 'gift_received' || item.type === 'profile_view' || item.type === 'discover_like')
      ? (item.data?.sender_id || item.data?.follower_id || item.data?.joiner_id || item.data?.liker_id || item.requesterId || item.data?.credited_by_id || item.data?.recipient_id || item.data?.viewer_id)
      : null;

    // Check if message is long enough to need truncation (rough estimate: > 100 chars)
    const messageLength = item.message?.length || 0;
    const needsTruncation = messageLength > 100;
    const showReadMore = needsTruncation && !isExpanded;

    return (
      <View
        style={[
          styles.notificationCard,
        { 
          backgroundColor: isSelected 
            ? themeColors.primary.light + '30'
            : item.read 
              ? themeColors.neutral.surface 
              : themeColors.primary.extralight + '40',
            borderLeftColor: !item.read ? typeColor : 'transparent',
            borderWidth: isSelected ? 2 : 0,
            borderColor: isSelected ? themeColors.primary.main : 'transparent',
        }
        ]}
      >
        <TouchableOpacity
          style={styles.notificationContent}
          onPress={() => {
            if (isSelectionMode) {
              toggleNotificationSelection(item.id);
              } else {
                handleNotificationPress(item);
            }
          }}
          onLongPress={() => {
            if (!isSelectionMode) {
              setIsSelectionMode(true);
              setSelectedNotifications(new Set([item.id]));
            }
          }}
          activeOpacity={0.7}
        >
          {isSelectionMode && (
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => toggleNotificationSelection(item.id)}
          activeOpacity={0.7}
        >
              <View style={[
                styles.checkbox,
                {
                  backgroundColor: isSelected ? themeColors.primary.main : 'transparent',
                  borderColor: isSelected ? themeColors.primary.main : themeColors.neutral.border,
                }
              ]}>
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color={themeColors.neutral.surface} />
                )}
              </View>
            </TouchableOpacity>
          )}
          <View style={[
            styles.iconContainer,
            { backgroundColor: !item.read ? typeColor + '15' : themeColors.neutral.card }
          ]}>
            {(item.type === 'like' || item.type === 'comment' || item.type === 'follow' || item.type === 'friend_request' || item.type === 'friend_request_accepted' || item.type === 'credit' || item.type === 'credit_sent' || item.type === 'gift_sent' || item.type === 'gift_received') && senderId ? (
              <SimpleAvatar userId={senderId} avatarUrl={senderAvatar} size={40} />
            ) : (
              getIcon(item.type, item.read)
            )}
          </View>
          
          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <Text 
                style={[
                  styles.notificationTitle,
              { 
                    color: item.read ? themeColors.neutral.subtext : themeColors.neutral.text,
                    fontFamily: item.read ? FontFamily.medium : FontFamily.semibold
              }
                ]}
                numberOfLines={1}
              >
              {item.title}
            </Text>
              {!item.read && (
                <View style={[styles.unreadDot, { backgroundColor: typeColor }]} />
              )}
            </View>
            
            <Text 
              style={[styles.notificationMessage, { color: themeColors.neutral.textSecondary }]}
              numberOfLines={isExpanded ? undefined : 2}
            >
              {item.message}
            </Text>
            
            {showReadMore && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleNotificationPress(item);
                }}
                style={styles.readMoreButton}
              >
                <Text style={[styles.readMoreText, { color: typeColor }]}>
                  Read more
                </Text>
              </TouchableOpacity>
            )}
            
            {isExpanded && needsTruncation && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleNotificationPress(item);
                }}
                style={styles.readMoreButton}
              >
                <Text style={[styles.readMoreText, { color: typeColor }]}>
                  Read less
                </Text>
              </TouchableOpacity>
              )}
            
            <Text style={[styles.notificationTime, { color: themeColors.neutral.subtext }]}>
              {formatTimeAgo(item.timestamp)}
            </Text>
            </View>

        </TouchableOpacity>

        {/* Friend Request Actions - Always visible */}
        {item.type === 'friend_request' && (
          <View style={[styles.expandedActions, { borderTopColor: themeColors.neutral.border }]}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton, { backgroundColor: themeColors.error.main }]}
              onPress={(e) => {
                e.stopPropagation();
                handleRejectFriendRequest(item);
              }}
              activeOpacity={0.8}
            >
              <XCircle size={16} color="white" />
              <Text style={styles.actionButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton, { backgroundColor: themeColors.success?.main || '#22C55E' }]}
              onPress={(e) => {
                e.stopPropagation();
                handleAcceptFriendRequest(item);
              }}
              activeOpacity={0.8}
            >
              <Check size={16} color="white" />
              <Text style={styles.actionButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        )}

        {isExpanded && (
          <View style={[styles.expandedActions, { borderTopColor: themeColors.neutral.border }]}>
            {(item.type === 'like' || item.type === 'comment') && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: typeColor }]}
                onPress={() => handleActionPress(item, 'view')}
                activeOpacity={0.8}
              >
                <MessageCircle size={16} color="white" />
                <Text style={styles.actionButtonText}>View Post</Text>
              </TouchableOpacity>
            )}
            {item.type === 'follow' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: typeColor }]}
                onPress={() => handleActionPress(item, 'view')}
                activeOpacity={0.8}
              >
                <Ionicons name="person" size={16} color="white" />
                <Text style={styles.actionButtonText}>View Profile</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => {
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: themeColors.neutral.card }]}>
            <Bell size={56} color={themeColors.neutral.subtext} strokeWidth={1.5} />
        </View>
        <Text style={[styles.emptyTitle, { color: themeColors.neutral.text }]}>
          All caught up!
        </Text>
        <Text style={[styles.emptySubtitle, { color: themeColors.neutral.textSecondary }]}>
          You have no new notifications.\nCheck back later for messages and updates.
        </Text>
      </View>
    );
  };

  // Memoize unread count to avoid recalculating on every render
  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  // Restore all dismissed notifications
  const restoreAllNotifications = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notification_dismissals')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      // Refresh notifications to show restored ones
      await fetchNotifications();

      Toast.show({
        type: 'success',
        text1: 'Notifications Restored',
        text2: 'All hidden notifications have been restored',
        position: 'bottom',
      });
    } catch (error) {
      error('Error restoring notifications:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to restore notifications',
        position: 'bottom',
      });
    }
  };

  return (
    <>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.neutral.background }]} edges={[]}>
        <Header
          title="Notifications"
          showBackButton={true}
          unreadNotificationCount={unreadCount}
          rightComponent={
            <View style={styles.headerActions}>
              {isSelectionMode ? (
                <>
                  {selectedNotifications.size > 0 && (
                    <TouchableOpacity
                      style={styles.headerButton}
                      onPress={clearSelectedNotifications}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash" size={18} color={themeColors.error.main} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.headerButton}
                    onPress={selectedNotifications.size === notifications.length ? deselectAllNotifications : selectAllNotifications}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.selectAllText, { color: themeColors.primary.main }]}>
                      {selectedNotifications.size === notifications.length ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.headerButton}
                    onPress={toggleSelectionMode}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cancelText, { color: themeColors.neutral.text }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
              {unreadCount > 0 ? (
                <View style={[styles.badge, { backgroundColor: themeColors.primary.main }]}>
                  <Text style={[styles.badgeText, { color: themeColors.neutral.surface }]}>
                    {String(unreadCount)}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity 
                style={styles.headerButton}
              onPress={() => router.push('/settings/notifications')}
              activeOpacity={0.7}
            >
                <Settings size={18} color={themeColors.neutral.text} strokeWidth={2} />
            </TouchableOpacity>
              </>
            )}
          </View>
          }
        />

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.primary.main} />
            <Text style={[styles.loadingText, { color: themeColors.neutral.textSecondary }]}>
              Loading notifications...
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderNotification}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh}
                tintColor={themeColors.primary.main}
                colors={[themeColors.primary.main]}
              />
            }
            ListEmptyComponent={renderEmptyState}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingRight: Spacing.xs, // Add small padding to prevent icons from touching edge
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.semibold,
  },
  headerButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  selectAllText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
  cancelText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
  },
  listContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  notificationCard: {
    borderRadius: BorderRadius.lg,
    borderLeftWidth: 3,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
    ...Shadow.sm,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxContainer: {
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  notificationTitle: {
    fontSize: FontSizes.md,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notificationMessage: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
    marginBottom: Spacing.xs,
  },
  readMoreButton: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
  notificationTime: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
  },
  deleteButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  expandedActions: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    gap: Spacing.xs,
    flex: 1,
    justifyContent: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 100,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
}); 
