import React from 'react';
import { Stack } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { FontFamily } from '../../constants/Theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.primary.main,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontFamily: FontFamily.bold,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: '',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="about"
        options={{
          title: 'About',
          headerShown: false, // Hide default header since about screen has its own custom header
        }}
      />
      <Stack.Screen
        name="account"
        options={{
          title: 'Account',
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          title: 'Notifications',
        }}
      />
      <Stack.Screen
        name="privacy"
        options={{
          title: 'Privacy',
        }}
      />
      <Stack.Screen
        name="help"
        options={{
          title: 'Help & Support',
        }}
      />
      <Stack.Screen
        name="language"
        options={{
          title: 'Language',
        }}
      />

      <Stack.Screen
        name="security"
        options={{
          title: 'Security Settings',
          headerShown: false, // Hide default header since security screen has its own custom header
        }}
      />
    </Stack>
  );
} 