import * as Notifications from 'expo-notifications';
import { Platform, Alert, Linking } from 'react-native';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
import { log, warn, error } from './productionLogger';


export interface PermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

export interface AllPermissions {
  notifications: PermissionStatus;
  camera: PermissionStatus;
  microphone: PermissionStatus;
}

/**
 * Request notification permissions
 */
export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true
        },
        android: {
          // Android doesn't support allowAnnouncements
        }
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      Alert.alert(
        'Notification Permissions Required',
        'You can enable notifications in your device settings anytime.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return false;
    }

    return true;
  } catch (error) {
    error('[Permissions] Error requesting notification permissions:', error);
    return false;
  }
};

/**
 * Request camera and microphone permissions
 */
export const requestMediaPermissions = async (): Promise<{ camera: boolean; microphone: boolean }> => {
  try {
    const cameraStatus = await Camera.requestCameraPermissionsAsync();
    const audioStatus = await Audio.requestPermissionsAsync();
    
    return {
      camera: cameraStatus.status === 'granted',
      microphone: audioStatus.status === 'granted'
    };
  } catch (error) {
    error('[Permissions] Error requesting media permissions:', error);
    return { camera: false, microphone: false };
  }
};

/**
 * Lightweight helper to inspect current status without prompting.
 * (We intentionally do NOT auto-request any permissions on app start.)
 */
export const getCurrentPermissionSummary = async (): Promise<AllPermissions> => {
  const notifications = await Notifications.getPermissionsAsync().catch(() => ({ status: 'undetermined' as const }));
  const camera = await Camera.getCameraPermissionsAsync().catch(() => ({ status: 'undetermined' as const, canAskAgain: true }));
  const mic = await Audio.getPermissionsAsync().catch(() => ({ status: 'undetermined' as const, canAskAgain: true }));

  return {
    notifications: { granted: notifications.status === 'granted', canAskAgain: true, status: notifications.status },
    camera: { granted: camera.status === 'granted', canAskAgain: camera.canAskAgain ?? true, status: camera.status },
    microphone: { granted: mic.status === 'granted', canAskAgain: mic.canAskAgain ?? true, status: mic.status },
  };
};