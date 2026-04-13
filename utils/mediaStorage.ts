/**
 * Media Storage Utilities
 * Handles upload, download, and management of temporary media files
 * Media auto-deletes after 24 hours for privacy
 */

import { supabase } from './supabase'
import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Platform, Alert } from 'react-native'
import { log, warn, error } from './productionLogger';


// Lazy import expo-video-thumbnails (only if available)
let VideoThumbnails: typeof import('expo-video-thumbnails') | null = null
try {
  VideoThumbnails = require('expo-video-thumbnails')
} catch (error) {
  log('[MediaStorage] expo-video-thumbnails not available, will use ImagePicker thumbnail only')
}

// 24-hour expiry constant
export const MEDIA_EXPIRY_HOURS = 24

// File size limits (in bytes)
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50 MB
export const TARGET_IMAGE_SIZE = 2 * 1024 * 1024 // Target 2 MB after compression
export const MAX_IMAGE_DIMENSION = 1920 // Max width/height

export interface MediaUploadResult {
  fileUrl: string
  thumbnailUrl: string | null
  filePath: string
  thumbnailPath: string | null
  expiryAt: string
}

export interface MediaFile {
  uri: string
  type: string
  name: string
  size?: number
  thumbnailUri?: string // For videos, ImagePicker might provide this
}

/**
 * Request storage permissions
 */
export async function requestMediaPermissions(): Promise<boolean> {
  // For now, just return true since we're saving to cache
  return true
}

/**
 * Request camera permissions (for taking photos)
 */
export async function requestCameraPermissions(): Promise<boolean> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    return status === 'granted'
  } catch (error) {
    error('Error requesting camera permissions:', error)
    return false
  }
}

/**
 * Generate thumbnail from video using expo-video-thumbnails
 * Extracts a frame at 1 second into the video
 * Falls back gracefully if module not available
 */
async function generateVideoThumbnail(videoUri: string): Promise<string | null> {
  try {
    // Check if expo-video-thumbnails is available
    if (!VideoThumbnails) {
      log('[MediaStorage] expo-video-thumbnails not available, cannot generate thumbnail')
      return null
    }
    
    log('[MediaStorage] Generating video thumbnail from:', videoUri)
    
    // Generate thumbnail at 1 second into the video
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 1000, // 1 second into the video
      quality: 0.8, // Good quality
    })
    
    log('[MediaStorage] ✅ Video thumbnail generated:', uri)
  return uri
  } catch (error) {
    error('[MediaStorage] ❌ Error generating video thumbnail:', error)
    // If native module error, return null gracefully
    if (error instanceof Error && error.message.includes('native module')) {
      warn('[MediaStorage] Native module not linked. Rebuild app with: npx expo run:ios or npx expo run:android')
    }
    return null
  }
}

/**
 * Compress image to target size using expo-image-manipulator
 */
async function compressImage(uri: string, maxSizeBytes: number = TARGET_IMAGE_SIZE): Promise<string> {
  try {
    log('[MediaStorage] Compressing image...')
    
    // Start with high quality to preserve dynamic range and color depth
    let quality = 0.92 // Increased from 0.9 for better quality
    let compressed = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_DIMENSION } }], // Resize if too large
      { 
        compress: quality, 
        format: ImageManipulator.SaveFormat.JPEG,
        // Preserve more color information
        base64: false,
      }
    )
    
    // Check file size and reduce quality if needed
    // BUT: Never go below 0.75 quality to prevent "burn and ashy" look
    let fileInfo = await FileSystem.getInfoAsync(compressed.uri)
    let attempts = 0
    const MIN_QUALITY = 0.75 // Increased from 0.3 to preserve image quality
    
    while (fileInfo.size && fileInfo.size > maxSizeBytes && quality > MIN_QUALITY && attempts < 5) {
      quality -= 0.05 // Smaller steps (was 0.15) for finer control
      compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_IMAGE_DIMENSION } }],
        { 
          compress: quality, 
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        }
      )
      fileInfo = await FileSystem.getInfoAsync(compressed.uri)
      attempts++
      log(`[MediaStorage] Compression attempt ${attempts}, quality: ${quality}, size: ${fileInfo.size}`)
    }
    
    // If still too large after quality reduction, resize more aggressively instead
    if (fileInfo.size && fileInfo.size > maxSizeBytes && quality <= MIN_QUALITY) {
      log('[MediaStorage] Quality at minimum, trying aggressive resize instead...')
      const aggressiveWidth = Math.floor(MAX_IMAGE_DIMENSION * 0.85) // 85% of max width
      compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: aggressiveWidth } }],
        { 
          compress: MIN_QUALITY, 
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        }
      )
      fileInfo = await FileSystem.getInfoAsync(compressed.uri)
    }
    
    const finalSize = fileInfo.size ? (fileInfo.size / 1024 / 1024).toFixed(2) : 'unknown'
    log(`[MediaStorage] ✅ Image compressed to ${finalSize}MB`)
    
    return compressed.uri
  } catch (error) {
    error('[MediaStorage] Compression error:', error)
    // Return original if compression fails
    return uri
  }
}

