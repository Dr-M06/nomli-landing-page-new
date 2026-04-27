import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';


// Sound file paths (you'll need to add these to your assets)
// For now, we'll use system sounds or generate tones programmatically

class LiveStreamSoundManager {
  private soundsEnabled: boolean = true;
  private soundCache: Map<string, Audio.Sound> = new Map();
  private isInitialized: boolean = false;
  private currentlyPlaying: Map<string, Audio.Sound> = new Map(); // Track currently playing sounds
  private agoraAudioRestoreCallback: (() => Promise<void>) | null = null; // Callback to restore Agora audio after sound plays
  private lastPlayedReaction: Map<string, number> = new Map(); // Track last played reaction ID to prevent duplicates
  private readonly REACTION_COOLDOWN_MS = 500; // 500ms cooldown between same reaction sounds

  async initialize() {
    try {
      // IMPORTANT: Don't override Agora's audio session when it's active
      // CRITICAL: Setting audio mode can interrupt Agora's microphone audio
      // Best approach: Don't set audio mode at all - let Agora manage the audio session
      // expo-av sounds can play alongside Agora without explicit audio mode configuration
      if (this.isInitialized) {
        // Already initialized - don't reset audio mode (would interrupt Agora)
        log('🔊 LiveStreamSoundManager already initialized - skipping audio mode reset');
        return;
      }
      
      // SKIP setting audio mode entirely when Agora is active
      // Agora manages its own audio session, and setting audio mode here can interrupt it
      // expo-av sounds will play alongside Agora audio without explicit configuration
      // The key is to NOT interfere with Agora's audio session
      
      this.isInitialized = true;
      log('🔊 LiveStreamSoundManager initialized (skipping audio mode to avoid interrupting Agora)');
    } catch (error) {
      error('Error initializing sound manager:', error);
      // Don't throw - allow sounds to play even if initialization fails
      this.isInitialized = true; // Mark as initialized anyway to prevent retries
    }
  }

  setSoundsEnabled(enabled: boolean) {
    this.soundsEnabled = enabled;
    log(`🔊 Sounds ${enabled ? 'enabled' : 'disabled'}`);
  }

  isSoundsEnabled(): boolean {
    return this.soundsEnabled;
  }

  /**
   * Set callback to restore Agora audio after sound playback
   * This prevents sound effects from suppressing Agora's microphone
   */
  setAgoraAudioRestoreCallback(callback: (() => Promise<void>) | null) {
    this.agoraAudioRestoreCallback = callback;
    log('🔊 Agora audio restore callback set');
  }

  async playViewerJoinSound() {
    if (!this.soundsEnabled) return;
    
    try {
      // Don't call initialize() here - it resets audio mode and interrupts Agora
      // Initialize only once at startup, not every time we play a sound
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      // Play a subtle notification sound
      // On iOS, use system sound
      if (Platform.OS === 'ios') {
        // Use a short, pleasant notification sound
        // You can replace this with a custom sound file
        await this.playSystemSound('viewer_join');
      } else {
        // On Android, use a notification sound
        await this.playSystemSound('viewer_join');
      }
    } catch (error) {
      error('Error playing viewer join sound:', error);
    }
  }

  async playHonkSound() {
    if (!this.soundsEnabled) return;
    
    try {
      // Don't call initialize() here - it resets audio mode and interrupts Agora
      // Initialize only once at startup, not every time we play a sound
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      // Play honk sound (short, attention-grabbing)
      await this.playSystemSound('honk');
    } catch (error) {
      error('Error playing honk sound:', error);
    }
  }

  async playApplauseSound() {
    if (!this.soundsEnabled) return;
    
    try {
      // Don't call initialize() here - it resets audio mode and interrupts Agora
      // Initialize only once at startup, not every time we play a sound
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      // Play applause sound (cheerful, celebratory)
      await this.playSystemSound('applause');
    } catch (error) {
      error('Error playing applause sound:', error);
    }
  }

  private async playSystemSound(type: 'viewer_join' | 'honk' | 'applause') {
    // Stop any currently playing sound of the same type
    const currentSound = this.currentlyPlaying.get(type);
    if (currentSound) {
      try {
        const status = await currentSound.getStatusAsync();
        if (status.isLoaded) {
          await currentSound.stopAsync();
          await currentSound.unloadAsync();
        }
      } catch (error) {
        log(`🔊 Error stopping previous ${type} sound:`, error);
      }
      this.currentlyPlaying.delete(type);
    }

    try {
      // Local sound assets are optional in this project. Avoid static require() so
      // Metro never fails when files are missing during development builds.
      warn(`🔇 Skipping ${type} sound: local asset not bundled`);
      if (this.agoraAudioRestoreCallback) {
        await this.agoraAudioRestoreCallback();
      }
    } catch (error) {
      error(`Error handling ${type} sound fallback:`, error);
    }
  }

  async stopAllSounds() {
    // Stop all currently playing sounds
    for (const [type, sound] of this.currentlyPlaying.entries()) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          await sound.stopAsync();
          await sound.unloadAsync();
        }
      } catch (error) {
        error(`Error stopping ${type} sound:`, error);
      }
    }
    this.currentlyPlaying.clear();
  }

  // Deduplication methods to prevent same reaction from playing multiple times
  getLastPlayedTime(reactionKey: string): number | undefined {
    return this.lastPlayedReaction.get(reactionKey);
  }

  setLastPlayedTime(reactionKey: string, timestamp: number): void {
    this.lastPlayedReaction.set(reactionKey, timestamp);
    // Clean up old entries (older than 5 seconds) to prevent memory leak
    const now = Date.now();
    for (const [key, time] of this.lastPlayedReaction.entries()) {
      if (now - time > 5000) {
        this.lastPlayedReaction.delete(key);
      }
    }
  }

  async cleanup() {
    // Stop all currently playing sounds first
    await this.stopAllSounds();
    
    // Unload all cached sounds
    for (const [key, sound] of this.soundCache.entries()) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          await sound.stopAsync();
          await sound.unloadAsync();
        }
      } catch (error) {
        error(`Error unloading sound ${key}:`, error);
      }
    }
    this.soundCache.clear();
    this.lastPlayedReaction.clear();
  }
}

// Singleton instance
export const liveStreamSoundManager = new LiveStreamSoundManager();

