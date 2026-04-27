import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import FCMService from '../utils/fcmService';
import { notifeeService } from '../utils/notifeeService';

interface FCMContextType {
  isInitialized: boolean;
  token: string | null;
  initializeFCM: () => Promise<void>;
  subscribeToTopic: (topic: string) => Promise<boolean>;
  unsubscribeFromTopic: (topic: string) => Promise<boolean>;
}

const FCMContext = createContext<FCMContextType | undefined>(undefined);

interface FCMProviderProps {
  children: ReactNode;
}

export const FCMProvider: React.FC<FCMProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [fcmService] = useState(() => FCMService.getInstance());

  const initializeFCM = async () => {
    try {
      console.log('[FCMContext] Initializing FCM and Notifee...');
      
      // Initialize Notifee first for notification channels
      await notifeeService.initialize();
      console.log('[FCMContext] Notifee initialized');
      
      // Then initialize FCM
      await fcmService.initialize();
      const currentToken = fcmService.getCurrentToken();
      setToken(currentToken);
      setIsInitialized(true);
      console.log('[FCMContext] FCM and Notifee initialized successfully');
    } catch (error) {
      console.error('[FCMContext] Failed to initialize FCM/Notifee:', error);
      setIsInitialized(false);
    }
  };

  const subscribeToTopic = async (topic: string): Promise<boolean> => {
    try {
      return await fcmService.subscribeToTopic(topic);
    } catch (error) {
      console.error('[FCMContext] Error subscribing to topic:', error);
      return false;
    }
  };

  const unsubscribeFromTopic = async (topic: string): Promise<boolean> => {
    try {
      return await fcmService.unsubscribeFromTopic(topic);
    } catch (error) {
      console.error('[FCMContext] Error unsubscribing from topic:', error);
      return false;
    }
  };

  useEffect(() => {
    // Initialize FCM when the provider mounts
    initializeFCM();

    // Cleanup on unmount
    return () => {
      fcmService.cleanup();
    };
  }, []);

  const value: FCMContextType = {
    isInitialized,
    token,
    initializeFCM,
    subscribeToTopic,
    unsubscribeFromTopic,
  };

  return (
    <FCMContext.Provider value={value}>
      {children}
    </FCMContext.Provider>
  );
};

export const useFCM = (): FCMContextType => {
  const context = useContext(FCMContext);
  if (context === undefined) {
    throw new Error('useFCM must be used within an FCMProvider');
  }
  return context;
};

export default FCMContext;
