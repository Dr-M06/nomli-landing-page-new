import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Play, MessageCircle, Star, BarChart2, Flame, Zap, Volume2, VolumeX, Eye, MoreVertical } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { getThemeColors } from '../../constants/Colors';
import { FontFamily } from '../../constants/Theme';
import { toggleBookmark, type Post } from '../../utils/communityUtils';
import { formatTimeAgo } from '../../utils/formatters';
import { getSafeDisplayName } from '../../utils/contentFilter';
import SimpleAvatar from '../SimpleAvatar';
import Toast from 'react-native-toast-message';
import PostReactionsList from '../PostReactionsList';
import CommentsSheet from './CommentsSheet';
import ReactionPicker, { type ReactionType as PickerReactionType } from '../ReactionPicker';
import { toggleReaction, getReactionCounts, getUserReaction } from '../../utils/reactionUtils';
import { PollPostCard } from '../PollPostCard';
import { QuestionPostCard } from '../QuestionPostCard';
import { queueViewCount } from '../../utils/viewCountBatch';
import { useVideoContext } from '../../contexts/VideoContext';
import { PostMusicStrip, PostAudioAutoPlay } from '../PostMusicStrip';
import { ReactionIcon } from '../reactions/ReactionIcon';
import CreatorProAuthorBadge from '../CreatorProAuthorBadge';


const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_MARGIN = 8;
const CARD_WIDTH = SCREEN_W - CARD_MARGIN * 2;
const MEDIA_WIDTH = CARD_WIDTH - 12;
const MAX_IMG_HEIGHT = 400;
const MIN_IMG_HEIGHT = 180;
const MAX_VIDEO_HEIGHT = 620;
const MIN_VIDEO_HEIGHT = 240;

type Props = {
  post: Post;
  isDark: boolean;
  onPress: () => void;
  isVisible?: boolean;
  userId?: string;
  viewerIsUnder16?: boolean;
  viewerIsUnder13?: boolean;
  onLikeChange?: (postId: string, liked: boolean, newCount: number) => void;
  onBookmarkChange?: (postId: string, bookmarked: boolean) => void;
  onCommentPosted?: (postId: string) => void;
  onRetryUpload?: (post: Post) => void;
  /** Shown for other users' posts: opens report flow in parent. */
  onReportPost?: () => void;
};

function shortCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export default function FeedPostCard({ 
  post, 
  isDark, 
  onPress, 
  isVisible = false,
  userId,
  viewerIsUnder16 = false,
  viewerIsUnder13 = false,
  onLikeChange,
  onBookmarkChange,
  onCommentPosted,
  onRetryUpload,
  onReportPost,
}: Props) {
  const c = getThemeColors(isDark);
  const { isGlobalMuted, setGlobalMute, registerVideoRef, unregisterVideoRef } = useVideoContext();
  const [imgSizes, setImgSizes] = useState<Record<number, { w: number; h: number }>>({});
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoThumbUri, setVideoThumbUri] = useState<string | null>(null);
  const [localViews, setLocalViews] = useState(post.views_count ?? 0);
  const scrollRef = useRef<ScrollView>(null);
  const videoRef = useRef<Video>(null);
  const likeBtnRef = useRef<View>(null);
  const lastLoopAtRef = useRef<number>(0);

  const isScreenFocused = useIsFocused();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAppState(next));
    return () => sub.remove();
  }, []);

  // Local state for optimistic updates
  const [myReaction, setMyReaction] = useState<PickerReactionType | null>(null);
  const [reactionCounts, setReactionCounts] = useState<{ total: number; likes: number; loves: number; laughs: number }>({
    total: post.likes_count ?? 0,
    likes: post.likes_count ?? 0,
    loves: 0,
    laughs: 0,
  });
  const [isBookmarked, setIsBookmarked] = useState(post.bookmarked || post.isBookmarked || false);
  const [isReacting, setIsReacting] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionPickerPosition, setReactionPickerPosition] = useState({ x: 0, y: 0 });

  // Sync with prop changes
  useEffect(() => {
    setIsBookmarked(post.bookmarked || post.isBookmarked || false);
    // Keep an initial total if server hasn't provided reaction counts yet
    setReactionCounts((prev) => ({ ...prev, total: post.likes_count ?? prev.total, likes: post.likes_count ?? prev.likes }));
    setLocalViews(post.views_count ?? 0);
  }, [post.likes_count, post.bookmarked, post.isBookmarked, post.views_count]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [counts, mine] = await Promise.all([
          getReactionCounts(post.id, true),
          getUserReaction(post.id, true),
        ]);
        if (cancelled) return;
        setReactionCounts(counts);
        setMyReaction(mine as PickerReactionType | null);
      } catch {
        // ignore (offline / placeholder)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post.id]);

  const displayName = useMemo(
    () => getSafeDisplayName(post.username, post.display_name),
    [post.username, post.display_name]
  );

  const images = useMemo(() => {
    if (post.image_urls?.length) return post.image_urls;
    if (post.image_url) return [post.image_url];
    return [];
  }, [post.image_url, post.image_urls]);

  const videoUrl = post.video_url;
  const isVideo = Boolean(videoUrl);
  const isPoll = post.post_type === 'poll';
  const isQuestion = post.post_type === 'question';
  const isAdult = Boolean(post.adult_content);
  const hasMedia = images.length > 0 || isVideo;
  const hasMultipleImages = images.length > 1;
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  useEffect(() => {
    setSensitiveRevealed(false);
  }, [post.id]);
  const shouldBlurMedia =
    hasMedia && (viewerIsUnder16 || (isAdult && !sensitiveRevealed));

  const isBoosted = Boolean(post.boost_expires_at);
  const showReportMenu = Boolean(
    onReportPost && post.user_id && userId !== post.user_id
  );

  const comments = post.comments_count ?? 0;
  const uploadStatus = post.client_upload_status;
  const uploadProgress = Math.max(0, Math.min(100, Number(post.client_upload_progress ?? 0)));
  const showUploadBadge = uploadStatus === 'uploading' || uploadStatus === 'processing' || uploadStatus === 'failed';
  const uploadBadgeText =
    uploadStatus === 'failed'
      ? 'Upload failed'
      : uploadStatus === 'processing'
        ? 'Processing video...'
        : `Uploading... ${Math.round(uploadProgress)}%`;

  const allowPlayback = isVisible && isScreenFocused && appState === 'active';

  // Autoplay/pause based on visibility + home screen focus (stop audio when user leaves tab/screen)
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    if (allowPlayback) {
      videoRef.current.playAsync();
      setIsPlaying(true);
    } else {
      videoRef.current.pauseAsync();
      setIsPlaying(false);
    }
  }, [allowPlayback, isVideo]);

  const computedHeight = useMemo(() => {
    if (isVideo) {
      return SCREEN_H;
    }
    const size = imgSizes[currentIdx];
    if (!size) return MIN_IMG_HEIGHT;
    const ratio = size.w / size.h;
    const h = MEDIA_WIDTH / ratio;
    return Math.max(MIN_IMG_HEIGHT, Math.min(h, MAX_IMG_HEIGHT));
  }, [imgSizes, currentIdx, isVideo]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    const pageW = layoutMeasurement.width || MEDIA_WIDTH;
    const idx = Math.round(contentOffset.x / pageW);
    if (idx !== currentIdx && idx >= 0 && idx < images.length) {
      setCurrentIdx(idx);
    }
  };

  const onVideoStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      if (status.naturalSize && !videoSize) {
        setVideoSize({ w: status.naturalSize.width, h: status.naturalSize.height });
      }
      setIsPlaying(status.isPlaying);

      // TikTok-style: loop manually so we can count a view per replay.
      if (status.didJustFinish && allowPlayback && videoRef.current) {
        const now = Date.now();
        // Guard against duplicate finish events firing back-to-back.
        if (now - lastLoopAtRef.current > 800) {
          lastLoopAtRef.current = now;
          // Silent + batched backend update
          queueViewCount(post.id, 1).catch(() => {});
          setLocalViews((v) => v + 1);
        }
        videoRef.current.setPositionAsync(0).then(() => videoRef.current?.playAsync()).catch(() => {});
      }
    }
  };

  // When one video is unmuted, unmute all videos (global).
  const toggleMute = () => {
    setGlobalMute(!isGlobalMuted);
  };

  // Register this video ref for global mute application.
  useEffect(() => {
    if (!isVideo) return;
    registerVideoRef(post.id, videoRef);
    return () => {
      unregisterVideoRef(post.id);
    };
  }, [isVideo, post.id, registerVideoRef, unregisterVideoRef]);

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

 

  const applyOptimisticReaction = useCallback((next: PickerReactionType | null) => {
    setReactionCounts((prev) => {
      const prevType = myReaction;
      const out = { ...prev };
      // remove previous
      if (prevType) {
        out.total = Math.max(0, out.total - 1);
        if (prevType === 'like') out.likes = Math.max(0, out.likes - 1);
        if (prevType === 'laugh') out.laughs = Math.max(0, out.laughs - 1);
      }
      // add next
      if (next) {
        out.total = out.total + 1;
        if (next === 'like') out.likes = (out.likes ?? 0) + 1;
        if (next === 'laugh') out.laughs = (out.laughs ?? 0) + 1;
      }
      return out;
    });
    setMyReaction(next);
  }, [myReaction]);

  const commitReaction = useCallback(async (next: PickerReactionType | null) => {
    if (!userId || isReacting) return;
    setIsReacting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const prev = myReaction;
    applyOptimisticReaction(next);
    try {
      // toggleReaction toggles the selected type. If switching types, call twice to remove previous then add next.
      if (prev && prev !== next) {
        await toggleReaction(post.id, prev as any);
      }
      if (next) {
        await toggleReaction(post.id, next as any);
      } else if (prev) {
        await toggleReaction(post.id, prev as any);
      }
      // keep parent in sync (like = any reaction)
      onLikeChange?.(post.id, Boolean(next), reactionCounts.total);
    } catch {
      // revert
      applyOptimisticReaction(prev);
      Toast.show({ type: 'error', text1: 'Failed to update reaction', position: 'bottom' });
    } finally {
      setIsReacting(false);
    }
  }, [userId, isReacting, myReaction, post.id, applyOptimisticReaction, onLikeChange, reactionCounts.total]);

  const handleLikeTap = useCallback(() => {
    const next = myReaction === 'like' ? null : 'like';
    commitReaction(next);
  }, [myReaction, commitReaction]);

  const openReactionPicker = useCallback(() => {
    if (!likeBtnRef.current) {
      setReactionPickerPosition({ x: SCREEN_W / 2, y: 220 });
      setShowReactionPicker(true);
      return;
    }
    (likeBtnRef.current as any).measureInWindow((x: number, y: number, width: number) => {
      setReactionPickerPosition({ x: x + width / 2, y: y - 10 });
      setShowReactionPicker(true);
    });
  }, []);

  // Handle bookmark
  const handleBookmark = useCallback(async () => {
    if (!userId || isBookmarking) return;
    
    setIsBookmarking(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Optimistic update
    const newBookmarked = !isBookmarked;
    setIsBookmarked(newBookmarked);
    
    try {
      const result = await toggleBookmark(post.id, userId);
      onBookmarkChange?.(post.id, result.action === 'added');
      Toast.show({
        type: 'success',
        text1: result.action === 'added' ? 'Saved to bookmarks' : 'Removed from bookmarks',
        position: 'bottom',
        visibilityTime: 1500,
      });
    } catch (error) {
      // Revert on error
      setIsBookmarked(!newBookmarked);
      Toast.show({
        type: 'error',
        text1: 'Failed to update bookmark',
        position: 'bottom',
      });
    } finally {
      setIsBookmarking(false);
    }
  }, [userId, isBookmarking, isBookmarked, post.id, onBookmarkChange]);

  // Get thumbnail for video blur background
  const videoThumb = images[0] || videoThumbUri || undefined;

  useEffect(() => {
    let cancelled = false;
    if (!isVideo || !videoUrl || images[0]) return;
    // Generate a lightweight first-frame thumbnail for blur background.
    (async () => {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, { time: 250 });
        if (!cancelled) setVideoThumbUri(uri);
      } catch {
        // ignore; fallback stays dark
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVideo, videoUrl, images]);

  return (
    <View
      style={[
        styles.card,
        isVideo ? styles.fullscreenCard : null,
        { backgroundColor: isVideo ? '#000' : isDark ? '#111318' : '#fff' },
      ]}
    >
      {isBoosted && (
        <LinearGradient
          colors={['rgba(251,191,36,0.1)', 'transparent']}
          style={styles.boostGlow}
        />
      )}

      <Pressable onPress={onPress} style={styles.tapContent} android_ripple={{ color: isDark ? '#ffffff10' : '#00000008' }}>
        {/* Author */}
        <View style={styles.authorRow}>
          <Pressable style={styles.authorLeft}>
            <SimpleAvatar
              avatarUrl={post.user_avatar_url}
              userId={post.user_id}
              size={32}
              isDarkMode={isDark}
              fullName={post.display_name}
              username={post.username}
              email={post.user_email}
              isVerified={post.is_verified}
              showBadges
            />
            <View style={styles.authorInfo}>
              <View style={styles.nameRow}>
                <Text style={[styles.authorName, { color: c.neutral.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                <CreatorProAuthorBadge creatorProUntil={post.profile?.creator_pro_until} isDark={isDark} />
                {isBoosted && <Flame size={10} color="#f59e0b" fill="#f59e0b" />}
              </View>
              <Text style={[styles.timestamp, { color: c.neutral.textTertiary }]}>
                {formatTimeAgo(post.created_at)}
              </Text>
            </View>
          </Pressable>

          <View style={styles.authorRowRight}>
            {(isPoll || isQuestion) && (
              <View style={[styles.typeBadge, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                {isPoll ? <BarChart2 size={10} color="#8b5cf6" strokeWidth={2} /> : <Zap size={10} color="#f59e0b" strokeWidth={2} />}
                <Text style={[styles.typeBadgeText, { color: isPoll ? '#8b5cf6' : '#f59e0b' }]}>
                  {isPoll ? 'Poll' : 'Q&A'}
                </Text>
              </View>
            )}
            {showReportMenu && (
              <Pressable
                onPress={(e) => {
                  e?.stopPropagation?.();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onReportPost?.();
                }}
                hitSlop={{ top: 12, right: 8, bottom: 12, left: 8 }}
                style={styles.postMenuBtn}
              >
                <MoreVertical size={20} color={c.neutral.textSecondary} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Text */}
        {showUploadBadge && (
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
                { color: uploadStatus === 'failed' ? '#ef4444' : '#f59e0b' },
              ]}
              numberOfLines={1}
            >
              {uploadBadgeText}
            </Text>
          </View>
        )}
        {uploadStatus === 'failed' && !!onRetryUpload && (
          <Pressable
            style={[
              styles.retryUploadBtn,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)' },
            ]}
            onPress={() => onRetryUpload(post)}
          >
            <Text style={[styles.retryUploadBtnText, { color: c.neutral.text }]}>Retry upload</Text>
          </Pressable>
        )}
        {Boolean(post.content?.trim()) && (
          <Text style={[styles.textContent, { color: c.neutral.text }]} numberOfLines={hasMedia ? 3 : 8}>
            {post.content}
          </Text>
        )}
        {post.audio_url?.trim() && !hasMedia && (
          <>
            <PostAudioAutoPlay audioUrl={post.audio_url} isVisible={isVisible} />
            <View style={{ marginTop: 8, paddingHorizontal: 2 }}>
              <PostMusicStrip
                audioUrl={post.audio_url}
                title={post.audio_title ?? undefined}
                artist={post.audio_artist ?? undefined}
                themeColors={{
                  primary: c.primary,
                  text: c.neutral.text,
                  textSecondary: c.neutral.textSecondary,
                  border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                  cardBackground: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                  error: c.error,
                }}
                compact
                style={{ marginHorizontal: 0 }}
              />
            </View>
          </>
        )}
      </Pressable>

      {/* Poll / Q&A cards */}
      {isPoll && (post as any).poll && (
        <View style={styles.specialCardWrap}>
          <PollPostCard
            postId={post.id}
            themeColors={{
              primary: c.primary,
              text: c.neutral.text,
              textSecondary: c.neutral.textSecondary,
              border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
              cardBackground: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
              neutral: { background: c.neutral.background },
            }}
            poll={(post as any).poll}
            postCreatorId={post.user_id}
            onVoted={() => {
              // Lightweight: keep UI responsive, detail screen will reflect exact results too.
            }}
          />
        </View>
      )}

      {isQuestion && (post as any).question && (
        <View style={styles.specialCardWrap}>
          <QuestionPostCard
            postId={post.id}
            themeColors={{
              primary: c.primary,
              text: c.neutral.text,
              textSecondary: c.neutral.textSecondary,
              border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
              cardBackground: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
              neutral: { background: c.neutral.background },
            }}
            question={(post as any).question}
            onAnswered={() => {
              // Lightweight: keep UI responsive, detail screen will reflect exact results too.
            }}
          />
        </View>
      )}

      {/* Media */}
      {hasMedia && (
        <View
          style={[
            styles.mediaContainer,
            isVideo ? styles.fullscreenMediaContainer : null,
            {
              height: computedHeight,
              backgroundColor: isDark ? '#000' : '#F3F4F6',
            },
          ]}
        >
          {/* Side blur background (fills letterbox area) */}
          {(() => {
            const bgUri = isVideo ? videoThumb : images[currentIdx];
            if (bgUri) {
              return (
                <>
                  <Image
                    source={{ uri: bgUri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    blurRadius={22}
                  />
                  <View
                    style={[
                      styles.blurOverlay,
                      { backgroundColor: isDark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)' },
                    ]}
                  />
                </>
              );
            }
            return (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.blurFallback,
                  { backgroundColor: isDark ? '#000' : '#F3F4F6', opacity: isDark ? 0.85 : 1 },
                ]}
              />
            );
          })()}

          {isVideo && videoUrl ? (
            <>
              <Video
                ref={videoRef}
                source={{ uri: videoUrl }}
                style={[
                  styles.video,
                  isVideo ? styles.fullscreenVideo : null,
                  { width: SCREEN_W, height: computedHeight },
                ]}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={allowPlayback}
                isLooping={false}
                isMuted={isGlobalMuted}
                staysActiveInBackground={false}
                onPlaybackStatusUpdate={onVideoStatusUpdate}
                posterSource={videoThumb ? { uri: videoThumb } : undefined}
                posterStyle={{ width: SCREEN_W, height: computedHeight }}
                usePoster={!!videoThumb}
              />
              
              {/* Play/Pause overlay - tap to toggle */}
              {!isPlaying && (
                <Pressable style={styles.playOverlay} onPress={togglePlayPause}>
                  <View style={styles.playBtn}>
                    <Play size={20} color="#fff" fill="#fff" />
                  </View>
                </Pressable>
              )}

              {/* Mute toggle */}
              <Pressable style={styles.muteBtn} onPress={toggleMute} hitSlop={8}>
                {isGlobalMuted ? (
                  <VolumeX size={14} color="#fff" strokeWidth={2} />
                ) : (
                  <Volume2 size={14} color="#fff" strokeWidth={2} />
                )}
              </Pressable>

              {/* Views counter */}
              {localViews > 0 && (
                <View style={styles.viewsBadge}>
                  <Eye size={13} color="#fff" strokeWidth={2} />
                  <Text style={styles.viewsText}>{shortCount(localViews)}</Text>
                </View>
              )}
            </>
          ) : (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onScrollEnd}
              scrollEventThrottle={16}
              decelerationRate="fast"
              bounces={false}
              snapToInterval={MEDIA_WIDTH}
              snapToAlignment="start"
              disableIntervalMomentum
              style={[styles.imageScroll, { width: MEDIA_WIDTH }]}
            >
              {images.map((uri, idx) => (
                <View key={uri + idx} style={{ width: MEDIA_WIDTH, height: computedHeight }}>
                  <Image
                    source={{ uri }}
                    style={[styles.image, { width: MEDIA_WIDTH, height: computedHeight }]}
                    contentFit="contain"
                    onLoad={(e) => {
                      const { width, height } = e.source;
                      if (width && height) {
                        setImgSizes((prev) => ({ ...prev, [idx]: { w: width, h: height } }));
                      }
                    }}
                    transition={60}
                    recyclingKey={`${post.id}-${idx}`}
                  />
                </View>
              ))}
            </ScrollView>
          )}

          {/* Adult blur — tap to reveal for 18+ posts; under-16 media stays locked */}
          {shouldBlurMedia &&
            (isAdult && !viewerIsUnder16 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tap to view sensitive content"
                style={styles.adultBlurPressable}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSensitiveRevealed(true);
                }}
              >
                <BlurView intensity={95} style={styles.adultBlur} pointerEvents="none">
                  <Text style={styles.adultText}>18+</Text>
                  <Text style={styles.adultSub}>Sensitive content</Text>
                  <Text style={styles.adultTapHint}>Tap to view</Text>
                </BlurView>
              </Pressable>
            ) : (
              <BlurView intensity={95} style={styles.adultBlur}>
                <Text style={styles.adultText}>{viewerIsUnder16 ? '16+' : '18+'}</Text>
                <Text style={styles.adultSub}>
                  {viewerIsUnder16 ? 'Media blurred for safety' : 'Sensitive content'}
                </Text>
              </BlurView>
            ))}

          {post.audio_url?.trim() && !isVideo && !shouldBlurMedia && (
            <>
              <PostAudioAutoPlay audioUrl={post.audio_url} isVisible={isVisible} />
              <View
                style={[styles.mediaMusicOverlay, hasMultipleImages ? styles.mediaMusicOverlayWithDots : null]}
                pointerEvents="box-none"
              >
                <PostMusicStrip
                  audioUrl={post.audio_url}
                  title={post.audio_title ?? undefined}
                  artist={post.audio_artist ?? undefined}
                  themeColors={{
                    primary: c.primary,
                    text: '#FFFFFF',
                    textSecondary: 'rgba(255,255,255,0.78)',
                    border: 'rgba(255,255,255,0.14)',
                    cardBackground: 'rgba(0,0,0,0.45)',
                    error: c.error,
                  }}
                  compact
                  style={{ marginHorizontal: 8 }}
                />
              </View>
            </>
          )}

          {/* Pagination dots - swipe with gesture only */}
          {hasMultipleImages && (
            <View style={styles.pagination}>
              {images.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    idx === currentIdx ? styles.dotActive : { backgroundColor: 'rgba(255,255,255,0.45)' },
                  ]}
                />
              ))}
            </View>
          )}

          {/* Image counter badge */}
          {hasMultipleImages && (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>{currentIdx + 1}/{images.length}</Text>
            </View>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={[styles.actionsRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
        <Pressable
          ref={likeBtnRef}
          style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]} 
          hitSlop={6}
          onPress={handleLikeTap}
          onLongPress={openReactionPicker}
          disabled={isReacting}
        >
          <ReactionIcon
            reaction={myReaction}
            size={16}
            activeColor="#FACC15"
            inactiveColor={c.neutral.textSecondary}
          />
        </Pressable>
        {reactionCounts.total > 0 && (
          <Pressable
            onPress={() => setShowReactions(true)}
            hitSlop={{ top: 12, bottom: 12, left: 10, right: 12 }}
            style={styles.likesCountHit}
          >
            <Text style={[styles.actionCount, { color: myReaction ? '#ef4444' : c.neutral.textSecondary }]}>
              {shortCount(reactionCounts.total)}
            </Text>
          </Pressable>
        )}
        <Pressable 
          style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]} 
          hitSlop={6}
          onPress={() => setShowComments(true)}
        >
          <MessageCircle size={16} color={c.neutral.textSecondary} strokeWidth={1.8} />
          {comments > 0 && <Text style={[styles.actionCount, { color: c.neutral.textSecondary }]}>{shortCount(comments)}</Text>}
        </Pressable>
        {/* Share hidden temporarily */}
        <View style={styles.actionsSpacer} />
        <Pressable 
          style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]} 
          hitSlop={6}
          onPress={handleBookmark}
          disabled={isBookmarking}
        >
          <Star
            size={16}
            color={isBookmarked ? '#facc15' : c.neutral.textSecondary}
            fill={isBookmarked ? '#facc15' : 'transparent'}
            strokeWidth={1.8}
          />
        </Pressable>
      </View>

      <PostReactionsList
        visible={showReactions}
        onClose={() => setShowReactions(false)}
        postId={post.id}
        postOwnerId={post.user_id}
        hideTabs={true}
      />

      <CommentsSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        postId={post.id}
        postOwnerId={post.user_id}
        userId={userId}
        onCommentPosted={onCommentPosted}
      />

      <ReactionPicker
        visible={showReactionPicker}
        position={reactionPickerPosition}
        currentReaction={myReaction}
        onClose={() => setShowReactionPicker(false)}
        onReactionSelect={(reaction) => {
          setShowReactionPicker(false);
          commitReaction(reaction);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: CARD_MARGIN,
    marginBottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  fullscreenCard: {
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
  },
  tapContent: {
    // Keep tap-to-open on header/text without stealing media swipes
  },
  boostGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  authorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  authorInfo: {
    marginLeft: 8,
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  authorName: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    flex: 1,
    minWidth: 0,
  },
  timestamp: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    marginTop: 1,
  },
  authorRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postMenuBtn: {
    padding: 4,
    marginLeft: 2,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontFamily: FontFamily.semibold,
    fontSize: 10,
  },
  textContent: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  uploadStripeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
  },
  uploadStripeTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(245,158,11,0.12)',
    overflow: 'hidden',
  },
  uploadStripeTrackFailed: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  uploadStripeFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: 'rgba(245,158,11,0.85)',
    minWidth: 2,
  },
  uploadStripeFillFailed: {
    width: '100%',
    backgroundColor: 'rgba(239,68,68,0.75)',
  },
  uploadStripeLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 9,
    maxWidth: 90,
  },
  retryUploadBtn: {
    marginBottom: 8,
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  retryUploadBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
  },
  specialCardWrap: {
    marginHorizontal: 10,
    marginBottom: 10,
  },
  mediaContainer: {
    position: 'relative',
    marginHorizontal: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  fullscreenMediaContainer: {
    marginHorizontal: 0,
    borderRadius: 0,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  blurFallback: {
    backgroundColor: '#000',
    opacity: 0.85,
  },
  imageScroll: {
    flexGrow: 0,
  },
  image: {
    borderRadius: 14,
  },
  video: {
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  fullscreenVideo: {
    borderRadius: 0,
    backgroundColor: '#000',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 2,
  },
  muteBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewsBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  viewsText: {
    color: '#fff',
    fontFamily: FontFamily.semibold,
    fontSize: 11,
  },
  adultBlurPressable: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  adultBlur: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  adultText: {
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: 18,
  },
  adultSub: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: FontFamily.regular,
    fontSize: 12,
    marginTop: 3,
  },
  adultTapHint: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: FontFamily.semibold,
    fontSize: 13,
  },
  mediaMusicOverlay: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 10,
    zIndex: 4,
    alignItems: 'stretch',
  },
  mediaMusicOverlayWithDots: {
    bottom: 38,
  },
  pagination: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 14,
    borderRadius: 2.5,
  },
  counterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  counterText: {
    color: '#fff',
    fontFamily: FontFamily.medium,
    fontSize: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  actionsSpacer: {
    flex: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    gap: 5,
  },
  actionCount: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
  },
  likesCountHit: {
    paddingVertical: 6,
    paddingRight: 6,
    marginLeft: -2,
  },
});
