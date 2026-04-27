import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface AudioUploadResult {
  url: string;
  path: string;
  size: number;
}

// Simple upload method that creates a public bucket to bypass RLS issues
export const uploadAudioToSupabaseSimple = async (
  audioUri: string,
  fileName: string,
  folder: string = 'voice-notes'
): Promise<AudioUploadResult> => {
  try {
    log('[AudioStorageSimple] Starting simple upload process...');
    log('[AudioStorageSimple] Audio URI:', audioUri);
    log('[AudioStorageSimple] File name:', fileName);
    log('[AudioStorageSimple] Folder:', folder);
    
    // Check basic internet connectivity
    log('[AudioStorageSimple] Checking network connectivity...');
    try {
      const response = await fetch('https://www.google.com', { 
        method: 'HEAD',
        timeout: 5000
      });
      log('[AudioStorageSimple] Internet connectivity check response:', response.status);
    } catch (networkError) {
      error('[AudioStorageSimple] Network connectivity check failed:', networkError);
      throw new Error('No internet connection available');
    }
    
    // Check Supabase configuration
    log('[AudioStorageSimple] Checking Supabase configuration...');
    const supabaseUrl = supabase.supabaseUrl;
    const supabaseKey = supabase.supabaseKey;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration is missing');
    }
    
    // Get the file extension from the URI
    const fileExtension = audioUri.split('.').pop() || 'm4a';
    const fullFileName = `${fileName}.${fileExtension}`;
    const filePath = `${folder}/${fullFileName}`;
    
    log('[AudioStorageSimple] Full file name:', fullFileName);
    log('[AudioStorageSimple] File path:', filePath);

    // Read the file and convert to ArrayBuffer for better compatibility
    log('[AudioStorageSimple] Reading file...');
    const response = await fetch(audioUri, {
      timeout: 10000 // 10 second timeout
    });
    log('[AudioStorageSimple] Fetch response status:', response.status);
    log('[AudioStorageSimple] Fetch response ok:', response.ok);
    
    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    log('[AudioStorageSimple] ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');
    
    if (arrayBuffer.byteLength === 0) {
      throw new Error('File is empty or corrupted');
    }
    
    // Convert to Uint8Array for upload
    const uint8Array = new Uint8Array(arrayBuffer);
    log('[AudioStorageSimple] Converted to Uint8Array, size:', uint8Array.length, 'bytes');
    
    // First, ensure we have a public audio bucket
    log('[AudioStorageSimple] Checking for audio bucket...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      error('[AudioStorageSimple] Error listing buckets:', bucketsError);
      throw new Error(`Failed to list buckets: ${bucketsError.message}`);
    }
    
    const audioBucket = buckets.find(bucket => bucket.name === 'audio');
    
    if (!audioBucket) {
      log('[AudioStorageSimple] Audio bucket not found, creating public bucket...');
      const { data: bucketData, error: bucketError } = await supabase.storage.createBucket('audio', {
        public: true, // Make it public to bypass RLS
        allowedMimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/aac'],
        fileSizeLimit: 50 * 1024 * 1024 // 50MB limit
      });
      
      if (bucketError) {
        error('[AudioStorageSimple] Failed to create audio bucket:', bucketError);
        throw new Error(`Failed to create audio bucket: ${bucketError.message}`);
      }
      
      log('[AudioStorageSimple] Public audio bucket created successfully:', bucketData);
    } else {
      log('[AudioStorageSimple] Audio bucket exists:', audioBucket);
    }
    
    // Upload to Supabase Storage with retry logic
    log('[AudioStorageSimple] Uploading to Supabase Storage...');
    
    const maxRetries = 3;
    const retryDelay = 2000;
    let uploadError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log(`[AudioStorageSimple] Upload attempt ${attempt}/${maxRetries}`);
      
      try {
        const { data, error } = await supabase.storage
          .from('audio')
          .upload(filePath, uint8Array, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'audio/mpeg'
          });
        
        log(`[AudioStorageSimple] Upload attempt ${attempt} result:`, { data, error });
        
        if (error) {
          uploadError = error;
          log(`[AudioStorageSimple] Upload attempt ${attempt} failed:`, error);
          
          if (attempt < maxRetries) {
            log(`[AudioStorageSimple] Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        } else {
          // Success!
          log(`[AudioStorageSimple] Upload successful on attempt ${attempt}`);
          
          // Get the public URL
          log('[AudioStorageSimple] Getting public URL for file path:', filePath);
          const { data: urlData } = supabase.storage
            .from('audio')
            .getPublicUrl(filePath);

          log('[AudioStorageSimple] URL data:', urlData);

          if (!urlData.publicUrl) {
            error('[AudioStorageSimple] Failed to get public URL, urlData:', urlData);
            throw new Error('Failed to get public URL');
          }

          const result = {
            url: urlData.publicUrl,
            path: filePath,
            size: uint8Array.length
          };
          
          log('[AudioStorageSimple] Upload successful, returning result:', result);
          return result;
        }
      } catch (attemptError) {
        uploadError = attemptError;
        log(`[AudioStorageSimple] Upload attempt ${attempt} exception:`, attemptError);
        
        if (attempt < maxRetries) {
          log(`[AudioStorageSimple] Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    throw uploadError || new Error('All upload attempts failed');
    
  } catch (error) {
    error('[AudioStorageSimple] Upload error:', error);
    throw error;
  }
};
