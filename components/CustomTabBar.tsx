import React, { useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  Text,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontSizes } from '../constants/Theme';
import { useTheme } from '../contexts/ThemeContext';
import { setImmersiveMode, showNavigationBar, hideNavigationBar } from '../utils/navigationBarManager';

/** Final order: Discover, Social, Post (center FAB), Inbox, Profile. */
const BOTTOM_TAB_ORDER = ['discovery', 'community', 'create', 'chats', 'profile'] as const;

const CustomTabBar = React.memo(function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const flamingoMain = '#FF6FAE';
  const visibleRoutes = (BOTTOM_TAB_ORDER as readonly string[])
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is (typeof state.routes)[number] => {
      if (!r) return false;
      const options = descriptors[r.key]?.options;
      return options?.href !== null;
    });
  const hasDatingTab = visibleRoutes.some((r) => r.name === 'discovery');
  // Keep Post visually centered when Dating is hidden by reserving a left spacer slot.
  const tabSlots: Array<(typeof state.routes)[number] | null> = hasDatingTab
    ? visibleRoutes
    : [null, ...visibleRoutes];

  const insets = useSafeAreaInsets();
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // On iOS, using full insets.bottom as padding pushes the tab items too high.
  // Keep a smaller internal padding while the container height still includes the safe area.
  const contentBottomPad = Platform.OS === 'ios' ? Math.max(8, insets.bottom - 20) : insets.bottom;

  const scaleAnim = useRef(state.routes.map(() => new Animated.Value(1))).current;
  const translateYAnim = useRef(state.routes.map(() => new Animated.Value(0))).current;
  const prevIndexRef = useRef(state.index);

  // Handle touch events to show/hide navigation bar
  const handleTouchStart = () => {
    if (Platform.OS === 'android') {
      // Clear any existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      
      // Show navigation bar temporarily
      showNavigationBar();
      
      // Hide it again after 3 seconds of no touch
      hideTimeoutRef.current = setTimeout(() => {
        hideNavigationBar();
      }, 3000);
    }
  };

  // Initialize immersive mode on mount
  useEffect(() => {
    if (Platform.OS === 'android') {
      setImmersiveMode();
    }
    
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Keep tab bar height constant: no scale or translateY on selection (avoids bar growing on touch)
  useEffect(() => {
    const activeIndex = state.index;
    prevIndexRef.current = activeIndex;

    state.routes.forEach((_, index) => {
      if (scaleAnim[index] != null) {
        scaleAnim[index].setValue(1);
      }
      if (translateYAnim[index] != null) {
        translateYAnim[index].setValue(0);
      }
    });

  }, [state.index]);

  const renderTab = (route: typeof state.routes[number]) => {
    const { options } = descriptors[route.key];
    // Compute the real index from the navigator so animations align even if we filter routes
    const actualIndex = state.routes.findIndex(r => r.key === route.key);
    const isFocused = state.index === actualIndex;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
        return;
      }

      // Same as X/Twitter: tap active Home → scroll feed to top + refresh (HomeFeedScreen listens).
      if (isFocused && route.name === 'community' && !event.defaultPrevented) {
        DeviceEventEmitter.emit('refreshCommunityFeed');
      }
    };

    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={onPress}
        style={[styles.tab, styles.tabFlex]}
        activeOpacity={0.7}
      >
        <Animated.View
          style={[
            styles.tabContent,
            {
              transform: [
                { scale: scaleAnim[actualIndex] },
                { translateY: translateYAnim[actualIndex] },
              ],
            },
          ]}
        >
          {isFocused && (
            <Animated.View
              style={[
                styles.tabGlow,
                { backgroundColor: 'rgba(255,111,174,0.20)' },
              ]}
            />
          )}

          {options.tabBarIcon?.({
            focused: isFocused,
            color: isFocused
              ? flamingoMain
              : themeColors.neutral.textSecondary,
            size: 16,
          })}

          {options.title && (
            <Text
              style={[
                styles.tabLabel,
                {
                  color: isFocused
                    ? flamingoMain
                    : themeColors.neutral.textSecondary,
                  opacity: isFocused ? 1 : 0.7,
                },
              ]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {options.title}
            </Text>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderCenterPostTab = (route: (typeof state.routes)[number]) => {
    const { options } = descriptors[route.key];
    const actualIndex = state.routes.findIndex((r) => r.key === route.key);
    const isFocused = state.index === actualIndex;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? 'Post'}
        onPress={onPress}
        style={[styles.tab, styles.tabFlex, styles.centerPostTouchable]}
        activeOpacity={0.85}
      >
        <View style={styles.centerPostStack}>
          <LinearGradient
            colors={
              isFocused
                ? isDarkMode
                  ? ['#FF9EC7', '#F0ABFC', '#A78BFA']
                  : ['#FF8AB8', '#FF6FAE', '#8B5CF6']
                : isDarkMode
                  ? ['#FF6FAE', '#E879F9', '#818CF8']
                  : ['#FF7AB0', '#FF6FAE', '#C084FC']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.centerPostRingGradient}
          >
            <View style={styles.centerPostFAB}>
              <Plus size={14} color="#FFFFFF" strokeWidth={2.15} />
            </View>
          </LinearGradient>
          {options.title ? (
            <Text
              style={[
                styles.tabLabel,
                styles.centerPostLabel,
                {
                  color: isFocused ? flamingoMain : themeColors.neutral.textSecondary,
                  opacity: isFocused ? 1 : 0.75,
                },
              ]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {options.title}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: contentBottomPad,
          // iOS has no native bottom nav – use shorter bar; Android keeps taller for nav bar
          height: (Platform.OS === 'ios' ? 44 : 60) + insets.bottom,
          bottom: 0,
          backgroundColor: 'transparent',
          borderTopColor: 'transparent',
        },
      ]}
      onTouchStart={handleTouchStart}
    >
      {/* Glassmorphic background - Gen Z style */}
      <LinearGradient
        colors={isDarkMode ? ['rgba(14,17,28,0.97)', 'rgba(9,11,18,0.99)'] : ['rgba(255,255,255,0.97)', 'rgba(246,248,252,0.98)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.blurBackground}
      />

      <View style={styles.tabsRow}>
        {tabSlots.map((route, index) => {
          if (!route) {
            return <View key={`spacer-${index}`} style={styles.tabColumn} />;
          }
          return (
          <View
            key={route.key}
            style={[styles.tabColumn, route.name === 'create' && styles.centerTabColumn]}
          >
            {route.name === 'create' ? renderCenterPostTab(route) : renderTab(route)}
          </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    paddingTop: 2, // Reduced from 4
    // Use absolute positioning for both platforms for consistent behavior
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    // Remove all shadows for clean look
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  blurBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.98,
  },
  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 6,
  },
  tabColumn: {
    flex: 1,
    minWidth: 0,
  },
  centerTabColumn: {
    zIndex: 2,
  },
  centerPostTouchable: {
    justifyContent: 'flex-end',
  },
  centerPostStack: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  /** Gradient ring: color shows in padding; inner solid FAB fills the center. */
  centerPostRingGradient: {
    padding: 2,
    borderRadius: 10,
    marginTop: -7,
    overflow: 'hidden',
  },
  centerPostFAB: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#FF6FAE',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 4,
  },
  centerPostLabel: {
    marginTop: 2,
  },
  tab: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2, // Reduced from 4
    paddingHorizontal: 2,
  },
  tabFlex: {
    width: '100%',
  },
  moreButton: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: 2,
  },
  moreTabContent: {
    width: '100%',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 32, // Reduced from 36
    paddingHorizontal: 2,
    borderRadius: BorderRadius.lg,
  },
  tabGlow: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: BorderRadius.xl,
    opacity: 0.3,
  },
  tabLabel: {
    fontSize: FontSizes.xs - 2, // Slightly smaller
    marginTop: 1, // Reduced from 2
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  sheetTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetRowLabel: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});

export default CustomTabBar;
