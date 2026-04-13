import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Animated,
  TextInput,
  Keyboard,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Eye, Heart, Send, MoreHorizontal, Users, Gift, UserPlus, Check, Video, Minimize2, Maximize2, Music, Clock } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { useLiveStream } from './LiveStreamProvider';
import { useRouter } from 'expo-router';
import useFollowers from '../hooks/useFollowers';
import useAuth from '../hooks/useAuth';
import { usePresence } from '../hooks/usePresence';
import GuestInvitationNotification from './GuestInvitationNotification';
import GiftModal from './GiftModal';
import ViewerListModal from './ViewerListModal';

import NomliGiftAnimation from './NomliGiftAnimation';
import GiftNotificationCard from './GiftNotificationCard';
import ExpensiveGiftAnnouncement, { isExpensiveGift, type ExpensiveGiftAnnouncementGift } from './ExpensiveGiftAnnouncement';
import FloatingGiftBox from './FloatingGiftBox';
import { sendGift, getRecentGifts } from '../utils/giftService';
import { getVirtualCoins } from '../utils/virtualCoins';
import FloatingReactions, { FloatingReactionsRef } from './FloatingReactions';
import LiveComments from './LiveComments';
import RecentGifters from './RecentGifters';
import EnhancedLiveStartingOverlay from './EnhancedLiveStartingOverlay';
import { supabase } from '../utils/supabase';
import { liveStreamSoundManager } from '../utils/liveStreamSounds';
import ViewerJoinAnnouncement from './ViewerJoinAnnouncement';
import { sendJoinRequest, getActiveGuests, LiveStreamGuest } from '../utils/guestService';
import MultiGuestVideoLayout from './MultiGuestVideoLayout';
import Toast from 'react-native-toast-message';
import { isKicked as checkIsKicked, canModerate, kickUser } from '../utils/moderationService';
import NetworkQualityIndicator from './NetworkQualityIndicator';
import LiveStreamVideoFallback from './LiveStreamVideoFallback';
import { livestreamLog, livestreamWarn } from '../utils/livestreamOptimizer';

import RelaxingAudioAnimation from './RelaxingAudioAnimation';
import MusicModeAnimation from './MusicModeAnimation';
import KickedFromStreamModal from './KickedFromStreamModal';
import GuestJoinLoadingOverlay from './GuestJoinLoadingOverlay';
import { log, warn, error } from '../utils/productionLogger';
import {
  getFloatingTabBarReservedHeight,
  getLivestreamCommentsBottomOffset,
  LIVESTREAM_OVERLAY_COMMENTS_HEIGHT,
  LIVESTREAM_OVERLAY_COMMENTS_RIGHT_INSET,
} from '../utils/tabBarInset';
import { RtcSurfaceView } from 'react-native-agora';

const { width, height } = Dimensions.get('window');

interface LiveStreamViewerProps {
  streamId: string;
  onClose: () => void;
  /** When true, show "End stream (Admin)" button */
  isAdmin?: boolean;
  /** Called when admin ends the stream from viewer; then caller should close viewer */
  onAdminCloseStream?: (streamId: string) => void;
}

