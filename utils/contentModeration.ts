/**
 * Content Moderation Utility
 * 
 * This utility provides content moderation for images and videos to detect
 * inappropriate content such as nudity, violence, weapons, etc.
 * 
 * Supported providers:
 * - Sightengine (default, simple API)
 * - AWS Rekognition (requires AWS credentials)
 * 
 * To use, set environment variables:
 * - EXPO_PUBLIC_SIGHTENGINE_API_USER (for Sightengine)
 * - EXPO_PUBLIC_SIGHTENGINE_API_SECRET (for Sightengine)
 * - Or configure AWS credentials for Rekognition
 */

import * as FileSystem from 'expo-file-system';
import { log, warn, error } from './productionLogger';


export interface ModerationResult {
  isSafe: boolean;
  confidence: number;
  categories: {
    nudity?: number;
    violence?: number;
    weapons?: number;
    offensive?: number;
    drugs?: number;
    selfHarm?: number;
  };
  reason?: string;
  provider: string;
  serviceUnavailable?: boolean; // True when moderation service is down/unavailable (not a content flag)
}

export interface ModerationOptions {
  provider?: 'sightengine' | 'aws-rekognition';
  strictMode?: boolean; // If true, lower threshold for flagging content
}

/**
 * Moderate an image file
 */
export const moderateImage = async (
  imageUri: string,
  options: ModerationOptions = {}
): Promise<ModerationResult> => {
  const { provider = 'sightengine', strictMode = false } = options;

  try {
    if (provider === 'sightengine') {
      return await moderateImageWithSightengine(imageUri, strictMode);
    } else if (provider === 'aws-rekognition') {
      return await moderateImageWithAWS(imageUri, strictMode);
    } else {
      throw new Error(`Unsupported moderation provider: ${provider}`);
    }
  } catch (error: any) {
    error('Content moderation error:', error);
    
    // Check if it's a usage limit error
    const errorMessage = error?.message || '';
    const isUsageLimitError = errorMessage.includes('usage_limit') || 
                              errorMessage.includes('Daily usage limit') ||
                              errorMessage.includes('code": 32');
    
    if (isUsageLimitError) {
      warn('⚠️ Sightengine daily usage limit reached. Allowing content with warning.');
      // For usage limit errors, allow content through but log warning
      // This is different from detection failures - it's just API quota exceeded
      return {
        isSafe: true,
        confidence: 0,
        categories: {},
        reason: 'Moderation service quota exceeded. Content allowed with warning.',
        provider: provider || 'unknown',
      };
    }
    
    // For other API failures, mark as service unavailable (user can confirm)
    warn('⚠️ Moderation API error - service unavailable');
    return {
      isSafe: false,
      confidence: 0,
      categories: {},
      reason: 'Moderation service unavailable. Please confirm your content is safe.',
      provider: provider || 'unknown',
      serviceUnavailable: true, // Flag to indicate service issue, not content issue
    };
  }
};

/**
 * Moderate a video file
 * Note: Video moderation is more complex and may require frame extraction
 */
export const moderateVideo = async (
  videoUri: string,
  options: ModerationOptions = {}
): Promise<ModerationResult> => {
  const { provider = 'sightengine', strictMode = false } = options;

  try {
    if (provider === 'sightengine') {
      return await moderateVideoWithSightengine(videoUri, strictMode);
    } else if (provider === 'aws-rekognition') {
      return await moderateVideoWithAWS(videoUri, strictMode);
    } else {
      throw new Error(`Unsupported moderation provider: ${provider}`);
    }
  } catch (error: any) {
    error('Video moderation error:', error);
    
    // Check if it's a usage limit error
    const errorMessage = error?.message || '';
    const isUsageLimitError = errorMessage.includes('usage_limit') || 
                              errorMessage.includes('Daily usage limit') ||
                              errorMessage.includes('code": 32') ||
                              error?.isUsageLimit;
    
    if (isUsageLimitError) {
      warn('⚠️ Sightengine daily usage limit reached for video. Allowing content with warning.');
      // For usage limit errors, allow content through but log warning
      // This is different from detection failures - it's just API quota exceeded
      return {
        isSafe: true,
        confidence: 0,
        categories: {},
        reason: 'Moderation service quota exceeded. Content allowed with warning.',
        provider: provider || 'unknown',
      };
    }
    
    // For other API failures, mark as service unavailable (user can confirm)
    warn('⚠️ Video moderation API error - service unavailable');
    return {
      isSafe: false,
      confidence: 0,
      categories: {},
      reason: 'Moderation service unavailable. Please confirm your content is safe.',
      provider: provider || 'unknown',
      serviceUnavailable: true, // Flag to indicate service issue, not content issue
    };
  }
};

