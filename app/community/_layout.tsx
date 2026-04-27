import { Stack } from 'expo-router';
import { Colors } from '../../constants/Colors';

export default function CommunityLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: Colors.neutral.card,
        },
        headerTintColor: Colors.primary.main,
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        contentStyle: {
          backgroundColor: Colors.neutral.background,
        },
      }}
    />
  );
} 