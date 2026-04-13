import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

export type PullToRefreshBannerVariant = 'loading' | 'pull_to_refresh' | 'refreshing';

interface PullToRefreshBannerProps {
  /** When true, the banner is visible. */
  visible: boolean;
  /** Optional variant: loading (initial load), pull_to_refresh (hint to pull), refreshing (pull in progress). */
  variant?: PullToRefreshBannerVariant;
  /** Optional custom message. Overrides variant default text. */
  message?: string;
}

const DEFAULT_MESSAGES: Record<PullToRefreshBannerVariant, string> = {
  loading: 'Pull down to refresh',
  pull_to_refresh: 'Pull down to refresh',
  refreshing: 'Refreshing...',
};

/**
 * Twitter/X-style banner shown at the top of a feed when content is still loading
 * or when the user should pull down to refresh. Appears as a slim, non-intrusive bar.
 */
export default function PullToRefreshBanner({
  visible,
  variant = 'pull_to_refresh',
  message,
}: PullToRefreshBannerProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const displayMessage = message ?? DEFAULT_MESSAGES[variant];

  if (!visible) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: isDarkMode
            ? 'rgba(255, 255, 255, 0.08)'
            : 'rgba(0, 0, 0, 0.05)',
          borderBottomColor: isDarkMode
            ? 'rgba(255, 255, 255, 0.06)'
            : 'rgba(0, 0, 0, 0.06)',
        },
      ]}
    >
      <ChevronDown
        size={16}
        color={themeColors.primary.main}
        strokeWidth={2.5}
        style={styles.icon}
      />
      <Text
        style={[
          styles.text,
          {
            color: themeColors.textSecondary,
          },
        ]}
        numberOfLines={1}
      >
        {displayMessage}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === 'ios'
      ? { paddingTop: 12 }
      : { paddingTop: 10 }),
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
});
