import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { MessageSquare, Bookmark, MoreVertical, Send, Reply, X } from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { formatTimeAgo } from '../utils/formatters';
import SimpleAvatar from './SimpleAvatar';
import { stripAtSymbol } from '../utils/contentFilter';
import ReactionPicker, { ReactionType } from './ReactionPicker';
import { toggleReaction, getUserReaction, getReactionCounts } from '../utils/reactionUtils';
import PostReactionsCounter from './PostReactionsCounter';
import * as Haptics from 'expo-haptics';
import { Post, Comment } from '../utils/communityUtils';
import { log, warn, error } from '../utils/productionLogger';
import { getAgeGateFlags } from '../utils/ageGate';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReactionIcon } from './reactions/ReactionIcon';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PostDetailContentProps {
  post: Post;
  comments: Comment[];
  user: any;
  onLike: () => void;
  onBookmark: () => void;
  onCommentSubmit: (text: string) => void;
  commentText: string;
  setCommentText: (text: string) => void;
  submitting: boolean;
  replyingToComment: Comment | null;
  onCancelReply: () => void;
  onReplyToComment: (comment: Comment) => void;
  onToggleCommentLike: (comment: Comment) => void;
  renderComment: (comment: Comment & { replies?: Comment[] }, depth?: number) => React.ReactNode;
  threadedComments: (Comment & { replies?: Comment[] })[];
  commentsLoading: boolean;
}

