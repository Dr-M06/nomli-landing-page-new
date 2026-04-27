/**
 * Expo Autolinking Configuration
 * Excludes expo-in-app-purchases from Android builds (iOS-only module)
 */
module.exports = {
  searchPaths: [],
  nativeModulesDir: [],
  platforms: {
    android: {
      exclude: ['expo-in-app-purchases']
    }
  }
};
