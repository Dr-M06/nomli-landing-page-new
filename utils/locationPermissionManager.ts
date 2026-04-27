import * as Location from './expoLocationStub';
import { Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from './productionLogger';


const LOCATION_DISCLOSURE_KEY = 'location_disclosure_accepted';
const LOCATION_PERMISSION_KEY = 'location_permission_granted';

export interface LocationPermissionResult {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
  needsDisclosure: boolean;
}

/**
 * Check if user has already accepted the location disclosure
 */
export const hasAcceptedLocationDisclosure = async (): Promise<boolean> => {
  try {
    const accepted = await AsyncStorage.getItem(LOCATION_DISCLOSURE_KEY);
    return accepted === 'true';
  } catch (error) {
    error('[LocationPermission] Error checking disclosure acceptance:', error);
    return false;
  }
};

/**
 * Mark location disclosure as accepted
 */
export const markLocationDisclosureAccepted = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(LOCATION_DISCLOSURE_KEY, 'true');
    log('[LocationPermission] Location disclosure marked as accepted');
  } catch (error) {
    error('[LocationPermission] Error marking disclosure as accepted:', error);
  }
};

/**
 * Check current location permission status
 */
export const checkLocationPermissionStatus = async (): Promise<LocationPermissionResult> => {
  try {
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    const hasAcceptedDisclosure = await hasAcceptedLocationDisclosure();
    
    // If permission is already granted, no need to show disclosure
    if (status === 'granted') {
      return {
        granted: true,
        canAskAgain: canAskAgain ?? true,
        status: status,
        needsDisclosure: false
      };
    }
    
    // If permission is denied and user can't ask again, no need to show disclosure
    if (status === 'denied' && !canAskAgain) {
      return {
        granted: false,
        canAskAgain: false,
        status: status,
        needsDisclosure: false
      };
    }
    
    // Only show disclosure if permission is undetermined or denied (but can ask again)
    // and user hasn't accepted disclosure yet
    return {
      granted: false,
      canAskAgain: canAskAgain ?? true,
      status: status,
      needsDisclosure: !hasAcceptedDisclosure
    };
  } catch (error) {
    error('[LocationPermission] Error checking location permission status:', error);
    return {
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
      needsDisclosure: true
    };
  }
};

/**
 * Request location permission with prominent disclosure
 */
export const requestLocationPermissionWithDisclosure = async (): Promise<LocationPermissionResult> => {
  try {
    // First check current permission status
    const currentStatus = await checkLocationPermissionStatus();
    
    // If permission is already granted, return success
    if (currentStatus.granted) {
      return currentStatus;
    }
    
    // If we need disclosure, return that status
    if (currentStatus.needsDisclosure) {
      return {
        granted: false,
        canAskAgain: true,
        status: 'needs_disclosure',
        needsDisclosure: true
      };
    }

    // If disclosure already accepted, proceed with permission request
    return await requestLocationPermission();
  } catch (error) {
    error('[LocationPermission] Error requesting location permission with disclosure:', error);
    return {
      granted: false,
      canAskAgain: true,
      status: 'error',
      needsDisclosure: false
    };
  }
};

/**
 * Request location permission (internal function)
 */
const requestLocationPermission = async (): Promise<LocationPermissionResult> => {
  try {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    
    const granted = status === 'granted';
    
    if (granted) {
      // Mark permission as granted
      await AsyncStorage.setItem(LOCATION_PERMISSION_KEY, 'true');
      log('[LocationPermission] Location permission granted');
    } else {
      // Show helpful alert
      Alert.alert(
        'Location Permission Required',
        'This app needs location access to find nearby users and show your location on the map. You can enable this in your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
    }

    return {
      granted,
      canAskAgain: canAskAgain ?? true,
      status: status,
      needsDisclosure: false
    };
  } catch (error) {
    error('[LocationPermission] Error requesting location permission:', error);
    return {
      granted: false,
      canAskAgain: true,
      status: 'error',
      needsDisclosure: false
    };
  }
};

/**
 * Handle location permission after disclosure acceptance
 */
export const handleLocationPermissionAfterDisclosure = async (): Promise<LocationPermissionResult> => {
  try {
    // Mark disclosure as accepted
    await markLocationDisclosureAccepted();
    
    // Now request the actual permission
    return await requestLocationPermission();
  } catch (error) {
    error('[LocationPermission] Error handling location permission after disclosure:', error);
    return {
      granted: false,
      canAskAgain: true,
      status: 'error',
      needsDisclosure: false
    };
  }
};

/**
 * Reset location permission state (for testing or user preference changes)
 */
export const resetLocationPermissionState = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([LOCATION_DISCLOSURE_KEY, LOCATION_PERMISSION_KEY]);
    log('[LocationPermission] Location permission state reset');
  } catch (error) {
    error('[LocationPermission] Error resetting location permission state:', error);
  }
};

/**
 * Check if location permission was previously granted
 */
export const wasLocationPermissionGranted = async (): Promise<boolean> => {
  try {
    const granted = await AsyncStorage.getItem(LOCATION_PERMISSION_KEY);
    return granted === 'true';
  } catch (error) {
    error('[LocationPermission] Error checking if location permission was granted:', error);
    return false;
  }
};
