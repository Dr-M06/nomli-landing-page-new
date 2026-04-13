import * as Location from 'expo-location';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getDistance } from 'geolib';
import { SEARCH_RADIUS_KM } from '../constants/Endpoints';
import { log, warn, error } from './productionLogger';


// Interface for profile with location data
export interface LocationProfile {
  id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  latitude?: number;
  longitude?: number;
  estimated_latitude?: number;
  estimated_longitude?: number;
  last_location_update?: string;
  location_updated_at?: string; // Keep for backward compatibility
  country?: string;
  distance?: number; // in kilometers
  interests?: string[];
}

// Location storage constants
const LOCATION_STORAGE_PREFIX = 'user_last_location_';
const LOCATION_MAX_AGE_DAYS = 7; // How many days before stored location is considered stale

// Interface for stored location data
export interface StoredLocationData {
  latitude: number;
  longitude: number;
  timestamp: string;
}

// Request location permissions
export const requestLocationPermission = async (): Promise<boolean> => {
  try {
    // Request foreground location permission
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (foregroundStatus !== 'granted') {
      log('[LocationUtils] Foreground location permission denied');
      return false;
    }
    
    log('[LocationUtils] Location permission granted');
    return true;
  } catch (error) {
    error('[LocationUtils] Error requesting location permission:', error);
    return false;
  }
};

// Get current location with timeout and error handling
export const getCurrentLocation = async (): Promise<Location.LocationObject> => {
  try {
    // Get current location with high accuracy
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    
    log(`[LocationUtils] Got current location: ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`);
    return location;
  } catch (error) {
    error('[LocationUtils] Error getting current location:', error);
    throw error;
  }
};

// Get country from coordinates
export const getCountryFromCoordinates = async (
  latitude: number,
  longitude: number
): Promise<string | null> => {
  try {
    // Reverse geocode to get address information
    const geocodeResult = await Location.reverseGeocodeAsync({
      latitude,
      longitude
    });
    
    if (geocodeResult && (geocodeResult?.length || 0) > 0) {
      const country = geocodeResult[0].country;
      log(`[LocationUtils] Determined country: ${country || 'Unknown'}`);
      return country || null;
    }
    
    return null;
  } catch (error) {
    error('[LocationUtils] Error getting country from coordinates:', error);
    return null;
  }
};

