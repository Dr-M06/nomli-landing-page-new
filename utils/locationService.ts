import * as Location from 'expo-location';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface LocationData {
  latitude: number;
  longitude: number;
  country: string;
  countryCode: string;
  region: string;
  fullLocation: string;
  flag: string;
}

/**
 * Generate country flag emoji from ISO country code
 */
const getCountryFlag = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
};

class LocationService {
  private isDetecting = false;
  private detectionInterval: NodeJS.Timeout | null = null;
  private lastKnownLocation: LocationData | null = null;
  private user: any = null;
  private isInitialized = false;

  constructor() {
    // Don't start detection automatically - wait for explicit initialization
    // This prevents location permission requests on app start (Apple requirement)
  }

  setUser(user: any) {
    this.user = user;
  }

  /**
   * Initialize location service (call this only when user explicitly enables location)
   * This prevents automatic permission requests on app start
   */
  initialize() {
    if (!this.isInitialized) {
      this.isInitialized = true;
      this.startPeriodicDetection();
    }
  }

  /**
   * Start periodic location detection every 5 minutes
   */
  private startPeriodicDetection() {
    // Check location every 5 minutes
    this.detectionInterval = setInterval(() => {
      this.detectAndUpdateLocation();
    }, 5 * 60 * 1000); // 5 minutes

    // Also detect immediately when service starts
    this.detectAndUpdateLocation();
  }

  /**
   * Stop periodic detection
   */
  stopDetection() {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  /**
   * Detect current location using GPS and update Supabase
   */
  async detectAndUpdateLocation(): Promise<LocationData | null> {
    if (this.isDetecting || !this.user?.id) {
      return this.lastKnownLocation;
    }

    this.isDetecting = true;
    log('🛰️ Starting GPS location detection...');

    try {
      // Check location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        warn('Location permission not granted');
        return null;
      }

      // Get current location with balanced accuracy (reduced from BestForNavigation to save energy)
      // BestForNavigation is very energy-intensive. Balanced provides good accuracy with much lower battery drain.
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30000, // Increased from 10s to 30s to reduce updates
        distanceInterval: 50, // Increased from 5m to 50m to reduce updates
      });

      const { latitude, longitude } = location.coords;
      log(`📍 GPS coordinates: ${latitude}, ${longitude}`);

      // Use reverse geocoding to get location details
      const geocoding = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (!geocoding || geocoding.length === 0) {
        warn('No geocoding results found');
        return null;
      }

      const address = geocoding[0];
      log('🌍 Reverse geocoding result:', {
        region: address.region,
        country: address.country,
        isoCountryCode: address.isoCountryCode,
        city: address.city,
        subregion: address.subregion
      });

      // Extract location information directly from GPS API
      const region = address.region || address.subregion || null;
      const countryName = address.country;
      const countryCode = address.isoCountryCode;

      if (!countryName && !countryCode) {
        warn('No country information in GPS geocoding result');
        return null;
      }

      // Build location string with region only (no city for security)
      // Use only GPS API data - no hardcoded fallbacks
      const locationParts = [];
      if (region && region !== countryName) {
        locationParts.push(region);
      }
      if (countryName) {
        locationParts.push(countryName);
      }

      const fullLocation = locationParts.join(', ') || countryName || 'Unknown Location';

      const locationData: LocationData = {
        latitude,
        longitude,
        country: countryName || 'Unknown Country',
        countryCode: countryCode || 'XX',
        region: region || '',
        fullLocation,
        flag: getCountryFlag(countryCode || '')
      };

      log(`✅ GPS Location detected: ${fullLocation} (${countryCode})`);

      // Update Supabase with new location data
      await this.updateLocationInSupabase(locationData);

      this.lastKnownLocation = locationData;
      return locationData;

    } catch (error) {
      error('❌ Error detecting GPS location:', error);
      return null;
    } finally {
      this.isDetecting = false;
    }
  }

  /**
   * Update location data in Supabase
   * Saves lat/lng for Nearby (Tinder-style geo queries). Uses ~100m randomization for privacy.
   */
  private async updateLocationInSupabase(locationData: LocationData) {
    if (!this.user?.id) {
      warn('No user ID available for location update');
      return;
    }

    try {
      // Small randomization (~100m) for privacy - same approach as locationUtils
      const offset = 0.001; // ~100m at equator
      const randomizedLat = locationData.latitude + (Math.random() - 0.5) * 2 * offset;
      const randomizedLng = locationData.longitude + (Math.random() - 0.5) * 2 * offset;

      const { error } = await supabase
        .from('profiles')
        .update({
          country: locationData.countryCode,
          location: locationData.fullLocation,
          latitude: randomizedLat,
          longitude: randomizedLng,
          estimated_latitude: locationData.latitude,
          estimated_longitude: locationData.longitude,
          last_location_update: new Date().toISOString(),
          location_updated_at: new Date().toISOString()
        })
        .eq('id', this.user.id);

      if (error) {
        error('❌ Error updating location in Supabase:', error);
      } else {
        log('✅ Location updated in Supabase:', locationData.fullLocation, `(${locationData.latitude.toFixed(4)}, ${locationData.longitude.toFixed(4)})`);
      }
    } catch (error) {
      error('❌ Error updating location in Supabase:', error);
    }
  }

  /**
   * Get last known location
   */
  getLastKnownLocation(): LocationData | null {
    return this.lastKnownLocation;
  }

  /**
   * Force immediate location detection
   */
  async forceLocationUpdate(): Promise<LocationData | null> {
    log('🔄 Forcing immediate location update...');
    return await this.detectAndUpdateLocation();
  }
}

// Export singleton instance
export const locationService = new LocationService();

// Hook for React components
export const useLocationService = () => {
  return {
    detectLocation: () => locationService.forceLocationUpdate(),
    getLastKnownLocation: () => locationService.getLastKnownLocation(),
    stopDetection: () => locationService.stopDetection()
  };
};
