import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Heart, MessageCircle, Star, MoreVertical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import SimpleAvatar from '../SimpleAvatar';
import { PostMusicStrip, PostAudioAutoPlay } from '../PostMusicStrip';
import { getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../../constants/Theme';
import { formatTimeAgo } from '../../utils/formatters';
import { stripAtSymbol } from '../../utils/contentFilter';

export type StoryStyleTextPostCardProps = {
  userId: string;
  username: string;
  /** Matches profile / post author verification (home feed). */
  isVerified?: boolean;
  avatarUrl?: string | null;
  content: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isBookmarked: boolean;
  isDark: boolean;
  /** When true (e.g. feed page is active), optional attached music can autoplay */
  isMusicActive?: boolean;
  audioUrl?: string | null;
  audioTitle?: string | null;
  audioArtist?: string | null;
  onPressProfile: () => void;
  onLike: () => void;
  onComment: () => void;
  onBookmark: () => void;
  showMoreButton?: boolean;
  onPressMore?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Total card height (fullscreen slot) */
  cardHeight: number;
  /** Max lines before "Read more" when not expanded */
  collapsedLines?: number;
};

/**
 * Story-style text post: dark card, header (avatar + name + time), body, optional in-app music, footer actions.
 * Reusable in fullscreen feed and anywhere else we want the same template.
 */
export default function StoryStyleTextPostCard({
  userId,
  username,
  isVerified = false,
  avatarUrl,
  content,
  createdAt,
  likesCount,
  commentsCount,
  isLiked,
  isBookmarked,
  isDark,
  isMusicActive = true,
  audioUrl,
  audioTitle,
  audioArtist,
  onPressProfile,
  onLike,
  onComment,
  onBookmark,
  showMoreButton = false,
  onPressMore,
  expanded = false,
  onToggleExpand,
  cardHeight,
  collapsedLines = 14,
}: StoryStyleTextPostCardProps) {
  const c = getThemeColors(isDark);
  const displayName = stripAtSymbol(username) || 'user';
  const trimmed = content?.trim() || '';
  const [canExpand, setCanExpand] = useState(false);
  const showReadMore = !!onToggleExpand && canExpand;
  const onBodyTextLayout = useCallback(
    (e: any) => {
      const lineCount = e?.nativeEvent?.lines?.length ?? 0;
      setCanExpand(lineCount > collapsedLines);
    },
    [collapsedLines]
  );

  const musicTheme = {
    primary: c.primary,
    text: isDark ? '#FFFFFF' : c.neutral.text,
    textSecondary: isDark ? 'rgba(255,255,255,0.72)' : c.neutral.textSecondary,
    border: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
    cardBackground: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
    error: c.error,
  };

  const audio = audioUrl?.trim() || '';

  return (
    <View
      style={[
        styles.card,
        {
          height: cardHeight,
          backgroundColor: isDark ? '#1A1D24' : '#F3F4F6',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
        },
      ]}
    >
      {!!audio && <PostAudioAutoPlay audioUrl={audio} isVisible={!!isMusicActive} />}

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPressProfile();
        }}
        style={styles.header}
        disabled={!userId}
      >
        <SimpleAvatar
          avatarUrl={avatarUrl}
          userId={userId}
          size={40}
          isDarkMode={isDark}
          fullName={displayName}
          username={displayName}
          isVerified={isVerified}
          showBadges={isVerified}
          enableZoom={false}
        />
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: c.neutral.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.time, { color: c.neutral.textTertiary }]}>{formatTimeAgo(createdAt)}</Text>
        </View>
        {showMoreButton && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPressMore?.();
            }}
            style={[
              styles.moreBtn,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
            ]}
            hitSlop={8}
          >
            <MoreVertical size={16} color={c.neutral.textSecondary} />
          </Pressable>
        )}
      </Pressable>

      {!!audio && (
        <PostMusicStrip
          audioUrl={audio}
          title={audioTitle ?? undefined}
          artist={audioArtist ?? undefined}
          themeColors={musicTheme}
          compact
        />
      )}

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator={expanded}
      >
        <Text
          style={[styles.body, { color: c.neutral.text }]}
          numberOfLines={expanded || !showReadMore ? undefined : collapsedLines}
          onTextLayout={onBodyTextLayout}
        >
          {trimmed}
        </Text>
        {showReadMore && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleExpand?.();
            }}
            hitSlop={8}
          >
            <Text style={[styles.readMore, { color: c.primary.main }]}>
              {expanded ? 'Show less' : 'Read more'}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
        <Pressable
          style={[styles.pill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onLike();
          }}
        >
          <Heart
            size={16}
            color={isLiked ? '#ef4444' : c.neutral.textSecondary}
            fill={isLiked ? '#ef4444' : 'transparent'}
            strokeWidth={1.8}
          />
          {likesCount > 0 && (
            <Text style={[styles.pillCount, { color: c.neutral.textSecondary }]}>{likesCount}</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.pill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onComment();
          }}
        >
          <MessageCircle size={16} color={c.neutral.textSecondary} strokeWidth={1.8} />
          {commentsCount > 0 && (
            <Text style={[styles.pillCount, { color: c.neutral.textSecondary }]}>{commentsCount}</Text>
          )}
        </Pressable>

        <View style={styles.footerSpacer} />

        <Pressable
          style={[styles.starBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBookmark();
          }}
        >
          <Star
            size={18}
            color={isBookmarked ? '#facc15' : c.neutral.textSecondary}
            fill={isBookmarked ? '#facc15' : 'transparent'}
            strokeWidth={1.8}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.sm,
  },
  time: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    marginTop: 2,
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  bodyScroll: {
    flex: 1,
    minHeight: 80,
  },
  bodyContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: Spacing.xs,
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.md,
    lineHeight: 24,
  },
  readMore: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
    marginTop: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
    borderTopWidth: 1,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
  },
  pillCount: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
  },
  footerSpacer: {
    flex: 1,
  },
  starBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
