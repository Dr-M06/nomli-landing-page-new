import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import ChatRoomsList from '../../components/ChatRoomsList';
import { getThemeColors } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';
import { badgeCounter } from '../../utils/badgeCounter';

export default function ChatsTab() {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  // Defer heavy ChatRoomsList mount until tab is focused (faster app startup)
  const [hasFocused, setHasFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setHasFocused(true);
      return () => {};
    }, [])
  );

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {hasFocused ? <ChatRoomsList /> : <View style={styles.placeholder} />}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0,
  },
  placeholder: {
    flex: 1,
  },
});
