import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SwipeableRow } from './SwipeableRow';
import EnhancedAvatar from './EnhancedAvatar';
import { getThemeColors } from '../constants/Colors';
import { fetchPrivateConversations, markConversationAsRead, hideConversationServer, unhideConversationServer, PrivateConversation, getMessagePreview, deleteConversation } from '../utils/supabase';
import { getUserProfile } from '../utils/chat';
import { getCachedConversations, cacheConversations, upsertConversationInCache, removeConversationFromCache } from '../utils/conversationCache';
import { clearConversationCache } from '../utils/messageCache';
import { supabase } from '../utils/supabase';
import Input from './Input';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useAuth from '../hooks/useAuth';
import { log, warn, error } from '../utils/productionLogger';


// Limit per-conversation realtime channels to avoid heavy subscriptions on large inboxes
const MAX_TYPING_SUBSCRIPTIONS = 20;

// Gen Z friendly compact typing indicator component
const CompactTypingIndicator = ({ isDarkMode }: { isDarkMode: boolean }) => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const createAnimation = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 400,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const animations = [
      createAnimation(dot1, 0),
      createAnimation(dot2, 150),
      createAnimation(dot3, 300),
    ];

    animations.forEach(anim => anim.start());

    return () => {
      animations.forEach(anim => anim.stop());
    };
  }, [dot1, dot2, dot3]);

  const dotColor = isDarkMode ? '#9CA3AF' : '#6B7280';

  return (
    <View style={styles.typingIndicatorContainer}>
      <Animated.View
        style={[
          styles.typingDot,
          { backgroundColor: dotColor, opacity: dot1 },
        ]}
      />
      <Animated.View
        style={[
          styles.typingDot,
          { backgroundColor: dotColor, opacity: dot2 },
        ]}
      />
      <Animated.View
        style={[
          styles.typingDot,
          { backgroundColor: dotColor, opacity: dot3 },
        ]}
      />
    </View>
  );
};

