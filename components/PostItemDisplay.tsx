
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  TextInput,
  Platform,
  Dimensions,
  Animated,
  ScrollView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import ReanimatedAnimated from 'react-native-reanimated';
const { ScrollView: AnimatedScrollView } = ReanimatedAnimated;
import {
  Heart,
  MessageSquare,
  Bookmark,
  Share2,
  Send,
  MoreVertical,
  Pin,
  Store,
  Lock,
  ChevronUp,
  ChevronDown,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import { Video, ResizeMode } from 'expo-av';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow } from '../constants/Theme';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { Post, Comment } from '../utils/communityUtils';
import { formatTimeAgo, formatViewCountLabel } from '../utils/formatters';
import { getSafeDisplayName, sanitizeUsernameForDisplay, stripAtSymbol } from '../utils/contentFilter';
import { OFFICIAL_ACCOUNT_EMAIL } from '../constants/ContactEmails';
import SimpleAvatar from './SimpleAvatar';
import OptimizedImage from './OptimizedImage';
import { PollPostCard } from './PollPostCard';
import { QuestionPostCard } from './QuestionPostCard';
import PostReactionsList from './PostReactionsList';
import ReactionPicker, { ReactionType as PickerReactionType } from './ReactionPicker';
import { toggleReaction, getUserReaction, getReactionCounts } from '../utils/reactionUtils';
import { useDoubleTap } from '../hooks/useDoubleTap';
import DoubleTapHeart from './DoubleTapHeart';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import AppWatermark from './AppWatermark';
import { PostHeader, PostContent, PostActions, CommentInput, SimpleActionButton } from './post';
import { PostMusicStrip, PostAudioAutoPlay } from './PostMusicStrip';
import { useVideoContext } from '../contexts/VideoContext';
import AppLogo from './AppLogo';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 768 || (SCREEN_WIDTH > SCREEN_HEIGHT && SCREEN_HEIGHT >= 768);

// Helper function to validate image URLs
const isValidImageUrl = (url?: string) => {
  if (!url) return false;
  
  // Check for common invalid URLs
  if (url.startsWith('file:///data/user/0/com.nomli.mingle/cache/')) {
    log('[PostItemDisplay] Skipping cached image that might be invalid:', url);
    return false;
  }
  
  // Accept URLs from Supabase storage
  if (url.includes('supabase.co/storage/v1/object/public/post-images/') || 
      url.includes('supabase.co/storage/v1/object/public/avatars/')) {
    return true;
  }
  
  // Require http(s) for remote images
  return url.startsWith('http://') || url.startsWith('https://');
};

interface PostItemDisplayProps {
  item: Post;
  user: any; // Consider defining a more specific type for user
  isDark: boolean;
  themeColors: any; // Add themeColors prop
  expandedPosts: Set<string>;
  expandedPostContent: Set<string>;
  postComments: Record<string, Comment[]>;
  loadingComments: Set<string>;
  submittingComments: Set<string>;
  commentTexts: Record<string, string>;
  handleLike: (postId: string) => void;
  handleBookmark: (postId: string) => void;
  handlePostExpansion: (postId: string) => void;
  togglePostContentExpansion: (postId: string) => void;
  setPostMenuVisible: (postId: string | null) => void;
  handleCommentSubmit: (postId: string) => void;
  setCommentTexts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCommentMenuVisible: (commentId: string | null) => void; // Added this prop
  handleShare: (post: Post) => void;
  setViewingImage: (imageUrl: string | null, imageSet?: string[], index?: number) => void; // Add image viewer prop
  navigateToUserProfile: (userId: string) => void; // Add navigation to user profile
  handleToggleCommentLike: (postId: string, commentId: string, userId: string) => void; // Add comment like handler
  isVisible?: boolean;
  /** When true, this post is the single one that should auto-play attached audio (no sound card). */
  isActiveForAudio?: boolean;
  // Threaded comment functions
  organizeCommentsIntoThreads: (comments: Comment[]) => any[];
  expandedThreads: Set<string>;
  replyingToComment: string | null;
  replyTexts: Record<string, string>;
  handleReplyToComment: (postId: string, commentId: string, replyText: string) => void;
  toggleThreadExpansion: (commentId: string) => void;
  setReplyingToComment: (commentId: string | null) => void;
  setReplyTexts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleDeleteComment: (commentId: string, postId: string) => void;
  setShowLikesModal: (postId: string | null) => void; // Add likes modal handler
  setShowPrivacyModal: (show: boolean) => void; // Privacy modal handler
  setShowCommentsDisabledModal: (show: boolean) => void; // Comments disabled modal
  commentsDisabledScale: Animated.Value; // Animation value for modal
  commentsDisabledOpacity: Animated.Value; // Animation value for modal
  // Commenter menu props
  commenterMenuVisible: { commentId: string; userId: string; username: string } | null;
  setCommenterMenuVisible: (menu: { commentId: string; userId: string; username: string } | null) => void;
  followingUsers: Set<string>;
  setFollowingUsers: React.Dispatch<React.SetStateAction<Set<string>>>;
  followLoading: Set<string>;
  handleFollowCommenter: (userId: string) => Promise<void>;
  handleReplyToCommenter: (commentId: string, postId: string) => void;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setSelectedPost: React.Dispatch<React.SetStateAction<Post | null>>; // Add setSelectedPost prop
  setCommentScrollViewRef?: (postId: string, ref: ScrollView | null) => void; // Ref callback for comment ScrollView
  onBoostPost?: (postId: string) => Promise<void>;
}

