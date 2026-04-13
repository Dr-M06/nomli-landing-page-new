import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  AppState,
  AppStateStatus,
  Alert,
  Platform,
} from 'react-native';
import AnimatedReanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Video, ResizeMode, Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import { Zap, MessageCircle, Share2, Bookmark, User, Video as VideoIcon, Play, Pause, Volume2, VolumeX, MoreVertical, Maximize2, Lock, Eye, Pin, PinOff, Trash2 } from 'lucide-react-native';
import { useDoubleTap } from '../hooks/useDoubleTap';
import DoubleTapHeart from './DoubleTapHeart';
import * as Haptics from 'expo-haptics';
import { formatTimeAgo, formatViewCountLabel } from '../utils/formatters';
import { getThemeColors } from '../constants/Colors';
import { useVideoContext } from '../contexts/VideoContext';
import { FontFamily } from '../constants/Theme';
import AppWatermark from './AppWatermark';
import PostReactionsList from './PostReactionsList';
import PostReactionsCounter from './PostReactionsCounter';
import ReactionPicker, { ReactionType as PickerReactionType } from './ReactionPicker';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../utils/supabase';
import EnhancedAvatar from './EnhancedAvatar';
import Toast from 'react-native-toast-message';
import { toggleReaction, getUserReaction, getReactionCounts } from '../utils/reactionUtils';
import { stripAtSymbol } from '../utils/contentFilter';
import { queueViewCount } from '../utils/viewCountBatch';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** ~feed card insets so portrait height matches visible width (reduces side pillarboxing) */
const VIDEO_INNER_WIDTH = SCREEN_WIDTH;
const ZAP_ACTIVE = '#FACC15';

interface VideoPostItemProps {
  video: any;
  user: any;
  themeColors: any;
  onLike: (postId: string) => void;
  onBookmark: (postId: string) => void;
  onShare: (post: any) => void;
  onComment: () => void;
  onUserPress: (userId: string) => void;
  onPostMenuPress?: (postId: string) => void;
  setShowCommentsDisabledModal?: (show: boolean) => void;
  commentsDisabledScale?: Animated.Value;
  commentsDisabledOpacity?: Animated.Value;
  onPinPost?: (postId: string) => void;
  onUnpinPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  setPosts?: React.Dispatch<React.SetStateAction<any[]>>;
  isInView?: boolean; // Whether this video is currently in view (from FlatList)
  autoPlay?: boolean; // Whether to auto-play when in view (TikTok-style)
  forceMute?: boolean; // Force mute when story is playing or on other screens
  isScreenFocused?: boolean; // Whether the screen is currently focused (prevents flicker on exit)
  /** Open TikTok-style fullscreen (scroll up/down for next/prev) instead of native fullscreen. */
  onRequestFullscreenFeed?: (initialIndex: number, initialPosition?: number) => void;
  /** Index of this video in the feed (for fullscreen modal start position). */
  currentVideoIndex?: number;
  /** When true, video shrinks to PIP (e.g. when comments are expanded on community). */
  commentsExpanded?: boolean;
}

