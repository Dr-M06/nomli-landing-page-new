import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { X, Send, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../../constants/Theme';
import SimpleAvatar from '../SimpleAvatar';
import {
  addComment as addRootComment,
  replyToComment,
  fetchCommentsWithLikes,
  toggleCommentLike,
  fetchCommentLikers,
  clearCommentsCache,
  type Comment,
  type CommentLiker,
} from '../../utils/commentUtils';
import { formatTimeAgo } from '../../utils/formatters';
import Toast from 'react-native-toast-message';
import ReactionPicker, { type ReactionType } from '../ReactionPicker';
import { ReactionIcon } from '../reactions/ReactionIcon';

const COMMENT_AVATAR_SIZE = 26;
const COMMENT_AVATAR_GAP = 10;

type Props = {
  visible: boolean;
  onClose: () => void;
  postId: string;
  postOwnerId?: string;
  userId?: string;
  onCommentPosted?: (postId: string) => void;
};

export default function CommentsSheet({ visible, onClose, postId, userId, onCommentPosted }: Props) {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { isDarkMode } = useTheme();
  const c = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  /** Explicit height so FlatList gets a non-zero flex region (maxHeight + flexGrow alone often collapses the list). */
  const sheetHeight = Math.round(windowHeight * 0.66);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [likersVisible, setLikersVisible] = useState(false);
  const [likersLoading, setLikersLoading] = useState(false);
  const [likersTitle, setLikersTitle] = useState('Liked by');
  const [likersCommentId, setLikersCommentId] = useState<string | null>(null);
  const [commentLikers, setCommentLikers] = useState<CommentLiker[]>([]);
  const [liveLaughCommentId, setLiveLaughCommentId] = useState<string | null>(null);
  const [reactionPickerForCommentId, setReactionPickerForCommentId] = useState<string | null>(null);
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [selectedReactionByComment, setSelectedReactionByComment] = useState<Record<string, string>>({});
  const laughScale = React.useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCommentsWithLikes(postId, userId, false);
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [postId, userId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const canSubmit = useMemo(() => Boolean(userId) && text.trim().length > 0 && !submitting, [userId, text, submitting]);

  const submit = useCallback(async () => {
    if (!userId || !text.trim() || submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let toSend = text.trim();
    if (replyTo?.username) {
      // Avoid saving duplicated "@username" when UI already renders reply target prefix.
      const escaped = replyTo.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      toSend = toSend.replace(new RegExp(`^@${escaped}\\s+`, 'i'), '').trim();
    }
    setText('');
    try {
      const saved = replyTo
        ? await replyToComment(postId, userId, toSend, replyTo.id, replyTo.username)
        : await addRootComment(postId, userId, toSend);
      if (saved) {
        await clearCommentsCache(postId, userId);
        setReplyTo(null);
        await load();
        onCommentPosted?.(postId);
      } else {
        Toast.show({
          type: 'error',
          text1: replyTo ? 'Failed to add reply' : 'Failed to add comment',
          position: 'bottom',
        });
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: replyTo ? 'Failed to add reply' : 'Failed to add comment',
        position: 'bottom',
      });
    } finally {
      setSubmitting(false);
    }
  }, [postId, userId, text, submitting, onCommentPosted, replyTo, load]);

  const onToggleLike = useCallback(
    async (comment: Comment, reactionType: ReactionType = 'laugh', fromPicker = false) => {
      if (!userId) {
        Toast.show({ type: 'info', text1: 'Sign in to react to comments', position: 'bottom' });
        return;
      }
      const current = comments.find((c) => c.id === comment.id);
      const previousLiked = !!(current?.liked ?? comment.liked);
      const previousEmoji = selectedReactionByComment[comment.id];
      setReactionPickerVisible(false);
      setReactionPickerForCommentId(null);
      const reactionEmoji = reactionType === 'like' ? '⚡' : '😂';

      // Picker should switch reaction style without stacking or toggling off existing reaction.
      if (fromPicker && previousLiked) {
        setSelectedReactionByComment((prev) => ({ ...prev, [comment.id]: reactionEmoji }));
        return;
      }

      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                liked: !previousLiked,
                likes_count: !previousLiked
                  ? (c.likes_count ?? 0) + 1
                  : Math.max(0, (c.likes_count ?? 0) - 1),
              }
            : c
        )
      );
      try {
        const ok = await toggleCommentLike(comment.id, userId);
        if (!ok) throw new Error('toggle failed');
        if (!previousLiked) {
          setSelectedReactionByComment((prev) => ({ ...prev, [comment.id]: reactionEmoji }));
          // Lightweight "alive" laugh feedback (no network/media cost).
          setLiveLaughCommentId(comment.id);
          laughScale.setValue(0.9);
          Animated.sequence([
            Animated.spring(laughScale, {
              toValue: 1.16,
              useNativeDriver: true,
              speed: 26,
              bounciness: 8,
            }),
            Animated.timing(laughScale, {
              toValue: 1,
              duration: 160,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setTimeout(() => setLiveLaughCommentId((id) => (id === comment.id ? null : id)), 260);
          });
        } else {
          setSelectedReactionByComment((prev) => {
            const next = { ...prev };
            delete next[comment.id];
            return next;
          });
          // Clear active laugh marker immediately when reaction is removed.
          setLiveLaughCommentId((id) => (id === comment.id ? null : id));
          Toast.show({
            type: 'info',
            text1: 'Reaction removed',
            position: 'bottom',
            visibilityTime: 900,
          });
        }
      } catch {
        setComments((prev) =>
          prev.map((c) =>
            c.id === comment.id
              ? {
                  ...c,
                  liked: previousLiked,
                  likes_count: previousLiked
                    ? (c.likes_count ?? 0) + 1
                    : Math.max(0, (c.likes_count ?? 0) - 1),
                }
              : c
          )
        );
        if (previousEmoji) {
          setSelectedReactionByComment((prev) => ({ ...prev, [comment.id]: previousEmoji }));
        }
        Toast.show({ type: 'error', text1: 'Failed to react to comment', position: 'bottom' });
      }
    },
    [userId, comments, laughScale, selectedReactionByComment]
  );

  const openCommenterProfile = useCallback(
    (commenterId?: string | null) => {
      if (!commenterId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClose();
      router.push(`/profile/${commenterId}` as any);
    },
    [onClose, router]
  );

  const openCommentLikers = useCallback(async (comment: Comment) => {
    setLikersCommentId(comment.id);
    setLikersVisible(true);
    setLikersLoading(true);
    setLikersTitle(`Reactions (${Math.max(comment.likes_count ?? 0, comment.liked ? 1 : 0)})`);
    try {
      const users = await fetchCommentLikers(comment.id);
      setCommentLikers(users);
    } catch {
      setCommentLikers([]);
    } finally {
      setLikersLoading(false);
    }
  }, []);

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { backgroundColor: c.neutral.card, height: sheetHeight }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: c.neutral.text }]}>Comments</Text>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeBtn, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={18} color={c.neutral.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.listPanel}>
              {loading ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={c.primary.main} />
                </View>
              ) : (
                <FlatList
                  data={comments}
                  keyExtractor={(item, index) => String(item.id ?? `comment-${index}`)}
                  style={styles.list}
                  contentContainerStyle={
                    comments.length === 0 ? styles.listEmpty : styles.listContent
                  }
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    <Text style={[styles.emptyHint, { color: c.neutral.textTertiary }]}>
                      No comments yet.
                    </Text>
                  }
                  renderItem={({ item }) => (
                    <View style={styles.commentBlock}>
                      <TouchableOpacity
                        style={styles.commentProfileRow}
                        activeOpacity={0.75}
                        disabled={!item.user_id}
                        onPress={() => openCommenterProfile(item.user_id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Open profile for ${(item as any).username || (item as any).display_name || 'user'}`}
                      >
                        <SimpleAvatar
                          avatarUrl={
                            (item as any).user_avatar ||
                            (item as any).user_avatar_url ||
                            (item as any).profiles?.avatar_url
                          }
                          userId={item.user_id}
                          size={COMMENT_AVATAR_SIZE}
                          isDarkMode={isDarkMode}
                          isVerified={(item as any).profiles?.is_verified || false}
                          fullName={(item as any).profiles?.full_name || (item as any).display_name}
                          username={(item as any).username}
                          email={(item as any).user_email}
                          showBadges={false}
                          enableZoom={false}
                        />
                        <View style={styles.commentHeaderCol}>
                          <View style={styles.commentTop}>
                            <Text style={[styles.commentName, { color: c.neutral.text }]} numberOfLines={1}>
                              {(item as any).username || (item as any).display_name || 'User'}
                            </Text>
                            <Text style={[styles.commentTime, { color: c.neutral.textTertiary }]}>
                              {formatTimeAgo(item.created_at)}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                      <Text
                        style={[
                          styles.commentText,
                          {
                            color: c.neutral.textSecondary,
                            marginLeft: COMMENT_AVATAR_SIZE + COMMENT_AVATAR_GAP,
                          },
                        ]}
                      >
                        {item.reply_to_username &&
                        !(item.content || '').trim().toLowerCase().startsWith(`@${String(item.reply_to_username).toLowerCase()}`)
                          ? `@${item.reply_to_username} `
                          : ''}
                        {item.content ?? ''}
                      </Text>
                      <View
                        style={[
                          styles.commentActions,
                          { marginLeft: COMMENT_AVATAR_SIZE + COMMENT_AVATAR_GAP },
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.actionChip}
                          onPress={() => {
                            // Quick tap: toggle default reaction (like) without opening picker.
                            onToggleLike(item, 'like', false);
                          }}
                          onLongPress={() => {
                            // Hold: open shared reaction picker on the same counter chip.
                            setReactionPickerForCommentId(item.id);
                            setReactionPickerVisible(true);
                          }}
                          delayLongPress={280}
                          activeOpacity={0.75}
                        >
                          <Animated.View
                            style={[
                              { transform: [{ scale: liveLaughCommentId === item.id ? laughScale : 1 }] },
                            ]}
                          >
                            <ReactionIcon
                              reaction={
                                item.liked
                                  ? (selectedReactionByComment[item.id] === '⚡' ? 'like' : 'laugh')
                                  : null
                              }
                              size={14}
                              activeColor="#FACC15"
                              inactiveColor={c.neutral.textTertiary}
                            />
                          </Animated.View>
                          <Text style={[styles.actionCount, { color: c.neutral.textTertiary }]}>
                            {Math.max(item.likes_count ?? 0, item.liked ? 1 : 0)}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionChip}
                          activeOpacity={0.75}
                          onPress={() =>
                            setReplyTo({
                              id: item.id,
                              username:
                                (item as any).username || (item as any).display_name || 'user',
                            })
                          }
                        >
                          <Text style={[styles.actionText, { color: c.neutral.textTertiary }]}>
                            Reply
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                />
              )}
            </View>

            {replyTo && (
              <View
                style={[
                  styles.replyBanner,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  },
                ]}
              >
                <Text style={[styles.replyBannerText, { color: c.neutral.textSecondary }]}>
                  Replying to @{replyTo.username}
                </Text>
                <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Text style={[styles.replyCancel, { color: c.primary.main }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            <View
              style={[
                styles.inputWrap,
                {
                  borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 14 : 10),
                },
              ]}
            >
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={userId ? 'Add a comment…' : 'Sign in to comment'}
                placeholderTextColor={c.neutral.textTertiary}
                editable={Boolean(userId) && !submitting}
                style={[
                  styles.input,
                  {
                    color: c.neutral.text,
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  },
                ]}
              />
              <TouchableOpacity
                onPress={submit}
                disabled={!canSubmit}
                style={[
                  styles.sendBtn,
                  { backgroundColor: canSubmit ? c.primary.main : c.neutral.disabled },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Send size={16} color="#fff" strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
    <ReactionPicker
      visible={reactionPickerVisible && !!reactionPickerForCommentId}
      onClose={() => {
        setReactionPickerVisible(false);
        setReactionPickerForCommentId(null);
      }}
      currentReaction={
        reactionPickerForCommentId && selectedReactionByComment[reactionPickerForCommentId] === '⚡'
          ? 'like'
          : reactionPickerForCommentId && selectedReactionByComment[reactionPickerForCommentId] === '😂'
            ? 'laugh'
            : null
      }
      onReactionSelect={(reaction) => {
        if (!reactionPickerForCommentId) return;
        const target = comments.find((c) => c.id === reactionPickerForCommentId);
        if (!target) return;
        onToggleLike(target, reaction, true);
      }}
    />
    
    <Modal
      visible={likersVisible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        setLikersVisible(false);
        setLikersCommentId(null);
      }}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => {
            setLikersVisible(false);
            setLikersCommentId(null);
          }}
        />
        <View style={[styles.likersSheet, { backgroundColor: c.neutral.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.neutral.text }]}>{likersTitle}</Text>
            <TouchableOpacity
              onPress={() => {
                setLikersVisible(false);
                setLikersCommentId(null);
              }}
              style={[styles.closeBtn, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
            >
              <X size={18} color={c.neutral.text} />
            </TouchableOpacity>
          </View>
          {likersLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={c.primary.main} />
            </View>
          ) : (
            <FlatList
              data={commentLikers}
              keyExtractor={(item) => item.user_id}
              contentContainerStyle={commentLikers.length === 0 ? styles.listEmpty : styles.listContent}
              ListEmptyComponent={
                <Text style={[styles.emptyHint, { color: c.neutral.textTertiary }]}>No likes yet.</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.likerRow}
                  onPress={() => {
                    setLikersVisible(false);
                    openCommenterProfile(item.user_id);
                  }}
                >
                  <SimpleAvatar
                    avatarUrl={item.avatar_url}
                    userId={item.user_id}
                    size={30}
                    isDarkMode={isDarkMode}
                    isVerified={item.is_verified || false}
                    fullName={item.full_name}
                    username={item.username}
                    showBadges={false}
                    enableZoom={false}
                  />
                  <Text style={[styles.likerName, { color: c.neutral.text }]}>
                    {item.username || item.full_name || 'User'}
                  </Text>
                  <Text style={styles.likerReactionEmoji}>
                    {item.user_id === userId
                      ? selectedReactionByComment[likersCommentId || ''] || item.reaction_emoji || '😂'
                      : item.reaction_emoji || '😂'}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    width: '100%',
    maxHeight: '85%',
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingTop: Spacing.md,
  },
  listPanel: {
    flex: 1,
    minHeight: 120,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  listEmpty: {
    flexGrow: 1,
    paddingBottom: 8,
    paddingTop: 24,
    justifyContent: 'center',
  },
  emptyHint: {
    textAlign: 'center',
    fontFamily: FontFamily.regular,
    fontSize: 14,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.lg,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loading: {
    paddingVertical: 28,
  },
  commentBlock: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  commentProfileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: COMMENT_AVATAR_GAP,
  },
  commentHeaderCol: {
    flex: 1,
    minWidth: 0,
  },
  commentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  commentName: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    flex: 1,
  },
  commentTime: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
  },
  commentText: {
    marginTop: 2,
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  commentActions: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  reactIconOnlyWrap: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
  },
  reactionChipEmoji: {
    fontSize: 15,
    lineHeight: 18,
  },
  actionCount: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
  },
  replyBanner: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  replyBannerText: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
  },
  replyCancel: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: FontFamily.regular,
    fontSize: 13,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  likersSheet: {
    width: '100%',
    maxHeight: '50%',
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  likerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  likerName: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    flex: 1,
  },
  likerReactionEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
});

