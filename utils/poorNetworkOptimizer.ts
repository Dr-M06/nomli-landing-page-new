/**
 * 🌍 POOR NETWORK OPTIMIZER
 * 
 * Optimizes livestream quality for poor African networks and global connectivity.
 * Provides progressive quality levels and automatic audio-only fallback.
 * 
 * Network Quality Scale (Agora):
 * 0 = Unknown
 * 1 = Bad (very poor)
 * 2 = Poor
 * 3 = Fair
 * 4 = Good
 * 5 = Very Good
 * 6 = Excellent
 */

export interface PoorNetworkConfig {
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
  minBitrate: number;
  maxBitrate: number;
  audioBitrate: number;
  audioSampleRate: number;
  shouldUseAudioOnly: boolean;
}

/**
 * Get network configuration based on quality level (0-6 scale)
 * Starts conservative and scales up only when network improves
 * 
 * @param networkQuality - Agora network quality (0-6)
 * @param isBroadcaster - Whether this is for broadcaster (upload) or viewer (download)
 * @returns Configuration optimized for the network quality
 */
export function getPoorNetworkConfig(
  networkQuality: number,
  isBroadcaster: boolean = true
): PoorNetworkConfig {
  // Default to conservative settings if quality unknown
  if (networkQuality === 0) {
    networkQuality = 2; // Assume poor network
  }

  // Broadcaster (upload) configurations - more conservative
  if (isBroadcaster) {
    switch (networkQuality) {
      case 1: // Bad - Audio only or minimal video
        return {
          width: 320,
          height: 180,
          bitrate: 100,
          frameRate: 10,
          minBitrate: 50,
          maxBitrate: 150,
          audioBitrate: 32,
          audioSampleRate: 16000,
          shouldUseAudioOnly: true, // Recommend audio-only for very poor networks
        };
      case 2: // Poor - Low quality video
        return {
          width: 320,
          height: 180,
          bitrate: 150,
          frameRate: 10,
          minBitrate: 100,
          maxBitrate: 200,
          audioBitrate: 48,
          audioSampleRate: 16000,
          shouldUseAudioOnly: false,
        };
      case 3: // Fair - Conservative quality
        return {
          width: 480,
          height: 270,
          bitrate: 300,
          frameRate: 15,
          minBitrate: 200,
          maxBitrate: 400,
          audioBitrate: 64,
          audioSampleRate: 24000,
          shouldUseAudioOnly: false,
        };
      case 4: // Good - Medium quality
        return {
          width: 640,
          height: 360,
          bitrate: 500,
          frameRate: 20,
          minBitrate: 350,
          maxBitrate: 650,
          audioBitrate: 96,
          audioSampleRate: 48000,
          shouldUseAudioOnly: false,
        };
      case 5: // Very Good - High quality
        return {
          width: 960,
          height: 540,
          bitrate: 1000,
          frameRate: 24,
          minBitrate: 800,
          maxBitrate: 1200,
          audioBitrate: 128,
          audioSampleRate: 48000,
          shouldUseAudioOnly: false,
        };
      case 6: // Excellent - Maximum quality
        return {
          width: 1280,
          height: 720,
          bitrate: 1500,
          frameRate: 30,
          minBitrate: 1200,
          maxBitrate: 1800,
          audioBitrate: 128,
          audioSampleRate: 48000,
          shouldUseAudioOnly: false,
        };
      default:
        // Fallback to poor network settings
        return getPoorNetworkConfig(2, true);
    }
  } else {
    // Viewer (download) configurations - can be slightly more aggressive
    switch (networkQuality) {
      case 1: // Bad - Audio only
        return {
          width: 320,
          height: 180,
          bitrate: 100,
          frameRate: 10,
          minBitrate: 50,
          maxBitrate: 150,
          audioBitrate: 32,
          audioSampleRate: 16000,
          shouldUseAudioOnly: true,
        };
      case 2: // Poor - Low quality
        return {
          width: 320,
          height: 180,
          bitrate: 150,
          frameRate: 10,
          minBitrate: 100,
          maxBitrate: 200,
          audioBitrate: 48,
          audioSampleRate: 16000,
          shouldUseAudioOnly: false,
        };
      case 3: // Fair
        return {
          width: 480,
          height: 270,
          bitrate: 300,
          frameRate: 15,
          minBitrate: 200,
          maxBitrate: 400,
          audioBitrate: 64,
          audioSampleRate: 24000,
          shouldUseAudioOnly: false,
        };
      case 4: // Good
        return {
          width: 640,
          height: 360,
          bitrate: 500,
          frameRate: 20,
          minBitrate: 350,
          maxBitrate: 650,
          audioBitrate: 96,
          audioSampleRate: 48000,
          shouldUseAudioOnly: false,
        };
      case 5: // Very Good
        return {
          width: 960,
          height: 540,
          bitrate: 1000,
          frameRate: 24,
          minBitrate: 800,
          maxBitrate: 1200,
          audioBitrate: 128,
          audioSampleRate: 48000,
          shouldUseAudioOnly: false,
        };
      case 6: // Excellent
        return {
          width: 1280,
          height: 720,
          bitrate: 1500,
          frameRate: 30,
          minBitrate: 1200,
          maxBitrate: 1800,
          audioBitrate: 128,
          audioSampleRate: 48000,
          shouldUseAudioOnly: false,
        };
      default:
        return getPoorNetworkConfig(2, false);
    }
  }
}