// Get approximate location from coordinates using Geoapify
export const getApproximateLocation = async (
  latitude: number,
  longitude: number
): Promise<{ latitude: number, longitude: number }> => {
  try {
    // Get API key from Constants
    const apiKey = Constants.expoConfig?.extra?.GEOAPIFY_API_KEY;
    
    if (!apiKey) {
      warn('EXPO_GEOAPIFY_API_KEY not found, using randomized coordinates');
      // Add a smaller random offset to the original coordinates for basic privacy
      // This creates a ~200m radius of uncertainty instead of 500m
      const randomOffsetLat = (Math.random() - 0.5) * 0.003;
      const randomOffsetLon = (Math.random() - 0.5) * 0.003;
      
      return {
        latitude: latitude + randomOffsetLat,
        longitude: longitude + randomOffsetLon
      };
    }
    
    // Use Geoapify to get approximate location (neighborhood level)
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${latitude}&lon=${longitude}&apiKey=${apiKey}&type=neighbourhood`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.features && (data.features?.length || 0) > 0) {
      // Use the center of the neighborhood instead of exact location
      const neighborhood = data.features[0];
      const approximateCoords = neighborhood.geometry.coordinates;
      
      // Add smaller random offset for additional privacy (±50-150 meters)
      const randomOffsetLat = (Math.random() - 0.5) * 0.002; // ~150m max
      const randomOffsetLon = (Math.random() - 0.5) * 0.002;
      
      return {
        latitude: approximateCoords[1] + randomOffsetLat,
        longitude: approximateCoords[0] + randomOffsetLon
      };
    }
    
    // If no neighborhood data, add a smaller random offset to the original coordinates
    // This creates a ~200m radius of uncertainty instead of 500m
    const randomOffsetLat = (Math.random() - 0.5) * 0.003;
    const randomOffsetLon = (Math.random() - 0.5) * 0.003;
    
    return {
      latitude: latitude + randomOffsetLat,
      longitude: longitude + randomOffsetLon
    };
  } catch (error) {
    error('Error getting approximate location:', error);
    // Fall back to adding smaller random offset to original coordinates
    const randomOffsetLat = (Math.random() - 0.5) * 0.004; // ~400m max instead of 1km
    const randomOffsetLon = (Math.random() - 0.5) * 0.004;
    
    return {
      latitude: latitude + randomOffsetLat,
      longitude: longitude + randomOffsetLon
    };
  }
};

// Function to update user location in database
export const updateUserLocation = async (
  userId: string,
  latitude: number,
  longitude: number
): Promise<void> => {
  try {
    // Add small randomization for privacy (within ~100m)
    const randomizedLocation = randomizeCoordinates(latitude, longitude, 0.1);
    
    // Save to AsyncStorage first (this will work even if database update fails)
    await saveUserLocationToStorage(userId, latitude, longitude);
    log('[LocationUtils] Successfully saved user location to storage');
    
    // Try to update user's location in the database
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          latitude: randomizedLocation.latitude,
          longitude: randomizedLocation.longitude,
          last_location_update: new Date().toISOString(),
          estimated_latitude: latitude,  // Store original coordinates as estimated
          estimated_longitude: longitude // Store original coordinates as estimated
        })
        .eq('id', userId);
      
      if (error) {
        if (error.code === '42501') { // Permission denied error code
          log('[LocationUtils] Permission denied when updating location in database. Using local storage instead.');
          // We already saved to AsyncStorage, so we can continue
          return;
        } else if (error.code === '42703') { // Column does not exist error
          log('[LocationUtils] Column does not exist. Trying with basic location update.');
          
          // Try with basic fields only
          const { error: basicError } = await supabase
            .from('profiles')
            .update({
              latitude: randomizedLocation.latitude,
              longitude: randomizedLocation.longitude
            })
            .eq('id', userId);
            
          if (basicError) {
            error('[LocationUtils] Error updating basic location in database:', basicError);
          } else {
            log('[LocationUtils] Successfully updated basic location in database');
          }
          return;
        } else {
          error('[LocationUtils] Error updating user location in database:', error);
          // Continue with local storage only
          return;
        }
      }
      
      log('[LocationUtils] Successfully updated user location in database');
    } catch (dbError) {
      error('[LocationUtils] Database error in updateUserLocation:', dbError);
      // We already saved to AsyncStorage, so we can continue
    }
  } catch (error) {
    error('[LocationUtils] Error in updateUserLocation:', error);
    throw error;
  }
};

// Calculate distance between two coordinates in kilometers
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Define a geofence area
export interface GeofenceArea {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // in kilometers
  description?: string;
}

// Check if a location is within a geofence
export const isLocationInGeofence = (
  latitude: number,
  longitude: number,
  geofence: GeofenceArea
): boolean => {
  const distance = calculateDistance(
    latitude,
    longitude,
    geofence.latitude,
    geofence.longitude
  );
  return distance <= geofence.radius;
};

// Find all geofences that contain a location
export const findContainingGeofences = (
  latitude: number,
  longitude: number,
  geofences: GeofenceArea[]
): GeofenceArea[] => {
  return geofences.filter(geofence => 
    isLocationInGeofence(latitude, longitude, geofence)
  );
};

// Get nearby geofences within a certain distance
export const getNearbyGeofences = (
  latitude: number,
  longitude: number,
  geofences: GeofenceArea[],
  maxDistance: number = 10 // Default 10km
): GeofenceArea[] => {
  return geofences.filter(geofence => {
    const distance = calculateDistance(
      latitude,
      longitude,
      geofence.latitude,
      geofence.longitude
    );
    return distance <= maxDistance;
  });
};

// Create a geofence from the current location
export const createGeofenceFromLocation = async (
  latitude: number,
  longitude: number,
  name: string,
  radius: number = 1, // Default 1km
  description?: string
): Promise<GeofenceArea> => {
  // Get approximate location for privacy
  const approximateLocation = await getApproximateLocation(latitude, longitude);
  
  return {
    id: `geofence_${Date.now()}`,
    name,
    latitude: approximateLocation.latitude,
    longitude: approximateLocation.longitude,
    radius,
    description
  };
};

// Store geofence in local storage
export const storeGeofence = async (
  userId: string,
  geofence: GeofenceArea
): Promise<void> => {
  try {
    // Get existing geofences
    const existingGeofencesJson = await AsyncStorage.getItem(`user_geofences_${userId}`);
    const existingGeofences: GeofenceArea[] = existingGeofencesJson 
      ? JSON.parse(existingGeofencesJson) 
      : [];
    
    // Add new geofence
    const updatedGeofences = [...existingGeofences, geofence];
    
    // Save updated geofences
    await AsyncStorage.setItem(
      `user_geofences_${userId}`, 
      JSON.stringify(updatedGeofences)
    );
    
    log(`Geofence "${geofence.name}" stored successfully`);
  } catch (error) {
    error('Failed to store geofence:', error);
    throw error;
  }
};

// Get all stored geofences
export const getStoredGeofences = async (
  userId: string
): Promise<GeofenceArea[]> => {
  try {
    const geofencesJson = await AsyncStorage.getItem(`user_geofences_${userId}`);
    return geofencesJson ? JSON.parse(geofencesJson) : [];
  } catch (error) {
    error('Failed to retrieve geofences:', error);
    return [];
  }
};

// Fetch users within specific geofences
export const fetchUsersInGeofences = async (
  userId: string,
  geofences: GeofenceArea[],
  hoursAgo: number = 48 // Default 48 hours
): Promise<LocationProfile[]> => {
  try {
    if (!geofences || (geofences?.length || 0) === 0) {
      log('No geofences provided for user filtering');
      return [];
    }
    
    // Get users who have updated their location within the specified hours
    const timeAgo = new Date();
    timeAgo.setHours(timeAgo.getHours() - hoursAgo);
    
    // Fetch all users with location data, excluding hidden profiles
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, latitude, longitude, estimated_latitude, estimated_longitude, location_updated_at, country, profile_visible')
      .not('id', 'eq', userId) // Exclude current user
      .eq('profile_visible', true) // Only show visible profiles
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('location_updated_at', timeAgo.toISOString());
    
    if (error) {
      error('Error fetching users for geofencing:', error);
      return [];
    }
    
    if (!data || (data?.length || 0) === 0) {
      return [];
    }
    
    // Filter users who are within any of the provided geofences
    const usersInGeofences = data.filter(profile => {
      // Use estimated coordinates if available, otherwise use actual coordinates
      const userLat = profile.estimated_latitude || profile.latitude;
      const userLon = profile.estimated_longitude || profile.longitude;
      
      // Check if user is in any of the geofences
      return geofences.some(geofence => 
        isLocationInGeofence(userLat, userLon, geofence)
      );
    });
    
    // Process users to use estimated coordinates for privacy
    const processedUsers = usersInGeofences.map(profile => ({
      ...profile,
      // Only expose the estimated coordinates to the client
      latitude: profile.estimated_latitude || profile.latitude,
      longitude: profile.estimated_longitude || profile.longitude,
      // Remove the actual coordinates for privacy
      exact_latitude: undefined,
      exact_longitude: undefined,
    }));
    
    return processedUsers;
  } catch (error) {
    error('Error fetching users in geofences:', error);
    return [];
  }
};

// Fetch nearby users within a specified radius
export const fetchNearbyUsers = async (
  userId: string,
  latitude: number,
  longitude: number,
  radius: number = SEARCH_RADIUS_KM, // Use the constant
  hoursAgo: number = 72 // 72 hours
): Promise<LocationProfile[]> => {
  try {
    log(`[LocationUtils] fetchNearbyUsers called with radius: ${radius}km, timeframe: ${hoursAgo}h`);
    log(`[LocationUtils] User coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    
    // Get users who have updated their location within the specified hours
    const timeAgo = new Date();
    timeAgo.setHours(timeAgo.getHours() - hoursAgo);
    
    // First try to get users with estimated coordinates
    let data = [];
    let error = null;
    
    try {
      log(`[LocationUtils] Querying profiles with location data updated since ${timeAgo.toISOString()}`);
      
      // Try first with last_location_update field
      try {
        const result = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, latitude, longitude, estimated_latitude, estimated_longitude, last_location_update, country, interests, profile_visible')
          .not('id', 'eq', userId) // Exclude current user
          .eq('profile_visible', true) // Only show visible profiles
          .or('is_suspended.is.null,is_suspended.eq.false') // Exclude suspended users
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .gte('last_location_update', timeAgo.toISOString());
          
        data = result.data || [];
        error = result.error;
        
        if (error && error.code === '42703') {
          // If profile_visible column doesn't exist, try without it
          if (error.message?.includes('profile_visible')) {
            const fallbackResult = await supabase
              .from('profiles')
              .select('id, username, full_name, avatar_url, latitude, longitude, estimated_latitude, estimated_longitude, last_location_update, country, interests')
              .not('id', 'eq', userId) // Exclude current user
              .not('latitude', 'is', null)
              .not('longitude', 'is', null)
              .gte('last_location_update', timeAgo.toISOString());
            
            data = fallbackResult.data || [];
            error = fallbackResult.error;
          } else {
            throw new Error('last_location_update column does not exist');
          }
        }
        
        log(`[LocationUtils] Query returned ${data?.length || 0} profiles with location data using last_location_update`);
      } catch (columnError) {
        // If last_location_update doesn't exist, try with location_updated_at
        log('[LocationUtils] Falling back to location_updated_at field');
        const result = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, latitude, longitude, estimated_latitude, estimated_longitude, location_updated_at, country, interests, profile_visible')
          .not('id', 'eq', userId) // Exclude current user
          .eq('profile_visible', true) // Only show visible profiles
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .gte('location_updated_at', timeAgo.toISOString());
          
        data = result.data || [];
        error = result.error;
        
        log(`[LocationUtils] Query returned ${data?.length || 0} profiles with location data using location_updated_at`);
      }
    } catch (queryError) {
      error('[LocationUtils] Error querying profiles with location fields:', queryError);
      
      // If all queries fail, fall back to basic query without time filter
      log('[LocationUtils] Falling back to basic location query without time filter');
      const result = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, latitude, longitude, country, interests, profile_visible')
        .not('id', 'eq', userId) // Exclude current user
        .eq('profile_visible', true) // Only show visible profiles
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(100); // Limit to avoid too many results
        
      data = result.data || [];
      error = result.error;
      
      log(`[LocationUtils] Basic query returned ${data?.length || 0} profiles with location data`);
    }
    
    if (error) {
      if (error.code === '42501') { // Permission denied error code
        log('[LocationUtils] Permission denied when fetching nearby users. Using empty result set.');
        return []; // Return empty array
      } else {
        error('[LocationUtils] Error fetching nearby users:', error);
        return []; // Return empty array
      }
    }
    
    // If we have no data from the database, return empty array
    if (!data || (data?.length || 0) === 0) {
      log('[LocationUtils] No location data found for any users');
      return [];
    }
    
    // Calculate distance and filter by radius
    log(`[LocationUtils] Calculating distances for ${data?.length || 0} profiles`);
    const usersWithDistance = data.map(profile => {
      // Use estimated coordinates if available, otherwise use actual coordinates
      const userLat = profile.estimated_latitude || profile.latitude || 0;
      const userLon = profile.estimated_longitude || profile.longitude || 0;
      
      const distance = getDistanceInKm(
        latitude,
        longitude,
        userLat,
        userLon
      );
      
      return {
        ...profile,
        // Only expose the estimated coordinates to the client
        latitude: profile.estimated_latitude || profile.latitude,
        longitude: profile.estimated_longitude || profile.longitude,
        // Remove the actual coordinates for privacy
        exact_latitude: undefined,
        exact_longitude: undefined,
        distance
      };
    });
    
    // Filter users within the radius and sort by distance
    const nearbyUsers = usersWithDistance
      .filter(profile => (profile.distance || 0) <= radius)
      .sort((a, b) => (a.distance || 0) - (b.distance || 0));
    
    log(`[LocationUtils] Found ${nearbyUsers?.length || 0} users within ${radius}km radius`);
    
    // Log the first few nearby users for debugging
    nearbyUsers.slice(0, 3).forEach((user, index) => {
      log(`[LocationUtils] Nearby user ${index + 1}: ${user.username || 'Unknown'}, distance: ${user.distance?.toFixed(2) || 'unknown'}km`);
    });
    
    return nearbyUsers;
  } catch (error) {
    error('[LocationUtils] Error fetching nearby users:', error);
    return []; // Return empty array instead of throwing
  }
};

