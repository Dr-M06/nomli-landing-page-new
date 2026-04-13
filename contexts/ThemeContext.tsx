import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

type ThemeContextType = {
  isDarkMode: boolean;
  toggleTheme: () => void;
  setDarkMode: (value: boolean) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  isDarkMode: false,
  toggleTheme: () => {},
  setDarkMode: () => {},
});

const THEME_STORAGE_KEY = '@nomli_mingle/theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const deviceTheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(deviceTheme === 'dark');
  const [isLoading, setIsLoading] = useState(true);

  // Load theme preference from AsyncStorage on mount
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        
        if (storedTheme !== null) {
          setIsDarkMode(storedTheme === 'dark');
        } else {
          // If no stored preference, use device default
          setIsDarkMode(deviceTheme === 'dark');
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
        // Fallback to device theme
        setIsDarkMode(deviceTheme === 'dark');
      } finally {
        setIsLoading(false);
      }
    };

    loadThemePreference();
  }, [deviceTheme]);

  // Save theme preference to AsyncStorage whenever it changes
  useEffect(() => {
    if (isLoading) return;
    
    const saveThemePreference = async () => {
      try {
        await AsyncStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      }
    };

    saveThemePreference();
  }, [isDarkMode, isLoading]);

  const toggleTheme = () => {
    console.log('[ThemeContext] toggleTheme called, current isDarkMode:', isDarkMode);
    setIsDarkMode(prev => {
      const newValue = !prev;
      console.log('[ThemeContext] Setting isDarkMode to:', newValue);
      return newValue;
    });
  };

  const setDarkMode = (value: boolean) => {
    setIsDarkMode(value);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, setDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext; 