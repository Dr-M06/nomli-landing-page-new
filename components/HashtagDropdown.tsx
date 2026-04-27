import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Hash } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { Spacing, BorderRadius, FontSizes, FontFamily, Shadow } from '../constants/Theme';
import { HashtagTrend, getSuggestedHashtags } from '../utils/searchUtils';
import { log, warn, error } from '../utils/productionLogger';


interface HashtagDropdownProps {
  visible: boolean;
  searchQuery: string;
  onSelectHashtag: (hashtag: string) => void;
  onClose?: () => void;
}

export default function HashtagDropdown({
  visible,
  searchQuery,
  onSelectHashtag,
  onClose,
}: HashtagDropdownProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [suggestedHashtags, setSuggestedHashtags] = useState<HashtagTrend[]>([]);
  const [loading, setLoading] = useState(false);

  // Update suggestions when search query changes
  useEffect(() => {
    if (visible && searchQuery.trim().length > 0) {
      updateSuggestions();
    } else {
      setSuggestedHashtags([]);
    }
  }, [searchQuery, visible]);

  const updateSuggestions = async () => {
    if (searchQuery.trim().length === 0) {
      setSuggestedHashtags([]);
      return;
    }
    
    try {
      setLoading(true);
      // Pass empty array for trending hashtags since we're not using them
      const suggestions = await getSuggestedHashtags(searchQuery, []);
      setSuggestedHashtags(suggestions);
    } catch (error) {
      error('[HashtagDropdown] Error loading suggested hashtags:', error);
      setSuggestedHashtags([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHashtag = (hashtag: string) => {
    onSelectHashtag(hashtag);
  };

  // Don't show dropdown if not visible or if search query is empty
  if (!visible || searchQuery.trim().length === 0) {
    return null;
  }

  // Limit to 6 items to keep dropdown compact and less intrusive
  const displayHashtags = suggestedHashtags.slice(0, 6);

  return (
    <View style={styles.container} pointerEvents={visible ? "box-none" : "none"}>
      <BlurView
        intensity={40}
        tint={isDarkMode ? 'dark' : 'light'}
        style={[
          styles.dropdown,
          {
            backgroundColor: isDarkMode
              ? 'rgba(30, 30, 30, 0.75)'
              : 'rgba(255, 255, 255, 0.75)',
            borderColor: themeColors.neutral.border,
          },
        ]}
        pointerEvents="auto"
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={themeColors.primary.main} />
            <Text style={[styles.loadingText, { color: themeColors.neutral.textSecondary }]}>
              Loading hashtags...
            </Text>
          </View>
        ) : displayHashtags.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Hash size={24} color={themeColors.neutral.textSecondary} />
            <Text style={[styles.emptyText, { color: themeColors.neutral.textSecondary }]}>
              No hashtags found
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={[styles.headerText, { color: themeColors.neutral.text }]}>
                  Suggestions
                </Text>
              </View>
            </View>
            <FlatList
              data={displayHashtags}
              keyExtractor={(item) => item.hashtag}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.hashtagItem,
                    {
                      backgroundColor: isDarkMode
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(0, 0, 0, 0.02)',
                    },
                  ]}
                  onPress={() => {
                    // item.hashtag already includes # prefix from getTrendingHashtags
                    // Ensure it has exactly one # prefix
                    const cleanHashtag = item.hashtag.startsWith('#') ? item.hashtag : `#${item.hashtag}`;
                    handleSelectHashtag(cleanHashtag);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.hashtagContent}>
                    <Hash size={16} color={themeColors.primary.main} />
                    <Text style={[styles.hashtagText, { color: themeColors.neutral.text }]}>
                      {item.hashtag}
                    </Text>
                  </View>
                  <View style={styles.hashtagStats}>
                    <Text style={[styles.hashtagCount, { color: themeColors.neutral.textSecondary }]}>
                      {item.count} {item.count === 1 ? 'post' : 'posts'}
                    </Text>
                    {item.recentPosts > 0 && (
                      <View style={[styles.recentBadge, { backgroundColor: themeColors.primary.main + '20' }]}>
                        <Text style={[styles.recentBadgeText, { color: themeColors.primary.main }]}>
                          {item.recentPosts} recent
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              maxToRenderPerBatch={10}
              windowSize={5}
            />
          </>
        )}
      </BlurView>
    </View>
  );
}

// Calculate proper dropdown position to avoid blocking search bar
// Header (~60px) + Search bar container padding (~16px) + Search bar height (~40px) + margin (~8px) = ~124px
const DROPDOWN_TOP_OFFSET = 162; // Increased to ensure it's well below search bar and doesn't overlap

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: DROPDOWN_TOP_OFFSET, // Position well below search bar to avoid blocking
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 100, // Much lower z-index to ensure search bar stays on top
    // Ensure container doesn't block search bar - pointerEvents handled in component
  },
  dropdown: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 240, // Reduced to make it less intrusive - shows ~5-6 items
    ...Shadow.md, // Reduced shadow
  },
  loadingContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  emptyContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs, // Reduced padding
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
  listContent: {
    paddingVertical: Spacing.xs,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs, // Reduced from sm
    marginHorizontal: Spacing.xs,
    marginVertical: 1, // Reduced margin
    borderRadius: BorderRadius.md,
  },
  hashtagContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  hashtagText: {
    fontSize: FontSizes.sm, // Reduced from md
    fontFamily: FontFamily.medium,
  },
  hashtagStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  hashtagCount: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
  },
  recentBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  recentBadgeText: {
    fontSize: FontSizes.caption - 1,
    fontFamily: FontFamily.semibold,
  },
});

