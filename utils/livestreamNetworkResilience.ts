/**
 * Livestream Network Resilience
 * Handles bad internet connections gracefully with:
 * 1. Unified retry logic with exponential backoff
 * 2. Network error detection
 * 3. Graceful degradation strategies
 * 4. Connection state monitoring
 */

import { livestreamLog, livestreamWarn, livestreamError } from './livestreamOptimizer';

// ============================================
// NETWORK ERROR DETECTION (DRY)
// ============================================

export interface NetworkErrorInfo {
  isNetworkError: boolean;
  isTimeout: boolean;
  isRetryable: boolean;
  error: any;
}

/**
 * Unified network error detection (DRY - used across codebase)
 */
export function detectNetworkError(error: any): NetworkErrorInfo {
  const errorMessage = error?.message || String(error || '');
  const errorCode = error?.code || error?.status;
  const errorName = error?.name || '';

  const isNetworkError =
    errorMessage.includes('Network request failed') ||
    errorMessage.includes('network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('Failed to fetch') ||
    errorCode === 'NETWORK_ERROR' ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ENOTFOUND' ||
    errorName === 'NetworkError';

  const isTimeout =
    errorMessage.includes('timeout') ||
    errorMessage.includes('upstream') ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 504 ||
    errorName === 'AbortError' ||
    errorName === 'TimeoutError';

  const isRetryable = isNetworkError || isTimeout || errorCode >= 500;

  return {
    isNetworkError,
    isTimeout,
    isRetryable,
    error,
  };
}

// ============================================
// RETRY UTILITY WITH EXPONENTIAL BACKOFF (DRY)
// ============================================

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryable?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryable: (error) => detectNetworkError(error).isRetryable,
  onRetry: () => {},
};

/**
 * Retry a function with exponential backoff (DRY - replaces repeated retry logic)
 * Optimized for bad internet connections with longer delays
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      if (!opts.retryable(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt >= opts.maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelay
      );

      opts.onRetry(attempt + 1, error);
      livestreamLog(`🔄 Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delay}ms`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================
// VIDEO ENCODER CONFIGURATION (DRY)
// ============================================

export interface VideoEncoderConfig {
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
  minFrameRate?: number;
  minBitrate?: number;
  maxBitrate?: number;
  orientationMode?: number;
}

/**
 * Get video encoder config based on network quality (DRY)
 * Quality levels: 0=unknown, 1=bad, 2=poor, 3=fair, 4=good, 5=very good, 6=excellent
 */
export function getVideoEncoderConfigForQuality(quality: number): VideoEncoderConfig {
  if (quality <= 2) {
    // Poor network: Low quality for bad connections
    return {
      width: 640,
      height: 360,
      bitrate: 400,
      frameRate: 15,
      minFrameRate: 10,
      orientationMode: 0,
    };
  } else if (quality <= 4) {
    // Medium network: Medium quality
    return {
      width: 960,
      height: 540,
      bitrate: 800,
      frameRate: 24,
      minFrameRate: 15,
      orientationMode: 0,
    };
  } else {
    // Good network: High quality
    return {
      width: 1280,
      height: 720,
      bitrate: 1200,
      frameRate: 30,
      minFrameRate: 20,
      orientationMode: 0,
    };
  }
}

/**
 * Check if config has changed (DRY - prevents unnecessary updates)
 */
export function hasConfigChanged(
  lastConfig: VideoEncoderConfig | null,
  newConfig: VideoEncoderConfig
): boolean {
  if (!lastConfig) return true;
  return (
    lastConfig.width !== newConfig.width ||
    lastConfig.height !== newConfig.height ||
    lastConfig.bitrate !== newConfig.bitrate
  );
}

// ============================================
// ENGINE OPERATION WRAPPER (DRY)
// ============================================

export interface EngineOperationOptions {
  retryOnFailure?: boolean;
  silentFail?: boolean;
  operationName?: string;
}

/**
 * Safely execute engine operations with retry (DRY)
 * Handles engine availability checks and retries
 */
export async function safeEngineOperation<T>(
  engine: any,
  operation: (engine: any) => Promise<T> | T,
  options: EngineOperationOptions = {}
): Promise<T | null> {
  const { retryOnFailure = true, silentFail = true, operationName = 'operation' } = options;

  if (!engine) {
    if (!silentFail) {
      livestreamWarn(`⚠️ Engine not available for ${operationName}`);
    }
    return null;
  }

  const execute = async (): Promise<T> => {
    if (!engine) {
      throw new Error('Engine not available');
    }
    const result = await operation(engine);
    return result;
  };

  try {
    if (retryOnFailure) {
      return await retryWithBackoff(execute, {
        maxRetries: 2,
        initialDelay: 500,
        retryable: (error) => {
          const networkError = detectNetworkError(error);
          return networkError.isRetryable || error?.message?.includes('Engine');
        },
      });
    } else {
      return await execute();
    }
  } catch (error: any) {
    if (!silentFail) {
      livestreamError(`❌ Failed ${operationName}:`, error);
    }
    return null;
  }
}