const PostDetailContent: React.FC<PostDetailContentProps> = ({
  post,
  comments,
  user,
  onLike,
  onBookmark,
  onCommentSubmit,
  commentText,
  setCommentText,
  submitting,
  replyingToComment,
  onCancelReply,
  onReplyToComment,
  onToggleCommentLike,
  renderComment,
  threadedComments,
  commentsLoading,
}) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const likeButtonRef = useRef<TouchableOpacity>(null);
  const ageGate = useMemo(() => getAgeGateFlags({ userMetadata: user?.user_metadata }), [user?.user_metadata]);
  const shouldBlurMedia = Boolean(post.video_url || (post.image_urls?.length || post.image_url)) && ageGate.isUnder16;

  const [videoThumbUri, setVideoThumbUri] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const videoUrl = post.video_url;

  const videoHeight = useMemo(() => {
    if (!videoUrl) return 0;
    const screenH = Dimensions.get('window').height;
    const maxH = Math.min(screenH * 0.62, 560);
    const minH = 220;
    if (!videoSize) return Math.min(Math.max(screenH * 0.48, minH), maxH);
    const ratio = videoSize.w / videoSize.h;
    const exact = SCREEN_WIDTH / ratio;
    return Math.max(minH, Math.min(exact, maxH));
  }, [videoUrl, videoSize, insets.top]);

  useEffect(() => {
    let cancelled = false;
    if (!videoUrl) return;
    (async () => {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, { time: 250 });
        if (!cancelled) setVideoThumbUri(uri);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoUrl]);
  
  // Reaction state
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionPickerPosition, setReactionPickerPosition] = useState({ x: 0, y: 0 });
  const [userReaction, setUserReaction] = useState<'like' | 'laugh' | null>(null); // Removed 'love'
  const [reactionCounts, setReactionCounts] = useState({ likes: 0, loves: 0, laughs: 0 }); // Keep loves for backward compatibility with existing data
  
  // Load reactions
  useEffect(() => {
    const loadReactions = async () => {
      try {
        const counts = await getReactionCounts(post.id);
        setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
        
        if (user?.id) {
          const reaction = await getUserReaction(post.id);
          setUserReaction(reaction);
        }
      } catch (error) {
        error('Error loading reactions:', error);
      }
    };
    loadReactions();
  }, [post.id, user?.id]);
  
  const handleReactionPress = (event: any) => {
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
  };
  
  const handleReactionSelect = async (reaction: ReactionType) => {
    if (!user) return;
    
    try {
      const previousReaction = userReaction;
      const previousCounts = { ...reactionCounts };
      
      // Optimistic update
      if (previousReaction === reaction) {
        setUserReaction(null);
        if (previousReaction === 'like') {
          setReactionCounts({ ...previousCounts, likes: Math.max(0, previousCounts.likes - 1) });
        // Removed 'love' reaction handling
        } else if (previousReaction === 'laugh') {
          setReactionCounts({ ...previousCounts, laughs: Math.max(0, previousCounts.laughs - 1) });
        }
      } else {
        setUserReaction(reaction);
        if (previousReaction === 'like') {
          setReactionCounts({ ...previousCounts, likes: Math.max(0, previousCounts.likes - 1) });
        // Removed 'love' reaction handling
        } else if (previousReaction === 'laugh') {
          setReactionCounts({ ...previousCounts, laughs: Math.max(0, previousCounts.laughs - 1) });
        }
        
        if (reaction === 'like') {
          setReactionCounts(prev => ({ ...prev, likes: prev.likes + 1 }));
        // Removed 'love' reaction handling
        } else if (reaction === 'laugh') {
          setReactionCounts(prev => ({ ...prev, laughs: prev.laughs + 1 }));
        }
      }
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await toggleReaction(post.id, reaction);
      
      // Refresh counts
      const counts = await getReactionCounts(post.id);
      setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
      
      const newReaction = await getUserReaction(post.id);
      setUserReaction(newReaction);
    } catch (error) {
      error('Error toggling reaction:', error);
      // Revert on error
      const counts = await getReactionCounts(post.id);
      setReactionCounts({ likes: counts.likes, loves: counts.loves, laughs: counts.laughs });
      const reaction = await getUserReaction(post.id);
      setUserReaction(reaction);
    }
  };
  
  const totalReactions = reactionCounts.likes + reactionCounts.loves + reactionCounts.laughs;
  
  // Get image URLs
  const imageUrls = useMemo(() => {
    if (post.image_urls && Array.isArray(post.image_urls) && post.image_urls.length > 0) {
      return post.image_urls.filter(url => !!url);
    }
    if (post.image_url) {
      return [post.image_url];
    }
    return [];
  }, [post]);
  
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.neutral.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Post Header - Premium Design */}
      <View style={[styles.postHeader, { backgroundColor: themeColors.neutral.card }]}>
        <View style={styles.authorRow}>
          <TouchableOpacity
            onPress={() => router.push(`/profile/${post.user_id}`)}
            style={styles.authorInfo}
          >
            <SimpleAvatar
              avatarUrl={post.profile?.avatar_url}
              userId={post.user_id}
              size={40}
              isDarkMode={isDarkMode}
              isVerified={post.profile?.is_verified || post.is_verified || false}
              fullName={post.profile?.full_name}
              username={post.username}
              email={post.user_email}
            />
            <View style={styles.authorDetails}>
              <Text style={[styles.authorName, { color: themeColors.neutral.text }]}>
                @{(() => {
                  // Check all possible sources for username before showing fallback
                  const username = post.username || 
                                  post.profile?.username ||
                                  post.display_name ||
                                  post.profile?.display_name ||
                                  post.profile?.full_name ||
                                  post.user_email?.split('@')[0] ||
                                  (post.user_id ? `user_${post.user_id.substring(0, 8)}` : 'user');
                  
                  const cleaned = stripAtSymbol(username);
                  return cleaned || 'user';
                })()}
              </Text>
              {post.location && (
                <Text style={[styles.location, { color: themeColors.neutral.textSecondary }]}>
                  {post.location}
                </Text>
              )}
            </View>
          </TouchableOpacity>
          
          {user && user.id === post.user_id && (
            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => {/* Handle menu */}}
            >
              <MoreVertical size={20} color={themeColors.neutral.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Post Content */}
        {post.content && (
          <Text style={[styles.postContent, { color: themeColors.neutral.text }]}>
            {post.content}
          </Text>
        )}
        
        {/* Post Media */}
        {post.video_url ? (
          <View style={[styles.mediaContainer, styles.videoMediaContainer, { height: videoHeight, backgroundColor: isDarkMode ? '#000' : '#F3F4F6' }]}>
            {/* Light blur background to fill letterboxing (no crop). */}
            {videoThumbUri ? (
              <>
                <ExpoImage
                  source={{ uri: videoThumbUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={20}
                />
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)' },
                  ]}
                />
              </>
            ) : null}
            <View style={styles.videoFrame}>
              <Video
                source={{ uri: post.video_url }}
                style={[styles.video, { height: videoHeight }]}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                isLooping={false}
                useNativeControls
                posterSource={videoThumbUri ? { uri: videoThumbUri } : undefined}
                usePoster={!!videoThumbUri}
                onReadyForDisplay={(e: any) => {
                  const ns = e?.naturalSize;
                  const w = ns?.width;
                  const h = ns?.height;
                  if (w && h) setVideoSize({ w, h });
                }}
              />
            </View>
            {shouldBlurMedia && (
              <BlurView intensity={95} tint={isDarkMode ? 'dark' : 'light'} style={styles.ageBlur}>
                <Text style={styles.ageBlurTitle}>16+</Text>
                <Text style={styles.ageBlurSub}>Media blurred for safety</Text>
              </BlurView>
            )}
          </View>
        ) : imageUrls.length > 0 ? (
          <View style={styles.mediaContainer}>
            {imageUrls.length === 1 ? (
              <ExpoImage
                source={{ uri: imageUrls[0] }}
                style={styles.singleImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                {imageUrls.map((url, index) => (
                  <ExpoImage
                    key={index}
                    source={{ uri: url }}
                    style={styles.multiImage}
                    contentFit="cover"
                    transition={200}
                  />
                ))}
              </ScrollView>
            )}
            {shouldBlurMedia && (
              <BlurView intensity={95} tint={isDarkMode ? 'dark' : 'light'} style={styles.ageBlur}>
                <Text style={styles.ageBlurTitle}>16+</Text>
                <Text style={styles.ageBlurSub}>Media blurred for safety</Text>
              </BlurView>
            )}
          </View>
        ) : null}
        
        {/* Reactions Counter */}
        {totalReactions > 0 && (
          <View style={styles.reactionsRow}>
            <PostReactionsCounter
              postId={post.id}
              initialCounts={{
                total: totalReactions,
                likes: reactionCounts.likes,
                loves: reactionCounts.loves,
                laughs: reactionCounts.laughs,
              }}
            />
          </View>
        )}
        
        {/* Action Buttons - Premium Design */}
        <View style={[styles.actionsRow, { borderTopColor: themeColors.neutral.border }]}>
          <TouchableOpacity
            ref={likeButtonRef}
            style={styles.actionButton}
            onPress={handleReactionPress}
            activeOpacity={0.7}
          >
            <ReactionIcon
              reaction={userReaction}
              size={24}
              activeColor="#FACC15"
              inactiveColor={themeColors.neutral.textSecondary}
            />
            <Text style={[styles.actionText, { color: themeColors.neutral.textSecondary }]}>
              {totalReactions || 0}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {/* Focus comment input */}}
            activeOpacity={0.7}
          >
            <MessageSquare
              size={24}
              color={themeColors.neutral.textSecondary}
              strokeWidth={2}
            />
            <Text style={[styles.actionText, { color: themeColors.neutral.textSecondary }]}>
              {comments.length || 0}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onBookmark}
            activeOpacity={0.7}
          >
            <Bookmark
              size={24}
              color={post.isBookmarked ? themeColors.primary.main : themeColors.neutral.textSecondary}
              fill={post.isBookmarked ? themeColors.primary.main : 'transparent'}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Comments Section */}
      <View style={[styles.commentsSection, { backgroundColor: themeColors.neutral.card }]}>
        <Text style={[styles.commentsTitle, { color: themeColors.neutral.text }]}>
          Comments ({comments.length || 0})
        </Text>
        
        {commentsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={themeColors.primary.main} />
          </View>
        ) : threadedComments.length === 0 ? (
          <View style={styles.emptyComments}>
            <Text style={[styles.emptyText, { color: themeColors.neutral.textSecondary }]}>
              No comments yet. Be the first to comment!
            </Text>
          </View>
        ) : (
          <View style={styles.commentsList}>
            {threadedComments.map(comment => renderComment(comment))}
          </View>
        )}
      </View>
      
      {/* Reaction Picker */}
      <ReactionPicker
        visible={showReactionPicker}
        currentReaction={userReaction}
        onReactionSelect={handleReactionSelect}
        onClose={() => setShowReactionPicker(false)}
        position={reactionPickerPosition}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  postHeader: {
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  authorDetails: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  authorName: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    marginBottom: 2,
  },
  location: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  moreButton: {
    padding: Spacing.xs,
  },
  postContent: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  mediaContainer: {
    width: '100%',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  videoMediaContainer: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  videoFrame: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  ageBlur: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageBlurTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    color: '#fff',
  },
  ageBlurSub: {
    marginTop: 6,
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  video: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  singleImage: {
    width: '100%',
    aspectRatio: 1,
  },
  multiImage: {
    width: SCREEN_WIDTH - Spacing.lg * 2,
    aspectRatio: 1,
  },
  reactionsRow: {
    marginBottom: Spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    gap: Spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  actionText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  commentsSection: {
    padding: Spacing.lg,
    minHeight: 200,
  },
  commentsTitle: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyComments: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  commentsList: {
    gap: Spacing.md,
  },
});

export default PostDetailContent;

