import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import ChatRoomsList from '../../components/ChatRoomsList';
import { getThemeColors } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';
import { prefetchMessages } from '../../utils/chat';

export default function ChatRoomsScreen() {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // Check if we have a prefetch parameter (for returning from a chat)
  const { prefetch } = useLocalSearchParams<{ prefetch?: string }>();

  // When returning from a chat with a prefetch param, prefetch it again
  // This ensures our cache stays fresh for recently visited chats
  useEffect(() => {
    if (prefetch) {
      // Prefetch this room since we just came from it
      prefetchMessages(prefetch);
    }
  }, [prefetch]);

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'Chat Rooms',
          headerLargeTitle: true,
        }} 
      />
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <ChatRoomsList />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0,
  },
}); 