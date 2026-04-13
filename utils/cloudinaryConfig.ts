// Cloudinary Configuration for Video Uploads
// Cloudinary provides reliable video hosting and processing

import Constants from 'expo-constants';
import { log, warn, error } from './productionLogger';


export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  uploadPreset: string;
}

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  thumbnail: string;
  duration: number;
  resource_type: string;
  format: string;
}

// Get Cloudinary configuration from environment variables
export const getCloudinaryConfig = (): CloudinaryConfig => {
  const config: CloudinaryConfig = {
    cloudName: process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 
               Constants?.expoConfig?.extra?.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY || 
           Constants?.expoConfig?.extra?.CLOUDINARY_API_KEY || '',
    uploadPreset: process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 
                 Constants?.expoConfig?.extra?.CLOUDINARY_UPLOAD_PRESET || '',
  };

  // Validate configuration
  if (!config.cloudName || !config.uploadPreset) {
    warn('⚠️ Cloudinary configuration incomplete. Please set environment variables:');
    warn('   EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME');
    warn('   EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET');
  }

  return config;
};

// Upload video to Cloudinary
export const uploadVideoToCloudinary = async (
  videoUri: string,
  options?: {
    quality?: string;
    maxDuration?: number;
    folder?: string;
  }
): Promise<CloudinaryUploadResult> => {
  try {
    log('🎬 Starting video upload to Cloudinary...');
    
    // Check if we have valid Cloudinary credentials
    const config = getCloudinaryConfig();
    if (!config.cloudName || !config.uploadPreset) {
      throw new Error('Cloudinary credentials not configured. Please set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET');
    }

    // Create form data for upload
    const formData = new FormData();
    
    // Add the video file
    formData.append('file', {
      uri: videoUri,
      type: 'video/mp4',
      name: `video_${Date.now()}.mp4`,
    } as any);
    
    // Add upload parameters
    formData.append('upload_preset', config.uploadPreset);
    formData.append('resource_type', 'video');
    
    // Optional parameters
    if (options?.quality) {
      formData.append('quality', options.quality);
    }
    
    if (options?.maxDuration) {
      formData.append('duration', options.maxDuration.toString());
    }
    
    if (options?.folder) {
      formData.append('folder', options.folder);
    }

    // Upload to Cloudinary
    const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/video/upload`;
    
    log('📤 Uploading to Cloudinary...');
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudinary upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    log('✅ Video uploaded to Cloudinary successfully!');
    log('📺 Secure URL:', result.secure_url);
    
    // Generate thumbnail URL (Cloudinary auto-generates thumbnails)
    const thumbnailUrl = result.secure_url.replace(/\.(mp4|mov|avi)$/, '.jpg');
    
    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
      thumbnail: thumbnailUrl,
      duration: result.duration || 0,
      resource_type: result.resource_type,
      format: result.format,
    };
  } catch (error) {
    error('❌ Cloudinary video upload error:', error);
    throw error;
  }
};

// Delete video from Cloudinary (optional cleanup)
export const deleteVideoFromCloudinary = async (publicId: string): Promise<boolean> => {
  try {
    const config = getCloudinaryConfig();
    if (!config.cloudName || !config.apiKey) {
      warn('Cannot delete from Cloudinary: missing credentials');
      return false;
    }

    // Note: Deletion requires API key and secret, which should be done server-side
    // This is a placeholder for future server-side implementation
    log('🗑️ Video deletion should be handled server-side for security');
    return true;
  } catch (error) {
    error('❌ Error deleting video from Cloudinary:', error);
    return false;
  }
};
