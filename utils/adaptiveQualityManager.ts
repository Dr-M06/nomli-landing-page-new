/**
 * Adaptive Quality Manager
 * 
 * Automatically adjusts video/audio quality for live streaming and calls
 * based on actual network speed detection
 * Optimized for Nigeria's varying network conditions
 */

import { log, warn, error } from './productionLogger';
import {
  detectNetworkSpeed,
  getVideoQualityForSpeed,
  getAudioQualityForSpeed,
  shouldUseAudioOnly,
  canUseHD,
  monitorNetworkSpeed,
  ConnectionSpeed,
  NetworkSpeedInfo,
} from './networkSpeedDetector';

export interface QualityConfig {
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
  minBitrate: number;
  maxBitrate: number;
  audioBitrate?: number;
  audioSampleRate?: number;
}

export interface AdaptiveQualityCallbacks {
  onQualityChange?: (config: QualityConfig) => void;
  onSpeedDetected?: (speedInfo: NetworkSpeedInfo) => void;
  onAudioOnlyMode?: (enabled: boolean) => void;
}

/**
 * Adaptive Quality Manager for Live Streaming and Calls
 */
export class AdaptiveQualityManager {
  private currentSpeed: NetworkSpeedInfo | null = null;
  private currentConfig: QualityConfig | null = null;
  private isLiveStream: boolean;
  private callbacks: AdaptiveQualityCallbacks;
  private monitorCleanup: (() => void) | null = null;
  private isAudioOnly: boolean = false;

  constructor(isLiveStream: boolean = false, callbacks: AdaptiveQualityCallbacks = {}) {
    this.isLiveStream = isLiveStream;
    this.callbacks = callbacks;
  }

  /**
   * Initialize and detect initial network speed
   */
  async initialize(): Promise<QualityConfig> {
    log('[AdaptiveQuality] Initializing adaptive quality manager...');
    
    // Detect initial network speed
    const speedInfo = await detectNetworkSpeed();
    this.currentSpeed = speedInfo;
    
    log('[AdaptiveQuality] Initial speed detected:', {
      speed: speedInfo.speed,
      estimatedKbps: speedInfo.estimatedKbps,
      isStable: speedInfo.isStable,
      connectionType: speedInfo.connectionType,
    });

    // Get initial quality config
    const config = this.getQualityConfig(speedInfo);
    this.currentConfig = config;

    // Notify callbacks
    if (this.callbacks.onSpeedDetected) {
      this.callbacks.onSpeedDetected(speedInfo);
    }
    if (this.callbacks.onQualityChange) {
      this.callbacks.onQualityChange(config);
    }

    // Check if audio-only mode is needed
    const shouldUseAudio = shouldUseAudioOnly(speedInfo);
    if (shouldUseAudio && !this.isAudioOnly) {
      this.isAudioOnly = true;
      if (this.callbacks.onAudioOnlyMode) {
        this.callbacks.onAudioOnlyMode(true);
      }
    }

    // Start monitoring network speed changes
    this.startMonitoring();

    return config;
  }

  /**
   * Get quality configuration for current network speed
   */
  private getQualityConfig(speedInfo: NetworkSpeedInfo): QualityConfig {
    const videoConfig = getVideoQualityForSpeed(speedInfo, this.isLiveStream);
    const audioConfig = getAudioQualityForSpeed(speedInfo);

    return {
      ...videoConfig,
      audioBitrate: audioConfig.bitrate,
      audioSampleRate: audioConfig.sampleRate,
    };
  }

  /**
   * Start monitoring network speed changes
   */
  private startMonitoring(): void {
    if (this.monitorCleanup) {
      this.monitorCleanup();
    }

    this.monitorCleanup = monitorNetworkSpeed(
      (speedInfo: NetworkSpeedInfo) => {
        log('[AdaptiveQuality] Network speed changed:', {
          speed: speedInfo.speed,
          estimatedKbps: speedInfo.estimatedKbps,
          previousSpeed: this.currentSpeed?.speed,
        });

        // Update current speed
        const previousSpeed = this.currentSpeed?.speed;
        this.currentSpeed = speedInfo;

        // Check if we need to switch to/from audio-only mode
        const shouldUseAudio = shouldUseAudioOnly(speedInfo);
        if (shouldUseAudio !== this.isAudioOnly) {
          this.isAudioOnly = shouldUseAudio;
          if (this.callbacks.onAudioOnlyMode) {
            this.callbacks.onAudioOnlyMode(shouldUseAudio);
          }
        }

        // Get new quality config
        const newConfig = this.getQualityConfig(speedInfo);
        
        // Only update if quality actually changed
        if (
          !this.currentConfig ||
          this.currentConfig.bitrate !== newConfig.bitrate ||
          this.currentConfig.width !== newConfig.width
        ) {
          this.currentConfig = newConfig;
          
          log('[AdaptiveQuality] Quality updated:', {
            width: newConfig.width,
            height: newConfig.height,
            bitrate: newConfig.bitrate,
            frameRate: newConfig.frameRate,
          });

          if (this.callbacks.onQualityChange) {
            this.callbacks.onQualityChange(newConfig);
          }
        }

        if (this.callbacks.onSpeedDetected) {
          this.callbacks.onSpeedDetected(speedInfo);
        }
      },
      30000 // Check every 30 seconds
    );
  }

  /**
   * Get current quality configuration
   */
  getCurrentConfig(): QualityConfig | null {
    return this.currentConfig;
  }

  /**
   * Get current network speed info
   */
  getCurrentSpeed(): NetworkSpeedInfo | null {
    return this.currentSpeed;
  }

  /**
   * Check if audio-only mode is active
   */
  isAudioOnlyMode(): boolean {
    return this.isAudioOnly;
  }

  /**
   * Manually trigger quality check
   */
  async checkQuality(): Promise<QualityConfig> {
    const speedInfo = await detectNetworkSpeed();
    this.currentSpeed = speedInfo;
    const config = this.getQualityConfig(speedInfo);
    this.currentConfig = config;

    if (this.callbacks.onQualityChange) {
      this.callbacks.onQualityChange(config);
    }

    return config;
  }

  /**
   * Cleanup and stop monitoring
   */
  cleanup(): void {
    if (this.monitorCleanup) {
      this.monitorCleanup();
      this.monitorCleanup = null;
    }
    this.currentSpeed = null;
    this.currentConfig = null;
    this.isAudioOnly = false;
  }
}

/**
 * Quick helper: Get quality config for live streaming
 */
export async function getAdaptiveQualityForLiveStream(): Promise<QualityConfig> {
  const speedInfo = await detectNetworkSpeed();
  const videoConfig = getVideoQualityForSpeed(speedInfo, true);
  const audioConfig = getAudioQualityForSpeed(speedInfo);
  
  return {
    ...videoConfig,
    audioBitrate: audioConfig.bitrate,
    audioSampleRate: audioConfig.sampleRate,
  };
}

/**
 * Quick helper: Get quality config for video calls
 */
export async function getAdaptiveQualityForCall(): Promise<QualityConfig> {
  const speedInfo = await detectNetworkSpeed();
  const videoConfig = getVideoQualityForSpeed(speedInfo, false);
  const audioConfig = getAudioQualityForSpeed(speedInfo);
  
  return {
    ...videoConfig,
    audioBitrate: audioConfig.bitrate,
    audioSampleRate: audioConfig.sampleRate,
  };
}

