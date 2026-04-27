import React, { useMemo, useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { ArrowLeft, Search } from 'lucide-react-native';
import { router } from 'expo-router';
import SearchDropdown from '../components/SearchDropdown';

export default function SearchScreen() {
  const { isDarkMode } = useTheme();
  const c = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');

  const inputBg = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  const onSelectUser = (userId: string) => {
    router.push(`/profile/${userId}` as any);
  };

  const onSelectHashtag = (hashtag: string) => {
    // If you later add a hashtag results page, wire it here.
    setQ(hashtag);
  };

  const onSelectHistory = (query: string) => {
    setQ(query);
  };

  const dropdownVisible = true;

  return (
    <View style={[styles.root, { backgroundColor: c.neutral.background, paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ArrowLeft size={18} color={c.neutral.text} />
        </TouchableOpacity>

        <View style={[styles.searchWrap, { backgroundColor: inputBg, borderColor: c.neutral.border }]}>
          <Search size={16} color={c.neutral.textTertiary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search people or #tags"
            placeholderTextColor={c.neutral.textTertiary}
            autoFocus
            style={[styles.input, { color: c.neutral.text }]}
          />
        </View>
      </View>

      <View style={styles.dropdownSlot}>
        <SearchDropdown
          visible={dropdownVisible}
          searchQuery={q}
          onSelectHashtag={onSelectHashtag}
          onSelectUser={onSelectUser}
          onSelectHistory={onSelectHistory}
          onClose={() => {}}
        />
      </View>

      {/* Empty body area (keeps layout stable under dropdown) */}
      <View style={styles.body} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  dropdownSlot: {
    paddingHorizontal: Spacing.lg,
  },
  body: { flex: 1 },
});

