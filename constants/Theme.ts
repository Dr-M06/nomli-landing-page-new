import { StyleSheet, Platform, StatusBar } from 'react-native';
import { Colors } from './Colors';

// Get status bar height for different platforms
const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 0;

// Modern spacing system - 8pt grid
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  xxxl: 24,
  huge: 32,
  massive: 40,
};

// Compact minimal typography scale (faster + cleaner)
export const FontSizes = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  heading: 28,
  title: 32,
  display: 36,
  hero: 42,
  // Backward compatibility aliases
  caption: 12,
  body: 16,
  subhead: 18,
};

// Modern font weights
export const FontFamily = {
  light: Platform.OS === 'ios' ? 'System' : 'Roboto-Light',
  regular: Platform.OS === 'ios' ? 'System' : 'Roboto',
  medium: Platform.OS === 'ios' ? 'System' : 'Roboto-Medium',
  semibold: Platform.OS === 'ios' ? 'System' : 'Roboto-Medium',
  bold: Platform.OS === 'ios' ? 'System' : 'Roboto-Bold',
  black: Platform.OS === 'ios' ? 'System' : 'Roboto-Black',
};

// Modern border radius system
export const BorderRadius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  xxl: 16,
  xxxl: 20,
  huge: 24,
  pill: 100,
  circle: 9999,
};

// Enhanced shadow system
export const Shadow = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  sm: {
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
  interactive: {
    shadowColor: '#008080',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  }
};

// Animation timing
export const AnimationTiming = {
  instant: 0,
  fast: 150,
  medium: 250,
  slow: 350,
  slower: 500,
};

// Social media specific measurements
export const SocialSizes = {
  avatar: {
    xs: 24,
    sm: 28,
    md: 36,
    lg: 44,
    xl: 52,
    xxl: 60,
    huge: 72,
  },
  post: {
    imageHeight: 300,
    cardPadding: Spacing.md,
    actionHeight: 40,
  },
  tab: {
    height: 50,
    iconSize: 18,
  },
  header: {
    height: 52,
    iconSize: 22,
  },
};

// A few overrides for compact controls without touching every screen
export const Compact = {
  minTouch: 40,
  buttonHeight: 40,
  inputHeight: 44,
  pillPaddingX: 10,
  pillPaddingY: 4,
  cardRadius: BorderRadius.xl,
};

// Modern global styles
export const GlobalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
    paddingTop: Platform.OS === 'android' ? STATUSBAR_HEIGHT : 0,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  column: {
    flexDirection: 'column',
  },
  
  // Modern card styles
  card: {
    backgroundColor: Colors.neutral.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadow.xs,
  },
  cardElevated: {
    backgroundColor: Colors.neutral.elevated,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  
  // Social media post card
  postCard: {
    backgroundColor: Colors.neutral.surface,
    borderRadius: BorderRadius.xl,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    ...Shadow.xs,
  },
  
  // Modern input styles
  textInput: {
    height: Compact.inputHeight,
    borderWidth: 1,
    borderColor: Colors.neutral.border,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.neutral.text,
    backgroundColor: Colors.neutral.surface,
  },
  textInputFocused: {
    borderColor: Colors.primary.main,
    borderWidth: 2,
  },
  
  // Modern button styles
  button: {
    height: Compact.buttonHeight,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  buttonPrimary: {
    backgroundColor: Colors.primary.main,
  },
  buttonSecondary: {
    backgroundColor: Colors.neutral.surface,
    borderWidth: 1,
    borderColor: Colors.neutral.border,
  },
  buttonText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
  },
  buttonTextPrimary: {
    color: Colors.neutral.surface,
  },
  buttonTextSecondary: {
    color: Colors.neutral.text,
  },
  
  // Typography styles
  textHero: {
    fontSize: FontSizes.hero,
    fontFamily: FontFamily.bold,
    color: Colors.neutral.text,
    lineHeight: FontSizes.hero * 1.2,
    letterSpacing: -0.5,
  },
  textDisplay: {
    fontSize: FontSizes.display,
    fontFamily: FontFamily.bold,
    color: Colors.neutral.text,
    lineHeight: FontSizes.display * 1.2,
    letterSpacing: -0.3,
  },
  textTitle: {
    fontSize: FontSizes.title,
    fontFamily: FontFamily.bold,
    color: Colors.neutral.text,
    lineHeight: FontSizes.title * 1.3,
    letterSpacing: -0.2,
  },
  textHeading: {
    fontSize: FontSizes.heading,
    fontFamily: FontFamily.semibold,
    color: Colors.neutral.text,
    lineHeight: FontSizes.heading * 1.3,
    letterSpacing: -0.1,
  },
  textSubheading: {
    fontSize: FontSizes.xxxl,
    fontFamily: FontFamily.semibold,
    color: Colors.neutral.text,
    lineHeight: FontSizes.xxxl * 1.4,
  },
  textLarge: {
    fontSize: FontSizes.xxl,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.text,
    lineHeight: FontSizes.xxl * 1.4,
  },
  textBody: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.text,
    lineHeight: FontSizes.lg * 1.5,
  },
  textBodySecondary: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.textSecondary,
    lineHeight: FontSizes.lg * 1.5,
  },
  textMedium: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.text,
    lineHeight: FontSizes.md * 1.5,
  },
  textSmall: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.textSecondary,
    lineHeight: FontSizes.sm * 1.5,
  },
  textCaption: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.textTertiary,
    lineHeight: FontSizes.xs * 1.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  
  // Social media specific styles
  avatar: {
    borderRadius: BorderRadius.circle,
    backgroundColor: Colors.neutral.borderLight,
  },
  avatarBorder: {
    borderWidth: 2,
    borderColor: Colors.primary.main,
  },
  badge: {
    backgroundColor: Colors.accent.main,
    borderRadius: BorderRadius.pill,
    paddingVertical: 3,
    paddingHorizontal: 7,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: FontFamily.semibold,
    color: Colors.neutral.surface,
  },
  
  // Utility styles
  separator: {
    height: 1,
    backgroundColor: Colors.neutral.borderLight,
    marginVertical: Spacing.md,
  },
  divider: {
    width: 1,
    backgroundColor: Colors.neutral.border,
    marginHorizontal: Spacing.md,
  },
  
  // Modern Pill/Tag styles
  pill: {
    paddingHorizontal: Compact.pillPaddingX,
    paddingVertical: Compact.pillPaddingY,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.neutral.border, // Default border
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.text, // Default text color
  },

  // Screen specific global styles
  screenPadding: {
    padding: Spacing.md,
  },
});

// Export status bar height for use in components
export { STATUSBAR_HEIGHT };