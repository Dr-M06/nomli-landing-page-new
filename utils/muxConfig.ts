// Mux video upload / playback configuration (client + edge function integration).

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { log, warn, error as logError } from './productionLogger';


export interface MuxConfig {
  accessTokenId: string;
  accessTokenSecret: string;
  webhookSecret?: string;
}

export interface VideoUploadResult {
  id?: string;
  playbackId?: string;
  secure_url: string;  // Changed from secureUrl for consistency with component expectations
  thumbnail: string;   // Changed from thumbnailUrl for consistency with component expectations
  duration: number;
  status?: 'preparing' | 'ready' | 'errored';
  createdAt?: string;
  // Optional trimming metadata
  startTime?: number;
  endTime?: number;
  isEdited?: boolean;
  muxId?: string;
  // Debug metadata
  originalDuration?: number;
  trimmedDuration?: number;
}



const MUX_VIDEO_BASE = 'https://stream.mux.com';
export const MAX_VIDEO_UPLOAD_SIZE_MB = 300;
const MAX_VIDEO_UPLOAD_SIZE_BYTES = MAX_VIDEO_UPLOAD_SIZE_MB * 1024 * 1024;

/** Content-Type for upload: raw device videos are often .mov/HEVC; Mux accepts MOV and HEVC when sent with correct type */
function getVideoContentType(uri: string): string {
  const lower = (uri || '').toLowerCase();
  if (lower.includes('.mov') || lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.includes('.mp4') || lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.includes('.m4v') || lower.endsWith('.m4v')) return 'video/x-m4v';
  // Unknown (e.g. asset from picker with no extension): let Mux detect
  return 'application/octet-stream';
}

// Helper function to convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix to get just the base64 string
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Helper function for chunked uploads
const uploadInChunks = async (url: string, blob: Blob, signal: AbortSignal): Promise<Response> => {
  const chunkSize = 5 * 1024 * 1024; // 5MB chunks
  const totalChunks = Math.ceil(blob.size / chunkSize);
  
  log(`📦 [Mux] Uploading ${totalChunks} chunks of ${chunkSize / (1024 * 1024)}MB each...`);
  
  // For Mux, we'll use a simple approach: upload the entire blob but with better error handling
  // In a real implementation, you'd use multipart upload or similar
  try {
    const response = await fetch(url, {
      method: 'PUT',
      body: blob,
      signal,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': blob.size.toString(),
      },
    });
    
    log(`✅ [Mux] Chunked upload completed: ${response.status}`);
    return response;
  } catch (e) {
    logError('❌ [Mux] Chunked upload failed:', e);
    throw e;
  }
};

// Optional public fields only (Mux signing secrets live in Supabase Edge Function `mux-upload`, not in the app).
export const getMuxConfig = (): MuxConfig => {
  const Constants = require('expo-constants');

  const accessTokenId =
    Constants.expoConfig?.extra?.MUX_ACCESS_TOKEN_ID ||
    Constants.manifest?.extra?.MUX_ACCESS_TOKEN_ID ||
    process.env.EXPO_PUBLIC_MUX_ACCESS_TOKEN_ID ||
    '';

  const webhookSecret =
    Constants.expoConfig?.extra?.MUX_WEBHOOK_SECRET ||
    Constants.manifest?.extra?.MUX_WEBHOOK_SECRET ||
    process.env.EXPO_PUBLIC_MUX_WEBHOOK_SECRET ||
    '';

  return {
    accessTokenId,
    accessTokenSecret: '',
    webhookSecret,
  };
};

