/**
 * Optimistic Story Bar - Shows UI immediately before data loads
 * This makes the app feel instant like Instagram
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

const { width } = Dimensions.get('window');
const STORY_SIZE = 64;
const STORY_GAP = 12;

interface OptimisticStoryBarProps {
  count?: number; // Number of placeholder stories to show
}

export default function OptimisticStoryBar({ count = 8 }: OptimisticStoryBarProps) {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);

  return (
    <View style={styles.container}>
      {/* Create Story Button */}
      <View style={[styles.createButton, { borderColor: colors.border }]}>
        <View style={[styles.createIcon, { backgroundColor: colors.primary.main }]} />
      </View>

      {/* Placeholder Story Circles */}
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={`placeholder-${index}`}
          style={[
            styles.storyCircle,
            {
              borderColor: colors.border,
              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
            },
          ]}
        >
          <View
            style={[
              styles.storyInner,
              {
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: STORY_GAP,
  },
  createButton: {
    width: STORY_SIZE,
    height: STORY_SIZE,
    borderRadius: STORY_SIZE / 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  storyCircle: {
    width: STORY_SIZE,
    height: STORY_SIZE,
    borderRadius: STORY_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyInner: {
    width: STORY_SIZE - 8,
    height: STORY_SIZE - 8,
    borderRadius: (STORY_SIZE - 8) / 2,
  },
});

