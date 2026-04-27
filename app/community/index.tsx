import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  Image,
  TextInput,
  Platform,
  StatusBar,
  RefreshControl,
  Alert,
  Modal,
  useColorScheme,
  Dimensions,
  Animated as RNAnimated,
  ScrollView,
  Haptics,
  DeviceEventEmitter,
} from 'react-native';
import Animated, { 
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  withSpring,
  runOnJS
} from 'react-native-reanimated';
import { 
  Edit, 
  Heart, 
  MessageSquare, 
  Bookmark, 
  Filter, 
  Search, 
  MoreVertical,
  Trash2,
  Pencil,
  X,
  Send,
  ZoomIn,
  Plus,
  Calendar,
  MapPin,
  Users,
  Menu,
  Play,
  Reply,
  Flag,
} from 'lucide-react-native';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, GlobalStyles, Shadow } from '../../constants/Theme';
import useAuth from '../../hooks/useAuth';
import { useRouter } from 'expo-router';
import { fetchPosts, Post, toggleLike, deletePost, toggleBookmark, fetchComments, addComment, deleteComment, Comment } from '../../utils/communityUtils';
import { formatTimeAgo } from '../../utils/formatters';
import SimpleAvatar from '../../components/SimpleAvatar';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from '@react-navigation/native';
import Header from '../../components/Header';
import { useTheme } from '../../contexts/ThemeContext';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import PostReactionsCounter from '../../components/PostReactionsCounter';
import { resizePostImage } from '../../utils/imageResizer';
import { startContextChat } from '../../utils/chat';
import { log, warn, error } from '../../utils/productionLogger';
import { isUserAdmin } from '../../utils/adminCheck';
import { sendUserReport } from '../../utils/reportUser';


// Get status bar height for different platforms
const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 20 : StatusBar.currentHeight || 0;
const BOTTOM_INSET = Platform.OS === 'ios' ? 34 : 16;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Filter options for community posts
const FILTER_OPTIONS = ['Latest', 'Trending', 'Nearby'];

// Function to get skeleton loading color based on theme
const getSkeletonColor = () => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  return isDarkMode ? themeColors.neutral.surfaceVariant : themeColors.neutral.background;
};

// Skeleton loading component for posts
const SkeletonPost = React.memo(() => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const opacity = useSharedValue(0.3);
  
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value
  }));
  
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000 }),
        withTiming(0.3, { duration: 1000 })
      ),
      -1,
      false
    );
  }, []);
  
  return (
    <Animated.View style={[
      styles.postContainer, 
      { backgroundColor: themeColors.neutral.surface },
      animatedStyle
    ]}>
      {/* Header skeleton */}
      <View style={styles.postHeader}>
        <View style={styles.userInfoContainer}>
          <View style={[styles.skeletonAvatar, { backgroundColor: themeColors.neutral.disabled }]} />
          <View style={styles.userTextContainer}>
            <View style={[styles.skeletonUserName, { backgroundColor: themeColors.neutral.disabled }]} />
            <View style={[styles.skeletonPostTime, { backgroundColor: themeColors.neutral.disabled }]} />
          </View>
        </View>
      </View>
      
      {/* Content skeleton */}
      <View style={styles.postContentContainer}>
        <View style={[styles.skeletonContentLine, { backgroundColor: themeColors.neutral.disabled }]} />
        <View style={[styles.skeletonContentLine, { width: '90%', backgroundColor: themeColors.neutral.disabled }]} />
        <View style={[styles.skeletonContentLine, { width: '75%', backgroundColor: themeColors.neutral.disabled }]} />
      </View>
      
      {/* Image skeleton */}
      <View style={[styles.skeletonImage, { backgroundColor: themeColors.neutral.disabled }]} />
      
      {/* Actions skeleton */}
      <View style={[styles.postActions, { borderTopColor: themeColors.neutral.border }]}>
        <View style={[styles.skeletonAction, { backgroundColor: themeColors.neutral.disabled }]} />
        <View style={[styles.skeletonAction, { backgroundColor: themeColors.neutral.disabled }]} />
        <View style={[styles.skeletonAction, { backgroundColor: themeColors.neutral.disabled }]} />
      </View>
    </Animated.View>
  );
}, () => true);

// Define an interface for PostItemDisplay props
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
  viewerIsAdmin?: boolean;
}