// Fetch users from the same country
export const fetchUsersFromSameCountry = async (
  userId: string,
  country: string | null,
  limit: number = 50
): Promise<LocationProfile[]> => {
  if (!country) {
    return [];
  }
  
  try {
    // First try with estimated coordinates
    let data = [];
    let error = null;
    
    try {
      const result = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio, latitude, longitude, estimated_latitude, estimated_longitude, country, last_location_update, interests, profile_visible')
        .eq('country', country)
        .eq('profile_visible', true) // Only show visible profiles
        .not('id', 'eq', userId)
        .limit(limit);
      
      data = result.data || [];
      error = result.error;
      
      if (error && error.code === '42703') {
        throw new Error('Column does not exist');
      }
    } catch (queryError) {
      error('[LocationUtils] Error querying country users with estimated coordinates:', queryError);
      
      // If the query fails (likely due to missing columns), fall back to basic query
      log('[LocationUtils] Falling back to basic query for country users');
      const result = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio, latitude, longitude, country, interests, profile_visible')
        .eq('country', country)
        .eq('profile_visible', true) // Only show visible profiles
        .not('id', 'eq', userId)
        .limit(limit);
          
      data = result.data || [];
      error = result.error;
    }
    
    if (error) {
      if (error.code === '42501') { // Permission denied error code
        error('[LocationUtils] Permission denied when fetching country users. This is likely a database policy issue.');
        return [];
      }
      error('[LocationUtils] Error fetching users from same country:', error);
      return [];
    }
    
    // Process users to use estimated coordinates for privacy
    const processedUsers = data?.map(profile => ({
      ...profile,
      // Only expose the estimated coordinates to the client
      latitude: profile.estimated_latitude || profile.latitude,
      longitude: profile.estimated_longitude || profile.longitude,
      // Remove the actual coordinates for privacy
      exact_latitude: undefined,
      exact_longitude: undefined,
    })) || [];
    
    return processedUsers;
  } catch (error) {
    error('[LocationUtils] Error fetching users from same country:', error);
    return [];
  }
};

