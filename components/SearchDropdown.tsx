import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Hash, Clock, User } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { Spacing, BorderRadius, FontSizes, FontFamily, Shadow } from '../constants/Theme';
import { 
  HashtagTrend, 
  getSuggestedHashtags,
  searchUsers,
  UserSearchResult,
  getSearchHistory,
  clearSearchHistory,
  saveSearchHistory
} from '../utils/searchUtils';
import SimpleAvatar from './SimpleAvatar';
import { log, warn, error } from '../utils/productionLogger';


interface SearchDropdownProps {
  visible: boolean;
  searchQuery: string;
  onSelectHashtag: (hashtag: string) => void;
  onSelectUser: (userId: string) => void;
  onSelectHistory: (query: string) => void;
  onClose?: () => void;
}

export default function SearchDropdown({
  visible,
  searchQuery,
  onSelectHashtag,
  onSelectUser,
  onSelectHistory,
  onClose,
}: SearchDropdownProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [suggestedHashtags, setSuggestedHashtags] = useState<HashtagTrend[]>([]);
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showClearHistory, setShowClearHistory] = useState(false);
  
  // Refs for debouncing
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastQueryRef = useRef<string>('');

  // Load search history on mount
  useEffect(() => {
    if (visible) {
      loadSearchHistory();
    }
  }, [visible]);

  // Debounced search effect
  useEffect(() => {
    if (!visible) return;

    const query = searchQuery.trim();
    
    // Clear any pending timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Empty query - show history immediately
    if (query.length === 0) {
      setSuggestedHashtags([]);
      setUserResults([]);
      loadSearchHistory();
      return;
    }

    // Skip if query hasn't changed
    if (query === lastQueryRef.current) return;

    // Minimum 2 chars for search
    if (query.length < 2) {
      setSuggestedHashtags([]);
      setUserResults([]);
      return;
    }

    // Debounce: 150ms for hashtags, 300ms for users
    const debounceMs = query.startsWith('#') ? 150 : 300;
    
    searchTimeoutRef.current = setTimeout(() => {
      lastQueryRef.current = query;
      
      if (query.startsWith('#')) {
        updateHashtagSuggestions(query);
        setUserResults([]);
      } else {
        updateUserSearch(query);
        setSuggestedHashtags([]);
      }
    }, debounceMs);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, visible]);

  const loadSearchHistory = useCallback(async () => {
    try {
      const history = await getSearchHistory();
      setSearchHistory(history);
      setShowClearHistory(history.length > 0);
    } catch (error) {
      error('[SearchDropdown] History error:', error);
    }
  }, []);

  const updateHashtagSuggestions = useCallback(async (query: string) => {
    try {
      setLoading(true);
      const suggestions = await getSuggestedHashtags(query, []);
      setSuggestedHashtags(suggestions);
    } catch (error) {
      error('[SearchDropdown] Hashtag error:', error);
      setSuggestedHashtags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUserSearch = useCallback(async (query: string) => {
    try {
      setLoadingUsers(true);
      const users = await searchUsers(query, 10);
      setUserResults(users);
    } catch (error) {
      error('[SearchDropdown] User search error:', error);
      setUserResults([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const handleSelectHashtag = (hashtag: string) => {
    const cleanHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
    saveSearchHistory(cleanHashtag);
    onSelectHashtag(cleanHashtag);
  };

  const handleSelectUser = (user: UserSearchResult) => {
    saveSearchHistory(user.username || user.full_name || '');
    onSelectUser(user.id);
  };

  const handleSelectHistory = (query: string) => {
    onSelectHistory(query);
  };

  const handleClearHistory = async () => {
    try {
      await clearSearchHistory();
      setSearchHistory([]);
      setShowClearHistory(false);
    } catch (error) {
      error('[SearchDropdown] Error clearing history:', error);
    }
  };

  if (!visible) {
    return null;
  }

  // Show history when query is empty
  const showHistory = searchQuery.trim().length === 0 && searchHistory.length > 0;
  // Show hashtag suggestions when query starts with #
  const showHashtags = searchQuery.trim().startsWith('#') && (suggestedHashtags.length > 0 || loading);
  // Show user results when query doesn't start with # and has content
  const showUsers = !searchQuery.trim().startsWith('#') && searchQuery.trim().length > 0 && (userResults.length > 0 || loadingUsers);

  // Don't show dropdown if nothing to show
  if (!showHistory && !showHashtags && !showUsers) {
    return null;
  }

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
        {/* Search History */}
        {showHistory && (
          <>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Clock size={16} color={themeColors.neutral.textSecondary} />
                <Text style={[styles.headerText, { color: themeColors.neutral.text }]}>
                  Recent Searches
                </Text>
              </View>
              {showClearHistory && (
                <TouchableOpacity
                  onPress={handleClearHistory}
                  style={styles.clearButton}
                >
                  <Text style={[styles.clearButtonText, { color: themeColors.primary.main }]}>
                    Clear
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.listContent}>
              {searchHistory.slice(0, 5).map((item, index) => (
                <TouchableOpacity
                  key={`history-${index}-${item}`}
                  style={[
                    styles.historyItem,
                    {
                      backgroundColor: isDarkMode
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(0, 0, 0, 0.02)',
                    },
                  ]}
                  onPress={() => handleSelectHistory(item)}
                  activeOpacity={0.7}
                >
                  <Clock size={16} color={themeColors.neutral.textSecondary} />
                  <Text style={[styles.historyText, { color: themeColors.neutral.text }]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Hashtag Suggestions */}
        {showHashtags && (
          <>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Hash size={16} color={themeColors.primary.main} />
                <Text style={[styles.headerText, { color: themeColors.neutral.text }]}>
                  Hashtag Suggestions
                </Text>
              </View>
            </View>
            {suggestedHashtags.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: themeColors.neutral.textSecondary }]}>
                  {loading ? 'Searching...' : 'No hashtags found'}
                </Text>
              </View>
            ) : (
              <View style={styles.listContent}>
                {suggestedHashtags.slice(0, 6).map((item) => (
                  <TouchableOpacity
                    key={item.hashtag}
                    style={[
                      styles.hashtagItem,
                      {
                        backgroundColor: isDarkMode
                          ? 'rgba(255, 255, 255, 0.05)'
                          : 'rgba(0, 0, 0, 0.02)',
                      },
                    ]}
                    onPress={() => handleSelectHashtag(item.hashtag)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.hashtagContent}>
                      <Hash size={16} color={themeColors.primary.main} />
                      <Text style={[styles.hashtagText, { color: themeColors.neutral.text }]}>
                        {item.hashtag}
                      </Text>
                    </View>
                    <Text style={[styles.hashtagCount, { color: themeColors.neutral.textSecondary }]}>
                      {item.count} {item.count === 1 ? 'post' : 'posts'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* User Search Results */}
        {showUsers && (
          <>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <User size={16} color={themeColors.primary.main} />
                <Text style={[styles.headerText, { color: themeColors.neutral.text }]}>
                  People
                </Text>
              </View>
            </View>
            {userResults.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: themeColors.neutral.textSecondary }]}>
                  {loadingUsers ? 'Searching...' : 'No users found'}
                </Text>
              </View>
            ) : (
              <View style={styles.listContent}>
                {userResults.slice(0, 6).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.userItem,
                      {
                        backgroundColor: isDarkMode
                          ? 'rgba(255, 255, 255, 0.05)'
                          : 'rgba(0, 0, 0, 0.02)',
                      },
                    ]}
                    onPress={() => handleSelectUser(item)}
                    activeOpacity={0.7}
                  >
                    <SimpleAvatar
                      userId={item.id}
                      username={item.username || ''}
                      avatarUrl={item.avatar_url}
                      size={40}
                      isVerified={item.is_verified}
                      isPremium={item.is_premium}
                    />
                    <View style={styles.userInfo}>
                      <Text style={[styles.userName, { color: themeColors.neutral.text }]}>
                        {item.full_name || item.username || 'User'}
                      </Text>
                      {item.username && (
                        <Text style={[styles.userUsername, { color: themeColors.neutral.textSecondary }]}>
                          @{item.username}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </BlurView>
    </View>
  );
}

// Position dropdown clearly below the search bar so "Recent Searches" isn't hidden under it.
// Header (~56) + search bar (~52) + small gap. Use 200 to account for safe area and shadow.
const DROPDOWN_TOP_OFFSET = 200;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: DROPDOWN_TOP_OFFSET,
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 999,
    elevation: 8,
  },
  dropdown: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 400,
    ...Shadow.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
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
  clearButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  clearButtonText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  listContent: {
    paddingVertical: Spacing.xs,
  },
  emptyContainer: {
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.xs,
    marginVertical: 1,
    borderRadius: BorderRadius.md,
  },
  historyText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    flex: 1,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.xs,
    marginVertical: 1,
    borderRadius: BorderRadius.md,
  },
  hashtagContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  hashtagText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  hashtagCount: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.xs,
    marginVertical: 1,
    borderRadius: BorderRadius.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
  userUsername: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
});
