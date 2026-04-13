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
import { X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import { getStoryViewers, StoryView } from '../utils/storyUtils';
import { formatTimeAgo } from '../utils/formatters';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { log, warn, error } from '../utils/productionLogger';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const TAB_BAR_HEIGHT = 56; // Space so sheet sits above bottom tabs
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.7; // 70% of screen height
const CLOSE_THRESHOLD = 100; // Drag down 100px to close

interface StoryViewersProps {
  visible: boolean;
  onClose: () => void;
  storyId: string;
  storyOwnerId: string;
  currentUserId: string;
  /** When true, render as overlay View instead of Modal (avoids iOS modal-on-modal freeze) */
  useOverlay?: boolean;
}

export default function StoryViewers({
  visible,
  onClose,
  storyId,
  storyOwnerId,
  currentUserId,
  useOverlay = false,
}: StoryViewersProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isStoryOwner = currentUserId === storyOwnerId;
  
  const [viewers, setViewers] = useState<StoryView[]>([]);
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
        loadViewers();
      }
    } else {
      // Reset
      translateY.setValue(BOTTOM_SHEET_MAX_HEIGHT);
      setViewers([]);
      setLoading(true);
    }
  }, [visible, storyId]);

  const loadViewers = async () => {
    try {
      setLoading(true);
      const storyViewers = await getStoryViewers(storyId);
      setViewers(storyViewers);
    } catch (error) {
      error('[StoryViewers] Error loading viewers:', error);
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
        // Only respond to vertical drags
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down (positive dy)
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > CLOSE_THRESHOLD) {
          // Close if dragged down far enough
          handleClose();
        } else {
          // Snap back to open position
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

  const renderViewerItem = ({ item }: { item: StoryView }) => {
    const isCurrentUser = item.viewer_id === currentUserId;
    
    const handleViewerPress = () => {
      if (isStoryOwner && !isCurrentUser) {
        // Story owner can click on viewer avatars to see their profile
        router.push(`/profile/${item.viewer_id}`);
        onClose();
      }
    };
    
    return (
      <TouchableOpacity 
        style={[styles.viewerItem, { borderBottomColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)' }]}
        onPress={handleViewerPress}
        activeOpacity={isStoryOwner && !isCurrentUser ? 0.7 : 1}
        disabled={!isStoryOwner || isCurrentUser}
      >
        <View style={styles.viewerInfo}>
          {item.avatar_url ? (
            <Image
              source={{ uri: item.avatar_url }}
              style={styles.viewerAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.viewerAvatar, { backgroundColor: themeColors.primary.main }]}>
              <Text style={styles.viewerInitial}>
                {item.username?.charAt(0).toUpperCase() || item.display_name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          
          <View style={styles.viewerTextContainer}>
            <Text style={[styles.viewerName, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}>
              {isCurrentUser ? 'You' : item.display_name || item.username || 'User'}
            </Text>
            <Text style={[styles.viewerTime, { color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)' }]}>
              {formatTimeAgo(item.viewed_at)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const sheetContent = (
    <>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      >
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: isDarkMode ? '#2A2A2A' : '#F8F8F8',
              transform: [{ translateY }],
              paddingBottom: (Platform.OS === 'ios' ? 30 : 10) + insets.bottom + TAB_BAR_HEIGHT,
            },
          ]}
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <View style={styles.handleContainer} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }]}>
            <Text style={[styles.headerTitle, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}>
              Viewers
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              accessibilityLabel="Close"
            >
              <X size={22} color={isDarkMode ? '#FFFFFF' : '#000000'} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Viewers Count */}
          {!loading && (
            <View style={styles.countContainer}>
              <Text style={[styles.countText, { color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)' }]}>
                {viewers.length} {viewers.length === 1 ? 'viewer' : 'viewers'}
              </Text>
            </View>
          )}

          {/* Viewers List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.primary.main} />
              <Text style={[styles.loadingText, { color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)' }]}>
                Loading viewers...
              </Text>
            </View>
          ) : viewers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)' }]}>
                No one has viewed this story yet
              </Text>
            </View>
          ) : (
            <FlatList
              data={viewers}
              renderItem={renderViewerItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[styles.listContent, { paddingBottom: Spacing.md }]}
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
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    maxHeight: BOTTOM_SHEET_MAX_HEIGHT,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
    // Premium shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    // Subtle border for definition
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  countContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  countText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  loadingContainer: {
    paddingVertical: Spacing.xxl * 2,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
  },
  emptyContainer: {
    paddingVertical: Spacing.xxl * 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  listContent: {
    paddingVertical: Spacing.sm,
  },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  viewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  viewerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerInitial: {
    color: '#FFFFFF',
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.bold,
  },
  viewerTextContainer: {
    flex: 1,
  },
  viewerName: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    marginBottom: Spacing.xxs,
  },
  viewerTime: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
});
