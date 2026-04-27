/**
 * Glassmorphism utility functions for Gen Z-friendly UI
 * Creates modern frosted glass effects
 */

import { StyleSheet, Platform } from 'react-native';

export interface GlassmorphicStyle {
  backgroundColor: string;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation?: number;
  overflow: 'hidden';
}

/**
 * Creates a glassmorphic style for light mode
 */
export const createGlassmorphicStyle = (
  opacity: number = 0.7,
  blur: number = 10,
  borderRadius: number = 20
): GlassmorphicStyle => {
  return {
    backgroundColor: `rgba(255, 255, 255, ${opacity})`,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: blur,
    elevation: Platform.OS === 'android' ? 8 : 0,
    overflow: 'hidden',
  };
};

/**
 * Creates a glassmorphic style for dark mode
 */
export const createDarkGlassmorphicStyle = (
  opacity: number = 0.3,
  blur: number = 10,
  borderRadius: number = 20
): GlassmorphicStyle => {
  return {
    backgroundColor: `rgba(30, 41, 59, ${opacity})`,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: blur,
    elevation: Platform.OS === 'android' ? 8 : 0,
    overflow: 'hidden',
  };
};

/**
 * Creates a vibrant glassmorphic style with color tint (Gen Z style)
 */
export const createVibrantGlassmorphicStyle = (
  color: string,
  opacity: number = 0.2,
  blur: number = 15,
  borderRadius: number = 20
): GlassmorphicStyle => {
  // Extract RGB from hex color
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${opacity})`,
    borderWidth: 1.5,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.4)`,
    borderRadius,
    shadowColor: color,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: blur,
    elevation: Platform.OS === 'android' ? 12 : 0,
    overflow: 'hidden',
  };
};

/**
 * Common glassmorphic presets
 */
export const GlassmorphicPresets = {
  card: (isDark: boolean) => 
    isDark 
      ? createDarkGlassmorphicStyle(0.25, 12, 24)
      : createGlassmorphicStyle(0.8, 12, 24),
  
  modal: (isDark: boolean) =>
    isDark
      ? createDarkGlassmorphicStyle(0.35, 20, 28)
      : createGlassmorphicStyle(0.85, 20, 28),
  
  button: (isDark: boolean, color: string = '#00D9FF') =>
    createVibrantGlassmorphicStyle(color, 0.3, 10, 16),
  
  input: (isDark: boolean) =>
    isDark
      ? createDarkGlassmorphicStyle(0.2, 8, 16)
      : createGlassmorphicStyle(0.7, 8, 16),
};

