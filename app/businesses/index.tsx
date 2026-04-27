import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';

export default function BusinessesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: themeColors.neutral.background,
        },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: themeColors.neutral.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={themeColors.neutral.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.neutral.text }]}>Businesses</Text>
      </View>

      <View style={styles.emptyState}>
        <Text style={[styles.emptyTitle, { color: themeColors.neutral.text }]}>
          Businesses section removed
        </Text>
        <Text style={[styles.emptySubtitle, { color: themeColors.neutral.subtext }]}>
          This area is currently disabled.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
});