/**
 * Moderate image using Sightengine API
 */
const moderateImageWithSightengine = async (
  imageUri: string,
  strictMode: boolean
): Promise<ModerationResult> => {
  const apiUser = process.env.EXPO_PUBLIC_SIGHTENGINE_API_USER;
  const apiSecret = process.env.EXPO_PUBLIC_SIGHTENGINE_API_SECRET;

  if (!apiUser || !apiSecret) {
    warn('⚠️ Sightengine API credentials not configured!');
    warn('Please set EXPO_PUBLIC_SIGHTENGINE_API_USER and EXPO_PUBLIC_SIGHTENGINE_API_SECRET');
    // Mark as service unavailable so user can confirm content is safe
    return {
      isSafe: false,
      confidence: 0,
      categories: {},
      reason: 'Content moderation is not configured. Please confirm your content is safe.',
      provider: 'sightengine',
      serviceUnavailable: true,
    };
  }
  
  log('✅ Sightengine API credentials found');

  // Prepare form data for React Native
  // Note: In React Native, we need to use the file URI directly
  const formData = new FormData();
  formData.append('media', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'image.jpg',
  } as any);
  formData.append('api_user', apiUser);
  formData.append('api_secret', apiSecret);
  formData.append('models', 'nudity-2.1,wad,offensive');
  
  log('📤 Sending request to Sightengine API...');
  log('📤 API User:', apiUser ? `${apiUser.substring(0, 4)}...` : 'NOT SET');
  log('📤 Image URI:', imageUri);

  // Call Sightengine API
  // Don't set Content-Type header - let fetch set it automatically with boundary
  const response = await fetch('https://api.sightengine.com/1.0/check.json', {
    method: 'POST',
    body: formData,
    // Remove Content-Type header - React Native will set it with boundary
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorData = JSON.parse(errorText || '{}');
    
    // Check for usage limit error specifically
    if (errorData.error?.code === 32 || errorData.error?.type === 'usage_limit') {
      const usageLimitError = new Error(`Sightengine daily usage limit reached: ${errorData.error?.message || 'Please upgrade your plan'}`);
      (usageLimitError as any).isUsageLimit = true;
      throw usageLimitError;
    }
    
    throw new Error(`Sightengine API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  // Log full API response for debugging
  log('🔍 Sightengine API Response:', JSON.stringify(result, null, 2));

  // Parse results - Sightengine returns different structures
  // The nudity object contains: sexual_activity, sexual_display, erotica, none
  // Higher values = more explicit content (0-1 scale)
  const nudityRaw = result.nudity || {};
  
  // Get individual scores - these are probabilities (0-1) where higher = more explicit
  const sexualActivity = nudityRaw.sexual_activity || 0; // Explicit sexual acts
  const sexualDisplay = nudityRaw.sexual_display || 0; // Sexual posing/explicit nudity
  const erotica = nudityRaw.erotica || 0; // Erotic content but not explicit
  const noneScore = nudityRaw.none !== undefined ? (1 - nudityRaw.none) : 0;
  
  // Focus on explicit sexual content, not just nudity
  // sexual_activity = actual sexual acts (high threshold needed)
  // sexual_display = explicit sexual posing (high threshold needed)
  // erotica = suggestive but not explicit (can be lower threshold)
  // We want to block explicit sexual content, not just shirtless photos
  
  // Use sexual_activity and sexual_display as primary indicators (these are the explicit ones)
  // erotica alone shouldn't block (it can be suggestive but acceptable)
  const explicitNudityScore = Math.max(sexualActivity, sexualDisplay);
  
  // Only use erotica if it's very high (very suggestive)
  const eroticaScore = erotica > 0.8 ? erotica : 0;
  
  // Final nudity score - prioritize explicit sexual content
  const nudityScore = Math.max(explicitNudityScore, eroticaScore);
  
  const violenceScore = result.weapon || result.wad?.weapon || 0;
  const offensiveScore = result.offensive?.prob || result.offensive || 0;

  // Adjusted thresholds - focus on explicit sexual content, not just nudity
  // Shirtless photos typically have low sexual_activity/sexual_display scores
  // Only block if there's high confidence of explicit sexual content
  const nudityThreshold = strictMode ? 0.6 : 0.8; // 80% confidence for explicit sexual content
  const violenceThreshold = strictMode ? 0.4 : 0.6; // 60% confidence
  const offensiveThreshold = strictMode ? 0.5 : 0.7; // 70% confidence

  log('📊 Moderation Scores:', {
    sexualActivity,
    sexualDisplay,
    erotica,
    explicitNudityScore,
    eroticaScore,
    finalNudityScore: nudityScore,
    violence: violenceScore,
    offensive: offensiveScore,
    thresholds: { nudity: nudityThreshold, violence: violenceThreshold, offensive: offensiveThreshold }
  });

  // Check if content should be blocked
  // Only block if there's high confidence of EXPLICIT sexual content
  // Shirtless photos should have low sexual_activity/sexual_display scores
  const isSafe = 
    nudityScore < nudityThreshold &&
    violenceScore < violenceThreshold &&
    offensiveScore < offensiveThreshold;

  return {
    isSafe,
    confidence: Math.max(nudityScore, violenceScore, offensiveScore),
    categories: {
      nudity: nudityScore,
      violence: violenceScore,
      weapons: violenceScore,
      offensive: offensiveScore,
    },
    reason: !isSafe
      ? `Content flagged: ${nudityScore > nudityThreshold ? 'Nudity ' : ''}${violenceScore > violenceThreshold ? 'Violence ' : ''}${offensiveScore > offensiveThreshold ? 'Offensive content' : ''}`
      : undefined,
    provider: 'sightengine',
  };
};

/**
 * Moderate video using Sightengine API
 */
const moderateVideoWithSightengine = async (
  videoUri: string,
  strictMode: boolean
): Promise<ModerationResult> => {
  const apiUser = process.env.EXPO_PUBLIC_SIGHTENGINE_API_USER;
  const apiSecret = process.env.EXPO_PUBLIC_SIGHTENGINE_API_SECRET;

  if (!apiUser || !apiSecret) {
    warn('⚠️ Sightengine API credentials not configured for video moderation!');
    warn('Please set EXPO_PUBLIC_SIGHTENGINE_API_USER and EXPO_PUBLIC_SIGHTENGINE_API_SECRET');
    // Mark as service unavailable so user can confirm content is safe
    return {
      isSafe: false,
      confidence: 0,
      categories: {},
      reason: 'Content moderation is not configured. Please confirm your content is safe.',
      provider: 'sightengine',
      serviceUnavailable: true,
    };
  }
  
  log('✅ Sightengine API credentials found for video moderation');

  // For video, Sightengine analyzes multiple frames automatically
  // Note: This is a simplified approach. For production, you might want to
  // extract more frames or use a dedicated video moderation service
  
  // Prepare form data for React Native
  const formData = new FormData();
  formData.append('media', {
    uri: videoUri,
    type: 'video/mp4',
    name: 'video.mp4',
  } as any);
  formData.append('api_user', apiUser);
  formData.append('api_secret', apiSecret);
  formData.append('models', 'nudity-2.1,wad,offensive');

  log('📤 Sending video request to Sightengine API...');
  log('📤 API User:', apiUser ? `${apiUser.substring(0, 4)}...` : 'NOT SET');
  log('📤 Video URI:', videoUri);

  // Call Sightengine API for video
  // Don't set Content-Type header - let fetch set it automatically with boundary
  const response = await fetch('https://api.sightengine.com/1.0/video/check.json', {
    method: 'POST',
    body: formData,
    // Remove Content-Type header - React Native will set it with boundary
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorData = JSON.parse(errorText || '{}');
    
    // Check for usage limit error specifically
    if (errorData.error?.code === 32 || errorData.error?.type === 'usage_limit') {
      const usageLimitError = new Error(`Sightengine daily usage limit reached: ${errorData.error?.message || 'Please upgrade your plan'}`);
      (usageLimitError as any).isUsageLimit = true;
      throw usageLimitError;
    }
    
    throw new Error(`Sightengine API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  // Log full API response for debugging
  log('🔍 Sightengine Video API Response:', JSON.stringify(result, null, 2));

  // Parse video results (Sightengine analyzes multiple frames)
  const frames = result.frames || [];
  let maxExplicitNudity = 0;
  let maxErotica = 0;
  let maxViolence = 0;
  let maxOffensive = 0;

  // Analyze each frame - focus on explicit sexual content, not just nudity
  frames.forEach((frame: any) => {
    const nudityRaw = frame.nudity || {};
    
    // Get explicit sexual content scores
    const sexualActivity = nudityRaw.sexual_activity || 0;
    const sexualDisplay = nudityRaw.sexual_display || 0;
    const erotica = nudityRaw.erotica || 0;
    
    // Focus on explicit sexual content (sexual_activity and sexual_display)
    const explicitNudity = Math.max(sexualActivity, sexualDisplay);
    
    // Track the maximum explicit nudity across all frames
    maxExplicitNudity = Math.max(maxExplicitNudity, explicitNudity);
    
    // Only consider erotica if it's very high (very suggestive)
    if (erotica > 0.8) {
      maxErotica = Math.max(maxErotica, erotica);
    }
    
    const violence = frame.weapon || frame.wad?.weapon || 0;
    const offensive = frame.offensive?.prob || frame.offensive || 0;

    maxViolence = Math.max(maxViolence, violence);
    maxOffensive = Math.max(maxOffensive, offensive);
  });

  // Final nudity score - prioritize explicit sexual content
  const nudityScore = Math.max(maxExplicitNudity, maxErotica);

  // Adjusted thresholds - same as image moderation
  // Focus on explicit sexual content, not just nudity
  // Regular videos (including shirtless) should have low sexual_activity/sexual_display scores
  // Only block if there's high confidence of explicit sexual content
  const nudityThreshold = strictMode ? 0.6 : 0.8; // 80% confidence for explicit sexual content
  const violenceThreshold = strictMode ? 0.4 : 0.6; // 60% confidence
  const offensiveThreshold = strictMode ? 0.5 : 0.7; // 70% confidence

  log('📊 Video Moderation Scores:', {
    framesAnalyzed: frames.length,
    maxExplicitNudity,
    maxErotica,
    finalNudityScore: nudityScore,
    maxViolence,
    maxOffensive,
    thresholds: { nudity: nudityThreshold, violence: violenceThreshold, offensive: offensiveThreshold }
  });

  const isSafe = 
    nudityScore < nudityThreshold &&
    maxViolence < violenceThreshold &&
    maxOffensive < offensiveThreshold;

  return {
    isSafe,
    confidence: Math.max(nudityScore, maxViolence, maxOffensive),
    categories: {
      nudity: nudityScore,
      violence: maxViolence,
      weapons: maxViolence,
      offensive: maxOffensive,
    },
    reason: !isSafe
      ? `Video flagged: ${nudityScore > nudityThreshold ? 'Explicit sexual content ' : ''}${maxViolence > violenceThreshold ? 'Violence ' : ''}${maxOffensive > offensiveThreshold ? 'Offensive content' : ''}`
      : undefined,
    provider: 'sightengine',
  };
};

/**
 * Moderate image using AWS Rekognition
 * Note: Requires AWS credentials and SDK setup
 */
const moderateImageWithAWS = async (
  imageUri: string,
  strictMode: boolean
): Promise<ModerationResult> => {
  // AWS Rekognition implementation would go here
  // This requires AWS SDK and proper credentials setup
  // For now, we'll return a placeholder
  warn('AWS Rekognition moderation not yet implemented');
  
  return {
    isSafe: true,
    confidence: 0,
    categories: {},
    reason: 'AWS Rekognition not implemented',
    provider: 'aws-rekognition',
  };
};

/**
 * Moderate video using AWS Rekognition
 */
const moderateVideoWithAWS = async (
  videoUri: string,
  strictMode: boolean
): Promise<ModerationResult> => {
  // AWS Rekognition video moderation implementation would go here
  warn('AWS Rekognition video moderation not yet implemented');
  
  return {
    isSafe: true,
    confidence: 0,
    categories: {},
    reason: 'AWS Rekognition not implemented',
    provider: 'aws-rekognition',
  };
};

/**
 * Get user-friendly error message for moderation failures
 * Note: Does not include provider information
 */
export const getModerationErrorMessage = (result: ModerationResult): string => {
  if (result.isSafe) {
    return '';
  }

  // If there's a specific reason, use it (but remove provider info)
  if (result.reason) {
    // Remove any provider-specific mentions
    let cleanReason = result.reason
      .replace(/Sightengine/gi, '')
      .replace(/moderation service/gi, 'content moderation')
      .replace(/API/gi, '')
      .replace(/provider/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // If the reason mentions quota/usage limit, make it more user-friendly
    if (cleanReason.includes('quota') || cleanReason.includes('usage limit')) {
      return 'Content moderation is temporarily unavailable. Please try again later.';
    }
    
    // If it mentions configuration, make it more user-friendly
    if (cleanReason.includes('not configured') || cleanReason.includes('configure')) {
      return 'Content moderation is not available. Please contact support.';
    }
    
    return cleanReason;
  }

  const reasons: string[] = [];
  
  if (result.categories.nudity && result.categories.nudity > 0.3) {
    reasons.push('inappropriate content');
  }
  if (result.categories.violence && result.categories.violence > 0.3) {
    reasons.push('violent content');
  }
  if (result.categories.weapons && result.categories.weapons > 0.3) {
    reasons.push('weapons');
  }
  if (result.categories.offensive && result.categories.offensive > 0.4) {
    reasons.push('offensive content');
  }

  if (reasons.length > 0) {
    return `Your content cannot be posted because it contains ${reasons.join(', ')}. Please review our community guidelines.`;
  }

  return 'Your content does not meet our community guidelines. Please review and try again.';
};

