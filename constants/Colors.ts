// Flamingo-first design system
export const ColorPalette = {
  // Brand colors - flamingo identity
  brand: {
    primary: '#FF6FAE',      // Flamingo pink
    accent: '#FF8FBE',       // Soft flamingo
    secondary: '#E25595',    // Deep flamingo
    tertiary: '#FFC3DD',     // Light flamingo tint
    darkTeal: '#2A1220',     // Dark rose-plum for contrast
    lightTeal: '#FFD2E5',    // Light flamingo highlight
  },
  
  // Primary colors - flamingo system
  primary: {
    main: '#FF6FAE',
    light: '#FF93C1',
    dark: '#E25595',
    50: '#FFF0F6',
    100: '#FFE0ED',
    200: '#FFC2DB',
    300: '#FFA3C8',
    400: '#FF85B7',
    500: '#FF6FAE',
    600: '#F45FA0',
    700: '#E25595',
    800: '#C94680',
    900: '#A8386A',
  },
  
  // Accent colors - complementary flamingo tones
  accent: {
    main: '#FF8FBE',
    light: '#FFB0D1',
    dark: '#E25595',
    50: '#FFF4F9',
    100: '#FFE8F2',
    200: '#FFD3E5',
    300: '#FFC0DA',
    400: '#FF9FC8',
    500: '#FF8FBE',
    600: '#F173AA',
    700: '#DE5A93',
    800: '#C6497E',
    900: '#AA3A69',
  },
  
  // Gradient helpers
  gradient: {
    purple: '#E25595',
    lavender: '#FF8FBE',
    cyan: '#FF6FAE',
    green: '#FFC3DD',
    blue: '#C6497E',
    peach: '#FFD2E5',
  },
  
  // Success colors
  success: {
    main: '#10B981',
    light: '#34D399',
    dark: '#059669',
  },
  
  // Warning colors
  warning: {
    main: '#F59E0B',
    light: '#FBBF24',
    dark: '#D97706',
  },
  
  // Error colors
  error: {
    main: '#EF4444',
    light: '#F87171',
    dark: '#DC2626',
  },
  
  // Neutral colors for light mode - Modern social media style
  light: {
    background: '#FAFAFA',      // Very light gray
    surface: '#FFFFFF',         // Pure white
    surfaceVariant: '#F3F4F6',  // Light variant surface
    card: '#FFFFFF',           // White cards
    elevated: '#FFFFFF',       // Elevated surfaces
    text: '#1F2937',          // Dark gray text
    textSecondary: '#6B7280',  // Medium gray
    textTertiary: '#9CA3AF',   // Light gray
    subtext: '#6B7280',       // Alias for textSecondary (backward compatibility)
    border: '#E5E7EB',        // Light border
    borderLight: '#F3F4F6',   // Very light border
    disabled: '#D1D5DB',      // Disabled state
    overlay: 'rgba(0, 0, 0, 0.5)',
    shadow: 'rgba(0, 0, 0, 0.1)',
  },
  
  // Dark mode colors - Modern dark theme
  dark: {
    background: '#0F172A',      // Very dark blue-gray
    surface: '#1E293B',        // Dark surface
    surfaceVariant: '#334155',  // Dark variant surface
    card: '#334155',           // Dark card
    elevated: '#475569',       // Elevated dark
    text: '#F8FAFC',          // Light text
    textSecondary: '#CBD5E1',  // Medium light
    textTertiary: '#94A3B8',   // Medium gray
    subtext: '#CBD5E1',       // Alias for textSecondary (backward compatibility)
    border: '#475569',        // Dark border
    borderLight: '#334155',   // Lighter dark border
    disabled: '#64748B',      // Disabled dark
    overlay: 'rgba(0, 0, 0, 0.7)',
    shadow: 'rgba(0, 0, 0, 0.3)',
  },
  
  // Social media colors
  social: {
    like: '#FF6FAE',
    share: '#FF8FBE',
    comment: '#E25595',
    bookmark: '#FFD700',      // Gold bookmark (premium feel)
    online: '#00FF88',         // Neon green online status
    offline: '#94A3B8',       // Offline status
    verified: '#5B9FFF',       // Bright blue verified badge
    follow: '#FF6FAE',
    message: '#E25595',
  },
  
  // Video call colors
  videoCall: {
    endCall: '#FF8FBE',
    toggleOn: '#FF6FAE',
    toggleOff: '#FF8FBE',
    qualityExcellent: '#00FF88', // Neon green excellent
    qualityGood: '#FF6FAE',
    qualityPoor: '#FFD700',   // Gold poor
    qualityBad: '#FF8FBE',
    lowBandwidth: {
      light: '#FFB3BA',       // Soft peach (light mode)
      dark: '#FFD700',        // Gold (dark mode)
    }
  }
};

// Default colors (light mode)
export const Colors = {
  primary: ColorPalette.primary,
  accent: ColorPalette.accent,
  secondary: ColorPalette.accent, // Alias for accent (backward compatibility)
  success: ColorPalette.success,
  warning: ColorPalette.warning,
  error: ColorPalette.error,
  neutral: ColorPalette.light,
  social: ColorPalette.social,
  brand: ColorPalette.brand,
  videoCall: ColorPalette.videoCall,
};

// Function to get theme-based colors
export const getThemeColors = (isDarkMode: boolean) => {
  const neutralColors = isDarkMode ? ColorPalette.dark : ColorPalette.light;
  
  return {
    // Base color palettes
    primary: ColorPalette.primary,
    accent: ColorPalette.accent,
    secondary: ColorPalette.accent, // Alias for accent (backward compatibility)
    success: ColorPalette.success,
    warning: ColorPalette.warning,
    error: ColorPalette.error,
    neutral: neutralColors,
    social: ColorPalette.social,
    brand: ColorPalette.brand,
    videoCall: ColorPalette.videoCall,
    
    // Convenience accessors for commonly used colors
    background: neutralColors.background,
    surface: neutralColors.surface,
    cardBackground: neutralColors.card,
    elevated: neutralColors.elevated,
    text: neutralColors.text,
    textSecondary: neutralColors.textSecondary,
    textTertiary: neutralColors.textTertiary,
    textLight: isDarkMode ? neutralColors.text : neutralColors.textSecondary,
    border: neutralColors.border,
    borderLight: neutralColors.borderLight,
    disabled: neutralColors.disabled,
    disabledButton: isDarkMode ? '#3F3F46' : '#E5E7EB',
    overlay: neutralColors.overlay,
    shadow: neutralColors.shadow,
    
    // Call direction colors
    outgoingCall: '#4CAF50', // Green for outgoing calls
    incomingCall: '#3B82F6', // Blue for incoming calls
  };
};