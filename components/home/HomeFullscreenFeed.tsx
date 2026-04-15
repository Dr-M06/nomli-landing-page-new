import React, {
  useCallback,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  ViewToken,
  Pressable,
  Alert,
  AppState,
  Platform,
  RefreshControl,
  useWindowDimensions,
  type AppStateStatus,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import {
  configurePlaybackAudioMode,
  reactivateVideoAudioAfterUnmute,
} from '../../utils/expoAvAudioMode';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Bookmark, MessageCircle, Zap, Volume2, VolumeX, Images, MoreVertical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { Post } from '../../utils/communityUtils';
import { stripAtSymbol } from '../../utils/contentFilter';
import { FontFamily } from '../../constants/Theme';
import { getThemeColors } from '../../constants/Colors';
import { followUser, unfollowUser, isFollowing } from '../../utils/followersServiceFixed';
import CommentsSheet from './CommentsSheet';
import StoryStyleTextPostCard from './StoryStyleTextPostCard';
import { PostMusicStrip, PostAudioAutoPlay } from '../PostMusicStrip';
import VideoLikesList from '../VideoLikesList';
import { PollPostCard } from '../PollPostCard';
import { QuestionPostCard } from '../QuestionPostCard';
import FeedPostCard from './FeedPostCard';
import PromoBanner from '../PromoBanner';
import { formatTimeAgo } from '../../utils/formatters';
import { isVerifiedEntity } from '../../utils/verification';
import { InlineVerifiedBadge } from '../InlineVerifiedBadge';
import { fetchPromoBanners, type PromoBanner as PromoBannerData } from '../../utils/promoBannerUtils';
import ReactionPicker, { type ReactionType } from '../ReactionPicker';

type HomeFeedRow = Post & {
  __isHomeAd?: boolean;
};

type Props = {
  posts: HomeFeedRow[];
  isDark: boolean;
  containerHeight: number;
  currentUserId?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  onLike?: (postId: string, isLiked: boolean) => void;
  onReact?: (postId: string, reaction: ReactionType) => void;
  onBookmark?: (postId: string, isBookmarked: boolean) => void;
  /** Called after a comment is successfully posted (increment feed badge). */
  onCommentPosted?: (postId: string) => void;
  onSeenPosts?: (postIds: string[]) => void;
  onOpenProfile?: (userId: string) => void;
  onEditPost?: (post: Post) => void;
  onDeletePost?: (postId: string) => void;
  onRetryUpload?: (post: Post) => void;
  /** Logged-in viewer: report post (parent shows confirm + send-user-report). */
  onReportPost?: (post: Post) => void;
  onFeedScrollStateChange?: (payload: { y: number; direction: 'up' | 'down' }) => void;
  /** When true (e.g. story viewer open), pause feed video/audio. */
  suppressBackgroundPlayback?: boolean;
  /** Age gate: extra blur on photo/video for under-16 (matches FeedPostCard). */
  viewerIsUnder16?: boolean;
};

export type HomeFullscreenFeedHandle = {
  /** Scroll paging feed to first post (tab re-tap / pop-to-root). */
  scrollToTop: () => void;
};

const BOTTOM_INFO_RESERVED = 118;
let lastHomeFeedOffsetY = 0;
let lastHomeFeedActiveIndex = 0;

/** Right-rail action chips: smaller icons + frosted pill (matches “premium” feed chrome). */
const ACTION_BUBBLE = 36;
const ACTION_ICON_LG = 21;
const ACTION_ICON_SM = 19;
const ACTION_STROKE = 1.75;

type ActionGlassBubbleProps = {
  children: React.ReactNode;
  variant?: 'default' | 'strong';
};

function ActionGlassBubble({ children, variant = 'default' }: ActionGlassBubbleProps) {
  const veil =
    variant === 'strong' ? 'rgba(6, 8, 16, 0.5)' : 'rgba(6, 8, 16, 0.38)';
  return (
    <View style={styles.actionGlassShadowWrap}>
      <View style={[styles.actionGlassInner, variant === 'strong' && styles.actionGlassInnerStrong]}>
        <>
          <BlurView
            intensity={32}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: veil }]} />
        </>
        <View style={styles.actionGlassIconSlot} pointerEvents="box-none">
          {children}
        </View>
      </View>
    </View>
  );
}

