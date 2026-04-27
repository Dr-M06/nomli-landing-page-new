import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { format } from './dateFormatters';
import Constants from 'expo-constants';
import axios from 'axios';
import { log, warn, error } from './productionLogger';


interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  needsUpdate: boolean;
  storeUrl: string;
  isForceUpdate?: boolean;
  updateAvailable: boolean;
}

interface UpdateCheckResult {
  shouldShowNotification: boolean;
  updateInfo: UpdateInfo | null;
}

const STORAGE_KEYS = {
  LAST_CHECK: 'app_update_last_check',
  DISMISSED_VERSION: 'app_update_dismissed_version',
  UPDATE_NOTIFICATION_SENT: 'app_update_notification_sent',
  LAST_REMINDED_VERSION: 'app_update_last_reminded_version'
};

// Check for updates every 24 hours
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Remind user every 3 days if they haven't updated
const REMINDER_INTERVAL = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

/**
 * Get current app version from Constants
 */
export const getCurrentVersion = (): string => {
  return Constants.expoConfig?.version || '1.0.0';
};

/**
 * Get latest version from Google Play Store
 */
const getLatestVersionFromPlayStore = async (packageName: string): Promise<string> => {
  try {
    const response = await axios.get(
      `https://play.google.com/store/apps/details?id=${packageName}&hl=en`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    // Check if app exists (404 or similar)
    if (response.status === 404 || response.data.includes('We can\'t find the item you\'re looking for')) {
      throw new Error('App not found on Play Store');
    }
    
    // Parse version from Play Store HTML
    const versionMatch = response.data.match(/Current Version<\/div><span[^>]*>([^<]+)<\/span>/);
    if (versionMatch && versionMatch[1]) {
      return versionMatch[1].trim();
    }
    
    // Alternative regex patterns for version extraction
    const altVersionMatch = response.data.match(/\[null,\[null,null,\[null,null,"([^"]+)"/);
    if (altVersionMatch && altVersionMatch[1]) {
      return altVersionMatch[1].trim();
    }
    
    // Try another pattern
    const currentVersionMatch = response.data.match(/"currentVersion":"([^"]+)"/);
    if (currentVersionMatch && currentVersionMatch[1]) {
      return currentVersionMatch[1].trim();
    }
    
    throw new Error('Version not found in Play Store response');
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error('Network connection failed');
    }
    if (error.response?.status === 404) {
      throw new Error('App not found on Play Store');
    }
    throw error;
  }
};

/**
 * Compare two version strings
 */
const compareVersions = (current: string, latest: string): boolean => {
  const currentParts = current.split('.').map(part => parseInt(part.replace(/[^\d]/g, ''), 10) || 0);
  const latestParts = latest.split('.').map(part => parseInt(part.replace(/[^\d]/g, ''), 10) || 0);
  
  const maxLength = Math.max(currentParts.length, latestParts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;
    
    if (latestPart > currentPart) {
      return true; // Update needed
    } else if (latestPart < currentPart) {
      return false; // Current is newer
    }
  }
  
  return false; // Versions are equal
};

/**
 * Check if the app needs to be updated by comparing with Play Store version
 */
export const checkForAppUpdate = async (): Promise<UpdateCheckResult> => {
  try {
    log('🔄 Checking for app updates...');

    // Get current version info
    const currentVersion = getCurrentVersion();
    log('📱 Current app version:', currentVersion);

    // Check last update check time
    const lastCheckStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_CHECK);
    const lastCheck = lastCheckStr ? parseInt(lastCheckStr) : 0;
    const now = Date.now();

    // Only check if it's been more than CHECK_INTERVAL since last check
    if (now - lastCheck < CHECK_INTERVAL) {
      log('⏭️ Skipping update check - checked recently');
      return { shouldShowNotification: false, updateInfo: null };
    }

    // Get package name based on platform
    const packageName = Platform.OS === 'ios' ? 'com.nomli.mingle' : 'com.nomli.mingle2';
    
    // Get Play Store info
    let latestVersion: string;
    try {
      latestVersion = await getLatestVersionFromPlayStore(packageName);
      log('🏪 Latest Play Store version:', latestVersion);
    } catch (error) {
      // During development or if app isn't published yet, this is expected
      if (__DEV__) {
        log('ℹ️ App not found on Play Store (expected during development)');
        
        // For testing purposes in development, we can simulate an update
        // by setting a higher version than current
        const shouldSimulateUpdate = await AsyncStorage.getItem('simulate_update');
        if (shouldSimulateUpdate === 'true') {
          const current = parseVersion(currentVersion);
          latestVersion = `${current.major}.${current.minor}.${current.patch + 1}`;
          log('🧪 Simulating update to version:', latestVersion);
        } else {
          return { shouldShowNotification: false, updateInfo: null };
        }
      } else {
        warn('⚠️ Failed to fetch latest version from Play Store');
        return { shouldShowNotification: false, updateInfo: null };
      }
    }

    // Get store URL
    const storeUrl = Platform.OS === 'ios' 
      ? `https://apps.apple.com/app/id${packageName}`
      : `https://play.google.com/store/apps/details?id=${packageName}`;

    // Compare versions
    const needsUpdate = compareVersions(currentVersion, latestVersion);

    const updateInfo: UpdateInfo = {
      currentVersion,
      latestVersion,
      needsUpdate,
      storeUrl,
      isForceUpdate: needsUpdate && isForceUpdateRequired(currentVersion, latestVersion),
      updateAvailable: needsUpdate
    };

    // Update last check timestamp
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_CHECK, now.toString());

    if (!needsUpdate) {
      log('✅ App is up to date');
      return { shouldShowNotification: false, updateInfo };
    }

    // Check if user already dismissed this version
    const dismissedVersion = await AsyncStorage.getItem(STORAGE_KEYS.DISMISSED_VERSION);
    if (dismissedVersion === latestVersion && !updateInfo.isForceUpdate) {
      log('⏭️ User already dismissed this version update');
      
      // Check if we should remind them (every 3 days)
      const lastRemindedStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_REMINDED_VERSION);
      const lastReminded = lastRemindedStr ? parseInt(lastRemindedStr) : 0;
      
      if (now - lastReminded > REMINDER_INTERVAL) {
        log('⏰ Time to remind user about update');
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_REMINDED_VERSION, now.toString());
        return { shouldShowNotification: true, updateInfo };
      }
      
      return { shouldShowNotification: false, updateInfo };
    }

    // Check if we already sent notification for this version
    const notificationSent = await AsyncStorage.getItem(STORAGE_KEYS.UPDATE_NOTIFICATION_SENT);
    if (notificationSent === latestVersion && !updateInfo.isForceUpdate) {
      log('📲 Already sent notification for this version');
      return { shouldShowNotification: false, updateInfo };
    }

    log('🆕 New version available, should show notification');
    return { shouldShowNotification: true, updateInfo };

  } catch (error) {
    error('❌ Error checking for app updates:', error);
    return { shouldShowNotification: false, updateInfo: null };
  }
};

