import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { X, Heart } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import { formatTimeAgo } from '../utils/formatters';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { log, warn, error } from '../utils/productionLogger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_HEIGHT = 56; // So sheet content sits above bottom tabs when in overlay mode
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.7; // 70% of screen height
const CLOSE_THRESHOLD = 100; // Drag down 100px to close

interface StoryReaction {
  id: string;
  story_id: string;
  user_id: string;
  reaction_type: string;
  x_position?: number;
  created_at: string;
  user?: {
    id: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
}

interface StoryReactionsProps {
  visible: boolean;
  onClose: () => void;
  storyId: string;
  storyOwnerId: string;
  currentUserId: string;
  /** When true, render as overlay View instead of Modal (avoids iOS modal-on-modal freeze) */
  useOverlay?: boolean;
}

export default function StoryReactions({
  visible,
  onClose,
  storyId,
  storyOwnerId,
  currentUserId,
  useOverlay = false,
}: StoryReactionsProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isStoryOwner = currentUserId === storyOwnerId;
  // When overlay is used inside tab screen, add space so sheet sits above tab bar
  const bottomPadding = useOverlay ? insets.bottom + TAB_BAR_HEIGHT : (Platform.OS === 'ios' ? 34 : Spacing.md);
  
  const [reactions, setReactions] = useState<StoryReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const translateY = useRef(new Animated.Value(BOTTOM_SHEET_MAX_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 30,
        stiffness: 300,
      }).start();
      
      if (storyId) {
        loadReactions();
      }
    } else {
      // Reset
      translateY.setValue(BOTTOM_SHEET_MAX_HEIGHT);
      setReactions([]);
      setLoading(true);
    }
  }, [visible, storyId]);

  const loadReactions = async () => {
    try {
      setLoading(true);
      
      // Fetch reactions with user profiles
      // Get unique reactions per user (one per user, most recent)
      // First, get all reactions excluding story owner
      const { data: allReactionsData, error: reactionsError } = await supabase
        .from('story_reactions')
        .select('id, story_id, user_id, reaction_type, x_position, created_at')
        .eq('story_id', storyId)
        .neq('user_id', storyOwnerId) // Exclude story owner's reactions
        .order('created_at', { ascending: false });

      if (reactionsError) {
        // If table doesn't exist, that's okay
        if (reactionsError.code === '42P01' || reactionsError.message?.includes('does not exist')) {
          log('Story reactions table does not exist yet');
          setReactions([]);
          return;
        }
        error('[StoryReactions] Error loading reactions:', reactionsError);
        setReactions([]);
        return;
      }

      if (!allReactionsData || allReactionsData.length === 0) {
        setReactions([]);
        return;
      }

      // Get only the most recent reaction per user (one per user)
      const userReactionMap = new Map();
      allReactionsData.forEach((reaction: any) => {
        const existing = userReactionMap.get(reaction.user_id);
        if (!existing || new Date(reaction.created_at) > new Date(existing.created_at)) {
          userReactionMap.set(reaction.user_id, reaction);
        }
      });

      // Convert map to array (one reaction per user)
      const reactionsData = Array.from(userReactionMap.values());

      if (reactionsData.length === 0) {
        setReactions([]);
        return;
      }

      // Get user IDs
      const userIds = [...new Set(reactionsData.map(r => r.user_id))];
      
      // Fetch user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', userIds);

      // Create a map of user profiles
      const profilesMap = new Map();
      if (profilesData) {
        profilesData.forEach(profile => {
          profilesMap.set(profile.id, profile);
        });
      }

      // Combine reactions with profiles
      const transformedReactions = reactionsData.map((reaction: any) => ({
        ...reaction,
        user: profilesMap.get(reaction.user_id) || null,
      }));

      setReactions(transformedReactions);
    } catch (error) {
      error('[StoryReactions] Exception loading reactions:', error);
      setReactions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Animate out
    Animated.timing(translateY, {
      toValue: BOTTOM_SHEET_MAX_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  // Pan responder for drag to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > CLOSE_THRESHOLD) {
          handleClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 30,
            stiffness: 300,
          }).start();
        }
      },
    })
  ).current;

  const renderReactionItem = ({ item }: { item: StoryReaction }) => {
    const userName = item.user?.full_name || item.user?.username || 'Unknown User';
    const avatarUrl = item.user?.avatar_url;

    return (
      <TouchableOpacity
        style={[
          styles.reactionItem,
          { backgroundColor: themeColors.cardBackground },
        ]}
        onPress={() => {
          if (item.user?.id) {
            router.push(`/profile/${item.user.id}`);
            handleClose();
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.reactionItemLeft}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarPlaceholderText}>
                {userName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.reactionItemInfo}>
            <Text style={[styles.userName, { color: themeColors.text }]}>
              {userName}
            </Text>
            <Text style={[styles.reactionTime, { color: themeColors.textSecondary }]}>
              {formatTimeAgo(item.created_at)}
            </Text>
          </View>
        </View>
        <View style={styles.reactionItemRight}>
          <Heart size={20} color="#FF1744" fill="#FF1744" strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  const sheetContent = (
    <>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: themeColors.background,
              paddingBottom: bottomPadding,
              transform: [{ translateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Handle bar */}
          <View style={styles.handleBar}>
            <View style={[styles.handle, { backgroundColor: themeColors.border }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>
              Reactions ({reactions.length})
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <X size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.primary} />
            </View>
          ) : reactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Heart size={48} color={themeColors.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No reactions yet
              </Text>
              <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>
                When someone double-taps your story, their reaction will appear here
              </Text>
            </View>
          ) : (
            <FlatList
              data={reactions}
              renderItem={renderReactionItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Animated.View>
      </TouchableOpacity>
    </>
  );

  if (!visible) return null;
  if (useOverlay) {
    return (
      <View style={styles.overlayRoot}>
        {sheetContent}
      </View>
    );
  }
  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      {sheetContent}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    maxHeight: BOTTOM_SHEET_MAX_HEIGHT,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  handleBar: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.semiBold,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  reactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  reactionItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: Spacing.md,
  },
  avatarPlaceholder: {
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.bold,
    color: '#999',
  },
  reactionItemInfo: {
    flex: 1,
  },
  userName: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semiBold,
    marginBottom: 2,
  },
  reactionTime: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  reactionItemRight: {
    marginLeft: Spacing.md,
  },
});

