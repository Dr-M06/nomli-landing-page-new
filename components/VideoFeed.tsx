import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  Dimensions,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  StatusBar,
  Alert,
  Share,
  Platform,
  RefreshControl,
  ViewToken,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  ScrollView,
  SafeAreaView,
  Keyboard,
  InteractionManager,
  useWindowDimensions,
} from 'react-native';
import { PanGestureHandler, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Video, ResizeMode, Audio } from 'expo-av';
import { stripAtSymbol } from '../utils/contentFilter';
import { useFocusEffect } from '@react-navigation/native';
import * as SystemUI from 'expo-system-ui';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  withRepeat,
} from 'react-native-reanimated';
import {
  Heart,
  Zap,
  MessageCircle,
  Share as ShareIcon,
  Bookmark,
  VolumeX,
  Volume2,
  ArrowLeft,
  User,
  Send,
  ChevronDown,
  Trash2,
  VideoIcon,
  Edit,
  Check,
  X,
  ChevronUp,
  MoreHorizontal,
  Play,
  Pause,
  UserPlus,
  UserCheck,
} from 'lucide-react-native';
import LikeBurst from './LikeBurst';
import { followUser, unfollowUser, isFollowing } from '../utils/followersServiceFixed';
import { Image } from 'expo-image';
import { formatTimeAgo } from '../utils/formatters';
import Toast from 'react-native-toast-message';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { useVideoContext } from '../contexts/VideoContext';
import { addComment, fetchComments, deleteComment } from '../utils/communityUtils';
import { getVideoContainerStyles } from '../utils/videoSizingUtils';
import VideoLikesList from './VideoLikesList';
import { supabase } from '../utils/supabase';
import { getFloatingTabBarReservedHeight } from '../utils/tabBarInset';
import { reactivateVideoAudioAfterUnmute } from '../utils/expoAvAudioMode';
import PromoBannerComponent from './PromoBanner';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Approximate bottom inset when module loads (per-device value comes from safe area in components).
const DEFAULT_TAB_INSET_BOTTOM = Platform.OS === 'ios' ? 34 : 12;
const TAB_RESERVE_STATIC = getFloatingTabBarReservedHeight(DEFAULT_TAB_INSET_BOTTOM);

// Get the full screen height without any UI elements
const getFullScreenHeight = () => {
  // Account for safe area and header space to prevent huge gaps
  const statusBarHeight = Platform.OS === 'ios' ? 44 : 24; // StatusBar + notch/header
  const headerHeight = 60; // Approximate header height
  return SCREEN_HEIGHT - statusBarHeight - headerHeight - TAB_RESERVE_STATIC;
};

const FULL_VIDEO_HEIGHT = getFullScreenHeight();
/** Full window height for fullscreen modal: one video per screen, scroll up/down for next/prev. */
const FULLSCREEN_VIDEO_HEIGHT = SCREEN_HEIGHT;

export interface VideoPost {
  id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  description: string;
  user: {
    id: string;
    username: string;
    display_name?: string;
    avatar_url?: string;
  };
  likes_count: number;
  comments_count: number;
  views_count?: number; // View count for videos
  bookmarks_count?: number; // Bookmark count (without showing users)
  shares_count?: number;
  is_liked: boolean;
  is_bookmarked?: boolean;
  created_at: string;
  location?: string;
  tags?: string[];
  comments_disabled?: boolean; // Whether comments are locked/disabled
  adult_content?: boolean; // 18+ content (hidden on Videos tab; on Community depends on preference)
  /** Matches posts.boost_expires_at for home-feed ranking */
  boost_expires_at?: string | null;
}

import { PromoBanner } from '../utils/promoBannerUtils';
import { log, warn, error } from '../utils/productionLogger';

/** Total FlatList rows (videos + inserted promo banners). Must match mixedFeed useMemo. */
export function mixedFeedItemCount(
  videosLen: number,
  banners: PromoBanner[] | undefined,
  bannerInterval: number
): number {
  if (!banners?.length || videosLen === 0) return videosLen;
  let extra = 0;
  for (let i = 0; i < videosLen; i++) {
    if ((i + 1) % bannerInterval === 0 && i < videosLen - 1) extra++;
  }
  return videosLen + extra;
}

/** Map a video post id to its FlatList index when banners are interleaved (same rules as mixedFeed). */
export function mixedFeedIndexForVideoId(
  videos: VideoPost[],
  postId: string,
  banners: PromoBanner[] | undefined,
  bannerInterval: number
): number {
  const vIdx = videos.findIndex((v) => v.id === postId);
  if (vIdx < 0) return -1;
  if (!banners?.length) return vIdx;
  let mixedIdx = 0;
  for (let i = 0; i < videos.length; i++) {
    if (i === vIdx) return mixedIdx;
    mixedIdx++;
    if ((i + 1) % bannerInterval === 0 && i < videos.length - 1) {
      mixedIdx++;
    }
  }
  return -1;
}

interface VideoFeedProps {
  videos: VideoPost[];
  onRefresh?: () => void;
  refreshing?: boolean;
  onLoadMore?: () => void;
  onLike?: (postId: string, isLiked: boolean) => void;
  onComment?: (video: VideoPost) => void;
  onShare?: (post: VideoPost) => void;
  onBookmark?: (postId: string, isBookmarked: boolean) => void;
  onVideoFocusChange?: (videoId: string | null) => void;
  onExitFullscreen?: () => void;
  onProfilePress?: (userId: string) => void;
  onDelete?: (postId: string) => void;
  currentUserId?: string;
  /** When provided, scroll to this index on mount (e.g. open fullscreen at current video). */
  initialIndex?: number;
  /** Resume playback from this position (milliseconds) when opening fullscreen on a playing video. */
  initialPosition?: number;
  /** Called when the initial fullscreen video has loaded, seeked to initialPosition, and started playing (so feed can pause). */
  onInitialVideoReady?: () => void;
  /** Use full window height (e.g. in fullscreen modal) so one video fills the screen. */
  fullScreenMode?: boolean;
  /** Override each cell's height (used when UI above the feed consumes space, e.g. Home header/stories). */
  containerHeight?: number;
  /** Promotional banners to display between videos */
  banners?: PromoBanner[];
  /** How often to show a banner (every X videos, default 7) */
  bannerInterval?: number;
}

interface VideoItemProps {
  item: VideoPost;
  index: number;
  isVisible: boolean;
  shouldPlay?: boolean; // If false, video will preload but not play (for adjacent videos)
  isMuted: boolean;
  onToggleMute: () => void;
  onExitFullscreen?: () => void;
  onLike?: (postId: string, isLiked: boolean) => void;
  onComment?: (video: VideoPost) => void;
  onSave?: (postId: string, isBookmarked: boolean) => void;
  onShare?: (post: VideoPost) => void;
  onProfilePress?: (userId: string) => void;
  onDelete?: (postId: string) => void;
  onVideoFocusChange?: (videoId: string | null) => void;
  currentUserId?: string;
  /** Height of each video cell (full window in fullscreen modal). */
  containerHeight?: number;
  /** When true, fullscreen modal – constrain width and use CONTAIN so video never overflows. */
  fullScreenMode?: boolean;
  /** Current window width – use so video never exceeds screen. */
  windowWidth?: number;
  /** Resume playback from this position (milliseconds) when opening fullscreen on a playing video. */
  initialPosition?: number;
  /** Called when this item has loaded, seeked to initialPosition, and started playing (fullscreen handoff). */
  onInitialVideoReady?: () => void;
}

