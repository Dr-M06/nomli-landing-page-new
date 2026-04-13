import { Stack } from 'expo-router';
import { getThemeColors } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';

export default function ChatLayout() {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: themeColors.cardBackground,
        },
        headerTintColor: themeColors.primary.main,
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        contentStyle: {
          backgroundColor: themeColors.background,
        },
        // Hide the header for all screens in this stack
        headerShown: false,
        // Use card presentation to keep tabs visible
        presentation: 'card',
        // Use minimal animation
        animation: 'fade',
      }}
    >
      <Stack.Screen 
        name="[id]" 
        options={{ 
          headerShown: false,
          title: 'Chat',
          presentation: 'card',
        }} 
      />
      <Stack.Screen 
        name="country/[id]" 
        options={{ 
          headerShown: false,
          title: 'Country Chat',
          presentation: 'card',
        }} 
      />
    </Stack>
  );
} 