/** PUT video bytes to Mux's signed direct-upload URL (URL is issued by the mux-upload Edge Function). */
async function putVideoFileToMuxUrl(
  directUploadUrl: string,
  videoUri: string,
  onByteFraction?: (fraction: number) => void
): Promise<void> {
  const isLocalFile =
    videoUri.startsWith('file://') ||
    videoUri.startsWith('content://') ||
    (!videoUri.startsWith('http://') && !videoUri.startsWith('https://'));

  if (isLocalFile && Platform.OS !== 'web') {
    log('📁 Uploading local file (streaming upload)...');
    const fileInfo = await FileSystem.getInfoAsync(videoUri);
    if (!fileInfo.exists) {
      throw new Error('Video file does not exist');
    }
    const fileSizeMB = fileInfo.size ? fileInfo.size / (1024 * 1024) : 0;
    const knownSize = fileInfo.size && fileInfo.size > 0 ? fileInfo.size : 0;
    log('📦 Video file size:', fileSizeMB.toFixed(2), 'MB');
    if (fileInfo.size && fileInfo.size > MAX_VIDEO_UPLOAD_SIZE_BYTES) {
      throw new Error(
        `Video file is too large (${fileSizeMB.toFixed(2)}MB). Please select a video smaller than ${MAX_VIDEO_UPLOAD_SIZE_MB}MB.`
      );
    }
    const contentType = getVideoContentType(videoUri);
    log('📤 Upload Content-Type:', contentType, '(raw device files are often .mov/HEVC)');
    const uploadOptions: FileSystem.FileSystemUploadOptions = {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Content-Type': contentType,
      },
    };

    const reportProgress = (sent: number, expected: number) => {
      if (!onByteFraction) return;
      if (expected > 0) {
        onByteFraction(Math.min(1, sent / expected));
      } else if (knownSize > 0) {
        onByteFraction(Math.min(1, sent / knownSize));
      }
    };

    try {
      const task = FileSystem.createUploadTask(directUploadUrl, videoUri, uploadOptions, (p) => {
        reportProgress(p.totalBytesSent, p.totalBytesExpectedToSend);
      });
      const uploadResult = await task.uploadAsync();
      if (!uploadResult) {
        throw new Error('Mux upload was cancelled');
      }
      if (uploadResult.status !== 200) {
        throw new Error(`Mux upload failed with status: ${uploadResult.status}`);
      }
      onByteFraction?.(1);
      log('✅ Video uploaded to Mux successfully (upload task)');
      return;
    } catch (taskErr: any) {
      const msg = String(taskErr?.message || '');
      if (msg.includes('uploadTaskStartAsync') || msg.includes('Unavailability') || msg.includes('unavailable')) {
        warn('⚠️ [Mux] Resumable upload task unavailable, falling back to uploadAsync');
      } else {
        throw taskErr;
      }
    }

    const uploadResult = await FileSystem.uploadAsync(directUploadUrl, videoUri, uploadOptions);
    if (uploadResult.status !== 200) {
      throw new Error(`Mux upload failed with status: ${uploadResult.status}`);
    }
    onByteFraction?.(1);
    log('✅ Video uploaded to Mux successfully via uploadAsync');
    return;
  }

  log('🌐 Uploading file using fetch...');
  let uploadBody: Blob | Uint8Array;
  if (Platform.OS === 'web') {
    const response = await fetch(videoUri);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
    }
    uploadBody = await response.blob();
  } else {
    const base64 = await FileSystem.readAsStringAsync(videoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    uploadBody = bytes;
  }
  const contentType = getVideoContentType(videoUri);
  log('📤 Upload Content-Type:', contentType);
  const uploadResponse = await fetch(directUploadUrl, {
    method: 'PUT',
    body: uploadBody,
    headers: {
      'Content-Type': contentType,
    },
  });
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Mux upload failed: ${uploadResponse.status} - ${errorText}`);
  }
  onByteFraction?.(1);
  log('✅ Video uploaded to Mux successfully');
}

// Mux API (read/delete) requires secrets; use Edge Functions or backend — not available from the client bundle.
export const getVideoAsset = async (_assetId: string): Promise<VideoUploadResult | null> => {
  warn('[Mux] getVideoAsset is not supported from the app; Mux credentials are server-side only.');
  return null;
};

export const deleteVideoAsset = async (_assetId: string): Promise<boolean> => {
  warn('[Mux] deleteVideoAsset is not supported from the app; use a backend with Mux secrets.');
  return false;
};

// Upload video to Mux: Edge Function creates the signed URL and reports status; secrets stay on Supabase.
export const uploadVideoToMux = async (
  videoUri: string,
  options?: {
    title?: string;
    description?: string;
    maxDuration?: number;
    watermark?: {
      username: string;
      displayName: string;
      appName: string;
    };
    /** 0–100 upload pipeline progress (bytes + Mux readiness). */
    onProgress?: (percent: number) => void;
  }
): Promise<VideoUploadResult> => {
  try {
    return await uploadVideoToMuxViaEdgeFunction(videoUri, options);
  } catch (edgeFunctionError: any) {
    // Provide helpful error messages based on error type
    if (edgeFunctionError.message?.includes('503') || edgeFunctionError.message?.includes('Service Unavailable')) {
      throw new Error(
        'Video upload service is temporarily unavailable. ' +
        'The Edge Function may need to be deployed or restarted. ' +
        'Please try again later or contact support.'
      );
    }
    
    if (edgeFunctionError.message?.includes('Mux credentials') || edgeFunctionError.message?.includes('500')) {
      throw new Error(
        'Video upload failed: Server configuration error. ' +
        'Mux credentials need to be configured in the Edge Function secrets. ' +
        'Please check Edge Function secrets in Supabase Dashboard: ' +
        'Settings > Edge Functions > mux-upload > Secrets'
      );
    }
    
    if (edgeFunctionError.message?.includes('401') || edgeFunctionError.message?.includes('not authenticated')) {
      throw new Error('Please sign in to upload videos.');
    }
    
    if (edgeFunctionError.message?.includes('timed out') || edgeFunctionError.message?.includes('timeout')) {
      throw new Error('Upload request timed out. Please check your internet connection and try again.');
    }
    
    if (edgeFunctionError.message?.includes('Failed to connect') || edgeFunctionError.message?.includes('NetworkError')) {
      throw new Error('Unable to connect to upload service. Please check your internet connection.');
    }
    
    // For other errors, throw with original message
    throw edgeFunctionError;
  }
};

// Upload via Edge Function (Mux token ID/secret only in function secrets)
async function uploadVideoToMuxViaEdgeFunction(
  videoUri: string,
  options?: {
    title?: string;
    description?: string;
    maxDuration?: number;
    watermark?: {
      username: string;
      displayName: string;
      appName: string;
    };
    onProgress?: (percent: number) => void;
  }
): Promise<VideoUploadResult> {
  const onProgress = options?.onProgress;
  try {
    log('🎬 Starting secure video upload to Mux...');
    onProgress?.(8);
    
    // Import supabase client for authentication
    const { supabase } = await import('./supabase');
    
    // Get current user session for authentication with timeout and fallback
    let session;
    try {
      // Add timeout to prevent hanging
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session request timed out')), 10000)
      );
      
      const { data, error: sessionError } = await Promise.race([
        sessionPromise,
        timeoutPromise
      ]) as any;
      
      if (sessionError) {
        throw sessionError;
      }
      
      session = data?.session;
    } catch (sessionTimeoutError: any) {
      // If session request times out, try to get from stored session
      warn('⚠️ [Mux] Session request timed out, trying stored session...');
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const sessionStr = await AsyncStorage.getItem('supabase.auth.session');
        if (sessionStr) {
          const sessionData = JSON.parse(sessionStr);
          session = sessionData?.session;
          if (session?.access_token) {
            log('✅ [Mux] Using stored session');
          }
        }
      } catch (storageError) {
        logError('❌ [Mux] Could not get stored session:', storageError);
      }
    }
    
    if (!session || !session.access_token) {
      throw new Error('User not authenticated. Please sign in to upload videos.');
    }

    onProgress?.(12);
    
    // Step 1: Get direct upload URL from Edge Function (keeps Mux credentials secure)
    log('🔐 Requesting direct upload URL from Edge Function...');
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('Supabase URL not configured. Please check your environment variables.');
    }
    
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/mux-upload`;
    log('🔗 Edge Function URL:', edgeFunctionUrl.replace(/\/\/.*@/, '//***@')); // Hide credentials in logs
    
    // Skip health check for faster upload - go straight to upload request
    // Health check adds ~100-200ms delay and isn't critical for the upload flow
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    let uploadUrlResponse: Response;
    try {
      uploadUrlResponse = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({
          videoUri, // Pass URI, Edge Function will create upload URL
          title: options?.title,
          description: options?.description,
          maxDuration: options?.maxDuration || 120,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Request to upload service timed out. Please check your internet connection and try again.');
      }
      if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('NetworkError')) {
        throw new Error(
          'Unable to connect to upload service. ' +
          'This usually means the Edge Function is not deployed or the Supabase URL is incorrect. ' +
          'Please check your Supabase configuration and ensure the mux-upload function is deployed.'
        );
      }
      throw new Error(`Failed to connect to upload service: ${fetchError.message}`);
    }
    
    // Parse response body once (can only read response body once)
    let uploadUrlData: any;
    try {
      uploadUrlData = await uploadUrlResponse.json();
    } catch (parseError) {
      // If JSON parsing fails, try to get text
      const errorText = await uploadUrlResponse.text().catch(() => 'Unknown error');
      throw new Error(`Failed to parse server response: ${errorText}`);
    }
    
    if (!uploadUrlResponse.ok) {
      // Handle error responses with detailed messages
      const status = uploadUrlResponse.status;
      const errorMsg = uploadUrlData?.error || uploadUrlData?.details || 'Unknown error';
      
      if (status === 401) {
        throw new Error(
          'Authentication failed (401). ' +
          'Please sign in again and try uploading the video.'
        );
      } else if (status === 404) {
        throw new Error(
          'Edge Function not found (404). ' +
          'The mux-upload function is not deployed. ' +
          'Please deploy it: Project Settings > Edge Functions > Deploy mux-upload'
        );
      } else if (status === 503) {
        throw new Error(
          'Video upload service is unavailable (503). ' +
          'Possible causes:\n' +
          '1. Edge Function is not deployed - Deploy it in Supabase Dashboard\n' +
          '2. Edge Function is starting up - Wait a moment and try again\n' +
          '3. Edge Function has crashed - Check Edge Function logs in Supabase Dashboard\n\n' +
          'To deploy: Project Settings > Edge Functions > Deploy mux-upload'
        );
      } else if (status === 500) {
        if (errorMsg.includes('Mux credentials') || errorMsg.includes('credentials') || errorMsg.includes('MUX_ACCESS_TOKEN')) {
          throw new Error(
            'Server configuration error: Mux credentials not set in Edge Function. ' +
            'Please add MUX_ACCESS_TOKEN_ID and MUX_ACCESS_TOKEN_SECRET to Edge Function secrets: ' +
            'Project Settings > Edge Functions > mux-upload > Secrets'
          );
        }
        throw new Error(`Server error (500): ${errorMsg}`);
      }
      
      throw new Error(`Upload request failed (${status}): ${errorMsg}`);
    }
    
    if (!uploadUrlData.success || !uploadUrlData.uploadUrl) {
      throw new Error(uploadUrlData.error || 'Failed to get direct upload URL from server');
    }
    
    const directUploadUrl = uploadUrlData.uploadUrl;
    const uploadId = uploadUrlData.uploadId;
    
    log('✅ Direct upload URL received from Edge Function');
    log('📤 Uploading video directly to Mux...');
    onProgress?.(15);

    let lastByteFrac = -1;
    let lastByteReportAt = 0;
    await putVideoFileToMuxUrl(directUploadUrl, videoUri, (fraction) => {
      const f = Math.min(1, Math.max(0, fraction));
      const t = Date.now();
      // Coalesce native progress events so we do not spam the JS bridge.
      if (t - lastByteReportAt < 90 && Math.abs(f - lastByteFrac) < 0.025 && f < 0.998) {
        return;
      }
      lastByteFrac = f;
      lastByteReportAt = t;
      // Reserve 15–80% for raw byte upload so the bar tracks real network progress (not a fake cap at 88%).
      onProgress?.(15 + Math.round(f * 65));
    });
    
    // Step 3: Poll for asset creation — short initial pause so Mux usually has upload ingested
    log('⏳ Waiting for Mux to process video...');
    onProgress?.(80);
    await new Promise(resolve => setTimeout(resolve, 280));
    
    // Poll until Mux exposes a playback id (asset can exist before playback_ids are populated).
    let assetId: string | null = null;
    let playbackId: string | null = null;
    let secureUrl: string | null = null;
    let thumbnailUrl: string | null = null;
    let duration: number = 0;
    const maxRetries = 80;
    let retries = maxRetries;
    
    while (retries > 0) {
      const pollPhase = 80 + Math.round((1 - retries / maxRetries) * 17);
      onProgress?.(Math.min(97, pollPhase));

      try {
        // Call Edge Function to check upload status (it will query Mux server-side)
        const statusResponse = await fetch(`${supabaseUrl}/functions/v1/mux-upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            uploadId,
            action: 'checkStatus',
          }),
        });
        
        // Parse response body once (can only read response body once)
        let statusData: any;
        try {
          statusData = await statusResponse.json();
        } catch {
          warn('⚠️ Failed to parse status response, retrying...');
          await new Promise(resolve => setTimeout(resolve, 480));
          retries--;
          continue;
        }
        
        if (statusResponse.ok) {
          const ready =
            statusData.success === true &&
            statusData.playbackId &&
            (statusData.id || statusData.assetId);
          if (ready) {
            assetId = statusData.id || statusData.assetId;
            playbackId = statusData.playbackId;
            secureUrl = statusData.secure_url || statusData.secureUrl;
            thumbnailUrl = statusData.thumbnail || statusData.thumbnailUrl;
            duration = statusData.duration || 0;
            log('✅ Asset ready:', { assetId, playbackId, duration });
            break;
          }
          if (statusData.status === 'errored' || statusData.error) {
            throw new Error(statusData.error || 'Mux upload failed during processing');
          }
        } else {
          warn('⚠️ Status check returned error:', statusResponse.status, statusData.error || statusData.details);
        }
      } catch (statusError: any) {
        if (statusError.message?.includes('failed during processing')) {
          throw statusError;
        }
        warn('⚠️ Error checking upload status, retrying...', statusError.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 480));
      retries--;
    }
    
    if (!assetId || !playbackId) {
      throw new Error(
        'Upload finished but the video is still processing on our provider. Please wait a minute and try posting again, or retry the upload.'
      );
    }

    onProgress?.(98);
    
    log('✅ Video upload complete!');
    
    // Return result in expected format
    return {
      id: assetId,
      muxId: assetId,
      playbackId,
      secure_url: secureUrl || `https://stream.mux.com/${playbackId}.m3u8`,
      thumbnail: thumbnailUrl || `https://image.mux.com/${playbackId}/thumbnail.jpg`,
      duration,
      status: 'ready',
    };
    
  } catch (err: any) {
    logError('❌ Video upload failed:', err);
    throw err;
  }
}

// Generate thumbnail URL for any time in the video
export const generateThumbnailUrl = (playbackId: string, timeInSeconds: number = 0): string => {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${timeInSeconds}`;
};

// Generate MP4 download URL
export const generateMp4Url = (playbackId: string): string => {
  return `${MUX_VIDEO_BASE}/${playbackId}/high.mp4`;
};

// Client cannot call Mux API directly; verify `mux-upload` via Supabase Dashboard or GET .../mux-upload?health=check
export const testMuxConnection = async (): Promise<boolean> => {
  warn('[Mux] testMuxConnection skipped — Mux secrets are on the Edge Function, not in the app.');
  return false;
};

export const getMuxUsage = async (): Promise<any> => {
  warn('[Mux] getMuxUsage is not available from the client.');
  return null;
};
