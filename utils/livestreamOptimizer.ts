import { log, warn, error } from './productionLogger';
/**
 * Livestream Optimizer
 * Makes livestream lightweight by:
 * 1. Disabling debug logs in production
 * 2. Lazy loading heavy modules
 * 3. Optimizing network quality detection
 */

// Production-safe logging (disabled in production to reduce bundle size)
export const livestreamLog = (...args: any[]) => {
  if (__DEV__) {
    log(...args);
  }
};

export const livestreamWarn = (...args: any[]) => {
  if (__DEV__) {
    warn(...args);
  }
};

export const livestreamError = (...args: any[]) => {
  // Always log errors, even in production
  error(...args);
};

/**
 * Lazy load network speed detector (only when needed)
 * Reduces initial bundle size
 */
let networkSpeedDetector: any = null;
export const getNetworkSpeedDetector = async () => {
  if (!networkSpeedDetector) {
    networkSpeedDetector = await import('./networkSpeedDetector');
  }
  return networkSpeedDetector;
};

/**
 * Lazy load adaptive quality manager (only when needed)
 */
let adaptiveQualityManager: any = null;
export const getAdaptiveQualityManager = async () => {
  if (!adaptiveQualityManager) {
    adaptiveQualityManager = await import('./adaptiveQualityManager');
  }
  return adaptiveQualityManager;
};

/**
 * Optimized network quality detection
 * Uses cached result for 5 seconds to avoid repeated expensive calls
 */
let cachedSpeedInfo: { info: any; timestamp: number } | null = null;
const CACHE_DURATION = 5000; // 5 seconds

export const getCachedNetworkSpeed = async () => {
  const now = Date.now();
  if (cachedSpeedInfo && (now - cachedSpeedInfo.timestamp) < CACHE_DURATION) {
    return cachedSpeedInfo.info;
  }
  
  const { detectNetworkSpeed } = await getNetworkSpeedDetector();
  const info = await detectNetworkSpeed();
  cachedSpeedInfo = { info, timestamp: now };
  return info;
};

/**
 * Re-export network resilience utilities for convenience
 */
export {
  retryWithBackoff,
  detectNetworkError,
  getVideoEncoderConfigForQuality,
  hasConfigChanged,
  safeEngineOperation,
  getAdaptiveStreamType,
  getAdaptiveDebounceDelay,
  analyzeConnectionQuality,
  getDegradationStrategy,
} from './livestreamNetworkResilience';
