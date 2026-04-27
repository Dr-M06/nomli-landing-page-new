import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Animated, Pressable, TextInput, Keyboard } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { UserPlus, Check, X, ExternalLink, MessageSquare, MessageCircle, Send, AlertTriangle, Ban, Coins, Pin, PinOff, Music2, ChevronDown, MoreVertical } from 'lucide-react-native';
import { supabase } from '../utils/supabase';
import useFollowers from '../hooks/useFollowers';
import useAuth from '../hooks/useAuth';
import { sendMessage } from '../utils/chat';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { creditUser } from '../utils/creditService';
import Toast from 'react-native-toast-message';
import CreditModal from './CreditModal';
import { sanitizeUsernameForDisplay } from '../utils/contentFilter';
import { log, warn, error } from '../utils/productionLogger';


interface Comment {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  message: string;
  timestamp: string;
  isLocal?: boolean;
  is_pinned?: boolean;
  pinned_at?: string;
  pinned_by?: string;
}

interface LiveCommentsProps {
  streamId: string;
  onCommentSend?: (comment: Comment) => void;
  isStreamer?: boolean;
  showInput?: boolean;
  onReplyToComment?: (comment: Comment) => void;
  onInviteUser?: (userId: string) => void;
  onWarnUser?: (userId: string, userName: string) => void;
  onKickUser?: (userId: string, userName: string) => void;
  onPinComment?: (commentId: string) => void;
  onUnpinComment?: (commentId: string) => void;
  canModerate?: boolean;
  /** Tighter rows + type for floating overlay (broadcaster/viewer) so video stays visible. */
  overlayCompact?: boolean;
}

