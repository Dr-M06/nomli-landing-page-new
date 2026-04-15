import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';
import { log, warn, error } from '../utils/productionLogger';


export default function Index() {
  const router = useRouter();

  // On native, check onboarding status and redirect accordingly
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        const status = await AsyncStorage.getItem('hasCompletedOnboarding');
        setHasCompletedOnboarding(status === 'true');
      } catch (error) {
        error('Error checking onboarding status:', error);
        setHasCompletedOnboarding(false);
      }
    };
    
    checkOnboardingStatus();
  }, []);
  
  if (hasCompletedOnboarding === null) {
    // Still loading
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }
  
  // Current logic: open app → home (guests can browse). Create-account path uses old logic: signup-success → signin → app.
  const redirectHref = hasCompletedOnboarding ? "/(tabs)/community" : "/onboarding";
  return <Redirect href={redirectHref} />;
} 