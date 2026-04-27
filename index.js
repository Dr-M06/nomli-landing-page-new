// Side-effect imports: order matters — quiet console first, then polyfills (before expo-router / Hermes streams).
import './disableConsoleInProduction';
import './polyfills';
import { Platform } from 'react-native';
import 'expo-router/entry';

// Initialize Firebase app before using any Firebase services
// Skip Firebase on web - it's native-only
let messaging = null;
let firebaseApp = null;

// Firebase is native-only, skip on web
if (Platform.OS !== 'web') {
try {
  // Lazy load Firebase to handle cases where it's not available
  const firebaseAppModule = require('@react-native-firebase/app');
  firebaseApp = firebaseAppModule.default;
  
  // Explicitly initialize Firebase app if not already initialized
  try {
    // Check if Firebase app is already initialized
    firebaseApp.app();
    if (__DEV__) console.log('[index.js] ✅ Firebase app already initialized');
  } catch (error) {
    // Firebase app not initialized - React Native Firebase auto-initializes from config files
    // Try to explicitly initialize if the method exists
    try {
      // Check if initializeApp method exists (React Native Firebase may not have it)
      if (typeof firebaseApp.initializeApp === 'function') {
        if (!firebaseApp.apps || firebaseApp.apps.length === 0) {
          firebaseApp.initializeApp();
          if (__DEV__) console.log('[index.js] ✅ Firebase app initialized explicitly');
        } else {
          if (__DEV__) console.log('[index.js] ✅ Firebase app already exists');
        }
      } else {
        // React Native Firebase auto-initializes from google-services.json / GoogleService-Info.plist
        if (__DEV__) console.log('[index.js] ⚠️ Firebase will auto-initialize from config files (initializeApp not available)');
      }
    } catch (initError) {
      // If explicit initialization fails, it will auto-initialize from config files
      if (__DEV__) console.log('[index.js] ⚠️ Firebase will auto-initialize from config files:', initError.message);
    }
  }
  
  // Get messaging module
  const messagingModule = require('@react-native-firebase/messaging');
  messaging = messagingModule.default;

// Register background handler for FCM (Android only)
// This must be done outside of any component lifecycle
  if (Platform.OS === 'android' && messaging) {
    try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    if (__DEV__) console.log('[Background Handler] 🔔 FCM message received:', remoteMessage);
    
    try {
      const { notification, data } = remoteMessage;
      
      // Display notification using Firebase (Notifee temporarily disabled)
      if (notification) {
        if (__DEV__) console.log('[Background Handler] ✅ Notification received:', notification.title);
        // Firebase will automatically display the notification
        // Advanced notification features (Notifee) temporarily disabled
      }
    } catch (error) {
      console.error('[Background Handler] ❌ Error handling notification:', error);
    }
  });
  
  if (__DEV__) console.log('[index.js] ✅ FCM background message handler registered');
    } catch (error) {
      console.warn('[index.js] ⚠️ Could not register FCM background handler:', error.message);
    }
  }
} catch (error) {
  // Firebase not available - app will use Expo notifications instead
  if (__DEV__) console.log('[index.js] ℹ️ Firebase not available - will use Expo notifications:', error.message);
  }
}

// Note: Expo notification handler is configured in app/_layout.tsx
// This prevents conflicts and ensures single source of truth
if (__DEV__) console.log('[index.js] ✅ Entry point loaded - notification handlers configured in app/_layout.tsx');
