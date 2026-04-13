import React from 'react';
import { 
  View, 
  SafeAreaView, 
  StyleSheet, 
  StatusBar, 
  Platform, 
  ViewStyle,
  ColorValue
} from 'react-native';
import { Colors, getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';

interface SafeAreaWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  backgroundColor?: ColorValue;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  topInset?: boolean;
  bottomInset?: boolean;
}

const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 0;

/**
 * A wrapper component that provides safe area insets for both iOS and Android.
 * 
 * On iOS, it uses the native SafeAreaView.
 * On Android, it applies a top padding equal to the status bar height.
 */
export default function SafeAreaWrapper({
  children,
  style,
  backgroundColor,
  topInset = true,
  bottomInset = true
}: SafeAreaWrapperProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // Use provided backgroundColor or use theme-based background color
  const bgColor = backgroundColor || themeColors.neutral.background;
  
  // On iOS, use the built-in SafeAreaView which handles notches
  if (Platform.OS === 'ios') {
    return (
      <SafeAreaView 
        style={[
          styles.container, 
          { backgroundColor: bgColor },
          topInset === false && styles.noTopInset,
          bottomInset === false && styles.noBottomInset,
          style
        ]}
      >
        {children}
      </SafeAreaView>
    );
  }
  
  // On Android, manually add padding for the status bar
  return (
    <View 
      style={[
        styles.container,
        { 
          backgroundColor: bgColor,
          paddingTop: topInset ? STATUSBAR_HEIGHT : 0 
        },
        style
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  noTopInset: {
    paddingTop: 0,
  },
  noBottomInset: {
    paddingBottom: 0,
  }
}); 