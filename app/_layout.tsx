import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { setImmersiveMode } from '../utils/navigationBarManager';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { DatabaseProvider } from '../contexts/DatabaseContext';
import { WatermarkProvider } from '../contexts/WatermarkContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, Text, Platform, useColorScheme, AppState } from 'react-native';
import { supabase, refreshAuthSession } from '../utils/supabase';
import { updateProfileSchema } from '../utils/updateProfileSchema';
import { initDatabase } from '../utils/init';
import { initErrorHandling } from '../utils/errorHandler';
import Toast, { BaseToastProps } from 'react-native-toast-message';
import ShimmerLoader from '../components/ShimmerLoader';
import * as SplashScreen from 'expo-splash-screen';
import { VideoProvider } from '../contexts/VideoContext';
import { VideoUploadProvider } from '../contexts/VideoUploadContext';
import ExpoNotificationManager from '../components/ExpoNotificationManager';
import MessageNotificationManager from '../components/MessageNotificationManager';
import VideoUploadIndicator from '../components/VideoUploadIndicator';
import { 
  handleNotificationReceived, 
  handleNotificationResponseReceived,
  configureNotificationChannels 
} from '../utils/backgroundNotifications';
import { startRealtimeNotificationProcessor, stopRealtimeNotificationProcessor } from '../utils/realtimeNotificationProcessor';
// Livestream services removed
import { initializeOnlineStatusManager, cleanupOnlineStatusManager } from '../utils/onlineStatusManager';
import { backgroundNotificationHandler } from '../utils/backgroundNotificationHandler';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
// Call/lockscreen services removed
import { AudioProvider } from '../contexts/AudioContext';
import { LiveStreamProvider } from '../components/LiveStreamProvider';
import { 
  requestNotificationPermissions 
} from '../utils/permissionsManager';
import { setupNotificationDatabase } from '../utils/ensureDbSetup';
import { badgeCounter } from '../utils/badgeCounter';
import { appStateTracker } from '../utils/appStateTracker';
import { loadShielding, LoadPriority, deferUntilAfterCritical, deferLowPriority } from '../utils/loadShielding';
import { setupNotificationReplyHandler, setupIOSNotificationCategories } from '../utils/notificationReplyService';
import { log, warn, error } from '../utils/productionLogger';


// Optional services - imported statically to avoid Metro bundler issues
// These are wrapped in try-catch to prevent crashes if modules don't exist
let prefetchService: any = null;
let aggressiveCacheService: any = null;
let chatCacheOptimizer: any = null;
let networkImageOptimizer: any = null;
let videoPreloadService: any = null;
let spotlessOptimizer: any = null;

try {
  prefetchService = require('../utils/prefetchService');
} catch (e) {
  // Silently fail - optional service
}

try {
  aggressiveCacheService = require('../utils/aggressiveCacheService');
} catch (e) {
  // Silently fail - optional service
}

try {
  chatCacheOptimizer = require('../utils/chatCacheOptimizer');
} catch (e) {
  // Silently fail - optional service
}

try {
  videoPreloadService = require('../utils/videoPreloadService');
  spotlessOptimizer = require('../utils/spotlessOptimizer');
} catch (e) {
  // Silently fail - optional service
}

try {
  networkImageOptimizer = require('../utils/networkAwareImageOptimizer');
} catch (e) {
  // Silently fail - optional service
}

// Initialize error handling to silence specific errors
initErrorHandling();

// Polyfill WeakRef for runtimes that don't support it (prevents React Navigation crash).
// This is a safe fallback: it behaves like a strong reference but matches the API shape.
if (typeof (global as any).WeakRef === 'undefined') {
  (global as any).WeakRef = class WeakRefPolyfill<T extends object> {
    private _value: T | null;
    constructor(value: T) {
      this._value = value;
    }
    deref() {
      return this._value;
    }
  };
}

