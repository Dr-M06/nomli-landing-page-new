// Web-compatible stub for expo-device
// This stub works in SSR/static rendering contexts
// Provides minimal device information for web

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Stub for Platform from expo-constants or react-native
// This is needed because expo-device might try to access Platform
let Platform = null;
try {
  Platform = require('react-native').Platform;
} catch (e) {
  Platform = { OS: 'web' };
}

// Web-compatible device stub
const Device = {
  // Device type - always false on web (not a physical device)
  isDevice: false,
  
  // Device name - generic web device
  deviceName: isBrowser ? 'Web Browser' : 'Server',
  
  // Device type - always UNKNOWN on web
  deviceType: 0, // DeviceType.UNKNOWN
  
  // Brand - web
  brand: 'web',
  
  // Manufacturer - web
  manufacturer: 'web',
  
  // Model name - browser or server
  modelName: isBrowser ? (navigator.userAgent || 'Browser') : 'Server',
  
  // Model ID - web
  modelId: null,
  
  // Design name - web
  designName: null,
  
  // Product name - web
  productName: 'web',
  
  // Device year class - null on web
  deviceYearClass: null,
  
  // Total memory - null on web
  totalMemory: null,
  
  // Supported CPU architectures - empty on web
  supportedCpuArchitectures: [],
  
  // OS name - web
  osName: 'web',
  
  // OS version - browser version or null
  osVersion: isBrowser ? (navigator.userAgent || null) : null,
  
  // OS build ID - null on web
  osBuildId: null,
  
  // OS internal build ID - null on web
  osInternalBuildId: null,
  
  // OS build fingerprint - null on web
  osBuildFingerprint: null,
  
  // Platform API level - null on web
  platformApiLevel: null,
};

module.exports = Device;
module.exports.default = Device;
