import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import CustomSplashScreen from './CustomSplashScreen';

interface SplashScreenManagerProps {
  children: React.ReactNode;
  isAppReady: boolean;
}

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function SplashScreenManager({ children, isAppReady }: SplashScreenManagerProps) {
  const [showCustomSplash, setShowCustomSplash] = useState(true);

  useEffect(() => {
    if (isAppReady) {
      // Hide the native splash screen
      SplashScreen.hideAsync();
      
      // Show custom splash briefly (reduced for faster startup)
      const timer = setTimeout(() => {
        setShowCustomSplash(false);
      }, 800); // 0.8 seconds of custom splash (reduced from 2s)

      return () => clearTimeout(timer);
    }
  }, [isAppReady]);

  if (!isAppReady || showCustomSplash) {
    return (
      <View style={styles.container}>
        <CustomSplashScreen onAnimationFinish={() => {
          // Animation finished, but we still wait for the timer
        }} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
