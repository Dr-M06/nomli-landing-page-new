const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

/**
 * Load env without taking down config if `.env` is an iCloud placeholder (read → ETIMEDOUT).
 * Prefer `EXPO_NO_DOTENV=1` in npm scripts so Expo CLI does not read `.env` twice.
 * Optional: `NOMLI_ENV_FILE=/absolute/path/to/.env` for a copy outside iCloud Documents.
 */
(function loadProjectEnv() {
  const root = __dirname;
  const candidates = [
    process.env.NOMLI_ENV_FILE,
    path.join(root, '.env.local'),
    path.join(root, '.env'),
  ].filter(Boolean);

  for (const p of candidates) {
    const abs = path.isAbsolute(p) ? p : path.join(root, p);
    try {
      if (!fs.existsSync(abs)) continue;
      const r = dotenv.config({ path: abs });
      if (r.error) {
        if (r.error.code === 'ETIMEDOUT') {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[app.config] Skipped ${path.basename(abs)} (read timed out — iCloud/offline file). Use a local copy or NOMLI_ENV_FILE.`,
            );
          }
          continue;
        }
        throw r.error;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Loaded env from', path.relative(root, abs) || abs);
      }
      return;
    } catch (e) {
      const code = e && e.code;
      if (code === 'ETIMEDOUT') {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[app.config] Skipped ${path.basename(abs)} (ETIMEDOUT).`);
        }
        continue;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[app.config] Env load:', (e && e.message) || e);
      }
    }
  }
})();

// Check if this is a development build
const isDev = process.env.NODE_ENV !== 'production';

/** HTTPS origin used in shared links (must match EXPO_PUBLIC_SHARE_WEB_ORIGIN in shareLinks.ts). */
function getShareWebAppLinking() {
  let raw = process.env.EXPO_PUBLIC_SHARE_WEB_ORIGIN || 'https://www.nomlimingle.com';
  raw = String(raw).trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const { hostname } = new URL(raw);
    if (!hostname) throw new Error('no host');
    return { hostname };
  } catch {
    return { hostname: 'www.nomlimingle.com' };
  }
}

const shareWebAppLinking = getShareWebAppLinking();

module.exports = {
  expo: {
    name: "Nomli",
    slug: "nomli-mingle",
    version: "1.0.54",
    platforms: ['ios', 'android'],
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "nomlimingle",
    userInterfaceStyle: "dark",
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
      versionCode: 122,
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
        // App Links: same https URLs as shareLinks.ts → open in-app when installed (needs assetlinks.json on host).
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: shareWebAppLinking.hostname, pathPrefix: "/community/post" },
            { scheme: "https", host: shareWebAppLinking.hostname, pathPrefix: "/video" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
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
        {
          action: "SEND_MULTIPLE",
          category: ["DEFAULT"],
          data: { mimeType: "video/*" },
        },
        {
          action: "SEND",
          category: ["DEFAULT"],
          data: { mimeType: "*/*" },
        },
        {
          action: "SEND_MULTIPLE",
          category: ["DEFAULT"],
          data: { mimeType: "*/*" },
        },
      ],
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.nomli.mingle2",
      buildNumber: "142",
      deploymentTarget: "16.0",
      // Universal Links for EXPO_PUBLIC_SHARE_WEB_ORIGIN — requires apple-app-site-association on that host.
      associatedDomains: [`applinks:${shareWebAppLinking.hostname}`],
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
            NSPrivacyAccessedAPITypeReasons: ["C617.1"],
          },
        ],
      },
      entitlements: {
        "aps-environment": "production"
      },
      infoPlist: {
        CFBundleDisplayName: "Nomli",
        UIBackgroundModes: [
          "remote-notification",
          "fetch",
          "processing"
        ],
        BGTaskSchedulerPermittedIdentifiers: [
          "com.nomli.mingle2.refresh",
          "com.nomli.mingle2.processing"
        ],
        NSCameraUsageDescription: "Nomli Mingle uses your camera to take and upload profile photos, share video moments with friends, and for live streaming.",
        NSMicrophoneUsageDescription: "Nomli Mingle uses your microphone for voice messages and live streaming.",
        NSPhotoLibraryUsageDescription: "Nomli Mingle lets you upload and share photos from your library to connect with other users and enhance your profile.",
        NSPhotoLibraryAddUsageDescription: "Nomli Mingle needs to save photos and videos to your device when you choose to download them. Media in chat auto-deletes after 24 hours for privacy, but you can save important photos permanently to your device.",
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
      [
        "expo-share-extension",
        {
          height: 380,
          activationRules: [
            { type: "text" },
            { type: "url", max: 1 },
            { type: "image", max: 5 },
            { type: "video", max: 2 },
            { type: "file", max: 5 },
          ],
          excludedPackages: [
            "expo-dev-client",
            "expo-splash-screen",
            "expo-updates",
            "expo-font",
          ],
        },
      ],
      "expo-apple-authentication",
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      // Google Maps API key
      GEOAPIFY_API_KEY: process.env.EXPO_GEOAPIFY_API_KEY,

      // WhatsApp support number
      whatsappSupport: process.env.WHATSAPP_SUPPORT_NUMBER,
      
      // Agora configuration (for development)
      AGORA_APP_ID: process.env.EXPO_PUBLIC_AGORA_APP_ID,

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

      // RevenueCat public SDK keys (optional). When set, Creator Pro uses RevenueCat on native; coin packs stay on existing IAP.
      REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      REVENUECAT_ANDROID_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
      
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