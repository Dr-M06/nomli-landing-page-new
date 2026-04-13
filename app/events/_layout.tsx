import { Stack } from 'expo-router';
import { Colors, getThemeColors } from '../../constants/Colors';
import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export default function EventLayout() {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: themeColors.neutral.card,
        },
        headerTintColor: themeColors.primary.main,
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        contentStyle: {
          backgroundColor: themeColors.neutral.background,
        },
      }}
    >
      <Stack.Screen name="create" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      <Stack.Screen name="edit/[id]" options={{ headerShown: false }} />
    </Stack>
  );
} 