// Format time helper function
const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const VideoItem = memo(function VideoItem({
  item,
  index,
  isVisible,
  shouldPlay = true, // Default to true for backward compatibility
  isMuted,
  onToggleMute,
  onExitFullscreen,
  onLike,
  onComment,
  onSave,
  onShare,
  onProfilePress,
  onDelete,
  onVideoFocusChange,
  currentUserId,
  containerHeight = FULL_VIDEO_HEIGHT,
  fullScreenMode: itemFullScreenMode = false,
  windowWidth: itemWindowWidth,
  initialPosition,
  onInitialVideoReady,
}) {
  const { width: winWidth } = useWindowDimensions();
  const screenWidth = itemWindowWidth ?? winWidth ?? SCREEN_WIDTH;
  
  // Cache-busting: Only for non-Mux videos (Mux CDN handles caching automatically)
  const [cacheBuster, setCacheBuster] = useState(() => Date.now());
  
  // Reset cache-buster when video URL changes (different video = fresh load)
  useEffect(() => {
    setCacheBuster(Date.now());
  }, [item.video_url]);
  
  // Generate video URI: Mux videos use original URL (CDN cached), others get cache-busting
  const videoUri = useMemo(() => {
    if (!item.video_url) return '';
    // Mux videos: Use original URL - Mux CDN handles caching and adaptive streaming
    // Cache-busting prevents CDN caching and slows down loading
    if (item.video_url.includes('stream.mux.com') || item.video_url.includes('.m3u8')) {
      return item.video_url;
    }
    // Non-Mux videos: Add cache-busting parameter
    const separator = item.video_url.includes('?') ? '&' : '?';
    return `${item.video_url}${separator}_nocache=${cacheBuster}`;
  }, [item.video_url, cacheBuster]);
  // Comment overlay state
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showLikesList, setShowLikesList] = useState(false);
  // Safely get theme colors with fallback
  const themeContext = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const isDarkMode = themeContext?.isDarkMode ?? true;
  
  const safeThemeColors = themeContext?.themeColors || {
    surface: '#000000',
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.7)',
    surfaceVariant: 'rgba(255,255,255,0.1)',
    border: 'rgba(255,255,255,0.1)',
    primary: '#007AFF'
  };
  const videoRef = useRef<Video>(null);
  const lastPlaybackRetryTimeRef = useRef<number>(0);
  const playbackRetryCountRef = useRef<number>(0);
  const lastEnsurePlaybackTimeRef = useRef<number>(0);
  const ensurePlaybackCountRef = useRef<number>(0);
  const hasSystemErrorRef = useRef<boolean>(false); // Track if we've hit a system error (e.g. -12860) and should stop retrying
  const lastRateCorrectionRef = useRef<number>(0);
  const isPlayingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // View counting state (batched updates)
  const loopCountRef = useRef(0);
  const [localViewsCount, setLocalViewsCount] = useState(item.views_count || 0);
  const [videoDimensions, setVideoDimensions] = useState({
    width: screenWidth,
    height: containerHeight,
  });
  useEffect(() => {
    setVideoDimensions(prev => ({
      width: screenWidth,
      height: containerHeight,
    }));
  }, [containerHeight, screenWidth]);
  const [showControls, setShowControls] = useState(true);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [sendingComment, setSendingComment] = useState(false);

  // Video control state
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [showDoubleTapHeart, setShowDoubleTapHeart] = useState(false);
  const [lastTapTime, setLastTapTime] = useState(0);
  
  // Video progress state
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPosition, setVideoPosition] = useState(0);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  
  // Follow state
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  
  // Get the video owner ID (could be in user.id or user_id)
  const videoOwnerId = item.user?.id || item.user_id;
  const isOwnContent = currentUserId && videoOwnerId && String(currentUserId) === String(videoOwnerId);
  
  // Check follow status on mount
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (!currentUserId || !videoOwnerId || isOwnContent) return;
      try {
        const following = await isFollowing(videoOwnerId, currentUserId);
        setIsFollowingUser(following);
      } catch (error) {
        warn('[VideoFeed] Error checking follow status:', error);
      }
    };
    checkFollowStatus();
  }, [currentUserId, videoOwnerId, isOwnContent]);
  
  // Handle follow/unfollow
  const handleFollowToggle = async () => {
    if (!currentUserId || !videoOwnerId || isOwnContent) return;
    if (followLoading) return;
    
    setFollowLoading(true);
    try {
      if (isFollowingUser) {
        await unfollowUser(videoOwnerId);
        setIsFollowingUser(false);
        Toast.show({
          type: 'info',
          text1: 'Unfollowed',
          text2: `You unfollowed @${item.user?.username || 'user'}`,
          position: 'bottom',
          visibilityTime: 2000,
        });
      } else {
        await followUser(videoOwnerId);
        setIsFollowingUser(true);
        Toast.show({
          type: 'success',
          text1: 'Following',
          text2: `You're now following @${item.user?.username || 'user'}`,
          position: 'bottom',
          visibilityTime: 2000,
        });
      }
    } catch (error) {
      error('[VideoFeed] Error toggling follow:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not update follow status',
        position: 'bottom',
      });
    } finally {
      setFollowLoading(false);
    }
  };

  // Local state for real-time UI updates
  const [localIsLiked, setLocalIsLiked] = useState(item.is_liked);
  const [localLikesCount, setLocalLikesCount] = useState(item.likes_count);
  const [localIsBookmarked, setLocalIsBookmarked] = useState(item.is_bookmarked || false);
  

  const inputRef = useRef<TextInput>(null);

  // Handle comment input focus and keyboard events
  useEffect(() => {
    if (showCommentInput && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100); // Small delay to ensure UI is ready
      return () => clearTimeout(timer);
    }
  }, [showCommentInput]);

  // Handle keyboard visibility and height (so input stays above keyboard in fullscreen)
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setIsKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates?.height ?? 0);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
    };
  }, []);

  // Animation values for controls and interactions
  // Must match initial showControls=true — otherwise avatar/username overlay stays at opacity 0 (Discovery looked broken).
  const controlsOpacity = useSharedValue(1);
  const exitButtonScale = useSharedValue(1);
  const likeScale = useSharedValue(1);
  const likeOpacity = useSharedValue(1);
  const commentsTranslateY = useSharedValue(1000); // Start from below screen
  const commentsOpacity = useSharedValue(0);
  // PIP mode: when reading/writing comments, video shrinks to small corner so it keeps playing
  const videoPipActive = useSharedValue(0);
  // Animation values
  const sendIconRotation = useSharedValue(0);
  const sendIconScale = useSharedValue(1);

  // Sync local state with props when item changes
  useEffect(() => {
    setLocalIsLiked(item.is_liked);
    setLocalLikesCount(item.likes_count);
    setLocalIsBookmarked(item.is_bookmarked || false);
    setLocalViewsCount(item.views_count || 0);
    
    // Reset view counting state for new video
    loopCountRef.current = 0;
  }, [item.is_liked, item.likes_count, item.is_bookmarked, item.views_count, item.id]);

  const animatedControlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const animatedExitButtonStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ scale: exitButtonScale.value }],
  }));

  const animatedLikeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
    opacity: likeOpacity.value,
  }));

  const animatedCommentsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: commentsTranslateY.value }],
    opacity: commentsOpacity.value,
  }));

  const animatedSendIconStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${sendIconRotation.value}deg` },
      { scale: sendIconScale.value }
    ],
  }));

  // PIP: shrink video to small corner when reading or writing comments so it keeps playing
  useEffect(() => {
    const active = showComments || isKeyboardVisible;
    videoPipActive.value = withTiming(active ? 1 : 0, { duration: 280 });
  }, [showComments, isKeyboardVisible, videoPipActive]);

  const PIP_WIDTH = 100; // Compact PiP
  const PIP_HEIGHT = 140; // Shorter PiP
  const pipTop = safeAreaInsets.top + 12;
  const pipBorderRadius = 12;

  const animatedVideoWrapperStyle = useAnimatedStyle(() => {
    'worklet';
    const active = videoPipActive.value;
    // Center the PIP horizontally
    const pipLeft = (videoDimensions.width - PIP_WIDTH) / 2;
    return {
      position: 'absolute' as const,
      top: active * pipTop,
      left: active ? pipLeft : 0,
      right: active ? undefined : 0,
      bottom: active ? undefined : 0,
      width: active ? PIP_WIDTH : videoDimensions.width,
      height: active ? PIP_HEIGHT : videoDimensions.height,
      borderRadius: active * pipBorderRadius,
      overflow: 'hidden' as const,
      zIndex: active ? 20 : 0,
    };
  }, [videoDimensions.width, videoDimensions.height, pipTop]);

  // Playback model: mirror `VideoPostItem` (home feed video)
  // - Never rely on `shouldPlay` for autoplay
  // - Always enforce `rate: 1.0`
  // - Coordinate with `VideoContext` so only one video plays at a time
  const videoContext = useVideoContext();
  const {
    currentlyPlayingVideoId,
    setCurrentlyPlayingVideo,
  } = videoContext || {
    currentlyPlayingVideoId: null,
    setCurrentlyPlayingVideo: () => {},
  };

  const incrementViewCountRef = useRef<() => void>(() => {});
  
  const startPlayback = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      // CRITICAL: Configure audio session BEFORE playback to prevent voice crackling/popping
      // at video start. Starting playback before the session is ready causes audio glitches.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch {
      // Non-fatal; continue with playback
    }

    try {
      await videoRef.current.setStatusAsync({
        shouldPlay: true,
        rate: 1.0,
        isMuted,
        volume: isMuted ? 0 : 1,
      });
      setIsPlaying(true);
      setIsVideoPaused(false);
      setCurrentlyPlayingVideo?.(item.id);
      
      // Count view when video starts playing (use ref to avoid circular dependency)
      incrementViewCountRef.current?.();
    } catch {
      // best-effort; expo-av will still respect shouldPlay when possible
    }
  }, [isMuted, item.id, setCurrentlyPlayingVideo]);

  const stopPlayback = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      // Stop playback, pause, and mute to ensure audio stops immediately
      await videoRef.current.setStatusAsync({ 
        shouldPlay: false,
        isMuted: true,
        volume: 0
      });
      await videoRef.current.pauseAsync();
    } catch {
      // ignore cleanup errors
    }

    setIsPlaying(false);
    setIsVideoPaused(false);
    setIsVideoLoaded(false);

    if (currentlyPlayingVideoId === item.id) {
      setCurrentlyPlayingVideo?.(null);
    }
  }, [currentlyPlayingVideoId, item.id, setCurrentlyPlayingVideo]);

  // Track previous shouldPlay state to detect transitions
  const prevShouldPlayRef = useRef(shouldPlay);

  // When this item becomes visible, behave like the home feed video:
  // - mark it as active, start playback in the foreground (if shouldPlay is true)
  // - if shouldPlay is false, just preload the video without playing (for adjacent videos)
  // - when it scrolls off, pause and clean up
  useEffect(() => {
    if (isVisible) {
      // Active clip: restore overlay (avatar/username/actions) — recycled cells may still have opacity 0 from the previous post.
      if (shouldPlay) {
        setShowControls(true);
        controlsOpacity.value = withTiming(1, { duration: 200 });
        exitButtonScale.value = withTiming(1, { duration: 200 });
      }
      // Reset retry/error flags for fresh start (kept from original implementation)
      playbackRetryCountRef.current = 0;
      lastPlaybackRetryTimeRef.current = 0;
      ensurePlaybackCountRef.current = 0;
      lastEnsurePlaybackTimeRef.current = 0;
      hasSystemErrorRef.current = false;

      // Cache-buster bump only for non-Mux videos (Mux CDN handles freshness)
      // Don't reset if transitioning from preload to play (shouldPlay changed from false to true)
      if (!item.video_url?.includes('stream.mux.com') && !item.video_url?.includes('.m3u8')) {
        if (!prevShouldPlayRef.current || prevShouldPlayRef.current !== shouldPlay) {
          setCacheBuster(Date.now());
        }
      }
      prevShouldPlayRef.current = shouldPlay;

      // Only start playback if shouldPlay is true (for active video)
      // Adjacent videos will load but not play, preventing dark screen on swipe
      if (shouldPlay) {
        // startPlayback now configures audio session internally before playback (prevents crackling)
        requestAnimationFrame(() => {
          startPlayback();
        });
        activateKeepAwakeAsync();
      }
      // If shouldPlay is false, video will still load (via the Video component's source prop)
      // but won't start playing, so it's ready when user swipes to it
    } else {
      prevShouldPlayRef.current = false;
      // Immediately pause when invisible (smooth transition)
      if (shouldPlay) {
        stopPlayback();
        deactivateKeepAwake();
      }

      // iOS: Keep videos loaded longer to avoid slow reloads (pause instead of unload)
      // Android: Unload after delay to save memory
      if (Platform.OS === 'ios') {
        // On iOS, just pause - don't unload to avoid slow reload times
        // iOS AVPlayer handles memory efficiently and reloading is expensive
        if (videoRef.current && !isVisible) {
          videoRef.current.pauseAsync().catch(() => {});
        }
      } else {
      // Android: Unload videos when they become invisible (with delay to allow smooth transitions)
      // Adjacent videos stay loaded longer since they're preloaded for smooth scrolling
      InteractionManager.runAfterInteractions(() => {
        if (videoRef.current) {
          // Longer delay for videos that were visible but not playing (likely adjacent/preloaded)
          // This keeps preloaded videos ready for instant playback on swipe
          const wasPreloaded = isVisible && !shouldPlay; // Visible but not playing = preloaded adjacent video
          const unloadDelay = wasPreloaded ? 2000 : 1000; // 2s for preloaded, 1s for others
          
          setTimeout(() => {
            if (videoRef.current && !isVisible) {
              videoRef.current.unloadAsync().catch(() => {});
            }
          }, unloadDelay);
        }
      });
      }

      // Hide UI
      if (shouldPlay) {
        setShowControls(false);
        setShowComments(false);
        controlsOpacity.value = withTiming(0, { duration: 200 });
        commentsTranslateY.value = withTiming(1000, { duration: 200 });
        commentsOpacity.value = withTiming(0, { duration: 200 });
      }
    }
  // Intentionally omit videoUri: updating cacheBuster changes videoUri and would re-trigger this effect (infinite loop).
  // After setCacheBuster above, one re-render gives the Video the new URI via key/source.
  }, [isVisible, shouldPlay, startPlayback, stopPlayback]);

  // CRITICAL: Stop playback immediately when shouldPlay becomes false (e.g., screen loses focus)
  // This handles the case where the screen loses focus while video is still visible
  useEffect(() => {
    if (!shouldPlay && isPlaying) {
      // Screen lost focus or video is no longer active - stop immediately
      stopPlayback();
      deactivateKeepAwake();
    }
  }, [shouldPlay, isPlaying, stopPlayback]);

  // Simple playback verification: Only retry once if video should be playing but isn't
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  useEffect(() => {
    if (!isVisible || !isPlaying || isVideoPaused || hasSystemErrorRef.current) return;
    if (!videoRef.current) return;
    
    // Single retry after 500ms if not playing (gives time for initial load)
    const timeoutId = setTimeout(async () => {
      if (!videoRef.current || !isVisible || !isPlaying || isVideoPaused) return;
      
      try {
        const status = await videoRef.current.getStatusAsync();
        if (status.isLoaded && !status.isPlaying && !status.isBuffering) {
          await videoRef.current.setStatusAsync({ shouldPlay: true, rate: 1.0 });
        }
        setIsVideoLoaded(status.isLoaded || false);
      } catch (error) {
        const errorString = JSON.stringify(error);
        if (errorString.includes('-12860') || errorString.includes('PlayerRemoteXPC')) {
          hasSystemErrorRef.current = true;
        }
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [isVisible, isPlaying, isVideoPaused, item.id]);

  // Sync video mute state when global mute state changes
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    void v.setIsMutedAsync(isMuted).catch((error) => {
      log('Video mute sync error:', error);
    });
    if (!isMuted && Platform.OS === 'ios') {
      void reactivateVideoAudioAfterUnmute(v);
    }
  }, [isMuted]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      // Clear isPlaying debounce timeout
      if (isPlayingDebounceRef.current) {
        clearTimeout(isPlayingDebounceRef.current);
        isPlayingDebounceRef.current = null;
      }
      // Cleanup complete
      
      // iOS: Unload immediately (no InteractionManager delay) for faster cleanup
      // Android: Use InteractionManager for ExoPlayer compatibility
      if (Platform.OS === 'ios') {
        if (videoRef.current) {
          log(`[VideoItem ${item.id}] Component unmounting - unloading video (iOS)`);
          videoRef.current.unloadAsync().catch(() => {
            // Ignore errors during cleanup
          });
        }
      } else {
        // Ensure video cleanup happens on main thread (required for ExoPlayer on Android)
        InteractionManager.runAfterInteractions(() => {
          if (videoRef.current) {
            log(`[VideoItem ${item.id}] Component unmounting - unloading video`);
            videoRef.current.unloadAsync().catch(() => {
              // Ignore errors during cleanup
            });
          }
        });
      }
      deactivateKeepAwake(); // Ensure screen wake is deactivated on cleanup
    };
  }, []);

  // Handle screen orientation changes
  useEffect(() => {
    const updateDimensions = () => {
      const { width, height } = Dimensions.get('window');
      setVideoDimensions({ width, height: FULL_VIDEO_HEIGHT });
    };

    const subscription = Dimensions.addEventListener('change', updateDimensions);
    return () => subscription?.remove();
  }, []);

  // Record view: when user is logged in and first view (not loop), use record_post_video_view
  // so the view is stored in post_video_views (recoverable). Loops and anonymous use queueViewCount.
  const incrementViewCount = useCallback(async (isLoop: boolean = false) => {
    if (!item?.id || !item?.video_url) return;

    const useDurableRecord = !!currentUserId && !isLoop;

    if (useDurableRecord) {
      try {
        const { data: newCount, error } = await supabase.rpc('record_post_video_view', {
          p_post_id: item.id,
          p_user_id: currentUserId,
        });
        if (!error && typeof newCount === 'number' && newCount >= 0) {
          setLocalViewsCount(newCount);
        }
        if (error && (error.code === '42883' || error.message?.includes('function') || error.message?.includes('does not exist'))) {
          const { queueViewCount } = await import('../utils/viewCountBatch');
          await queueViewCount(item.id, 1);
        }
      } catch (_) {
        const { queueViewCount } = await import('../utils/viewCountBatch');
        await queueViewCount(item.id, 1);
      }
    } else {
      const { queueViewCount } = await import('../utils/viewCountBatch');
      await queueViewCount(item.id, 1);
    }

    if (isLoop) {
      log(`[VideoFeed] Video loop - view queued for ${item.id}`);
    }
  }, [item?.id, item?.video_url, currentUserId]);
  
  // Keep the ref updated with the latest incrementViewCount function
  useEffect(() => {
    incrementViewCountRef.current = incrementViewCount;
  }, [incrementViewCount]);

  // Safety check to ensure theme context is ready (after all hooks)
  if (!themeContext) {
    return null; // Don't render until theme context is ready
  }

  // If another video becomes the globally playing one, stop this one (match home feed behaviour)
  useEffect(() => {
    if (!currentlyPlayingVideoId) return;
    if (currentlyPlayingVideoId !== item.id && isPlaying) {
      stopPlayback();
    }
  }, [currentlyPlayingVideoId, item.id, isPlaying, stopPlayback]);

  // Handle single tap and double tap
  const handleScreenTap = useCallback(() => {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTapTime;
    
    if (timeDiff < 300) {
      // Double tap detected - like the video
      handleDoubleTapLike();
      setLastTapTime(0); // Reset to prevent multiple triggers
    } else {
      // Single tap - toggle controls visibility
      setShowControls(!showControls);
      if (!showControls) {
        // Show controls
        controlsOpacity.value = withTiming(1, { duration: 300 });
        exitButtonScale.value = withTiming(1, { duration: 300 });
      } else {
        // Hide controls
        controlsOpacity.value = withTiming(0, { duration: 300 });
        exitButtonScale.value = withTiming(0.8, { duration: 300 });
      }
      setLastTapTime(currentTime);
    }
  }, [lastTapTime, showControls, controlsOpacity, exitButtonScale, handleDoubleTapLike]);

  const handleSingleTapPause = useCallback(() => {
    // Toggle video pause/play (and show controls briefly), mirroring home feed behaviour
    if (isVideoPaused || !isPlaying) {
      startPlayback();
    } else {
      stopPlayback();
      setIsVideoPaused(true);
    }
    
    // Toggle controls visibility (no play-button scale animation to avoid flicker)
    if (showControls) {
      setShowControls(false);
      controlsOpacity.value = withTiming(0, { duration: 300 });
      exitButtonScale.value = withTiming(0.8, { duration: 300 });
    } else {
      setShowControls(true);
      controlsOpacity.value = withTiming(1, { duration: 300 });
      exitButtonScale.value = withTiming(1, { duration: 200 });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isVideoPaused, isPlaying, showControls, controlsOpacity, exitButtonScale, startPlayback, stopPlayback]);

  const triggerLikeBurst = useCallback(() => {
    setShowLikeAnimation(true);
  }, []);

  const handleDoubleTapLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newLikeState = !localIsLiked;
    setLocalIsLiked(newLikeState);
    setLocalLikesCount(prev => newLikeState ? prev + 1 : Math.max(0, prev - 1));
    onLike?.(item.id, newLikeState);
    setShowDoubleTapHeart(true);
  }, [localIsLiked, onLike]);



  const handleExitFullscreen = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onExitFullscreen?.();
  };

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newIsLiked = !localIsLiked;
    setLocalIsLiked(newIsLiked);
    setLocalLikesCount(prev => Math.max(0, newIsLiked ? prev + 1 : prev - 1));
    likeScale.value = withSequence(
      withTiming(1.3, { duration: 150 }),
      withTiming(1, { duration: 150 })
    );
    if (newIsLiked) triggerLikeBurst();
    onLike?.(item.id, newIsLiked);
  };

  const loadComments = async () => {
    if (loadingComments) return; // Prevent multiple simultaneous loads
    
    setLoadingComments(true);
    log('📚 [VideoComment] Loading comments for post:', item.id);
    
    try {
      const fetchedComments = await fetchComments(item.id);
      log('✅ [VideoComment] Loaded comments:', fetchedComments.length, 'comments');
      setComments(fetchedComments);
        } catch (error) {
      error('❌ [VideoComment] Error loading comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleComment = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowComments(!showComments);
    if (!showComments) {
      // Show comments and load them
      commentsTranslateY.value = withSpring(0, { damping: 20, stiffness: 90 });
      commentsOpacity.value = withTiming(1, { duration: 300 });
      // Load comments when opening
      loadComments();
      // Hide input initially, let user tap to show it
      setShowCommentInput(false);
    } else {
      // Hide comments
      commentsTranslateY.value = withTiming(1000, { duration: 300 });
      commentsOpacity.value = withTiming(0, { duration: 300 });
      inputRef.current?.blur();
      setShowCommentInput(false);
      // Ensure keyboard is dismissed and state naturally resets when closing
      Keyboard.dismiss();
    }
    onComment?.(item);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!currentUserId) return;
    
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingCommentId(commentId);
            log('🗑️ [VideoComment] Deleting comment:', commentId);
            
            try {
              const success = await deleteComment(commentId, currentUserId);
              if (success) {
                // Remove from local state
                setComments(prevComments => prevComments.filter(c => c.id !== commentId));
                log('✅ [VideoComment] Comment deleted successfully');
                
                Toast.show({
                  type: 'success',
                  text1: 'Comment deleted 🗑️',
                  text2: 'Your comment has been removed',
                  position: 'top',
                  visibilityTime: 2000,
                  topOffset: 60,
                });
              } else {
                Toast.show({
                  type: 'error',
                  text1: 'Delete failed 😞',
                  text2: 'You may not have permission to delete this comment',
                  position: 'top',
                  visibilityTime: 3000,
                  topOffset: 60,
                });
              }
            } catch (error) {
              error('❌ [VideoComment] Error deleting comment:', error);
              Toast.show({
                type: 'error',
                text1: 'Delete error 💥',
                text2: 'Something went wrong while deleting',
                position: 'top',
                visibilityTime: 3000,
                topOffset: 60,
              });
            } finally {
              setDeletingCommentId(null);
            }
          },
        },
      ]
    );
  };

  const handleEditComment = (commentId: string, currentText: string) => {
    setEditingCommentId(commentId);
    setEditCommentText(currentText);
  };

  const handleSaveEditComment = async (commentId: string) => {
    if (!currentUserId || !editCommentText.trim()) return;
    
    log('📝 [VideoComment] Attempting to update comment:', commentId, 'with text:', editCommentText.trim());
    
    try {
      // For now, we'll update the local state and later implement backend update
      setComments(prevComments => 
        prevComments.map(comment => 
          comment.id === commentId 
            ? { ...comment, content: editCommentText.trim(), updated_at: new Date().toISOString() }
            : comment
        )
      );
      
      setEditingCommentId(null);
      setEditCommentText('');
      log('✅ [VideoComment] Comment updated successfully');
      Toast.show({
        type: 'success',
        text1: 'Comment updated! 📝',
        text2: 'Your comment has been updated',
        position: 'top',
        visibilityTime: 2000,
        topOffset: 60,
      });
    } catch (error) {
      error('❌ [VideoComment] Error updating comment:', error);
      Toast.show({
        type: 'error',
        text1: 'Update failed 😞',
        text2: 'Could not update your comment',
        position: 'top',
        visibilityTime: 3000,
        topOffset: 60,
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditCommentText('');
  };

  const handleSendComment = async () => {
    if (commentText.trim() && currentUserId && !sendingComment) {
      setSendingComment(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Start send icon animation
      sendIconRotation.value = withRepeat(withTiming(360, { duration: 1000 }), -1, false);
      sendIconScale.value = withSequence(
        withTiming(0.8, { duration: 100 }),
        withTiming(1.2, { duration: 200 }),
        withTiming(1, { duration: 100 })
      );
      
      log('🎬 [VideoComment] Attempting to add comment:', {
        postId: item.id,
        userId: currentUserId,
        commentText: commentText.trim(),
        commentLength: commentText.trim().length
      });

      try {
        // Add comment to database
        const newComment = await addComment(item.id, currentUserId, commentText.trim());
        
        if (newComment) {
          log('✅ [VideoComment] Comment added successfully:', newComment);
          
          // Stop animation and show success state
          sendIconRotation.value = withTiming(0, { duration: 200 });
          sendIconScale.value = withSequence(
            withTiming(1.3, { duration: 150 }),
            withTiming(1, { duration: 150 })
          );
          
          // Add to local comments state for immediate UI update
          setComments(prevComments => [newComment, ...prevComments]);
          setCommentText('');
          inputRef.current?.blur();
          // Hide input after successful comment
          setShowCommentInput(false);
          
          // Show success toast
          Toast.show({
            type: 'success',
            text1: 'Comment posted! 🎉',
            text2: 'Your comment has been added successfully',
            position: 'top',
            visibilityTime: 2000,
            topOffset: 60,
          });
          
        } else {
          error('❌ [VideoComment] Failed to add comment - no comment returned');
          
          // Stop animation on failure
          sendIconRotation.value = withTiming(0, { duration: 200 });
          sendIconScale.value = withTiming(1, { duration: 200 });
          
          // Show error toast
          Toast.show({
            type: 'error',
            text1: 'Failed to post comment 😞',
            text2: 'Please try again in a moment',
            position: 'top',
            visibilityTime: 3000,
            topOffset: 60,
          });
        }
      } catch (error) {
        error('💥 [VideoComment] Exception adding comment:', error);
        
        // Stop animation on error
        sendIconRotation.value = withTiming(0, { duration: 200 });
        sendIconScale.value = withTiming(1, { duration: 200 });
        
        // Show error toast
        Toast.show({
          type: 'error',
          text1: 'Comment failed to post 💥',
          text2: 'Check your connection and try again',
          position: 'top',
          visibilityTime: 3000,
          topOffset: 60,
        });
      } finally {
        setSendingComment(false);
      }
    } else {
      log('⚠️ [VideoComment] Cannot send comment:', {
        hasText: !!commentText.trim(),
        hasUserId: !!currentUserId,
        commentText: commentText,
        currentUserId: currentUserId,
        isAlreadySending: sendingComment
      });
      
      if (!currentUserId) {
        Toast.show({
          type: 'info',
          text1: 'Please log in 🔐',
          text2: 'You need to be logged in to comment',
          position: 'top',
          visibilityTime: 2500,
          topOffset: 60,
        });
      } else if (sendingComment) {
        Toast.show({
          type: 'info',
          text1: 'Please wait ⏳',
          text2: 'Your previous comment is still being posted',
          position: 'top',
          visibilityTime: 2000,
          topOffset: 60,
        });
      }
    }
  };

  const handleLikeComment = (commentId: string, isLiked: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // TODO: Toggle comment like in backend
    log('Toggling comment like:', commentId, 'liked:', !isLiked);
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Update local state immediately for instant UI feedback
    const newIsBookmarked = !localIsBookmarked;
    setLocalIsBookmarked(newIsBookmarked);
    
    // Call the backend update
    onSave?.(item.id, newIsBookmarked);
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onShare?.(item);
  };

  const handleProfilePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onProfilePress?.(item.user.id);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Video',
      'Are you sure you want to delete this video?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete?.(item.id),
        },
      ],
    );
  };

  const cellWidth = Math.min(screenWidth, videoDimensions.width, SCREEN_WIDTH);

  return (
    <View style={{ width: cellWidth, overflow: 'hidden', height: videoDimensions.height }}>
      <Pressable
        style={[getVideoContainerStyles('tiktok'), {
          height: videoDimensions.height,
          width: cellWidth,
        }]}
        onPress={handleScreenTap}
      >
        {/* Lightweight double-tap heart on video (center) */}
        <View style={[StyleSheet.absoluteFill, styles.doubleTapHeartContainer]} pointerEvents="none">
          <LikeBurst
            visible={showDoubleTapHeart}
            onComplete={() => setShowDoubleTapHeart(false)}
            size={56}
            color="#FACC15"
            duration={280}
          />
        </View>
        {/* Video Player - wrapper resizes to small PIP when comments/keyboard open so video keeps playing */}
        {/* On Android: only render Video when visible to avoid ExoPlayer decoder limit (2–4). Show poster when not visible. */}
        <Animated.View style={[styles.videoWrapperBase, animatedVideoWrapperStyle]}>
          {Platform.OS === 'android' && !isVisible ? (
            <Image source={{ uri: item.thumbnail_url }} style={styles.videoFillWrapper} contentFit="cover" />
          ) : (
          <Video
            key={`${item.id}-${videoUri}`} // Force remount when video changes (cache-busted URL ensures fresh load)
            ref={videoRef}
            source={{ uri: videoUri }} // Cache-busted URL: always loads fresh from Mux
            style={styles.videoFillWrapper}
            resizeMode={ResizeMode.CONTAIN}
        // IMPORTANT: do not rely on shouldPlay for autoplay; we control playback via setStatusAsync,
        // exactly like the home feed `VideoPostItem` implementation.
        shouldPlay={false}
        isLooping={true}
        isMuted={isMuted}
        volume={isMuted ? 0 : 1}
        useNativeControls={false}
        progressUpdateIntervalMillis={1000}
        // Production video settings for better reliability
        usePoster={true}
        posterSource={{ uri: item.thumbnail_url }}
        posterStyle={styles.videoFillWrapper}
        // Network and caching optimizations
        // IMPORTANT (Android): only override when we know the format.
        // For Mux HLS (.m3u8) forcing "mp4" can prevent playback on some devices.
        overrideFileExtensionAndroid={
          videoUri.includes('.m3u8') || videoUri.includes('stream.mux.com')
            ? 'm3u8'
            : videoUri.includes('.mp4')
              ? 'mp4'
              : undefined
        }
        // Audio settings for release builds
        audioOnly={false}
        allowsExternalPlayback={false}
        ignoreSilentSwitch="ignore"
        // iOS-specific optimizations to prevent flickering
        playInSilentModeIOS={true}
        staysActiveInBackground={false}
        onPlaybackStatusUpdate={(status) => {
          if (status.isLoaded) {
            // Check for system errors in status
            if (status.error) {
              const errorString = JSON.stringify(status.error);
              if (errorString.includes('-12860') || errorString.includes('PlayerRemoteXPC')) {
                if (!hasSystemErrorRef.current) {
                  warn(`[Video] System error detected in status for ${item.id}:`, status.error);
                  hasSystemErrorRef.current = true; // Stop retrying
                }
              }
            }
            
            // Rate correction: only when significantly off to avoid tiny stop/play stutter
            // (setStatusAsync can cause brief pauses; throttle to avoid playback flicker)
            if (isVisible && !isVideoPaused && videoRef.current && status.rate != null) {
              const rateOff = Math.abs(status.rate - 1.0);
              const now = Date.now();
              if (rateOff > 0.15 && (now - (lastRateCorrectionRef.current || 0) > 2000)) {
                lastRateCorrectionRef.current = now;
                videoRef.current.setStatusAsync({ rate: 1.0 }).catch(() => {});
              }
            }
            
            // Debounce isPlaying to avoid rapid flicker from brief status updates
            const wasPlaying = isPlaying;
            if (status.isPlaying !== wasPlaying) {
              if (status.isPlaying) {
                // Playing: update immediately, cancel any pending debounce
                if (isPlayingDebounceRef.current) {
                  clearTimeout(isPlayingDebounceRef.current);
                  isPlayingDebounceRef.current = null;
                }
                setIsPlaying(true);
              } else {
                // Stopped: delay briefly to ignore transient false
                if (!isPlayingDebounceRef.current) {
                  isPlayingDebounceRef.current = setTimeout(() => {
                    setIsPlaying(false);
                    isPlayingDebounceRef.current = null;
                  }, 120);
                }
              }
            }
            
            // Retry: if should be playing but isn't, try once (throttled to avoid stutter)
            if (isVisible && !isVideoPaused && !status.isPlaying && !status.isBuffering && videoRef.current && !hasSystemErrorRef.current) {
              const retryNow = Date.now();
              if (playbackRetryCountRef.current === 0 || (playbackRetryCountRef.current < 2 && retryNow - lastPlaybackRetryTimeRef.current > 2000)) {
                lastPlaybackRetryTimeRef.current = retryNow;
                playbackRetryCountRef.current += 1;
                // Always enforce rate: 1.0 when retrying playback
                videoRef.current.setStatusAsync({ shouldPlay: true, rate: 1.0 }).catch((error) => {
                  const errorString = JSON.stringify(error);
                  if (errorString.includes('-12860') || errorString.includes('PlayerRemoteXPC')) {
                    hasSystemErrorRef.current = true;
                  }
                });
              }
            }
            
            // Update video duration and position for progress bar (debounced)
            if (status.durationMillis && status.durationMillis !== videoDuration) {
              setVideoDuration(status.durationMillis);
            }
            if (status.positionMillis !== undefined && !isDraggingProgress) {
              // Only update if change is significant (>100ms) to reduce re-renders
              const positionDiff = Math.abs(status.positionMillis - videoPosition);
              if (positionDiff > 100) {
                setVideoPosition(status.positionMillis);
              }
            }
            
            // Auto-replay when video ends (additional safety for looping)
            if (status.didJustFinish && isVisible) {
              // Silently increment view count on loop
              incrementViewCount(true); // true = loop
              videoRef.current?.replayAsync({ rate: 1.0 }).catch(() => {});
            }
            
            // Handle video focus change only when play state actually changes
            if (!status.isBuffering && status.isPlaying && !wasPlaying) {
              onVideoFocusChange?.(item.id);
            }
          }
        }}
        onError={(error) => {
          // Fullscreen feed used to log this loudly; home feed does not.
          // To match home-screen behaviour, we avoid noisy logs and just mark the video as not playing.
          if (__DEV__) {
            warn(`[VideoFeed] Playback error for ${item.id}`, error);
          }

          // Check for system-level errors (e.g. CoreMediaErrorDomain -12860) so we can stop retrying
          const errorString = JSON.stringify(error);
          if (errorString.includes('-12860') || errorString.includes('PlayerRemoteXPC')) {
            hasSystemErrorRef.current = true; // Stop retrying when system can't play this video
          }

          setIsPlaying(false);
          deactivateKeepAwake();
        }}
        onLoadStart={() => {
          log(`[Video] Loading started for video ${item.id}`);
          setIsVideoLoaded(false);
        }}
        onLoad={async (status) => {
          if (!status.isLoaded || !videoRef.current) return;
          
          setIsVideoLoaded(true);
          
          // CRITICAL FIX: Always set rate: 1.0 immediately when video loads (prevents slow motion on real devices)
          // iOS AVPlayer can default to slower rate on real devices, so enforce 1.0 immediately
          // This MUST happen before any playback starts
          try {
            await videoRef.current.setStatusAsync({ rate: 1.0 });
          } catch (error) {
            // Ignore - rate setting is best effort
          }
          
          // If visible, ensure it plays immediately after load with rate: 1.0 enforced
          if (isVisible && !isVideoPaused) {
            try {
              // Handle initial position (opening fullscreen on playing video)
              if (initialPosition !== undefined) {
                await videoRef.current.setPositionAsync(initialPosition);
                onInitialVideoReady?.();
              }
              // Start playing immediately - CRITICAL: rate: 1.0 must be set here too
              await videoRef.current.setStatusAsync({ shouldPlay: true, rate: 1.0, isMuted });
            } catch (error) {
              // Error handled by shouldPlay prop fallback
            }
          }
        }}
        />
          )}
      </Animated.View>

      {/* Video Controls Overlay - Only show when manually paused */}
      {isVideoPaused && (
        <View style={styles.videoControlsOverlay}>
          {/* Play Button - Only for manual resume */}
          <TouchableOpacity 
            style={styles.playButton}
            onPress={() => {
              // CRITICAL: Always enforce rate: 1.0 when manually resuming
              videoRef.current?.setStatusAsync({ shouldPlay: true, rate: 1.0 });
              setIsVideoPaused(false);
            }}
          >
            <Play size={50} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* Video Position Display + Center Play Button when paused */}
      {videoDuration > 0 && showControls && (
        <>
          <Animated.View style={[styles.videoTimeDisplay, animatedControlsStyle]}>
            <View style={styles.timeDisplayContainer}>
              <Text style={styles.videoTimeText}>
                {formatTime(videoPosition)}
              </Text>
              <Text style={styles.timeSeparator}>/</Text>
              <Text style={styles.videoTimeText}>
                {formatTime(videoDuration)}
              </Text>
            </View>
          </Animated.View>

          {(!isPlaying || isVideoPaused) && (
            <TouchableOpacity
              style={styles.fullscreenPlayButton}
              activeOpacity={0.9}
              onPress={handleSingleTapPause}
            >
              <View style={styles.fullscreenPlayInner}>
                <Play size={40} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Enhanced Video Progress Bar - Apple-style design */}
      {videoDuration > 0 && showControls && (
        <Animated.View 
          style={[styles.progressBarContainer, animatedControlsStyle]} 
          pointerEvents={showControls ? "auto" : "none"}
        >
          <Pressable
            style={styles.progressBar}
            onPress={(event) => {
              const { locationX } = event.nativeEvent;
              const progressBarWidth = SCREEN_WIDTH - 80;
              const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
              const newPosition = percentage * videoDuration;
              setVideoPosition(newPosition);
              videoRef.current?.setPositionAsync(newPosition);
            }}
          >
            <View 
              style={[
                styles.progressTrack,
                { backgroundColor: 'rgba(255, 255, 255, 0.15)' }
              ]}
            />
            <View 
              style={[
                styles.progressFill,
                { 
                  width: `${(videoPosition / videoDuration) * 100}%`,
                  backgroundColor: '#FFFFFF'
                }
              ]}
            />
            <PanGestureHandler
              onGestureEvent={(event) => {
                const { x } = event.nativeEvent;
                const progressBarWidth = SCREEN_WIDTH - 80;
                const percentage = Math.max(0, Math.min(1, (x - 40) / progressBarWidth));
                const newPosition = percentage * videoDuration;
                setVideoPosition(newPosition);
                videoRef.current?.setPositionAsync(newPosition);
              }}
              onHandlerStateChange={(event) => {
                if (event.nativeEvent.state === 4) {
                  setIsDraggingProgress(true);
                } else if (event.nativeEvent.state === 5) {
                  setIsDraggingProgress(false);
                }
              }}
            >
              <View
                style={[
                  styles.progressSeeker,
                  {
                    left: `${(videoPosition / videoDuration) * 100}%`,
                    transform: [{ translateX: -8 }]
                  }
                ]}
              />
            </PanGestureHandler>
          </Pressable>
        </Animated.View>
      )}

      {/* Video Info Overlay */}
      <View style={styles.overlay} pointerEvents="box-none">
        {/* Exit Full-Screen Button - Top Left */}
        {/* Only show back button if onExitFullscreen is provided (modal mode) */}
        {onExitFullscreen && (
          <Animated.View
            style={[
              styles.exitButtonContainer,
              { top: safeAreaInsets.top + 10 },
              animatedExitButtonStyle
            ]}
            pointerEvents={showControls ? "auto" : "none"}
          >
            <TouchableOpacity
              style={styles.exitButton}
              onPress={handleExitFullscreen}
            >
              <ArrowLeft size={24} color="white" strokeWidth={2.5} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Main Content Area */}
        <View style={styles.mainContent}>
          {/* User Info and Description - Bottom Left - hide on tap like icons */}
          <Animated.View
            style={[
              styles.bottomInfo,
              { paddingBottom: safeAreaInsets.bottom + 70 },
              animatedControlsStyle,
            ]}
            pointerEvents={showControls ? "auto" : "none"}
          >
            {/* User Info with Follow Button - Clean video feed style */}
            <View style={styles.userInfoContainer}>
              <TouchableOpacity style={styles.userInfo} onPress={handleProfilePress}>
                <View style={styles.avatarContainer}>
                  {item.user.avatar_url ? (
                    <Image
                      source={{ uri: item.user.avatar_url }}
                      style={styles.avatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <User size={20} color="white" />
                    </View>
                  )}
                </View>
                <View style={styles.userDetails}>
                  <Text style={styles.username}>
                    @{(() => {
                      // Check all possible sources for username before showing fallback
                      const username = item.user?.username || 
                                      item.user?.display_name ||
                                      item.username ||
                                      (item.user?.id ? `user_${item.user.id.substring(0, 8)}` : 'user');
                      
                      const cleaned = stripAtSymbol(username);
                      return cleaned || 'user';
                    })()}
                  </Text>
                  {item.user?.display_name && (
                    <Text style={styles.displayName}>{item.user.display_name}</Text>
                  )}
                </View>
              </TouchableOpacity>
              
              {/* Follow/Unfollow Button - Only show if not own content */}
              {currentUserId && videoOwnerId && !isOwnContent && (
                <TouchableOpacity 
                  style={[
                    styles.followButton,
                    isFollowingUser && styles.followingButton
                  ]}
                  onPress={handleFollowToggle}
                  disabled={followLoading}
                  activeOpacity={0.7}
                >
                  {followLoading ? (
                    <ActivityIndicator size="small" color={isFollowingUser ? "#fff" : "#fff"} />
                  ) : isFollowingUser ? (
                    <UserCheck size={14} color="#fff" strokeWidth={2.5} />
                  ) : (
                    <UserPlus size={14} color="#fff" strokeWidth={2.5} />
                  )}
                  <Text style={styles.followButtonText}>
                    {isFollowingUser ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Video Description - Clean video feed style */}
            <View style={styles.descriptionContainer}>
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
              {item.tags && item.tags.length > 0 && (
                <Text style={styles.tags}>#{item.tags.join(' #')}</Text>
              )}
              {item.location && (
                <View style={styles.locationContainer}>
                  <Text style={styles.locationText}>📍 {item.location}</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Action Buttons - Bottom Right - hide on tap */}
          <Animated.View 
            style={[
              styles.actionButtons, 
              { paddingBottom: safeAreaInsets.bottom + 140 },
              animatedControlsStyle
            ]} 
            pointerEvents={showControls ? "auto" : "none"}
          >
            {/* Like Button */}
            <View style={styles.actionButton}>
              <TouchableOpacity style={styles.actionButtonContainer} onPress={handleLike} activeOpacity={0.7} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                <Zap
                  size={28}
                  color={localIsLiked ? "#FACC15" : "white"}
                  fill={localIsLiked ? "#FACC15" : "transparent"}
                  strokeWidth={2}
                />
              </TouchableOpacity>
              <LikeBurst
                visible={showLikeAnimation}
                onComplete={() => setShowLikeAnimation(false)}
                size={44}
                color="#FACC15"
                style={styles.likeBurstOnIcon}
              />
              {localLikesCount > 0 && (
                <Text style={styles.actionText}>
                  {localLikesCount > 999 ? `${(localLikesCount / 1000).toFixed(1)}k` : localLikesCount}
                </Text>
              )}
            </View>

            {/* Comment Button */}
            <View style={styles.actionButton}>
              <TouchableOpacity style={styles.actionButtonContainer} onPress={handleComment} activeOpacity={0.7} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                <MessageCircle size={28} color="white" strokeWidth={2} />
              </TouchableOpacity>
              {(item.comments_count || 0) > 0 && (
                <Text style={styles.actionText}>
                  {item.comments_count > 999 ? `${(item.comments_count / 1000).toFixed(1)}k` : item.comments_count}
                </Text>
              )}
            </View>

            {/* Save/Bookmark Button */}
            <View style={styles.actionButton}>
              <TouchableOpacity style={styles.actionButtonContainer} onPress={handleSave} activeOpacity={0.7} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                <Bookmark
                  size={28}
                  color={localIsBookmarked ? "#FFD700" : "white"}
                  fill={localIsBookmarked ? "#FFD700" : "transparent"}
                  strokeWidth={2}
                />
              </TouchableOpacity>
            </View>

            {/* Share Button - DISABLED */}
            {/* <View style={styles.actionButton}>
              <TouchableOpacity style={styles.actionButtonContainer} onPress={handleShare}>
                <ShareIcon size={28} color="white" strokeWidth={2} />
              </TouchableOpacity>
              <Text style={styles.actionText}>
                {item.shares_count > 999 ? `${(item.shares_count / 1000).toFixed(1)}k` : item.shares_count}
              </Text>
            </View> */}

            {/* Mute/Unmute Button */}
            <View style={styles.actionButton}>
              <TouchableOpacity style={styles.actionButtonContainer} onPress={onToggleMute} activeOpacity={0.7} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                {isMuted ? (
                  <VolumeX size={24} color="white" strokeWidth={2} />
                ) : (
                  <Volume2 size={24} color="white" strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>

            {/* Delete Button (for post owner only) */}
            {currentUserId === item.user.id && (
              <View style={styles.actionButton}>
                <TouchableOpacity style={styles.actionButtonContainer} onPress={handleDelete} activeOpacity={0.7} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                  <Trash2 size={24} color="white" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      </View>

      {/* Remove the explicit tap hint - modern video apps don't show this */}
      {/* Inline Comments Overlay */}
      {showComments && (
        <Animated.View
          style={[
            styles.commentsOverlay, 
            animatedCommentsStyle, 
            {
              backgroundColor: safeThemeColors.surface, // Solid background (no transparency)
              borderTopColor: safeThemeColors.border,
              borderTopWidth: 0,
              // When keyboard is visible, lift overlay above keyboard so input stays visible
              // Always account for tab bar height (even in fullscreen mode, tab bar is still visible in Videos tab)
              bottom: isKeyboardVisible 
                ? keyboardHeight 
                : getFloatingTabBarReservedHeight(safeAreaInsets.bottom),
              // Shorter overlay so it doesn’t dominate the screen when empty; taller when keyboard is up
              height: itemFullScreenMode
                ? (isKeyboardVisible ? '52%' : '58%')
                : (isKeyboardVisible ? '60%' : '48%'),
            }
          ]}
          pointerEvents="auto"
        >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.commentsContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? safeAreaInsets.top + 20 : (itemFullScreenMode ? 0 : 0)}
          enabled={true}
        >
          {/* Comments Header - Hidden when keyboard is visible (PIP mode) to prevent showing behind video */}
          {!isKeyboardVisible && (
            <View style={styles.commentsHeader}>
              {/* Drag indicator */}
              <View style={[styles.dragIndicator, { backgroundColor: safeThemeColors.textSecondary }]} />
              <TouchableOpacity
                style={styles.commentsCloseButton}
                onPress={handleComment}
              >
                <ChevronDown size={24} color={safeThemeColors.text} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={[styles.commentsTitle, { color: safeThemeColors.text }]}>
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </Text>
              <View style={{ width: 24 }} />
            </View>
          )}

          {/* Comments List */}
          <FlatList
            data={comments}
            keyExtractor={(item, index) => `comment-${index}`}
            style={styles.commentsList}
            contentContainerStyle={styles.commentsListContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              loadingComments ? (
                <View style={styles.emptyComments}>
                  <ActivityIndicator size="large" color={safeThemeColors.primary} />
                  <Text style={[styles.emptyCommentsText, { color: safeThemeColors.textSecondary }]}>Loading comments...</Text>
                </View>
              ) : (
                <View style={styles.emptyComments}>
                  <MessageCircle size={32} color={safeThemeColors.textSecondary} strokeWidth={1} />
                  <Text style={[styles.emptyCommentsText, { color: safeThemeColors.textSecondary }]}>No comments yet</Text>
                  <Text style={[styles.emptyCommentsSubtext, { color: safeThemeColors.textSecondary }]}>Be the first to comment!</Text>
                </View>
              )
            }
            renderItem={({ item: comment }) => (
              <View style={styles.commentItem}>
                <TouchableOpacity style={styles.commentAvatar}>
                  {comment.user_avatar || comment.profiles?.avatar_url ? (
                    <Image
                      source={{ uri: comment.user_avatar || comment.profiles?.avatar_url }}
                      style={styles.commentAvatarImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.commentAvatarPlaceholder, { backgroundColor: safeThemeColors.surfaceVariant }]}>
                      <User size={12} color={safeThemeColors.textSecondary} />
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.commentContent}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentUsername, { color: safeThemeColors.text }]}>
                      {comment.username || comment.display_name || comment.profiles?.username || 'Anonymous'}
                    </Text>
                    <View style={styles.commentHeaderRight}>
                      <Text style={[styles.commentTime, { color: safeThemeColors.textSecondary }]}>
                        {formatTimeAgo(comment.created_at)}
                        {comment.updated_at && comment.updated_at !== comment.created_at && ' (edited)'}
                      </Text>
                      {/* Edit/Delete actions for comment owner */}
                      {currentUserId === comment.user_id && (
                        <View style={styles.commentOwnerActions}>
                          <TouchableOpacity
                            onPress={() => handleEditComment(comment.id, comment.content)}
                            style={styles.commentActionButton}
                          >
                            <Edit size={14} color={safeThemeColors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteComment(comment.id)}
                            style={styles.commentActionButton}
                            disabled={deletingCommentId === comment.id}
                          >
                            {deletingCommentId === comment.id ? (
                              <ActivityIndicator size={14} color={safeThemeColors.textSecondary} />
                            ) : (
                              <Trash2 size={14} color={safeThemeColors.textSecondary} />
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                  
                  {/* Comment content - editable if in edit mode */}
                  {editingCommentId === comment.id ? (
                    <View style={styles.editCommentContainer}>
                      <TextInput
                        style={[styles.editCommentInput, { color: safeThemeColors.text, backgroundColor: safeThemeColors.surfaceVariant, borderColor: safeThemeColors.border }]}
                        value={editCommentText}
                        onChangeText={setEditCommentText}
                        multiline
                        placeholder="Edit your comment..."
                        placeholderTextColor={safeThemeColors.textSecondary}
                      />
                      <View style={styles.editCommentActions}>
                        <TouchableOpacity
                          onPress={handleCancelEdit}
                          style={[styles.editActionButton, { backgroundColor: safeThemeColors.surfaceVariant }]}
                        >
                          <X size={16} color={safeThemeColors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSaveEditComment(comment.id)}
                          style={[styles.editActionButton, { backgroundColor: safeThemeColors.primary }]}
                          disabled={!editCommentText.trim()}
                        >
                          <Check size={16} color="white" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.commentText, { color: safeThemeColors.text }]}>{comment.content}</Text>
                  )}
                  
                  {/* Like action (only show if not in edit mode) */}
                  {editingCommentId !== comment.id && (
                    <View style={styles.commentActions}>
                      <TouchableOpacity
                        style={styles.commentAction}
                        onPress={() => handleLikeComment(comment.id, comment.is_liked)}
                      >
                        <Heart
                          size={12}
                          color={comment.is_liked ? "#FF0050" : safeThemeColors.textSecondary}
                          fill={comment.is_liked ? "#FF0050" : "transparent"}
                          strokeWidth={2}
                        />
                        <Text style={[styles.commentActionText, { color: safeThemeColors.textSecondary }, comment.is_liked && styles.likedCommentText]}>
                          {comment.likes_count > 0 ? comment.likes_count : ''}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
          />

          {/* Comment Input Section */}
          {!showCommentInput ? (
            // Add Comment Button (hidden input state)
            <TouchableOpacity 
              style={[styles.addCommentButton, { 
                backgroundColor: 'transparent', 
                paddingBottom: Math.max(safeAreaInsets.bottom, 8),
                borderTopColor: safeThemeColors.border,
              }]}
              onPress={() => {
                setShowCommentInput(true);
                setTimeout(() => inputRef.current?.focus(), 100);
              }}
            >
              <MessageCircle size={20} color={safeThemeColors.textSecondary} />
              <Text style={[styles.addCommentText, { color: safeThemeColors.textSecondary }]}>
                Add a comment...
              </Text>
            </TouchableOpacity>
          ) : (
            // Full Comment Input (visible input state) - Always dark for video UI
            <View style={[styles.commentInputContainer, { 
              paddingBottom: Math.max(safeAreaInsets.bottom, 8),
              backgroundColor: '#1a1a1a',
            }]}>
              {/* Text input first so emoji row / keyboard never blocks it */}
              <View style={[
                styles.commentInputWrapper, 
                { backgroundColor: '#2a2a2a' }
              ]}>
                <TextInput
                  ref={inputRef}
                  style={[styles.commentInput, { color: '#ffffff' }]}
                  placeholder="Add a comment..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                  returnKeyType="send"
                  blurOnSubmit={false}
                  onSubmitEditing={handleSendComment}
                />
                <TouchableOpacity
                  style={[
                    styles.sendButton, 
                    (commentText.trim() && !sendingComment) && [styles.sendButtonActive, { backgroundColor: safeThemeColors.primary }],
                    sendingComment && { backgroundColor: safeThemeColors.primary, opacity: 0.7 }
                  ]}
                  onPress={() => {
                    log('🔥 [VideoComment] Send button pressed!', {
                      commentText,
                      commentTextTrimmed: commentText.trim(),
                      currentUserId,
                      hasComment: !!commentText.trim(),
                      isDisabled: !commentText.trim() || sendingComment,
                      isSending: sendingComment
                    });
                    handleSendComment();
                  }}
                  disabled={!commentText.trim() || sendingComment}
                >
                  <Animated.View style={animatedSendIconStyle}>
                    {sendingComment ? (
                      <ActivityIndicator size={16} color="white" />
                    ) : (
                      <Send size={16} color={(commentText.trim() && !sendingComment) ? "white" : safeThemeColors.textSecondary} />
                    )}
                  </Animated.View>
                </TouchableOpacity>
              </View>
              <View style={styles.quickEmojiRow}>
                {['😂', '❤️', '🔥', '👏', '😍', '😮', '😢', '🙏'].map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.quickEmojiButton}
                    activeOpacity={0.7}
                    onPress={() => setCommentText(prev => prev + emoji)}
                  >
                    <Text style={styles.quickEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Animated.View>
      )}
        
      {/* Video Likes List Modal */}
      <VideoLikesList
        visible={showLikesList}
        onClose={() => setShowLikesList(false)}
        postId={item.id}
        likesCount={localLikesCount}
      />
      </Pressable>
    </View>
  );
});

export default function VideoFeed({
  videos,
  onRefresh,
  refreshing = false,
  onLoadMore,
  onLike,
    onComment,
    onShare,
  onBookmark,
  onVideoFocusChange = () => {}, // Provide default function to prevent errors
  onExitFullscreen,
  onProfilePress,
  onDelete,
  currentUserId,
  initialIndex = 0,
  initialPosition,
  onInitialVideoReady,
  fullScreenMode = false,
  containerHeight,
  banners = [],
  bannerInterval = 7,
}: VideoFeedProps) {
  
  // Ensure the function is safe to call
  const safeOnVideoFocusChange = useCallback((videoId: string | null) => {
    try {
      if (onVideoFocusChange && typeof onVideoFocusChange === 'function') {
        onVideoFocusChange(videoId);
      }
    } catch (error) {
      warn('[VideoFeed] Error calling onVideoFocusChange:', error);
    }
  }, [onVideoFocusChange]);
  
  const { width: windowWidth } = useWindowDimensions();
  // One video per screen height: full window in fullscreen modal, else leave space for header
  const videoHeight = fullScreenMode
    ? FULLSCREEN_VIDEO_HEIGHT
    : (typeof containerHeight === 'number' && containerHeight > 0 ? containerHeight : FULL_VIDEO_HEIGHT);
  
  const maxMixedIndex = useMemo(
    () => Math.max(0, mixedFeedItemCount(videos.length, banners, bannerInterval) - 1),
    [videos.length, banners, bannerInterval]
  );

  // initialIndex is a FlatList index into the mixed feed (videos + banners), not a video-only index.
  const clampedInitialIndex = Math.max(0, Math.min(initialIndex, maxMixedIndex));

  const [activeVideoIndex, setActiveVideoIndex] = useState(clampedInitialIndex);
  const [isImmersiveMode, setIsImmersiveMode] = useState(true);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const initialScrollDoneRef = useRef(!fullScreenMode || clampedInitialIndex === 0);
  const scrollYRef = useRef(0);
  const scrollDirectionRef = useRef<'up' | 'down'>('down');

  // Scroll when opening fullscreen or when parent resolves a new mixed index (e.g. profile deep link after list loads).
  useEffect(() => {
    if (!fullScreenMode || videos.length === 0) return;
    const index = clampedInitialIndex;
    setActiveVideoIndex(index);
    initialScrollDoneRef.current = false;
    const t = setTimeout(() => {
      flatListRef.current?.scrollToOffset({
        offset: index * videoHeight,
        animated: false,
      });
      initialScrollDoneRef.current = true;
    }, index > 0 ? 120 : 0);
    return () => clearTimeout(t);
  }, [fullScreenMode, clampedInitialIndex, videoHeight, videos.length]);
  
  // Use global mute state from VideoContext
  const videoContext = useVideoContext();
  const { isGlobalMuted, toggleGlobalMute } = videoContext || {
    isGlobalMuted: true,
    toggleGlobalMute: () => {},
  };
  
  // Safely get theme colors with fallback
  const themeContext = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  
  const safeThemeColors = themeContext?.themeColors || {
    surface: '#000000',
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.7)',
    surfaceVariant: 'rgba(255,255,255,0.1)',
    border: 'rgba(255,255,255,0.1)',
    primary: '#007AFF'
  };

  // Safety check to ensure theme context is ready (after all hooks)
  if (!themeContext) {
    return null; // Don't render until theme context is ready
  }

  // Type for mixed feed items (video or banner)
  type FeedItem = 
    | { type: 'video'; data: VideoPost }
    | { type: 'banner'; data: PromoBanner };

  // Create mixed feed with banners inserted at intervals
  const mixedFeed: FeedItem[] = useMemo(() => {
    if (!banners || banners.length === 0) {
      // No banners, just wrap videos
      return videos.map(video => ({ type: 'video' as const, data: video }));
    }

    const result: FeedItem[] = [];
    let bannerIndex = 0;

    for (let i = 0; i < videos.length; i++) {
      result.push({ type: 'video', data: videos[i] });
      
      // Insert banner after every 'bannerInterval' videos (not at the very start or end)
      if ((i + 1) % bannerInterval === 0 && i < videos.length - 1 && banners.length > 0) {
        const banner = banners[bannerIndex % banners.length];
        result.push({ type: 'banner', data: banner });
        bannerIndex++;
      }
    }

    log('[VideoFeed] Mixed feed created:', result.length, 'items (', videos.length, 'videos +', result.length - videos.length, 'banners)');
    return result;
  }, [videos, banners, bannerInterval]);

  // Default action handlers
  const handleLike = (postId: string) => {
    if (onLike) {
      const video = videos.find(v => v.id === postId);
      onLike(postId, !video?.is_liked);
    } else {
      log('Like action for post:', postId);
      // TODO: Implement default like functionality
    }
  };

  const handleComment = (post: VideoPost) => {
    // Comments are now handled inline in VideoItem
    if (onComment) {
      onComment(post);
    } else {
      log('Comment action for post:', post.id);
    }
  };

  const handleSave = (postId: string) => {
    if (onBookmark) {
      const video = videos.find(v => v.id === postId);
      onBookmark(postId, !video?.is_bookmarked);
    } else {
      log('Save/bookmark action for post:', postId);
      // TODO: Implement default bookmark functionality
    }
  };

  const handleShare = async (post: VideoPost) => {
    if (onShare) {
      onShare(post);
    } else {
      try {
        // Create deep link that opens the app directly
        const deepLink = `nomlimingle://video/${post.id}`;
        const universalLink = `https://nomlimingle.app/video/${post.id}`;
        const appStoreUrl = Platform.OS === 'ios' 
          ? 'https://apps.apple.com/app/nomli-mingle/id123456789' // Replace with actual App Store ID
          : 'https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en';
        
        const shareContent = {
          title: `Video by @${post.user.username} on Nomli Mingle`,
          message: `${post.description || 'Check out this video!'}\n\n📱 View in Nomli Mingle app: ${universalLink}\n\nGet Nomli Mingle: ${appStoreUrl}\n\n#NomliMingle #Video`,
          url: universalLink, // Use universal link - opens app if installed
        };

        const result = await Share.share(shareContent);

        if (result.action === Share.sharedAction) {
          log('Video shared successfully');
        }
    } catch (error) {
        error('Error sharing video:', error);
        Alert.alert('Error', 'Failed to share video');
      }
    }
  };

  const handleProfilePress = (userId: string) => {
    if (onProfilePress) {
      onProfilePress(userId);
    } else {
      log('Profile press for user:', userId);
      // TODO: Navigate to user profile
    }
  };

  // Handle immersive mode when component mounts/unmounts
  useFocusEffect(
    useCallback(() => {
      // Enter immersive mode when video feed is focused
      setIsImmersiveMode(true);
      setIsScreenFocused(true);
      // Note: Don't call onVideoFocusChange here as it should be called per video item

      // Hide status bar for full immersion
      if (Platform.OS === 'android') {
        SystemUI.setBackgroundColorAsync('transparent');
      }

      return () => {
        // Exit immersive mode when leaving video feed
        setIsImmersiveMode(false);
        setIsScreenFocused(false);
        safeOnVideoFocusChange(null); // Clear any focused video when leaving
      };
    }, [safeOnVideoFocusChange])
  );

  // Smooth viewability: switch active video based on scroll direction for instant playback
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (fullScreenMode && !initialScrollDoneRef.current) return;
    if (viewableItems.length === 0) return;
    
    // Use requestAnimationFrame for smooth state update (doesn't block scroll)
    requestAnimationFrame(() => {
      const goingDown = scrollDirectionRef.current === 'down';
      const idx =
        viewableItems.length === 1
          ? (viewableItems[0].index ?? 0)
          : goingDown
            ? (viewableItems[viewableItems.length - 1]?.index ?? viewableItems[0].index ?? 0)
            : (viewableItems[0]?.index ?? 0);
      
      setActiveVideoIndex(idx);
    });
  }, [fullScreenMode]);

  // Track scroll direction smoothly (used for determining which video to activate)
  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      if (y !== scrollYRef.current) {
        scrollDirectionRef.current = y > scrollYRef.current ? 'down' : 'up';
        scrollYRef.current = y;
      }
    },
    []
  );

  // Fallback: when scroll ends, compute active index from position (onViewableItemsChanged
  // can miss updates during fast scrolling, leaving some videos stuck as inactive)
  const syncActiveIndexFromScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      if (fullScreenMode && !initialScrollDoneRef.current) return;
      const offsetY = e.nativeEvent.contentOffset.y;
      const idx = Math.round(offsetY / videoHeight);
      const clamped = Math.max(0, Math.min(idx, mixedFeed.length - 1));
      setActiveVideoIndex(clamped);
    },
    [fullScreenMode, videoHeight, mixedFeed.length]
  );

  // Viewability: must be STABLE - React Native does not support changing viewabilityConfig on the fly
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 0,
  }).current;

  const toggleMute = () => {
    // Use global mute toggle - this will apply to all videos
    toggleGlobalMute();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Render a single video item
  const renderSingleVideoItem = (item: VideoPost, index: number) => {
    // Safety: guard against invalid items in the videos array
    if (!item || !item.id) {
      if (__DEV__) {
        warn('[VideoFeed] Skipping invalid video item at index', index, 'item:', item);
      }
      return null;
    }

    // Preload adjacent videos for smooth transitions (TikTok-style)
    const isActive = index === activeVideoIndex;
    const isAdjacent = Math.abs(index - activeVideoIndex) <= 2; // Preload ±2 for smoother fast scrolls
    const isVisibleForLoad = isActive || isAdjacent;

    return (
      <VideoItem
        item={item}
        index={index}
        isVisible={isVisibleForLoad}
        shouldPlay={isActive && isScreenFocused} // Only play when active AND screen is focused
        isMuted={isGlobalMuted}
        onToggleMute={toggleMute}
        onExitFullscreen={onExitFullscreen}
        onLike={handleLike}
        onComment={handleComment}
        onSave={handleSave}
        onShare={handleShare}
        onProfilePress={handleProfilePress}
        onDelete={onDelete}
        onVideoFocusChange={isActive ? safeOnVideoFocusChange : undefined} // Only call focus change for active video
        currentUserId={currentUserId}
        containerHeight={videoHeight}
        fullScreenMode={fullScreenMode}
        windowWidth={windowWidth}
        initialPosition={index === initialIndex ? initialPosition : undefined}
        onInitialVideoReady={index === initialIndex ? onInitialVideoReady : undefined}
      />
    );
  };

  // Render a banner item
  const renderBannerItem = (banner: PromoBanner, index: number) => {
    return (
      <PromoBannerComponent
        banner={banner}
        fullScreen={fullScreenMode}
        containerHeight={videoHeight}
      />
    );
  };

  // Main render function that handles both videos and banners
  const renderFeedItem = ({ item, index }: { item: FeedItem; index: number }) => {
    if (item.type === 'banner') {
      return renderBannerItem(item.data as PromoBanner, index);
    }
    return renderSingleVideoItem(item.data as VideoPost, index);
  };

  // Early return for empty state
  if (videos.length === 0) {
    return (
      <View style={[styles.emptyState, { backgroundColor: '#000000' }]}>
        <View style={styles.emptyStateContent}>
          {/* Icon with better visibility */}
          <View style={styles.emptyStateIconContainer}>
            <VideoIcon size={80} color="#FFFFFF" strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyStateTitle, { color: '#FFFFFF' }]}>
            No Videos Yet
          </Text>
          <Text style={[styles.emptyStateSubtitle, { color: 'rgba(255, 255, 255, 0.8)' }]}>
            Be the first to share a video!{'\n'}
            Tap the + button to create your first video post.
          </Text>
        </View>
      </View>
    );
  }

       return (
    <GestureHandlerRootView style={[styles.container, { width: windowWidth, maxWidth: windowWidth }]}>
      <StatusBar hidden={isImmersiveMode} />
        <FlatList
        ref={flatListRef}
        data={mixedFeed}
          style={{ width: windowWidth }}
          contentContainerStyle={{ width: windowWidth }}
          initialScrollIndex={fullScreenMode ? Math.min(initialIndex, Math.max(0, mixedFeed.length - 1)) : 0}
          renderItem={renderFeedItem}
          keyExtractor={(item, index) => {
            // Safety: ensure we always return a key even if item is malformed
            if (!item || !item.data) {
              if (__DEV__) {
                warn('[VideoFeed] keyExtractor received invalid item at index', index, 'item:', item);
              }
              return `feed-invalid-${index}`;
            }
            // Use different prefixes for videos and banners
            if (item.type === 'banner') {
              return `banner-${item.data.id}-${index}`;
            }
            return `video-${item.data.id}`;
          }}
          pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={videoHeight}
          snapToAlignment="start"
          decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={syncActiveIndexFromScroll}
        onScrollEndDrag={syncActiveIndexFromScroll}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            ) : undefined
          }
        // Remove any content insets for full screen
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        // Video feed optimizations: prioritize scroll smoothness over memory
        removeClippedSubviews={false} // Keep items mounted for smoother scroll (no mount/unmount jank)
        maxToRenderPerBatch={3} // Render 3 per batch for faster fill
        initialNumToRender={3} // Current + 2 more for instant adjacent playback
        windowSize={5} // 2 above + current + 2 below for smoother fast scrolling
        updateCellsBatchingPeriod={50}
        getItemLayout={(data, index) => ({
          length: videoHeight,
          offset: videoHeight * index,
          index,
        })}
      />

      {/* Status Bar Management */}
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
        hidden={isImmersiveMode}
      />

      {/* Comments Modal */}
      {/* Removed as comments are now inline */}
     </GestureHandlerRootView>
   );
 }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  videoContainer: {
    width: SCREEN_WIDTH,
    maxWidth: SCREEN_WIDTH,
    height: FULL_VIDEO_HEIGHT,
    backgroundColor: '#000',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
    maxWidth: SCREEN_WIDTH,
    maxHeight: FULL_VIDEO_HEIGHT,
  },
  videoWrapperBase: {
    overflow: 'hidden',
    width: '100%',
  },
  videoFillWrapper: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
  },
  fullscreenPlayButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -40,
    marginLeft: -40,
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenPlayInner: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingLeft: 16,
    paddingRight: 80, // Leave space for action buttons on right
    paddingBottom: 20,
    zIndex: 4,
    pointerEvents: 'auto',
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDetails: {
    flexShrink: 1,
    marginLeft: 10,
  },
  username: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  displayName: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '400',
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    gap: 4,
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  followButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  descriptionContainer: {
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 18,
    marginBottom: 6,
    fontWeight: '400',
  },
  tags: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
    marginBottom: 6,
  },
  locationContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  locationText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '400',
  },
  timestamp: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
  },
  actionButtons: {
    position: 'absolute',
    bottom: 0,
    right: 20,
    alignItems: 'center',
    zIndex: 5,
    pointerEvents: 'auto',
  },
  actionButton: {
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  likeBurstOnIcon: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -22,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  doubleTapHeartContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 8,
  },
  actionButtonContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'center',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  loadingText: {
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  exitButtonContainer: {
     position: 'absolute',
    left: 10,
    zIndex: 10,
  },
  exitButton: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },


  actionButtonContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 280, // Better positioning above action buttons
    left: 16,
    right: 80, // Leave space for action buttons on right
    zIndex: 6,
    pointerEvents: 'auto',
    maxWidth: 200, // Compact progress bar
  },
  progressBar: {
    height: 20, // Increased height for better touch targets
    position: 'relative',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 3, // Slightly thicker track
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  progressFill: {
    position: 'absolute',
    top: 8.5, // Center the fill
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  progressSeeker: {
    position: 'absolute',
    top: 3.5, // Center the seeker
    width: 16, // Larger seeker for better touch
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  commentsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
  },
  commentsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    minHeight: 0,
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingTop: 4,
  },
  dragIndicator: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -15,
    width: 30,
    height: 4,
    borderRadius: 2,
  },
  commentsCloseButton: {
    padding: 8,
  },
  commentsTitle: {
    fontSize: 18,
     fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  commentsList: {
    flex: 1,
    minHeight: 0,
  },
  commentsListContent: {
    paddingBottom: 16,
    flexGrow: 1,
  },
  emptyComments: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyCommentsText: {
    fontSize: 16,
    marginTop: 10,
  },
  emptyCommentsSubtext: {
    fontSize: 14,
    marginTop: 5,
  },
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: 10,
  },
  commentAvatarImage: {
    width: '100%',
    height: '100%',
  },
  commentAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  commentUsername: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  commentTime: {
    fontSize: 12,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 18,
  },
  commentActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  commentAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
  },
  commentActionText: {
    fontSize: 12,
    marginLeft: 4,
  },
  likedCommentText: {
    color: '#FF0050',
  },
  addCommentButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addCommentText: {
    fontSize: 16,
    marginLeft: 8,
  },
  commentInputContainer: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  quickEmojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  quickEmojiButton: {
    padding: 6,
  },
  quickEmoji: {
    fontSize: 22,
  },
  commentInputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 24,
    maxWidth: 360,
    alignSelf: 'center',
    width: '100%',
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 36,
    maxHeight: 100,
  },
  sendButton: {
    padding: 8,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  sendButtonActive: {
    borderRadius: 15,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  commentButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Highlight when comments exist
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateContent: {
    alignItems: 'center',
  },
  emptyStateIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 50,
    padding: 20,
    marginBottom: 10,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 22,
   },
  commentHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  commentOwnerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentActionButton: {
    padding: 4,
  },
  editCommentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  editCommentInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  editCommentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  editActionButton: {
    padding: 8,
    borderRadius: 12,
  },
  likeSection: {
    alignItems: 'center',
  },
  videoControlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  playButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 50,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  videoTimeDisplay: {
    position: 'absolute',
    bottom: 320, // Position above the progress bar
    left: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 6,
  },
  timeDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTimeText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  timeSeparator: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    marginHorizontal: 6,
    fontWeight: '400',
  },
  locationContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  locationText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24, // Increased horizontal padding
    paddingBottom: 20, // Better bottom spacing
    zIndex: 5,
    pointerEvents: 'auto',
  },
  userInfoCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backdropFilter: 'blur(10px)',
  },
  descriptionCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    padding: 16,
    backdropFilter: 'blur(10px)',
  },
  likedButton: {
    backgroundColor: 'rgba(255, 0, 80, 0.2)',
    borderColor: 'rgba(255, 0, 80, 0.3)',
  },
  bookmarkedButton: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  commentButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },

});