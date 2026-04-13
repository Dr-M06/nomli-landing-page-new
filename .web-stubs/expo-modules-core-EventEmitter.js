// Web-compatible stub for expo-modules-core/src/EventEmitter
// This is used during static rendering on web
// Note: The real EventEmitter.ts calls ensureNativeModulesAreInstalled at module load,
// but we skip that for web since native modules aren't available

const { Platform } = require('react-native');

// Stub ensureNativeModulesAreInstalled to prevent errors
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
        // Will be set below
      }
    }
  } catch (error) {
    // Silently fail on web
  }
}

// Call it to match the real module's behavior (but it's a no-op on web)
ensureNativeModulesAreInstalled();

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

module.exports = EventEmitter;
module.exports.default = EventEmitter;