// Simple Error Boundary component to prevent crashes
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(caughtError: Error, errorInfo: React.ErrorInfo) {
    error('[ErrorBoundary] Caught error:', caughtError);
    error('[ErrorBoundary] Error info:', errorInfo);
    error('[ErrorBoundary] Error stack:', caughtError.stack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {
  /* reloading the app might trigger some race conditions, ignore them */
});

// Configure Expo notification handler - SINGLE SOURCE OF TRUTH
// This handles ALL Expo push notifications (foreground, background, and closed)
// Only set handler if setNotificationHandler is available (not in static rendering)
if (Notifications.setNotificationHandler) {
  Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request?.content?.data || {};
    const isMessageNotification = data?.type === 'chat' || data?.type === 'message';
    const isAppActive = appStateTracker.isAppActive();
    
    // Check notification sound preference
    let shouldPlaySound = true;
    try {
      // CRITICAL: Use correct relative path - go up one level from app/ to root, then into utils/
      const { getNotificationSoundEnabled } = await import('../utils/notificationSoundSettings');
      shouldPlaySound = await getNotificationSoundEnabled();
    } catch (error) {
      error('[Notification Handler] Error checking sound preference:', error);
      // Default to enabled on error
      shouldPlaySound = true;
    }
    
    // Log notification received (helpful for debugging)
    log('[Notification Handler] 🔔 Notification received:', {
      title: notification.request?.content?.title,
      body: notification.request?.content?.body,
      dataType: data?.type,
      notificationId: notification.request?.identifier,
      isAppActive,
      isMessageNotification,
      shouldPlaySound,
    });
    
    // Suppress message notifications when app is active (foreground and not locked)
    // The app's UI (chat screen) will handle message display instead
    if (isMessageNotification && isAppActive) {
      log('[Notification Handler] 🚫 Suppressing message notification - app is active, UI will handle it');
      return {
        shouldShowAlert: false,  // Don't show alert/banner
        shouldPlaySound: false,  // Don't play sound (app UI handles it)
        shouldSetBadge: true,    // Still update badge count
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      };
    }
    
    // Always show other notifications and suppressed notifications when app is in background/closed
    // Respect user's sound preference
    return {
      shouldShowAlert: true,  // Show alert/banner
      shouldPlaySound: shouldPlaySound,  // Respect user's sound preference
      shouldSetBadge: true,   // Update badge count
      priority: Notifications.AndroidNotificationPriority.HIGH, // High priority for Android
    };
  },
  });
}

// Define custom toast configuration
const toastConfig = {
  // Subtle toast for dating like (no bright green, no second line)
  dating_like: ({ text1 }: BaseToastProps) => (
    <View style={{
      paddingVertical: 12,
      paddingHorizontal: 20,
      backgroundColor: 'rgba(0,0,0,0.75)',
      borderRadius: 24,
      alignSelf: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>{text1}</Text>
    </View>
  ),
  success: ({ text1, text2, ...rest }: BaseToastProps) => (
    <View style={{
      height: 60,
      width: '90%',
      backgroundColor: '#4CAF50',
      borderRadius: 10,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    }}>
      <View style={{ marginLeft: 10, flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: 'white' }}>{text1}</Text>
        {text2 ? <Text style={{ fontSize: 14, color: 'white', opacity: 0.9 }}>{text2}</Text> : null}
      </View>
    </View>
  ),
  error: ({ text1, text2, ...rest }: BaseToastProps) => (
    <View style={{
      height: 60,
      width: '90%',
      backgroundColor: '#F55B5B',
      borderRadius: 10,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    }}>
      <View style={{ marginLeft: 10, flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: 'white' }}>{text1}</Text>
        {text2 ? <Text style={{ fontSize: 14, color: 'white', opacity: 0.9 }}>{text2}</Text> : null}
      </View>
    </View>
  ),
  info: ({ text1, text2, ...rest }: BaseToastProps) => (
    <View style={{
      minHeight: 60,
      width: '90%',
      backgroundColor: '#2196F3',
      borderRadius: 10,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    }}>
      <View style={{ marginLeft: 10, flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: 'white', marginBottom: 4 }}>{text1}</Text>
        {text2 ? <Text style={{ fontSize: 13, color: 'white', opacity: 0.95 }} numberOfLines={2}>{text2}</Text> : null}
      </View>
    </View>
  )
};

// RN Web: flex:1 alone can collapse to 0 height if the root chain only uses % heights.
const WEB_STACK_CONTENT_STYLE =
  Platform.OS === 'web'
    ? { flex: 1, minHeight: '100vh' as const, width: '100%' as const, backgroundColor: 'transparent' as const }
    : { backgroundColor: 'transparent' as const };

// App layout with theme aware status bar
function AppLayoutWithTheme() {
  const { isDarkMode } = useTheme();
  
  return (
    <>
      <StatusBar 
        style={isDarkMode ? "light" : "dark"} 
        translucent={true}
        backgroundColor="transparent"
      />
      {/* Load native modules safely after startup */}
      <ErrorBoundary fallback={null}>
        <ExpoNotificationManager />
      </ErrorBoundary>
      <Stack 
        screenOptions={{ 
          headerShown: false,
          contentStyle: WEB_STACK_CONTENT_STYLE,
          animation: 'slide_from_right'
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        



        <Stack.Screen name="auth/signin" options={{ headerShown: false }} />
        <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
        <Stack.Screen name="auth/signup-success" options={{ headerShown: false }} />
        <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="auth/verify-otp" options={{ headerShown: false }} />
        <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
        <Stack.Screen 
          name="onboarding" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
            contentStyle: { backgroundColor: 'transparent' }
          }} 
        />

        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="businesses" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: 'Oops!' }} />
      </Stack>
      
      {/* Message notification popups */}
      <MessageNotificationManager />
      
      <Toast config={toastConfig} />

      {/* Same React subtree as navigation so context from VideoUploadProvider always applies */}
      <VideoUploadIndicator />
    </>
  );
}