const LiveComments = React.memo(function LiveComments({ 
  streamId, 
  onCommentSend, 
  isStreamer = false, 
  showInput = true,
  onReplyToComment,
  onInviteUser,
  onWarnUser,
  onKickUser,
  onPinComment,
  onUnpinComment,
  canModerate = false,
  overlayCompact = false,
}: LiveCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [warnedUserIds, setWarnedUserIds] = useState<Set<string>>(new Set());
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // State for replying to a comment
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [openMenuCommentId, setOpenMenuCommentId] = useState<string | null>(null);
  const [menuPositions, setMenuPositions] = useState<Record<string, 'above' | 'below'>>({});
  const commentLayoutsRef = useRef<Record<string, { y: number; height: number }>>({});
  
  // Profile modal state
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
  const [pinnedCommentId, setPinnedCommentId] = useState<string | null>(null);
  const [newCommentsCount, setNewCommentsCount] = useState(0);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const hasLoadedRef = useRef(false);
  const previousCommentsLengthRef = useRef(0);
  const isUserScrollingRef = useRef(false);
  const scrollPositionRef = useRef({ offset: 0, contentHeight: 0, layoutHeight: 0 });
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSeenCommentCountRef = useRef(0);
  
  // Follow functionality for selected user
  const {
    isFollowingUser,
    followLoading,
    toggleFollow,
    refreshAll: refreshFollowStatus
  } = useFollowers(selectedUserId || undefined);

  // Generate icebreaker message
  const generateIcebreaker = () => {
    const icebreakers = [
      "Hey! 👋",
      "Hi there! ✨",
      "Hey! Saw you in the stream 🎥",
      "Hi! 👋 Nice to meet you!",
    ];
    return icebreakers[Math.floor(Math.random() * icebreakers.length)];
  };

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
  }, [showProfileModal, selectedUserId, refreshFollowStatus]);

  // Check if profile is private
  const checkProfilePrivacy = async () => {
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
        error('[LiveComments] Error checking profile privacy:', error);
        setIsProfilePrivate(false);
      } else {
        setIsProfilePrivate(profile?.profile_visible === false);
      }
      setProfilePrivacyLoaded(true);
    } catch (error) {
      error('[LiveComments] Exception checking profile privacy:', error);
      setIsProfilePrivate(false);
      setProfilePrivacyLoaded(true);
    }
  };

  // Navigate to chat with pre-populated icebreaker message
  const navigateToChat = () => {
    if (selectedUserId) {
      closeProfileModal();
      const randomIcebreaker = generateIcebreaker();
      setTimeout(() => {
        router.push(`/chat/${selectedUserId}?initialMessage=${encodeURIComponent(randomIcebreaker)}` as any);
      }, 200);
    }
  };

  // Simple: Load all comments from database once
  const loadComments = async () => {
    if (!streamId || hasLoadedRef.current) return;
    
    try {
      log('[LiveComments] Loading all comments for stream:', streamId);
      
      // Fetch all comments
      const { data: commentsData, error: commentsError } = await supabase
        .from('live_stream_comments')
        .select('id, user_id, message, created_at, is_pinned, pinned_at, pinned_by')
        .eq('stream_id', streamId)
        .order('created_at', { ascending: true });

      if (commentsError) {
        error('[LiveComments] Error loading comments:', commentsError);
        return;
      }

      if (!commentsData || commentsData.length === 0) {
        hasLoadedRef.current = true;
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(commentsData.map(c => c.user_id))];
      
      // Fetch profiles
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', userIds);

      // Create profiles map
      const profilesMap = new Map();
      if (profilesData) {
        profilesData.forEach(profile => {
          profilesMap.set(profile.id, profile);
        });
      }

      // Fetch warnings
      const { data: warningsData } = await supabase
        .from('live_stream_warnings')
        .select('user_id')
        .eq('stream_id', streamId);
      
      const warnedSet = new Set<string>();
      if (warningsData) {
        warningsData.forEach(warning => {
          if (warning.user_id) warnedSet.add(warning.user_id);
        });
      }
      setWarnedUserIds(warnedSet);

      // Format comments
      const formattedComments: Comment[] = commentsData
        .filter(comment => comment.message && comment.message.trim() !== '')
        .map(comment => {
          const profile = profilesMap.get(comment.user_id);
          
          let displayName = 'User';
          if (profile) {
            if (profile.username) {
              displayName = sanitizeUsernameForDisplay(profile.username);
            } else if (profile.full_name) {
              displayName = sanitizeUsernameForDisplay(profile.full_name);
            } else {
              displayName = `user_${comment.user_id.substring(0, 8)}`;
            }
          } else {
            displayName = `user_${comment.user_id.substring(0, 8)}`;
          }
          
          const formatted: Comment = {
            id: comment.id,
            user_id: comment.user_id,
            user_name: displayName,
            user_avatar: profile?.avatar_url,
            message: comment.message,
            timestamp: comment.created_at,
            isLocal: false,
            is_pinned: comment.is_pinned || false,
            pinned_at: comment.pinned_at,
            pinned_by: comment.pinned_by,
          };

          if (formatted.is_pinned) {
            setPinnedCommentId(formatted.id);
          }

          return formatted;
        });

      // Sort: pinned first, then by timestamp
      const sorted = formattedComments.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });

      setComments(sorted);
      hasLoadedRef.current = true;
      lastSeenCommentCountRef.current = sorted.length;
      previousCommentsLengthRef.current = sorted.length;
      
      // Scroll to bottom after a short delay
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 300);
      
      log('[LiveComments] Loaded', sorted.length, 'comments');
    } catch (error) {
      error('[LiveComments] Error loading comments:', error);
    }
  };

  // Set up real-time subscription for new comments
  useEffect(() => {
    if (!streamId) return;

    // Load comments once when streamId is set
    if (!hasLoadedRef.current) {
      loadComments();
    }

    // Subscribe to warnings
    const warningsChannel = supabase
      .channel(`live_stream_warnings_${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_warnings',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          if (payload.new?.user_id) {
            setWarnedUserIds(prev => new Set([...prev, payload.new.user_id]));
          }
        }
      )
      .subscribe();

    // Subscribe to new comments
    const channel = supabase
      .channel(`live_stream_comments_${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_comments',
          filter: `stream_id=eq.${streamId}`,
        },
        async (payload) => {
          // Fetch user profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, username, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          let displayName = 'User';
          if (profile) {
            if (profile.username) {
              displayName = sanitizeUsernameForDisplay(profile.username);
            } else if (profile.full_name) {
              displayName = sanitizeUsernameForDisplay(profile.full_name);
            } else {
              displayName = `user_${payload.new.user_id.substring(0, 8)}`;
            }
          } else {
            displayName = `user_${payload.new.user_id.substring(0, 8)}`;
          }

          if (!payload.new.message || payload.new.message.trim() === '') {
            return;
          }
          
          const newComment: Comment = {
            id: payload.new.id,
            user_id: payload.new.user_id,
            user_name: displayName,
            user_avatar: profile?.avatar_url,
            message: payload.new.message,
            timestamp: payload.new.created_at,
            isLocal: false,
            is_pinned: payload.new.is_pinned || false,
            pinned_at: payload.new.pinned_at,
            pinned_by: payload.new.pinned_by,
          };

          if (newComment.is_pinned) {
            setPinnedCommentId(newComment.id);
          }
          
          // Simple: Just append new comment
          setComments(prev => {
            // Check if already exists (prevent duplicates)
            if (prev.some(c => c.id === newComment.id)) {
              return prev;
            }
            
            const updated = [...prev, newComment];
            
            // Sort: pinned first, then by timestamp
            // Sort: pinned first, then by timestamp
            return updated.sort((a, b) => {
              if (a.is_pinned && !b.is_pinned) return -1;
              if (!a.is_pinned && b.is_pinned) return 1;
              return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            });
          });

          if (onCommentSend) {
            onCommentSend(newComment);
          }
        }
      )
      .subscribe();

    // Subscribe to comment updates (for pin/unpin)
    const updateChannel = supabase
      .channel(`live_stream_comments_updates_${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_stream_comments',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          setComments(prev => {
            const updated = prev.map(c => 
              c.id === payload.new.id 
                ? { ...c, is_pinned: payload.new.is_pinned || false, pinned_at: payload.new.pinned_at, pinned_by: payload.new.pinned_by }
                : { ...c, is_pinned: false }
            );
            
            const pinned = updated.find(c => c.is_pinned);
            setPinnedCommentId(pinned?.id || null);
            
            return updated.sort((a, b) => {
              if (a.is_pinned && !b.is_pinned) return -1;
              if (!a.is_pinned && b.is_pinned) return 1;
              return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            });
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(warningsChannel);
      supabase.removeChannel(updateChannel);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [streamId]);

  // Reset when streamId changes
  useEffect(() => {
    hasLoadedRef.current = false;
    setComments([]);
    setPinnedCommentId(null);
    setNewCommentsCount(0);
    isUserScrollingRef.current = false;
    previousCommentsLengthRef.current = 0;
    lastSeenCommentCountRef.current = 0;
    scrollPositionRef.current = { offset: 0, contentHeight: 0, layoutHeight: 0 };
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
  }, [streamId]);

  // Check if user is near the bottom of the scroll view
  const isNearBottom = () => {
    const { offset, contentHeight, layoutHeight } = scrollPositionRef.current;
    if (contentHeight === 0 || layoutHeight === 0) return true; // Default to true if not measured yet
    const distanceFromBottom = contentHeight - (offset + layoutHeight);
    const threshold = 100; // Consider "near bottom" if within 100px
    return distanceFromBottom <= threshold;
  };

  // Handle scroll events to detect manual scrolling
  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    
    scrollPositionRef.current = {
      offset: contentOffset.y,
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
    };

    // Mark that user is manually scrolling
    isUserScrollingRef.current = true;
    
    // If user scrolls to bottom, reset new comments count
    if (isNearBottom()) {
      setNewCommentsCount(0);
      lastSeenCommentCountRef.current = comments.length;
    }
    
    // Recalculate menu positions if menu is open during scroll
    if (openMenuCommentId) {
      const layout = commentLayoutsRef.current[openMenuCommentId];
      if (layout) {
        const DROPDOWN_HEIGHT = 150;
        const VIEWPORT_HEIGHT = layoutMeasurement.height;
        const SCROLL_OFFSET = contentOffset.y;
        
        const commentTop = layout.y - SCROLL_OFFSET;
        const commentBottom = commentTop + layout.height;
        
        const spaceBelow = VIEWPORT_HEIGHT - commentBottom;
        const spaceAbove = commentTop;
        
        let position: 'above' | 'below' = 'below';
        if (spaceBelow < DROPDOWN_HEIGHT && spaceAbove > DROPDOWN_HEIGHT) {
          position = 'above';
        } else if (spaceAbove < DROPDOWN_HEIGHT && spaceBelow > DROPDOWN_HEIGHT) {
          position = 'below';
        } else {
          position = spaceBelow >= spaceAbove ? 'below' : 'above';
        }
        
        setMenuPositions(prev => ({ ...prev, [openMenuCommentId]: position }));
      }
    }
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Reset the flag after user stops scrolling for 1 second
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 1000);
  };

  // Handle tap on new comments badge
  const handleNewCommentsPress = () => {
    setNewCommentsCount(0);
    lastSeenCommentCountRef.current = comments.length;
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  // Track new comments and show badge when user is not at bottom
  useEffect(() => {
    // Only track if a new comment was added (length increased)
    if (comments.length > previousCommentsLengthRef.current && comments.length > 0) {
      const newCommentsAdded = comments.length - previousCommentsLengthRef.current;
      
      // Check if user is manually scrolling or not near bottom
      if (isUserScrollingRef.current || !isNearBottom()) {
        // User is reading old comments, increment new comments count
        setNewCommentsCount(prev => prev + newCommentsAdded);
        previousCommentsLengthRef.current = comments.length;
        return;
      }
      
      // User is near bottom, auto-scroll to show new comment
      const timeoutId = setTimeout(() => {
        if (!isUserScrollingRef.current) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }, 200);
      
      // Reset new comments count since we're auto-scrolling
      setNewCommentsCount(0);
      lastSeenCommentCountRef.current = comments.length;
      previousCommentsLengthRef.current = comments.length;
      return () => clearTimeout(timeoutId);
    } else if (comments.length !== previousCommentsLengthRef.current) {
      // Update ref even if we don't scroll (e.g., comments were removed)
      previousCommentsLengthRef.current = comments.length;
    }
  }, [comments.length]);

  const handleProfileTap = (userId: string, userName: string, userAvatar?: string) => {
    if (userId === user?.id) return;
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setSelectedUserAvatar(userAvatar);
    setShowProfileModal(true);
    Animated.timing(modalOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const handleCommentTap = (comment: Comment) => {
    // If onReplyToComment is provided, trigger reply
    if (onReplyToComment) {
      onReplyToComment(comment);
      setReplyingTo(comment);
    }
  };

  const closeProfileModal = () => {
    Animated.timing(modalOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowProfileModal(false);
      setSelectedUserId(null);
      setSelectedUserName('');
      setSelectedUserAvatar(undefined);
      setIsProfilePrivate(false);
      setProfilePrivacyLoaded(false);
    });
  };

  const sendMessageFromModal = async () => {
    if (!modalMessageText.trim() || !selectedUserId || sendingMessage) return;

    setSendingMessage(true);
    try {
      await sendMessage(selectedUserId, modalMessageText.trim());
      setModalMessageText('');
      closeProfileModal();
      Toast.show({
        type: 'success',
        text1: 'Message sent',
        visibilityTime: 2000,
      });
    } catch (error) {
      error('[LiveComments] Error sending message:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to send message',
        visibilityTime: 2000,
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendCredit = async (amount: number): Promise<{ success: boolean; error?: string }> => {
    if (!selectedUserId || !user || creditingUser) {
      return { success: false, error: 'Invalid request' };
    }

    setCreditingUser(true);
    try {
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

      setCreditingUser(false);
      return { success: true };
    } catch (error) {
      error('[LiveComments] Error crediting user:', error);
      setCreditingUser(false);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  // Generate random colors for usernames
  const getRandomTwitchColor = (userId: string): string => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#AED6F1',
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Simple deduplication and sorting
  const uniqueComments = React.useMemo(() => {
    const seen = new Set<string>();
    const valid = comments.filter(c => {
      if (!c.id || !c.message || c.message.trim() === '') return false;
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    
    return valid.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }, [comments]);

  // Keep the pinned comment visible (sticky) instead of letting it scroll away
  const pinnedComment = React.useMemo(() => {
    if (!pinnedCommentId) return null;
    return uniqueComments.find(c => c.id === pinnedCommentId) || null;
  }, [pinnedCommentId, uniqueComments]);

  const listComments = React.useMemo(() => {
    // Remove pinned comment from the list to avoid duplicate rendering
    if (!pinnedComment) return uniqueComments;
    return uniqueComments.filter(c => c.id !== pinnedComment.id);
  }, [uniqueComments, pinnedComment]);

  const renderComment = ({ item, index }: { item: Comment; index: number }) => {
    const usernameColor = getRandomTwitchColor(item.user_id);
    const isInviting = invitingUserId === item.user_id;
    const isReplying = replyingTo?.id === item.id;
    const isWarned = warnedUserIds.has(item.user_id);
    // Position dropdown above if it's one of the last 3 comments to prevent cropping
    const isNearBottom = index >= uniqueComments.length - 3;
    
    // Calculate if menu should render above or below based on position
    const calculateMenuPosition = (layout: { y: number; height: number }) => {
      const DROPDOWN_HEIGHT = 150; // Approximate dropdown height
      const VIEWPORT_HEIGHT = scrollPositionRef.current.layoutHeight || 300;
      const SCROLL_OFFSET = scrollPositionRef.current.offset || 0;
      
      // Calculate comment's position relative to viewport
      const commentTop = layout.y - SCROLL_OFFSET;
      const commentBottom = commentTop + layout.height;
      
      // Check available space below
      const spaceBelow = VIEWPORT_HEIGHT - commentBottom;
      // Check available space above
      const spaceAbove = commentTop;
      
      // If not enough space below but enough above, render above
      if (spaceBelow < DROPDOWN_HEIGHT && spaceAbove > DROPDOWN_HEIGHT) {
        return 'above';
      }
      // If not enough space above but enough below, render below
      if (spaceAbove < DROPDOWN_HEIGHT && spaceBelow > DROPDOWN_HEIGHT) {
        return 'below';
      }
      // Default: render below if more space, otherwise above
      return spaceBelow >= spaceAbove ? 'below' : 'above';
    };
    
    const menuPosition = menuPositions[item.id] || (isNearBottom ? 'above' : 'below');
    
    return (
      <View 
        style={[
          styles.commentItem,
          overlayCompact && styles.commentItemCompact,
          isReplying && styles.commentItemReplying,
        ]}
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          commentLayoutsRef.current[item.id] = { y, height };
          
          // Calculate position when menu opens
          if (openMenuCommentId === item.id) {
            const position = calculateMenuPosition({ y, height });
            setMenuPositions(prev => ({ ...prev, [item.id]: position }));
          }
        }}
      >
        <View style={styles.commentHeader}>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => handleProfileTap(item.user_id, item.user_name, item.user_avatar)}
            disabled={item.user_id === user?.id}
            style={{ flexDirection: 'row', flex: 1 }}
          >
            {item.user_avatar ? (
              <Image
                source={{ uri: item.user_avatar }}
                style={[styles.userAvatar, overlayCompact && styles.userAvatarCompact]}
              />
            ) : (
              <View style={[styles.defaultAvatar, overlayCompact && styles.defaultAvatarCompact]}>
                <Text style={[styles.avatarText, overlayCompact && styles.avatarTextCompact]}>
                  {item.user_name?.charAt(0) || 'U'}
                </Text>
              </View>
            )}
            <View style={styles.commentUserInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Text 
                  style={[
                    styles.commentUserName,
                    overlayCompact && styles.commentUserNameCompact,
                    { 
                      color: usernameColor,
                      textShadowColor: 'rgba(0, 0, 0, 1)',
                      textShadowOffset: { width: 0, height: overlayCompact ? 1 : 2 },
                      textShadowRadius: overlayCompact ? 3 : 6,
                      fontWeight: isStreamer ? '800' : '700',
                    }
                  ]}
                >
                  {item.user_name && item.user_name.length > 10 
                    ? `${item.user_name.substring(0, 10)}...` 
                    : item.user_name}
                </Text>
                {isWarned && (
                  <View style={{ marginHorizontal: 4 }}>
                    <AlertTriangle 
                      size={14} 
                      color="#FFA500" 
                      strokeWidth={2.5}
                      fill="#FFA500"
                    />
                  </View>
                )}
              </View>
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => handleCommentTap(item)}
                disabled={!onReplyToComment}
                style={{ marginTop: overlayCompact ? 2 : 4, width: '100%' }}
              >
                <Text 
                  style={[
                    styles.commentMessage,
                    overlayCompact && styles.commentMessageCompact,
                    { 
                      color: '#FFFFFF',
                      textShadowColor: 'rgba(0, 0, 0, 1)',
                      textShadowOffset: { width: 0, height: overlayCompact ? 1 : 2 },
                      textShadowRadius: overlayCompact ? 3 : 6,
                      fontWeight: isStreamer ? '600' : '500',
                    }
                  ]}
                >
                  {item.message}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
          
          {/* 3-dot menu button - only show if there are actions available */}
          {canModerate && (
            (isStreamer && (onPinComment || onUnpinComment)) || 
            (item.user_id !== user?.id && (onInviteUser || onKickUser))
          ) && (
            <View style={styles.commentMenuContainer} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.commentMenuButton}
                onPress={(e) => {
                  e.stopPropagation();
                  const newMenuId = openMenuCommentId === item.id ? null : item.id;
                  setOpenMenuCommentId(newMenuId);
                  
                  // Calculate position when opening menu
                  if (newMenuId === item.id) {
                    const layout = commentLayoutsRef.current[item.id];
                    if (layout) {
                      const position = calculateMenuPosition(layout);
                      setMenuPositions(prev => ({ ...prev, [item.id]: position }));
                    }
                  }
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MoreVertical size={14} color="rgba(255, 255, 255, 0.8)" strokeWidth={2} />
              </TouchableOpacity>
              
              {/* Menu dropdown */}
              {openMenuCommentId === item.id && (
                <Pressable 
                  style={[
                    styles.commentMenuDropdown,
                    menuPosition === 'above' && styles.commentMenuDropdownAbove
                  ]}
                  onPress={(e) => e.stopPropagation()}
                >
                  {isStreamer && (onPinComment || onUnpinComment) && (
                    <TouchableOpacity
                      style={styles.commentMenuItem}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (item.is_pinned && onUnpinComment) {
                          onUnpinComment(item.id);
                        } else if (!item.is_pinned && onPinComment) {
                          onPinComment(item.id);
                        }
                        setOpenMenuCommentId(null);
                      }}
                      activeOpacity={0.7}
                    >
                      {item.is_pinned ? (
                        <PinOff size={12} color="#FFD700" strokeWidth={2} />
                      ) : (
                        <Pin size={12} color="#FFD700" strokeWidth={2} />
                      )}
                      <Text style={styles.commentMenuItemText}>
                        {item.is_pinned ? 'Unpin' : 'Pin'} Comment
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  {item.user_id !== user?.id && onInviteUser && (
                    <TouchableOpacity
                      style={styles.commentMenuItem}
                      onPress={(e) => {
                        e.stopPropagation();
                        setInvitingUserId(item.user_id);
                        onInviteUser(item.user_id);
                        setOpenMenuCommentId(null);
                        setTimeout(() => setInvitingUserId(null), 2000);
                      }}
                      activeOpacity={0.7}
                    >
                      <UserPlus size={12} color="#00D9FF" strokeWidth={2} />
                      <Text style={styles.commentMenuItemText}>Invite User</Text>
                    </TouchableOpacity>
                  )}
                  
                  {item.user_id !== user?.id && onKickUser && (
                    <TouchableOpacity
                      style={[styles.commentMenuItem, styles.commentMenuItemDanger]}
                      onPress={(e) => {
                        e.stopPropagation();
                        onKickUser(item.user_id, item.user_name);
                        setOpenMenuCommentId(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ban size={12} color="#FF3B30" strokeWidth={2} />
                      <Text style={[styles.commentMenuItemText, styles.commentMenuItemTextDanger]}>
                        Kick User
                      </Text>
                    </TouchableOpacity>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </View>
        
        {/* Pinned indicator */}
        {item.is_pinned && (
          <View style={styles.pinnedBadge}>
            <Pin size={10} color="#FFD700" fill="#FFD700" />
            <Text style={styles.pinnedText}>Pinned</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <View style={styles.commentsWrapper} pointerEvents="box-none" collapsable={false}>
        {/* Pinned comment header (detached from the list) */}
        {pinnedComment ? (
          <View style={[styles.pinnedHeader, overlayCompact && styles.pinnedHeaderCompact]} pointerEvents="auto">
            {renderComment({ item: pinnedComment, index: -1 })}
          </View>
        ) : null}

        <FlatList
          pointerEvents="auto"
          ref={flatListRef}
          data={listComments}
          renderItem={({ item, index }) => renderComment({ item, index })}
          keyExtractor={(item) => item.id}
          style={styles.container}
          contentContainerStyle={[styles.commentsContent, overlayCompact && styles.commentsContentCompact]}
          showsVerticalScrollIndicator={true}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={true}
          nestedScrollEnabled={true}
          removeClippedSubviews={false}
          bounces={true}
          inverted={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(contentWidth, contentHeight) => {
            scrollPositionRef.current.contentHeight = contentHeight;
          }}
          onLayout={(event) => {
            scrollPositionRef.current.layoutHeight = event.nativeEvent.layout.height;
          }}
        />
        
        {/* New Comments Badge */}
        {newCommentsCount > 0 && (
          <TouchableOpacity
            style={styles.newCommentsBadge}
            onPress={handleNewCommentsPress}
            activeOpacity={0.8}
          >
            <View style={styles.newCommentsBadgeContent}>
              <Text style={styles.newCommentsBadgeText}>
                {newCommentsCount} new {newCommentsCount === 1 ? 'comment' : 'comments'}
              </Text>
              <ChevronDown size={16} color="#FFFFFF" strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Profile Modal */}
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
              <View style={styles.modalHeader}>
                {selectedUserAvatar ? (
                  <Image 
                    source={{ uri: selectedUserAvatar }} 
                    style={styles.modalAvatar} 
                    contentFit="cover"
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
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={16} color="#FFFFFF" strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalName} numberOfLines={1}>
                {selectedUserName}
              </Text>

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
                      <Check size={10} color="#FFFFFF" strokeWidth={2} />
                      <Text style={styles.modalFollowButtonText}>Following</Text>
                    </>
                  ) : (
                    <>
                      <UserPlus size={10} color="#FFFFFF" strokeWidth={2} />
                      <Text style={styles.modalFollowButtonText}>Follow</Text>
                    </>
                  )}
                </TouchableOpacity>

                {selectedUserId !== user?.id && selectedUserAvatar && (
                  <TouchableOpacity
                    style={styles.modalCreditButton}
                    onPress={() => setShowCreditModal(true)}
                    activeOpacity={0.8}
                  >
                    <Coins size={10} color="#000000" strokeWidth={2} />
                    <Text style={styles.modalCreditButtonText}>
                      Credit Me
                    </Text>
                  </TouchableOpacity>
                )}

                {profilePrivacyLoaded && !isProfilePrivate && selectedUserId !== user?.id && (
                  <TouchableOpacity
                    style={styles.modalViewButton}
                    onPress={navigateToChat}
                    activeOpacity={0.8}
                  >
                    <MessageCircle size={10} color="#FFFFFF" strokeWidth={2} />
                    <Text style={styles.modalViewButtonText}>Message</Text>
                  </TouchableOpacity>
                )}
              </View>

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
                      size={14} 
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
    </>
  );
}, (prevProps, nextProps) => {
  // Only re-render if streamId or critical props change
  return (
    prevProps.streamId === nextProps.streamId &&
    prevProps.isStreamer === nextProps.isStreamer &&
    prevProps.showInput === nextProps.showInput &&
    prevProps.canModerate === nextProps.canModerate &&
    prevProps.overlayCompact === nextProps.overlayCompact
  );
});

export default LiveComments;

const styles = StyleSheet.create({
  commentsWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: 'transparent',
    opacity: 1,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  commentsContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  commentsContentCompact: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  commentItem: {
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  commentItemCompact: {
    marginBottom: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  commentItemReplying: {
    backgroundColor: 'rgba(0, 217, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.3)',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  userAvatarCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  defaultAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(138, 43, 226, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.4)',
  },
  defaultAvatarCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  avatarTextCompact: {
    fontSize: 10,
  },
  commentUserInfo: {
    flex: 1,
    gap: 4,
  },
  commentUserName: {
    fontSize: 13,
    fontWeight: '700',
  },
  commentUserNameCompact: {
    fontSize: 11,
  },
  commentMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  commentMessageCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  commentActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  commentActionButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentMenuContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  commentMenuButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  commentMenuDropdown: {
    position: 'absolute',
    top: 28,
    right: 0,
    backgroundColor: 'rgba(25, 25, 25, 0.95)',
    borderRadius: 8,
    paddingVertical: 4,
    minWidth: 140,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 100, // Lowered from 1000 to avoid blocking modals/drawers
  },
  commentMenuDropdownAbove: {
    top: 'auto',
    bottom: 28,
  },
  commentMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentMenuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 4,
  },
  commentMenuItemText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  commentMenuItemTextDanger: {
    color: '#FF3B30',
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  pinnedText: {
    fontSize: 10,
    color: '#FFD700',
    fontWeight: '600',
  },

  // Sticky pinned comment header
  pinnedHeader: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 6,
    // Minimal background so it doesn't look like two layers
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  pinnedHeaderCompact: {
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 4,
  },
  newCommentsBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  newCommentsBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 217, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  newCommentsBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalDefaultAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(138, 43, 226, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.4)',
  },
  modalAvatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modalFollowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalFollowButtonActive: {
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    borderColor: 'rgba(0, 217, 255, 0.4)',
  },
  modalFollowButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalCreditButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFD700',
  },
  modalCreditButtonText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  modalViewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalViewButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalMessageInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
  },
  modalSendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSendButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
});
