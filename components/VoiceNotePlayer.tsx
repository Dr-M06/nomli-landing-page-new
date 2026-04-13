import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Play, Pause, AlertCircle, RefreshCw, Download } from 'lucide-react-native';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { useAudio } from '../contexts/AudioContext';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import MediaTimerRing from './MediaTimerRing';
import { isMediaExpired, downloadAndSaveVoiceNote, markMediaAsDownloaded } from '../utils/mediaStorage';

import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/Theme';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Generate unique player ID
const generatePlayerId = () => `voice-player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface VoiceNotePlayerProps {
  audioUri: string;
  isUserMessage?: boolean;
  duration?: number; // Optional pre-known duration in seconds
  isLocal?: boolean;
  expiryAt?: string | null; // 24-hour expiry timestamp
  messageId?: string; // Message ID for marking as downloaded
}

// Create a global cache to track which files have been downloaded
const downloadedUriCache = new Map<string, string>();

// Check if a URI is already in the cache
const getFromCache = (uri: string): string | undefined => {
  return downloadedUriCache.get(uri);
};

// Add a URI to the cache
const addToCache = (originalUri: string, localUri: string): void => {
  downloadedUriCache.set(originalUri, localUri);
};

export default function VoiceNotePlayer({ 
  audioUri, 
  isUserMessage = false,
  duration = 0,
  isLocal = false,
  expiryAt = null,
  messageId
}: VoiceNotePlayerProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const { registerPlayer, unregisterPlayer, stopAllOthers } = useAudio();
  
  // Check cache first
  const cachedUri = audioUri ? getFromCache(audioUri) : undefined;
  
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(duration);
  const [isDownloading, setIsDownloading] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(cachedUri || null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [savingToDevice, setSavingToDevice] = useState(false);
  
  const expired = expiryAt ? isMediaExpired(expiryAt) : false;
  
  // Handle saving voice note to device
  const handleSaveToDevice = async () => {
    if (!audioUri || expired) {
      Alert.alert(
        'Voice Note Unavailable',
        expired 
          ? 'This voice note has expired. Ask the sender to resend.'
          : 'Voice note is not available for download.'
      )
      return
    }

    setSavingToDevice(true)
    try {
      // Use the cloud URL if available, otherwise use local URI
      const urlToSave = isCloudUrl(audioUri) ? audioUri : localUri || audioUri
      
      if (!urlToSave) {
        throw new Error('No URL available for saving')
      }

      const fileName = `voice_note_${Date.now()}.m4a`
      const success = await downloadAndSaveVoiceNote(urlToSave, fileName)

      if (success && messageId) {
        // Mark as downloaded in database
        await markMediaAsDownloaded(messageId)
        Alert.alert(
          '✅ Saved to Device!', 
          'Voice note saved to your device. This chat copy will auto-delete in 24 hours, but your saved copy is permanent.\n\nWe don\'t auto-save for your privacy — you choose what to keep!'
        )
      }
    } catch (error) {
      error('[VoiceNotePlayer] Error saving voice note:', error)
      Alert.alert('Error', 'Failed to save voice note. Please try again.')
    } finally {
      setSavingToDevice(false)
    }
  }
  
  // Debug logging for timer ring
  useEffect(() => {
    log('[VoiceNotePlayer] Timer ring debug:', {
      expiryAt,
      expired,
      hasExpiryAt: !!expiryAt,
      shouldShowTimer: expiryAt && !expired,
      audioUri: audioUri?.substring(0, 50)
    });
  }, [expiryAt, expired, audioUri]);
  
  // Format time remaining for popup
  const getTimeText = () => {
    if (!expiryAt) return ''
    const now = new Date().getTime()
    const expiry = new Date(expiryAt).getTime()
    const diffMs = expiry - now
    
    if (diffMs <= 0) return 'Expired'
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m`
    return '<1m'
  }
  
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);
  const playerIdRef = useRef<string>(generatePlayerId());
  
  // Waveform animation values
  const waveformAnimations = useRef(
    Array.from({ length: 30 }, () => new Animated.Value(0.3))
  ).current;
  
  // Animate waveform when playing
  useEffect(() => {
    if (isPlaying) {
      const animations = waveformAnimations.map((anim, index) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 0.3 + Math.random() * 0.7,
              duration: 200 + Math.random() * 300,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 200 + Math.random() * 300,
              useNativeDriver: true,
            }),
          ])
        );
      });
      
      Animated.parallel(animations).start();
    } else {
      // Reset all animations when paused
      waveformAnimations.forEach(anim => {
        anim.stopAnimation();
        anim.setValue(0.3);
      });
    }
  }, [isPlaying]);
  
  // Load sound only when user interacts with the player
  const initializePlayer = async () => {
    if (isInitialized) return;
    setIsInitialized(true);
    await loadSound();
  };
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      unregisterPlayer(playerIdRef.current);
      
      if (sound) {
        try {
          sound.getStatusAsync().then(status => {
            if (status.isLoaded) {
              sound.unloadAsync().catch(err => 
                log('[VoiceNotePlayer] Error unloading sound:', err)
              );
            }
          }).catch(err => {
            log('[VoiceNotePlayer] Error checking sound status during cleanup:', err);
          });
        } catch (err) {
          log('[VoiceNotePlayer] Error during sound cleanup:', err);
        }
      }
      
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current);
        playbackInterval.current = null;
      }
    };
  }, [sound, unregisterPlayer]);
  
  // Format seconds to MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Check if URI is a cloud URL
  const isCloudUrl = (uri: string): boolean => {
    // Basic check for http/https URLs
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return true;
    }
    
    // Handle Supabase storage URLs that might be relative paths
    // Example: {user_id}/{timestamp}_{random}.m4a
    if (uri && !uri.startsWith('file://') && uri.includes('/') && 
        (uri.endsWith('.m4a') || uri.endsWith('.mp3') || uri.endsWith('.aac'))) {
      log('[VoiceNotePlayer] Detected relative storage path:', uri);
      return true;
    }
    
    return false;
  };

  // Check if URI is a local file path (old voice notes)
  const isLocalFile = (uri: string): boolean => {
    return uri && uri.startsWith('file://');
  };
  
  // Download file from cloud if needed
  const downloadIfNeeded = async (uri: string): Promise<string> => {
    // If it's not a cloud URL, return as is
    if (!isCloudUrl(uri)) {
      return uri;
    }
    
    // Check global cache first
    const cachedLocalUri = getFromCache(uri);
    if (cachedLocalUri) {
      log('[VoiceNotePlayer] Using globally cached URI:', cachedLocalUri);
      setLocalUri(cachedLocalUri);
      return cachedLocalUri;
    }
    
    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      
      // Ensure directory exists
      const directory = FileSystem.documentDirectory + 'voice_notes/';
      try {
        const dirInfo = await FileSystem.getInfoAsync(directory);
        if (!dirInfo.exists) {
          log('[VoiceNotePlayer] Creating voice_notes directory');
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        }
      } catch (dirError) {
        error('[VoiceNotePlayer] Error creating directory:', dirError);
      }
      
      // Extract filename from URL or generate one
      // Handle the new path format with user ID: {user_id}/{filename}
      const urlParts = uri.split('/');
      const urlFilename = urlParts[(urlParts?.length || 0) - 1];
      
      // Generate a safe local filename
      const filename = urlFilename || `download_${Date.now()}.m4a`;
      const localPath = directory + filename;
      
      log('[VoiceNotePlayer] Using local path:', localPath);
      
      // Check if we already have this file cached
      try {
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (fileInfo.exists && fileInfo.size > 100) {
          log('[VoiceNotePlayer] Using cached file:', localPath);
          setIsDownloading(false);
          setDownloadProgress(100);
          setLocalUri(localPath);
          
          // Add to global cache
          addToCache(uri, localPath);
          
          return localPath;
        }
      } catch (cacheError) {
        log('[VoiceNotePlayer] Error checking cache:', cacheError);
      }
      
      // Create progress callback for download
      const progressCallback = (downloadProgress: FileSystem.DownloadProgressData) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite * 100;
        setDownloadProgress(Math.round(progress));
      };
      
      // Download with progress tracking
      try {
        log('[VoiceNotePlayer] Downloading from URL:', uri);
        const downloadResumable = FileSystem.createDownloadResumable(
          uri,
          localPath,
          {},
          progressCallback
        );
        
        const { uri: downloadedUri } = await downloadResumable.downloadAsync();
        
        if (!downloadedUri) {
          throw new Error('Download failed - no URI returned');
        }
        
        // Verify the downloaded file
        const fileInfo = await FileSystem.getInfoAsync(downloadedUri);
        if (!fileInfo.exists || fileInfo.size < 100) {
          throw new Error(`Downloaded file is invalid: exists=${fileInfo.exists}, size=${fileInfo.size}`);
        }
        
        log('[VoiceNotePlayer] Download successful:', downloadedUri);
        setLocalUri(downloadedUri);
        setDownloadProgress(100);
        
        // Add to global cache
        addToCache(uri, downloadedUri);
        
        return downloadedUri;
      } catch (downloadError) {
        error('[VoiceNotePlayer] Download error:', downloadError);
        throw downloadError;
      }
    } catch (error) {
      error('[VoiceNotePlayer] Download error:', error);
      throw error;
    } finally {
      setIsDownloading(false);
    }
  };
  
  // Load the sound file
  const loadSound = async (): Promise<Audio.Sound | null> => {
    try {
      setIsLoading(true);
      setLoadError(null);
      
      // Unload any existing sound
      if (sound) {
        await sound.unloadAsync();
      }
      
      // Configure audio for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      log('[VoiceNotePlayer] Loading audio from URI:', (audioUri?.length || 0) > 100 ? audioUri.substring(0, 100) + '...' : audioUri);
      
      // Always ensure the voice_notes directory exists first
      const directory = FileSystem.documentDirectory + 'voice_notes/';
      try {
        const dirInfo = await FileSystem.getInfoAsync(directory);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
          log('[VoiceNotePlayer] Created voice_notes directory');
        }
      } catch (dirError) {
        error('[VoiceNotePlayer] Error creating directory:', dirError);
        // Continue anyway - we'll handle file errors below
      }
      
      // Determine the actual file path to load
      let actualAudioUri = localUri || audioUri;
      
      // If this is a cloud URL and we don't have a local copy yet, download it
      if (isCloudUrl(audioUri) && !localUri) {
        try {
          actualAudioUri = await downloadIfNeeded(audioUri);
        } catch (downloadError) {
          error('[VoiceNotePlayer] Error downloading file:', downloadError);
          setLoadError('Failed to download audio');
          setIsLoading(false);
            return null;
        }
      }
      // If audioUri is just a filename (not a full path), construct the full path
      else if (!actualAudioUri.includes('/') && actualAudioUri.includes('voice_') && actualAudioUri.endsWith('.m4a')) {
        actualAudioUri = directory + actualAudioUri;
        log('[VoiceNotePlayer] Using constructed path:', actualAudioUri);
      }
      
      // Check if the file exists
      try {
        const fileInfo = await FileSystem.getInfoAsync(actualAudioUri);
        if (!fileInfo.exists) {
          error('[VoiceNotePlayer] File does not exist:', actualAudioUri);
          
          // If this is a cloud URL, try downloading again
          if (isCloudUrl(audioUri)) {
            try {
              log('[VoiceNotePlayer] Retrying download from cloud URL');
              actualAudioUri = await downloadIfNeeded(audioUri);
              
              // Check if the downloaded file exists
              const downloadedFileInfo = await FileSystem.getInfoAsync(actualAudioUri);
              if (!downloadedFileInfo.exists) {
                throw new Error('Downloaded file does not exist');
              }
            } catch (retryError) {
              error('[VoiceNotePlayer] Retry download failed:', retryError);
              setLoadError('Could not download voice note');
              setIsLoading(false);
              return null;
            }
          } else {
            // Try to list the directory to see what files are there
            try {
              const dirContents = await FileSystem.readDirectoryAsync(directory);
              log('[VoiceNotePlayer] Directory contents:', (dirContents?.length || 0), 'files');
              
              if ((dirContents?.length || 0) === 0) {
                setLoadError('No voice notes available');
                setIsLoading(false);
                return null;
              }
              
              // Extract user ID from filename if possible
              let userId = null;
              if (audioUri.includes('voice_')) {
                const parts = audioUri.split('_');
                if ((parts?.length || 0) > 1) {
                  userId = parts[1];
                  log('[VoiceNotePlayer] Extracted user ID:', userId);
                }
              }
              
              // Look for files from the same user or any voice note if user ID not available
              const userFiles = userId 
                ? dirContents.filter(file => file.includes(`voice_${userId}_`))
                : dirContents.filter(file => file.includes('voice_') && file.endsWith('.m4a'));
                
              log('[VoiceNotePlayer] Found files:', (userFiles?.length || 0));
              
              if ((userFiles?.length || 0) > 0) {
                // Try the most recent file
                const mostRecentFile = userFiles.sort().reverse()[0];
                const newPath = directory + mostRecentFile;
                log('[VoiceNotePlayer] Trying most recent file:', newPath);
                
                const altFileInfo = await FileSystem.getInfoAsync(newPath);
                if (altFileInfo.exists) {
                  log('[VoiceNotePlayer] Alternative file exists, using it');
                  actualAudioUri = newPath;
                } else {
                  throw new Error('Alternative file does not exist');
                }
              } else {
                throw new Error('No voice note files found');
              }
            } catch (dirErr) {
              error('[VoiceNotePlayer] Directory error:', dirErr);
              setLoadError('Voice note not available');
              setIsLoading(false);
              return null;
            }
          }
        } else {
          log('[VoiceNotePlayer] File exists, size:', fileInfo.size, 'bytes');
        }
      } catch (err) {
        error('[VoiceNotePlayer] Error checking file:', err);
        setLoadError('Cannot access voice note');
        setIsLoading(false);
        return null;
      }
      
      // Load the sound
      try {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: actualAudioUri },
          { shouldPlay: false },
          onPlaybackStatusUpdate
        );
        
        setSound(newSound);
        
        // Get duration if not provided
        if (!duration) {
          const status = await newSound.getStatusAsync();
          if (status.isLoaded) {
            setPlaybackDuration(status.durationMillis ? status.durationMillis / 1000 : 0);
          } else {
            // If we couldn't get the duration, use a default value
            setPlaybackDuration(10); // Default 10 seconds
          }
        } else {
          setPlaybackDuration(duration);
        }
        
        setIsLoading(false);
        return newSound; // Return the loaded sound
      } catch (loadErr) {
        error('[VoiceNotePlayer] Error loading sound:', loadErr);
        setLoadError('Failed to load audio');
        setPlaybackDuration(0);
        setPlaybackPosition(0);
      setIsLoading(false);
        return null;
      }
    } catch (err) {
      error('[VoiceNotePlayer] Error in loadSound:', err);
      setIsLoading(false);
      setLoadError('Failed to load audio');
      setPlaybackDuration(0);
      setPlaybackPosition(0);
      return null;
    }
  };
  
  // Handle playback status updates
  const onPlaybackStatusUpdate = (status: Audio.AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    
    // Update position for progress bar
    setPlaybackPosition(status.positionMillis / 1000);
    
    if (status.didJustFinish) {
      // Playback finished - ensure progress shows 100%
      setIsPlaying(false);
      setPlaybackPosition(playbackDuration);
      
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current);
        playbackInterval.current = null;
      }
      
      // Unregister this player since it finished playing
      unregisterPlayer(playerIdRef.current);
      
      // Reset sound position to beginning for replay
      try {
        // Only reset if sound is loaded
        if (sound && status.isLoaded) {
          sound.setPositionAsync(0).catch(err => {
            log('[VoiceNotePlayer] Could not reset position:', err);
          });
        }
      } catch (err) {
        error('[VoiceNotePlayer] Error resetting position:', err);
      }
    }
  };
  
  // Update playback status for progress tracking
  const updatePlaybackStatus = async () => {
    if (sound && isPlaying) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          setPlaybackPosition(status.positionMillis / 1000);
        }
      } catch (err) {
        log('[VoiceNotePlayer] Error updating playback status:', err);
      }
    }
  };

  // Stop function that can be called by the audio context
  const stopPlayback = async () => {
    if (sound && isPlaying) {
      try {
        await sound.pauseAsync();
        setIsPlaying(false);
        
        if (playbackInterval.current) {
          clearInterval(playbackInterval.current);
          playbackInterval.current = null;
        }
        
        unregisterPlayer(playerIdRef.current);
      } catch (err) {
        log('[VoiceNotePlayer] Error stopping playback:', err);
      }
    }
  };

  // Toggle playback
  const togglePlayback = async () => {
    try {
    // If there was an error, try to reload the sound
    if (loadError) {
      await loadSound();
      return;
    }
    
      // Initialize and load sound if not already done, then auto-play
      if (!isInitialized || !sound) {
        setIsInitialized(true);
        const loadedSound = await loadSound();
        
        // If loadSound successfully created a sound, start playing immediately
        if (loadedSound) {
          try {
            await stopAllOthers(playerIdRef.current);
            await loadedSound.playAsync();
            setIsPlaying(true);
            registerPlayer(playerIdRef.current, stopPlayback);
            
            if (!playbackInterval.current) {
              playbackInterval.current = setInterval(updatePlaybackStatus, 250);
            }
          } catch (autoPlayError) {
            error('[VoiceNotePlayer] Error auto-playing after load:', autoPlayError);
          }
        }
      return;
    }
    
      if (isPlaying) {
        // Pause playback
        await sound.pauseAsync();
        setIsPlaying(false);
        
        if (playbackInterval.current) {
          clearInterval(playbackInterval.current);
          playbackInterval.current = null;
        }
        
        unregisterPlayer(playerIdRef.current);
      } else {
        // Stop all other players before starting this one
        await stopAllOthers(playerIdRef.current);
        try {
          // Check if we're at the end and need to restart
          const status = await sound.getStatusAsync();
          if (status.isLoaded && status.positionMillis >= status.durationMillis - 50) {
            // We're at the end, reset position to start
            await sound.setPositionAsync(0);
            setPlaybackPosition(0);
          } else if (status.isLoaded) {
            // Update position based on current status
            setPlaybackPosition(status.positionMillis / 1000);
          }
          
          // Start or resume playback
          await sound.playAsync();
          setIsPlaying(true);
          
          // Register this player with the audio context
          registerPlayer(playerIdRef.current, stopPlayback);
          
          // Start progress tracking interval
          if (!playbackInterval.current) {
            playbackInterval.current = setInterval(updatePlaybackStatus, 250);
          }
        } catch (playError) {
          error('[VoiceNotePlayer] Error starting playback:', playError);
          // Try to reload the sound
          await loadSound();
        }
      }
    } catch (toggleError) {
      error('[VoiceNotePlayer] Error toggling playback:', toggleError);
    }
  };
  
  // Calculate progress percentage
  const progressPercentage = playbackDuration > 0 
    ? Math.min(100, (playbackPosition / playbackDuration) * 100)
    : 0;
  
  // Calculate bubble width based on duration (WhatsApp style)
  const calculateBubbleWidth = () => {
    const minWidth = 180;
    const maxWidth = Math.min(SCREEN_WIDTH * 0.65, 260);
    const durationSeconds = playbackDuration || duration || 10;
    // Scale width based on duration: 10s = minWidth, 60s = maxWidth
    const width = Math.max(minWidth, Math.min(maxWidth, minWidth + (durationSeconds / 60) * (maxWidth - minWidth)));
    return width;
  };
  
  // Render waveform bars
  const renderWaveform = () => {
    const numBars = 30;
    const barWidth = 2.5;
    const barSpacing = 2;
    const maxBarHeight = 20;
    const minBarHeight = 3;
    
    return (
      <View style={styles.waveformContainer}>
        {waveformAnimations.map((anim, index) => {
          // Use scaleY transform instead of height animation
          const scaleY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [minBarHeight / maxBarHeight, 1],
          });
          
          return (
            <View
              key={index}
              style={[
                styles.waveformBarWrapper,
                {
                  marginRight: index < numBars - 1 ? barSpacing : 0,
                }
              ]}
            >
              <Animated.View
                style={[
                  styles.waveformBar,
                  {
                    width: barWidth,
                    height: maxBarHeight,
                    backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.8)' : themeColors.primary.main,
                    transform: [{ scaleY }],
                  }
                ]}
              />
            </View>
          );
        })}
      </View>
    );
  };
  
  // Get colors based on message type
  const getBubbleColor = () => {
    if (isUserMessage) {
      return themeColors.primary.main;
    } else {
      return themeColors.neutral.card;
    }
  };
  
  const getTextColor = () => {
    if (isUserMessage) {
      return 'white';
    } else {
      return themeColors.neutral.text;
    }
  };
  
  const getProgressBarBgColor = () => {
    if (isUserMessage) {
      return 'rgba(255, 255, 255, 0.3)';
    } else {
      return themeColors.neutral.border;
    }
  };
  
  const getProgressBarColor = () => {
    if (isUserMessage) {
      return 'white';
    } else {
      return themeColors.primary.main;
    }
  };
  
  // Render a download button for cloud URLs
  const renderDownloadButton = () => {
    return (
      <View style={[
        styles.container,
        styles.voiceNoteContainer,
        { 
          backgroundColor: getBubbleColor(),
          width: calculateBubbleWidth(),
        }
      ]}>
        {/* Floating countdown popup */}
        {showCountdown && expiryAt && !expired && (
          <View style={styles.floatingPopup}>
            <Text style={styles.floatingPopupText}>{getTimeText()}</Text>
          </View>
        )}
        
        {/* Timer ring overlay */}
        {expiryAt && !expired && (
          <TouchableOpacity 
            style={styles.timerRingOverlay}
            onPress={(e) => {
              e.stopPropagation();
              setShowCountdown(!showCountdown);
            }}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MediaTimerRing 
              expiryAt={expiryAt} 
              size={20} 
              strokeWidth={1.5}
              showLabel={false}
            />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          onPress={() => downloadIfNeeded(audioUri).then(() => loadSound())}
          style={[
            styles.playButton,
            { backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.25)' : themeColors.primary.main }
          ]}
          disabled={isDownloading}
        >
          {isDownloading ? (
              <ActivityIndicator size="small" color={isUserMessage ? 'white' : 'white'} />
          ) : (
            <Download size={18} color={isUserMessage ? 'white' : 'white'} strokeWidth={2.5} />
          )}
        </TouchableOpacity>
        
        <View style={styles.waveformTimeContainer}>
          <Text style={[styles.timeText, { color: getTextColor() }]}>
            {isDownloading ? `Downloading... ${downloadProgress}%` : 'Tap to download'}
          </Text>
        </View>
        
        {/* Save to device button */}
        {!expired && audioUri && (
          <TouchableOpacity 
            onPress={handleSaveToDevice}
            style={[
              styles.saveButton,
              { backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' }
            ]}
            disabled={savingToDevice}
          >
            {savingToDevice ? (
              <ActivityIndicator size="small" color={isUserMessage ? 'white' : themeColors.primary.main} />
            ) : (
              <Download size={14} color={isUserMessage ? 'white' : themeColors.primary.main} strokeWidth={2} />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Render an error state
  const renderErrorState = () => {
    return (
      <View style={styles.outerWrapper}>
      <View style={[
        styles.container,
        styles.voiceNoteContainer,
        { 
          backgroundColor: getBubbleColor(),
          width: calculateBubbleWidth(),
        }
      ]}>
          <View style={styles.mainContentRow}>
        <TouchableOpacity 
          onPress={loadSound}
          style={[
            styles.playButton,
            { backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 0, 0, 0.2)' }
          ]}
        >
              <AlertCircle size={16} color={isUserMessage ? 'white' : 'white'} strokeWidth={2.5} />
        </TouchableOpacity>
        
        <View style={styles.waveformTimeContainer}>
          <Text style={[styles.timeText, { color: getTextColor() }]}>
            {loadError}
          </Text>
          <Text style={[styles.retryText, { color: getTextColor() }]}>
            Tap to retry
          </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Render a local file error state (for old voice notes)
  const renderLocalFileError = () => {
    return (
      <View style={styles.outerWrapper}>
      <View style={[
        styles.container,
        styles.voiceNoteContainer,
        { 
          backgroundColor: getBubbleColor(),
          width: calculateBubbleWidth(),
        }
      ]}>
          <View style={styles.mainContentRow}>
        <View style={[
          styles.playButton,
          { backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 165, 0, 0.2)' }
        ]}>
              <AlertCircle size={16} color={isUserMessage ? 'white' : '#FF8C00'} strokeWidth={2.5} />
        </View>
        
        <View style={styles.waveformTimeContainer}>
          <Text style={[styles.timeText, { color: getTextColor() }]}>
            Voice note not accessible
          </Text>
          <Text style={[styles.retryText, { color: getTextColor() }]}>
            This voice note is no longer available
          </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };
  
  // If it's a local file path (old voice notes), show error
  if (isLocalFile(audioUri)) {
    return renderLocalFileError();
  }
  
  // If there's an error, show error state
  if (loadError) {
    return renderErrorState();
  }
  
  // Show expired state
  if (expired) {
  return (
      <View style={styles.outerWrapper}>
    <View style={[
      styles.container,
      styles.voiceNoteContainer,
      { 
        backgroundColor: getBubbleColor(),
        width: calculateBubbleWidth(),
      }
    ]}>
          <View style={styles.mainContentRow}>
            <View style={[
              styles.playButton,
              { backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 165, 0, 0.2)' }
            ]}>
              <AlertCircle size={16} color={isUserMessage ? 'white' : '#FF8C00'} strokeWidth={2.5} />
            </View>
            
            <View style={styles.waveformTimeContainer}>
              <Text style={[styles.timeText, { color: getTextColor() }]}>
                Voice note expired
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.outerWrapper}>
      {/* Floating countdown popup - positioned outside main container */}
      {showCountdown && expiryAt && !expired && (
        <View style={styles.floatingPopup}>
          <Text style={styles.floatingPopupText}>{getTimeText()}</Text>
        </View>
      )}
      
      <View style={[
        styles.container,
        styles.voiceNoteContainer,
        { 
          backgroundColor: getBubbleColor(),
          width: calculateBubbleWidth(),
        }
      ]}>
        {/* Top row: Timer and Save button */}
        <View style={styles.topActionsRow}>
          {/* Timer ring */}
          {expiryAt && !expired && (
            <TouchableOpacity 
              style={styles.timerButton}
              onPress={(e) => {
                e.stopPropagation();
                setShowCountdown(!showCountdown);
              }}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MediaTimerRing 
                expiryAt={expiryAt} 
                size={18} 
                strokeWidth={1.5}
                showLabel={false}
              />
            </TouchableOpacity>
          )}
          
          {/* Spacer */}
          <View style={{ flex: 1 }} />
          
          {/* Save to device button */}
          {!expired && audioUri && !isLoading && (
            <TouchableOpacity 
              onPress={handleSaveToDevice}
              style={[
                styles.saveButtonTop,
                { backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)' }
              ]}
              disabled={savingToDevice}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {savingToDevice ? (
                <ActivityIndicator size="small" color={isUserMessage ? 'white' : themeColors.primary.main} />
              ) : (
                <Download size={13} color={isUserMessage ? 'white' : themeColors.primary.main} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          )}
        </View>
        
        {/* Main content row: Play button + Waveform */}
        <View style={styles.mainContentRow}>
      {/* Play/Pause button */}
      <TouchableOpacity 
        onPress={togglePlayback}
        style={[
          styles.playButton,
          { backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.25)' : themeColors.primary.main }
        ]}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={isUserMessage ? 'white' : 'white'} />
        ) : (
          isPlaying ? (
            <Pause size={16} color={isUserMessage ? 'white' : 'white'} strokeWidth={2.5} />
          ) : (
            <Play size={16} color={isUserMessage ? 'white' : 'white'} strokeWidth={2.5} />
          )
        )}
      </TouchableOpacity>
      
      {/* Waveform and time container */}
      <View style={styles.waveformTimeContainer}>
        {/* Waveform visualization */}
        {renderWaveform()}
        
        {/* Time display */}
          <Text style={[styles.timeText, { color: getTextColor() }]}>
            {formatTime(playbackPosition)} / {formatTime(playbackDuration)}
          </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    position: 'relative',
    width: '100%',
    overflow: 'visible',
    zIndex: 1,
  },
  container: {
    flexDirection: 'column',
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: BorderRadius.lg + 2,
    gap: Spacing.xs,
    overflow: 'visible',
  },
  voiceNoteContainer: {
    minWidth: 180,
    maxWidth: 260,
  },
  playButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  waveformTimeContainer: {
    flex: 1,
    alignItems: 'flex-start',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginBottom: 1,
    height: 20,
  },
  waveformBarWrapper: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: 20,
  },
  waveformBar: {
    borderRadius: 1.5,
  },
  downloadButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  errorButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
  },
  progressContainer: {
    flex: 1,
  },
  progressBarContainer: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
    marginTop: 2,
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  timeText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
    marginTop: 1,
    letterSpacing: 0.3,
  },
  errorText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
    marginBottom: 2,
  },
  retryText: {
    fontSize: FontSizes.xs - 1,
    fontFamily: FontFamily.regular,
    opacity: 0.7,
    marginTop: 2,
  },
  downloadTextContainer: {
    flex: 1,
  },
  downloadText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
  },
  downloadProgressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadProgressText: {
    fontSize: 8,
    color: 'white',
    marginTop: 2,
    textAlign: 'center',
  },
  voiceNoteCaption: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  floatingPopup: {
    position: 'absolute',
    top: -40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  floatingPopupText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.4,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  timerButton: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonTop: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
}); 