// Safe provider for native modules that might crash on startup
// Always render providers to prevent remount flash - providers handle initialization delays internally
function SafeNativeModuleProvider({ children }: { children: React.ReactNode }) {
  // Wrap each provider in error boundary to prevent cascading failures
  // Providers are rendered immediately to prevent remount, but initialization is delayed internally
  return (
    <ErrorBoundary fallback={<>{children}</>}>
      <ErrorBoundary fallback={<>{children}</>}>
        <AudioProvider>
          {children}
        </AudioProvider>
      </ErrorBoundary>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  // Background initialization (cache, DB, notifications, etc.)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      void import('../utils/expoAvAudioMode').then((m) => m.configurePlaybackAudioMode().catch(() => {}));
    }
    // CRITICAL: Start IAP listener immediately (don't wait for prepare race)
    if (Platform.OS === 'ios') {
      import('../utils/storeKitService').then(({ initIAPAtAppRoot }) => {
        initIAPAtAppRoot();
      }).catch((e) => {
        if (__DEV__) warn('IAP init at root:', e);
      });
    }
    if (Platform.OS === 'android') {
      import('../utils/googlePlayBillingService').then(({ initGooglePlayBillingAtAppRoot }) => {
        initGooglePlayBillingAtAppRoot();
      }).catch((e) => {
        if (__DEV__) warn('Google Play Billing init at root:', e);
      });
    }

    void (async function runBackgroundInit() {
      try {
        // INSTANT CONTENT: Bootstrap posts cache without blocking first paint
        try {
          const { bootstrapPostsCacheForInstantLoad } = await import('../utils/communityUtils');
          await Promise.race([
            bootstrapPostsCacheForInstantLoad(),
            new Promise((r) => setTimeout(r, 120)),
          ]);
        } catch {
          // Non-critical
        }
        prefetchService?.prefetchCriticalData?.()?.catch(() => {});

        setImmersiveMode().catch(() => {});

        setTimeout(() => {
          refreshAuthSession().catch(() => {});
        }, 0);

          // Do not auto-request permissions on startup.
          // Permissions should be requested on-demand when the user triggers a feature (camera/mic/notifications).

          // Defer memory optimization to after first paint (faster startup)
          if (spotlessOptimizer && typeof spotlessOptimizer.optimizeMemory === 'function') {
            setTimeout(() => {
              spotlessOptimizer.optimizeMemory().catch(() => {});
            }, 2000);
          }

          // Defer DB setup to background (can be slow on cold start).
          setTimeout(() => {
            initDatabase()
              .then(() => setupNotificationDatabase())
              .catch((dbInitError) => {
                if (__DEV__) warn('DB init:', dbInitError);
              });
          }, 250);

          // Ensure profiles table has required columns/constraints (non-blocking)
          setTimeout(() => {
            updateProfileSchema().catch(() => {});
          }, 500);

          // Initialize view count batch system (processes queued views on app load)
          setTimeout(() => {
            import('../utils/viewCountBatch')
              .then(({ initializeViewCountBatch }) => initializeViewCountBatch())
              .catch((viewCountError) => {
                if (__DEV__) warn('View count batch init:', viewCountError);
              });
          }, 650);

            // Defer badge counter to after first paint (non-blocking)
            badgeCounter.initialize().catch(() => {});
          
          // Initialize online status manager if user is authenticated
          setTimeout(() => {
            supabase.auth
              .getSession()
              .then(({ data: { session } }) => {
                if (session?.user?.id) initializeOnlineStatusManager(session.user.id).catch(() => {});
              })
              .catch(() => {});
          }, 800);

          // Initialize background notification handler (non-blocking - run in background)
          // NOTE: Permissions are handled by ExpoNotificationManager to avoid conflicts
          backgroundNotificationHandler.initialize().catch(() => {});

          // Skip lockscreen call service initialization - it conflicts with ExpoNotificationManager
          // ExpoNotificationManager handles all notification permissions and token generation
          // lockscreenCallService.initialize().catch((lockscreenError) => {
          //   error('Lockscreen call service initialization error:', lockscreenError);
          // });

          // 🛡️ LOAD SHIELDING: Commented out to reduce app weight on start (world chat not active yet)
          // loadShielding.start();

          // Defer reply handler/cats so it doesn't slow first paint.
          setTimeout(() => {
            setupNotificationReplyHandler()
              .catch(() => {
                if (Platform.OS === 'ios') setupIOSNotificationCategories().catch(() => {});
              });
          }, 1200);

          // IAP listener already started at top of useEffect (iOS)

          // 🚀 CRITICAL / LOAD SHIELDING: Commented out to reduce app weight on start
          // if (prefetchService && typeof prefetchService.initializeEmptyCache === 'function' && typeof prefetchService.prefetchCriticalData === 'function') {
          //   loadShielding.registerTask('prefetch_critical', LoadPriority.CRITICAL, async () => { ... });
          // }
          // if (aggressiveCacheService && typeof aggressiveCacheService.initializeCacheDirectories === 'function') {
          //   loadShielding.registerTask('init_cache_directories', LoadPriority.CRITICAL, async () => { ... });
          // }
          // deferUntilAfterCritical(...); // Setup background refresh and preload media
          // deferUntilAfterCritical(...); // Spotless optimizer and Chat cache
          // deferLowPriority(...);       // Video cache cleanup and network image optimization
      } catch (e) {
        warn('Background app init error:', e);
      }
    })();
  }, []);

  useEffect(() => {
    // Hide splash screen immediately (no delay)
    const hideSplash = async () => {
      await SplashScreen.hideAsync();
    };
    
    hideSplash();
    
    // Configure background notifications
    const setupNotifications = async () => {
      try {
        await configureNotificationChannels();
        log('✅ Background notification channels configured');
      } catch (notificationError) {
        error('Background notification setup error:', notificationError);
      }
    };

    // Clear badge count when app becomes active
    const clearBadgeCount = async () => {
      try {
        await badgeCounter.clearBadgeCount();
        log('✅ Badge count cleared on app open');
        
        // Badge will update automatically based on real unread counts
        
      } catch (badgeError) {
        error('Error clearing badge count:', badgeError);
      }
    };
    
    setupNotifications();
    clearBadgeCount(); // Non-blocking
    
    // Flush view count batch when app becomes active
    const flushViewCounts = async () => {
      try {
        const { flushViewCountBatch } = await import('../utils/viewCountBatch');
        await flushViewCountBatch();
      } catch (error) {
        if (__DEV__) warn('View count flush error:', error);
      }
    };
    
    // Flush on app foreground
    let appStateSubscription: any = null;
    try {
      appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          flushViewCounts();
        }
      });
    } catch (error) {
      if (__DEV__) warn('AppState listener error:', error);
    }
    
    // Initial flush
    flushViewCounts();
    
    // Set up background notification listeners
    const notificationListener = Notifications.addNotificationReceivedListener(handleNotificationReceived);
    const responseListener = Notifications.addNotificationResponseReceivedListener(handleNotificationResponseReceived);
    
    // Start real-time notification processor (replaces polling)
    // Now enabled in dev mode too for testing notifications (uses longer polling interval in dev)
    const realtimeProcessor = startRealtimeNotificationProcessor();
    
    // Livestream services removed
    
    // Expo notifications are managed by ExpoNotificationManager
    
    return () => {
      notificationListener.remove();
      responseListener.remove();
      if (appStateSubscription) {
        appStateSubscription.remove();
      }
      stopRealtimeNotificationProcessor();
    };
  }, []);

  // Wrap entire app in error boundary as final safety net
  return (
    <ErrorBoundary fallback={
      <SafeAreaProvider>
        <ShimmerLoader fullScreen={true} />
      </SafeAreaProvider>
    }>
      <SafeAreaProvider>
        <GestureHandlerRootView
          style={
            Platform.OS === 'web'
              ? { flex: 1, minHeight: '100vh' as const, width: '100%' as const }
              : { flex: 1 }
          }
        >
          <ErrorBoundary fallback={<ShimmerLoader fullScreen={true} />}>
            <ThemeProvider>
              <ErrorBoundary fallback={<ShimmerLoader fullScreen={true} />}>
                <DatabaseProvider>
                  <VideoProvider>
                    <LiveStreamProvider>
                      <SafeNativeModuleProvider>
                        <ErrorBoundary fallback={<ShimmerLoader fullScreen={true} />}>
                          <WatermarkProvider>
                            <ErrorBoundary fallback={<ShimmerLoader fullScreen={true} />}>
                              <VideoUploadProvider>
                                <AppLayoutWithTheme />
                              </VideoUploadProvider>
                            </ErrorBoundary>
                          </WatermarkProvider>
                        </ErrorBoundary>
                      </SafeNativeModuleProvider>
                    </LiveStreamProvider>
                  </VideoProvider>
                </DatabaseProvider>
              </ErrorBoundary>
            </ThemeProvider>
          </ErrorBoundary>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
