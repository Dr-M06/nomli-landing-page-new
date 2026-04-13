import React, { useState, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchStories, Story } from '../utils/storyUtils';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Camera } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily } from '../constants/Theme';
import { useRouter } from 'expo-router';
import useAuth from '../hooks/useAuth';
import { log, warn, error } from '../utils/productionLogger';

// Placeholders removed - show only real content

const { width } = Dimensions.get('window');
const AVATAR_SIZE = 36;
const RING_WIDTH = 1.5;
const ITEM_WIDTH = AVATAR_SIZE + RING_WIDTH * 2 + 10;
const ITEM_HEIGHT = ITEM_WIDTH + 14;

interface StatusItem {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isLive: boolean;
  isStory: boolean;
  hasAdultContent: boolean;
  viewerCount?: number;
  streamId?: string;
  storyId?: string;
  createdAt: string;
  isSeen?: boolean;
  isPlaceholder?: boolean;
}

interface StatusBarProps {
  liveStreams: any[];
  stories?: StatusItem[];
  onPressLive?: (streamId: string) => void;
  onPressStory?: (userId: string, storyId?: string) => void;
  /** Create-story entry point (Your story +) */
  onPressCreateStory?: () => void;
  /** Fallback CTA when there are no stories */
  onPressEmptyCta?: () => void;
  /** When to show the create-story avatar */
  createButtonMode?: 'always' | 'whenNotEmpty' | 'never';
  /** When true, do not render the empty "What's on your mind?" CTA card. */
  hideEmptyCta?: boolean;
  isAdmin?: boolean;
  onAdminCloseStream?: (streamId: string) => void;
}