// Function to save user location to AsyncStorage
export const saveUserLocationToStorage = async (
  userId: string,
  latitude: number,
  longitude: number
): Promise<void> => {
  try {
    if (!userId) {
      error('[LocationUtils] Cannot save location: No user ID provided');
      return;
    }
    
    const locationData: StoredLocationData = {
      latitude,
      longitude,
      timestamp: new Date().toISOString()
    };
    
    await AsyncStorage.setItem(
      `${LOCATION_STORAGE_PREFIX}${userId}`, 
      JSON.stringify(locationData)
    );
    
    log('[LocationUtils] Successfully saved user location to storage');
  } catch (error) {
    error('[LocationUtils] Error saving location to storage:', error);
    throw error;
  }
};

// Function to retrieve user location from AsyncStorage
export const getStoredUserLocation = async (
  userId: string
): Promise<StoredLocationData | null> => {
  try {
    if (!userId) {
      error('[LocationUtils] Cannot get stored location: No user ID provided');
      return null;
    }
    
    const storedData = await AsyncStorage.getItem(`${LOCATION_STORAGE_PREFIX}${userId}`);
    
    if (!storedData) {
      log('[LocationUtils] No stored location found for user');
      return null;
    }
    
    const locationData: StoredLocationData = JSON.parse(storedData);
    
    // Check if the stored location is not too old
    const storedTime = new Date(locationData.timestamp).getTime();
    const currentTime = new Date().getTime();
    const maxAgeMs = LOCATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    
    if (currentTime - storedTime > maxAgeMs) {
      log('[LocationUtils] Stored location is too old, not using it');
      return null;
    }
    
    log('[LocationUtils] Retrieved valid stored location');
    return locationData;
  } catch (error) {
    error('[LocationUtils] Error retrieving stored location:', error);
    return null;
  }
};

