/**
 * Optimistic Feed - Shows feed skeleton immediately
 * This makes the app feel instant like TikTok
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

const { width } = Dimensions.get('window');
const POST_WIDTH = width - 32;
const POST_HEIGHT = 400;
const AVATAR_SIZE = 40;

interface OptimisticFeedProps {
  count?: number; // Number of placeholder posts to show
}

export default function OptimisticFeed({ count = 3 }: OptimisticFeedProps) {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);

  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={`placeholder-post-${index}`}
          style={[
            styles.postCard,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                },
              ]}
            />
            <View style={styles.headerText}>
              <View
                style={[
                  styles.usernameLine,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  },
                ]}
              />
              <View
                style={[
                  styles.metaLine,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                  },
                ]}
              />
            </View>
          </View>

          {/* Media Placeholder */}
          <View
            style={[
              styles.mediaPlaceholder,
              {
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
              },
            ]}
          />

          {/* Actions */}
          <View style={styles.actions}>
            {[1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                  },
                ]}
              />
            ))}
          </View>

          {/* Caption Placeholder */}
          <View style={styles.caption}>
            <View
              style={[
                styles.captionLine,
                {
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                },
              ]}
            />
            <View
              style={[
                styles.captionLine,
                {
                  width: '60%',
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  postCard: {
    width: POST_WIDTH,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
  usernameLine: {
    height: 14,
    width: 120,
    borderRadius: 4,
  },
  metaLine: {
    height: 10,
    width: 80,
    borderRadius: 4,
  },
  mediaPlaceholder: {
    width: '100%',
    height: POST_HEIGHT * 0.6,
    borderRadius: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  caption: {
    gap: 6,
  },
  captionLine: {
    height: 12,
    width: '100%',
    borderRadius: 4,
  },
});