const UserStatusBar = React.memo(function UserStatusBar({
  liveStreams = [],
  stories = [],
  onPressLive,
  onPressStory,
  onPressCreateStory,
  onPressEmptyCta,
  createButtonMode = 'always',
  hideEmptyCta = false,
  isAdmin = false,
  onAdminCloseStream,
}: StatusBarProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const flamingoMain = '#FF6FAE';
  const flamingoDeep = '#E25595';
  const flamingoLight = '#FFC0D9';
  const { user } = useAuth();
  const router = useRouter();
  const [fetchedStories, setFetchedStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRealContent, setShowRealContent] = useState(false);
  
  // Placeholders removed - show only real content

  useEffect(() => {
    loadStoriesOptimistic();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadStoriesOptimistic(true);
    }, [])
  );

  const liveStreamIds = React.useMemo(() => {
    return liveStreams.map(s => s.id).sort().join(',');
  }, [liveStreams]);

  useEffect(() => {
    if (liveStreams.length > 0) {
      loadStoriesOptimistic(true);
    }
  }, [liveStreamIds]);

  const loadStoriesOptimistic = async (forceRefresh = false) => {
    if (loading) return;
    
    setLoading(true);
    try {
      const allStories = await fetchStories(forceRefresh);
      setFetchedStories(allStories);
      
      if (!showRealContent) {
        setTimeout(() => setShowRealContent(true), 300);
      }
    } catch (error) {
      error('[StatusBar] Error loading stories:', error);
    } finally {
      setLoading(false);
    }
  };

  const storyItems: StatusItem[] = React.useMemo(() => {
    // Group stories by user_id and get the most recent story for each user
    const storiesByUser = new Map<string, typeof fetchedStories[0]>();
    
    fetchedStories.forEach(story => {
      const existingStory = storiesByUser.get(story.user_id);
      if (!existingStory || new Date(story.created_at) > new Date(existingStory.created_at)) {
        storiesByUser.set(story.user_id, story);
      }
    });
    
    // Convert to StatusItem array (one per user)
    return Array.from(storiesByUser.values()).map(story => ({
      id: `story-${story.user_id}`, // Use user_id instead of story.id to ensure uniqueness per user
      userId: story.user_id,
      username: story.username || 'Unknown',
      displayName: story.display_name,
      avatarUrl: story.avatar_url,
      isLive: false,
      isStory: true,
      hasAdultContent: false,
      storyId: story.id, // Keep the actual story ID for navigation
      createdAt: story.created_at,
      isSeen: story.viewed_by?.includes(user?.id || ''),
    }));
  }, [fetchedStories, user?.id]);

  const liveItems: StatusItem[] = React.useMemo(() => {
    const activeStreams = liveStreams.filter(stream => 
      stream.is_live === true && !stream.ended_at
    );
    
    return activeStreams.map(stream => {
      const hasAdultContent = stream.adult_content === true || 
                                       stream.adult_content === 'true' || 
                                       stream.adult_content === 1 ||
                             (typeof stream.adult_content === 'string' && stream.adult_content.toLowerCase() === 'true') ||
                             (stream.title && typeof stream.title === 'string' && /\[18\+?\]/i.test(stream.title));

      return {
        id: `live-${stream.id}`,
        userId: stream.streamer_id,
        username: stream.streamer_name,
        avatarUrl: stream.streamer_avatar,
        isLive: true,
        isStory: false,
        hasAdultContent: hasAdultContent,
        viewerCount: stream.viewer_count || 0,
        streamId: stream.id,
        createdAt: stream.started_at,
        isSeen: false,
      };
    });
  }, [liveStreams]);

  const sortedItems: StatusItem[] = React.useMemo(() => {
    const liveUserIds = new Set(liveItems.map(item => item.userId));
    const storiesFromLiveUsers: StatusItem[] = [];
    const storiesFromNonLiveUsers: StatusItem[] = [];
    
    storyItems.forEach(storyItem => {
      if (liveUserIds.has(storyItem.userId)) {
        storiesFromLiveUsers.push(storyItem);
      } else {
        storiesFromNonLiveUsers.push(storyItem);
      }
    });
    
    const sorted: StatusItem[] = [];
    
    liveItems.forEach(liveItem => {
      sorted.push(liveItem);
      const userStory = storiesFromLiveUsers.find(s => s.userId === liveItem.userId);
      if (userStory) {
        sorted.push(userStory);
      }
    });
    
    sorted.push(...storiesFromNonLiveUsers);
    
    return sorted.sort((a, b) => {
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      if (a.isLive && b.isLive && a.userId === b.userId) {
        if (a.isLive && b.isStory) return -1;
        if (a.isStory && b.isLive) return 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [liveItems, storyItems]);

  const handlePress = (item: StatusItem) => {
    if (item.isLive && item.streamId && onPressLive) {
      onPressLive(item.streamId);
    } else if (item.isStory && onPressStory) {
      onPressStory(item.userId, item.storyId);
    }
  };

  const allStories = React.useMemo(() => {
    return sortedItems;
  }, [sortedItems]);

  const isEmpty = allStories.length === 0;

  const showCreateButton =
    createButtonMode === 'always' || (createButtonMode === 'whenNotEmpty' && !isEmpty);

  const handleCreatePress = () => {
    onPressCreateStory?.();
  };

  // Collapsed CTA when no stories from others – prompt story creation directly.
  if (isEmpty) {
    if (hideEmptyCta) {
      return null;
    }
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.emptyCta, { backgroundColor: 'rgba(255,111,174,0.16)', borderColor: 'rgba(255,111,174,0.38)' }]}
          onPress={() => (onPressEmptyCta ? onPressEmptyCta() : onPressCreateStory?.())}
          activeOpacity={0.7}
        >
          <View style={[styles.emptyCtaIconWrap, { backgroundColor: flamingoMain }]}>
            <Camera size={18} color="#FFFFFF" strokeWidth={2} />
          </View>
          <Text style={[styles.emptyCtaText, { color: flamingoMain }]}>
            What's on your mind?
          </Text>
          <Text style={[styles.emptyCtaSubtext, { color: themeColors.textSecondary }]} numberOfLines={1}>
            Share your first story
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Your Story button (optional) */}
          {showCreateButton && (
            <TouchableOpacity
              style={styles.storyItem}
              onPress={handleCreatePress}
              activeOpacity={0.7}
            >
              <View style={styles.avatarWrapper}>
                <View style={styles.avatarContainer}>
                  {user?.avatar_url ? (
                    <Image
                      source={{ uri: user.avatar_url }}
                      style={styles.avatarImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: flamingoMain }]}>
                      <Text style={styles.avatarInitial}>
                        {user?.username?.charAt(0).toUpperCase() || 'Y'}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.addButton, { backgroundColor: flamingoMain }]}>
                    <Plus size={12} color="#FFFFFF" strokeWidth={3} />
                  </View>
                </View>
              </View>
              <Text style={styles.username} numberOfLines={1}>
                Your story
              </Text>
            </TouchableOpacity>
          )}

          {/* Status Items */}
          {allStories.map((item) => (
            <StatusItem
              key={item.id}
              item={item}
              onPress={() => handlePress(item)}
              themeColors={themeColors}
              flamingoMain={flamingoMain}
              flamingoDeep={flamingoDeep}
              flamingoLight={flamingoLight}
            />
          ))}
        </ScrollView>
    </View>
  );
}, (prevProps, nextProps) => {
  // Only re-render if props actually change
  return (
    prevProps.liveStreams.length === nextProps.liveStreams.length &&
    prevProps.stories.length === nextProps.stories.length &&
    prevProps.isAdmin === nextProps.isAdmin &&
    JSON.stringify(prevProps.liveStreams.map(s => s.id)) === JSON.stringify(nextProps.liveStreams.map(s => s.id))
  );
});

export default UserStatusBar;

