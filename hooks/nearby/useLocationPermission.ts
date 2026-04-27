import { useState, useCallback, useEffect } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import * as Location from '../../utils/expoLocationStub';
import { 
  getCurrentLocation,
  getStoredUserLocation,
  updateUserLocation,
} from '../../utils/locationUtils';
import { supabase } from '../../utils/supabase';
import Toast from 'react-native-toast-message';

interface UseLocationPermissionProps {
  userId?: string;
  onPermissionGranted?: () => void;
}

interface UseLocationPermissionReturn {
  location: Location.LocationObject | null;
  locationPermissionGranted: boolean;
  checkingLocationPermission: boolean;
  requestingPermission: boolean;
  locationSharingEnabled: boolean;
  lastCheckInTime: Date | null;
  isCheckingIn: boolean;
  checkLocationPermission: () => Promise<void>;
  handleRequestLocationPermission: () => Promise<void>;
  handleManualCheckIn: () => Promise<void>;
}

export function useLocationPermission({
  userId,
  onPermissionGranted,
}: UseLocationPermissionProps): UseLocationPermissionReturn {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [checkingLocationPermission, setCheckingLocationPermission] = useState(true);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(false);
  const [lastCheckInTime, setLastCheckInTime] = useState<Date | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Check location permission
  const checkLocationPermission = useCallback(async () => {
    try {
      setCheckingLocationPermission(true);
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationPermissionGranted(granted);
      __DEV__ && console.log('[useLocationPermission] Status:', status);
    } catch (error) {
      __DEV__ && console.error('[useLocationPermission] Error:', error);
      setLocationPermissionGranted(false);
    } finally {
      setCheckingLocationPermission(false);
    }
  }, []);

  // Request location permission
  const handleRequestLocationPermission = useCallback(async () => {
    try {
      setCheckingLocationPermission(true);
      
      const { status: currentStatus, canAskAgain } = await Location.getForegroundPermissionsAsync();
      
      if (currentStatus === 'denied' && !canAskAgain) {
        setCheckingLocationPermission(false);
        Alert.alert(
          'Location Permission Required',
          'Location access is required for the Discover screen. Please enable it in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        return;
      }
      
      if (Platform.OS === 'ios') {
        setRequestingPermission(true);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationPermissionGranted(granted);
      setCheckingLocationPermission(false);
      setRequestingPermission(false);
      
      if (granted) {
        try {
          const { locationService } = await import('../../utils/locationService');
          locationService.initialize();
        } catch {
          // Silent fail
        }
        
        onPermissionGranted?.();
      } else if (status === 'denied') {
        Alert.alert(
          'Location Permission Denied',
          'Location access is required for the Discover screen. You can enable it in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
      }
    } catch (error) {
      __DEV__ && console.error('[useLocationPermission] Request error:', error);
      setCheckingLocationPermission(false);
      setRequestingPermission(false);
      Alert.alert('Error', 'Could not request location permission. Please try again.', [{ text: 'OK' }]);
    }
  }, [onPermissionGranted]);

  // Get user location and save to DB (Tinder-style: update on app open / permission grant)
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        if (locationPermissionGranted) {
          const currentLocation = await getCurrentLocation();
          if (currentLocation) {
            setLocation(currentLocation);
            // Save to DB so Nearby works - update on every Discover focus when we have fresh coords
            if (userId) {
              const { latitude, longitude } = currentLocation.coords;
              updateUserLocation(userId, latitude, longitude).catch(() => {});
            }
          }
        } else if (userId) {
          const storedLocation = await getStoredUserLocation(userId);
          if (storedLocation) {
            setLocation({
              coords: {
                latitude: storedLocation.latitude,
                longitude: storedLocation.longitude,
                altitude: null,
                accuracy: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: new Date(storedLocation.timestamp).getTime(),
            } as Location.LocationObject);
          }
        }
      } catch {
        // Continue without location
      }
    };
    
    if (locationPermissionGranted || userId) {
      getUserLocation();
    }
  }, [locationPermissionGranted, userId]);

  // Check location sharing preference
  useEffect(() => {
    const checkLocationSharingPreference = async () => {
      if (!userId) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('share_location_on_map, last_location_update')
          .eq('id', userId)
          .single();
        
        if (error) {
          setLocationSharingEnabled(false);
          return;
        }
        
        if (data) {
          setLocationSharingEnabled(data.share_location_on_map || false);
          if (data.last_location_update) {
            setLastCheckInTime(new Date(data.last_location_update));
          }
        }
      } catch {
        setLocationSharingEnabled(false);
      }
    };
    
    checkLocationSharingPreference();
  }, [userId]);

  // Manual check-in handler
  const handleManualCheckIn = useCallback(async () => {
    if (!userId || !locationPermissionGranted) {
      Alert.alert(
        'Location Permission Required',
        'Please enable location permission to check in.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!locationSharingEnabled) {
      Alert.alert(
        'Location Sharing Disabled',
        'Please enable location sharing in Settings to check in.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => {} }
        ]
      );
      return;
    }

    Alert.alert(
      'Check In',
      'Share your location on the map? Your location will be visible to nearby users for 24 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check In',
          onPress: async () => {
            try {
              setIsCheckingIn(true);
              
              const currentLocation = await getCurrentLocation();
              if (!currentLocation) {
                throw new Error('Could not get current location');
              }

              const { latitude, longitude } = currentLocation.coords;
              await updateUserLocation(userId, latitude, longitude);
              
              setLocation(currentLocation);
              setLastCheckInTime(new Date());
              
              Toast.show({
                type: 'success',
                text1: 'Checked In!',
                text2: 'Your location is now visible to nearby users',
                visibilityTime: 3000,
              });
            } catch (error) {
              __DEV__ && console.error('[useLocationPermission] Check-in error:', error);
              Alert.alert(
                'Check In Failed',
                'Could not update your location. Please try again.',
                [{ text: 'OK' }]
              );
            } finally {
              setIsCheckingIn(false);
            }
          }
        }
      ]
    );
  }, [userId, locationPermissionGranted, locationSharingEnabled]);

  return {
    location,
    locationPermissionGranted,
    checkingLocationPermission,
    requestingPermission,
    locationSharingEnabled,
    lastCheckInTime,
    isCheckingIn,
    checkLocationPermission,
    handleRequestLocationPermission,
    handleManualCheckIn,
  };
}
