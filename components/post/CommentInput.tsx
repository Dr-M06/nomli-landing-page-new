import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Send, Lock } from 'lucide-react-native';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../../constants/Theme';

const QUICK_EMOJIS = ['😂', '❤️', '🔥', '👏', '😍', '😮', '😢', '🙏'];

interface CommentInputProps {
  postId: string;
  commentText: string;
  isSubmitting: boolean;
  isDisabled: boolean;
  themeColors: any;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onDisabledPress?: () => void;
}

export const CommentInput: React.FC<CommentInputProps> = ({
  postId,
  commentText,
  isSubmitting,
  isDisabled,
  themeColors,
  onChangeText,
  onSubmit,
  onDisabledPress,
}) => {
  if (isDisabled) {
    return (
      <TouchableOpacity
        style={[styles.commentLockedContainer, { backgroundColor: themeColors.neutral.surfaceVariant }]}
        onPress={onDisabledPress}
        activeOpacity={0.7}
      >
        <Lock size={16} color={themeColors.neutral.textSecondary} />
        <Text style={[styles.commentLockedText, { color: themeColors.neutral.textSecondary }]}>
          Comments disabled
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      {/* Text input first so emoji row never blocks it */}
      <View style={[styles.commentInputContainer, { backgroundColor: themeColors.neutral.surfaceVariant }]}>
        <TextInput
          style={[styles.commentInput, { color: themeColors.neutral.text, backgroundColor: 'transparent' }]}
          placeholder="Add a comment..."
          placeholderTextColor={themeColors.neutral.textSecondary}
          value={commentText}
          onChangeText={onChangeText}
        />
        <TouchableOpacity
          style={[
            styles.commentSendButton,
            { backgroundColor: themeColors.primary.main },
            (!commentText.trim() || isSubmitting) && [styles.commentSendButtonDisabled, { backgroundColor: themeColors.neutral.disabled }]
          ]}
          onPress={onSubmit}
          disabled={!commentText.trim() || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={themeColors.neutral.surface} />
          ) : (
            <Send size={18} color={themeColors.neutral.surface} />
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.quickEmojiRow}>
        {QUICK_EMOJIS.map((emoji) => (
          <TouchableOpacity
            key={emoji}
            style={styles.quickEmojiButton}
            onPress={() => onChangeText(commentText + emoji)}
          >
            <Text style={styles.quickEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  quickEmojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
  },
  quickEmojiButton: {
    padding: 2,
  },
  quickEmoji: {
    fontSize: 16,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    marginHorizontal: Spacing.sm,
    marginBottom: 6,
  },
  commentInput: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.sm,
    paddingVertical: 2,
  },
  commentSendButton: {
    padding: 7,
    borderRadius: BorderRadius.circle,
    marginLeft: 6,
  },
  commentSendButtonDisabled: {
    opacity: 0.5,
  },
  commentLockedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.sm,
    marginBottom: 6,
    gap: 6,
  },
  commentLockedText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.sm,
  },
});
