import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface AudioUploadResult {
  url: string;
  path: string;
  size: number;
}

// Alternative upload method using direct HTTP requests
export const uploadAudioToSupabaseAlternative = async (
  audioUri: string,
  fileName: string,
  folder: string = 'voice-notes'
): Promise<AudioUploadResult> => {
  try {
    log('[AudioStorageAlt] Starting alternative upload process...');
    log('[AudioStorageAlt] Audio URI:', audioUri);
    log('[AudioStorageAlt] File name:', fileName);
    log('[AudioStorageAlt] Folder:', folder);
    
    // Check basic internet connectivity
    log('[AudioStorageAlt] Checking network connectivity...');
    try {
      const response = await fetch('https://www.google.com', { 
        method: 'HEAD',
        timeout: 5000
      });
      log('[AudioStorageAlt] Internet connectivity check response:', response.status);
    } catch (networkError) {
      error('[AudioStorageAlt] Network connectivity check failed:', networkError);
      throw new Error('No internet connection available');
    }
    
    // Check Supabase configuration
    log('[AudioStorageAlt] Checking Supabase configuration...');
    const supabaseUrl = supabase.supabaseUrl;
    const supabaseKey = supabase.supabaseKey;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration is missing');
    }
    
    // Get the file extension from the URI
    const fileExtension = audioUri.split('.').pop() || 'm4a';
    const fullFileName = `${fileName}.${fileExtension}`;
    const filePath = `${folder}/${fullFileName}`;
    
    log('[AudioStorageAlt] Full file name:', fullFileName);
    log('[AudioStorageAlt] File path:', filePath);

    // Read the file using FileSystem
    log('[AudioStorageAlt] Reading file using FileSystem...');
    const base64Data = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    log('[AudioStorageAlt] File read as base64, length:', base64Data.length);
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('File is empty or could not be read');
    }
    
    // Convert base64 to binary for upload
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    log('[AudioStorageAlt] Converted to binary, size:', bytes.length, 'bytes');
    
    // Get the current session for authenticated upload
    log('[AudioStorageAlt] Getting current session...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      error('[AudioStorageAlt] No valid session found:', sessionError);
      throw new Error('User not authenticated for file upload');
    }
    
    log('[AudioStorageAlt] Valid session found for user:', session.user.id);
    
    // Direct HTTP upload to Supabase Storage
    const uploadUrl = `${supabaseUrl}/storage/v1/object/audio/${filePath}`;
    log('[AudioStorageAlt] Upload URL:', uploadUrl);
    
    const maxRetries = 3;
    const retryDelay = 2000;
    let uploadError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log(`[AudioStorageAlt] Upload attempt ${attempt}/${maxRetries}`);
      
      try {
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'audio/mpeg',
            'x-upsert': 'false',
            'cache-control': 'max-age=3600',
          },
          body: bytes,
        });
        
        log(`[AudioStorageAlt] Upload attempt ${attempt} response status:`, uploadResponse.status);
        log(`[AudioStorageAlt] Upload attempt ${attempt} response ok:`, uploadResponse.ok);
        
        if (uploadResponse.ok) {
          const responseData = await uploadResponse.json();
          log(`[AudioStorageAlt] Upload successful on attempt ${attempt}:`, responseData);
          
          // Generate public URL
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/audio/${filePath}`;
          
          const result = {
            url: publicUrl,
            path: filePath,
            size: bytes.length
          };
          
          log('[AudioStorageAlt] Upload successful, returning result:', result);
          return result;
        } else {
          const errorText = await uploadResponse.text();
          uploadError = new Error(`HTTP ${uploadResponse.status}: ${errorText}`);
          log(`[AudioStorageAlt] Upload attempt ${attempt} failed:`, uploadError.message);
          
          if (attempt < maxRetries) {
            log(`[AudioStorageAlt] Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      } catch (fetchError) {
        uploadError = fetchError;
        log(`[AudioStorageAlt] Upload attempt ${attempt} exception:`, fetchError);
        
        if (attempt < maxRetries) {
          log(`[AudioStorageAlt] Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    throw uploadError || new Error('All upload attempts failed');
    
  } catch (error) {
    error('[AudioStorageAlt] Upload error:', error);
    throw error;
  }
};
