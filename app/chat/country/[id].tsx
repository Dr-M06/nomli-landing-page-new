import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Animated,
  Modal,
  Alert,
  Dimensions,
  Pressable,
  Keyboard,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  ChevronLeft, 
  Send, 
  Users, 
  Bookmark, 
  Pin, 
  Copy, 
  MoreVertical,
  X,
  Sparkles,
  Reply,
  CornerUpLeft,
  Edit,
  Trash2,
  Check,
  ChevronDown,
  Bell,
  BellOff,
  UserPlus,
  MessageCircle,
  Snowflake,
  Coins,
} from 'lucide-react-native';
import ViewerJoinAnnouncement from '../../../components/ViewerJoinAnnouncement';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/Colors';
import useAuth from '../../../hooks/useAuth';
import { renderTextWithHashtags } from '../../../utils/textFormatting';
import { 
  fetchCountryChatMessages, 
  sendCountryChatMessage,
  trackOnlineUsers,
  bookmarkMessage,
  removeBookmark,
  checkBookmarkedMessages,
  getBookmarkedMessagesForRoom,
  deleteMessage,
  updateMessage,
  ChatMessage,
  OnlineUser,
} from '../../../utils/countryChat';
import { supabase } from '../../../utils/supabase';
import SimpleAvatar from '../../../components/SimpleAvatar';
import { useChatStore } from '../../../app/store/useChatStore';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useFollowers from '../../../hooks/useFollowers';
import { sendMessage } from '../../../utils/chat';
import { creditUser } from '../../../utils/creditService';
import CreditModal from '../../../components/CreditModal';
import { log, warn, error } from '../../../utils/productionLogger';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Format message date for separators
const formatMessageDate = (timestamp: string): string => {
  const messageDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Reset time to compare dates only
  const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  
  if (messageDateOnly.getTime() === todayOnly.getTime()) {
    return 'Today';
  } else if (messageDateOnly.getTime() === yesterdayOnly.getTime()) {
    return 'Yesterday';
  } else {
    // Format as "Month Day, Year" (e.g., "Jan 15, 2024")
    return messageDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  }
};

