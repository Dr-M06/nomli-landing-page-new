import { Stack } from 'expo-router';
import { Colors, getThemeColors } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';

export default function ProfileLayout() {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: themeColors.neutral.background,
        },
      }}
    />
  );
} 