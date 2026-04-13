import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { log, warn, error } from '../../utils/productionLogger';


// Define types for better type safety
interface CachedImage {
  uri: string;
  localUri: string;
  timestamp: number;
}

interface StoreState {
  // Data state
  data: any[];
  isLoading: boolean;
  error: string | null;
  
  // Image cache state
  imageCache: Record<string, CachedImage>;
  isImageLoading: boolean;
  
  // Actions for data
  setData: (data: any[]) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  fetchData: () => Promise<void>;
  
  // Actions for images
  cacheImage: (uri: string) => Promise<string>;
  getCachedImage: (uri: string) => string | null;
  clearImageCache: () => Promise<void>;
}

// Create the store with persistence
export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      data: [],
      isLoading: false,
      error: null,
      imageCache: {},
      isImageLoading: false,

      // Data actions
      setData: (data) => set({ data }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      // Fetch data with caching
      fetchData: async () => {
        try {
          set({ isLoading: true, error: null });
          // Replace with your actual API call
          const response = await fetch('YOUR_API_ENDPOINT');
          const data = await response.json();
          
          // Cache any images in the data
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item.imageUrl) {
                await get().cacheImage(item.imageUrl);
              }
            }
          }
          
          set({ data, isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
        }
      },

      // Image caching actions
      cacheImage: async (uri: string) => {
        try {
          set({ isImageLoading: true });
          
          // Check if image is already cached
          const cachedImage = get().imageCache[uri];
          if (cachedImage) {
            // Check if cached image is still valid (less than 7 days old)
            const isExpired = Date.now() - cachedImage.timestamp > 7 * 24 * 60 * 60 * 1000;
            if (!isExpired) {
              return cachedImage.localUri;
            }
          }

          // Create cache directory if it doesn't exist
          const cacheDir = `${FileSystem.cacheDirectory}images/`;
          await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });

          // Generate unique filename
          const filename = uri.split('/').pop() || Date.now().toString();
          const localUri = `${cacheDir}${filename}`;

          // Download and cache the image
          await FileSystem.downloadAsync(uri, localUri);

          // Update cache
          set((state) => ({
            imageCache: {
              ...state.imageCache,
              [uri]: {
                uri,
                localUri,
                timestamp: Date.now(),
              },
            },
          }));

          return localUri;
        } catch (error) {
          error('Error caching image:', error);
          return uri; // Return original URI if caching fails
        } finally {
          set({ isImageLoading: false });
        }
      },

      getCachedImage: (uri: string) => {
        const cachedImage = get().imageCache[uri];
        return cachedImage ? cachedImage.localUri : null;
      },

      clearImageCache: async () => {
        try {
          const cacheDir = `${FileSystem.cacheDirectory}images/`;
          await FileSystem.deleteAsync(cacheDir, { idempotent: true });
          set({ imageCache: {} });
        } catch (error) {
          error('Error clearing image cache:', error);
        }
      },
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        data: state.data,
        imageCache: state.imageCache,
      }),
    }
  )
); 

export default useStore;