/**
 * Check if file size is within limits
 */
function checkFileSize(size: number | undefined, type: string): { valid: boolean; message?: string } {
  if (!size) return { valid: true } // Can't check, allow it
  
  const sizeMB = (size / 1024 / 1024).toFixed(1)
  
  if (type.startsWith('image/')) {
    if (size > MAX_IMAGE_SIZE) {
      return {
        valid: false,
        message: `Image too large (${sizeMB}MB). Maximum size is 5MB. We'll try to compress it.`
      }
    }
  } else if (type.startsWith('video/')) {
    if (size > MAX_VIDEO_SIZE) {
      return {
        valid: false,
        message: `Video too large (${sizeMB}MB). Maximum size is 50MB. Please choose a shorter video.`
      }
    }
  }
  
  return { valid: true }
}

/**
 * Pick image from gallery
 */
export async function pickImage(): Promise<MediaFile | null> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) {
      return null
    }

    const asset = result.assets[0]
    
    // Check file size
    const sizeCheck = checkFileSize(asset.fileSize, 'image/jpeg')
    if (!sizeCheck.valid && asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE * 2) {
      // If image is way too large (>10MB), reject it
      Alert.alert(
        'Image Too Large',
        'This image is too large to upload. Please choose a smaller image or take a new photo.'
      )
      return null
    }
    
    // Show info if we'll compress it
    if (!sizeCheck.valid && sizeCheck.message) {
      log('[MediaStorage]', sizeCheck.message)
    }
    
    return {
      uri: asset.uri,
      type: 'image/jpeg',
      name: `image_${Date.now()}.jpg`,
      size: asset.fileSize,
    }
  } catch (error) {
    error('Error picking image:', error)
    return null
  }
}

/**
 * Pick video from gallery
 */
export async function pickVideo(): Promise<MediaFile | null> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: 60, // Limit to 60 seconds
    })

    if (result.canceled || !result.assets[0]) {
      return null
    }

    const asset = result.assets[0]
    
    // Check file size
    const sizeCheck = checkFileSize(asset.fileSize, 'video/mp4')
    if (!sizeCheck.valid) {
      Alert.alert(
        'Video Too Large',
        sizeCheck.message || 'Please choose a shorter video (max 50MB).'
      )
      return null
    }
    
    // ImagePicker might provide a thumbnail for videos
    // If not, we'll generate one during upload
    log('[MediaStorage] Video picked:', {
      uri: asset.uri,
      hasThumbnail: !!asset.thumbnailUri,
      thumbnailUri: asset.thumbnailUri
    })
    
    return {
      uri: asset.uri,
      type: 'video/mp4',
      name: `video_${Date.now()}.mp4`,
      size: asset.fileSize,
      thumbnailUri: asset.thumbnailUri || undefined, // Use ImagePicker's thumbnail if available
    }
  } catch (error) {
    error('Error picking video:', error)
    return null
  }
}

/**
 * Take photo with camera
 */