const VideoPostItem: React.FC<VideoPostItemProps> = ({
  video,
  user,
  themeColors,
  onLike,
  onBookmark,
  onShare,
  onComment,
  onUserPress,
  onPostMenuPress,
  setShowCommentsDisabledModal,
  commentsDisabledScale,
  commentsDisabledOpacity,
  onPinPost,
  onUnpinPost,
  onDeletePost,
  setPosts,
  isInView: propIsInView,
  autoPlay: enableAutoPlay = false,
  forceMute = false,
  isScreenFocused = true, // Default to true to show play icon normally
  onRequestFullscreenFeed,
  currentVideoIndex = 0,
  commentsExpanded = false,
}) => {
  // If video_url is null, don't render video component
  if (!video || !video.video_url || video.video_url === null) {
    // This is not a video post - will be handled by regular post renderer
    return null;
  }
  
  const videoContext = useVideoContext();
  const { currentlyPlayingVideoId, setCurrentlyPlayingVideo, isGlobalMuted, toggleGlobalMute, isFullscreenModalOpen, fullscreenVideoReadyToTakeOver } = videoContext || {
    currentlyPlayingVideoId: null,
    setCurrentlyPlayingVideo: () => {},
    isGlobalMuted: true,
    toggleGlobalMute: () => {},
    isFullscreenModalOpen: false,
    fullscreenVideoReadyToTakeOver: false,
  };
  
  const { isDarkMode } = useTheme();
  const safeThemeColors = themeColors || getThemeColors(isDarkMode);
  const router = useRouter();
  
  const [isLiked, setIsLiked] = useState(video.liked_by_user || false);
  const [isBookmarked, setIsBookmarked] = useState(video.bookmarked || video.is_bookmarked || false);
  const [likesCount, setLikesCount] = useState(video.likes_count || 0);
  const [viewsCount, setViewsCount] = useState(video.views_count || 0);
  const [bookmarksCount, setBookmarksCount] = useState(video.bookmarks_count || 0);
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  const isAdultContent = !!(video.adult_content === true || video.adult_content === 1);
  const showAdultOverlay = isAdultContent && !sensitiveRevealed;
  
  // Reaction state
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionPickerPosition, setReactionPickerPosition] = useState({ x: 0, y: 0 });
  const [userReaction, setUserReaction] = useState<'like' | 'laugh' | null>(null); // Removed 'love'
  const [reactionCounts, setReactionCounts] = useState({ likes: 0, loves: 0, laughs: 0 }); // Keep loves for backward compatibility with existing data
  const likeButtonRef = useRef<TouchableOpacity>(null);
  
  // Double-tap to like state
  const [showHeart, setShowHeart] = useState(false);
  const [heartPosition, setHeartPosition] = useState({ x: 0, y: 0 });
  
  // Keep ref in sync with state
  useEffect(() => {
    viewsCountRef.current = viewsCount;
  }, [viewsCount]);

  // Sync viewsCount with video prop updates, but preserve local increments
  // Only update if prop value is higher than current state (prevents resetting to lower/stale value)
  useEffect(() => {
    const propViews = video.views_count || 0;
    const currentViews = viewsCountRef.current;
    
    // Only update if the prop value is higher (from database refresh)
    // This prevents resetting when prop updates with stale data
    // CRITICAL: Never decrease view count - only increase
    if (propViews > currentViews) {
      log(`[VideoPostItem] Syncing viewsCount from prop: ${currentViews} -> ${propViews} (prop was higher)`);
      setViewsCount(propViews);
      viewsCountRef.current = propViews;
    }
    // If prop is same or lower, keep our local state (preserves increments)
    // This ensures view counts NEVER decrease
  }, [video.views_count, video.id]); // Update when views_count or video ID changes

  // Update bookmark count when video prop changes
  useEffect(() => {
    if (video.bookmarks_count !== undefined) {
      setBookmarksCount(video.bookmarks_count);
    }
    if (video.bookmarked !== undefined || video.is_bookmarked !== undefined) {
      setIsBookmarked(video.bookmarked || video.is_bookmarked || false);
    }
  }, [video.bookmarks_count, video.bookmarked, video.is_bookmarked, video.id]);

  // Sync like state from video prop so red heart is correct after refresh or when parent updates (e.g. from feed)
  useEffect(() => {
    const propLiked = video.liked_by_user ?? video.is_liked ?? false;
    setIsLiked(propLiked);
    if (video.likes_count !== undefined) {
      setLikesCount(video.likes_count);
    }
  }, [video.id, video.liked_by_user, video.is_liked, video.likes_count]);

  const [likedByUsername, setLikedByUsername] = useState<string | undefined>(video.liked_by_username);
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [hasVideoFinished, setHasVideoFinished] = useState(false);
  // 🚀 TIKTOK-STYLE: Progressive playback state
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [shouldStartPlaying, setShouldStartPlaying] = useState(false);
  const hasStartedProgressivePlayRef = useRef(false);
  // Use global mute state from VideoContext instead of local state
  const [showControls, setShowControls] = useState(true);
  const [isInView, setIsInView] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
  // Prevent play icon flicker during screen transitions
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastIsInViewRef = useRef<boolean>(false);
  const [resizeMode, setResizeMode] = useState<ResizeMode>(ResizeMode.CONTAIN);

  // Height from real aspect ratio: portrait uses full column width so video spans edge-to-edge without side bars;
  // when ideal height exceeds max, we cap height and use COVER (trim top/bottom only).
  const { fullHeight, videoUsesCover } = useMemo(() => {
    if (videoAspectRatio && videoAspectRatio > 0) {
      const idealH = VIDEO_INNER_WIDTH / videoAspectRatio;
      const isPortrait = videoAspectRatio < 1;
      const maxPortrait = SCREEN_HEIGHT * 0.72;
      const maxLandscape = SCREEN_HEIGHT * 0.46;
      const minLandscape = SCREEN_HEIGHT * 0.24;
      if (isPortrait) {
        if (idealH <= maxPortrait) {
          return { fullHeight: idealH, videoUsesCover: false };
        }
        return { fullHeight: maxPortrait, videoUsesCover: true };
      }
      const h = Math.max(minLandscape, Math.min(idealH, maxLandscape));
      return { fullHeight: h, videoUsesCover: idealH > maxLandscape };
    }
    return { fullHeight: SCREEN_HEIGHT * 0.38, videoUsesCover: false };
  }, [videoAspectRatio]);

  useEffect(() => {
    setResizeMode(videoUsesCover ? ResizeMode.COVER : ResizeMode.CONTAIN);
  }, [videoUsesCover]);

  const PIP_WIDTH = 100;
  const PIP_HEIGHT = 140;
  const pipTop = 12; // PIP offset from top of video block (like VideoFeed's pipTop from safe area)
  const pipBorderRadius = 12;

  const PIP_TOTAL_HEIGHT = pipTop + PIP_HEIGHT;
  const videoPipActive = useSharedValue(commentsExpanded ? 1 : 0);
  const widthSv = useSharedValue(SCREEN_WIDTH);
  const heightSv = useSharedValue(fullHeight);
  const fullHeightSv = useSharedValue(fullHeight);
  const pipTotalHeightSv = useSharedValue(PIP_TOTAL_HEIGHT);
  useEffect(() => {
    widthSv.value = VIDEO_INNER_WIDTH;
    heightSv.value = fullHeight;
    fullHeightSv.value = fullHeight;
    pipTotalHeightSv.value = PIP_TOTAL_HEIGHT;
  }, [fullHeight, widthSv, heightSv, fullHeightSv, pipTotalHeightSv, PIP_TOTAL_HEIGHT]);
  useEffect(() => {
    videoPipActive.value = withTiming(commentsExpanded ? 1 : 0, { duration: 280 });
  }, [commentsExpanded, videoPipActive]);

  // When PIP is active, shrink outer container so comment panel and input move up (no scroll needed)
  const animatedOuterContainerStyle = useAnimatedStyle(() => {
    'worklet';
    const active = videoPipActive.value;
    const h = fullHeightSv.value + (pipTotalHeightSv.value - fullHeightSv.value) * active;
    return {
      height: h,
      overflow: 'hidden' as const,
    };
  });

  const animatedVideoWrapperStyle = useAnimatedStyle(() => {
    'worklet';
    const active = videoPipActive.value;
    const w = widthSv.value;
    const pipLeft = (SCREEN_WIDTH - PIP_WIDTH) / 2;
    const sideInset = (SCREEN_WIDTH - w) / 2;
    return {
      position: 'absolute' as const,
      top: active * pipTop,
      left: active ? pipLeft : sideInset,
      right: active ? undefined : sideInset,
      bottom: active ? undefined : 0,
      width: active ? PIP_WIDTH : w,
      height: active ? PIP_HEIGHT : heightSv.value,
      borderRadius: active * pipBorderRadius,
      overflow: 'hidden' as const,
      zIndex: active ? 20 : 0,
    };
  });
  
  // Load user reaction and counts on mount and when video changes
  useEffect(() => {
    const loadReactions = async () => {
      try {
        // Always fetch reaction counts (even for guests)
        const counts = await getReactionCounts(video.id);
        setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
        
        // Update likesCount to match total reactions
        const totalReactions = counts.likes + counts.loves + counts.laughs;
        setLikesCount(totalReactions);
        
        // Only fetch user reaction if user is logged in
        if (user?.id) {
          const reaction = await getUserReaction(video.id);
          setUserReaction(reaction);
          setIsLiked(!!reaction);
        }
      } catch (error) {
        error('[VideoPostItem] Error loading reactions:', error);
        // Fallback to video.likes_count if available (for backwards compatibility)
        if (video.likes_count !== undefined) {
          setReactionCounts({ likes: video.likes_count || 0, loves: 0, laughs: 0 });
        }
      }
    };
    loadReactions();
  }, [video.id, user?.id]);

  const videoRef = useRef<Video>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<View>(null);
  const playIconScale = useRef(new Animated.Value(1)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const viewsCountRef = useRef(video.views_count || 0);
  const lastVideoUrlRef = useRef<string | null>(null);
  const lastVideoSourceRef = useRef<{ uri: string } | null>(null);
  const hasDecoderErrorRef = useRef<boolean>(false);
  const autoPlayInFlightRef = useRef<boolean>(false);
  
  // View counting: batched updates (not real-time)
  const viewStartTimeRef = useRef<number | null>(null); // Track when video started playing
  const loopCountRef = useRef<number>(0); // Track video loops for silent view increments
  const MIN_VIEW_DURATION = 1000; // Count view after 1 second of watch time
  
  const isOwner = user && video.user_id === user.id;

  // Use prop isInView if provided (from FlatList), otherwise fall back to local checkVisibility.
  // IMPORTANT: Do not default the prop in destructuring, otherwise it's never "undefined" and fallback won't work.
  const effectiveIsInView = propIsInView ?? isInView;

  // Defer "Liked by" fetch until video is in view (reduces mount-time work during scroll = smoother playback)
  useEffect(() => {
    if (!effectiveIsInView || likesCount === 0 || likedByUsername) return;
    const t = setTimeout(async () => {
      try {
        let likerUserIds: string[] = [];
        const { data: reactions } = await supabase
          .from('post_reactions')
          .select('user_id')
          .eq('post_id', video.id)
          .order('created_at', { ascending: true })
          .limit(10);
        if (reactions?.length > 0) {
          likerUserIds = reactions.map((r: { user_id: string }) => r.user_id);
        } else {
          const { data: likes } = await supabase
            .from('post_likes')
            .select('user_id')
            .eq('post_id', video.id)
            .order('created_at', { ascending: true })
            .limit(10);
          if (likes?.length > 0) likerUserIds = likes.map((l: { user_id: string }) => l.user_id);
        }
        // Exclude placeholder accounts so we never show "Liked by Placeholder"
        if (likerUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, is_placeholder')
            .in('id', likerUserIds);
          const profileMap = (profiles || []).reduce((acc: Record<string, { username?: string; full_name?: string; is_placeholder?: boolean }>, p: any) => {
            acc[p.id] = p;
            return acc;
          }, {});
          const firstRealId = likerUserIds.find(id => !profileMap[id]?.is_placeholder);
          const firstReal = firstRealId ? profileMap[firstRealId] : null;
          if (firstReal) setLikedByUsername(firstReal.username || firstReal.full_name || 'someone');
        }
      } catch (e) {
        // ignore
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [video.id, likesCount, likedByUsername, effectiveIsInView]);

  // Memoize video source to prevent unnecessary reloads when video_url hasn't changed
  const videoSource = useMemo(() => {
    const currentUrl = video.video_url;
    // Only update if URL actually changed
    if (currentUrl === lastVideoUrlRef.current && lastVideoSourceRef.current) {
      // Return the same source object reference to prevent reload
      return lastVideoSourceRef.current;
    }
    // URL changed or first render - create new source object
    lastVideoUrlRef.current = currentUrl;
    hasDecoderErrorRef.current = false; // Reset decoder error flag when URL changes
    const newSource = currentUrl ? { uri: currentUrl } : null;
    lastVideoSourceRef.current = newSource;
    return newSource;
  }, [video.video_url]);

  // Single source of truth for starting playback: always normal speed (rate 1.0), no slow motion.
  // Set rate first then shouldPlay so iOS respects rate for videos that loaded from source prop (e.g. 2nd+ in feed).
  const startPlayback = useCallback(async () => {
    if (!videoRef.current || hasDecoderErrorRef.current) return;
    try {
      await videoRef.current.setStatusAsync({ rate: 1.0 });
      await videoRef.current.setStatusAsync({
        shouldPlay: true,
        rate: 1.0,
        isMuted: forceMute || isGlobalMuted,
        volume: forceMute || isGlobalMuted ? 0 : 1,
      });
      setCurrentlyPlayingVideo(video.id);
      setIsPlaying(true);
      setShowControls(false);
      viewStartTimeRef.current = Date.now();
    } catch (e) {
      // ignore
    }
  }, [video.id, forceMute, isGlobalMuted]);

  // Single source of truth for stopping: mute + pause so audio never bleeds
  const stopPlayback = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      await videoRef.current.setStatusAsync({ shouldPlay: false, isMuted: true });
      await videoRef.current.pauseAsync();
    } catch (e) {
      // ignore
    }
    if (currentlyPlayingVideoId === video.id) setCurrentlyPlayingVideo(null);
    setIsPlaying(false);
    viewStartTimeRef.current = null;
  }, [video.id, currentlyPlayingVideoId, setCurrentlyPlayingVideo]);

  // Auto-play when in view: load if needed (with rate 1.0), then start via imperative API only
  const handleAutoPlay = useCallback(async () => {
    if (!videoRef.current || isPlaying || hasVideoFinished) return;
    if (autoPlayInFlightRef.current) return;
    autoPlayInFlightRef.current = true;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (audioError) {
      // ignore
    }
    if (!isVideoReady) {
      try {
        await videoRef.current.loadAsync(
          { uri: video.video_url },
          { shouldPlay: false, isMuted: forceMute || isGlobalMuted, volume: forceMute || isGlobalMuted ? 0 : 1, rate: 1.0 },
          false
        );
        setIsVideoReady(true);
      } catch (loadError) {
        // iOS: Faster retry (500ms) for quicker reload, Android: Standard delay (1000ms)
        const retryDelay = Platform.OS === 'ios' ? 500 : 1000;
        setTimeout(async () => {
          try {
            await videoRef.current?.loadAsync(
              { uri: video.video_url },
              { shouldPlay: false, isMuted: forceMute || isGlobalMuted, volume: forceMute || isGlobalMuted ? 0 : 1, rate: 1.0 },
              false
            );
            setIsVideoReady(true);
          } catch (retryError) {
            // ignore
          }
        }, retryDelay);
        return;
      }
    }
    setShouldStartPlaying(true);
    hasStartedProgressivePlayRef.current = false;
    // Android reliability: ExoPlayer doesn't always report playableDurationMillis early enough to
    // satisfy our "bufferedPercent >= 5%" gate, so we kick off playback immediately.
    // iOS keeps the progressive buffer gate (smoother start).
    if (Platform.OS === 'android' || bufferedPercent >= 5) {
      await startPlayback();
    }
  }, [isPlaying, isVideoReady, hasVideoFinished, video.id, video.video_url, bufferedPercent, forceMute, isGlobalMuted, startPlayback]);
  
  // Auto-play video when it comes into view (TikTok-style)
  useEffect(() => {
    // IMPORTANT: On Android, some videos won't emit a reliable "loaded" state until we attempt playback.
    // So we don't gate autoplay on `isVideoReady`; `handleAutoPlay()` will load if needed.
    if (enableAutoPlay && effectiveIsInView && !isPlaying && !hasVideoFinished && !isFullscreenModalOpen) {
      // Only auto-play if no other video is playing or this is the currently visible one
      if (!currentlyPlayingVideoId || currentlyPlayingVideoId === video.id) {
        handleAutoPlay();
      }
    }
  }, [effectiveIsInView, enableAutoPlay, isPlaying, currentlyPlayingVideoId, video.id, hasVideoFinished, handleAutoPlay, isFullscreenModalOpen]);
  
  // Configure audio session when video starts playing (for iPhone X silent mode issue)
  useEffect(() => {
    if (isPlaying && effectiveIsInView) {
      // Configure audio session for iOS before playing video
      // This ensures sound plays even when silent switch is on
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true, // Play audio even when silent switch is on
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch((audioError) => {
        warn('⚠️ Failed to configure audio session:', audioError);
      });
    }
  }, [isPlaying, effectiveIsInView]);

  // Auto-pause video when it goes out of view or another video starts playing
  // Add debounce to prevent flickering during screen transitions
  useEffect(() => {
    const wasInView = lastIsInViewRef.current;
    const isNowInView = effectiveIsInView;
    
    // Detect transition state (rapid changes indicate screen exit/entry)
    if (wasInView !== isNowInView) {
      setIsTransitioning(true);
      
      // Clear any existing timeout
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      
      // Reset transition state after a delay
      transitionTimeoutRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, 300); // 300ms delay to prevent flicker during transitions
    }
    
    lastIsInViewRef.current = isNowInView;
    
    // Only stop playback if:
    // 1. Video is not in view, OR
    // 2. Another video is playing AND this video is playing AND screen is focused (prevent conflicts when navigating)
    // Don't react to currentlyPlayingVideoId changes if screen is not focused to prevent flickering during navigation
    const shouldStop = (!effectiveIsInView || 
      (isScreenFocused && currentlyPlayingVideoId && currentlyPlayingVideoId !== video.id && isPlaying)) && 
      isPlaying && 
      !isFullscreenModalOpen;
    
    if (shouldStop) {
      stopPlayback();
    }
    if (isFullscreenModalOpen && fullscreenVideoReadyToTakeOver && isPlaying) {
      stopPlayback();
    }
    
    // Cleanup timeouts on unmount or when dependencies change
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, [effectiveIsInView, isPlaying, currentlyPlayingVideoId, video.id, isFullscreenModalOpen, fullscreenVideoReadyToTakeOver, isScreenFocused, stopPlayback]);
  
  // Reset view tracking when video changes
  useEffect(() => {
    viewStartTimeRef.current = null;
    loopCountRef.current = 0;
  }, [video.id]);

  // Handle app state changes (pause when app goes to background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if ((nextAppState === 'background' || nextAppState === 'inactive') && isPlaying) {
        stopPlayback();
      }
    });
    return () => subscription.remove();
  }, [isPlaying, stopPlayback]);

  // Check if video is in viewport
  const checkVisibility = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.measureInWindow((x, y, width, height) => {
        const screenHeight = Dimensions.get('window').height;
        const isVisible = y >= -height / 2 && y <= screenHeight - height / 2;
        setIsInView(isVisible);
      });
    }
  }, []);

  // Check visibility on mount and when scrolling
  useEffect(() => {
    checkVisibility();
    const interval = setInterval(checkVisibility, 500);
    return () => clearInterval(interval);
  }, [checkVisibility]);

  // Smooth fade animation for controls
  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: showControls ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showControls]);

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (showControls && isPlaying) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup transition timeout
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    };
  }, []);

  // Static play icon (pulse loop removed for performance - was one loop per video in feed)
  useEffect(() => {
    playIconScale.stopAnimation(() => {
      playIconScale.setValue(1);
    });
  }, [isPlaying]);

  // Ensure views_count column exists (one-time check)
  const ensureViewsCountColumn = async () => {
    try {
      // Try to query the column - if it fails, it doesn't exist
      const { error: testError } = await supabase
        .from('posts')
        .select('views_count')
        .limit(1);
      
      if (testError && testError.code === '42703') {
        // Column doesn't exist, try to add it using RPC
        log('[VideoPostItem] views_count column missing, attempting to create...');
        const { error: rpcError } = await supabase.rpc('create_posts_table', {});
        
        if (rpcError) {
          // If RPC fails, try direct SQL (requires service role or proper permissions)
          warn('[VideoPostItem] RPC failed, column may need to be added manually:', rpcError);
        } else {
          log('[VideoPostItem] ✅ views_count column created successfully');
        }
      }
    } catch (error) {
      warn('[VideoPostItem] Could not ensure views_count column exists:', error);
    }
  };

  // Record view: when user is logged in and first view (not loop), use record_post_video_view
  // so the view is stored in post_video_views (recoverable). Loops and anonymous views use queueViewCount.
  const incrementViewCount = async (isLoop: boolean = false) => {
    if (!video?.id || !video?.video_url) return;

    const useDurableRecord = user?.id && !isLoop;

    if (useDurableRecord) {
      try {
        const { data: newCount, error } = await supabase.rpc('record_post_video_view', {
          p_post_id: video.id,
          p_user_id: user.id,
        });
        if (!error && typeof newCount === 'number' && newCount >= 0) {
          setViewsCount(newCount);
          viewsCountRef.current = newCount;
        }
        if (error && (error.code === '42883' || error.message?.includes('function') || error.message?.includes('does not exist'))) {
          await queueViewCount(video.id, 1);
        }
      } catch (_) {
        await queueViewCount(video.id, 1);
      }
    } else {
      await queueViewCount(video.id, 1);
    }

    if (isLoop) {
      loopCountRef.current += 1;
      log(`[VideoPostItem] Video loop ${loopCountRef.current} - view queued`);
    }
  };

  const handlePlayPause = async () => {
    try {
      if (!videoRef.current) return;
      if (isPlaying) {
        await stopPlayback();
        setShowControls(true);
      } else {
        incrementViewCount(false);
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } catch (audioError) {
          // ignore
        }
        if (hasVideoFinished) {
          setHasVideoFinished(false);
          await videoRef.current.setPositionAsync(0);
        }
        await startPlayback();
        setShowControls(true);
      }
    } catch (error) {
      setHasVideoFinished(false);
    }
  };

  // Handle double-tap to like
  const handleDoubleTap = useCallback((event: any) => {
    if (!user) {
      Alert.alert(
        'Login Required',
        'You need to login to react to posts. Would you like to login now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.push('/auth/signin') }
        ]
      );
      return;
    }

    // Get tap position
    const { pageX, pageY } = event.nativeEvent;
    setHeartPosition({ x: pageX, y: pageY });
    setShowHeart(true);

    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Like the post if not already liked
    if (userReaction !== 'like') {
      // Trigger like reaction using the same logic as ReactionPicker
      const reactionHandler = async () => {
        const previousReaction = userReaction;
        const previousCounts = { ...reactionCounts };
        
        // Optimistic update
        setUserReaction('like');
        setIsLiked(true);
        
        let newCounts = { ...previousCounts };
        if (previousReaction) {
          if (previousReaction === 'like') {
            newCounts.likes = Math.max(0, newCounts.likes - 1);
          } else if (previousReaction === 'love') {
            newCounts.loves = Math.max(0, newCounts.loves - 1);
          } else if (previousReaction === 'laugh') {
            newCounts.laughs = Math.max(0, newCounts.laughs - 1);
          }
        }
        newCounts.likes = (newCounts.likes || 0) + 1;
        setReactionCounts(newCounts);
        const totalReactions = newCounts.likes + newCounts.loves + newCounts.laughs;
        setLikesCount(totalReactions);
        
        try {
          await toggleReaction(video.id, 'like');
          // Refresh state
          const counts = await getReactionCounts(video.id);
          setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
          const newReaction = await getUserReaction(video.id);
          setUserReaction(newReaction);
          setIsLiked(newReaction === 'like');
          const total = counts.likes + counts.loves + counts.laughs;
          setLikesCount(total);
        } catch (error) {
          error('[VideoPostItem] Error toggling reaction:', error);
          setUserReaction(previousReaction);
          setReactionCounts(previousCounts);
          setIsLiked(!!previousReaction && previousReaction === 'like');
          const totalReactions = previousCounts.likes + previousCounts.loves + previousCounts.laughs;
          setLikesCount(totalReactions);
        }
      };
      reactionHandler();
    }
    // If already liked, just show the heart animation (don't unlike)
  }, [user, userReaction, reactionCounts, video.id, router]);

  // Handle single tap (toggle controls)
  const handleSingleTap = useCallback(() => {
    setShowControls(prev => !prev);
  }, []);

  // Double-tap hook
  const doubleTapHandlers = useDoubleTap({
    onDoubleTap: handleDoubleTap,
    onSingleTap: handleSingleTap,
    delay: 300,
  });

  const handleVideoTap = () => {
    // This is now handled by doubleTapHandlers
    // Keep for backwards compatibility if needed
    setShowControls(prev => !prev);
  };

  const handleMuteToggle = async () => {
    // Use global mute toggle - this will apply to all videos
    toggleGlobalMute();
  };

  // Sync video mute state with global mute state
  useEffect(() => {
    if (videoRef.current) {
      // If forceMute is true, mute the video
      // Otherwise, use global mute state
      const shouldMute = forceMute || isGlobalMuted;
      videoRef.current.setIsMutedAsync(shouldMute).catch((error) => {
        log('Video mute sync error:', error);
      });
    }
  }, [forceMute, isGlobalMuted]);

  const handleFullscreen = async () => {
    // TikTok-style: open fullscreen feed (scroll up/down for next/prev) when callback provided
    if (onRequestFullscreenFeed) {
      // Get current playback position so fullscreen can resume from where it was playing
      let currentPosition: number | undefined;
      try {
        const status = await videoRef.current?.getStatusAsync();
        if (status?.isLoaded && status.positionMillis !== undefined) {
          currentPosition = status.positionMillis;
        }
      } catch {
        // If we can't get position, fullscreen will start from beginning
      }
      onRequestFullscreenFeed(currentVideoIndex, currentPosition);
      return;
    }
    try {
      if (videoRef.current) {
        await videoRef.current.presentFullscreenPlayer();
      }
    } catch (error) {
      log('Fullscreen error:', error);
    }
  };

  // DISABLED: Predictive preloading - videos load only when visible
  // No preloading to avoid predictive scrolling behavior
  // useEffect(() => {
  //   // Preloading disabled - videos load only when visible
  // }, [video.video_url, video.id]);

  // 🚀 TIKTOK-STYLE: Mark video as watched when played
  useEffect(() => {
    if (isPlaying && video.id) {
      import('../utils/videoPreloadService').then(({ markVideoWatched }) => {
        markVideoWatched(video.id).catch(() => {});
      });
    }
  }, [isPlaying, video.id]);
  
  // Reset progressive playback state when video changes
  useEffect(() => {
    setBufferedPercent(0);
    setShouldStartPlaying(false);
    hasStartedProgressivePlayRef.current = false;
    setVideoAspectRatio(null);
  }, [video.id]);

  const handlePlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setIsVideoReady(true);
      
      // 🚀 TIKTOK-STYLE: Progressive playback - start playing when 5-10% buffered
      if (status.durationMillis && status.playableDurationMillis) {
        const buffered = (status.playableDurationMillis / status.durationMillis) * 100;
        setBufferedPercent(buffered);
        
        // Start playing when buffered enough (progressive playback)
        if (
          !hasStartedProgressivePlayRef.current &&
          !isPlaying &&
          shouldStartPlaying &&
          buffered >= 5 &&
          effectiveIsInView &&
          videoRef.current
        ) {
          hasStartedProgressivePlayRef.current = true;
          startPlayback().catch(() => {
            setIsPlaying(false);
            hasStartedProgressivePlayRef.current = false;
          });
        }
      }
      
      // Detect video dimensions and aspect ratio for proper display
      if (status.naturalSize && !videoAspectRatio) {
        const { width, height } = status.naturalSize;
        if (width && height && width > 0 && height > 0) {
          const aspectRatio = width / height;
          setVideoAspectRatio(aspectRatio);
          log(`📹 [VideoPostItem] Video dimensions detected: ${width}x${height}, aspect ratio: ${aspectRatio.toFixed(2)}`);
        }
      }
      
      // Track play time for view count (only count if watched for minimum duration)
      if (status.isPlaying && viewStartTimeRef.current) {
        const watchDuration = Date.now() - viewStartTimeRef.current;
        // Only count as view if watched for minimum duration (prevents counting quick scrolls)
        if (watchDuration >= MIN_VIEW_DURATION) {
          incrementViewCount(false); // First view
          viewStartTimeRef.current = null; // Reset after counting
        }
      }
      
      // TikTok-style: auto-replay when video ends and still in view (silently increment view on loop)
      if (status.didJustFinish && !hasVideoFinished) {
        if (effectiveIsInView && videoRef.current) {
          // Silently increment view count on loop
          incrementViewCount(true); // true = loop
          videoRef.current.setPositionAsync(0).then(() => startPlayback()).catch(() => {});
        } else {
          stopPlayback();
          setHasVideoFinished(true);
          setShowControls(true);
        }
      }
      // Enforce normal speed: if playing and rate is wrong, correct it
      if (status.isPlaying && status.rate != null && Math.abs(status.rate - 1.0) > 0.01 && videoRef.current) {
        videoRef.current.setStatusAsync({ rate: 1.0 }).catch(() => {});
      }
    }
  };

  const handleUserPress = () => {
    if (video.user_id) {
      onUserPress(video.user_id);
    }
  };

  const handlePostMenuPress = () => {
    if (onPostMenuPress) {
      onPostMenuPress(video.id);
    }
  };

  return (
    <View style={styles.container} ref={containerRef}>
      {/* User Header */}
      <View style={styles.userHeader}>
        <TouchableOpacity style={styles.userInfo} onPress={handleUserPress}>
          <EnhancedAvatar
            avatarUrl={video.user_avatar_url || video.user?.avatar_url}
            userId={video.user_id || video.user?.id}
            size={32}
            isDarkMode={isDarkMode}
            showBorder={false}
            isVerified={video.is_verified || video.profile?.is_verified || video.user?.is_verified || false}
            fullName={video.user?.display_name || video.user?.full_name}
            username={video.username || video.user?.username}
            email={(video as any).user_email || video.user?.email}
          />
          <View style={styles.userText}>
            <View style={styles.usernameRow}>
              <Text style={[styles.username, { color: themeColors.neutral.text }]}>
                @{(() => {
                  // Check all possible sources for username before showing fallback
                  const username = video.username || 
                                  video.user?.username || 
                                  video.profile?.username ||
                                  video.user?.display_name ||
                                  video.profile?.display_name ||
                                  video.profile?.full_name ||
                                  (video as any).user_email?.split('@')[0] ||
                                  (video.user_id ? `user_${video.user_id.substring(0, 8)}` : 'user');
                  
                  const cleaned = stripAtSymbol(username);
                  return cleaned || 'user';
                })()}
              </Text>
              <View style={styles.videoIndicator}>
                <VideoIcon size={12} color={themeColors.primary.main} />
              </View>
            </View>
            {video.created_at && (
              <Text style={[styles.postTime, { color: themeColors.neutral.textSecondary }]}>
                {formatTimeAgo(video.created_at)}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        
        <View style={styles.postActionsRow}>
          {/* Menu button - visible for post owner */}
          {isOwner && (
            <TouchableOpacity
              style={styles.postMenuButton}
              onPress={handlePostMenuPress}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <MoreVertical size={16} color={themeColors.neutral.subtext} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Video Player - Full width; PIP when comments expanded; outer container shrinks so comment panel + input are visible */}
      <AnimatedReanimated.View style={[styles.videoWrapperOuter, animatedOuterContainerStyle]}>
        <AnimatedReanimated.View style={[styles.videoWrapperBase, styles.videoWrapper, animatedVideoWrapperStyle]}>
        {/* Blurred Background - Instagram style */}
        {/* 
          OPTIMIZATION: Only render blur when video is in view to reduce API calls.
          Uses thumbnail URL (or video URL), expo-image will reuse cached version if available.
          Low priority ensures video loads first, blur reuses cache.
        */}
        <View style={styles.videoBackdrop} pointerEvents="none" />
        
        <Pressable 
          style={styles.videoContainer}
          {...doubleTapHandlers}
          activeOpacity={1}
        >
          <Video
            ref={videoRef}
            source={videoSource}
            style={styles.video}
            useNativeControls={false}
            resizeMode={resizeMode}
            isLooping={false}
            shouldPlay={false}
            isMuted={forceMute || isGlobalMuted}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            onLoadStart={() => {
              // Only log if URL actually changed (not just a re-render)
              if (video.video_url !== lastVideoUrlRef.current) {
                log(`[Video] Loading started for video ${video.id}`);
              }
            }}
            onError={(error) => {
              const errorString = JSON.stringify(error);
              // Check for decoder errors (Android MediaCodec, iOS CoreMedia)
              if (errorString.includes('Decoder') || 
                  errorString.includes('MediaCodec') || 
                  errorString.includes('c2.goldfish') ||
                  errorString.includes('-12860') ||
                  errorString.includes('PlayerRemoteXPC')) {
                warn(`[VideoPostItem] Decoder error for ${video.id}, stopping retries:`, error);
                hasDecoderErrorRef.current = true;
                setIsPlaying(false);
                setIsVideoReady(false);
              } else {
                warn(`[VideoPostItem] Playback error for ${video.id}:`, error);
              }
            }}
            onLoad={async (status) => {
              if (status.isLoaded && videoRef.current) {
                setIsVideoReady(true);
                try {
                  await videoRef.current.setStatusAsync({ rate: 1.0 });
                } catch (e) {
                  // ignore
                }
              }
            }}
            playInSilentModeIOS={true}
            staysActiveInBackground={false}
            progressUpdateIntervalMillis={500}
            allowsExternalPlayback={false}
            ignoreSilentSwitch="ignore"
            // 🚀 TIKTOK-STYLE: Adaptive buffering for Nigeria
            usePoster={false}
            posterSource={video.thumbnail_url ? { uri: video.thumbnail_url } : undefined}
          />
          
          {/* App Watermark */}
          <AppWatermark
            visible={true}
            position="bottom-right"
            size="small"
            variant="outline"
            opacity={0.8}
          />
          
          {/* Play/Pause Overlay - Hide during transitions or when screen not focused to prevent flicker */}
          {isVideoReady && !isPlaying && !isTransitioning && effectiveIsInView && isScreenFocused && (
            <Animated.View 
              style={[
                styles.playOverlay,
                { transform: [{ scale: playIconScale }] }
              ]}
            >
              <TouchableOpacity 
                style={styles.playButton}
                onPress={handlePlayPause}
                activeOpacity={0.8}
              >
                <View style={styles.playIconContainer}>
                  <Play size={48} color="white" fill="white" />
                </View>
                {hasVideoFinished && (
                  <Text style={styles.replayText}>Tap to replay</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          )}
          
          {/* Video Controls */}
          {isVideoReady && (
            <Animated.View 
              style={[
                styles.videoControls,
                { opacity: controlsOpacity, pointerEvents: showControls ? 'auto' : 'none' }
              ]}
            >
              {/* Play/Pause Button */}
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handlePlayPause}
                activeOpacity={0.8}
              >
                <View style={styles.controlIconContainer}>
                  {isPlaying ? (
                    <Pause size={16} color="white" fill="white" />
                  ) : (
                    <Play size={16} color="white" fill="white" />
                  )}
                </View>
              </TouchableOpacity>
              
              {/* Mute Button */}
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleMuteToggle}
                activeOpacity={0.8}
              >
                <View style={styles.controlIconContainer}>
                  {isGlobalMuted ? (
                    <VolumeX size={16} color="white" />
                  ) : (
                    <Volume2 size={16} color="white" />
                  )}
                </View>
              </TouchableOpacity>
              
              {/* Fullscreen Button */}
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleFullscreen}
                activeOpacity={0.8}
              >
                <View style={styles.controlIconContainer}>
                  <Maximize2 size={16} color="white" />
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}
          
          {/* Double-tap heart animation */}
          <DoubleTapHeart
            visible={showHeart}
            x={heartPosition.x}
            y={heartPosition.y}
            onAnimationComplete={() => setShowHeart(false)}
          />
        </Pressable>

        {/* 18+ overlay (Twitter-style) */}
        {showAdultOverlay && (
          <View style={[StyleSheet.absoluteFill, styles.adultContentOverlay]} pointerEvents="box-none">
            <View style={styles.adultContentOverlayInner} pointerEvents="auto">
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.adultContentOverlayContent}>
                <Text style={styles.adultContentLabel}>18+</Text>
                <Text style={styles.adultContentHint}>This video may contain sensitive content</Text>
                <TouchableOpacity
                  style={[styles.adultContentShowButton, { backgroundColor: themeColors.primary.main }]}
                  onPress={() => setSensitiveRevealed(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.adultContentShowButtonText}>Show</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        </AnimatedReanimated.View>
      </AnimatedReanimated.View>

      {/* Video Description */}
      {video.content && (
        <Text style={[styles.description, { color: themeColors.neutral.text }]}>
          {video.content}
        </Text>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        <View style={styles.likeSection}>
          <TouchableOpacity
            ref={likeButtonRef}
            style={styles.actionButton}
            onPress={async (event) => {
              if (!user) {
                Alert.alert('Sign In Required', 'Please sign in to zap posts.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign In', onPress: () => router.push('/auth/signin') }
                ]);
                return;
              }
              
              // If user already has a 'like' reaction, toggle it off (unlike) on simple tap
              if (userReaction === 'like') {
                // Capture current state before making changes
                const previousReaction = userReaction;
                const previousCounts = { ...reactionCounts };
                
                try {
                  // Optimistic update - remove like
                  setUserReaction(null);
                  setIsLiked(false);
                  setReactionCounts({ ...previousCounts, likes: Math.max(0, previousCounts.likes - 1) });
                  setLikesCount(prev => Math.max(0, prev - 1));
                  
                  // Toggle reaction (will remove it since it's the same)
                  const toggleResult = await toggleReaction(video.id, 'like');
                  
                  if (!toggleResult || toggleResult.success === false) {
                    // Revert on error
                    setUserReaction(previousReaction);
                    setIsLiked(true);
                    setReactionCounts(previousCounts);
                    const totalReactions = previousCounts.likes + previousCounts.loves + previousCounts.laughs;
                    setLikesCount(totalReactions);
                    error('[VideoPostItem] Failed to unlike:', toggleResult?.error);
                    return;
                  }
                  
                  // Refresh state
                  const newReaction = await getUserReaction(video.id);
                  setUserReaction(newReaction);
                  setIsLiked(newReaction === 'like');
                  const counts = await getReactionCounts(video.id);
                  setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
                  const totalReactions = counts.likes + counts.loves + counts.laughs;
                  setLikesCount(totalReactions);
                  
                  // Call onLike callback for backwards compatibility
                  onLike(video.id);
                } catch (error) {
                  error('[VideoPostItem] Error unliking:', error);
                  // Revert optimistic update
                  setUserReaction(previousReaction);
                  setIsLiked(true);
                  setReactionCounts(previousCounts);
                  const totalReactions = previousCounts.likes + previousCounts.loves + previousCounts.laughs;
                  setLikesCount(totalReactions);
                }
                return;
              }
              
              // If user has no reaction or a different reaction, show reaction picker
              if (likeButtonRef.current) {
                likeButtonRef.current.measure((x, y, width, height, pageX, pageY) => {
                  setReactionPickerPosition({ x: pageX + width / 2, y: pageY - 20 });
                  setShowReactionPicker(true);
                });
              } else {
                setReactionPickerPosition({ 
                  x: event.nativeEvent.pageX, 
                  y: event.nativeEvent.pageY - 20 
                });
                setShowReactionPicker(true);
              }
            }}
            onLongPress={(event) => {
              if (!user) return;
              
              // Always show reaction picker on long press
              if (likeButtonRef.current) {
                likeButtonRef.current.measure((x, y, width, height, pageX, pageY) => {
                  setReactionPickerPosition({ x: pageX + width / 2, y: pageY - 20 });
                  setShowReactionPicker(true);
                });
              } else {
                setReactionPickerPosition({ 
                  x: event.nativeEvent.pageX, 
                  y: event.nativeEvent.pageY - 20 
                });
                setShowReactionPicker(true);
              }
            }}
          >
            {userReaction === 'laugh' ? (
              <Text style={{ fontSize: 20 }}>😂</Text>
            ) : userReaction === 'like' || isLiked ? (
              <Zap size={22} color={ZAP_ACTIVE} fill={ZAP_ACTIVE} strokeWidth={2} />
            ) : (
              <Zap
                size={22}
                color={themeColors.neutral.subtext}
                fill="transparent"
                strokeWidth={2}
              />
            )}
          </TouchableOpacity>
          {(reactionCounts.likes + reactionCounts.loves + reactionCounts.laughs) > 0 && (
            <Text style={[styles.actionCount, { color: themeColors.neutral.subtext }]}>
              {reactionCounts.likes + reactionCounts.loves + reactionCounts.laughs}
            </Text>
          )}
        </View>
        
        {/* Show "Liked by" text - visible to everyone, clickable to show reactions */}
        {likesCount > 0 && (
          <TouchableOpacity
            style={styles.likedByContainer}
            onPress={() => setShowLikesModal(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.likedByText, { color: themeColors.neutral.text }]} numberOfLines={1}>
              {likesCount === 1 ? (
                <>Zapped by <Text style={{ fontWeight: '600' }}>{(likedByUsername || 'someone').length > 15 ? `${(likedByUsername || 'someone').substring(0, 15)}...` : (likedByUsername || 'someone')}</Text></>
              ) : (
                <>Zapped by <Text style={{ fontWeight: '600' }}>{(likedByUsername || 'someone').length > 12 ? `${(likedByUsername || 'someone').substring(0, 12)}...` : (likedByUsername || 'someone')}</Text> and {likesCount - 1} other{likesCount - 1 === 1 ? '' : 's'}</>
              )}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            if (video.comments_disabled) {
              if (setShowCommentsDisabledModal && commentsDisabledScale && commentsDisabledOpacity) {
                setShowCommentsDisabledModal(true);
                Animated.parallel([
                  Animated.spring(commentsDisabledScale, {
                    toValue: 1,
                    tension: 50,
                    friction: 7,
                    useNativeDriver: true,
                  }),
                  Animated.timing(commentsDisabledOpacity, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                  }),
                ]).start();
              }
              return;
            }
            onComment();
          }}
        >
          {video.comments_disabled ? (
            <Lock size={16} color={themeColors.neutral.subtext} strokeWidth={2} />
          ) : (
            <MessageCircle size={16} color={themeColors.neutral.subtext} strokeWidth={2} />
          )}
          {(video.comments_count || 0) > 0 && (
            <Text style={[styles.actionCount, { color: themeColors.neutral.subtext }]}>
              {video.comments_count || 0}
            </Text>
          )}
        </TouchableOpacity>

        {/* View Count - hidden when 0 or for recently uploaded videos (within 10 minutes) */}
        {viewsCount > 0 && formatViewCountLabel(viewsCount, video.created_at) !== '' && (
          <View style={styles.actionButton}>
            <Eye size={16} color={themeColors.neutral.subtext} strokeWidth={2} />
            <Text style={[styles.actionCount, { color: themeColors.neutral.subtext }]} numberOfLines={1}>
              {formatViewCountLabel(viewsCount, video.created_at)}
            </Text>
          </View>
        )}

        {/* Share button - DISABLED */}
        {/* <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onShare(video)}
        >
          <Share2 size={16} color={themeColors.neutral.subtext} strokeWidth={2} />
        </TouchableOpacity> */}

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            const newBookmarkState = !isBookmarked;
            setIsBookmarked(newBookmarkState);
            // Optimistically update bookmark count
            setBookmarksCount(prev => newBookmarkState ? prev + 1 : Math.max(0, prev - 1));
            onBookmark(video.id);
          }}
        >
          <Bookmark 
            size={20} 
            color={isBookmarked ? safeThemeColors.primary.main : themeColors.neutral.subtext} 
            fill={isBookmarked ? safeThemeColors.primary.main : 'transparent'}
            strokeWidth={2}
          />
          {bookmarksCount > 0 && (
            <Text style={[styles.actionCount, { color: themeColors.neutral.subtext }]}>
              {bookmarksCount >= 1000 
                ? `${(bookmarksCount / 1000).toFixed(1)}K` 
                : bookmarksCount}
            </Text>
          )}
        </TouchableOpacity>
      </View>
      
      {/* Reaction Picker */}
      <ReactionPicker
        visible={showReactionPicker}
        currentReaction={userReaction}
        onReactionSelect={async (reaction: PickerReactionType) => {
          if (!user) return;
          log('[VideoPostItem] Reaction selected:', reaction, 'for video:', video.id);
          
          // Optimistically update UI immediately
          const previousReaction = userReaction;
          const previousCounts = { ...reactionCounts };
          
          // Update counts optimistically
          if (previousReaction === reaction) {
            // Removing reaction
            setUserReaction(null);
            setIsLiked(false);
            if (previousReaction === 'like') {
              setReactionCounts({ ...previousCounts, likes: Math.max(0, previousCounts.likes - 1) });
            } else if (previousReaction === 'love') {
              setReactionCounts({ ...previousCounts, loves: Math.max(0, previousCounts.loves - 1) });
            } else if (previousReaction === 'laugh') {
              setReactionCounts({ ...previousCounts, laughs: Math.max(0, previousCounts.laughs - 1) });
            }
            setLikesCount(prev => Math.max(0, prev - 1));
          } else {
            // Adding or replacing reaction
            setUserReaction(reaction);
            setIsLiked(reaction === 'like');
            
            // Decrease old reaction count
            let newCounts = { ...previousCounts };
            if (previousReaction) {
              if (previousReaction === 'like') {
                newCounts.likes = Math.max(0, newCounts.likes - 1);
              } else if (previousReaction === 'love') {
                newCounts.loves = Math.max(0, newCounts.loves - 1);
              } else if (previousReaction === 'laugh') {
                newCounts.laughs = Math.max(0, newCounts.laughs - 1);
              }
            }
            
            // Increase new reaction count
            if (reaction === 'like') {
              newCounts.likes = (newCounts.likes || 0) + 1;
            } else if (reaction === 'love') {
              newCounts.loves = (newCounts.loves || 0) + 1;
            } else if (reaction === 'laugh') {
              newCounts.laughs = (newCounts.laughs || 0) + 1;
            }
            
            setReactionCounts(newCounts);
            const totalReactions = newCounts.likes + newCounts.loves + newCounts.laughs;
            setLikesCount(totalReactions);
          }
          
          try {
            const toggleResult = await toggleReaction(video.id, reaction);
            log('[VideoPostItem] Toggle reaction result:', toggleResult);
            
            if (!toggleResult || toggleResult.success === false) {
              // Revert optimistic update on error
              setUserReaction(previousReaction);
              setIsLiked(!!previousReaction && previousReaction === 'like');
              setReactionCounts(previousCounts);
              const totalReactions = previousCounts.likes + previousCounts.loves + previousCounts.laughs;
              setLikesCount(totalReactions);
              const errorMsg = toggleResult?.error || 'Unknown error';
              error('[VideoPostItem] Toggle failed, reverting UI. Error:', errorMsg);
              return;
            }
            
            // Small delay to ensure database is updated
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Fetch actual state from database
            const newReaction = await getUserReaction(video.id);
            log('[VideoPostItem] New reaction after toggle:', newReaction);
            setUserReaction(newReaction);
            setIsLiked(newReaction === 'like');
            
            const counts = await getReactionCounts(video.id);
            log('[VideoPostItem] Reaction counts:', counts);
            setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
            const totalReactions = counts.likes + counts.loves + counts.laughs;
            setLikesCount(totalReactions);
            
            // Call onLike callback for backwards compatibility
            onLike(video.id);
          } catch (error) {
            error('[VideoPostItem] Error toggling reaction:', error);
            // Revert optimistic update on error
            setUserReaction(previousReaction);
            setIsLiked(!!previousReaction && previousReaction === 'like');
            setReactionCounts(previousCounts);
            const totalReactions = previousCounts.likes + previousCounts.loves + previousCounts.laughs;
            setLikesCount(totalReactions);
          }
        }}
        onClose={() => {
          log('[VideoPostItem] Closing reaction picker');
          setShowReactionPicker(false);
        }}
        position={reactionPickerPosition}
      />

      {/* Reactions Modal - shown to everyone */}
      <PostReactionsList
        visible={showLikesModal}
        onClose={() => setShowLikesModal(false)}
        postId={video.id}
        postOwnerId={video.user_id}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 0, // No bottom margin - separator handles spacing
    backgroundColor: 'transparent',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12, // Match image posts padding
    paddingVertical: 10,
    paddingBottom: 8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
  },
  userText: {
    flex: 1,
    marginLeft: 10,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  videoIndicator: {
    backgroundColor: 'rgba(0, 128, 128, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 2,
  },
  postTime: {
    fontSize: 11,
    marginTop: 2,
  },
  postActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postMenuButton: {
    padding: 8,
    marginLeft: 8,
  },
  videoWrapperOuter: {
    width: '100%',
    position: 'relative',
  },
  videoWrapperBase: {
    overflow: 'hidden',
    width: '100%',
  },
  videoWrapper: {
    alignSelf: 'center',
    backgroundColor: '#000',
    borderRadius: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  adultContentOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  adultContentOverlayInner: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adultContentOverlayContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    maxWidth: 280,
  },
  adultContentLabel: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  adultContentHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 20,
    textAlign: 'center',
  },
  adultContentShowButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 9999,
    minWidth: 120,
    alignItems: 'center',
  },
  adultContentShowButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  videoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: '#000',
  },
  videoContainer: {
    ...StyleSheet.absoluteFillObject, // Fill entire wrapper (TikTok-style)
    zIndex: 1, // Above blurred background
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  videoBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  videoBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  playButton: {
    alignItems: 'center',
    gap: 12,
  },
  playIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  replayText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  videoControls: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    gap: 12,
  },
  controlButton: {
    padding: 0,
  },
  controlIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 12, // Match image posts padding
    paddingTop: 8,
    paddingBottom: 4,
    letterSpacing: -0.2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12, // Match image posts padding
    paddingTop: 8,
    paddingBottom: 8,
    gap: 20,
  },
  likeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
  },
  actionCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  likedByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '50%', // Prevent it from taking more than half the available space
  },
  likedByText: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    lineHeight: 16,
  },
});

