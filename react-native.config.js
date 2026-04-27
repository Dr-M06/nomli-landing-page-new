/**
 * React Native / Expo autolinking config.
 * Exclude packages from Android that would break the build or are iOS-only.
 * - expo-in-app-purchases: iOS-only module
 */
module.exports = {
  dependencies: {
    'expo-in-app-purchases': { platforms: { android: null } },
  },
};
