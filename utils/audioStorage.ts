import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface AudioUploadResult {
  url: string;
  path: string;
  size: number;
}

/**
 * Upload audio file to Supabase Storage
 */
export const uploadAudioToSupabase = async (
  audioUri: string,
  fileName: string,
  folder: string = 'voice-notes'
): Promise<AudioUploadResult> => {
  try {
    log('[AudioStorage] Starting upload process...');
    log('[AudioStorage] Audio URI:', audioUri);
    log('[AudioStorage] File name:', fileName);
    log('[AudioStorage] Folder:', folder);
    
    // Check network connectivity first
    log('[AudioStorage] Checking network connectivity...');
    try {
      // Check basic internet connectivity with a timeout using Promise.race
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network check timeout')), 5000)
      );
      const fetchPromise = fetch('https://www.google.com', { 
        method: 'HEAD'
      });
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      log('[AudioStorage] Internet connectivity check response:', response.status);
    } catch (networkError) {
      error('[AudioStorage] Network connectivity check failed:', networkError);
      throw new Error('No internet connection available');
    }
    
    // Check Supabase configuration
    log('[AudioStorage] Checking Supabase configuration...');
    const supabaseUrl = supabase.supabaseUrl;
    const supabaseKey = supabase.supabaseKey;
    log('[AudioStorage] Supabase URL:', supabaseUrl ? 'Present' : 'Missing');
    if (__DEV__) {
      log('[AudioStorage] Supabase Key:', supabaseKey ? 'Present' : 'Missing');
      log('[AudioStorage] Supabase URL configured:', !!supabaseUrl);
    }
    
    if (!supabaseUrl || !supabaseKey) {
      error('[AudioStorage] Supabase configuration missing');
      throw new Error('Supabase configuration is missing');
    }
    
    // Get the file extension from the URI
    const fileExtension = audioUri.split('.').pop() || 'm4a';
    const fullFileName = `${fileName}.${fileExtension}`;
    const filePath = `${folder}/${fullFileName}`;
    
    log('[AudioStorage] Full file name:', fullFileName);
    log('[AudioStorage] File path:', filePath);

    // Read the file and convert to ArrayBuffer for better compatibility
    log('[AudioStorage] Reading file...');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('File read timeout')), 10000)
    );
    const fetchPromise = fetch(audioUri);
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    log('[AudioStorage] Fetch response status:', response.status);
    log('[AudioStorage] Fetch response ok:', response.ok);
    
    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    log('[AudioStorage] ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');
    
    if (arrayBuffer.byteLength === 0) {
      throw new Error('File is empty or corrupted');
    }
    
    // Convert to Uint8Array for upload
    const uint8Array = new Uint8Array(arrayBuffer);
    log('[AudioStorage] Converted to Uint8Array, size:', uint8Array.length, 'bytes');
    
    // Safety check: ensure uint8Array is valid
    if (!uint8Array || uint8Array.length === 0) {
      throw new Error('Failed to create valid Uint8Array from file');
    }
    
    // Upload to Supabase Storage with retry logic
    log('[AudioStorage] Uploading to Supabase Storage...');
    
    let uploadResult = null;
    let uploadError = null;
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    
    // Use signed URL approach (React Native compatible, same as mediaStorage.ts)
    log('[AudioStorage] Creating signed upload URL...');
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('audio')
      .createSignedUploadUrl(filePath, {
        upsert: false
      });
    
    if (signedUrlError || !signedUrlData?.signedUrl) {
      error('[AudioStorage] Error creating signed URL:', signedUrlError);
      throw new Error(`Failed to create upload URL: ${signedUrlError?.message || 'Unknown error'}`);
    }
    
    log('[AudioStorage] ✅ Got signed upload URL');
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log(`[AudioStorage] Upload attempt ${attempt}/${maxRetries}`);
      
      try {
        // Ensure uint8Array is still valid before each attempt
        if (!uint8Array || uint8Array.length === 0) {
          throw new Error('Uint8Array is invalid or empty');
        }
        
        // Use a fresh Uint8Array copy to avoid potential reference issues
        const uploadData = new Uint8Array(uint8Array);
        
        // Upload using signed URL via fetch (avoids React Native module resolution issues)
        log(`[AudioStorage] Uploading ${uploadData.length} bytes to signed URL...`);
        const uploadResponse = await fetch(signedUrlData.signedUrl, {
          method: 'PUT',
          body: uploadData,
          headers: {
            'Content-Type': 'audio/mpeg',
          },
        });
        
        if (!uploadResponse.ok) {
          uploadError = new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
          log(`[AudioStorage] Upload attempt ${attempt} failed:`, uploadError);
          
          // If it's a network error and we have more attempts, wait and retry
          if (attempt < maxRetries && (
            uploadResponse.status === 0 || // Network error
            uploadResponse.status >= 500 // Server error
          )) {
            log(`[AudioStorage] Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        } else {
          // Success!
          uploadResult = { data: null, error: null }; // Mock result for compatibility
          log(`[AudioStorage] Upload successful on attempt ${attempt}`);
          break;
        }
      } catch (attemptError) {
        uploadError = attemptError;
        log(`[AudioStorage] Upload attempt ${attempt} exception:`, attemptError);
        
        // If it's a network error and we have more attempts, wait and retry
        if (attempt < maxRetries && (
          attemptError.message.includes('Network request failed') ||
          attemptError.message.includes('timeout') ||
          attemptError.message.includes('fetch')
        )) {
          log(`[AudioStorage] Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }
    }
    
    // Check if upload succeeded
    if (uploadError || !uploadResult) {
      error('[AudioStorage] Upload failed after all retries:', uploadError);
        
        // Provide more specific error messages
      const errorMessage = uploadError?.message || 'Unknown error';
      if (errorMessage.includes('Network request failed') || errorMessage.includes('Failed to fetch')) {
          throw new Error('Network connection failed. Please check your internet connection and try again.');
      } else if (errorMessage.includes('timeout')) {
          throw new Error('Upload timed out. Please try again.');
        } else {
        throw new Error(`Upload failed: ${errorMessage}`);
      }
    }

    // Get the public URL (construct from Supabase URL and path)
    // Reuse supabaseUrl that was declared earlier in the function
    log('[AudioStorage] Constructing public URL for file path:', filePath);
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/audio/${filePath}`;

    log('[AudioStorage] Public URL:', publicUrl);

    const result = {
      url: publicUrl,
      path: filePath,
      size: uint8Array.length
    };
    
    log('[AudioStorage] Upload successful, returning result:', result);
    log('[AudioStorage] Result URL:', result.url);
    log('[AudioStorage] Result path:', result.path);
    log('[AudioStorage] Result size:', result.size);
    return result;
  } catch (error) {
    error('Audio upload error:', error);
    throw error;
  }
};

/**
 * Delete audio file from Supabase Storage
 */
export const deleteAudioFromSupabase = async (filePath: string): Promise<boolean> => {
  try {
    const { error } = await supabase.storage
      .from('audio')
      .remove([filePath]);

    if (error) {
      error('Delete error:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('Delete error:', error);
    return false;
  }
};

/**
 * Get audio file info from Supabase Storage
 */
export const getAudioInfo = async (filePath: string) => {
  try {
    const { data, error } = await supabase.storage
      .from('audio')
      .list(folder, {
        search: filePath
      });

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    error('Get audio info error:', error);
    return null;
  }
};