/**
 * Determine if this is a force update based on version difference
 * You can customize this logic based on your versioning strategy
 */
const isForceUpdateRequired = (currentVersion: string, latestVersion: string): boolean => {
  try {
    const current = parseVersion(currentVersion);
    const latest = parseVersion(latestVersion);

    // Force update if major version differs (e.g., 1.x.x vs 2.x.x)
    if (latest.major > current.major) {
      return true;
    }

    // Force update if minor version is 3+ versions behind
    if (latest.major === current.major && (latest.minor - current.minor) >= 3) {
      return true;
    }

    return false;
  } catch (error) {
    error('Error parsing versions for force update check:', error);
    return false;
  }
};

/**
 * Parse version string into major.minor.patch numbers
 */
const parseVersion = (version: string): { major: number; minor: number; patch: number } => {
  const parts = version.split('.').map(part => parseInt(part.replace(/[^\d]/g, ''), 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
};

/**
 * Show update notification to user
 */
export const showUpdateNotification = async (updateInfo: UpdateInfo): Promise<void> => {
  try {
    const { latestVersion, isForceUpdate, storeUrl } = updateInfo;

    // Mark that we sent notification for this version
    await AsyncStorage.setItem(STORAGE_KEYS.UPDATE_NOTIFICATION_SENT, latestVersion);

    // Create notification content
    const title = isForceUpdate ? 
      '🚨 Required App Update' : 
      '🆕 App Update Available';
    
    const body = isForceUpdate ?
      `Version ${latestVersion} is required. Please update now to continue using the app.` :
      `Version ${latestVersion} is available with new features and improvements!`;

    // Send local notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'app_update',
          version: latestVersion,
          storeUrl,
          isForceUpdate: isForceUpdate || false
        }
      },
      trigger: null // Show immediately
    });

    log(`📲 Update notification sent for version ${latestVersion}`);

  } catch (error) {
    error('❌ Error showing update notification:', error);
  }
};

/**
 * Show update alert dialog
 */