export async function takePhoto(): Promise<MediaFile | null> {
  try {
    const hasPermission = await requestCameraPermissions()
    if (!hasPermission) {
      Alert.alert(
        'Permission Required',
        'Please allow camera access to take photos.'
      )
      return null
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) {
      return null
    }

    const asset = result.assets[0]
    
    // Camera photos are usually reasonable size, but check anyway
    const sizeCheck = checkFileSize(asset.fileSize, 'image/jpeg')
    if (!sizeCheck.valid && sizeCheck.message) {
      log('[MediaStorage]', sizeCheck.message)
    }
    
    return {
      uri: asset.uri,
      type: 'image/jpeg',
      name: `photo_${Date.now()}.jpg`,
      size: asset.fileSize,
    }
  } catch (error) {
    error('Error taking photo:', error)
    return null
  }
}


/**
 * Upload media file to Supabase Storage
 */
export async function uploadMedia(
  file: MediaFile,
  generateThumbnail: boolean = true
): Promise<MediaUploadResult | null> {
  try {
    log('[MediaStorage] Starting upload for:', file.name, file.type)
    
    // Get signed upload URL from Edge Function
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      error('[MediaStorage] Not authenticated')
      throw new Error('Not authenticated')
    }

    log('[MediaStorage] Calling media-upload-url Edge Function...')
    const { data, error } = await supabase.functions.invoke('media-upload-url', {
      body: {
        fileType: file.type,
        fileName: file.name,
        generateThumbnail,
      },
    })

    if (error || !data) {
      error('[MediaStorage] ❌ Error getting upload URL:', error)
      error('[MediaStorage] Error details:', JSON.stringify(error, null, 2))
      throw new Error('Failed to get upload URL: ' + (error?.message || 'Unknown error'))
    }

    log('[MediaStorage] ✅ Got upload URLs:', {
      hasUploadUrl: !!data.uploadUrl,
      hasFileUrl: !!data.fileUrl,
      expiryAt: data.expiryAt
    })

    // Compress image if needed
    log('[MediaStorage] Compressing if needed...')
    const fileUri = file.type.startsWith('image/') 
      ? await compressImage(file.uri)
      : file.uri
    log('[MediaStorage] File ready for upload')

    // Read file content for upload
    // Supabase signed URLs expect raw file content in PUT request
    let uploadBody: any
    
    if (Platform.OS === 'web') {
      // Web: fetch the file and create blob
      const response = await fetch(fileUri)
      uploadBody = await response.blob()
    } else {
      // React Native: read as base64 and convert to Uint8Array
      log('[MediaStorage] Reading file as base64...')
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      uploadBody = bytes
      log('[MediaStorage] File read, size:', bytes.length, 'bytes')
    }

    // Upload file using signed URL
    log('[MediaStorage] Uploading to storage...')
    const uploadResponse = await fetch(data.uploadUrl, {
      method: 'PUT',
      body: uploadBody,
      headers: {
        'Content-Type': file.type,
      },
    })

    if (!uploadResponse.ok) {
      error('[MediaStorage] ❌ Upload failed:', uploadResponse.status, uploadResponse.statusText)
      throw new Error('Failed to upload file: ' + uploadResponse.statusText)
    }

    // Upload thumbnail if provided
    if (data.thumbnailUploadUrl && generateThumbnail) {
      let thumbnailBody: any
      let hasThumbnail = false
      
      if (file.type.startsWith('image/')) {
        // For images, use the same compressed image as thumbnail
        thumbnailBody = uploadBody
        hasThumbnail = true
        log('[MediaStorage] Using compressed image as thumbnail')
      } else if (file.type.startsWith('video/')) {
        // For videos, try multiple sources in order of preference
        let thumbnailUri: string | null = null
        
        // 1. Try ImagePicker's thumbnail first (fastest, if available)
        if (file.thumbnailUri) {
          log('[MediaStorage] Trying ImagePicker thumbnail:', file.thumbnailUri)
          try {
            const fileInfo = await FileSystem.getInfoAsync(file.thumbnailUri)
            if (fileInfo.exists) {
              thumbnailUri = file.thumbnailUri
              log('[MediaStorage] ✅ Using ImagePicker thumbnail')
            }
          } catch (error) {
            log('[MediaStorage] ImagePicker thumbnail not available, generating new one')
          }
        }
        
        // 2. Generate thumbnail using expo-video-thumbnails if ImagePicker didn't provide one
        if (!thumbnailUri) {
          log('[MediaStorage] Generating video thumbnail using expo-video-thumbnails...')
          thumbnailUri = await generateVideoThumbnail(file.uri)
        }
        
        // 3. Read and prepare thumbnail for upload
        if (thumbnailUri) {
          try {
            if (Platform.OS === 'web') {
              const response = await fetch(thumbnailUri)
              thumbnailBody = await response.blob()
              hasThumbnail = true
            } else {
              const fileInfo = await FileSystem.getInfoAsync(thumbnailUri)
              if (fileInfo.exists) {
                const base64 = await FileSystem.readAsStringAsync(thumbnailUri, {
                  encoding: FileSystem.EncodingType.Base64,
                })
                const binaryString = atob(base64)
                const bytes = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i)
                }
                thumbnailBody = bytes
                hasThumbnail = true
                log('[MediaStorage] ✅ Video thumbnail ready, size:', bytes.length, 'bytes')
              } else {
                warn('[MediaStorage] ⚠️ Thumbnail file does not exist:', thumbnailUri)
              }
            }
          } catch (error) {
            error('[MediaStorage] ❌ Error reading video thumbnail:', error)
            hasThumbnail = false
          }
        } else {
          warn('[MediaStorage] ⚠️ Could not generate video thumbnail')
        }
      }
      
      // Upload thumbnail if we have one
      if (hasThumbnail && thumbnailBody) {
        log('[MediaStorage] Uploading thumbnail...')
        try {
          const thumbnailResponse = await fetch(data.thumbnailUploadUrl, {
        method: 'PUT',
            body: thumbnailBody,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      })
          
          if (!thumbnailResponse.ok) {
            warn('[MediaStorage] ⚠️ Thumbnail upload failed:', thumbnailResponse.status, thumbnailResponse.statusText)
          } else {
            log('[MediaStorage] ✅ Thumbnail uploaded successfully')
          }
        } catch (error) {
          error('[MediaStorage] ❌ Error uploading thumbnail:', error)
        }
      } else if (file.type.startsWith('video/')) {
        warn('[MediaStorage] ⚠️ Video thumbnail not available - video will show placeholder in chat')
      }
    }

    log('[MediaStorage] ✅ Upload complete!')
    return {
      fileUrl: data.fileUrl,
      thumbnailUrl: data.thumbnailUrl,
      filePath: data.filePath,
      thumbnailPath: data.thumbnailPath,
      expiryAt: data.expiryAt,
    }
  } catch (error) {
    error('[MediaStorage] ❌ Upload error:', error)
    error('[MediaStorage] Error type:', error instanceof Error ? error.message : String(error))
    return null
  }
}

