import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { FontFamily } from '../constants/Theme';
import { isCreatorProActive } from '../utils/creatorMonetizationService';

type Props = {
  creatorProUntil?: string | null;
  /** Theme-aware pill colors (use true on dark media overlays). */
  isDark?: boolean;
  style?: ViewStyle;
};

/**
 * Small “Pro” pill when the author has an active Creator Pro subscription.
 */
export default function CreatorProAuthorBadge({ creatorProUntil, isDark = false, style }: Props) {
  if (!isCreatorProActive(creatorProUntil)) return null;

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: isDark ? 'rgba(16,185,129,0.24)' : 'rgba(16,185,129,0.14)',
          borderColor: isDark ? 'rgba(52,211,153,0.5)' : 'rgba(5,150,105,0.35)',
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: isDark ? '#6ee7b7' : '#059669' }]}>Pro</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'center',
    flexShrink: 0,
  },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
});
