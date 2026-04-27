import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, TextInput, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Bell, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { getThemeColors } from '../../constants/Colors';
import { FontFamily } from '../../constants/Theme';
import SearchDropdown from '../SearchDropdown';

type Props = {
  isDark: boolean;
  collapsed?: boolean;
  showModeSwitch?: boolean;
  feedMode?: 'following' | 'forYou';
  onChangeMode?: (mode: 'following' | 'forYou') => void;
};

export default function HomeHeader({
  isDark,
  collapsed = false,
  showModeSwitch = false,
  feedMode = 'forYou',
  onChangeMode,
}: Props) {
  const insets = useSafeAreaInsets();
  const c = getThemeColors(isDark);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const flamingoMain = '#FF6FAE';
  const flamingoDeep = '#E25595';
  const inputBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const switchBg = isDark ? 'rgba(20,22,30,0.72)' : 'rgba(255,255,255,0.82)';
  const switchBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(226,85,149,0.26)';
  const inactiveText = isDark ? 'rgba(255,211,229,0.88)' : flamingoDeep;
  const dropdownVisible = searchOpen;

  const onSelectUser = (userId: string) => {
    setSearchOpen(false);
    setQ('');
    router.push(`/profile/${userId}` as any);
  };

  const onSelectHashtag = (hashtag: string) => {
    setQ(hashtag);
  };

  const onSelectHistory = (query: string) => {
    setQ(query);
  };

  const closeSearch = () => {
    setSearchOpen(false);
  };

  const overlayTop = useMemo(() => insets.top + 8, [insets.top]);
  const headerAnim = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: collapsed ? 0 : 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [collapsed, headerAnim]);

  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 2,
            opacity: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] }),
            transform: [
              { translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
            ],
          },
        ]}
      >
        <View style={styles.left}>
          <Text style={[styles.logo, { color: isDark ? flamingoMain : flamingoDeep }]}>nomli</Text>
        </View>

        {showModeSwitch ? (
          <View style={[styles.modeSwitchRow, { backgroundColor: switchBg, borderColor: switchBorder }]}>
            <TouchableOpacity
              onPress={() => onChangeMode?.('following')}
              style={[styles.modePill, feedMode === 'following' && styles.modePillActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.modeText, { color: inactiveText }, feedMode === 'following' && styles.modeTextActive]}>
                Following
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onChangeMode?.('forYou')}
              style={[styles.modePill, feedMode === 'forYou' && styles.modePillActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.modeText, { color: inactiveText }, feedMode === 'forYou' && styles.modeTextActive]}>For You</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.modeSwitchSpacer} />
        )}

        <View style={styles.right}>
          <TouchableOpacity
            onPress={() => setSearchOpen(true)}
            style={styles.iconBtn}
            hitSlop={6}
            accessibilityLabel="Search"
          >
            <Search size={16} color={isDark ? flamingoMain : flamingoDeep} strokeWidth={1.8} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            style={styles.iconBtn}
            hitSlop={6}
          >
            <Bell size={16} color={isDark ? flamingoMain : flamingoDeep} strokeWidth={1.8} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Modal visible={searchOpen} transparent animationType="fade" onRequestClose={closeSearch}>
        <Pressable style={[styles.overlay, { paddingTop: overlayTop }]} onPress={closeSearch}>
          <Pressable style={[styles.searchCard, { backgroundColor: c.neutral.background }]} onPress={() => {}}>
            <View style={styles.searchRow}>
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
              <TouchableOpacity onPress={closeSearch} style={styles.closeBtn} hitSlop={10} accessibilityLabel="Close search">
                <X size={18} color={c.neutral.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.dropdownSlot}>
              <SearchDropdown
                visible={dropdownVisible}
                searchQuery={q}
                onSelectHashtag={onSelectHashtag}
                onSelectUser={onSelectUser}
                onSelectHistory={onSelectHistory}
                onClose={closeSearch}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 2,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 62,
    flexShrink: 0,
  },
  logo: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.4,
    textTransform: 'lowercase',
  },
  modeSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 32,
    flexShrink: 1,
  },
  modeSwitchSpacer: {
    flex: 1,
  },
  modePill: {
    minWidth: 72,
    height: 26,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modePillActive: {
    backgroundColor: '#FF6FAE',
  },
  modeText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    letterSpacing: 0.1,
  },
  modeTextActive: {
    color: '#ffffff',
    fontFamily: FontFamily.bold,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    minWidth: 62,
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 12,
  },
  searchCard: {
    borderRadius: 18,
    padding: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.bold,
    fontSize: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownSlot: {
    marginTop: 10,
  },
});