// New component for rendering a single post item
// CRITICAL: Memoize to prevent re-renders on scroll
const PostItemDisplay: React.FC<PostItemDisplayProps> = React.memo(({
  item,
  user,
  isDark,
  themeColors,
  expandedPosts,
  expandedPostContent,
  postComments,
  loadingComments,
  submittingComments,
  commentTexts,
  handleLike,
  handleBookmark,
  handlePostExpansion,
  togglePostContentExpansion,
  setPostMenuVisible,
  handleCommentSubmit,
  setCommentTexts,
  setCommentMenuVisible, // Destructure new prop
  handleShare,
  setViewingImage,
  navigateToUserProfile,
  handleToggleCommentLike, // Destructure comment like handler
  isVisible = true,
  isActiveForAudio = false,
  // Threaded comment functions
  organizeCommentsIntoThreads,
  expandedThreads,
  replyingToComment,
  replyTexts,
  handleReplyToComment,
  toggleThreadExpansion,
  setReplyingToComment,
  setReplyTexts,
  handleDeleteComment,
  setShowLikesModal, // Add likes modal handler
  setShowPrivacyModal, // Privacy modal handler
  setShowCommentsDisabledModal, // Comments disabled modal
  commentsDisabledScale, // Animation value for modal
  commentsDisabledOpacity, // Animation value for modal
  // Commenter menu props
  commenterMenuVisible,
  setCommenterMenuVisible,
  followingUsers,
  setFollowingUsers,
  followLoading,
  handleFollowCommenter,
  handleReplyToCommenter,
  setPosts,
  setSelectedPost, // Add setSelectedPost prop
  setCommentScrollViewRef, // Ref callback for comment ScrollView
  onBoostPost,
}) => {
  const themeStyles = useThemeStyles();
  const { isGlobalMuted, toggleGlobalMute } = useVideoContext();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageHeight, setImageHeight] = useState<number | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
  const [, forceUpdate] = useState({});
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionPickerPosition, setReactionPickerPosition] = useState({ x: 0, y: 0 });
  const [userReaction, setUserReaction] = useState<'like' | 'laugh' | null>(null); // Removed 'love'
  const [reactionCounts, setReactionCounts] = useState({ likes: 0, loves: 0, laughs: 0 }); // Keep loves for backward compatibility with existing data
  const [currentImageIndex, setCurrentImageIndex] = useState(0); // Track current image in carousel
  const likeButtonRef = useRef<TouchableOpacity>(null);
  const carouselScrollRef = useRef<ReanimatedAnimated.ScrollView>(null);
  // Get screen width on JS thread - must be constant for worklet access
  const screenWidth = useMemo(() => Dimensions.get('window').width, []);
  const router = useRouter();

  const refreshPoll = useCallback(async () => {
    try {
      const postId = item.id;
      const [{ data: pollRow }, { data: opts }, { data: votes }, meRes] = await Promise.all([
        supabase.from('post_polls').select('post_id, question, expires_at, locked_at, show_results_mode').eq('post_id', postId).maybeSingle(),
        supabase.from('post_poll_options').select('id, post_id, option_text, sort_order').eq('post_id', postId),
        supabase.from('post_poll_votes').select('post_id, option_id, user_id').eq('post_id', postId),
        user?.id
          ? supabase.from('post_poll_votes').select('post_id, option_id').eq('post_id', postId).eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);
      if (!pollRow || !opts) return;

      const voteCountsByOption: Record<string, number> = {};
      let totalVotes = 0;
      (votes || []).forEach(v => {
        totalVotes += 1;
        voteCountsByOption[v.option_id] = (voteCountsByOption[v.option_id] || 0) + 1;
      });

      const myVoteOptionId = (meRes as any)?.data?.option_id ?? null;

      setPosts((current: Post[]) =>
        current.map(p => {
          if (p.id !== postId) return p;
          return {
            ...p,
            poll: {
              question: pollRow.question,
              expires_at: pollRow.expires_at,
              locked_at: pollRow.locked_at,
              show_results_mode: pollRow.show_results_mode,
              options: (opts || [])
                .map((o: any) => ({
                  id: o.id,
                  text: o.option_text,
                  sort_order: o.sort_order,
                  vote_count: voteCountsByOption[o.id] || 0,
                }))
                .sort((a: any, b: any) => a.sort_order - b.sort_order),
              my_vote_option_id: myVoteOptionId,
              total_votes: totalVotes,
            },
          };
        })
      );
    } catch (e) {
      // Non-critical
    }
  }, [item.id, setPosts, user?.id]);

  const refreshQuestion = useCallback(async () => {
    try {
      const postId = item.id;
      const [{ data: qRow }, { data: answers }] = await Promise.all([
        supabase.from('post_questions').select('post_id, question').eq('post_id', postId).maybeSingle(),
        supabase
          .from('post_question_answers')
          .select('id, post_id, user_id, answer, created_at, is_hidden')
          .eq('post_id', postId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (!qRow) return;

      const visibleAnswers = (answers || []).filter((a: any) => !a.is_hidden);
      const topAnswers = visibleAnswers.slice(0, 2).map((a: any) => ({
        id: a.id,
        user_id: a.user_id,
        answer: a.answer,
        created_at: a.created_at,
      }));
      const myHasAnswered = !!(user?.id && visibleAnswers.some((a: any) => a.user_id === user.id));

      setPosts((current: Post[]) =>
        current.map(p => {
          if (p.id !== postId) return p;
          return {
            ...p,
            question: {
              question: qRow.question,
              answers_count: visibleAnswers.length,
              my_has_answered: myHasAnswered,
              top_answers: topAnswers,
            },
          };
        })
      );
    } catch (e) {
      // Non-critical
    }
  }, [item.id, setPosts, user?.id]);

  // Ensure poll/Q&A cards don't "disappear" on reload when cache returns posts without enrichment.
  // If we have post_type but missing embedded metadata, fetch it lazily.
  useEffect(() => {
    if (item.post_type === 'poll' && !item.poll) {
      refreshPoll();
    }
    if (item.post_type === 'question' && !item.question) {
      refreshQuestion();
    }
  }, [item.id, item.post_type, item.poll, item.question, refreshPoll, refreshQuestion]);
  
  // Double-tap to like state
  const [showHeart, setShowHeart] = useState(false);
  const [heartPosition, setHeartPosition] = useState({ x: 0, y: 0 });
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  // 18+ content: hidden by default, tap "Show" to reveal (Twitter-style)
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  const isAdultContent = !!(item.adult_content === true || item.adult_content === 1);
  const showAdultOverlay = isAdultContent && !sensitiveRevealed;
  
  // Load user reaction and counts on mount and when item changes
  useEffect(() => {
    const loadReactions = async () => {
      try {
        // Always fetch reaction counts (even for guests)
        const counts = await getReactionCounts(item.id);
        setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
        
        // Only fetch user reaction if user is logged in
        if (user?.id) {
          const reaction = await getUserReaction(item.id);
          setUserReaction(reaction);
        }
      } catch (error) {
        error('[PostItemDisplay] Error loading reactions:', error);
        // Fallback to item.likes_count if available (for backwards compatibility)
        if (item.likes_count !== undefined) {
          setReactionCounts({ likes: item.likes_count || 0, loves: 0, laughs: 0 });
        }
      }
    };
    loadReactions();
  }, [item.id, user?.id]);

  // Sync state when item.liked_by_user changes from parent updates
  useEffect(() => {
    // Only update if we don't have a reaction state yet (to avoid overwriting user's selection)
    if (!userReaction && item.liked_by_user) {
      // This means parent thinks it's liked, but we don't have reaction state
      // This can happen on initial load, so we'll fetch the actual reaction
      const syncReaction = async () => {
        if (!user?.id) return;
        try {
          const reaction = await getUserReaction(item.id);
          if (reaction) {
            setUserReaction(reaction);
          }
        } catch (error) {
          // Ignore errors during sync
        }
      };
      syncReaction();
    }
  }, [item.liked_by_user, item.id]);
  
  // View count tracking for photo posts (similar to videos but with shorter duration)
  const [viewsCount, setViewsCount] = useState(item.views_count || 0);
  const viewsCountRef = useRef(item.views_count || 0);
  const viewCountUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isViewCountUpdatingRef = useRef(false);
  const pendingViewCountUpdateRef = useRef(false);
  const hasViewedInSessionRef = useRef(false);
  const viewStartTimeRef = useRef<number | null>(null);
  const MIN_VIEW_DURATION = 1500; // 1.5 seconds for photos (shorter than videos)
  const containerRef = useRef<View>(null);
  
  // Handle double-tap to like
  const handleDoubleTap = useCallback((event: any) => {
    if (!user) {
      router.push('/auth/signin');
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
        
        try {
          await toggleReaction(item.id, 'like');
          // Refresh state
          const counts = await getReactionCounts(item.id);
          setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
          const newReaction = await getUserReaction(item.id);
          setUserReaction(newReaction);
          
          // Update parent state
          setPosts((current: Post[]) => 
            current.map(post => {
              if (post.id === item.id) {
                return {
                  ...post,
                  likes_count: counts.likes + counts.loves + counts.laughs,
                  liked_by_user: !!newReaction
                };
              }
              return post;
            })
          );
        } catch (error) {
          error('[PostItemDisplay] Error toggling reaction:', error);
          setUserReaction(previousReaction);
          setReactionCounts(previousCounts);
        }
      };
      reactionHandler();
    }
    // If already liked, just show the heart animation (don't unlike)
  }, [user, userReaction, reactionCounts, item.id, router, setPosts]);

  // Handle single tap (open image viewer)
  const handleSingleTap = useCallback((event: any) => {
    // Single tap opens image viewer (existing behavior)
    // Note: This is delayed by 300ms due to double-tap detection
    // For immediate single-tap, users can still tap directly on the image TouchableOpacity
    if (validImageUrls && validImageUrls.length > 0) {
      handleImagePress(validImageUrls[0], 0);
    }
  }, [validImageUrls, handleImagePress]);

  // Double-tap hook
  const doubleTapHandlers = useDoubleTap({
    onDoubleTap: handleDoubleTap,
    onSingleTap: handleSingleTap,
    delay: 300,
  });
  
  const isExpanded = expandedPosts.has(item.id);
  const isContentExpanded = expandedPostContent.has(item.id);
  const isOwner = user && item.user_id === user.id;
  const isOfficialPost = item.user_email?.toLowerCase() === OFFICIAL_ACCOUNT_EMAIL.toLowerCase();
  
  // Check if this is a photo post (has images but no video)
  // video_url may be null for text/photo posts
  const hasVideo = !!(item.video_url && typeof item.video_url === 'string');
  const isPhotoPost = hasValidImages && !hasVideo;
  
  // Extract hashtags and content separately
  const { content: contentWithoutHashtags, hashtags } = useMemo(() => {
    if (!item.content) return { content: '', hashtags: [] };
    
    const hashtagRegex = /#[\w]+/g;
    const foundHashtags = item.content.match(hashtagRegex) || [];
    // Limit to 4 hashtags
    const limitedHashtags = foundHashtags.slice(0, 4);
    
    // Remove hashtags from content
    const cleanContent = item.content.replace(/#[\w]+/g, '').replace(/\s+/g, ' ').trim();
    
    return {
      content: cleanContent,
      hashtags: limitedHashtags
    };
  }, [item.content]);

  // Content truncation logic - optimized with useMemo
  const MAX_CONTENT_LENGTH = 200;
  const needsTruncation = useMemo(() => 
    contentWithoutHashtags && (contentWithoutHashtags.length > MAX_CONTENT_LENGTH), 
    [contentWithoutHashtags]
  );

  // Memoize displayed content for better performance
  const displayedContent = useMemo(() => {
    if (!contentWithoutHashtags) return '';
    if (needsTruncation && !isContentExpanded) {
      return contentWithoutHashtags.substring(0, MAX_CONTENT_LENGTH) + "...";
    }
    return contentWithoutHashtags;
  }, [contentWithoutHashtags, needsTruncation, isContentExpanded]);
  
  
  const comments = postComments[item.id] || [];
  const isLoadingComments = loadingComments.has(item.id);
  const isSubmittingComment = submittingComments.has(item.id);
  const commentText = commentTexts[item.id] || '';

  // Check if post has valid image URLs - limit to prevent memory issues
  // images may be null/empty for text posts
  const hasValidImages = item.image_urls && Array.isArray(item.image_urls) && item.image_urls.length > 0;
  const validImageUrls = hasValidImages 
    ? item.image_urls
        .filter(url => url && url !== null && typeof url === 'string' && isValidImageUrl(url))
        .slice(0, 2) // Limit to 2 images max
        // Don't convert URLs here - resizePostImage() already handles CDN conversion
        // This avoids double processing and improves performance
    : [];
  const hasMultipleImages = (validImageUrls?.length || 0) > 1;
  const hasMedia = hasVideo || (validImageUrls?.length || 0) > 0;
  const isBoosted = !!(item.boost_expires_at && new Date(item.boost_expires_at).getTime() > Date.now());

  // Sync viewsCount with item prop updates, but preserve local increments
  useEffect(() => {
    const propViews = item.views_count || 0;
    const currentViews = viewsCountRef.current;
    
    // Only update if the prop value is higher (from database refresh)
    if (propViews > currentViews) {
      setViewsCount(propViews);
      viewsCountRef.current = propViews;
    }
  }, [item.views_count, item.id]);

  // Keep ref in sync with state
  useEffect(() => {
    viewsCountRef.current = viewsCount;
  }, [viewsCount]);

  // Reset image height when image URL changes
  useEffect(() => {
    setImageHeight(null);
    setImageLoaded(false);
    setImageError(false);
  }, [validImageUrls[0]]);

  // Reset view session tracking when post changes
  useEffect(() => {
    hasViewedInSessionRef.current = false;
    viewStartTimeRef.current = null;
  }, [item.id]);

  // Increment view count for photo posts when visible
  const incrementViewCount = useCallback(async () => {
    // Skip if view already counted this session
    if (hasViewedInSessionRef.current) {
      return;
    }

    // Skip if already updating
    if (isViewCountUpdatingRef.current) {
      pendingViewCountUpdateRef.current = true;
      const optimisticNewCount = viewsCountRef.current + 1;
      setViewsCount(optimisticNewCount);
      viewsCountRef.current = optimisticNewCount;
      return;
    }

    // Clear any pending timeout
    if (viewCountUpdateTimeoutRef.current) {
      clearTimeout(viewCountUpdateTimeoutRef.current);
      viewCountUpdateTimeoutRef.current = null;
    }

    const previousCount = viewsCountRef.current;
    
    // Optimistically update UI immediately
    const optimisticNewCount = previousCount + 1;
    setViewsCount(optimisticNewCount);
    viewsCountRef.current = optimisticNewCount;

    // Throttle: Wait 3 seconds to batch rapid views
    const throttleDelay = 3000;
    viewCountUpdateTimeoutRef.current = setTimeout(async () => {
      isViewCountUpdatingRef.current = true;
      const hasPending = pendingViewCountUpdateRef.current;
      pendingViewCountUpdateRef.current = false;

      try {
        // Video posts: unique viewers (record_post_video_view). Image posts: legacy increment.
        const isVideo = !!item.video_url;
        const rpcPromise = isVideo && user?.id
          ? supabase.rpc('record_post_video_view', { p_post_id: item.id, p_user_id: user.id })
          : supabase.rpc('increment_post_views', { post_id: item.id });

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('View count update timeout')), 5000);
        });

        const { data: newCount, error: rpcError } = await Promise.race([
          rpcPromise,
          timeoutPromise
        ]) as any;

        if (rpcError) {
          if (rpcError.message?.includes('timeout') || rpcError.message?.includes('upstream')) {
            warn('[PostItemDisplay] ⚠️ View count update timed out - keeping optimistic update');
            return;
          }

          if (rpcError.code === '42883' || rpcError.message?.includes('function')) {
            try {
              const currentDbViews = viewsCountRef.current;
              const newViewsToSet = Math.max(optimisticNewCount, currentDbViews);
              const updatePromise = supabase
                .from('posts')
                .update({ views_count: newViewsToSet })
                .eq('id', item.id);
              const updateTimeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Update timeout')), 3000);
              });
              await Promise.race([updatePromise, updateTimeoutPromise]);
            } catch (updateError) {
              warn('[PostItemDisplay] ⚠️ View count update timed out (fallback)');
            }
          }
        } else {
          const actualNewCount = (newCount as number) || optimisticNewCount;
          const currentCount = viewsCountRef.current;
          if (actualNewCount >= currentCount) {
            setViewsCount(actualNewCount);
            viewsCountRef.current = actualNewCount;
          }
          hasViewedInSessionRef.current = true;
          if (hasPending) {
            setTimeout(() => incrementViewCount(), 100);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          warn('[PostItemDisplay] ⚠️ View count update timed out');
        }
      } finally {
        isViewCountUpdatingRef.current = false;
      }
    }, throttleDelay);
  }, [item.id, item.video_url, user?.id]);

  // Track when photo post is visible for minimum duration
  useEffect(() => {
    if (!isPhotoPost || !isVisible) {
      viewStartTimeRef.current = null;
      return;
    }

    // Start tracking view time when photo becomes visible
    if (isVisible && !hasViewedInSessionRef.current && !viewStartTimeRef.current) {
      viewStartTimeRef.current = Date.now();
    }

    // Check if minimum duration has passed
    if (isVisible && viewStartTimeRef.current && !hasViewedInSessionRef.current) {
      const checkDuration = setInterval(() => {
        if (viewStartTimeRef.current) {
          const viewDuration = Date.now() - viewStartTimeRef.current;
          if (viewDuration >= MIN_VIEW_DURATION) {
            incrementViewCount();
            viewStartTimeRef.current = null;
            clearInterval(checkDuration);
          }
        }
      }, 500); // Check every 500ms

      return () => clearInterval(checkDuration);
    }
  }, [isVisible, isPhotoPost, incrementViewCount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (viewCountUpdateTimeoutRef.current) {
        clearTimeout(viewCountUpdateTimeoutRef.current);
        viewCountUpdateTimeoutRef.current = null;
      }
      isViewCountUpdatingRef.current = false;
      pendingViewCountUpdateRef.current = false;
    };
  }, []);

  // Update the image press handlers to pass the full image set
  const handleImagePress = (imageUrl: string, index: number) => {
    if ((validImageUrls?.length || 0) > 0) {
      setViewingImage(imageUrl, validImageUrls, index);
    } else {
      setViewingImage(imageUrl);
    }
  };

  return (
    <View style={[
      styles.postContainer,
      isOfficialPost && styles.officialPostContainer,
      item.is_pinned && styles.pinnedPostContainer,
      styles.postContainerFlat,
    ]}>
      {/* Pinned indicator */}
      {item.is_pinned && (
        <View style={[styles.pinnedBadge, { backgroundColor: themeColors.primary.main + '15' }]}>
          <Pin size={12} color={themeColors.primary.main} />
          <Text style={[styles.pinnedText, { color: themeColors.primary.main }]}>
            Pinned
          </Text>
        </View>
      )}
      
      {/* No card background - Instagram style */}
        {/* Show loading overlay if post is being deleted */}
        {item.isDeleting && (
          <View style={[styles.deletingOverlay, themeStyles.overlayBg]}>
            <ActivityIndicator size="large" color={themeColors.primary.main} />
            <Text style={[styles.deletingText, themeStyles.text]}>Deleting post...</Text>
          </View>
        )}
        
        {/* Post Header */}
        <PostHeader
          item={item}
          themeColors={themeColors}
          isDark={isDark}
          isOwner={isOwner}
          isDeleting={item.isDeleting}
          navigateToUserProfile={navigateToUserProfile}
          setPostMenuVisible={setPostMenuVisible}
          setSelectedPost={setSelectedPost}
        />

      {/* Post content + media — single feed column (caption + media share one layout) */}
      <View style={styles.postContentAndMediaWrapper}>
        <View style={styles.feedBody}>
        {item.post_type === 'poll' && item.poll && (
          <View style={styles.insetHorizontal}>
            <PollPostCard 
              postId={item.id} 
              themeColors={themeColors} 
              poll={item.poll as any} 
              onVoted={refreshPoll}
              postCreatorId={item.user_id}
            />
          </View>
        )}

        {item.post_type === 'question' && item.question && (
          <View style={styles.insetHorizontal}>
            <QuestionPostCard postId={item.id} themeColors={themeColors} question={item.question as any} onAnswered={refreshQuestion} />
          </View>
        )}

        {item.audio_url && !hasVideo ? (
          <View style={styles.musicBlock}>
            {item.content &&
             !(item.post_type === 'poll' && item.poll && item.content.trim() === item.poll.question.trim()) &&
             !(item.post_type === 'question' && item.question && item.content.trim() === item.question.question.trim()) ? (
              <PostContent
                content={item.content}
                hashtags={hashtags}
                displayedContent={displayedContent}
                needsTruncation={needsTruncation}
                isContentExpanded={isContentExpanded}
                isOfficialPost={isOfficialPost}
                themeColors={themeColors}
                onToggleExpand={() => togglePostContentExpansion(item.id)}
              />
            ) : null}
            <View style={[styles.musicPostSoundBar, { borderTopColor: themeColors.border }]}>
              <View style={styles.musicPostSoundBarLeft}>
                <View style={styles.musicPostLogoWrap}>
                  <AppLogo size={22} />
                </View>
                <Text style={[styles.musicPostTrack, { color: themeColors.text }]} numberOfLines={1}>
                  {item.audio_title || 'Track'} · {item.audio_artist || 'Nomli Mingle Original'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={toggleGlobalMute}
                style={[styles.musicPostMuteBtn, { backgroundColor: themeColors.primary.main + '22' }]}
                activeOpacity={0.8}
              >
                {isGlobalMuted ? (
                  <VolumeX size={16} color={themeColors.primary.main} />
                ) : (
                  <Volume2 size={16} color={themeColors.primary.main} />
                )}
              </TouchableOpacity>
            </View>
            <PostAudioAutoPlay audioUrl={item.audio_url} isVisible={isActiveForAudio && !isGlobalMuted} />
          </View>
        ) : (
          <>
            {item.content && 
             !(item.post_type === 'poll' && item.poll && item.content.trim() === item.poll.question.trim()) &&
             !(item.post_type === 'question' && item.question && item.content.trim() === item.question.question.trim()) ? (
              <View style={styles.insetHorizontal}>
                <PostContent
                  content={item.content}
                  hashtags={hashtags}
                  displayedContent={displayedContent}
                  needsTruncation={needsTruncation}
                  isContentExpanded={isContentExpanded}
                  isOfficialPost={isOfficialPost}
                  themeColors={themeColors}
                  onToggleExpand={() => togglePostContentExpansion(item.id)}
                />
              </View>
            ) : null}
            {item.audio_url && hasVideo && (
              <View style={styles.insetHorizontal}>
              <PostMusicStrip
                audioUrl={item.audio_url}
                title={item.audio_title ?? undefined}
                artist={item.audio_artist ?? undefined}
                themeColors={themeColors}
              />
              </View>
            )}
          </>
        )}

      {/* Post media (if any) — same shell as video for visual consistency */}
      {hasVideo ? (
        <View style={[
          styles.mediaShell,
          { backgroundColor: isDark ? '#0a0a0b' : '#f1f1f3' },
          styles.videoContainer,
          videoAspectRatio && videoAspectRatio > 0 ? {
            aspectRatio: undefined,
            height: Math.min(
              Dimensions.get('window').width / videoAspectRatio,
              Dimensions.get('window').height * 0.28
            ),
          } : {}
        ]}>
          <Video
            source={{ uri: item.video_url as string }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isVisible}
            isLooping
            useNativeControls
            isMuted={!isVisible}
            onPlaybackStatusUpdate={(status) => {
              // Detect video dimensions when video loads (same approach as VideoPostItem)
              if (status.isLoaded && status.naturalSize && !videoAspectRatio) {
                const { width, height } = status.naturalSize;
                if (width && height && width > 0 && height > 0) {
                  const aspectRatio = width / height;
                  setVideoAspectRatio(aspectRatio);
                  log(`[PostItemDisplay] Video aspect ratio detected: ${aspectRatio.toFixed(2)} (${width}x${height})`);
                }
              }
            }}
          />
        </View>
      ) : (validImageUrls?.length || 0) > 0 ? (
        <View style={[
          styles.mediaShell,
          { backgroundColor: isDark ? '#0a0a0b' : '#f1f1f3' },
          styles.imageContainer,
          imageHeight ? { 
            height: imageHeight,
            aspectRatio: undefined,
            maxHeight: Dimensions.get('window').height * 0.28
          } : {}
        ]}>
          {/* Double-tap overlay - transparent, handles double-tap without blocking single taps */}
          <Pressable 
            style={StyleSheet.absoluteFill}
            {...doubleTapHandlers}
            pointerEvents="auto"
          />
          {hasMultipleImages ? (
            // Smooth swipeable carousel for multiple images (Instagram-style)
            <View style={styles.imageCarouselContainer}>
              <AnimatedScrollView
                ref={carouselScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                snapToInterval={screenWidth}
                snapToAlignment="center"
                decelerationRate="fast"
                scrollEventThrottle={16}
                bounces={false}
                style={styles.imageCarousel}
                onScroll={useAnimatedScrollHandler({
                  onScroll: (event) => {
                    // Track scroll position for page indicators
                    // Use screenWidth constant (not Dimensions.get) - worklets can't access JS APIs
                    const offsetX = event.contentOffset.x;
                    const pageIndex = Math.round(offsetX / screenWidth);
                    runOnJS(setCurrentImageIndex)(Math.min(pageIndex, validImageUrls.length - 1));
                  },
                })}
              >
                {validImageUrls.map((url, index) => (
                  <TouchableOpacity
                    key={`${item.id}_${index}`}
                    style={styles.carouselImageWrapper}
                    onPress={() => handleImagePress(url, index)}
                    activeOpacity={0.95}
                  >
                    {/* Blurred Background - Instagram-style for empty sides */}
                    {/* Always render to fill empty sides, not just when visible */}
                    <View style={styles.carouselBlurredBackground}>
                      <Image
                        source={{ uri: url }}
                        style={styles.carouselBlurredImage}
                        contentFit="cover"
                        blurRadius={30}
                        transition={200}
                        cachePolicy="memory-disk"
                        recyclingKey={`${item.id}_${index}_blur`}
                        priority="low"
                      />
                      {/* Additional blur overlay for stronger effect */}
                      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
                    </View>
                    <OptimizedImage
                      source={url}
                      style={styles.carouselImage}
                      contentFit="contain"
                      contentPosition="center"
                      priority={isVisible && index === 0 ? "high" : "low"} // Both platforms: Use high priority for visible images
                      recyclingKey={`${item.id}_${index}`}
                      defaultSource={require('../assets/images/default-avatar.png')}
                      isVisible={isVisible && index === 0}
                      initialTier="medium"
                      maxTier="full"
                      onLoad={() => {
                        if (index === 0) setImageLoaded(true);
                      }}
                      onError={(e) => {
                        // Only log in development to avoid performance impact
                        if (__DEV__) {
                        log('Image load error:', e.nativeEvent.error, 'URL:', url);
                        }
                        if (index === 0) setImageError(true);
                      }}
                      onPress={() => handleImagePress(url, index)}
                    />
                    {/* App Watermark for each image */}
                    <AppWatermark
                      visible={true}
                      position="bottom-right"
                      size="small"
                      variant="outline"
                      opacity={0.9}
                    />
                    {/* View count overlay for first image only */}
                    {isPhotoPost && index === 0 && formatViewCountLabel(viewsCount, item.created_at) !== '' && (
                      <View style={styles.imageViewCountBadge}>
                        <Eye size={12} color="white" />
                        <Text style={styles.imageViewCountText} numberOfLines={1}>
                          {formatViewCountLabel(viewsCount, item.created_at)}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </AnimatedScrollView>
              {/* Page indicators */}
              {validImageUrls.length > 1 && (
                <View style={styles.pageIndicatorContainer}>
                  {validImageUrls.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.pageIndicator,
                        currentImageIndex === index && styles.pageIndicatorActive,
                      ]}
                    />
                  ))}
                </View>
              )}
              {/* Photo count badge */}
              <View style={styles.multiPhotoIndicator}>
                <Text style={styles.multiPhotoIndicatorText}>
                  {validImageUrls.length} {validImageUrls.length === 1 ? 'Photo' : 'Photos'}
                </Text>
              </View>
            </View>
          ) : (
            // Single image with blurred background (Instagram style)
            <View style={styles.postImageWrapper}>
              {/* Blurred Background - Instagram style */}
              {/* 
                OPTIMIZATION: Only render blur when image is visible to reduce API calls.
                Uses same URI as main image, so expo-image will reuse cached version (no duplicate download).
                Low priority ensures main image loads first.
              */}
              {/* Blurred Background - Always render to fill empty sides (Instagram-style) */}
              <View style={styles.blurredImageBackground}>
                <Image
                  source={{ uri: validImageUrls[0] }}
                  style={styles.blurredBackgroundImage}
                  contentFit="cover"
                  blurRadius={30}
                  transition={200}
                  cachePolicy="memory-disk"
                  recyclingKey={`${item.id}_blur`}
                  priority="low"
                />
                {/* Additional blur overlay for stronger effect */}
                <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
              </View>
              
              <OptimizedImage
                source={validImageUrls[0]}
                style={[
                  styles.postImage,
                  imageHeight && { height: imageHeight }
                ]}
                contentFit="contain"
                contentPosition="center"
                priority={isVisible ? "high" : "low"} // Both platforms: Use high priority for visible images
                recyclingKey={item.id}
                defaultSource={require('../assets/images/default-avatar.png')}
                isVisible={isVisible}
                initialTier="medium"
                maxTier="full"
                onPress={() => handleImagePress(validImageUrls[0], 0)}
                onLoad={() => {
                  setImageLoaded(true);
                  // Note: Height calculation handled by component styles
                }}
                onError={(e) => {
                  // Only log in development to avoid performance impact
                  if (__DEV__) {
                  log('Image load error:', e, 'URL:', validImageUrls[0]);
                  }
                  setImageError(true);
                }}
              />
                {/* App Watermark for single image */}
                <AppWatermark
                  visible={true}
                  position="bottom-right"
                  size="medium"
                  variant="outline"
                  opacity={0.9}
                />
                {/* View count overlay for photo posts */}
                {isPhotoPost && formatViewCountLabel(viewsCount, item.created_at) !== '' && (
                  <View style={styles.imageViewCountBadge}>
                    <Eye size={12} color="white" />
                    <Text style={styles.imageViewCountText} numberOfLines={1}>
                      {formatViewCountLabel(viewsCount, item.created_at)}
                    </Text>
                  </View>
                )}
            </View>
          )}
          
          {!imageLoaded && !imageError && (
            <View style={[styles.imageLoadingOverlay, themeStyles.overlayBg]}>
              <ActivityIndicator color={themeColors.primary.main} size="small" />
            </View>
          )}
          {imageError && (
            <View 
              style={[styles.imageErrorOverlay, { backgroundColor: themeColors.error.main + '80' }]}
              pointerEvents="none"
            >
              <Text style={[styles.imageErrorText, { color: themeColors.neutral.card }]}>Image could not be loaded</Text>
            </View>
          )}
          
          {/* Double-tap heart animation */}
          <DoubleTapHeart
            visible={showHeart}
            x={heartPosition.x}
            y={heartPosition.y}
            onAnimationComplete={() => setShowHeart(false)}
          />
        </View>
      ) : null}

        </View>

        {/* 18+ overlay (Twitter-style: blur + label + Show to reveal) */}
        {showAdultOverlay && (
          <View style={[StyleSheet.absoluteFill, styles.adultContentOverlay]} pointerEvents="box-none">
            <View style={styles.adultContentOverlayInner} pointerEvents="auto">
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.adultContentOverlayContent}>
                <Text style={styles.adultContentLabel}>18+</Text>
                <Text style={styles.adultContentHint}>This post may contain sensitive content</Text>
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
      </View>

      {/* Post actions */}
      <PostActions
        item={item}
        themeColors={themeColors}
        userReaction={userReaction}
        reactionCounts={reactionCounts}
        isExpanded={isExpanded}
        isPhotoPost={isPhotoPost}
        viewsCount={viewsCount}
        likeButtonRef={likeButtonRef}
        onLikePress={async () => {
          if (!user) {
            Alert.alert(
              'Login Required',
              'You need to login to zap posts. Would you like to login now?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Login', onPress: () => router.push('/auth/signin') }
              ]
            );
            return;
          }
          try {
            await toggleReaction(item.id, 'like');
            const newReaction = await getUserReaction(item.id);
            setUserReaction(newReaction);
            const counts = await getReactionCounts(item.id);
            setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
            setPosts((current: Post[]) => 
              current.map(post => {
                if (post.id === item.id) {
                  return {
                    ...post,
                    likes_count: counts.likes + counts.loves + counts.laughs,
                    liked_by_user: !!newReaction
                  };
                }
                return post;
              })
            );
            if (newReaction) setShowLikeBurst(true);
          } catch (error) {
            error('[PostItemDisplay] Error toggling like:', error);
            handleLike(item.id);
          }
        }}
        onLikeLongPress={(event) => {
          if (!user) {
            Alert.alert(
              'Login Required',
              'You need to login to zap posts. Would you like to login now?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Login', onPress: () => router.push('/auth/signin') }
              ]
            );
            return;
          }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (event?.nativeEvent?.pageX && event?.nativeEvent?.pageY) {
            setReactionPickerPosition({ 
              x: event.nativeEvent.pageX, 
              y: event.nativeEvent.pageY - 20 
            });
            setShowReactionPicker(true);
          } else {
            likeButtonRef.current?.measure((x, y, width, height, pageX, pageY) => {
              setReactionPickerPosition({ x: pageX + width / 2, y: pageY - 20 });
              setShowReactionPicker(true);
            });
          }
        }}
        onCommentPress={() => handlePostExpansion(item.id)}
        onBookmarkPress={() => {
          if ((!user || item.user_id !== user.id) && item.bookmarks_count && item.bookmarks_count > 0) {
            if (setShowPrivacyModal) {
              setShowPrivacyModal(true);
            }
          } else {
            handleBookmark(item.id);
          }
        }}
        isBoosted={isBoosted}
        onLikesModalPress={() => setShowLikesModal(item.id)}
        onBoostPress={onBoostPost ? () => onBoostPost(item.id) : undefined}
        showLikeBurst={showLikeBurst}
        onLikeBurstComplete={() => setShowLikeBurst(false)}
      />

      {/* Reaction Picker - kept here for state management */}
      <ReactionPicker
        visible={showReactionPicker}
        currentReaction={userReaction}
        onReactionSelect={async (reaction: PickerReactionType) => {
          if (!user) return;
          log('[PostItemDisplay] Reaction selected:', reaction, 'for post:', item.id);
          
          const previousReaction = userReaction;
          const previousCounts = { ...reactionCounts };
          
          if (previousReaction === reaction) {
            setUserReaction(null);
            if (previousReaction === 'like') {
              setReactionCounts({ ...previousCounts, likes: Math.max(0, previousCounts.likes - 1) });
            } else if (previousReaction === 'love') {
              setReactionCounts({ ...previousCounts, loves: Math.max(0, previousCounts.loves - 1) });
            } else if (previousReaction === 'laugh') {
              setReactionCounts({ ...previousCounts, laughs: Math.max(0, previousCounts.laughs - 1) });
            }
          } else {
            setUserReaction(reaction);
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
            if (reaction === 'like') {
              newCounts.likes = (newCounts.likes || 0) + 1;
            } else if (reaction === 'love') {
              newCounts.loves = (newCounts.loves || 0) + 1;
            } else if (reaction === 'laugh') {
              newCounts.laughs = (newCounts.laughs || 0) + 1;
            }
            setReactionCounts(newCounts);
          }
          
          try {
            const toggleResult = await toggleReaction(item.id, reaction);
            if (!toggleResult || toggleResult.success === false) {
              setUserReaction(previousReaction);
              setReactionCounts(previousCounts);
              if (__DEV__) {
                Alert.alert('Reaction Error', `Failed to ${previousReaction === reaction ? 'remove' : 'add'} reaction.`);
              }
              return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            const newReaction = await getUserReaction(item.id);
            setUserReaction(newReaction);
            const counts = await getReactionCounts(item.id);
            setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
            setPosts((current: Post[]) => 
              current.map(post => {
                if (post.id === item.id) {
                  return {
                    ...post,
                    likes_count: counts.likes + counts.loves + counts.laughs,
                    liked_by_user: !!newReaction
                  };
                }
                return post;
              })
            );
          } catch (error) {
            error('[PostItemDisplay] Error toggling reaction:', error);
            setUserReaction(previousReaction);
            setReactionCounts(previousCounts);
          }
        }}
        onClose={() => {
          log('[PostItemDisplay] Closing reaction picker');
          setShowReactionPicker(false);
        }}
        position={reactionPickerPosition}
      />

      {/* Expandable Comments Section - Same as Video Posts */}
      {isExpanded && !item.comments_disabled && (
        <View style={[styles.commentSection, { backgroundColor: 'transparent' }]}>
          {/* Comments List */}
          {(() => {
            // Show loading only if we're actively loading comments for this post
            const isLoading = loadingComments.has(item.id);
            const comments = postComments[item.id] || [];
            const hasComments = comments.length > 0;
            const hasCachedComments = postComments[item.id] !== undefined && postComments[item.id] !== null;
            
            // Show cached comments immediately, even while loading
            if (hasCachedComments && hasComments) {
              const threadedComments = organizeCommentsIntoThreads(comments);
              return (
                <ScrollView 
                  ref={(ref) => setCommentScrollViewRef?.(item.id, ref)}
                  style={styles.commentsListScrollView}
                  contentContainerStyle={[styles.commentsList, { paddingBottom: Spacing.xl + Spacing.md }]} // Extra bottom padding to prevent cropping
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  bounces={true}
                >
                  {/* Show loading indicator at top if still loading */}
                  {isLoading && (
                    <View style={styles.commentsLoading}>
                      <ActivityIndicator size="small" color={themeColors.primary.main} />
                      <Text style={[styles.commentsLoadingText, themeStyles.subtext]}>Updating comments...</Text>
                    </View>
                  )}
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
                            isDarkMode={isDark}
                            isVerified={comment.profiles?.is_verified || false}
                            fullName={comment.profiles?.full_name}
                            username={comment.username}
                          />
                        </TouchableOpacity>
                        <View style={[styles.commentContent, { backgroundColor: 'transparent' }]}>
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
                              onLongPress={async () => {
                                if (!user || user.id === comment.user_id) return; // Don't show menu for own comments
                                
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                
                                // Check if already following
                                const isFollowingUser = await isFollowing(comment.user_id, user.id);
                                
                                setCommenterMenuVisible({
                                  commentId: comment.id,
                                  userId: comment.user_id,
                                  username: comment.username || comment.user_email?.split('@')[0] || 'User'
                                });
                                
                                // Update follow status in state
                                if (isFollowingUser) {
                                  setFollowingUsers(prev => new Set(prev).add(comment.user_id));
                                } else {
                                  setFollowingUsers(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(comment.user_id);
                                    return newSet;
                                  });
                                }
                              }}
                              activeOpacity={0.7}
                              delayLongPress={400}
                            >
                              <Text style={[styles.commentUsername, { color: themeColors.primary.main }]} numberOfLines={1} ellipsizeMode="tail">
                                {(() => {
                                  try {
                                    return sanitizeUsernameForDisplay(comment.username || comment.user_email?.split('@')[0]);
                                  } catch (error) {
                                    error('[Community] Error sanitizing comment username:', error);
                                    return comment.username || comment.user_email?.split('@')[0] || 'User';
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
                                onPress={() => {
                                  setSelectedComment(comment);
                                  setCommentMenuVisible(comment.id);
                                }}
                                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                              >
                                <MoreVertical size={16} color={themeColors.neutral.subtext} />
                              </TouchableOpacity>
                            )}
                          </View>
                          
                          {/* Pinned indicator */}
                          {comment.is_pinned && (
                            <View style={[styles.commentPinnedBadge, { backgroundColor: themeColors.primary.main + '15' }]}>
                              <Pin size={12} color={themeColors.primary.main} />
                              <Text style={[styles.commentPinnedText, { color: themeColors.primary.main }]}>
                                Pinned
                              </Text>
                            </View>
                          )}
                          
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
                                    isDarkMode={isDark}
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
                                  </View>
                                  <Text style={[styles.commentText, themeStyles.text]}>
                                    {reply.content}
                                  </Text>
                                  
                                  {/* Reply actions */}
                                  {user && (
                                    <View style={styles.commentActions}>
                                      <TouchableOpacity
                                        style={styles.commentActionButton}
                                        onPress={() => {
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
            }
            
            // Don't show loading spinner - comments load quietly in background
            // if (isLoading && !hasCachedComments) {
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
            
            // Show comments list (fallback case)
            const threadedComments = organizeCommentsIntoThreads(comments);
            return (
              <ScrollView 
                ref={(ref) => setCommentScrollViewRef?.(item.id, ref)}
                style={styles.commentsListScrollView}
                contentContainerStyle={[styles.commentsList, { paddingBottom: Spacing.xl + Spacing.md }]} // Extra bottom padding to prevent cropping
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
                            isDarkMode={isDark}
                            isVerified={comment.profiles?.is_verified || false}
                            fullName={comment.profiles?.full_name}
                            username={comment.username}
                          />
                        </TouchableOpacity>
                        <View style={[styles.commentContent, { backgroundColor: 'transparent' }]}>
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
                                    return sanitizeUsernameForDisplay(comment.username || comment.user_email?.split('@')[0]);
                                  } catch (error) {
                                    error('[Community] Error sanitizing comment username:', error);
                                    return comment.username || comment.user_email?.split('@')[0] || 'User';
                                  }
                                })()}
                              </Text>
                            </TouchableOpacity>
                            <Text style={[styles.commentTime, themeStyles.textSecondary]}>
                              {formatTimeAgo(comment.created_at)}
                            </Text>
                          </View>
                          <Text style={[styles.commentText, themeStyles.text]}>
                            {comment.content}
                          </Text>
                          {user && (
                            <View style={styles.commentActions}>
                              <TouchableOpacity
                                style={styles.commentActionButton}
                                onPress={() => {
                                  if (item.comments_disabled || item.isPlaceholder) {
                                    setShowCommentsDisabledModal(true);
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
                                  if (user?.id) {
                                    handleToggleCommentLike(item.id, comment.id, user.id);
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
                      <View style={[styles.commentSeparatorLine, { 
                        backgroundColor: themeColors.neutral.border 
                      }]} />
                    </View>
                  );
                })}
              </ScrollView>
            );
          })()}

          {/* Comment Input - TikTok Style */}
          <View style={[styles.commentInputWrapper, { backgroundColor: themeColors.neutral.card }]}>
            <CommentInput
              postId={item.id}
              commentText={commentTexts[item.id] || ''}
              isSubmitting={isSubmittingComment}
              isDisabled={item.comments_disabled}
              themeColors={themeColors}
              onChangeText={(text) => setCommentTexts(prev => ({ ...prev, [item.id]: text }))}
              onSubmit={() => handleCommentSubmit(item.id)}
              onDisabledPress={() => {
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
            />
          </View>
        </View>
      )}

    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo - only re-render if props actually change
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.likes_count === nextProps.item.likes_count &&
    prevProps.item.liked_by_user === nextProps.item.liked_by_user &&
    prevProps.item.bookmarked === nextProps.item.bookmarked &&
    prevProps.item.isBookmarked === nextProps.item.isBookmarked &&
    prevProps.item.bookmarks_count === nextProps.item.bookmarks_count &&
    prevProps.expandedPosts.has(prevProps.item.id) === nextProps.expandedPosts.has(nextProps.item.id) &&
    prevProps.expandedPostContent.has(prevProps.item.id) === nextProps.expandedPostContent.has(nextProps.item.id) &&
    (prevProps.postComments[prevProps.item.id]?.length || 0) === (nextProps.postComments[nextProps.item.id]?.length || 0) &&
    prevProps.user?.id === nextProps.user?.id &&
    prevProps.isDark === nextProps.isDark &&
    (prevProps.commentTexts[prevProps.item.id] || '') === (nextProps.commentTexts[nextProps.item.id] || '') &&
    prevProps.submittingComments.has(prevProps.item.id) === nextProps.submittingComments.has(nextProps.item.id) &&
    // Check if expandedThreads changed for any comment in this post
    (() => {
      const prevComments = prevProps.postComments[prevProps.item.id] || [];
      const nextComments = nextProps.postComments[nextProps.item.id] || [];
      // Check if any comment's expanded state changed
      for (const comment of prevComments) {
        if (prevProps.expandedThreads.has(comment.id) !== nextProps.expandedThreads.has(comment.id)) {
          return false; // expandedThreads changed, need to re-render
        }
      }
      for (const comment of nextComments) {
        if (prevProps.expandedThreads.has(comment.id) !== nextProps.expandedThreads.has(comment.id)) {
          return false; // expandedThreads changed, need to re-render
        }
      }
      return true; // expandedThreads didn't change for any comment in this post
    })()
  );
});



const styles = StyleSheet.create({
  postContainer: {
    marginHorizontal: 0,
    marginBottom: 0,
    backgroundColor: 'transparent',
    position: 'relative', // Needed for absolute positioned deletingOverlay
  },
  postContainerFlat: {
    overflow: 'visible',
    marginBottom: 20,
  },
  insetHorizontal: {
    paddingHorizontal: 14,
  },
  musicBlock: {
    width: '100%',
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    paddingHorizontal: 14,
  },
  /** Single column for poll / question / caption / music / media */
  feedBody: {
    width: '100%',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  /** Shared shell for photo + video — full-bleed, no card radius */
  mediaShell: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 0,
    overflow: 'hidden',
  },
  musicPostSoundBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  musicPostSoundBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: Spacing.sm,
  },
  musicPostLogoWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  musicPostTrack: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.sm,
    minWidth: 0,
  },
  musicPostMuteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  videoContainer: {
    minHeight: Dimensions.get('window').width / (16 / 9),
    maxHeight: Dimensions.get('window').height * 0.28,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  officialPostContainer: {
    // No yellow bar or tint; official posts use verified badge + subtle typography only
  },
  officialPostContent: {
    fontFamily: FontFamily.regular,
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  pinnedPostContainer: {
    // Pinned state uses badge only — no extra bar (flat feed)
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginHorizontal: 14,
    marginTop: 6,
    borderRadius: 6,
  },
  pinnedText: {
    fontSize: 9,
    fontFamily: FontFamily.semibold,
    textTransform: 'lowercase',
    letterSpacing: 0.3,
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
    marginLeft: 10,
    flex: 1,
  },
  userNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  userName: {
    fontSize: 12,
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
    fontSize: 11,
    fontFamily: FontFamily.regular,
  },
  locationText: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
  },
  postContentAndMediaWrapper: {
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  adultContentOverlay: {
    position: 'absolute',
    left: -1,
    right: -1,
    top: -1,
    bottom: -1,
    width: undefined,
    minHeight: undefined,
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
    paddingHorizontal: Spacing.xl,
    maxWidth: 280,
  },
  adultContentLabel: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: Spacing.xs,
  },
  adultContentHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  adultContentShowButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    minWidth: 120,
    alignItems: 'center',
  },
  adultContentShowButtonText: {
    fontSize: FontSizes.button,
    fontWeight: '600',
    color: '#fff',
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
    fontSize: 11,
    fontFamily: FontFamily.regular,
    lineHeight: 16,
    letterSpacing: 0.1,
    fontWeight: '400',
  },
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
  noCommentsText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  commentsList: {
    paddingBottom: Spacing.xl, // Extra padding to prevent content from being cropped
    paddingTop: Spacing.xs, // Small top padding
  },
  commentsListScrollView: {
    maxHeight: Math.min(SCREEN_HEIGHT * 0.5, 400), // Max 50% of screen height or 400px, whichever is smaller
    paddingBottom: Spacing.sm, // Add padding to ScrollView itself to prevent cropping
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
  commentInputWrapper: {
    flexDirection: 'column',
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
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
  commentSection: {
    paddingHorizontal: 14,
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
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
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
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
  imageCarouselContainer: {
    width: '100%',
    // Same logic as video feed: fixed height so image fits with contain (no cropping)
    // Reduced from 0.5 to 0.4 for more compact, modern look aligned with 2025 trends
    height: Dimensions.get('window').height * 0.4,
    backgroundColor: '#000',
    position: 'relative',
  },
  imageContainer: {
    marginBottom: 0,
    position: 'relative',
    backgroundColor: 'transparent',
    alignSelf: 'stretch',
    minHeight: Dimensions.get('window').width * 0.28,
    maxHeight: Dimensions.get('window').height * 0.28,
  },
  postImageWrapper: {
    width: '100%',
    position: 'relative',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    minHeight: Dimensions.get('window').width * 0.28,
    maxHeight: Dimensions.get('window').height * 0.28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
  },
  blurredImageBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  blurredBackgroundImage: {
    width: '100%',
    height: '100%',
  },
  postImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent', // Transparent so blurred background shows through
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 16,
    minHeight: 30,
  },
  actionText: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    marginLeft: 6,
    letterSpacing: 0.1,
  },
  viewCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 4,
  },
  viewCountText: {
    fontSize: 11,
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
  readMoreButton: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.caption,
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
});

export default PostItemDisplay;
