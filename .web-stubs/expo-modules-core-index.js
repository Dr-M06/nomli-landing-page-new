// Web-compatible stub for expo-modules-core/src/index
// This provides minimal expo-modules-core functionality for web static rendering
const { Platform } = require('react-native');

// Export Platform for expo-router and other modules that import it from expo-modules-core
// expo-router's getLinkingConfig.js uses Platform.OS, so we need to export it

// Minimal EventEmitter class
class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }
  
  addListener(eventName, listener) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, []);
    }
    this._listeners.get(eventName).push(listener);
    return {
      remove: () => {
        const listeners = this._listeners.get(eventName);
        if (listeners) {
          const index = listeners.indexOf(listener);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        }
      }
    };
  }
  
  removeListener(eventName, listener) {
    const listeners = this._listeners.get(eventName);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  removeAllListeners(eventName) {
    if (eventName) {
      this._listeners.delete(eventName);
    } else {
      this._listeners.clear();
    }
  }
  
  emit(eventName, ...args) {
    const listeners = this._listeners.get(eventName);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error('EventEmitter error:', error);
        }
      });
    }
  }
}

// Stub ensureNativeModulesAreInstalled
function ensureNativeModulesAreInstalled() {
  if (globalThis.expo) {
    return;
  }
  try {
    if (Platform.OS === 'web') {
      if (!globalThis.expo) {
        globalThis.expo = {};
      }
      if (!globalThis.expo.EventEmitter) {
        globalThis.expo.EventEmitter = EventEmitter;
      }
    }
  } catch (error) {
    // Silently fail on web
  }
}

// Stub requireOptionalNativeModule - used by expo-constants and other modules
// Returns null on web since native modules aren't available
function requireOptionalNativeModule(moduleName) {
  // On web, native modules don't exist, so return null
  return null;
}

// Stub requireNativeModule - returns empty object for web
function requireNativeModule(moduleName) {
  // On web, return empty object as fallback
  return {};
}

// Stub createPermissionHook - used by expo-location and other modules
// Returns a hook that always returns permission denied on web
function createPermissionHook(permissionName) {
  return function usePermission() {
    return {
      status: 'denied',
      granted: false,
      canAskAgain: false,
      request: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
    };
  };
}

// SyntheticPlatformEmitter - used by expo-image and other modules
// This is a platform-specific event emitter
class SyntheticPlatformEmitter extends EventEmitter {
  constructor() {
    super();
  }
  
  // Platform-specific methods
  emit(eventName, ...args) {
    // On web, just use the base EventEmitter emit
    return super.emit(eventName, ...args);
  }
}

// NativeModule - used by expo-image and other modules
// Base class for native modules
class NativeModule {
  constructor() {
    // Native module base class
  }
  
  // Common native module methods
  addListener(eventName, listener) {
    // Default implementation - modules can override
    return { remove: () => {} };
  }
  
  removeListener(eventName, listener) {
    // Default implementation
  }
  
  removeAllListeners(eventName) {
    // Default implementation
  }
  
  emit(eventName, ...args) {
    // Default implementation
  }
}

// registerWebModule - used by expo-image to register web modules
// This function registers a web module and returns it
// expo-image uses: export default registerWebModule(ImageModule)
function registerWebModule(moduleNameOrClass, moduleClass) {
  // If first arg is a class (function), use it directly
  // If it's a string name and second arg is class, use the class
  if (typeof moduleNameOrClass === 'function') {
    return moduleNameOrClass;
  }
  if (moduleClass && typeof moduleClass === 'function') {
    return moduleClass;
  }
  // Fallback - return first arg if it's a class
  return moduleNameOrClass;
}

// SharedObject - used by expo modules (base class for SharedRef)
class SharedObject {
  constructor() {
    // Shared object base class
  }
}

// SharedRef - used by expo-image and other modules
// This is a generic reference type for sharing data between JS and native
// Matches the structure from expo-modules-core/src/web/CoreModule.ts
class SharedRef extends SharedObject {
  nativeRefType = 'unknown';
  
  constructor(nativeRefType = 'unknown') {
    super();
    this.nativeRefType = nativeRefType;
  }
}

// createSnapshotFriendlyRef - used by expo-image for React Server Components
// Creates a ref that's safe for SSR/static rendering
function createSnapshotFriendlyRef(initialValue) {
  return { current: initialValue };
}

// LegacyEventEmitter is used by expo-notifications and other modules
// It's typically the same as EventEmitter but with legacy API support
class LegacyEventEmitter extends EventEmitter {
  // Legacy methods if needed
  addEventListener(eventName, listener) {
    return this.addListener(eventName, listener);
  }
  
  removeEventListener(eventName, listener) {
    return this.removeListener(eventName, listener);
  }
}

// Ensure LegacyEventEmitter is properly exported for named imports
// This is critical for expo-notifications which does: import { LegacyEventEmitter } from 'expo-modules-core'
const LegacyEventEmitterExport = LegacyEventEmitter;

module.exports = {
  Platform, // Export Platform for expo-router and other modules that import it from expo-modules-core
  EventEmitter,
  LegacyEventEmitter: LegacyEventEmitterExport,
  SyntheticPlatformEmitter,
  NativeModule,
  SharedRef,
  SharedObject,
  registerWebModule,
  createSnapshotFriendlyRef,
  ensureNativeModulesAreInstalled,
  requireOptionalNativeModule,
  requireNativeModule,
  createPermissionHook,
  // Add other commonly used exports as stubs
  NativeModules: {},
};

// Also export as named exports for ES6 imports
module.exports.Platform = Platform;
module.exports.LegacyEventEmitter = LegacyEventEmitterExport;
module.exports.EventEmitter = EventEmitter;
module.exports.SyntheticPlatformEmitter = SyntheticPlatformEmitter;
module.exports.NativeModule = NativeModule;
module.exports.SharedRef = SharedRef;
module.exports.SharedObject = SharedObject;
module.exports.registerWebModule = registerWebModule;
module.exports.createSnapshotFriendlyRef = createSnapshotFriendlyRef;
module.exports.createPermissionHook = createPermissionHook;

module.exports.default = module.exports;
