import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Animated, 
  Easing,
  Platform,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Audio } from 'expo-av';
import { Mic, Play, Pause, Send, Trash2, X, Upload } from 'lucide-react-native';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { FontFamily, FontSizes, Spacing, BorderRadius, Shadow } from '../constants/Theme';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { uploadAudioToSupabase } from '../utils/audioStorage';
import { uploadAudioToSupabaseAlternative } from '../utils/audioStorageAlternative';
import { uploadAudioToSupabaseSimple } from '../utils/audioStorageSimple';
import { log, warn, error } from '../utils/productionLogger';



interface VoiceRecorderProps {
  onSend: (audioUri: string, isCloudUrl?: boolean, duration?: number) => void;
  onCancel: () => void;
  maxDuration?: number; // Maximum recording duration in seconds
  userId?: string; // User ID for creating predictable filenames
}

export default function VoiceRecorder({ 
  onSend, 
  onCancel,
  maxDuration = 60, // Default max duration: 60 seconds
  userId
}: VoiceRecorderProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // Recording states
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingPermission, setRecordingPermission] = useState<boolean | null>(null);
  
  // Playback states
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  
  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Animation refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const outerPulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.8)).current;
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Request recording permissions on mount
  useEffect(() => {
    const getPermissions = async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        setRecordingPermission(status === 'granted');
        
        if (status !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Please grant microphone permission to record voice notes',
            [{ text: 'OK' }]
          );
        }
        
        // Set audio mode for recording
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (err) {
        error('Error requesting recording permission:', err);
        setRecordingPermission(false);
      }
    };
    
    getPermissions();
    
    // Clean up on unmount
    return () => {
      // Clean up intervals and timeouts
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
      
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
        maxDurationTimeoutRef.current = null;
      }
      
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current);
        playbackInterval.current = null;
      }
      
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      // Stop recording if active
      if (recording) {
        recording.stopAndUnloadAsync().catch(err => 
          log('[VoiceRecorder] Error stopping recording on unmount:', err)
        );
      }
      
      // Stop playback if active
      if (sound) {
        sound.unloadAsync().catch(err =>
          log('[VoiceRecorder] Error stopping playback on unmount:', err)
        );
      }
    };
  }, []);
  
  // Gen Z-style pulse animation for recording indicator
  useEffect(() => {
    if (isRecording) {
      // Inner pulse - subtle breathing effect
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1000,
            easing: Easing.bezier(0.4, 0.0, 0.2, 1),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.bezier(0.4, 0.0, 0.2, 1),
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      // Outer pulse - expanding rings
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(outerPulseAnim, {
              toValue: 1.5,
              duration: 1500,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 1500,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(outerPulseAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.6,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      outerPulseAnim.setValue(1);
      opacityAnim.setValue(0);
    }
  }, [isRecording, pulseAnim, outerPulseAnim, opacityAnim]);
  
  // Format seconds to MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Start recording
  const startRecording = async () => {
    try {
      if (!recordingPermission) {
        Alert.alert(
          'Permission Required',
          'Please grant microphone permission to record voice notes',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Reset states
      setRecordingDuration(0);
      setPlaybackPosition(0);
      setPlaybackDuration(0);
      setAudioUri(null);
      
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }
      
      // Configure recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // Create a custom directory for recordings in a persistent location
      const directory = FileSystem.documentDirectory + 'voice_notes/';
      log('[VoiceRecorder] Using directory:', directory);
      
      const dirInfo = await FileSystem.getInfoAsync(directory);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        log('[VoiceRecorder] Created voice_notes directory');
      }
      
      // Create recording object with custom options
      const { recording } = await Audio.Recording.createAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        }
      });
      
      setRecording(recording);
      setIsRecording(true);
      
      // Provide haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Start duration counter
      let seconds = 0;
      recordingInterval.current = setInterval(async () => {
        seconds++;
        setRecordingDuration(seconds);
        
        // Stop recording if max duration is reached
        if (seconds >= maxDuration) {
          log('[VoiceRecorder] Maximum duration reached, stopping recording automatically');
          
          // Clear interval immediately to prevent multiple triggers
          if (recordingInterval.current) {
            clearInterval(recordingInterval.current);
            recordingInterval.current = null;
          }
          
          // Stop recording and show preview
          await stopRecording();
          
          // Provide feedback to user
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err) {
            log('Haptics not available:', err);
          }
          
          // Show a toast to inform user
          Alert.alert(
            'Recording Complete',
            'Maximum recording duration reached. You can now preview and send your voice note.',
            [{ text: 'OK' }]
          );
        }
      }, 1000);
      
      // Set a timeout to automatically stop recording at max duration
      // This is a failsafe in case the interval doesn't trigger properly
      maxDurationTimeoutRef.current = setTimeout(async () => {
        if (isRecording && recording) {
          log('[VoiceRecorder] Failsafe timeout reached, stopping recording');
          await stopRecording();
        }
      }, maxDuration * 1000 + 500); // Add a small buffer
      
    } catch (err) {
      error('Failed to start recording', err);
      Alert.alert('Recording Error', 'Failed to start recording');
    }
  };
  
  // Cancel recording without saving
  const cancelRecording = async () => {
    try {
      log('[VoiceRecorder] Canceling recording...');
      
      // Clear interval first
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
      
      // Clear timeout
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
        maxDurationTimeoutRef.current = null;
      }
      
      // Stop and unload the recording if it exists
      if (recording) {
        try {
          await recording.stopAndUnloadAsync();
          log('[VoiceRecorder] Recording stopped and unloaded');
        } catch (err) {
          log('[VoiceRecorder] Error stopping recording:', err);
        }
      }
      
      // Reset all states
      setRecording(null);
      setIsRecording(false);
      setRecordingDuration(0);
      setAudioUri(null);
      
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      log('[VoiceRecorder] Recording canceled successfully');
    } catch (err) {
      error('[VoiceRecorder] Error canceling recording:', err);
      // Force reset states even if there's an error
      setRecording(null);
      setIsRecording(false);
    }
  };
  
  // Stop recording
  const stopRecording = async () => {
    try {
      if (!recording) {
        log('[VoiceRecorder] No recording to stop');
        return;
      }
      
      log('[VoiceRecorder] Stopping recording...');
      
      // Stop the recording
      await recording.stopAndUnloadAsync();
      
      // Clear interval
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
      
      // Clear timeout
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
        maxDurationTimeoutRef.current = null;
      }
      
      // Get recording URI
      const uri = recording.getURI();
      if (!uri) {
        throw new Error('No recording URI available');
      }
      
      log('[VoiceRecorder] Original recording URI:', uri);
      log('[VoiceRecorder] Document directory:', FileSystem.documentDirectory);
      
      // Create a permanent copy of the recording in our app's documents directory
      const directory = FileSystem.documentDirectory + 'voice_notes/';
      
      // Ensure the directory exists
      try {
        const dirInfo = await FileSystem.getInfoAsync(directory);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
          log('[VoiceRecorder] Created voice_notes directory during copy');
        }
      } catch (dirError) {
        error('[VoiceRecorder] Error checking/creating directory:', dirError);
        // Try to continue anyway
      }
      
      // Create a predictable filename based on user ID and timestamp
      const timestamp = Date.now();
      const filename = `voice_${userId || 'unknown'}_${timestamp}.m4a`;
      const permanentUri = directory + filename;
      
      // Copy the recording to a permanent location with predictable name
      try {
        await FileSystem.copyAsync({
          from: uri,
          to: permanentUri
        });
        log('[VoiceRecorder] Successfully copied to:', permanentUri);
        
        // Verify the file was copied successfully
        const copiedFileInfo = await FileSystem.getInfoAsync(permanentUri);
        log('[VoiceRecorder] Copied file info:', copiedFileInfo);
        
        if (!copiedFileInfo.exists) {
          throw new Error('Failed to copy recording to permanent location');
        }
        
        // Store the local URI for playback
        log('[VoiceRecorder] Setting audioUri to:', permanentUri);
        setAudioUri(permanentUri);
        
        log('[VoiceRecorder] Using local URI for playback:', permanentUri);
        
      } catch (copyError) {
        error('[VoiceRecorder] Error copying file:', copyError);
        log('[VoiceRecorder] Fallback: using original URI');
        // Fallback to original URI if copy fails
        log('[VoiceRecorder] Setting audioUri to fallback URI:', uri);
        setAudioUri(uri);
      }
      setIsRecording(false);
      setRecording(null);
      
      // Set playback duration to recording duration
      setPlaybackDuration(recordingDuration);
      
      // Provide haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Configure audio for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
    } catch (err) {
      error('Failed to stop recording', err);
      setIsRecording(false);
      setRecording(null);
      
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
    }
  };
  
  // Reference to store the progress interval
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
    // Upload voice note to Supabase Storage
  const uploadVoiceNote = async (): Promise<string | null> => {
    log('[VoiceRecorder] uploadVoiceNote called with audioUri:', audioUri);
    log('[VoiceRecorder] audioUri type:', typeof audioUri);
    log('[VoiceRecorder] audioUri truthy:', !!audioUri);
    
    if (!audioUri) {
      error('[VoiceRecorder] No audio URI provided for upload');
      return null;
    }
    
    try {
      log('[VoiceRecorder] Starting upload process...');
      setIsUploading(true);
      setUploadProgress(0);
      
      // Clear any existing interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      // Create a simulated progress indicator
      progressIntervalRef.current = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = prev + Math.random() * 10;
          return newProgress > 90 ? 90 : newProgress;
        });
      }, 300);
      
      // Check if the file exists before uploading
      try {
        log('[VoiceRecorder] Checking file existence:', audioUri);
        const fileInfo = await FileSystem.getInfoAsync(audioUri);
        if (!fileInfo.exists) {
          error('[VoiceRecorder] File does not exist:', audioUri);
          throw new Error(`File not found: ${audioUri}`);
        }
        
        log('[VoiceRecorder] File exists, size:', fileInfo.size, 'bytes');
        
        // File is too small, likely corrupted
        if (fileInfo.size < 100) {
          error('[VoiceRecorder] File is too small, likely corrupted:', fileInfo.size, 'bytes');
          throw new Error('Recording file is too small or corrupted');
        }
      } catch (fileError) {
        error('[VoiceRecorder] Error checking file:', fileError);
        throw new Error(`Error checking file: ${fileError.message}`);
      }
      
      log('[VoiceRecorder] Starting upload to Supabase...');
      
      // Generate a unique filename
      const timestamp = Date.now();
      const currentUserId = userId || 'unknown';
      const fileName = `voice_${currentUserId}_${timestamp}`;
      
      log('[VoiceRecorder] Generated filename:', fileName);
      log('[VoiceRecorder] Calling uploadAudioToSupabase...');
      
      // Upload to Supabase - try primary method first, then alternative
      try {
        log('[VoiceRecorder] Trying primary upload method...');
        log('[VoiceRecorder] - audioUri:', audioUri);
        log('[VoiceRecorder] - fileName:', fileName);
        log('[VoiceRecorder] - folder: voice-notes');
        
        const uploadResult = await uploadAudioToSupabase(audioUri, fileName, 'voice-notes');
        
        log('[VoiceRecorder] Primary upload result received:', uploadResult);
        
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setUploadProgress(100);
        
        if (!uploadResult || !uploadResult.url) {
          throw new Error('Primary upload failed - no URL returned');
        }
        
        log('[VoiceRecorder] Primary upload successful, URL:', uploadResult.url);
        return uploadResult.url;
      } catch (primaryError) {
        error('[VoiceRecorder] Primary upload failed:', primaryError);
        
        // Try simple public bucket upload method
        try {
          log('[VoiceRecorder] Trying simple public bucket upload method...');
          const simpleResult = await uploadAudioToSupabaseSimple(audioUri, fileName, 'voice-notes');
          
          log('[VoiceRecorder] Simple upload result received:', simpleResult);
          
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          setUploadProgress(100);
          
          if (!simpleResult || !simpleResult.url) {
            throw new Error('Simple upload failed - no URL returned');
          }
          
          log('[VoiceRecorder] Simple upload successful, URL:', simpleResult.url);
          return simpleResult.url;
        } catch (simpleError) {
          error('[VoiceRecorder] Simple upload failed:', simpleError);
          
          // Try alternative upload method as last resort
          try {
            log('[VoiceRecorder] Trying alternative upload method as last resort...');
            const alternativeResult = await uploadAudioToSupabaseAlternative(audioUri, fileName, 'voice-notes');
            
            log('[VoiceRecorder] Alternative upload result received:', alternativeResult);
            
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            setUploadProgress(100);
            
            if (!alternativeResult || !alternativeResult.url) {
              throw new Error('Alternative upload failed - no URL returned');
            }
            
            log('[VoiceRecorder] Alternative upload successful, URL:', alternativeResult.url);
            return alternativeResult.url;
          } catch (alternativeError) {
            error('[VoiceRecorder] All upload methods failed:', alternativeError);
            throw new Error(`All upload methods failed. Primary: ${primaryError.message}. Simple: ${simpleError.message}. Alternative: ${alternativeError.message}`);
          }
        }
      }
    } catch (error) {
      error('[VoiceRecorder] Error uploading voice note:', error);
      error('[VoiceRecorder] Upload error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setUploadProgress(0);
      return null;
    } finally {
      setIsUploading(false);
    }
  };
  
  // Send the voice note
  const handleSend = async () => {
    log('[VoiceRecorder] handleSend called with audioUri:', audioUri);
    log('[VoiceRecorder] audioUri type in handleSend:', typeof audioUri);
    log('[VoiceRecorder] audioUri truthy in handleSend:', !!audioUri);
    
    if (!audioUri) {
      error('[VoiceRecorder] No audioUri in handleSend, returning early');
      return;
    }
    
    // Stop playback if playing
    if (isPlaying) {
      stopPlayback();
    }
    
    try {
      // Verify the local file exists and is valid before attempting upload
      try {
        const fileInfo = await FileSystem.getInfoAsync(audioUri);
        if (!fileInfo.exists) {
          throw new Error(`File not found: ${audioUri}`);
        }
        
        if (fileInfo.size < 100) {
          throw new Error(`File too small (${fileInfo.size} bytes), likely corrupted`);
        }
        
        log('[VoiceRecorder] File verified before sending:', fileInfo.size, 'bytes');
      } catch (fileError) {
        error('[VoiceRecorder] File verification error:', fileError);
        Alert.alert('Error', 'The recorded audio file is invalid or missing');
        return;
      }
      
      // Upload to Supabase Storage with retry logic
      try {
        log('[VoiceRecorder] Uploading voice note to Supabase...');
        log('[VoiceRecorder] Audio URI:', audioUri);
        log('[VoiceRecorder] User ID:', userId);
        
        const cloudUrl = await uploadVoiceNote();
        
        if (cloudUrl) {
          log('[VoiceRecorder] Upload successful, sending cloud URL:', cloudUrl);
          log('[VoiceRecorder] Recording duration:', recordingDuration, 'seconds');
          onSend(cloudUrl, true, recordingDuration); // Send cloud URL with duration
        } else {
          error('[VoiceRecorder] Upload failed - no cloud URL returned');
          Alert.alert(
            'Upload Failed', 
            'Unable to upload voice note to cloud storage. Please check your internet connection and try again.',
            [{ text: 'OK' }]
          );
          return; // Don't send anything
        }
      } catch (uploadError) {
        error('[VoiceRecorder] Upload error:', uploadError);
        error('[VoiceRecorder] Upload error message:', uploadError.message);
        error('[VoiceRecorder] Upload error stack:', uploadError.stack);
        
        // Show user-friendly error message with option to send locally as fallback
        const errorMessage = uploadError.message.includes('Network request failed') 
          ? 'No internet connection. Please check your network and try again.'
          : uploadError.message.includes('timeout')
          ? 'Upload timed out. Please try again.'
          : uploadError.message.includes('No internet connection')
          ? 'No internet connection. Please check your network and try again.'
          : 'Upload failed. Please try again.';
        
        log('[VoiceRecorder] User message:', errorMessage);
        
        // Show alert with option to send locally as fallback
        Alert.alert(
          'Upload Failed', 
          `${errorMessage}\n\nWould you like to send the voice note locally? (Note: Other users may not be able to play it)`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Send Locally', 
              onPress: () => {
                log('[VoiceRecorder] User chose to send locally as fallback');
                log('[VoiceRecorder] Recording duration:', recordingDuration, 'seconds');
                onSend(audioUri, false, recordingDuration); // Send local file as fallback with duration
              }
            }
          ]
        );
        return;
      }
    } catch (error) {
      error('[VoiceRecorder] Error in handleSend:', error);
      Alert.alert(
        'Error', 
        'Failed to send voice note. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };
  
  // Toggle playback of recorded audio
  const togglePlayback = async () => {
    try {
      if (!audioUri) return;
      
      if (isPlaying) {
        // Pause playback
        if (sound) {
          await sound.pauseAsync();
          setIsPlaying(false);
          
          if (playbackInterval.current) {
            clearInterval(playbackInterval.current);
            playbackInterval.current = null;
          }
        }
      } else {
        // Start or resume playback
        if (!sound) {
          // Load the sound if not loaded
          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: audioUri },
            { shouldPlay: true },
            onPlaybackStatusUpdate
          );
          setSound(newSound);
        } else {
          // Resume existing sound
          await sound.playAsync();
        }
        
        setIsPlaying(true);
        
        // Update playback position
        playbackInterval.current = setInterval(async () => {
          if (sound) {
            const status = await sound.getStatusAsync();
            if (status.isLoaded) {
              setPlaybackPosition(status.positionMillis / 1000);
            }
          }
        }, 100);
      }
    } catch (err) {
      error('Playback error', err);
    }
  };
  
  // Handle playback status updates
  const onPlaybackStatusUpdate = (status: Audio.AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    
    if (status.didJustFinish) {
      // Playback finished
      setIsPlaying(false);
      setPlaybackPosition(0);
      
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current);
        playbackInterval.current = null;
      }
    }
  };
  
  // Stop playback
  const stopPlayback = async () => {
    try {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        setPlaybackPosition(0);
        
        if (playbackInterval.current) {
          clearInterval(playbackInterval.current);
          playbackInterval.current = null;
        }
      }
    } catch (err) {
      error('Error stopping playback', err);
    }
  };
  
  // Delete recording
  const deleteRecording = async () => {
    try {
      await stopPlayback();
      
      if (audioUri) {
        try {
          await FileSystem.deleteAsync(audioUri);
        } catch (err) {
          log('Error deleting file (may be normal on some platforms):', err);
        }
      }
      
      setAudioUri(null);
      setRecordingDuration(0);
      setPlaybackPosition(0);
      setPlaybackDuration(0);
      
      // Provide haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      error('Error deleting recording', err);
    }
  };
  
  // Calculate progress percentage for the progress bar
  const progressPercentage = playbackDuration > 0 
    ? (playbackPosition / playbackDuration) * 100 
    : 0;
  
  return (
    <View style={[styles.container, { backgroundColor: themeColors.neutral.card }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: themeColors.neutral.text }]}>
          {audioUri ? 'Voice Note Preview' : 'Record Voice Note'}
        </Text>
        <TouchableOpacity 
          onPress={async () => {
            // If currently recording, cancel it without saving
            if (isRecording) {
              await cancelRecording();
            }
            // Stop playback if playing
            if (isPlaying) {
              await stopPlayback();
            }
            onCancel();
          }} 
          style={styles.closeButton}
        >
          <X size={20} color={themeColors.neutral.text} />
        </TouchableOpacity>
      </View>
      
      {/* Recording UI */}
      {!audioUri && (
        <View style={styles.recordingContainer}>
          {/* Outer pulse rings */}
          {isRecording && (
            <>
              <Animated.View 
                style={[
                  styles.pulseRing,
                  { 
                    backgroundColor: themeColors.error.main,
                    transform: [{ scale: outerPulseAnim }],
                    opacity: opacityAnim,
                  }
                ]}
              />
              <Animated.View 
                style={[
                  styles.pulseRing,
                  styles.pulseRingSecondary,
                  { 
                    backgroundColor: themeColors.error.main,
                    transform: [{ scale: outerPulseAnim }],
                    opacity: opacityAnim.interpolate({
                      inputRange: [0, 0.6],
                      outputRange: [0, 0.3],
                    }),
                  }
                ]}
              />
            </>
          )}
          
          {/* Main record button */}
          <Animated.View 
            style={[
              styles.recordButton, 
              { 
                backgroundColor: isRecording ? themeColors.error.main : themeColors.primary.main,
                transform: [{ scale: pulseAnim }]
              }
            ]}
          >
            <TouchableOpacity 
              onPress={isRecording ? stopRecording : startRecording}
              style={styles.recordButtonInner}
              disabled={!recordingPermission}
            >
              <Mic size={28} color="white" strokeWidth={2.5} />
            </TouchableOpacity>
          </Animated.View>
          
          <Text style={[styles.recordingTime, { color: themeColors.neutral.text }]}>
            {isRecording 
              ? `Recording... ${formatTime(recordingDuration)}` 
              : 'Tap to start recording'}
          </Text>
          
          {isRecording && (
            <>
              <Text style={[styles.maxDuration, { color: themeColors.neutral.subtext }]}>
                Max: {formatTime(maxDuration)}
              </Text>
              <Text style={[
                styles.remainingTime, 
                { 
                  color: maxDuration - recordingDuration < 10 
                    ? themeColors.error.main 
                    : themeColors.neutral.subtext 
                }
              ]}>
                Remaining: {formatTime(maxDuration - recordingDuration)}
              </Text>
              
              {/* Progress bar for recording duration */}
              <View style={styles.durationProgressContainer}>
                <View 
                  style={[
                    styles.durationProgress, 
                    { 
                      backgroundColor: maxDuration - recordingDuration < 10 
                        ? themeColors.error.main 
                        : themeColors.primary.main,
                      width: `${(recordingDuration / maxDuration) * 100}%` 
                    }
                  ]} 
                />
              </View>
            </>
          )}
        </View>
      )}
      
      {/* Playback UI */}
      {audioUri && (
        <View style={styles.playbackContainer}>
          {/* Playback controls */}
          <View style={styles.playbackControls}>
            <TouchableOpacity 
              onPress={togglePlayback}
              style={[styles.playButton, { backgroundColor: themeColors.primary.main }]}
            >
              {isPlaying 
                ? <Pause size={20} color="white" /> 
                : <Play size={20} color="white" />
              }
            </TouchableOpacity>
            
            {/* Progress bar */}
            <View style={[styles.progressBarContainer, { backgroundColor: themeColors.neutral.border }]}>
              <View 
                style={[
                  styles.progressBar, 
                  { 
                    backgroundColor: themeColors.primary.main,
                    width: `${progressPercentage}%` 
                  }
                ]} 
              />
            </View>
            
            {/* Time display */}
            <Text style={[styles.timeDisplay, { color: themeColors.neutral.text }]}>
              {formatTime(playbackPosition)} / {formatTime(playbackDuration)}
            </Text>
          </View>
          
          {/* Upload Progress */}
          {isUploading && (
            <View style={styles.uploadProgressContainer}>
              <Text style={[styles.uploadProgressText, { color: themeColors.textSecondary }]}>
                Uploading voice note... {Math.round(uploadProgress)}%
              </Text>
              <View style={[styles.uploadProgressBar, { backgroundColor: themeColors.neutral.border }]}>
                <View 
                  style={[
                    styles.uploadProgressFill, 
                    { 
                      backgroundColor: themeColors.primary.main,
                      width: `${uploadProgress}%`
                    }
                  ]} 
                />
              </View>
            </View>
          )}
          
          {/* Action buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              onPress={deleteRecording}
              style={[styles.actionButton, { backgroundColor: themeColors.error.main }]}
            >
              <Trash2 size={18} color="white" />
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={handleSend}
              style={[styles.actionButton, { backgroundColor: themeColors.success.main }]}
            >
              <Send size={18} color="white" />
              <Text style={styles.actionButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: '100%',
    ...Shadow.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.semibold,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  recordingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg + Spacing.xl,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    top: Spacing.lg + Spacing.xl,
  },
  pulseRingSecondary: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.lg,
    elevation: 12,
  },
  recordButtonInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingTime: {
    marginTop: Spacing.md,
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
  },
  maxDuration: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  remainingTime: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  durationProgressContainer: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  durationProgress: {
    height: '100%',
    borderRadius: 2,
  },
  playbackContainer: {
    paddingVertical: Spacing.md,
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.sm,
  },
  progressBarContainer: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginHorizontal: Spacing.md,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  timeDisplay: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    width: 80,
    textAlign: 'right',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    ...Shadow.sm,
  },
  actionButtonText: {
    color: 'white',
    marginLeft: Spacing.xs,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
  },
  uploadProgressContainer: {
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  uploadProgressText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  uploadProgressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  uploadProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
}); 