const HomeFullscreenFeed = forwardRef<HomeFullscreenFeedHandle, Props>(function HomeFullscreenFeed(
  {
    posts,
    isDark,
    containerHeight,
    currentUserId,
    refreshing,
    onRefresh,
    onEndReached,
    onLike,
    onReact,
    onBookmark,
    onCommentPosted,
    onSeenPosts,
    onOpenProfile,
    onEditPost,
    onDeletePost,
    onRetryUpload,
    onReportPost,
    onFeedScrollStateChange,
    suppressBackgroundPlayback = false,
    viewerIsUnder16 = false,
  }: Props,
  ref
) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const c = getThemeColors(isDark);

  const [activePostIndex, setActivePostIndex] = useState(() =>
    Math.max(0, Math.min(lastHomeFeedActiveIndex, Math.max(0, posts.length - 1)))
  );
  const [muted, setMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [followingByUserId, setFollowingByUserId] = useState<Record<string, boolean>>({});
  const [followLoadingByUserId, setFollowLoadingByUserId] = useState<Record<string, boolean>>({});
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [commentsPostOwnerId, setCommentsPostOwnerId] = useState<string | null>(null);
  const [likesPostId, setLikesPostId] = useState<string | null>(null);
  const [likesPostOwnerId, setLikesPostOwnerId] = useState<string | null>(null);
  const [likesCount, setLikesCount] = useState(0);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionPickerPosition, setReactionPickerPosition] = useState({ x: 0, y: 0 });
  const [reactionPostId, setReactionPostId] = useState<string | null>(null);
  const [imageIndexByPostId, setImageIndexByPostId] = useState<Record<string, number>>({});
  const [videoAspectByPostId, setVideoAspectByPostId] = useState<Record<string, number>>({});
  const [expandedTextByPostId, setExpandedTextByPostId] = useState<Record<string, boolean>>({});
  /** 18+ posts: viewer tapped to show media (not used for mandatory under-16 blur). */
  const [sensitiveRevealByPostId, setSensitiveRevealByPostId] = useState<Record<string, boolean>>({});
  const [promoBanners, setPromoBanners] = useState<PromoBannerData[]>([]);
  const [isHorizontalSwiping, setIsHorizontalSwiping] = useState(false);
  const horizontalSwipeResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreGuardRef = useRef(false);
  const listRef = useRef<FlatList<HomeFeedRow> | null>(null);
  const didRestoreScrollRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        lastHomeFeedOffsetY = 0;
        lastHomeFeedActiveIndex = 0;
        setActivePostIndex(0);
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    }),
    []
  );
  /** Ref to the currently playing cell's Video — used to apply unmute immediately (expo-av often ignores prop-only mute changes while playing). */
  const homeActiveVideoRef = useRef<Video | null>(null);
  const scrollYRef = useRef(0);
  const scrollDirectionRef = useRef<'up' | 'down'>('down');

  const isScreenFocused = useIsFocused();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAppState(next));
    return () => sub.remove();
  }, []);
  /** Pause when user switches tabs/screens, leaves the app, or a full-screen overlay (e.g. stories) is open. */
  const allowVideoPlayback =
    isScreenFocused && appState === 'active' && !suppressBackgroundPlayback;

  useEffect(() => {
    if (!suppressBackgroundPlayback) return;
    const v = homeActiveVideoRef.current;
    if (!v) return;
    void v.setStatusAsync({ shouldPlay: false }).catch(() => {});
  }, [suppressBackgroundPlayback]);

  const activePost = posts[activePostIndex];
  const activePostIsVideo = !!(activePost?.video_url);
  const activePostId = activePost?.id ?? null;

  // Keep controls visible by default on non-video posts so poll/Q&A/text
  // cards do not look like an empty black screen.
  useEffect(() => {
    setShowControls(!activePostIsVideo);
  }, [activePostId, activePostIsVideo]);

  /** After unmute or active clip change, re-run iOS-safe unmute (seek + play); props alone are unreliable. */
  useLayoutEffect(() => {
    if (muted || !allowVideoPlayback || !activePostIsVideo) return;
    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      void reactivateVideoAudioAfterUnmute(homeActiveVideoRef.current);
    };
    apply();
    const raf = requestAnimationFrame(() => {
      if (!cancelled) apply();
    });
    const t = setTimeout(() => {
      if (!cancelled) apply();
    }, 80);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [muted, allowVideoPlayback, activePostIsVideo, activePostId, activePostIndex]);

  const lockHorizontalSwipe = useCallback(() => {
    setIsHorizontalSwiping(true);
    if (horizontalSwipeResetRef.current) clearTimeout(horizontalSwipeResetRef.current);
    // Failsafe: unlock if RN misses touch-end/cancel in responder chain.
    horizontalSwipeResetRef.current = setTimeout(() => {
      setIsHorizontalSwiping(false);
      horizontalSwipeResetRef.current = null;
    }, 1200);
  }, []);

  const unlockHorizontalSwipe = useCallback(() => {
    if (horizontalSwipeResetRef.current) {
      clearTimeout(horizontalSwipeResetRef.current);
      horizontalSwipeResetRef.current = null;
    }
    setIsHorizontalSwiping(false);
  }, []);

  // Align session with app root (plays in silent mode, iOS interruption mode).
  useEffect(() => {
    let cancelled = false;
    void configurePlaybackAudioMode()
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (posts.length === 0) return;
    setActivePostIndex((i) => Math.min(i, posts.length - 1));
  }, [posts.length]);

  useEffect(() => {
    lastHomeFeedActiveIndex = activePostIndex;
  }, [activePostIndex]);

  useEffect(() => {
    if (didRestoreScrollRef.current) return;
    if (!posts.length) return;
    const targetOffset = Math.max(0, Number(lastHomeFeedOffsetY || 0));
    if (targetOffset <= 1) {
      didRestoreScrollRef.current = true;
      return;
    }
    const t = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
      didRestoreScrollRef.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [posts.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const banners = await fetchPromoBanners();
        if (!cancelled) setPromoBanners(Array.isArray(banners) ? banners : []);
      } catch {
        if (!cancelled) setPromoBanners([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = posts[activePostIndex]?.id;
    if (id && !posts[activePostIndex]?.__isHomeAd) onSeenPosts?.([id]);
  }, [activePostIndex, posts, onSeenPosts]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length === 0) return;
    requestAnimationFrame(() => {
      // Mixed-height feed can have multiple viewable rows; prefer a visible video row
      // to keep autoplay stable while scrolling through non-video cards.
      const videoFirst = viewableItems.filter((v) => !!v.item?.video_url);
      const source = videoFirst.length > 0 ? videoFirst : viewableItems;
      const goingDown = scrollDirectionRef.current === 'down';
      const idx =
        source.length === 1
          ? (source[0].index ?? 0)
          : goingDown
            ? (source[source.length - 1]?.index ?? source[0].index ?? 0)
            : (source[0]?.index ?? 0);
      setActivePostIndex(idx);
    });
  }, []);

  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    lastHomeFeedOffsetY = Math.max(0, y);
    if (y !== scrollYRef.current) {
      scrollDirectionRef.current = y > scrollYRef.current ? 'down' : 'up';
      scrollYRef.current = y;
      onFeedScrollStateChange?.({ y, direction: scrollDirectionRef.current });
    }
  }, [onFeedScrollStateChange]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 80,
  }).current;

  const toggleControls = useCallback(() => {
    setShowControls((prev) => {
      const next = !prev;
      if (!next && hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      return next;
    });
  }, []);

  const ensureControlsVisible = useCallback(() => {
    setShowControls(true);
  }, []);

  const toggleTextExpand = useCallback((postId: string) => {
    if (!postId) return;
    setExpandedTextByPostId((prev) => ({ ...prev, [postId]: !prev[postId] }));
  }, []);

  const openLikesSheet = useCallback((postId: string, postOwnerId: string, count?: number) => {
    if (!postId) return;
    setLikesPostId(postId);
    setLikesPostOwnerId(postOwnerId || null);
    setLikesCount(Math.max(0, Number(count || 0)));
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (horizontalSwipeResetRef.current) clearTimeout(horizontalSwipeResetRef.current);
    };
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: HomeFeedRow; index: number }) => {
      if (item.__isHomeAd) {
        const ad = promoBanners.length > 0 ? promoBanners[index % promoBanners.length] : null;
        return (
          <View style={[styles.cell, { height: containerHeight }]}>
            <View style={[styles.adCell, { height: containerHeight }]}>
              {ad ? (
                <PromoBanner
                  banner={ad}
                  fullScreen
                  containerHeight={containerHeight}
                  disableInternalNavigation
                  onDismiss={() => {
                    const nextIndex = Math.min(index + 1, Math.max(0, posts.length - 1));
                    listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
                  }}
                />
              ) : (
                <LinearGradient
                  colors={isDark ? ['#070B12', '#0A0F1B', '#0A0B10'] : ['#f6f8ff', '#ffffff']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.adFallback}
                >
                  <Text style={styles.adFallbackTitle}>Sponsored</Text>
                  <Text style={styles.adFallbackSub}>Loading ad creative...</Text>
                </LinearGradient>
              )}
            </View>
          </View>
        );
      }
      const isVideo = !!item.video_url;
      const images = item.image_urls?.length ? item.image_urls : item.image_url ? [item.image_url] : [];
      const hasImage = images.length > 0;
      const isActivePage = index === activePostIndex;
      const videoAspect = videoAspectByPostId[item.id];
      const imageIndex = imageIndexByPostId[item.id] ?? 0;
      const isTextExpanded = !!expandedTextByPostId[item.id];
      const activeImageUri = hasImage ? images[Math.min(imageIndex, images.length - 1)] : undefined;

      const avatarUrl =
        item.user_avatar_url ||
        item.profile?.avatar_url ||
        undefined;

      const usernameRaw =
        item.username ||
        item.profile?.username ||
        item.display_name ||
        item.profile?.full_name ||
        (item.user_id ? `user_${item.user_id.substring(0, 8)}` : 'user');
      const username = stripAtSymbol(usernameRaw);
      const resolvedAvatarUrl =
        avatarUrl && !String(avatarUrl).startsWith('dicebear:') ? avatarUrl : undefined;
      const avatarInitials = username
        .split(/[\\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || '')
        .join('') || 'U';

      const authorVerified = isVerifiedEntity({
        is_verified: item.is_verified ?? item.profile?.is_verified,
        verified: (item as { verified?: boolean }).verified ?? (item.profile as { verified?: boolean } | undefined)?.verified,
        verification_status:
          (item as { verification_status?: string }).verification_status ??
          (item.profile as { verification_status?: string } | undefined)?.verification_status,
        username: item.username ?? item.profile?.username,
        full_name: item.display_name ?? item.profile?.full_name,
      });

      const isLiked = Boolean(item.liked_by_user || item.liked);
      const isBookmarked = Boolean(item.bookmarked || item.isBookmarked);
      const isPollPost = item.post_type === 'poll' && !!item.poll;
      const isQuestionPost = item.post_type === 'question' && !!item.question;
      const contentText = item.content?.trim() || '';
      const hasLongContent = contentText.length > 140;
      const isTextOnlyPost = !isVideo && !hasImage && !isPollPost && !isQuestionPost;
      // Lift action column so bubbles/clearance stay above the bottom info band (tab bar sits outside this cell).
      const actionsBottom = BOTTOM_INFO_RESERVED + 52 + (isTextExpanded ? 36 : 0);
      const isOwn = !!currentUserId && item.user_id === currentUserId;
      const openPostOverflowMenu = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        ensureControlsVisible();
        if (isOwn && currentUserId) {
          Alert.alert('Post options', undefined, [
            { text: 'Edit Post', onPress: () => onEditPost?.(item) },
            {
              text: 'Delete Post',
              style: 'destructive',
              onPress: () => onDeletePost?.(item.id),
            },
            { text: 'Cancel', style: 'cancel' },
          ]);
        } else if (currentUserId) {
          onReportPost?.(item);
        } else {
          Alert.alert(
            'Sign in required',
            'Sign in to report posts or manage your content.',
            [{ text: 'OK', style: 'cancel' }]
          );
        }
      };
      const isFollowingUser = !!followingByUserId[item.user_id];
      const followLoading = !!followLoadingByUserId[item.user_id];
      const uploadStatus = item.client_upload_status;
      const uploadProgress = Math.max(0, Math.min(100, Number(item.client_upload_progress ?? 0)));
      const showUploadPill = uploadStatus === 'uploading' || uploadStatus === 'processing' || uploadStatus === 'failed';
      const uploadPillText =
        uploadStatus === 'failed'
          ? 'Upload failed'
          : uploadStatus === 'processing'
            ? 'Processing...'
            : `Uploading ${Math.round(uploadProgress)}%`;
      const estimatedTextLines = Math.max(1, Math.min(20, Math.ceil(contentText.length / 30)));
      // Make story text card height follow content instead of forcing a large fixed panel.
      const compactTextHeight = Math.min(
        Math.max(220, 150 + Math.min(estimatedTextLines, 10) * 26 + (item.audio_url ? 44 : 0)),
        Math.min(440, containerHeight * 0.62)
      );
      const expandedTextHeight = Math.min(
        Math.max(280, 170 + estimatedTextLines * 28 + (item.audio_url ? 44 : 0)),
        Math.min(620, containerHeight * 0.82)
      );
      const textCardHeight = isTextExpanded ? expandedTextHeight : compactTextHeight;
      const textOnlyCardTop = Math.max(
        84,
        Math.min(containerHeight - textCardHeight - 180, (containerHeight - textCardHeight) / 2 - 20)
      );
      /** Full cell height — bottom UI is absolutely positioned over the video (no reserved strip that looks like a top gap / letterbox). */
      const mediaHeight = Math.max(160, containerHeight);
      const isImmersivePost = isVideo || hasImage || isTextOnlyPost;
      const isAdultFlag = Boolean(
        item.adult_content === true ||
          item.adult_content === 1 ||
          (typeof item.adult_content === 'string' && item.adult_content.toLowerCase() === 'true')
      );
      const mandatoryAgeBlur = viewerIsUnder16 && (isVideo || hasImage);
      const wantsSensitiveBlur =
        isImmersivePost && (isAdultFlag || mandatoryAgeBlur);
      const canTapToRevealSensitive = isImmersivePost && isAdultFlag && !mandatoryAgeBlur;
      const sensitiveRevealed = !!sensitiveRevealByPostId[item.id];
      const shouldBlurSensitive =
        wantsSensitiveBlur && !(canTapToRevealSensitive && sensitiveRevealed);
      const shouldPlayVideo = isVideo && isActivePage && allowVideoPlayback && !shouldBlurSensitive;
      const musicStripTheme = {
        primary: c.primary,
        text: '#FFFFFF',
        textSecondary: 'rgba(255,255,255,0.78)',
        border: 'rgba(255,255,255,0.14)',
        cardBackground: 'rgba(0,0,0,0.45)',
        error: c.error,
      };
      /** Fullscreen feed uses a black canvas — keep poll/Q&A cards readable. */
      const specialPostTheme = {
        primary: c.primary,
        text: '#FFFFFF',
        textSecondary: 'rgba(255,255,255,0.78)',
        border: 'rgba(255,255,255,0.14)',
        cardBackground: 'rgba(255,255,255,0.10)',
        neutral: { background: '#000000' },
      };

      // Portrait / square (w/h ≤ 1): COVER fills the frame (TikTok-style, no letterboxing).
      // Landscape (w/h > 1): CONTAIN so the full frame is visible with top/bottom bars.
      const useCoverForVideo = videoAspect === undefined || videoAspect <= 1;

      if (!isImmersivePost) {
        return (
          <View style={[styles.regularCell, { height: containerHeight }]}>
            <FeedPostCard
              post={item}
              isDark={isDark}
              onPress={() => {}}
              isVisible={false}
              userId={currentUserId}
              viewerIsUnder16={viewerIsUnder16}
              onLikeChange={(postId, liked) => onLike?.(postId, liked)}
              onBookmarkChange={(postId, bookmarked) => onBookmark?.(postId, bookmarked)}
              onReportPost={onReportPost ? () => onReportPost(item) : undefined}
            />
          </View>
        );
      }

      return (
        <View style={[styles.cell, { height: containerHeight }]}>
          <View style={[styles.media, { height: mediaHeight }]}>
            {isVideo && item.video_url ? (
              <Pressable onPress={toggleControls}>
                <View style={{ width: windowWidth, height: mediaHeight, backgroundColor: '#000' }}>
                  <Video
                    ref={(instance: Video | null) => {
                      if (index === activePostIndex) {
                        homeActiveVideoRef.current = instance;
                      }
                    }}
                    source={{ uri: item.video_url }}
                    style={[styles.fill, { width: windowWidth, height: mediaHeight }]}
                    resizeMode={useCoverForVideo ? ResizeMode.COVER : ResizeMode.CONTAIN}
                    shouldPlay={shouldPlayVideo}
                    isLooping
                    isMuted={muted}
                    volume={muted ? 0 : 1}
                    staysActiveInBackground={false}
                    playInSilentModeIOS
                    ignoreSilentSwitch="ignore"
                    onReadyForDisplay={(event: any) => {
                      const size = event?.naturalSize;
                      const w = Number(size?.width || 0);
                      const h = Number(size?.height || 0);
                      if (!w || !h) return;
                      const ratio = w / h;
                      setVideoAspectByPostId((prev) => {
                        if (prev[item.id] === ratio) return prev;
                        return { ...prev, [item.id]: ratio };
                      });
                    }}
                  />
                </View>
              </Pressable>
            ) : hasImage ? (
              <View style={{ width: windowWidth, height: mediaHeight, backgroundColor: '#000' }}>
                {/* Blurred background to fill (avoids black side bars) */}
                <Image
                  source={{ uri: activeImageUri || images[0] }}
                  style={[StyleSheet.absoluteFillObject]}
                  contentFit="cover"
                  blurRadius={22}
                />
                <View style={styles.imageBackdropOverlay} pointerEvents="none" />
                {images.length <= 1 ? (
                  <Pressable onPress={toggleControls}>
                    <Image
                      source={{ uri: images[0] }}
                      style={[styles.fill, { width: windowWidth, height: mediaHeight }]}
                      contentFit="contain"
                      transition={120}
                    />
                  </Pressable>
                ) : (
                  <FlatList
                    data={images}
                    keyExtractor={(uri, idx) => `${item.id}-${idx}-${uri}`}
                    horizontal
                    pagingEnabled
                    directionalLockEnabled
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    nestedScrollEnabled
                    // Only lock vertical feed scrolling when horizontal scrolling
                    // actually starts, not on every touch inside the carousel.
                    onScrollBeginDrag={lockHorizontalSwipe}
                    onScrollEndDrag={() => setTimeout(unlockHorizontalSwipe, 0)}
                    onMomentumScrollBegin={lockHorizontalSwipe}
                    removeClippedSubviews
                    onMomentumScrollEnd={(e) => {
                      const page = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                      setImageIndexByPostId((prev) => ({ ...prev, [item.id]: page }));
                      // Release vertical lock after horizontal paging settles.
                      setTimeout(unlockHorizontalSwipe, 0);
                    }}
                    renderItem={({ item: uri }) => (
                      <Pressable style={{ width: windowWidth, height: mediaHeight }} onPress={toggleControls}>
                        <Image
                          source={{ uri }}
                          style={[styles.fill, { width: windowWidth, height: mediaHeight }]}
                          contentFit="contain"
                          transition={120}
                        />
                      </Pressable>
                    )}
                  />
                )}
                {!!item.audio_url?.trim() && (
                  <>
                    <PostAudioAutoPlay
                      audioUrl={item.audio_url!}
                      isVisible={isActivePage && !shouldBlurSensitive}
                    />
                    <View
                      style={[
                        styles.imageMusicOverlay,
                        images.length > 1 ? styles.imageMusicOverlayWithDots : null,
                      ]}
                      pointerEvents="box-none"
                    >
                      <PostMusicStrip
                        audioUrl={item.audio_url!}
                        title={item.audio_title ?? undefined}
                        artist={item.audio_artist ?? undefined}
                        themeColors={musicStripTheme}
                        compact
                        style={{ marginHorizontal: 12 }}
                      />
                    </View>
                  </>
                )}
              </View>
            ) : isPollPost && item.poll ? (
              <View style={[styles.specialPostCanvas, { width: windowWidth, height: mediaHeight }]}>
                <ScrollView
                  style={{ width: windowWidth, height: mediaHeight }}
                  contentContainerStyle={styles.pollQuestionScrollContent}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.specialPostCardWrap}>
                    <PollPostCard
                      postId={item.id}
                      themeColors={specialPostTheme}
                      poll={item.poll}
                      postCreatorId={item.user_id}
                      onVoted={() => {}}
                    />
                  </View>
                </ScrollView>
              </View>
            ) : isQuestionPost && item.question ? (
              <View style={[styles.specialPostCanvas, { width: windowWidth, height: mediaHeight }]}>
                <ScrollView
                  style={{ width: windowWidth, height: mediaHeight }}
                  contentContainerStyle={styles.pollQuestionScrollContent}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.specialPostCardWrap}>
                    <QuestionPostCard
                      postId={item.id}
                      themeColors={specialPostTheme}
                      question={item.question}
                      onAnswered={() => {}}
                    />
                  </View>
                </ScrollView>
              </View>
            ) : (
              <Pressable onPress={toggleControls}>
                <View style={[styles.textOnly, { height: mediaHeight, backgroundColor: '#000' }]}>
                  <LinearGradient
                    colors={['#05070B', '#0A101B', '#060A12']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                  />
                  <View style={[styles.textOnlyCardWrap, { marginTop: textOnlyCardTop }]}>
                    <StoryStyleTextPostCard
                      userId={item.user_id}
                      username={username}
                      isVerified={authorVerified}
                      avatarUrl={resolvedAvatarUrl}
                      content={contentText}
                      createdAt={item.created_at}
                      likesCount={item.likes_count ?? 0}
                      commentsCount={item.comments_count ?? 0}
                      isLiked={isLiked}
                      isBookmarked={isBookmarked}
                      isDark={isDark}
                      isMusicActive={isActivePage && !shouldBlurSensitive}
                      audioUrl={item.audio_url}
                      audioTitle={item.audio_title}
                      audioArtist={item.audio_artist}
                      onPressProfile={() => {
                        if (!item.user_id) return;
                        onOpenProfile?.(item.user_id);
                      }}
                      onLike={() => onLike?.(item.id, !isLiked)}
                      onComment={() => {
                        setCommentsPostId(item.id);
                        setCommentsPostOwnerId(item.user_id);
                      }}
                      onBookmark={() => onBookmark?.(item.id, !isBookmarked)}
                      showMoreButton={showControls}
                      onPressMore={openPostOverflowMenu}
                      expanded={isTextExpanded}
                      onToggleExpand={() => toggleTextExpand(item.id)}
                      cardHeight={textCardHeight}
                    />
                  </View>
                </View>
              </Pressable>
            )}
            {shouldBlurSensitive &&
              (canTapToRevealSensitive ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tap to view sensitive content"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSensitiveRevealByPostId((prev) =>
                      prev[item.id] ? prev : { ...prev, [item.id]: true }
                    );
                  }}
                  style={[StyleSheet.absoluteFillObject, { zIndex: 24 }]}
                >
                  <BlurView
                    intensity={95}
                    tint="dark"
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                  >
                    <View style={styles.sensitiveOverlayInner} pointerEvents="none">
                      <Text style={styles.sensitiveOverlayTitle}>18+</Text>
                      <Text style={styles.sensitiveOverlaySub}>Sensitive content</Text>
                      <Text style={styles.sensitiveOverlayHint}>Tap to view</Text>
                    </View>
                  </BlurView>
                </Pressable>
              ) : (
                <BlurView
                  intensity={95}
                  tint="dark"
                  style={[StyleSheet.absoluteFillObject, { zIndex: 24 }]}
                  pointerEvents="none"
                >
                  <View style={styles.sensitiveOverlayInner} pointerEvents="none">
                    <Text style={styles.sensitiveOverlayTitle}>{viewerIsUnder16 ? '16+' : '18+'}</Text>
                    <Text style={styles.sensitiveOverlaySub}>
                      {viewerIsUnder16 ? 'Media blurred for your age' : 'Sensitive content'}
                    </Text>
                  </View>
                </BlurView>
              ))}
          </View>

          {/* Multi-photo hint (always visible for image carousels) */}
          {hasImage && images.length > 1 && !shouldBlurSensitive && (
            <View style={styles.multiPhotoHint} pointerEvents="none">
              <Images size={13} color="#fff" strokeWidth={2} />
              <Text style={styles.multiPhotoText}>
                {Math.min(imageIndex + 1, images.length)}/{images.length}
              </Text>
            </View>
          )}

          {/* Bottom-left info (text-only posts use StoryStyleTextPostCard chrome; skip duplicate UI) */}
          {showControls && !isTextOnlyPost && (
            <View
              style={[styles.bottomInfoWrap, { paddingBottom: Math.max(8, insets.bottom + 4) }]}
              pointerEvents="box-none"
            >
              <View style={styles.bottomLeft}>
                <View style={styles.userRow}>
                  <Pressable
                    onPress={(e: any) => {
                      e?.stopPropagation?.();
                      ensureControlsVisible();
                      if (!item.user_id) return;
                      onOpenProfile?.(item.user_id);
                    }}
                    style={styles.userIdentityTap}
                    hitSlop={10}
                  >
                    <View style={styles.avatarWrap}>
                      {resolvedAvatarUrl ? (
                        <Image source={{ uri: resolvedAvatarUrl }} style={styles.avatar} contentFit="cover" />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Text style={styles.avatarInitialText}>{avatarInitials}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.identityTextWrap}>
                      <View style={styles.handleRow}>
                        <Text style={styles.handle} numberOfLines={1}>
                          @{username || 'user'}
                        </Text>
                        {authorVerified ? (
                          <InlineVerifiedBadge size={15} style={styles.verifiedIcon} />
                        ) : null}
                      </View>
                      <Text style={styles.timeAgoText} numberOfLines={1}>
                        {formatTimeAgo(item.created_at)}
                      </Text>
                    </View>
                  </Pressable>
                  {!isOwn && !!currentUserId && (
                    <Pressable
                      onPress={async (e: any) => {
                        e?.stopPropagation?.();
                        ensureControlsVisible();
                        if (followLoading) return;
                        setFollowLoadingByUserId((prev) => ({ ...prev, [item.user_id]: true }));
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        try {
                          const next = !isFollowingUser;
                          // Optimistic
                          setFollowingByUserId((prev) => ({ ...prev, [item.user_id]: next }));
                          const ok = next ? await followUser(item.user_id) : await unfollowUser(item.user_id);
                          if (!ok) {
                            // revert
                            setFollowingByUserId((prev) => ({ ...prev, [item.user_id]: !next }));
                          }
                        } finally {
                          setFollowLoadingByUserId((prev) => ({ ...prev, [item.user_id]: false }));
                        }
                      }}
                      style={[styles.followBtn, isFollowingUser && styles.followingBtn]}
                      hitSlop={10}
                    >
                      <Text style={styles.followBtnText}>
                        {followLoading ? '...' : isFollowingUser ? 'Following' : 'Follow'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {showUploadPill && (
                  <View style={styles.uploadStripeRow}>
                    <View
                      style={[
                        styles.uploadStripeTrack,
                        uploadStatus === 'failed' && styles.uploadStripeTrackFailed,
                      ]}
                    >
                      <View
                        style={[
                          styles.uploadStripeFill,
                          uploadStatus === 'failed'
                            ? styles.uploadStripeFillFailed
                            : { width: `${uploadProgress}%` },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.uploadStripeLabel,
                        uploadStatus === 'failed' ? styles.uploadStripeLabelFailed : null,
                      ]}
                      numberOfLines={1}
                    >
                      {uploadPillText}
                    </Text>
                  </View>
                )}
                {uploadStatus === 'failed' && !!onRetryUpload && (
                  <Pressable
                    onPress={() => onRetryUpload(item)}
                    style={styles.retryUploadBtn}
                    hitSlop={8}
                  >
                    <Text style={styles.retryUploadBtnText}>Retry upload</Text>
                  </Pressable>
                )}
                {!!item.content?.trim() && !isTextOnlyPost && (
                  <>
                    <ScrollView
                      style={isTextExpanded ? styles.captionScrollExpanded : undefined}
                      contentContainerStyle={styles.captionScrollContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={isTextExpanded}
                    >
                      <Text style={styles.caption} numberOfLines={isTextExpanded ? undefined : 2}>
                        {contentText}
                      </Text>
                      {hasLongContent && (
                        <Pressable
                          onPress={(e: any) => {
                            e?.stopPropagation?.();
                            ensureControlsVisible();
                            toggleTextExpand(item.id);
                          }}
                          hitSlop={8}
                        >
                          <Text style={styles.readMoreText}>{isTextExpanded ? 'Show less' : 'Read more'}</Text>
                        </Pressable>
                      )}
                    </ScrollView>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Right-side actions (like / comment / bookmark / ⋯ / mute): visibility follows showControls. Text-only uses story card header ⋯. */}
          {!isTextOnlyPost && showControls && (
            <View style={[styles.rightActions, { bottom: actionsBottom }]} pointerEvents="auto">
              <Pressable
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  ensureControlsVisible();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onLike?.(item.id, !isLiked);
                }}
                onLongPress={(e: any) => {
                  e?.stopPropagation?.();
                  ensureControlsVisible();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setReactionPostId(item.id);
                  const x = e?.nativeEvent?.pageX || windowWidth - 36;
                  const y = (e?.nativeEvent?.pageY || containerHeight - 180) - 18;
                  setReactionPickerPosition({ x, y });
                  setShowReactionPicker(true);
                }}
                delayLongPress={350}
                style={styles.actionBtn}
                hitSlop={12}
              >
                <ActionGlassBubble>
                  <Zap
                    size={ACTION_ICON_LG}
                    color={isLiked ? '#FACC15' : '#fff'}
                    fill={isLiked ? '#FACC15' : 'transparent'}
                    strokeWidth={ACTION_STROKE}
                  />
                </ActionGlassBubble>
                <Pressable
                  onPress={(e: any) => {
                    e?.stopPropagation?.();
                    ensureControlsVisible();
                    openLikesSheet(item.id, item.user_id, item.likes_count ?? 0);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.actionText}>{formatCount(item.likes_count ?? 0)}</Text>
                </Pressable>
              </Pressable>

              <Pressable
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  ensureControlsVisible();
                  setCommentsPostId(item.id);
                  setCommentsPostOwnerId(item.user_id);
                }}
                style={styles.actionBtn}
                hitSlop={12}
              >
                <ActionGlassBubble>
                  <MessageCircle size={ACTION_ICON_LG} color="#fff" strokeWidth={ACTION_STROKE} />
                </ActionGlassBubble>
                <Text style={styles.actionText}>{formatCount(item.comments_count ?? 0)}</Text>
              </Pressable>

              <Pressable
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  ensureControlsVisible();
                  if (!currentUserId) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onBookmark?.(item.id, !isBookmarked);
                }}
                style={styles.actionBtn}
                hitSlop={12}
              >
                <ActionGlassBubble>
                  <Bookmark
                    size={ACTION_ICON_LG}
                    color={isBookmarked ? '#FFD700' : '#fff'}
                    fill={isBookmarked ? '#FFD700' : 'transparent'}
                    strokeWidth={ACTION_STROKE}
                  />
                </ActionGlassBubble>
              </Pressable>

              <Pressable
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  ensureControlsVisible();
                  openPostOverflowMenu();
                }}
                style={styles.actionBtn}
                hitSlop={12}
              >
                <ActionGlassBubble variant="strong">
                  <MoreVertical size={ACTION_ICON_SM} color="#fff" strokeWidth={ACTION_STROKE} />
                </ActionGlassBubble>
              </Pressable>

              {isVideo && (
                <Pressable
                  onPress={(e: any) => {
                    e?.stopPropagation?.();
                    ensureControlsVisible();
                    setMuted((m) => {
                      const nextMuted = !m;
                      const v = homeActiveVideoRef.current;
                      if (nextMuted === false) {
                        // Do not await in the gesture path; kick audio session + pipeline immediately.
                        void configurePlaybackAudioMode().catch(() => {});
                        void reactivateVideoAudioAfterUnmute(v);
                        setTimeout(() => {
                          void reactivateVideoAudioAfterUnmute(homeActiveVideoRef.current);
                        }, 90);
                      } else if (v) {
                        void v.setStatusAsync({ isMuted: true, volume: 0, shouldPlay: true }).catch(() => {});
                      }
                      return nextMuted;
                    });
                  }}
                  style={[styles.actionBtn, { marginTop: 3 }]}
                  hitSlop={12}
                >
                  <ActionGlassBubble>
                    {muted ? (
                      <VolumeX size={ACTION_ICON_SM} color="#fff" strokeWidth={ACTION_STROKE} />
                    ) : (
                      <Volume2 size={ACTION_ICON_SM} color="#fff" strokeWidth={ACTION_STROKE} />
                    )}
                  </ActionGlassBubble>
                </Pressable>
              )}
            </View>
          )}

          <ReactionPicker
            visible={showReactionPicker}
            position={reactionPickerPosition}
            currentReaction={isLiked ? 'like' : null}
            onClose={() => setShowReactionPicker(false)}
            onReactionSelect={(reaction) => {
              setShowReactionPicker(false);
              if (reactionPostId) onReact?.(reactionPostId, reaction);
            }}
          />
        </View>
      );
    },
    [
      allowVideoPlayback,
      suppressBackgroundPlayback,
      c.primary.main,
      containerHeight,
      currentUserId,
      followLoadingByUserId,
      followingByUserId,
      imageIndexByPostId,
      videoAspectByPostId,
      expandedTextByPostId,
      isHorizontalSwiping,
      insets.bottom,
      isDark,
      muted,
      showControls,
      toggleControls,
      ensureControlsVisible,
      onBookmark,
      onLike,
      onReact,
      activePostIndex,
      windowWidth,
      lockHorizontalSwipe,
      unlockHorizontalSwipe,
      toggleTextExpand,
      homeActiveVideoRef,
      promoBanners,
      posts.length,
      onOpenProfile,
      setCommentsPostId,
      setCommentsPostOwnerId,
      c.error,
      onEditPost,
      onDeletePost,
      onRetryUpload,
      onReportPost,
      showReactionPicker,
      reactionPickerPosition,
      reactionPostId,
      viewerIsUnder16,
      sensitiveRevealByPostId,
    ]
  );

  // Lazy-load follow status for active ± adjacent (matches discovery-style paging neighbors)
  React.useEffect(() => {
    if (!currentUserId) return;
    const visiblePosts = posts.filter((_, i) => Math.abs(i - activePostIndex) <= 2);
    const userIds = Array.from(new Set(visiblePosts.map((p) => p.user_id))).filter(Boolean);
    const missing = userIds.filter((uid) => followingByUserId[uid] === undefined && uid !== currentUserId);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, boolean> = {};
      await Promise.all(
        missing.map(async (uid) => {
          try {
            const f = await isFollowing(uid, currentUserId);
            updates[uid] = !!f;
          } catch {
            // ignore
          }
        })
      );
      if (!cancelled && Object.keys(updates).length) {
        setFollowingByUserId((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, followingByUserId, posts, activePostIndex]);

  return (
    <>
      <FlatList
        ref={listRef}
        style={{ height: containerHeight, width: '100%' }}
        contentContainerStyle={{ width: '100%' }}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        directionalLockEnabled
        // iOS needs vertical bounce for pull-to-refresh; bounces={false} blocks overscroll at the first page.
        bounces={!!onRefresh}
        scrollEnabled={!isHorizontalSwiping}
        pagingEnabled
        snapToInterval={containerHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: containerHeight,
          offset: containerHeight * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          lastHomeFeedOffsetY = Math.max(0, e.nativeEvent.contentOffset.y);
          const h = Math.max(1, containerHeight);
          const idx = Math.max(0, Math.round(e.nativeEvent.contentOffset.y / h));
          if (posts.length - idx <= 3 && onEndReached && !loadMoreGuardRef.current) {
            loadMoreGuardRef.current = true;
            onEndReached();
            setTimeout(() => {
              loadMoreGuardRef.current = false;
            }, 900);
          }
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary.main}
              colors={[c.primary.main]}
              progressBackgroundColor={isDark ? '#1e1e24' : '#fff'}
            />
          ) : undefined
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        removeClippedSubviews={false}
        maxToRenderPerBatch={3}
        initialNumToRender={3}
        windowSize={5}
        updateCellsBatchingPeriod={50}
      />

      {commentsPostId && commentsPostOwnerId && (
        <CommentsSheet
          visible={true}
          onClose={() => {
            setCommentsPostId(null);
            setCommentsPostOwnerId(null);
          }}
          postId={commentsPostId}
          postOwnerId={commentsPostOwnerId}
          userId={currentUserId}
          onCommentPosted={onCommentPosted}
        />
      )}
      {!!likesPostId && !!likesPostOwnerId && (
        <VideoLikesList
          visible={true}
          onClose={() => {
            setLikesPostId(null);
            setLikesPostOwnerId(null);
            setLikesCount(0);
          }}
          postId={likesPostId}
          likesCount={likesCount}
          postOwnerId={likesPostOwnerId}
        />
      )}
    </>
  );
});

