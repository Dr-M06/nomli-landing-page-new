import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import useAuth from '../../../hooks/useAuth';
import PostDetailContent from '../../../components/PostDetailContent';
import {
  fetchPostById,
  fetchComments,
  addComment,
  toggleBookmark,
  Post,
  Comment,
} from '../../../utils/communityUtils';
import { useTheme } from '../../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/Colors';
import { FontFamily } from '../../../constants/Theme';
import { error } from '../../../utils/productionLogger';

type ThreadedComment = Comment & { replies?: ThreadedComment[] };

function buildThreadedComments(flat: Comment[]): ThreadedComment[] {
  const map = new Map<string, ThreadedComment>();
  for (const c of flat) {
    map.set(c.id, { ...c, replies: [] });
  }
  const roots: ThreadedComment[] = [];
  for (const c of flat) {
    const node = map.get(c.id)!;
    const pid = String(c.reply_to || c.reply_to_id || '').trim();
    if (pid && map.has(pid)) {
      map.get(pid)!.replies!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default function CommunityPostDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const postId = useMemo(() => (Array.isArray(rawId) ? rawId[0] : rawId) || '', [rawId]);
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingToComment, setReplyingToComment] = useState<Comment | null>(null);

  const load = useCallback(async () => {
    if (!postId) {
      setLoading(false);
      setCommentsLoading(false);
      return;
    }
    setLoading(true);
    setCommentsLoading(true);
    try {
      const [p, c] = await Promise.all([fetchPostById(postId), fetchComments(postId)]);
      setPost(p);
      setComments(c || []);
    } catch (e) {
      error('[CommunityPostDetail] load', e);
      setPost(null);
      setComments([]);
    } finally {
      setLoading(false);
      setCommentsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const threadedComments = useMemo(() => buildThreadedComments(comments), [comments]);

  const onLike = useCallback(() => {
    // Likes are handled inside PostDetailContent via reaction APIs.
  }, []);

  const onBookmark = useCallback(async () => {
    if (!user?.id) {
      router.push('/auth/signin');
      return;
    }
    if (!post) return;
    try {
      const was = post.isBookmarked || post.bookmarked;
      const result = await toggleBookmark(post.id, user.id);
      if (result.success) {
        setPost((prev) =>
          prev
            ? {
                ...prev,
                isBookmarked: !was,
                bookmarked: !was,
              }
            : null
        );
      }
    } catch (e) {
      error('[CommunityPostDetail] bookmark', e);
    }
  }, [user?.id, post, router]);

  const onCommentSubmit = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || !user?.id || !postId) {
        if (!user?.id) router.push('/auth/signin');
        return;
      }
      setSubmitting(true);
      try {
        const added = await addComment(postId, user.id, t);
        if (added) {
          setCommentText('');
          setReplyingToComment(null);
          setComments((prev) => [...prev, added]);
          setPost((prev) =>
            prev
              ? { ...prev, comments_count: (prev.comments_count || 0) + 1 }
              : prev
          );
        }
      } catch (e) {
        error('[CommunityPostDetail] comment', e);
      } finally {
        setSubmitting(false);
      }
    },
    [user?.id, postId, router]
  );

  const onToggleCommentLike = useCallback((_comment: Comment) => {
    /* Comment likes not wired in standalone view yet */
  }, []);

  const renderComment = useCallback((comment: ThreadedComment, depth = 0): React.ReactNode => {
    return (
      <View key={comment.id} style={{ marginLeft: depth * 10, marginBottom: 12 }}>
        <Text style={[styles.commentUser, { color: themeColors.neutral.text }]}>
          @{comment.username || 'user'}
        </Text>
        <Text style={[styles.commentBody, { color: themeColors.neutral.textSecondary }]}>
          {comment.content}
        </Text>
        {(comment.replies?.length || 0) > 0 && (
          <View style={{ marginTop: 8 }}>
            {comment.replies!.map((r) => renderComment(r, depth + 1))}
          </View>
        )}
      </View>
    );
  }, [themeColors.neutral.text, themeColors.neutral.textSecondary]);

  if (!postId) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 24, backgroundColor: themeColors.neutral.background }]}>
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={26} color={themeColors.neutral.text} />
          <Text style={[styles.backText, { color: themeColors.neutral.text }]}>Back</Text>
        </TouchableOpacity>
        <Text style={{ color: themeColors.neutral.textSecondary, marginTop: 24 }}>Invalid post link.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: themeColors.neutral.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 6,
            backgroundColor: themeColors.neutral.background,
            borderBottomColor: themeColors.neutral.border,
          },
        ]}
      >
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={28} color={themeColors.neutral.text} />
          <Text style={[styles.headerTitle, { color: themeColors.neutral.text }]}>Post</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <ActivityIndicator size="large" color={themeColors.primary.main} />
        </View>
      ) : !post ? (
        <View style={[styles.centered, { flex: 1, paddingHorizontal: 24 }]}>
          <Text style={[styles.missTitle, { color: themeColors.neutral.text }]}>Post unavailable</Text>
          <Text style={[styles.missSub, { color: themeColors.neutral.textSecondary }]}>
            This post may have been deleted or you don&apos;t have access.
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: themeColors.primary.main }]} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <PostDetailContent
          post={post}
          comments={comments}
          user={user}
          onLike={onLike}
          onBookmark={onBookmark}
          onCommentSubmit={onCommentSubmit}
          commentText={commentText}
          setCommentText={setCommentText}
          submitting={submitting}
          replyingToComment={replyingToComment}
          onCancelReply={() => setReplyingToComment(null)}
          onReplyToComment={setReplyingToComment}
          onToggleCommentLike={onToggleCommentLike}
          renderComment={renderComment as (c: Comment & { replies?: Comment[] }) => React.ReactNode}
          threadedComments={threadedComments as (Comment & { replies?: Comment[] })[]}
          commentsLoading={commentsLoading}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontFamily: FontFamily.semibold,
    fontSize: 16,
  },
  headerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  missTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    marginBottom: 8,
  },
  missSub: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  primaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: 15,
  },
  commentUser: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    marginBottom: 2,
  },
  commentBody: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
});