export default function CountryChatScreen() {
  const router = useRouter();
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]); // Ref to access messages without causing re-renders
  const [bookmarkedMessageIds, setBookmarkedMessageIds] = useState<Set<string>>(new Set());
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [roomName, setRoomName] = useState('World Chat');
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [activeTab, setActiveTab] = useState<'messages' | 'pinned' | 'bookmarks'>('messages');
  const [bookmarkedMessages, setBookmarkedMessages] = useState<ChatMessage[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [joinAnnouncement, setJoinAnnouncement] = useState<{
    visible: boolean;
    username: string;
    fullName?: string;
    avatarUrl?: string;
  }>({
    visible: false,
    username: '',
  });
  const [bellMuted, setBellMuted] = useState(false);
  const [iceMode, setIceMode] = useState(false); // Ice mode: slows chat down (disables auto-scroll)
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  
  // Profile modal state (same as livestream)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>('');
  const [selectedUserAvatar, setSelectedUserAvatar] = useState<string | undefined>(undefined);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isProfilePrivate, setIsProfilePrivate] = useState<boolean>(false);
  const [profilePrivacyLoaded, setProfilePrivacyLoaded] = useState<boolean>(false);
  const [modalMessageText, setModalMessageText] = useState<string>('');
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditingUser, setCreditingUser] = useState<boolean>(false);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  
  // Follow functionality for selected user
  const {
    isFollowingUser,
    followLoading,
    toggleFollow,
    refreshAll: refreshFollowStatus
  } = useFollowers(selectedUserId || undefined);
  
  const inputRef = useRef<TextInput>(null);
  const editInputRef = useRef<TextInput>(null);
  
  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true); // Track if user is near bottom
  const [showScrollToBottom, setShowScrollToBottom] = useState(false); // Show "scroll to bottom" button
  const channelRef = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);
  const previousOnlineUserIdsRef = useRef<Set<string>>(new Set()); // Track previous online users to detect joins
  const isInitialSyncRef = useRef(true); // Track if this is the first sync (skip announcements)
  const processedMessageIdsRef = useRef<Set<string>>(new Set()); // Track processed message IDs to prevent duplicates
  const usernameCacheRef = useRef<Map<string, string>>(new Map()); // Cache usernames to avoid repeated API calls
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null); // Fallback polling if real-time fails
  const lastPolledMessageIdRef = useRef<string | null>(null); // Track last message ID for polling
  const { 
    setCountryChatMessages, 
    addCountryChatMessage,
    countryChatMessages,
    countryChatLastFetched 
  } = useChatStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;


  // Load ice mode preference
  useEffect(() => {
    const loadIceMode = async () => {
      try {
        const stored = await AsyncStorage.getItem(`country_chat_ice_mode_${roomId}`);
        if (stored === 'true') {
          setIceMode(true);
        }
      } catch (error) {
        error('[CountryChat] Error loading ice mode:', error);
      }
    };
    if (roomId) {
      loadIceMode();
    }
  }, [roomId]);

  // Load ice mode preference
  useEffect(() => {
    const loadIceMode = async () => {
      try {
        const stored = await AsyncStorage.getItem(`country_chat_ice_mode_${roomId}`);
        if (stored === 'true') {
          setIceMode(true);
        }
      } catch (error) {
        error('[CountryChat] Error loading ice mode:', error);
      }
    };
    if (roomId) {
      loadIceMode();
    }
  }, [roomId]);

  // Check if terms have been accepted
  useEffect(() => {
    const checkTermsAccepted = async () => {
      try {
        const stored = await AsyncStorage.getItem('country_chat_terms_accepted');
        if (stored === 'true') {
          setTermsAccepted(true);
          setShowTermsModal(false);
        } else {
          setShowTermsModal(true);
        }
      } catch (error) {
        error('[CountryChat] Error checking terms acceptance:', error);
        // If error, show modal to be safe
        setShowTermsModal(true);
      }
    };
    checkTermsAccepted();
  }, []);

  // Handle terms acceptance
  const handleAcceptTerms = useCallback(async () => {
    try {
      await AsyncStorage.setItem('country_chat_terms_accepted', 'true');
      setTermsAccepted(true);
      setShowTermsModal(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      error('[CountryChat] Error saving terms acceptance:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to save acceptance',
        position: 'top',
        visibilityTime: 2000,
      });
    }
  }, []);

  // Load bell mute preference
  useEffect(() => {
    const loadBellPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(`country_chat_bell_muted_${roomId}`);
        if (stored !== null) {
          setBellMuted(JSON.parse(stored));
        }
      } catch (error) {
        error('[CountryChat] Error loading bell preference:', error);
      }
    };
    if (roomId) {
      loadBellPreference();
    }
  }, [roomId]);

  // Toggle ice mode
  const toggleIceMode = useCallback(async () => {
    const newIceModeState = !iceMode;
    setIceMode(newIceModeState);
    try {
      await AsyncStorage.setItem(`country_chat_ice_mode_${roomId}`, JSON.stringify(newIceModeState));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Toast.show({
        type: 'success',
        text1: newIceModeState ? 'Ice mode ON - Chat slowed down' : 'Ice mode OFF - Auto-scroll enabled',
        position: 'top',
        visibilityTime: 2000,
      });
    } catch (error) {
      error('[CountryChat] Error saving ice mode preference:', error);
    }
  }, [iceMode, roomId]);

  // Toggle bell mute
  const toggleBellMute = useCallback(async () => {
    const newMutedState = !bellMuted;
    setBellMuted(newMutedState);
    try {
      await AsyncStorage.setItem(`country_chat_bell_muted_${roomId}`, JSON.stringify(newMutedState));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Toast.show({
        type: 'success',
        text1: newMutedState ? 'Join sounds muted' : 'Join sounds enabled',
        position: 'top',
        visibilityTime: 1500,
      });
    } catch (error) {
      error('[CountryChat] Error saving bell preference:', error);
    }
  }, [bellMuted, roomId]);

  // Fetch room info
  useEffect(() => {
    const fetchRoomInfo = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_rooms')
          .select('country_code, description')
          .eq('id', roomId)
          .single();
        
        if (!error && data) {
          // Use description if available, otherwise show "World Chat" for NG code
          setRoomName(data.description || (data.country_code === 'NG' ? 'World Chat' : `${data.country_code} Chat`));
        }
      } catch (error) {
        error('[CountryChat] Error fetching room info:', error);
      }
    };
    
    if (roomId) {
      fetchRoomInfo();
    }
  }, [roomId]);

  // Load bookmarked message IDs and full messages
  const loadBookmarkedMessages = useCallback(async () => {
    if (!user?.id || !roomId) return;
    
    try {
      const bookmarkedIds = await getBookmarkedMessagesForRoom(user.id, roomId);
      setBookmarkedMessageIds(new Set(bookmarkedIds));
      
      // Load full bookmarked messages for the bookmarks tab
      if (bookmarkedIds.length > 0) {
        const { data: bookmarkedMessagesData, error } = await supabase
          .from('chat_messages')
          .select(`
            *,
            profile:user_id(
              id,
              username,
              full_name,
              avatar_url
            )
          `)
          .in('id', bookmarkedIds)
          .order('created_at', { ascending: false });
        
        if (!error && bookmarkedMessagesData) {
          // Get username from profile table (same pattern as community posts)
          const formatted = bookmarkedMessagesData.map(msg => {
            let username = 'Unknown User';
            if (msg.profile?.username) {
              username = msg.profile.username;
            } else if (msg.username) {
              username = msg.username;
            } else if (msg.user_email) {
              username = msg.user_email.split('@')[0];
            }
            return {
              ...msg,
              username,
            };
          });
          setBookmarkedMessages(formatted);
        }
      } else {
        setBookmarkedMessages([]);
      }
    } catch (error) {
      error('[CountryChat] Error loading bookmarks:', error);
    }
  }, [user?.id, roomId]);

  // Fetch messages with caching
  const loadMessages = useCallback(async () => {
    if (!roomId) return;
    
    try {
      setLoading(true);
      
      // Check cache first (stale-while-revalidate pattern)
      // Access store values directly without making them dependencies
      const cachedMessages = countryChatMessages[roomId];
      const lastFetched = countryChatLastFetched[roomId];
      const cacheAge = lastFetched ? Date.now() - lastFetched : Infinity;
      const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
      
      // Only use cache on initial load (when no messages exist yet)
      // Real-time updates take priority - don't use cache if messages already exist
      const hasExistingMessages = messages.length > 0 || messagesRef.current.length > 0;
      
      if (!hasExistingMessages && cachedMessages && cachedMessages.length > 0 && cacheAge < CACHE_MAX_AGE) {
        log('[CountryChat] Using cached messages (initial load only):', cachedMessages.length);
        const reversedMessages = [...cachedMessages].reverse();
        
        // Separate pinned messages
        const pinned = reversedMessages.filter(m => m.is_pinned);
        const unpinned = reversedMessages.filter(m => !m.is_pinned);
        
        // Set messages immediately
        setPinnedMessages(pinned);
        setMessages(unpinned);
        messagesRef.current = unpinned;
        
        // Load bookmarks
        await loadBookmarkedMessages();
        
        // Animate in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
        
        setLoading(false);
        
        // Fetch fresh data immediately in background (real-time will merge)
        setTimeout(() => {
          fetchFreshMessages();
        }, 300); // Short delay to show cache first, then refresh
        return;
      }
      
      // Fetch fresh messages
      await fetchFreshMessages();
    } catch (error) {
      error('[CountryChat] Error loading messages:', error);
      setLoading(false);
    }
  }, [roomId, loadBookmarkedMessages]); // FIX: Remove store dependencies to prevent re-runs

  const fetchFreshMessages = useCallback(async () => {
    if (!roomId) return;
    
    try {
      // Reduced from 100 to 50 for faster loading on slow connections
      const fetchedMessages = await fetchCountryChatMessages(roomId, 50);
      
      // Reverse to show oldest first (for FlatList)
      const reversedMessages = [...fetchedMessages].reverse();
      
      // Merge with existing messages to preserve real-time updates
      // CRITICAL: Real-time messages take priority - existing state messages are more up-to-date
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        
        // Start with existing messages (real-time updates are already here)
        const merged = [...prev];
        
        // Only add messages from fetch that don't exist yet
        reversedMessages.forEach(msg => {
          if (!msg.is_pinned && !existingIds.has(msg.id)) {
            merged.push(msg);
          }
          // If message already exists in state, keep the state version (it's from real-time, more up-to-date)
        });
        
        // Sort by created_at to maintain order
        const sorted = merged.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        
        // Update ref and cache with merged messages (preserving real-time updates)
        messagesRef.current = sorted;
        
        // Update cache asynchronously to not block UI
        setTimeout(() => {
          setCountryChatMessages(roomId, sorted);
        }, 0);
        
        return sorted;
      });
      
      setPinnedMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newPinned = reversedMessages.filter(m => m.is_pinned && !existingIds.has(m.id));
        const merged = [...prev];
        newPinned.forEach(msg => {
          if (!merged.find(m => m.id === msg.id)) {
            merged.push(msg);
          }
        });
        return merged.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
      
      // Update cache with merged messages (preserving real-time updates)
      // Don't overwrite cache here - it's updated in setMessages above
      
      // Load bookmarks
      await loadBookmarkedMessages();
      
      // Animate in only if not already visible
      if ((fadeAnim as any)._value < 1) {
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
      
      // Only auto-scroll if user is near bottom (not reading old messages)
      if (isNearBottomRef.current) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 100);
      }
    } catch (error) {
      error('[CountryChat] Error fetching fresh messages:', error);
    } finally {
      setLoading(false);
    }
  }, [roomId, loadBookmarkedMessages, fadeAnim]);

  // Load messages on mount and roomId change only
  useEffect(() => {
    if (roomId) {
      loadMessages();
    }
  }, [roomId]); // FIX: Only depend on roomId, not loadMessages

  // Set up real-time subscription
  useEffect(() => {
    if (!roomId || !user?.id) return;

    const channelName = `room:${roomId}`;
    const channel = supabase.channel(channelName);

    // Fallback polling function if real-time fails
    const startPollingFallback = () => {
      // Clear any existing polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      
      log('[CountryChat] Starting fallback polling for new messages (every 3 seconds)');
      
      pollingIntervalRef.current = setInterval(async () => {
        if (!roomId) return;
        
        try {
          // Fetch latest messages
          const latestMessages = await fetchCountryChatMessages(roomId, 5);
          if (latestMessages.length > 0) {
            const latestMessage = latestMessages[0];
            
            // Check if this is a new message we haven't seen
            if (latestMessage.id !== lastPolledMessageIdRef.current) {
              // Check if message already exists in state
              const exists = messagesRef.current.some(m => m.id === latestMessage.id);
              if (!exists) {
                log('[CountryChat] Polling found new message:', latestMessage.id);
                // Add new message to state (simulate real-time)
                setMessages(prev => {
                  const currentMessages = Array.isArray(prev) ? prev : [];
                  if (currentMessages.some(m => m.id === latestMessage.id)) {
                    return prev;
                  }
                  
                  // Find and remove matching temp message
                  const filtered = currentMessages.filter(m => {
                    if (m.id.startsWith('temp-') && 
                        m.user_id === latestMessage.user_id &&
                        m.content === latestMessage.content &&
                        (m.reply_to_id || null) === (latestMessage.reply_to_id || null)) {
                      return false;
                    }
                    return true;
                  });
                  
                  const updated = [...filtered, latestMessage];
                  messagesRef.current = updated;
                  return updated.sort((a, b) => 
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  );
                });
              }
              lastPolledMessageIdRef.current = latestMessage.id;
            }
          }
        } catch (error) {
          error('[CountryChat] Error in polling fallback:', error);
        }
      }, 3000); // Poll every 3 seconds
    };

    // 2GO-STYLE: No debounce - instant real-time updates!
    // Subscribe to INSERT events (new messages)
    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, async (payload) => {
        const messageId = payload.new.id;
        const messageUserId = payload.new.user_id;
        
        log('[CountryChat] Real-time message received:', { messageId, messageUserId, currentUserId: user?.id });
        
        // 2GO-STYLE: Instant real-time processing - no debounce delay!
        // Check if already processed (prevents duplicates)
        if (processedMessageIdsRef.current.has(messageId)) {
          log('[CountryChat] Message already processed, skipping:', messageId);
          return;
        }
        
        // Mark as processed immediately
        processedMessageIdsRef.current.add(messageId);
        log('[CountryChat] Processing new message:', messageId);
        
        // OPTIMIZATION: Use payload.new directly - real-time uses WebSockets (NO API calls!)
        const messagePayload = payload.new;
        
        // Get username with caching - show message immediately, update username in background if needed
        let username = messagePayload.username || 'Unknown User';
        
        // 2GO-STYLE: Show message instantly, fetch username in background if needed
        // Check cache first (instant, no API call)
        if (!messagePayload.username && messagePayload.user_id) {
          if (usernameCacheRef.current.has(messagePayload.user_id)) {
            username = usernameCacheRef.current.get(messagePayload.user_id) || 'Unknown User';
          } else {
            // Use email as fallback immediately, fetch username in background
            if (messagePayload.user_email) {
              username = messagePayload.user_email.split('@')[0];
            }
            
            // Fetch username in background (non-blocking) - message already shown
            (async () => {
              try {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('username')
                  .eq('id', messagePayload.user_id)
                  .single();
                
                if (profile?.username) {
                  usernameCacheRef.current.set(messagePayload.user_id, profile.username);
                  // Update message with correct username (if still in list)
                  setMessages(prev => {
                    const messageIndex = prev.findIndex(m => m.id === messageId);
                    if (messageIndex >= 0) {
                      const updated = [...prev];
                      updated[messageIndex] = { ...updated[messageIndex], username: profile.username };
                      return updated;
                    }
                    return prev;
                  });
                }
              } catch (error) {
                // Silently fail - message already shown with email fallback
              }
            })();
          }
        }
        
        // Handle reply username - check existing messages first (instant, no API call)
        let replyUsername = 'Unknown';
        if (messagePayload.reply_to_id) {
          // Use refs to avoid closure issues with state variables
          const allCurrentMessages = [...messagesRef.current];
          const existingReply = allCurrentMessages.find(m => m.id === messagePayload.reply_to_id);
          if (existingReply) {
            replyUsername = existingReply.username || 'Unknown';
          } else if (messagePayload.reply_to_user_id) {
            if (usernameCacheRef.current.has(messagePayload.reply_to_user_id)) {
              replyUsername = usernameCacheRef.current.get(messagePayload.reply_to_user_id) || 'Unknown';
            }
          }
        }
        
        // Build message object from payload (WebSocket data - NO API call!)
        const newMessage: ChatMessage = {
          id: messagePayload.id,
          room_id: messagePayload.room_id,
          user_id: messagePayload.user_id,
          content: messagePayload.content,
          created_at: messagePayload.created_at,
          is_ai_message: messagePayload.is_ai_message || false,
          is_ai: messagePayload.is_ai || false,
          username, // Use cached or fallback username (will update if profile fetch succeeds)
          reply_to_id: messagePayload.reply_to_id,
          reply_to_message: messagePayload.reply_to_id ? {
            id: messagePayload.reply_to_id,
            content: messagePayload.reply_to_content || '',
            user_id: messagePayload.reply_to_user_id || '',
            username: replyUsername,
          } : undefined,
        };
        
        // Add message instantly to UI - simplified logic
        setMessages(prev => {
          const currentMessages = Array.isArray(prev) ? prev : [];
          
          // Check if message already exists (by ID)
          if (currentMessages.some(m => m.id === newMessage.id)) {
            return prev;
          }
          
          // Find and remove matching temp message from same user with same content
          const filtered = currentMessages.filter(m => {
            // Remove temp message if it matches this real message
            if (m.id.startsWith('temp-') && 
                m.user_id === newMessage.user_id &&
                m.content === newMessage.content &&
                (m.reply_to_id || null) === (newMessage.reply_to_id || null)) {
              return false; // Remove temp message
            }
            return true; // Keep all other messages
          });
          
          // Add new real message
          const updated = [...filtered, newMessage];
          messagesRef.current = updated;
          
          // Sort by created_at
          const sorted = updated.sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          
          // Update cache asynchronously
          setTimeout(() => {
            addCountryChatMessage(roomId, newMessage);
          }, 0);
          
          return sorted;
        });
        
        setPinnedMessages(prev => {
          if (newMessage.is_pinned) {
            const exists = prev.find(m => m.id === newMessage.id);
            if (exists) return prev;
            return [...prev, newMessage];
          }
          return prev;
        });
        
        // Auto-scroll logic:
        // - If ice mode is OFF: Always auto-scroll to new messages (default behavior)
        // - If ice mode is ON: Only auto-scroll if user is near bottom (slows chat down)
        if (!iceMode) {
          // Ice mode OFF: Always auto-scroll (force scroll, don't check isNearBottomRef)
          log('[CountryChat] ✅ Auto-scrolling (ice mode OFF)');
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
                isNearBottomRef.current = true; // Update ref after scrolling
                log('[CountryChat] ✅ Scrolled to end');
              } else {
                log('[CountryChat] ⚠️ FlatList ref not available');
              }
            }, 150); // Increased delay to ensure content is rendered
          });
        } else if (isNearBottomRef.current) {
          // Ice mode ON: Only scroll if user is near bottom
          log('[CountryChat] Auto-scrolling (ice mode ON, near bottom)');
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
              }
            }, 150);
          });
        } else {
          log('[CountryChat] ⏸️ Not auto-scrolling (ice mode ON, not near bottom)');
        }
      })
      // Subscribe to UPDATE events (message edits) - like private chat
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, async (payload) => {
        const messageId = payload.new.id;
        const updatedContent = payload.new.content;
        
        log('[CountryChat] Real-time message UPDATE received:', { messageId, updatedContent });
        
        // Update message in state
        setMessages(prev => {
          const messageIndex = prev.findIndex(m => m.id === messageId);
          if (messageIndex >= 0) {
            const updated = [...prev];
            updated[messageIndex] = {
              ...updated[messageIndex],
              content: updatedContent,
              updated_at: payload.new.updated_at || updated[messageIndex].created_at,
            };
            messagesRef.current = updated;
            return updated;
          }
          return prev;
        });
        
        // Update pinned messages if applicable
        setPinnedMessages(prev => {
          const messageIndex = prev.findIndex(m => m.id === messageId);
          if (messageIndex >= 0) {
            const updated = [...prev];
            updated[messageIndex] = {
              ...updated[messageIndex],
              content: updatedContent,
              updated_at: payload.new.updated_at || updated[messageIndex].created_at,
            };
            return updated;
          }
          return prev;
        });
        
        // Update bookmarked messages if applicable
        setBookmarkedMessages(prev => {
          const messageIndex = prev.findIndex(m => m.id === messageId);
          if (messageIndex >= 0) {
            const updated = [...prev];
            updated[messageIndex] = {
              ...updated[messageIndex],
              content: updatedContent,
              updated_at: payload.new.updated_at || updated[messageIndex].created_at,
            };
            return updated;
          }
          return prev;
        });
        
        // Update cache
        const updatedMessage: ChatMessage = {
          id: payload.new.id,
          room_id: payload.new.room_id,
          user_id: payload.new.user_id,
          content: payload.new.content,
          created_at: payload.new.created_at,
          updated_at: payload.new.updated_at,
          is_ai_message: payload.new.is_ai_message || false,
          is_ai: payload.new.is_ai || false,
          username: payload.new.username || 'Unknown User',
        };
        addCountryChatMessage(roomId, updatedMessage);
      })
      // Subscribe to DELETE events (message deletions) - like private chat
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, async (payload) => {
        const messageId = payload.old.id;
        
        log('[CountryChat] Real-time message DELETE received:', { messageId });
        
        // Remove message from state
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== messageId);
          messagesRef.current = filtered;
          return filtered;
        });
        
        // Remove from pinned messages if applicable
        setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
        
        // Remove from bookmarked messages if applicable
        setBookmarkedMessages(prev => prev.filter(m => m.id !== messageId));
        setBookmarkedMessageIds(prev => {
          const updated = new Set(prev);
          updated.delete(messageId);
          return updated;
        });
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          log('[CountryChat] ✅ Real-time subscription active for room:', roomId);
        } else if (status === 'CHANNEL_ERROR') {
          error('[CountryChat] ❌ Real-time subscription error for room:', roomId, err);
          error('[CountryChat] ⚠️ Real-time may not be enabled for chat_messages table. Run migration: 20251229000000_enable_realtime_chat_messages.sql');
        } else if (status === 'TIMED_OUT') {
          error('[CountryChat] ⏱️ Real-time subscription timed out for room:', roomId);
          error('[CountryChat] ⚠️ This usually means the table is not in supabase_realtime publication.');
          error('[CountryChat] ⚠️ Please run migration: supabase/migrations/20251229000000_enable_realtime_chat_messages.sql');
          // Fallback: Start polling for new messages if real-time fails
          startPollingFallback();
        } else if (status === 'CLOSED') {
          warn('[CountryChat] ⚠️ Real-time subscription closed for room:', roomId);
        } else {
          log('[CountryChat] Real-time subscription status:', status, 'for room:', roomId);
        }
      });

    channelRef.current = channel;

    // Track online users and listen for joins
    if (user?.id) {
      // Fetch username from profiles for presence tracking
      const fetchPresenceUsername = async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', user.id)
            .single();
          
          if (profile?.username) {
            return profile.username;
          }
        } catch (error) {
          error('[CountryChat] Error fetching profile for presence:', error);
        }
        // Fallback to user_metadata or email
        return user.user_metadata?.username || user.email?.split('@')[0] || 'User';
      };
      
      // Fetch username and then track online users
      fetchPresenceUsername().then((presenceUsername) => {
        const presenceChannel = trackOnlineUsers(
          roomId,
          user.id,
          presenceUsername,
          undefined,
        (users) => {
          // Detect new joins by comparing with previous state
          const currentUserIds = new Set(users.map(u => u.id));
          
          // Skip announcements on initial sync (users already in room)
          if (isInitialSyncRef.current) {
            previousOnlineUserIdsRef.current = currentUserIds;
            isInitialSyncRef.current = false;
            setOnlineUsers(users);
            return;
          }
          
          const newUserIds = Array.from(currentUserIds).filter(id => !previousOnlineUserIdsRef.current.has(id) && id !== user?.id);
          
          // Update previous state
          previousOnlineUserIdsRef.current = currentUserIds;
          
          // Announce new joins
          if (newUserIds.length > 0) {
            newUserIds.forEach(async (newUserId) => {
              // Fetch user profile for avatar and full name
              const { data: profile } = await supabase
                .from('profiles')
                .select('username, full_name, avatar_url')
                .eq('id', newUserId)
                .single();

              if (profile) {
                setJoinAnnouncement({
                  visible: true,
                  username: profile.username || 'User',
                  fullName: profile.full_name,
                  avatarUrl: profile.avatar_url,
                });

                // Join sound removed
              }
            });
          }
          
          setOnlineUsers(users);
        }
        );
        presenceChannelRef.current = presenceChannel;

        // Also listen for direct join events (backup method)
        if (presenceChannel) {
          presenceChannel.on('presence', { event: 'join' }, async (payload: any) => {
          log('[CountryChat] Presence join event:', payload);
          const { key, newPresences } = payload;
          
          // Handle the presence structure - newPresences is an array of presence objects
          if (newPresences && Array.isArray(newPresences) && newPresences.length > 0) {
            // newPresences is an array, get the first presence object
            const joinedPresence = Array.isArray(newPresences[0]) ? newPresences[0][0] : newPresences[0];
            
            if (!joinedPresence || !joinedPresence.user_id) {
              log('[CountryChat] Invalid presence data:', joinedPresence);
              return;
            }
            
            // Skip if it's the current user
            if (joinedPresence.user_id === user?.id) {
              log('[CountryChat] Skipping own join');
              return;
            }

            log('[CountryChat] User joined:', joinedPresence.user_id);

            // Fetch user profile for avatar and full name
            const { data: profile } = await supabase
              .from('profiles')
              .select('username, full_name, avatar_url')
              .eq('id', joinedPresence.user_id)
              .single();

            if (profile) {
              setJoinAnnouncement({
                visible: true,
                username: profile.username || joinedPresence.username || 'User',
                fullName: profile.full_name,
                avatarUrl: profile.avatar_url || joinedPresence.avatar_url,
              });

              // Join sound removed
            } else {
              log('[CountryChat] Profile not found for user:', joinedPresence.user_id);
            }
          }
        });
        }
      });
    }

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      // Clean up presence channel
      if (presenceChannelRef.current) {
        presenceChannelRef.current.unsubscribe();
        presenceChannelRef.current = null;
      }
      // Clear processed message IDs when leaving room (allows fresh subscription on return)
      processedMessageIdsRef.current.clear();
      // Clear polling fallback
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      lastPolledMessageIdRef.current = null;
      // Keep username cache across room changes (usernames don't change often, reduces API calls)
    };
  }, [roomId, user?.id]); // CRITICAL: Only depend on roomId and user.id to prevent subscription re-creation

  // Generate icebreaker message
  const generateIcebreaker = useCallback(() => {
    const icebreakers = [
      "Hey! 👋",
      "Hi there! ✨",
      "Hey! Saw you in the chat 💬",
      "Hi! 👋 Nice to meet you!",
      "Hey! 👋 What's up?",
      "Hi! 👋 Great chat!",
      "Hey! 👋 Enjoying the conversation!",
      "Hi there! 👋",
    ];
    return icebreakers[Math.floor(Math.random() * icebreakers.length)];
  }, []);

  // Check if profile is private
  const checkProfilePrivacy = useCallback(async () => {
    if (!selectedUserId || !user) {
      setProfilePrivacyLoaded(true);
      return;
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('profile_visible, id')
        .eq('id', selectedUserId)
        .single();

      if (error) {
        error('[CountryChat] Error checking profile privacy:', error);
        setIsProfilePrivate(false);
      } else {
        setIsProfilePrivate(profile?.profile_visible === false);
      }
      setProfilePrivacyLoaded(true);
    } catch (error) {
      error('[CountryChat] Exception checking profile privacy:', error);
      setIsProfilePrivate(false);
      setProfilePrivacyLoaded(true);
    }
  }, [selectedUserId, user]);

  // Refresh follow status and check profile privacy when modal opens
  useEffect(() => {
    if (showProfileModal && selectedUserId) {
      setTimeout(() => {
        refreshFollowStatus();
        checkProfilePrivacy();
        setModalMessageText(generateIcebreaker());
      }, 100);
    } else {
      setModalMessageText('');
    }
  }, [showProfileModal, selectedUserId, refreshFollowStatus, checkProfilePrivacy, generateIcebreaker]);

  // Handle profile tap (same as livestream)
  const handleProfileTap = useCallback((userId: string, userName: string, userAvatar?: string) => {
    // Don't show modal for own profile
    if (userId === user?.id) return;
    
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setSelectedUserAvatar(userAvatar);
    setShowProfileModal(true);
    
    // Animate modal appearance
    Animated.timing(modalOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [user?.id, modalOpacity]);

  // Close profile modal
  const closeProfileModal = useCallback(() => {
    Animated.timing(modalOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowProfileModal(false);
      setSelectedUserId(null);
      setIsProfilePrivate(false);
      setProfilePrivacyLoaded(false);
    });
  }, [modalOpacity]);

  // Navigate to full profile
  const navigateToProfile = useCallback(() => {
    if (selectedUserId) {
      closeProfileModal();
      setTimeout(() => {
        router.push(`/profile/${selectedUserId}`);
      }, 200);
    }
  }, [selectedUserId, closeProfileModal, router]);

  // Credit user handler
  const handleSendCredit = useCallback(async (amount: number): Promise<{ success: boolean; error?: string }> => {
    if (!selectedUserId || !user || creditingUser) {
      return { success: false, error: 'Invalid request' };
    }

    setCreditingUser(true);
    try {
      // Get sender's profile info
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name, username, avatar_url')
        .eq('id', user.id)
        .single();

      const senderName = senderProfile?.full_name || senderProfile?.username || 'Someone';

      const result = await creditUser(
        selectedUserId,
        user.id,
        senderName,
        senderProfile?.avatar_url,
        amount
      );

      if (!result.success) {
        setCreditingUser(false);
        return { success: false, error: result.error || 'Failed to send tokens' };
      }

      // Success - CreditModal will show success alert
      setCreditingUser(false);
      return { success: true };
    } catch (error) {
      error('[CountryChat] Error crediting user:', error);
      setCreditingUser(false);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }, [selectedUserId, user, creditingUser]);

  // Send message from modal
  const sendMessageFromModal = useCallback(async () => {
    if (!selectedUserId || !user || !modalMessageText.trim() || sendingMessage) {
      return;
    }

    setSendingMessage(true);
    try {
      const result = await sendMessage(user.id, selectedUserId, modalMessageText.trim());

      if (result) {
        setModalMessageText('');
        Keyboard.dismiss();
        setTimeout(() => {
          closeProfileModal();
        }, 300);
      } else {
        error('[CountryChat] Failed to send message');
      }
    } catch (error) {
      error('[CountryChat] Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  }, [selectedUserId, user, modalMessageText, sendingMessage, closeProfileModal]);

  // Handle reply
  const handleReply = useCallback((message: ChatMessage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReplyToMessage(message);
    setActiveMessageMenuId(null);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyToMessage(null);
  }, []);

  // Handle edit message
  const handleEdit = useCallback((message: ChatMessage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingMessageId(message.id);
    setEditText(message.content);
    setActiveMessageMenuId(null);
    setTimeout(() => {
      editInputRef.current?.focus();
    }, 100);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditText('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingMessageId || !editText.trim() || !user?.id) return;

    const messageText = editText.trim();
    const messageId = editingMessageId;
    
    setEditingMessageId(null);
    setEditText('');

    try {
      const success = await updateMessage(messageId, user.id, messageText);
      
      if (success) {
        // Update local state
        const updateMessageInList = (list: ChatMessage[]) =>
          list.map(m => m.id === messageId ? { ...m, content: messageText } : m);
        
        setMessages(updateMessageInList);
        setPinnedMessages(updateMessageInList);
        setBookmarkedMessages(updateMessageInList);
        
        // Update store
        const allMessagesForUpdate = [...pinnedMessages, ...messages];
        const updatedMessages = allMessagesForUpdate.map(m => 
          m.id === messageId ? { ...m, content: messageText } : m
        );
        setCountryChatMessages(roomId, updatedMessages);
        
        Toast.show({
          type: 'success',
          text1: 'Message updated',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Failed to update message',
        });
      }
    } catch (error) {
      error('[CountryChat] Error updating message:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to update message',
      });
    }
  }, [editingMessageId, editText, user?.id, roomId, messages, pinnedMessages, bookmarkedMessages, setCountryChatMessages]);

  // Handle delete message
  const handleDelete = useCallback(async (messageId: string) => {
    if (!user?.id) return;
    
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              
              const success = await deleteMessage(messageId, user.id);
              
              if (success) {
                // Remove from local state
                setMessages(prev => prev.filter(m => m.id !== messageId));
                setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
                setBookmarkedMessages(prev => prev.filter(m => m.id !== messageId));
                
                // Update store
                const allMessagesForUpdate = [...pinnedMessages, ...messages];
                const updatedMessages = allMessagesForUpdate.filter(m => m.id !== messageId);
                setCountryChatMessages(roomId, updatedMessages);
                
                Toast.show({
                  type: 'success',
                  text1: 'Message deleted',
                });
              } else {
                Toast.show({
                  type: 'error',
                  text1: 'Failed to delete message',
                });
              }
            } catch (error) {
              error('[CountryChat] Error deleting message:', error);
              Toast.show({
                type: 'error',
                text1: 'Failed to delete message',
              });
            }
          },
        },
      ]
    );
    
    setActiveMessageMenuId(null);
  }, [user?.id, roomId, messages, pinnedMessages, bookmarkedMessages, setCountryChatMessages]);

  // Send message - simplified like private chat
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !roomId || !user?.id || sending) return;

    const messageText = inputText.trim();
    const currentReplyTo = replyToMessage;
    
    // Clear input immediately
    setInputText('');
    setReplyToMessage(null);
    setSending(true);

    try {
      // Fetch username
      let username = 'User';
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single();
        
        if (profile?.username) {
          username = profile.username;
        } else {
          username = user.user_metadata?.username || user.email?.split('@')[0] || 'User';
        }
      } catch (profileError) {
        username = user.user_metadata?.username || user.email?.split('@')[0] || 'User';
      }
      
      // Create optimistic message
      const tempMessageId = `temp-${Date.now()}-${Math.random()}`;
      const optimisticMessage: ChatMessage = {
        id: tempMessageId,
        room_id: roomId,
        user_id: user.id,
        content: messageText,
        username: username,
        created_at: new Date().toISOString(),
        is_ai_message: false,
        is_ai: false,
        reply_to_id: currentReplyTo?.id,
        reply_to_message: currentReplyTo ? {
          id: currentReplyTo.id,
          content: currentReplyTo.content,
          user_id: currentReplyTo.user_id,
          username: currentReplyTo.username,
        } : undefined,
      };
      
      // Add optimistic message to UI immediately (like private chat)
      setMessages(prev => {
        const currentMessages = Array.isArray(prev) ? prev : [];
        const updated = [...currentMessages, optimisticMessage];
        messagesRef.current = updated;
        return updated.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
      
      // Scroll to bottom immediately
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToEnd({ animated: true });
            isNearBottomRef.current = true;
          }
        }, 50);
      });
      
      // Send to server in background (non-blocking)
      const success = await sendCountryChatMessage(
        roomId,
        user.id,
        messageText,
        username,
        currentReplyTo?.id
      );
      
      if (!success) {
        // Remove optimistic message on failure
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempMessageId);
          messagesRef.current = filtered;
          return filtered;
        });
        setInputText(messageText);
        setReplyToMessage(currentReplyTo);
        Toast.show({
          type: 'error',
          text1: 'Failed to send',
          text2: 'Please try again',
        });
      }
      // If success, real-time subscription will replace temp message with real one
    } catch (error) {
      error('[CountryChat] Error sending message:', error);
      setInputText(messageText);
      setReplyToMessage(currentReplyTo);
      Toast.show({
        type: 'error',
        text1: 'Failed to send',
        text2: 'Please try again',
      });
    } finally {
      setSending(false);
    }
  }, [inputText, roomId, user, sending, replyToMessage]);

  // Handle bookmark
  const handleBookmark = useCallback(async (messageId: string) => {
    if (!user?.id || !roomId) return;
    
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      const isBookmarked = bookmarkedMessageIds.has(messageId);
      
      if (isBookmarked) {
        const success = await removeBookmark(user.id, messageId);
        if (success) {
          setBookmarkedMessageIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageId);
            return newSet;
          });
          // Remove from bookmarked messages list
          setBookmarkedMessages(prev => prev.filter(m => m.id !== messageId));
          Toast.show({
            type: 'success',
            text1: 'Bookmark removed',
          });
        }
      } else {
        const success = await bookmarkMessage(user.id, messageId, roomId);
        if (success) {
          setBookmarkedMessageIds(prev => new Set(prev).add(messageId));
          // Add to bookmarked messages list
          const allMessages = [...pinnedMessages, ...messages];
          const message = allMessages.find(m => m.id === messageId);
          if (message) {
            setBookmarkedMessages(prev => [message, ...prev]);
          }
          Toast.show({
            type: 'success',
            text1: 'Message bookmarked',
          });
        }
      }
      
      setActiveMessageMenuId(null);
    } catch (error) {
      error('[CountryChat] Error bookmarking:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to bookmark',
      });
    }
  }, [user?.id, roomId, bookmarkedMessageIds, pinnedMessages, messages]);

  // Handle copy
  const handleCopy = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({
        type: 'success',
        text1: 'Copied to clipboard',
      });
      setActiveMessageMenuId(null);
    } catch (error) {
      error('[CountryChat] Error copying:', error);
    }
  }, []);

  // Handle pin (disabled - admin feature removed)
  const handlePin = useCallback(async (messageId: string, isPinned: boolean) => {
    if (!roomId) return;
    
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Update message pin status
      const { error } = await supabase
        .from('chat_messages')
        .update({ is_pinned: !isPinned })
        .eq('id', messageId);
      
      if (error) {
        throw error;
      }
      
      // Update local state
      const updateMessageInList = (list: ChatMessage[]) => 
        list.map(m => m.id === messageId ? { ...m, is_pinned: !isPinned } : m);
      
      if (isPinned) {
        // Move from pinned to regular
        const message = pinnedMessages.find(m => m.id === messageId);
        if (message) {
          setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
          setMessages(prev => [...prev, { ...message, is_pinned: false }]);
        }
      } else {
        // Move from regular to pinned
        const message = messages.find(m => m.id === messageId);
        if (message) {
          setMessages(prev => prev.filter(m => m.id !== messageId));
          setPinnedMessages(prev => [...prev, { ...message, is_pinned: true }]);
        }
      }
      
      Toast.show({
        type: 'success',
        text1: !isPinned ? 'Message pinned' : 'Message unpinned',
      });
      
      setActiveMessageMenuId(null);
    } catch (error) {
      error('[CountryChat] Error pinning:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to pin message',
      });
    }
  }, [roomId, pinnedMessages, messages]);

  // Render pinned messages section
  const renderPinnedSection = () => {
    if (pinnedMessages.length === 0) return null;
    
    return (
      <View style={[styles.pinnedSection, { backgroundColor: themeColors.cardBackground }]}>
        <View style={styles.pinnedHeader}>
          <Pin size={16} color={themeColors.primary.main} />
          <Text style={[styles.pinnedHeaderText, { color: themeColors.text }]}>
            Pinned ({pinnedMessages.length})
          </Text>
        </View>
        <FlatList
          data={pinnedMessages}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => `pinned-${item.id}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.pinnedMessageCard, { backgroundColor: themeColors.background }]}
              onPress={() => {
                // Scroll to message
                const allMessages = [...pinnedMessages, ...messages];
                const index = allMessages.findIndex(m => m.id === item.id);
                if (index >= 0) {
                  flatListRef.current?.scrollToIndex({ index, animated: true });
                }
              }}
            >
              <Text 
                style={[styles.pinnedMessageText, { color: themeColors.text }]}
                numberOfLines={2}
              >
                {item.content}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  };

  // Render message with premium Gen Z design
  const renderMessage = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isOwnMessage = item.user_id === user?.id;
    const isBookmarked = bookmarkedMessageIds.has(item.id);
    const isPinned = item.is_pinned;
    
    // Check if we should show date separator
    const allMessagesForDateCheck = activeTab === 'messages' ? allMessages : 
                                    activeTab === 'pinned' ? pinnedMessages : 
                                    bookmarkedMessages;
    const showDateSeparator = index === 0 || 
      formatMessageDate(item.created_at) !== formatMessageDate(allMessagesForDateCheck[index - 1]?.created_at);
    
    return (
      <View>
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <View style={[styles.dateSeparatorLine, { backgroundColor: themeColors.border }]} />
            <Text style={[styles.dateSeparatorText, { color: themeColors.textSecondary }]}>
              {formatMessageDate(item.created_at)}
            </Text>
            <View style={[styles.dateSeparatorLine, { backgroundColor: themeColors.border }]} />
          </View>
        )}
        <View
          style={[
            styles.messageContainer,
            isOwnMessage ? styles.ownMessage : styles.otherMessage,
          ]}
        >
        {!isOwnMessage && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleProfileTap(
              item.user_id,
              item.username || 'User',
              item.profile?.avatar_url
            )}
            disabled={item.user_id === user?.id}
          >
            <SimpleAvatar
              userId={item.user_id}
              avatarUrl={item.profile?.avatar_url}
              size={36}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setActiveMessageMenuId(item.id);
          }}
          style={[
            styles.messageBubbleWrapper,
            isPinned && styles.pinnedBubbleWrapper,
          ]}
        >
          <LinearGradient
            colors={
              isOwnMessage
                ? ['#667eea', '#764ba2']
                : isDarkMode
                ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.05)']
                : ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.9)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.messageBubble,
              isPinned && styles.pinnedBubble,
            ]}
          >
            {isPinned && (
              <View style={styles.pinnedBadge}>
                <Pin size={12} color="#FFD700" />
              </View>
            )}
            
            {/* Reply content if this is a reply */}
            {item.reply_to_message && (
              <TouchableOpacity
                style={[
                  styles.replyContainer,
                  {
                    backgroundColor: isOwnMessage
                      ? 'rgba(255, 255, 255, 0.2)'
                      : 'rgba(0, 0, 0, 0.05)',
                    borderLeftColor: isOwnMessage
                      ? 'rgba(255, 255, 255, 0.7)'
                      : themeColors.primary.main,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  // Scroll to the original message
                  const allMessagesForScroll = activeTab === 'messages' ? allMessages :
                                                activeTab === 'pinned' ? pinnedMessages :
                                                bookmarkedMessages;
                  const originalIndex = allMessagesForScroll.findIndex(m => m.id === item.reply_to_message?.id);
                  if (originalIndex >= 0) {
                    flatListRef.current?.scrollToIndex({ index: originalIndex, animated: true });
                  }
                }}
              >
                <View style={styles.replyHeader}>
                  <CornerUpLeft size={12} color={isOwnMessage ? 'rgba(255, 255, 255, 0.9)' : themeColors.primary.main} />
                  <Text
                    style={[
                      styles.replyName,
                      {
                        color: isOwnMessage
                          ? 'rgba(255, 255, 255, 0.95)'
                          : themeColors.primary.main,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.reply_to_message.user_id === user?.id
                      ? 'You'
                      : (item.reply_to_message.username || 'User').length > 15
                      ? `${(item.reply_to_message.username || 'User').substring(0, 15)}...`
                      : (item.reply_to_message.username || 'User')}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.replyText,
                    {
                      color: isOwnMessage
                        ? 'rgba(255, 255, 255, 0.8)'
                        : themeColors.textSecondary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {item.reply_to_message.content}
                </Text>
              </TouchableOpacity>
            )}
            
            {!isOwnMessage && (
              <Text
                style={[
                  styles.username,
                  { color: themeColors.primary.main },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {(item.username || 'Unknown').length > 20 
                  ? `${(item.username || 'Unknown').substring(0, 20)}...` 
                  : (item.username || 'Unknown')}
              </Text>
            )}
            
            {/* Edit mode or normal text */}
            {editingMessageId === item.id ? (
              <View style={styles.editContainer}>
                <TextInput
                  ref={editInputRef}
                  style={[
                    styles.editInput,
                    {
                      backgroundColor: isOwnMessage
                        ? 'rgba(255, 255, 255, 0.2)'
                        : themeColors.background,
                      color: isOwnMessage ? '#FFFFFF' : themeColors.text,
                      borderColor: themeColors.primary.main,
                    },
                  ]}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  maxLength={500}
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={[styles.editButton, styles.cancelEditButton]}
                    onPress={cancelEdit}
                  >
                    <X size={16} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editButton, styles.saveEditButton]}
                    onPress={saveEdit}
                    disabled={!editText.trim()}
                  >
                    <Check size={16} color={editText.trim() ? '#FFFFFF' : themeColors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text
                style={[
                  styles.messageText,
                  {
                    color: isOwnMessage
                      ? '#FFFFFF'
                      : themeColors.text,
                  },
                ]}
              >
                {renderTextWithHashtags(
                  item.content,
                  {
                    color: isOwnMessage ? '#FFFFFF' : themeColors.text,
                  },
                  {
                    color: isOwnMessage ? '#00D9FF' : '#667eea',
                    fontWeight: '700',
                  }
                )}
              </Text>
            )}
            
            <View style={styles.messageFooter}>
              <Text
                style={[
                  styles.timestamp,
                  {
                    color: isOwnMessage
                      ? 'rgba(255, 255, 255, 0.7)'
                      : themeColors.textSecondary,
                  },
                ]}
              >
                {new Date(item.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {isBookmarked && (
                <Bookmark size={12} color={themeColors.primary.main} fill={themeColors.primary.main} />
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      </View>
    );
  }, [user?.id, themeColors, bookmarkedMessageIds, isDarkMode, activeTab, messages, pinnedMessages, bookmarkedMessages]);

  // Message menu modal
  const renderMessageMenu = () => {
    if (!activeMessageMenuId) return null;
    
    const message = [...pinnedMessages, ...messages].find(m => m.id === activeMessageMenuId);
    if (!message) return null;
    
    const isBookmarked = bookmarkedMessageIds.has(message.id);
    const isPinned = message.is_pinned;
    
    return (
      <Modal
        visible={true}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveMessageMenuId(null)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setActiveMessageMenuId(null)}
        >
          <View style={[styles.menuContainer, { backgroundColor: themeColors.cardBackground }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                handleReply(message);
              }}
            >
              <Reply size={20} color={themeColors.text} />
              <Text style={[styles.menuItemText, { color: themeColors.text }]}>Reply</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleCopy(message.content)}
            >
              <Copy size={20} color={themeColors.text} />
              <Text style={[styles.menuItemText, { color: themeColors.text }]}>Copy</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleBookmark(message.id)}
            >
              <Bookmark 
                size={20} 
                color={themeColors.text}
                fill={isBookmarked ? themeColors.primary.main : 'none'}
              />
              <Text style={[styles.menuItemText, { color: themeColors.text }]}>
                {isBookmarked ? 'Remove Bookmark' : 'Bookmark'}
              </Text>
            </TouchableOpacity>
            
            {/* Edit and Delete - only for own messages */}
            {message.user_id === user?.id && (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleEdit(message)}
                >
                  <Edit size={20} color={themeColors.text} />
                  <Text style={[styles.menuItemText, { color: themeColors.text }]}>Edit</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleDelete(message.id)}
                >
                  <Trash2 size={20} color="#FF3B30" />
                  <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
            
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFreshMessages();
    setRefreshing(false);
  }, [roomId]);

  // Memoize combined messages - ensure it updates when messages change
  // FIX: Always return fresh combined array to ensure FlatList updates
  const allMessages = useMemo(() => {
    const combined = [...pinnedMessages, ...messages];
    // Sort by created_at to maintain order
    return combined.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [pinnedMessages, messages]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <View style={[styles.header, { paddingTop: insets.top, backgroundColor: themeColors.cardBackground }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ChevronLeft size={18} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            {roomName}
          </Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary.main} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
            Loading messages...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      
      {/* Premium Header with Gradient */}
      <LinearGradient
        colors={isDarkMode 
          ? ['rgba(102, 126, 234, 0.2)', 'rgba(118, 75, 162, 0.15)', 'rgba(0, 0, 0, 0.05)']
          : ['rgba(102, 126, 234, 0.15)', 'rgba(118, 75, 162, 0.1)', 'rgba(255, 255, 255, 0.95)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            borderBottomColor: isDarkMode ? 'rgba(102, 126, 234, 0.3)' : 'rgba(102, 126, 234, 0.2)',
          },
        ]}
      >
        <View style={styles.headerWrapper}>
          <TouchableOpacity
            style={[styles.backButton, { 
              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(102, 126, 234, 0.1)',
            }]}
            onPress={() => router.back()}
          >
            <ChevronLeft size={18} color={themeColors.text} strokeWidth={2.5} />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <View style={styles.titleRow}>
              <Text style={styles.flagEmoji}>🌍</Text>
              <Text style={[styles.headerTitle, { color: themeColors.text }]}>
                {roomName.replace('World Chat', 'World').replace('Nigeria Chat', 'World').replace('Chat', '').trim()}
              </Text>
            </View>
            {onlineUsers.length > 0 && (
              <View style={styles.onlineIndicator}>
                <View style={[styles.onlineDot, { backgroundColor: '#4CD964' }]} />
                <Text style={[styles.onlineCount, { color: themeColors.textSecondary }]}>
                  {onlineUsers.length} {onlineUsers.length === 1 ? 'person' : 'people'} online
                </Text>
              </View>
            )}
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.bellButton, {
                backgroundColor: isDarkMode 
                  ? (iceMode ? 'rgba(135, 206, 250, 0.2)' : 'rgba(255, 255, 255, 0.1)')
                  : (iceMode ? 'rgba(135, 206, 250, 0.15)' : 'rgba(102, 126, 234, 0.1)'),
              }]}
              onPress={toggleIceMode}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Snowflake 
                size={16} 
                color={iceMode ? (isDarkMode ? '#87CEEB' : '#4A90E2') : (isDarkMode ? '#999' : '#667eea')} 
                strokeWidth={2.5}
                fill={iceMode ? (isDarkMode ? '#87CEEB' : '#4A90E2') : 'none'}
              />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.bellButton, {
                backgroundColor: isDarkMode 
                  ? (bellMuted ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 193, 7, 0.15)')
                  : (bellMuted ? 'rgba(102, 126, 234, 0.1)' : 'rgba(255, 193, 7, 0.15)'),
              }]}
              onPress={toggleBellMute}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {bellMuted ? (
                <BellOff size={16} color={isDarkMode ? '#999' : '#667eea'} strokeWidth={2.5} />
              ) : (
                <Bell size={16} color={isDarkMode ? '#FFC107' : '#FF9800'} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.participantsButton, {
                backgroundColor: isDarkMode ? 'rgba(0, 217, 255, 0.15)' : 'rgba(102, 126, 234, 0.12)',
              }]}
              onPress={() => router.push(`/chat/country/${roomId}/participants`)}
            >
              <Users size={16} color={isDarkMode ? '#00D9FF' : '#667eea'} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Join Announcement */}
      <ViewerJoinAnnouncement
        visible={joinAnnouncement.visible}
        username={joinAnnouncement.username}
        fullName={joinAnnouncement.fullName}
        avatarUrl={joinAnnouncement.avatarUrl}
        onDismiss={() => setJoinAnnouncement({ visible: false, username: '' })}
      />

      {/* Tabs: Messages, Pinned, Bookmarks */}
      <View style={[styles.tabsContainer, { backgroundColor: themeColors.cardBackground, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'messages' && styles.activeTab]}
          onPress={() => setActiveTab('messages')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'messages' ? themeColors.primary.main : themeColors.textSecondary }]}>
            Messages ({allMessages.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pinned' && styles.activeTab]}
          onPress={() => setActiveTab('pinned')}
        >
          <View style={styles.tabIconContainer}>
            <Pin 
              size={18} 
              color={activeTab === 'pinned' ? themeColors.primary.main : themeColors.textSecondary}
              strokeWidth={2.5}
            />
          </View>
          <Text style={[styles.tabText, { color: activeTab === 'pinned' ? themeColors.primary.main : themeColors.textSecondary }]}>
            Pinned ({pinnedMessages.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bookmarks' && styles.activeTab]}
          onPress={() => setActiveTab('bookmarks')}
        >
          <View style={styles.tabIconContainer}>
            <Bookmark 
              size={18} 
              color={activeTab === 'bookmarks' ? themeColors.primary.main : themeColors.textSecondary}
              strokeWidth={2.5}
              fill={activeTab === 'bookmarks' ? themeColors.primary.main : 'none'}
            />
          </View>
          <Text style={[styles.tabText, { color: activeTab === 'bookmarks' ? themeColors.primary.main : themeColors.textSecondary }]}>
            Bookmarks ({bookmarkedMessages.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pinned Messages Section - Only show when Messages tab is active */}
      {activeTab === 'messages' && renderPinnedSection()}

      {/* Messages List / Pinned List / Bookmarks List */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {activeTab === 'messages' && (
          <FlatList
            ref={flatListRef}
            data={allMessages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            inverted={false}
            onScroll={(event) => {
              const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
              const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
              
              // Consider "near bottom" if within 100 pixels
              const isNearBottom = distanceFromBottom < 100;
              isNearBottomRef.current = isNearBottom;
              
              // Show/hide "scroll to bottom" button
              // When ice mode is OFF, we always auto-scroll so don't show button
              if (iceMode) {
                setShowScrollToBottom(!isNearBottom && allMessages.length > 0);
              } else {
                // Ice mode OFF: Hide button since we always auto-scroll
                setShowScrollToBottom(false);
              }
            }}
            onContentSizeChange={() => {
              // When content size changes (new message added), auto-scroll if ice mode is OFF
              if (!iceMode && flatListRef.current) {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                    isNearBottomRef.current = true;
                  }, 100);
                });
              }
            }}
            scrollEventThrottle={400}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={themeColors.primary.main}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Sparkles size={48} color={themeColors.primary.main} />
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  No messages yet. Be the first to say hello! 👋
                </Text>
              </View>
            }
          />
        )}
        
        {activeTab === 'pinned' && (
          <FlatList
            data={pinnedMessages}
            renderItem={renderMessage}
            keyExtractor={(item) => `pinned-${item.id}`}
            contentContainerStyle={styles.messagesList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={themeColors.primary.main}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Pin size={48} color={themeColors.primary.main} />
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  No pinned messages yet
                </Text>
              </View>
            }
          />
        )}
        
        {activeTab === 'bookmarks' && (
          <FlatList
            data={bookmarkedMessages}
            renderItem={renderMessage}
            keyExtractor={(item) => `bookmark-${item.id}`}
            contentContainerStyle={styles.messagesList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={themeColors.primary.main}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Bookmark size={48} color={themeColors.primary.main} />
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  No bookmarked messages yet
                </Text>
                <Text style={[styles.emptySubText, { color: themeColors.textSecondary }]}>
                  Bookmark messages to see them here
                </Text>
              </View>
            }
          />
        )}
      </Animated.View>

      {/* Premium Input Area */}
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: themeColors.cardBackground,
            borderTopColor: themeColors.border,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        {/* Reply Preview */}
        {replyToMessage && (
          <View style={[styles.replyPreview, { backgroundColor: themeColors.background, borderLeftColor: themeColors.primary.main }]}>
            <View style={styles.replyPreviewContent}>
              <View style={styles.replyPreviewHeader}>
                <Reply size={14} color={themeColors.primary.main} />
                <Text style={[styles.replyPreviewUsername, { color: themeColors.primary.main }]}>
                  {replyToMessage.username || 'Unknown'}
                </Text>
              </View>
              <Text 
                style={[styles.replyPreviewText, { color: themeColors.textSecondary }]}
                numberOfLines={1}
              >
                {replyToMessage.content}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.replyCancelButton}
              onPress={cancelReply}
            >
              <X size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
        
        <LinearGradient
          colors={isDarkMode
            ? ['rgba(102, 126, 234, 0.1)', 'rgba(118, 75, 162, 0.05)']
            : ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.9)']
          }
          style={styles.inputWrapper}
        >
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              {
                backgroundColor: themeColors.background,
                color: themeColors.text,
                borderColor: themeColors.border,
              },
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={replyToMessage ? "Reply to message..." : "Type a message..."}
            placeholderTextColor={themeColors.textSecondary}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor: inputText.trim() 
                  ? themeColors.primary.main 
                  : themeColors.border,
              },
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <LinearGradient
                colors={inputText.trim() 
                  ? ['#667eea', '#764ba2']
                  : ['rgba(102,126,234,0.3)', 'rgba(118,75,162,0.3)']
                }
                style={styles.sendButtonGradient}
              >
                <Send size={18} color="#FFFFFF" />
              </LinearGradient>
            )}
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Message Menu Modal */}
      {renderMessageMenu()}
      
      {/* Scroll to Bottom Button */}
      {showScrollToBottom && (
        <TouchableOpacity
          style={[styles.scrollToBottomButton, { backgroundColor: themeColors.primary.main }]}
          onPress={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
            isNearBottomRef.current = true;
            setShowScrollToBottom(false);
          }}
          activeOpacity={0.8}
        >
          <ChevronDown size={24} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {/* User Profile Modal - Same sleek card as livestream */}
      <Modal
        visible={showProfileModal}
        transparent={true}
        animationType="none"
        onRequestClose={closeProfileModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeProfileModal}>
          <Animated.View 
            style={[
              styles.modalContent,
              { opacity: modalOpacity }
            ]}
            onStartShouldSetResponder={() => true}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              {/* Header */}
              <View style={styles.modalHeader}>
                {selectedUserAvatar ? (
                  <Image 
                    source={{ uri: selectedUserAvatar }} 
                    style={styles.modalAvatar}
                  />
                ) : (
                  <View style={styles.modalDefaultAvatar}>
                    <Text style={styles.modalAvatarText}>
                      {selectedUserName?.charAt(0) || 'U'}
                    </Text>
                  </View>
                )}
                <TouchableOpacity 
                  style={styles.modalCloseButton}
                  onPress={closeProfileModal}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={18} color="#FFFFFF" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              {/* Name */}
              <Text style={styles.modalName} numberOfLines={1}>
                {selectedUserName}
              </Text>

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[
                    styles.modalFollowButton,
                    isFollowingUser && styles.modalFollowButtonActive
                  ]}
                  onPress={toggleFollow}
                  disabled={followLoading}
                  activeOpacity={0.8}
                >
                  {followLoading ? (
                    <Text style={styles.modalFollowButtonText}>...</Text>
                  ) : isFollowingUser ? (
                    <>
                      <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                      <Text style={styles.modalFollowButtonText}>Following</Text>
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} color="#FFFFFF" strokeWidth={2.5} />
                      <Text style={styles.modalFollowButtonText}>Follow</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Credit Me button - only show if user has a profile photo */}
                {selectedUserId !== user?.id && selectedUserAvatar && (
                  <TouchableOpacity
                    style={styles.modalCreditButton}
                    onPress={() => setShowCreditModal(true)}
                    activeOpacity={0.8}
                  >
                    <Coins size={14} color="#000000" strokeWidth={2.5} />
                    <Text style={styles.modalCreditButtonText}>
                      Credit Me
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Open Profile Button */}
                <TouchableOpacity
                  style={styles.modalViewButton}
                  onPress={navigateToProfile}
                  activeOpacity={0.8}
                >
                  <MessageCircle size={14} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.modalViewButtonText}>Profile</Text>
                </TouchableOpacity>
              </View>

              {/* Message Input - Show if profile is not private */}
              {profilePrivacyLoaded && !isProfilePrivate && selectedUserId !== user?.id && (
                <View style={styles.modalMessageContainer}>
                  <TextInput
                    style={styles.modalMessageInput}
                    placeholder="Type a message..."
                    placeholderTextColor="rgba(255, 255, 255, 0.5)"
                    value={modalMessageText}
                    onChangeText={setModalMessageText}
                    multiline={false}
                    returnKeyType="send"
                    onSubmitEditing={sendMessageFromModal}
                    autoCorrect={false}
                    autoCapitalize="sentences"
                  />
                  <TouchableOpacity
                    style={[
                      styles.modalSendButton,
                      (!modalMessageText.trim() || sendingMessage) && styles.modalSendButtonDisabled
                    ]}
                    onPress={sendMessageFromModal}
                    disabled={!modalMessageText.trim() || sendingMessage}
                    activeOpacity={0.7}
                  >
                    <Send 
                      size={16} 
                      color={(!modalMessageText.trim() || sendingMessage) ? "rgba(255, 255, 255, 0.3)" : "#00D9FF"} 
                    />
                  </TouchableOpacity>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Credit Modal */}
      {selectedUserId && (
        <CreditModal
          visible={showCreditModal}
          onClose={() => setShowCreditModal(false)}
          onSend={handleSendCredit}
          recipientName={selectedUserName}
          recipientAvatar={selectedUserAvatar}
          recipientId={selectedUserId}
          sending={creditingUser}
        />
      )}

      {/* Terms Acceptance Modal */}
      <Modal
        visible={showTermsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}} // Prevent closing without accepting
      >
        <View style={[styles.termsModalBackdrop, { backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.6)' }]}>
          <Animated.View style={[
            styles.termsModalContent,
            {
              backgroundColor: isDarkMode ? 'rgba(20, 20, 20, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            }
          ]}>
            <View style={styles.termsModalHeader}>
              <View style={[
                styles.termsIconContainer,
                { backgroundColor: `${themeColors.primary.main}20` }
              ]}>
                <MessageCircle size={32} color={themeColors.primary.main} strokeWidth={2.5} />
              </View>
              <Text style={[styles.termsModalTitle, { color: themeColors.text }]}>
                Community Guidelines
              </Text>
              <Text style={[styles.termsModalSubtitle, { color: themeColors.textSecondary }]}>
                Please read and accept to continue
              </Text>
            </View>

            <View style={styles.termsListContainer}>
              <View style={styles.termItem}>
                <View style={[styles.termBullet, { backgroundColor: themeColors.primary.main }]} />
                <Text style={[styles.termText, { color: themeColors.text }]}>
                  <Text style={styles.termBold}>No hate speech</Text> - Respect all members regardless of background
                </Text>
              </View>

              <View style={styles.termItem}>
                <View style={[styles.termBullet, { backgroundColor: themeColors.primary.main }]} />
                <Text style={[styles.termText, { color: themeColors.text }]}>
                  <Text style={styles.termBold}>No bullying or harassment</Text> - Be kind and constructive
                </Text>
              </View>

              <View style={styles.termItem}>
                <View style={[styles.termBullet, { backgroundColor: themeColors.primary.main }]} />
                <Text style={[styles.termText, { color: themeColors.text }]}>
                  <Text style={styles.termBold}>No spam</Text> - Keep conversations meaningful
                </Text>
              </View>

              <View style={styles.termItem}>
                <View style={[styles.termBullet, { backgroundColor: themeColors.primary.main }]} />
                <Text style={[styles.termText, { color: themeColors.text }]}>
                  <Text style={styles.termBold}>Respect privacy</Text> - Don't share personal information
                </Text>
              </View>

              <View style={styles.termItem}>
                <View style={[styles.termBullet, { backgroundColor: themeColors.primary.main }]} />
                <Text style={[styles.termText, { color: themeColors.text }]}>
                  <Text style={styles.termBold}>Follow the rules</Text> - Violations may result in removal
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.termsAcceptButton}
              onPress={handleAcceptTerms}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[themeColors.primary.main, themeColors.primary.dark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.termsAcceptButtonGradient}
              >
                <Text style={styles.termsAcceptButtonText}>I Accept & Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#667eea',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
    } : {}),
  },
  headerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    } : {}),
  },
  headerContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flagEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.05)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  onlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    paddingLeft: 28,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#4CD964',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 4,
    } : {}),
  },
  onlineCount: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#FFC107',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
    } : {}),
  },
  participantsButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#667eea',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
    } : {}),
  },
  placeholder: {
    width: 40,
  },
  pinnedSection: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  pinnedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  pinnedHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  pinnedMessageCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
    maxWidth: 200,
    borderWidth: 1,
    borderColor: 'rgba(102,126,234,0.2)',
  },
  pinnedMessageText: {
    fontSize: 12,
    lineHeight: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  ownMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
  },
  avatar: {
    marginRight: 10,
  },
  messageBubbleWrapper: {
    maxWidth: '75%',
    borderRadius: 20,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    } : {}),
    overflow: 'hidden', // Ensure gradient respects border radius
  },
  messageBubble: {
    padding: 14,
    borderRadius: 20,
  },
  pinnedBubbleWrapper: {
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    borderRadius: 20,
  },
  pinnedBubble: {
    // No additional styles needed
  },
  pinnedBadge: {
    position: 'absolute',
    top: -6,
    right: 8,
    backgroundColor: '#FFD700',
    borderRadius: 10,
    padding: 4,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
    } : {}),
  },
  username: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  usernameSmall: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.1,
    maxWidth: 200, // Fixed max width in pixels instead of percentage
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 6,
  },
  timestamp: {
    fontSize: 10,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
    letterSpacing: 0.2,
  },
  emptySubText: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 0.1,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
  },
  dateSeparatorText: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    minHeight: 44, // Ensure touch target is large enough
  },
  activeTab: {
    borderBottomColor: '#667eea',
  },
  tabIconContainer: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  replyPreviewUsername: {
    fontSize: 12,
    fontWeight: '600',
  },
  replyPreviewText: {
    fontSize: 13,
    lineHeight: 18,
  },
  replyCancelButton: {
    padding: 4,
    marginLeft: 8,
  },
  replyContainer: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  replyName: {
    fontSize: 11,
    fontWeight: '600',
  },
  replyText: {
    fontSize: 11,
    lineHeight: 14,
  },
  editContainer: {
    marginTop: 4,
  },
  editInput: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    lineHeight: 21,
    borderWidth: 1,
    minHeight: 40,
    maxHeight: 100,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelEditButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  saveEditButton: {
    backgroundColor: '#667eea',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    padding: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 100,
    fontSize: 15,
    fontWeight: '400',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    overflow: 'hidden',
  },
  sendButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  scrollToBottomButton: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
    } : {}),
    zIndex: 100,
  },
  // Profile Modal Styles (same as livestream)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 16,
    padding: 20,
    minWidth: 200,
    maxWidth: 280,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    width: '100%',
    position: 'relative',
  },
  modalAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalDefaultAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#9146FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalAvatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  modalFollowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9146FF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
  },
  modalFollowButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  modalFollowButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalViewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalViewButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalCreditButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
  },
  modalCreditButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  modalMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  modalMessageInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    maxHeight: 100,
  },
  modalSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSendButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  // Terms Modal Styles
  termsModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  termsModalContent: {
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
    } : {
      elevation: 16,
    }),
    borderWidth: 1,
  },
  termsModalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  termsIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  termsModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  termsModalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  termsListContainer: {
    marginBottom: 24,
  },
  termItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  termBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    flexShrink: 0,
  },
  termText: {
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  termBold: {
    fontWeight: '700',
  },
  termsAcceptButton: {
    borderRadius: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    } : {
      elevation: 8,
    }),
  },
  termsAcceptButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsAcceptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
