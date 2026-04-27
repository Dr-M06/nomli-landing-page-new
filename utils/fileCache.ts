import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';


/**
 * Utility to help with file caching and sharing for images
 */

/**
 * Converts a local file path to a proper file:// URL for sharing
 * @param filePath The local file path
 * @returns A properly formatted file:// URL
 */
export const getFileUrlForSharing = async (filePath: string): Promise<string | null> => {
  if (!filePath) return null;
  
  try {
    // Handle file:// URLs
    if (filePath.startsWith('file://')) {
      return filePath;
    }
    
    // Handle http(s) URLs
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    // Handle data URLs
    if (filePath.startsWith('data:')) {
      // For data URLs, we need to save them to the file system first
      const fileName = `shared-image-${Date.now()}.jpg`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      
      // Save the data URL to a file
      await FileSystem.writeAsStringAsync(fileUri, filePath.split(',')[1], {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      return fileUri;
    }
    
    // Handle local paths by ensuring they have file:// prefix
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists) {
      // On Android, we need to ensure the file:// prefix
      if (Platform.OS === 'android' && !filePath.startsWith('file://')) {
        return `file://${filePath}`;
      }
      
      return filePath;
    }
    
    log('File does not exist:', filePath);
    return null;
  } catch (error) {
    error('Error preparing file for sharing:', error);
    return null;
  }
};

/**
 * Downloads a remote image to local cache for sharing
 * This is useful for platforms that don't support remote URLs for sharing
 */
export const downloadImageForSharing = async (imageUrl: string): Promise<string | null> => {
  if (!imageUrl || (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://'))) {
    return null;
  }
  
  try {
    const fileName = `shared-image-${Date.now()}.jpg`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    
    const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);
    
    if (downloadResult.status === 200) {
      return fileUri;
    } else {
      log('Failed to download image, status:', downloadResult.status);
      return null;
    }
  } catch (error) {
    error('Error downloading image for sharing:', error);
    return null;
  }
}; 