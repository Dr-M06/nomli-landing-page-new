import React from 'react';
import { Stack } from 'expo-router';

/**
 * Full-bleed creator flow — no pink stack header; screen uses HTML-style dark top bar.
 */
export default function CreatorLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#111111' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