// Add a helper function to validate image URLs
const isValidImageUrl = (url?: string) => {
  if (!url) return false;
  
  // Check for common invalid URLs
  if (url.startsWith('file:///data/user/0/com.nomli.mingle/cache/')) {
    log('[Community] Skipping cached image that might be invalid:', url);
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

const getPostTextForContext = (post: any): string => {
  return (
    post?.content ??
    post?.text ??
    post?.caption ??
    post?.post_text ??
    ''
  );
};

// Helper function to generate video thumbnail URL
const generateVideoThumbnailUrl = (videoUrl: string): string => {
  log('🔍 [Community] Processing video URL:', videoUrl);
  
  // Handle Mux videos directly - simple approach
  if (videoUrl.includes('stream.mux.com')) {
    try {
      // Extract playback ID from Mux URL
      // Format: https://stream.mux.com/{playbackId}.m3u8
      const urlParts = videoUrl.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      let playbackId = lastPart.split('.')[0]; // Remove .m3u8 extension
      
      if (playbackId) {
        const thumbnailUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0&width=400&height=600&fit_mode=smartcrop`;
        log('🖼️ [Community] Generated Mux thumbnail:', thumbnailUrl);
        return thumbnailUrl;
      }
    } catch (error) {
      log('❌ [Community] Error generating Mux thumbnail:', error);
    }
  }
  
  // Fallback: use a generic video placeholder
  log('⚠️ [Community] Using fallback placeholder for URL:', videoUrl);
  return 'https://via.placeholder.com/400x600/2563EB/FFFFFF?text=📹';
};

// New component for rendering a single post item
const PostItemDisplay: React.FC<PostItemDisplayProps> = ({
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
  viewerIsAdmin = false,
}) => {
  const router = useRouter();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [, forceUpdate] = useState({});
  
  const isExpanded = expandedPosts.has(item.id);
  const isContentExpanded = expandedPostContent.has(item.id);
  const isOwner = user && item.user_id === user.id;
  const comments = postComments[item.id] || [];
  const isLoadingComments = loadingComments.has(item.id);
  const isSubmittingComment = submittingComments.has(item.id);
  const commentText = commentTexts[item.id] || '';

  // Check if post has a valid image URL
  const mainImageUrl = item.image_urls && (item.image_urls.length > 0) ? item.image_urls[0] : null;
  const hasValidImage = mainImageUrl && isValidImageUrl(mainImageUrl);
  
  // Content truncation logic
  const MAX_CONTENT_LENGTH = 200;
  const needsTruncation = item.content && (item.content.length > MAX_CONTENT_LENGTH);
  const displayContent = needsTruncation && !isContentExpanded
    ? `${item.content.substring(0, MAX_CONTENT_LENGTH)}...`
    : item.content;

  // Add a new state to track the current post's images when viewing in fullscreen
  const [viewingImageSet, setViewingImageSet] = useState<string[]>([]);
  const [viewingImageIndex, setViewingImageIndex] = useState<number>(0);

  // Update the setViewingImage function to also set the image set
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

  // Function to go to next image in fullscreen view
  const goToNextImage = useCallback(() => {
    if ((viewingImageSet?.length || 0) > 1 && viewingImageIndex < (viewingImageSet?.length || 0) - 1) {
      handleSwipeComplete('left');
    }
  }, [viewingImageSet, viewingImageIndex, handleSwipeComplete]);

  // Function to go to previous image in fullscreen view
  const goToPrevImage = useCallback(() => {
    if ((viewingImageSet?.length || 0) > 1 && viewingImageIndex > 0) {
      handleSwipeComplete('right');
    }
  }, [viewingImageSet, viewingImageIndex, handleSwipeComplete]);

  // Update the image press handlers to pass the full image set
  const handleImagePress = (imageUrl: string, index: number) => {
    if (item.image_urls && (item.image_urls?.length || 0) > 0) {
      setViewingImage(imageUrl, item.image_urls, index);
    } else {
      setViewingImage(imageUrl);
    }
  };

  return (
    <View style={[styles.postContainer, { backgroundColor: themeColors.neutral.surface }]}>
      {/* Show loading overlay if post is being deleted */}
      {item.isDeleting && (
        <View style={[styles.deletingOverlay, { backgroundColor: themeColors.neutral.background + '80' }]}>
          <ActivityIndicator size="large" color={themeColors.primary.main} />
          <Text style={[styles.deletingText, { color: themeColors.neutral.text }]}>Deleting post...</Text>
        </View>
      )}
      
      {/* Post Header */}
      <View style={styles.postHeader}>
        <View style={styles.userInfoContainer}>
          <SimpleAvatar
            avatarUrl={item.profile?.avatar_url || item.user_avatar_url}
            userId={item.user_id}
            size={40}
            isDarkMode={isDark}
          />
          <View style={styles.userTextContainer}>
            <Text style={[styles.userName, { color: themeColors.neutral.text }]}>
              {item.username || 'Unknown User'}
            </Text>
            <Text style={[styles.postTime, { color: themeColors.neutral.textSecondary }]}>
              {formatTimeAgo(item.created_at)}
              {item.location && (
                <>
                  {' • '}
                  <Text style={[styles.locationText, { color: themeColors.neutral.textSecondary }]}>{item.location}</Text>
                </>
              )}
            </Text>
          </View>
        </View>

        {(isOwner || viewerIsAdmin) && !item.isDeleting && (
          <TouchableOpacity
            style={styles.postActionIcon}
            onPress={() => setPostMenuVisible(item.id)}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <MoreVertical size={20} color={themeColors.neutral.subtext} />
          </TouchableOpacity>
        )}
      </View>

      {/* Post content */}
      <View style={styles.postContentContainer}>
        {item.content ? (
          <>
            <Text
              style={[styles.postContent, { color: themeColors.neutral.text }]}
            >
              {displayContent}
            </Text>
            {needsTruncation && (
              <TouchableOpacity onPress={() => togglePostContentExpansion(item.id)}>
                <Text style={[styles.readMoreText, { color: themeColors.primary.main }]}>
                  {isContentExpanded ? 'Read less' : 'Read more'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <Text style={[styles.postContent, styles.emptyContent, { color: themeColors.neutral.textSecondary }]}>
            {/* Add placeholder text for posts without content */}
            {item.image_urls && (item.image_urls?.length || 0) > 0 ? "Photo shared" : "No content available"}
          </Text>
        )}
      </View>

      {/* Post media (if any) */}
      {((item.image_urls && (item.image_urls?.length || 0) > 0) || item.video_url) && (
        <View style={[styles.imageContainer, { backgroundColor: themeColors.neutral.border }]}>
          {item.video_url ? (
            // Video post - show video thumbnail
            <TouchableOpacity 
              onPress={() => handleImagePress(item.video_url, 0)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: generateVideoThumbnailUrl(item.video_url) }}
                style={styles.postImage}
                resizeMode="contain"
                defaultSource={require('../../assets/images/default-avatar.png')}
                onLoad={() => setImageLoaded(true)}
                onError={(e) => {
                  log('Video thumbnail load error:', e.nativeEvent.error, 'URL:', item.video_url);
                  setImageError(true);
                }}
              />
              {/* Video play button overlay */}
              <View style={styles.videoOverlay}>
                <View style={styles.playButtonContainer}>
                  <Play size={20} color="white" fill="white" />
                </View>
              </View>
            </TouchableOpacity>
          ) : (item.image_urls?.length || 0) > 1 ? (
            // Two images side by side
            <View style={styles.multiImageContainer}>
              <TouchableOpacity 
                style={styles.multiImageLeft}
                onPress={() => handleImagePress(item.image_urls[0], 0)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: resizePostImage(item.image_urls[0], Dimensions.get('window').width / 2) }}
                  style={[styles.multiPostImage, styles.leftImage]}
                  resizeMode="cover"
                  defaultSource={require('../../assets/images/default-avatar.png')}
                  cachePolicy="memory-disk"
                  priority="low"
                  onLoad={() => setImageLoaded(true)}
                  onError={(e) => {
                    log('Image load error:', e.nativeEvent.error, 'URL:', item.image_urls[0]);
                    setImageError(true);
                  }}
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.multiImageRight}
                onPress={() => handleImagePress(item.image_urls[1], 1)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: resizePostImage(item.image_urls[1], Dimensions.get('window').width / 2) }}
                  style={[styles.multiPostImage, styles.rightImage]}
                  resizeMode="cover"
                  defaultSource={require('../../assets/images/default-avatar.png')}
                  cachePolicy="memory-disk"
                  priority="low"
                  onLoad={() => setImageLoaded(true)}
                  onError={(e) => {
                    log('Image load error:', e.nativeEvent.error, 'URL:', item.image_urls[1]);
                    setImageError(true);
                  }}
                />
                {/* Multi-photo indicator */}
                <View style={styles.multiPhotoIndicator}>
                  <Text style={styles.multiPhotoIndicatorText}>{(item.image_urls?.length || 0)} Photos</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            // Single image (existing code)
            <TouchableOpacity 
              onPress={() => handleImagePress(item.image_urls[0], 0)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: resizePostImage(item.image_urls[0], Dimensions.get('window').width) }}
                style={styles.postImage}
                resizeMode="contain"
                cachePolicy="memory-disk"
                priority="low"
                defaultSource={require('../../assets/images/default-avatar.png')}
                onLoad={() => setImageLoaded(true)}
                onError={(e) => {
                  log('Image load error:', e.nativeEvent.error, 'URL:', item.image_urls[0]);
                  setImageError(true);
                }}
              />
            </TouchableOpacity>
          )}
          {!imageLoaded && !imageError && (
            <View style={[styles.imageLoadingOverlay, { backgroundColor: themeColors.neutral.background + '80' }]}>
              <ActivityIndicator color={themeColors.primary.main} size="small" />
            </View>
          )}
          {imageError && (
            <View style={[styles.imageErrorOverlay, { backgroundColor: themeColors.error.main + '80' }]}>
              <Text style={[styles.imageErrorText, { color: themeColors.neutral.card }]}>Media could not be loaded</Text>
            </View>
          )}
          {imageLoaded && !imageError && (
            <View style={styles.imageZoomHint}>
              <ZoomIn size={20} color="white" />
            </View>
          )}
        </View>
      )}

      {/* Post actions */}
      <View style={[styles.postActions, { borderTopColor: themeColors.neutral.border }]}>
        {/* Like button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleLike(item.id)}
        >
          <Heart
            size={18}
            color={item.liked_by_user ? themeColors.error.main : themeColors.neutral.subtext}
            fill={item.liked_by_user ? themeColors.error.main : 'transparent'}
          />
          <Text style={[styles.actionText, { color: themeColors.neutral.subtext }]}>
            {item.likes_count || 0}
          </Text>
        </TouchableOpacity>

        {/* Comment button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handlePostExpansion(item.id)}
        >
          <MessageSquare size={18} color={isExpanded ? themeColors.primary.main : themeColors.neutral.subtext} />
          <Text style={[styles.actionText, { color: themeColors.neutral.subtext }, isExpanded && { color: themeColors.primary.main }]}>
            {item.comments_count || 0}
          </Text>
        </TouchableOpacity>

        {/* Bookmark button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleBookmark(item.id)}
        >
          <Bookmark
            size={18}
            color={item.isBookmarked ? themeColors.primary.main : themeColors.neutral.subtext}
            fill={item.isBookmarked ? themeColors.primary.main : 'transparent'}
          />
        </TouchableOpacity>

        {/* Reply Privately (context-based chat only) */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={async () => {
            try {
              if (!user?.id) {
                router.push('/auth/signin');
                return;
              }
              if (!item?.user_id) {
                Alert.alert('Unavailable', 'This post is missing an author.');
                return;
              }
              if (item.user_id === user.id) {
                Alert.alert('Not available', "You can't message yourself.");
                return;
              }

              const result = await startContextChat({
                targetUserId: item.user_id,
                contextPostId: item.id,
                contextPostText: getPostTextForContext(item),
              });

              if (!result.ok) {
                if (result.reason === 'not_mutual_follow') {
                  Alert.alert('Mutual follow required', 'You can only message people who follow you back.');
                  return;
                }
                if (result.reason === 'missing_context') {
                  Alert.alert('Context required', 'Messages must be tied to a post.');
                  return;
                }
                Alert.alert('Could not start chat', 'Please try again.');
                return;
              }

              router.push(`/chat/${item.user_id}?contextPostId=${encodeURIComponent(item.id)}`);
            } catch (e) {
              error('[Community] Reply privately failed:', e);
              Alert.alert('Could not start chat', 'Please try again.');
            }
          }}
        >
          <Reply size={18} color={themeColors.neutral.subtext} />
        </TouchableOpacity>

        {/* Share hidden temporarily */}
      </View>

      {/* Expandable Comments Section */}
      {isExpanded && (
        <View style={[styles.commentsSection, { borderTopColor: themeColors.neutral.border }]}>
          {/* Comments List */}
          {isLoadingComments ? (
            <View style={styles.commentsLoading}>
              <ActivityIndicator size="small" color={themeColors.primary.main} />
              <Text style={[styles.commentsLoadingText, { color: themeColors.neutral.subtext }]}>Loading comments...</Text>
            </View>
          ) : (comments?.length || 0) === 0 ? (
            <View style={styles.noComments}>
              <Text style={[styles.noCommentsText, { color: themeColors.neutral.subtext }]}>
                No comments yet. Be the first to comment!
              </Text>
            </View>
          ) : (
            <>
              <ScrollView style={styles.commentsList} nestedScrollEnabled={true}>
                {comments.map(comment => {
                  const isMyComment = user?.id === comment.user_id;
                  return (
                                      <View key={comment.id} style={styles.commentItem}>
                    <SimpleAvatar
                      avatarUrl={comment.user_avatar || comment.profiles?.avatar_url}
                      userId={comment.user_id}
                      size={24}
                      isDarkMode={isDark}
                    />
                    <View style={[styles.commentContent, { 
                      backgroundColor: 'transparent',
                      borderLeftWidth: comment.reply_to || comment.content.startsWith('@') ? 3 : 0,
                      borderLeftColor: comment.reply_to || comment.content.startsWith('@') ? 
                        (user && comment.user_id === user.id ? themeColors.primary.main : themeColors.neutral.border) : 'transparent'
                    }]}>
                      <View style={styles.commentHeader}>
                        <View style={styles.commentAuthorContainer}>
                          <Text style={[styles.commentAuthor, { 
                            color: user && comment.user_id === user.id ? 
                              themeColors.primary.main : themeColors.neutral.text 
                          }]}>
                            {comment.username || comment.profiles?.username || 'User'}
                          </Text>
                          <Text style={[styles.commentTime, { color: themeColors.neutral.subtext }]}>
                            {formatTimeAgo(comment.created_at)}
                          </Text>
                        </View>
                        {isMyComment && (
                          <TouchableOpacity
                            onPress={() => setCommentMenuVisible(comment.id)}
                            style={styles.commentActionIcon}
                            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                          >
                            <MoreVertical size={14} color={themeColors.neutral.subtext} />
                          </TouchableOpacity>
                        )}
                      </View>
                      
                      {/* Show reply indicator if this is a reply */}
                      {(comment.reply_to || comment.content.startsWith('@')) && (
                        <View style={styles.replyChain}>
                          <Text style={[styles.replyIndicatorText, { 
                            color: themeColors.neutral.subtext,
                            fontStyle: 'italic'
                          }]}>
                            {comment.reply_to_username ? 
                              `Replying to @${comment.reply_to_username}` : 
                              `Reply to ${comment.content.split(' ')[0]}`}
                          </Text>
                        </View>
                      )}
                      
                      <Text style={[styles.commentText, { color: themeColors.neutral.text }]}>{comment.content}</Text>
                        
                        {/* Comment Actions */}
                        <View style={styles.commentActions}>
                          <TouchableOpacity 
                            style={styles.commentActionButton}
                            onPress={() => {
                              // Handle reply to comment
                              const username = comment.username || comment.profiles?.username || 'User';
                              
                              // Store the reply info
                              setCommentTexts(prev => ({ 
                                ...prev, 
                                [item.id]: `@${username} `
                              }));
                              
                              // Store additional reply metadata in a hidden field
                              // This would be used when submitting the comment
                              item.currentReplyTo = {
                                comment_id: comment.id,
                                username: username,
                                user_id: comment.user_id
                              };
                              
                              // Force a re-render to show the reply indicator
                              forceUpdate({});
                            }}
                          >
                            <Text style={[styles.commentActionText, { color: themeColors.primary.main }]}>Reply</Text>
                          </TouchableOpacity>
                          
                          <Text style={[styles.commentActionDivider, { color: themeColors.neutral.subtext }]}>•</Text>
                          
                          <TouchableOpacity 
                            style={styles.commentActionButton}
                            activeOpacity={0.7}
                            onPress={() => {
                              // Check if user is logged in
                              if (!user) {
                                router.push('/auth/signin');
                                return;
                              }
                              
                              // Create a local copy of the comment to modify
                              const commentToUpdate = {...comment};
                              
                              // Toggle the liked state
                              commentToUpdate.liked = !commentToUpdate.liked;
                              
                              // Update the likes count
                              const currentLikes = commentToUpdate.likes_count || 0;
                              commentToUpdate.likes_count = commentToUpdate.liked ? 
                                currentLikes + 1 : 
                                Math.max(0, currentLikes - 1);
                                
                              // Force a re-render by updating the component's state
                              comment.liked = commentToUpdate.liked;
                              comment.likes_count = commentToUpdate.likes_count;
                              
                              // Force component re-render
                              forceUpdate({});
                              
                              // Here you would also call an API to update the like on the server
                              // toggleCommentLike(comment.id, user?.id);
                            }}
                          >
                            <View style={styles.likeButtonContainer}>
                              <Heart 
                                size={14} 
                                color={comment.liked ? themeColors.error.main : themeColors.neutral.subtext}
                                fill={comment.liked ? themeColors.error.main : "transparent"}
                              />
                              <Text 
                                style={[
                                  styles.likeCountText, 
                                  { color: comment.liked ? themeColors.error.main : themeColors.neutral.subtext }
                                ]}
                              >
                                {comment.likes_count || 0}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </>
          )}

          <View style={[styles.commentSeparator, { backgroundColor: themeColors.neutral.border }]} />

          {/* Comment Input with Reply Indicator */}
          <View style={[
            styles.commentInputWrapper,
            { backgroundColor: themeColors.neutral.surfaceVariant }
          ]}>
            {/* Reply indicator shown above the input */}
            {commentText && commentText.startsWith('@') && (
              <View style={[styles.replyIndicator, { backgroundColor: themeColors.primary.light }]}>
                <Text style={[styles.replyIndicatorText, { color: themeColors.primary.main }]}>
                  Replying to {commentText.split(' ')[0]}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setCommentTexts(prev => ({ ...prev, [item.id]: '' }));
                    // Clear the reply metadata
                    if (item.currentReplyTo) {
                      delete item.currentReplyTo;
                    }
                    forceUpdate({});
                  }}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <X size={14} color={themeColors.primary.main} />
                </TouchableOpacity>
              </View>
            )}
            
            {/* Actual input container */}
            <View style={styles.commentInputContainer}>
              <TextInput
                style={[styles.commentInput, { 
                  backgroundColor: themeColors.neutral.background,
                  color: themeColors.neutral.text 
                }]}
                placeholder="Add a comment..."
                placeholderTextColor={themeColors.neutral.textSecondary}
                value={commentText}
                onChangeText={(text) => setCommentTexts(prev => ({ ...prev, [item.id]: text }))}
              />
                          <TouchableOpacity
                style={[
                  styles.commentSendButton,
                  { backgroundColor: themeColors.primary.main },
                  (!commentText.trim() || isSubmittingComment) && [styles.commentSendButtonDisabled, { backgroundColor: themeColors.neutral.disabled }]
                ]}
                onPress={() => handleCommentSubmit(item.id)}
                disabled={!commentText.trim() || isSubmittingComment}
              >
                {isSubmittingComment ? (
                  <ActivityIndicator size="small" color={themeColors.neutral.surface} />
                ) : (
                  <Send size={18} color={themeColors.neutral.surface} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Post Reactions Counter */}
      <PostReactionsCounter 
        postId={item.id}
        initialCounts={{ 
          total: item.likes_count || 0, 
          likes: item.likes_count || 0, 
          loves: 0, 
          laughs: 0 
        }}
      />
    </View>
  );
};

export default function CommunityScreen() {
  const router = useRouter();
  const { user, isLoaded: authLoaded } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // State
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('Latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [postMenuVisible, setPostMenuVisible] = useState<string | null>(null);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  
  // Comments state
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [postComments, setPostComments] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Set<string>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [submittingComments, setSubmittingComments] = useState<Set<string>>(new Set());
  const [commentMenuVisible, setCommentMenuVisible] = useState<string | null>(null);
  
  // State for expanding post content text
  const [expandedPostContent, setExpandedPostContent] = useState<Set<string>>(new Set());
  
  // Image viewer state
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  
  // Find the selected post for the menu
  const selectedPost = posts.find(post => post.id === postMenuVisible);
  
  // Find the selected comment for the menu
  const selectedComment = Object.values(postComments)
    .flat()
    .find(comment => comment.id === commentMenuVisible);
  
  // Load posts on component mount
  useEffect(() => {
    loadPosts();
    
    // Set up a timer to refresh posts periodically (every 2 minutes)
    const refreshTimer = setInterval(() => {
      if (!refreshing) {
        log('[Community] Auto-refreshing posts');
        loadPosts(true);
      }
    }, 120000); // 2 minutes
    
    return () => {
      clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setViewerIsAdmin(false);
      return () => {
        cancelled = true;
      };
    }
    isUserAdmin(user.id).then((admin) => {
      if (!cancelled) setViewerIsAdmin(admin);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
  
  // Load posts from the API
  const loadPosts = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      
      log('[Community] Loading posts...');
      const fetchedPosts = await fetchPosts(50); // Increase limit to load more posts
      
      if (fetchedPosts && Array.isArray(fetchedPosts)) {
        log(`[Community] Loaded ${fetchedPosts?.length || 0} posts`);
        // Log the image URLs for debugging
        fetchedPosts.forEach(post => {
          if (post.image_urls && (post.image_urls?.length || 0) > 0) {
            log(`[Community] Post ${post.id} has image URLs:`, post.image_urls);
          }
        });
        setPosts(fetchedPosts);
      } else {
        error('[Community] No posts returned or invalid response');
        if (!silent && (posts?.length || 0) === 0) {
          // Only show empty state if this isn't a silent refresh and we don't have any posts yet
          setPosts([]);
        }
      }
    } catch (error) {
      error('[Community] Error loading posts:', error);
      // Don't clear existing posts on error during silent refresh
      if (!silent && (posts?.length || 0) === 0) {
        setPosts([]);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPosts(true);
    setRefreshing(false);
  };
  
  // Handle post like
  const handleLike = async (postId: string) => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    
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
    
    // Call API to toggle like
    try {
      await toggleLike(postId, user.id);
    } catch (error) {
      error('Error toggling like:', error);
      // Revert the UI change if the API call fails
      await loadPosts();
    }
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
    
    // Optimistically update UI
    setPosts(current => 
      current.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            isBookmarked: !post.isBookmarked
          };
        }
        return post;
      })
    );
    
    // Call API to toggle bookmark
    try {
      const result = await toggleBookmark(postId, user.id);
      log('Toggle bookmark result:', result);
      
      if (!result.success) {
        error('Failed to toggle bookmark on community screen');
        // Reload posts if there was an error
        await loadPosts();
      } else {
        // If successful, notify profile screen to refresh bookmarks
        if (global.refreshBookmarks) {
          global.refreshBookmarks();
        }
      }
    } catch (error) {
      error('Error toggling bookmark:', error);
      // Reload posts if there was an error
      await loadPosts();
    }
  };
  
  // Handle post expansion to show comments
  const handlePostExpansion = async (postId: string) => {
    const newExpandedPosts = new Set(expandedPosts);
    
    if (expandedPosts.has(postId)) {
      // Collapse the post
      newExpandedPosts.delete(postId);
      setExpandedPosts(newExpandedPosts);
      return;
    } 
    
    // Expand the post and load comments
    newExpandedPosts.add(postId);
    setExpandedPosts(newExpandedPosts);
    
    if (!postComments[postId]) {
      // Load comments for this post
      setLoadingComments(prev => new Set(prev).add(postId));
      
      try {
        const comments = await fetchComments(postId);
        if (comments && Array.isArray(comments)) {
          log(`[Community] Loaded ${comments?.length || 0} comments for post ${postId}`);
          setPostComments(prev => ({
            ...prev,
            [postId]: comments
          }));
        } else {
          log(`[Community] No comments found for post ${postId}`);
          setPostComments(prev => ({
            ...prev,
            [postId]: []
          }));
        }
      } catch (error) {
        error('[Community] Error loading comments:', error);
        setPostComments(prev => ({
          ...prev,
          [postId]: []
        }));
      } finally {
        setLoadingComments(prev => {
          const newSet = new Set(prev);
          newSet.delete(postId);
          return newSet;
        });
      }
    }
  };

  // Handle comment submission
  const handleCommentSubmit = async (postId: string) => {
    if (!user) {
      router.push('/auth/signin');
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
        // Replace temp comment with real one
        setPostComments(prev => ({
          ...prev,
          [postId]: prev[postId]?.map(comment => 
            comment.id === newComment.id ? result : comment
          ) || [result]
        }));
        
        // Update post comment count
        setPosts(prev => prev.map(post => 
          post.id === postId 
            ? { ...post, comments_count: (post.comments_count || 0) + 1 }
            : post
        ));
        
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
      Toast.show({
        type: 'error',
        text1: 'Failed to add comment. Please try again.',
        text2: '',
      });
    } finally {
      setSubmittingComments(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
    }
  };

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
                Toast.show({
                  type: 'error',
                  text1: 'Failed to delete comment',
                  text2: '',
                });
              }
            } catch (error) {
              error('Error deleting comment:', error);
              Toast.show({
                type: 'error',
                text1: 'Failed to delete comment',
                text2: '',
              });
            }
          }
        }
      ]
    );
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
        content: post.content
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
                // Remove post from state immediately for smooth UX
                setPosts(prev => prev.filter(p => p.id !== postId));
                Toast.show({
                  type: 'success',
                  text1: 'Post deleted successfully',
                  text2: '',
                });
              } else {
                // Remove the deleting flag on error
                setPosts(prev => prev.map(post => 
                  post.id === postId 
                    ? { ...post, isDeleting: false }
                    : post
                ));
                Toast.show({
                  type: 'error',
                  text1: 'Failed to delete post',
                  text2: '',
                });
              }
            } catch (error) {
              error('Error deleting post:', error);
              // Remove the deleting flag on error
              setPosts(prev => prev.map(post => 
                post.id === postId 
                  ? { ...post, isDeleting: false }
                  : post
              ));
              Toast.show({
                type: 'error',
                text1: 'Failed to delete post',
                text2: '',
              });
            }
          }
        }
      ]
    );
  };

  const handleAdminMarkAdult = async (post: Post) => {
    setPostMenuVisible(null);
    if (!user?.id) return;
    const reporterUsername =
      (typeof user.user_metadata?.username === 'string' && user.user_metadata.username) ||
      (typeof user.email === 'string' ? user.email.split('@')[0] : null) ||
      'Unknown';
    const ok = await sendUserReport({
      reportedUserId: post.user_id,
      reportedUsername: post.username || 'Unknown',
      reporterUserId: user.id,
      reporterUsername,
      reason: 'adult_18',
      postId: post.id,
      applyAdultContentBlur: true,
    });
    if (ok) {
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, adult_content: true } : p))
      );
      DeviceEventEmitter.emit('postAdultContentFlagged', { postId: post.id });
      Toast.show({
        type: 'success',
        text1: 'Marked as 18+',
        text2: 'This post is now blurred for viewers.',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: 'Could not apply 18+ flag',
        text2: 'Ensure you are admin and send-user-report has the service role key.',
      });
    }
  };
  
  // Filter posts based on search query
  const getFilteredPosts = () => {
    if (!searchQuery.trim()) {
      return posts;
    }
    
    const query = searchQuery.toLowerCase();
    return posts.filter(post => 
      post.content.toLowerCase().includes(query) ||
      (post.username || '').toLowerCase().includes(query)
    );
  };
  
  // Apply sorting based on selected filter
  const getSortedPosts = () => {
    const filteredPosts = getFilteredPosts();
    
    switch (selectedFilter) {
      case 'Trending':
        return [...filteredPosts].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
      case 'Nearby':
        // This would require location data to implement properly
        // For now, just return the filtered posts
        return filteredPosts;
      case 'Latest':
      default:
        return [...filteredPosts].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
  };

  /** Same list container for loading + loaded — skeleton rows match post height (no full-screen swap). */
  const communityFlatListData = useMemo((): (Post | string)[] => {
    if (loading && posts.length === 0) {
      return ['sk-0', 'sk-1', 'sk-2', 'sk-3'];
    }
    return getSortedPosts();
  }, [loading, posts, searchQuery, selectedFilter]);
  
  const togglePostContentExpansion = (postId: string) => {
    setExpandedPostContent(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
    }
      return newSet;
    });
  };
  
  // Render a single post item
  const renderPostItem = ({ item }: { item: Post }) => {
    return (
      <View style={{ marginBottom: Spacing.sm }}>
        <PostItemDisplay
          item={item}
          user={user}
          isDark={isDarkMode}
          themeColors={themeColors}
          expandedPosts={expandedPosts}
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
          handleCommentSubmit={handleCommentSubmit}
          setCommentTexts={setCommentTexts}
          setCommentMenuVisible={setCommentMenuVisible}
          handleShare={handleShare}
          setViewingImage={handleSetViewingImage}
          viewerIsAdmin={viewerIsAdmin}
        />
      </View>
    );
  };
  
  // Define all hooks at the top level, not conditionally
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const savedOffsetX = useSharedValue(0);
  const savedOffsetY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const swipeX = useSharedValue(0);
  const opacity = useSharedValue(1);

  // Define animatedDotStyle with a memoized value that doesn't change between renders
  const animatedDotStyle = useCallback((index: number) => {
    return useAnimatedStyle(() => {
      // Only check if the index matches the current viewing index
      const isActive = index === viewingImageIndex;
      return {
        width: isActive ? 10 : 8,
        height: isActive ? 10 : 8,
        borderRadius: isActive ? 5 : 4,
        backgroundColor: isActive ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.5)',
        marginHorizontal: 4,
      };
    }, [viewingImageIndex]);
  }, [viewingImageIndex]);

  // Define all animated styles before any conditional logic
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const animatedSwipeStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: swipeX.value },
      ],
    };
  });

  // Handle swipe to navigate between images with improved animation
  const handleSwipeComplete = useCallback((direction: 'left' | 'right') => {
    if (direction === 'left' && viewingImageIndex < (viewingImageSet?.length || 0) - 1) {
      // Add a small animation effect when changing images
      swipeX.value = -50; // Start slightly to the left
      const newIndex = viewingImageIndex + 1;
      runOnJS(setViewingImageIndex)(newIndex);
      
      // Fade out current image slightly
      opacity.value = withTiming(0.7, { duration: 150 }, () => {
        // Change the image using runOnJS to avoid the worklet error
        runOnJS(setViewingImage)(viewingImageSet[newIndex]);
        
        // Fade back in and reset position with spring animation
        opacity.value = withTiming(1, { duration: 200 });
        swipeX.value = withSpring(0, {
          damping: 20,
          stiffness: 90,
        });
      });
      
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    } else if (direction === 'right' && viewingImageIndex > 0) {
      // Add a small animation effect when changing images
      swipeX.value = 50; // Start slightly to the right
      const newIndex = viewingImageIndex - 1;
      runOnJS(setViewingImageIndex)(newIndex);
      
      // Fade out current image slightly
      opacity.value = withTiming(0.7, { duration: 150 }, () => {
        // Change the image using runOnJS to avoid the worklet error
        runOnJS(setViewingImage)(viewingImageSet[newIndex]);
        
        // Fade back in and reset position with spring animation
        opacity.value = withTiming(1, { duration: 200 });
        swipeX.value = withSpring(0, {
          damping: 20,
          stiffness: 90,
        });
      });
      
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    } else {
      // If we can't navigate further, add a bounce-back animation
      swipeX.value = withSpring(0, {
        damping: 15,
        stiffness: 150,
      });
    }
  }, [viewingImageIndex, (viewingImageSet?.length || 0)]);

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
      } else if (scale.value > 5) {
        // Limit max zoom to 5x
        scale.value = withSpring(5);
        savedScale.value = 5;
      }
    });

  const panGesture = Gesture.Pan()
    .maxPointers(1)
    .enabled(true)
    .onUpdate((e) => {
      if (scale.value > 1) {
        // When zoomed in, pan the image
        offsetX.value = savedOffsetX.value + e.translationX;
        offsetY.value = savedOffsetY.value + e.translationY;
      } else if ((viewingImageSet?.length || 0) > 1) {
        // When not zoomed in and there are multiple images, handle horizontal swipes for navigation
        // Make the swipe feel more responsive but with resistance
        const MAX_SWIPE = SCREEN_WIDTH / 3;
        const dampedTranslation = e.translationX > 0 
          ? Math.min(e.translationX, MAX_SWIPE) 
          : Math.max(e.translationX, -MAX_SWIPE);
          
        // Add resistance at the edges
        if ((viewingImageIndex === 0 && dampedTranslation > 0) || 
            (viewingImageIndex === (viewingImageSet?.length || 0) - 1 && dampedTranslation < 0)) {
          swipeX.value = dampedTranslation / 2; // Add resistance
        } else {
          swipeX.value = dampedTranslation;
        }
        
        // Adjust opacity based on swipe distance for a fade effect
        const swipeProgress = Math.abs(dampedTranslation) / MAX_SWIPE;
        opacity.value = 1 - (swipeProgress * 0.2); // Fade slightly as you swipe
      }
    })
    .onEnd((e) => {
      if (scale.value > 1) {
        // When zoomed in, update saved offsets
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
      } else if ((viewingImageSet?.length || 0) > 1) {
        // When not zoomed in and there are multiple images, handle swipe navigation
        const SWIPE_THRESHOLD = 80; // Lower threshold for better responsiveness
        const SWIPE_VELOCITY = 500; // Add velocity detection
        
        if ((e.translationX < -SWIPE_THRESHOLD) || (e.velocityX < -SWIPE_VELOCITY)) {
          runOnJS(handleSwipeComplete)('left');
        } else if ((e.translationX > SWIPE_THRESHOLD) || (e.velocityX > SWIPE_VELOCITY)) {
          runOnJS(handleSwipeComplete)('right');
        } else {
          // Spring back to center with a nice animation
          swipeX.value = withSpring(0, {
            damping: 20,
            stiffness: 200,
          });
          opacity.value = withTiming(1, { duration: 150 });
        }
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onStart((e) => {
      if (scale.value > 1) {
        // Reset zoom if already zoomed in
        scale.value = withSpring(1);
        savedScale.value = 1;
        offsetX.value = withSpring(0);
        offsetY.value = withSpring(0);
        savedOffsetX.value = 0;
        savedOffsetY.value = 0;
      } else {
        // Zoom to 2.5x if not zoomed in
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Exclusive(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const resetImage = () => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    offsetX.value = withSpring(0);
    offsetY.value = withSpring(0);
    savedOffsetX.value = 0;
    savedOffsetY.value = 0;
    swipeX.value = 0;
  };
  
  // Remove the problematic listener code that's causing the error

  return (
    <SafeAreaView style={[GlobalStyles.safeArea, styles.safeContainer, { backgroundColor: themeColors.neutral.background }]}>

      
      <Header 
        title="Community"
        rightComponent={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: themeColors.primary.main }]}
              onPress={navigateToCreatePost}
              activeOpacity={0.7}
            >
              <Plus size={18} color={themeColors.neutral.surface} />
              <Text style={[styles.createButtonText, { color: themeColors.neutral.surface }]}>Post</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuButton}
              onPress={() => {/* Add menu functionality */}}
              activeOpacity={0.7}
            >
              <Menu size={20} color={themeColors.neutral.text} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        }
      />
      
      <View style={[styles.searchContainer, { 
        backgroundColor: 'transparent', 
        borderColor: themeColors.neutral.border,
        borderWidth: 1 
      }]}>
        <Search size={16} color={themeColors.neutral.subtext} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.neutral.text }]}
          placeholder="Search posts..."
          placeholderTextColor={themeColors.neutral.subtext}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      
      <View style={styles.filtersContainer}>
        {FILTER_OPTIONS.map(filter => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterButton,
              { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border },
              selectedFilter === filter && [styles.filterButtonActive, { backgroundColor: themeColors.primary.main }]
            ]}
            onPress={() => setSelectedFilter(filter)}
          >
            <Text
              style={[
                styles.filterText,
                { color: themeColors.neutral.text },
                selectedFilter === filter && [styles.filterTextActive, { color: themeColors.neutral.surface }]
              ]}
            >
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <View style={{ flex: 1, minHeight: 0 }}>
        <FlatList
          style={{ flex: 1 }}
          data={communityFlatListData}
          keyExtractor={(item) => (typeof item === 'string' ? item : item.id)}
          renderItem={({ item }) =>
            typeof item === 'string' ? <SkeletonPost /> : renderPostItem({ item })
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Calendar size={64} color={themeColors.neutral.textSecondary} style={{ marginBottom: Spacing.md }} />
              <Text style={[styles.emptyTitle, { color: themeColors.neutral.text }]}>No Posts Found</Text>
              <Text style={[styles.emptyText, { color: themeColors.neutral.textSecondary }]}>
                No posts found. Be the first to share your travels!
              </Text>
              <TouchableOpacity
                style={[styles.createPostButton, { backgroundColor: themeColors.primary.main }]}
                onPress={navigateToCreatePost}
              >
                <Text style={[styles.createPostButtonText, { color: themeColors.neutral.surface }]}>Create Post</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={<View style={{ minHeight: BOTTOM_INSET, height: BOTTOM_INSET }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[themeColors.primary.main]}
              tintColor={themeColors.primary.main}
            />
          }
        />
      </View>

      {/* Post Action Menu Modal */}
      <Modal
        visible={!!postMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPostMenuVisible(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPostMenuVisible(null)}
        >
          <View style={[styles.modalContainer, { backgroundColor: themeColors.neutral.card }]}>
            <View style={styles.actionMenu}>
              {selectedPost && user && selectedPost.user_id === user.id && (
                <>
                  <TouchableOpacity
                    style={[styles.actionMenuItem, { borderBottomColor: themeColors.neutral.border }]}
                    onPress={() => {
                      if (selectedPost) {
                        setPostMenuVisible(null);
                        navigateToEditPost(selectedPost);
                      }
                    }}
                  >
                    <Pencil size={20} color={themeColors.neutral.text} />
                    <Text style={[styles.actionMenuItemText, { color: themeColors.neutral.text }]}>Edit Post</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionMenuItem, styles.deleteMenuItem]}
                    onPress={() => {
                      if (selectedPost) {
                        setPostMenuVisible(null);
                        handleDeletePost(selectedPost.id);
                      }
                    }}
                  >
                    <Trash2 size={20} color={themeColors.error.main} />
                    <Text style={[styles.actionMenuItemText, { color: themeColors.error.main }]}>Delete Post</Text>
                  </TouchableOpacity>
                </>
              )}

              {selectedPost && viewerIsAdmin && !selectedPost.adult_content && (
                <TouchableOpacity
                  style={[styles.actionMenuItem, { borderBottomColor: themeColors.neutral.border }]}
                  onPress={() => {
                    if (selectedPost) handleAdminMarkAdult(selectedPost);
                  }}
                >
                  <Flag size={20} color={themeColors.warning.main} />
                  <Text style={[styles.actionMenuItemText, { color: themeColors.neutral.text }]}>
                    Mark 18+ (sensitive blur)
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setPostMenuVisible(null)}
              >
                <X size={20} color={themeColors.neutral.text} />
              </TouchableOpacity>
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
          <View style={[styles.modalContainer, { backgroundColor: themeColors.neutral.card }]}>
            <View style={styles.actionMenu}>
              <TouchableOpacity
                style={[styles.actionMenuItem, styles.deleteMenuItem]}
                onPress={() => {
                  if (selectedComment) {
                    setCommentMenuVisible(null);
                    handleDeleteComment(selectedComment.id, selectedComment.post_id);
                  }
                }}
              >
                <Trash2 size={20} color={themeColors.error.main} />
                <Text style={[styles.actionMenuItemText, { color: themeColors.error.main }]}>Delete Comment</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setCommentMenuVisible(null)}
              >
                <X size={20} color={themeColors.neutral.text} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      
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
        <GestureHandlerRootView style={styles.imageViewerOverlay}>
          <TouchableOpacity
            style={styles.closeImageButton}
            onPress={() => {
              resetImage();
              setViewingImage(null);
              setViewingImageSet([]);
            }}
          >
            <X size={30} color="white" />
          </TouchableOpacity>
          
          <View style={styles.zoomInstructions}>
            <Text style={styles.zoomInstructionsText}>
              {(viewingImageSet?.length || 0) > 1 
                ? "Swipe to navigate • Pinch to zoom • Double-tap to zoom"
                : "Pinch to zoom • Double-tap to zoom"}
            </Text>
          </View>
          
          {/* Dot indicators for image position */}
          {(viewingImageSet?.length || 0) > 1 && (
            <View style={styles.dotIndicatorContainer}>
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
          )}
          
          {(viewingImageSet?.length || 0) > 1 && (
            <View style={styles.imageNavigationContainer}>
              <TouchableOpacity 
                style={[styles.imageNavigationButton, viewingImageIndex === 0 && styles.imageNavigationButtonDisabled]}
                onPress={goToPrevImage}
                disabled={viewingImageIndex === 0}
              >
                <Text style={styles.imageNavigationButtonText}>←</Text>
              </TouchableOpacity>
              
              <Text style={styles.imageNavigationText}>
                {viewingImageIndex + 1} / {(viewingImageSet?.length || 0)}
              </Text>
              
              <TouchableOpacity 
                style={[styles.imageNavigationButton, viewingImageIndex === (viewingImageSet?.length || 0) - 1 && styles.imageNavigationButtonDisabled]}
                onPress={goToNextImage}
                disabled={viewingImageIndex === (viewingImageSet?.length || 0) - 1}
              >
                <Text style={styles.imageNavigationButtonText}>→</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {viewingImage && (
            <GestureDetector gesture={composed}>
              <Animated.View style={[styles.imageViewerContainer, animatedStyle, animatedSwipeStyle]}>
                <Image
                  source={{ uri: viewingImage }}
                  style={styles.imageViewerImage}
                  resizeMode="contain"
                />
              </Animated.View>
            </GestureDetector>
          )}
        </GestureHandlerRootView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? STATUSBAR_HEIGHT : 0,
  },
  container: {
    flex: 1,
  },
  postContainer: {
    marginHorizontal: 2,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userTextContainer: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  userName: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
    marginBottom: 1,
  },
  postTime: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
  },
  locationText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  postContentContainer: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  postContent: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
    // Improved contrast for better readability
    fontWeight: '500', // Slightly bolder for better visibility
  },
  emptyContent: {
    fontStyle: 'italic',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.pill,
  },
  createButtonText: {
    marginLeft: Spacing.xs,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  menuButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.sm,
    marginVertical: Spacing.xs,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 32,
    fontFamily: FontFamily.regular,
    fontSize: 13,
    paddingHorizontal: 4,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
    flexWrap: 'wrap',
  },
  filterButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    marginRight: 6,
    marginBottom: 4,
    borderWidth: 1,
  },
  filterButtonActive: {
    // Now using themeColors inline
  },
  filterText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.xs,
  },
  filterTextActive: {
    fontFamily: FontFamily.bold,
    // Now using themeColors inline
  },
  listContent: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg + BOTTOM_INSET,
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
  createPostButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.pill,
    marginTop: Spacing.md,
  },
  createPostButtonText: {
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
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    width: '80%',
    maxWidth: 320,
  },
  actionMenu: {
    flexDirection: 'column',
    width: '100%',
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    width: '100%',
  },
  actionMenuItemText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginLeft: Spacing.md,
  },
  deleteMenuItem: {
    borderBottomWidth: 0,
  },
  closeButton: {
    padding: Spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  
  // Comments styles
  commentsSection: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    maxHeight: 350, // Limit maximum height but allow flexibility
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
  commentsList: {
    paddingBottom: Spacing.md,
  },
  commentSeparator: {
    height: 1,
    marginVertical: Spacing.md,
    marginHorizontal: 0,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  commentContent: {
    flex: 1,
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
  commentAuthorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  commentAuthor: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.sm,
    marginRight: Spacing.xs,
  },
  commentActionIcon: {
    padding: 4,
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
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  commentActionButton: {
    paddingVertical: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  commentActionText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.xs,
  },
  commentActionDivider: {
    fontSize: FontSizes.xs,
    marginHorizontal: Spacing.xs,
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
    marginBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingTop: Spacing.md,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  commentInput: {
    flex: 1,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs,
    fontSize: FontSizes.md,
    marginRight: Spacing.sm,
    minHeight: 40,
  },
  commentSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  playButtonContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BorderRadius.pill,
    padding: Spacing.sm,
    zIndex: 2001,
  },
  imageViewerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  imageViewerImage: {
    width: '100%',
    height: '100%',
  },
  imageZoomHint: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BorderRadius.pill,
    padding: Spacing.xs,
  },
  imageContainer: {
    width: '100%',
    height: 240,
    marginBottom: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.md,
    paddingVertical: 2,
  },
  actionText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
    marginLeft: 4,
  },
  readMoreText: {
    fontFamily: FontFamily.medium,
    marginTop: Spacing.xs,
  },
  zoomInstructions: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  zoomInstructionsText: {
    color: 'white',
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    fontFamily: FontFamily.regular,
  },
  postItemContainer: {
    marginBottom: Spacing.md,
  },
  imageNavigationContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  imageNavigationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  imageNavigationButtonDisabled: {
    opacity: 0.3,
  },
  imageNavigationButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  imageNavigationText: {
    color: 'white',
    fontSize: 16,
    fontFamily: FontFamily.medium,
  },
  dotIndicatorContainer: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 4,
  },
  dotIndicatorActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'white',
  },
  multiImageContainer: {
    flexDirection: 'row',
    height: 250,
    // Clean container - no shadow or borders
  },
  leftImage: {
    borderRightWidth: 0,
  },
  rightImage: {
    borderLeftWidth: 0,
  },
  multiImageLeft: {
    flex: 1,
    marginRight: 4,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  multiImageRight: {
    flex: 1,
    marginLeft: 4,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  multiPostImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
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
}); 