/**
 * Download media and save to device Photos/Gallery
 */
export async function downloadAndSaveMedia(
  fileUrl: string,
  fileName: string,
  fileType: string
): Promise<boolean> {
  try {
    log('[MediaStorage] Downloading media:', fileName)
    
    // Request permission first
    const MediaLibrary = require('expo-media-library')
    const { status } = await MediaLibrary.requestPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow photo library access to save media.'
      )
      return false
    }
    
    // Download to cache directory first
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`
    const downloadResult = await FileSystem.downloadAsync(fileUrl, fileUri)

    if (downloadResult.status !== 200) {
      throw new Error('Download failed')
    }

    log('[MediaStorage] Downloaded to:', downloadResult.uri)

    // Save to Photos app (iOS) or Gallery (Android)
    const asset = await MediaLibrary.createAssetAsync(downloadResult.uri)
    log('[MediaStorage] Saved to library:', asset.id)
    
    Alert.alert(
      '✅ Saved!',
      `${fileType.startsWith('video/') ? 'Video' : 'Photo'} saved to your ${Platform.OS === 'ios' ? 'Photos' : 'Gallery'}`,
      [{ text: 'OK' }]
    )
    
    return true
  } catch (error: any) {
    error('[MediaStorage] Error downloading media:', error)
    
    // Check for specific error types
    const errorMessage = error?.message || String(error)
    
    if (errorMessage.includes('Unable to resolve host') || 
        errorMessage.includes('Network request failed') ||
        errorMessage.includes('No address associated with hostname')) {
      Alert.alert(
        'Network Error',
        'Unable to connect to the server. Please check your internet connection and try again.'
      )
    } else if (errorMessage.includes('Permission')) {
      Alert.alert(
        'Permission Required',
        'Please allow photo library access to save media.'
      )
    } else {
      Alert.alert(
        'Error',
        'Failed to save media. Please check your connection and try again.'
      )
    }
    
    return false
  }
}

/**
 * Mark media as downloaded in database
 */
export async function markMediaAsDownloaded(messageId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return false
    }

    const { error } = await supabase.rpc('mark_media_downloaded', {
      message_id: messageId,
      user_id: user.id,
    })

    if (error) {
      error('Error marking media as downloaded:', error)
      return false
    }

    return true
  } catch (error) {
    error('Error marking media as downloaded:', error)
    return false
  }
}

/**
 * Check if media is expired
 */
export function isMediaExpired(expiryAt: string | null): boolean {
  if (!expiryAt) return false
  return new Date(expiryAt) < new Date()
}

/**
 * Check if media is deleted
 */
export function isMediaDeleted(fileDeleted: boolean, fileUrl: string | null): boolean {
  return fileDeleted || !fileUrl
}

/**
 * Manually expire media for testing purposes
 * Sets expiry_at to 1 second ago so media appears expired
 */
export async function expireMediaManually(messageId: string): Promise<boolean> {
  try {
    const { supabase } = await import('./supabase')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      error('[MediaStorage] Not authenticated')
      return false
    }

    // Set expiry_at to 1 second ago (expired)
    const expiredTime = new Date()
    expiredTime.setSeconds(expiredTime.getSeconds() - 1)

    const { error } = await supabase
      .from('private_messages')
      .update({ 
        expiry_at: expiredTime.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', messageId)

    if (error) {
      error('[MediaStorage] Error expiring media:', error)
      return false
    }

    log('[MediaStorage] ✅ Media manually expired:', messageId)
    return true
  } catch (error) {
    error('[MediaStorage] Exception expiring media:', error)
    return false
  }
}

/**
 * Download voice note and save to device
 */
export async function downloadAndSaveVoiceNote(
  fileUrl: string,
  fileName: string
): Promise<boolean> {
  try {
    log('[MediaStorage] Downloading voice note:', fileName)
    
    // Request permission first
    const MediaLibrary = require('expo-media-library')
    const { status } = await MediaLibrary.requestPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow media library access to save voice notes.'
      )
      return false
    }
    
    // Download to cache directory first
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`
    const downloadResult = await FileSystem.downloadAsync(fileUrl, fileUri)

    if (downloadResult.status !== 200) {
      throw new Error('Download failed')
    }

    log('[MediaStorage] Downloaded voice note to:', downloadResult.uri)

    // Save to Media Library (works for audio files)
    const asset = await MediaLibrary.createAssetAsync(downloadResult.uri)
    log('[MediaStorage] Saved voice note to library:', asset.id)
    
    Alert.alert(
      '✅ Saved!',
      `Voice note saved to your ${Platform.OS === 'ios' ? 'Files' : 'Downloads'}`,
      [{ text: 'OK' }]
    )
    
    return true
  } catch (error: any) {
    error('[MediaStorage] Error downloading voice note:', error)
    
    // Check for specific error types
    const errorMessage = error?.message || String(error)
    
    if (errorMessage.includes('Unable to resolve host') || 
        errorMessage.includes('Network request failed') ||
        errorMessage.includes('No address associated with hostname')) {
      Alert.alert(
        'Network Error',
        'Unable to connect to the server. Please check your internet connection and try again.'
      )
    } else if (errorMessage.includes('Permission')) {
      Alert.alert(
        'Permission Required',
        'Please allow media library access to save voice notes.'
      )
    } else {
      Alert.alert(
        'Error',
        'Failed to save voice note. Please check your connection and try again.'
      )
    }
    
    return false
  }
}

