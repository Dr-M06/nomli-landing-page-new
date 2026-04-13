// Web-compatible stub for expo-location
// This stub works in SSR/static rendering contexts
// Provides minimal location API for web

// Permission status enum
const PermissionStatus = {
  GRANTED: 'granted',
  UNDETERMINED: 'undetermined',
  DENIED: 'denied',
};

// Accuracy enum
const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

// Location stub
const Location = {
  // Permission methods
  requestForegroundPermissionsAsync: async () => ({
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
  }),
  
  requestBackgroundPermissionsAsync: async () => ({
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
  }),
  
  getForegroundPermissionsAsync: async () => ({
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
  }),
  
  getBackgroundPermissionsAsync: async () => ({
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
  }),
  
  // Location methods - return null on web
  getCurrentPositionAsync: async (options) => {
    console.warn('[Location] getCurrentPositionAsync not available on web');
    return null;
  },
  
  watchPositionAsync: async (options, callback) => {
    console.warn('[Location] watchPositionAsync not available on web');
    return { remove: () => {} };
  },
  
  // Geocoding methods - return empty arrays on web
  geocodeAsync: async (address) => {
    console.warn('[Location] geocodeAsync not available on web');
    return [];
  },
  
  reverseGeocodeAsync: async (location) => {
    console.warn('[Location] reverseGeocodeAsync not available on web');
    return [];
  },
  
  // Constants
  PermissionStatus,
  Accuracy,
  
  // Permission hook (from expo-modules-core)
  useForegroundPermissions: () => ({
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
    request: async () => ({ status: PermissionStatus.DENIED, granted: false, canAskAgain: false }),
  }),
  
  useBackgroundPermissions: () => ({
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
    request: async () => ({ status: PermissionStatus.DENIED, granted: false, canAskAgain: false }),
  }),
};

module.exports = Location;
module.exports.default = Location;
module.exports.PermissionStatus = PermissionStatus;
module.exports.Accuracy = Accuracy;
