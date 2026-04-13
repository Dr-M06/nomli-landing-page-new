import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

export type LocationType = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number; // Add timestamp for validation
};

const LOCATION_STORAGE_KEY = 'user_last_location';
const MAX_LOCATION_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export default function useLocation() {
  const [location, setLocation] = useState<LocationType | null>(null);
  const [storedLocation, setStoredLocation] = useState<LocationType | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingStoredLocation, setUsingStoredLocation] = useState(false);

  // Load stored location on mount, then check permissions
  useEffect(() => {
    const initializeLocation = async () => {
      await loadStoredLocation();
      // Wait a bit for storedLocation state to update, then check permissions
      setTimeout(() => {
        checkAndGetLocationIfPermitted();
      }, 100);
    };
    initializeLocation();
  }, []);

  // Check if permission is granted and get location without requesting
  const checkAndGetLocationIfPermitted = async () => {
    try {
      setLoading(true);
      
      // First, load stored location directly from AsyncStorage
      let validStoredLocation: LocationType | null = null;
      try {
        const storedData = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
        if (storedData) {
          const parsedLocation = JSON.parse(storedData) as LocationType;
          if (isValidLocation(parsedLocation)) {
            validStoredLocation = parsedLocation;
            setStoredLocation(parsedLocation);
          }
        }
      } catch (storageError) {
        console.error('[Location] Error loading stored location:', storageError);
      }
      
      // Check permission status without requesting
      const { status } = await Location.getForegroundPermissionsAsync();
      
      if (status === 'granted') {
        // Permission already granted, get location
        try {
          const locationResult = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced
          });
          
          const newLocation = {
            latitude: locationResult.coords.latitude,
            longitude: locationResult.coords.longitude,
            accuracy: locationResult.coords.accuracy,
            timestamp: Date.now()
          };
          
          setLocation(newLocation);
          setUsingStoredLocation(false);
          saveLocationToStorage(newLocation);
        } catch (error) {
          console.log('[Location] Error getting location (permission granted):', error);
          // If error getting current location but we have a valid stored location, use it
          if (validStoredLocation) {
            setLocation(validStoredLocation);
            setUsingStoredLocation(true);
          }
        }
      } else {
        // Permission not granted, use stored location if available
        console.log('[Location] Permission not granted, using stored location if available');
        if (validStoredLocation) {
          setLocation(validStoredLocation);
          setUsingStoredLocation(true);
        }
      }
    } catch (error: any) {
      console.error('[Location] Error checking permission status:', error);
      // If error checking permission, try to use stored location
      try {
        const storedData = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
        if (storedData) {
          const parsedLocation = JSON.parse(storedData) as LocationType;
          if (isValidLocation(parsedLocation)) {
            setLocation(parsedLocation);
            setUsingStoredLocation(true);
            setStoredLocation(parsedLocation);
          }
        }
      } catch (storageError) {
        console.error('[Location] Error loading stored location in error handler:', storageError);
      }
    } finally {
      setLoading(false);
    }
  };

  // Load location from AsyncStorage
  const loadStoredLocation = async () => {
    try {
      const storedData = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
      
      if (storedData) {
        const parsedLocation = JSON.parse(storedData) as LocationType;
        
        // Validate the stored location
        if (isValidLocation(parsedLocation)) {
          console.log('[Location] Using stored location:', parsedLocation);
          setStoredLocation(parsedLocation);
          
          // If we don't have a current location yet, use the stored one
          if (!location) {
            setLocation(parsedLocation);
            setUsingStoredLocation(true);
          }
        } else {
          console.log('[Location] Stored location is too old or invalid, not using it');
          // Clear the invalid stored location
          await AsyncStorage.removeItem(LOCATION_STORAGE_KEY);
        }
      } else {
        console.log('[Location] No stored location found');
      }
    } catch (error) {
      console.error('[Location] Error loading stored location:', error);
    }
  };

  // Save location to AsyncStorage
  const saveLocationToStorage = async (locationData: LocationType) => {
    try {
      // Add timestamp if not present
      const locationWithTimestamp = {
        ...locationData,
        timestamp: locationData.timestamp || Date.now()
      };
      
      await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(locationWithTimestamp));
      console.log('[Location] Location saved to storage');
      setStoredLocation(locationWithTimestamp);
    } catch (error) {
      console.error('[Location] Error saving location to storage:', error);
    }
  };

  // Check if a location is valid (not too old)
  const isValidLocation = (locationData: LocationType): boolean => {
    if (!locationData || !locationData.latitude || !locationData.longitude) {
      return false;
    }
    
    // If no timestamp, consider it invalid
    if (!locationData.timestamp) {
      return false;
    }
    
    // Check if location is not too old
    const now = Date.now();
    const locationAge = now - locationData.timestamp;
    
    return locationAge <= MAX_LOCATION_AGE;
  };

  // Get current location
  const getCurrentLocation = async () => {
    try {
      setLoading(true);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        
        // If permission denied but we have a valid stored location, use it
        if (storedLocation && isValidLocation(storedLocation)) {
          setLocation(storedLocation);
          setUsingStoredLocation(true);
        }
        
        setLoading(false);
        return;
      }

      const locationResult = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      
      const newLocation = {
        latitude: locationResult.coords.latitude,
        longitude: locationResult.coords.longitude,
        accuracy: locationResult.coords.accuracy,
        timestamp: Date.now()
      };
      
      setLocation(newLocation);
      setUsingStoredLocation(false);
      
      // Save the new location to storage
      saveLocationToStorage(newLocation);
    } catch (error: any) {
      console.error('[Location] Error getting current location:', error);
      setErrorMsg(error.message);
      
      // If error getting current location but we have a valid stored location, use it
      if (storedLocation && isValidLocation(storedLocation)) {
        setLocation(storedLocation);
        setUsingStoredLocation(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Update location manually
  const updateLocation = async () => {
    try {
      setLoading(true);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      const locationResult = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      
      const newLocation = {
        latitude: locationResult.coords.latitude,
        longitude: locationResult.coords.longitude,
        accuracy: locationResult.coords.accuracy,
        timestamp: Date.now()
      };
      
      setLocation(newLocation);
      setUsingStoredLocation(false);
      
      // Save the new location to storage
      saveLocationToStorage(newLocation);
    } catch (error: any) {
      console.error('[Location] Error updating location:', error);
      setErrorMsg(error.message);
      
      Alert.alert(
        'Location Error',
        'Unable to update your location. Using last known location instead.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  // Clear stored location
  const clearStoredLocation = async () => {
    try {
      await AsyncStorage.removeItem(LOCATION_STORAGE_KEY);
      setStoredLocation(null);
      console.log('[Location] Stored location cleared');
    } catch (error) {
      console.error('[Location] Error clearing stored location:', error);
    }
  };

  return {
    location,
    storedLocation,
    errorMsg,
    loading,
    updateLocation,
    clearStoredLocation,
    usingStoredLocation,
  };
}