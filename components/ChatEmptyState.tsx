/**
 * ChatEmptyState Component
 * 
 * A reusable empty state component for chat screens that handles the common
 * issue of upside-down empty states when using inverted FlatLists.
 * 
 * Problem: When FlatList has inverted={true}, the ListEmptyComponent appears upside down
 * Solution: This component detects inverted mode and applies transform: [{ scaleY: -1 }]
 * 
 * @example
 * // For regular FlatList
 * <ChatEmptyState themeColors={themeColors} isInverted={false} />
 * 
 * // For inverted FlatList (most chat screens)
 * <ChatEmptyState themeColors={themeColors} isInverted={true} />
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ChatEmptyStateProps {
  title?: string;
  message?: string;
  showBookmarked?: boolean;
  themeColors: any;
  isInverted?: boolean; // NEW: Handle inverted FlatList
}

/**
 * A reusable component for displaying empty chat states
 * that works correctly with both normal and inverted FlatLists
 * 
 * Usage:
 * - For normal FlatList: <ChatEmptyState isInverted={false} />
 * - For inverted FlatList: <ChatEmptyState isInverted={true} />
 * 
 * The component automatically handles the upside-down issue that occurs
 * when using ListEmptyComponent with inverted FlatLists by applying
 * a reverse transform when isInverted={true}
 */
const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({
  title = 'No messages yet',
  message = 'Start the conversation by sending a message',
  showBookmarked = false,
  themeColors,
  isInverted = false
}) => {
  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {/* Simple icon instead of animation */}
        <View style={[styles.iconContainer, { backgroundColor: themeColors.primary?.light || themeColors.primary?.main + '20' }]}>
          <MessageCircle 
            size={48} 
            color={themeColors.primary?.main || themeColors.primary} 
          />
        </View>
        
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: themeColors.neutral?.text || themeColors.text }]}>
            {showBookmarked ? 'No Bookmarked Messages' : title}
          </Text>
          
          <Text style={[styles.message, { color: themeColors.neutral?.textSecondary || themeColors.neutral?.subtext || themeColors.textSecondary }]}>
            {showBookmarked 
              ? 'Bookmark messages to see them here! Tap the bookmark icon on any message to save it.'
              : message
            }
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    minHeight: SCREEN_HEIGHT * 0.6, // Minimum height to ensure proper centering
    paddingVertical: Spacing.xl,
  },

  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: 'transparent',
    width: SCREEN_WIDTH * 0.9,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  message: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 22,
    marginHorizontal: Spacing.lg,
  }
});

export default ChatEmptyState;