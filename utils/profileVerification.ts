import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { Alert, Platform } from 'react-native';
import { Camera } from 'expo-camera';
import * as FaceDetector from 'expo-face-detector';
import { uploadToBunnyNet, isBunnyNetEnabled } from './bunnyNetStorage';
import { log, warn, error } from './productionLogger';


// Types for verification
export interface VerificationResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface VerificationSession {
  id: string;
  userId: string;
  originalPhotoUrl: string;
  verificationPhotoUrl?: string;
  status: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

/**
 * Basic image validation without face detection
 * @param imageUri URI of the image to analyze
 * @returns Promise with validation results
 */
export const validateImage = async (imageUri: string): Promise<VerificationResult> => {
  try {
    log('[ProfileVerification] Validating image...');
    
    // Resize image for better handling
    const resizedImage = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 800 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    
    // In a real implementation, you could add basic checks here:
    // - Image size validation
    // - Image format validation
    // - Image content analysis using a different library
    
    log('[ProfileVerification] Image validation complete');
    
    return {
      success: true,
      message: 'Image validated successfully',
      data: {
        width: resizedImage.width,
        height: resizedImage.height
      }
    };
  } catch (error) {
    error('[ProfileVerification] Image validation error:', error);
    return {
      success: false,
      message: 'Error validating image. Please try again.',
    };
  }
};

/**
 * Start a verification session
 * @param userId User ID
 * @param profilePhotoUrl URL of the profile photo to verify
 */
export const startVerificationSession = async (
  userId: string,
  profilePhotoUrl: string
): Promise<VerificationSession | null> => {
  try {
    log('[ProfileVerification] Starting verification session...');
    
    const { data, error } = await supabase
      .from('profile_verifications')
      .insert({
        user_id: userId,
        original_photo_url: profilePhotoUrl,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) {
      error('[ProfileVerification] Error creating verification session:', error);
      return null;
    }
    
    return {
      id: data.id,
      userId: data.user_id,
      originalPhotoUrl: data.original_photo_url,
      verificationPhotoUrl: data.verification_photo_url,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    error('[ProfileVerification] Error starting verification session:', error);
    return null;
  }
};

/**
 * Upload verification selfie
 * @param sessionId Verification session ID
 * @param selfieUri URI of the verification selfie
 */
export const uploadVerificationSelfie = async (
  sessionId: string,
  selfieUri: string
): Promise<VerificationResult> => {
  try {
    log('[ProfileVerification] Uploading verification selfie...');
    
    // Basic image validation
    const validationResult = await validateImage(selfieUri);
    if (!validationResult.success) {
      return validationResult;
    }
    
    // Convert image to base64
    const base64 = await FileSystem.readAsStringAsync(selfieUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    if (!base64) {
      return {
        success: false,
        message: 'Failed to convert image to base64',
      };
    }
    
    // Create a blob from base64
    const byteCharacters = atob(base64);
    const byteNumbers = new Array((byteCharacters?.length || 0));
    for (let i = 0; i < (byteCharacters?.length || 0); i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    
    const fileName = `verification_${sessionId}_${Date.now()}.jpg`;
    
    // Try Bunny.net first (if enabled) - Best performance for Africa
    try {
      if (isBunnyNetEnabled()) {
        log('[ProfileVerification] Attempting Bunny.net upload (Africa-optimized)...');
        
        // Convert blob to file URI for Bunny.net (requires file URI, not blob)
        // For verification, we'll use Supabase since it's a one-time upload
        // But we can still try Bunny.net if we have the file URI
        // Note: This requires the selfieUri to be passed, which we have
        const bunnyUrl = await uploadToBunnyNet(selfieUri, fileName, 'verifications');
        
        if (bunnyUrl) {
          log('[ProfileVerification] ✅ Bunny.net upload successful! CDN URL:', bunnyUrl);
          
          // Update verification session with Bunny.net URL
          const { error: updateError } = await supabase
            .from('profile_verifications')
            .update({
              verification_photo_url: bunnyUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId);
          
          if (updateError) {
            error('[ProfileVerification] Error updating verification session:', updateError);
            // Continue to Supabase fallback
          } else {
            return {
              success: true,
              message: 'Verification selfie uploaded successfully',
              data: {
                verificationPhotoUrl: bunnyUrl
              }
            };
          }
        } else {
          log('[ProfileVerification] ⚠️ Bunny.net upload failed, falling back to Supabase...');
        }
      }
    } catch (bunnyError: any) {
      warn('[ProfileVerification] ⚠️ Bunny.net upload error (non-critical), falling back to Supabase:', bunnyError?.message || bunnyError);
    }
    
    // Fallback to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('verifications')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true
      });
    
    if (uploadError) {
      error('[ProfileVerification] Upload error:', uploadError);
      return {
        success: false,
        message: `Upload failed: ${uploadError.message}`,
      };
    }
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('verifications')
      .getPublicUrl(fileName);
    
    if (!urlData?.publicUrl) {
      return {
        success: false,
        message: 'Failed to get public URL',
      };
    }
    
    // Update verification session
    const { error: updateError } = await supabase
      .from('profile_verifications')
      .update({
        verification_photo_url: urlData.publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    
    if (updateError) {
      error('[ProfileVerification] Error updating verification session:', updateError);
      return {
        success: false,
        message: 'Failed to update verification session',
      };
    }
    
    return {
      success: true,
      message: 'Verification selfie uploaded successfully',
      data: {
        verificationPhotoUrl: urlData.publicUrl
      }
    };
  } catch (error) {
    error('[ProfileVerification] Error uploading verification selfie:', error);
    return {
      success: false,
      message: 'Error uploading verification selfie',
    };
  }
};

/**
 * Complete verification process
 * @param sessionId Verification session ID
 */
export const completeVerification = async (sessionId: string): Promise<VerificationResult> => {
  try {
    log('[ProfileVerification] Completing verification process...');
    
    // Get verification session
    const { data: session, error: sessionError } = await supabase
      .from('profile_verifications')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (sessionError || !session) {
      error('[ProfileVerification] Error getting verification session:', sessionError);
      return {
        success: false,
        message: 'Failed to get verification session',
      };
    }
    
    // Check if verification photo exists
    if (!session.verification_photo_url) {
      return {
        success: false,
        message: 'No verification photo found',
      };
    }
    
    // In a real implementation with face detection, you would compare the faces here
    // For now, we'll just mark it as verified since the user completed the process
    
    // Update verification status
    const { error: updateError } = await supabase
      .from('profile_verifications')
      .update({
        status: 'verified',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    
    if (updateError) {
      error('[ProfileVerification] Error updating verification status:', updateError);
      return {
        success: false,
        message: 'Failed to update verification status',
      };
    }
    
    // Update user profile to mark as verified
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        is_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user_id);
    
    if (profileError) {
      error('[ProfileVerification] Error updating user profile:', profileError);
      return {
        success: false,
        message: 'Failed to update user profile',
      };
    }
    
    return {
      success: true,
      message: 'Profile verification completed successfully',
    };
  } catch (error) {
    error('[ProfileVerification] Error completing verification:', error);
    return {
      success: false,
      message: 'Error completing verification',
    };
  }
};

/**
 * Check if a user's profile is verified
 * @param userId User ID
 */
export const isProfileVerified = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_verified')
      .eq('id', userId)
      .maybeSingle(); // Use maybeSingle() to handle new users without profiles
    
    // PGRST116 means no rows found (expected for new users)
    if (error) {
      if (error.code === 'PGRST116') {
        // New user without profile - not verified yet
        return false;
      }
      error('[ProfileVerification] Error checking verification status:', error);
      return false;
    }
    
    if (!data) {
      // No profile exists yet
      return false;
    }
    
    return data.is_verified === true;
  } catch (error) {
    error('[ProfileVerification] Error checking verification status:', error);
    return false;
  }
}; 