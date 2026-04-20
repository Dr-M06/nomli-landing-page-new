import React, { useState, useEffect, useRef, useCallback, useMemo, startTransition, lazy, Suspense } from 'react';
const StoryCamera = lazy(() => import('../components/StoryCamera'));
const StoryEditor = lazy(() => import('../components/StoryEditor'));
// Defensive lazy load: if Metro fails to resolve a chunk (e.g. "unknown module 4457"), render nothing instead of crashing
const StoryViewer = lazy(() =>
  import('../components/StoryViewer').catch(() => ({ default: () => null }))
);
import StoryTextEditor, { type StoryMusicPayload } from '../components/StoryTextEditor';
import { uploadStoryMedia, createStory, StoryMediaUploadResult, STORY_VIDEO_MAX_SECONDS } from '../utils/storyUtils';
import { pickStoryMediaFromLibrary } from '../utils/storyLibraryPicker';
import { generateTextStoryImage } from '../utils/textStoryGenerator';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  FlatList, 
  TouchableOpacity, 
  Pressable,
  ActivityIndicator,
  Image as RNImage,
  TextInput,
  Platform,
  StatusBar,
  Alert,
  Modal,
  Share as RNShare,
  useColorScheme,
  Dimensions,
  PanResponder,
  Animated,
  Easing,
  ScrollView,
  ActionSheetIOS,
  InteractionManager,
  KeyboardAvoidingView,
  Keyboard,
  DeviceEventEmitter,
  findNodeHandle,
} from 'react-native';
import { Image } from 'expo-image';
import { MotiView } from 'moti';
import { useSharedValue, useAnimatedStyle, withTiming, runOnJS, useAnimatedScrollHandler, interpolate, Extrapolate, withSpring } from 'react-native-reanimated';
import ReanimatedAnimated from 'react-native-reanimated';
const { ScrollView: AnimatedScrollView } = ReanimatedAnimated;

import { 
  Edit, 
  Heart, 
  MessageSquare, 
  Bookmark, 
  Search, 
  MoreVertical,
  Trash2,
  Pencil,
  X,
  Share2,
  Send,
  Calendar,
  MapPin,
  Users,
  Play,
  Grid3X3,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Scissors,
  Plus,
  Video,
  Store,
  Lock,
  Unlock,
  WifiOff,
  CheckCircle,
  Pin,
  PinOff,
  Eye,
  Camera,
  Image as ImageIcon,
  Type,
  Flag,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, GlobalStyles, Shadow } from '../constants/Theme';
import { LinearGradient } from 'expo-linear-gradient';

import useAuth from '../hooks/useAuth';
import NetInfo from '@react-native-community/netinfo';
import { useRouter, useLocalSearchParams } from 'expo-router';
import SlowNetworkAlert, { addSlowNetworkListener, resetSlowNetworkDetection } from '../components/SlowNetworkAlert';
import PullToRefreshBanner from '../components/PullToRefreshBanner';
import CommunityListHeader from '../components/CommunityListHeader';
import { supabase } from '../utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPostImageUrl } from '../utils/cdnConfig';
import { resizePostImage, resizeFullscreenImage } from '../utils/imageResizer';
import OptimizedImage from '../components/OptimizedImage';
import { forceCdnUrl, checkCdnStatus } from '../utils/mobileCdnOptimizer';
import { 
  fetchPosts, 
  createPost, 
  deletePost, 
  likePost, 
  unlikePost, 
  toggleLike, 
  bookmarkPost, 
  unbookmarkPost, 
  toggleBookmark,
  fetchComments, 
  addComment, 
  deleteComment,
  getCachedPosts,
  getCachedPostsSync,
  Post,
  Comment,
  togglePostComments,
  boostPost,
  sortFeedPosts,
  interleavePostsByMediaKind,
  getPostMediaKind
} from '../utils/communityUtils';

import { toggleCommentLike, fetchCommentsWithLikes, replyToComment, clearCommentsCache, getCachedComments } from '../utils/commentUtils';
import { followUser, unfollowUser, isFollowing } from '../utils/followersServiceFixed';
import { formatTimeAgo } from '../utils/formatters';
import { getSafeDisplayName, sanitizeUsernameForDisplay, stripAtSymbol } from '../utils/contentFilter';
import { OFFICIAL_ACCOUNT_EMAIL } from '../constants/ContactEmails';
import { useLiveUsers } from '../hooks/useLiveUsers';
import HashtagDropdown from '../components/HashtagDropdown';
import SearchDropdown from '../components/SearchDropdown';
import UserStatusBar from '../components/StatusBar';
import SimpleAvatar from '../components/SimpleAvatar';
import Toast from 'react-native-toast-message';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OptimisticFeed from '../components/OptimisticFeed';
import { generatePlaceholderPosts, getBundledOfflinePosts } from '../utils/placeholderData';
import Header from '../components/Header';
import { useTheme } from '../contexts/ThemeContext';
import { useVideoContext } from '../contexts/VideoContext';
import { useSessionLiked } from '../contexts/SessionLikedContext';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { downloadImageForSharing } from '../utils/fileCache';
import { loadShielding } from '../utils/loadShielding';
import EnhancedAvatar from '../components/EnhancedAvatar';
import AppWatermark from '../components/AppWatermark';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector, GestureHandlerRootView, TapGestureHandler } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
// Import video feed components
import { VideoPost } from '../components/VideoFeed';
import { convertPostsToVideoFeed, mixVideoFeed, fetchAllVideoPosts } from '../utils/videoPostUtils';

import VideoPostItem from '../components/VideoPostItem';
import { PollPostCard } from '../components/PollPostCard';
import { QuestionPostCard } from '../components/QuestionPostCard';
import { badgeCounter } from '../utils/badgeCounter';
import * as FileSystem from 'expo-file-system';
import PostReactionsList from '../components/PostReactionsList';
import LikesPrivacyModal from '../components/LikesPrivacyModal';
import ReactionPicker, { ReactionType as PickerReactionType } from '../components/ReactionPicker';
import { toggleReaction, getUserReaction, getReactionCounts } from '../utils/reactionUtils';
import { useDoubleTap } from '../hooks/useDoubleTap';
import DoubleTapHeart from '../components/DoubleTapHeart';
import PostItemDisplay from '../components/PostItemDisplay';
import { log, warn, error } from '../utils/productionLogger';





// Get status bar height for different platforms
const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 20 : StatusBar.currentHeight || 0;
const BOTTOM_INSET = Platform.OS === 'ios' ? 34 : 16;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 768 || (SCREEN_WIDTH > SCREEN_HEIGHT && SCREEN_HEIGHT >= 768);

// Filter options for community posts






// Skeleton loading component for posts
const SkeletonPost = React.memo(() => {
  const themeStyles = useThemeStyles();
  return (
    <View style={[styles.postContainer, themeStyles.surface]}>
      {/* Header skeleton */}
      <View style={styles.postHeader}>
        <View style={styles.userInfoContainer}>
          <View style={[styles.skeletonAvatar, themeStyles.disabled]} />
          <View style={styles.userTextContainer}>
            <View style={[styles.skeletonUserName, themeStyles.disabled]} />
            <View style={[styles.skeletonPostTime, themeStyles.disabled]} />
          </View>
        </View>
      </View>
      <View style={styles.postContentContainer}>
        <View style={[styles.skeletonContentLine, themeStyles.disabled]} />
        <View style={[styles.skeletonContentLine, { width: '90%' }, themeStyles.disabled]} />
        <View style={[styles.skeletonContentLine, { width: '75%' }, themeStyles.disabled]} />
      </View>
      <View style={[styles.skeletonImage, themeStyles.disabled]} />
      <View style={[styles.postActions, themeStyles.border]}>
        <View style={[styles.skeletonAction, themeStyles.disabled]} />
        <View style={[styles.skeletonAction, themeStyles.disabled]} />
        <View style={[styles.skeletonAction, themeStyles.disabled]} />
      </View>
    </View>
  );
}, () => true);

// Shimmer skeleton post component - accepts optional shared shimmer value to avoid multiple loops
const ShimmerSkeletonPost = React.memo(({ sharedShimmerValue }: { sharedShimmerValue?: Animated.Value }) => {
  const { isDarkMode } = useTheme();
  const themeStyles = useThemeStyles();
  const localShimmer = React.useRef(new Animated.Value(0)).current;
  const shimmerAnim = sharedShimmerValue ?? localShimmer;

  React.useEffect(() => {
    if (sharedShimmerValue) return;
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(localShimmer, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(localShimmer, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerAnimation.start();
    return () => shimmerAnimation.stop();
  }, [sharedShimmerValue]);

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.8, 0.3],
  });
  
  const baseColor = isDarkMode ? '#1E293B' : '#F1F5F9';
  const highlightColor = isDarkMode ? '#334155' : '#E2E8F0';
  
  return (
    <View style={[styles.postContainer, { backgroundColor: baseColor }]}>
      {/* Header shimmer */}
      <View style={styles.postHeader}>
        <View style={styles.userInfoContainer}>
          <Animated.View style={[
            styles.skeletonAvatar, 
            { 
              backgroundColor: highlightColor,
              opacity: shimmerOpacity 
            }
          ]} />
          <View style={styles.userTextContainer}>
            <Animated.View style={[
              styles.skeletonUserName, 
              { 
                backgroundColor: highlightColor,
                opacity: shimmerOpacity 
              }
            ]} />
            <Animated.View style={[
              styles.skeletonPostTime, 
              { 
                backgroundColor: highlightColor,
                opacity: shimmerOpacity 
              }
            ]} />
          </View>
        </View>
      </View>
      
      {/* Content shimmer */}
      <View style={styles.postContentContainer}>
        <Animated.View style={[
          styles.skeletonContentLine, 
          { 
            backgroundColor: highlightColor,
            opacity: shimmerOpacity 
          }
        ]} />
        <Animated.View style={[
          styles.skeletonContentLine, 
          { 
            width: '90%', 
            backgroundColor: highlightColor,
            opacity: shimmerOpacity 
          }
        ]} />
        <Animated.View style={[
          styles.skeletonContentLine, 
          { 
            width: '75%', 
            backgroundColor: highlightColor,
            opacity: shimmerOpacity 
          }
        ]} />
      </View>
      
      {/* Image shimmer */}
      <Animated.View style={[
        styles.skeletonImage, 
        { 
          backgroundColor: highlightColor,
          opacity: shimmerOpacity 
        }
      ]} />
      
      {/* Actions shimmer */}
      <View style={[styles.postActions, themeStyles.border]}>
        <Animated.View style={[
          styles.skeletonAction, 
          { 
            backgroundColor: highlightColor,
            opacity: shimmerOpacity 
          }
        ]} />
        <Animated.View style={[
          styles.skeletonAction, 
          { 
            backgroundColor: highlightColor,
            opacity: shimmerOpacity 
          }
        ]} />
        <Animated.View style={[
          styles.skeletonAction, 
          { 
            backgroundColor: highlightColor,
            opacity: shimmerOpacity 
          }
        ]} />
      </View>
    </View>
  );
}, () => true);

// Loading animation component for community posts - single shimmer loop drives all skeletons
const CommunityLoadingAnimation = React.memo(() => {
  const themeStyles = useThemeStyles();
  const sharedShimmer = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sharedShimmer, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(sharedShimmer, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={[styles.loadingAnimationContainer, themeStyles.background]}>
      <View style={styles.skeletonContainer}>
        <ShimmerSkeletonPost sharedShimmerValue={sharedShimmer} />
        <ShimmerSkeletonPost sharedShimmerValue={sharedShimmer} />
        <ShimmerSkeletonPost sharedShimmerValue={sharedShimmer} />
      </View>
    </View>
  );
}, () => true);

// PostItemDisplay component has been extracted to components/PostItemDisplay.tsx

