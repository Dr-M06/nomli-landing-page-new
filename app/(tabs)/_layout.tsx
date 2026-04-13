import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, AppState, View, Text } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { House, CircleUserRound, Plus, Inbox, Compass, Radio } from 'lucide-react-native';
import { Colors, getThemeColors } from '../../constants/Colors';
import { SocialSizes, BorderRadius, Shadow } from '../../constants/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { SessionLikedProvider } from '../../contexts/SessionLikedContext';
import CustomTabBar from '../../components/CustomTabBar';
import ShimmerLoader from '../../components/ShimmerLoader';
import { supabase } from '../../utils/supabase';
import { log, warn, error } from '../../utils/productionLogger';


// Error Boundary for TabLayout to catch any errors
class TabLayoutErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(caughtError: Error, errorInfo: React.ErrorInfo) {
    error('[TabLayout] Error caught by boundary:', caughtError, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Returning null produced a blank white web screen with no clue an error occurred.
      return (
        <View
          style={{
            flex: 1,
            minHeight: Platform.OS === 'web' ? ('100vh' as const) : undefined,
            backgroundColor: '#0a0b0e',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Text style={{ color: '#f8fafc', textAlign: 'center', fontSize: 15 }}>
            Something went wrong loading this tab. Refresh the page or try again.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user, isLoaded, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const suspensionCheckRef = useRef<{ lastCheck: number; userId?: string }>({ lastCheck: 0 });
  
  // Check suspension status when user is loaded
  useEffect(() => {
    if (isLoaded && user?.id) {
      // Prevent duplicate checks (only check once per user session or every 5 minutes)
      const now = Date.now();
      const lastCheck = suspensionCheckRef.current.lastCheck;
      const lastUserId = suspensionCheckRef.current.userId;
      const fiveMinutes = 5 * 60 * 1000;
      
      // Only check if:
      // 1. User changed, OR
      // 2. More than 5 minutes since last check
      if (lastUserId !== user.id || (now - lastCheck) > fiveMinutes) {
        suspensionCheckRef.current = { lastCheck: now, userId: user.id };
        
        // Check if user is suspended (non-blocking)
        const checkSuspension = async () => {
          try {
            const suspensionModule = await import('../../components/SuspendedUserAlert');
            if (suspensionModule?.checkAndShowSuspensionAlert && typeof suspensionModule.checkAndShowSuspensionAlert === 'function') {
              await suspensionModule.checkAndShowSuspensionAlert(user.id);
            } else {
              warn('[TabLayout] checkAndShowSuspensionAlert not available, skipping suspension check');
            }
          } catch (suspensionError) {
            error('[TabLayout] Error checking suspension:', suspensionError);
            // Don't block app if suspension check fails
          }
        };
        // Delay slightly to avoid blocking initial render
        setTimeout(checkSuspension, 1000);
      }
    }
  }, [isLoaded, user?.id]);

  // Allow unauthenticated users to stay on home/tabs (guest browsing).
  // No redirect to signin; sign-in is prompted when they try to post, like, or open profile.

  // Add a timeout to prevent being stuck in loading state forever (only when auth is stuck loading)
  // Do not redirect guests to signin - they are allowed to browse the home screen
  useEffect(() => {
    const timeout = setTimeout(async () => {
      // Only consider "stuck" if we're still loading and not loaded - then maybe redirect to signin as fallback
      if (loading && !user && !isLoaded) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) router.replace('/auth/signin');
        } catch {
          router.replace('/auth/signin');
        }
      }
    }, 8000); // Increased to 8 seconds to allow TOTP flow to complete

    return () => clearTimeout(timeout);
  }, [loading, user, isLoaded, router]);
  
  // Additional safety timeout - if we're stuck on shimmer for too long, force redirect
  // Skip on web - allow browsing without auth
  useEffect(() => {
    const safetyTimeout = setTimeout(async () => {
      // If still showing shimmer after 15 seconds total, force redirect
      // But check session first - only redirect if truly no session exists
      if (!user && !isLoaded) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) router.replace('/auth/signin');
        } catch {
          // Don't redirect on error - might be network issue
        }
      }
    }, 15000); // Increased to 15 seconds to prevent premature redirects

    return () => clearTimeout(safetyTimeout);
  }, [user, isLoaded, router]);
  
  // Check for app state changes and suspension status
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && user?.id) {
        log('[Tabs] App became active, checking suspension status');
        // Prevent duplicate checks (only check if more than 5 minutes since last check)
        const now = Date.now();
        const lastCheck = suspensionCheckRef.current.lastCheck;
        const fiveMinutes = 5 * 60 * 1000;
        
        if ((now - lastCheck) > fiveMinutes) {
          suspensionCheckRef.current.lastCheck = now;
          // Check if user is suspended when app becomes active
          try {
            const { checkAndShowSuspensionAlert } = await import('../../components/SuspendedUserAlert');
            await checkAndShowSuspensionAlert(user.id);
          } catch (suspensionError) {
            error('[Tabs] Error checking suspension:', suspensionError);
            // Don't block app if suspension check fails
          }
        }
      }
    });
    
    return () => {
      subscription.remove();
    };
  }, [user?.id]);

  // Defer predictive prefetch to after first paint (avoids blocking tab mount)
  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => {
      import('../../utils/spotlessOptimizer').then(({ predictivePrefetch }) => {
        predictivePrefetch('community', user.id).catch(() => {});
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [user?.id]);
  
  // Memoize tabs to prevent recreation on every auth token refresh
  // MUST be called before any conditional returns (hooks rules)
  // Only recreate when theme actually changes
  const tabsContent = useMemo(() => (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="community"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <House
              size={18} 
              color={color} 
              strokeWidth={focused ? 2.5 : 2.1}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="discovery"
        options={{
          title: 'Discovery',
          tabBarIcon: ({ color, focused }) => (
            <Compass
              size={18}
              color={color}
              strokeWidth={focused ? 2.5 : 2.1}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live',
          tabBarIcon: ({ color, focused }) => (
            <Radio
              size={18}
              color={color}
              strokeWidth={focused ? 2.5 : 2.1}
            />
          ),
        }}
      />
      {/* Center Add Button */}
      <Tabs.Screen
        name="create"
        options={{
          title: 'Post',
          tabBarIcon: ({ color, focused }) => (
            <Plus
              size={18}
              color={color}
              strokeWidth={focused ? 2.8 : 2.3}
            />
          ),
        }}
      />
      
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, focused }) => (
            <Inbox
              size={18}
              color={color}
              strokeWidth={focused ? 2.5 : 2.1}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <CircleUserRound
              size={18} 
              color={color} 
              strokeWidth={focused ? 2.5 : 2.1}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          href: null,
        }}
      />
    </Tabs>
  ), [isDarkMode]); // Only recreate when theme changes, not on every auth state change
  
  // Do not block tab UI on auth: show shell immediately; each screen handles guest/loading.
  // (Full-screen shimmer here added a second gate after root layout.)

  // Safety check: ensure tabsContent is valid
  if (!tabsContent) {
    error('[TabLayout] tabsContent is null/undefined!');
    return <ShimmerLoader fullScreen={true} isDarkMode={isDarkMode} />;
  }
  
  return (
    <TabLayoutErrorBoundary>
      <SessionLikedProvider>
        {tabsContent}
      </SessionLikedProvider>
    </TabLayoutErrorBoundary>
  );
} 