export default function ChatRoomsList({ compactTop = false }: { compactTop?: boolean }) {
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<PrivateConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenConversations, setHiddenConversations] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, boolean>>(new Map()); // conversationId -> isTyping
  const typingChannelsRef = useRef<Map<string, any>>(new Map()); // conversationId -> channel
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map()); // conversationId -> timeout
  const conversationsChannelRef = useRef<any | null>(null);
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { user } = useAuth();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();

  // Debug theme colors
  log('Theme Colors:', {
    isDarkMode,
    background: themeColors.background,
    surface: themeColors.surface,
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    textTertiary: themeColors.textTertiary,
  });

  // Load hidden conversations from storage
  const loadHiddenConversations = useCallback(async () => {
    if (!user?.id) return;
    try {
      const key = `hidden_conversations_${user.id}`;
      const hidden = await AsyncStorage.getItem(key);
      if (hidden) {
        setHiddenConversations(new Set(JSON.parse(hidden)));
      }
    } catch (error) {
      error('Error loading hidden conversations:', error);
    }
  }, [user?.id]);

  // Save hidden conversations to storage
  const saveHiddenConversations = useCallback(async (hidden: Set<string>) => {
    if (!user?.id) return;
    try {
      const key = `hidden_conversations_${user.id}`;
      await AsyncStorage.setItem(key, JSON.stringify(Array.from(hidden)));
    } catch (error) {
      error('Error saving hidden conversations:', error);
    }
  }, [user?.id]);

  // Hide a conversation (client + server)
  const hideConversation = useCallback(async (conversationId: string) => {
    const newHidden = new Set(hiddenConversations);
    newHidden.add(conversationId);
    setHiddenConversations(newHidden);
    await saveHiddenConversations(newHidden);
    await hideConversationServer(conversationId);
  }, [hiddenConversations, saveHiddenConversations]);

  const loadConversations = useCallback(async () => {
    try {
      // Only show loading if no conversations are currently displayed
      // During refresh, existing conversations stay visible (stale-while-revalidate)
      if (conversations.length === 0) {
        setLoading(true);
      }

      // 📴 Offline: use cache only, don't hit network (app stays usable)
      try {
        const NetInfo = (await import('@react-native-community/netinfo')).default;
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
          const cachedData = await getCachedConversations();
          if (cachedData && cachedData.length > 0) {
            const visibleCached = cachedData.filter(conv => !hiddenConversations.has(conv.conversation_with));
            setConversations(visibleCached);
            setFilteredConversations(visibleCached);
            log('[ChatRooms] 📴 Offline - showing', visibleCached.length, 'cached conversations');
          }
          setLoading(false);
          return;
        }
      } catch {
        // NetInfo failed, continue with normal flow
      }

      // 🚀 AGGRESSIVE CACHING: Try prefetch cache first (fastest)
      try {
        const { preloadConversationsList } = await import('../utils/chatCacheOptimizer');
        const prefetchData = await preloadConversationsList();
        if (prefetchData && prefetchData.length > 0) {
          const visiblePrefetch = prefetchData.filter(conv => !hiddenConversations.has(conv.conversation_with));
          if (visiblePrefetch.length > 0) {
            log('🚀 Loaded', visiblePrefetch.length, 'conversations from prefetch cache (instant)');
            setConversations(visiblePrefetch);
            setFilteredConversations(visiblePrefetch);
            setLoading(false); // Hide loading immediately
          }
        }
      } catch (prefetchError) {
        warn('[ChatRooms] Prefetch cache failed (non-critical):', prefetchError);
      }

      // Step 1: Load cached conversations INSTANTLY (WhatsApp-style)
      const cachedData = await getCachedConversations();
      if (cachedData && cachedData.length > 0) {
        log('🚀 Loaded', cachedData.length, 'cached conversations instantly');

        // Filter out hidden conversations
        const visibleCached = cachedData.filter(conv => !hiddenConversations.has(conv.conversation_with));

        // Only update if we don't have prefetch data or prefetch has fewer items
        if (!conversations.length || visibleCached.length > conversations.length) {
          setConversations(visibleCached);
          setFilteredConversations(visibleCached);
          setLoading(false); // Hide loading immediately with cached data
          log('Displayed cached conversations, fetching fresh data in background...');
        }
      }

      // Step 2: Fetch fresh data from server in background
      log('📡 Fetching fresh conversations from database...');
      const data = await fetchPrivateConversations();
      log('Raw data from database:', data);
      
      // Filter out hidden conversations
      const visibleConversations = data.filter(conv => !hiddenConversations.has(conv.conversation_with));
      log('Filtered out', data.length - visibleConversations.length, 'hidden conversations');
      log('Setting conversations state to:', visibleConversations.length, 'items');
      
      // Update UI with fresh data
      setConversations(visibleConversations);
      setFilteredConversations(visibleConversations);
      
      // Cache the fresh data for next time
      await cacheConversations(data);
      log('💾 Conversations cached for next load');
      
      log('State updated - conversations:', visibleConversations.length, 'filtered:', visibleConversations.length);
    } catch (err) {
      if (err instanceof Error) {
        error('Error loading conversations:', err.message);
      } else {
        error('Unknown error loading conversations:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [hiddenConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  }, [loadConversations]);

  // Filter conversations based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredConversations(conversations);
    } else {
      const filtered = conversations.filter(conversation =>
        conversation.conversation_with_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredConversations(filtered);
    }
  }, [searchQuery, conversations]);

  useEffect(() => {
    // Load hidden conversations first, then load conversations
    const initializeData = async () => {
      await loadHiddenConversations();
      await loadConversations();
    };
    
    initializeData();
    
    // Clear message badge count when chats screen loads
    try {
      const { badgeCounter } = require('@/utils/badgeCounter');
      badgeCounter.decrementBadgeCount('messages');
    } catch (error) {
      error('[ChatRoomsList] Error clearing message badge:', error);
    }
  }, []);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!user?.id) return;

    if (__DEV__) log('[ChatRoomsList] 🔔 Setting up real-time subscription for conversation updates');

    // Defensive cleanup in case a previous effect left a subscribed channel alive.
    if (conversationsChannelRef.current) {
      try {
        supabase.removeChannel(conversationsChannelRef.current);
      } catch (cleanupErr) {
        warn('[ChatRoomsList] Failed to remove previous conversations channel:', cleanupErr);
      } finally {
        conversationsChannelRef.current = null;
      }
    }
    
    const handleInsertedMessage = async (message: any) => {
      if (!message?.id) return;
      if (__DEV__) {
        log('[ChatRoomsList] 🔔 New message received via real-time:', {
          messageId: message.id,
          senderId: message.sender_id,
          recipientId: message.recipient_id,
          content: message.content?.substring(0, 30)
        });
      }

      // Get the conversation partner ID
      const conversationPartnerId = message.sender_id === user.id
        ? message.recipient_id
        : message.sender_id;

      if (!conversationPartnerId) return;

      const isReceivedMessage = message.sender_id !== user.id;

      // If conversation is hidden but we received a new message, unhide it
      const wasHidden = hiddenConversations.has(conversationPartnerId);
      if (wasHidden && isReceivedMessage) {
        log(`[ChatRoomsList] Unhiding conversation ${conversationPartnerId} due to new message`);
        // Unhide the conversation locally first
        const newHidden = new Set(hiddenConversations);
        newHidden.delete(conversationPartnerId);
        setHiddenConversations(newHidden);
        await saveHiddenConversations(newHidden);
        // Also unhide on server - wait for it to complete
        try {
          await unhideConversationServer(conversationPartnerId);
          log(`[ChatRoomsList] Successfully unhid conversation ${conversationPartnerId} on server`);
          
          // Immediately create conversation entry so it appears right away
          const partnerProfile = await getUserProfile(conversationPartnerId);
          if (partnerProfile) {
            const newConversation: PrivateConversation = {
              id: conversationPartnerId,
              conversation_with: conversationPartnerId,
              conversation_with_name: partnerProfile.full_name || partnerProfile.username || 'Unknown User',
              conversation_with_avatar: partnerProfile.avatar_url || '',
              last_message_at: message.created_at,
              last_message_content: getMessagePreview(message),
              last_message_sender_id: message.sender_id,
              last_message_read: !!message.read,
              last_message_delivered: message.delivered !== false,
              unread_count: 1, // New message is unread
            };
            
            // Add to conversations list immediately
            setConversations(prev => {
              // Check if already exists (shouldn't, but just in case)
              const exists = prev.find(c => c.conversation_with === conversationPartnerId);
              if (exists) return prev;
              // Add to top
              return [newConversation, ...prev];
            });
            
            setFilteredConversations(prev => {
              const exists = prev.find(c => c.conversation_with === conversationPartnerId);
              if (exists) return prev;
              return [newConversation, ...prev];
            });
            
            // Cache it
            upsertConversationInCache(newConversation).catch(err => {
              error('[ChatRoomsList] Error caching unhidden conversation:', err);
            });
            
            log(`[ChatRoomsList] ✅ Added unhidden conversation to list immediately`);
          }
          
          // Also refresh to get full conversation data
          setTimeout(() => {
            loadConversations();
          }, 500);
        } catch (err) {
          error('[ChatRoomsList] Error unhiding conversation on server:', err);
        }
        // Continue processing the message - don't return early
      } else if (wasHidden) {
        // Conversation is hidden and this is a sent message - skip it
        return;
      }

      // Update conversation in real-time
      setConversations(prevConversations => {
        // Check if conversation already exists
        const existingIndex = prevConversations.findIndex(
          conv => conv.conversation_with === conversationPartnerId
        );

        if (existingIndex >= 0) {
          // Update existing conversation
          const updated = [...prevConversations];
          const conversation = updated[existingIndex];
          
          // Update conversation data
          const updatedConversation: PrivateConversation = {
            ...conversation,
            last_message_content: getMessagePreview(message),
            last_message_at: message.created_at,
            last_message_sender_id: message.sender_id,
            last_message_read: !!message.read,
            last_message_delivered: message.delivered !== false,
            unread_count: isReceivedMessage 
              ? (conversation.unread_count || 0) + 1 
              : conversation.unread_count, // Don't increment for sent messages
          };

          // Move to top (most recent first)
          updated.splice(existingIndex, 1);
          updated.unshift(updatedConversation);

          // Update filtered conversations too
          setFilteredConversations(prevFiltered => {
            const filteredIndex = prevFiltered.findIndex(
              conv => conv.conversation_with === conversationPartnerId
            );
            if (filteredIndex >= 0) {
              const updatedFiltered = [...prevFiltered];
              updatedFiltered.splice(filteredIndex, 1);
              updatedFiltered.unshift(updatedConversation);
              return updatedFiltered;
            }
            return prevFiltered;
          });

          // Update cache
          upsertConversationInCache(updatedConversation).catch(err => {
            error('[ChatRoomsList] Error updating cache:', err);
          });

          if (__DEV__) {
            log('[ChatRoomsList] ✅ Updated conversation in real-time:', {
              conversationId: conversationPartnerId,
              isReceived: isReceivedMessage,
              unreadCount: updatedConversation.unread_count
            });
          }
          return updated;
        } else {
          // New conversation (or was hidden and just unhidden) - fetch full conversation data
          if (__DEV__) log('[ChatRoomsList] New conversation detected, fetching full data...');
          // Use setTimeout to avoid dependency issues
          setTimeout(() => {
            loadConversations(); // Refresh to get full conversation data
          }, 0);
          // Return current conversations - loadConversations will update them
          return prevConversations;
        }
      });
    };

    const channel = supabase
      // Use a unique topic per mount so callbacks are always attached before subscribe.
      .channel(`conversations:${user.id}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          // IMPORTANT: realtime filter syntax uses '=' not '.'
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          await handleInsertedMessage(payload.new);
        }
      )
      // Also listen for messages we SENT (separate filter; avoids unsupported OR filters)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `sender_id=eq.${user.id}`,
        },
        async (payload) => {
          await handleInsertedMessage(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const message = payload.new;
          // Only handle read status updates
          if (payload.old.read !== message.read && message.read) {
            log('[ChatRoomsList] 🔔 Message marked as read:', message.id);
            
            const conversationPartnerId = message.sender_id;
            
            // Update unread count in conversation list
            setConversations(prevConversations => {
              const existingIndex = prevConversations.findIndex(
                conv => conv.conversation_with === conversationPartnerId
              );
              
              if (existingIndex >= 0) {
                const updated = [...prevConversations];
                const conversation = updated[existingIndex];
                
                // Decrease unread count
                const newUnreadCount = Math.max(0, (conversation.unread_count || 0) - 1);
                
                updated[existingIndex] = {
                  ...conversation,
                  unread_count: newUnreadCount,
                };
                
                // Update filtered conversations too
                setFilteredConversations(prevFiltered => {
                  const filteredIndex = prevFiltered.findIndex(
                    conv => conv.conversation_with === conversationPartnerId
                  );
                  if (filteredIndex >= 0) {
                    const updatedFiltered = [...prevFiltered];
                    updatedFiltered[filteredIndex] = updated[existingIndex];
                    return updatedFiltered;
                  }
                  return prevFiltered;
                });
                
                // Update cache
                upsertConversationInCache(updated[existingIndex]).catch(err => {
                  error('[ChatRoomsList] Error updating cache:', err);
                });
                
                return updated;
              }
              
              return prevConversations;
            });
          }
        }
      )
      // Listen for conversation deletions (hidden_conversations INSERT = conversation hidden)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hidden_conversations',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const hidden = payload.new;
          if (!hidden?.partner_id) return;

          if (__DEV__) {
            log('[ChatRoomsList] 🔔 Conversation hidden via real-time:', {
              partnerId: hidden.partner_id
            });
          }

          // Add to hidden set
          setHiddenConversations(prev => {
            const updated = new Set(prev);
            updated.add(hidden.partner_id);
            return updated;
          });

          // Remove from conversations list immediately
          setConversations(prevConversations => {
            const filtered = prevConversations.filter(
              conv => conv.conversation_with !== hidden.partner_id
            );
            return filtered;
          });
          setFilteredConversations(prevFiltered => {
            const filtered = prevFiltered.filter(
              conv => conv.conversation_with !== hidden.partner_id
            );
            return filtered;
          });
        }
      )
      // Listen for conversation un-hiding (hidden_conversations DELETE = conversation restored)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'hidden_conversations',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const hidden = payload.old;
          if (!hidden?.partner_id) return;

          if (__DEV__) {
            log('[ChatRoomsList] 🔔 Conversation un-hidden via real-time:', {
              partnerId: hidden.partner_id
            });
          }

          // Remove from hidden set
          setHiddenConversations(prev => {
            const updated = new Set(prev);
            updated.delete(hidden.partner_id);
            return updated;
          });

          // Reload conversations to show the restored conversation
          setTimeout(() => {
            loadConversations();
          }, 100);
        }
      )
      .subscribe((status) => {
        if (__DEV__) log('[ChatRoomsList] 📡 Conversation subscription status:', status);
        if (status === 'SUBSCRIBED') {
          if (__DEV__) log('[ChatRoomsList] ✅ Successfully subscribed to conversation updates');
        }
      });
    conversationsChannelRef.current = channel;

    return () => {
      if (__DEV__) log('[ChatRoomsList] Cleaning up conversation subscription');
      try {
        supabase.removeChannel(channel);
      } catch (cleanupErr) {
        warn('[ChatRoomsList] Error removing conversation channel:', cleanupErr);
      }
      if (conversationsChannelRef.current === channel) {
        conversationsChannelRef.current = null;
      }
    };
  }, [user?.id, hiddenConversations, loadConversations]);

  // Subscribe to typing indicators for a limited set of conversations (top N)
  useEffect(() => {
    if (!user?.id) {
      // Clean up all channels if no user
      typingChannelsRef.current.forEach((channel) => {
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          error('[ChatRoomsList] Error cleaning up typing channel:', error);
        }
      });
      typingChannelsRef.current.clear();
      return;
    }

    // Prefer currently visible list (filtered), fallback to full list
    const listForTyping = (filteredConversations.length ? filteredConversations : conversations)
      .slice(0, MAX_TYPING_SUBSCRIPTIONS);

    if (listForTyping.length === 0) {
      // Nothing to subscribe to; keep channels cleaned up
      typingChannelsRef.current.forEach((channel) => {
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          error('[ChatRoomsList] Error cleaning up typing channel:', error);
        }
      });
      typingChannelsRef.current.clear();
      return;
    }

    if (__DEV__) {
      log('[ChatRoomsList] 🔔 Setting up typing indicator subscriptions for', listForTyping.length, 'conversations (capped)');
    }

    // Get current conversation partner IDs
    const currentPartnerIds = new Set(listForTyping.map(conv => conv.conversation_with));

    // Clean up channels for conversations that no longer exist
    typingChannelsRef.current.forEach((channel, conversationId) => {
      if (!currentPartnerIds.has(conversationId)) {
        if (__DEV__) log('[ChatRoomsList] Removing typing channel for removed conversation:', conversationId);
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          error('[ChatRoomsList] Error cleaning up typing channel:', error);
        }
        typingChannelsRef.current.delete(conversationId);
        
        // Clear timeout for removed conversation
        const timeout = typingTimeoutsRef.current.get(conversationId);
        if (timeout) {
          clearTimeout(timeout);
          typingTimeoutsRef.current.delete(conversationId);
        }
        
        // Also clear typing state for removed conversation
        setTypingUsers(prev => {
          const updated = new Map(prev);
          updated.delete(conversationId);
          return updated;
        });
      }
    });

    // Subscribe to typing channels for each conversation
    listForTyping.forEach(conversation => {
      const conversationPartnerId = conversation.conversation_with;
      
      // Skip if already subscribed
      if (typingChannelsRef.current.has(conversationPartnerId)) {
        return;
      }

      // Create consistent channel name (same format as chat screen)
      const sortedIds = [user.id, conversationPartnerId].sort();
      const channelName = `typing_${sortedIds[0]}_${sortedIds[1]}`;

      if (__DEV__) log('[ChatRoomsList] Subscribing to typing channel:', channelName);

      // Create typing channel
      const typingChannel = supabase.channel(channelName, {
        config: {
          broadcast: { self: false }, // Don't receive our own typing events
          presence: { key: channelName },
        }
      });

      // Listen for typing events
      typingChannel
        .on('broadcast', { event: 'typing' }, (payload) => {
          if (!payload.payload) return;
          
          const { user_id, typing } = payload.payload;
          
          // Only handle typing from the conversation partner
          if (user_id === conversationPartnerId) {
            if (__DEV__) log('[ChatRoomsList] 💬 Typing event:', { conversationPartnerId, typing });
            
            // Clear existing timeout if any
            const existingTimeout = typingTimeoutsRef.current.get(conversationPartnerId);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
              typingTimeoutsRef.current.delete(conversationPartnerId);
            }
            
            setTypingUsers(prev => {
              const updated = new Map(prev);
              if (typing) {
                updated.set(conversationPartnerId, true);
                
                // Auto-clear typing after 4 seconds
                const timeout = setTimeout(() => {
                  setTypingUsers(prevMap => {
                    const newMap = new Map(prevMap);
                    newMap.delete(conversationPartnerId);
                    return newMap;
                  });
                  typingTimeoutsRef.current.delete(conversationPartnerId);
                }, 4000);
                
                typingTimeoutsRef.current.set(conversationPartnerId, timeout);
              } else {
                updated.delete(conversationPartnerId);
              }
              return updated;
            });
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (__DEV__) log('[ChatRoomsList] ✅ Subscribed to typing channel:', channelName);
          }
        });

      typingChannelsRef.current.set(conversationPartnerId, typingChannel);
    });

    // Cleanup function
    return () => {
      if (__DEV__) log('[ChatRoomsList] Cleaning up typing indicator subscriptions');
      
      // Clear all typing timeouts
      typingTimeoutsRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
      typingTimeoutsRef.current.clear();
      
      // Remove all typing channels
      typingChannelsRef.current.forEach((channel) => {
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          error('[ChatRoomsList] Error cleaning up typing channel:', error);
        }
      });
      typingChannelsRef.current.clear();
    };
  }, [user?.id, conversations, filteredConversations]);

  // Reload conversations when hidden conversations change
  useEffect(() => {
    if (hiddenConversations.size > 0) {
      loadConversations();
    }
  }, [hiddenConversations, loadConversations]);

  const handleConversationPress = useCallback(async (conversation: PrivateConversation) => {
    // WhatsApp-style: clear unread locally immediately (then sync server)
    const cleared: PrivateConversation = { ...conversation, unread_count: 0 };
    setConversations(prev => prev.map(c => c.conversation_with === conversation.conversation_with ? { ...c, unread_count: 0 } : c));
    setFilteredConversations(prev => prev.map(c => c.conversation_with === conversation.conversation_with ? { ...c, unread_count: 0 } : c));
    upsertConversationInCache(cleared).catch(() => {});

    // Mark messages as read on server (non-blocking)
    markConversationAsRead(conversation.conversation_with).catch(() => {});
    
    // Navigate to private chat using the main chat route
    router.push(`/chat/${conversation.conversation_with}`);
  }, [router]);

  const handleDeleteConversation = useCallback(async (conversation: PrivateConversation) => {
    Alert.alert(
      'Delete Conversation',
      `Are you sure you want to delete your conversation with ${conversation.conversation_with_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              log('Starting deletion process for conversation:', conversation.conversation_with);
              
              // Immediately remove from UI state for better UX
              const updatedConversations = conversations.filter(c => c.conversation_with !== conversation.conversation_with);
              setConversations(updatedConversations);
              setFilteredConversations(updatedConversations);
              log('Immediately removed conversation from UI');
              
              // Actually delete messages from the database
              const deleteSuccess = await deleteConversation(conversation.conversation_with);
              if (!deleteSuccess) {
                warn('Some messages may not have been deleted, but continuing with hide...');
              }
              
              // Also hide the conversation to prevent it from reappearing
              // This ensures it won't reappear even if messages still exist in the database
              await hideConversation(conversation.conversation_with);
              
              // Remove from caches to prevent stale data
              await removeConversationFromCache(conversation.conversation_with);
              await clearConversationCache(conversation.conversation_with);
              
              log('Conversation successfully deleted and removed from your view permanently');
              
            } catch (error) {
              error('Error deleting conversation:', error);
              Alert.alert('Error', 'Failed to delete conversation');
            }
          }
        }
      ]
    );
  }, [conversations, hideConversation]);

  const renderConversationItem = useCallback(({ item: conversation }: { item: PrivateConversation }) => {
    const hasUnreadMessages = conversation.unread_count > 0;
    const isTyping = typingUsers.get(conversation.conversation_with) || false;
    const isLastMessageFromMe = conversation.last_message_sender_id === user?.id;
    const lastDelivered = conversation.last_message_delivered !== false; // default true
    const lastRead = !!conversation.last_message_read;
    
    // Debug logging to see unread counts
    if (__DEV__ && conversation.unread_count > 0) {
      log(`[ChatRoomsList] Unread messages for ${conversation.conversation_with_name}: ${conversation.unread_count}`);
    }
    
    return (
      <SwipeableRow
        onDelete={() => handleDeleteConversation(conversation)}
      >
        <TouchableOpacity
          style={[
            styles.conversationItem, 
            hasUnreadMessages && styles.unreadConversationItem,
            { 
              backgroundColor: hasUnreadMessages 
                ? (isDarkMode ? '#1a2332' : '#f0f8ff') // Unique unread background color
                : themeColors.surface,
              borderLeftWidth: hasUnreadMessages ? 3 : 0,
              borderLeftColor: hasUnreadMessages ? '#007AFF' : 'transparent', // Blue accent for unread
            }
          ]}
          onPress={() => handleConversationPress(conversation)}
          activeOpacity={0.7}
        >
        <View style={styles.avatarContainer}>
          <EnhancedAvatar
            avatarUrl={conversation.conversation_with_avatar}
            fullName={conversation.conversation_with_name}
            size={40}
            isDarkMode={isDarkMode}
          />
          {conversation.unread_count > 0 && (
            <View style={[
              styles.unreadBadge, 
              { 
                backgroundColor: '#FFFFFF', // White background for green text
                shadowColor: '#10B981',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 3,
              }
            ]}>
              <Text style={styles.unreadText}>
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
                          <Text style={[
                styles.conversationName, 
                { 
                  color: hasUnreadMessages 
                    ? (isDarkMode ? '#ffffff' : '#1a1a1a') // Bolder text for unread
                    : themeColors.text,
                  fontWeight: hasUnreadMessages ? '600' : '500' // Semi-bold for unread
                }
              ]} numberOfLines={1}>
              {conversation.conversation_with_name}
            </Text>
            <Text style={[
              styles.timestamp, 
              { 
                color: hasUnreadMessages 
                  ? (isDarkMode ? '#007AFF' : '#007AFF') // Blue timestamp for unread
                  : themeColors.textTertiary,
                fontWeight: hasUnreadMessages ? '600' : '400' // Semi-bold for unread
              }
            ]}>
              {conversation.last_message_at 
                ? formatTimestamp(conversation.last_message_at)
                : 'New'
              }
            </Text>
          </View>
          
          {isTyping ? (
            <View style={styles.typingIndicatorWrapper}>
              <CompactTypingIndicator isDarkMode={isDarkMode} />
              <Text style={[
                styles.typingText,
                { 
                  color: hasUnreadMessages 
                    ? (isDarkMode ? '#007AFF' : '#007AFF')
                    : themeColors.textSecondary,
                }
              ]}>
                typing...
              </Text>
            </View>
          ) : (
            <View style={styles.lastMessageRow}>
              {isLastMessageFromMe && (
                <Ionicons
                  name={lastRead ? 'checkmark-done' : lastDelivered ? 'checkmark' : 'time-outline'}
                  size={16}
                  style={[
                    styles.lastMessageStatusIcon,
                    { color: lastRead ? '#34B7F1' : themeColors.textTertiary } // WhatsApp blue for read
                  ]}
                />
              )}
              <Text style={[
                styles.lastMessage, 
                { 
                  color: hasUnreadMessages 
                    ? (isDarkMode ? '#e0e0e0' : '#2c2c2c') // More prominent text for unread
                    : themeColors.textSecondary,
                  fontWeight: hasUnreadMessages ? '500' : '400' // Medium weight for unread
                }
              ]} numberOfLines={1}>
                {conversation.last_message_content || 'No messages yet'}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </SwipeableRow>
  );
  }, [handleConversationPress, handleDeleteConversation, themeColors, isDarkMode, typingUsers, user?.id]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIconContainer, { backgroundColor: themeColors.surface }]}>
        <Ionicons name="chatbubbles-outline" size={28} color={themeColors.textTertiary} />
      </View>
      <Text style={[styles.emptyStateTitle, { color: themeColors.text }]}>No conversations yet</Text>
      <Text style={[styles.emptyStateSubtitle, { color: themeColors.textSecondary }]}>
        {searchQuery ? 'No conversations match your search' : 'Start chatting with someone to see conversations here'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary.main} />
        <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading conversations...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
             <View style={[styles.header, {
              backgroundColor: themeColors.background,
              paddingTop: compactTop ? 8 : insets.top + 24,
            }]}>
               <View style={styles.headerTopRow}>
                 <Text style={[styles.headerTitle, { color: themeColors.text }]}>Messages</Text>
                 <View style={styles.headerButtons}>
                   <TouchableOpacity 
                     onPress={onRefresh}
                     style={styles.refreshButton}
                   >
                     <Ionicons name="refresh" size={20} color={themeColors.textTertiary} />
                   </TouchableOpacity>
                 </View>
               </View>
               <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
                 {filteredConversations.length} conversation{filteredConversations.length !== 1 ? 's' : ''}
               </Text>
             </View>

      {/* Modern Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.modernSearchContainer, { 
          backgroundColor: themeColors.surface,
          borderColor: themeColors.border,
        }]}>
          <View style={styles.searchIconContainer}>
            <Ionicons name="search" size={14} color={themeColors.textTertiary} />
          </View>
          <TextInput
            placeholder="Search conversations..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.modernSearchInput, { 
              color: themeColors.text,
              placeholderTextColor: themeColors.textTertiary 
            }]}
            placeholderTextColor={themeColors.textTertiary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.modernClearButton}
            >
              <Ionicons name="close" size={14} color={themeColors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Conversations List */}
      <FlatList
        data={filteredConversations}
        renderItem={renderConversationItem}
        keyExtractor={(item) => item.conversation_with}
        contentContainerStyle={[
          styles.listContainer, 
          { 
            backgroundColor: themeColors.background,
            paddingBottom: Math.max(insets.bottom, 24) + 80, // Account for bottom nav bar (80px) + safe area
          }
        ]}
        style={{ backgroundColor: themeColors.background }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshing={refreshing}
        onRefresh={onRefresh}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        getItemLayout={(data, index) => ({
          length: 80, // Approximate height of conversation item + separator
          offset: 80 * index,
          index,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    paddingBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.3,
    marginBottom: 4,
    lineHeight: 26,
  },
  headerSubtitle: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    opacity: 0.6,
    lineHeight: 20,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 16,
  },
  modernSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  searchIconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    opacity: 0.7,
  },
  modernSearchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 20,
  },
  modernClearButton: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  listContainer: {
    paddingHorizontal: 24,
    // paddingBottom is set dynamically in contentContainerStyle to account for bottom nav bar
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 0,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  unreadConversationItem: {
    // Enhanced shadow for unread messages
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadText: {
    color: '#10B981', // App green color
    fontSize: 10,
    fontFamily: 'Inter-Black',
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  conversationInfo: {
    flex: 1,
    marginRight: 12,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  lastMessage: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
    opacity: 0.7,
  },
  lastMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessageStatusIcon: {
    marginRight: 6,
    marginTop: 1,
  },
  timestamp: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    opacity: 0.7,
    letterSpacing: 0.1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 17,
    fontFamily: 'Inter-Regular',
    opacity: 0.6,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    opacity: 0.7,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  emptyStateSubtitle: {
    fontSize: 17,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.6,
    paddingHorizontal: 24,
  },
  separator: {
    height: 0,
  },
  searchInputWrapper: {
    flex: 1,
  },
  searchInputInner: {
    paddingHorizontal: 0,
  },
  typingIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 4,
  },
  typingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  typingIndicatorWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typingText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
}); 