import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { MoreVertical, Pin, Heart, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import SimpleAvatar from '../SimpleAvatar';
import { formatTimeAgo } from '../../utils/formatters';
import { sanitizeUsernameForDisplay } from '../../utils/contentFilter';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../../constants/Theme';
import { log, warn, error } from '../../utils/productionLogger';


interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  username?: string;
  user_email?: string;
  user_avatar?: string;
  is_pinned?: boolean;
  likes_count?: number;
  is_liked?: boolean;
  profiles?: {
    avatar_url?: string;
    is_verified?: boolean;
    full_name?: string;
  };
  replies?: Comment[];
}

interface CommentItemProps {
  comment: Comment;
  isMyComment: boolean;
  isPostOwner: boolean;
  isAdmin?: boolean;
  isDark: boolean;
  themeColors: any;
  isExpanded: boolean;
  isReplying: boolean;
  replyText: string;
  onNavigateToProfile: (userId: string) => void;
  onLongPress?: (comment: Comment) => void;
  onMenuPress: (comment: Comment) => void;
  onLikePress: (commentId: string) => void;
  onReplyPress: (commentId: string) => void;
  onToggleReplies: (commentId: string) => void;
  onReplyTextChange: (text: string) => void;
  onSubmitReply: () => void;
}

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  isMyComment,
  isPostOwner,
  isAdmin = false,
  isDark,
  themeColors,
  isExpanded,
  isReplying,
  replyText,
  onNavigateToProfile,
  onLongPress,
  onMenuPress,
  onLikePress,
  onReplyPress,
  onToggleReplies,
  onReplyTextChange,
  onSubmitReply,
}) => {
  const hasReplies = (comment.replies?.length || 0) > 0;

  const getDisplayUsername = () => {
    try {
      return sanitizeUsernameForDisplay(comment.username || comment.user_email?.split('@')[0]);
    } catch (error) {
      error('[CommentItem] Error sanitizing username:', error);
      return comment.username || comment.user_email?.split('@')[0] || 'User';
    }
  };

  return (
    <View style={styles.commentThread}>
      {/* Parent Comment */}
      <View style={styles.commentItem}>
        <TouchableOpacity 
          onPress={() => onNavigateToProfile(comment.user_id)}
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
              onPress={() => onNavigateToProfile(comment.user_id)}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onLongPress?.(comment);
              }}
              activeOpacity={0.7}
              delayLongPress={400}
            >
              <Text style={[styles.commentUsername, { color: themeColors.primary.main }]} numberOfLines={1} ellipsizeMode="tail">
                {getDisplayUsername()}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.commentTime, { color: themeColors.neutral.subtext }]}>
              {formatTimeAgo(comment.created_at)}
            </Text>
            
            {isMyComment && (
              <TouchableOpacity
                style={styles.commentActionIcon}
                onPress={() => onMenuPress(comment)}
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
          
          <Text style={[styles.commentText, { color: themeColors.neutral.text }]}>
            {comment.content}
          </Text>
          
          {/* Comment actions */}
          <View style={styles.commentActions}>
            <TouchableOpacity
              style={styles.commentActionButton}
              onPress={() => onLikePress(comment.id)}
              activeOpacity={0.7}
            >
              <Heart
                size={14}
                color={comment.is_liked ? themeColors.error.main : themeColors.neutral.subtext}
                fill={comment.is_liked ? themeColors.error.main : 'transparent'}
              />
              {(comment.likes_count || 0) > 0 && (
                <Text style={[styles.commentActionText, { color: themeColors.neutral.subtext }]}>
                  {comment.likes_count}
                </Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.commentActionButton}
              onPress={() => onReplyPress(comment.id)}
              activeOpacity={0.7}
            >
              <MessageCircle size={14} color={themeColors.neutral.subtext} />
              <Text style={[styles.commentActionText, { color: themeColors.neutral.subtext }]}>
                Reply
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Show replies toggle */}
          {hasReplies && (
            <TouchableOpacity
              style={styles.showRepliesButton}
              onPress={() => onToggleReplies(comment.id)}
              activeOpacity={0.7}
            >
              {isExpanded ? (
                <ChevronUp size={14} color={themeColors.primary.main} />
              ) : (
                <ChevronDown size={14} color={themeColors.primary.main} />
              )}
              <Text style={[styles.showRepliesText, { color: themeColors.primary.main }]}>
                {isExpanded ? 'Hide replies' : `View ${comment.replies?.length} ${comment.replies?.length === 1 ? 'reply' : 'replies'}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      {/* Replies */}
      {isExpanded && comment.replies && comment.replies.map(reply => (
        <View key={reply.id} style={styles.replyItem}>
          <TouchableOpacity 
            onPress={() => onNavigateToProfile(reply.user_id)}
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
          <View style={[styles.commentContent, { backgroundColor: 'transparent' }]}>
            <View style={styles.commentHeader}>
              <TouchableOpacity
                onPress={() => onNavigateToProfile(reply.user_id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.commentUsername, styles.replyUsername, { color: themeColors.primary.main }]} numberOfLines={1}>
                  {sanitizeUsernameForDisplay(reply.username || reply.user_email?.split('@')[0])}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.commentTime, { color: themeColors.neutral.subtext }]}>
                {formatTimeAgo(reply.created_at)}
              </Text>
            </View>
            <Text style={[styles.commentText, styles.replyText, { color: themeColors.neutral.text }]}>
              {reply.content}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  commentThread: {
    marginBottom: Spacing.sm,
  },
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  commentUsername: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.xs,
  },
  commentTime: {
    fontFamily: FontFamily.regular,
    fontSize: 10,
  },
  commentActionIcon: {
    padding: 4,
    marginLeft: 'auto',
  },
  commentPinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  commentPinnedText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.xxs,
  },
  commentText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  commentActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  commentActionText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.xxs,
  },
  showRepliesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
    paddingVertical: 4,
  },
  showRepliesText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.xs,
  },
  replyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginLeft: 32,
    marginTop: Spacing.sm,
  },
  replyUsername: {
    fontSize: FontSizes.xxs,
  },
  replyText: {
    fontSize: FontSizes.xs,
  },
});
