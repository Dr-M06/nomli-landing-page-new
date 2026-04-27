import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { useRouter } from 'expo-router';
import EnhancedAvatar from './EnhancedAvatar';
import { getPostReactions, getReactionCounts, ReactionType } from '../utils/reactionUtils';
import useAuth from '../hooks/useAuth';
import { log, warn, error } from '../utils/productionLogger';


type Reaction = {
  id: string;
  user_id: string;
  post_id: string;
  reaction_type: ReactionType;
  created_at: string;
  user?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string;
    is_verified?: boolean;
  };
};

type PostReactionsListProps = {
  visible: boolean;
  onClose: () => void;
  postId: string;
  postOwnerId?: string; // Optional: post owner ID to check if current user is owner
  hideTabs?: boolean;
};

type ReactionTab = 'all' | 'like' | 'laugh';

const PostReactionsList = ({ visible, onClose, postId, postOwnerId, hideTabs = true }: PostReactionsListProps) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reactionCounts, setReactionCounts] = useState({ likes: 0, loves: 0, laughs: 0, total: 0 });
  const [activeTab, setActiveTab] = useState<ReactionTab>('all');
  
  useEffect(() => {
    if (visible && postId) {
      // Everyone can see reactions now - no privacy restrictions
      fetchReactions();
    }
  }, [visible, postId]);
  
  const fetchReactions = async () => {
    try {
      setLoading(true);
      
      // Fetch reactions and counts in parallel
      const [reactionsData, countsData] = await Promise.all([
        getPostReactions(postId),
        getReactionCounts(postId)
      ]);
      
      // Filter out blocked users
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      let filteredReactions = reactionsData;
      
      if (currentUser?.id) {
        const blockUserModule = await import('../utils/blockUser');
        const blockedUserIds = await blockUserModule.getBlockedUserIds(currentUser.id);
        if (blockedUserIds.length > 0) {
          const beforeCount = filteredReactions.length;
          filteredReactions = filteredReactions.filter(reaction => 
            reaction.user_id && !blockedUserIds.includes(reaction.user_id)
          );
          const filteredCount = beforeCount - filteredReactions.length;
          if (filteredCount > 0) {
            log(`[PostReactionsList] 🚫 Filtered out ${filteredCount} reactions from blocked users`);
          }
        }
      }
      
      setReactions(filteredReactions);
      setReactionCounts(countsData);
    } catch (error) {
      error('Error in fetchReactions:', error);
      setReactions([]);
      setReactionCounts({ likes: 0, loves: 0, laughs: 0, total: 0 });
    } finally {
      setLoading(false);
    }
  };
  
  const handleUserPress = (userId: string) => {
    onClose();
    router.push(`/profile/${userId}`);
  };
  
  const getReactionEmoji = (type: ReactionType): string => {
    switch (type) {
      case 'like':
        return '⚡';
      case 'laugh':
        return '😂';
      default:
        return '⚡';
    }
  };
  
  const getReactionLabel = (type: ReactionType): string => {
    switch (type) {
      case 'like':
        return 'Like';
      case 'laugh':
        return 'Laugh';
      default:
        return 'Like';
    }
  };
  
  const getFilteredReactions = (): Reaction[] => {
    if (activeTab === 'all') {
      return reactions;
    }
    return reactions.filter(r => r.reaction_type === activeTab);
  };
  
  const renderReactionTab = (type: ReactionTab, label: string, emoji: string, count: number) => {
    const isActive = activeTab === type;
    return (
      <TouchableOpacity
        key={type}
        style={[
          styles.tab,
          {
            backgroundColor: isActive ? themeColors.primary.main + '15' : 'transparent',
            borderBottomColor: isActive ? themeColors.primary.main : 'transparent',
          }
        ]}
        onPress={() => setActiveTab(type)}
        activeOpacity={0.7}
      >
        <Text style={styles.tabEmoji}>{emoji}</Text>
        <Text
          style={[
            styles.tabLabel,
            {
              color: isActive ? themeColors.primary.main : themeColors.neutral.textSecondary,
              fontFamily: isActive ? FontFamily.semiBold : FontFamily.medium,
            }
          ]}
        >
          {label}
        </Text>
        {count > 0 && (
          <View
            style={[
              styles.tabBadge,
              {
                backgroundColor: isActive ? themeColors.primary.main : themeColors.neutral.backgroundAlt,
              }
            ]}
          >
            <Text
              style={[
                styles.tabBadgeText,
                {
                  color: isActive ? '#FFFFFF' : themeColors.neutral.textSecondary,
                }
              ]}
            >
              {count}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };
  
  const renderItem = ({ item }: { item: Reaction }) => {
    return (
      <TouchableOpacity 
        style={[
          styles.userItem,
          { borderBottomColor: themeColors.neutral.border }
        ]} 
        onPress={() => handleUserPress(item.user?.id || '')}
        activeOpacity={0.7}
      >
        <EnhancedAvatar
          avatarUrl={item.user?.avatar_url}
          size={44}
          isDarkMode={isDarkMode}
          showBorder={false}
          userId={item.user?.id || ''}
          fullName={item.user?.full_name || ''}
          username={item.user?.username || ''}
          isVerified={item.user?.is_verified || false}
          isStatic={true}
        />
        <View style={styles.userInfo}>
          <Text 
            style={[styles.userName, { color: themeColors.neutral.text }]}
            numberOfLines={1}
          >
            {item.user?.full_name || 'Unknown User'}
          </Text>
          <Text 
            style={[styles.username, { color: themeColors.neutral.textSecondary }]}
            numberOfLines={1}
          >
            @{item.user?.username || 'unknown'}
          </Text>
        </View>
        <View style={styles.reactionEmojiContainer}>
          <Text style={styles.reactionEmoji}>{getReactionEmoji(item.reaction_type)}</Text>
        </View>
      </TouchableOpacity>
    );
  };
  
  const filteredReactions = getFilteredReactions();
  const totalReactions = reactionCounts.total;
  
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View 
          style={[
            styles.modalContent, 
            { 
              backgroundColor: themeColors.neutral.background,
              shadowColor: isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)',
            }
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.title, { color: themeColors.neutral.text }]}>
                Reactions
              </Text>
              {totalReactions > 0 && (
                <Text style={[styles.subtitle, { color: themeColors.neutral.textSecondary }]}>
                  {totalReactions} {totalReactions === 1 ? 'reaction' : 'reactions'}
                </Text>
              )}
            </View>
            <TouchableOpacity 
              onPress={onClose} 
              style={[
                styles.closeButton, 
                { backgroundColor: themeColors.neutral.backgroundAlt }
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={themeColors.neutral.text} />
            </TouchableOpacity>
          </View>
          
          {/* Tabs */}
          {totalReactions > 0 && !hideTabs && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsContainer}
              contentContainerStyle={styles.tabsContent}
            >
              {renderReactionTab('all', 'All', '⚡', totalReactions)}
              {reactionCounts.likes > 0 && renderReactionTab('like', 'Like', '⚡', reactionCounts.likes)}
              {reactionCounts.laughs > 0 && renderReactionTab('laugh', 'Laugh', '😂', reactionCounts.laughs)}
            </ScrollView>
          )}
          
          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.primary.main} />
            </View>
          ) : (
            <FlatList
              data={filteredReactions}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyEmoji}>😊</Text>
                  <Text style={[styles.emptyText, { color: themeColors.neutral.textSecondary }]}>
                    No reactions yet
                  </Text>
                  <Text style={[styles.emptySubtext, { color: themeColors.neutral.textSecondary }]}>
                    Be the first to react to this post!
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
      
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '60%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabsContainer: {
    marginBottom: 16,
    maxHeight: 50,
  },
  tabsContent: {
    paddingRight: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    borderBottomWidth: 2,
    minHeight: 40,
  },
  tabEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  tabLabel: {
    fontSize: FontSizes.sm,
    marginRight: 6,
  },
  tabBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.semiBold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  listContent: {
    paddingBottom: 20,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semiBold,
    lineHeight: 20,
    marginBottom: 2,
  },
  username: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 16,
  },
  reactionEmojiContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionEmoji: {
    fontSize: 20,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.semiBold,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default PostReactionsList;
