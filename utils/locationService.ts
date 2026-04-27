import { log, warn } from './productionLogger';

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
 * GPS / device location is disabled. Profile geo fields are not updated from the client.
 */
class LocationService {
  private detectionInterval: ReturnType<typeof setInterval> | null = null;
  private lastKnownLocation: LocationData | null = null;
  private user: any = null;
  private isInitialized = false;

  setUser(user: any) {
    this.user = user;
  }

  initialize() {
    if (!this.isInitialized) {
      this.isInitialized = true;
    }
  }

  stopDetection() {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  async detectAndUpdateLocation(): Promise<LocationData | null> {
    warn('[LocationService] Device location disabled — skipping update');
    return this.lastKnownLocation;
  }

  getLastKnownLocation(): LocationData | null {
    return this.lastKnownLocation;
  }

  async forceLocationUpdate(): Promise<LocationData | null> {
    log('[LocationService] forceLocationUpdate: no-op (GPS disabled)');
    return null;
  }
}

export const locationService = new LocationService();

export const useLocationService = () => ({
  detectLocation: () => locationService.forceLocationUpdate(),
  getLastKnownLocation: () => locationService.getLastKnownLocation(),
  stopDetection: () => locationService.stopDetection(),
});
