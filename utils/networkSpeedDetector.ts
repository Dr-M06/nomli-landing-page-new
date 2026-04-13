/**
 * Network Speed Detector
 * 
 * Detects actual internet connection speed and quality
 * Optimized for Nigeria's varying network conditions
 * Automatically adjusts video/audio quality for live streaming and calls
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';


export enum ConnectionSpeed {
  VERY_SLOW = 'very_slow',    // < 50 kbps (2G/Edge) - Africa optimized
  SLOW = 'slow',              // 50-200 kbps (3G weak) - Africa optimized
  MODERATE = 'moderate',      // 200-500 kbps (3G/4G weak) - Africa optimized
  GOOD = 'good',              // 500-2000 kbps (4G) - Africa optimized
  EXCELLENT = 'excellent',    // > 2000 kbps (4G+/WiFi) - Africa optimized
}

export interface NetworkSpeedInfo {
  speed: ConnectionSpeed;
  estimatedKbps: number;
  isStable: boolean;
  connectionType: string;
  isWiFi: boolean;
  isMobile: boolean;
}

/**
 * Measure actual network speed by downloading a small test file
 * This gives real-world speed measurement, not just connection type
 */
export async function measureNetworkSpeed(): Promise<number> {
  try {
    // Use a very small test file to measure actual download speed
    // Optimized for Nigeria: Use Cloudflare CDN (fastest in Africa)
    // Reduced timeout and file size for faster measurement
    const testUrls = [
      'https://www.cloudflare.com/favicon.ico', // Cloudflare CDN (best in Africa) - try first
      'https://cdn.jsdelivr.net/npm/react@18/favicon.ico', // CDN with global edge
      'https://www.google.com/favicon.ico', // Small file (~4KB), widely available globally
    ];

    const startTime = Date.now();
    let downloadedBytes = 0;

    // Only try first URL to avoid multiple slow requests in Nigeria
    // If first fails, fallback to others
    for (const url of testUrls) {
      try {
        const controller = new AbortController();
        // Reduced timeout from 5s to 3s for faster failure in slow networks
        const timeout = setTimeout(() => controller.abort(), 3000);

        // Actually download the file to measure real speed
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          // Get the actual downloaded bytes
          const blob = await response.blob();
          downloadedBytes = blob.size;
          
          // If blob size is 0, try Content-Length header
          if (downloadedBytes === 0) {
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
              downloadedBytes = parseInt(contentLength, 10);
            }
          }
          
          if (downloadedBytes > 0) {
            break; // Successfully measured, exit loop
          }
        }
      } catch (error) {
        // Silently continue to next URL - don't log every failure
        continue;
      }
    }

    const duration = (Date.now() - startTime) / 1000; // seconds
    if (duration === 0 || downloadedBytes === 0) {
      // Don't log warning - just return 0 silently
      return 0;
    }

    // Calculate speed in kbps (kilobits per second)
    // downloadedBytes is in bytes, multiply by 8 to get bits, divide by 1000 to get kbps
    const speedKbps = (downloadedBytes * 8) / (duration * 1000);
    
    // Only log in dev mode to reduce console spam
    if (__DEV__) {
    log('[NetworkSpeed] Speed measured:', {
      downloadedBytes,
      duration: duration.toFixed(2),
      speedKbps: speedKbps.toFixed(2),
    });
    }
    
    return speedKbps;
  } catch (error) {
    // Don't log errors - just return 0 silently
    return 0;
  }
}

/**
 * Get network speed category based on measured speed and connection type
 */