/**
 * Determine if audio-only mode should be used based on network quality
 * 
 * @param networkQuality - Agora network quality (0-6). 0 = Unknown (no reading yet).
 * @param estimatedBandwidthKbps - Optional estimated bandwidth in kbps
 * @returns true if audio-only mode should be used
 */
export function shouldUseAudioOnlyMode(
  networkQuality: number,
  estimatedBandwidthKbps?: number
): boolean {
  // If bandwidth is explicitly provided and very low, use audio-only
  if (estimatedBandwidthKbps !== undefined && estimatedBandwidthKbps < 100) {
    return true;
  }

  // Don't treat 0 (Unknown) as poor - Agora reports 0 before it has real metrics.
  // Only use audio-only for definite "Bad" (1), not "Unknown" (0).
  return networkQuality === 1;
}

/**
 * Get Agora stream type (0 = HIGH, 1 = LOW) based on network quality
 * 
 * @param networkQuality - Agora network quality (0-6)
 * @returns 0 for HIGH quality, 1 for LOW quality
 */
export function getStreamTypeForQuality(networkQuality: number): number {
  // Start with LOW stream for poor networks, upgrade to HIGH when network improves
  if (networkQuality <= 2) {
    return 1; // LOW stream
  } else if (networkQuality >= 4) {
    return 0; // HIGH stream
  } else {
    // Fair network (3) - use LOW to be safe, can upgrade later
    return 1; // LOW stream
  }
}

/**
 * Get estimated data usage per hour for a given configuration
 * 
 * @param config - Network configuration
 * @returns Estimated MB per hour
 */
export function estimateDataUsagePerHour(config: PoorNetworkConfig): number {
  // Video bitrate (kbps) + Audio bitrate (kbps) * 3600 seconds / 8 bits per byte / 1024 KB per MB
  const totalBitrateKbps = config.shouldUseAudioOnly 
    ? config.audioBitrate 
    : (config.bitrate + config.audioBitrate);
  
  const mbPerHour = (totalBitrateKbps * 3600) / (8 * 1024);
  return Math.round(mbPerHour * 10) / 10; // Round to 1 decimal place
}

/**
 * Get human-readable network quality description
 * 
 * @param networkQuality - Agora network quality (0-6)
 * @returns Human-readable description
 */
export function getNetworkQualityDescription(networkQuality: number): string {
  switch (networkQuality) {
    case 0:
      return 'Unknown';
    case 1:
      return 'Very Poor (2G)';
    case 2:
      return 'Poor (2G/3G)';
    case 3:
      return 'Fair (3G)';
    case 4:
      return 'Good (3G/4G)';
    case 5:
      return 'Very Good (4G)';
    case 6:
      return 'Excellent (4G/5G)';
    default:
      return 'Unknown';
  }
}
