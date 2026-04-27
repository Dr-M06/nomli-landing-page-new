import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from 'react-native';
import { X, Users, UserPlus } from 'lucide-react-native';
import { getUserFollowers, getUserFollowing, FollowerUser } from '../utils/followersServiceSimple';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import EnhancedAvatar from './EnhancedAvatar';
import FollowButton from './FollowButton';
import { useRouter } from 'expo-router';
import useAuth from '../hooks/useAuth';
import LikesPrivacyModal from './LikesPrivacyModal';
import { log, warn, error } from '../utils/productionLogger';


interface FollowersModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  initialTab?: 'followers' | 'following';
  username?: string;
  refreshTrigger?: number; // Add refresh trigger
  onDataChange?: () => void; // Callback when follow/unfollow actions happen
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function FollowersModal({
  visible,
  onClose,
  userId,
  initialTab = 'followers',
  username,
  refreshTrigger,
  onDataChange
}: FollowersModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const [followers, setFollowers] = useState<FollowerUser[]>([]);
  const [following, setFollowing] = useState<FollowerUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  
  // Check if current user is the profile owner
  const isOwner = user?.id === userId;

  useEffect(() => {
    if (visible) {
      // If user is not the owner, show privacy modal instead
      if (!isOwner) {
        setShowPrivacyModal(true);
        onClose(); // Close the followers modal
        return;
      }
      setActiveTab(initialTab);
      loadData();
    }
  }, [visible, userId, refreshTrigger, isOwner]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [followersData, followingData] = await Promise.all([
        getUserFollowers(userId),
        getUserFollowing(userId)
      ]);
      
      setFollowers(followersData);
      setFollowing(followingData);
    } catch (error) {
      error('Error loading followers data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserPress = (user: FollowerUser) => {
    onClose();
    router.push(`/profile/${user.id}`);
  };

  const renderUser = ({ item }: { item: FollowerUser }) => (
    <Pressable
      style={({ pressed }) => [
        styles.userItem,
        {
          backgroundColor: themeColors.neutral.card,
          opacity: pressed ? 0.8 : 1,
        }
      ]}
      onPress={() => handleUserPress(item)}
    >
      <View style={styles.userInfo}>
        <EnhancedAvatar
          avatarUrl={item.avatar_url}
          userId={item.id}
          fullName={item.full_name}
          username={item.username}
          size={44}
          isDarkMode={isDarkMode}
          showBorder={false}
        />
        
        <View style={styles.userDetails}>
          <View style={styles.nameContainer}>
            <Text
              style={[
                styles.fullName,
                { color: themeColors.neutral.text }
              ]}
              numberOfLines={1}
            >
              {item.full_name || 'User'}
            </Text>
            {item.is_verified && (
              <View style={[styles.verifiedBadge, { backgroundColor: themeColors.primary.main }]}>
                <Text style={styles.verifiedText}>✓</Text>
              </View>
            )}
          </View>
          
          {item.username && (
            <Text
              style={[
                styles.username,
                { color: themeColors.neutral.subtext }
              ]}
              numberOfLines={1}
            >
              @{item.username}
            </Text>
          )}
        </View>
      </View>
      
      <View style={styles.actionContainer}>
        <FollowButton
          userId={item.id}
          size="small"
          variant="outline"
          onFollowChange={(isFollowing) => {
            // Refresh data when follow status changes
            loadData();
            // Notify parent component that data has changed
            onDataChange?.();
          }}
        />
      </View>
    </Pressable>
  );

  const renderEmptyState = () => {
    const isFollowersTab = activeTab === 'followers';
    return (
      <View style={styles.emptyState}>
        {isFollowersTab ? (
          <Users size={48} color={themeColors.neutral.subtext} strokeWidth={1.5} />
        ) : (
          <UserPlus size={48} color={themeColors.neutral.subtext} strokeWidth={1.5} />
        )}
        <Text style={[styles.emptyTitle, { color: themeColors.neutral.text }]}>
          {isFollowersTab ? 'No followers yet' : 'Not following anyone yet'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: themeColors.neutral.subtext }]}>
          {isFollowersTab 
            ? 'When people follow this user, they\'ll appear here'
            : 'When this user follows others, they\'ll appear here'
          }
        </Text>
      </View>
    );
  };

  const currentData = activeTab === 'followers' ? followers : following;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: themeColors.neutral.border }]}>
          <View style={styles.headerContent}>
            <Text style={[styles.headerTitle, { color: themeColors.neutral.text }]}>
              {username ? `@${username}` : 'User'}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} color={themeColors.neutral.text} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabContainer, { borderBottomColor: themeColors.neutral.border }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'followers' && { borderBottomColor: themeColors.primary.main }
            ]}
            onPress={() => setActiveTab('followers')}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color: activeTab === 'followers' 
                    ? themeColors.primary.main 
                    : themeColors.neutral.subtext
                }
              ]}
            >
              {followers.length} Followers
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'following' && { borderBottomColor: themeColors.primary.main }
            ]}
            onPress={() => setActiveTab('following')}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color: activeTab === 'following' 
                    ? themeColors.primary.main 
                    : themeColors.neutral.subtext
                }
              ]}
            >
              {following.length} Following
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.primary.main} />
            <Text style={[styles.loadingText, { color: themeColors.neutral.subtext }]}>
              Loading...
            </Text>
          </View>
        ) : (
          <FlatList
            data={currentData}
            renderItem={renderUser}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              currentData.length === 0 && styles.emptyListContent
            ]}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: themeColors.neutral.border }]} />
            )}
            ListEmptyComponent={renderEmptyState}
            bounces={true}
            overScrollMode="auto"
          />
        )}
      </View>
      
      {/* Privacy Modal - shown to non-owners */}
      <LikesPrivacyModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'System',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 8,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
    marginLeft: 12,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  fullName: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'System',
    letterSpacing: -0.2,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  verifiedText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '700',
  },
  username: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'System',
  },
  actionContainer: {
    marginLeft: 'auto',
  },
  separator: {
    height: 0.5,
    marginLeft: 76,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    opacity: 0.8,
  },
});