// Add a new AnimatedActionButton component for post actions
const SimpleActionButton = ({ 
  onPress, 
  icon, 
  text, 
  color, 
  isActive = false,
  themeColors,
  onLongPress,
  buttonRef
}: { 
  onPress: () => void; 
  icon: React.ReactNode; 
  text: string; 
  color?: string;
  isActive?: boolean;
  themeColors: any;
  onLongPress?: (event: any) => void;
  buttonRef?: React.RefObject<TouchableOpacity>;
}) => {
  const [scale] = useState(new Animated.Value(1));
  const longPressHandledRef = useRef(false);

  const handlePressIn = () => {
    longPressHandledRef.current = false;
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      friction: 4,
      tension: 150,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
      tension: 150,
    }).start();
  };

  const handlePress = () => {
    if (!longPressHandledRef.current) {
      onPress();
    }
  };

  const handleLongPress = (event: any) => {
    longPressHandledRef.current = true;
    if (onLongPress) {
      onLongPress(event);
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        ref={buttonRef}
        style={styles.actionButton}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.7}
        delayLongPress={400}
      >
        {icon}
        {text && (
          <Text 
            style={[
              styles.actionText, 
              { color: color || themeColors.neutral.text },
              isActive && { 
                fontWeight: '600',
              }
            ]}
          >
            {text}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// Mount counter to track remounts (persists across remounts)
let communityScreenMountCount = 0;
const mountTimestamps: number[] = [];
const logThrottle: Record<string, number> = {};

// Helper to log with timestamp and mount info (throttled for repetitive messages)
const logWithMount = (message: string, data?: any, throttleMs = 0) => {
  const timestamp = Date.now();
  const timeSinceLastMount = mountTimestamps.length > 0 
    ? timestamp - mountTimestamps[mountTimestamps.length - 1]
    : 0;
  
  // Throttle repetitive logs
  if (throttleMs > 0) {
    const lastLog = logThrottle[message] || 0;
    if (timestamp - lastLog < throttleMs) {
      return; // Skip this log
    }
    logThrottle[message] = timestamp;
  }
  
  // Format timestamp
  const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
  
  log(
    `[${timeStr}] [Community Mount #${communityScreenMountCount}] ${message}`,
    timeSinceLastMount > 0 ? `| ⏱️ ${timeSinceLastMount}ms since last mount` : '',
    ...(data ? ['|', data] : [])
  );
};

// Module loaded - no logging to reduce noise

export default function CommunityScreen() {
  // Track mounts - only increment on actual mount, not every render
  const mountIdRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);
  
  // Only log on actual component mount, not every re-render
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Increment mount count only on actual mount
      communityScreenMountCount++;
      mountIdRef.current = communityScreenMountCount;
      mountTimestamps.push(Date.now());
      
      // Silently mount - no logging to reduce noise
    }
  }, []); // Empty deps - only run on mount
  
  // Check CDN status on mount (only once)
  React.useEffect(() => {
    if (communityScreenMountCount === 1) {
      checkCdnStatus();
    }
  }, []);
  
  // Silently mount - no logging to reduce noise
  if (false) { // Disabled logging
    logWithMount('🔄 COMPONENT MOUNTED', {
      mountId: mountIdRef.current,
      totalMounts: communityScreenMountCount,
    });
  }
  
  const router = useRouter();
  const { postId: targetPostId } = useLocalSearchParams<{ postId?: string }>();
  const insets = useSafeAreaInsets();
  
  // CRITICAL: Use stable reference for user to prevent unnecessary remounts
  // Don't destructure user - use auth.user directly to avoid re-renders on auth state changes
  const auth = useAuth();
  
  // Memoize user to prevent remounts when auth object reference changes
  const user = useMemo(() => auth.user, [auth.user?.id]);

  const { likedPostIds: sessionLikedPostIds, addLiked: addSessionLiked, removeLiked: removeSessionLiked } = useSessionLiked();
  
  const [isOnline, setIsOnline] = useState<boolean | null>(true);
  const [showNetworkBanner, setShowNetworkBanner] = useState(false);
  const networkBannerOpacity = useRef(new Animated.Value(0)).current;
  const networkBannerTranslateY = useRef(new Animated.Value(100)).current;
  const [showSlowNetworkAlert, setShowSlowNetworkAlert] = useState(false);
  
  // Leaderboard modal state
  
  // Comments disabled modal state
  const [showCommentsDisabledModal, setShowCommentsDisabledModal] = useState(false);
  const commentsDisabledScale = useRef(new Animated.Value(0)).current;
  const commentsDisabledOpacity = useRef(new Animated.Value(0)).current;
  
  // Refs for comment ScrollViews to enable auto-scroll to new comments
  const commentScrollViewRefs = useRef<Map<string, ScrollView>>(new Map());
  const commentSheetScrollRef = useRef<ScrollView>(null);
  const sheetReplyInputRef = useRef<View>(null);
  
  // Monitor network status with smooth animations
  useEffect(() => {
    try {
      const unsubscribe = NetInfo.addEventListener(state => {
        const wasOnline = isOnline;
        const nowOnline = state.isConnected;
        
        setIsOnline(nowOnline);
        
        // Show banner when status changes
        if (wasOnline !== nowOnline) {
          setShowNetworkBanner(true);
          
          // Animate banner in
          Animated.parallel([
            Animated.spring(networkBannerTranslateY, {
              toValue: 0,
              tension: 80,
              friction: 8,
              useNativeDriver: true,
            }),
            Animated.timing(networkBannerOpacity, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start();
          
          // Auto-hide after 3 seconds if online
          if (nowOnline) {
            setTimeout(() => {
              Animated.parallel([
                Animated.timing(networkBannerTranslateY, {
                  toValue: 100,
                  duration: 300,
                  useNativeDriver: true,
                }),
                Animated.timing(networkBannerOpacity, {
                  toValue: 0,
                  duration: 300,
                  useNativeDriver: true,
                }),
              ]).start(() => {
                setShowNetworkBanner(false);
              });
            }, 3000);
          }
        }
      });
      
      // Initial check
      NetInfo.fetch().then(state => {
        setIsOnline(state.isConnected);
      }).catch(error => {
        warn('[Community] NetInfo fetch failed:', error);
        setIsOnline(true); // Default to online
      });
      
      return () => {
        unsubscribe();
      };
    } catch (error) {
      warn('[Community] NetInfo setup failed:', error);
      setIsOnline(true); // Default to online on error
    }
  }, [isOnline]);

  // Monitor slow network detection
  useEffect(() => {
    const unsubscribe = addSlowNetworkListener(() => {
      setShowSlowNetworkAlert(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle refresh from slow network alert - will be defined after loadPosts
  const handleRefreshAppRef = useRef<() => void>(() => {
    // This will be set after loadPosts is defined
  });
  // Ref to latest loadPosts so interval and retry always call current implementation
  const loadPostsRef = useRef<(silent?: boolean, forceRefresh?: boolean) => Promise<void> | void>(() => {});

  // NIGERIA-OPTIMIZED: Load cache immediately (both in-memory and persistent)
  // Check in-memory cache synchronously first (fastest)
  const initialCachedPostsRef = useRef<Post[] | null>(null);
  const hasCheckedInitialCacheRef = useRef(false);
  const [persistentCacheLoaded, setPersistentCacheLoaded] = useState(false);
  
  // Load persistent cache in useEffect (non-blocking) - in-memory cache is fast enough to do synchronously
  useEffect(() => {
    if (!hasCheckedInitialCacheRef.current) {
      // 1. Get in-memory cache synchronously (fastest) - already done in render
      // 2. NIGERIA-OPTIMIZED: Load persistent cache (async, non-blocking)
      (async () => {
        try {
          const { getCachedPosts } = await import('../utils/communityUtils');
          const persistentCache = await getCachedPosts(undefined, 0);
          if (persistentCache && persistentCache.length > 0) {
            // Update in-memory cache with persistent cache
            initialCachedPostsRef.current = persistentCache;
            setPersistentCacheLoaded(true);
            const realPostsOnly = persistentCache.filter(
              (post: Post) => !post.id.startsWith('placeholder-post-') && !post.id.startsWith('bundled-offline-post-')
            );
            if (realPostsOnly.length > 0) {
              // Hydrate feed immediately so user sees cached posts without waiting for loadPosts
              const initialDisplay = 20; // same as INITIAL_CACHE_DISPLAY (defined later in file)
              const displayCount = Math.min(realPostsOnly.length, initialDisplay);
              const toShow = realPostsOnly.slice(0, displayCount);
              startTransition(() => {
                setPosts(prev => {
                  const hasOnlyPlaceholders = prev.length <= 2 && prev.every(
                    (p: Post) => p.id.startsWith('placeholder-post-') || p.id.startsWith('bundled-offline-post-')
                  );
                  if (hasOnlyPlaceholders || prev.length < realPostsOnly.length) return toShow;
                  return prev;
                });
                if (realPostsOnly.length > initialDisplay) {
                  setCachedPostsPool(realPostsOnly);
                  setCachedPostsShown(initialDisplay);
                } else {
                  setCachedPostsPool([]);
                  setCachedPostsShown(realPostsOnly.length);
                }
              });
            }
            if (__DEV__) {
            log(`[Community] ✅ Loaded ${persistentCache.length} posts from persistent cache (Nigeria-optimized)`);
            }
          }
        } catch (error) {
          warn('[Community] Error loading persistent cache:', error);
        }
      })();
    }
  }, []);
  
  if (!hasCheckedInitialCacheRef.current) {
    // Get in-memory cache synchronously (fastest) - this is fast and doesn't block render
    initialCachedPostsRef.current = getCachedPostsSync(undefined, 0);
    hasCheckedInitialCacheRef.current = true;
  }
  
  const initialCachedPosts = initialCachedPostsRef.current;
  const hasInitialCache = initialCachedPosts && initialCachedPosts.length > 0;
  
  // Initial state logging disabled to reduce console spam
  // logWithMount('Initial state', { 
  //   hasInitialCache, 
  //   cachedPostsCount: initialCachedPosts?.length || 0,
  //   userId: user?.id?.substring(0, 8)
  // });
  
  // Initialize loading state - ALWAYS false to show placeholders immediately (no shimmer)
  // Placeholders will show instantly, then real data loads silently in background
  const loadingStateRef = useRef(false);
  const [loading, setLoading] = useState(false); // Always false - placeholders show immediately
  
  // Update loading state ref when it changes
  useEffect(() => {
    loadingStateRef.current = loading;
  }, [loading]);
  
  // Start visible immediately for faster perceived load (no fade-in delay)
  // Removed fade-in animation that was causing 600ms delay on app open
  const fadeAnim = useRef(new Animated.Value(1)).current; // Start at 1 (visible)
  const slideAnim = useRef(new Animated.Value(0)).current; // Start at 0 (no offset)
  
  // Optional: Subtle fade-in only after first paint (non-blocking)
  useEffect(() => {
    // Defer animation to after first paint to avoid blocking initial render
    requestAnimationFrame(() => {
      // Already visible, so no animation needed - content shows immediately
    });
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true); // Track if there are more posts to load
  const [showEndMessage, setShowEndMessage] = useState(false); // Debounced end message to prevent flickering
  const endMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onEndReachedCalledDuringMomentum = useRef(false); // Prevent onEndReached from firing multiple times
  const lastLoadMoreOffset = useRef(0); // Track last offset to prevent duplicate loads
  
  // Track scroll position to maintain it when loading more posts (video-feed/Facebook style)
  const scrollPositionBeforeLoad = useRef<number>(0);
  const contentHeightBeforeLoad = useRef<number>(0);
  const isUserScrolling = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const firstVisibleIndexRef = useRef<number | null>(null);
  const firstVisibleOffsetRef = useRef<number>(0);
  const isAppendingPosts = useRef<boolean>(false);
  
  // Progressive cache loading state
  const [cachedPostsPool, setCachedPostsPool] = useState<Post[]>([]); // All cached posts available
  const [cachedPostsShown, setCachedPostsShown] = useState(0); // How many cached posts we've shown
  const INITIAL_CACHE_DISPLAY = 20; // Show 20 cached posts initially
  const CACHE_LOAD_BATCH = 20; // Load 20 more cached posts at a time
  
  // Progressive display: Load 40, show 20, keep 20 ready (prevents scroll reset bugs)
  const [displayedPostsCount, setDisplayedPostsCount] = useState(20); // How many posts to show initially
  const LOAD_BATCH_SIZE = 40; // Load 40 items at a time
  const INITIAL_DISPLAY_COUNT = 20; // Show 20 initially
  const READY_BUFFER_COUNT = 20; // Keep 20 ready for smooth scrolling
  
  // New posts alert state
  const [newPostsCount, setNewPostsCount] = useState(0); // Count of new posts available
  const [pendingNewPosts, setPendingNewPosts] = useState<Post[]>([]); // Store pending new posts
  const [isScrolledDown, setIsScrolledDown] = useState(false); // Track if user has scrolled down
  const scrollY = useRef(0); // Track scroll position
  const pullDownY = useRef(0); // Min contentOffset.y during gesture (negative = pulled down) for custom pull-to-refresh
  const SCROLL_THRESHOLD = 200; // Show alert if scrolled more than 200px
  
  // CRITICAL: Use bundled offline posts so placeholders work without network (offline + new users with no cache)
  const placeholderPostsRef = useRef<Post[]>(getBundledOfflinePosts(2));
  const placeholderPosts = placeholderPostsRef.current;
  
  // CRITICAL: Initialize posts with cached data if available, placeholders only if no cache
  // Since cloud cache loads instantly, placeholders are only needed when cache is empty
  // Progressive loading: Show only initial batch, rest will load as user scrolls
  const initialPostsWithPlaceholders = React.useMemo(() => {
    if (initialCachedPosts && initialCachedPosts.length > 0) {
      // Filter out placeholders
      const realPostsOnly = initialCachedPosts.filter(
        post => !post.id.startsWith('placeholder-post-') && !post.id.startsWith('bundled-offline-post-')
      );
      
      // Progressive loading: If more than INITIAL_CACHE_DISPLAY, show only initial batch
      // The rest will be stored in cachedPostsPool and loaded as user scrolls
      if (realPostsOnly.length > INITIAL_CACHE_DISPLAY) {
        // Return only initial batch - pool will be set in useEffect
        return realPostsOnly.slice(0, INITIAL_CACHE_DISPLAY);
      }
      // Fewer posts, show all
      return realPostsOnly;
    }
    // No cache - show 2 in-app placeholders for new downloads (not from database)
    return placeholderPosts;
  }, []); // Empty deps - only compute once on mount
  
  // Initialize posts with placeholders + cached data IMMEDIATELY
  // This ensures UI shows instantly without waiting for any async operations
  const [posts, setPosts] = useState<Post[]>(initialPostsWithPlaceholders);
  
  // State to store placeholder posts with updated likes from database
  // Initialize with placeholders immediately (no delay) - use stable ref
  const [placeholderPostsWithLikes, setPlaceholderPostsWithLikes] = React.useState<Post[]>(placeholderPosts);
  
  // Placeholders are in-app only - no database queries needed
  // Initialize placeholder posts with likes (in-app only, no database)
  useEffect(() => {
    // Set placeholder posts with likes - these are in-app only, no database interaction
    setPlaceholderPostsWithLikes(placeholderPosts);
  }, []); // Only run once on mount
  
  // Initialize placeholder comments so they show when placeholder posts are expanded
  useEffect(() => {
    const placeholderComments: Record<string, Comment[]> = {};
    placeholderPosts.forEach((post: any) => {
      if (post.recent_comments && post.recent_comments.length > 0) {
        placeholderComments[post.id] = post.recent_comments.map((c: any) => ({
          ...c,
          updated_at: c.created_at,
          profiles: {
            avatar_url: c.user_avatar,
            username: c.username,
            full_name: c.display_name,
          },
        }));
      }
    });
    if (Object.keys(placeholderComments).length > 0) {
      setPostComments(prev => ({ ...placeholderComments, ...prev }));
    }
  }, [placeholderPosts]);
  
  // Load cached data immediately on mount (before useEffect runs) to prevent loading flicker
  const [hasCheckedCache, setHasCheckedCache] = useState(
    initialCachedPosts && initialCachedPosts.length > 0
  );
  const [selectedFilter, setSelectedFilter] = useState('Latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Post[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showHashtagDropdown, setShowHashtagDropdown] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchMode, setSearchMode] = useState<'all' | 'hashtag' | 'user'>('all');
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [expandedPostContent, setExpandedPostContent] = useState<Set<string>>(new Set());
  /** TikTok-style: when set, comments for this post open in the modal bottom sheet (video, text, photo) */
  const [commentSheetPostId, setCommentSheetPostId] = useState<string | null>(null);
  const [postComments, setPostComments] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Set<string>>(new Set());
  const [submittingComments, setSubmittingComments] = useState<Set<string>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [postMenuVisible, setPostMenuVisible] = useState<string | null>(null);
  // Removed forceUpdate state - using proper React state management instead
  const [commentMenuVisible, setCommentMenuVisible] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [deletingPosts, setDeletingPosts] = useState<Set<string>>(new Set());
  const [deletingComments, setDeletingComments] = useState<Set<string>>(new Set());
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [showLikesModal, setShowLikesModal] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [viewingImageSet, setViewingImageSet] = useState<string[]>([]);
  const [viewingImageIndex, setViewingImageIndex] = useState(0);
  // Video context for global mute state
  const { setGlobalMute, setCurrentlyPlayingVideo } = useVideoContext();

  // Threaded comments state
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [replyingToComment, setReplyingToComment] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  
  // Commenter menu state (for follow/reply menu)
  const [commenterMenuVisible, setCommenterMenuVisible] = useState<{ commentId: string; userId: string; username: string } | null>(null);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set());
  
  // Reanimated shared values for smooth gesture handling
  const imageTranslateX = useSharedValue(0);
  const imageTranslateY = useSharedValue(0);
  const imageOpacity = useSharedValue(1);
  const imageScale = useSharedValue(1); // Zoom scale
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  
  // Animated style for the image container
  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: imageTranslateX.value },
        { translateY: imageTranslateY.value },
        { scale: imageScale.value },
      ],
      opacity: imageOpacity.value,
    };
  });


  const [visibleItems, setVisibleItems] = useState<string[]>([]); // Track visible items for animations
  const [showSearchBar, setShowSearchBar] = useState(false);
  const searchBarOpacity = useRef(new Animated.Value(0)).current;
  const searchBarTranslateY = useRef(new Animated.Value(-20)).current;
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showAdultContent, setShowAdultContent] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const COMMUNITY_18_PREF_KEY = 'community_show_18_content';
  const [isAdultForContentToggle, setIsAdultForContentToggle] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(COMMUNITY_18_PREF_KEY).then(value => {
      setShowAdultContent(value === 'true');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setIsAdultForContentToggle(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('date_of_birth')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (!data?.date_of_birth) {
          setIsAdultForContentToggle(false);
          return;
        }
        const dob = new Date(data.date_of_birth + 'T12:00:00');
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        setIsAdultForContentToggle(age >= 18);
      } catch {
        if (!cancelled) setIsAdultForContentToggle(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const setShowAdultContentAndPersist = useCallback((value: boolean) => {
    setShowAdultContent(value);
    AsyncStorage.setItem(COMMUNITY_18_PREF_KEY, value ? 'true' : 'false').catch(() => {});
  }, []);

  // Live streams state - using the hook
  // Livestream feature is currently disabled in-app, but the header/status bar
  // still expects a `liveStreams` array prop.
  const liveStreams: any[] = useMemo(() => [], []);
  
  // Combined feed state
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [globalMuted, setGlobalMuted] = useState(false);
  // Track if videos have been processed to prevent reprocessing on remount
  const videosProcessedRef = useRef(false);
  const [failedVideos, setFailedVideos] = useState<Set<string>>(new Set());
  const [headerVisible, setHeaderVisible] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  
  // Live users hook
  const { liveUsers, loading: liveUsersLoading, refreshLiveUsers } = useLiveUsers();
  const [showTapHint, setShowTapHint] = useState(false);
  const [isVideoFocused, setIsVideoFocused] = useState(false);
  
  // Story creation state
  const [showStoryCamera, setShowStoryCamera] = useState(false);
  const [showStoryEditor, setShowStoryEditor] = useState(false);
  const [showStoryTextEditor, setShowStoryTextEditor] = useState(false);
  const [showCreateStoryModal, setShowCreateStoryModal] = useState(false);
  const [capturedStoryMedia, setCapturedStoryMedia] = useState<{ uri: string; type: 'photo' | 'video' } | null>(null);
  
  // Track camera modal state for iOS modal nesting fix
  const [cameraModalClosed, setCameraModalClosed] = useState(true);
  
  // Ref to track upload promise for waiting
  const uploadPromiseRef = useRef<Promise<StoryMediaUploadResult | null> | null>(null);
  
  // Instagram-style upload state - upload starts immediately when media is captured
  const [storyUploadState, setStoryUploadState] = useState<{
    isUploading: boolean;
    progress: number;
    uploadResult: StoryMediaUploadResult | null;
    error: string | null;
  }>({
    isUploading: false,
    progress: 0,
    uploadResult: null,
    error: null,
  });
  
  // Story viewing state
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [viewingStoryUserId, setViewingStoryUserId] = useState<string | null>(null);
  const [viewingStoryId, setViewingStoryId] = useState<string | null>(null);
  const [allUsersWithStories, setAllUsersWithStories] = useState<Array<{userId: string; username?: string; displayName?: string; avatarUrl?: string}>>([]);

  // Force clear any stale live users data on screen focus
  // Track screen focus state for muting videos when on other screens
  const [isScreenFocused, setIsScreenFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      refreshLiveUsers();
      return () => {
        setIsScreenFocused(false);
        setCurrentlyPlayingVideo(null);
        // Auto-close story when user navigates away (e.g. another tab, profile, etc.)
        setShowStoryViewer(false);
        setViewingStoryUserId(null);
        setViewingStoryId(null);
        setAllUsersWithStories([]);
      };
    }, [refreshLiveUsers, setCurrentlyPlayingVideo])
  );

  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const themeStyles = useThemeStyles();

  // Stable callbacks for CommunityListHeader to avoid unnecessary re-renders
  const handlePressLive = useCallback((streamId: string) => {
    log('[Community] Opening live stream:', streamId);
    // Livestream feature removed
  }, [router]);
  const handlePressStory = useCallback(async (userId: string, storyId?: string) => {
    log('[Community] Opening story:', userId, storyId);
    try {
      const { fetchStories } = await import('../utils/storyUtils');
      const allStories = await fetchStories();
      const usersMap = new Map<string, { userId: string; username?: string; displayName?: string; avatarUrl?: string }>();
      allStories.forEach(story => {
        if (!usersMap.has(story.user_id)) {
          usersMap.set(story.user_id, {
            userId: story.user_id,
            username: story.username,
            displayName: story.display_name,
            avatarUrl: story.avatar_url,
          });
        }
      });
      const usersList = Array.from(usersMap.values());
      const currentUserIndex = usersList.findIndex(u => u.userId === userId);
      if (currentUserIndex > 0) {
        const reordered = [
          usersList[currentUserIndex],
          ...usersList.slice(0, currentUserIndex),
          ...usersList.slice(currentUserIndex + 1),
        ];
        setAllUsersWithStories(reordered);
      } else {
        setAllUsersWithStories(usersList);
      }
    } catch (error) {
      warn('[Community] Failed to fetch users with stories:', error);
      setAllUsersWithStories([]);
    }
    setViewingStoryUserId(userId);
    setViewingStoryId(storyId || null);
    setShowStoryViewer(true);
  }, []);
  const handlePressCreate = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Create Story', 'Go Live'],
          cancelButtonIndex: 0,
          title: 'What do you want to share?',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            ActionSheetIOS.showActionSheetWithOptions(
              {
                options: ['Cancel', 'Take Photo/Video', 'Choose from Library', 'Text Story'],
                cancelButtonIndex: 0,
                title: 'Create Story',
              },
              (storyButtonIndex) => {
                if (storyButtonIndex === 1) {
                  if (Platform.OS === 'ios') {
                    const { height } = Dimensions.get('window');
                    const delay = height < 650 ? 300 : height < 700 ? 200 : 150;
                    setShowStoryEditor(false);
                    setShowStoryTextEditor(false);
                    InteractionManager.runAfterInteractions(() => {
                      setTimeout(() => {
                        setCameraModalClosed(true);
                        setShowStoryCamera(true);
                      }, delay);
                    });
                  } else {
                    setCameraModalClosed(true);
                    setShowStoryCamera(true);
                  }
                } else if (storyButtonIndex === 2) {
                  if (Platform.OS === 'ios') {
                    const { height } = Dimensions.get('window');
                    const delay = height < 650 ? 300 : height < 700 ? 200 : 150;
                    setShowStoryEditor(false);
                    setShowStoryTextEditor(false);
                    InteractionManager.runAfterInteractions(() => {
                      setTimeout(() => {
                        setCameraModalClosed(true);
                        setShowStoryCamera(true);
                      }, delay);
                    });
                  } else {
                    setCameraModalClosed(true);
                    setShowStoryCamera(true);
                  }
                } else if (storyButtonIndex === 3) {
                  if (Platform.OS === 'ios') {
                    const { height } = Dimensions.get('window');
                    const delay = height < 650 ? 300 : height < 700 ? 200 : 150;
                    setShowStoryCamera(false);
                    setShowStoryEditor(false);
                    InteractionManager.runAfterInteractions(() => {
                      setTimeout(() => setShowStoryTextEditor(true), delay);
                    });
                  } else {
                    setShowStoryTextEditor(true);
                  }
                }
              }
            );
          } else if (buttonIndex === 2) {
            router.push('/live');
          }
        }
      );
    } else {
      setShowCreateStoryModal(true);
    }
  }, [router]);
  // Memoized list header so FlatList doesn't re-create it every render
  const listHeaderComponent = useMemo(
    () => (
      <>
        {/* Small, subtle refresh indicator when refreshing */}
        {refreshing && (
          <View style={styles.refreshIndicatorBar}>
            <ActivityIndicator size="small" color={themeColors.textSecondary} />
          </View>
        )}
        <CommunityListHeader
          styles={styles}
          showPullToRefreshBanner={showPullToRefreshBanner}
          pullToRefreshVariant={pullToRefreshVariant}
          user={user}
          liveStreams={liveStreams}
          onPressLive={handlePressLive}
          onPressStory={handlePressStory}
          onPressCreate={handlePressCreate}
        />
      </>
    ),
    [
      styles,
      refreshing,
      themeColors.textSecondary,
      showPullToRefreshBanner,
      pullToRefreshVariant,
      user,
      liveStreams,
      handlePressLive,
      handlePressStory,
      handlePressCreate,
    ]
  );

  // Header visibility state - no animations for better performance
  
  // Show hint briefly when header is hidden, then auto-hide
  useEffect(() => {
    if (!headerVisible && isVideoPlaying) {
      // Show hint immediately
      setShowTapHint(true);
      
      // Auto-hide after 3 seconds
      const hideTimer = setTimeout(() => {
        setShowTapHint(false);
      }, 3000);
      
      return () => clearTimeout(hideTimer);
    } else {
      // Hide hint
      setShowTapHint(false);
    }
  }, [headerVisible, isVideoPlaying]);

  // Fetch unread notification count
  const fetchUnreadCount = useCallback(async () => {
    if (!user?.id) {
      // Silently handle no user ID case
      setUnreadNotificationCount(0);
      return;
    }

    try {
      // Silently fetch unread count
      
      // Get dismissed notification IDs
      const { data: dismissedNotifications } = await supabase
        .from('notification_dismissals')
        .select('notification_type, notification_id')
        .eq('user_id', user.id);

      const dismissedSet = new Set(
        dismissedNotifications?.map(d => `${d.notification_type}_${d.notification_id}`) || []
      );
      // Silently track dismissed notifications

      // Get read notification IDs
      let readNotificationIds = new Set<string>();
      try {
        const { data: readSocialNotifications } = await supabase
          .from('notification_reads')
          .select('notification_queue_id')
          .eq('user_id', user.id);
        
        if (readSocialNotifications) {
          readNotificationIds = new Set(
            readSocialNotifications.map((r: any) => r.notification_queue_id)
          );
        }
        // Silently track read notifications
      } catch (error) {
        // Table might not exist yet - that's okay
        log('⚠️ notification_reads table may not exist:', error);
      }

      // Get all social notifications (likes, comments, follows, friend requests)
      const { data: socialNotifications } = await supabase
        .from('notification_queue')
        .select('id, notification_type')
        .eq('recipient_id', user.id)
        .in('notification_type', ['like', 'comment', 'follow', 'friend_request', 'friend_request_accepted'])
        .in('status', ['pending', 'sent']);

      // Silently process social notifications

      // Count only unread AND non-dismissed notifications
      const socialCount = socialNotifications?.filter(
        (notif: any) => {
          const isDismissed = dismissedSet.has(`${notif.notification_type}_${notif.id}`);
          const isRead = readNotificationIds.has(notif.id);
          const isUnread = !isDismissed && !isRead;
          if (isUnread) {
            // Silently track unread notifications
          }
          return isUnread;
        }
      ).length || 0;

      // Silently calculate social count

      // Get read announcement IDs for current user
      const { data: readAnnouncements } = await supabase
        .from('announcement_reads')
        .select('announcement_id')
        .eq('user_id', user.id);

      const readAnnouncementIds = new Set(
        readAnnouncements?.map(r => r.announcement_id) || []
      );

      // Get dismissed announcements from notification_dismissals table
      const dismissedAnnouncementIds = new Set(
        dismissedNotifications
          ?.filter(d => d.notification_type === 'announcement')
          .map(d => d.notification_id) || []
      );

      // Also check AsyncStorage for dismissed announcements (legacy support)
      try {
        const dismissed = await AsyncStorage.getItem('dismissed_announcements');
        if (dismissed) {
          const dismissedIds = JSON.parse(dismissed);
          dismissedIds.forEach((id: string) => dismissedAnnouncementIds.add(id));
        }
      } catch (error) {
        error('Error loading dismissed announcements from AsyncStorage:', error);
      }

      // Combine read and dismissed IDs
      const allReadOrDismissedIds = new Set([
        ...Array.from(readAnnouncementIds),
        ...Array.from(dismissedAnnouncementIds)
      ]);

      // Get all active announcements
      const { data: announcements } = await supabase
        .from('announcements')
        .select('id, start_date, end_date, target_audience, is_active');

      // Count only unread announcements
      const unreadAnnouncementCount = announcements?.filter(ann => {
        // Skip if already read or dismissed
        if (allReadOrDismissedIds.has(ann.id)) return false;
        
        // Must be active
        if (!ann.is_active) return false;
        
        // Check date range
        const now = new Date();
        const startDate = ann.start_date ? new Date(ann.start_date) : null;
        const endDate = ann.end_date ? new Date(ann.end_date) : null;
        if (startDate && startDate > now) return false;
        if (endDate && endDate < now) return false;
        
        // Check target audience
        const targetAudience = ann.target_audience || ['all'];
        return targetAudience.includes('all') || targetAudience.includes(user.id);
      }).length || 0;

      // Silently calculate announcement count

      const total = (socialCount || 0) + unreadAnnouncementCount;
      // Silently calculate total - only log in dev mode if needed
      setUnreadNotificationCount(total);
    } catch (error) {
      error('[Community] ❌ Error fetching unread notification count:', error);
      setUnreadNotificationCount(0);
    }
  }, [user?.id]);

  // Fetch count on mount and when user changes
  useEffect(() => {
    fetchUnreadCount();
    // Poll less frequently to reduce re-renders (every 60 seconds instead of 30)
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Refresh count when screen comes into focus (e.g., returning from notifications)
  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
    }, [fetchUnreadCount])
  );
  
  // Track last refresh time to prevent excessive refreshes
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_COOLDOWN = 10000; // 10 seconds minimum between refreshes
  
  // Refresh posts when screen comes into focus (e.g., returning from post detail screen)
  useFocusEffect(
    useCallback(() => {
      // Check if we should refresh due to new post creation
      const checkForRefresh = async () => {
        try {
          const shouldRefresh = await AsyncStorage.getItem('should_refresh_community');
          const shouldRefreshVideos = await AsyncStorage.getItem('should_refresh_videos');
          if (shouldRefresh === 'true' || shouldRefreshVideos === 'true') {
            await AsyncStorage.removeItem('should_refresh_community');
            await AsyncStorage.removeItem('should_refresh_videos');
            lastRefreshRef.current = Date.now();
            if (shouldRefresh === 'true') {
              log('[Community] 🔄 Force refreshing posts due to new post creation');
              await loadPosts(false, true); // forceRefresh=true so cache is bypassed and new post appears
              log('[Community] ✅ Posts refreshed - new post should be visible');
            }
            // Refetch videos so new upload appears at top (useCache=false so new video from Mux is included)
            if (shouldRefreshVideos === 'true') {
              const allVideoPosts = await fetchAllVideoPosts(80, 8, false, false);
              const converted = convertPostsToVideoFeed(allVideoPosts);
              setVideos(converted);
              log('[Community] ✅ Videos refreshed - new upload should appear in feed');
            }
            if (shouldRefresh === 'true' || shouldRefreshVideos === 'true') return;
          }
        } catch (error) {
          error('[Community] Error checking refresh flag:', error);
        }

        // Only refresh if enough time has passed since last refresh
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshRef.current;
        
        if (posts.length > 0 && timeSinceLastRefresh > REFRESH_COOLDOWN) {
          // Silently refresh after screen focus
          lastRefreshRef.current = now;
          
          // Longer delay to avoid conflicts with navigation and reduce load
          // Only refresh if user is at top (not scrolled down) to prevent scroll reset
          const timer = setTimeout(() => {
            // Only refresh if user hasn't scrolled down
            if (!isScrolledDown || scrollY.current < SCROLL_THRESHOLD) {
              loadPosts(true, false); // Silent refresh, use cache
            } else {
              // Silently skip refresh when scrolled down
            }
          }, 2000); // 2 second delay
          return () => clearTimeout(timer);
        } else if (posts.length > 0) {
          // Silently skip refresh - too soon since last refresh
        }
      };
      
      checkForRefresh();
    }, [posts.length, loadPosts])
  );

  // Immediate refresh when a new video post is created (e.g. from Create screen VideoPicker)
  // So the feed updates even if Community tab is mounted in background
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('refreshCommunityFeed', () => {
      log('[Community] 📬 refreshCommunityFeed event – refreshing posts and videos');
      loadPosts(false, true).catch(err => warn('[Community] loadPosts on event failed:', err));
      handleVideoRefresh().catch(err => warn('[Community] handleVideoRefresh on event failed:', err));
    });
    return () => sub.remove();
  }, [loadPosts, handleVideoRefresh]);

  // Real-time subscription to notification changes
  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to notification_queue changes
    const notificationChannel = supabase
      .channel('notification-count-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_queue',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          // Refresh count when notifications change
          fetchUnreadCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_reads',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refresh count when read status changes
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
    };
  }, [user?.id, fetchUnreadCount]);

  // Function to refresh comments without affecting expansion state
  const refreshPostComments = async (postId: string) => {
    try {
      log(`[Community] Refreshing comments for post ${postId}`);
      
      // Only refresh if the post is actually expanded
      if (!expandedPosts.has(postId)) {
        log(`[Community] Post ${postId} is not expanded, skipping refresh`);
        return;
      }
      
      // Clear cache before refreshing (now async)
      await clearCommentsCache(postId, user?.id);
      
      const freshComments = await fetchCommentsWithLikes(postId, user?.id, false);
      if (freshComments && Array.isArray(freshComments)) {
        // CRITICAL: Merge fresh comments with existing comments instead of replacing
        // This preserves old comments that might not be in the fresh fetch
        setPostComments(prev => {
          const existingComments = prev[postId] || [];
          
          // Create a map of existing comments by ID for quick lookup
          const existingCommentsMap = new Map(existingComments.map(c => [c.id, c]));
          
          // Add/update comments from fresh fetch
          freshComments.forEach(freshComment => {
            existingCommentsMap.set(freshComment.id, freshComment);
          });
          
          // Convert back to array and sort by created_at (oldest first)
          const mergedComments = Array.from(existingCommentsMap.values()).sort((a, b) => {
            // Pinned comments first
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            // Then by creation time (oldest first)
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return timeA - timeB;
          });
          
          log(`[Community] Merged comments for post ${postId}: ${existingComments.length} existing + ${freshComments.length} fresh = ${mergedComments.length} total`);
          return {
            ...prev,
            [postId]: mergedComments
          };
        });
      }
    } catch (error) {
      error('[Community] Error refreshing comments:', error);
    }
  };

  // Handle video focus changes - respect user's header visibility preference
  const handleVideoFocusChange = useCallback((videoId: string | null) => {
    const isVideoFocused = !!videoId;
    setIsVideoFocused(isVideoFocused);
    setIsVideoPlaying(isVideoFocused);
    
    // Only log significant video focus changes (not every update)
    if (videoId) {
      log(`[Community] Video focused: ${videoId}`);
    }
    
    // Don't automatically change header visibility - let user control it
    // Just track the video focus state for other functionality
  }, []);

  // Handle exit from full-screen video mode
  const handleExitFullscreen = useCallback(() => {
    setActiveTab('posts');
    // Ensure header is visible when returning to posts
    setHeaderVisible(true);
    setIsVideoFocused(false);
  }, []);

  // Optimized video processing function (reusable)
  // Note: Videos come from Mux and don't need caching

  const processVideos = useCallback(async (postsToProcess: Post[], force = false, merge = false) => {
    // If merging (for pagination), don't skip even if already processed
    if (!merge && videosProcessedRef.current && !force && videos.length > 0) {
      log('[Community] Videos already processed, skipping');
      return;
    }
    
    try {
      log(`[Community] Processing video feed${merge ? ' (merging with existing)' : ''}...`);
      
      // Convert to video posts, then apply TikTok-style shuffle so home feed
      // matches the fullscreen video feed behaviour
      const videoPostsData = convertPostsToVideoFeed(postsToProcess);
      const mixedVideoPosts = videoPostsData.length > 1 ? mixVideoFeed(videoPostsData) : videoPostsData;
      
      if (merge && videos.length > 0) {
        // Merge mode: Combine with existing videos instead of replacing
        setVideos(prevVideos => {
          // Filter out invalid/undefined videos before processing
          const validPrevVideos = (prevVideos || []).filter((v): v is VideoPost => v != null && typeof v?.id === 'string');
          const existingIds = new Set(validPrevVideos.map(v => v.id));
          const uniqueNewVideos = mixedVideoPosts.filter(v => v && v.id && !existingIds.has(v.id));
          
          if (uniqueNewVideos.length > 0) {
            // Re‑mix the combined set so pagination / merging still feels
            // like a \"For You\" feed instead of strict chronological order
            const combined = mixVideoFeed([...validPrevVideos, ...uniqueNewVideos]);
            
            log(`[Community] 🎥 Merged ${uniqueNewVideos.length} videos, total: ${combined.length}`);
            return combined;
          }
          
          return validPrevVideos; // No new videos to add, return filtered valid videos
        });
      } else {
        // Replace mode: Set videos directly (initial load)
        const combinedVideos = mixedVideoPosts.length > 1 ? mixVideoFeed(mixedVideoPosts) : mixedVideoPosts;
        
        log(`[Community] Processed ${mixedVideoPosts.length} user videos (shuffled for home feed)`);
        setVideos(combinedVideos);
      }
      
      videosProcessedRef.current = true;
    } catch (error) {
      error('[Community] Error processing videos:', error);
      // Fallback to empty array only if not merging
      if (!merge) {
        setVideos([]);
      }
    }
  }, [videos.length]);

  // Video feed handlers
  const handleVideoRefresh = useCallback(async () => {
    log('[Community] Fetching posts for video feed');
    setRefreshing(true);
    
    try {
      // Reset videosProcessedRef to allow reloading videos
      videosProcessedRef.current = false;
      
      // Load videos directly from database (bypass cache on refresh)
      const allVideoPosts = await fetchAllVideoPosts(80, 8, false, true); // useCache=false, shuffle=true for discovery
      
      // Convert to VideoPost format
      const converted = convertPostsToVideoFeed(allVideoPosts);
      
      // Videos are shuffled for "For You" feel; getSortedPosts still sorts combined feed by created_at so newest can be at top
      setVideos(converted);
      
      // Mark as processed - this prevents processVideos from overwriting
      videosProcessedRef.current = true;
      
      if (__DEV__) {
        log(`[Community] ✅ Refreshed ${converted.length} videos directly from DB`);
      }
      
      // NOTE: We do NOT call processVideos here because it would overwrite the videos we just set
      // The posts state is updated separately by loadPosts which is called in parallel
    } catch (error) {
      error('[Community] Error fetching video posts:', error);
      // Show a user-friendly message but continue with fallback
      warn('[Community] Continuing with sample videos due to error');
      
      // Fallback: try to process videos from regular posts (include videos: excludeVideos=false)
      try {
        const fetchedPosts = await fetchPosts(50, 0, false, false);
        // Use merge=true as fallback so we don't clear existing videos
        processVideos(fetchedPosts, true, true);
      } catch (fallbackError) {
        error('[Community] Fallback video fetch also failed:', fallbackError);
        // Don't clear videos on error - keep what we had
      }
    } finally {
      setRefreshing(false);
    }
  }, [processVideos]);

  // Refresh video feed when user returns to the tab (after closing/leaving)
  const videoFeedHasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (videoFeedHasFocusedRef.current) {
        handleVideoRefresh();
      } else {
        videoFeedHasFocusedRef.current = true;
      }
      return () => {};
    }, [handleVideoRefresh])
  );

  const handleVideoLike = useCallback(async (videoId: string, isLiked: boolean) => {
    if (!user?.id) {
      log('[Community] Video like skipped: no user');
      return;
    }
    // Optimistic update so the red heart shows immediately
    setVideos(prev => prev
      .filter((v): v is VideoPost => v != null && typeof v?.id === 'string')
      .map(video =>
        video.id === videoId
          ? {
              ...video,
              is_liked: isLiked,
              likes_count: isLiked ? video.likes_count + 1 : Math.max(0, video.likes_count - 1),
            }
          : video
      ));
    try {
      const ok = await toggleLike(videoId, user.id);
      if (!ok) {
        // Revert on failure so UI matches server
        setVideos(prev => prev
          .filter((v): v is VideoPost => v != null && typeof v?.id === 'string')
          .map(video =>
            video.id === videoId
              ? {
                  ...video,
                  is_liked: !isLiked,
                  likes_count: isLiked ? Math.max(0, video.likes_count - 1) : video.likes_count + 1,
                }
              : video
          ));
        Alert.alert('Error', 'Failed to update like. Please try again.');
      }
      log(`${isLiked ? 'Liked' : 'Unliked'} video ${videoId}`);
      if (ok) {
        if (isLiked) addSessionLiked(videoId);
        else removeSessionLiked(videoId);
      }
    } catch (error) {
      error('Error toggling video like:', error);
      setVideos(prev => prev
        .filter((v): v is VideoPost => v != null && typeof v?.id === 'string')
        .map(video =>
          video.id === videoId
            ? {
                ...video,
                is_liked: !isLiked,
                likes_count: isLiked ? Math.max(0, video.likes_count - 1) : video.likes_count + 1,
              }
            : video
        ));
      Alert.alert('Error', 'Failed to update like. Please try again.');
    }
  }, [user?.id, addSessionLiked, removeSessionLiked]);

  const handleVideoBookmark = useCallback(async (videoId: string, isBookmarked: boolean) => {
    try {
      setVideos(prev => prev
        .filter((v): v is VideoPost => v != null && typeof v?.id === 'string')
        .map(video => 
          video.id === videoId 
            ? { ...video, is_bookmarked: isBookmarked }
            : video
        ));
      log(`${isBookmarked ? 'Bookmarked' : 'Unbookmarked'} video ${videoId}`);
    } catch (error) {
      error('Error toggling video bookmark:', error);
      Alert.alert('Error', 'Failed to update bookmark. Please try again.');
    }
  }, []);

  const handleVideoComment = useCallback((video: VideoPost) => {
    Alert.alert('Comments', `Opening comments for "${video.description?.substring(0, 30)}..."`);
  }, []);

  const handleVideoShare = useCallback((video: VideoPost) => {
    Alert.alert('Share', `Sharing "${video.description?.substring(0, 30)}..."`);
  }, []);

  const handleVideoUserPress = useCallback((userId: string) => {
    router.push(`/profile/${userId}`);
  }, [router]);

  const handleMuteToggle = useCallback((muted: boolean) => {
    setGlobalMuted(muted);
  }, []);

  const loadMoreVideos = useCallback(async () => {
    try {
      // In a real implementation, you would fetch more posts with pagination
      // For now, we'll just refresh the video feed to get any new video posts
      await handleVideoRefresh();
    } catch (error) {
      error('Error loading more videos:', error);
      // Fallback to empty array
      log('No more videos to load');
    }
  }, [handleVideoRefresh]);

  // Handle header visibility for video mode
  const toggleHeaderVisibility = useCallback(() => {
    const newVisible = !headerVisible;
    setHeaderVisible(newVisible);
    
    // Show tap hint when header is hidden
    if (!newVisible) {
      setShowTapHint(true);
      // Auto-hide tap hint after 3 seconds
      setTimeout(() => {
        setShowTapHint(false);
      }, 3000);
    } else {
      setShowTapHint(false);
    }
  }, [headerVisible]);

  // Reset header for unified feed
  useEffect(() => {
    try {
      setHeaderVisible(true);
      setShowTapHint(false);
    } catch (error) {
      error('[Community] Error in header effect:', error);
    }
  }, []);

  // Handle toggling a comment like
  const handleToggleCommentLike = async (postId: string, commentId: string, userId: string) => {
    if (!userId) {
      router.push('/auth/signin');
      return;
    }
    
    try {
      log(`[Community] Toggling like for comment ${commentId} by user ${userId}`);
      
      // Optimistically update UI
      setPostComments(prevComments => {
        const updatedComments = { ...prevComments };
        if (updatedComments[postId]) {
          updatedComments[postId] = updatedComments[postId].map(c => {
            if (c.id === commentId) {
              const newLiked = !c.liked;
              const currentCount = c.likes_count || 0;
              let newCount;
              
              if (newLiked) {
                // Liking - increment count
                newCount = currentCount + 1;
              } else {
                // Unliking - decrement but don't go below 0
                newCount = Math.max(0, currentCount - 1);
              }
              
              return {
                ...c,
                liked: newLiked,
                likes_count: newCount
              };
            }
            return c;
          });
        }
        return updatedComments;
      });
      
      // Update in database
      log(`[Community] Calling toggleCommentLike for comment ${commentId}`);
      const success = await toggleCommentLike(commentId, userId);
      
      if (!success) {
        error('[Community] Failed to toggle comment like, reverting UI');
        // Show user-friendly error message
        Alert.alert('Error', 'Failed to update like. Please try again.');
        // Refresh comments to revert UI without closing comments section
        await refreshPostComments(postId);
      } else {
        log('[Community] Like toggled successfully in database');
        // Refresh comments to get the correct database state without closing comments section
        setTimeout(() => {
          refreshPostComments(postId);
        }, 500);
      }
    } catch (error) {
      error('[Community] Error toggling comment like:', error);
      // Show specific error message
      const errorMessage = error.message || 'Failed to update like. Please try again.';
      Alert.alert('Error', errorMessage);
      // Refresh comments to revert UI without closing comments section
      await refreshPostComments(postId);
    }
  };
  
  // Update selectedPost when postMenuVisible changes
  useEffect(() => {
    if (postMenuVisible) {
      // First try to find in regular posts array
      let post = posts.find(p => p.id === postMenuVisible);
      // If not found, try video posts array
      if (!post) {
        post = videoPosts.find(p => p.id === postMenuVisible);
      }
      setSelectedPost(post || null);
    } else {
      setSelectedPost(null);
    }
  }, [postMenuVisible, posts, videoPosts]);
  
  // Update selectedComment when commentMenuVisible changes
  useEffect(() => {
    if (commentMenuVisible) {
      const comment = Object.values(postComments)
        .flat()
        .find(c => c.id === commentMenuVisible);
      setSelectedComment(comment || null);
    } else {
      setSelectedComment(null);
    }
  }, [commentMenuVisible, postComments]);
  
  // Load cached data immediately to prevent loading state flicker
  // Only needed if we didn't have in-memory cache (need to check persistent cache)
  useEffect(() => {
    if (hasCheckedCache) {
      // We already have cached data from sync check - ensure loading is false
      logWithMount('✅ Already have cached data, ensuring loading is false');
      setLoading(false);
      
      // Process videos only if not already processed
      if (hasInitialCache && initialCachedPosts && !videosProcessedRef.current) {
        // Process cached videos immediately (only once)
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => {
            processVideos(initialCachedPosts, false);
          }, { timeout: 50 });
        } else {
          setTimeout(() => processVideos(initialCachedPosts, false), 0);
        }
      }
      return;
    }
    
    const loadCachedDataImmediately = async () => {
      try {
        // First try prefetch cache (fastest - loaded during splash screen)
        const { getPrefetchedData } = await import('../utils/prefetchService');
        const prefetched = await getPrefetchedData();
        
        if (prefetched?.posts && prefetched.posts.length > 0) {
          log(`[Community] 🚀 Found ${prefetched.posts.length} prefetched posts - showing immediately`);
          const realPostsOnly = prefetched.posts.filter(
            post => !post.id.startsWith('placeholder-post-') && !post.id.startsWith('bundled-offline-post-')
          );
          // Check if we already have more posts loaded (from pagination)
          // If so, don't replace them - just merge new posts at the top
          if (realPostsOnly.length > 0) {
            startTransition(() => {
              setPosts(prevPosts => {
                // Always preserve existing posts when loading cached data (this is initial load)
                if (prevPosts.length > realPostsOnly.length) {
                  log(`[Community] Preserving ${prevPosts.length} existing posts, merging ${realPostsOnly.length} cached posts`);
                  // Merge new posts with existing, avoiding duplicates
                  const existingIds = new Set(prevPosts.map(p => p.id));
                  const newPosts = realPostsOnly.filter(p => !existingIds.has(p.id));
                  if (newPosts.length > 0) {
                    // Add new posts at the beginning (fresh posts) and keep existing
                    return [...newPosts, ...prevPosts];
                  }
                  return prevPosts; // No new posts, keep existing
                }
                // First load - show cached posts
                return realPostsOnly;
              });
            });
          } else {
            // No cached posts, but don't clear existing posts if we have them
            log('[Community] No cached posts found, keeping existing posts');
          }
          setLoading(false);
          setHasCheckedCache(true);
          
          // Process cached videos immediately
          if (!videosProcessedRef.current) {
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(() => {
                processVideos(realPostsOnly, false);
              }, { timeout: 50 });
            } else {
              setTimeout(() => processVideos(realPostsOnly, false), 0);
            }
          }
          return;
        }
        
        // Fallback to AsyncStorage cache
        const cachedPosts = await getCachedPosts(undefined, 0);
        if (cachedPosts && cachedPosts.length > 0) {
          log(`[Community] Found ${cachedPosts.length} cached posts from persistent cache`);
          const realPostsOnly = cachedPosts.filter(
            post => !post.id.startsWith('placeholder-post-') && !post.id.startsWith('bundled-offline-post-')
          );
          
          // Check if we already have more posts loaded (from pagination)
          // If so, don't replace them - just merge new posts at the top
          if (realPostsOnly.length > 0) {
            startTransition(() => {
              setPosts(prevPosts => {
                // Always preserve existing posts when loading cached data (this is initial load)
                if (prevPosts.length > realPostsOnly.length) {
                  log(`[Community] Preserving ${prevPosts.length} existing posts, merging ${realPostsOnly.length} cached posts`);
                  // Merge new posts with existing, avoiding duplicates
                  const existingIds = new Set(prevPosts.map(p => p.id));
                  const newPosts = realPostsOnly.filter(p => !existingIds.has(p.id));
                  if (newPosts.length > 0) {
                    // Add new posts at the beginning (fresh posts) and keep existing
                    return [...newPosts, ...prevPosts];
                  }
                  return prevPosts; // No new posts, keep existing
                }
                
                // Progressive loading: Store all cached posts in pool, show only initial batch
                if (realPostsOnly.length > INITIAL_CACHE_DISPLAY) {
                  log(`[Community] Progressive cache loading: Showing ${INITIAL_CACHE_DISPLAY} of ${realPostsOnly.length} cached posts`);
                  // Store all cached posts in pool for progressive loading
                  setCachedPostsPool(realPostsOnly);
                  setCachedPostsShown(INITIAL_CACHE_DISPLAY);
                  // Show only initial batch
                  return realPostsOnly.slice(0, INITIAL_CACHE_DISPLAY);
                } else {
                  // Fewer posts than initial display, show all
                  log(`[Community] Showing all ${realPostsOnly.length} cached posts`);
                  setCachedPostsPool([]); // No pool needed
                  setCachedPostsShown(realPostsOnly.length);
                  return realPostsOnly;
                }
              });
            });
          } else {
            // No cached posts, but don't clear existing posts if we have them
            log('[Community] No cached posts found, keeping existing posts');
          }
          setLoading(false); // Hide loading state immediately
          setHasCheckedCache(true);
          
          // Process cached videos immediately (only if not already processed)
          if (!videosProcessedRef.current) {
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(() => {
                processVideos(realPostsOnly, false);
              }, { timeout: 50 });
            } else {
              setTimeout(() => processVideos(realPostsOnly, false), 0);
            }
          }
        } else {
          setHasCheckedCache(true);
        }
      } catch (error) {
        error('[Community] Error loading cached data:', error);
        setHasCheckedCache(true);
      }
    };
    
    loadCachedDataImmediately();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCheckedCache]);
  
  // Track if we've loaded posts on initial mount to prevent double loading
  const hasInitiallyLoadedRef = useRef(false);
  const postsSubscriptionRef = useRef<any>(null);
  // Track if we have posts to prevent showing shimmer on remount
  const hasPostsRef = useRef(posts.length > 0);
  
  // Update ref when posts change
  useEffect(() => {
    logWithMount('📊 Posts state changed', {
      postsCount: posts.length,
      loading,
      mountId: mountIdRef.current
    }, 1000); // Throttle to once per second
    
    hasPostsRef.current = posts.length > 0;
    // NEVER show loading if we have posts - this prevents shimmer on remount
    if (posts.length > 0 && loading) {
      logWithMount('⚠️ Have posts but loading is true - fixing');
      setLoading(false);
    }
  }, [posts.length, loading]);
  
  // Set up realtime subscription for posts changes
  useEffect(() => {
    const setupPostsSubscription = async () => {
      // Remove any existing subscription
      if (postsSubscriptionRef.current) {
        supabase.removeChannel(postsSubscriptionRef.current);
      }
      
      // Set up subscription to posts table
      // OPTIMIZED: Only listen to INSERT events (new posts) to reduce load
      // UPDATE and DELETE events are less critical and can be handled via polling/refresh
      const postsSubscription = supabase
        .channel('posts-changes')
        .on('postgres_changes', 
          { 
            event: 'INSERT', // Only listen to new posts, not updates/deletes
            schema: 'public', 
            table: 'posts',
            // Note: We could add filters here like:
            // filter: 'user_id=in.(followed_user_ids)' to only get posts from followed users
            // But for now, we'll keep it simple and filter client-side
          }, 
          (payload) => {
            log('[Community] Post change received:', payload.eventType);
            
            // Handle different types of changes without flickering using startTransition
            if (payload.eventType === 'INSERT') {
              const newPost = payload.new;
              log('[Community] New post created:', newPost.id);
              
              // Check if post already exists (prevent duplicates)
              setPosts(currentPosts => {
                const exists = currentPosts.some(p => p.id === newPost.id);
                if (exists) {
                  log('[Community] Post already exists, skipping');
                  return currentPosts; // No change, prevent re-render
                }
                
                // CRITICAL: Always add user's own posts immediately, regardless of scroll position
                const isOwnPost = user?.id && newPost.user_id === user.id;
                
                // Check scroll state - use both scrollY.current and isScrolledDown state for accuracy
                const currentScrollY = scrollY.current;
                const isUserScrolledDown = currentScrollY > SCROLL_THRESHOLD || isScrolledDown;
                
                log(`[Community] New post detected - scrollY: ${currentScrollY}, threshold: ${SCROLL_THRESHOLD}, isScrolledDown state: ${isScrolledDown}, isOwnPost: ${isOwnPost}, should queue: ${isUserScrolledDown && !isOwnPost}`);
                
                // Always add own posts immediately, or if user is at top
                if (isOwnPost || !isUserScrolledDown) {
                  log(`[Community] ✅ Adding post immediately (isOwnPost: ${isOwnPost}, atTop: ${!isUserScrolledDown})`);
                  
                  // Enrich post with profile data before adding (like fetchPosts does)
                  // Do this outside setPosts to avoid async issues
                  (async () => {
                    try {
                      // Fetch profile data
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('id, username, full_name, avatar_url, is_verified')
                        .eq('id', newPost.user_id)
                        .single();
                      
                      if (profile) {
                        newPost.profile = profile;
                        newPost.is_verified = profile.is_verified || false;
                        newPost.user_avatar_url = profile.avatar_url || null;
                      }
                      
                      // Set username with fallbacks (same logic as fetchPosts)
                      if (newPost.display_name) {
                        newPost.username = newPost.display_name;
                      } else if (profile?.username) {
                        newPost.username = profile.username;
                      } else if (profile?.full_name) {
                        newPost.username = profile.full_name;
                      } else if (newPost.user_email) {
                        newPost.username = newPost.user_email.split('@')[0];
                      } else if (newPost.user_id) {
                        newPost.username = `user_${newPost.user_id.substring(0, 8)}`;
                      } else {
                        newPost.username = 'Unknown User';
                      }
                      
                      log(`[Community] ✅ Enriched post ${newPost.id} with profile data: username=${newPost.username}`);
                    } catch (error) {
                      warn(`[Community] Failed to enrich post ${newPost.id} with profile:`, error);
                      // Use fallback username if profile fetch fails
                      if (!newPost.username) {
                        newPost.username = newPost.display_name || newPost.user_email?.split('@')[0] || `user_${newPost.user_id?.substring(0, 8) || 'unknown'}`;
                      }
                    }
                    
                    // Add post after enrichment
                    startTransition(() => {
                      setPosts(currentPosts => {
                        // Check again if post exists (race condition protection)
                        const exists = currentPosts.some(p => p.id === newPost.id);
                        if (exists) {
                          return currentPosts;
                        }
                        return [newPost, ...currentPosts];
                      });
                    });
                    
                    // Scroll to top if it's user's own post
                    if (isOwnPost) {
                      setTimeout(() => {
                        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                      }, 200);
                    }
                  })();
                  
                  return currentPosts; // Return current to prevent double update
                } else {
                  // User is scrolled down and it's not their own post - queue it
                  log('[Community] ✅ User scrolled down - queuing new post and showing alert');
                  // Store pending post and increment count (outside setPosts for proper state updates)
                  setPendingNewPosts(prev => {
                    // Check if already in pending list
                    if (prev.some(p => p.id === newPost.id)) {
                      log('[Community] Post already in pending list, skipping');
                      return prev;
                    }
                    log('[Community] Adding post to pending list');
                    return [newPost, ...prev]; // Add to beginning of pending list
                  });
                  // Increment count outside setPosts callback to ensure it executes
                  setNewPostsCount(prev => {
                    const newCount = prev + 1;
                    log(`[Community] ✅ Incrementing new posts count: ${prev} -> ${newCount}`);
                    return newCount;
                  });
                  return currentPosts; // Don't add yet, wait for user to refresh
                }
              });
            }
            // Note: DELETE and UPDATE events removed from subscription to reduce Supabase load
            // These can be handled via periodic refresh or when user interacts with posts
          }
        )
        .subscribe();
        
      postsSubscriptionRef.current = postsSubscription;
    };
    
    setupPostsSubscription();
    
    return () => {
      if (postsSubscriptionRef.current) {
        supabase.removeChannel(postsSubscriptionRef.current);
      }
    };
  }, []);
  

  // Load posts on component mount (only once)
  useEffect(() => {
    logWithMount('useEffect: loadPosts on mount', {
      hasInitiallyLoaded: hasInitiallyLoadedRef.current,
      postsCount: posts.length,
      loading,
      hasInitialCache
    });
    
    // Initialize cache pool from initial cached posts (progressive loading)
    if (initialCachedPosts && initialCachedPosts.length > 0) {
      const realPostsOnly = initialCachedPosts.filter(
        post => !post.id.startsWith('placeholder-post-') && !post.id.startsWith('bundled-offline-post-')
      );
      if (realPostsOnly.length > INITIAL_CACHE_DISPLAY) {
        // Store all cached posts in pool for progressive loading
        setCachedPostsPool(realPostsOnly);
        setCachedPostsShown(INITIAL_CACHE_DISPLAY);
        log(`[Community] Initialized cache pool: ${realPostsOnly.length} posts, showing ${INITIAL_CACHE_DISPLAY}`);
      }
      
      // 🛡️ LOAD SHIELDING: If we have cached data, mark critical path complete immediately
      // This allows background services to start loading right away
      if (realPostsOnly.length > 0 && !loadShielding.isCriticalPathComplete()) {
        loadShielding.markCriticalPathComplete();
        log('[Community] ✅ Critical path complete (cached data available) - background services starting');
      }
    }
    
    // Prevent double loading on initial mount
    if (hasInitiallyLoadedRef.current) {
      logWithMount('⏭️ Skipping duplicate loadPosts call - already loaded');
      return;
    }
    
    hasInitiallyLoadedRef.current = true;
    
    // CRITICAL: Always refresh silently in background (placeholders are already showing)
    // This ensures real data loads without blocking the UI
    logWithMount('✅ Placeholders showing - loading real data silently in background');
    loadPosts(true).then(() => {
      // 🛡️ LOAD SHIELDING: Mark critical path complete after Community screen loads
      // This triggers background loading of other screens/services
      loadShielding.markCriticalPathComplete();
      log('[Community] ✅ Critical path complete - background services will start loading');
    }).catch((err) => {
      // Even if load fails, mark critical path complete so other services can start
      loadShielding.markCriticalPathComplete();
      // One retry after 2s so transient network failures don't leave feed empty
      warn('[Community] Initial load failed, retrying in 2s:', err);
      setTimeout(() => {
        loadPostsRef.current?.(true);
      }, 2000);
    });
    
    // Note: loadLiveStreams is automatically called by the useLiveStreams hook
    
    // Clear community badge count when screen loads
    try {
      badgeCounter.decrementBadgeCount('community');
    } catch (error) {
      error('[Community] Error clearing community badge:', error);
    }
    
    // Set up a timer to refresh posts periodically (disabled during development to reduce memory pressure)
    // Use ref so the interval always calls the latest loadPosts
    const refreshTimer = __DEV__ ? null : setInterval(() => {
      if (!refreshing) {
        log('[Community] Auto-refreshing posts');
        loadPostsRef.current?.(true);
      }
    }, 600000); // Increased from 5 minutes to 10 minutes to reduce energy usage - realtime handles most updates
    
    return () => {
      logWithMount('🧹 Cleanup: clearing refresh timer');
      if (refreshTimer) {
      clearInterval(refreshTimer);
      }
    };
  }, []);
  
  // Log unmounts
  useEffect(() => {
    return () => {
      logWithMount('❌ COMPONENT UNMOUNTED', { mountId: mountIdRef.current });
    };
  }, []);
  
  // Load posts from the API (with caching support)
  const loadPosts = async (silent = false, forceRefresh = false) => {
    const loadStartTime = Date.now();
    let showedCachedData = false;
    let cachedPosts: Post[] | null = null;
    
    // Reset hasMorePosts when loading fresh posts (especially on force refresh)
    if (forceRefresh) {
      setHasMorePosts(true);
    }
    
    try {
      logWithMount('📡 loadPosts called', { 
        silent, 
        forceRefresh, 
        hasPosts: posts.length > 0,
        postsCount: posts.length,
        loading,
        mountId: mountIdRef.current
      });
      
      // CRITICAL: Never show loading state - placeholders are already visible
      // This ensures smooth UX - placeholders show instantly, real data loads silently
      const hasPosts = posts.length > 0 || placeholderPosts.length > 0;
      
      // 🚀 CACHE-FIRST: Show cached data BEFORE checking network (faster perceived load)
      // This ensures users see content instantly on cold start instead of waiting for network check
      if (!forceRefresh) {
        // First try pre-fetched data (fastest - loaded during splash)
        const { getPrefetchedData } = await import('../utils/prefetchService');
        const prefetched = await getPrefetchedData();
        
        if (prefetched?.posts && prefetched.posts.length > 0) {
          log(`[Community] Found ${prefetched.posts.length} pre-fetched posts`);
          // Filter out placeholders
          const realPostsOnly = prefetched.posts.filter(
            post => !post.id.startsWith('placeholder-post-') && !post.id.startsWith('bundled-offline-post-')
          );
          
          // Check if we already have more posts loaded (from pagination)
          // If so, don't replace them - just merge new posts at the top
          startTransition(() => {
            setPosts(prevPosts => {
              if (prevPosts.length > realPostsOnly.length && !forceRefresh) {
                log(`[Community] Preserving ${prevPosts.length} existing posts, merging ${realPostsOnly.length} cached posts`);
                // Merge new posts with existing, avoiding duplicates
                const existingIds = new Set(prevPosts.map(p => p.id));
                const newPosts = realPostsOnly.filter(p => !existingIds.has(p.id));
                if (newPosts.length > 0) {
                  // Add new posts at the beginning (fresh posts) and keep existing
                  return [...newPosts, ...prevPosts];
                }
                return prevPosts; // No new posts, keep existing
              }
              
              // Progressive loading: Store all cached posts in pool, show only initial batch
              if (realPostsOnly.length > INITIAL_CACHE_DISPLAY) {
                log(`[Community] Progressive cache loading: Showing ${INITIAL_CACHE_DISPLAY} of ${realPostsOnly.length} pre-fetched posts`);
                // Store all cached posts in pool for progressive loading
                setCachedPostsPool(realPostsOnly);
                setCachedPostsShown(INITIAL_CACHE_DISPLAY);
                // Show only initial batch
                return realPostsOnly.slice(0, INITIAL_CACHE_DISPLAY);
              } else {
                // Fewer posts than initial display, show all
                log(`[Community] Showing all ${realPostsOnly.length} pre-fetched posts`);
                setCachedPostsPool([]); // No pool needed
                setCachedPostsShown(realPostsOnly.length);
                return realPostsOnly;
              }
            });
          });
          setLoading(false);
          showedCachedData = true;
          cachedPosts = prefetched.posts;
        } else {
          // Fallback to AsyncStorage cache - get all cached posts (no limit)
          cachedPosts = await getCachedPosts(undefined, 0);
          if (cachedPosts && cachedPosts.length > 0) {
            log(`[Community] Found ${cachedPosts.length} cached posts`);
            // Filter out placeholders
            const realPostsOnly = cachedPosts.filter(
              post => !post.id.startsWith('placeholder-post-') && !post.id.startsWith('bundled-offline-post-')
            );
            
            // Progressive loading: Store all cached posts in pool, show only initial batch
            if (realPostsOnly.length > INITIAL_CACHE_DISPLAY) {
              log(`[Community] Progressive cache loading: Showing ${INITIAL_CACHE_DISPLAY} of ${realPostsOnly.length} cached posts`);
              // Store all cached posts in pool for progressive loading
              setCachedPostsPool(realPostsOnly);
              setCachedPostsShown(INITIAL_CACHE_DISPLAY);
              // Show only initial batch
              setPosts(realPostsOnly.slice(0, INITIAL_CACHE_DISPLAY));
            } else {
              // Fewer posts than initial display, show all
              log(`[Community] Showing all ${realPostsOnly.length} cached posts`);
              setCachedPostsPool([]); // No pool needed
              setCachedPostsShown(realPostsOnly.length);
              setPosts(realPostsOnly);
            }
            setLoading(false);
            showedCachedData = true;
          }
        }
        
        if (cachedPosts && cachedPosts.length > 0) {
          // Also process cached videos immediately for faster video tab loading (only if not already processed)
          if (!videosProcessedRef.current) {
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(() => {
                processVideos(cachedPosts!, false);
              }, { timeout: 50 });
            } else {
              setTimeout(() => processVideos(cachedPosts!, false), 0);
            }
          }
          
          // 🚀 AGGRESSIVE PRELOADING: Preload media from cached posts
          (async () => {
            try {
              const { preloadAllMedia, preloadNextBatch } = await import('../utils/aggressiveCacheService');
              // Preload all media from cached posts (non-blocking)
              preloadAllMedia(cachedPosts, []).catch(err => {
                warn('[Community] Cached media preload failed (non-critical):', err);
              });
              // Preload next batch for smooth scrolling (non-blocking)
              preloadNextBatch(cachedPosts).catch(err => {
                warn('[Community] Cached next batch preload failed (non-critical):', err);
              });
            } catch (err) {
              warn('[Community] Aggressive cache service not available:', err);
            }
          })();
          
          // 🔄 CRITICAL: Always fetch fresh data after showing cache to check for new posts
          // This ensures "all caught up" message doesn't show when there's fresh data in database
          log('[Community] 🔄 Cached data shown, fetching fresh data progressively...');
          // Fetch and display posts incrementally (show as they load, don't wait for all)
          (async () => {
            try {
              const CHUNK_SIZE = 10; // Fetch 10 posts at a time
              let offset = 0;
              const cachedIds = new Set(cachedPosts.map(p => p.id));
              
              while (true) {
                const chunk = await fetchPosts(CHUNK_SIZE, offset, false); // Force fresh data
                if (!chunk || chunk.length === 0) break;
                
                // Filter out placeholders and show immediately
                const realChunk = chunk.filter(p => !p.id.startsWith('placeholder-post-') && !p.id.startsWith('bundled-offline-post-'));
                const newPosts = realChunk.filter(p => !cachedIds.has(p.id));
                
                if (newPosts.length > 0) {
                  // Show posts immediately as they load
                  startTransition(() => {
                    setPosts(prevPosts => {
                      const existingIds = new Set(prevPosts.map(p => p.id));
                      const uniqueNew = newPosts.filter(p => !existingIds.has(p.id));
                      if (uniqueNew.length > 0) {
                        return [...uniqueNew, ...prevPosts];
                      }
                      return prevPosts;
                    });
                  });
                }
                
                // If we got fewer posts than requested, we're done
                if (chunk.length < CHUNK_SIZE) break;
                offset += CHUNK_SIZE;
                
                // Small delay to prevent overwhelming the UI
                await new Promise(resolve => setTimeout(resolve, 50));
              }
              
              setHasMorePosts(true);
              setShowEndMessage(false);
            } catch (error) {
              warn('[Community] Background fresh data fetch failed (non-critical):', error);
            }
          })();
        }
      } else {
        // Force refresh - still never show loading (placeholders are visible)
        setLoading(false);
      }
      
      // 📴 OFFLINE CHECK: Now check network AFTER showing cached data
      // This ensures cached content appears instantly, network check doesn't block UI
      const netInfo = await NetInfo.fetch();
      
      if (!netInfo.isConnected) {
        log('[Community] 📴 Offline detected');
        
        // If we already showed cached data, we're done
        if (showedCachedData) {
          log('[Community] 📴 Offline - cached content already shown, done');
          // Process cached videos offline
          if (cachedPosts && !videosProcessedRef.current) {
            processVideos(cachedPosts, false).catch(() => {});
          }
          return;
        }
        
        // No cached data shown yet - try to load from cache
        const offlineCachedPosts = await getCachedPosts(undefined, 0);
        if (offlineCachedPosts && offlineCachedPosts.length > 0) {
          const realPostsOnly = offlineCachedPosts.filter(
            post => !post.id.startsWith('placeholder-post-') && !post.id.startsWith('bundled-offline-post-')
          );
          
          if (realPostsOnly.length > 0) {
            log(`[Community] 📴 Showing ${realPostsOnly.length} cached posts offline`);
            startTransition(() => {
              setPosts(realPostsOnly);
            });
            setLoading(false);
            
            // Process cached videos offline
            if (!videosProcessedRef.current) {
              processVideos(realPostsOnly, false).catch(() => {});
            }
            
            return;
          }
        }
        
        // No cached posts - show bundled offline content (local assets only)
        const bundledPosts = getBundledOfflinePosts(5);
        log(`[Community] 📴 Showing ${bundledPosts.length} bundled offline posts (no cache)`);
        startTransition(() => {
          setPosts(bundledPosts);
        });
        setLoading(false);
        return;
      }
      
      // Skip network fetch if we already kicked off a background fetch from cache path
      if (showedCachedData) {
        log('[Community] ✅ Cached data shown, background fetch already in progress');
        return;
      }
      
      // 🔄 CRITICAL: When forceRefresh=true (pull-to-refresh), ALWAYS bypass cache to get fresh data from database
      // Load 40 items but only show 20 initially (keeps 20 ready for smooth scrolling)
      const INITIAL_BATCH_SIZE = LOAD_BATCH_SIZE; // Load 40 items
      // Force bypass cache when forceRefresh=true (pull-to-refresh), use cache only for silent background refreshes
      const useCache = silent && !forceRefresh;
      
      if (forceRefresh) {
        log('[Community] 🔄 Force refresh: Bypassing ALL cache, fetching fresh data from database...');
      }
      
      // Process all posts (photos, text, videos); home list order uses sortFeedPosts (boost + engagement + recency)
      
      // 🚀 Measure performance
      const fetchStartTime = Date.now();
      const fetchedPosts = await fetchPosts(INITIAL_BATCH_SIZE, 0, useCache);
      const fetchDuration = Date.now() - fetchStartTime;
      
      // 🚀 CRITICAL: Process videos and text posts IMMEDIATELY (don't wait for images)
      // Videos and text posts load faster, so prioritize them in the feed
      if (fetchedPosts && fetchedPosts.length > 0) {
        // Extract videos from fetched posts and process them immediately
        // NOTE: Skip video processing during forceRefresh because handleVideoRefresh handles videos separately
        // This prevents race condition where processVideos overwrites videos set by handleVideoRefresh
        const videoPostsInBatch = fetchedPosts.filter(post => !!post.video_url);
        if (videoPostsInBatch.length > 0 && !forceRefresh) {
          log(`[Community] 🚀 Processing ${videoPostsInBatch.length} videos immediately (prioritizing over images)`);
          // Process videos immediately without waiting
          processVideos(videoPostsInBatch, false, false).catch(err => {
            warn('[Community] Video processing error (non-critical):', err);
          });
        }
        
        // Text posts also load fast (no images), prioritize them too
        const textPostsInBatch = fetchedPosts.filter(post => {
          const hasContent = post.content && post.content.trim().length > 0;
          const hasImages = post.image_urls && post.image_urls.length > 0;
          const hasVideo = !!post.video_url;
          return hasContent && !hasImages && !hasVideo;
        });
        if (textPostsInBatch.length > 0) {
          log(`[Community] 🚀 Found ${textPostsInBatch.length} text posts (fast loading, prioritizing)`);
        }
      }
      
      // Record performance metric
      try {
        const { performanceMonitor } = await import('../utils/performanceMonitor');
        performanceMonitor.recordMetric(
          'loadPosts',
          fetchDuration,
          showedCachedData || useCache,
          fetchedPosts?.length
        );
      } catch (perfError) {
        // Ignore performance monitoring errors
      }
      
      if (fetchedPosts && Array.isArray(fetchedPosts)) {
        log(`[Community] Loaded ${fetchedPosts?.length || 0} posts from database (fresh fetch)`);
        
        // Filter out placeholders
        const realPostsOnly = fetchedPosts.filter(
          post => !post.id.startsWith('placeholder-post-') && !post.id.startsWith('bundled-offline-post-')
        );
        
        if (realPostsOnly.length > 0) {
          // Show posts immediately (don't wait for all to load)
          startTransition(() => {
            setPosts(prevPosts => {
              // If we already have more posts than what we're loading, preserve existing posts
              // This prevents scroll reset when loading more posts via pagination
              if (prevPosts.length > realPostsOnly.length && !forceRefresh) {
                log('[Community] Preserving existing posts to prevent scroll reset');
                // Merge new posts with existing, avoiding duplicates
                const existingIds = new Set(prevPosts.map(p => p.id));
                const newPosts = realPostsOnly.filter(p => !existingIds.has(p.id));
                if (newPosts.length > 0) {
                  // Add new posts at the beginning (fresh posts) and keep existing
                  return [...newPosts, ...prevPosts];
                }
                return prevPosts; // No new posts, keep existing
              }
              // First load or force refresh - replace all posts
              return realPostsOnly;
            });
          });
            
          // Process all content types; ordering is unified in getSortedPosts via sortFeedPosts
            const videoPostsInBatch = realPostsOnly.filter(post => !!post.video_url);
            const textPostsInBatch = realPostsOnly.filter(post => {
              const hasContent = post.content && post.content.trim().length > 0;
              const hasImages = post.image_urls && post.image_urls.length > 0;
              const hasVideo = !!post.video_url;
              return hasContent && !hasImages && !hasVideo;
            });
            
            // NOTE: Skip video processing during forceRefresh - handleVideoRefresh handles videos separately
            if (videoPostsInBatch.length > 0 && !videosProcessedRef.current && !forceRefresh) {
              log(`[Community] 🚀 Processing ${videoPostsInBatch.length} videos IMMEDIATELY (prioritizing over images)`);
              // Process videos immediately - don't defer
              processVideos(videoPostsInBatch, false, false).catch(err => {
                warn('[Community] Video processing error (non-critical):', err);
              });
            }
            
            if (textPostsInBatch.length > 0) {
              log(`[Community] 🚀 Found ${textPostsInBatch.length} text posts (fast loading, no image processing needed)`);
            }
            
            // 🚀 PRELOAD IMAGES: Preload images AFTER videos/text posts are processed (non-blocking)
            // Images load slower, so prioritize fast content first
            (async () => {
              try {
                const { preloadAllMedia, preloadNextBatch } = await import('../utils/aggressiveCacheService');
                // Only preload images (not videos or text posts) - fast content already shown
                const imagePosts = realPostsOnly.filter(post => {
                  const hasImages = post.image_urls && post.image_urls.length > 0;
                  const hasVideo = !!post.video_url;
                  return hasImages && !hasVideo;
                });
                if (imagePosts.length > 0) {
                  // Preload images in background (non-blocking, videos/text already shown)
                  preloadAllMedia(imagePosts, []).catch(err => {
                    warn('[Community] Image preload failed (non-critical):', err);
                  });
                  // Preload next batch for smooth scrolling (non-blocking)
                  preloadNextBatch(imagePosts).catch(err => {
                    warn('[Community] Next batch preload failed (non-critical):', err);
                  });
                }
              } catch (err) {
                warn('[Community] Aggressive cache service not available:', err);
              }
            })();
            
            // Progressive display: Reset displayed count when loading fresh posts
            if (forceRefresh) {
              setDisplayedPostsCount(INITIAL_DISPLAY_COUNT);
              log(`[Community] 📊 Reset progressive display to ${INITIAL_DISPLAY_COUNT} posts`);
            }
          } else {
            // No real posts - show placeholders as fallback
            startTransition(() => {
              setPosts(placeholderPosts);
            });
          }
        
        // OPTIMIZED: Reduced comment preloading to save API calls
        // Only preload comments for top 2 most engaging posts (reduced from 5)
        const postsToPreload = fetchedPosts
          .filter(post => (post.likes_count || 0) + (post.comments_count || 0) > 10)
          .slice(0, 2); // Reduced from 5 to 2 to save API calls
        
        if (postsToPreload.length > 0) {
          log(`[Community] Preloading comments for ${postsToPreload.length} high-engagement posts`);
          // Preload comments in background without blocking UI
          Promise.all(
            postsToPreload.map(post => loadCommentsInBackground(post.id))
          ).catch(error => {
            error('[Community] Error preloading comments:', error);
          });
        }
      } else {
        error('[Community] No posts returned or invalid response');
        if (!silent && (posts?.length || 0) === 0) {
          // New user / no cache: show bundled offline content instead of empty feed
          const bundledPosts = getBundledOfflinePosts(5);
          setPosts(bundledPosts);
        }
      }
    } catch (error) {
      error('[Community] Error loading posts:', error);
      // Show a user-friendly message but don't block the UI
      warn('[Community] Continuing with empty state due to error');
      
      // Only clear posts if we don't have any existing posts (avoid clearing during refresh)
      if (!silent && (posts?.length || 0) === 0) {
        // Show bundled offline content so user still sees something
        setPosts(getBundledOfflinePosts(5));
      }
      
      // Show empty state on error
      if ((videos?.length || 0) === 0) {
        setVideos([]);
      }
    } finally {
      // Always clear loading state, but only if we actually set it
      // If we showed cached data, loading was already set to false
      if (!showedCachedData) {
        setLoading(false);
      }
    }
  };

  // Keep ref updated so interval and retry always call latest loadPosts
  useEffect(() => {
    loadPostsRef.current = loadPosts;
    return () => { loadPostsRef.current = () => {}; };
  });

  
  // Handle refresh (pull-to-refresh and Slow Network Alert use this)
  // OPTIMIZED: Keep existing content visible during refresh, merge new data smoothly
  const handleRefresh = async () => {
    setRefreshing(true);
    log('[Community] 🔄 Pull-to-refresh triggered - fetching fresh data in background...');
    
    // Clear any pending end message timeout
    if (endMessageTimeoutRef.current) {
      clearTimeout(endMessageTimeoutRef.current);
      endMessageTimeoutRef.current = null;
    }
    
    // Clear new posts alert on refresh
    setNewPostsCount(0);
    setPendingNewPosts([]);
    
    try {
      // 🔄 Fetch fresh posts while keeping existing content visible
      // First param: silent=false (show spinner), Second param: forceRefresh=true (bypass cache)
      await loadPosts(false, true);
      
      // Reset progressive loading state AFTER new data arrives
      setCachedPostsPool([]);
      setCachedPostsShown(0);
      setHasMorePosts(true);
      setShowEndMessage(false);
      setIsScrolledDown(false);
      
      // Refresh video feed in background (non-blocking - don't make user wait)
      handleVideoRefresh().catch(err => {
        warn('[Community] Video refresh failed (non-critical):', err);
      });
    } catch (error) {
      error('[Community] Error during refresh:', error);
    } finally {
      setRefreshing(false);
      log('[Community] ✅ Pull-to-refresh completed');
    }
  };

  // Wire refresh ref so Slow Network Alert "Refresh" button works
  useEffect(() => {
    handleRefreshAppRef.current = handleRefresh;
  }, [handleRefresh]);
  
  // CONTINUOUS LOOP: Aggressive buffer monitoring - auto-fetch to maintain buffer
  // This ensures users never get stuck waiting, even with 1k+ items in database
  useEffect(() => {
    // Only auto-fetch if not currently loading and we have posts
    if (loading || loadingMore || refreshing) {
      return;
    }
    if (posts.length === 0) {
      return;
    }
    
    const totalPostsAvailable = posts.length + (videos?.length || 0);
    const bufferRemaining = totalPostsAvailable - displayedPostsCount;
    
    // AGGRESSIVE PREFETCHING: When buffer is low (less than 40), automatically fetch next batch
    // This creates a continuous loop: fetch 40 → show 20 → keep 20 → when buffer < 40 → fetch next 40
    // With 1k items, this ensures we always have content ready
    if (bufferRemaining < LOAD_BATCH_SIZE && hasMorePosts && !loadingMore) {
      log(`[Community] 🔄 CONTINUOUS LOOP: Buffer low (${bufferRemaining}/${totalPostsAvailable} remaining), auto-fetching next batch to maintain continuous prefetch`);
      // Automatically fetch next batch to maintain buffer (no user interaction needed)
      const fetchTimeout = setTimeout(() => {
        loadMorePosts().catch(err => {
          warn('[Community] Auto-fetch failed (non-critical):', err);
        });
      }, 200); // Small delay to avoid race conditions
      
      return () => clearTimeout(fetchTimeout);
    }
  }, [displayedPostsCount, posts.length, videos?.length, hasMorePosts, loading, loadingMore, refreshing, loadMorePosts]);
  
  // Progressive display: Reset displayed count on refresh
  useEffect(() => {
    if (!loading && !refreshing && posts.length > 0) {
      // When posts are refreshed, reset to initial display count
      // This ensures we show 20 initially, then progressively show more
      if (displayedPostsCount > INITIAL_DISPLAY_COUNT && posts.length <= INITIAL_DISPLAY_COUNT) {
        setDisplayedPostsCount(INITIAL_DISPLAY_COUNT);
      }
    }
  }, [loading, refreshing, posts.length, displayedPostsCount, INITIAL_DISPLAY_COUNT]);

  // Twitter/X-style: Show "Pull down to refresh" when content is still loading or no real posts yet
  const hasRealPosts = useMemo(() => {
    return posts.some(
      (p) =>
        !p.id.startsWith('placeholder-post-') && !p.id.startsWith('bundled-offline-post-')
    );
  }, [posts]);
  const showPullToRefreshBanner = loading || refreshing || !hasRealPosts;
  const pullToRefreshVariant = refreshing
    ? 'refreshing'
    : loading
      ? 'loading'
      : 'pull_to_refresh';

  // Load more posts for pagination as user scrolls
  // Load more cached posts progressively
  const loadMoreCachedPosts = useCallback(() => {
    if (cachedPostsPool.length === 0 || cachedPostsShown >= cachedPostsPool.length) {
      return false; // No more cached posts to load
    }
    
    const remaining = cachedPostsPool.length - cachedPostsShown;
    const toLoad = Math.min(CACHE_LOAD_BATCH, remaining);
    const nextBatch = cachedPostsPool.slice(cachedPostsShown, cachedPostsShown + toLoad);
    
    if (nextBatch.length > 0) {
      log(`[Community] Loading ${nextBatch.length} more cached posts (${cachedPostsShown + toLoad}/${cachedPostsPool.length})`);
      startTransition(() => {
        setPosts(prevPosts => {
          // Check for duplicates
          const existingIds = new Set(prevPosts.map(p => p.id));
          const newPosts = nextBatch.filter(p => !existingIds.has(p.id));
          if (newPosts.length > 0) {
            return [...prevPosts, ...newPosts];
          }
          return prevPosts;
        });
        setCachedPostsShown(prev => prev + toLoad);
      });
      return true; // Successfully loaded from cache
    }
    return false; // No more to load
  }, [cachedPostsPool, cachedPostsShown]);

  const loadMorePosts = useCallback(async () => {
    // Prevent duplicate loads at the same offset (but allow if loadingMore is false)
    const currentOffset = posts.length;
    if (currentOffset === lastLoadMoreOffset.current && loadingMore) {
      log('[Community] Already loading from this offset, skipping');
      return;
    }
    
    // Track first visible item index before loading (video-feed/Facebook style)
    // This is the key to maintaining scroll position when appending posts
    if (flatListRef.current && !isUserScrolling.current) {
      try {
        // Get current scroll position
        scrollPositionBeforeLoad.current = scrollY.current;
        // Mark that we're appending posts (not prepending)
        isAppendingPosts.current = true;
        log('[Community] Tracking scroll position before load:', scrollPositionBeforeLoad.current);
      } catch (e) {
        warn('[Community] Error tracking scroll position:', e);
      }
    }
    
    // First, try loading more from cached posts pool (progressive cache loading)
    if (loadMoreCachedPosts()) {
      log('[Community] Loaded more posts from cache pool');
      return; // Successfully loaded from cache, don't fetch from API yet
    }
    
    // Don't load if we've reached the end (but allow retry after delay)
    if (!hasMorePosts) {
      log('[Community] No more posts available (reached end)');
      return;
    }
    
    // Don't load if no posts exist
    if (!posts || posts.length === 0) {
      log('[Community] No posts to paginate from');
      return;
    }
    
    try {
      // Mark this offset as being loaded to prevent duplicate loads
      lastLoadMoreOffset.current = currentOffset;
      
      // Set loadingMore silently (don't show spinner to user)
      setLoadingMore(true);
      log(`[Community] 🔄 Silently loading more posts from offset ${currentOffset}...`);
      
      // Force fresh fetch (bypass cache) for pagination to ensure we get older posts
      // CONTINUOUS LOOP: Load 40 items per batch (show 20, keep 20 ready)
      // With 1k+ items, this ensures continuous prefetching
      const PAGINATION_BATCH_SIZE = LOAD_BATCH_SIZE; // Load 40 items
      log(`[Community] 🔄 CONTINUOUS LOOP: Fetching ${PAGINATION_BATCH_SIZE} items from offset ${currentOffset} (will show 20, keep 20 ready, total pool: ${posts.length})`);
      const morePosts = await fetchPosts(PAGINATION_BATCH_SIZE, currentOffset, false);
      
      // Log fetch results for debugging with 1k+ items and verify old posts are included
      if (morePosts && morePosts.length > 0) {
        // Check for old posts (6+ months = 180+ days)
        const sixMonthsAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
        const oldPosts = morePosts.filter(post => {
          const postDate = new Date(post.created_at).getTime();
          return postDate < sixMonthsAgo;
        });
        
        log(`[Community] ✅ Fetched ${morePosts.length} posts from offset ${currentOffset}, new total will be: ${posts.length + morePosts.length}`);
        if (oldPosts.length > 0) {
          const oldestPost = oldPosts.reduce((oldest, post) => {
            const postDate = new Date(post.created_at).getTime();
            const oldestDate = new Date(oldest.created_at).getTime();
            return postDate < oldestDate ? post : oldest;
          });
          const oldestAge = Math.floor((Date.now() - new Date(oldestPost.created_at).getTime()) / (24 * 60 * 60 * 1000));
          log(`[Community] 📅 Found ${oldPosts.length} posts older than 6 months in this batch (oldest: ${oldestAge} days old)`);
        } else {
          log(`[Community] 📅 No posts older than 6 months in this batch (all posts are recent)`);
        }
      } else {
        log(`[Community] ⚠️ No posts fetched from offset ${currentOffset} (may have reached end)`);
      }
      
      // AGGRESSIVE SILENT PRELOADING: Preload next 2 batches immediately in background
      if (morePosts && morePosts.length > 0) {
        // Preload next batch immediately
        setTimeout(() => {
          const nextOffset = currentOffset + PAGINATION_BATCH_SIZE;
          fetchPosts(PAGINATION_BATCH_SIZE, nextOffset, false).then(nextPosts => {
            if (nextPosts && nextPosts.length > 0) {
              log(`[Community] ✅ Silently preloaded ${nextPosts.length} posts for offset ${nextOffset}`);
              // Preload next-next batch too
              setTimeout(() => {
                const nextNextOffset = nextOffset + PAGINATION_BATCH_SIZE;
                fetchPosts(PAGINATION_BATCH_SIZE, nextNextOffset, false).then(nextNextPosts => {
                  if (nextNextPosts && nextNextPosts.length > 0) {
                    log(`[Community] ✅ Silently preloaded ${nextNextPosts.length} posts for offset ${nextNextOffset}`);
                  }
                }).catch(err => {
                  warn('[Community] Background preload failed (non-critical):', err);
                });
              }, 200);
            }
          }).catch(err => {
            warn('[Community] Background preload failed (non-critical):', err);
          });
        }, 50); // Reduced delay for faster preloading
      }
      
      if (morePosts && morePosts.length > 0) {
        log(`[Community] ✅ Silently loaded ${morePosts.length} more posts, total: ${posts.length + morePosts.length}`);
        
        // 🎥 PROCESS VIDEOS FROM OLDER POSTS: Include old videos in shuffle
        // Process videos from newly loaded posts and merge with existing videos
        (async () => {
          try {
            const { convertPostsToVideoFeed } = await import('../utils/videoPostUtils');
            const rawNewVideoPosts = convertPostsToVideoFeed(morePosts);
            const newVideoPosts = rawNewVideoPosts.filter((v): v is VideoPost => v != null && typeof v?.id === 'string');
            
            if (newVideoPosts.length > 0) {
              log(`[Community] 🎥 Found ${newVideoPosts.length} videos in older posts, merging with existing videos`);
              
              // Merge new videos with existing videos (don't replace)
              setVideos(prevVideos => {
                // Filter out invalid/undefined videos before processing
                const validPrevVideos = (prevVideos || []).filter((v): v is VideoPost => v != null && typeof v?.id === 'string');
                const existingVideoIds = new Set(validPrevVideos.map(v => v.id));
                const uniqueNewVideos = newVideoPosts.filter(v => !existingVideoIds.has(v.id));
                
                if (uniqueNewVideos.length > 0) {
                  // Combine and sort by date (newest first, but include old videos)
                  const combined = [...validPrevVideos, ...uniqueNewVideos].sort((a, b) => {
                    if (!a || !b) return 0;
                    const dateA = new Date(a.created_at).getTime();
                    const dateB = new Date(b.created_at).getTime();
                    if (isNaN(dateA) && isNaN(dateB)) return 0;
                    if (isNaN(dateA)) return 1;
                    if (isNaN(dateB)) return -1;
                    return dateB - dateA; // Newest first
                  });
                  
                  log(`[Community] 🎥 Merged ${uniqueNewVideos.length} old videos, total videos: ${combined.length}`);
                  
                  return combined;
                }
                
                // Return filtered valid videos (remove any undefined that might have been in prevVideos)
                return validPrevVideos; // No new videos to add
              });
            }
          } catch (err) {
            warn('[Community] Error processing videos from older posts:', err);
          }
        })();
        
        // AGGRESSIVE SILENT CACHING: Preload media for new posts immediately in background
        (async () => {
          try {
            const { preloadAllMedia } = await import('../utils/aggressiveCacheService');
            // Preload images and videos silently
            preloadAllMedia(morePosts, []).catch(err => {
              warn('[Community] Media preload failed (non-critical):', err);
            });
          } catch (err) {
            warn('[Community] Aggressive cache service not available:', err);
          }
        })();
        
        // Also cache posts to AsyncStorage for offline access
        (async () => {
          try {
            const { saveCachedPosts } = await import('../utils/communityUtils');
            await saveCachedPosts(`posts_${PAGINATION_BATCH_SIZE}_${currentOffset}`, morePosts);
          } catch (err) {
            warn('[Community] Failed to cache posts (non-critical):', err);
          }
        })();
        
        // CONTINUOUS LOOP: Update posts state (new posts added to pool, shown progressively)
        // CRITICAL: Don't use startTransition here as it can cause scroll position issues
        // Instead, update state directly and let maintainVisibleContentPosition handle it
        setPosts(prevPosts => {
          // Check for duplicates before adding
          const existingIds = new Set(prevPosts.map(p => p.id));
          const newPosts = morePosts.filter(p => !existingIds.has(p.id));
          
          if (newPosts.length > 0) {
            // Only mark as end if we got significantly fewer posts than requested
            // Getting 40 posts means there's definitely more (we requested 40)
            // Getting less than 40 could mean end OR filtering (blocked users, etc.)
            // IMPORTANT: With 1k+ items, we should only mark as end if we get 0 posts or very few (< 10)
            // This ensures continuous prefetching works with large datasets
            // We requested 40 posts, so getting < 10 strongly suggests we're at the end
            if (morePosts.length === 0) {
              // Got 0 posts - definitely at the end
              setHasMorePosts(false);
              log(`[Community] ⚠️ Reached end of feed (got 0 posts, total loaded: ${prevPosts.length + newPosts.length})`);
            } else if (morePosts.length < 10) {
              // Got very few posts (< 10 out of 40 requested) - likely at the end
              setHasMorePosts(false);
              log(`[Community] ⚠️ Reached end of feed (got ${morePosts.length} posts out of 40 requested, total loaded: ${prevPosts.length + newPosts.length})`);
              // Debounce showing end message to prevent flickering on iOS
              if (endMessageTimeoutRef.current) {
                clearTimeout(endMessageTimeoutRef.current);
              }
              endMessageTimeoutRef.current = setTimeout(() => {
                setShowEndMessage(true);
              }, 300); // Small delay to prevent flickering
            } else {
              // Got a reasonable number of posts, assume there might be more
              // Keep hasMorePosts true to allow further loading attempts (continuous loop)
              const newTotal = prevPosts.length + newPosts.length;
              log(`[Community] ✅ CONTINUOUS LOOP: Got ${morePosts.length} posts, total pool: ${newTotal} (buffer monitoring will auto-fetch when buffer < ${LOAD_BATCH_SIZE})`);
              // Ensure hasMorePosts stays true for continuous prefetching (even with 1k+ items)
              setHasMorePosts(true);
              setShowEndMessage(false); // Hide end message if we got more posts
            }
            
            // Append new posts to bottom - maintainVisibleContentPosition will handle scroll position
            return [...prevPosts, ...newPosts];
            } else {
              log('[Community] All loaded posts were duplicates');
              // If all posts were duplicates, try loading from next offset to confirm
              // Don't immediately mark as end - might be a pagination/caching issue
              const nextOffset = currentOffset + 20;
              log(`[Community] Attempting to load from offset ${nextOffset} to check for more posts...`);
              
              // Try loading from next offset to see if there are more posts
              // Use a small delay to avoid rapid-fire requests
              setTimeout(async () => {
                try {
                  const nextPagePosts = await fetchPosts(20, nextOffset, false);
                  if (nextPagePosts && nextPagePosts.length > 0) {
                    // Found more posts at next offset
                    // Don't use startTransition - it interferes with scroll position maintenance
                    setPosts(prevPosts => {
                      const existingIds = new Set(prevPosts.map(p => p.id));
                      const newNextPosts = nextPagePosts.filter(p => !existingIds.has(p.id));
                      if (newNextPosts.length > 0) {
                        log(`[Community] Found ${newNextPosts.length} new posts at offset ${nextOffset}`);
                        return [...prevPosts, ...newNextPosts];
                      } else {
                        // Even next page was all duplicates after filtering
                        // This likely means we've reached the end
                        setHasMorePosts(false);
                        log('[Community] Next page also had duplicates after filtering, likely reached end');
                        return prevPosts;
                      }
                    });
                  } else {
                    // No posts at next offset, we've reached the end
                    setHasMorePosts(false);
                    log('[Community] No posts at next offset, reached end');
                  }
                } catch (err) {
                  error('[Community] Error loading next page after duplicates:', err);
                  // Don't set hasMorePosts to false on error - allow retry
                }
              }, 200);
              
              return prevPosts; // Return existing posts unchanged
            }
          });
      } else {
        // No more posts available - definitely reached the end
        log('[Community] No more posts available (reached end of feed)');
        setHasMorePosts(false);
        // Debounce showing end message to prevent flickering on iOS
        if (endMessageTimeoutRef.current) {
          clearTimeout(endMessageTimeoutRef.current);
        }
        endMessageTimeoutRef.current = setTimeout(() => {
          setShowEndMessage(true);
        }, 300); // Small delay to prevent flickering
      }
    } catch (error) {
      error('[Community] Error loading more posts:', error);
      // On error, reset offset to allow retry
      lastLoadMoreOffset.current = 0;
      // On error, don't set hasMorePosts to false - allow retry
    } finally {
      setLoadingMore(false); // Reset loading state
      // Reset the offset after a delay to allow loading from new offset
      setTimeout(() => {
        lastLoadMoreOffset.current = 0;
      }, 1000);
    }
  }, [loading, loadingMore, posts, hasMorePosts, loadMoreCachedPosts]);

  // Toggle search bar visibility with animation
  const toggleSearchBar = useCallback(() => {
    const willShow = !showSearchBar;
    setShowSearchBar(willShow);
    
    // Close dropdown when search bar is closed
    if (!willShow) {
      setShowHashtagDropdown(false);
      setSearchQuery(''); // Clear search query when closing
      setSearchResults([]); // Clear search results
    }
    
    // Use parallel animations with native driver for better performance
    Animated.parallel([
      Animated.timing(searchBarOpacity, {
        toValue: willShow ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(searchBarTranslateY, {
        toValue: willShow ? 0 : -20,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [showSearchBar, searchBarOpacity, searchBarTranslateY]);

  // Hide search bar when input loses focus with animation
  const handleSearchBlur = useCallback(() => {
    if (searchQuery.length === 0) {
      setShowSearchBar(false);
      setShowSearchDropdown(false);
      setShowHashtagDropdown(false);
      Animated.parallel([
        Animated.timing(searchBarOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(searchBarTranslateY, {
          toValue: -20,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Delay hiding dropdown to allow selection
      setTimeout(() => {
        setShowSearchDropdown(false);
        setShowHashtagDropdown(false);
      }, 200);
    }
  }, [searchQuery.length, searchBarOpacity, searchBarTranslateY]);

  // Remove getItemLayout for dynamic heights - let FlatList handle it naturally
  // Fixed heights cause scrolling issues when content varies
  
  // Handle post like
  const handleLike = async (postId: string) => {
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
    
    const isPlaceholder = postId.startsWith('placeholder-post-') || postId.startsWith('bundled-offline-post-');
    
    // Optimistically update UI
    setPosts(current => 
      current.map(post => {
        if (post.id === postId) {
          const wasLiked = post.liked_by_user || false;
          const newLikesCount = wasLiked 
            ? (post.likes_count || 0) - 1 
            : (post.likes_count || 0) + 1;
          
          return {
            ...post,
            likes_count: newLikesCount,
            liked_by_user: !wasLiked
          };
        }
        return post;
      })
    );
    
    // Also update placeholder posts state if it's a placeholder post
    if (isPlaceholder) {
      setPlaceholderPostsWithLikes(current => 
        current.map(post => {
          if (post.id === postId) {
            const wasLiked = post.liked_by_user || false;
            const newLikesCount = wasLiked 
              ? (post.likes_count || 0) - 1 
              : (post.likes_count || 0) + 1;
            
            return {
              ...post,
              likes_count: newLikesCount,
              liked_by_user: !wasLiked,
              liked: !wasLiked
            };
          }
          return post;
        })
      );
    }
    
    // Call API to toggle like (only for real posts, not placeholders)
    if (!isPlaceholder) {
    try {
      await toggleLike(postId, user.id);
    } catch (error) {
      error('Error toggling like:', error);
      // Revert the UI change if the API call fails
      await loadPosts();
    }
    }
    // Placeholders are in-app only - no database interaction needed
  };
  
  // Handle bookmark
  const handleBookmark = async (postId: string) => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    
    log('Attempting to bookmark/unbookmark post:', postId);
    
    // Get current bookmark status
    const currentPost = posts.find(p => p.id === postId);
    const wasBookmarked = currentPost?.isBookmarked || false;
    
    // Optimistically update UI (including bookmark count)
    setPosts(current => 
      current.map(post => {
        if (post.id === postId) {
          const newBookmarkStatus = !post.isBookmarked;
          return {
            ...post,
            isBookmarked: newBookmarkStatus,
            bookmarks_count: newBookmarkStatus 
              ? (post.bookmarks_count || 0) + 1
              : Math.max(0, (post.bookmarks_count || 0) - 1)
          };
        }
        return post;
      })
    );

    // Also update videos array if this is a video post
    setVideos(current => 
      (current || [])
        .filter((v): v is VideoPost => v != null && typeof v?.id === 'string')
        .map(video => {
        if (video.id === postId) {
          const newBookmarkStatus = !video.is_bookmarked;
          return {
            ...video,
            is_bookmarked: newBookmarkStatus,
            bookmarks_count: newBookmarkStatus 
              ? (video.bookmarks_count || 0) + 1
              : Math.max(0, (video.bookmarks_count || 0) - 1)
          };
        }
        return video;
      })
    );
    
    // Call API to toggle bookmark
    try {
      const result = await toggleBookmark(postId, user.id);
      log('Toggle bookmark result:', result);
      
      if (!result.success) {
        error('Failed to toggle bookmark on community screen');
        // Reload posts if there was an error to get accurate counts
        await loadPosts();
      } else {
        // If successful, notify profile screen to refresh bookmarks
        if (global.refreshBookmarks) {
          global.refreshBookmarks();
        }
      }
    } catch (error) {
      error('Error toggling bookmark:', error);
      // Reload posts if there was an error to get accurate counts
      await loadPosts();
    }
  };

  const handleBoostPost = useCallback(async (postId: string) => {
    if (!user) {
      Alert.alert(
        'Login Required',
        'You need to login to boost posts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.push('/auth/signin') },
        ]
      );
      return;
    }

    Alert.alert(
      'Boost Post',
      'Boost this post for 24 hours at the top of the feed for 10 tokens?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Boost',
          onPress: async () => {
            const result = await boostPost(postId, user.id);
            if (!result.success) {
              Alert.alert('Boost failed', result.error || 'Could not boost post');
              return;
            }

            if (result.boostExpiresAt) {
              setPosts(prev =>
                prev.map(post =>
                  post.id === postId
                    ? { ...post, boost_expires_at: result.boostExpiresAt }
                    : post
                )
              );
              setVideos(prev =>
                prev.map(v =>
                  v.id === postId ? { ...v, boost_expires_at: result.boostExpiresAt } : v
                )
              );
            }

            Toast.show({
              type: 'success',
              text1: 'Boost active',
              text2: 'Your post is boosted for 24 hours.',
            });

            // Refresh to re-rank with boosted posts at top.
            loadPosts(false, true).catch(() => {});
          },
        },
      ]
    );
  }, [user, router, setPosts, loadPosts]);
  
  // Handle post expansion to show comments (instant UX)
  const handlePostExpansion = (postId: string) => {
    log(`[handlePostExpansion] Expanding post ${postId}`);
    // First check in getSortedPosts (which includes all posts and videos in unified format)
    const sortedPosts = getSortedPosts; // getSortedPosts is a memoized array, not a function
    let post = sortedPosts.find(p => p.id === postId);
    
    // If not found in sorted posts, check in posts array
    if (!post) {
      post = posts.find(p => p.id === postId);
    }
    
    // If still not found, check in videos array
    if (!post && videos) {
      const videoPost = videos.find(v => v.id === postId);
      if (videoPost) {
        post = {
          id: videoPost.id,
          comments_disabled: videoPost.comments_disabled ?? false,
        } as Post;
      }
    }
    
    // If post not found at all, still allow expansion (post might be loading)
    if (!post) {
      warn(`[handlePostExpansion] Post ${postId} not found in any array, but allowing expansion anyway`);
    }
    
    // If comments are disabled, show modal and prevent expansion
    if (post?.comments_disabled) {
      log(`[handlePostExpansion] Comments disabled for post ${postId}, showing modal`);
      // Show beautiful modal instead of alert
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
      
      if (expandedPosts.has(postId)) {
        const newExpandedPosts = new Set(expandedPosts);
        newExpandedPosts.delete(postId);
        setExpandedPosts(newExpandedPosts);
      }
      if (commentSheetPostId === postId) {
        setCommentSheetPostId(null);
      }
      return;
    }

    const newExpandedPosts = new Set(expandedPosts);

    if (commentSheetPostId === postId) {
      // Sheet already open for this post – close it
      log(`[handlePostExpansion] Closing comment sheet for post ${postId}`);
      setCommentSheetPostId(null);
      if (expandedPosts.has(postId)) {
        newExpandedPosts.delete(postId);
        setExpandedPosts(newExpandedPosts);
      }
      return;
    }

    if (expandedPosts.has(postId)) {
      // Was expanded (inline legacy) – collapse and open sheet if different post
      newExpandedPosts.delete(postId);
      setExpandedPosts(newExpandedPosts);
    }

    // Open comment sheet for this post (video, text, photo)
    log(`[handlePostExpansion] Opening comment sheet for post ${postId}`);
    setCommentSheetPostId(postId);

    const hasComments = postComments[postId] !== undefined && postComments[postId] !== null;
    const isCurrentlyLoading = loadingComments.has(postId);
    if (!hasComments && !isCurrentlyLoading) {
      log(`[handlePostExpansion] Loading comments for post ${postId}`);
      loadCommentsInBackground(postId);
    }
  };

  // Auto-collapse comment sections for posts with disabled comments
  useEffect(() => {
    const postsToCollapse: string[] = [];
    
    // Check all expanded posts
    expandedPosts.forEach(postId => {
      // First check in getSortedPosts (which includes all posts and videos in unified format)
      const sortedPosts = getSortedPosts; // getSortedPosts is a memoized array, not a function
      let post = sortedPosts.find(p => p.id === postId);
      
      // If not found, check in posts array
      if (!post) {
        post = posts.find(p => p.id === postId);
      }
      
      // If still not found, check in videos array
      if (!post && videos) {
        const videoPost = videos.find(v => v.id === postId);
        if (videoPost) {
          post = {
            id: videoPost.id,
            comments_disabled: videoPost.comments_disabled ?? false,
          } as Post;
        }
      }
      
      // If comments are disabled, mark for collapse
      if (post?.comments_disabled) {
        log(`[Auto-collapse] Collapsing post ${postId} - comments disabled`);
        postsToCollapse.push(postId);
      }
    });
    
    // Collapse posts with disabled comments
    if (postsToCollapse.length > 0) {
      const newExpandedPosts = new Set(expandedPosts);
      postsToCollapse.forEach(postId => {
        newExpandedPosts.delete(postId);
      });
      setExpandedPosts(newExpandedPosts);
    }
  }, [posts, videos, getSortedPosts, expandedPosts]);

  // Load comments in background without blocking UI
  const loadCommentsInBackground = async (postId: string, forceRefresh = false) => {
    // Check if comments are already loaded (only skip if we have comments and not forcing refresh)
    const existingComments = postComments[postId];
    if (!forceRefresh && existingComments !== undefined && existingComments !== null && existingComments.length > 0) {
      // Skip silently - comments already loaded
      return;
    }
    
    // Prevent duplicate loading
    if (loadingComments.has(postId)) {
      return; // Skip silently if already loading
    }
    
    try {
      // Mark as loading
      setLoadingComments(prev => new Set(prev).add(postId));
      
      // Try to get cached comments first (if not forcing refresh) - load instantly from persistent cache
      let comments: Comment[] = [];
      let hasCachedData = false;
      if (!forceRefresh) {
        try {
          // Try persistent cache first (fastest - AsyncStorage)
          const cachedComments = await getCachedComments(postId, user?.id);
          if (cachedComments && cachedComments.length > 0) {
            // Update state immediately with cached comments (silently)
            setPostComments(prev => ({
              ...prev,
              [postId]: cachedComments
            }));
            comments = cachedComments; // Keep reference for later check
            hasCachedData = true;
          } else {
            // Fallback to fetchCommentsWithLikes with cache (checks in-memory cache)
            const cachedFromMemory = await fetchCommentsWithLikes(postId, user?.id, true);
            if (cachedFromMemory && cachedFromMemory.length > 0) {
              setPostComments(prev => ({
                ...prev,
                [postId]: cachedFromMemory
              }));
              comments = cachedFromMemory;
              hasCachedData = true;
            }
          }
        } catch (cacheError) {
          // Silently handle cache errors
        }
      }
      
      // Always clear loading state immediately - comments load quietly in background
      // No spinner shown, comments appear when ready
      setLoadingComments(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
      
      // Fetch fresh comments in background (will update cache)
      // This happens silently without showing any loading indicators
      const freshComments = await fetchCommentsWithLikes(postId, user?.id, false);
      
      if (freshComments && Array.isArray(freshComments)) {
        // CRITICAL: Merge fresh comments with existing comments instead of replacing
        // This preserves old comments that might not be in the fresh fetch
        // and adds any new comments that were added
        setPostComments(prev => {
          const existingComments = prev[postId] || [];
          
          // Create a map of existing comments by ID for quick lookup
          const existingCommentsMap = new Map(existingComments.map(c => [c.id, c]));
          
          // Add/update comments from fresh fetch
          freshComments.forEach(freshComment => {
            existingCommentsMap.set(freshComment.id, freshComment);
          });
          
          // Convert back to array and sort by created_at (oldest first)
          const mergedComments = Array.from(existingCommentsMap.values()).sort((a, b) => {
            // Pinned comments first
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            // Then by creation time (oldest first)
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return timeA - timeB;
          });
          
          // Only update if comments actually changed
          const hasChanged = existingComments.length !== mergedComments.length ||
            existingComments.some((c, i) => c.id !== mergedComments[i]?.id);
          
          if (hasChanged) {
            log(`[Community] Merged comments for post ${postId}: ${existingComments.length} existing + ${freshComments.length} fresh = ${mergedComments.length} total`);
            return {
              ...prev,
              [postId]: mergedComments
            };
          }
          
          return prev; // No change, return previous state
        });
      } else {
        // Only set empty array if we don't have cached comments
        if (comments.length === 0) {
          setPostComments(prev => ({
            ...prev,
            [postId]: []
          }));
        }
      }
    } catch (error) {
      error('[Community] Error loading comments in background:', error);
      // Only set empty array if we don't have existing comments
      if (!postComments[postId] || postComments[postId].length === 0) {
        setPostComments(prev => ({
          ...prev,
          [postId]: []
        }));
      }
    } finally {
      // Always remove loading state
      setLoadingComments(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
    }
  };

  // Handle comment submission
  const handleCommentSubmit = async (postId: string) => {
    if (!user) {
      Alert.alert(
        'Login Required',
        'You need to login to comment on posts. Would you like to login now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.push('/auth/signin') }
        ]
      );
      return;
    }

    // Check if comments are disabled for this post
    // First check in getSortedPosts (which includes all posts and videos)
    const sortedPosts = getSortedPosts; // getSortedPosts is a memoized array, not a function
    let post = sortedPosts.find(p => p.id === postId);
    
    // If not found, check in posts array
    if (!post) {
      post = posts.find(p => p.id === postId);
    }
    
    // If still not found, check in videos array
    if (!post && videos) {
      const videoPost = videos.find(v => v.id === postId);
      if (videoPost) {
        post = {
          id: videoPost.id,
          comments_disabled: videoPost.comments_disabled ?? false,
        } as Post;
      }
    }
    
    if (post?.comments_disabled) {
      // Show beautiful modal instead of alert
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
      return;
    }

    const commentText = commentTexts[postId]?.trim();
    if (!commentText) return;

    setSubmittingComments(prev => new Set(prev).add(postId));

    try {
      // Add comment to local state optimistically
      const newComment: Comment = {
        id: 'temp_' + Date.now(), // Temporary ID
        post_id: postId,
        user_id: user.id,
        content: commentText,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        username: user.user_metadata?.username || user.email?.split('@')[0] || 'You',
        user_avatar: user.user_metadata?.avatar_url,
        profiles: null
      };
      
      // Clear cache for this post since we're adding a new comment
      clearCommentsCache(postId, user?.id);
      
      // Add to local state immediately for better UX
        setPostComments(prev => ({
          ...prev,
          [postId]: [...(prev[postId] || []), newComment]
        }));
        
      // Clear comment text immediately
        setCommentTexts(prev => ({
          ...prev,
          [postId]: ''
      }));
      
      const result = await addComment(postId, user.id, commentText);
      
      if (result) {
        // Replace temp comment with real one - preserve ALL existing comments
        setPostComments(prev => {
          const existingComments = prev[postId] || [];
          // Check if temp comment exists, replace it; otherwise add the new comment
          const hasTempComment = existingComments.some(c => c.id === newComment.id);
          
          if (hasTempComment) {
            // Replace temp comment with real one
            return {
              ...prev,
              [postId]: existingComments.map(comment => 
                comment.id === newComment.id ? result : comment
              )
            };
          } else {
            // Temp comment not found (might have been replaced by realtime), add the real one
            // Check if result already exists to prevent duplicates
            const alreadyExists = existingComments.some(c => c.id === result.id);
            if (alreadyExists) {
              // Already exists, just update it
              return {
                ...prev,
                [postId]: existingComments.map(comment => 
                  comment.id === result.id ? result : comment
                )
              };
            } else {
              // Add new comment, preserving all existing ones
              return {
                ...prev,
                [postId]: [...existingComments, result]
              };
            }
          }
        });
        
        // Update post comment count
        setPosts(prev => prev.map(post => 
          post.id === postId 
            ? { ...post, comments_count: (post.comments_count || 0) + 1 }
            : post
        ));
        
        // Auto-scroll to the new comment after a short delay to allow rendering
        setTimeout(() => {
          const scrollViewRef = commentScrollViewRefs.current.get(postId);
          if (scrollViewRef) {
            scrollViewRef.scrollToEnd({ animated: true });
          }
        }, 300);
        
        Toast.show({
          type: 'success',
          text1: 'Comment added successfully',
          text2: '',
        });
      } else {
        throw new Error('Failed to add comment');
      }
    } catch (error) {
      // Remove the optimistic comment on error
      setPostComments(prev => ({
        ...prev,
        [postId]: prev[postId]?.filter(comment => comment.id !== newComment.id) || []
      }));
      
      // Restore comment text
      setCommentTexts(prev => ({
        ...prev,
        [postId]: commentText
      }));
      
      error('Error adding comment:', error);
      // Removed popup error toast - using on-screen error message only
    } finally {
      setSubmittingComments(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
    }
  };

  // Callback to set comment ScrollView ref
  const setCommentScrollViewRef = useCallback((postId: string, ref: ScrollView | null) => {
    if (ref) {
      commentScrollViewRefs.current.set(postId, ref);
    } else {
      commentScrollViewRefs.current.delete(postId);
    }
  }, []);

  // Handle comment deletion
  const handleDeleteComment = async (commentId: string, postId: string) => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    
    // Confirm before deleting
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteComment(commentId, user.id);
              
              if (success) {
                // Remove comment from local state
                // Clear cache for this post since we deleted a comment
                clearCommentsCache(postId, user?.id);
                
                setPostComments(prev => ({
                  ...prev,
                  [postId]: (prev[postId] || []).filter(comment => comment.id !== commentId)
                }));
                
                // Update post comment count
                setPosts(prev => prev.map(post => 
                  post.id === postId 
                    ? { ...post, comments_count: Math.max(0, (post.comments_count || 0) - 1) }
                    : post
                ));
                
                Toast.show({
                  type: 'success',
                  text1: 'Comment deleted successfully',
                  text2: '',
                });
              } else {
                // Removed popup error toast - using on-screen error message only
              }
            } catch (error) {
              error('Error deleting comment:', error);
              // Removed popup error toast - using on-screen error message only
            }
          }
        }
      ]
    );
  };

  // Handle reply to comment
  const handleReplyToComment = async (postId: string, parentCommentId: string, replyText: string) => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }

    if (!replyText.trim()) return;

    try {
      // Find the parent comment to get the username
      const parentComment = postComments[postId]?.find(c => c.id === parentCommentId);
      if (!parentComment) return;

      const newReply = await replyToComment(
        postId, 
        user.id, 
        replyText.trim(), 
        parentCommentId, 
        parentComment.username || parentComment.display_name || 'User'
      );

      if (newReply) {
        // Clear the reply input
        log(`[ReplyInput] Clearing reply input for comment ${parentCommentId}`);
        setReplyTexts(prev => ({ ...prev, [parentCommentId]: '' }));
        setReplyingToComment(null);
        
        // CRITICAL: Merge new reply with existing comments instead of replacing all
        // This preserves old comments that might not be in the fresh fetch
        setPostComments(prev => {
          const existingComments = prev[postId] || [];
          
          // Check if reply already exists (might have been added by realtime or optimistic update)
          const alreadyExists = existingComments.some(c => c.id === newReply.id);
          if (alreadyExists) {
            // Update existing reply
            return {
              ...prev,
              [postId]: existingComments.map(comment => 
                comment.id === newReply.id ? newReply : comment
              )
            };
          } else {
            // Add new reply, preserving all existing comments
            const mergedComments = [...existingComments, newReply].sort((a, b) => {
              // Pinned comments first
              if (a.is_pinned && !b.is_pinned) return -1;
              if (!a.is_pinned && b.is_pinned) return 1;
              // Then by creation time (oldest first)
              const timeA = new Date(a.created_at).getTime();
              const timeB = new Date(b.created_at).getTime();
              return timeA - timeB;
            });
            
            return {
              ...prev,
              [postId]: mergedComments
            };
          }
        });
        
        // Clear cache after adding reply (non-blocking)
        clearCommentsCache(postId, user.id).catch(() => {
          // Silently handle cache clear errors
        });
        
        Toast.show({
          type: 'success',
          text1: 'Reply posted!',
          text2: 'Your reply has been posted.'
        });
      }
    } catch (error) {
      error('Error submitting reply:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to post reply. Please try again.'
      });
    }
  };

  // Toggle thread expansion
  const toggleThreadExpansion = useCallback((commentId: string) => {
    setExpandedThreads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  }, []); // Empty deps - setExpandedThreads is stable

  // Handle follow/unfollow commenter
  const handleFollowCommenter = async (userId: string) => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }

    if (followLoading.has(userId)) return;

    setFollowLoading(prev => new Set(prev).add(userId));
    const isCurrentlyFollowing = followingUsers.has(userId);

    try {
      // Optimistic update
      setFollowingUsers(prev => {
        const newSet = new Set(prev);
        if (isCurrentlyFollowing) {
          newSet.delete(userId);
        } else {
          newSet.add(userId);
        }
        return newSet;
      });

      const success = isCurrentlyFollowing 
        ? await unfollowUser(userId)
        : await followUser(userId);

      if (!success) {
        // Revert optimistic update
        setFollowingUsers(prev => {
          const newSet = new Set(prev);
          if (isCurrentlyFollowing) {
            newSet.add(userId);
          } else {
            newSet.delete(userId);
          }
          return newSet;
        });
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: `Failed to ${isCurrentlyFollowing ? 'unfollow' : 'follow'} user`,
        });
      } else {
        Toast.show({
          type: 'success',
          text1: isCurrentlyFollowing ? 'Unfollowed' : 'Following',
          text2: `You ${isCurrentlyFollowing ? 'unfollowed' : 'are now following'} @${commenterMenuVisible?.username || 'user'}`,
        });
        setCommenterMenuVisible(null);
      }
    } catch (error) {
      error('Error following/unfollowing commenter:', error);
      // Revert optimistic update
      setFollowingUsers(prev => {
        const newSet = new Set(prev);
        if (isCurrentlyFollowing) {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    } finally {
      setFollowLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  // Handle reply to commenter
  const handleReplyToCommenter = useCallback((commentId: string, postId: string) => {
    // Find the post to check if comments are disabled
    const post = posts.find(p => p.id === postId) || videos?.find(v => v.id === postId);
    if (post && (post.comments_disabled || (post as any).isPlaceholder)) {
      setShowCommentsDisabledModal(true);
      return;
    }
    setReplyingToComment(commentId);
    setCommenterMenuVisible(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [posts, videos]);

  // Organize comments into threaded structure
  const organizeCommentsIntoThreads = (comments: Comment[]) => {
    log('[Community] Organizing comments into threads:', comments.map(c => ({
      id: c.id,
      content: c.content.substring(0, 30) + '...',
      reply_to_id: c.reply_to_id,
      username: c.username
    })));
    
    const commentMap = new Map();
    const threadedComments = [];
    
    // First pass: create a map of all comments
    comments.forEach(comment => {
      commentMap.set(comment.id, { 
        ...comment, 
        replies: [] 
      });
    });
    
    // Second pass: organize into parent-child relationships
    comments.forEach(comment => {
      if (comment.reply_to_id) {
        // This is a reply, add it to the parent's replies array
        const parent = commentMap.get(comment.reply_to_id);
        if (parent) {
          log(`[Community] Adding reply ${comment.id} to parent ${comment.reply_to_id}`);
          parent.replies.push(commentMap.get(comment.id));
        } else {
          log(`[Community] Parent ${comment.reply_to_id} not found for reply ${comment.id}`);
        }
      } else {
        // This is a top-level comment
        log(`[Community] Adding top-level comment ${comment.id}`);
        threadedComments.push(commentMap.get(comment.id));
      }
    });
    
    log('[Community] Final threaded structure:', threadedComments.map(c => ({
      id: c.id,
      content: c.content.substring(0, 30) + '...',
      repliesCount: c.replies.length,
      replies: c.replies.map(r => ({ id: r.id, content: r.content.substring(0, 20) + '...' }))
    })));
    
    return threadedComments;
  };
  
  // Navigate to post details (keep for share functionality)
  const navigateToPostDetails = (postId: string) => {
    router.push(`/community/post/${postId}`);
  };
  
  // Navigate to create post
  const navigateToCreatePost = () => {
    router.push('/(tabs)/create');
  };
  
  // Navigate to edit post
  const navigateToEditPost = (post: Post) => {
    router.push({
      pathname: '/community/edit',
      params: { 
        id: post.id,
        content: post.content,
        location: post.location || ''
      }
    });
  };
  
  // Add this function to handle post deletion
  const handleDeletePost = async (postId: string) => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    
    // Confirm before deleting
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Show loading state for the specific post
              const postToDelete = posts.find(p => p.id === postId);
              if (postToDelete) {
                // Add a deleting flag to the post to show loading state
                setPosts(prev => prev.map(post => 
                  post.id === postId 
                    ? { ...post, isDeleting: true }
                    : post
                ));
              }
              
              const success = await deletePost(postId, user.id);
              
              if (success) {
                // Check if it's a video post
                const isVideo = postToDelete?.video_url || (postToDelete as any)?.isVideo;
                
                // Remove post from state immediately for smooth UX
                setPosts(prev => prev.filter(p => p.id !== postId));
                // Also remove from videos array if it's a video
                if (isVideo) {
                  setVideos(prev => prev.filter(v => v.id !== postId));
                }
                Toast.show({
                  type: 'success',
                  text1: isVideo ? 'Video deleted successfully' : 'Post deleted successfully',
                  text2: '',
                });
              } else {
                // Remove the deleting flag on error
                setPosts(prev => prev.map(post => 
                  post.id === postId 
                    ? { ...post, isDeleting: false }
                    : post
                ));
                // Removed popup error toast - using on-screen error message only
              }
            } catch (error) {
              error('Error deleting post:', error);
              // Remove the deleting flag on error
              setPosts(prev => prev.map(post => 
                post.id === postId 
                  ? { ...post, isDeleting: false }
                  : post
              ));
              // Removed popup error toast - using on-screen error message only
            }
          }
        }
      ]
    );
  };

  // Handle toggling comments disabled status
  const handleToggleComments = async (postId: string, currentStatus: boolean) => {
    log(`[handleToggleComments] Called with postId: ${postId}, currentStatus: ${currentStatus}`);
    
    if (!user) {
      log('[handleToggleComments] No user, redirecting to signin');
      router.push('/auth/signin');
      return;
    }
    
    log(`[handleToggleComments] User: ${user.id}, will set comments_disabled to: ${!currentStatus}`);
    
    try {
      const success = await togglePostComments(postId, user.id, !currentStatus);
      
      log(`[handleToggleComments] togglePostComments returned: ${success}`);
      
      if (success) {
        // Update post in state
        setPosts(prev => prev.map(post => 
          post.id === postId 
            ? { ...post, comments_disabled: !currentStatus }
            : post
        ));
        
        log(`[handleToggleComments] Updated local state, comments_disabled is now: ${!currentStatus}`);
        
        Toast.show({
          type: 'success',
          text1: currentStatus ? 'Comments enabled' : 'Comments disabled',
          text2: '',
        });
      } else {
        error('[handleToggleComments] togglePostComments failed');
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to update comment settings. Please try again.',
        });
      }
    } catch (error) {
      error('[handleToggleComments] Error toggling comments:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to update comment settings. Please try again.',
      });
    }
  };
  
  // Search posts when query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(true); // Show history when empty
      setIsSearching(false);
      return;
    }
    
    // Show search dropdown for hashtag searches
    if (searchQuery.trim().startsWith('#')) {
      setShowSearchDropdown(true);
    }
    
    // Debounce search (but search immediately for hashtags to show results faster)
    const debounceTime = searchQuery.trim().startsWith('#') ? 100 : 500;
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const trimmedQuery = searchQuery.trim();
        log('[Community] Performing search for:', trimmedQuery);
        
        let results: Post[] = [];
        
        // Handle @username searches - search for users, then get their posts
        if (trimmedQuery.startsWith('@')) {
          const username = trimmedQuery.substring(1); // Remove @
          if (username.length < 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
          }
          
          const { searchUsers } = await import('../utils/searchUtils');
          const { getUserPosts } = await import('../utils/communityUtils');
          
          // Search for matching users
          const matchingUsers = await searchUsers(username, 10);
          log('[Community] Found', matchingUsers.length, 'matching users for:', username);
          
          if (matchingUsers.length === 0) {
            setSearchResults([]);
            setIsSearching(false);
            return;
          }
          
          // Get posts from all matching users
          const allUserPosts: Post[] = [];
          for (const user of matchingUsers) {
            try {
              const userPosts = await getUserPosts(user.id, false);
              allUserPosts.push(...userPosts);
            } catch (err) {
              warn('[Community] Error fetching posts for user', user.id, err);
            }
          }
          
          // Sort by created_at (newest first)
          results = allUserPosts.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
          });
          
          log('[Community] Found', results.length, 'posts from', matchingUsers.length, 'users');
        } else {
          // Regular search - search posts by content or hashtag
          const { searchPosts } = await import('../utils/searchUtils');
          results = await searchPosts(trimmedQuery, 50);
          log('[Community] Search results:', results.length, 'for query:', trimmedQuery);
          
          if (results.length === 0 && trimmedQuery.startsWith('#')) {
            warn('[Community] No results found for hashtag:', trimmedQuery);
          }
          
        }
        
        setSearchResults(results);
        setSearchMode(trimmedQuery.startsWith('#') ? 'hashtag' : trimmedQuery.startsWith('@') ? 'user' : 'all');
        log('[Community] Search completed. Results set:', results.length);
      } catch (error) {
        error('[Community] Error searching posts:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, debounceTime);
    
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);
  
  // Filter posts based on search query - memoized for performance
  const getFilteredPosts = useMemo(() => {
    // First filter out video posts - they should only appear in video tab
    const nonVideoPosts = posts.filter(post => !post.video_url);
    
    // If searching, use search results (even if empty, to show "no results")
    if (searchQuery.trim()) {
      // If search is still loading, show loading state by returning empty array
      if (isSearching) {
        log('[Community] Search in progress, showing loading state');
        return [];
      }
      // Return ALL search results (including videos) - we'll separate them in getSortedPosts
      // Don't filter out videos here - we need them for the unified feed
      log('[Community] getFilteredPosts - searchQuery:', searchQuery, 'searchResults:', searchResults.length);
      return searchResults; // Include videos in search results
    }
    
    // No search query - return all posts (excluding videos)
    return nonVideoPosts;
  }, [posts, searchQuery, searchResults, isSearching]);
  
  // Apply sorting based on selected filter - memoized for performance
  // CRITICAL: Only show placeholders when no real posts exist (cache miss scenario)
  // Since cloud cache loads instantly, placeholders are only needed as fallback
  const getSortedPosts = useMemo(() => {
    // Ensure getFilteredPosts is always an array
    const filteredPosts = Array.isArray(getFilteredPosts) ? getFilteredPosts : [];
    
    // When searching, use search results directly (they already include videos)
    // When not searching, separate posts and videos
    const isSearching = searchQuery.trim().length > 0;
    
    // Combine posts (with placeholders) and videos for unified feed
    const safePlaceholders = Array.isArray(placeholderPostsWithLikes) ? placeholderPostsWithLikes : [];
    
    // Unified list (photos, text, video); final order comes from sortFeedPosts — no type-based sinking
    const allContent: Post[] = [];
    
    // When searching, extract videos from search results
    // When not searching, use videos from state
    let videosToUse: any[] = [];
    let postsWithoutVideos: Post[] = [];
    
    // Check if we're actively searching (have a search query)
    const hasSearchQuery = searchQuery.trim().length > 0;
    
    if (isSearching || hasSearchQuery) {
      // When searching, get videos and posts from search results ONLY
      // Never fall back to placeholders during search
      const searchVideos = searchResults.filter(post => post.video_url);
      const searchPosts = searchResults.filter(post => !post.video_url);
      
      // Convert search videos to video format
      videosToUse = searchVideos.map(post => ({
        id: post.id,
        user: {
          id: post.user_id,
          username: post.username || '',
          display_name: post.display_name || '',
          avatar_url: post.user_avatar_url || '',
        },
        video_url: post.video_url || '',
        thumbnail_url: post.thumbnail_url || '',
        description: post.content || '',
        created_at: post.created_at,
        likes_count: post.likes_count || 0,
        comments_count: post.comments_count || 0,
        views_count: post.views_count || 0,
        is_liked: post.liked_by_user || false,
        is_bookmarked: post.bookmarked || false,
        location: post.location,
        comments_disabled: post.comments_disabled || false,
        boost_expires_at: post.boost_expires_at ?? null,
      }));
      
      // During search, only show actual search results - NO placeholders
      postsWithoutVideos = searchPosts;
    } else {
      // When not searching, use regular posts and videos
      videosToUse = videos || [];
      postsWithoutVideos = filteredPosts.length > 0 
        ? filteredPosts 
        : (safePlaceholders.length > 0 ? safePlaceholders : placeholderPostsRef.current);
    }
    
    allContent.push(...postsWithoutVideos);
    log(`[Community] 📸 Merged ${postsWithoutVideos.length} non-video items into feed${searchQuery.trim() ? ' [SEARCH MODE]' : ''}`);
    
    if (videosToUse && videosToUse.length > 0) {
      log(`[Community] 🎥 Merging ${videosToUse.length} videos into same feed (ranked with photos/text)${searchQuery.trim() ? ' [SEARCH MODE]' : ''}`);
      
      // Convert videos to post format for unified display
      // Safety: Filter out invalid videos before mapping
      const validVideos = videosToUse.filter(video => {
        if (!video || !video.id || !video.user || !video.user.id) {
          warn('[Community] Filtered out invalid video:', video);
          return false;
        }
        return true;
      });
      
      const videoPosts = validVideos.map(video => ({
        id: video.id,
        user_id: video.user.id,
        user_email: '', // Videos don't have email
        content: video.description || '',
        video_url: video.video_url,
        thumbnail_url: video.thumbnail_url,
        created_at: video.created_at,
        updated_at: video.created_at,
        likes_count: video.likes_count || 0,
        comments_count: video.comments_count || 0,
        views_count: video.views_count || 0, // Include view count for videos
        liked_by_user: video.is_liked || sessionLikedPostIds.includes(video.id),
        bookmarked: video.is_bookmarked || false,
        username: video.user.username,
        display_name: video.user.display_name,
        user_avatar_url: video.user.avatar_url,
        isVideo: true, // Mark as video for rendering
        location: video.location,
        comments_disabled: video.comments_disabled ?? false, // Include comments_disabled for videos (use nullish coalescing)
        adult_content: !!(video.adult_content === true || video.adult_content === 1),
        boost_expires_at: video.boost_expires_at ?? null,
      }));
      
      // Filter out videos that already exist in postsWithoutVideos (prevent duplicates)
      const uniqueVideoPosts = videoPosts.filter(
        videoPost => !postsWithoutVideos.some(post => post.id === videoPost.id)
      );
      
      allContent.push(...uniqueVideoPosts);
      log(`[Community] 🎥 Added ${uniqueVideoPosts.length} videos, total items before sort: ${allContent.length}`);
    }
    const placeholderCount = safePlaceholders.length;
    log(`[Community] Total content in unified feed: ${allContent.length} items (${videosToUse.length} videos + ${postsWithoutVideos.length} photos, including ${safePlaceholders.length} placeholders)${searchQuery.trim() ? ` [SEARCH: ${searchQuery}]` : ''}`);
    
    // Remove any undefined/invalid items (prevents "Cannot read property 'id' of undefined")
    const validContent = allContent.filter((item): item is Post => !!item && typeof item?.id === 'string');
    if (validContent.length !== allContent.length && __DEV__) {
      warn('[Community] Filtered out', allContent.length - validContent.length, 'invalid post(s) from feed');
    }

    // Hide 18+ content when user has not enabled "Show 18+ content" in the community drawer
    const contentAfterAdultFilter = showAdultContent
      ? validContent
      : validContent.filter(item => !(item.adult_content === true || item.adult_content === 1));

    // Deduplicate by ID to prevent duplicate keys
    const seenIds = new Set<string>();
    const deduplicatedContent = contentAfterAdultFilter.filter(item => {
      if (seenIds.has(item.id)) {
        if (__DEV__) warn('[Community] Duplicate post ID detected:', item.id, ', skipping duplicate');
        return false;
      }
      seenIds.add(item.id);
      return true;
    });
    
    // Separate real posts from placeholders before sorting
    // This ensures placeholders always appear at the bottom regardless of timestamp
    const realPosts = deduplicatedContent.filter(post => !post.isPlaceholder);
    const placeholderPosts = deduplicatedContent.filter(post => post.isPlaceholder);
    
    // Separate pinned and unpinned posts (pinned always at top)
    const pinnedPosts = realPosts.filter(post => post.is_pinned);
    const unpinnedPosts = realPosts.filter(post => !post.is_pinned);
    
    const sortedPinnedPosts = sortFeedPosts([...pinnedPosts]);
    const rankedUnpinned = sortFeedPosts([...unpinnedPosts]);
    const sortedUnpinnedPosts = interleavePostsByMediaKind(rankedUnpinned);

    const finalSortedContent: typeof deduplicatedContent = [
      ...sortedPinnedPosts,
      ...sortedUnpinnedPosts,
      ...placeholderPosts
    ];
    
    if (__DEV__) {
      const totalVideos = finalSortedContent.filter(
        (p) => getPostMediaKind(p) === 'video'
      ).length;
      const totalPhotos = finalSortedContent.filter(
        (p) => getPostMediaKind(p) === 'photo'
      ).length;
      const totalText = finalSortedContent.filter(
        (p) => getPostMediaKind(p) === 'text'
      ).length;
      log(
        `[Community] 📊 Feed: ranked + interleaved video/photo/text — ${totalVideos}v / ${totalPhotos}p / ${totalText}t`
      );
    }
    
    // Progressive display: Show only displayedPostsCount initially, rest ready for smooth scrolling
    // This prevents scroll position reset bugs when loading more content
    // Always show at least INITIAL_DISPLAY_COUNT, but can show more if user scrolled
    const effectiveDisplayCount = Math.max(INITIAL_DISPLAY_COUNT, displayedPostsCount);
    const postsToDisplay = finalSortedContent.slice(0, effectiveDisplayCount);
    const readyPosts = finalSortedContent.slice(effectiveDisplayCount);
    
    // Log progressive display stats
    if (__DEV__ && finalSortedContent.length > INITIAL_DISPLAY_COUNT) {
      log(`[Community] 📊 Progressive display: Showing ${postsToDisplay.length}/${finalSortedContent.length} posts (${readyPosts.length} ready in buffer)`);
    }
    
    // Safety: Filter out any undefined/null items before returning
    const safePostsToDisplay = postsToDisplay.filter(item => {
      if (!item || !item.id) {
        warn('[Community] Filtered out invalid post item:', item);
        return false;
      }
      return true;
    });
    
    // Return displayed posts (ready posts will be added progressively when user scrolls)
    return safePostsToDisplay;
  }, [posts, videos, searchQuery, searchResults, placeholderPostsWithLikes, getFilteredPosts, displayedPostsCount, showAdultContent, sessionLikedPostIds]);

  // Handle navigation to specific post from notification
  useEffect(() => {
    if (targetPostId && getSortedPosts.length > 0) {
      // Find the post in the sorted/filtered list
      const postIndex = getSortedPosts.findIndex(p => p.id === targetPostId);
      
      if (postIndex !== -1) {
        // Expand the post to show comments
        setExpandedPosts(prev => new Set(prev).add(targetPostId));
        
        // Load comments if not already loaded
        if (!postComments[targetPostId]) {
          loadCommentsInBackground(targetPostId);
        }
        
        // Scroll to the post after a short delay to ensure it's rendered
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: postIndex,
            animated: true,
            viewPosition: 0.1 // Show post near top of screen
          });
        }, 300);
        
        // Clear the targetPostId from URL after navigation
        router.setParams({ postId: undefined });
      } else {
        warn('⚠️ Post not found in feed:', targetPostId);
      }
    }
  }, [targetPostId, getSortedPosts, postComments, loadCommentsInBackground, router]);
  
  // Enhanced function to handle sharing posts and videos
  const handleShare = async (post: Post) => {
    try {
      log('🔄 [Share] Starting share process for post:', post.id);
      log('🔄 [Share] Post data:', {
        id: post.id,
        content: post.content,
        username: post.username,
        hasVideo: !!(post as any).video_url,
        hasImages: !!post.image_urls?.length
      });
      
      // Create deep link that opens the app directly (if installed)
      // Format: nomlimingle://post/{postId} - opens directly in app
      const deepLink = `nomlimingle://post/${post.id}`;
      
      // Universal link format (can open app or web)
      // This should be configured in your app.json/app.config.js
      const universalLink = `https://nomlimingle.app/post/${post.id}`;
      
      // Play Store URL as fallback (only shown in message, not as primary URL)
      const appStoreUrl = Platform.OS === 'ios' 
        ? 'https://apps.apple.com/app/nomli-mingle/id123456789' // Replace with actual App Store ID
        : 'https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en';
      
      // Check if this is a video post
      const isVideo = (post as any).isVideo || (post as any).video_url;
      log('🔄 [Share] Is video post:', isVideo);
      
      // Get the best media URL for sharing
      let shareMediaUrl = '';
      try {
        shareMediaUrl = isVideo 
          ? await prepareVideoForSharing(post)
          : await prepareImageForSharing(post);
        log('🔄 [Share] Media URL prepared:', shareMediaUrl);
      } catch (mediaError) {
        warn('⚠️ [Share] Could not prepare media URL:', mediaError);
      }
      
      // Format the content based on type
      const contentText = post.content || (post as any).description || '';
      const postType = isVideo ? 'video' : 'post';
      const emoji = isVideo ? '🎬' : '📝';
      
      log('🔄 [Share] Content details:', {
        contentText,
        postType,
        contentLength: contentText.length
      });
      
      // Create better formatted content
      let shareContent = '';
      if (contentText && contentText.trim()) {
        const truncatedContent = contentText.length > 120 
          ? contentText.substring(0, 120).trim() + '...' 
          : contentText.trim();
        shareContent = truncatedContent;
      } else {
        shareContent = `Check out this amazing ${postType} on Nomli Mingle!`;
      }
      
      // Format the title
      const shareTitle = post.username 
        ? `${emoji} ${postType.charAt(0).toUpperCase() + postType.slice(1)} from @${post.username}` 
        : `Check out this ${postType} on Nomli Mingle`;
      
      // Create the final share message with app suggestion
      // Use universal link as primary URL (opens app if installed, web otherwise)
      const shareMessage = `${shareContent}\n\n📱 View in Nomli Mingle: ${universalLink}\n\nGet the app: ${appStoreUrl}\n\n#NomliMingle #SocialMedia ${isVideo ? '#Video' : '#Post'}`;
      
      // Prepare share options
      // Use universal link as the URL - this will open the app if installed
      // On Android, include the app name in the message to help with app suggestions
      const shareOptions = Platform.OS === 'android' 
        ? {
            title: shareTitle,
            message: `${shareMessage}\n\nApp: Nomli Mingle`, // Add app name for Android app suggestions
            url: universalLink, // Primary URL - opens app if installed
          }
        : {
            title: shareTitle,
            message: shareMessage,
            url: universalLink, // Primary URL - opens app if installed
            ...(shareMediaUrl && { url: shareMediaUrl }) // iOS can use image URL for rich preview
          };
      
      log('✅ [Share] Final share options:', shareOptions);
      
      // Share the content
      const result = await RNShare.share(shareOptions);
      
      if (result.action === RNShare.sharedAction) {
        if (result.activityType) {
          log(`✅ [Share] Shared ${postType} with activity type:`, result.activityType);
        } else {
          log(`✅ [Share] Shared ${postType} successfully`);
        }
      } else if (result.action === RNShare.dismissedAction) {
        log('ℹ️ [Share] Share dismissed by user');
      }
    } catch (error: any) {
      error('❌ [Share] Error sharing content:', error);
      Alert.alert('Share Error', `Could not share this content: ${error.message || 'Unknown error'}`);
    }
  };
  
  // Prepare video for sharing - gets the best video URL or thumbnail
  const prepareVideoForSharing = async (post: Post): Promise<string> => {
    log('🎬 [VideoShare] Preparing video for sharing...');
    
    // For videos, we can share the thumbnail URL or the video URL itself
    const videoPost = post as any;
    
    log('🎬 [VideoShare] Video post data:', {
      hasThumbail: !!videoPost.thumbnail_url,
      thumbnailUrl: videoPost.thumbnail_url,
      hasVideoUrl: !!videoPost.video_url,
      videoUrl: videoPost.video_url
    });
    
    // Try to get the thumbnail URL first (most platforms show thumbnails in preview)
    if (videoPost.thumbnail_url && (videoPost.thumbnail_url.startsWith('http://') || videoPost.thumbnail_url.startsWith('https://'))) {
      log('🎬 [VideoShare] Using thumbnail URL for sharing');
      try {
        // Try to download thumbnail for better social media card display
        const localThumbnailUrl = await downloadImageForSharing(videoPost.thumbnail_url);
        if (localThumbnailUrl) {
          log('✅ [VideoShare] Downloaded video thumbnail for sharing:', localThumbnailUrl);
          return localThumbnailUrl;
        }
      } catch (error) {
        warn('⚠️ [VideoShare] Error downloading video thumbnail, using direct URL:', error);
      }
      // Return direct thumbnail URL if download fails
      log('📸 [VideoShare] Using direct thumbnail URL');
      return videoPost.thumbnail_url;
    }
    
    // Fallback to video URL if no thumbnail
    if (videoPost.video_url && (videoPost.video_url.startsWith('http://') || videoPost.video_url.startsWith('https://'))) {
      log('🎥 [VideoShare] Using video URL for sharing');
      return videoPost.video_url;
    }
    
    log('❌ [VideoShare] No valid video URLs found');
    return '';
  };
  
  // Prepare image for sharing - this downloads remote images to local cache when needed
  const prepareImageForSharing = async (post: Post): Promise<string> => {
    log('🖼️ [ImageShare] Preparing image for sharing...');
    
    const imageUrl = getBestImageUrlForSharing(post);
    log('🖼️ [ImageShare] Best image URL found:', imageUrl);
    
    if (!imageUrl) {
      log('❌ [ImageShare] No image URL found');
      return '';
    }
    
    // For HTTP/HTTPS URLs, we need to download them for some platforms
    // This ensures the image appears in the share card
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      log('🖼️ [ImageShare] Downloading remote image for sharing...');
      try {
        const localUrl = await downloadImageForSharing(imageUrl);
        if (localUrl) {
          log('✅ [ImageShare] Downloaded image for sharing:', localUrl);
          return localUrl;
        }
      } catch (error) {
        warn('⚠️ [ImageShare] Error downloading image, using direct URL:', error);
      }
    }
    
    log('📸 [ImageShare] Using direct image URL');
    return imageUrl;
  };
  
  // Helper function to get the best image URL for sharing
  const getBestImageUrlForSharing = (post: Post): string => {
    // We need a valid HTTP/HTTPS URL for social media cards
    // Check if post has image URLs array and use the first valid one
    if (post.image_urls && (post.image_urls.length > 0)) {
      for (const url of post.image_urls) {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          return url;
        }
      }
    }
    
    // Fallback to single image URL if available and valid
    if (post.image_url && (post.image_url.startsWith('http://') || post.image_url.startsWith('https://'))) {
      return post.image_url;
    }
    
    // Return empty string if no valid image URLs found
    return '';
  };
  
  const togglePostContentExpansion = useCallback((postId: string) => {
    setExpandedPostContent(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  }, []);
  
  // Add navigation to user profile
  const navigateToUserProfile = (userId: string) => {
    if (!userId) {
      log('[Community] No user ID provided for profile navigation');
      return;
    }
    
    log(`[Community] Navigating to profile for user: ${userId}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${userId}`);
  };
  
  // Track visible posts for lazy loading images
  const [visiblePostIds, setVisiblePostIds] = useState<Set<string>>(new Set());
  // First visible post id = only this one auto-plays attached audio (Facebook-style, one at a time)
  const [firstVisiblePostId, setFirstVisiblePostId] = useState<string | null>(null);
  // Track which video is currently in view for auto-play
  const [currentlyVisibleVideoId, setCurrentlyVisibleVideoId] = useState<string | null>(null);
  
  // Refs for viewability callback (avoid dependency churn + throttle)
  const viewabilityThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewableRef = useRef<any[]>([]);
  const postsRef = useRef(posts);
  const postCommentsRef = useRef(postComments);
  const loadingCommentsRef = useRef(loadingComments);
  const currentlyVisibleVideoIdRef = useRef<string | null>(null);
  postsRef.current = posts;
  postCommentsRef.current = postComments;
  loadingCommentsRef.current = loadingComments;
  currentlyVisibleVideoIdRef.current = currentlyVisibleVideoId;
  
  // Handle viewable items change - THROTTLED to prevent scroll jank and playback stutter
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    lastViewableRef.current = viewableItems;
    
    if (viewabilityThrottleRef.current != null) return; // Already scheduled
    viewabilityThrottleRef.current = setTimeout(() => {
      viewabilityThrottleRef.current = null;
      const items = lastViewableRef.current;
      const visibleIds = items
        .filter((item: any) => item.isViewable)
        .map((item: any) => item.item?.id)
        .filter(Boolean);
      
      setVisiblePostIds(new Set(visibleIds));
      setFirstVisiblePostId(visibleIds[0] ?? null);
      
      const visibleVideoPost = items
        .filter((item: any) => item.isViewable)
        .find((item: any) => {
          const post = item.item;
          return post && ((post as any).isVideo || post.video_url);
        });
      const visibleVideoId = visibleVideoPost?.item?.id || null;
      
      if (visibleVideoId !== currentlyVisibleVideoIdRef.current) {
        setCurrentlyVisibleVideoId(visibleVideoId);
        handleVideoFocusChange(visibleVideoId);
      }
      
      const firstVisiblePostId = visibleIds[0];
      const pc = postCommentsRef.current;
      const lc = loadingCommentsRef.current;
      if (firstVisiblePostId && !pc[firstVisiblePostId] && !lc.has(firstVisiblePostId)) {
        loadCommentsInBackground(firstVisiblePostId);
      }
      
      // DISABLED: Predictive preloading - videos load only when visible
      // No preloading to avoid predictive scrolling behavior
      // if (visibleVideoId) {
      //   // Preloading disabled
      // }
    }, 180); // Throttle: run at most every 180ms during scroll
  }, [loadCommentsInBackground, handleVideoFocusChange]);

  // Cleanup viewability throttle on unmount
  useEffect(() => {
    return () => {
      if (viewabilityThrottleRef.current) {
        clearTimeout(viewabilityThrottleRef.current);
        viewabilityThrottleRef.current = null;
      }
    };
  }, []);

  // Optimized viewability config - higher minimumViewTime reduces rapid play/pause during scroll
  const viewabilityConfig = useMemo(() => ({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 450, // 450ms reduces stutter when scrolling through videos (was 300)
    waitForInteraction: false,
  }), []);

  // Get all video posts for video-feed navigation
  // IMPORTANT: This filters from the current posts array, which may be paginated.
  // For fullscreen feed, we want ALL videos, so we'll ensure we have a complete set.
  const videoPosts = React.useMemo(() => {
    const filtered = posts.filter(
      (post): post is Post => post != null && typeof post.id === 'string' && ((post as any).isVideo || !!post.video_url)
    );
    if (__DEV__) {
      log(`[Community] Found ${filtered.length} videos from ${posts.length} total posts`);
    }
    return filtered;
  }, [posts]);

  // 🚀 OPTIMIZED: Load videos directly from database (faster than filtering from all posts)
  // This uses the optimized fetchAllVideoPosts which:
  // - Only fetches videos (not all posts) = ~80% less data transfer
  // - Simpler query = ~50% faster
  // - Multi-layer caching = instant repeat visits
  // - Stale-while-revalidate = shows cache immediately, refreshes in background
  useEffect(() => {
    let isCancelled = false;

    const loadVideosDirectly = async () => {
      try {
        // Load videos directly from database (optimized with caching)
        const allVideoPosts = await fetchAllVideoPosts(80, 8, true, false); // up to 640 videos max, useCache=true
        if (isCancelled) return;

        // Convert to VideoPost format
        const converted = convertPostsToVideoFeed(allVideoPosts);

        // Update homescreen videos if empty or if this is initial load
        setVideos(prevVideos => {
          // Filter out invalid videos before checking length
          const validPrevVideos = (prevVideos || []).filter((v): v is VideoPost => v != null && typeof v?.id === 'string');
          
          if (validPrevVideos.length === 0 || !videosProcessedRef.current) {
            videosProcessedRef.current = true;
            
            if (__DEV__) {
              log(`[Community] ✅ Loaded ${converted.length} videos directly from DB (optimized)`);
            }
            return converted;
          }
          return validPrevVideos; // Keep existing valid videos
        });
      } catch (error) {
        warn('[Community] Failed to load videos directly (falling back to posts-based videos):', error);
      }
    };

    // Load videos directly on mount (non-blocking)
    // Only run if videos haven't been processed yet
    if (!videosProcessedRef.current) {
      loadVideosDirectly();
    }

    return () => {
      isCancelled = true;
    };
  }, []); // Empty deps - only run on mount

  // Optimized renderPostItem for smooth scrolling - minimal animations
  const renderPostItem = useCallback(({ item, index }: { item: Post; index: number }) => {
    // Safety check: ensure item exists
    if (!item || !item.id) {
      warn('[Community] renderPostItem received invalid item:', item);
      return null;
    }
    
    // Check if post is visible for lazy loading
    const isVisible = visiblePostIds.has(item.id);
    // Only the first visible post auto-plays its attached audio (no sound card, Facebook-style)
    const isActiveForAudio = firstVisiblePostId === item.id;
    
    // Check if this is a video post
    // video_url may be null for text/photo posts
    const hasVideo = item.video_url && item.video_url !== null && typeof item.video_url === 'string';
    const isVideo = (item as any).isVideo || hasVideo;
    
    if (isVideo && hasVideo) {
      // Get the video from videos array to ensure we have the latest bookmark state
      const videoFromArray = videoPosts.find(video => video && video.id === item.id) || item;
      
      // Render video post using VideoPost component (plays inline, no fullscreen feed)
      return (
        <View style={{ marginBottom: 20 }}>
          <VideoPostItem
            video={videoFromArray}
            user={user}
            themeColors={themeColors}
            onLike={handleLike}
            onBookmark={handleBookmark}
            onShare={handleShare}
            onComment={() => handlePostExpansion(item.id)}
            onUserPress={navigateToUserProfile}
            onPostMenuPress={setPostMenuVisible}
            setShowCommentsDisabledModal={setShowCommentsDisabledModal}
            commentsDisabledScale={commentsDisabledScale}
            commentsDisabledOpacity={commentsDisabledOpacity}
            isInView={currentlyVisibleVideoId === item.id}
            autoPlay={true}
            forceMute={showStoryViewer || !isScreenFocused}
            isScreenFocused={isScreenFocused}
            setPosts={setPosts}
            commentsExpanded={false}
          />
          
          {/* Video comments now open in TikTok-style bottom sheet modal (see VideoCommentBottomSheet below) */}
          {false && expandedPosts.has(item.id) && !item.comments_disabled && !item.isPlaceholder && (
            <View style={[styles.videoCommentPanelContainer, { backgroundColor: themeColors.neutral.surface }]}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.videoCommentKeyboardView}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
              >
                {/* VideoFeed-style header: drag indicator, close (auto-closes PIP), comment count */}
                <View style={[styles.videoCommentsHeader, { borderTopColor: themeColors.neutral.border }]}>
                  <View style={[styles.videoCommentsDragIndicator, { backgroundColor: themeColors.neutral.subtext }]} />
                  <TouchableOpacity
                    style={styles.videoCommentsCloseButton}
                    onPress={() => handlePostExpansion(item.id)}
                    activeOpacity={0.7}
                  >
                    <ChevronDown size={24} color={themeColors.neutral.text} strokeWidth={2} />
                  </TouchableOpacity>
                  <Text style={[styles.videoCommentsTitle, { color: themeColors.neutral.text }]} numberOfLines={1}>
                    {(postComments[item.id] || []).length} {(postComments[item.id] || []).length === 1 ? 'comment' : 'comments'}
                  </Text>
                  <View style={{ width: 24 }} />
                </View>
                {/* Scrollable comments list - takes remaining space so input stays visible at bottom */}
                <View style={styles.videoCommentScrollArea}>
              {(() => {
                // Show loading only if we're actively loading comments for this post
                const isLoading = loadingComments.has(item.id);
                const comments = postComments[item.id] || [];
                const hasComments = comments.length > 0;
                
                // Don't show loading spinner - comments load quietly in background
                // if (isLoading) {
                //   return (
                //     <View style={styles.commentsLoading}>
                //       <ActivityIndicator size="small" color={themeColors.primary.main} />
                //       <Text style={[styles.commentsLoadingText, themeStyles.subtext]}>Loading comments...</Text>
                //     </View>
                //   );
                // }
                
                // If no comments, show "No comments yet" message
                if (!hasComments) {
                  return (
                    <View style={styles.noCommentsContainer}>
                      <Text style={[styles.noCommentsText, themeStyles.textSecondary]}>
                        No comments yet. Be the first to comment!
                      </Text>
                    </View>
                  );
                }
                
                // Show comments list
                    const threadedComments = organizeCommentsIntoThreads(comments);
                return (
                  <ScrollView 
                    ref={(ref) => {
                      if (ref) {
                        commentScrollViewRefs.current.set(item.id, ref);
                      } else {
                        commentScrollViewRefs.current.delete(item.id);
                      }
                    }}
                    style={[styles.commentsListScrollView, styles.videoCommentListScrollView]}
                    contentContainerStyle={[styles.commentsList, { paddingBottom: Spacing.xl + Spacing.md }]}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                    bounces={true}
                  >
                    {threadedComments.map(comment => {
                      const isMyComment = user?.id === comment.user_id;
                      return (
                        <View key={comment.id} style={styles.commentThread}>
                          {/* Parent Comment */}
                          <View style={styles.commentItem}>
                            <TouchableOpacity 
                              onPress={() => {
                                if (item.comments_disabled || item.isPlaceholder) {
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
                                  return;
                                }
                                navigateToUserProfile(comment.user_id);
                              }}
                              activeOpacity={0.7}
                            >
                              <SimpleAvatar
                                avatarUrl={comment.user_avatar || comment.profiles?.avatar_url}
                                userId={comment.user_id}
                                size={24}
                                isDarkMode={isDarkMode}
                                isVerified={comment.profiles?.is_verified || false}
                                fullName={comment.profiles?.full_name}
                                username={comment.username}
                              />
                            </TouchableOpacity>
                            <View style={[styles.commentContent, { 
                              backgroundColor: 'transparent',
                            }]}>
                              <View style={styles.commentHeader}>
                                <TouchableOpacity 
                                  onPress={() => {
                                    if (item.comments_disabled || item.isPlaceholder) {
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
                                      return;
                                    }
                                    navigateToUserProfile(comment.user_id);
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.commentUsername, { color: themeColors.primary.main }]} numberOfLines={1} ellipsizeMode="tail">
                                    {(() => {
                                      try {
                                        const username = sanitizeUsernameForDisplay(comment.username || comment.user_email?.split('@')[0]);
                                        return username.length > 14 ? username.substring(0, 14) + '...' : username;
                                      } catch (error) {
                                        error('[Community] Error sanitizing comment username:', error);
                                        const fallback = comment.username || comment.user_email?.split('@')[0] || 'User';
                                        return fallback.length > 14 ? fallback.substring(0, 14) + '...' : fallback;
                                      }
                                    })()}
                                  </Text>
                                </TouchableOpacity>
                                <Text style={[styles.commentTime, themeStyles.textSecondary]}>
                                  {formatTimeAgo(comment.created_at)}
                                </Text>
                                
                                {isMyComment && (
                                  <TouchableOpacity
                                    style={styles.commentActionIcon}
                                    onPress={() => setCommentMenuVisible(comment.id)}
                                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                                  >
                                    <MoreVertical size={16} color={themeColors.neutral.subtext} />
                                  </TouchableOpacity>
                                )}
                              </View>
                              <Text style={[styles.commentText, themeStyles.text]}>
                                {comment.content}
                              </Text>
                              
                              {/* Comment actions */}
                              {user && (
                                user.id === item.user_id || // Post owner
                                user.id === comment.user_id || // Comment owner  
                                (!item.visibility || item.visibility === 'public') // Public posts
                              ) && (
                                <View style={styles.commentActions}>
                                  <TouchableOpacity
                                    style={styles.commentActionButton}
                                    onPress={() => {
                                      if (item.comments_disabled || item.isPlaceholder) {
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
                                        return;
                                      }
                                      setReplyingToComment(comment.id);
                                    }}
                                  >
                                    <Text style={[styles.commentActionText, themeStyles.subtext]}>
                                      Reply
                                    </Text>
                                  </TouchableOpacity>
                                  
                                  <Text style={[styles.commentActionDivider, themeStyles.subtext]}>•</Text>
                                  
                                  <TouchableOpacity
                                    style={styles.commentActionButton}
                                    onPress={() => {
                                      if (item.comments_disabled || item.isPlaceholder) {
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
                                        return;
                                      }
                                      if (user?.id) {
                                        handleToggleCommentLike(item.id, comment.id, user.id);
                                      } else {
                                        Alert.alert('Sign In Required', 'Please sign in to like comments.', [
                                          { text: 'Cancel', style: 'cancel' },
                                          { text: 'Sign In', onPress: () => router.push('/auth/signin') }
                                        ]);
                                      }
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <View style={styles.commentLikeContainer}>
                                      <Heart
                                        size={14}
                                        color={comment.liked ? '#10B981' : themeColors.neutral.subtext}
                                        fill={comment.liked ? '#10B981' : 'transparent'}
                                      />
                                      <Text style={[
                                        styles.commentLikeCount,
                                        { color: comment.liked ? '#10B981' : themeColors.neutral.subtext }
                                      ]}>
                                        {comment.likes_count || 0}
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          </View>
                          
                          {/* Thread Controls */}
                          {comment.replies && comment.replies.length > 0 && (
                            <View style={styles.threadControls}>
                              <TouchableOpacity
                                style={styles.threadToggleButton}
                                onPress={() => {
                                  log('[Community] Toggle thread expansion for comment:', comment.id);
                                  toggleThreadExpansion(comment.id);
                                }}
                                activeOpacity={0.7}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              >
                                <Text style={[styles.threadToggleText, { color: themeColors.primary.main }]}>
                                  {expandedThreads.has(comment.id) ? 'Hide' : 'View'} {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                                </Text>
                                {expandedThreads.has(comment.id) ? (
                                  <ChevronUp size={16} color={themeColors.primary.main} />
                                ) : (
                                  <ChevronDown size={16} color={themeColors.primary.main} />
                                )}
                              </TouchableOpacity>
                            </View>
                          )}

                          {/* Collapsible Replies */}
                          {comment.replies && comment.replies.length > 0 && expandedThreads.has(comment.id) && (
                            <View style={styles.repliesContainer}>
                              {comment.replies.map(reply => {
                                const isMyReply = user?.id === reply.user_id;
                                return (
                                  <View key={reply.id} style={styles.replyItem}>
                                    <TouchableOpacity 
                                      onPress={() => navigateToUserProfile(reply.user_id)}
                                      activeOpacity={0.7}
                                    >
                                      <SimpleAvatar
                                        avatarUrl={reply.user_avatar || reply.profiles?.avatar_url}
                                        userId={reply.user_id}
                                        size={20}
                                        isDarkMode={isDarkMode}
                                        isVerified={reply.profiles?.is_verified || false}
                                        fullName={reply.profiles?.full_name}
                                        username={reply.username}
                                      />
                                    </TouchableOpacity>
                                    <View style={styles.replyContent}>
                                      <View style={styles.commentHeader}>
                                        <TouchableOpacity 
                                          onPress={() => navigateToUserProfile(reply.user_id)}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={[styles.commentUsername, { color: themeColors.primary.main }]} numberOfLines={1} ellipsizeMode="tail">
                                            {(() => {
                                              try {
                                                return sanitizeUsernameForDisplay(reply.username || reply.user_email?.split('@')[0]);
                                              } catch (error) {
                                                error('[Community] Error sanitizing reply username:', error);
                                                return reply.username || reply.user_email?.split('@')[0] || 'User';
                                              }
                                            })()}
                                          </Text>
                                        </TouchableOpacity>
                                        <Text style={[styles.commentTime, themeStyles.textSecondary]}>
                                          {formatTimeAgo(reply.created_at)}
                                        </Text>
                                        
                                        {isMyReply && (
                                          <TouchableOpacity
                                            style={styles.commentActionIcon}
                                            onPress={() => setCommentMenuVisible(reply.id)}
                                            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                                          >
                                            <MoreVertical size={16} color={themeColors.neutral.subtext} />
                                          </TouchableOpacity>
                                        )}
                                      </View>
                                      <Text style={[styles.commentText, themeStyles.text]}>
                                        {reply.content}
                                      </Text>
                                      
                                      {/* Reply actions for replies */}
                                      {user && (
                                        <View style={styles.commentActions}>
                                          <TouchableOpacity
                                            style={styles.commentActionButton}
                                            onPress={() => {
                                              setReplyingToComment(reply.id);
                                            }}
                                          >
                                            <Text style={[styles.commentActionText, themeStyles.subtext]}>
                                              Reply
                                            </Text>
                                          </TouchableOpacity>
                                          
                                          <Text style={[styles.commentActionDivider, themeStyles.subtext]}>•</Text>
                                          
                                          <TouchableOpacity
                                            style={styles.commentActionButton}
                                            onPress={() => {
                                              if (user?.id) {
                                                handleToggleCommentLike(item.id, reply.id, user.id);
                                              }
                                            }}
                                            activeOpacity={0.7}
                                          >
                                            <View style={styles.commentLikeContainer}>
                                              <Heart
                                                size={14}
                                                color={reply.liked ? '#10B981' : themeColors.neutral.subtext}
                                                fill={reply.liked ? '#10B981' : 'transparent'}
                                              />
                                              <Text style={[
                                                styles.commentLikeCount,
                                                { color: reply.liked ? '#10B981' : themeColors.neutral.subtext }
                                              ]}>
                                                {reply.likes_count || 0}
                                              </Text>
                                            </View>
                                          </TouchableOpacity>
                                          
                                          {/* Delete button for own replies */}
                                          {isMyReply && (
                                            <>
                                              <Text style={[styles.commentActionDivider, themeStyles.subtext]}>•</Text>
                                              <TouchableOpacity
                                                style={styles.commentActionButton}
                                                onPress={() => {
                                                  Alert.alert(
                                                    'Delete Reply',
                                                    'Are you sure you want to delete this reply?',
                                                    [
                                                      { text: 'Cancel', style: 'cancel' },
                                                      { 
                                                        text: 'Delete', 
                                                        style: 'destructive',
                                                        onPress: () => handleDeleteComment(reply.id, item.id)
                                                      }
                                                    ]
                                                  );
                                                }}
                                                activeOpacity={0.7}
                                              >
                                                <Text style={[styles.commentActionText, { color: themeColors.error.main }]}>
                                                  Delete
                                                </Text>
                                              </TouchableOpacity>
                                            </>
                                          )}
                                        </View>
                                      )}
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}

                          {/* Reply Input for this comment */}
                          {replyingToComment === comment.id && (
                            <View style={styles.replyInputContainer}>
                              <TextInput
                                style={[styles.replyInput, themeStyles.commentInput]}
                                placeholder={`Reply to ${comment.username || 'User'}...`}
                                placeholderTextColor={themeColors.neutral.textSecondary}
                                value={replyTexts[comment.id] || ''}
                                onChangeText={(text) => {
                                  log(`[ReplyInput] Typing in reply for comment ${comment.id}:`, text);
                                  setReplyTexts(prev => ({ ...prev, [comment.id]: text }));
                                }}
                                multiline
                              />
                              <View style={styles.replyInputActions}>
                                <TouchableOpacity
                                  style={styles.replyCancelButton}
                                  onPress={() => {
                                    log(`[ReplyInput] Cancel button pressed for comment ${comment.id}`);
                                    setReplyingToComment(null);
                                    setReplyTexts(prev => ({ ...prev, [comment.id]: '' }));
                                  }}
                                >
                                  <Text style={[styles.replyCancelText, themeStyles.subtext]}>
                                    Cancel
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[
                                    styles.replySendButton,
                                    { backgroundColor: themeColors.primary.main },
                                    (!(replyTexts[comment.id] || '').trim()) && [styles.replySendButtonDisabled, { backgroundColor: themeColors.neutral.disabled }]
                                  ]}
                                  onPress={() => handleReplyToComment(item.id, comment.id, replyTexts[comment.id] || '')}
                                  disabled={!(replyTexts[comment.id] || '').trim()}
                                >
                                  <Send size={16} color={themeColors.neutral.surface} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                          
                          {/* Comment Separator Line */}
                          <View style={[styles.commentSeparatorLine, { 
                            backgroundColor: themeColors.neutral.border 
                          }]} />
                        </View>
                      );
                    })}
                </ScrollView>
                );
              })()}
                </View>
                {/* Comment input pinned at bottom of panel - always visible */}
                <View style={[styles.videoCommentInputSection, { backgroundColor: themeColors.neutral.card, paddingBottom: Math.max(Spacing.md, insets.bottom) }]}>
                {item.comments_disabled ? (
                  <TouchableOpacity
                    style={[styles.commentLockedContainer, themeStyles.surfaceVariant]}
                    onPress={() => {
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
                    }}
                    activeOpacity={0.7}
                  >
                    <Lock size={16} color={themeColors.neutral.textSecondary} />
                    <Text style={[styles.commentLockedText, themeStyles.textSecondary]}>
                      Comments disabled
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {/* Text input first so emoji row / keyboard never blocks it */}
                    <View style={[styles.commentInputContainer, { backgroundColor: themeColors.neutral.surfaceVariant, borderRadius: BorderRadius.pill, marginBottom: Spacing.xs }]}>
                      <TextInput
                        style={[styles.commentInput, { color: themeColors.neutral.text, backgroundColor: 'transparent' }]}
                        placeholder="Add a comment..."
                        placeholderTextColor={themeColors.neutral.textSecondary}
                        value={commentTexts[item.id] || ''}
                        onChangeText={(text) => setCommentTexts(prev => ({ ...prev, [item.id]: text }))}
                      />
                      <TouchableOpacity
                        style={[
                          styles.commentSendButton,
                          { backgroundColor: themeColors.primary.main },
                          (!(commentTexts[item.id] || '').trim() || submittingComments.has(item.id)) && [styles.commentSendButtonDisabled, { backgroundColor: themeColors.neutral.disabled }]
                        ]}
                        onPress={() => handleCommentSubmit(item.id)}
                        disabled={!(commentTexts[item.id] || '').trim() || submittingComments.has(item.id)}
                      >
                        {submittingComments.has(item.id) ? (
                          <ActivityIndicator size="small" color={themeColors.neutral.surface} />
                        ) : (
                          <Send size={18} color={themeColors.neutral.surface} />
                        )}
                      </TouchableOpacity>
                    </View>
                    {/* Quick Emoji Row below input so it never blocks the field */}
                    <View style={[styles.quickEmojiRow, { marginBottom: 0 }]}>
                      {['😂', '❤️', '🔥', '👏', '😍', '😮', '😢', '🙏'].map((emoji) => (
                        <TouchableOpacity
                          key={emoji}
                          style={styles.quickEmojiButton}
                          onPress={() => setCommentTexts(prev => ({ ...prev, [item.id]: (prev[item.id] || '') + emoji }))}
                        >
                          <Text style={styles.quickEmoji}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </View>
              </KeyboardAvoidingView>
            </View>
          )}
          
        </View>
      );
    }
    
    // Render regular post
    return (
      <View>
        <PostItemDisplay
          item={item}
          user={user}
          isDark={isDarkMode}
          themeColors={themeColors}
          expandedPosts={expandedPosts}
          setPosts={setPosts}
          expandedPostContent={expandedPostContent}
          postComments={postComments}
          loadingComments={loadingComments}
          submittingComments={submittingComments}
          commentTexts={commentTexts}
          handleLike={handleLike}
          handleBookmark={handleBookmark}
          handlePostExpansion={handlePostExpansion}
          togglePostContentExpansion={togglePostContentExpansion}
          setPostMenuVisible={setPostMenuVisible}
          setSelectedPost={setSelectedPost}
          handleCommentSubmit={handleCommentSubmit}
          setCommentTexts={setCommentTexts}
          setCommentMenuVisible={setCommentMenuVisible}
          handleShare={handleShare}
          setViewingImage={handleSetViewingImage}
          navigateToUserProfile={navigateToUserProfile}
          handleToggleCommentLike={handleToggleCommentLike}
          isVisible={isVisible}
          isActiveForAudio={isActiveForAudio}
          // Threaded comment functions
          organizeCommentsIntoThreads={organizeCommentsIntoThreads}
          expandedThreads={expandedThreads}
          replyingToComment={replyingToComment}
          replyTexts={replyTexts}
          handleReplyToComment={handleReplyToComment}
          toggleThreadExpansion={toggleThreadExpansion}
          setReplyingToComment={setReplyingToComment}
          setReplyTexts={setReplyTexts}
          handleDeleteComment={handleDeleteComment}
          setShowLikesModal={setShowLikesModal}
          setShowPrivacyModal={setShowPrivacyModal}
          setShowCommentsDisabledModal={setShowCommentsDisabledModal}
          commentsDisabledScale={commentsDisabledScale}
          commentsDisabledOpacity={commentsDisabledOpacity}
          setCommentScrollViewRef={setCommentScrollViewRef}
          onBoostPost={handleBoostPost}
        />
      </View>
    );
  }, [
    // Optimized dependencies for better performance
    expandedPosts, 
    expandedPostContent,
    postComments, 
    commentTexts, 
    themeColors.neutral.surface,
    themeColors.neutral.background,
    user?.id,
    isDarkMode,
    // Threaded comment dependencies
    expandedThreads,
    replyingToComment,
    replyTexts,
    organizeCommentsIntoThreads,
    handleReplyToComment,
    toggleThreadExpansion,
    setReplyingToComment,
    setReplyTexts,
    setShowPrivacyModal,
    handleBoostPost
  ]);
  
  // Image viewer state - no animations for better performance

  // Safe logging function that can be called from worklet
  const logScale = useCallback((value: number) => {
    log('Scale changed:', value.toFixed(2));
  }, []);

  // Simple dot style function without animations
  const getDotStyle = useCallback((index: number) => {
      const isActive = index === viewingImageIndex;
      return {
        width: isActive ? 10 : 8,
        height: isActive ? 10 : 8,
        borderRadius: isActive ? 5 : 4,
        backgroundColor: isActive ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.5)',
        marginHorizontal: 4,
      };
  }, [viewingImageIndex]);

  const resetImage = () => {
    // Simple reset without animations
    setViewingImageIndex(0);
    // Reset animation values
    imageTranslateX.value = 0;
    imageTranslateY.value = 0;
    imageOpacity.value = 1;
    imageScale.value = 1;
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };
  
  // Add a function to handle setting the viewing image and related state
  const handleSetViewingImage = useCallback((imageUrl: string | null, imageSet?: string[], index: number = 0) => {
    setViewingImage(imageUrl);
    if (imageSet && (imageSet?.length || 0) > 0) {
      setViewingImageSet(imageSet);
      setViewingImageIndex(index);
    } else if (imageUrl) {
      setViewingImageSet([imageUrl]);
      setViewingImageIndex(0);
    }
  }, []);

  // Handle swipe to navigate between images with smooth animation
  const handleSwipeComplete = useCallback((direction: 'left' | 'right') => {
    if (direction === 'left' && viewingImageIndex < (viewingImageSet?.length || 0) - 1) {
      const newIndex = viewingImageIndex + 1;
      setViewingImageIndex(newIndex);
      setViewingImage(viewingImageSet[newIndex]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (direction === 'right' && viewingImageIndex > 0) {
      const newIndex = viewingImageIndex - 1;
      setViewingImageIndex(newIndex);
      setViewingImage(viewingImageSet[newIndex]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // Reset translateX with smooth animation
    imageTranslateX.value = withTiming(0, { duration: 300 });
  }, [viewingImageIndex, viewingImageSet, imageTranslateX]);

  // Function to close image viewer
  const closeImageViewer = useCallback(() => {
    resetImage();
    setViewingImage(null);
    setViewingImageSet([]);
    // Reset animation values
    imageTranslateX.value = 0;
    imageTranslateY.value = 0;
    imageOpacity.value = 1;
    imageScale.value = 1;
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [imageTranslateX, imageTranslateY, imageOpacity, imageScale, savedScale, savedTranslateX, savedTranslateY]);

  // Combined gesture for horizontal swipe (navigation) and vertical drag (close)
  // Only works when not zoomed (zoom takes priority)
  const swipeGesture = useMemo(() => 
    Gesture.Pan()
      .onUpdate((event) => {
        // Don't allow swipe/close when zoomed
        if (imageScale.value > 1.1) return;
        
        // Prioritize vertical drag for closing
        if (Math.abs(event.translationY) > Math.abs(event.translationX)) {
          // Vertical drag - drag down to close
          if (event.translationY > 0) {
            imageTranslateY.value = event.translationY;
            // Fade out as user drags down
            const opacity = Math.max(0, 1 - (event.translationY / screenHeight));
            imageOpacity.value = opacity;
          }
        } else {
          // Horizontal swipe - navigation between images
          const maxTranslation = screenWidth * 0.3;
          const translation = Math.max(-maxTranslation, Math.min(maxTranslation, event.translationX));
          imageTranslateX.value = translation;
        }
      })
      .onEnd((event) => {
        // Don't allow swipe/close when zoomed
        if (imageScale.value > 1.1) return;
        
        const SWIPE_THRESHOLD = 60;
        const VELOCITY_THRESHOLD = 400;
        const DRAG_DOWN_THRESHOLD = 100; // Minimum drag distance to close
        const DRAG_DOWN_VELOCITY_THRESHOLD = 500; // Minimum velocity to close
        
        // Check for drag-down to close
        if (event.translationY > DRAG_DOWN_THRESHOLD || event.velocityY > DRAG_DOWN_VELOCITY_THRESHOLD) {
          // Close the viewer
          runOnJS(closeImageViewer)();
          return;
        }
        
        // Reset vertical position if not closing
        imageTranslateY.value = withTiming(0, { duration: 250 });
        imageOpacity.value = withTiming(1, { duration: 250 });
        
        // Handle horizontal navigation
        if ((viewingImageSet?.length || 0) > 1) {
          if ((event.translationX < -SWIPE_THRESHOLD || event.velocityX < -VELOCITY_THRESHOLD) && 
              viewingImageIndex < (viewingImageSet?.length || 0) - 1) {
            // Swipe left - next image
            runOnJS(handleSwipeComplete)('left');
          } else if ((event.translationX > SWIPE_THRESHOLD || event.velocityX > VELOCITY_THRESHOLD) && 
                     viewingImageIndex > 0) {
            // Swipe right - previous image
            runOnJS(handleSwipeComplete)('right');
          } else {
            // Snap back to current position
            imageTranslateX.value = withTiming(0, { duration: 250 });
          }
        } else {
          // Single image - just snap back
          imageTranslateX.value = withTiming(0, { duration: 250 });
        }
      }), [viewingImageSet, handleSwipeComplete, imageTranslateX, imageTranslateY, imageOpacity, imageScale, viewingImageIndex, screenWidth, screenHeight, closeImageViewer]
  );

  // Pinch gesture for zoom
  const pinchGesture = useMemo(() => 
    Gesture.Pinch()
      .onUpdate((event) => {
        imageScale.value = savedScale.value * event.scale;
      })
      .onEnd(() => {
        // Limit scale between 1 and 4
        if (imageScale.value < 1) {
          imageScale.value = withSpring(1);
          savedScale.value = 1;
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
          imageTranslateX.value = withSpring(0);
          imageTranslateY.value = withSpring(0);
        } else if (imageScale.value > 4) {
          imageScale.value = withSpring(4);
          savedScale.value = 4;
        } else {
          savedScale.value = imageScale.value;
        }
      }), [imageScale, savedScale, savedTranslateX, savedTranslateY, imageTranslateX, imageTranslateY]
  );

  // Pan gesture for moving zoomed image
  const panGesture = useMemo(() => 
    Gesture.Pan()
      .onUpdate((event) => {
        // Only allow panning when zoomed
        if (imageScale.value > 1) {
          imageTranslateX.value = savedTranslateX.value + event.translationX;
          imageTranslateY.value = savedTranslateY.value + event.translationY;
        }
      })
      .onEnd(() => {
        savedTranslateX.value = imageTranslateX.value;
        savedTranslateY.value = imageTranslateY.value;
      }), [imageScale, imageTranslateX, imageTranslateY, savedTranslateX, savedTranslateY]
  );

  // Double tap to zoom
  const doubleTapGesture = useMemo(() => 
    Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        if (imageScale.value > 1) {
          // Reset zoom
          imageScale.value = withSpring(1);
          imageTranslateX.value = withSpring(0);
          imageTranslateY.value = withSpring(0);
          savedScale.value = 1;
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
        } else {
          // Zoom in to 2x
          imageScale.value = withSpring(2);
          savedScale.value = 2;
        }
      }), [imageScale, imageTranslateX, imageTranslateY, savedScale, savedTranslateX, savedTranslateY]
  );

  // Compose all gestures - prioritize zoom gestures, then swipe
  const composedGesture = useMemo(() => 
    Gesture.Simultaneous(
      pinchGesture,
      panGesture,
      doubleTapGesture,
      swipeGesture
    ), [pinchGesture, panGesture, doubleTapGesture, swipeGesture]
  );

  // Function to go to next image in fullscreen view
  const goToNextImage = useCallback(() => {
    if ((viewingImageSet?.length || 0) > 1 && viewingImageIndex < (viewingImageSet?.length || 0) - 1) {
      handleSwipeComplete('left');
    }
  }, [viewingImageSet, viewingImageIndex, handleSwipeComplete]);

  // Story handlers
  const handleStoryMediaCaptured = useCallback(async (uri: string, type: 'photo' | 'video') => {
    log('[Community] 📸 Story media captured:', type, uri);
    
    // Verify file exists and check size BEFORE opening editor
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'Media file not found. Please try again.');
        return;
      }
      
      const fileSizeMB = fileInfo.size ? fileInfo.size / (1024 * 1024) : 0;
      log('[Community] 📏 Media file verified, size:', fileSizeMB.toFixed(2), 'MB');
      
      // Check file size limits BEFORE starting upload
      const maxPhotoSize = 5 * 1024 * 1024; // 5MB
      const maxVideoSize = 50 * 1024 * 1024; // 50MB
      
      if (type === 'photo' && fileInfo.size && fileInfo.size > maxPhotoSize) {
        Alert.alert(
          'File Too Large',
          `Your photo is ${fileSizeMB.toFixed(1)}MB, which is too large.\n\nPlease use a smaller image (max 5MB).`,
          [{ text: 'OK' }]
        );
        return;
      }
      
      if (type === 'video' && fileInfo.size && fileInfo.size > maxVideoSize) {
        Alert.alert(
          'File Too Large',
          `Your video is ${fileSizeMB.toFixed(1)}MB, which is too large.\n\nPlease record a shorter video or use a smaller file (max 50MB).`,
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Reset upload state
      setStoryUploadState({
        isUploading: true,
        progress: 0,
        uploadResult: null,
        error: null,
      });
      
      // Set media first
      setCapturedStoryMedia({ uri, type });
      
      // StoryCamera now closes itself on iOS before calling this callback
      // So we just need to wait a bit and then open the editor
      if (Platform.OS === 'ios') {
        // Camera modal is already closed by StoryCamera component
        // Detect smaller devices for longer delays
        const { height } = Dimensions.get('window');
        const isSmallDevice = height < 700;
        const isTinyDevice = height < 650;
        const delay = isTinyDevice ? 400 : isSmallDevice ? 300 : 200;
        
        // Use InteractionManager to ensure modal is fully closed before opening next one
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            setCameraModalClosed(true);
            setShowStoryEditor(true);
          }, delay);
        });
      } else {
        // On Android, close camera and open editor immediately
        setShowStoryCamera(false);
        setCameraModalClosed(true);
        setShowStoryEditor(true);
      }
      
      // Start upload immediately in background (Instagram-style)
      log('[Community] 🚀 Starting background upload...');
      uploadStoryMediaInBackground(uri, type);
      
    } catch (error) {
      error('[Community] ❌ Error verifying media file:', error);
      Alert.alert('Error', 'Failed to process media. Please try again.');
      setStoryUploadState({
        isUploading: false,
        progress: 0,
        uploadResult: null,
        error: 'Failed to process media',
      });
    }
  }, []);
  
  // Instagram-style background upload function
  const uploadStoryMediaInBackground = useCallback(async (uri: string, type: 'photo' | 'video') => {
    let progressInterval: NodeJS.Timeout | null = null;
    
    try {
      log('[Community] 📤 Background upload started');
      
      // Simulate progress for better UX (Instagram-style)
      progressInterval = setInterval(() => {
        setStoryUploadState(prev => ({
          ...prev,
          progress: Math.min(prev.progress + Math.random() * 10, 90), // Cap at 90% until real upload completes
        }));
      }, 200);
      
      // Perform actual upload with timeout
      const uploadPromise = uploadStoryMedia(uri, type);
      uploadPromiseRef.current = uploadPromise; // Store promise for waiting
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Upload timed out after 2 minutes')), 120000)
      );
      
      const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
      
      // Clear progress interval
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      
      uploadPromiseRef.current = null; // Clear promise ref
      
      if (!uploadResult) {
        throw new Error('Upload failed - no result returned');
      }
      
      log('[Community] ✅ Background upload completed:', uploadResult.mediaUrl);
      
      // Update state with success
      setStoryUploadState({
        isUploading: false,
        progress: 100,
        uploadResult,
        error: null,
      });
      
    } catch (error: any) {
      error('[Community] ❌ Background upload failed:', error);
      
      // Clear progress interval
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      
      uploadPromiseRef.current = null; // Clear promise ref
      
      // Update state with error
      setStoryUploadState(prev => ({
        ...prev,
        isUploading: false,
        progress: 0,
        error: error?.message || 'Upload failed. Please try again.',
      }));
    }
  }, []);

  const handleTextStoryPublish = useCallback(async (
    text: string,
    templateId: string,
    isPublic: boolean,
    fontSize: number,
    textAlign: 'left' | 'center' | 'right',
    music?: StoryMusicPayload | null
  ) => {
    try {
      log('[Community] Publishing text story...');
      setLoading(true);

      let audioPayload: { url: string; title?: string | null; artist?: string | null } | null = null;
      if (music?.type === 'library' && music.track.url) {
        audioPayload = { url: music.track.url, title: music.track.title, artist: music.track.artist };
      }

      // Show uploading toast immediately
      Toast.show({
        type: 'info',
        text1: '✨ Creating text story...',
        text2: 'Generating your design',
        position: 'top',
        visibilityTime: 60000,
        autoHide: false,
      });

      const svgUri = await generateTextStoryImage(
        text,
        templateId,
        fontSize,
        textAlign,
        'classic' // Plain text only - style picker removed
      );

      // Upload as photo
      const uploadResult = await uploadStoryMedia(svgUri, 'photo');
      if (!uploadResult) {
        throw new Error('Failed to upload text story');
      }

      // Create story in database (with optional audio)
      const story = await createStory(
        uploadResult.mediaUrl,
        'photo',
        text, // Use text as caption
        isPublic,
        undefined, // No Mux asset for images
        audioPayload,
        undefined // No metadata for plain text stories
      );

      if (!story) {
        throw new Error('Failed to create text story');
      }

      setShowStoryTextEditor(false);
      setLoading(false);

      Toast.hide();
      const privacyText = isPublic ? 'everyone' : 'your followers';
      Toast.show({
        type: 'success',
        text1: '✨ Text story shared!',
        text2: `Visible to ${privacyText} for 24 hours`,
        position: 'top',
        visibilityTime: 3000,
      });
    } catch (error: any) {
      error('[Community] Error publishing text story:', error);
      setLoading(false);

      Toast.hide();
      Toast.show({
        type: 'error',
        text1: 'Upload Failed',
        text2: error.message || 'Please try again',
        position: 'top',
        visibilityTime: 4000,
      });
    }
  }, [user?.id]);

  const handleStoryPublish = useCallback(async (mediaUri: string, mediaType: 'photo' | 'video', caption?: string, isPublic: boolean = true, music?: StoryMusicPayload | null) => {
    log('[Community] 📝 handleStoryPublish called (Instagram-style - background publish)');
    
    // Close modal immediately (already closed by StoryEditor, but ensure it's closed)
    setShowStoryEditor(false);
    // DON'T clear capturedStoryMedia here - keep it for retry if upload fails
    
    // Show publishing toast immediately
    Toast.show({
      type: 'info',
      text1: '📤 Publishing story...',
      text2: 'This may take a moment',
      position: 'top',
      visibilityTime: 60000, // Stay visible during publish
      autoHide: false,
    });
    
    try {
      // Check if upload is still in progress - wait for it
      if (storyUploadState.isUploading && uploadPromiseRef.current) {
        log('[Community] ⏳ Upload still in progress, waiting...');
        
        // Update toast to show we're waiting for upload
        Toast.show({
          type: 'info',
          text1: '📤 Uploading...',
          text2: 'Please wait while we finish uploading',
          position: 'top',
          visibilityTime: 60000,
          autoHide: false,
        });
        
        // Wait for the upload promise to complete
        try {
          await uploadPromiseRef.current;
          log('[Community] ✅ Upload completed, proceeding with publish');
        } catch (uploadError) {
          // Upload failed, will be handled below
          error('[Community] ❌ Upload failed:', uploadError);
        }
      }
      
      // Check if upload failed
      if (storyUploadState.error) {
        Toast.hide();
        Alert.alert(
          'Upload Failed',
          storyUploadState.error + '\n\nWould you like to retry?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => {
              // Reset state when user cancels
              setStoryUploadState({
                isUploading: false,
                progress: 0,
                uploadResult: null,
                error: null,
              });
              setCapturedStoryMedia(null);
            }},
            { 
              text: 'Retry', 
              onPress: () => {
                // Retry upload - media is still preserved in capturedStoryMedia
                if (capturedStoryMedia) {
                  log('[Community] 🔄 Retrying story upload...');
                  setStoryUploadState({
                    isUploading: true,
                    progress: 0,
                    uploadResult: null,
                    error: null,
                  });
                  uploadStoryMediaInBackground(capturedStoryMedia.uri, capturedStoryMedia.type);
                } else {
                  Alert.alert('Error', 'Media not found. Please capture again.');
                }
              }
            }
          ]
        );
        return;
      }
      
      // Use already-uploaded media (Instagram-style)
      const uploadResult = storyUploadState.uploadResult;
      
      if (!uploadResult || !uploadResult.mediaUrl) {
        Toast.hide();
        error('[Community] Upload result is missing mediaUrl:', uploadResult);
        Alert.alert(
          'Upload Not Ready',
          uploadResult 
            ? 'The upload is missing the media URL. Please try uploading again.'
            : 'The upload is still processing. Please wait a moment and try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      log('[Community] 💾 Creating story in database with uploaded media:', uploadResult.mediaUrl);
      
      // Update toast
      Toast.show({
        type: 'info',
        text1: '💾 Creating story...',
        text2: 'Almost done!',
        position: 'top',
        visibilityTime: 60000,
        autoHide: false,
      });
      
      // Create story in database (upload already done); optional music for photo/video stories
      let audioPayload: { url: string; title?: string | null; artist?: string | null } | null = null;
      if (music?.type === 'library' && music.track?.url) {
        audioPayload = { url: music.track.url, title: music.track.title, artist: music.track.artist };
      }
      const story = await createStory(
        uploadResult.mediaUrl, 
        mediaType, 
        caption, 
        isPublic,
        uploadResult.muxAssetId, // Pass Mux asset ID for videos
        audioPayload
      );
      
      if (!story) {
        Toast.hide();
        Alert.alert('Error', 'Failed to create story in database. Please try again.');
        return;
      }

      log('[Community] ✅ Story published successfully');
      
      // Hide publishing toast
      Toast.hide();
      
      // Reset upload state and clear captured media (only on success)
      setStoryUploadState({
        isUploading: false,
        progress: 0,
        uploadResult: null,
        error: null,
      });
      setCapturedStoryMedia(null); // Clear media only after successful publish
      
      // Show success alert
      const privacyText = isPublic ? 'everyone' : 'your followers';
      Alert.alert(
        '✨ Story Shared!',
        `Your story is now visible to ${privacyText} for 24 hours.`,
        [{ text: 'OK' }]
      );

      // TODO: Refresh stories
    } catch (error: any) {
      error('[Community] ❌ Error publishing story:', error);
      
      // Hide toast
      Toast.hide();
      
      const errorMessage = error?.message || 'An unexpected error occurred';
      
      // Show error alert
      if (errorMessage.includes('Bucket not found')) {
        Alert.alert(
          'Setup Required',
          'Story storage is not set up yet. Please create the "story-photos" bucket in Supabase Dashboard > Storage.\n\nSee STORY_SETUP_GUIDE.md for detailed instructions.',
          [{ text: 'OK' }]
        );
      } else if (errorMessage.includes('too large')) {
        Alert.alert(
          'File Too Large',
          errorMessage.includes('Photo') 
            ? 'Your photo is too large. Please use a smaller image (max 5MB).'
            : `Your video is too large. Please record a shorter video (max ${STORY_VIDEO_MAX_SECONDS} seconds).`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', errorMessage);
      }
    }
  }, [storyUploadState, capturedStoryMedia, uploadStoryMediaInBackground]); // Remove loading dependency to prevent stale closures

  const handleStoryEditorClose = useCallback(() => {
    setShowStoryEditor(false);
    setCameraModalClosed(true);
    
    // Only clear media if upload is not in progress and there's no error (user intentionally closed)
    // If there's an error, keep the media for retry
    if (!storyUploadState.isUploading && !storyUploadState.error) {
      setCapturedStoryMedia(null);
    }
    
    // Reset upload state when closing editor (but keep media if there was an error)
    setStoryUploadState({
      isUploading: false,
      progress: 0,
      uploadResult: null,
      error: null,
    });
  }, [storyUploadState.isUploading, storyUploadState.error]);
  
  // Handle camera modal close
  const handleStoryCameraClose = useCallback(() => {
    setShowStoryCamera(false);
    setCameraModalClosed(true);
  }, []);

  // Function to go to previous image in fullscreen view
  const goToPrevImage = useCallback(() => {
    if ((viewingImageSet?.length || 0) > 1 && viewingImageIndex > 0) {
      handleSwipeComplete('right');
    }
  }, [viewingImageSet, viewingImageIndex, handleSwipeComplete]);

  // Memory management - removed cap to support growing app
  // React Native FlatList handles large lists efficiently with virtualization
  // No need to limit posts - users should see all available content
  // Note: FlatList only renders visible items, so memory usage stays low even with thousands of posts

  // Create a memoized callback for onViewableItemsChanged - optimized for performance
  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length === 0) return;
    
    const visibleIds = viewableItems.map(item => item.item.id);
    setVisibleItems(prev => {
      // Only update if the visible items actually changed
      if (JSON.stringify(prev.sort()) === JSON.stringify(visibleIds.sort())) {
        return prev;
      }
      return visibleIds;
    });
  }, []);

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (endMessageTimeoutRef.current) {
        clearTimeout(endMessageTimeoutRef.current);
      }
    };
  }, []);

  // Memoize footer component to prevent flickering on iOS
  // Show small spinner when there are more posts available
  const listFooterComponent = useMemo(() => {
    // Show small spinner when there are more posts available
    if (hasMorePosts && posts.length > 0) {
      return (
        <View style={styles.loadMoreContainer}>
          <ActivityIndicator size="small" color={themeColors.primary.main} />
          <View style={{ height: BOTTOM_INSET }} />
        </View>
      );
    }
    
    // Only show "end of feed" message if we have posts, reached the end, AND debounced flag is set
    // This prevents flickering on iOS by ensuring the message doesn't appear/disappear rapidly
    if (!hasMorePosts && posts.length > 0 && showEndMessage) {
      return (
        <>
          <View style={styles.endOfFeedContainer}>
            <Text style={[styles.endOfFeedText, { color: themeColors.textSecondary }]}>
              You're all caught up! 🎉
            </Text>
            <Text style={[styles.endOfFeedSubtext, { color: themeColors.textSecondary }]}>
              Check back later for new posts
            </Text>
          </View>
          <View style={{ height: BOTTOM_INSET }} />
        </>
      );
    }
    
    // Default: just show bottom inset for safe area
    return <View style={{ height: BOTTOM_INSET }} />;
  }, [loadingMore, loading, hasMorePosts, showEndMessage, posts.length, themeColors.primary.main, themeColors.textSecondary, loadMorePosts]);


          
          {/* Enhanced Tap Area for Hidden Header */}




   return (
    <Animated.View 
      style={[
        styles.safeContainer, 
        { 
          backgroundColor: themeColors?.neutral?.background || '#000',
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }]
        }
      ]}
    >
      {/* Header - Fixed at top, outside FlatList */}
      <Header 
        title="nomli"
        titleStyle={styles.appTitle}
        showSearch={true}
        showNotifications={true}
        onSearchPress={toggleSearchBar}
        onNotificationsPress={() => router.push('/notifications')}
        unreadNotificationCount={unreadNotificationCount}
      />
      
      {/* Search Bar with Animation - Gen Z Glassmorphism Style */}
      {showSearchBar && (
        <Animated.View 
          style={[
            styles.searchBarContainer,
            {
              opacity: searchBarOpacity,
              transform: [{ translateY: searchBarTranslateY }],
              zIndex: 1000, // Higher than dropdown to ensure it stays on top
              elevation: 10, // Android elevation
            }
          ]}
          pointerEvents="auto"
        >
          <View style={[
            styles.searchInputContainer,
            {
              // Apply shadow to parent View instead of LinearGradient
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.08,
              shadowRadius: 10,
              elevation: 10, // Increased to stay above dropdown
              borderRadius: 30, // Apply borderRadius here too
              overflow: 'hidden', // Ensure gradient respects border radius
              zIndex: 1001, // Higher than dropdown to ensure search input is accessible
            }
          ]}>
            <LinearGradient
              colors={isDarkMode 
                ? ['rgba(30, 41, 59, 0.85)', 'rgba(51, 65, 85, 0.75)']
                : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.85)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 30 }]}
            />
            <View style={styles.searchIconWrapper}>
              <Search size={18} color={themeColors.primary.main} strokeWidth={2.5} />
            </View>
            <TextInput
              style={[
                styles.searchInput, 
                themeStyles.text,
                { zIndex: 1002 }
              ]}
              placeholder="Search posts, users, or topics..."
              placeholderTextColor={themeColors.neutral.textSecondary}
              value={searchQuery}
              editable={true}
              onChangeText={(text) => {
                // Allow full manual typing - don't interfere with user input
                setSearchQuery(text);
                // Show search dropdown when typing or when empty (to show history)
                if (text.trim().length === 0 || text.trim().startsWith('#') || text.trim().length > 0) {
                  setShowSearchDropdown(true);
                  setShowHashtagDropdown(false); // Hide old hashtag dropdown
                } else {
                  setShowSearchDropdown(false);
                }
              }}
              onFocus={() => {
                // Show search dropdown when focused (shows history if empty, or results if typing)
                setShowSearchDropdown(true);
                setShowHashtagDropdown(false); // Hide old hashtag dropdown
              }}
              onBlur={() => {
                // Delay hiding dropdown to allow hashtag selection
                setTimeout(() => {
                  handleSearchBlur();
                }, 200);
              }}
              autoFocus={showSearchBar}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setShowSearchDropdown(true); // Show history when cleared
                  setShowHashtagDropdown(false);
                }}
                style={styles.clearSearchButton}
              >
                <X size={16} color={themeColors.neutral.subtext} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}
      
      {/* Search Dropdown - Shows history, users, and hashtags */}
      {showSearchBar && (
        <SearchDropdown
          visible={showSearchDropdown}
          searchQuery={searchQuery}
          onSelectHashtag={(hashtag) => {
            // Ensure hashtag has single # prefix
            const normalizedHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
            // Remove any double ##
            const cleanHashtag = normalizedHashtag.replace(/^##+/, '#');
            setSearchQuery(cleanHashtag);
            // Don't close dropdown immediately - let the search trigger first
            // The search will be triggered by the useEffect when searchQuery changes
            setTimeout(() => {
              setShowSearchDropdown(false);
            }, 100);
          }}
          onSelectUser={(userId) => {
            // Navigate to user profile
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/profile/${userId}`);
            setShowSearchDropdown(false);
            setSearchQuery('');
          }}
          onSelectHistory={(query) => {
            setSearchQuery(query);
            setShowSearchDropdown(false);
          }}
          onClose={() => setShowSearchDropdown(false)}
        />
      )}
      
      {/* Combined Feed - Posts and Videos */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        style={{ flex: 1 }}
      >
        <View style={[
          styles.combinedFeedContainer, 
          isTablet && styles.tabletContainer,
          { backgroundColor: isDarkMode ? '#000' : '#fff' } // Instagram-style background
        ]}>
          <>
            {/* New Posts Alert Card - Show whenever there are new posts */}
            {newPostsCount > 0 && (
              <View style={styles.newPostsAlertContainer}>
                <TouchableOpacity
                  style={[
                    styles.newPostsAlert,
                    {
                      backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                      borderColor: themeColors.primary.main,
                    }
                  ]}
                  onPress={async () => {
                    log('[Community] New posts alert clicked - adding pending posts');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // Add pending posts to the top of the feed
                    if (pendingNewPosts.length > 0) {
                      startTransition(() => {
                        setPosts(currentPosts => {
                          // Filter out duplicates and add pending posts at the top
                          const existingIds = new Set(currentPosts.map(p => p.id));
                          const newPostsToAdd = pendingNewPosts.filter(p => !existingIds.has(p.id));
                          if (newPostsToAdd.length > 0) {
                            return [...newPostsToAdd, ...currentPosts];
                          }
                          return currentPosts;
                        });
                      });
                    }
                    // Clear alert state
                    setNewPostsCount(0);
                    setPendingNewPosts([]);
                    setIsScrolledDown(false);
                    // Scroll to top
                    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                    // Also refresh to get any other new posts
                    await loadPosts(false, true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.newPostsAlertContent}>
                    <ChevronUp size={18} color={themeColors.primary.main} />
                    <Text style={[styles.newPostsAlertText, { color: themeColors.text }]}>
                      {newPostsCount === 1 
                        ? 'Show 1 post' 
                        : `Show ${newPostsCount} posts`}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
            
            {/* CRITICAL: Placeholders ensure getSortedPosts is NEVER empty on first render */}
            {/* Always render FlatList if we have placeholders OR posts (prevents white screen) */}
            {(getSortedPosts.length > 0 || placeholderPostsWithLikes.length > 0) ? (
              <FlatList
              ref={flatListRef}
              data={getSortedPosts}
              keyExtractor={(item: Post, index: number) => {
                // Safety check: ensure item exists and has id
                if (!item || !item.id) {
                  if (__DEV__) {
                    warn('[Community] FlatList keyExtractor received invalid item:', item, 'at index:', index);
                  }
                  return `post-invalid-${index}`;
                }
                return `post-${item.id}`;
              }}
              renderItem={renderPostItem}
              // Add background color to prevent dark/blank screens during fast scroll
              style={{ backgroundColor: isDarkMode ? '#000' : '#fff' }}
              onScrollToIndexFailed={(info) => {
                // Handle scroll failure gracefully
                warn('Failed to scroll to index:', info);
                const wait = new Promise(resolve => setTimeout(resolve, 500));
                wait.then(() => {
                  flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
                });
              }}
              ListHeaderComponent={listHeaderComponent}
              contentContainerStyle={[
                styles.listContent, 
                isTablet && { padding: Spacing.lg },
                { backgroundColor: isDarkMode ? '#000' : '#fff' } // Ensure content area has background
              ]}
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              // iOS-specific: Ensure content can be scrolled from top for pull-to-refresh
              contentInsetAdjustmentBehavior="automatic"
              automaticallyAdjustContentInsets={true}
              // Maintain scroll position when loading more posts (video-feed/Facebook style)
              // This prevents the list from jumping back to top when new content loads at bottom
              // CRITICAL: This must be enabled for both iOS and Android to prevent scroll jumps
              maintainVisibleContentPosition={{
                minIndexForVisible: 0,
                autoscrollToTopThreshold: 10, // Only auto-scroll if very close to top (within 10px)
              }}
              // Pull to refresh: custom only (no native spinner) – small spinner in list header
              onScrollBeginDrag={() => {
                pullDownY.current = 0;
              }}
              onScroll={(event) => {
                const currentScrollY = event.nativeEvent.contentOffset.y;
                scrollY.current = currentScrollY;
                if (currentScrollY < 0) {
                  pullDownY.current = Math.min(pullDownY.current, currentScrollY);
                }
                const wasScrolledDown = isScrolledDown;
                const nowScrolledDown = currentScrollY > SCROLL_THRESHOLD;
                
                // Track if user is actively scrolling
                isUserScrolling.current = true;
                // Reset after scroll ends (clear any existing timeout)
                if (scrollTimeoutRef.current) {
                  clearTimeout(scrollTimeoutRef.current);
                }
                scrollTimeoutRef.current = setTimeout(() => {
                  isUserScrolling.current = false;
                }, 200); // Increased timeout to ensure we don't interfere with user scrolling
                
                if (wasScrolledDown !== nowScrolledDown) {
                  setIsScrolledDown(nowScrolledDown);
                  // If user scrolls back to top, add pending posts and clear alert
                  if (!nowScrolledDown && newPostsCount > 0) {
                    log('[Community] User scrolled to top - adding pending posts');
                    // Add pending posts
                    if (pendingNewPosts.length > 0) {
                      startTransition(() => {
                        setPosts(currentPosts => {
                          const existingIds = new Set(currentPosts.map(p => p.id));
                          const newPostsToAdd = pendingNewPosts.filter(p => !existingIds.has(p.id));
                          if (newPostsToAdd.length > 0) {
                            return [...newPostsToAdd, ...currentPosts];
                          }
                          return currentPosts;
                        });
                      });
                    }
                    // Clear alert state
                    setNewPostsCount(0);
                    setPendingNewPosts([]);
                  }
                }
              }}
              onScrollEndDrag={() => {
                if (pullDownY.current < -50 && !refreshing) {
                  handleRefresh();
                }
                pullDownY.current = 0;
              }}
              // Track content size changes to maintain scroll position (video-feed/Facebook style)
              onContentSizeChange={(contentWidth, contentHeight) => {
                // When appending posts at bottom, maintain scroll position
                if (isAppendingPosts.current && contentHeightBeforeLoad.current > 0 && !isUserScrolling.current) {
                  const heightDifference = contentHeight - contentHeightBeforeLoad.current;
                  if (heightDifference > 0 && scrollPositionBeforeLoad.current > 0) {
                    // New content was added at bottom - scroll position should stay the same
                    // But React Native might reset it, so we restore it
                    requestAnimationFrame(() => {
                      if (flatListRef.current && scrollPositionBeforeLoad.current > 0) {
                        // Restore scroll position to prevent jump
                        flatListRef.current.scrollToOffset({
                          offset: scrollPositionBeforeLoad.current,
                          animated: false,
                        });
                        log('[Community] Restored scroll position after content load:', scrollPositionBeforeLoad.current);
                      }
                    });
                  }
                }
                contentHeightBeforeLoad.current = contentHeight;
                // Reset flag after handling
                if (isAppendingPosts.current) {
                  setTimeout(() => {
                    isAppendingPosts.current = false;
                  }, 100);
                }
              }}
              scrollEventThrottle={16} // Increased responsiveness for smoother scroll tracking
              decelerationRate="normal" // Natural deceleration
              bounces={Platform.OS === 'ios'} // Enable bounce effect - REQUIRED for iOS pull-to-refresh
              overScrollMode="always" // Allow pull-down so custom pull-to-refresh works on Android
              // Performance: slightly larger window = fewer mount/unmount storms = smoother video playback
              maxToRenderPerBatch={6}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              initialNumToRender={Platform.OS === 'ios' ? 10 : 8}
              updateCellsBatchingPeriod={80}
              legacyImplementation={false} // Use new FlatList implementation
              onEndReachedThreshold={0.3} // Lower threshold for earlier loading (was 0.5)
              onEndReached={({ distanceFromEnd }) => {
                // Always allow loading more posts - remove momentum guard for reliability
                if (distanceFromEnd < 0) {
                  return; // Don't load if scrolling up
                }
                
                // CONTINUOUS LOOP: First load ready posts from buffer, then auto-fetch when buffer low
                // Check if we have more posts ready in the full sorted list
                const currentDisplayed = displayedPostsCount;
                const totalPostsAvailable = posts.length + (videos?.length || 0);
                const bufferRemaining = totalPostsAvailable - currentDisplayed;
                
                // If we have ready posts in buffer, show them first (no scroll reset, no API call)
                if (bufferRemaining > 0) {
                  const toShow = Math.min(READY_BUFFER_COUNT, bufferRemaining);
                  log(`[Community] 📊 Continuous loop: Loading ${toShow} ready posts from buffer (${bufferRemaining} available, prevents scroll reset)`);
                  // Increase displayed count to show ready posts (no API call, no scroll reset)
                  setDisplayedPostsCount(prev => prev + toShow);
                  
                  // If buffer is now low after showing these posts, auto-fetch next batch
                  // AGGRESSIVE: Prefetch when buffer < LOAD_BATCH_SIZE (40) to maintain continuous loop
                  // This ensures with 1k+ items, we always have content ready
                  const newBufferRemaining = bufferRemaining - toShow;
                  if (newBufferRemaining < LOAD_BATCH_SIZE && hasMorePosts && !loadingMore) {
                    log(`[Community] 🔄 CONTINUOUS LOOP: Buffer will be low (${newBufferRemaining} remaining), auto-fetching next batch immediately`);
                    // Auto-fetch next batch to maintain continuous loop (no delay for aggressive prefetching)
                    loadMorePosts().catch(err => {
                      warn('[Community] Auto-fetch failed (non-critical):', err);
                    });
                  }
                } else {
                  // Buffer exhausted, fetch more from API immediately
                  log(`[Community] 📊 Buffer exhausted, fetching more posts from API (continuous loop)`);
                  loadMorePosts();
                }
              }}
              onMomentumScrollBegin={() => {
                // Reset flag when user starts scrolling again
                onEndReachedCalledDuringMomentum.current = false;
                isUserScrolling.current = true;
              }}
              onScrollBeginDrag={() => {
                // Reset flag on manual scroll
                onEndReachedCalledDuringMomentum.current = false;
                isUserScrolling.current = true;
              }}
              onScrollEndDrag={() => {
                // Mark that user finished scrolling
                setTimeout(() => {
                  isUserScrolling.current = false;
                }, 100);
              }}
              onMomentumScrollEnd={() => {
                // Mark that momentum scroll ended
                setTimeout(() => {
                  isUserScrolling.current = false;
                }, 100);
              }}
              // Smooth scrolling properties
              // Using maintainVisibleContentPosition to prevent scroll jumps when content loads above viewport
              // Additional smooth scrolling optimizations
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              scrollIndicatorInsets={{ right: 1 }}
              // iOS-specific: Enable bounce for pull-to-refresh
              alwaysBounceVertical={Platform.OS === 'ios'}
              // Disable viewability tracking for maximum performance
              // onViewableItemsChanged={handleViewableItemsChanged}
              // viewabilityConfig={{
              //   minimumViewTime: 50,
              //   itemVisiblePercentThreshold: 50
              // }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  {isSearching ? (
                    <>
                      <Search size={48} color={themeColors.primary.main} style={{ marginBottom: Spacing.md, opacity: 0.7 }} />
                      <Text style={[styles.emptyText, themeStyles.textSecondary]}>
                        Searching for "{searchQuery}"...
                      </Text>
                    </>
                  ) : searchQuery.trim() ? (
                    <>
                      <Search size={48} color={themeColors.neutral.textSecondary} style={{ marginBottom: Spacing.md }} />
                      <Text style={[styles.emptyTitle, themeStyles.text]}>No Results</Text>
                      <Text style={[styles.emptyText, themeStyles.textSecondary]}>
                        Nothing found for "{searchQuery}"
                      </Text>
                      <TouchableOpacity
                        style={[styles.emptyStateButton, { backgroundColor: themeColors.primary.main }]}
                        onPress={() => setSearchQuery('')}
                      >
                        <Text style={[styles.emptyStateButtonText, { color: themeColors.neutral.surface }]}>Clear</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Calendar size={48} color={themeColors.neutral.textSecondary} style={{ marginBottom: Spacing.md }} />
                      <Text style={[styles.emptyTitle, themeStyles.text]}>No Posts Yet</Text>
                      <Text style={[styles.emptyText, themeStyles.textSecondary]}>
                        Be the first to share!
                      </Text>
                      <TouchableOpacity
                        style={[styles.emptyStateButton, { backgroundColor: themeColors.primary.main }]}
                        onPress={navigateToCreatePost}
                      >
                        <Text style={[styles.emptyStateButtonText, { color: themeColors.neutral.surface }]}>Create Post</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              }
              ListFooterComponent={listFooterComponent}
              // Additional performance optimizations - removed duplicates, optimized for lighter scroll
              disableVirtualization={false}
              showsVerticalScrollIndicator={false}
              scrollIndicatorInsets={{ right: 0 }}
              fadingEdgeLength={0}
              endFillColor="transparent"
              getItemLayout={undefined} // Let FlatList handle dynamic heights
            />
          ) : (
            // Fallback empty state (should never show due to placeholders)
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No posts yet. Be the first to share!
              </Text>
            </View>
          )}
        </>
        </View>
      </KeyboardAvoidingView>

      {/* Post Action Menu Modal */}
      <Modal
        visible={!!postMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setPostMenuVisible(null);
          setSelectedPost(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setPostMenuVisible(null);
            setSelectedPost(null);
          }}
        >
          <View style={[styles.modalContainer, themeStyles.card]}>
            {/* Header with close button */}
            <View style={styles.actionMenuHeader}>
              <Text style={[styles.actionMenuTitle, themeStyles.text]}>Post Options</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setPostMenuVisible(null);
                  setSelectedPost(null);
                }}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X size={20} color={themeColors.neutral.subtext} />
              </TouchableOpacity>
            </View>
            
            {/* Menu items */}
            <View style={styles.actionMenu}>
            {/* Debug: Log admin state - disabled to reduce console spam */}
              {/* Owner options */}
              {(() => {
                // Find post from postMenuVisible if selectedPost is not set
                // Check posts, videoPosts (derived), AND videos (separate state) arrays
                let currentPost: any = selectedPost;
                if (!currentPost && postMenuVisible) {
                  currentPost = posts.find(p => p.id === postMenuVisible) || 
                               videoPosts.find(p => p.id === postMenuVisible);
                  
                  // Also check videos state (has different structure: user.id instead of user_id)
                  if (!currentPost) {
                    const videoMatch = videos.find(v => v.id === postMenuVisible);
                    if (videoMatch) {
                      currentPost = {
                        ...videoMatch,
                        user_id: videoMatch.user?.id,
                        video_url: videoMatch.video_url,
                        isVideo: true,
                      };
                    }
                  }
                }
                
                // Get the owner user_id - handle both Post (user_id) and VideoPost (user.id) structures
                const postOwnerId = currentPost?.user_id || currentPost?.user?.id;
                
                if (!currentPost || postOwnerId !== user?.id) {
                  return null;
                }
                
                return (
                  <>
                    <TouchableOpacity
                      style={[styles.actionMenuItem, { borderBottomColor: themeColors.neutral.border }]}
                      onPress={() => {
                        setPostMenuVisible(null);
                        navigateToEditPost(currentPost);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.actionMenuIcon, { backgroundColor: themeColors.primary.light + '20' }]}>
                        <Pencil size={18} color={themeColors.primary.main} />
                      </View>
                      <Text style={[styles.actionMenuItemText, themeStyles.text]}>Edit Post</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.actionMenuItem, { borderBottomColor: themeColors.neutral.border }]}
                      onPress={() => {
                        setPostMenuVisible(null);
                        handleToggleComments(currentPost.id, currentPost.comments_disabled || false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.actionMenuIcon, { backgroundColor: themeColors.primary.light + '20' }]}>
                        {currentPost.comments_disabled ? (
                          <Unlock size={18} color={themeColors.primary.main} />
                        ) : (
                          <Lock size={18} color={themeColors.primary.main} />
                        )}
                      </View>
                      <Text style={[styles.actionMenuItemText, themeStyles.text]}>
                        {currentPost.comments_disabled ? 'Enable Comments' : 'Disable Comments'}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.actionMenuItem, styles.deleteMenuItem]}
                      onPress={() => {
                        setPostMenuVisible(null);
                        handleDeletePost(currentPost.id);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.actionMenuIcon, styles.deleteIcon]}>
                        <Trash2 size={18} color={themeColors.error.main} />
                      </View>
                      <Text style={[styles.actionMenuItemText, { color: themeColors.error.main }]}>
                        Delete {currentPost?.video_url || (currentPost as any)?.isVideo ? 'Video' : 'Post'}
                      </Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
              
              {/* Admin options - show for admins viewing other users' posts */}
              {(() => {
                // Find post from postMenuVisible if selectedPost is not set
                // Check posts, videoPosts (derived), AND videos (separate state) arrays
                let currentPost: any = selectedPost;
                if (!currentPost && postMenuVisible) {
                  currentPost = posts.find(p => p.id === postMenuVisible) || 
                               videoPosts.find(p => p.id === postMenuVisible);
                  
                  // Also check videos state (has different structure: user.id instead of user_id)
                  if (!currentPost) {
                    const videoMatch = videos.find(v => v.id === postMenuVisible);
                    if (videoMatch) {
                      // Convert to a format with user_id for consistency
                      currentPost = {
                        ...videoMatch,
                        user_id: videoMatch.user?.id,
                        video_url: videoMatch.video_url,
                        isVideo: true,
                      };
                    }
                  }
                }
                
                // Get the owner user_id - handle both Post (user_id) and VideoPost (user.id) structures
                const postOwnerId = currentPost?.user_id || currentPost?.user?.id;
                
                // Admin options removed - no in-app admin
                return null;
              })()}
              
              {/* Report option for non-owners */}
              {(() => {
                // Find post from postMenuVisible - check all sources
                let currentPost: any = selectedPost;
                if (!currentPost && postMenuVisible) {
                  currentPost = posts.find(p => p.id === postMenuVisible) || 
                               videoPosts.find(p => p.id === postMenuVisible);
                  
                  // Also check videos state (has different structure: user.id instead of user_id)
                  if (!currentPost) {
                    const videoMatch = videos.find(v => v.id === postMenuVisible);
                    if (videoMatch) {
                      currentPost = {
                        ...videoMatch,
                        user_id: videoMatch.user?.id,
                        video_url: videoMatch.video_url,
                        isVideo: true,
                      };
                    }
                  }
                }
                
                // Get the owner user_id - handle both Post (user_id) and VideoPost (user.id) structures
                const postOwnerId = currentPost?.user_id || currentPost?.user?.id;
                
                // Show report option only for posts that are NOT owned by current user
                if (!currentPost || postOwnerId === user?.id) {
                  return null;
                }
                
                const isVideo = !!(currentPost?.video_url || currentPost?.isVideo);
                
                return (
                  <TouchableOpacity
                    style={[styles.actionMenuItem, { borderBottomColor: themeColors.neutral.border }]}
                    onPress={() => {
                      setPostMenuVisible(null);
                      Alert.alert(
                        isVideo ? 'Report Video' : 'Report Post',
                        `Are you sure you want to report this ${isVideo ? 'video' : 'post'} for review?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Report',
                            onPress: () => {
                              Toast.show({
                                type: 'success',
                                text1: 'Report Submitted',
                                text2: `We will review this ${isVideo ? 'video' : 'post'} shortly`,
                                visibilityTime: 2000,
                              });
                            },
                          },
                        ]
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.actionMenuIcon, { backgroundColor: themeColors.warning.light + '20' }]}>
                      <Flag size={18} color={themeColors.warning.main} />
                    </View>
                    <Text style={[styles.actionMenuItemText, themeStyles.text]}>
                      Report {isVideo ? 'Video' : 'Post'}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Comment Action Menu Modal */}
      <Modal
        visible={!!commentMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCommentMenuVisible(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCommentMenuVisible(null)}
        >
          <View style={[styles.modalContainer, themeStyles.card]}>
            {/* Header with close button */}
            <View style={styles.actionMenuHeader}>
              <Text style={[styles.actionMenuTitle, themeStyles.text]}>Comment Options</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setCommentMenuVisible(null)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X size={20} color={themeColors.neutral.subtext} />
              </TouchableOpacity>
            </View>
            
            {/* Menu items */}
            <View style={styles.actionMenu}>
              {/* Owner options */}
              {selectedComment?.user_id === user?.id && (
                <TouchableOpacity
                  style={[styles.actionMenuItem, styles.deleteMenuItem]}
                  onPress={() => {
                    if (selectedComment) {
                      setCommentMenuVisible(null);
                      handleDeleteComment(selectedComment.id, selectedComment.post_id);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionMenuIcon, styles.deleteIcon]}>
                    <Trash2 size={18} color={themeColors.error.main} />
                  </View>
                  <Text style={[styles.actionMenuItemText, { color: themeColors.error.main }]}>Delete Comment</Text>
                </TouchableOpacity>
              )}
              
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      
      {/* Likes Modal */}
      {showLikesModal && (() => {
        const post = posts.find(p => p.id === showLikesModal) || videoPosts.find(p => p.id === showLikesModal);
        return (
          <PostReactionsList
            visible={!!showLikesModal}
            onClose={() => setShowLikesModal(null)}
            postId={showLikesModal}
            postOwnerId={post?.user_id}
          />
        );
      })()}
      
      {/* Privacy Modal */}
      <LikesPrivacyModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
      
      {/* Full-Screen Image Viewer Modal */}
      <Modal
        visible={!!viewingImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          resetImage();
          setViewingImage(null);
          setViewingImageSet([]);
        }}
      >
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity
            style={[styles.closeImageButton, { top: insets.top + 10 }]}
            onPress={closeImageViewer}
          >
            <X size={30} color="white" />
          </TouchableOpacity>
          
          {/* Zoom instructions */}
          <View style={styles.imageZoomInstructions}>
            <Text style={styles.imageZoomInstructionsText}>
              Pinch to zoom • Double-tap to zoom
            </Text>
          </View>
          
          {/* Dot indicators */}
          {(viewingImageSet?.length || 0) > 1 && (
            <View style={styles.dotIndicatorsContainer}>
              <View style={styles.dotIndicators}>
                {Array.from({ length: (viewingImageSet?.length || 0) }).map((_, index) => (
                  <View 
                    key={index} 
                    style={[
                      styles.dotIndicator, 
                      index === viewingImageIndex && styles.dotIndicatorActive
                    ]} 
                  />
                ))}
              </View>
            </View>
          )}
          
          {viewingImage && (
            <GestureHandlerRootView style={styles.imageViewerContainer}>
              <GestureDetector gesture={composedGesture}>
                <ReanimatedAnimated.View style={[styles.imageViewerContainer, animatedImageStyle]}>
                <Image
                  source={{ uri: viewingImage }}
                  style={styles.imageViewerImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  priority="high"
                  recyclingKey={`fullscreen_${viewingImage}`}
                  transition={200}
                />
                  
                  {/* Navigation arrows for tap */}
                  {(viewingImageSet?.length || 0) > 1 && (
                    <>
                      {/* Left tap area */}
                      {viewingImageIndex > 0 && (
                        <TouchableOpacity
                          style={styles.leftTapArea}
                          onPress={() => handleSwipeComplete('right')}
                          activeOpacity={0.3}
                        >
                          <View style={styles.tapIndicator}>
                            <ChevronLeft size={24} color="rgba(255,255,255,0.8)" />
                          </View>
                        </TouchableOpacity>
                      )}
                      
                      {/* Right tap area */}
                      {viewingImageIndex < (viewingImageSet?.length || 0) - 1 && (
                        <TouchableOpacity
                          style={styles.rightTapArea}
                          onPress={() => handleSwipeComplete('left')}
                          activeOpacity={0.3}
                        >
                          <View style={styles.tapIndicator}>
                            <ChevronRight size={24} color="rgba(255,255,255,0.8)" />
                          </View>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
              </ReanimatedAnimated.View>
            </GestureDetector>
        </GestureHandlerRootView>
          )}
        </View>
      </Modal>

      {/* Story Camera Modal - lazy loaded */}
      <Suspense fallback={null}>
        <StoryCamera
          visible={showStoryCamera}
          onClose={handleStoryCameraClose}
          onMediaCaptured={handleStoryMediaCaptured}
        />
      </Suspense>

      {/* Story Editor Modal - lazy loaded */}
      {capturedStoryMedia && cameraModalClosed && (
        <Suspense fallback={null}>
          <StoryEditor
            visible={showStoryEditor}
            onClose={handleStoryEditorClose}
            mediaUri={capturedStoryMedia.uri}
            mediaType={capturedStoryMedia.type}
            onPublish={handleStoryPublish}
            uploadProgress={storyUploadState.progress}
            isUploading={storyUploadState.isUploading}
            uploadError={storyUploadState.error}
          />
        </Suspense>
      )}

      {/* Story Text Editor Modal */}
      <StoryTextEditor
        visible={showStoryTextEditor}
        onClose={() => setShowStoryTextEditor(false)}
        onPublish={handleTextStoryPublish}
      />

      {/* Story Viewer Modal - lazy loaded */}
      {viewingStoryUserId && (
        <Suspense fallback={null}>
          <StoryViewer
            visible={showStoryViewer}
            onClose={() => {
              setShowStoryViewer(false);
              setViewingStoryUserId(null);
              setViewingStoryId(null);
              setAllUsersWithStories([]);
            }}
            userId={viewingStoryUserId}
            initialStoryId={viewingStoryId || undefined}
            allUsersWithStories={allUsersWithStories}
            onNextUser={(nextUserId) => {
            // Auto-advance to next user (story-style like WhatsApp)
            log('[Community] Auto-advancing to next user:', nextUserId, {
              currentUserId: viewingStoryUserId,
              allUsersCount: allUsersWithStories.length,
              allUserIds: allUsersWithStories.map(u => u.userId),
            });
            
            // CRITICAL: Don't reorder the list - this causes loops!
            // The StoryViewer uses the original order to find the next user sequentially
            // Reordering breaks the sequential advancement logic
            
            // Just update userId - this will trigger StoryViewer to reload stories for new user
            setViewingStoryUserId(nextUserId);
            setViewingStoryId(null); // Start from first story of next user
            
            // Ensure viewer stays open
            if (!showStoryViewer) {
              setShowStoryViewer(true);
            }
            
            // Note: StoryViewer will automatically reload when userId prop changes via useEffect
            // The StoryViewer maintains the original order and advances sequentially through it
          }}
          />
        </Suspense>
      )}

      {/* TikTok-style Video Comment Bottom Sheet: video stays full screen, comments overlay as sheet */}
      {!!commentSheetPostId && (() => {
        const sheetPost = getSortedPosts.find(p => p.id === commentSheetPostId);
        if (!sheetPost || sheetPost.comments_disabled || (sheetPost as any).isPlaceholder) return null;
        const sheetComments = postComments[sheetPost.id] || [];
        return (
          <Modal
            visible={true}
            transparent
            animationType="fade"
            onRequestClose={() => setCommentSheetPostId(null)}
          >
            <View style={{ flex: 1 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
                activeOpacity={1}
                onPress={() => setCommentSheetPostId(null)}
              />
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '88%',
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: themeColors.neutral.surface,
                  flexDirection: 'column',
                }}
                pointerEvents="box-none"
              >
                <KeyboardAvoidingView
                  style={{ flex: 1, minHeight: 0 }}
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 24 : 20}
                >
                  <View style={[styles.videoCommentsHeader, { borderTopColor: themeColors.neutral.border }]}>
                    <View style={[styles.videoCommentsDragIndicator, { backgroundColor: themeColors.neutral.subtext }]} />
                    <TouchableOpacity
                      style={styles.videoCommentsCloseButton}
                      onPress={() => setCommentSheetPostId(null)}
                      activeOpacity={0.7}
                    >
                      <ChevronDown size={24} color={themeColors.neutral.text} strokeWidth={2} />
                    </TouchableOpacity>
                    <Text style={[styles.videoCommentsTitle, { color: themeColors.neutral.text }]} numberOfLines={1}>
                      {sheetComments.length} {sheetComments.length === 1 ? 'comment' : 'comments'}
                    </Text>
                    <View style={{ width: 24 }} />
                  </View>
                  <View style={{ flex: 1, minHeight: 0 }}>
                    <ScrollView
                      ref={commentSheetScrollRef}
                      style={{ flex: 1 }}
                      contentContainerStyle={{ paddingBottom: Spacing.xl + Spacing.md }}
                      showsVerticalScrollIndicator
                      nestedScrollEnabled
                      bounces
                    >
                      {sheetComments.length === 0 ? (
                        <View style={styles.noCommentsContainer}>
                          <Text style={[styles.noCommentsText, themeStyles.textSecondary]}>
                            No comments yet. Be the first to comment!
                          </Text>
                        </View>
                      ) : (
                        organizeCommentsIntoThreads(sheetComments).map((comment: Comment) => {
                          const isMyComment = user?.id === comment.user_id;
                          return (
                            <View key={comment.id} style={styles.commentThread}>
                              <View style={styles.commentItem}>
                                <TouchableOpacity onPress={() => navigateToUserProfile(comment.user_id)} activeOpacity={0.7}>
                                  <SimpleAvatar
                                    avatarUrl={comment.user_avatar || (comment as any).profiles?.avatar_url}
                                    userId={comment.user_id}
                                    size={24}
                                    isDarkMode={isDarkMode}
                                    isVerified={(comment as any).profiles?.is_verified || false}
                                    fullName={(comment as any).profiles?.full_name}
                                    username={comment.username}
                                  />
                                </TouchableOpacity>
                                <View style={[styles.commentContent, { backgroundColor: 'transparent' }]}>
                                  <View style={styles.commentHeader}>
                                    <TouchableOpacity onPress={() => navigateToUserProfile(comment.user_id)} activeOpacity={0.7}>
                                      <Text style={[styles.commentUsername, { color: themeColors.primary.main }]} numberOfLines={1} ellipsizeMode="tail">
                                        {sanitizeUsernameForDisplay(comment.username || (comment as any).user_email?.split('@')[0] || 'User')}
                                      </Text>
                                    </TouchableOpacity>
                                    <Text style={[styles.commentTime, themeStyles.textSecondary]}>
                                      {formatTimeAgo(comment.created_at)}
                                    </Text>
                                    {isMyComment && (
                                      <TouchableOpacity
                                        style={styles.commentActionIcon}
                                        onPress={() => setCommentMenuVisible(comment.id)}
                                        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                                      >
                                        <MoreVertical size={16} color={themeColors.neutral.subtext} />
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                  <Text style={[styles.commentText, themeStyles.text]}>{comment.content}</Text>
                                  {user && (
                                    (user.id === sheetPost.user_id || user.id === comment.user_id || (!(sheetPost as any).visibility || (sheetPost as any).visibility === 'public')) && (
                                      <View style={styles.commentActions}>
                                        <TouchableOpacity
                                          style={styles.commentActionButton}
                                          onPress={() => setReplyingToComment(comment.id)}
                                        >
                                          <Text style={[styles.commentActionText, themeStyles.subtext]}>Reply</Text>
                                        </TouchableOpacity>
                                        <Text style={[styles.commentActionDivider, themeStyles.subtext]}>•</Text>
                                        <TouchableOpacity
                                          style={styles.commentActionButton}
                                          onPress={() => {
                                            if (user?.id) handleToggleCommentLike(sheetPost.id, comment.id, user.id);
                                            else Alert.alert('Sign In Required', 'Please sign in to like comments.', [
                                              { text: 'Cancel', style: 'cancel' },
                                              { text: 'Sign In', onPress: () => router.push('/auth/signin') },
                                            ]);
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <View style={styles.commentLikeContainer}>
                                            <Heart
                                              size={14}
                                              color={comment.liked ? '#10B981' : themeColors.neutral.subtext}
                                              fill={comment.liked ? '#10B981' : 'transparent'}
                                            />
                                            <Text style={[styles.commentLikeCount, { color: comment.liked ? '#10B981' : themeColors.neutral.subtext }]}>
                                              {comment.likes_count || 0}
                                            </Text>
                                          </View>
                                        </TouchableOpacity>
                                      </View>
                                    )
                                  )}
                                </View>
                              </View>
                              {comment.replies && comment.replies.length > 0 && (
                                <View style={styles.threadControls}>
                                  <TouchableOpacity
                                    style={styles.threadToggleButton}
                                    onPress={() => toggleThreadExpansion(comment.id)}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  >
                                    <Text style={[styles.threadToggleText, { color: themeColors.primary.main }]}>
                                      {expandedThreads.has(comment.id) ? 'Hide' : 'View'} {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                                    </Text>
                                    {expandedThreads.has(comment.id) ? (
                                      <ChevronUp size={16} color={themeColors.primary.main} />
                                    ) : (
                                      <ChevronDown size={16} color={themeColors.primary.main} />
                                    )}
                                  </TouchableOpacity>
                                </View>
                              )}
                              {comment.replies && comment.replies.length > 0 && expandedThreads.has(comment.id) && (
                                <View style={styles.repliesContainer}>
                                  {(comment.replies || []).map((reply: Comment) => {
                                    const isMyReply = user?.id === reply.user_id;
                                    return (
                                      <View key={reply.id} style={styles.replyItem}>
                                        <TouchableOpacity onPress={() => navigateToUserProfile(reply.user_id)} activeOpacity={0.7}>
                                          <SimpleAvatar
                                            avatarUrl={reply.user_avatar || (reply as any).profiles?.avatar_url}
                                            userId={reply.user_id}
                                            size={20}
                                            isDarkMode={isDarkMode}
                                            isVerified={(reply as any).profiles?.is_verified || false}
                                            fullName={(reply as any).profiles?.full_name}
                                            username={reply.username}
                                          />
                                        </TouchableOpacity>
                                        <View style={styles.replyContent}>
                                          <View style={styles.commentHeader}>
                                            <TouchableOpacity onPress={() => navigateToUserProfile(reply.user_id)} activeOpacity={0.7}>
                                              <Text style={[styles.commentUsername, { color: themeColors.primary.main }]} numberOfLines={1}>
                                                {sanitizeUsernameForDisplay(reply.username || (reply as any).user_email?.split('@')[0] || 'User')}
                                              </Text>
                                            </TouchableOpacity>
                                            <Text style={[styles.commentTime, themeStyles.textSecondary]}>{formatTimeAgo(reply.created_at)}</Text>
                                            {isMyReply && (
                                              <TouchableOpacity style={styles.commentActionIcon} onPress={() => setCommentMenuVisible(reply.id)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                                                <MoreVertical size={16} color={themeColors.neutral.subtext} />
                                              </TouchableOpacity>
                                            )}
                                          </View>
                                          <Text style={[styles.commentText, themeStyles.text]}>{reply.content}</Text>
                                          {user && (
                                            <View style={styles.commentActions}>
                                              <TouchableOpacity style={styles.commentActionButton} onPress={() => setReplyingToComment(reply.id)}>
                                                <Text style={[styles.commentActionText, themeStyles.subtext]}>Reply</Text>
                                              </TouchableOpacity>
                                              <Text style={[styles.commentActionDivider, themeStyles.subtext]}>•</Text>
                                              <TouchableOpacity
                                                style={styles.commentActionButton}
                                                onPress={() => user?.id && handleToggleCommentLike(sheetPost.id, reply.id, user.id)}
                                                activeOpacity={0.7}
                                              >
                                                <View style={styles.commentLikeContainer}>
                                                  <Heart size={14} color={reply.liked ? '#10B981' : themeColors.neutral.subtext} fill={reply.liked ? '#10B981' : 'transparent'} />
                                                  <Text style={[styles.commentLikeCount, { color: reply.liked ? '#10B981' : themeColors.neutral.subtext }]}>{reply.likes_count || 0}</Text>
                                                </View>
                                              </TouchableOpacity>
                                              {isMyReply && (
                                                <>
                                                  <Text style={[styles.commentActionDivider, themeStyles.subtext]}>•</Text>
                                                  <TouchableOpacity
                                                    style={styles.commentActionButton}
                                                    onPress={() => Alert.alert('Delete Reply', 'Are you sure?', [
                                                      { text: 'Cancel', style: 'cancel' },
                                                      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteComment(reply.id, sheetPost.id) },
                                                    ])}
                                                    activeOpacity={0.7}
                                                  >
                                                    <Text style={[styles.commentActionText, { color: themeColors.error.main }]}>Delete</Text>
                                                  </TouchableOpacity>
                                                </>
                                              )}
                                            </View>
                                          )}
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                              {replyingToComment === comment.id && (
                                <View
                                  ref={sheetReplyInputRef}
                                  style={styles.replyInputContainer}
                                  onLayout={() => {
                                    const scrollNode = commentSheetScrollRef.current ? findNodeHandle(commentSheetScrollRef.current) : null;
                                    if (sheetReplyInputRef.current && scrollNode != null) {
                                      sheetReplyInputRef.current.measureLayout(
                                        scrollNode,
                                        (_x: number, y: number) => {
                                          commentSheetScrollRef.current?.scrollTo({
                                            y: Math.max(0, y - 120),
                                            animated: true,
                                          });
                                        },
                                        () => {}
                                      );
                                    }
                                  }}
                                >
                                  <TextInput
                                    style={[styles.replyInput, themeStyles.commentInput]}
                                    placeholder={`Reply to ${comment.username || 'User'}...`}
                                    placeholderTextColor={themeColors.neutral.textSecondary}
                                    value={replyTexts[comment.id] || ''}
                                    onChangeText={(text) => setReplyTexts(prev => ({ ...prev, [comment.id]: text }))}
                                    multiline
                                  />
                                  <View style={styles.replyInputActions}>
                                    <TouchableOpacity style={styles.replyCancelButton} onPress={() => { setReplyingToComment(null); setReplyTexts(prev => ({ ...prev, [comment.id]: '' })); }}>
                                      <Text style={[styles.replyCancelText, themeStyles.subtext]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[styles.replySendButton, { backgroundColor: themeColors.primary.main }, (!(replyTexts[comment.id] || '').trim()) && [styles.replySendButtonDisabled, { backgroundColor: themeColors.neutral.disabled }]]}
                                      onPress={() => handleReplyToComment(sheetPost.id, comment.id, replyTexts[comment.id] || '')}
                                      disabled={!(replyTexts[comment.id] || '').trim()}
                                    >
                                      <Send size={16} color={themeColors.neutral.surface} />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              )}
                              <View style={[styles.commentSeparatorLine, { backgroundColor: themeColors.neutral.border }]} />
                            </View>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                  <View style={[styles.videoCommentInputSection, { backgroundColor: themeColors.neutral.card, paddingBottom: Math.max(Spacing.md + 16, insets.bottom + 12) }]}>
                    {/* Text input first so it's never blocked by emoji row or keyboard */}
                    <View style={[styles.commentInputContainer, { backgroundColor: themeColors.neutral.surfaceVariant, borderRadius: BorderRadius.pill, marginBottom: Spacing.xs }]}>
                      <TextInput
                        style={[styles.commentInput, { color: themeColors.neutral.text, backgroundColor: 'transparent' }]}
                        placeholder="Add a comment..."
                        placeholderTextColor={themeColors.neutral.textSecondary}
                        value={commentTexts[sheetPost.id] || ''}
                        onChangeText={(text) => setCommentTexts(prev => ({ ...prev, [sheetPost.id]: text }))}
                      />
                      <TouchableOpacity
                        style={[
                          styles.commentSendButton,
                          { backgroundColor: themeColors.primary.main },
                          (!(commentTexts[sheetPost.id] || '').trim() || submittingComments.has(sheetPost.id)) && [styles.commentSendButtonDisabled, { backgroundColor: themeColors.neutral.disabled }],
                        ]}
                        onPress={() => handleCommentSubmit(sheetPost.id)}
                        disabled={!(commentTexts[sheetPost.id] || '').trim() || submittingComments.has(sheetPost.id)}
                      >
                        {submittingComments.has(sheetPost.id) ? (
                          <ActivityIndicator size="small" color={themeColors.neutral.surface} />
                        ) : (
                          <Send size={18} color={themeColors.neutral.surface} />
                        )}
                      </TouchableOpacity>
                    </View>
                    <View style={[styles.quickEmojiRow, { marginBottom: 0 }]}>
                      {['😂', '❤️', '🔥', '👏', '😍', '😮', '😢', '🙏'].map((emoji) => (
                        <TouchableOpacity
                          key={emoji}
                          style={styles.quickEmojiButton}
                          onPress={() => setCommentTexts(prev => ({ ...prev, [sheetPost.id]: (prev[sheetPost.id] || '') + emoji }))}
                        >
                          <Text style={styles.quickEmoji}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </KeyboardAvoidingView>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* Comments Disabled Modal - Gen Z Friendly */}
      <Modal
        visible={showCommentsDisabledModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => {
          Animated.parallel([
            Animated.spring(commentsDisabledScale, {
              toValue: 0,
              tension: 50,
              friction: 7,
              useNativeDriver: true,
            }),
            Animated.timing(commentsDisabledOpacity, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setShowCommentsDisabledModal(false);
          });
        }}
      >
        <TouchableOpacity
          style={styles.commentsDisabledOverlay}
          activeOpacity={1}
          onPress={() => {
            Animated.parallel([
              Animated.spring(commentsDisabledScale, {
                toValue: 0,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
              }),
              Animated.timing(commentsDisabledOpacity, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
              }),
            ]).start(() => {
              setShowCommentsDisabledModal(false);
            });
          }}
        >
          <Animated.View
            style={[
              styles.commentsDisabledContent,
              {
                opacity: commentsDisabledOpacity,
                transform: [{ scale: commentsDisabledScale }],
                // Apply shadow to parent View instead of LinearGradient
                ...Shadow.lg,
              },
            ]}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <LinearGradient
                colors={isDarkMode 
                  ? ['#667eea', '#764ba2', '#f093fb']
                  : ['#667eea', '#764ba2', '#f093fb']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.commentsDisabledGradient}
              >
                {/* Icon with glow effect */}
                <View style={styles.commentsDisabledIconContainer}>
                  <Animated.View
                    style={[
                      styles.commentsDisabledIconGlow,
                      {
                        backgroundColor: '#ffffff',
                        opacity: commentsDisabledOpacity.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 0.3],
                        }),
                      },
                    ]}
                  />
                  <View style={styles.commentsDisabledIconCircle}>
                    <Lock size={40} color="#ffffff" />
                  </View>
                </View>

                {/* Title */}
                <Text style={styles.commentsDisabledTitle}>
                  Comments Locked 🔒
                </Text>

                {/* Subtitle */}
                <Text style={styles.commentsDisabledSubtitle}>
                  This post's comments are disabled by the creator
                </Text>

                {/* Button */}
                <TouchableOpacity
                  style={styles.commentsDisabledButton}
                  onPress={() => {
                    Animated.parallel([
                      Animated.spring(commentsDisabledScale, {
                        toValue: 0,
                        tension: 50,
                        friction: 7,
                        useNativeDriver: true,
                      }),
                      Animated.timing(commentsDisabledOpacity, {
                        toValue: 0,
                        duration: 150,
                        useNativeDriver: true,
                      }),
                    ]).start(() => {
                      setShowCommentsDisabledModal(false);
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.commentsDisabledButtonText}>
                    Got it ✨
                  </Text>
                </TouchableOpacity>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Commenter Menu Modal - Follow/Reply */}
      <Modal
        visible={commenterMenuVisible !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCommenterMenuVisible(null)}
      >
        <TouchableOpacity
          style={styles.commenterMenuOverlay}
          activeOpacity={1}
          onPress={() => setCommenterMenuVisible(null)}
        >
          <View style={[styles.commenterMenuContainer, { backgroundColor: themeColors.neutral.surface }]}>
            {commenterMenuVisible && (
              <>
                <Text style={[styles.commenterMenuTitle, themeStyles.text]}>
                  @{commenterMenuVisible.username}
                </Text>
                
                <TouchableOpacity
                  style={[styles.commenterMenuButton, { borderBottomColor: themeColors.neutral.borderLight }]}
                  onPress={() => {
                    // Find the post ID for this comment
                    const postId = Object.keys(postComments).find(pId => 
                      postComments[pId]?.some(c => c.id === commenterMenuVisible.commentId)
                    ) || '';
                    if (postId) {
                      handleReplyToCommenter(commenterMenuVisible.commentId, postId);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <MessageSquare size={18} color={themeColors.primary.main} />
                  <Text style={[styles.commenterMenuButtonText, themeStyles.text]}>
                    Reply
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.commenterMenuButton}
                  onPress={() => handleFollowCommenter(commenterMenuVisible.userId)}
                  disabled={followLoading.has(commenterMenuVisible.userId)}
                  activeOpacity={0.7}
                >
                  {followLoading.has(commenterMenuVisible.userId) ? (
                    <ActivityIndicator size="small" color={themeColors.primary.main} />
                  ) : (
                    <Users size={18} color={followingUsers.has(commenterMenuVisible.userId) ? themeColors.error.main : themeColors.primary.main} />
                  )}
                  <Text style={[
                    styles.commenterMenuButtonText,
                    { color: followingUsers.has(commenterMenuVisible.userId) ? themeColors.error.main : themeColors.primary.main }
                  ]}>
                    {followingUsers.has(commenterMenuVisible.userId) ? 'Unfollow' : 'Follow'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.commenterMenuButton, styles.commenterMenuCancelButton, { borderTopColor: themeColors.neutral.borderLight }]}
                  onPress={() => setCommenterMenuVisible(null)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.commenterMenuCancelText, themeStyles.subtext]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Network Status Banner - Premium design with animations */}
      {showNetworkBanner && (
        <Animated.View
          style={[
            styles.networkBanner,
            {
              backgroundColor: isOnline ? themeColors.success?.main || '#10B981' : themeColors.error.main,
              opacity: networkBannerOpacity,
              transform: [{ translateY: networkBannerTranslateY }],
            }
          ]}
        >
          <LinearGradient
            colors={
              isOnline
                ? ['#10B981', '#059669', '#047857']
                : [themeColors.error.main, themeColors.error.dark || '#DC2626']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.networkBannerContent}>
            <View style={styles.networkBannerIconContainer}>
              {isOnline ? (
                <View style={styles.networkBannerIconCircle}>
                  <CheckCircle size={20} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2.5} />
                </View>
              ) : (
                <View style={styles.networkBannerIconCircle}>
                  <WifiOff size={20} color="#FFFFFF" strokeWidth={2.5} />
                </View>
              )}
            </View>
            <View style={styles.networkBannerTextContainer}>
              <Text style={styles.networkBannerText}>
                {isOnline ? 'Internet Connection Restored' : 'No Internet Connection'}
              </Text>
              <Text style={styles.networkBannerSubtext}>
                {isOnline
                  ? 'You\'re back online. Content will refresh automatically.'
                  : 'Showing cached content. New posts will appear when you\'re back online.'}
              </Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Slow Network Alert */}
      <SlowNetworkAlert
        visible={showSlowNetworkAlert}
        onDismiss={() => setShowSlowNetworkAlert(false)}
        onRefresh={() => handleRefreshAppRef.current()}
      />

      {/* Create Story Modal */}
      <Modal
        visible={showCreateStoryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCreateStoryModal(false)}
      >
        <TouchableOpacity
          style={styles.createStoryModalOverlay}
          activeOpacity={1}
          onPress={() => setShowCreateStoryModal(false)}
        >
          <TouchableOpacity
            style={[styles.createStoryModalContent, { backgroundColor: themeColors.cardBackground }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header with title and close button */}
            <View style={[styles.createStoryModalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.createStoryModalTitle, { color: themeColors.text }]}>
                Create Story
              </Text>
              <TouchableOpacity
                style={[styles.createStoryModalCloseButton, { backgroundColor: themeColors.neutral?.backgroundLight || 'rgba(0, 0, 0, 0.05)' }]}
                onPress={() => setShowCreateStoryModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <X size={18} color={themeColors.text} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Options */}
            <View style={styles.createStoryModalOptions}>
              <TouchableOpacity
                style={[styles.createStoryModalOption, { borderBottomColor: themeColors.border }]}
                onPress={() => {
                  setShowCreateStoryModal(false);
                  log('[Community] Opening camera for story');
                  setCameraModalClosed(true);
                  setShowStoryCamera(true);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.createStoryModalOptionContent}>
                  <View style={[styles.createStoryModalOptionIcon, { backgroundColor: themeColors.primary.main + '15' }]}>
                    <Camera size={22} color={themeColors.primary.main} strokeWidth={2} />
                  </View>
                  <Text style={[styles.createStoryModalOptionText, { color: themeColors.text }]}>
                    Take Photo/Video
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.createStoryModalOption, { borderBottomColor: themeColors.border }]}
                onPress={async () => {
                  setShowCreateStoryModal(false);
                  log('[Community] Opening library picker for story (no camera)');
                  // Let modal close before opening library picker
                  setTimeout(async () => {
                    const picked = await pickStoryMediaFromLibrary();
                    if (picked) {
                      handleStoryMediaCaptured(picked.uri, picked.type);
                    }
                  }, 350);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.createStoryModalOptionContent}>
                  <View style={[styles.createStoryModalOptionIcon, { backgroundColor: themeColors.primary.main + '15' }]}>
                    <ImageIcon size={22} color={themeColors.primary.main} strokeWidth={2} />
                  </View>
                  <Text style={[styles.createStoryModalOptionText, { color: themeColors.text }]}>
                    Choose from Library
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.createStoryModalOption, { borderBottomColor: themeColors.border }]}
                onPress={() => {
                  setShowCreateStoryModal(false);
                  log('[Community] Opening text story editor');
                  setShowStoryTextEditor(true);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.createStoryModalOptionContent}>
                  <View style={[styles.createStoryModalOptionIcon, { backgroundColor: themeColors.primary.main + '15' }]}>
                    <Type size={22} color={themeColors.primary.main} strokeWidth={2} />
                  </View>
                  <Text style={[styles.createStoryModalOptionText, { color: themeColors.text }]}>
                    Text Story
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.createStoryModalOption}
                onPress={() => {
                  setShowCreateStoryModal(false);
                  log('[Community] Opening live stream creation');
                  router.push('/live');
                }}
                activeOpacity={0.6}
              >
                <View style={styles.createStoryModalOptionContent}>
                  <View style={[styles.createStoryModalOptionIcon, { backgroundColor: themeColors.primary.main + '15' }]}>
                    <Video size={22} color={themeColors.primary.main} strokeWidth={2} />
                  </View>
                  <Text style={[styles.createStoryModalOptionText, { color: themeColors.text }]}>
                    Go Live
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    paddingTop: 0, // Header handles its own safe area padding
    paddingBottom: Platform.OS === 'ios' ? 34 : 16, // Bottom safe area padding
    width: '100%',
    alignItems: 'stretch',
  },
  refreshIndicatorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  combinedFeedContainer: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    // Background will be set by theme
  },
  tabletContainer: {
    maxWidth: 800, // Limit width on iPad for better readability
    alignSelf: 'center',
    width: '100%',
  },
  container: {
    flex: 1,
  },
  postContainer: {
    marginHorizontal: 0,
    marginBottom: 0,
    backgroundColor: 'transparent', // No solid card background; media + content have curves
    position: 'relative', // Needed for absolute positioned deletingOverlay
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.md,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  officialPostContainer: {
    // No yellow bar or tint; official posts use verified badge + subtle typography only
  },
  officialUsername: {
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  officialPostContent: {
    fontFamily: FontFamily.regular,
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  pinnedPostContainer: {
    borderTopWidth: 2,
    borderTopColor: '#3B82F6', // Blue border for pinned posts
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  pinnedText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  postHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    zIndex: 10,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userTextContainer: {
    marginLeft: 14,
    flex: 1,
  },
  userNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  userName: {
    fontSize: 13, // Slightly larger for better readability
    fontFamily: FontFamily.bold,
    letterSpacing: -0.1,
    fontWeight: '700', // Bolder for username distinction
  },
  businessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  businessBadgeText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
    fontWeight: '600',
  },
  postTime: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  locationText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  postContentContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  hashtagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  hashtagText: {
    fontSize: 11,
    fontStyle: 'italic',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  postContent: {
    fontSize: 16, // Larger for Gen Z readability
    fontFamily: FontFamily.regular,
    lineHeight: 24, // More breathing room
    letterSpacing: 0.2, // Slightly more spacing
    fontWeight: '500', // Slightly bolder for better visibility and contrast
  },
  emptyContent: {
    fontStyle: 'italic',
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 40, // Fixed height for consistent alignment
  },
  headerIconButton: {
    width: 24, // Further reduced from 28 to 24
    height: 24, // Further reduced from 28 to 24
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIconButton: {
    width: 28, // Slightly larger than other icons
    height: 28,
    borderRadius: 14, // Make it circular
    backgroundColor: 'rgba(220, 38, 38, 0.1)', // Light red background
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)', // Light red border
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    position: 'relative',
  },
  redDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dc2626',
    borderWidth: 1,
    borderColor: 'white',
  },



















  // Custom app title style - Sleek and stylish
  appTitle: {
    fontFamily: 'System',
    fontSize: 10, // Slightly increased for better readability
    fontWeight: '600', // Changed from '700' to '600' for sleeker look
    letterSpacing: 1.2, // Increased for elegant spacing
    textTransform: 'uppercase',
    opacity: 0.95, // Add subtle transparency for sleekness
  },

  searchBarContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm, // Reduced from Spacing.md
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xs, // Added small bottom margin
    borderRadius: 30, // Rounded curve for search bar
    overflow: 'hidden', // Ensure children respect border radius
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs, // Reduced from Spacing.sm
    borderRadius: 30, // Increased for more rounded curve
    borderWidth: 0,
    gap: Spacing.xs,
    maxWidth: '100%',
    minHeight: 40, // Reduced from 44
    // Removed shadows from LinearGradient - shadows should be on parent View instead
  },
  searchIconWrapper: {
    padding: 3, // Reduced from 4
    borderRadius: 12, // Increased for more rounded look
    backgroundColor: 'rgba(0, 128, 128, 0.1)',
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: FontFamily.regular,
    paddingHorizontal: 6,
    paddingVertical: 0,
    margin: 0,
    letterSpacing: 0.1,
    height: 28,
  },
  clearSearchButton: {
    padding: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginVertical: 6,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 4 : 3,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    height: 36,
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.md,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  filterButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterButtonActive: {
  },
  filterText: {
    fontFamily: FontFamily.medium,
    fontSize: 10,
  },
  filterTextActive: {
    fontFamily: FontFamily.semibold,
  },
  listContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 12 + BOTTOM_INSET,
  },
  newPostsAlertContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    pointerEvents: 'box-none', // Allow touches to pass through container
  },
  newPostsAlert: {
    borderBottomWidth: 2,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  newPostsAlertContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  newPostsAlertText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
  newPostsAlertSubtext: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    marginLeft: Spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    color: Colors.neutral.subtext,
    marginTop: Spacing.md,
  },
  loadingAnimationContainer: {
    flex: 1,
  },
  skeletonContainer: {
    padding: Spacing.md,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skeletonUserName: {
    width: 120,
    height: 14,
    borderRadius: 4,
    marginBottom: 4,
  },
  skeletonPostTime: {
    width: 80,
    height: 10,
    borderRadius: 4,
  },
  skeletonContentLine: {
    height: 10,
    width: '100%',
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 12,
  },
  skeletonAction: {
    width: 40,
    height: 16,
    borderRadius: 4,
    marginRight: 16,
  },
  // Placeholder "Liked by" text styles
  placeholderLikedBy: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flex: 1,
  },
  placeholderLikedByText: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyContainer: {
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  emptyStateButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.pill,
    marginTop: Spacing.md,
  },
  emptyStateButtonText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
  },
  postOwnerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postActionIcon: {
    padding: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    borderRadius: 16,
    width: '85%',
    maxWidth: 340,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  actionMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.border,
  },
  actionMenuTitle: {
    fontSize: 18,
    fontFamily: FontFamily.medium,
    fontWeight: '600',
  },
  actionMenu: {
    flexDirection: 'column',
    paddingVertical: 8,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.border,
  },
  actionMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  deleteIcon: {
    backgroundColor: Colors.error.light + '20',
  },
  actionMenuItemText: {
    fontSize: 16,
    fontFamily: FontFamily.medium,
    flex: 1,
  },
  deleteMenuItem: {
    borderBottomWidth: 0,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.neutral.background,
  },
  
  // Comments styles
  commentsSection: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    // Removed maxHeight to allow unlimited scrolling
  },
  commentsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  commentsLoadingText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.sm,
    marginLeft: Spacing.sm,
  },
  noComments: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  noCommentsText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  commentsContainer: {
    // Container for comments with dynamic height
  },
  commentsList: {
    paddingBottom: Spacing.xl, // Extra padding to prevent content from being cropped
    paddingTop: Spacing.xs, // Small top padding
  },
  commentsListScrollView: {
    maxHeight: Math.min(SCREEN_HEIGHT * 0.5, 400), // Max 50% of screen height or 400px, whichever is smaller
    paddingBottom: Spacing.sm, // Add padding to ScrollView itself to prevent cropping
  },
  commentSeparator: {
    height: 1,
    marginVertical: Spacing.md,
    marginHorizontal: 0,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg, // Increased horizontal padding
  },
  commentContent: {
    flex: 1,
    maxWidth: '85%', // Limit width to 85% of available space
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginLeft: Spacing.sm,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentUsername: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.xs, // Reduced from sm to xs for smaller username text
    marginRight: Spacing.xs,
  },
  commentTime: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.xs,
  },
  commentText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.sm,
    lineHeight: 18,
    marginBottom: Spacing.xs,
  },
  commentActionIcon: {
    padding: 4,
  },
  commentPinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginBottom: Spacing.xs,
    alignSelf: 'flex-start',
  },
  commentPinnedText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    marginTop: Spacing.xs,
  },
  replyIndicatorText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.xs,
    marginRight: Spacing.md,
  },
  replyChain: {
    marginBottom: Spacing.xs,
  },
  likeButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeCountText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.xs,
    marginLeft: Spacing.xs,
  },
  commentInputWrapper: {
    flexDirection: 'column',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg, // Increased from md to lg
    paddingBottom: Spacing.lg, // Increased bottom padding for safe area
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingTop: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  commentSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.md, // Add extra bottom padding
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  // Fullscreen comment panel: height = viewport minus PIP so input sits at bottom of screen (no scroll)
  videoCommentPanelContainer: {
    height: SCREEN_HEIGHT - (12 + 140), // 12 = pipTop, 140 = PIP_HEIGHT (match VideoPostItem)
    maxHeight: SCREEN_HEIGHT - (12 + 140),
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  videoCommentKeyboardView: {
    flex: 1,
    minHeight: 0,
    maxHeight: SCREEN_HEIGHT - (12 + 140),
  },
  videoCommentScrollArea: {
    flex: 1,
    minHeight: 0,
  },
  videoCommentListScrollView: {
    flex: 1,
    minHeight: 0,
  },
  videoCommentInputSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  videoCommentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingTop: 4,
    borderTopWidth: 0,
  },
  videoCommentsDragIndicator: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -15,
    width: 30,
    height: 4,
    borderRadius: 2,
  },
  videoCommentsCloseButton: {
    padding: 8,
  },
  videoCommentsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  commentInputSection: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  quickEmojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  quickEmojiButton: {
    padding: 4,
  },
  quickEmoji: {
    fontSize: 20,
  },
  commentLockedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  commentLockedText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  noCommentsContainer: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentInput: {
    flex: 1,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs,
    fontSize: FontSizes.md,
    minHeight: 44,
    textAlignVertical: 'center',
    marginRight: Spacing.xs,
  },
  commentSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    marginLeft: Spacing.xs,
  },
  commentSendButtonDisabled: {
    opacity: 0.6,
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.sm,
  },
  deletingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletingText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.body,
    marginTop: Spacing.sm,
  },
  imageViewerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.98)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  closeImageButton: {
    position: 'absolute',
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BorderRadius.pill,
    padding: Spacing.sm,
    zIndex: 2001,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  imageCarouselContainer: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  imageSlide: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerImage: {
    width: '100%',
    height: '100%',
  },
  imageZoomInstructions: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    zIndex: 2001,
  },
  imageZoomInstructionsText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: FontSizes.sm,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
  },
  leftTapArea: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '30%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
  },
  rightTapArea: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '30%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  tapIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 20,
    padding: 8,
  },

  imageContainer: {
    width: '100%', // Match parent width so content is centered
    marginBottom: 0,
    marginHorizontal: Spacing.md, // Add side space so rounded corners are visible
    position: 'relative',
    backgroundColor: 'transparent', // Transparent to show theme background
    overflow: 'hidden', // Ensure content doesn't overflow
    alignSelf: 'stretch', // Ensure it fills parent width
    // Reduced container sizes for more compact, modern look (aligned with Instagram 4:5 trend)
    // Default height while loading, then adjusts to image's natural aspect ratio
    minHeight: Dimensions.get('window').width * 0.5, // Reduced from 0.6 (50% width - closer to square/portrait)
    maxHeight: Dimensions.get('window').height * 0.4, // Reduced from 0.5 (40% screen height - more compact)
    // With 'contain' resizeMode, tall images will scale down to fit maxHeight while showing everything (no cropping)
    borderRadius: BorderRadius.xl,
  },
  postImageWrapper: {
    width: '100%',
    position: 'relative',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    minHeight: Dimensions.get('window').width * 0.5, // Reduced from 0.6
    maxHeight: Dimensions.get('window').height * 0.4, // Reduced from 0.5
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.xl,
  },
  blurredImageBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  blurredBackgroundImage: {
    width: '100%',
    height: '100%',
  },
  postImageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent', // Transparent so blurred background shows through
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    gap: Spacing.md,
  },
  viewCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 4,
  },
  viewCountText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  imageViewCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    zIndex: 10,
  },
  imageViewCountText: {
    color: '#FFFFFF',
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: 16,
    minHeight: 36,
    // Subtle background on press
  },
  actionText: {
    fontSize: FontSizes.sm + 1,
    fontFamily: FontFamily.semibold,
    marginLeft: Spacing.sm,
    letterSpacing: 0.2,
  },
  readMoreButton: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.caption,
  },
  dotIndicatorsContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  dotIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 25,
    ...Shadow.sm,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 2.5,
    transition: 'all 0.2s ease',
  },
  dotIndicatorActive: {
    width: 20,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'white',
    marginHorizontal: 2.5,
  },


  // Smooth swipeable carousel styles (replaces side-by-side layout)
  imageCarouselContainer: {
    width: '100%',
    // Reduced from square (1:1) to more compact 4:5 portrait ratio (aligned with 2025 trends)
    // This allows images to display with contain mode without taking up too much space
    aspectRatio: 4 / 5, // Portrait ratio like Instagram feed posts
    backgroundColor: '#000',
    position: 'relative',
  },
  imageCarousel: {
    width: '100%',
    height: '100%',
  },
  carouselImageWrapper: {
    width: Dimensions.get('window').width, // This is fine - it's in StyleSheet, not worklet
    height: '100%',
    position: 'relative',
    backgroundColor: 'transparent', // Transparent so blurred background shows through
  },
  carouselBlurredBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  carouselBlurredImage: {
    width: '100%',
    height: '100%',
  },
  carouselImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent', // Transparent so blurred background shows through
    position: 'relative',
    zIndex: 1,
  },
  pageIndicatorContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  pageIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  pageIndicatorActive: {
    width: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  multiPhotoIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  multiPhotoIndicatorText: {
    color: 'white',
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
  },
  postItemContainer: {
    marginBottom: Spacing.md,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingLeft: 8,
  },
  commentActionButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  commentActionText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
  },
  commentActionDivider: {
    fontSize: FontSizes.xs,
    marginHorizontal: 8,
  },
  // Threaded comment styles
  commentThread: {
    marginVertical: 4,
  },
  commentSeparatorLine: {
    height: 1,
    marginTop: 12,
    marginBottom: 8,
    marginHorizontal: 16,
    opacity: 0.3,
  },
  repliesContainer: {
    marginTop: 8,
    marginLeft: 20,
    paddingBottom: Spacing.xs, // Add bottom padding
  },
  replyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
    paddingLeft: 12,
    position: 'relative',
  },
  replyLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
  },
  replyContent: {
    marginLeft: 8,
    flex: 1,
    maxWidth: '85%', // Limit width to 85% of available space
    borderRadius: 12,
    padding: 8,
  },
  replyUsername: {
    fontSize: FontSizes.sm,
  },
  replyText: {
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  commentLikeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  commentLikeCount: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
    marginLeft: 4,
  },

  // Full screen video styles
  fullScreenContainer: {
    flex: 1,
    position: 'relative',
    maxHeight: Dimensions.get('window').height,
    overflow: 'hidden',
  },
  videoHeaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingBottom: 8,
    ...Shadow.md,
  },
  headerToggleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    ...Shadow.sm,
  },
  headerToggleText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  hiddenHeaderTapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  hiddenHeaderTouchArea: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoFeedContainer: {
    flex: 1,
    maxHeight: Dimensions.get('window').height,
    overflow: 'hidden',
  },
  tapHint: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    ...Shadow.md,
  },
  tapHintText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontFamily: FontFamily.medium,
    marginTop: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modernVideoHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingBottom: 8,
    ...Shadow.md,
  },
  videoTopNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    ...Shadow.sm,
  },
  backButtonInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTitleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTitle: {
    fontSize: FontSizes.subhead,
    fontFamily: FontFamily.semiBold,
    color: '#FFFFFF',
  },
  videoSubtitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  videoHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 40, // Fixed height for consistent alignment
  },
  headerActionButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernTabSwitcher: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  modernTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
  },
  modernTabButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  modernTabText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
    marginLeft: 4,
  },
  tabIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  tabIconContainerActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  enhancedHiddenHeaderTapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  enhancedTapHint: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    ...Shadow.md,
  },
  enhancedTapHintText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontFamily: FontFamily.medium,
    marginTop: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  tapHintIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    color: Colors.error.main,
    marginBottom: Spacing.md,
  },
  retryButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primary.main,
  },
  retryButtonText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.surface,
  },
  enhancedVideoFeedContainer: {
    flex: 1,
    maxHeight: Dimensions.get('window').height,
    overflow: 'hidden',
  },
  // Additional modern video header styles
  modernVideoHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingBottom: 8,
    ...Shadow.md,
  },
  videoTopNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    ...Shadow.sm,
  },
  backButtonInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTitleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTitle: {
    fontSize: FontSizes.subhead,
    fontFamily: FontFamily.semiBold,
    color: '#FFFFFF',
  },
  videoSubtitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  videoHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 40,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernTabSwitcher: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  modernTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
  },
  modernTabButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  modernTabText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
    marginLeft: 4,
  },
  tabIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  tabIconContainerActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  enhancedHiddenHeaderTapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  enhancedTapHint: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    ...Shadow.md,
  },
  enhancedTapHintText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontFamily: FontFamily.medium,
    marginTop: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  tapHintIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    color: Colors.error.main,
    marginBottom: Spacing.md,
  },
  retryButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primary.main,
  },
  retryButtonText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.surface,
  },
  loadMoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  endOfFeedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  endOfFeedText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  endOfFeedSubtext: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    opacity: 0.7,
  },

  // Threaded Comments Styles
  threadControls: {
    marginLeft: 28, // Align with comment content
    marginTop: 8,
    marginBottom: 8,
  },
  threadToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  threadToggleText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    marginRight: 4,
  },
  repliesContainer: {
    marginLeft: 28, // Indent replies
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
  },
  replyItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  replyContent: {
    flex: 1,
    maxWidth: '85%', // Limit width to 85% of available space
    marginLeft: 8,
    padding: 8,
    borderRadius: 12,
  },
  replyInputContainer: {
    marginLeft: 28,
    marginTop: 8,
    paddingHorizontal: 8,
  },
  replyInput: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    maxHeight: 80,
    textAlignVertical: 'top',
  },
  replyInputActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  replyCancelButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  replyCancelText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  replySendButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replySendButtonDisabled: {
    opacity: 0.5,
  },
  postSeparator: {
    height: 8, // Thicker separator like Instagram
    marginHorizontal: 0, // Edge-to-edge
    marginVertical: 0,
    // Background color will be set dynamically via theme
  },
  networkBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    overflow: 'hidden',
  },
  networkBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  networkBannerIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkBannerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  networkBannerTextContainer: {
    flex: 1,
  },
  networkBannerText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  networkBannerSubtext: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  commentsDisabledOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  commentsDisabledContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: BorderRadius.xl + 8,
    overflow: 'hidden',
    ...Shadow.lg,
  },
  commentsDisabledGradient: {
    padding: Spacing.xl + 8,
    alignItems: 'center',
  },
  commentsDisabledIconContainer: {
    position: 'relative',
    marginBottom: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsDisabledIconGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    top: -10,
    left: -10,
  },
  commentsDisabledIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  commentsDisabledTitle: {
    fontSize: FontSizes.xl + 4,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.xs,
    textAlign: 'center',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  commentsDisabledSubtitle: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
    paddingHorizontal: Spacing.sm,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  commentsDisabledButton: {
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl * 2,
    borderRadius: BorderRadius.pill,
    minWidth: 140,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    ...Shadow.md,
  },
  commentsDisabledButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md + 1,
    fontFamily: FontFamily.semiBold,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  createStoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createStoryModalContent: {
    width: '90%',
    maxWidth: 380,
    borderRadius: BorderRadius.xl,
    padding: 0,
    overflow: 'hidden',
    ...Shadow.xl,
  },
  createStoryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  createStoryModalTitle: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  createStoryModalCloseButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  createStoryModalOptions: {
    paddingVertical: Spacing.xs,
  },
  createStoryModalOption: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  createStoryModalOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  createStoryModalOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createStoryModalOptionText: {
    fontSize: FontSizes.md + 1,
    fontFamily: FontFamily.semibold,
    flex: 1,
    letterSpacing: -0.2,
  },
}); 