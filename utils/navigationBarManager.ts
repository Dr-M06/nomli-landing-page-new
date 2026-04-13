import { Platform, StatusBar } from 'react-native';
import { log, warn, error } from './productionLogger';


// Import with error handling for development builds
let NavigationBar: any = null;
try {
  NavigationBar = require('expo-navigation-bar');
} catch (error) {
  log('expo-navigation-bar not available in development build');
}

export const setImmersiveMode = async () => {
  if (Platform.OS === 'android' && NavigationBar) {
    try {
      // Set navigation bar to transparent and hide it
      await NavigationBar.setBackgroundColorAsync('transparent');
      await NavigationBar.setVisibilityAsync('hidden');
      
      // Set status bar to transparent
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent', true);
      
      log('✅ Immersive mode enabled');
    } catch (error) {
      error('❌ Error setting immersive mode:', error);
    }
  } else {
    log('ℹ️ Navigation bar control not available (development build)');
  }
};

export const showNavigationBar = async () => {
  if (Platform.OS === 'android' && NavigationBar) {
    try {
      await NavigationBar.setVisibilityAsync('visible');
      log('✅ Navigation bar shown');
    } catch (error) {
      error('❌ Error showing navigation bar:', error);
    }
  }
};

export const hideNavigationBar = async () => {
  if (Platform.OS === 'android' && NavigationBar) {
    try {
      await NavigationBar.setVisibilityAsync('hidden');
      log('✅ Navigation bar hidden');
    } catch (error) {
      error('❌ Error hiding navigation bar:', error);
    }
  }
};

export const setNavigationBarTransparent = async () => {
  if (Platform.OS === 'android' && NavigationBar) {
    try {
      await NavigationBar.setBackgroundColorAsync('transparent');
      log('✅ Navigation bar set to transparent');
    } catch (error) {
      error('❌ Error setting transparent navigation bar:', error);
    }
  }
};