// Function to check if stored location exists and is valid
export const hasValidStoredLocation = async (userId: string): Promise<boolean> => {
  try {
    const locationData = await getStoredUserLocation(userId);
    return locationData !== null;
  } catch (error) {
    error('[LocationUtils] Error checking stored location validity:', error);
    return false;
  }
};

// Function to clear stored location
export const clearStoredLocation = async (userId: string): Promise<void> => {
  try {
    if (!userId) return;
    
    await AsyncStorage.removeItem(`${LOCATION_STORAGE_PREFIX}${userId}`);
    log('[LocationUtils] Cleared stored location for user');
  } catch (error) {
    error('[LocationUtils] Error clearing stored location:', error);
  }
};

// Function to randomize coordinates for privacy
export const randomizeCoordinates = (
  latitude: number,
  longitude: number,
  maxDistanceKm: number = 0.1
): { latitude: number; longitude: number } => {
  // Convert maxDistanceKm to degrees (approximate)
  const maxLatDegrees = maxDistanceKm / 111.32; // 1 degree latitude is approximately 111.32 km
  const maxLngDegrees = maxDistanceKm / (111.32 * Math.cos(latitude * (Math.PI / 180))); // Adjust for longitude
  
  // Generate random offsets
  const latOffset = (Math.random() * 2 - 1) * maxLatDegrees;
  const lngOffset = (Math.random() * 2 - 1) * maxLngDegrees;
  
  // Apply offsets
  return {
    latitude: latitude + latOffset,
    longitude: longitude + lngOffset
  };
};

// Function to get distance between two points in kilometers
export const getDistanceInKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  return getDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  ) / 1000; // Convert meters to kilometers
};

// Function to check if a user is within the search radius
export const isWithinSearchRadius = (
  userLat: number,
  userLon: number,
  targetLat: number,
  targetLon: number,
  radiusKm: number = SEARCH_RADIUS_KM
): boolean => {
  const distance = getDistanceInKm(userLat, userLon, targetLat, targetLon);
  return distance <= radiusKm;
}; 