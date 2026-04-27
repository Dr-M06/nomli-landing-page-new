/**
 * Livestream Stability Utilities
 * 
 * Implements stability features based on NOMLI MINGLE LIVE STREAMING DOCUMENTATION:
 * - Bitrate caps for Nigeria 4G
 * - Network quality monitoring
 * - Audio-first subscription
 * - VP8 codec configuration
 */

export interface VideoEncoderConfig {
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
  minBitrate?: number;
  maxBitrate?: number;
}

/**
 * Get broadcaster video encoder configuration
 * Based on documentation: 640x360, 15fps, 400-800 kbps
 */
export const getBroadcasterVideoConfig = (): VideoEncoderConfig => ({
  width: 640,
  height: 360,
  bitrate: 600, // Target bitrate (middle of 400-800 range)
  frameRate: 15,
  minBitrate: 400,
  maxBitrate: 800,
});

/**
 * Get audience low stream configuration
 * Used for initial subscription and poor network conditions
 */
export const getAudienceLowStreamConfig = (): VideoEncoderConfig => ({
  width: 320,
  height: 180,
  bitrate: 200,
  frameRate: 15,
  minBitrate: 150,
  maxBitrate: 300,
});

/**
 * Network quality levels (0-6)
 * Based on Agora network quality reporting
 */
export enum NetworkQuality {
  UNKNOWN = 0,
  EXCELLENT = 1,
  GOOD = 2,
  POOR = 3,
  BAD = 4,
  VERY_BAD = 5,
  DOWN = 6,
}

/**
 * Determine if network quality is good enough for video
 */
export const isNetworkGoodForVideo = (quality: number): boolean => {
  return quality <= NetworkQuality.GOOD;
};

/**
 * Determine if network quality requires audio-only mode
 */
export const shouldUseAudioOnly = (quality: number): boolean => {
  return quality >= NetworkQuality.VERY_BAD;
};

/**
 * Get appropriate video configuration based on network quality
 */
export const getVideoConfigForNetwork = (quality: number): VideoEncoderConfig => {
  if (shouldUseAudioOnly(quality)) {
    // Return minimal config (will be disabled)
    return getAudienceLowStreamConfig();
  }
  
  if (!isNetworkGoodForVideo(quality)) {
    // Poor network - use low stream
    return getAudienceLowStreamConfig();
  }
  
  // Good network - use broadcaster config
  return getBroadcasterVideoConfig();
};

/**
 * Audio-first subscription delay (1-1.2 seconds)
 * Based on documentation: delay video subscription to prioritize audio
 */
export const AUDIO_FIRST_DELAY_MS = 1000; // 1 second delay

/**
 * Check if we should delay video subscription
 */
export const shouldDelayVideoSubscription = (networkQuality: number): boolean => {
  // Always delay video for audio-first pattern
  // But delay longer if network is poor
  return true;
};

/**
 * Get video subscription delay based on network quality
 */
export const getVideoSubscriptionDelay = (networkQuality: number): number => {
  if (shouldUseAudioOnly(networkQuality)) {
    // Very bad network - delay longer or skip video
    return AUDIO_FIRST_DELAY_MS * 2;
  }
  
  if (!isNetworkGoodForVideo(networkQuality)) {
    // Poor network - delay longer
    return AUDIO_FIRST_DELAY_MS * 1.5;
  }
  
  // Good network - standard delay
  return AUDIO_FIRST_DELAY_MS;
};