// Memoize component to prevent unnecessary re-renders when props haven't meaningfully changed
// React.memo comparison: return true if props are equal (skip re-render), false if different (re-render)
const MemoizedVideoPostItem = React.memo(VideoPostItem, (prevProps, nextProps) => {
  // Check if critical props changed - if any changed, return false to trigger re-render
  if (prevProps.video.id !== nextProps.video.id) return false;
  if (prevProps.video.video_url !== nextProps.video.video_url) return false;
  if (prevProps.isInView !== nextProps.isInView) return false;
  if (prevProps.autoPlay !== nextProps.autoPlay) return false;
  if (prevProps.forceMute !== nextProps.forceMute) return false;
  if (prevProps.isScreenFocused !== nextProps.isScreenFocused) return false;
  if (prevProps.video.likes_count !== nextProps.video.likes_count) return false;
  if (prevProps.video.views_count !== nextProps.video.views_count) return false;
  if (prevProps.video.bookmarked !== nextProps.video.bookmarked) return false;
  if (prevProps.video.is_bookmarked !== nextProps.video.is_bookmarked) return false;
  if (prevProps.commentsExpanded !== nextProps.commentsExpanded) return false;

  // If none of the critical props changed, return true to skip re-render
  return true;
});

export default MemoizedVideoPostItem;
