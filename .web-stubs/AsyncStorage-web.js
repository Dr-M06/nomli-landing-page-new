// Web-compatible stub for @react-native-async-storage/async-storage
// This stub works in SSR/static rendering contexts where window is not available
// Uses in-memory storage for SSR, localStorage for browser runtime

// In-memory storage for SSR/static rendering
const memoryStorage = new Map();

// Check if we're in a browser environment (has window)
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

// Get storage implementation based on environment
function getStorage() {
  if (isBrowser) {
    return window.localStorage;
  }
  // For SSR/static rendering, use in-memory storage
  return {
    getItem: (key) => {
      const value = memoryStorage.get(key);
      return value !== undefined ? value : null;
    },
    setItem: (key, value) => {
      memoryStorage.set(key, value);
    },
    removeItem: (key) => {
      memoryStorage.delete(key);
    },
    clear: () => {
      memoryStorage.clear();
    },
  };
}

const AsyncStorage = {
  getItem: async (key) => {
    try {
      const storage = getStorage();
      const value = storage.getItem(key);
      return value;
    } catch (error) {
      console.warn('[AsyncStorage] getItem error:', error);
      return null;
    }
  },
  
  setItem: async (key, value) => {
    try {
      const storage = getStorage();
      storage.setItem(key, value);
    } catch (error) {
      console.warn('[AsyncStorage] setItem error:', error);
    }
  },
  
  removeItem: async (key) => {
    try {
      const storage = getStorage();
      storage.removeItem(key);
    } catch (error) {
      console.warn('[AsyncStorage] removeItem error:', error);
    }
  },
  
  clear: async () => {
    try {
      const storage = getStorage();
      storage.clear();
    } catch (error) {
      console.warn('[AsyncStorage] clear error:', error);
    }
  },
  
  getAllKeys: async () => {
    try {
      const storage = getStorage();
      if (isBrowser && storage instanceof Storage) {
        return Object.keys(storage);
      }
      // For in-memory storage
      return Array.from(memoryStorage.keys());
    } catch (error) {
      console.warn('[AsyncStorage] getAllKeys error:', error);
      return [];
    }
  },
  
  multiGet: async (keys) => {
    try {
      const storage = getStorage();
      return keys.map(key => [key, storage.getItem(key)]);
    } catch (error) {
      console.warn('[AsyncStorage] multiGet error:', error);
      return keys.map(key => [key, null]);
    }
  },
  
  multiSet: async (keyValuePairs) => {
    try {
      const storage = getStorage();
      keyValuePairs.forEach(([key, value]) => {
        storage.setItem(key, value);
      });
    } catch (error) {
      console.warn('[AsyncStorage] multiSet error:', error);
    }
  },
  
  multiRemove: async (keys) => {
    try {
      const storage = getStorage();
      keys.forEach(key => storage.removeItem(key));
    } catch (error) {
      console.warn('[AsyncStorage] multiRemove error:', error);
    }
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