export async function detectNetworkSpeed(): Promise<NetworkSpeedInfo> {
  try {
    const netInfo = await NetInfo.fetch();
    const connectionType = netInfo.type;
    const isWiFi = connectionType === 'wifi';
    const isMobile = ['cellular', '2g', '3g', '4g'].includes(connectionType);

    // Measure actual speed
    const speedKbps = await measureNetworkSpeed();

    // Determine speed category
    let speed: ConnectionSpeed;
    let isStable = true;

    if (speedKbps === 0) {
      // Can't measure - use connection type as fallback (Africa-optimized thresholds)
      if (isWiFi) {
        speed = ConnectionSpeed.MODERATE; // Be conservative for WiFi in Africa
      } else if (connectionType === '4g') {
        speed = ConnectionSpeed.SLOW; // 4G in Africa is often slower than advertised
      } else if (connectionType === '3g') {
        speed = ConnectionSpeed.VERY_SLOW;
      } else {
        speed = ConnectionSpeed.VERY_SLOW;
      }
      isStable = false;
    } else if (speedKbps < 50) {
      // Africa-optimized: Lower threshold for very slow
      speed = ConnectionSpeed.VERY_SLOW;
      isStable = false;
    } else if (speedKbps < 200) {
      // Africa-optimized: Lower threshold for slow
      speed = ConnectionSpeed.SLOW;
      isStable = speedKbps > 100; // More stable if > 100 kbps
    } else if (speedKbps < 500) {
      // Africa-optimized: Lower threshold for moderate
      speed = ConnectionSpeed.MODERATE;
      isStable = speedKbps > 300;
    } else if (speedKbps < 2000) {
      // Africa-optimized: Lower threshold for good
      speed = ConnectionSpeed.GOOD;
      isStable = speedKbps > 800;
    } else {
      speed = ConnectionSpeed.EXCELLENT;
      isStable = true;
    }

    // AFRICA-OPTIMIZED: Be extra conservative for mobile networks
    if (isMobile && !isWiFi) {
      // Mobile networks in Africa are often less stable and slower
      if (speed === ConnectionSpeed.EXCELLENT && speedKbps < 3000) {
        speed = ConnectionSpeed.GOOD; // Be conservative
      }
      if (speed === ConnectionSpeed.GOOD && speedKbps < 1000) {
        speed = ConnectionSpeed.MODERATE; // Be very conservative
      }
      // Mark as less stable if on mobile (Africa networks are more variable)
      if (speedKbps < 800) {
        isStable = false;
      }
      // Even "good" mobile networks in Africa can be unstable
      if (speedKbps < 2000) {
        isStable = false;
      }
    }

    return {
      speed,
      estimatedKbps: speedKbps,
      isStable,
      connectionType,
      isWiFi,
      isMobile,
    };
  } catch (error) {
    error('[NetworkSpeed] Error detecting speed:', error);
    // Fallback to moderate speed
    return {
      speed: ConnectionSpeed.MODERATE,
      estimatedKbps: 500,
      isStable: false,
      connectionType: 'unknown',
      isWiFi: false,
      isMobile: true,
    };
  }
}

/**
 * Get recommended video quality settings based on network speed
 * Optimized for Nigeria's network conditions
 */
export function getVideoQualityForSpeed(
  networkSpeed: NetworkSpeedInfo,
  isLiveStream: boolean = false
): {
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
  minBitrate: number;
  maxBitrate: number;
} {
  const { speed, isStable, estimatedKbps } = networkSpeed;

  // AFRICA-OPTIMIZED: Be extra conservative for live streaming
  if (isLiveStream) {
    switch (speed) {
      case ConnectionSpeed.VERY_SLOW:
        return {
          width: 240,
          height: 135,
          bitrate: 100,
          frameRate: 8,
          minBitrate: 50,
          maxBitrate: 150,
        };
      case ConnectionSpeed.SLOW:
        return {
          width: 320,
          height: 180,
          bitrate: 200,
          frameRate: 10,
          minBitrate: 150,
          maxBitrate: 250,
        };
      case ConnectionSpeed.MODERATE:
        return {
          width: 480,
          height: 270,
          bitrate: 350,
          frameRate: 12,
          minBitrate: 250,
          maxBitrate: 450,
        };
      case ConnectionSpeed.GOOD:
        return {
          width: 640,
          height: 360,
          bitrate: 600,
          frameRate: 20,
          minBitrate: 400,
          maxBitrate: 800,
        };
      case ConnectionSpeed.EXCELLENT:
        return {
          width: 960,
          height: 540,
          bitrate: 1000,
          frameRate: 24,
          minBitrate: 800,
          maxBitrate: 1200,
        };
      default:
        return {
          width: 320,
          height: 180,
          bitrate: 200,
          frameRate: 10,
          minBitrate: 150,
          maxBitrate: 250,
        };
    }
  } else {
    // AFRICA-OPTIMIZED: Be conservative for video calls too
    switch (speed) {
      case ConnectionSpeed.VERY_SLOW:
        return {
          width: 240,
          height: 180,
          bitrate: 120,
          frameRate: 8,
          minBitrate: 80,
          maxBitrate: 150,
        };
      case ConnectionSpeed.SLOW:
        return {
          width: 320,
          height: 240,
          bitrate: 250,
          frameRate: 10,
          minBitrate: 200,
          maxBitrate: 300,
        };
      case ConnectionSpeed.MODERATE:
        return {
          width: 480,
          height: 360,
          bitrate: 400,
          frameRate: 15,
          minBitrate: 300,
          maxBitrate: 500,
        };
      case ConnectionSpeed.GOOD:
        return {
          width: 640,
          height: 480,
          bitrate: 700,
          frameRate: 20,
          minBitrate: 500,
          maxBitrate: 900,
        };
      case ConnectionSpeed.EXCELLENT:
        return {
          width: 960,
          height: 720,
          bitrate: 1200,
          frameRate: 24,
          minBitrate: 1000,
          maxBitrate: 1500,
        };
      default:
        return {
          width: 320,
          height: 240,
          bitrate: 250,
          frameRate: 10,
          minBitrate: 200,
          maxBitrate: 300,
        };
    }
  }
}

