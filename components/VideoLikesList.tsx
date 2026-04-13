import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  Pressable
} from 'react-native';
import { Users, X, Zap } from 'lucide-react-native';
import { supabase } from '../utils/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { useRouter } from 'expo-router';
import EnhancedAvatar from './EnhancedAvatar';
import useAuth from '../hooks/useAuth';
import { log, warn, error } from '../utils/productionLogger';


type VideoLike = {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
  reaction_type?: 'like' | 'laugh';
  user?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string;
  };
};

type VideoLikesListProps = {
  visible: boolean;
  onClose: () => void;
  postId: string;
  likesCount: number;
  postOwnerId?: string; // Optional: post owner ID to check if current user is owner
};

const VideoLikesList = ({ visible, onClose, postId, likesCount, postOwnerId }: VideoLikesListProps) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [likes, setLikes] = useState<VideoLike[]>([]);
  
  useEffect(() => {
    if (visible && postId) {
      // Everyone can see likes now - no privacy restrictions
      fetchLikes();
    }
  }, [visible, postId]);
  
  const fetchLikes = async () => {
    try {
      setLoading(true);
      
      // Step 1: Get reactions/likes without join first.
      // New spark system uses post_reactions; keep old table fallbacks.
      let likesData = null;
      const { data: reactionLikes, error: reactionError } = await supabase
        .from('post_reactions')
        .select('id, user_id, post_id, reaction_type, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });

      if (reactionError) {
        log('Error fetching from post_reactions:', reactionError);
      }

      if (reactionLikes && reactionLikes.length > 0) {
        likesData = reactionLikes;
      }

      // Legacy fallback 1
      let { data: communityLikes, error: communityError } = await supabase
        .from('community_post_likes')
        .select('id, user_id, post_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });
      
      if (communityError) {
        log('Error fetching from community_post_likes:', communityError);
      }
      
      // Legacy fallback 2
      if (!likesData && (!communityLikes || communityLikes.length === 0)) {
        const { data: postLikes, error: postError } = await supabase
          .from('post_likes')
          .select('id, user_id, post_id, created_at')
          .eq('post_id', postId)
          .order('created_at', { ascending: false });
        
        if (postError) {
          log('Error fetching from post_likes:', postError);
        } else {
          likesData = postLikes;
        }
      } else if (!likesData) {
        likesData = communityLikes;
      }
      
      if (!likesData || likesData.length === 0) {
        setLikes([]);
        return;
      }

      // Dedupe by user_id (safety: reactions table may include older duplicates).
      const seenUsers = new Set<string>();
      likesData = likesData.filter((like: any) => {
        const uid = like?.user_id;
        if (!uid || seenUsers.has(uid)) return false;
        seenUsers.add(uid);
        return true;
      });
      
      // Step 2: Get user profiles for all user_ids
      const userIds = likesData.map(like => like.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', userIds);
      
      if (profilesError) {
        error('Error fetching user profiles:', profilesError);
        setLikes([]);
        return;
      }
      
      // Step 3: Combine likes with user data
      let likesWithUsers = likesData.map(like => ({
        ...like,
        reaction_type: like.reaction_type || 'like',
        user: profiles?.find(profile => profile.id === like.user_id) || null
      }));
      
      // Step 4: Filter out blocked users (bidirectional blocking)
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser?.id) {
        const blockUserModule = await import('../utils/blockUser');
        const blockedUserIds = await blockUserModule.getBlockedUserIds(currentUser.id);
        if (blockedUserIds.length > 0) {
          const beforeCount = likesWithUsers.length;
          likesWithUsers = likesWithUsers.filter(like => 
            like.user_id && !blockedUserIds.includes(like.user_id)
          );
          const filteredCount = beforeCount - likesWithUsers.length;
          if (filteredCount > 0) {
            log(`[VideoLikesList] 🚫 Filtered out ${filteredCount} likes from blocked users`);
          }
        }
      }
      
      setLikes(likesWithUsers);
    } catch (error) {
      error('Error in fetchLikes:', error);
      setLikes([]);
    } finally {
      setLoading(false);
    }
  };
  
  const handleUserPress = (userId: string) => {
    onClose();
    router.push(`/profile/${userId}`);
  };
  
  const renderItem = ({ item }: { item: VideoLike }) => {
    const isLaugh = item.reaction_type === 'laugh';
    return (
      <TouchableOpacity 
        style={[styles.userItem, { borderBottomColor: themeColors.neutral.border }]} 
        onPress={() => handleUserPress(item.user?.id || '')}
      >
        <EnhancedAvatar
          avatarUrl={item.user?.avatar_url}
          size={32}
          isDarkMode={isDarkMode}
          showBorder={false}
          userId={item.user?.id || ''}
          fullName={item.user?.full_name || ''}
          username={item.user?.username || ''}
          isStatic={true}
        />
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: themeColors.neutral.text }]}>
            {item.user?.full_name || 'Unknown User'}
          </Text>
          <Text style={[styles.username, { color: themeColors.neutral.textSecondary }]}>
            @{item.user?.username || 'unknown'}
          </Text>
        </View>
        <View style={[styles.likeIconContainer, { backgroundColor: isLaugh ? '#F59E0B' : themeColors.primary.main }]}>
          {isLaugh ? (
            <Text style={styles.reactionEmoji}>😂</Text>
          ) : (
            <Zap size={12} color="white" fill="white" />
          )}
        </View>
      </TouchableOpacity>
    );
  };
  
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalOverlayPress} onPress={onClose} />
        <View 
          style={[
            styles.modalContent, 
            { 
              backgroundColor: themeColors.neutral.background,
              shadowColor: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.2)',
            }
          ]}
        >
          <View style={[styles.header, { borderBottomColor: themeColors.neutral.border }]}>
            <Text style={[styles.title, { color: themeColors.neutral.text }]}>
              Likes ({likesCount})
            </Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: themeColors.neutral.backgroundAlt }]}>
              <X size={20} color={themeColors.neutral.text} />
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.primary.main} />
              <Text style={[styles.loadingText, { color: themeColors.neutral.textSecondary }]}>
                Loading likes...
              </Text>
            </View>
          ) : (
            <FlatList
              data={likes}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Zap size={48} color={themeColors.neutral.textSecondary} strokeWidth={1.5} />
                  <Text style={[styles.emptyText, { color: themeColors.neutral.textSecondary }]}>
                    No likes yet
                  </Text>
                  <Text style={[styles.emptySubtext, { color: themeColors.neutral.textSecondary }]}>
                    Be the first to like this video!
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
  modalOverlayPress: {
    flex: 1,
  },
  modalContent: {
    height: '75%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
  },
  closeButton: {
    padding: Spacing.xs,
    borderRadius: 12,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.medium,
    marginTop: Spacing.md,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
  },
  userInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  userName: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semiBold,
    lineHeight: 18,
    marginBottom: 1,
  },
  username: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    lineHeight: 14,
  },
  likeIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionEmoji: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  emptyText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.semiBold,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptySubtext: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
});

export default VideoLikesList;