// ============================================
// CONNECTION QUALITY MONITORING
// ============================================

export interface ConnectionQuality {
  quality: number; // 0-6 Agora quality
  isPoor: boolean; // quality <= 2
  isGood: boolean; // quality >= 4
  shouldDegrade: boolean; // quality <= 2
  shouldUpgrade: boolean; // quality >= 5
}

/**
 * Analyze connection quality for adaptive behavior
 */
export function analyzeConnectionQuality(quality: number): ConnectionQuality {
  return {
    quality,
    isPoor: quality <= 2,
    isGood: quality >= 4,
    shouldDegrade: quality <= 2,
    shouldUpgrade: quality >= 5,
  };
}

/**
 * Get adaptive debounce delay based on connection quality
 * Faster response for poor connections (500ms) vs good connections (2s)
 */
export function getAdaptiveDebounceDelay(quality: number): number {
  return quality <= 2 ? 500 : 2000;
}

/**
 * Get stream type (0=HIGH, 1=LOW) based on connection quality
 */
export function getAdaptiveStreamType(quality: number, currentType: number): number {
  if (quality <= 2) return 1; // LOW for poor connections
  if (quality >= 4) return 0; // HIGH for good connections
  return currentType; // Keep current for medium
}

// ============================================
// GRACEFUL DEGRADATION STRATEGIES
// ============================================

export interface DegradationStrategy {
  enableAudioOnly: boolean;
  reduceQuality: boolean;
  increaseBuffering: boolean;
  disableEffects: boolean;
}

/**
 * Get degradation strategy for poor connections
 */
export function getDegradationStrategy(quality: number, consecutiveFailures: number): DegradationStrategy {
  const isVeryPoor = quality <= 1 || consecutiveFailures >= 3;
  
  return {
    enableAudioOnly: isVeryPoor, // Audio-only mode for very poor connections
    reduceQuality: quality <= 2,
    increaseBuffering: quality <= 2,
    disableEffects: quality <= 2, // Disable animations/effects to save bandwidth
  };
}

// ============================================
// STREAM SUBSCRIPTION HELPERS (DRY)
// ============================================

export interface SubscribeToRemoteStreamOptions {
  streamType?: number; // 0=HIGH, 1=LOW (default: 0 for HIGH)
  enableVideo?: boolean; // Default: true
  enableAudio?: boolean; // Default: true
  retryOnFailure?: boolean; // Default: true
  operationName?: string;
}

/**
 * Subscribe to a remote user's stream (DRY - replaces repeated subscription patterns)
 * Handles video unmuting, stream type setting, and audio unmuting in one call
 */
export async function subscribeToRemoteStream(
  engine: any,
  uid: number,
  options: SubscribeToRemoteStreamOptions = {}
): Promise<boolean> {
  const {
    streamType = 0, // HIGH by default
    enableVideo = true,
    enableAudio = true,
    retryOnFailure = true,
    operationName = `subscribeToRemoteStream(${uid})`,
  } = options;

  if (!engine) {
    livestreamWarn(`⚠️ Engine not available for ${operationName}`);
    return false;
  }

  const subscribe = async (): Promise<boolean> => {
    try {
      // Step 1: Unmute video (if enabled)
      if (enableVideo) {
        await engine.muteRemoteVideoStream(uid, false);
        await engine.setRemoteVideoStreamType(uid, streamType);
      }

      // Step 2: Unmute audio (if enabled)
      if (enableAudio) {
        await engine.muteRemoteAudioStream(uid, false);
      }

      return true;
    } catch (error: any) {
      const networkError = detectNetworkError(error);
      if (networkError.isRetryable) {
        throw error; // Retry if network error
      }
      // Non-retryable errors - log but don't throw
      livestreamWarn(`⚠️ Non-retryable error in ${operationName}:`, error);
      return false;
    }
  };

  if (retryOnFailure) {
    const result = await retryWithBackoff(subscribe, {
      maxRetries: 2,
      initialDelay: 500,
      retryable: (error) => detectNetworkError(error).isRetryable,
    });
    return result !== null && result !== false;
  } else {
    return await subscribe();
  }
}

/**
 * Unsubscribe from a remote user's stream (DRY)
 */
export async function unsubscribeFromRemoteStream(
  engine: any,
  uid: number,
  muteVideo: boolean = true,
  muteAudio: boolean = true
): Promise<boolean> {
  if (!engine) {
    return false;
  }

  try {
    if (muteVideo) {
      await engine.muteRemoteVideoStream(uid, true);
    }
    if (muteAudio) {
      await engine.muteRemoteAudioStream(uid, true);
    }
    return true;
  } catch (error: any) {
    livestreamWarn(`⚠️ Error unsubscribing from stream ${uid}:`, error);
    return false;
  }
}
