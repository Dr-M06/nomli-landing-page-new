import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing,
  TextInput,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  X, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Eye, 
  RotateCcw,
  Settings,
  Users,
  Shield,
  Heart,
  Send,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Sparkles,
  BarChart3,
  Minimize2,
  Maximize2,
  Music,
  Menu,
  ChevronRight
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { useLiveStream } from './LiveStreamProvider';
import useAuth from '../hooks/useAuth';
import { usePresence } from '../hooks/usePresence';
import useFollowers from '../hooks/useFollowers';
import FloatingReactions, { FloatingReactionsRef } from './FloatingReactions';
import LiveStartingOverlay from './LiveStartingOverlay';
import EnhancedLiveStartingOverlay from './EnhancedLiveStartingOverlay';
import LiveComments from './LiveComments';
import RecentGifters from './RecentGifters';
import ViewerListModal from './ViewerListModal';
import ModeratorManagementModal from './ModeratorManagementModal';
import GuestManagementModal from './GuestManagementModal';

import NomliGiftAnimation from './NomliGiftAnimation';
import GiftNotificationCard from './GiftNotificationCard';
import ExpensiveGiftAnnouncement, { isExpensiveGift, type ExpensiveGiftAnnouncementGift } from './ExpensiveGiftAnnouncement';
import FloatingGiftBox from './FloatingGiftBox';
import { getRecentGifts } from '../utils/giftService';
import { supabase } from '../utils/supabase';
import ViewerJoinAnnouncement from './ViewerJoinAnnouncement';
import LiveStreamInteractions from './LiveStreamInteractions';
import { liveStreamSoundManager } from '../utils/liveStreamSounds';
import MultiGuestVideoLayout from './MultiGuestVideoLayout';
import NetworkQualityIndicator from './NetworkQualityIndicator';
import {
  getActiveGuests,
  getPendingJoinRequests,
  LiveStreamGuest,
  updateGuestMediaStatus,
  removeGuestFromStream,
  sendGuestInvitation,
} from '../utils/guestService';
import DraggableButton from './DraggableButton';
import { canModerate, pinComment, unpinComment, warnUser, kickUser } from '../utils/moderationService';
import LivestreamAnalytics from './LivestreamAnalytics';
import LiveAnalyticsModal from './LiveAnalyticsModal';
import Toast from 'react-native-toast-message';
import MusicModeAnimation from './MusicModeAnimation';
import { formatViewerCount } from '../utils/numberFormatter';
import { log, warn, error } from '../utils/productionLogger';
import {
  getFloatingTabBarReservedHeight,
  getFloatingTabBarExtraAboveInset,
  getLivestreamCommentsBottomOffset,
  LIVESTREAM_OVERLAY_COMMENTS_HEIGHT,
  LIVESTREAM_OVERLAY_COMMENTS_RIGHT_INSET,
} from '../utils/tabBarInset';
import { RtcSurfaceView } from 'react-native-agora';

const { width, height } = Dimensions.get('window');

interface LiveStreamBroadcasterProps {
  onClose: () => void;
}

