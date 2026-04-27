/**
 * Agora Livestream Configuration
 * 
 * Optimized configuration for stable livestreaming based on:
 * NOMLI MINGLE LIVE STREAMING DOCUMENTATION
 * 
 * Key principles:
 * - VP8 codec for unstable networks
 * - Dual stream for adaptive quality
 * - Bitrate caps for Nigeria 4G
 * - Audio-first playback
 */

export const AGORA_LIVESTREAM_CONFIG = {
  // Channel Profile: Live Broadcasting (required for livestream)
  CHANNEL_PROFILE: 'live_broadcasting' as const,
  
  // Codec: VP8 (better for unstable networks like Nigeria 4G)
  VIDEO_CODEC: 'VP8' as const,
  
  // Dual Stream: Enabled for adaptive quality
  DUAL_STREAM_ENABLED: true,
  
  // Audio Profile: High quality for livestream
  AUDIO_PROFILE: 'music_high_quality' as const,
  AUDIO_SCENARIO: 'game_streaming' as const,
  
  // Broadcaster Video Configuration
  // Based on documentation: 640x360, 15fps, 400-800 kbps
  BROADCASTER_VIDEO: {
    width: 640,
    height: 360,
    frameRate: 15,
    bitrate: 600, // Target (middle of 400-800 range)
    minBitrate: 400,
    maxBitrate: 800,
  },
  
  // Audience Video Configuration (Low stream default)
  AUDIENCE_VIDEO: {
    width: 320,
    height: 180,
    frameRate: 15,
    bitrate: 200,
    minBitrate: 150,
    maxBitrate: 300,
  },
  
  // Audio-First Subscription Delay
  // Delay video subscription by 1-1.2 seconds to prioritize audio
  AUDIO_FIRST_DELAY_MS: 1000, // 1 second
  
  // Network Quality Thresholds
  NETWORK_QUALITY: {
    EXCELLENT: 1,
    GOOD: 2,
    POOR: 3,
    BAD: 4,
    VERY_BAD: 5,
    DOWN: 6,
  },
  
  // Token Configuration
  USE_TOKEN_AUTH: true, // Always use tokens for production
  TOKEN_EXPIRY: 3600, // 1 hour (tokens should be refreshed before expiry)
  
  // Security
  ENABLE_ENCRYPTION: true,
  ENCRYPTION_MODE: 'aes-128-xts' as const,
  
  // Performance Targets
  TARGETS: {
    JOIN_LATENCY_MS: 1000, // < 1 second
    AUDIO_START_MS: 500, // < 500ms
    MAX_API_CALLS_PER_SESSION: 5, // Bootstrap pattern
  },
};

/**
 * Get broadcaster video encoder configuration
 */
export const getBroadcasterVideoConfig = () => ({
  width: AGORA_LIVESTREAM_CONFIG.BROADCASTER_VIDEO.width,
  height: AGORA_LIVESTREAM_CONFIG.BROADCASTER_VIDEO.height,
  bitrate: AGORA_LIVESTREAM_CONFIG.BROADCASTER_VIDEO.bitrate,
  frameRate: AGORA_LIVESTREAM_CONFIG.BROADCASTER_VIDEO.frameRate,
  minBitrate: AGORA_LIVESTREAM_CONFIG.BROADCASTER_VIDEO.minBitrate,
  maxBitrate: AGORA_LIVESTREAM_CONFIG.BROADCASTER_VIDEO.maxBitrate,
});

/**
 * Get audience video encoder configuration (low stream)
 */
export const getAudienceVideoConfig = () => ({
  width: AGORA_LIVESTREAM_CONFIG.AUDIENCE_VIDEO.width,
  height: AGORA_LIVESTREAM_CONFIG.AUDIENCE_VIDEO.height,
  bitrate: AGORA_LIVESTREAM_CONFIG.AUDIENCE_VIDEO.bitrate,
  frameRate: AGORA_LIVESTREAM_CONFIG.AUDIENCE_VIDEO.frameRate,
  minBitrate: AGORA_LIVESTREAM_CONFIG.AUDIENCE_VIDEO.minBitrate,
  maxBitrate: AGORA_LIVESTREAM_CONFIG.AUDIENCE_VIDEO.maxBitrate,
});

/**
 * Check if network quality is good enough for video
 */
export const isNetworkGoodForVideo = (quality: number): boolean => {
  return quality <= AGORA_LIVESTREAM_CONFIG.NETWORK_QUALITY.GOOD;
};

/**
 * Check if network requires audio-only mode
 */
export const shouldUseAudioOnly = (quality: number): boolean => {
  return quality >= AGORA_LIVESTREAM_CONFIG.NETWORK_QUALITY.VERY_BAD;
};

