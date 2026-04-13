/**
 * JS-only stand-in for expo-location: no GPS, no native module, no location permissions.
 * Geocoding uses Geoapify over HTTPS when EXPO_GEOAPIFY_API_KEY is set.
 */
import { geoapifyForwardGeocode, geoapifyReverseGeocode } from './geoapifyGeocode';

export enum Accuracy {
  Lowest = 1,
  Low = 2,
  Balanced = 3,
  High = 4,
  Highest = 5,
  BestForNavigation = 6,
}

export type LocationGeocodedAddress = {
  city: string | null;
  district: string | null;
  streetNumber: string | null;
  street: string | null;
  region: string | null;
  subregion: string | null;
  country: string | null;
  postalCode: string | null;
  name: string | null;
  isoCountryCode: string | null;
  timezone: string | null;
};

export type LocationGeocodedLocation = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
};

export type LocationObject = {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
};

const denied = {
  status: 'denied' as const,
  granted: false,
  expires: 'never' as const,
  canAskAgain: false,
};

export async function getForegroundPermissionsAsync() {
  return denied;
}

export async function requestForegroundPermissionsAsync() {
  return denied;
}

export async function getCurrentPositionAsync(_options?: unknown): Promise<LocationObject> {
  throw new Error('Device location is not used in this app.');
}

export async function reverseGeocodeAsync(location: {
  latitude: number;
  longitude: number;
}): Promise<LocationGeocodedAddress[]> {
  const rows = await geoapifyReverseGeocode(location.latitude, location.longitude);
  return rows.map((r) => ({
    city: r.city,
    district: null,
    streetNumber: null,
    street: r.street,
    region: r.region,
    subregion: null,
    country: r.country,
    postalCode: r.postalCode,
    name: r.name,
    isoCountryCode: r.isoCountryCode,
    timezone: null,
  }));
}

export async function geocodeAsync(address: string): Promise<LocationGeocodedLocation[]> {
  const pts = await geoapifyForwardGeocode(address);
  return pts.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
    altitude: null,
    accuracy: null,
  }));
}