export default function LiveStreamBroadcaster({ onClose }: LiveStreamBroadcasterProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const floatingReactionsRef = useRef<FloatingReactionsRef>(null);

  const {
    isStreaming,
    currentStream,
    viewerCount,
    stopLiveStream,
    toggleStreamCamera,
    toggleStreamMic,
    switchStreamCamera,
    isStreamCameraOn,
    isStreamMicOn,
    streamRemoteUids,
    debugViewerCount,
    forceRefreshViewerCount,
    forceCleanupInactiveViewers,
    muteRemoteGuestAudio,
    guestVideoEnabled,
    restoreAgoraAudio,
    networkQuality,
    connectionState,
    audioOnlyDueToNetwork,
    isStreamFrontCamera,
  } = useLiveStream();

  usePresence(user?.id ?? null, isStreaming ?? false);

  // Add a ready state to prevent rendering before engine is ready
  const [isEngineReady, setIsEngineReady] = useState(false);

  // Wait for engine to be fully ready before rendering video
  useEffect(() => {
    if (isStreaming) {
      // Give the engine a moment to fully initialize after joining
      const readyTimer = setTimeout(() => {
        setIsEngineReady(true);
        log('📹 Broadcaster engine is ready, rendering video view');
      }, 800);
      
      return () => clearTimeout(readyTimer);
    } else {
      setIsEngineReady(false);
    }
  }, [isStreaming]);
  
  // Follow functionality - only check if user is not the streamer
  const isStreamer = currentStream?.streamer_id === user?.id;
  const { 
    isFollowingUser, 
    followLoading, 
    handleFollow: toggleFollow 
  } = useFollowers(isStreamer ? undefined : currentStream?.streamer_id);


  const [streamDuration, setStreamDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showViewerList, setShowViewerList] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const [showStreamTitle, setShowStreamTitle] = useState(true);
  const [giftAnimations, setGiftAnimations] = useState<Array<{ id: string; gift: any }>>([]);
  const [expensiveGiftAnnouncement, setExpensiveGiftAnnouncement] = useState<ExpensiveGiftAnnouncementGift | null>(null);
  const [showFloatingGiftBox, setShowFloatingGiftBox] = useState(false);
  const [randomBoxTransactionId, setRandomBoxTransactionId] = useState<string | null>(null);
  const [randomBoxSenderInfo, setRandomBoxSenderInfo] = useState<{
    id: string;
    name: string;
    avatar?: string;
  } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showControlButtons, setShowControlButtons] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [currentGuests, setCurrentGuests] = useState<LiveStreamGuest[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [canModerateStream, setCanModerateStream] = useState(false);
  const [showModeratorManagement, setShowModeratorManagement] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showLiveAnalyticsModal, setShowLiveAnalyticsModal] = useState(false);
  const [endedStreamId, setEndedStreamId] = useState<string | null>(null);
  const [isClearScreenMode, setIsClearScreenMode] = useState(false);
  const [showControlDrawer, setShowControlDrawer] = useState(false);
  const drawerSlideAnim = useRef(new Animated.Value(0)).current; // 0 = closed, 1 = open
  
  // Song requests state (separate from comments for streamer)
  const [songRequests, setSongRequests] = useState<Array<{
    id: string;
    user_id: string;
    user_name: string;
    user_avatar?: string;
    songName: string;
    timestamp: string;
  }>>([]);
  
  // Sound controls for streamer
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const soundButtonScale = useRef(new Animated.Value(1)).current;
  
  // Draggable button positions (stored as offsets from right edge)
  const [buttonPositions, setButtonPositions] = useState({
    bell: { x: width - 60, y: height / 2 - 150 },
    honk: { x: width - 60, y: height / 2 - 50 },
    applause: { x: width - 60, y: height / 2 + 50 },
    laugh: { x: width - 60, y: height / 2 + 150 },
    analytics: { x: width - 60, y: height / 2 + 250 }, // Analytics button position
    guestRequests: { x: width - 60, y: height / 2 - 250 }, // Guest requests button position
    viewerCount: { x: width - 60, y: height / 2 - 350 }, // Viewer count button position
    moderator: { x: width - 60, y: height / 2 - 450 }, // Moderator management button position
    gifts: { x: width - 60, y: height / 2 - 550 }, // Recent gifters button position
    close: { x: width - 60, y: 60 }, // Close button position (top right)
    dropdown: { x: width - 48, y: 180 }, // Initial position for dropdown toggle
  });
  
  // Viewer join announcement state
  const [joinAnnouncement, setJoinAnnouncement] = useState<{
    visible: boolean;
    username: string;
    fullName?: string;
    avatarUrl?: string;
  }>({
    visible: false,
    username: '',
  });
  
  // Prevent duplicate comment sends
  const [isSendingComment, setIsSendingComment] = useState(false);
  const lastCommentRef = useRef<string>('');
  const lastCommentTimeRef = useRef<number>(0);
  
  // State for replying to a comment
  const [replyingToComment, setReplyingToComment] = useState<{
    id: string;
    userName: string;
    message: string;
  } | null>(null);

  // Send comment function with duplicate prevention
  const sendComment = async (message: string) => {
    try {
      if (!user) {
        Alert.alert(
          'Login Required',
          'You need to login to comment on live streams. Please login first.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Prevent duplicate sends within 1 second or same message
      const now = Date.now();
      let trimmedMessage = message.trim();
      
      if (isSendingComment) {
        log('Already sending a comment, skipping...');
        return;
      }
      
      if (lastCommentRef.current === trimmedMessage && now - lastCommentTimeRef.current < 1000) {
        log('Duplicate comment detected, skipping...');
        return;
      }
      
      setIsSendingComment(true);
      lastCommentRef.current = trimmedMessage;
      lastCommentTimeRef.current = now;

      // Handle reply - add @username if replying
      if (replyingToComment) {
        if (!trimmedMessage.startsWith(`@${replyingToComment.userName}`)) {
          trimmedMessage = `@${replyingToComment.userName} ${trimmedMessage}`;
        }
      }

      const commentData: any = {
        stream_id: currentStream?.id,
        user_id: user.id,
        message: trimmedMessage,
      };

      // Add reply_to fields if replying
      if (replyingToComment) {
        commentData.reply_to = replyingToComment.id;
        commentData.reply_to_username = replyingToComment.userName;
      }

      log('[LiveStreamBroadcaster] Sending comment to Supabase:', {
        stream_id: commentData.stream_id,
        user_id: commentData.user_id,
        message_length: commentData.message?.length || 0,
        has_reply: !!commentData.reply_to,
      });

      const { data, error } = await supabase
        .from('live_stream_comments')
        .insert(commentData)
        .select(); // Select the inserted row to verify it was saved

      if (error) {
        error('[LiveStreamBroadcaster] ❌ Error sending comment:', error);
        Alert.alert(
          'Error',
          `Failed to send comment: ${error.message || 'Unknown error'}`,
          [{ text: 'OK' }]
        );
      } else {
        log('[LiveStreamBroadcaster] ✅ Comment sent successfully:', {
          comment_id: data?.[0]?.id,
          created_at: data?.[0]?.created_at,
        });
        // Clear reply state after sending
        setReplyingToComment(null);
      }
    } catch (error) {
      error('Error sending comment:', error);
    } finally {
      setIsSendingComment(false);
    }
  };

  // Handle reply to comment
  const handleReplyToComment = (comment: { id: string; user_name: string; message: string }) => {
    setReplyingToComment({
      id: comment.id,
      userName: comment.user_name,
      message: comment.message,
    });
    // Prepend @username to comment text
    const replyPrefix = `@${comment.user_name} `;
    setCommentText(replyPrefix);
    // Focus the comment input
    setIsCommentFocused(true);
  };

  // Handle invite user from comment (host only)
  const handleInviteUserFromComment = async (userId: string) => {
    if (!currentStream || !user || user.id !== currentStream.streamer_id) {
      return;
    }
    
    // Check guest limit
    if (currentGuests.length >= 1) {
      Alert.alert(
        'Guest Limit Reached',
        'You can only have 1 co-host at a time. Please remove an existing co-host first.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    try {
      log('📤 [BROADCASTER] Inviting user from comment:', userId);
      const result = await sendGuestInvitation(currentStream.id, userId);
      
      if (result.success) {
        log('[LiveStreamBroadcaster] ✅ Guest invitation sent successfully');
        Toast.show({
          type: 'success',
          text1: 'Invitation Sent',
          text2: 'The user will receive a notification to join as co-host.',
          visibilityTime: 3000,
        });
      } else {
        error('[LiveStreamBroadcaster] ❌ Failed to send invitation:', result.error);
        Toast.show({
          type: 'error',
          text1: 'Invitation Failed',
          text2: result.error || 'Failed to send invitation. Please try again.',
          visibilityTime: 3000,
        });
      }
    } catch (error: any) {
      error('[LiveStreamBroadcaster] ❌ Error sending invitation:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to send invitation. Please try again.',
        visibilityTime: 3000,
      });
    }
  };

  const handlePinComment = async (commentId: string) => {
    if (!currentStream?.id || !user?.id) {
      Alert.alert('Error', 'Stream ID or user ID not available');
      return;
    }

    try {
      const success = await pinComment(currentStream.id, commentId, user.id);
      if (success) {
        Toast.show({
          type: 'success',
          text1: 'Comment pinned',
          text2: 'The comment is now visible to all viewers',
        });
      } else {
        Alert.alert('Error', 'Failed to pin comment. You may not have permission.');
      }
    } catch (err: any) {
      error('[BROADCASTER] Error pinning comment:', err);
      Alert.alert('Error', err.message || 'Failed to pin comment');
    }
  };

  const handleUnpinComment = async (commentId: string) => {
    if (!currentStream?.id || !user?.id) {
      Alert.alert('Error', 'Stream ID or user ID not available');
      return;
    }

    try {
      const success = await unpinComment(currentStream.id, commentId, user.id);
      if (success) {
        Toast.show({
          type: 'success',
          text1: 'Comment unpinned',
          text2: '',
        });
      } else {
        Alert.alert('Error', 'Failed to unpin comment. You may not have permission.');
      }
    } catch (err: any) {
      error('[BROADCASTER] Error unpinning comment:', err);
      Alert.alert('Error', err.message || 'Failed to unpin comment');
    }
  };
  
  // Animation values for premium interactions
  const heartScaleAnim = useRef(new Animated.Value(1)).current;
  const inputScaleAnim = useRef(new Animated.Value(1)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const controlsSlideAnim = useRef(new Animated.Value(0)).current;
  const controlsOpacityAnim = useRef(new Animated.Value(0)).current;
  const toggleRotateAnim = useRef(new Animated.Value(0)).current;

  // Update stream duration every second
  useEffect(() => {
    if (!isStreaming || !currentStream) return;

    const interval = setInterval(() => {
      const startTime = new Date(currentStream.started_at);
      const now = new Date();
      const durationMs = now.getTime() - startTime.getTime();
      setStreamDuration(Math.floor(durationMs / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isStreaming, currentStream]);

  // Auto-hide controls
  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [showControls]);

  // Subscribe to guest changes for host notifications
  useEffect(() => {
    if (!currentStream?.id || !isStreaming) return;

    const guestChannel = supabase
      .channel(`guest_changes_broadcaster_${currentStream.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_guests',
          filter: `stream_id=eq.${currentStream.id}`,
        },
        async (payload) => {
          const guest = payload.new as any;
          // Only notify when guest actually joins (joined_at is set)
          if (guest.joined_at) {
            log('👥 [BROADCASTER] Guest joined:', guest);
            // Fetch guest profile
            if (guest.user_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('username, full_name, avatar_url')
                .eq('id', guest.user_id)
                .single();

              if (profile) {
                setJoinAnnouncement({
                  visible: true,
                  username: profile.username || 'Guest',
                  fullName: profile.full_name,
                  avatarUrl: profile.avatar_url,
                });
                liveStreamSoundManager.playViewerJoinSound();
              }
            }
          } else {
            log('👥 [BROADCASTER] Guest is joining (not yet joined)...');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_stream_guests',
          filter: `stream_id=eq.${currentStream.id}`,
        },
        async (payload) => {
          try {
            const guest = payload.new as any;
            // Notify when guest leaves (is_active becomes false)
            if (!guest.is_active && guest.left_at) {
              log('👥 [BROADCASTER] Guest left:', guest);
              // Immediately remove from local state to prevent crashes
              setCurrentGuests(prev => prev.filter(g => g.user_id !== guest.user_id));
              // Refresh guest list to ensure consistency
              const guestsResult = await getActiveGuests(currentStream.id);
              if (guestsResult.success && guestsResult.guests) {
                setCurrentGuests(guestsResult.guests);
              }
            }
          } catch (err) {
            error('👥 [BROADCASTER] Error handling guest UPDATE:', err);
            // Refresh guest list on error to recover
            try {
              const guestsResult = await getActiveGuests(currentStream.id);
              if (guestsResult.success && guestsResult.guests) {
                setCurrentGuests(guestsResult.guests);
              }
            } catch (refreshError) {
              error('👥 [BROADCASTER] Error refreshing guests:', refreshError);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(guestChannel);
    };
  }, [currentStream?.id, isStreaming]);

  // Fetch active guests and pending requests
  useEffect(() => {
    if (!currentStream?.id || !isStreaming) return;

    const fetchGuestsAndRequests = async () => {
      if (__DEV__) log('👥 [BROADCASTER] Fetching guests for stream:', currentStream.id);
      const guestsResult = await getActiveGuests(currentStream.id);
      if (guestsResult.success && guestsResult.guests) {
        setCurrentGuests(guestsResult.guests);
      } else if (__DEV__ && guestsResult.error) {
        error('👥 [BROADCASTER] Error fetching guests:', guestsResult.error);
      }

      const requestsResult = await getPendingJoinRequests(currentStream.id);
      if (requestsResult.success && requestsResult.requests) {
        setPendingRequestsCount(requestsResult.requests.length);
      }
    };

    fetchGuestsAndRequests();
    const interval = setInterval(fetchGuestsAndRequests, 10000); // 10s to reduce load (was 5s)

    return () => clearInterval(interval);
  }, [currentStream?.id, isStreaming]);

  // Check moderation permissions
  useEffect(() => {
    const checkModerationPermissions = async () => {
      if (!user?.id || !currentStream?.id) return;
      const canMod = await canModerate(currentStream.id, user.id);
      setCanModerateStream(canMod);
    };

    if (currentStream?.id && user?.id) {
      checkModerationPermissions();
    }
  }, [currentStream?.id, user?.id]);

  // Subscribe to new viewer joins for announcements
  useEffect(() => {
    if (!currentStream?.id || !isStreaming) return;

    const channel = supabase
      .channel(`viewer_joins_${currentStream.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_viewers',
          filter: `stream_id=eq.${currentStream.id}`,
        },
        async (payload) => {
          const newViewer = payload.new;
          // Skip if it's the broadcaster themselves
          if (newViewer.user_id === user?.id) return;

          // Fetch viewer profile
          if (newViewer.user_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username, full_name, avatar_url')
              .eq('id', newViewer.user_id)
              .single();

            if (profile) {
              setJoinAnnouncement({
                visible: true,
                username: profile.username || 'User',
                fullName: profile.full_name,
                avatarUrl: profile.avatar_url,
              });
              
              // Play viewer join sound
              liveStreamSoundManager.playViewerJoinSound();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStream?.id, isStreaming, user?.id]);

  // Initialize sound manager for broadcaster when streaming starts
  useEffect(() => {
    if (isStreaming) {
      log('🔊 [BROADCASTER] Initializing sound manager for streamer');
      liveStreamSoundManager.initialize();
      
      // Set up callback to restore Agora audio after sound effects play
      // This prevents sound effects from suppressing Agora's microphone
      liveStreamSoundManager.setAgoraAudioRestoreCallback(async () => {
        if (restoreAgoraAudio) {
          await restoreAgoraAudio();
        }
      });
    } else {
      // Clear callback when not streaming
      liveStreamSoundManager.setAgoraAudioRestoreCallback(null);
    }
  }, [isStreaming, restoreAgoraAudio]);

  // Subscribe to reactions for sound effects
  useEffect(() => {
    if (!currentStream?.id || !isStreaming) return;

    const reactionsChannel = supabase
      .channel(`stream_reactions_sounds_${currentStream.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_reactions',
          filter: `stream_id=eq.${currentStream.id}`,
        },
        (payload) => {
          const reaction = payload.new;
          // Skip reactions from broadcaster themselves (they hear it when they press the button directly)
          if (reaction.user_id === user?.id) return;

          // CRITICAL: Prevent duplicate reactions from playing multiple times
          const reactionKey = `${reaction.id}_${reaction.reaction_type}`;
          const now = Date.now();
          const lastPlayed = liveStreamSoundManager.getLastPlayedTime(reactionKey);
          
          if (lastPlayed && (now - lastPlayed) < 500) {
            log('🔊 [BROADCASTER] Duplicate reaction detected, skipping sound:', reactionKey);
            return; // Skip duplicate reaction within 500ms
          }
          
          liveStreamSoundManager.setLastPlayedTime(reactionKey, now);

          // Play sound based on reaction type
          if (reaction.reaction_type === 'honk') {
            log('🔊 [BROADCASTER] Playing honk sound from viewer');
            liveStreamSoundManager.playHonkSound();
          } else if (reaction.reaction_type === 'applause') {
            log('🔊 [BROADCASTER] Playing applause sound from viewer');
            liveStreamSoundManager.playApplauseSound();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reactionsChannel);
      // Stop all sounds when component unmounts or stream ends
      liveStreamSoundManager.stopAllSounds();
    };
  }, [currentStream?.id, isStreaming, user?.id]);

  // Cleanup stream when component unmounts
  useEffect(() => {
    return () => {
      // Stop all sounds first
      liveStreamSoundManager.stopAllSounds();
      // If component unmounts while streaming, stop the stream
      if (isStreaming) {
        log('🧹 LiveStreamBroadcaster unmounting while streaming, cleaning up...');
        stopLiveStream();
      }
    };
  }, [isStreaming, stopLiveStream]);

  // Keep screen awake during streaming
  useEffect(() => {
    if (isStreaming) {
      log('📱 Activating keep awake for broadcaster');
      activateKeepAwake();
    } else {
      log('📱 Deactivating keep awake for broadcaster');
      deactivateKeepAwake();
    }

    // Cleanup when component unmounts
    return () => {
      deactivateKeepAwake();
    };
  }, [isStreaming]);

  // Auto-hide stream title after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowStreamTitle(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Audio-only banner is driven by context: audioOnlyDueToNetwork (set only after sustained poor quality in provider)

  // Debug follow state
  useEffect(() => {
    log('🎯 Follow state updated:', {
      streamerId: currentStream?.streamer_id,
      isFollowingUser,
      followLoading
    });
  }, [currentStream?.streamer_id, isFollowingUser, followLoading]);

  // Listen to keyboard events - simplified for better UX
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        // On iOS, use transform to move the input above keyboard
        // On Android with adjustResize, the view automatically resizes, so use minimal offset
        if (Platform.OS === 'ios') {
          setKeyboardHeight(e.endCoordinates.height - insets.bottom);
        } else {
          // On Android with adjustResize, just use a small offset to keep it above keyboard
          setKeyboardHeight(e.endCoordinates.height);
        }
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, [insets.bottom]);

  // Listen for new gifts
  useEffect(() => {
    if (!currentStream?.id) return;

    let lastGiftId = '';
    const processedGifts = new Set();

    const fetchRecentGifts = async () => {
      try {
        const gifts = await getRecentGifts(currentStream.id);
        
        // Only process new gifts
        const newGifts = gifts.filter(gift => 
          !processedGifts.has(gift.id) && 
          new Date(gift.created_at) > new Date(Date.now() - 10000) // Only gifts from last 10 seconds
        );
        
        newGifts.forEach((gift, index) => {
          processedGifts.add(gift.id);
          
          // Skip flamingo egg - it triggers floating egg overlay instead
          if (gift.gift_id === 'flamingo_egg') {
            return;
          }
          
          const animationId = `${gift.id}-${Date.now()}-${index}`;
          // Calculate quantity from price if gift_quantity doesn't exist
          const basePrice = 1; // Assuming base price of 1 coin per item
          const calculatedQuantity = gift.gift_quantity || Math.floor(gift.gift_price / basePrice) || 1;
          
          const giftData = {
            id: gift.gift_id,
            name: gift.gift_name,
            emoji: gift.gift_emoji,
            price: gift.gift_price,
            rarity: gift.gift_rarity,
            quantity: calculatedQuantity,
            sender_name: gift.sender?.username || gift.sender?.full_name || 'Anonymous',
            sender_avatar: gift.sender?.avatar_url,
          };

          setTimeout(() => {
            setGiftAnimations(prev => [...prev, { id: animationId, gift: giftData }]);
            if (isExpensiveGift(giftData)) {
              setExpensiveGiftAnnouncement(giftData);
            }
          }, index * 500); // Stagger the animations
        });
      } catch (error) {
        error('Error fetching gifts:', error);
      }
    };

    fetchRecentGifts();
    const interval = setInterval(fetchRecentGifts, 2000);

    return () => clearInterval(interval);
  }, [currentStream?.id]);

  // Listen for flamingo egg purchases
  useEffect(() => {
    if (!currentStream?.id) return;

    log('🥚 [FLAMINGO_EGG] Setting up subscription for stream:', currentStream.id);

    const channel = supabase
      .channel(`flamingo_egg_${currentStream.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gift_transactions',
          filter: `stream_id=eq.${currentStream.id}`,
        },
        async (payload: any) => {
          log('🥚 [FLAMINGO_EGG] Gift transaction received:', payload.new);
          const gift = payload.new;
          
          // Check if it's a flamingo egg purchase
          if (gift.gift_id === 'flamingo_egg') {
            log('🥚 [FLAMINGO_EGG] Egg detected! Sender:', gift.sender_id, 'Receiver:', gift.receiver_id, 'Transaction ID:', gift.id);
            // Show floating gift box to everyone
            // Fetch sender profile
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, username, full_name, avatar_url')
              .eq('id', gift.sender_id)
              .single();

            const senderName = senderProfile?.full_name || senderProfile?.username || 'Anonymous';
            const senderAvatar = senderProfile?.avatar_url;
            
            setRandomBoxSenderInfo({
              id: gift.sender_id,
              name: senderName,
              avatar: senderAvatar,
            });
            setRandomBoxTransactionId(gift.id);
            setShowFloatingGiftBox(true);
          }
        }
      )
      .subscribe((status) => {
        log('🥚 [FLAMINGO_EGG] Subscription status:', status);
      });

    return () => {
      log('🥚 [FLAMINGO_EGG] Cleaning up subscription');
      channel.unsubscribe();
    };
  }, [currentStream?.id]);

  // Fallback: Check for flamingo_egg in polling mechanism
  useEffect(() => {
    if (!currentStream?.id) return;

    const checkForFlamingoEgg = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: recentRandomBox } = await supabase
          .from('gift_transactions')
          .select('*')
          .eq('stream_id', currentStream.id)
          .in('gift_id', ['flamingo_egg'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (recentRandomBox) {
          const giftTime = new Date(recentRandomBox.created_at).getTime();
          const now = Date.now();
          // Only trigger if gift was sent in last 5 seconds
          if (now - giftTime < 5000) {
            log('🥚 [FLAMINGO_EGG] Found recent egg via polling, triggering!');
            
            // Fetch sender profile
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, username, full_name, avatar_url')
              .eq('id', recentRandomBox.sender_id)
              .single();

            const senderName = senderProfile?.full_name || senderProfile?.username || 'Anonymous';
            const senderAvatar = senderProfile?.avatar_url;
            
            setRandomBoxSenderInfo({
              id: recentRandomBox.sender_id,
              name: senderName,
              avatar: senderAvatar,
            });
            setRandomBoxTransactionId(recentRandomBox.id);
            setShowFloatingGiftBox(true);
          }
        }
      } catch (error) {
        // Ignore errors - this is just a fallback
      }
    };

    const interval = setInterval(checkForFlamingoEgg, 2000);
    return () => clearInterval(interval);
  }, [currentStream?.id]);

  // Play gift sound effect for received gifts
  const playReceivedGiftSound = async (gift: any) => {
    try {
      // Create a pleasant sound using the call ringtone which is more musical
      const soundFile = require('../assets/sounds/call-ringtone.mp3');
      const volume = gift.rarity === 'legendary' ? 0.4 : 
                    gift.rarity === 'epic' ? 0.3 : 
                    gift.rarity === 'rare' ? 0.2 : 0.15;
      
      const { sound } = await Audio.Sound.createAsync(
        soundFile,
        { shouldPlay: true, volume, rate: 2.0 } // Play at double speed for a chime effect
      );
      
      await sound.playAsync();
      
      // Add second chime for premium gifts
      if (gift.rarity === 'legendary' || gift.price >= 500) {
        setTimeout(async () => {
          try {
            const { sound: secondSound } = await Audio.Sound.createAsync(
              soundFile,
              { shouldPlay: true, volume: volume * 0.7, rate: 2.5 }
            );
            await secondSound.playAsync();
            setTimeout(() => secondSound.unloadAsync(), 800);
          } catch (e) {
            log('Could not play second chime:', e);
          }
        }, 300);
      }
      
      setTimeout(() => {
        sound.unloadAsync();
      }, 1500);
    } catch (error) {
      log('Could not play received gift sound:', error);
    }
  };

  // Remove gift animation
  const removeGiftAnimation = (id: string) => {
    setGiftAnimations(prev => prev.filter(anim => anim.id !== id));
  };

  const handleEndStream = () => {
    Alert.alert(
      'End Live Stream',
      'Are you sure you want to end your live stream?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Stream', 
          style: 'destructive',
          onPress: async () => {
            // Capture stream ID before stopping
            const streamId = currentStream?.id;
            
            // Stop the stream
            await stopLiveStream();
            
            // Show analytics modal after a short delay
            if (streamId) {
              setTimeout(() => {
                setEndedStreamId(streamId);
                setShowAnalytics(true);
              }, 500);
            }
          }
        },
      ]
    );
  };

  const handleScreenTap = () => {
    setShowControls(!showControls);
    setShowStreamTitle(true); // Show stream title when screen is touched
    
    // Auto-hide controls and stream title again after 3 seconds
    if (!showControls) {
      setTimeout(() => {
        setShowControls(false);
        setShowStreamTitle(false);
      }, 3000);
    }
  };

  const handleRemoveGuest = async (userId: string) => {
    if (!currentStream?.id) return;
    
    Alert.alert(
      'Remove Co-host',
      'Are you sure you want to remove this co-host from the stream?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await removeGuestFromStream(currentStream.id, userId);
              
              if (result.success) {
                // Update local state
                setCurrentGuests(prev => prev.filter(g => g.user_id !== userId));
                log('✅ [BROADCASTER] Guest removed successfully');
              } else {
                Alert.alert('Error', result.error || 'Failed to remove co-host');
              }
            } catch (error: any) {
              error('❌ [BROADCASTER] Error removing guest:', error);
              Alert.alert('Error', error.message || 'Failed to remove co-host');
            }
          },
        },
      ]
    );
  };

  const handleMuteGuest = async (userId: string, audioEnabled: boolean) => {
    if (!currentStream?.id) return;
    
    log('🎤 [BROADCASTER] Muting/unmuting guest:', { userId, audioEnabled });
    
    try {
      // Find the guest's Agora UID
      let guest = currentGuests.find(g => g.user_id === userId);
      
      // If guest not found or no UID, wait a bit and retry (guest might still be joining)
      if (!guest || !guest.agora_uid) {
        warn('⚠️ [BROADCASTER] Guest not found or no Agora UID yet, waiting and retrying...', userId);
        
        // Wait 500ms and retry once (guest might be in the process of joining)
        await new Promise(resolve => setTimeout(resolve, 500));
        guest = currentGuests.find(g => g.user_id === userId);
        
        if (!guest || !guest.agora_uid) {
          // Still no UID after retry - guest is likely still connecting
          warn('⚠️ [BROADCASTER] Guest still has no Agora UID after retry - guest may still be connecting:', userId);
          Alert.alert('Guest Connecting', 'Please wait for the guest to finish connecting before muting/unmuting.');
          return;
        }
      }

      const guestAgoraUid = guest.agora_uid;
      const muted = !audioEnabled; // audioEnabled=true means unmuted, so muted=!audioEnabled
      
      // Mute/unmute the remote audio stream using Agora API
      await muteRemoteGuestAudio(guestAgoraUid, muted);
      
      // Update database
      const result = await updateGuestMediaStatus(
        currentStream.id,
        userId,
        audioEnabled
      );
      
      if (result.success) {
        log('✅ [BROADCASTER] Guest audio status updated:', audioEnabled);
        // Update local state
        setCurrentGuests(prev => 
          prev.map(guest => 
            guest.user_id === userId 
              ? { ...guest, audio_enabled: audioEnabled }
              : guest
          )
        );
      } else {
        error('❌ [BROADCASTER] Failed to update guest audio status:', result.error);
        Alert.alert('Error', 'Failed to update guest audio status');
      }
    } catch (error) {
      error('❌ [BROADCASTER] Error muting/unmuting guest:', error);
      Alert.alert('Error', 'Failed to update guest audio status');
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };


  if (!isStreaming || !currentStream) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar hidden />
        <View style={styles.loadingContent}>
          <View style={styles.loadingAnimation}>
            <ActivityIndicator size="large" color="#00D9FF" />
          </View>
          <Text style={styles.loadingTitle}>Starting your live stream...</Text>
          <Text style={styles.loadingSubtitle}>Setting up your broadcast</Text>
        </View>
      </View>
    );
  }

  // Debug log for render state
  // Render state logging disabled to reduce console spam

  return (
    <View style={styles.container}>
      <StatusBar hidden />
        
        {/* Local Video Preview with Multi-Guest Layout */}
        <TouchableOpacity 
          style={styles.videoContainer} 
          onPress={handleScreenTap}
          activeOpacity={1}
        >
        {currentStream?.music_mode ? (
          <View style={styles.videoSurface}>
            <MusicModeAnimation style={StyleSheet.absoluteFill} />
          </View>
        ) : isStreamCameraOn && isEngineReady ? (
          <>
            {currentGuests.length > 0 ? (
              <>
                {/* Rendering MultiGuestVideoLayout - logging disabled to reduce console spam */}
                <MultiGuestVideoLayout
                  hostUid={0} // Local broadcaster UID is always 0
                  hostUserId={user?.id || ''}
                  hostUsername={currentStream?.streamer_name || 'Host'}
                  hostAvatarUrl={currentStream?.streamer_avatar}
                  hostAudioEnabled={isStreamMicOn}
                  hostVideoEnabled={isStreamCameraOn}
                  guests={currentGuests}
                  activeGuests={currentGuests.map(guest => {
                    const guestUid = guest.agora_uid || 2001;
                    // Use tracked video state if available, otherwise fall back to database value
                    // Only show video if it's actually decoding (state 2), not just enabled in DB
                    const trackedVideoState = guestVideoEnabled.get(guestUid);
                    const videoEnabled = trackedVideoState !== undefined 
                      ? trackedVideoState 
                      : guest.video_enabled; // Fallback to DB value if not tracked yet
                    
                    return {
                      uid: guestUid,
                      userId: guest.user_id,
                      username: guest.profile?.username || 'Guest',
                      avatarUrl: guest.profile?.avatar_url,
                      audioEnabled: guest.audio_enabled,
                      videoEnabled: videoEnabled,
                      isHost: false,
                    };
                  })}
                  isStreamer={true}
                  activeSpeakerUid={undefined}
                  currentUserId={user?.id}
                  streamId={currentStream?.id}
                  onMuteGuest={handleMuteGuest}
                  onRemoveGuest={handleRemoveGuest}
                  isStreamFrontCamera={isStreamFrontCamera}
                />
              </>
            ) : (
            <RtcSurfaceView
              canvas={{
                uid: 0, // Local user (broadcaster always sees their own feed as 0)
                renderMode: 1, // Fit mode (0 = hidden, 1 = fit, 2 = crop)
                mirrorMode: isStreamFrontCamera ? 1 : 0, // Front = mirror (selfie); back = no mirror so things show correct position
              }}
              zOrderMediaOverlay={false}
              style={styles.videoSurface}
            />
            )}
          </>
        ) : isStreamCameraOn && !isEngineReady ? (
          <View style={[styles.videoPlaceholder, { backgroundColor: themeColors.neutral.background }]}>
            <Video size={48} color="#FFFFFF" />
            <Text style={styles.videoPlaceholderText}>Starting camera...</Text>
          </View>
        ) : audioOnlyDueToNetwork ? (
          /* Poor network: show music mode experience (animation) instead of "Audio Only / Poor network" screen */
          <View style={StyleSheet.absoluteFill}>
            <MusicModeAnimation style={StyleSheet.absoluteFill} />
            <View style={styles.musicModeBadge} pointerEvents="none">
              <Music size={20} color="rgba(255, 255, 255, 0.9)" strokeWidth={2} />
              <View style={styles.musicModeBadgeTextContainer}>
                <Text style={styles.musicModeBadgeText}>Music mode</Text>
                <Text style={styles.musicModeBadgeSubtext}>Saving bandwidth</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.videoPlaceholder, { backgroundColor: themeColors.neutral.background }]}>
            <VideoOff size={48} color="#FFFFFF" />
            <Text style={styles.videoPlaceholderText}>Camera is off</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Clear Screen Mode - Show only eye icon */}
      {isClearScreenMode && (
        <View style={[styles.clearScreenHeader, { top: Math.max(insets.top, 8) + 8 }]}>
          <TouchableOpacity 
            style={styles.viewerCountButton}
            onPress={() => setShowViewerList(v => !v)}
            activeOpacity={0.7}
          >
            <Eye size={12} color="#FFFFFF" />
            {viewerCount > 0 && (
              <Text style={styles.viewerCountButtonText}>
                {formatViewerCount(viewerCount)}
              </Text>
            )}
          </TouchableOpacity>
          
          {/* Exit Clear Screen Button */}
          <TouchableOpacity 
            style={styles.clearScreenExitButton}
            onPress={() => setIsClearScreenMode(false)}
            activeOpacity={0.7}
          >
            <Maximize2 size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Header removed - controls moved to draggable buttons for cleaner UI */}
      
      {/* Compact header removed - controls moved to draggable buttons */}

      {/* Close Button (Red) - X - Always visible, top right */}
      {currentStream?.id && !isClearScreenMode && (
        <DraggableButton
          initialX={buttonPositions.close.x}
          initialY={buttonPositions.close.y}
          buttonSize={48}
          onPositionChange={(x, y) => {
            setButtonPositions(prev => ({ ...prev, close: { x, y } }));
          }}
        >
          <TouchableOpacity
            delayPressIn={50}
            onPress={handleEndStream}
            style={[
              styles.streamerControlButton,
              { backgroundColor: 'rgba(255, 59, 48, 0.85)' }, // Red
            ]}
            activeOpacity={0.8}
          >
            <X size={24} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </DraggableButton>
      )}

      {/* Viewer Count Button (Blue) - Eye - Hide in clear screen mode - Redesigned as horizontal pill */}
      {currentStream?.id && !isClearScreenMode && (
        <DraggableButton
          initialX={buttonPositions.viewerCount.x}
          initialY={buttonPositions.viewerCount.y}
          buttonSize={currentGuests && currentGuests.length > 0 ? 40 : 48}
          onPositionChange={(x, y) => {
            setButtonPositions(prev => ({ ...prev, viewerCount: { x, y } }));
          }}
        >
          <TouchableOpacity
            delayPressIn={50}
            onPress={() => setShowViewerList(v => !v)}
            onLongPress={() => setIsClearScreenMode(true)}
            style={[
              styles.viewerCountPillButton,
              currentGuests && currentGuests.length > 0 && styles.viewerCountPillButtonCompact,
            ]}
            activeOpacity={0.8}
          >
            <Eye size={currentGuests && currentGuests.length > 0 ? 16 : 18} color="#FFFFFF" strokeWidth={2.5} />
            {viewerCount > 0 && (
              <Text style={[
                styles.viewerCountPillText,
                currentGuests && currentGuests.length > 0 && styles.viewerCountPillTextCompact
              ]}>
                {formatViewerCount(viewerCount)}
              </Text>
            )}
          </TouchableOpacity>
        </DraggableButton>
      )}

      {/* Moderator Management Button - MOVED TO DRAWER */}


      {/* Control Drawer Toggle Button - Always visible, top-left */}
      {currentStream?.id && !isClearScreenMode && (
        <TouchableOpacity
          style={[styles.drawerToggleButton, { top: Math.max(insets.top, 8) + 8, left: 12 }]}
          onPress={() => {
            const newValue = !showControlDrawer;
            setShowControlDrawer(newValue);
            Animated.timing(drawerSlideAnim, {
              toValue: newValue ? 1 : 0,
              duration: 300,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }).start();
          }}
          activeOpacity={0.8}
        >
          <Menu size={20} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {/* Control Drawer - Slides in from right */}
      {currentStream?.id && !isClearScreenMode && (
        <>
          {/* Backdrop - tap outside (anywhere except the drawer panel) to close */}
          {showControlDrawer && (
            <TouchableOpacity
              style={styles.drawerBackdrop}
              activeOpacity={1}
              onPress={() => {
                setShowControlDrawer(false);
                Animated.timing(drawerSlideAnim, {
                  toValue: 0,
                  duration: 300,
                  easing: Easing.out(Easing.ease),
                  useNativeDriver: true,
                }).start();
              }}
              pointerEvents="auto"
              accessibilityLabel="Close drawer"
              accessibilityRole="button"
            />
          )}
          
          {/* Drawer Panel */}
          <Animated.View
            style={[
              styles.controlDrawer,
              {
                transform: [{
                  translateX: drawerSlideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [280, 0] // Drawer width is 280px
                  })
                }],
                opacity: drawerSlideAnim,
              }
            ]}
          >
            {/* Drawer Header */}
            <View style={[styles.drawerHeader, { paddingTop: Math.max(insets.top, 8) + 16 }]}>
              <Text style={styles.drawerTitle}>Controls</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowControlDrawer(false);
                  Animated.timing(drawerSlideAnim, {
                    toValue: 0,
                    duration: 300,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                  }).start();
                }}
                style={styles.drawerCloseButton}
              >
                <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Drawer Content - Tetris-like Grid */}
            <View style={styles.drawerContent}>
              {/* Row 1: Guest Requests, Analytics, Moderator */}
              <View style={styles.drawerRow}>
                <TouchableOpacity
                  style={[styles.drawerButton, { backgroundColor: 'rgba(0, 199, 190, 0.85)' }]}
                  onPress={() => {
                    setShowGuestModal(true);
                    setShowControlDrawer(false);
                    Animated.timing(drawerSlideAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
                  }}
                >
                  <UserPlus size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.drawerButtonLabel}>Guests</Text>
                  {pendingRequestsCount > 0 && (
                    <View style={styles.drawerBadge}>
                      <Text style={styles.drawerBadgeText}>{pendingRequestsCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.drawerButton, { backgroundColor: 'rgba(138, 43, 226, 0.85)' }]}
                  onPress={() => {
                    setShowLiveAnalyticsModal(true);
                    setShowControlDrawer(false);
                    Animated.timing(drawerSlideAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
                  }}
                >
                  <BarChart3 size={16} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
                  <Text style={styles.drawerButtonLabel}>Analytics</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.drawerButton, { backgroundColor: 'rgba(88, 86, 214, 0.85)' }]}
                  onPress={() => {
                    setShowModeratorManagement(true);
                    setShowControlDrawer(false);
                    Animated.timing(drawerSlideAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
                  }}
                >
                  <Shield size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.drawerButtonLabel}>Moderator</Text>
                </TouchableOpacity>
              </View>

              {/* Row 2: Reactions - Bell, Honk */}
              <View style={styles.drawerRow}>
                <TouchableOpacity
                  style={[styles.drawerButton, { backgroundColor: soundsEnabled ? 'rgba(76, 175, 80, 0.9)' : 'rgba(139, 139, 139, 0.6)' }]}
                  onPress={() => {
                    const newState = !soundsEnabled;
                    setSoundsEnabled(newState);
                    liveStreamSoundManager.setSoundsEnabled(newState);
                  }}
                >
                  {soundsEnabled ? (
                    <Bell size={16} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
                  ) : (
                    <BellOff size={16} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                  <Text style={styles.drawerButtonLabel}>Sounds</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.drawerButton, { backgroundColor: 'rgba(255, 59, 48, 0.85)' }]}
                  onPress={async () => {
                    await liveStreamSoundManager.initialize();
                    liveStreamSoundManager.playHonkSound();
                    const positions = [width * 0.3, width * 0.5, width * 0.7];
                    positions.forEach((x, index) => {
                      setTimeout(() => {
                        floatingReactionsRef.current?.addHonk(x + (Math.random() - 0.5) * 50);
                      }, index * 100);
                    });
                  }}
                >
                  <Volume2 size={16} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
                  <Text style={styles.drawerButtonLabel}>Honk</Text>
                </TouchableOpacity>
              </View>

              {/* Row 3: Reactions - Splash, Laugh */}
              <View style={styles.drawerRow}>
                <TouchableOpacity
                  style={[styles.drawerButton, { backgroundColor: 'rgba(255, 214, 10, 0.85)' }]}
                  onPress={async () => {
                    await liveStreamSoundManager.initialize();
                    liveStreamSoundManager.playApplauseSound();
                    const positions = [width * 0.2, width * 0.4, width * 0.6, width * 0.8];
                    positions.forEach((x, index) => {
                      setTimeout(() => {
                        floatingReactionsRef.current?.addApplause(x + (Math.random() - 0.5) * 40);
                      }, index * 80);
                    });
                  }}
                >
                  <Sparkles size={16} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
                  <Text style={styles.drawerButtonLabel}>Splash</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.drawerButton, { backgroundColor: 'rgba(255, 152, 0, 0.85)' }]}
                  onPress={() => {
                    const positions = [width * 0.25, width * 0.5, width * 0.75];
                    positions.forEach((x, index) => {
                      setTimeout(() => {
                        floatingReactionsRef.current?.addLaugh(x + (Math.random() - 0.5) * 50);
                      }, index * 100);
                    });
                  }}
                >
                  <Text style={{ fontSize: 16 }}>😂</Text>
                  <Text style={styles.drawerButtonLabel}>Laugh</Text>
                </TouchableOpacity>
              </View>

              {/* Row 4: Media Controls - Mic, Camera, Rotate */}
              <View style={styles.drawerRow}>
                <TouchableOpacity
                  style={[styles.drawerButton, !isStreamMicOn && { backgroundColor: 'rgba(255, 59, 48, 0.6)' }]}
                  onPress={toggleStreamMic}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  delayPressIn={0}
                >
                  {isStreamMicOn ? (
                    <Mic size={16} color="#FFFFFF" strokeWidth={2.5} />
                  ) : (
                    <MicOff size={16} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                  <Text style={styles.drawerButtonLabel}>Mic</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.drawerButton, !isStreamCameraOn && { backgroundColor: 'rgba(255, 59, 48, 0.6)' }]}
                  onPress={toggleStreamCamera}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  delayPressIn={0}
                >
                  {isStreamCameraOn ? (
                    <Video size={16} color="#FFFFFF" strokeWidth={2.5} />
                  ) : (
                    <VideoOff size={16} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                  <Text style={styles.drawerButtonLabel}>Camera</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.drawerButton}
                  onPress={switchStreamCamera}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  delayPressIn={0}
                >
                  <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.drawerButtonLabel}>Flip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </>
      )}

      {/* Control Buttons - REMOVED (moved to drawer) */}


      {/* Song Requests Section - Outside comment area, only for streamer in music mode */}
      {currentStream?.music_mode && songRequests.length > 0 && (
        <View style={styles.songRequestsContainer}>
          <View style={styles.songRequestsHeader}>
            <Music size={16} color="#FFD700" strokeWidth={2.5} fill="#FFD700" />
            <Text style={styles.songRequestsHeaderText}>
              Song Requests ({songRequests.length})
            </Text>
          </View>
          <View style={styles.songRequestsList}>
            {songRequests.slice(0, 3).map((request) => (
              <LinearGradient
                key={request.id}
                colors={['rgba(138, 43, 226, 0.9)', 'rgba(255, 20, 147, 0.9)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.songRequestItem}
              >
                <View style={styles.songRequestItemContent}>
                  <View style={styles.songRequestIconSmall}>
                    <Music size={14} color="#FFFFFF" strokeWidth={2} fill="#FFFFFF" />
                  </View>
                  <View style={styles.songRequestItemText}>
                    <Text style={styles.songRequestItemName} numberOfLines={1}>
                      {request.songName}
                    </Text>
                    <Text style={styles.songRequestItemUser} numberOfLines={1}>
                      {request.user_name}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            ))}
            {songRequests.length > 3 && (
              <Text style={styles.songRequestsMore}>
                +{songRequests.length - 3} more
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Live Comments - Original non-draggable version */}
      <View
        style={[
          styles.commentsContainer,
          {
            bottom: getLivestreamCommentsBottomOffset(insets.bottom),
            height: LIVESTREAM_OVERLAY_COMMENTS_HEIGHT,
            right: LIVESTREAM_OVERLAY_COMMENTS_RIGHT_INSET,
          },
        ]}
        pointerEvents="box-none"
      >
        <LiveComments
          key={currentStream?.id || ''}
          streamId={currentStream?.id || ''}
          isStreamer={true}
          overlayCompact
          showInput={false}
          canModerate={canModerateStream}
          onReplyToComment={handleReplyToComment}
          onInviteUser={handleInviteUserFromComment}
          onPinComment={handlePinComment}
          onUnpinComment={handleUnpinComment}
          onWarnUser={async (userId, userName) => {
            Alert.prompt(
              'Warn User',
              `Send a warning to ${userName}`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Send Warning',
                  onPress: async (reason) => {
                    if (user?.id) {
                      const success = await warnUser(currentStream?.id || '', userId, user.id, reason || undefined);
                      if (success) {
                        Alert.alert('Success', `Warning sent to ${userName}`);
                      } else {
                        Alert.alert('Error', 'Failed to send warning');
                      }
                    }
                  },
                },
              ],
              'plain-text'
            );
          }}
          onKickUser={async (userId, userName) => {
            if (!user?.id) {
              Alert.alert('Error', 'You must be logged in to kick users');
              return;
            }
            
            if (!currentStream?.id) {
              Alert.alert('Error', 'Stream ID not available');
              return;
            }
            
            // Use Alert.alert with confirm/cancel for better cross-platform support
            Alert.alert(
              'Kick User',
              `Remove ${userName} from the stream?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Kick',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const success = await kickUser(currentStream.id, userId, user.id);
                      if (success) {
                        Alert.alert('Success', `${userName} has been kicked from the stream`);
                      } else {
                        Alert.alert('Error', 'Failed to kick user. You may not have permission or the user may already be kicked.');
                      }
                    } catch (error: any) {
                      error('[BROADCASTER] Kick error:', error);
                      Alert.alert('Error', error.message || 'Failed to kick user');
                    }
                  },
                },
              ]
            );
          }}
        />
      </View>

      {/* Recent Gifters - Subtle floating button (bottom-right, only visible when gifts exist) */}
      {currentStream?.id && !isClearScreenMode && (
        <View
          style={[
            styles.recentGiftersContainer,
            {
              bottom:
                200 + getFloatingTabBarReservedHeight(insets.bottom),
              right: 12,
            },
          ]}
        >
          <RecentGifters
            streamId={currentStream?.id || ''}
            isStreamer={true}
            position="subtle"
          />
        </View>
      )}

      {/* Bottom Bar - TikTok-style clean design with KeyboardAvoidingView */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'position' : undefined}
        keyboardVerticalOffset={0}
        style={[
          styles.keyboardAvoidingView,
          { bottom: getFloatingTabBarReservedHeight(insets.bottom) },
        ]}
        enabled={Platform.OS === 'ios'}
      >
      <View style={[
        styles.bottomBar, 
        { 
            paddingBottom: 8,
        }
      ]}>
        {/* Reply indicator - compact inline version */}
        {replyingToComment && (
          <View style={styles.replyIndicator}>
            <Text style={styles.replyIndicatorText} numberOfLines={1}>
              Replying to @{(replyingToComment.userName.length > 15 ? `${replyingToComment.userName.substring(0, 15)}...` : replyingToComment.userName)}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setReplyingToComment(null);
                setCommentText('');
              }}
              style={styles.replyCancelButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color="rgba(255, 255, 255, 0.7)" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.bottomBarContent}>
          <View style={[
            styles.inputContainer,
            !isStreamCameraOn && styles.inputContainerCameraOff, // Enhanced visibility when camera is off
          ]}>
            <TextInput
              style={[
                styles.messageInput,
                !isStreamCameraOn && styles.messageInputCameraOff, // Enhanced visibility when camera is off
              ]}
              placeholder={replyingToComment ? `Reply to @${replyingToComment.userName}...` : "Add a comment..."}
              placeholderTextColor={!isStreamCameraOn ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.5)"}
              value={commentText}
              onChangeText={setCommentText}
              onFocus={() => setIsCommentFocused(true)}
              onBlur={() => setIsCommentFocused(false)}
              multiline={false}
              returnKeyType="send"
              editable={true}
              onSubmitEditing={async () => {
                if (commentText.trim()) {
                  await sendComment(commentText.trim());
                  setCommentText('');
                  setReplyingToComment(null); // Clear reply state
                  Keyboard.dismiss();
                  setIsCommentFocused(false);
                }
              }}
              autoCorrect={false}
              autoCapitalize="none"
            />
              {commentText.trim() && (
              <TouchableOpacity 
                style={styles.sendButton}
                onPress={async () => {
                  if (commentText.trim() && !isSendingComment) {
                    await sendComment(commentText.trim());
                    setCommentText('');
                    setReplyingToComment(null); // Clear reply state
                    Keyboard.dismiss();
                    setIsCommentFocused(false);
                  }
                }}
                activeOpacity={0.7}
                disabled={isSendingComment}
              >
                <Send size={16} color="#00D9FF" fill="#00D9FF" />
              </TouchableOpacity>
            )}
          </View>
          
            <TouchableOpacity
              style={styles.heartButton}
              onPress={(event) => {
                if (!user) {
                  Alert.alert(
                    'Login Required',
                    'You need to login to react to live streams. Please login first.',
                    [{ text: 'OK' }]
                  );
                  return;
                }
                
                // Premium heart animation
                Animated.sequence([
                  Animated.timing(heartScaleAnim, {
                    toValue: 1.3,
                    duration: 100,
                    useNativeDriver: true,
                  }),
                  Animated.timing(heartScaleAnim, {
                    toValue: 1,
                    duration: 100,
                    useNativeDriver: true,
                  }),
                ]).start();

                const tapX = event.nativeEvent.pageX || width / 2;
                const boundedTapX = Math.max(50, Math.min(width - 50, tapX));
                const randomOffset = (Math.random() - 0.5) * 40;
                const heartX = Math.max(50, Math.min(width - 50, boundedTapX + randomOffset));
                floatingReactionsRef.current?.addHeart(heartX);
              }}
              activeOpacity={0.8}
            >
              <Animated.View style={{ transform: [{ scale: heartScaleAnim }] }}>
                <Heart size={18} color="#FF1744" fill="#FF1744" strokeWidth={1.5} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Non-essential controls moved to drawer - removed from screen */}

      {/* Floating Reactions */}
      {currentStream?.id && (
        <FloatingReactions 
          ref={floatingReactionsRef}
          streamId={currentStream.id}
          onReactionSend={(reaction) => {
            log('Streamer sent reaction:', reaction);
          }}
        />
      )}

      {/* Poor network: we show music mode UI (animation + badge) in the video area instead of this banner */}

      {/* Camera off message - only show when intentionally turned off (not due to poor network) */}
      {!isStreamCameraOn && isEngineReady && !audioOnlyDueToNetwork && (
        <View
          style={[
            styles.cameraOffOverlay,
            { bottom: 200 + getFloatingTabBarExtraAboveInset(insets.bottom) },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.cameraOffContent} pointerEvents="auto">
            <View style={styles.cameraOffIcon}>
              <VideoOff size={48} color="rgba(255, 255, 255, 0.6)" strokeWidth={1.5} />
            </View>
            <Text style={styles.cameraOffText}>Camera is off</Text>
            <Text style={styles.cameraOffHint}>Tap the camera button to turn it back on</Text>
          </View>
        </View>
      )}

      {/* TikTok-style Gift Notification Cards (side) */}
      {giftAnimations.map(({ id, gift }, index) => (
        <View
          key={id}
          style={{
            position: 'absolute',
            left: 0,
            top: 100 + index * 55,
            zIndex: 1000,
          }}
        >
          <GiftNotificationCard
            gift={gift}
            onComplete={() => removeGiftAnimation(id)}
          />
        </View>
      ))}

      {/* Expensive gift – big center announcement */}
      {expensiveGiftAnnouncement && (
        <ExpensiveGiftAnnouncement
          gift={expensiveGiftAnnouncement}
          visible={!!expensiveGiftAnnouncement}
          onComplete={() => setExpensiveGiftAnnouncement(null)}
        />
      )}

      {/* Floating Random Box - Only shows when user purchases random box */}
      {showFloatingGiftBox && randomBoxTransactionId && randomBoxSenderInfo && (
        <FloatingGiftBox
          giftTransactionId={randomBoxTransactionId}
          senderId={randomBoxSenderInfo.id}
          senderName={randomBoxSenderInfo.name}
          senderAvatar={randomBoxSenderInfo.avatar}
          isReceiver={currentStream?.streamer_id === user?.id} // Only streamer (receiver) can tap
          onUnboxed={async (gift, tokens) => {
            // No tokens added - user already paid for the gift box
            // Just log the unboxed gift for fun
            log(`🎲 Unboxed ${gift.name} from random box! (No tokens - already paid)`);
          }}
          onComplete={() => {
            setShowFloatingGiftBox(false);
            setRandomBoxTransactionId(null);
            setRandomBoxSenderInfo(null);
          }}
        />
      )}

      {/* Viewer List Modal */}
      {showViewerList && (
        <ViewerListModal
          visible={showViewerList}
          onClose={() => setShowViewerList(false)}
          streamId={currentStream?.id || ''}
          viewerCount={viewerCount}
          onUserKicked={(userId) => {
            // Refresh viewer list after kick
            setShowViewerList(false);
            setTimeout(() => setShowViewerList(true), 500);
          }}
        />
      )}

      {/* Moderator Management Modal */}
      {showModeratorManagement && (
        <ModeratorManagementModal
          visible={showModeratorManagement}
          onClose={() => setShowModeratorManagement(false)}
          streamId={currentStream?.id || ''}
        />
      )}


      {/* Viewer Join Announcement */}
      <ViewerJoinAnnouncement
        visible={joinAnnouncement.visible}
        username={joinAnnouncement.username}
        fullName={joinAnnouncement.fullName}
        avatarUrl={joinAnnouncement.avatarUrl}
        onDismiss={() => setJoinAnnouncement(prev => ({ ...prev, visible: false }))}
      />

      {/* Guest Management Modal */}
      {showGuestModal && (
        <GuestManagementModal
          visible={showGuestModal}
          onClose={() => setShowGuestModal(false)}
          streamId={currentStream?.id || ''}
          currentGuests={currentGuests}
          maxGuests={1}
          onGuestAdded={(guest) => {
            setCurrentGuests((prev) => [...prev, guest]);
          }}
          onGuestRemoved={(userId) => {
            setCurrentGuests((prev) => prev.filter((g) => g.user_id !== userId));
            void (async () => {
              try {
                const guestsResult = await getActiveGuests(currentStream?.id || '');
                if (guestsResult.success && guestsResult.guests) {
                  setCurrentGuests(guestsResult.guests);
                }
              } catch (err) {
                error('👥 [BROADCASTER] Error refreshing guests after removal:', err);
              }
            })();
          }}
        />
      )}

      {/* Livestream Analytics Modal (After Stream Ends) */}
      {endedStreamId && (
        <LivestreamAnalytics
          visible={showAnalytics}
          streamId={endedStreamId}
          onClose={() => {
            setShowAnalytics(false);
            setTimeout(() => {
              setEndedStreamId(null);
              onClose();
            }, 300);
          }}
        />
      )}

      {/* Live Analytics Modal (During Stream) */}
      {currentStream?.id && (
        <LiveAnalyticsModal
          visible={showLiveAnalyticsModal}
          streamId={currentStream.id}
          currentViewerCount={viewerCount || 0}
          streamStartTime={currentStream.started_at}
          onClose={() => setShowLiveAnalyticsModal(false)}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  videoPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  videoSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    zIndex: 10,
  },
  videoFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    zIndex: -1,
  },
  fallbackText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  // New design matching the image
  topBanner: {
    position: 'absolute',
    top: 12,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)', // Semi-transparent background for better text contrast
    borderRadius: 12,
    zIndex: 1000,
  },
  compactHeader: {
    position: 'absolute',
    top: 8,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    zIndex: 1000,
  },
  viewerCountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Darker background for better contrast
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)', // Brighter border for better visibility
    marginLeft: 8,
  },
  viewerCountButtonText: {
    color: '#FFFFFF', // Full opacity for better visibility
    fontSize: 11,
    fontWeight: '700', // Bolder for better readability
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.8)', // Strong shadow for contrast
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  moderatorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginLeft: 8,
  },
  clearScreenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginLeft: 8,
  },
  clearScreenHeader: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 1000,
  },
  clearScreenExitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  viewerCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Darker background for better contrast
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)', // Brighter border for better visibility
  },
  viewerCountBadgeText: {
    color: '#FFFFFF', // Full opacity for better visibility
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.8)', // Strong shadow for contrast
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  viewerCountPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 122, 255, 0.85)',
    gap: 6,
    minWidth: 48,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  viewerCountPillButtonCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
    minWidth: 40,
  },
  viewerCountPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  viewerCountPillTextCompact: {
    fontSize: 11,
  },
  streamerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  streamerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#FF69B4',
    marginRight: 10,
  },
  streamTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.8)', // Strong shadow for contrast
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  viewerCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewerCountText: {
    color: '#FFFFFF', // Full opacity for better visibility
    fontSize: 10,
    fontWeight: '600', // Bolder for better readability
    textShadowColor: 'rgba(0, 0, 0, 0.8)', // Strong shadow for contrast
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  followButton: {
    backgroundColor: '#008080', // App primary teal
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  followButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  followingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  inviteGuestButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 217, 255, 0.35)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 217, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginLeft: 8,
    position: 'relative',
    zIndex: 100, // Ensure it's above other elements
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  requestBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  requestBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guestRequestBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  guestRequestBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF3B30',
  },
  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtons: {
    position: 'absolute',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    zIndex: 999, // Below draggable button but above other content
  },
  streamTitleBelowAvatar: {
    position: 'absolute',
    top: 80,
    left: -40,
    right: -40,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 1001,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  streamTitleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  songRequestsContainer: {
    position: 'absolute',
    top: 100,
    right: 12,
    width: 200,
    maxHeight: 250,
    zIndex: 1001,
    pointerEvents: 'auto',
  },
  songRequestsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  songRequestsHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  songRequestsList: {
    gap: 6,
  },
  songRequestItem: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
    shadowColor: '#8A2BE2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  songRequestItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  songRequestIconSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  songRequestItemText: {
    flex: 1,
    minWidth: 0,
  },
  songRequestItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 2,
  },
  songRequestItemUser: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  songRequestsMore: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  commentsContainer: {
    position: 'absolute',
    left: 8,
    // bottom, height, right overridden inline (tabBarInset helpers)
    zIndex: 400,
    elevation: 16,
    overflow: 'hidden',
  },
  commentsSection: {
    position: 'absolute',
    bottom: 120, // Moved up to avoid blocking input field
    left: 12,
    right: 100,
    height: 120, // Reduced height
    zIndex: 1000,
    pointerEvents: 'box-none', // Allow touches to pass through to video
    // No backgroundColor - let it be completely transparent
    overflow: 'visible', // Ensure no clipping creates dark areas
  },
  commentsSectionCompact: {
    height: 90, // Smaller height when guests are present
    bottom: 110, // Moved up accordingly
    // No backgroundColor - let it be completely transparent
  },
  // Loading screen styles
  loadingContainer: {
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingAnimation: {
    width: 150,
    height: 150,
    marginBottom: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  // Camera loading overlay
  cameraOffOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Don't extend to bottom - leave space for input bar
    bottom: 200, // Reserve space for bottom input bar and keyboard
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'box-none', // Allow touches to pass through to elements behind
  },
  cameraOffContent: {
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'auto', // Re-enable touches for the content itself
  },
  cameraOffIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  cameraOffText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  cameraOffHint: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: -0.1,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  // TikTok-style bottom bar - no background, naturally responsive
  keyboardAvoidingView: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent', // No background
    zIndex: 10001, // Ensure it's above camera off overlay
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    zIndex: 10000,
    backgroundColor: 'transparent', // No background
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'transparent', // No background
  },
  inputContainer: {
    flex: 1,
    backgroundColor: 'rgba(40, 40, 40, 0.4)', // Very subtle dark background
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0, // Remove border for cleaner look
    // Ensure input is always visible and accessible
    minHeight: 44, // Minimum touch target size
  },
  inputContainerCameraOff: {
    // Enhanced visibility when camera is off
    backgroundColor: 'rgba(60, 60, 60, 0.8)', // More opaque background
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)', // Subtle border for better definition
  },
  messageInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.2,
    paddingVertical: 0,
    paddingRight: 8,
  },
  messageInputCameraOff: {
    // Enhanced visibility when camera is off
    color: '#FFFFFF',
    fontWeight: '500', // Slightly bolder for better visibility
  },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 217, 255, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
    maxWidth: '100%',
    flexShrink: 1,
  },
  replyIndicatorText: {
    color: '#00D9FF',
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
    marginRight: 6,
  },
  replyCancelButton: {
    marginLeft: 4,
    padding: 2,
    flexShrink: 0,
  },
  sendButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  soundControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  streamerControls: {
    position: 'absolute',
    right: 12,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    zIndex: 9999,
  },
  streamerControlsCompact: {
    gap: 8,
  },
  streamerControlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  streamerControlButtonCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 6,
  },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  controlButtonOff: {
    backgroundColor: 'rgba(255, 107, 107, 0.3)',
    borderColor: 'rgba(255, 59, 48, 0.4)', // Red border for off state
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  recentGiftersContainer: {
    position: 'absolute',
    zIndex: 50, // Lower z-index to be less intrusive
    opacity: 0.7, // Make it more subtle
  },
  drawerToggleButton: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 10002, // Above comments and bottom bar so drawer overlays them
    pointerEvents: 'auto', // Capture taps outside drawer to close
  },
  controlDrawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 280,
    height: '100%',
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    zIndex: 10003, // Above comments and bottom bar so drawer is on top
    elevation: 24, // Android: drawer on top of comments/input
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
    // Ensure drawer can receive touches
    pointerEvents: 'auto',
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  drawerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  drawerCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerContent: {
    flex: 1,
    padding: 12,
    gap: 12,
    // Ensure drawer content can receive touches
    pointerEvents: 'auto',
  },
  drawerRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  drawerButton: {
    flex: 1,
    minHeight: 70,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    position: 'relative',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    // Improved touch target - ensure minimum 44x44pt touch area (Apple HIG recommendation)
    minWidth: 70,
  },
  drawerButtonLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  drawerBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  drawerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  audioOnlyIndicator: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
    pointerEvents: 'box-none',
  },
  audioOnlyContent: {
    backgroundColor: 'rgba(255, 165, 0, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  audioOnlyTextContainer: {
    flexDirection: 'column',
    gap: 2,
  },
  audioOnlyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  audioOnlySubtext: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '500',
  },
  musicModeBadge: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    marginHorizontal: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
  },
  musicModeBadgeTextContainer: {
    flexDirection: 'column',
    gap: 0,
  },
  musicModeBadgeText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 14,
    fontWeight: '600',
  },
  musicModeBadgeSubtext: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '500',
  },
});
