import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

declare global {
  interface Window {
    frameworkReady?: () => void;
  }
}

export function useFrameworkReady() {
  const [ready, setReady] = useState(false);
  
  useEffect(() => {
    // Only call framework ready function on web platform
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.frameworkReady?.();
    }
    
    // Mark as ready immediately for native platforms
    // or after a small delay for web to ensure framework initialization
    const timer = setTimeout(() => {
      setReady(true);
    }, Platform.OS === 'web' ? 300 : 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  return { ready };
}