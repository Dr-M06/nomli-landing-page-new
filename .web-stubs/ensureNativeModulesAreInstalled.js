// Web-compatible stub for ensureNativeModulesAreInstalled
// IMPORTANT: This stub is ONLY used for web builds - mobile uses the real module
const { Platform } = require('react-native');

function ensureNativeModulesAreInstalled() {
  if (globalThis.expo) {
    return;
  }
  try {
    if (Platform.OS === 'web') {
      // Set up minimal globalThis.expo for web
      if (!globalThis.expo) {
        globalThis.expo = {};
      }
      // Create minimal EventEmitter if it doesn't exist
      if (!globalThis.expo.EventEmitter) {
        globalThis.expo.EventEmitter = class EventEmitter {
          addListener() { return { remove: () => {} }; }
          removeListener() {}
          removeAllListeners() {}
          emit() {}
        };
      }
    }
  } catch (error) {
    console.error(`Unable to install Expo modules: ${error}`);
  }
}

module.exports = { ensureNativeModulesAreInstalled };
module.exports.default = ensureNativeModulesAreInstalled;
