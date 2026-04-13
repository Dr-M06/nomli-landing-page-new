const { config } = require('dotenv');

// Load .env file if it exists, but don't fail if it doesn't
try {
  config();
  // Only log in development
  if (process.env.NODE_ENV !== 'production') {
  console.log('✅ .env file loaded successfully');
  }
} catch (error) {
  // Silent in production
  if (process.env.NODE_ENV !== 'production') {
  console.warn('No .env file found, using fallback values');
  }
}

// Check if this is a development build
const isDev = process.env.NODE_ENV !== 'production';

module.exports = {
  expo: {
    name: "Nomli",
    slug: "nomli-mingle",
    version: "1.0.50",
    // Native-first: streaming/push/ads have limited web parity. Including `web` is required for
    // `expo start` + browser: without it, localhost serves the native JSON manifest, not HTML.
    // If the web bundle fails, guard native-only code with Platform.OS !== 'web' or .web.tsx files.
    platforms: ['ios', 'android', 'web'],
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "nomlimingle",
    userInterfaceStyle: "automatic",
    newArchEnabled: false,
    splash: {
      image: "./assets/images/icon.png",
      backgroundColor: "#000000",
      resizeMode: "contain"
    },
    notification: {
      icon: "./assets/images/icon.png",
      color: "#19444d",
      androidMode: "default",
      androidCollapsedTitle: "#{unread_notifications} new messages",
      iosDisplayInForeground: true,
      androidNotificationIcon: "./assets/images/icon.png",
    },
    android: {
      package: "com.nomli.mingle2",
      versionCode: 115,
      googleServicesFile: "./google-services.json",
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#000000"
      },
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_GEOAPIFY_API_KEY
        }
      },
      permissions: [
        "android.permission.POST_NOTIFICATIONS"
      ],
      softwareKeyboardLayoutMode: "pan",
      navigationBar: {
        visible: "leanback",
        backgroundColor: "transparent"
      },
      statusBar: {
        backgroundColor: "transparent",
        translucent: true
      },
      // So Nomli appears in the system share sheet (Photos, browser, etc.) — Android only.
      // iOS requires a separate Share Extension target in Xcode; URL schemes do not register as share targets.
      intentFilters: [
        {
          action: "SEND",
          category: ["DEFAULT"],
          data: { mimeType: "text/plain" },
        },
        {
          action: "SEND",
          category: ["DEFAULT"],
          data: { mimeType: "image/*" },
        },
        {
          action: "SEND",
          category: ["DEFAULT"],
          data: { mimeType: "video/*" },
        },
        {
          action: "SEND_MULTIPLE",
          category: ["DEFAULT"],
          data: { mimeType: "image/*" },
        },
      ],
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.nomli.mingle2",
      buildNumber: "106",
      deploymentTarget: "16.0",
      entitlements: {
        "aps-environment": "production"
      },
      infoPlist: {
        CFBundleDisplayName: "Nomli",
        // AdMob (Google Mobile Ads) - required to prevent runtime crash
        GADApplicationIdentifier: process.env.EXPO_PUBLIC_ADMOB_APP_ID_IOS,
        UIBackgroundModes: [
          "remote-notification",
          "fetch",
          "processing"
        ],
        BGTaskSchedulerPermittedIdentifiers: [
          "com.nomli.mingle2.refresh",
          "com.nomli.mingle2.processing"
        ],
        NSCameraUsageDescription: "Nomli Mingle uses your camera to take and upload profile photos and share video moments.",
        NSMicrophoneUsageDescription: "Nomli Mingle uses your microphone for recording audio in voice messages.",
        NSPhotoLibraryUsageDescription: "Nomli Mingle lets you upload and share photos from your library to connect with other users and enhance your profile.",
        NSPhotoLibraryAddUsageDescription: "Nomli Mingle needs to save photos and videos to your device when you choose to download them. Media in chat auto-deletes after 24 hours for privacy, but you can save important photos permanently to your device.",
        NSLocationWhenInUseUsageDescription: "Nomli Mingle uses your approximate location to help you discover nearby users and local events. Your exact location is not shared publicly.",
        NSUserNotificationsUsageDescription: "This app needs notification access to show messages and important updates.",
        NSProvisionalNotificationUsageDescription: "This app can send you notifications about messages and important updates.",
        UIViewControllerBasedStatusBarAppearance: false,
        UIStatusBarHidden: false,
        UIStatusBarAnimation: "fade",
        UIStatusBarStyle: "UIStatusBarStyleDefault",
        UIApplicationSupportsIndirectInputEvents: true,
        UISupportsDocumentBrowser: false,
        ITSAppUsesNonExemptEncryption: false
      }
    },
    web: {
      bundler: "metro",
      // `static` runs SSR (expo-router/render.js) and pulls RN internals without web shims;
      // Native-first (Agora, etc.). SPA avoids SSR pulling RN internals without web shims.
      output: "single",
      favicon: "./assets/images/icon.png"
    },
    plugins: [
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#19444d",
          defaultChannel: "default",
          androidMode: "default",
          androidCollapsedTitle: "#{unread_notifications} new messages"
        }
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/icon.png",
          backgroundColor: "#000000",
          imageResizeMode: "contain"
        }
      ],
      "expo-dev-client",
      "expo-apple-authentication",
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Nomli Mingle uses your approximate location to help you discover nearby users and local events."
        }
      ],
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      // AdMob (Google Mobile Ads)
      ADMOB_APP_ID_IOS: process.env.EXPO_PUBLIC_ADMOB_APP_ID_IOS,
      ADMOB_APP_ID_ANDROID: process.env.EXPO_PUBLIC_ADMOB_APP_ID_ANDROID,
      ADMOB_UNIT_POST_SCREEN_IOS: process.env.EXPO_PUBLIC_ADMOB_UNIT_POST_SCREEN_IOS,
      ADMOB_UNIT_POST_SCREEN_ANDROID: process.env.EXPO_PUBLIC_ADMOB_UNIT_POST_SCREEN_ANDROID,

      // Google Maps API key
      GEOAPIFY_API_KEY: process.env.EXPO_GEOAPIFY_API_KEY,

      // WhatsApp support number
      whatsappSupport: process.env.WHATSAPP_SUPPORT_NUMBER,
      
      // Agora configuration (for development)
      AGORA_APP_ID: process.env.EXPO_PUBLIC_AGORA_APP_ID,
      
      // Cloudinary configuration for video uploads
      CLOUDINARY_CLOUD_NAME: process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY,
      CLOUDINARY_UPLOAD_PRESET: process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
      
      // Video uploads: Mux signing keys only in Supabase Edge Function `mux-upload` secrets (not in the app).
      MUX_ACCESS_TOKEN_ID: process.env.EXPO_PUBLIC_MUX_ACCESS_TOKEN_ID,
      MUX_ASSET_DOMAIN: process.env.EXPO_PUBLIC_MUX_ASSET_DOMAIN,
      
      // Notification processor configuration
      // ⚠️ SECURITY: Notification processor should be called from backend/Supabase Edge Functions
      NOTIFICATION_PROCESSOR_URL: process.env.EXPO_PUBLIC_NOTIFICATION_PROCESSOR_URL,
      // NOTIFICATION_PROCESSOR_SECRET removed - keep server-side only
      
      // Supabase configuration (must match constants/Endpoints.ts)
      SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      
      // Flutterwave payment configuration
      flutterwavePublicKey: process.env.EXPO_PUBLIC_FLUTTERWAVE_PUBLIC_KEY,
      
      // EAS project ID (nomli212 account - working)
      eas: {
        projectId: "d6e68a27-db0b-43e0-ba6d-b37a1608de5c"
      },

      // IAP logs are dev-only (see storeKitService.ts); no production override
    }
  }
}; 