import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { EllipsisVertical, Store } from 'lucide-react-native';
import SimpleAvatar from '../SimpleAvatar';
import { formatTimeAgo } from '../../utils/formatters';
import { getSafeDisplayName, stripAtSymbol } from '../../utils/contentFilter';
import { BorderRadius, FontFamily } from '../../constants/Theme';
import { error } from '../../utils/productionLogger';
import CreatorProAuthorBadge from '../CreatorProAuthorBadge';

interface PostHeaderProps {
  item: any;
  themeColors: any;
  isDark: boolean;
  isOwner: boolean;
  isDeleting: boolean;
  navigateToUserProfile: (userId: string) => void;
  setPostMenuVisible: (postId: string) => void;
  setSelectedPost: (post: any) => void;
}

export const PostHeader: React.FC<PostHeaderProps> = ({
  item,
  themeColors,
  isDark,
  isOwner,
  isDeleting,
  navigateToUserProfile,
  setPostMenuVisible,
  setSelectedPost,
}) => {
  const getDisplayUsername = () => {
    try {
      const username =
        item.username ||
        item.profile?.username ||
        item.display_name ||
        item.profile?.display_name ||
        item.profile?.full_name ||
        item.user_email?.split('@')[0] ||
        (item.user_id ? `user_${item.user_id.substring(0, 8)}` : 'user');

      const safeName = getSafeDisplayName(username, item.display_name);
      const cleanedName = stripAtSymbol(safeName);
      const displayName = cleanedName.length > 16 ? cleanedName.substring(0, 16) + '…' : cleanedName;
      return displayName || 'user';
    } catch (err) {
      error('[PostHeader] Error sanitizing username:', err);
      const fallbackUsername =
        item.username ||
        item.profile?.username ||
        item.display_name ||
        item.profile?.full_name ||
        (item.user_id ? `user_${item.user_id.substring(0, 8)}` : 'user');
      const cleaned = stripAtSymbol(fallbackUsername);
      return cleaned.length > 16 ? cleaned.substring(0, 16) + '…' : cleaned || 'user';
    }
  };

  const pillBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  return (
    <View style={styles.postHeader}>
      <View style={styles.userInfoContainer}>
        <TouchableOpacity onPress={() => navigateToUserProfile(item.user_id)} activeOpacity={0.75}>
          <SimpleAvatar
            avatarUrl={item.profile?.avatar_url || item.user_avatar_url}
            userId={item.user_id}
            size={36}
            isDarkMode={isDark}
            isVerified={item.profile?.is_verified || item.is_verified || false}
            fullName={item.profile?.full_name}
            username={item.username}
            email={item.user_email}
          />
        </TouchableOpacity>
        <View style={styles.userTextContainer}>
          <View style={styles.topRow}>
            <View style={styles.nameBlock}>
              <TouchableOpacity
                onPress={() => navigateToUserProfile(item.user_id)}
                activeOpacity={0.75}
                style={styles.nameTap}
              >
                <Text
                  style={[styles.userName, { color: themeColors.neutral.text }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  @{getDisplayUsername()}
                </Text>
              </TouchableOpacity>
              {item.is_business && (
                <View style={[styles.businessBadge, { backgroundColor: themeColors.primary.main + '18' }]}>
                  <Store size={11} color={themeColors.primary.main} strokeWidth={2} />
                  <Text style={[styles.businessBadgeText, { color: themeColors.primary.main }]}>biz</Text>
                </View>
              )}
              <CreatorProAuthorBadge creatorProUntil={item.profile?.creator_pro_until} isDark={isDark} />
            </View>
            {!!item.created_at && (
              <View style={[styles.timePill, { backgroundColor: pillBg }]}>
                <Text style={[styles.timePillText, { color: themeColors.neutral.subtext }]}>
                  {formatTimeAgo(item.created_at)}
                </Text>
              </View>
            )}
          </View>
          {item.location ? (
            <Text style={[styles.locationText, { color: themeColors.neutral.subtext }]} numberOfLines={1}>
              {item.location}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.postHeaderActions}>
        {isOwner && !isDeleting && (
          <TouchableOpacity
            onPress={() => {
              setSelectedPost(item);
              setPostMenuVisible(item.id);
            }}
            activeOpacity={0.6}
            hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
            style={styles.menuButton}
          >
            <EllipsisVertical size={20} color={themeColors.neutral.subtext} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
  },
  userTextContainer: {
    marginLeft: 10,
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  nameBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  nameTap: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontFamily: FontFamily.semibold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  businessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 3,
  },
  businessBadgeText: {
    fontFamily: FontFamily.semibold,
    fontSize: 10,
    textTransform: 'lowercase',
    letterSpacing: 0.2,
  },
  timePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexShrink: 0,
  },
  timePillText: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    opacity: 0.85,
  },
  locationText: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    marginTop: 3,
    opacity: 0.55,
  },
  postHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 2,
  },
  menuButton: {
    padding: 2,
    minWidth: 28,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
});
