/**
 * Returns memoized style objects keyed by theme for DRY usage across the app.
 * Use with StyleSheet styles: style={[styles.foo, themeStyles.text]} etc.
 */
import { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

export type ThemeStyles = ReturnType<typeof getThemeColors>;

export function useThemeStyles() {
  const { isDarkMode } = useTheme();

  return useMemo(() => {
    const themeColors = getThemeColors(isDarkMode);
    const n = themeColors.neutral;
    const p = themeColors.primary;
    return {
      /** themeColors for cases that need full palette */
      colors: themeColors,
      /** Text: { color: neutral.text } */
      text: { color: n.text } as const,
      /** Subtext / secondary: { color: neutral.subtext } */
      subtext: { color: n.subtext } as const,
      /** Secondary text: { color: neutral.textSecondary } */
      textSecondary: { color: n.textSecondary } as const,
      /** Tertiary text: { color: neutral.textTertiary } */
      textTertiary: { color: n.textTertiary } as const,
      /** Primary accent text: { color: primary.main } */
      primaryText: { color: p.main } as const,
      /** Surface background: { backgroundColor: neutral.surface } */
      surface: { backgroundColor: n.surface } as const,
      /** Card background: { backgroundColor: neutral.card } */
      card: { backgroundColor: n.card } as const,
      /** Screen background: { backgroundColor: neutral.background } */
      background: { backgroundColor: n.background } as const,
      /** Border: { borderColor: neutral.border } */
      border: { borderColor: n.border } as const,
      /** Surface variant: { backgroundColor: neutral.surfaceVariant } */
      surfaceVariant: { backgroundColor: n.surfaceVariant } as const,
      /** Disabled tint: { color: neutral.disabled } or backgroundColor */
      disabled: { backgroundColor: n.disabled } as const,
      disabledText: { color: n.disabled } as const,
      /** Comment input: background + text color (for TextInput) */
      commentInput: {
        backgroundColor: n.background,
        color: n.text,
      } as const,
      /** Placeholder color value for TextInput placeholderTextColor */
      placeholderColor: n.textSecondary,
      /** Semi-transparent overlay: background + '80' */
      overlayBg: { backgroundColor: n.background + '80' } as const,
    };
  }, [isDarkMode]);
}
