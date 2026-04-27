import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, Platform, TouchableOpacity, Animated } from 'react-native';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow } from '../constants/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { ChevronLeft, Menu, Bell, Search } from 'lucide-react-native';
import { router } from 'expo-router';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  titleStyle?: any;
  showNotifications?: boolean;
  showSearch?: boolean;
  showMenu?: boolean;
  showBackButton?: boolean;
  onBackPress?: () => void;
  onMenuPress?: () => void;
  onNotificationsPress?: () => void;
  onSearchPress?: () => void;
  rightComponent?: React.ReactNode;
  backgroundColor?: string;
  textColor?: string;
  unreadNotificationCount?: number;
}

function Header({
  title,
  subtitle,
  titleStyle,
  showNotifications = true,
  showSearch = false,
  showMenu = false,
  showBackButton = false,
  onBackPress,
  onMenuPress,
  onNotificationsPress,
  onSearchPress,
  rightComponent,
  backgroundColor,
  textColor,
  unreadNotificationCount = 0,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  // Use provided colors or default to subtle gradient background
  const bgColor = backgroundColor || themeColors.neutral.background; // Use background color for blend
  const txtColor = textColor || themeColors.neutral.text;

  // Bell animation for unread notifications
  const bellScaleAnim = useRef(new Animated.Value(1)).current;
  const bellRotateAnim = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Single pulse when unread count becomes > 0 (no continuous loop – saves CPU/battery)
  useEffect(() => {
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
    if (unreadNotificationCount > 0) {
      const animation = Animated.sequence([
        Animated.parallel([
          Animated.timing(bellScaleAnim, { toValue: 1.12, duration: 200, useNativeDriver: true }),
          Animated.timing(bellRotateAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(bellScaleAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(bellRotateAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]);
      animationRef.current = animation;
      animation.start(() => {
        animationRef.current = null;
      });
    } else {
      bellScaleAnim.setValue(1);
      bellRotateAnim.setValue(0);
    }
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [unreadNotificationCount]);

  const bellRotation = useMemo(
    () =>
      bellRotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '12deg'],
      }),
    []
  );

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  return (
    <View style={[
      styles.container, 
      { 
        paddingTop: Platform.OS === 'ios' 
          ? Math.max(insets.top, 0) // iOS: Use safe area inset directly
          : Math.max(insets.top, StatusBar.currentHeight || 0), // Android: Use safe area inset or status bar height
        backgroundColor: bgColor,
        zIndex: 1000, // Ensure header stays on top
        elevation: Platform.OS === 'android' ? 4 : 0, // Android elevation for proper layering
      }
    ]}>
      <View style={styles.headerBackground}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={bgColor}
        />
        
        <View style={styles.content}>
        {/* Left: menu or back only */}
        <View style={styles.leftSection}>
          {showMenu && (
            <TouchableOpacity 
              style={styles.menuButton}
              onPress={onMenuPress}
              activeOpacity={0.7}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Menu size={18} color={txtColor} strokeWidth={1.5} />
            </TouchableOpacity>
          )}
          {showBackButton && (
            <TouchableOpacity 
              style={styles.backButton}
              onPress={handleBackPress}
              activeOpacity={0.6}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <View style={[styles.backButtonContainer, { backgroundColor: bgColor + '40' }]}>
                <ChevronLeft size={16} color={txtColor} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          )}
          {!showMenu && !showBackButton && <View style={styles.spacer} />}
        </View>

        {/* Center: title (truly centered between left and right) */}
        {title ? (
          <View style={styles.centerSection} pointerEvents="none">
            <Text style={[styles.title, { color: txtColor }, titleStyle]} numberOfLines={1}>{title}</Text>
            {subtitle && (
              <Text style={[styles.subtitle, { color: txtColor + '80' }]} numberOfLines={1}>{subtitle}</Text>
            )}
          </View>
        ) : (
          <View style={styles.centerSection} />
        )}

        {/* Right: icons */}
        <View style={styles.rightSection}>
          {showSearch && (
            <TouchableOpacity 
              style={styles.iconButton}
              onPress={onSearchPress}
              activeOpacity={0.7}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Search size={16} color={txtColor} strokeWidth={1.5} />
            </TouchableOpacity>
          )}
          {showNotifications && (
          <TouchableOpacity 
              style={styles.iconButton}
              onPress={onNotificationsPress}
            activeOpacity={0.7}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Animated.View 
                style={[
                  styles.bellContainer,
                  {
                    transform: [
                      { scale: bellScaleAnim },
                      { rotate: bellRotation },
                    ],
                  }
                ]}
              >
                <Bell size={16} color={txtColor} strokeWidth={1.5} />
                {unreadNotificationCount > 0 && (
                  <View style={[styles.notificationBadge, { 
                    backgroundColor: '#FF3B30',
                    borderColor: bgColor || themeColors.neutral.background
                  }]} />
                )}
              </Animated.View>
          </TouchableOpacity>
          )}
          {rightComponent}
        </View>
        </View>
      </View>
      
      {/* Bottom border line - Instagram/Facebook style */}
      <View style={[
        styles.bottomBorder, 
        { backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)' }
      ]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 0,
    marginBottom: 0,
    marginHorizontal: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    zIndex: 1000,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  bottomBorder: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginHorizontal: 0,
  },
  headerBackground: {
    width: '100%',
    paddingBottom: Platform.OS === 'android' ? 6 : 0,
    paddingTop: 0,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: Platform.OS === 'android' ? 4 : 0,
    minHeight: Platform.OS === 'android' ? 40 : 32,
  },
  leftSection: {
    minWidth: 36,
    maxWidth: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  menuButton: {
    marginRight: 4,
    padding: 4,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 28,
    minHeight: 28,
  },
  backButton: {
    marginRight: 4,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    lineHeight: 16,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  subtitle: {
    fontSize: 9,
    fontFamily: FontFamily.regular,
    marginTop: 0,
    lineHeight: 11,
  },
  rightSection: {
    minWidth: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 32,
    paddingRight: 12,
  },
  iconButton: {
    padding: 4,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 28,
    minHeight: 28,
  },
  bellContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
  spacer: {
    flex: 1,
  },
});

export default React.memo(Header); 