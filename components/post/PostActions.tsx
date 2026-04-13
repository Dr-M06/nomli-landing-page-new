import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Zap,
  MessageCircle,
  Bookmark,
  Lock,
  Eye,
  Rocket,
} from 'lucide-react-native';
import { FontFamily, Spacing } from '../../constants/Theme';
import LikeBurst from '../LikeBurst';
import { ReactionIcon } from '../reactions/ReactionIcon';

const ICON_ROW = 24;
const ICON_STROKE = 1.75;
/** Filled zap = active reaction; boosts feed rank via likes_count + sortFeedPosts */
const ZAP_ACTIVE = '#FACC15';
const BOOST_ACTIVE = '#A855F7';

interface PostActionsProps {
  item: any;
  themeColors: any;
  userReaction: 'like' | 'laugh' | null;
  reactionCounts: { likes: number; loves: number; laughs: number };
  isExpanded: boolean;
  isPhotoPost: boolean;
  viewsCount: number;
  likeButtonRef: React.RefObject<TouchableOpacity | null>;
  onLikePress: () => void;
  onLikeLongPress: (event: any) => void;
  onCommentPress: () => void;
  onBookmarkPress: () => void;
  onLikesModalPress: () => void;
  onBoostPress?: () => void;
  isBoosted?: boolean;
  showLikeBurst?: boolean;
  onLikeBurstComplete?: () => void;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export const PostActions: React.FC<PostActionsProps> = ({
  item,
  themeColors,
  userReaction,
  reactionCounts,
  isExpanded,
  isPhotoPost,
  viewsCount,
  likeButtonRef,
  onLikePress,
  onLikeLongPress,
  onCommentPress,
  onBookmarkPress,
  onLikesModalPress,
  onBoostPress,
  isBoosted = false,
  showLikeBurst = false,
  onLikeBurstComplete,
}) => {
  const totalReactions = reactionCounts.likes + reactionCounts.loves + reactionCounts.laughs;
  const zapCount = totalReactions || item.likes_count || 0;
  const commentCount = item.comments_count || 0;
  const sub = themeColors.neutral.subtext;
  const primary = themeColors.primary.main;

  const zapColor = userReaction === 'like' || item.liked_by_user ? ZAP_ACTIVE : sub;

  const zapIcon = (
    <ReactionIcon
      reaction={userReaction || (item.liked_by_user ? 'like' : null)}
      size={ICON_ROW}
      activeColor={ZAP_ACTIVE}
      inactiveColor={sub}
    />
  );

  const chipBg = themeColors.neutral.border + '44';

  return (
    <View style={[styles.wrap, { borderTopColor: themeColors.neutral.border + '99' }]}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <View style={styles.zapWrap}>
            <TouchableOpacity
              ref={likeButtonRef}
              onPress={onLikePress}
              onLongPress={onLikeLongPress}
              delayLongPress={400}
              style={styles.zapHit}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              activeOpacity={0.65}
            >
              {zapIcon}
              {zapCount > 0 && (
                <Text style={[styles.zapCount, { color: zapColor }]}>{formatCompact(zapCount)}</Text>
              )}
            </TouchableOpacity>
            <LikeBurst
              visible={showLikeBurst}
              onComplete={onLikeBurstComplete}
              size={44}
              color={ZAP_ACTIVE}
              style={styles.burstOverlay}
              duration={320}
            />
          </View>

          <TouchableOpacity
            onPress={onCommentPress}
            style={styles.commentHit}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            activeOpacity={0.65}
          >
            {item.comments_disabled ? (
              <Lock size={ICON_ROW - 2} color={sub} strokeWidth={ICON_STROKE} />
            ) : (
              <MessageCircle
                size={ICON_ROW - 2}
                color={isExpanded ? primary : sub}
                strokeWidth={ICON_STROKE}
              />
            )}
            {commentCount > 0 && (
              <Text style={[styles.sideCount, { color: isExpanded ? primary : sub }]}>
                {formatCompact(commentCount)}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.toolbarRight}>
          {isPhotoPost && viewsCount > 0 && (
            <View style={[styles.viewChip, { backgroundColor: chipBg }]}>
              <Eye size={16} color={sub} strokeWidth={ICON_STROKE} />
              <Text style={[styles.viewChipText, { color: sub }]}>{formatCompact(viewsCount)}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={onBookmarkPress}
            style={styles.iconOnlyHit}
            hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
            activeOpacity={0.65}
          >
            <Bookmark
              size={ICON_ROW - 2}
              color={item.isBookmarked ? primary : sub}
              fill={item.isBookmarked ? primary : 'transparent'}
              strokeWidth={ICON_STROKE}
            />
          </TouchableOpacity>

          {!!onBoostPress && (
            <TouchableOpacity
              onPress={onBoostPress}
              style={styles.iconOnlyHit}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              activeOpacity={0.65}
            >
              <Rocket
                size={ICON_ROW - 2}
                color={isBoosted ? BOOST_ACTIVE : sub}
                fill={isBoosted ? BOOST_ACTIVE : 'transparent'}
                strokeWidth={ICON_STROKE}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {(item.likes_count || 0) > 0 && (
        <TouchableOpacity onPress={onLikesModalPress} activeOpacity={0.7} style={styles.zappedByLine}>
          <Text style={[styles.zappedByText, { color: themeColors.neutral.text }]} numberOfLines={1}>
            {item.likes_count === 1 ? (
              <>
                Zapped by{' '}
                <Text style={styles.zappedByStrong}>
                  {(item.liked_by_username || 'someone').length > 18
                    ? `${(item.liked_by_username || 'someone').substring(0, 18)}…`
                    : item.liked_by_username || 'someone'}
                </Text>
              </>
            ) : (
              <>
                Zapped by{' '}
                <Text style={styles.zappedByStrong}>
                  {(item.liked_by_username || 'someone').length > 14
                    ? `${(item.liked_by_username || 'someone').substring(0, 14)}…`
                    : item.liked_by_username || 'someone'}
                </Text>{' '}
                and {item.likes_count - 1} other{item.likes_count - 1 === 1 ? '' : 's'}
              </>
            )}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    flex: 1,
    minWidth: 0,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  zapWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  zapHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zapCount: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    letterSpacing: -0.4,
  },
  burstOverlay: {
    position: 'absolute',
    top: '50%',
    left: 12,
    marginTop: -22,
    marginLeft: -22,
  },
  commentHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sideCount: {
    fontFamily: FontFamily.semibold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  iconOnlyHit: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  viewChipText: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
    letterSpacing: -0.2,
  },
  emojiReact: {
    fontSize: 22,
    lineHeight: 26,
  },
  zappedByLine: {
    marginTop: 8,
    paddingLeft: 2,
  },
  zappedByText: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    opacity: 0.55,
    letterSpacing: -0.1,
  },
  zappedByStrong: {
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
});