/**
 * Get recommended audio quality settings
 */
export function getAudioQualityForSpeed(
  networkSpeed: NetworkSpeedInfo
): {
  bitrate: number;
  sampleRate: number;
} {
  const { speed } = networkSpeed;

  // AFRICA-OPTIMIZED: Lower audio bitrates to reduce data usage
  switch (speed) {
    case ConnectionSpeed.VERY_SLOW:
      return {
        bitrate: 16000, // 16 kbps (very low for Africa)
        sampleRate: 8000,
      };
    case ConnectionSpeed.SLOW:
      return {
        bitrate: 24000, // 24 kbps
        sampleRate: 16000,
      };
    case ConnectionSpeed.MODERATE:
      return {
        bitrate: 32000, // 32 kbps
        sampleRate: 16000,
      };
    case ConnectionSpeed.GOOD:
      return {
        bitrate: 48000, // 48 kbps
        sampleRate: 24000,
      };
    case ConnectionSpeed.EXCELLENT:
      return {
        bitrate: 64000, // 64 kbps
        sampleRate: 48000,
      };
    default:
      return {
        bitrate: 24000, // Default to lower bitrate for Africa
        sampleRate: 16000,
      };
  }
}

/**
 * Monitor network speed changes and provide callbacks
 */
export function monitorNetworkSpeed(
  onSpeedChange: (speedInfo: NetworkSpeedInfo) => void,
  intervalMs: number = 30000 // Check every 30 seconds
): () => void {
  let isMonitoring = true;
  let lastSpeed: NetworkSpeedInfo | null = null;

  const checkSpeed = async () => {
    if (!isMonitoring) return;

    try {
      const speedInfo = await detectNetworkSpeed();

      // Only notify if speed category changed
      if (!lastSpeed || lastSpeed.speed !== speedInfo.speed) {
        onSpeedChange(speedInfo);
        lastSpeed = speedInfo;
      }
    } catch (error) {
      error('[NetworkSpeed] Error in monitor:', error);
    }

    if (isMonitoring) {
      setTimeout(checkSpeed, intervalMs);
    }
  };

  // Start monitoring
  checkSpeed();

  // Also listen to NetInfo changes for immediate updates
  const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    if (isMonitoring && state.isConnected) {
      // Network state changed, check speed immediately
      checkSpeed();
    }
  });

  // Return cleanup function
  return () => {
    isMonitoring = false;
    unsubscribe();
  };
}

/**
 * Quick check: Should we use audio-only mode?
 */
export function shouldUseAudioOnly(networkSpeed: NetworkSpeedInfo): boolean {
  return (
    networkSpeed.speed === ConnectionSpeed.VERY_SLOW ||
    (networkSpeed.speed === ConnectionSpeed.SLOW && !networkSpeed.isStable)
  );
}

/**
 * Quick check: Can we use HD quality?
 */
export function canUseHD(networkSpeed: NetworkSpeedInfo): boolean {
  return (
    networkSpeed.speed === ConnectionSpeed.EXCELLENT ||
    (networkSpeed.speed === ConnectionSpeed.GOOD && networkSpeed.isStable && networkSpeed.estimatedKbps > 3000)
  );
}