export default function LiveStreamViewer({ streamId, onClose, isAdmin = false, onAdminCloseStream }: LiveStreamViewerProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const floatingReactionsRef = useRef<FloatingReactionsRef>(null);
  const { user } = useAuth();
  // CRITICAL: Track if we're exiting to prevent re-joining
  const isExitingRef = useRef(false);
  const hasLeftRef = useRef(false);

  
  const {
    currentStream,
    isJoinedAsViewer,
    viewerCount,
    streamRemoteUids,
    joinStreamAsViewer,
    leaveStreamAsViewer,
    switchToGuestMode,
    leaveGuestMode,
    muteGuestAudio,
    switchGuestCamera,
    pendingInvitation,
    handleAcceptInvitation,
    handleDeclineInvitation,
    handleInvitationExpire,
    broadcasterVideoEnabled,
    networkQuality,
    connectionState,
    isGuestVideoEnabled: providerGuestVideoEnabled,
    isGuestAudioEnabled: providerGuestAudioEnabled,
  } = useLiveStream();

  usePresence(user?.id ?? null, isJoinedAsViewer ?? false);

  // Follow functionality
  const { 
    isFollowingUser, 
    followLoading, 
    handleFollow: toggleFollow 
  } = useFollowers(currentStream?.streamer_id);

  const [showControls, setShowControls] = useState(true);
  const [showViewerList, setShowViewerList] = useState(false);
  const [showStreamerProfile, setShowStreamerProfile] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const [showStreamTitle, setShowStreamTitle] = useState(true);
  const [dismissConnectionMessage, setDismissConnectionMessage] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showSongRequestModal, setShowSongRequestModal] = useState(false);
  const [songRequestText, setSongRequestText] = useState('');
  const [isSendingSongRequest, setIsSendingSongRequest] = useState(false);
  const songRequestModalPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const songRequestModalDragStart = useRef({ x: 0, y: 0 });
  const songRequestModalIsDragging = useRef(false);
  const [userCoins, setUserCoins] = useState(1000);
  // Double tap detection for TikTok-style reactions
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const lastTapY = useRef(0);
  const [giftAnimations, setGiftAnimations] = useState<Array<{ id: string; gift: any }>>([]);
  const [expensiveGiftAnnouncement, setExpensiveGiftAnnouncement] = useState<ExpensiveGiftAnnouncementGift | null>(null);
  const [showFloatingGiftBox, setShowFloatingGiftBox] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [streamEnded, setStreamEnded] = useState(false);
  const [joinRequestSent, setJoinRequestSent] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [activeGuests, setActiveGuests] = useState<LiveStreamGuest[]>([]);
  const [replyingToComment, setReplyingToComment] = useState<{ id: string; userName: string; message: string } | null>(null);
  const [isKicked, setIsKicked] = useState(false);
  const [kickReason, setKickReason] = useState<string | null>(null);
  const [showKickModal, setShowKickModal] = useState(false);
  const [canModerateStream, setCanModerateStream] = useState(false);
  const [isClearScreenMode, setIsClearScreenMode] = useState(false);
  const [isCheckingKick, setIsCheckingKick] = useState(true); // Track if we're checking for kicks
  const [videoSubscriptionFailed, setVideoSubscriptionFailed] = useState(false);
  const [videoFirstFrameReceived, setVideoFirstFrameReceived] = useState(false);
  const videoFailureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Reset join request state when stream changes (only when stream ID actually changes)
  // Initialize to null so first mount always triggers reset check
  const prevStreamIdRef = useRef<string | null>(null);
  
  // Log initial state for debugging
  const streamIdToUseForLog = currentStream?.id || streamId;
  // Mount logging disabled to reduce console spam

  // Reset dismiss state when connection state changes to CONNECTED
  useEffect(() => {
    if (connectionState === 'CONNECTED') {
      setDismissConnectionMessage(false);
    }
  }, [connectionState]);

  // Early kick check - before showing loading screen
  useEffect(() => {
    const checkKickEarly = async () => {
      if (!user?.id || !streamId) {
        setIsCheckingKick(false);
        return;
      }
      
      const kicked = await checkIsKicked(streamId, user.id);
      setIsCheckingKick(false);
      
      if (kicked) {
        livestreamLog('🚫 [VIEWER] User is kicked, preventing join and showing alert');
        setIsKicked(true);
        
        // Get kick reason
        const { data } = await supabase
          .from('live_stream_kicks')
          .select('reason')
          .eq('stream_id', streamId)
          .eq('user_id', user.id)
          .single();
        
        if (data?.reason) {
          setKickReason(data.reason);
        }
        
        // Show kick modal immediately
        setShowKickModal(true);
      }
    };

    checkKickEarly();
  }, [streamId, user?.id]);
  
  // PanResponder for draggable song request modal
  const songRequestModalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        songRequestModalPosition.setOffset({
          x: (songRequestModalPosition.x as any)._value,
          y: (songRequestModalPosition.y as any)._value,
        });
        songRequestModalPosition.setValue({ x: 0, y: 0 });
        songRequestModalDragStart.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
        };
        songRequestModalIsDragging.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        const moveDistance = Math.sqrt(gestureState.dx ** 2 + gestureState.dy ** 2);
        if (moveDistance > 10) {
          songRequestModalIsDragging.current = true;
        }
        songRequestModalPosition.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (evt) => {
        songRequestModalPosition.flattenOffset();
        const currentX = (songRequestModalPosition.x as any)._value;
        const currentY = (songRequestModalPosition.y as any)._value;
        const moveDistance = Math.sqrt(
          (evt.nativeEvent.pageX - songRequestModalDragStart.current.x) ** 2 +
          (evt.nativeEvent.pageY - songRequestModalDragStart.current.y) ** 2
        );
        
        if (moveDistance < 15 && !songRequestModalIsDragging.current) {
          songRequestModalPosition.setValue({ x: currentX, y: currentY });
          songRequestModalIsDragging.current = false;
          return;
        }
        
        // Keep modal within screen bounds (accounting for modal size ~400px width, ~300px height)
        const modalWidth = Math.min(width * 0.85, 400);
        const modalHeight = 300; // Approximate height
        const minX = -width / 2 + modalWidth / 2;
        const maxX = width / 2 - modalWidth / 2;
        const minY = -height / 2 + modalHeight / 2;
        const maxY = height / 2 - modalHeight / 2;
        
        const boundedX = Math.max(minX, Math.min(maxX, currentX));
        const boundedY = Math.max(minY, Math.min(maxY, currentY));
        
        Animated.spring(songRequestModalPosition, {
          toValue: { x: boundedX, y: boundedY },
          useNativeDriver: false,
          tension: 50,
          friction: 7,
        }).start();
        
        songRequestModalIsDragging.current = false;
      },
    })
  ).current;
  
  // Reset modal position when it closes
  useEffect(() => {
    if (!showSongRequestModal) {
      songRequestModalPosition.setValue({ x: 0, y: 0 });
    }
  }, [showSongRequestModal]);
  
  useEffect(() => {
    const streamIdToUse = currentStream?.id || streamId;
    
    if (!streamIdToUse) {
      return;
    }

    // Reduced logging - only log when stream actually changes
    if (prevStreamIdRef.current && prevStreamIdRef.current !== streamIdToUse) {
      livestreamLog('🔄 [VIEWER] Stream changed:', prevStreamIdRef.current, '→', streamIdToUse);
      // CRITICAL: Reset exit flags when stream changes (new stream, allow joining)
      isExitingRef.current = false;
      hasLeftRef.current = false;
    }
    
    // Only reset if stream ID actually changed
    if (prevStreamIdRef.current === streamIdToUse) {
      return; // Stream hasn't changed, don't reset
    }
    
    // Update ref to current stream ID IMMEDIATELY (before async operations)
    prevStreamIdRef.current = streamIdToUse;
    
    // CRITICAL: Always reset to false FIRST when stream changes - this ensures icon resets immediately
    setJoinRequestSent(false);
    setSendingRequest(false);
    
    // Check if user already has a pending request for this stream
    // Only check if user is authenticated
    const checkExistingRequest = async () => {
      if (!user?.id) {
        livestreamLog('🔄 [VIEWER] No user, keeping join request state as false');
        setJoinRequestSent(false);
        return;
      }
      
      try {
        livestreamLog('🔄 [VIEWER] Checking for existing guest/request for stream:', streamIdToUse);
        
        // Check if user is already an ACTIVE guest (joined_at is not null)
        // Viewers who are just watching are NOT guests
        livestreamLog('🔄 [VIEWER] 🔍 Querying live_stream_guests table...', {
          streamIdToUse,
          userId: user.id,
          query: 'SELECT id, joined_at WHERE stream_id = ? AND user_id = ? AND is_active = true AND joined_at IS NOT NULL'
        });
        
        const { data: guestCheck, error: guestError } = await supabase
          .from('live_stream_guests')
          .select('id, joined_at, is_active')
          .eq('stream_id', streamIdToUse)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .not('joined_at', 'is', null) // Only consider as guest if they've actually joined
          .maybeSingle();
        
        // Guest check completed (no verbose logging)
        
        if (guestError) {
          // Silently ignore guest check errors
        }
        
        if (guestCheck) {
          livestreamLog('🔄 [VIEWER] ✅ User is already an active guest (joined), not checking for requests');
          livestreamLog('🔄 [VIEWER] 📝 Guest details:', guestCheck);
          setJoinRequestSent(false);
          return;
        }
        
        livestreamLog('🔄 [VIEWER] ✅ User is NOT a guest, proceeding to check join requests...');
        
        // Check for pending join requests
        livestreamLog('🔄 [VIEWER] 🔍 Querying live_stream_join_requests table...');
        const { getPendingJoinRequests } = await import('../utils/guestService');
        const result = await getPendingJoinRequests(streamIdToUse);
        
        // Pending requests check completed (no verbose logging)
        
        if (result.success && result.requests) {
          // Filter out requests for OTHER streams (only check for THIS stream)
          const userRequestsForThisStream = result.requests.filter(
            req => req.user_id === user.id && req.status === 'pending' && req.stream_id === streamIdToUse
          );
          
          if (userRequestsForThisStream.length > 0) {
            const userRequest = userRequestsForThisStream[0];
            livestreamLog('🔄 [VIEWER] ❗ Found existing pending request for THIS stream, setting icon to sent');
            livestreamLog('🔄 [VIEWER] 📝 Request details:', userRequest);
            setJoinRequestSent(true);
          } else {
            livestreamLog('🔄 [VIEWER] ✅ No existing request found for THIS stream, keeping icon as unsent');
            livestreamLog('🔄 [VIEWER] 📝 All requests checked:', result.requests.length, 'for this stream:', userRequestsForThisStream.length);
            setJoinRequestSent(false);
            
            // Clean up any stale requests for OTHER streams (background cleanup)
            const staleRequests = result.requests.filter(
              req => req.user_id === user.id && req.status === 'pending' && req.stream_id !== streamIdToUse
            );
            if (staleRequests.length > 0) {
              livestreamLog('🔄 [VIEWER] 🧹 Found', staleRequests.length, 'stale requests for other streams, cleaning up...');
              // Decline them in the background (non-blocking)
              (async () => {
                for (const staleReq of staleRequests) {
                  try {
                    await supabase
                      .from('live_stream_join_requests')
                      .update({ status: 'declined', responded_at: new Date().toISOString() })
                      .eq('id', staleReq.id);
                    livestreamLog('🔄 [VIEWER] 🧹 Declined stale request:', staleReq.id);
                  } catch (err) {
                    // Silently ignore decline errors
                  }
                }
              })();
            }
          }
        } else {
          livestreamLog('🔄 [VIEWER] ✅ Failed to fetch requests or no requests, keeping icon as unsent');
          livestreamLog('🔄 [VIEWER] 📝 Result:', { success: result.success, hasRequests: !!result.requests });
          setJoinRequestSent(false);
        }
      } catch (error) {
        // Silently ignore request check errors
        // On error, just reset to false
        setJoinRequestSent(false);
      }
    };
    
    // Small delay to ensure state is stable
    const timer = setTimeout(() => {
      checkExistingRequest();
    }, 300);
    
    livestreamLog('🔄 [VIEWER] Reset join request state for new stream:', streamIdToUse);
    
    return () => {
      livestreamLog('🔄 [VIEWER] Cleaning up reset timer and clearing prevStreamIdRef');
      livestreamLog('🔄 [VIEWER] Cleanup: prevStreamIdRef was:', prevStreamIdRef.current);
      clearTimeout(timer);
      // IMPORTANT: Clear the ref on unmount so next mount treats it as a new stream
      prevStreamIdRef.current = null;
      livestreamLog('🔄 [VIEWER] Cleanup: prevStreamIdRef cleared to:', prevStreamIdRef.current);
    };
  }, [currentStream?.id, streamId, user?.id]);
  
  // Guest mode state
  const [isGuest, setIsGuest] = useState(false);
  const [guestAgoraUid, setGuestAgoraUid] = useState<number | null>(null);
  // CRITICAL: Sync with provider state - provider tracks actual Agora publishing state
  const [isGuestVideoEnabled, setIsGuestVideoEnabled] = useState(true);
  const [isGuestAudioEnabled, setIsGuestAudioEnabled] = useState(true);

  // IMPORTANT: Keep refs for realtime callbacks (avoid stale closures without re-subscribing)
  const isGuestRef = useRef(false);
  const leaveGuestModeRef = useRef(leaveGuestMode);
  useEffect(() => {
    isGuestRef.current = isGuest;
  }, [isGuest]);
  useEffect(() => {
    leaveGuestModeRef.current = leaveGuestMode;
  }, [leaveGuestMode]);
  
  // Sync local state with provider state (provider has actual Agora state)
  useEffect(() => {
    if (isGuest && providerGuestVideoEnabled !== undefined) {
      setIsGuestVideoEnabled(providerGuestVideoEnabled);
    }
  }, [isGuest, providerGuestVideoEnabled]);
  
  useEffect(() => {
    if (isGuest && providerGuestAudioEnabled !== undefined) {
      setIsGuestAudioEnabled(providerGuestAudioEnabled);
    }
  }, [isGuest, providerGuestAudioEnabled]);
  const [guestJoinStage, setGuestJoinStage] = useState<'countdown' | 'connecting' | 'joining' | 'synchronizing' | 'success' | 'error'>('connecting');
  const [guestJoinProgress, setGuestJoinProgress] = useState(0);
  const [guestJoinCountdown, setGuestJoinCountdown] = useState<number | undefined>(undefined);
  const isSwitchingToGuestRef = useRef(false); // Prevent concurrent switch attempts
  const hasCheckedInitialGuestStatusRef = useRef(false); // Track if initial guest check done
  const [guestJoinError, setGuestJoinError] = useState<string | null>(null);
  const [showGuestJoinOverlay, setShowGuestJoinOverlay] = useState(false);
  
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
  
  // Include current user in activeGuests if they are a guest
  // Only show guests who have actually joined AND are streaming (in remote UIDs)
  // This prevents dark frames during joining
  // Memoized to prevent unnecessary recalculations (lightweight optimization)
  const allActiveGuests = React.useMemo(() => {
    // Filter to only guests who have joined_at set (actually joined) AND are in remote UIDs (actually streaming)
    const joinedAndStreamingGuests = activeGuests.filter(guest => {
      const hasJoined = guest.joined_at !== null && guest.joined_at !== undefined;
      const isStreaming = guest.agora_uid && streamRemoteUids.includes(guest.agora_uid);
      return hasJoined && isStreaming;
    });

    // CRITICAL: Add current user if they're a guest
    // Don't require streamRemoteUids check because guest's own video uses UID 0 (local preview)
    // The guest is always "streaming" their own video locally, so include them immediately
    // IMPORTANT: Always include the current user FIRST in the list so their video renders properly
    if (isGuest && guestAgoraUid && user?.id) {
      const currentUserInList = joinedAndStreamingGuests.some(g => g.user_id === user.id);
      
      // Always include current user if they're a guest (don't wait for streamRemoteUids)
      if (!currentUserInList) {
        // Current user added to guest list (no log needed - happens frequently)
        // Put current user first so their video frame appears first
        return [
          {
            id: 'current-user-guest',
            stream_id: currentStream?.id || streamId,
            user_id: user.id,
            agora_uid: guestAgoraUid,
            is_active: true,
            audio_enabled: isGuestAudioEnabled,
            video_enabled: isGuestVideoEnabled, // Use tracked state, defaults to true
            joined_at: new Date().toISOString(),
            left_at: null,
            profile: {
              id: user.id,
              username: userProfile?.username || user.user_metadata?.username || user.email?.split('@')[0] || 'You',
              full_name: userProfile?.full_name,
              avatar_url: userProfile?.avatar_url || user.user_metadata?.avatar_url,
            }
          },
          ...joinedAndStreamingGuests,
        ];
      } else {
        // Current user is already in list, but ensure they're first
        const currentUserGuest = joinedAndStreamingGuests.find(g => g.user_id === user.id);
        const otherGuests = joinedAndStreamingGuests.filter(g => g.user_id !== user.id);
        if (currentUserGuest) {
          return [currentUserGuest, ...otherGuests];
        }
      }
    }
    return joinedAndStreamingGuests;
  }, [activeGuests, isGuest, guestAgoraUid, user, userProfile, isGuestAudioEnabled, isGuestVideoEnabled, currentStream?.id, streamId, streamRemoteUids]);
  
  // Fetch user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user?.id) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url')
            .eq('id', user.id)
            .single();
          
          if (profile && !error) {
            setUserProfile(profile);
          }
        } catch (error) {
          // Silently ignore profile fetch errors
        }
      }
    };
    
    fetchUserProfile();
  }, [user?.id]);

  // Check moderation permissions
  useEffect(() => {
    const checkModerationPermissions = async () => {
      const streamIdToCheck = currentStream?.id || streamId;
      if (!user?.id || !streamIdToCheck) return;
      const canMod = await canModerate(streamIdToCheck, user.id);
      log('[VIEWER] Moderation check result:', { 
        streamId: streamIdToCheck, 
        userId: user.id, 
        canModerate: canMod 
      });
      setCanModerateStream(canMod);
    };

    const streamIdToCheck = currentStream?.id || streamId;
    if (streamIdToCheck && user?.id) {
      checkModerationPermissions();
    }
  }, [streamId, currentStream?.id, user?.id]);

  // Check if user has been kicked from stream - check continuously while in stream
  useEffect(() => {
    if (!user?.id || !streamId || !isJoinedAsViewer) return;
    
    const checkKickStatus = async () => {
      const kicked = await checkIsKicked(streamId, user.id);
      if (kicked) {
        log('🚫 [VIEWER] User has been kicked, removing from stream');
        setIsKicked(true);
        
        // Get kick reason
        const { data } = await supabase
          .from('live_stream_kicks')
          .select('reason')
          .eq('stream_id', streamId)
          .eq('user_id', user.id)
          .single();
        
        if (data?.reason) {
          setKickReason(data.reason);
        }
        
        // Immediately leave stream
        await leaveStreamAsViewer();
        
        // Show custom kick modal
        setShowKickModal(true);
      }
    };

    // Check immediately
    checkKickStatus();
    
    // Check periodically while user is in stream (every 5 seconds)
    const kickCheckInterval = setInterval(() => {
      if (isJoinedAsViewer && !isKicked) {
        checkKickStatus();
      }
    }, 5000);

    return () => {
      clearInterval(kickCheckInterval);
    };
  }, [streamId, user?.id, isJoinedAsViewer, isKicked]);

  // Subscribe to kick events - real-time detection
  useEffect(() => {
    if (!streamId || !user?.id || !isJoinedAsViewer) return;

    const channel = supabase
      .channel(`kicks:${streamId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_kicks',
          filter: `stream_id=eq.${streamId} AND user_id=eq.${user.id}`,
        },
        async (payload) => {
          log('🚫 [LiveStreamViewer] User kicked in real-time:', payload);
          setIsKicked(true);
          
          if (payload.new?.reason) {
            setKickReason(payload.new.reason);
          }
          
          // Immediately leave stream
          await leaveStreamAsViewer();
          
          // Show custom kick modal
          setShowKickModal(true);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log('✅ [LiveStreamViewer] Subscribed to kick events');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [streamId, user?.id, isJoinedAsViewer]);

  // Fetch and subscribe to active guests
  useEffect(() => {
    const streamIdToUse = currentStream?.id || streamId;
    log('👥 [VIEWER] Guest fetch effect triggered:', {
      streamIdToUse,
      currentStreamId: currentStream?.id,
      streamId
    });
    
    if (!streamIdToUse) {
      log('👥 [VIEWER] No stream ID, skipping guest fetch');
      return;
    }

    const fetchGuests = async () => {
      try {
        const guestsResult = await getActiveGuests(streamIdToUse);
        
        if (guestsResult.success && guestsResult.guests) {
          setActiveGuests(guestsResult.guests);
          
          // One-time check on initial mount: if user is already a guest when joining stream
          // This handles cases where subscription hasn't been set up yet
          // After first check, subscription handlers take over to prevent duplicates
          if (user?.id && !isGuest && !guestAgoraUid && !isSwitchingToGuestRef.current && isJoinedAsViewer && !hasCheckedInitialGuestStatusRef.current) {
            const currentUserGuest = guestsResult.guests.find(g => g.user_id === user.id);
            if (currentUserGuest && currentUserGuest.is_active && currentUserGuest.joined_at) {
              log('🎉 [GUEST] Found existing guest status on initial load, subscription will handle switch');
              // Mark as checked - subscription handlers will handle the actual switch
              hasCheckedInitialGuestStatusRef.current = true;
              // Don't call switchToGuestMode here - subscription handlers are the primary mechanism
            } else {
              // Mark as checked even if not a guest to prevent future checks
              hasCheckedInitialGuestStatusRef.current = true;
            }
          }
        }
        
        // Silently ignore guest fetch errors
      } catch (error) {
        // Silently ignore guest fetch exceptions
      }
    };

    fetchGuests();

    // Subscribe to guest changes
    const guestsChannel = supabase
      .channel(`guest_changes_viewer_${streamIdToUse}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_stream_guests',
          filter: `stream_id=eq.${streamIdToUse}`,
        },
        (payload) => {
          // Silently fetch guests on change - no need to log every subscription event
          fetchGuests();
        }
      )
      .subscribe();

    log('👥 [VIEWER] Subscribed to guest changes');

    return () => {
      log('👥 [VIEWER] Unsubscribing from guest changes');
      supabase.removeChannel(guestsChannel);
    };
  }, [currentStream?.id, streamId, user?.id]); // Removed isGuest and switchToGuestMode to prevent re-subscription loops

  // Subscribe to new viewer joins for announcements
  useEffect(() => {
    const streamIdToUse = currentStream?.id || streamId;
    if (!streamIdToUse) return;

    const channel = supabase
      .channel(`viewer_joins_${streamIdToUse}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_viewers',
          filter: `stream_id=eq.${streamIdToUse}`,
        },
        async (payload) => {
          const newViewer = payload.new;
          // Skip if it's the current user
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
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStream?.id, streamId, user?.id]);

  // Subscribe to join request status changes (accepted/declined)
  useEffect(() => {
    const streamIdToUse = currentStream?.id || streamId;
    if (!streamIdToUse || !user?.id) return;

    const channel = supabase
      .channel(`join_request_status_${streamIdToUse}_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_stream_join_requests',
          filter: `stream_id=eq.${streamIdToUse}`,
        },
        async (payload) => {
          const updatedRequest = payload.new as any;
          
          // Only process if this is the current user's request
          if (updatedRequest.user_id !== user.id) return;
          
          log('🔄 [VIEWER] Join request status changed:', updatedRequest.status);
          
          if (updatedRequest.status === 'accepted') {
            log('✅ [VIEWER] Join request accepted! Switching to guest mode...');
            setJoinRequestSent(false); // Reset since we're now a guest
            
            // Show guest join overlay and switch to guest mode
            setShowGuestJoinOverlay(true);
            setGuestJoinStage('connecting');
            setGuestJoinProgress(10);
            
            // Small delay to show connecting state, then switch to guest mode
            setTimeout(async () => {
              try {
                setGuestJoinStage('joining');
                setGuestJoinProgress(50);
                
                // Switch to guest mode
                const switchSuccess = await switchToGuestMode();
                
                if (switchSuccess) {
                  setGuestJoinProgress(100);
                  setGuestJoinStage('success');
                  
                  // Hide overlay after showing success
                  setTimeout(() => {
                    setShowGuestJoinOverlay(false);
                  }, 1500);
                  
                  Toast.show({
                    type: 'success',
                    text1: 'Request Accepted!',
                    text2: 'You\'re now a co-host',
                    visibilityTime: 2000,
                  });
                } else {
                  setGuestJoinStage('error');
                  setGuestJoinError('Failed to join as guest');
                  setShowGuestJoinOverlay(true);
                }
              } catch (error: any) {
                error('❌ [VIEWER] Error switching to guest mode after acceptance:', error);
                setGuestJoinStage('error');
                setGuestJoinError(error.message || 'Failed to join as guest');
                setShowGuestJoinOverlay(true);
              }
            }, 500);
          } else if (updatedRequest.status === 'declined') {
            log('❌ [VIEWER] Join request declined');
            setJoinRequestSent(false);
            Toast.show({
              type: 'error',
              text1: 'Request Declined',
              text2: 'Your request to join was declined',
              visibilityTime: 3000,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_guests',
          filter: `stream_id=eq.${streamIdToUse}`,
        },
        async (payload) => {
          const newGuest = payload.new as any;
          
          // If current user became a guest, update state
          if (newGuest.user_id === user.id && newGuest.is_active && newGuest.joined_at) {
            log('✅ [VIEWER] User is now a guest (detected via subscription)');
            setJoinRequestSent(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStream?.id, streamId, user?.id]);

  // Polling fallback for guest status (when subscription fails)
  const startPollingGuestStatus = useCallback(() => {
    if (pollGuestStatusRef.current || !user?.id || !currentStream?.id) return;
    
    pollGuestStatusRef.current = true;
    log('🔄 [GUEST] Starting polling fallback for guest status');
    
    pollGuestStatus.current = setInterval(async () => {
      try {
        // Check if user is a guest
        const { data: guest, error } = await supabase
          .from('live_stream_guests')
          .select('*')
          .eq('stream_id', currentStream.id)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .not('joined_at', 'is', null)
          .maybeSingle();
        
        if (!error && guest && guest.joined_at && !isGuest && !isSwitchingToGuestRef.current) {
          log('🎉 [GUEST] Found guest status via polling, switching to guest mode');
          // Stop polling since we found the guest status
          if (pollGuestStatus.current) {
            clearInterval(pollGuestStatus.current);
            pollGuestStatus.current = null;
            pollGuestStatusRef.current = false;
          }
          // Trigger guest join
          isSwitchingToGuestRef.current = true;
          try {
            // Reset local guest media state so our own tile shows video/mic immediately
            setIsGuestVideoEnabled(true);
            setIsGuestAudioEnabled(true);
            await switchToGuestMode(guest.agora_uid || undefined);
            if (guest.agora_uid) {
              setIsGuest(true);
            }
          } catch (error) {
            // Silently ignore guest mode polling errors
          } finally {
            setTimeout(() => {
              isSwitchingToGuestRef.current = false;
            }, 2000);
          }
        }
      } catch (error) {
        // Silently ignore guest status polling errors
      }
    }, 2000); // Poll every 2 seconds
    
    // Stop polling after 30 seconds
    setTimeout(() => {
      if (pollGuestStatus.current) {
        clearInterval(pollGuestStatus.current);
        pollGuestStatus.current = null;
        pollGuestStatusRef.current = false;
        log('⏱️ [GUEST] Stopped polling fallback after timeout');
      }
    }, 30000);
  }, [user?.id, currentStream?.id, isGuest, switchToGuestMode]);

  // Subscribe to guest status changes for current user
  useEffect(() => {
    if (!user?.id || !currentStream?.id) return;
    
    log('🎉 [GUEST] Setting up guest status subscription for user:', user.id);
    
    let subscriptionActive = false;
    const guestStatusChannel = supabase
      .channel(`guest_status_${currentStream.id}_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_guests',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          log('🎉 [GUEST] You are now a guest!', payload.new);
          const guest = payload.new as any;
          
          // Prevent concurrent switch attempts
          if (isSwitchingToGuestRef.current) {
            log('⚠️ [GUEST] Switch already in progress, ignoring INSERT event');
            return;
          }
          
          // Prevent duplicate triggers - check if overlay is already showing
          // This prevents loops when setIsGuest(true) triggers re-renders
          if (subscriptionActive) {
            log('⚠️ [GUEST] Subscription already active, ignoring INSERT event');
            return;
          }
          
          if (guest.stream_id === currentStream.id && guest.is_active && guest.joined_at) {
            log('🎙️ [GUEST] Switching to broadcaster mode...');
            
            // Set flag to prevent concurrent attempts
            isSwitchingToGuestRef.current = true;
            subscriptionActive = true; // Mark subscription as active to prevent loops
            
            // Show loading overlay with countdown (like TikTok)
            setShowGuestJoinOverlay(true);
            setGuestJoinError(null);
            
            try {
              // Stage 0: Countdown (3... 2... 1...) - TikTok-style
              setGuestJoinStage('countdown');
              setGuestJoinProgress(0);
              
              // Countdown from 3 to 1
              for (let i = 3; i >= 1; i--) {
                setGuestJoinCountdown(i);
                await new Promise(resolve => setTimeout(resolve, 800)); // 800ms per countdown number
              }
              
              // Stage 1: Connecting
              setGuestJoinStage('connecting');
              setGuestJoinProgress(10);
              setGuestJoinCountdown(undefined);
              
              // Stage 2: Joining (update progress as we go)
              setGuestJoinStage('joining');
              setGuestJoinProgress(30);
              
              // Switch to broadcaster mode - bootstrap API will assign UID if not present
              // Pass undefined to let bootstrap API handle UID assignment
              await switchToGuestMode(guest.agora_uid || undefined);
              
              // Stage 3: Synchronizing (minimal delay - just for UI feedback)
              setGuestJoinStage('synchronizing');
              setGuestJoinProgress(90);
              await new Promise(resolve => setTimeout(resolve, 100)); // Reduced from 500ms
              
              // Stage 4: Success
              // Note: UID will be set by switchToGuestMode from bootstrap response
              setGuestJoinStage('success');
              setGuestJoinProgress(100);
              
              // CRITICAL: Set guest state and UID BEFORE hiding overlay to ensure video renders
              setIsGuest(true);
              // Ensure local guest tile renders camera/mic (previous sessions could leave these false)
              setIsGuestVideoEnabled(true);
              setIsGuestAudioEnabled(true);
              // Update guest UID from the guest record if available
              if (guest.agora_uid) {
                setGuestAgoraUid(guest.agora_uid);
                log('✅ [GUEST] Set guest UID:', guest.agora_uid);
              }
              
              // UID will be set from bootstrap API response in switchToGuestMode
              // We'll fetch it from the updated guest record if needed
              log('✅ [GUEST] Successfully became a guest');

              // Small delay to ensure video preview is ready before hiding overlay
              await new Promise(resolve => setTimeout(resolve, 300));

              // Hide overlay quickly after success (reduced from 1500ms to 800ms)
              setTimeout(() => {
                setShowGuestJoinOverlay(false);
                subscriptionActive = false; // Reset subscription flag to allow future triggers
                // Reset flag immediately (reduced from 1000ms to 200ms)
                setTimeout(() => {
                  isSwitchingToGuestRef.current = false;
                }, 200);
              }, 800);
            } catch (error: any) {
              // Log error with full context (but use warn for expected errors to avoid error overlay)
              const isExpectedError = 
                error.message?.includes('already a guest') ||
                error.message?.includes('No active stream') ||
                error.message?.includes('stream ended');
              
              if (isExpectedError) {
                warn('ℹ️ [GUEST] Expected error during guest join:', error.message || error);
              } else {
                // Silently ignore broadcaster mode switch errors
              }
              
              setGuestJoinStage('error');
              
              // Extract error message from original error if available
              const originalError = error.originalError || error;
              let errorMessage = originalError.message || error.message || 'Failed to join as co-host. Please try again.';
              
              // Map specific errors to user-friendly messages
              if (errorMessage.includes('Invalid App ID') || errorMessage.includes('error 110') || errorMessage.includes('configuration')) {
                errorMessage = 'Stream configuration error. Please try again.';
              } else if (errorMessage.includes('ended') || errorMessage.includes('connect') || errorMessage.includes('join channel')) {
                errorMessage = 'Unable to connect. The stream may have ended, or connection is unstable. Please try again.';
              } else if (errorMessage.includes('Invalid parameter')) {
                errorMessage = 'Invalid stream parameters. Please try again.';
              } else if (errorMessage.includes('Not initialized')) {
                errorMessage = 'Stream initialization failed. Please try again.';
              } else if (errorMessage.includes('already a guest') || errorMessage.includes('No active stream')) {
                // These are expected errors - don't show error overlay
                errorMessage = 'Already connected as co-host.';
                setGuestJoinError(null);
                subscriptionActive = false; // Reset subscription flag
                setTimeout(() => {
                  setShowGuestJoinOverlay(false);
                  isSwitchingToGuestRef.current = false;
                }, 500);
                return; // Exit early for expected errors
              }
              
              setGuestJoinError(errorMessage);
              setGuestJoinProgress(0);

              // Reset flag on error
              subscriptionActive = false; // Reset subscription flag
              setTimeout(() => {
                isSwitchingToGuestRef.current = false;
              }, 2000);

              // Hide overlay after error display
              setTimeout(() => {
                setShowGuestJoinOverlay(false);
                Alert.alert(
                  'Connection Error',
                  errorMessage,
                  [{ text: 'OK' }]
                );
              }, 2000);
            }
          } else {
            log('⚠️ [GUEST] INSERT event ignored:', {
              streamMatch: guest.stream_id === currentStream.id,
              isActive: guest.is_active,
              hasJoinedAt: !!guest.joined_at,
              currentStreamId: currentStream.id,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_stream_guests',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          log('🔄 [GUEST] Guest status updated', payload.new);
          const guest = payload.new as any;
          
          // If UID was just assigned and we're not already a guest, switch to guest mode
          // Also check subscriptionActive to prevent loops
          if (guest.stream_id === currentStream.id && 
              guest.is_active && 
              guest.agora_uid && 
              guest.joined_at &&
              !guestAgoraUid &&
              !isSwitchingToGuestRef.current &&
              !subscriptionActive) {
            log('🎉 [GUEST] UID assigned via UPDATE event, switching to broadcaster mode...');
            
            // Set flag to prevent concurrent attempts
            isSwitchingToGuestRef.current = true;
            
            try {
              setGuestAgoraUid(guest.agora_uid);
              
              const success = await switchToGuestMode(guest.agora_uid);
              if (success) {
                setIsGuest(true);
                setIsGuestVideoEnabled(true);
                setIsGuestAudioEnabled(true);
                log('✅ [GUEST] Successfully switched to guest mode after UID assignment');
              } else {
                // Silently ignore guest mode switch errors
              }
            } catch (error) {
              // Silently ignore guest mode switch errors
            } finally {
              // Reset flag after a delay
              setTimeout(() => {
                isSwitchingToGuestRef.current = false;
              }, 2000);
            }
          } else if (guest.agora_uid && guestAgoraUid !== guest.agora_uid) {
            // UID was updated - update local state
            setGuestAgoraUid(guest.agora_uid);
          }
          
          // If guest was deactivated, leave guest mode
          if (!guest.is_active && isGuestRef.current) {
            log('👋 [GUEST] You were removed as guest by host');
            
            try {
              // Step 1: Leave Agora guest mode
              const success = await leaveGuestModeRef.current();
              
              if (success) {
                // Step 2: Update local state
                setIsGuest(false);
                setGuestAgoraUid(null);
                setIsGuestVideoEnabled(false);
                setIsGuestAudioEnabled(false);
                
                log('✅ [GUEST] Successfully left guest mode after host removal');
                
                // Show user-friendly notification
                Toast.show({
                  type: 'info',
                  text1: 'Co-host Ended',
                  text2: 'You have been removed as a co-host',
                  visibilityTime: 3000,
                });
              } else {
                error('⚠️ [GUEST] Failed to leave Agora guest mode');
                // Still update state to prevent UI bugs
                setIsGuest(false);
                setGuestAgoraUid(null);
                setIsGuestVideoEnabled(false);
                setIsGuestAudioEnabled(false);
              }
            } catch (error) {
              // Silently ignore leave guest mode errors
              // Ensure state is reset even on error
              setIsGuest(false);
              setGuestAgoraUid(null);
              setIsGuestVideoEnabled(false);
              setIsGuestAudioEnabled(false);
            }
          }
          
          // Handle audio status changes
          // CRITICAL: Only sync audio state from database if it's different from current state
          // This prevents database state from overriding actual Agora publishing state
          if (guest.is_active && isGuest && guest.audio_enabled !== undefined) {
            log('🎤 [GUEST] Audio status changed:', guest.audio_enabled);
            
            // Update local state to match database (but don't override if Agora is actually publishing)
            // The provider's event listeners will sync the actual Agora state
            setIsGuestAudioEnabled(guest.audio_enabled);
            
            // Mute/unmute local audio based on database status
            // muted = !audio_enabled (if audio_enabled is false, we mute)
            await muteGuestAudio(!guest.audio_enabled);
          }
          
          // Handle video status changes
          // CRITICAL: Sync video state from database, but provider listeners will override with actual Agora state
          if (guest.is_active && isGuest && guest.video_enabled !== undefined) {
            log('📹 [GUEST] Video status changed:', guest.video_enabled);
            setIsGuestVideoEnabled(guest.video_enabled);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'live_stream_guests',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          // IMPORTANT:
          // We now delete active guest rows to avoid unique constraint collisions on (stream_id,user_id,is_active).
          // That means removals may come through as DELETE (not UPDATE is_active=false).
          const oldGuest = payload.old as any;
          if (!oldGuest) return;

          // Only react to deletions for the current stream
          if (oldGuest.stream_id !== currentStream.id) return;

          if (isGuestRef.current) {
            log('👋 [GUEST] Guest row deleted - leaving guest mode (stop audio/video publishing)');
            try {
              const success = await leaveGuestModeRef.current();
              if (!success) {
                warn('⚠️ [GUEST] Failed to leave Agora guest mode after DELETE');
              }
            } catch (e) {
              warn('⚠️ [GUEST] Error leaving guest mode after DELETE:', e);
            } finally {
              // Always reset local state so UI doesn’t get stuck showing avatar + live audio
              setIsGuest(false);
              setGuestAgoraUid(null);
              setIsGuestVideoEnabled(false);
              setIsGuestAudioEnabled(false);

              Toast.show({
                type: 'info',
                text1: 'Co-host Ended',
                text2: 'You have been removed as a co-host',
                visibilityTime: 3000,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        log('🎉 [GUEST] Guest status subscription:', status);
      });
    
    return () => {
      log('🎉 [GUEST] Cleaning up guest status subscription');
      supabase.removeChannel(guestStatusChannel);
    };
  }, [user?.id, currentStream?.id]); // Removed isGuest, switchToGuestMode, leaveGuestMode, muteGuestAudio to prevent re-subscription loops

  // CRITICAL: Watchdog polling - if we think we're a guest but DB says we're not, force leave
  useEffect(() => {
    if (!isGuest || !user?.id || !currentStream?.id) return;

    log('🛡️ [GUEST_WATCHDOG] Starting watchdog polling (isGuest=true, checking DB)...');
    
    const watchdogInterval = setInterval(async () => {
      try {
        // Check if we're still an active guest in the database
        const { data: guest, error } = await supabase
          .from('live_stream_guests')
          .select('id, is_active, stream_id')
          .eq('stream_id', currentStream.id)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        // If no active guest row found, we've been removed - force leave guest mode
        if (!error && !guest) {
          warn('🛡️ [GUEST_WATCHDOG] ⚠️ No active guest row found in DB - forcing leave guest mode!');
          
          try {
            const success = await leaveGuestModeRef.current();
            if (!success) {
              warn('⚠️ [GUEST_WATCHDOG] Failed to leave Agora guest mode');
            }
          } catch (e) {
            warn('⚠️ [GUEST_WATCHDOG] Error leaving guest mode:', e);
          } finally {
            // Always reset local state
            setIsGuest(false);
            setGuestAgoraUid(null);
            setIsGuestVideoEnabled(false);
            setIsGuestAudioEnabled(false);

            Toast.show({
              type: 'info',
              text1: 'Co-host Ended',
              text2: 'You have been removed as a co-host',
              visibilityTime: 3000,
            });
          }
        } else if (guest) {
          // Still an active guest - all good
          log('✅ [GUEST_WATCHDOG] Still an active guest in DB');
        }
      } catch (error) {
        error('❌ [GUEST_WATCHDOG] Error checking guest status:', error);
      }
    }, 3000); // Poll every 3 seconds when in guest mode

    return () => {
      log('🛡️ [GUEST_WATCHDOG] Stopping watchdog polling');
      clearInterval(watchdogInterval);
    };
  }, [isGuest, user?.id, currentStream?.id]);
  
  // Prevent duplicate comment sends
  const [isSendingComment, setIsSendingComment] = useState(false);
  const lastCommentRef = useRef<string>('');
  const lastCommentTimeRef = useRef<number>(0);
  
  // Send comment function with duplicate prevention
  const sendComment = async (message: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert(
          'Login Required',
          'You need to login to comment on live streams. Would you like to login now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Login', onPress: () => router.push('/auth/signin') }
          ]
        );
        return;
      }
      
      // Prevent duplicate sends within 1 second or same message
      const now = Date.now();
      const trimmedMessage = message.trim();
      
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

      // Build comment data
      let messageToSend = trimmedMessage;
      let isReply = false;
      
      // If replying, check if we should include @username in message or use reply_to fields
      if (replyingToComment) {
        // Check if message starts with @username - if so, keep it, otherwise add it
        if (!messageToSend.startsWith(`@${replyingToComment.userName}`)) {
          messageToSend = `@${replyingToComment.userName} ${messageToSend}`;
        }
        isReply = true;
      }
      
      const commentData: any = {
        stream_id: currentStream?.id || streamId,
        user_id: user.id,
        message: messageToSend,
      };
      
      // Try to add reply_to fields if replying (will fail gracefully if columns don't exist)
      if (replyingToComment) {
        commentData.reply_to = replyingToComment.id;
        commentData.reply_to_username = replyingToComment.userName;
      }

      log('[LiveStreamViewer] Sending comment to Supabase:', {
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
        // Check if error is due to missing reply columns
        if (error.code === 'PGRST204' || 
            (error.message?.includes('column') && 
             (error.message?.includes('does not exist') || error.message?.includes('reply_to')))) {
          warn('[LiveStreamViewer] Reply columns not in database yet, sending with @username in message text');
          // Retry without reply_to fields, but keep @username in message
          const retryData = {
            stream_id: currentStream?.id || streamId,
            user_id: user.id,
            message: messageToSend, // Keep @username in message
          };
          
          const { data: retryResult, error: retryError } = await supabase
            .from('live_stream_comments')
            .insert(retryData)
            .select();
          
          if (retryError) {
            // Silently ignore comment retry errors
            Alert.alert(
              'Error',
              `Failed to send comment: ${retryError.message || 'Unknown error'}`,
              [{ text: 'OK' }]
            );
          } else {
            log('[LiveStreamViewer] ✅ Comment sent successfully (retry):', {
              comment_id: retryResult?.[0]?.id,
              created_at: retryResult?.[0]?.created_at,
            });
            // Success on retry - clear reply state
            if (replyingToComment) {
              setReplyingToComment(null);
            }
          }
        } else {
          // Silently ignore comment send errors
          Alert.alert(
            'Error',
            `Failed to send comment: ${error.message || 'Unknown error'}`,
            [{ text: 'OK' }]
          );
        }
      } else {
        log('[LiveStreamViewer] ✅ Comment sent successfully:', {
          comment_id: data?.[0]?.id,
          created_at: data?.[0]?.created_at,
        });
        // Success - clear reply state
        if (replyingToComment) {
          setReplyingToComment(null);
        }
      }
    } catch (error) {
      error('Error sending comment:', error);
    } finally {
      setIsSendingComment(false);
    }
  };
  
  // Handle invite user from comment (host only)
  const handleInviteUserFromComment = async (userId: string) => {
    if (!currentStream || !user || user.id !== currentStream.streamer_id) {
      return;
    }
    
    try {
      const { sendGuestInvitation } = await import('../utils/guestService');
      const result = await sendGuestInvitation(currentStream.id, userId);
      
      if (result.success) {
        log('[LiveStreamViewer] ✅ Guest invitation sent successfully');
        // You could show a toast notification here
      } else {
        error('[LiveStreamViewer] ❌ Failed to send invitation:', result.error);
        // You could show an error toast here
      }
    } catch (error) {
      error('[LiveStreamViewer] ❌ Error sending invitation:', error);
    }
  };
  
  // Handle reply to comment
  const handleReplyToComment = (comment: { id: string; user_name: string; message: string }) => {
    setReplyingToComment({
      id: comment.id,
      userName: comment.user_name,
      message: comment.message,
    });
    // Prepend @username to comment text (like community feed)
    const replyPrefix = `@${comment.user_name} `;
    setCommentText(replyPrefix);
    // Focus the comment input
    setIsCommentFocused(true);
  };
  
  // Animation values for premium interactions
  const heartScaleAnim = useRef(new Animated.Value(1)).current;
  const inputScaleAnim = useRef(new Animated.Value(1)).current;
  
  // Animation values for connecting screen
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Removed rotateAnim since we're using pulse instead of rotation
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // CRITICAL: Only skip if exiting AND not joined
    // If we're joined, we should continue to show video even if exit flags are set
    if ((isExitingRef.current || hasLeftRef.current) && !isJoinedAsViewer) {
      log('🚫 [VIEWER] Effect: Already exiting or left and not joined, skipping');
      return;
    }
    
    if (isJoinedAsViewer && currentStream?.id === streamId) {
      log('✅ [VIEWER] Effect: Already joined for this stream, skipping');
      return;
    }
    
    // Start connecting animations
    const startAnimations = () => {
      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Removed rotation animation for better readability

      // Scale animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Opacity animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.3,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    startAnimations();

    // CRITICAL: Reset exit flags when component mounts (fresh start)
    if (!isExitingRef.current && !hasLeftRef.current) {
      log('🔄 [VIEWER] Component mounted, resetting exit flags');
    }
    // Only reset if we're not already in an exiting state (preserve exit state if user is leaving)
    // This allows fresh mounts to join, but prevents re-joins after exit

    // Join stream when component mounts
    const joinStream = async () => {
      // CRITICAL: Don't join if we're exiting or have already left
      if (isExitingRef.current || hasLeftRef.current) {
        log('🚫 [VIEWER] Exiting or already left, preventing re-join');
        return;
      }

      // CRITICAL: Don't join if already joined for this stream
      if (isJoinedAsViewer && currentStream?.id === streamId) {
        log('✅ [VIEWER] Already joined as viewer for this stream, skipping re-join');
        return;
      }

      // Don't attempt to join if already kicked
      if (isKicked) {
        log('🚫 [VIEWER] User is already kicked, skipping join attempt');
        return;
      }

      log('🔄 Viewer joining stream:', streamId);
      
      // Check if user is kicked BEFORE attempting to join
      if (user?.id) {
        const kicked = await checkIsKicked(streamId, user.id);
        if (kicked) {
          log('🚫 [VIEWER] User is kicked, preventing join attempt');
          setIsKicked(true);
          setIsCheckingKick(false);
          
          // Get kick reason
          const { data } = await supabase
            .from('live_stream_kicks')
            .select('reason')
            .eq('stream_id', streamId)
            .eq('user_id', user.id)
            .single();
          
          if (data?.reason) {
            setKickReason(data.reason);
          }
          
          // Show custom kick modal
          setShowKickModal(true);
          return;
        }
      }
      
      setIsCheckingKick(false);
      const success = await joinStreamAsViewer(streamId);
      if (!success) {
        error('❌ Failed to join stream');
        // Note: joinStreamAsViewer already shows appropriate alerts for different error cases
        // (stream ended, not available, etc.) so we just need to navigate back
        // Small delay to allow any alerts to be dismissed first
        setTimeout(() => {
          log('🔄 [VIEWER] Join failed, navigating back to home screen');
          onClose();
        }, 500);
      } else {
        log('✅ Successfully joined stream, waiting for video...');
        // Small delay to allow remote UIDs to populate
        setTimeout(() => {
          log('📹 [VIEWER] Remote UIDs after join:', streamRemoteUids);
        }, 1000);
      }
    };

    // Only join if not already joined
    if (!isJoinedAsViewer || currentStream?.id !== streamId) {
    joinStream();
    } else {
      log('✅ [VIEWER] Already joined, skipping join call');
    }

    // Auto-hide controls after 3 seconds
    const timeout = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => {
      clearTimeout(timeout);
      log('🔄 Viewer leaving stream (cleanup)');
      
      // CRITICAL: Mark as exiting FIRST to prevent any re-joins
      isExitingRef.current = true;
      hasLeftRef.current = true;
      log('🚫 [VIEWER] Cleanup: Exit flags set, preventing future re-joins');
      
      // CRITICAL: Deactivate KeepAwake IMMEDIATELY in cleanup to prevent screen freeze
      try {
        deactivateKeepAwake();
        log('📱 [VIEWER] KeepAwake deactivated in useEffect cleanup');
      } catch (error) {
        warn('⚠️ [VIEWER] Failed to deactivate KeepAwake in cleanup:', error);
      }
      
      // Reset join request state when user leaves
      setJoinRequestSent(false);
      setSendingRequest(false);
      // Stop all sounds immediately
      liveStreamSoundManager.stopAllSounds();
      
      // CRITICAL: Reset audio session IMMEDIATELY in cleanup to stop background audio
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      }).then(() => {
        log('🔇 [VIEWER] Audio session reset in useEffect cleanup - background audio stopped');
      }).catch((error) => {
        warn('⚠️ [VIEWER] Failed to reset audio session in useEffect cleanup:', error);
      });
      
      // Leave stream (async cleanup)
      leaveStreamAsViewer().catch(error => {
        error('❌ [VIEWER] Error during unmount cleanup:', error);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]); // Only re-run when streamId changes - early exit checks prevent unnecessary joins

  // Monitor stream status - disconnect viewers when stream ends
  useEffect(() => {
    // CRITICAL: Only skip if we're actually exiting AND not joined
    // Don't skip if we're joined - we need to monitor the stream even during transitions
    if ((isExitingRef.current || hasLeftRef.current) && !isJoinedAsViewer) {
      log('🚫 [VIEWER] Exiting or already left and not joined, skipping stream status monitoring');
      return;
    }
    
    if (!isJoinedAsViewer || !streamId) return;

    log('👁️ [VIEWER] Setting up stream end monitoring for stream:', streamId);

    // MEMORY LEAK FIX: Track all timeouts and intervals for cleanup
    const timeoutIds: NodeJS.Timeout[] = [];
    let statusCheckIntervalId: NodeJS.Timeout | null = null;

    // Subscribe to stream status changes
    const streamStatusChannel = supabase
      .channel(`stream_status_${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_streams',
          filter: `id=eq.${streamId}`,
        },
        async (payload) => {
          const stream = payload.new;
          log('👁️ [VIEWER] Stream status update received:', {
            is_live: stream.is_live,
            ended_at: stream.ended_at
          });

          // If stream is no longer live, disconnect viewer
          if (!stream.is_live || stream.ended_at) {
            log('🛑 [VIEWER] Stream has ended, disconnecting viewer...');
            
            // Mark stream as ended to prevent overlay from showing
            setStreamEnded(true);
            
            // Show toast notification
            Toast.show({
              type: 'info',
              text1: 'Stream Ended',
              text2: 'The broadcaster has ended the live stream.',
              visibilityTime: 2000,
            });
            
            // Auto-close modal after leaving stream
            // MEMORY LEAK FIX: Track timeout for cleanup
            const timeoutId = setTimeout(async () => {
              try {
                log('🛑 [VIEWER] Auto-closing viewer modal after stream ended...');
                // Leave the stream first
                await leaveStreamAsViewer();
                // Small delay to ensure cleanup completes
                await new Promise(resolve => setTimeout(resolve, 200));
                // Close the modal and navigate back to home screen cleanly
                onClose();
                log('✅ [VIEWER] Modal auto-closed after stream ended');
              } catch (error) {
                error('❌ [VIEWER] Error leaving stream (non-critical):', error);
                // Still close modal even if leave fails
                onClose();
              }
            }, 1800); // Keep notice visible long enough for viewers to read
            timeoutIds.push(timeoutId);
          }
        }
      )
      .subscribe((status) => {
        log('👁️ [VIEWER] Stream status subscription status:', status);
      });

    // Also periodically check stream status as a fallback
    statusCheckIntervalId = setInterval(async () => {
      // CRITICAL: Stop checking if we're exiting or have left
      if (isExitingRef.current || hasLeftRef.current) {
        if (statusCheckIntervalId) {
          clearInterval(statusCheckIntervalId);
          statusCheckIntervalId = null;
        }
        return;
      }
      
      if (!isJoinedAsViewer || !streamId) {
        if (statusCheckIntervalId) {
          clearInterval(statusCheckIntervalId);
          statusCheckIntervalId = null;
        }
        return;
      }

      try {
        const { data: stream, error } = await supabase
          .from('live_streams')
          .select('is_live, ended_at')
          .eq('id', streamId)
          .maybeSingle(); // Use maybeSingle() instead of single() to handle missing rows gracefully

        // If stream doesn't exist (deleted) or error indicates not found, treat as ended
        if (error) {
          // PGRST116 means no rows found - stream was deleted, so it ended
          if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
            log('🛑 [VIEWER] Stream deleted (ended) detected via periodic check');
            if (statusCheckIntervalId) {
              clearInterval(statusCheckIntervalId);
              statusCheckIntervalId = null;
            }
            
            // Mark stream as ended to prevent overlay from showing
            setStreamEnded(true);
            
            // Show toast notification
            Toast.show({
              type: 'info',
              text1: 'Stream Ended',
              text2: 'The stream has been closed.',
              visibilityTime: 2000,
            });
            
            // Auto-close modal after leaving stream
            // MEMORY LEAK FIX: Track timeout for cleanup
            const timeoutId = setTimeout(async () => {
              try {
                log('🛑 [VIEWER] Auto-closing viewer modal after stream deleted...');
                // Leave the stream first
                await leaveStreamAsViewer();
                // Small delay to ensure cleanup completes
                await new Promise(resolve => setTimeout(resolve, 200));
                // Close the modal and navigate back to home screen cleanly
                onClose();
                log('✅ [VIEWER] Modal auto-closed after stream deleted');
              } catch (error) {
                error('❌ [VIEWER] Error leaving stream (non-critical):', error);
                // Still close modal even if leave fails
                onClose();
              }
            }, 1800); // Keep notice visible long enough for viewers to read
            timeoutIds.push(timeoutId);
            return;
          }
          // Other errors - log but don't disconnect
          warn('👁️ [VIEWER] Error checking stream status:', error);
          return;
        }

        // If stream doesn't exist (null data), treat as ended
        if (!stream || !stream.is_live || stream.ended_at) {
          log('🛑 [VIEWER] Stream ended detected via periodic check');
          if (statusCheckIntervalId) {
            clearInterval(statusCheckIntervalId);
            statusCheckIntervalId = null;
          }
          
          // Mark stream as ended to prevent overlay from showing
          setStreamEnded(true);
          
          // Show toast notification
          Toast.show({
            type: 'info',
            text1: 'Stream Ended',
            text2: 'The broadcaster has ended the live stream.',
            visibilityTime: 2000,
          });
          
          // Auto-close modal after leaving stream
          // MEMORY LEAK FIX: Track timeout for cleanup
          const timeoutId = setTimeout(async () => {
            try {
              log('🛑 [VIEWER] Auto-closing viewer modal after stream ended (periodic check)...');
              // Leave the stream first
              await leaveStreamAsViewer();
              // Small delay to ensure cleanup completes
              await new Promise(resolve => setTimeout(resolve, 200));
              // Close the modal and navigate back to home screen cleanly
              onClose();
              log('✅ [VIEWER] Modal auto-closed after stream ended (periodic check)');
            } catch (error) {
              error('❌ [VIEWER] Error leaving stream (non-critical):', error);
              // Still close modal even if leave fails
              onClose();
            }
          }, 1800); // Keep notice visible long enough for viewers to read
          timeoutIds.push(timeoutId);
        }
      } catch (error) {
        error('👁️ [VIEWER] Error in periodic stream check:', error);
      }
    }, 5000); // Check every 5 seconds

    return () => {
      log('👁️ [VIEWER] Cleaning up stream status monitoring');
      // Mark as exiting to prevent re-joins
      isExitingRef.current = true;
      try {
      supabase.removeChannel(streamStatusChannel);
      } catch (error) {
        warn('⚠️ [VIEWER] Error removing stream status channel:', error);
      }
      // MEMORY LEAK FIX: Clear interval properly
      if (statusCheckIntervalId) {
        clearInterval(statusCheckIntervalId);
        statusCheckIntervalId = null;
      }
      // MEMORY LEAK FIX: Clear all tracked timeouts
      timeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
    };
  }, [isJoinedAsViewer, streamId, leaveStreamAsViewer, onClose]);

  // Cleanup sounds and reset join request state when component unmounts
  useEffect(() => {
    return () => {
      // Reset join request state on unmount
      setJoinRequestSent(false);
      setSendingRequest(false);
      liveStreamSoundManager.stopAllSounds();
    };
  }, []);

  // Keep screen awake while viewing stream
  useEffect(() => {
    if (isJoinedAsViewer) {
      log('📱 Activating keep awake for viewer');
      activateKeepAwake();
    } else {
      log('📱 Deactivating keep awake for viewer');
      deactivateKeepAwake();
    }

    // Cleanup when component unmounts
    return () => {
      // CRITICAL: Always deactivate KeepAwake on unmount to prevent screen freeze
      try {
        deactivateKeepAwake();
        log('📱 [VIEWER] KeepAwake deactivated in cleanup');
      } catch (error) {
        warn('⚠️ [VIEWER] Failed to deactivate KeepAwake in cleanup:', error);
      }
    };
  }, [isJoinedAsViewer]);

  // Auto-hide stream title after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowStreamTitle(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

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
        // On Android with adjustResize, the view automatically resizes
        if (Platform.OS === 'ios') {
          setKeyboardHeight(e.endCoordinates.height - insets.bottom);
        } else {
          // On Android with adjustResize, just use a small offset
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

  // Load user coins
  useEffect(() => {
    const loadCoins = async () => {
      const coins = await getVirtualCoins();
      setUserCoins(coins.balance);
    };
    loadCoins();
  }, []);

  // Play gift sound effect
  const playGiftSound = async (gift: any) => {
    try {
      // Create a pleasant sound using the call ringtone which is more musical
      // Reduced volumes for smoother, less intrusive sound effects
      const soundFile = require('../assets/sounds/call-ringtone.mp3');
      const volume = gift.rarity === 'legendary' ? 0.2 : 
                    gift.rarity === 'epic' ? 0.15 : 
                    gift.rarity === 'rare' ? 0.12 : 0.1;
      
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
      log('Could not play gift sound:', error);
    }
  };

  // Subscribe to reactions for sound effects (viewers should hear sounds too)
  useEffect(() => {
    if (!streamId) return;

    // Initialize sound manager for viewers
    liveStreamSoundManager.initialize();

    const reactionsChannel = supabase
      .channel(`stream_reactions_sounds_viewer_${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_reactions',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          const reaction = payload.new;
          
          // CRITICAL: Prevent duplicate reactions from playing multiple times
          // Use reaction ID + type to deduplicate
          const reactionKey = `${reaction.id}_${reaction.reaction_type}`;
          const now = Date.now();
          const lastPlayed = liveStreamSoundManager.getLastPlayedTime(reactionKey);
          
          if (lastPlayed && (now - lastPlayed) < 500) {
            log('🔊 [VIEWER] Duplicate reaction detected, skipping sound:', reactionKey);
            return; // Skip duplicate reaction within 500ms
          }
          
          liveStreamSoundManager.setLastPlayedTime(reactionKey, now);
          
          // Play sound based on reaction type (all viewers hear sounds)
          if (reaction.reaction_type === 'honk') {
            log('🔊 [VIEWER] Playing honk sound');
            liveStreamSoundManager.playHonkSound();
          } else if (reaction.reaction_type === 'applause') {
            log('🔊 [VIEWER] Playing applause sound');
            liveStreamSoundManager.playApplauseSound();
          }
        }
      )
      .subscribe();

    return () => {
      reactionsChannel.unsubscribe();
      // Stop all sounds when component unmounts or viewer leaves
      liveStreamSoundManager.stopAllSounds();
    };
  }, [streamId]);

  // Listen for new gifts (same as broadcaster)
  useEffect(() => {
    if (!currentStream?.id) return;

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

    // Fetch gifts initially
    fetchRecentGifts();

    // Set up polling for new gifts every 2 seconds
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

  // Handle gift sending
  const handleSendGift = async (gift: any) => {
    if (!currentStream?.streamer_id) return;
    
    const result = await sendGift(currentStream.streamer_id, currentStream.id, gift);
    
    if (result.success) {
      // Don't add animation here - it will be picked up by the polling
      // Just update user coins and close modal
      const totalCost = gift.price * (gift.quantity || 1);
      setUserCoins(prev => prev - totalCost);
      
      // If flamingo egg, immediately show floating egg
      if (gift.id === 'flamingo_egg') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Get the most recent egg transaction for this stream (just created)
          setTimeout(async () => {
            const { data: recentTransaction } = await supabase
              .from('gift_transactions')
              .select('*')
              .eq('stream_id', currentStream.id)
              .in('gift_id', ['flamingo_egg'])
              .eq('sender_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            if (recentTransaction) {
              // Fetch sender profile
              const { data: senderProfile } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .eq('id', user.id)
                .single();

              const senderName = senderProfile?.full_name || senderProfile?.username || 'Anonymous';
              const senderAvatar = senderProfile?.avatar_url;
              
              setRandomBoxSenderInfo({
                id: user.id,
                name: senderName,
                avatar: senderAvatar,
              });
              setRandomBoxTransactionId(recentTransaction.id);
              setShowFloatingGiftBox(true);
            }
          }, 500); // Small delay to ensure transaction is saved
        }
      }
      
      // Close modal
      setShowGiftModal(false);
    } else {
      error('Failed to send gift:', result.error);
    }
  };

  // Remove gift animation
  const removeGiftAnimation = (id: string) => {
    setGiftAnimations(prev => prev.filter(anim => anim.id !== id));
  };

  const handleClose = async () => {
    // CRITICAL: Mark as exiting FIRST to prevent any re-joins
    isExitingRef.current = true;
    hasLeftRef.current = true;
    log('🚫 [VIEWER] handleClose: Marked as exiting, preventing re-joins');
    
    // CRITICAL: Deactivate KeepAwake IMMEDIATELY to prevent screen freeze
    try {
      deactivateKeepAwake();
      log('📱 [VIEWER] KeepAwake deactivated immediately');
    } catch (error) {
      warn('⚠️ [VIEWER] Failed to deactivate KeepAwake:', error);
    }
    
    // Stop all sounds immediately
    liveStreamSoundManager.stopAllSounds();
    
    // CRITICAL: Reset audio session IMMEDIATELY to stop background audio (before any async operations)
    Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
    }).then(() => {
      log('🔇 [VIEWER] Audio session reset in handleClose - background audio stopped');
    }).catch((audioResetError) => {
      warn('⚠️ [VIEWER] Failed to reset audio session in handleClose:', audioResetError);
    });
    
    // Reset join request state when user leaves
    setJoinRequestSent(false);
    setSendingRequest(false);
    
    // Call leaveStreamAsViewer (it will handle all audio cleanup)
    // Don't wait for it - close immediately to stop audio
    leaveStreamAsViewer().catch(error => {
      error('❌ [VIEWER] Error during close cleanup:', error);
    });
    
    // Close immediately - don't wait for cleanup
    // Use InteractionManager to ensure UI is responsive before closing
    const { InteractionManager } = require('react-native');
    InteractionManager.runAfterInteractions(() => {
      // Use requestAnimationFrame to ensure state updates happen on next frame
      requestAnimationFrame(() => {
        onClose();
      });
    });
  };

  const handleSendJoinRequest = async () => {
    if (joinRequestSent || sendingRequest) {
      log('🔄 [VIEWER] Join request already sent or sending, ignoring');
      return;
    }

    // Check if stream allows guests (must be explicitly true)
    if (currentStream?.allow_guests !== true) {
      Alert.alert(
        'Guest Join Disabled',
        'This stream does not allow guests. It is a single-person stream only.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Check if there's already a guest (max 1 guest at a time)
    if (allActiveGuests.length >= 1) {
      Alert.alert(
        'Guest Limit Reached',
        'This stream already has a co-host. Please wait for them to leave.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Check if user is already a guest
    if (isGuest) {
      Alert.alert('Already a Guest', 'You are already a co-host in this stream.');
      return;
    }

    log('🔄 [VIEWER] Sending join request...');
    log('🔄 [VIEWER] Current state - joinRequestSent:', joinRequestSent, 'sendingRequest:', sendingRequest);
    
    setSendingRequest(true);
    try {
      const result = await sendJoinRequest(currentStream?.id || streamId);
      setSendingRequest(false);

      log('🔄 [VIEWER] Join request result:', result);

      if (result.success) {
        // Check if request was auto-approved (open channel - no approval needed)
        if ((result as any).autoApproved) {
          log('✅ [VIEWER] Join request auto-approved - open channel, switching to guest mode immediately');
          setJoinRequestSent(true);
          
          // Show guest join overlay and switch to guest mode
          setShowGuestJoinOverlay(true);
          setGuestJoinStage('connecting');
          setGuestJoinProgress(10);
          
          // Small delay to show connecting state, then switch to guest mode
          setTimeout(async () => {
            try {
              setGuestJoinStage('joining');
              setGuestJoinProgress(50);
              
              // Switch to guest mode - the subscription will detect the guest record and complete the join
              const switchSuccess = await switchToGuestMode();
              
              if (switchSuccess) {
                // Even if subscription is delayed, keep our local tile in "camera on" state
                setIsGuestVideoEnabled(true);
                setIsGuestAudioEnabled(true);
                setGuestJoinProgress(100);
                setGuestJoinStage('success');
                
                // Hide overlay after showing success
                setTimeout(() => {
                  setShowGuestJoinOverlay(false);
                }, 1500);
              } else {
                setGuestJoinStage('error');
                setGuestJoinError('Failed to join as guest');
                setShowGuestJoinOverlay(true);
              }
            } catch (error: any) {
              error('❌ [VIEWER] Error switching to guest mode after auto-approval:', error);
              setGuestJoinStage('error');
              setGuestJoinError(error.message || 'Failed to join as guest');
              setShowGuestJoinOverlay(true);
            }
          }, 500);
          
          Toast.show({
            type: 'success',
            text1: 'Joining as Co-Host',
            text2: 'You\'re joining the stream now...',
            visibilityTime: 2000,
          });
        } else {
          // Regular request - needs host approval
          log('🔄 [VIEWER] Join request successful, setting joinRequestSent to true');
          setJoinRequestSent(true);
          Toast.show({
            type: 'success',
            text1: 'Request Sent',
            text2: 'Your request to join as co-host has been sent to the host.',
            visibilityTime: 3000,
          });
        }
      } else {
        log('🔄 [VIEWER] Join request failed:', result.error);
        
        // Show alert for guest join disabled error
        if (result.error?.includes('does not allow guests') || result.error?.includes('single-person stream')) {
          Alert.alert(
            'Guest Join Disabled',
            'This stream does not allow guests. It is a single-person stream only.',
            [{ text: 'OK' }]
          );
        } else if (result.error?.includes('already a guest')) {
          Toast.show({
            type: 'info',
            text1: 'Already a Guest',
            text2: 'You are already a co-host in this stream.',
            visibilityTime: 3000,
          });
        } else {
          Toast.show({
            type: 'error',
            text1: 'Request Failed',
            text2: result.error || 'Failed to send join request. Please try again.',
            visibilityTime: 3000,
          });
        }
      }
    } catch (error: any) {
      setSendingRequest(false);
      error('❌ [VIEWER] Error sending join request:', error);
      
      // Show alert if error indicates guests not allowed
      if (error.message?.includes('does not allow guests') || error.message?.includes('single-person stream')) {
        Alert.alert(
          'Guest Join Disabled',
          'This stream does not allow guests. It is a single-person stream only.',
          [{ text: 'OK' }]
        );
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: error.message || 'Failed to send join request. Please try again.',
          visibilityTime: 3000,
        });
      }
    }
  };

  const handleScreenTap = (event?: any) => {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTapTime.current;
    
    // Get tap coordinates
    const tapX = event?.nativeEvent?.pageX || width / 2;
    const tapY = event?.nativeEvent?.pageY || height / 2;
    
    // Check if this is a double tap (within 300ms and similar position)
    const positionDiff = Math.sqrt(
      Math.pow(tapX - lastTapX.current, 2) + Math.pow(tapY - lastTapY.current, 2)
    );
    
    if (timeDiff < 300 && positionDiff < 50) {
      // Double tap detected - trigger heart reaction at tap location
      if (!user) {
        Alert.alert(
          'Login Required',
          'You need to login to react to live streams. Would you like to login now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Login', onPress: () => router.push('/auth/signin') }
          ]
        );
        // Reset tap tracking
        lastTapTime.current = 0;
        lastTapX.current = 0;
        lastTapY.current = 0;
        return;
      }
      
      const boundedTapX = Math.max(50, Math.min(width - 50, tapX));
      const randomOffset = (Math.random() - 0.5) * 40;
      const heartX = Math.max(50, Math.min(width - 50, boundedTapX + randomOffset));
      
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
      
      floatingReactionsRef.current?.addHeart(heartX);

      // Reset tap tracking
      lastTapTime.current = 0;
      lastTapX.current = 0;
      lastTapY.current = 0;
    } else {
      // Single tap - toggle controls visibility
      setShowControls(!showControls);
      setShowStreamTitle(true); // Show stream title when screen is touched
      
      // Auto-hide controls and stream title again after 3 seconds
      if (!showControls) {
        setTimeout(() => {
          setShowControls(false);
          setShowStreamTitle(false);
        }, 3000);
      }
      
      // Store tap info for double tap detection
      lastTapTime.current = currentTime;
      lastTapX.current = tapX;
      lastTapY.current = tapY;
    }
  };



  const formatViewerCount = (count: number): string => {
    if (count < 1000) return count.toString();
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1000000).toFixed(1)}M`;
  };

  // Compute variables needed for hooks (safely handle null cases)
  // These must be computed before any early returns to ensure hooks are always called
  const broadcasterUid = currentStream?.broadcaster_uid || 1000;
  const isMusicMode = currentStream?.music_mode === true;
  const broadcasterVideoState = broadcasterVideoEnabled.get(broadcasterUid) ?? broadcasterVideoEnabled.get(0);

  // Detect video subscription failure: adaptive timeout based on connection quality
  // Uses DRY utilities for bad connection handling
  // CRITICAL: This hook must be called before any early returns
  useEffect(() => {
    if (!isJoinedAsViewer || !broadcasterUid || isMusicMode) {
      setVideoSubscriptionFailed(false);
      setVideoFirstFrameReceived(false);
      if (videoFailureTimeoutRef.current) {
        clearTimeout(videoFailureTimeoutRef.current);
        videoFailureTimeoutRef.current = null;
      }
      return;
    }

    // Reset when stream changes
    setVideoFirstFrameReceived(false);
    setVideoSubscriptionFailed(false);

    // Adaptive timeout: longer for poor connections (15s) vs good connections (10s)
    const rxQuality = networkQuality?.[broadcasterUid]?.rxQuality || 0;
    const timeoutDuration = rxQuality <= 2 ? 15000 : 10000; // More patience for bad connections

    // Start timeout: if no first frame, mark as failed (with degradation strategy)
    videoFailureTimeoutRef.current = setTimeout(async () => {
      if (!videoFirstFrameReceived && broadcasterVideoState !== true) {
        // Use DRY degradation strategy for poor connections
        const { analyzeConnectionQuality, getDegradationStrategy } = await import('../utils/livestreamNetworkResilience');
        const qualityInfo = analyzeConnectionQuality(rxQuality);
        const strategy = getDegradationStrategy(rxQuality, 0);
        
        // Only mark as failed if network is poor or video state is explicitly false
        if (qualityInfo.isPoor || broadcasterVideoState === false) {
          setVideoSubscriptionFailed(true);
          livestreamLog('📹 [VIEWER] Video subscription failed - enabling graceful degradation', {
            rxQuality,
            strategy,
          });
        }
      }
    }, timeoutDuration);

    return () => {
      if (videoFailureTimeoutRef.current) {
        clearTimeout(videoFailureTimeoutRef.current);
        videoFailureTimeoutRef.current = null;
      }
    };
  }, [isJoinedAsViewer, broadcasterUid, isMusicMode, broadcasterVideoState, networkQuality, currentStream?.id]);

  // Listen for first video frame via LiveStreamProvider's broadcasterVideoEnabled state
  // CRITICAL: This hook must be called before any early returns
  useEffect(() => {
    if (broadcasterVideoState === true && !videoFirstFrameReceived) {
      setVideoFirstFrameReceived(true);
      setVideoSubscriptionFailed(false);
      if (videoFailureTimeoutRef.current) {
        clearTimeout(videoFailureTimeoutRef.current);
        videoFailureTimeoutRef.current = null;
      }
    }
  }, [broadcasterVideoState, videoFirstFrameReceived]);

  // If stream has ended, show a simple view while alert is displayed
  if (streamEnded) {
    return (
      <View style={[styles.container, { backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar hidden />
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', opacity: 0.92 }}>
          Livestream ended
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 8 }}>
          The host has ended this stream.
        </Text>
      </View>
    );
  }

  // If user is kicked, show kick modal instead of loading screen
  if (isKicked && showKickModal) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar hidden />
        <KickedFromStreamModal
          visible={showKickModal}
          reason={kickReason || undefined}
          onClose={() => {
            setShowKickModal(false);
            setIsKicked(false);
            setKickReason(null);
            // Navigate to create live stream screen
            router.replace('/live');
          }}
        />
      </View>
    );
  }

  // Show loading screen only if not kicked and not checking kick status
  // IMPORTANT: Always check if currentStream exists before rendering content that uses it
  if ((!currentStream || !isJoinedAsViewer) && !isKicked && !isCheckingKick) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar hidden />
        <View style={styles.loadingContent}>
          <View style={styles.loadingAnimation}>
            <ActivityIndicator size="large" color="#00D9FF" />
          </View>
          <Text style={styles.loadingTitle}>Joining live stream...</Text>
          <Text style={styles.loadingSubtitle}>Connecting you to the broadcast</Text>
        </View>
      </View>
    );
  }

  // While checking kick status, show nothing (or a minimal loading state)
  if (isCheckingKick && !isKicked) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar hidden />
      </View>
    );
  }

  // Safety check: Don't render main content if currentStream is null
  if (!currentStream) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar hidden />
        <View style={styles.loadingContent}>
          <View style={styles.loadingAnimation}>
            <ActivityIndicator size="large" color="#00D9FF" />
          </View>
          <Text style={styles.loadingTitle}>Joining live stream...</Text>
          <Text style={styles.loadingSubtitle}>Connecting you to the broadcast</Text>
        </View>
      </View>
    );
  }

  // Get broadcaster's video - use stored broadcaster_uid or fallback to first remote UID
  // Always use the stored broadcaster_uid (1000) for consistency
  // The broadcaster always joins with UID 1000, so we should look for that specific UID
  // Note: broadcasterUid, isMusicMode, and broadcasterVideoState are already computed above before early returns
  const hasRemoteUsers = streamRemoteUids.length > 0;
  
  // Check if the broadcaster (UID 1000) is actually in the remote users list
  // Also consider broadcaster present if we have a current stream and are joined as viewer OR guest
  // IMPORTANT: When remounting, we should show the video even if remoteUids haven't populated yet
  // The broadcaster is always UID 1000, so we can safely render it if we're joined and stream is live
  // CRITICAL: For guests, also consider broadcaster present if stream is live (they should see host)
  // CRITICAL: If joined as viewer and stream is live, ALWAYS consider broadcaster present
  // This prevents dark screen when remoteUids list is empty or hasn't populated yet
  // CRITICAL: Always consider broadcaster present if joined as viewer and stream is live
  // This is the primary check - streamRemoteUids is secondary (may be empty due to timing)
  const broadcasterIsPresent = 
    (isJoinedAsViewer && currentStream?.is_live && broadcasterUid) ||
    (isGuest && currentStream?.is_live && broadcasterUid) ||
    streamRemoteUids.includes(broadcasterUid);
  
  // Check if broadcaster video is enabled (broadcasterVideoState already computed above before early returns)
  // Only show animation if we explicitly know video is disabled (false)
  // Default to showing video (true) if state is unknown - this means video is likely enabled
  // CRITICAL: If we're joined as viewer and stream is live, assume video is enabled
  // This prevents dark screen when video state hasn't been set yet
  
  // Always assume video is enabled if joined as viewer and stream is live (not music mode)
  // This prevents dark screen - video state will update when events fire
  const isBroadcasterVideoEnabled = 
    (isJoinedAsViewer && currentStream?.is_live && !isMusicMode) ||
    broadcasterVideoState === true ||
    broadcasterVideoState === undefined; // undefined means not set yet, assume enabled
  
  // Debug logging disabled in production to reduce bundle size and improve performance
  if (__DEV__ && false) { // Set to true for debugging
    log('📹 [VIEWER] Video rendering check:', {
      broadcasterUid,
      isJoinedAsViewer,
      currentStreamIsLive: currentStream?.is_live,
      currentStreamId: currentStream?.id,
      musicMode: currentStream?.music_mode,
      broadcasterIsPresent,
      isBroadcasterVideoEnabled,
      streamRemoteUids: streamRemoteUids.length,
      broadcasterInRemoteUids: streamRemoteUids.includes(broadcasterUid),
      willRenderVideo: ((broadcasterIsPresent && broadcasterUid) || (isJoinedAsViewer && currentStream?.is_live && broadcasterUid)) && !currentStream?.music_mode,
    });
  }
  
  const hasGuests = allActiveGuests.length > 0;
  

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Video Stream */}
      <TouchableOpacity 
        style={styles.videoContainer} 
        onPress={(event) => handleScreenTap(event)}
        activeOpacity={1}
      >
        {(hasGuests || isGuest) && broadcasterIsPresent ? (
          // Multi-guest layout when there are active guests OR when current user is a guest
          // IMPORTANT: Guest view uses same layout as streamer for consistent experience
          <MultiGuestVideoLayout
            hostUid={broadcasterUid}
            hostUserId={currentStream?.streamer_id || ''}
            hostUsername={currentStream?.streamer_name || 'Host'}
            hostAvatarUrl={currentStream?.streamer_avatar}
            hostAudioEnabled={true}
            hostVideoEnabled={isBroadcasterVideoEnabled}
            guests={allActiveGuests}
            activeGuests={allActiveGuests.map(guest => {
              // CRITICAL: For current user's own guest video, use local state (actual Agora publishing state)
              // For other guests, use database state
              const isCurrentUserGuest = guest.user_id === user?.id;
              return {
                uid: guest.agora_uid || 2001,
                userId: guest.user_id,
                username: guest.profile?.username || 'Guest',
                avatarUrl: guest.profile?.avatar_url,
                // Use local state for current user (reflects actual Agora state), database for others
                audioEnabled: isCurrentUserGuest ? isGuestAudioEnabled : (guest.audio_enabled ?? false),
                videoEnabled: isCurrentUserGuest ? isGuestVideoEnabled : (guest.video_enabled ?? true),
                isHost: false,
              };
            })}
            isStreamer={false} // Must be false for guests so host video uses remote UID, not local preview
            activeSpeakerUid={undefined}
            currentUserId={user?.id}
            streamId={currentStream?.id || streamId}
            onSwitchCamera={switchGuestCamera}
          />
        ) : (isJoinedAsViewer && currentStream?.is_live && broadcasterUid && !isMusicMode) ? (
          // Single broadcaster view with fallback UI (no black screen)
          <View style={styles.videoSurface}>
            {/* Video surface - hidden if subscription failed */}
            {!videoSubscriptionFailed && (
              <RtcSurfaceView
                key={`video-${broadcasterUid}-${isJoinedAsViewer}`}
                canvas={{
                  uid: broadcasterUid,
                  renderMode: 1,
                  mirrorMode: 0,
                }}
                style={StyleSheet.absoluteFill}
                zOrderMediaOverlay={false}
              />
            )}
            {/* Fallback UI when video fails or network is poor (YouTube/Twitch style) */}
            {(videoSubscriptionFailed || (!videoFirstFrameReceived && broadcasterVideoState !== true)) && (
              <LiveStreamVideoFallback
                networkQuality={networkQuality?.[broadcasterUid]?.rxQuality || 0}
                videoEnabled={broadcasterVideoState === true}
                audioPlaying={isJoinedAsViewer}
                streamerAvatarUrl={currentStream?.streamer?.avatar_url}
                streamerUsername={currentStream?.streamer?.username}
                streamEnded={connectionState === 'DISCONNECTED' || connectionState === 'FAILED'}
                message={
                  connectionState === 'DISCONNECTED' || connectionState === 'FAILED'
                    ? 'Stream ended\nThe host has ended the livestream.'
                    : videoSubscriptionFailed
                    ? 'Video unavailable due to poor connection\nAudio is still playing'
                    : networkQuality?.[broadcasterUid]?.rxQuality <= 2
                    ? 'Poor connection detected\nSwitching to lower quality...'
                    : 'Waiting for video stream...'
                }
              />
            )}
          </View>
        ) : (isJoinedAsViewer && currentStream?.is_live && broadcasterUid && isMusicMode) ? (
          <View style={styles.videoSurface}>
            <MusicModeAnimation style={StyleSheet.absoluteFill} />
          </View>
        ) : isJoinedAsViewer && currentStream?.is_live && broadcasterUid && showGuestJoinOverlay ? (
          // Show streamer video even when guest is joining/waiting (overlay will be on top)
          <>
            {(() => {
              // 🚀 CRITICAL FIX: Check music_mode properly (handle undefined/null as false)
              const isMusicModeCheck = currentStream?.music_mode === true; // Explicitly check for true
              log('🎵 [MUSIC_MODE] Checking music mode (guest joining):', {
                streamId: currentStream?.id,
                music_mode: currentStream?.music_mode,
                isMusicMode: isMusicModeCheck,
                isBroadcasterVideoEnabled,
              });
              
              // Show music mode animation when music mode is explicitly enabled
              if (isMusicModeCheck) {
                return (
                  <View style={styles.videoSurface}>
                    <MusicModeAnimation style={StyleSheet.absoluteFill} />
                  </View>
                );
              }
              
              return isBroadcasterVideoEnabled ? (
                <RtcSurfaceView
                  key={`video-${broadcasterUid}-guest-joining`}
                  canvas={{
                    uid: broadcasterUid,
                    renderMode: 1, // Fit mode
                    mirrorMode: 0, // No mirror for remote video
                  }}
                  style={styles.videoSurface}
                  zOrderMediaOverlay={false}
                />
              ) : (
                <RelaxingAudioAnimation style={styles.videoSurface} />
              );
            })()}
          </>
        ) : (
          <View style={styles.videoPlaceholder}>
            <Eye size={48} color="#FFFFFF" />
            <Text style={styles.videoPlaceholderText}>
              {isJoinedAsViewer 
                ? 'Waiting for broadcaster video...' 
                : 'Connecting to stream...'
              }
            </Text>
            {isJoinedAsViewer && (
              <Text style={[styles.videoPlaceholderText, { fontSize: 12, opacity: 0.7 }]}>
                {broadcasterUid 
                  ? 'Connecting to stream...' 
                  : 'Preparing connection...'}
                {hasRemoteUsers && !broadcasterIsPresent && ' (Other viewers connected)'}
              </Text>
            )}
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
            <Eye size={12} color="rgba(255, 255, 255, 0.9)" />
            {viewerCount > 0 && (
              <Text style={styles.viewerCountButtonText}>
                {formatViewerCount(viewerCount || 0)}
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

      {/* Streamer Avatar - Top Left - Hide in clear screen mode */}
      {currentStream && !isClearScreenMode && (
        <View style={[styles.streamerAvatarContainer, { top: Math.max(insets.top, 8) + 4 }]}>
          <TouchableOpacity 
            onPress={() => setShowStreamerProfile(true)}
            activeOpacity={0.8}
            style={{ position: 'relative' }}
          >
            <Image
              source={{ 
                uri: currentStream.streamer_avatar || 'https://via.placeholder.com/40x40.png?text=U'
              }}
              style={styles.streamerAvatar}
              contentFit="cover"
            />
            {/* 18+ Badge */}
            {currentStream.adult_content && (
              <View style={styles.streamerAdultBadge}>
                <Text style={styles.streamerAdultBadgeText}>18+</Text>
              </View>
            )}
          </TouchableOpacity>
        
        {/* Network Quality Indicator - Only show when quality is poor, icon only */}
        {networkQuality && (networkQuality[0] || networkQuality[user?.id ? parseInt(user.id.slice(0, 8), 16) % 1000000 : 0]) && (() => {
          const quality = networkQuality[0]?.rxQuality || networkQuality[user?.id ? parseInt(user.id.slice(0, 8), 16) % 1000000 : 0]?.rxQuality || 0;
          // Only show if quality is poor (<= 2) to avoid clutter
          if (quality > 2) return null;
          return (
            <View style={{ marginLeft: 8, alignItems: 'center' }}>
              <NetworkQualityIndicator
                quality={quality}
                isLocal={true}
                size="small"
                showText={false}
              />
              {/* Connection State Indicator - Below Network Quality Icon */}
              {connectionState !== 'CONNECTED' && connectionState !== 'DISCONNECTED' && !dismissConnectionMessage && (
                <View style={styles.connectionStateIndicatorBelow}>
                  <Text style={styles.connectionStateTextBelow} numberOfLines={1}>
                    {connectionState === 'RECONNECTING' ? 'Reconnecting...' : 
                     connectionState === 'CONNECTING' ? 'Connecting...' : 
                     connectionState === 'FAILED' ? 'Connection unstable' : connectionState}
                  </Text>
                  <TouchableOpacity 
                    onPress={() => setDismissConnectionMessage(true)}
                    style={styles.dismissConnectionButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={10} color="#FFD60A" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })()}
        
        {/* Fallback: Show connection state if network quality indicator is not shown */}
        {(!networkQuality || !networkQuality[0] && !networkQuality[user?.id ? parseInt(user.id.slice(0, 8), 16) % 1000000 : 0]) && 
         connectionState !== 'CONNECTED' && connectionState !== 'DISCONNECTED' && !dismissConnectionMessage && (
          <View style={styles.connectionStateIndicatorBelow}>
            <Text style={styles.connectionStateTextBelow} numberOfLines={1}>
              {connectionState === 'RECONNECTING' ? 'Reconnecting...' : 
               connectionState === 'CONNECTING' ? 'Connecting...' : 
               connectionState === 'FAILED' ? 'Connection unstable' : connectionState}
            </Text>
            <TouchableOpacity 
              onPress={() => setDismissConnectionMessage(true)}
              style={styles.dismissConnectionButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={10} color="#FFD60A" />
            </TouchableOpacity>
          </View>
        )}
        
        {/* Eye Icon Button - Separate from name, opens viewer list */}
        <TouchableOpacity 
          style={styles.viewerCountButton}
          onPress={() => setShowViewerList(v => !v)}
          onLongPress={() => setIsClearScreenMode(true)}
          activeOpacity={0.7}
        >
          <Eye size={12} color="rgba(255, 255, 255, 0.9)" />
          <Text style={styles.viewerCountButtonText}>
            {formatViewerCount(viewerCount || 0)}
          </Text>
        </TouchableOpacity>
        
        {/* Clear Screen Toggle Button */}
        <TouchableOpacity 
          style={styles.clearScreenButton}
          onPress={() => setIsClearScreenMode(true)}
          activeOpacity={0.7}
        >
          <Minimize2 size={14} color="#FFFFFF" />
        </TouchableOpacity>
        
        {/* Gift Icon Button - Next to Streamer Name */}
        <RecentGifters
          streamId={currentStream.id}
          isStreamer={false}
          position="header"
        />
        
        {/* Join Request Status Badge - Show when request is pending */}
        {joinRequestSent && 
         !isGuest && 
         currentStream?.allow_guests === true && 
         !currentStream?.music_mode && (
          <View style={styles.joinRequestStatusBadge}>
            <Clock size={12} color="#FFD700" strokeWidth={2.5} />
            <Text style={styles.joinRequestStatusText}>Pending</Text>
          </View>
        )}
        </View>
      )}

      {/* Action Buttons - Vertical Stack on Right (Compact when guests present) - Hide in clear screen mode */}
      {!isClearScreenMode && (
      <View style={[
        styles.viewerActions, 
        { top: Math.max(insets.top, 8) + 4 },
        allActiveGuests.length > 0 && styles.viewerActionsCompact
      ]}>
        {/* Close Button */}
        <TouchableOpacity 
          style={[
            styles.actionButton,
            allActiveGuests.length > 0 && styles.actionButtonCompact
          ]} 
          onPress={handleClose}
          activeOpacity={0.8}
        >
          <X size={allActiveGuests.length > 0 ? 16 : 18} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>

        {/* Admin: End stream - only when isAdmin and onAdminCloseStream provided */}
        {isAdmin && onAdminCloseStream && (currentStream?.id ?? streamId) && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.adminEndStreamButton,
              allActiveGuests.length > 0 && styles.actionButtonCompact
            ]}
            onPress={() => {
              const id = currentStream?.id ?? streamId;
              Alert.alert(
                'End stream',
                'End this livestream for everyone? The host and all viewers will be disconnected.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'End stream',
                    style: 'destructive',
                    onPress: async () => {
                      await onAdminCloseStream(id);
                      onClose();
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.8}
          >
            <Video size={allActiveGuests.length > 0 ? 14 : 16} color="#FF6B6B" strokeWidth={2.5} />
          </TouchableOpacity>
        )}

        {/* Leave Guest Button - Only show when user is a guest */}
        {isGuest && (
          <TouchableOpacity 
            style={[
              styles.actionButton,
              styles.leaveGuestButton,
              allActiveGuests.length > 0 && styles.actionButtonCompact
            ]} 
            onPress={async () => {
              Alert.alert(
                'Leave Co-host',
                'Are you sure you want to leave as a co-host?',
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                  },
                  {
                    text: 'Leave',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        log('👋 [GUEST] User initiated leave guest mode');
                        
                        // Step 1: Leave guest mode in Agora first (clean up Agora resources)
                        log('👋 [GUEST] Step 1: Leaving Agora guest mode...');
                        const success = await leaveGuestMode();
                        
                        if (!success) {
                          error('⚠️ [GUEST] Failed to leave Agora guest mode');
                          Alert.alert('Error', 'Failed to leave co-host mode. Please try again.');
                          return;
                        }
                        
                        // Step 2: Remove guest from database FIRST (before UI update) to prevent race conditions
                        log('👋 [GUEST] Step 2: Removing guest from database...');
                        if (currentStream?.id && user?.id) {
                          try {
                            const { removeGuestFromStream } = await import('../utils/guestService');
                            const removeResult = await removeGuestFromStream(currentStream.id, user.id);
                            if (!removeResult.success) {
                              error('⚠️ [GUEST] Failed to remove guest from database:', removeResult.error);
                              // Continue anyway - Agora cleanup is more important
                            } else {
                              log('✅ [GUEST] Guest removed from database');
                            }
                          } catch (dbError) {
                            error('⚠️ [GUEST] Database removal error (non-critical):', dbError);
                            // Continue anyway - Agora cleanup is more important
                          }
                        }
                        
                        // Step 3: Update local state immediately (UI feedback)
                        log('👋 [GUEST] Step 3: Updating local state...');
                        setIsGuest(false);
                        setGuestAgoraUid(null);
                        setIsGuestVideoEnabled(false);
                        setIsGuestAudioEnabled(false);
                        setJoinRequestSent(false); // Reset join request state so user can request again
                        
                        log('✅ [GUEST] Successfully left guest mode - all cleanup complete');
                        
                        // Show success feedback
                        Toast.show({
                          type: 'success',
                          text1: 'Left Co-host',
                          text2: 'You are now viewing as an audience member',
                          visibilityTime: 2000,
                        });
                      } catch (error) {
                        error('❌ [GUEST] Error leaving guest mode:', error);
                        
                        // Try to recover state even on error
                        setIsGuest(false);
                        setGuestAgoraUid(null);
                        setIsGuestVideoEnabled(false);
                        setIsGuestAudioEnabled(false);
                        setJoinRequestSent(false); // Reset join request state so user can request again
                        
                        Alert.alert(
                          'Error', 
                          'There was an issue leaving co-host mode. You may need to refresh the stream.',
                          [{ text: 'OK' }]
                        );
                      }
                    },
                  },
                ],
                { cancelable: true }
              );
            }}
            activeOpacity={0.8}
          >
            <X size={allActiveGuests.length > 0 ? 16 : 18} color="#FF6B6B" strokeWidth={2.5} />
          </TouchableOpacity>
        )}

        {/* Join Request Button - Redesigned */}
        {!isGuest && 
         currentStream?.allow_guests === true && 
         !currentStream?.music_mode && 
         allActiveGuests.length === 0 && (
          <TouchableOpacity 
            style={[
              styles.actionButton,
              styles.joinRequestButton,
              allActiveGuests.length > 0 && styles.actionButtonCompact,
              joinRequestSent && styles.joinRequestSentButton,
              sendingRequest && styles.joinRequestButtonLoading
            ]} 
            onPress={() => {
              log('🎯 [VIEWER] Join request button pressed:', {
                joinRequestSent,
                sendingRequest,
                allowGuests: currentStream?.allow_guests,
                disabled: joinRequestSent || sendingRequest
              });
              handleSendJoinRequest();
            }}
            activeOpacity={0.8}
            disabled={joinRequestSent || sendingRequest}
          >
            {sendingRequest ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : joinRequestSent ? (
              <Check size={allActiveGuests.length > 0 ? 16 : 18} color="#4CD964" strokeWidth={2.5} />
            ) : (
              <UserPlus size={allActiveGuests.length > 0 ? 16 : 18} color="#FFFFFF" strokeWidth={2.5} />
            )}
          </TouchableOpacity>
        )}
      </View>
      )}

      {/* Live Comments - Same positioning as broadcaster screen */}
      <View style={[
        styles.commentsContainer,
        {
          bottom: getLivestreamCommentsBottomOffset(insets.bottom),
          height: LIVESTREAM_OVERLAY_COMMENTS_HEIGHT,
          right: LIVESTREAM_OVERLAY_COMMENTS_RIGHT_INSET,
          ...(keyboardHeight > 0
            ? {
                bottom: keyboardHeight + 80,
                opacity: 0.35,
              }
            : {}),
        }
      ]} pointerEvents="box-none" collapsable={false}>
        <LiveComments
          key={currentStream?.id || streamId}
          streamId={currentStream?.id || streamId}
          isStreamer={user?.id === currentStream?.streamer_id}
          overlayCompact
          showInput={false}
          onReplyToComment={handleReplyToComment}
          onInviteUser={handleInviteUserFromComment}
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
                      const success = await warnUser(currentStream?.id || streamId, userId, user.id, reason || undefined);
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
            log('[VIEWER] Kick button pressed:', { userId, userName, streamId: currentStream?.id || streamId, currentUserId: user?.id });
            
            if (!user?.id) {
              Alert.alert('Error', 'You must be logged in to kick users');
              return;
            }
            
            const streamIdToUse = currentStream?.id || streamId;
            if (!streamIdToUse) {
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
                    log('[VIEWER] Executing kick:', { 
                      streamId: streamIdToUse, 
                      userId, 
                      kickedBy: user.id
                    });
                    
                    try {
                      const success = await kickUser(streamIdToUse, userId, user.id);
                      log('[VIEWER] Kick result:', success);
                      
                      if (success) {
                        Alert.alert('Success', `${userName} has been kicked from the stream`);
                      } else {
                        Alert.alert('Error', 'Failed to kick user. You may not have permission or the user may already be kicked.');
                      }
                    } catch (error: any) {
                      error('[VIEWER] Kick error:', error);
                      Alert.alert('Error', error.message || 'Failed to kick user');
                    }
                  },
                },
              ]
            );
          }}
          canModerate={canModerateStream}
        />
      </View>


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
        <View style={styles.bottomBarContent}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.messageInput}
              placeholder={replyingToComment ? `Replying to ${replyingToComment.userName}...` : "Add a comment..."}
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              value={commentText}
              onChangeText={setCommentText}
              onFocus={() => setIsCommentFocused(true)}
              onBlur={() => setIsCommentFocused(false)}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={async () => {
                if (commentText.trim()) {
                  // Don't remove @username - sendComment will handle it
                  await sendComment(commentText.trim());
                  setCommentText('');
                  Keyboard.dismiss();
                  setIsCommentFocused(false);
                }
              }}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {replyingToComment && (
              <TouchableOpacity
                style={{ marginLeft: 8 }}
                onPress={() => {
                  setReplyingToComment(null);
                  setCommentText(''); // Clear the @username prefix when canceling reply
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={14} color="rgba(255, 255, 255, 0.7)" />
              </TouchableOpacity>
            )}
              {commentText.trim() && (
              <TouchableOpacity 
                style={styles.sendButton}
                onPress={async () => {
                  if (commentText.trim() && !isSendingComment) {
                    // Don't remove @username - sendComment will handle it
                    await sendComment(commentText.trim());
                    setCommentText('');
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
          
            
            {/* Gift Button - Enabled for both regular video streams and audio-only/music mode streams */}
            <TouchableOpacity 
              style={styles.giftButton}
              onPress={() => {
                // Gift sending is always allowed for both regular streams and audio-only/music mode streams
                setShowGiftModal(true);
              }}
              activeOpacity={0.8}
              disabled={false} // Always enabled for both regular and audio streams
            >
              <Gift size={16} color="#FFFFFF" strokeWidth={1.5} />
            </TouchableOpacity>
            
            {/* Song Request Button - Only show when music mode is enabled */}
            {currentStream?.music_mode && (
              <TouchableOpacity 
                style={styles.songRequestButton}
                onPress={() => setShowSongRequestModal(true)}
                activeOpacity={0.8}
              >
                <Music size={16} color="#FFFFFF" strokeWidth={1.5} />
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.heartButton}
              onPress={(event) => {
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

      {/* Floating Reactions - Visible to all viewers */}
      <FloatingReactions 
        ref={floatingReactionsRef}
        streamId={currentStream?.id || streamId}
        onReactionSend={(reaction) => { if (__DEV__) log('Viewer sent reaction:', reaction); }}
      />

      {/* Viewer List Modal */}
      {showViewerList && (
        <ViewerListModal
          visible={showViewerList}
          onClose={() => setShowViewerList(false)}
          streamId={currentStream?.id || streamId}
          viewerCount={viewerCount}
          onUserKicked={(userId) => {
            // Refresh viewer list after kick
            setShowViewerList(false);
            setTimeout(() => setShowViewerList(true), 500);
          }}
        />
      )}

      {/* Streamer Profile Modal */}
      {showStreamerProfile && (
        <View style={styles.streamerProfileModal}>
          <TouchableOpacity 
            style={styles.streamerProfileBackdrop}
            activeOpacity={1}
            onPress={() => setShowStreamerProfile(false)}
          />
          <View style={styles.streamerProfileContent}>
            {currentStream && (
              <>
                <Image
                  source={{ 
                    uri: currentStream.streamer_avatar || 'https://via.placeholder.com/100x100.png?text=U'
                  }}
                  style={styles.streamerProfileAvatar}
                  contentFit="cover"
                />
                <Text style={styles.streamerProfileName}>
                  {currentStream.streamer_name}
                </Text>
              </>
            )}
            <View style={styles.streamerProfileActions}>
              {/* Follow Button */}
              <TouchableOpacity 
                style={[
                  styles.streamerProfileButton,
                  isFollowingUser && styles.streamerProfileButtonFollowing
                ]}
                onPress={() => {
                  toggleFollow();
                  setShowStreamerProfile(false);
                }}
                disabled={followLoading}
                activeOpacity={0.8}
              >
                {followLoading ? (
                  <Text style={styles.streamerProfileButtonText}>...</Text>
                ) : isFollowingUser ? (
                  <>
                    <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.streamerProfileButtonText}>Following</Text>
                  </>
                ) : (
                  <>
                    <UserPlus size={16} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.streamerProfileButtonText}>Follow</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Join Request Button in Profile Modal */}
              {currentStream?.allow_guests === true && 
               !currentStream?.music_mode && 
               !isGuest && 
               allActiveGuests.length === 0 && (
                <TouchableOpacity 
                  style={[
                    styles.streamerProfileButton,
                    styles.streamerProfileButtonJoin,
                    joinRequestSent && styles.streamerProfileButtonJoinSent,
                    sendingRequest && styles.streamerProfileButtonJoinLoading
                  ]}
                  onPress={() => {
                    handleSendJoinRequest();
                    setShowStreamerProfile(false);
                  }}
                  disabled={joinRequestSent || sendingRequest}
                  activeOpacity={0.8}
                >
                {sendingRequest ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.streamerProfileButtonText}>Sending...</Text>
                  </>
                ) : joinRequestSent ? (
                  <>
                    <Check size={16} color="rgba(76, 217, 100, 1)" strokeWidth={2.5} />
                    <Text style={[styles.streamerProfileButtonText, { color: 'rgba(76, 217, 100, 1)' }]}>Request Sent</Text>
                  </>
                ) : (
                  <>
                    <UserPlus size={16} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.streamerProfileButtonText}>Request to Join</Text>
                  </>
                )}
              </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity 
              style={styles.streamerProfileClose}
              onPress={() => setShowStreamerProfile(false)}
            >
              <X size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Guest Join Loading Overlay */}
      <GuestJoinLoadingOverlay
        visible={showGuestJoinOverlay}
        stage={guestJoinStage}
        errorMessage={guestJoinError || undefined}
        progress={guestJoinProgress}
        countdown={guestJoinCountdown}
      />

      {/* Viewer Join Announcement */}
      <ViewerJoinAnnouncement
        visible={joinAnnouncement.visible}
        username={joinAnnouncement.username}
        fullName={joinAnnouncement.fullName}
        avatarUrl={joinAnnouncement.avatarUrl}
        onDismiss={() => setJoinAnnouncement(prev => ({ ...prev, visible: false }))}
      />

      {/* Gift Modal */}
      {showGiftModal && (
        <GiftModal
          visible={showGiftModal}
          onClose={() => setShowGiftModal(false)}
          onSendGift={handleSendGift}
          recipientName={currentStream?.streamer_name || 'Streamer'}
        />
      )}

      {/* Song Request Modal */}
      <Modal
        visible={showSongRequestModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSongRequestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.songRequestModal,
              { backgroundColor: themeColors.neutral.background },
              {
                transform: [
                  { translateX: songRequestModalPosition.x },
                  { translateY: songRequestModalPosition.y },
                ],
              },
            ]}
          >
            <View
              style={styles.songRequestModalHeader}
              {...songRequestModalPanResponder.panHandlers}
            >
              <Text style={[styles.songRequestModalTitle, { color: themeColors.textLight }]}>
                🎵 Request a Song
              </Text>
              <TouchableOpacity
                onPress={() => setShowSongRequestModal(false)}
                style={styles.songRequestModalClose}
              >
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.songRequestModalContent}>
              <Text style={[styles.songRequestModalDescription, { color: themeColors.textSecondary }]}>
                Request a song for the streamer to play. Be specific with artist and song name!
              </Text>
              
              {/* Copyright Disclaimer */}
              <Text style={[styles.copyrightDisclaimerText, { color: themeColors.textSecondary }]}>
                ⚠️ Copyright Notice: Playing copyrighted music may violate copyright laws. Streamers are responsible for ensuring they have proper licenses or permissions to play requested songs.
              </Text>
              
              <TextInput
                style={[
                  styles.songRequestInput,
                  {
                    backgroundColor: themeColors.neutral.surface,
                    color: themeColors.textLight,
                    borderColor: themeColors.neutral.border,
                  }
                ]}
                placeholder="e.g., Artist - Song Name"
                placeholderTextColor={themeColors.textSecondary}
                value={songRequestText}
                onChangeText={setSongRequestText}
                maxLength={100}
                multiline={false}
                autoFocus={true}
              />
              
              <TouchableOpacity
                style={[
                  styles.songRequestSubmitButton,
                  {
                    backgroundColor: isSendingSongRequest || !songRequestText.trim() 
                      ? themeColors.neutral.disabled 
                      : themeColors.primary.main
                  }
                ]}
                onPress={async () => {
                  if (!songRequestText.trim() || isSendingSongRequest) {
                    log('🎵 [SONG_REQUEST] Button press blocked:', {
                      hasText: !!songRequestText.trim(),
                      isSending: isSendingSongRequest,
                    });
                    return;
                  }
                  
                  log('🎵 [SONG_REQUEST] Sending song request:', {
                    text: songRequestText.trim(),
                    streamId: currentStream?.id,
                    hasCurrentStream: !!currentStream,
                  });
                  
                  setIsSendingSongRequest(true);
                  try {
                    // Send song request as a comment with special prefix
                    const requestMessage = `🎵 Song Request: ${songRequestText.trim()}`;
                    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
                    
                    if (authError) {
                      error('🎵 [SONG_REQUEST] Auth error:', authError);
                      Toast.show({
                        type: 'error',
                        text1: 'Authentication Error',
                        text2: 'Please log in to send song requests',
                      });
                      setIsSendingSongRequest(false);
                      return;
                    }
                    
                    if (!currentUser) {
                      error('🎵 [SONG_REQUEST] No user found');
                      Toast.show({
                        type: 'error',
                        text1: 'Not Logged In',
                        text2: 'Please log in to send song requests',
                      });
                      setIsSendingSongRequest(false);
                      return;
                    }
                    
                    if (!currentStream?.id) {
                      error('🎵 [SONG_REQUEST] No stream ID found');
                      Toast.show({
                        type: 'error',
                        text1: 'Stream Error',
                        text2: 'Stream not found. Please try again.',
                      });
                      setIsSendingSongRequest(false);
                      return;
                    }
                    
                    log('🎵 [SONG_REQUEST] Inserting comment:', {
                      stream_id: currentStream.id,
                      user_id: currentUser.id,
                      message: requestMessage,
                    });
                    
                    const { data, error } = await supabase
                      .from('live_stream_comments')
                      .insert({
                        stream_id: currentStream.id,
                        user_id: currentUser.id,
                        message: requestMessage,
                      })
                      .select();
                    
                    if (error) {
                      error('🎵 [SONG_REQUEST] Database error:', error);
                      Toast.show({
                        type: 'error',
                        text1: 'Failed to send request',
                        text2: error.message || 'Please try again',
                      });
                    } else {
                      log('🎵 [SONG_REQUEST] Success! Comment inserted:', data);
                      Toast.show({
                        type: 'success',
                        text1: 'Song Request Sent!',
                        text2: 'Your request has been sent to the streamer',
                      });
                      setSongRequestText('');
                      setShowSongRequestModal(false);
                    }
                  } catch (error: any) {
                    error('🎵 [SONG_REQUEST] Exception:', error);
                    Toast.show({
                      type: 'error',
                      text1: 'Error',
                      text2: error?.message || 'Failed to send song request. Please try again.',
                    });
                  } finally {
                    setIsSendingSongRequest(false);
                  }
                }}
                disabled={isSendingSongRequest || !songRequestText.trim()}
                activeOpacity={0.8}
              >
                <Text style={styles.songRequestSubmitText}>
                  {isSendingSongRequest ? 'Sending...' : 'Send Request'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

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

      {/* Guest Invitation Notification - Show when invitation matches current stream */}
      {pendingInvitation && (
        (() => {
          const invitationStreamId = pendingInvitation.stream_id;
          const currentStreamId = currentStream?.id || streamId;
          const shouldShow = invitationStreamId === currentStreamId;
          
          // Debug log to help diagnose
          if (pendingInvitation) {
            log('🎫 [VIEWER] Invitation check:', {
              hasInvitation: !!pendingInvitation,
              invitationStreamId,
              currentStreamId,
              shouldShow,
              invitationStatus: pendingInvitation.status
            });
          }
          
          return shouldShow ? (
            <GuestInvitationNotification
              invitation={pendingInvitation}
              onAccept={async () => {
                await handleAcceptInvitation();
                // After accepting, switch to guest mode if we're on the same stream
                if (currentStreamId === invitationStreamId) {
                  // Ensure their own tile shows camera/mic immediately (avoid avatar state)
                  setIsGuestVideoEnabled(true);
                  setIsGuestAudioEnabled(true);
                  const success = await switchToGuestMode();
                  if (success) {
                    setIsGuest(true);
                  }
                }
              }}
              onDecline={handleDeclineInvitation}
              onExpire={handleInvitationExpire}
            />
          ) : null;
        })()
      )}

      {/* Kicked From Stream Modal */}
      <KickedFromStreamModal
        visible={showKickModal}
        reason={kickReason || undefined}
        onClose={() => {
          setShowKickModal(false);
          setIsKicked(false);
          setKickReason(null);
          // Navigate to create live stream screen
          router.replace('/live');
        }}
      />
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
  },
  videoSurface: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  videoPlaceholderText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
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
  // Streamer avatar container - top left (tappable to show profile)
  streamerAvatarContainer: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
  },
  streamerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  streamerAdultBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 10,
  },
  streamerAdultBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  streamerDetails: {
    justifyContent: 'center',
    gap: 2,
    flexShrink: 1,
    minWidth: 0, // Allow text to shrink properly
  },
  streamerHandle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  adultBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  adultBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  connectionStateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 214, 10, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  connectionStateText: {
    color: '#FFD60A',
    fontSize: 10,
    fontWeight: '600',
  },
  connectionStateIndicatorBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 214, 10, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
    maxWidth: 120,
    gap: 4,
  },
  connectionStateTextBelow: {
    color: '#FFD60A',
    fontSize: 9,
    fontWeight: '600',
    flex: 1,
  },
  dismissConnectionButton: {
    padding: 2,
  },
  viewerCountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginLeft: 8,
  },
  viewerCountButtonText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  // Vertical action buttons - right side
  viewerActions: {
    position: 'absolute',
    right: 12,
    flexDirection: 'column',
    gap: 10,
    zIndex: 100,
  },
  viewerActionsCompact: {
    gap: 8,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  actionButtonCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  followingActionButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.7)',
  },
  joinRequestSentButton: {
    backgroundColor: 'rgba(76, 217, 100, 0.7)',
  },
  commentsContainer: {
    position: 'absolute',
    left: 8,
    // bottom, height, right set in component (shared tabBarInset layout)
    zIndex: 400,
    elevation: 16,
    pointerEvents: 'box-none',
    overflow: 'hidden',
  },
  leaveGuestButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.5)',
  },
  adminEndStreamButton: {
    backgroundColor: 'rgba(200, 60, 60, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 100, 100, 0.6)',
  },
  joinRequestStatusIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(76, 217, 100, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  joinRequestButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  joinRequestButtonLoading: {
    backgroundColor: 'rgba(0, 122, 255, 0.5)',
    opacity: 0.7,
  },
  joinRequestStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  joinRequestStatusText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  streamerProfileButtonJoinLoading: {
    opacity: 0.7,
    backgroundColor: 'rgba(0, 122, 255, 0.5)',
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
  actionButtonEmoji: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  commentsSection: {
    position: 'absolute',
    bottom: 120, // Moved up to avoid blocking input field
    left: 12,
    right: 100,
    height: 120, // Keep original height
    zIndex: 100, // Lowered from 1000 to avoid blocking modals/drawers
    pointerEvents: 'box-none', // Allow touches to pass through to video
    // No backgroundColor - let it be completely transparent
    overflow: 'visible', // Ensure no clipping creates dark areas
  },
  commentsSectionCompact: {
    height: 90, // Keep original compact height
    bottom: 110, // Moved up accordingly
    // No backgroundColor - let it be completely transparent
    overflow: 'visible', // Ensure no clipping
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
  keyboardAvoidingView: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent', // No background
  },
  // TikTok-style bottom bar - no background, naturally responsive
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
  sendButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  songRequestButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(167, 139, 250, 0.8)', // Purple/music theme
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  songRequestModal: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 0,
    overflow: 'hidden',
  },
  songRequestModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  songRequestModalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  songRequestModalClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  songRequestModalContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  songRequestModalDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  copyrightDisclaimerText: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  songRequestInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 48,
  },
  songRequestSubmitButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  songRequestSubmitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  giftButtonOld: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftEmoji: {
    fontSize: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  heartButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 23, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 23, 68, 0.3)',
  },
  // Minimalistic connecting screen styles
  connectingBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatedRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  animatedRing2: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  animatedRing3: {
    width: 320,
    height: 320,
    borderRadius: 160,
    borderColor: 'rgba(255, 255, 255, 0.02)',
  },
  connectingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  minimalIconContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  innerCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  outerRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderTopColor: '#FFFFFF',
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
  },
  connectingTextContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  connectingTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  connectingSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
    textAlign: 'center',
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  minimalLoader: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  loaderBar: {
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  loaderBar1: {
    height: 12,
  },
  loaderBar2: {
    height: 16,
  },
  loaderBar3: {
    height: 12,
  },
  connectingCancelButton: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(20px)',
  },
  cancelButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  cancelButtonText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  // Streamer Profile Modal
  streamerProfileModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  streamerProfileBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  streamerProfileContent: {
    position: 'absolute',
    top: '30%',
    left: '10%',
    right: '10%',
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  streamerProfileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  streamerProfileName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
  },
  streamerProfileActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  streamerProfileButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 1)',
  },
  streamerProfileButtonFollowing: {
    backgroundColor: 'rgba(76, 217, 100, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(76, 217, 100, 0.5)',
  },
  streamerProfileButtonJoin: {
    backgroundColor: 'rgba(255, 59, 48, 1)',
  },
  streamerProfileButtonJoinSent: {
    backgroundColor: 'rgba(76, 217, 100, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(76, 217, 100, 0.5)',
  },
  streamerProfileButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  streamerProfileClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