// Redesigned Status Item Component (memoized to avoid slider re-renders)
const StatusItem = React.memo(function StatusItem({
  item,
  onPress,
  themeColors,
  flamingoMain,
  flamingoDeep,
  flamingoLight,
}: {
  item: StatusItem;
  onPress: () => void;
  themeColors: any;
  flamingoMain: string;
  flamingoDeep: string;
  flamingoLight: string;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // One-time pulse for live indicator (no continuous loop – saves CPU/battery)
  useEffect(() => {
    if (item.isLive) {
      const pulse = Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]);
      const glow = Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]);
      pulse.start();
      glow.start();
      return () => {
        pulse.stop();
        glow.stop();
      };
    } else {
      pulseAnim.setValue(1);
      glowAnim.setValue(0);
    }
  }, [item.isLive]);

  const ringGradient = item.isLive
    ? [flamingoDeep, flamingoMain, flamingoLight]
    : item.isSeen
    ? [
        // Seen/opened: Instagram-style muted ring
        '#9CA3AF',
        '#6B7280',
      ]
    : [
        flamingoDeep,
        flamingoMain,
        flamingoLight,
      ];

  return (
    <TouchableOpacity
      style={styles.storyItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrapper}>
      <Animated.View
        style={[
          styles.ringContainer,
          item.isLive && {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
          {/* Pulse rings for live streams */}
        {item.isLive && (
          <>
            <Animated.View
              style={[
                styles.pulseRingOuter,
                {
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 0.6],
                  }),
                  transform: [
                    {
                      scale: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.08],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.pulseRingInner,
                {
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 0.9],
                  }),
                  transform: [
                    {
                      scale: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.05],
                      }),
                    },
                  ],
                },
              ]}
            />
          </>
        )}

        {/* Gradient Ring */}
        <LinearGradient
          colors={ringGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradientRing,
            item.isSeen && !item.isLive ? { opacity: 0.7 } : null,
          ]}
        >
            <View style={styles.innerRing}>
            {item.avatarUrl ? (
                <Image
                  source={{ uri: item.avatarUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
            ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: flamingoMain }]}>
                <Text style={styles.avatarInitial}>
                    {item.username?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            )}
          </View>
        </LinearGradient>

          {/* Badges - Positioned INSIDE container bounds to prevent layout issues */}
          {item.hasAdultContent && (
            <View style={styles.adultBadge}>
              <Text style={styles.adultText}>18+</Text>
            </View>
          )}

        {item.isLive && (
          <View style={styles.liveBadge}>
            <LinearGradient
              colors={[flamingoDeep, flamingoMain]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.liveBadgeGradient}
            >
              <Text style={styles.liveText}>LIVE</Text>
            </LinearGradient>
          </View>
        )}
      </Animated.View>
      </View>

      <Text style={styles.username} numberOfLines={1}>
        {item.username}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    marginBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginHorizontal: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  emptyCtaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaText: {
    fontSize: 12,
    fontFamily: FontFamily.semibold,
  },
  emptyCtaSubtext: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    marginLeft: 2,
    opacity: 0.7,
  },
  scrollContent: {
    paddingHorizontal: 8,
    gap: 4,
    paddingVertical: 0,
  },
  storyItem: {
    alignItems: 'center',
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    // Fixed dimensions prevent any expansion
  },
  avatarWrapper: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  ringContainer: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pulseRingOuter: {
    position: 'absolute',
    width: ITEM_WIDTH - 12,
    height: ITEM_WIDTH - 12,
    borderRadius: (ITEM_WIDTH - 12) / 2,
    borderWidth: 2,
    borderColor: '#E25595',
  },
  pulseRingInner: {
    position: 'absolute',
    width: ITEM_WIDTH - 18,
    height: ITEM_WIDTH - 18,
    borderRadius: (ITEM_WIDTH - 18) / 2,
    borderWidth: 2,
    borderColor: '#FF6FAE',
  },
  gradientRing: {
    width: AVATAR_SIZE + RING_WIDTH * 2,
    height: AVATAR_SIZE + RING_WIDTH * 2,
    borderRadius: (AVATAR_SIZE + RING_WIDTH * 2) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: RING_WIDTH,
  },
  innerRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: FontFamily.bold,
  },
  avatarContainer: {
    width: AVATAR_SIZE + RING_WIDTH * 2,
    height: AVATAR_SIZE + RING_WIDTH * 2,
    borderRadius: (AVATAR_SIZE + RING_WIDTH * 2) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  addButton: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  // Badges positioned INSIDE container bounds
  adultBadge: {
    position: 'absolute',
    bottom: 2, // Inside bounds, not overlapping
    right: 2, // Inside bounds, not overlapping
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 100,
    elevation: 10,
  },
  adultText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  liveBadge: {
    position: 'absolute',
    bottom: 2, // Inside bounds
    left: 2, // Inside bounds
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 5,
  },
  liveBadgeGradient: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.3,
  },
  username: {
    color: 'rgba(244, 248, 255, 0.96)',
    marginTop: 2,
    fontSize: 8,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    width: ITEM_WIDTH,
    opacity: 1,
  },
});

export default React.memo(UserStatusBar);