export default HomeFullscreenFeed;

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\\.0$/, '')}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\\.0$/, '')}k`;
  return String(n);
}

const styles = StyleSheet.create({
  regularCell: {
    width: '100%',
    backgroundColor: '#000',
    paddingTop: 8,
    paddingBottom: 4,
  },
  cell: {
    width: '100%',
    backgroundColor: '#000',
  },
  media: {
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  sensitiveOverlayInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sensitiveOverlayTitle: {
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: 28,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sensitiveOverlaySub: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: FontFamily.semibold,
    fontSize: 14,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sensitiveOverlayHint: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  adCell: {
    width: '100%',
    justifyContent: 'center',
  },
  adFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  adFallbackTitle: {
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: 20,
  },
  adFallbackSub: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: FontFamily.medium,
    fontSize: 13,
  },
  fill: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
  multiPhotoHint: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  multiPhotoText: {
    color: '#fff',
    fontFamily: FontFamily.semibold,
    fontSize: 12,
    lineHeight: 14,
  },
  imageBackdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pollQuestionScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 24,
  },
  specialPostCanvas: {
    backgroundColor: '#000',
  },
  specialPostCardWrap: {
    alignSelf: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
  },
  textOnly: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 0,
  },
  textOnlyCardWrap: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    alignItems: 'stretch',
  },
  imageMusicOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    zIndex: 4,
    alignItems: 'stretch',
  },
  imageMusicOverlayWithDots: {
    bottom: 40,
  },
  bottomInfoWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: BOTTOM_INFO_RESERVED,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  bottomLeft: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  uploadStripeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    alignSelf: 'stretch',
  },
  uploadStripeTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  uploadStripeTrackFailed: {
    backgroundColor: 'rgba(239,68,68,0.25)',
  },
  uploadStripeFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: 'rgba(252,211,77,0.95)',
    minWidth: 2,
  },
  uploadStripeFillFailed: {
    width: '100%',
    backgroundColor: 'rgba(248,113,113,0.95)',
  },
  uploadStripeLabel: {
    color: 'rgba(252,211,77,0.95)',
    fontFamily: FontFamily.semibold,
    fontSize: 9,
    maxWidth: 88,
  },
  uploadStripeLabelFailed: {
    color: 'rgba(252,165,165,0.98)',
    maxWidth: 72,
  },
  retryUploadBtn: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  retryUploadBtnText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.semibold,
    fontSize: 12,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  userIdentityTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '72%',
  },
  followBtn: {
    marginLeft: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  followingBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  followBtnText: {
    color: '#fff',
    fontFamily: FontFamily.semibold,
    fontSize: 12,
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitialText: {
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: 12,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  verifiedIcon: {
    flexShrink: 0,
  },
  handle: {
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: 14,
    flexShrink: 1,
    minWidth: 0,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  identityTextWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  timeAgoText: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: FontFamily.medium,
    fontSize: 11,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  caption: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  captionScrollExpanded: {
    maxHeight: 140,
    paddingRight: 6,
  },
  captionScrollContent: {
    paddingBottom: 2,
  },
  readMoreText: {
    color: 'rgba(255,255,255,0.95)',
    fontFamily: FontFamily.semibold,
    fontSize: 12,
    marginBottom: 10,
  },
  rightActions: {
    position: 'absolute',
    right: 8,
    alignItems: 'center',
    width: 56,
    gap: 10,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGlassShadowWrap: {
    width: ACTION_BUBBLE,
    height: ACTION_BUBBLE,
    borderRadius: ACTION_BUBBLE / 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 6,
      },
      android: {
        elevation: 5,
      },
      default: {},
    }),
  },
  actionGlassInner: {
    width: ACTION_BUBBLE,
    height: ACTION_BUBBLE,
    borderRadius: ACTION_BUBBLE / 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  actionGlassInnerStrong: {
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actionGlassIconSlot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: 'rgba(255,255,255,0.96)',
    fontFamily: FontFamily.semibold,
    fontSize: 11,
    marginTop: 4,
    minHeight: 13,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