export const showUpdateAlert = (updateInfo: UpdateInfo): void => {
  const { latestVersion, isForceUpdate, storeUrl, currentVersion } = updateInfo;

  const title = isForceUpdate ? 
    'Required Update' : 
    'Update Available';
  
  const message = isForceUpdate ?
    `A new version (${latestVersion}) is required. Your current version (${currentVersion}) is no longer supported.\n\nPlease update now to continue using the app.` :
    `A new version (${latestVersion}) is available! Your current version is ${currentVersion}.\n\nWould you like to update now?`;

  const buttons = isForceUpdate ? [
    {
      text: 'Update Now',
      onPress: () => openStore(storeUrl),
      style: 'default' as const
    }
  ] : [
    {
      text: 'Later',
      onPress: () => dismissUpdate(latestVersion),
      style: 'cancel' as const
    },
    {
      text: 'Update Now',
      onPress: () => openStore(storeUrl),
      style: 'default' as const
    }
  ];

  Alert.alert(title, message, buttons, { 
    cancelable: !isForceUpdate 
  });
};

/**
 * Open app store for update
 */
export const openStore = (storeUrl: string): void => {
  Linking.canOpenURL(storeUrl)
    .then((supported) => {
      if (supported) {
        Linking.openURL(storeUrl);
      } else {
        error('Cannot open store URL:', storeUrl);
        Alert.alert('Error', 'Unable to open app store. Please update manually.');
      }
    })
    .catch((error) => {
      error('Error opening store:', error);
      Alert.alert('Error', 'Unable to open app store. Please update manually.');
    });
};

/**
 * Mark version as dismissed by user
 */
export const dismissUpdate = async (version: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.DISMISSED_VERSION, version);
    log(`📝 User dismissed update for version ${version}`);
  } catch (error) {
    error('Error dismissing update:', error);
  }
};

/**
 * Check for updates in background and show notification if needed
 */
export const backgroundUpdateCheck = async (): Promise<void> => {
  try {
    log('🔄 Running background update check...');
    
    const result = await checkForAppUpdate();
    
    if (result.shouldShowNotification && result.updateInfo) {
      await showUpdateNotification(result.updateInfo);
      
      // For force updates, also show alert immediately
      if (result.updateInfo.isForceUpdate) {
        setTimeout(() => {
          showUpdateAlert(result.updateInfo!);
        }, 2000); // Show alert 2 seconds after notification
      }
    }
  } catch (error) {
    error('❌ Background update check failed:', error);
  }
};

/**
 * Handle notification response for update notifications
 */
export const handleUpdateNotificationResponse = (notification: any): void => {
  try {
    const data = notification.request?.content?.data;
    
    if (data?.type === 'app_update') {
      const updateInfo: UpdateInfo = {
        currentVersion: getCurrentVersion(),
        latestVersion: data.version,
        needsUpdate: true,
        storeUrl: data.storeUrl,
        isForceUpdate: data.isForceUpdate || false,
        updateAvailable: true
      };
      
      // Show update dialog when user taps notification
      showUpdateAlert(updateInfo);
    }
  } catch (error) {
    error('Error handling update notification response:', error);
  }
};

/**
 * Clear all update-related storage (useful for testing)
 */
export const clearUpdateStorage = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_CHECK),
      AsyncStorage.removeItem(STORAGE_KEYS.DISMISSED_VERSION),
      AsyncStorage.removeItem(STORAGE_KEYS.UPDATE_NOTIFICATION_SENT),
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_REMINDED_VERSION)
    ]);
    log('🧹 Cleared update storage');
  } catch (error) {
    error('Error clearing update storage:', error);
  }
};

/**
 * Get current update status for debugging
 */
export const getUpdateStatus = async (): Promise<{
  lastCheck: string | null;
  dismissedVersion: string | null;
  notificationSent: string | null;
  lastReminded: string | null;
}> => {
  try {
    const [lastCheck, dismissedVersion, notificationSent, lastReminded] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.LAST_CHECK),
      AsyncStorage.getItem(STORAGE_KEYS.DISMISSED_VERSION),
      AsyncStorage.getItem(STORAGE_KEYS.UPDATE_NOTIFICATION_SENT),
      AsyncStorage.getItem(STORAGE_KEYS.LAST_REMINDED_VERSION)
    ]);

    return {
      lastCheck: lastCheck ? format(new Date(parseInt(lastCheck)), 'PPpp') : null,
      dismissedVersion,
      notificationSent,
      lastReminded: lastReminded ? format(new Date(parseInt(lastReminded)), 'PPpp') : null
    };
  } catch (error) {
    error('Error getting update status:', error);
    return {
      lastCheck: null,
      dismissedVersion: null,
      notificationSent: null,
      lastReminded: null
    };
  }
};
