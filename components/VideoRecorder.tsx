import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  Alert,
  Platform
} from 'react-native';
import { Camera, CameraType, FlashMode } from 'expo-camera';
import { Video } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate
} from 'react-native-reanimated';
import { 
  Circle, 
  Square, 
  RotateCcw, 
  Zap, 
  ZapOff, 
  Check, 
  X,
  Play,
  Pause
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VideoRecorderProps {
  onVideoRecorded?: (videoUri: string) => void;
  onCancel?: () => void;
  maxDuration?: number; // in milliseconds
  quality?: 'low' | 'medium' | 'high';
}

const VideoRecorder: React.FC<VideoRecorderProps> = ({
  onVideoRecorded,
  onCancel,
  maxDuration = 60000, // 60 seconds default
  quality = 'medium'
}) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const cameraRef = useRef<Camera>(null);
  const videoRef = useRef<Video>(null);
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraType, setCameraType] = useState(CameraType.back);
  const [flashMode, setFlashMode] = useState(FlashMode.off);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Animated values
  const recordButtonScale = useSharedValue(1);
  const recordingScale = useSharedValue(1);
  const progressValue = useSharedValue(0);
  const flashOpacity = useSharedValue(0);

  // Request camera permissions
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 100;
          progressValue.value = withTiming(newDuration / maxDuration);
          
          // Stop recording when max duration reached
          if (newDuration >= maxDuration) {
            stopRecording();
          }
          
          return newDuration;
        });
      }, 100);
    } else {
      setRecordingDuration(0);
      progressValue.value = withTiming(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, maxDuration, progressValue]);

  // Start recording
  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const video = await cameraRef.current.recordAsync({
        quality: quality === 'high' ? Camera.Constants.VideoQuality['1080p'] :
                quality === 'medium' ? Camera.Constants.VideoQuality['720p'] :
                Camera.Constants.VideoQuality['480p'],
        maxDuration: maxDuration / 1000, // Convert to seconds
        mute: false
      });

      setRecordedUri(video.uri);
      setIsRecording(false);
      
      // Animate completion
      recordButtonScale.value = withSequence(
        withSpring(1.2),
        withSpring(1)
      );
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      error('Error recording video:', error);
      Alert.alert('Recording Error', 'Failed to record video. Please try again.');
      setIsRecording(false);
    }
  }, [cameraRef, isRecording, quality, maxDuration, recordButtonScale]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (!cameraRef.current || !isRecording) return;

    try {
      cameraRef.current.stopRecording();
      setIsRecording(false);
      recordingScale.value = withTiming(1);
    } catch (error) {
      error('Error stopping recording:', error);
    }
  }, [cameraRef, isRecording, recordingScale]);

  // Handle record button press
  const handleRecordPress = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      setIsRecording(true);
      recordingScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1,
        true
      );
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording, recordingScale]);

  // Toggle camera
  const toggleCameraType = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCameraType(current => 
      current === CameraType.back ? CameraType.front : CameraType.back
    );
  }, []);

  // Toggle flash
  const toggleFlash = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlashMode(current => {
      const newMode = current === FlashMode.off ? FlashMode.on : FlashMode.off;
      
      // Flash animation
      if (newMode === FlashMode.on) {
        flashOpacity.value = withSequence(
          withTiming(1, { duration: 200 }),
          withTiming(0, { duration: 200 })
        );
      }
      
      return newMode;
    });
  }, [flashOpacity]);

  // Save video
  const handleSave = useCallback(() => {
    if (recordedUri) {
      onVideoRecorded?.(recordedUri);
    }
  }, [recordedUri, onVideoRecorded]);

  // Retake video
  const handleRetake = useCallback(() => {
    setRecordedUri(null);
    setIsPlayingPreview(false);
    setRecordingDuration(0);
    progressValue.value = withTiming(0);
  }, [progressValue]);

  // Cancel recording
  const handleCancel = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    onCancel?.();
  }, [isRecording, stopRecording, onCancel]);

  // Toggle preview playback
  const togglePreview = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      if (isPlayingPreview) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
      setIsPlayingPreview(!isPlayingPreview);
    } catch (error) {
      error('Error toggling preview:', error);
    }
  }, [isPlayingPreview]);

  // Format duration display
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Animated styles
  const recordButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: recordButtonScale.value }],
  }));

  const recordingIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ scale: recordingScale.value }],
    opacity: isRecording ? 1 : 0,
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value * 100}%`,
  }));

  const flashOverlayStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  if (hasPermission === null) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera access denied</Text>
        <Text style={styles.permissionSubtext}>
          Please enable camera permissions in your device settings to record videos.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera or Preview */}
      <View style={styles.cameraContainer}>
        {recordedUri ? (
          <Video
            ref={videoRef}
            source={{ uri: recordedUri }}
            style={styles.camera}
            resizeMode="cover"
            shouldPlay={false}
            isLooping={true}
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded) {
                setIsPlayingPreview(status.isPlaying);
              }
            }}
          />
        ) : (
          <Camera
            ref={cameraRef}
            style={styles.camera}
            type={cameraType}
            flashMode={flashMode}
            ratio="16:9"
          />
        )}

        {/* Flash overlay */}
        <Animated.View style={[styles.flashOverlay, flashOverlayStyle]} />

        {/* Recording indicator */}
        <Animated.View style={[styles.recordingIndicator, recordingIndicatorStyle]}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>REC</Text>
        </Animated.View>

        {/* Duration display */}
        {(isRecording || recordingDuration > 0) && (
          <View style={styles.durationContainer}>
            <Text style={styles.durationText}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>
        )}

        {/* Progress bar */}
        {isRecording && (
          <View style={styles.progressContainer}>
            <Animated.View style={[styles.progressBar, progressStyle]} />
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        {recordedUri ? (
          // Preview controls
          <View style={styles.previewControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleRetake}
              activeOpacity={0.8}
            >
              <RotateCcw size={24} color="#FFFFFF" />
              <Text style={styles.controlText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playButton}
              onPress={togglePreview}
              activeOpacity={0.8}
            >
              {isPlayingPreview ? (
                <Pause size={32} color="#FFFFFF" fill="#FFFFFF" />
              ) : (
                <Play size={32} color="#FFFFFF" fill="#FFFFFF" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Check size={24} color="#FFFFFF" />
              <Text style={styles.controlText}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Recording controls
          <View style={styles.recordingControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={toggleFlash}
              activeOpacity={0.8}
            >
              {flashMode === FlashMode.on ? (
                <Zap size={24} color="#FFD700" />
              ) : (
                <ZapOff size={24} color="#FFFFFF" />
              )}
            </TouchableOpacity>

            <Animated.View style={recordButtonStyle}>
              <TouchableOpacity
                style={[
                  styles.recordButton,
                  isRecording && styles.recordButtonActive
                ]}
                onPress={handleRecordPress}
                activeOpacity={0.8}
              >
                {isRecording ? (
                  <Square size={28} color="#FFFFFF" fill="#FFFFFF" />
                ) : (
                  <Circle size={32} color="#FF3040" fill="#FF3040" />
                )}
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={toggleCameraType}
              activeOpacity={0.8}
            >
              <RotateCcw size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          activeOpacity={0.8}
        >
          <X size={24} color={themeColors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 20,
  },
  permissionText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  permissionSubtext: {
    color: '#CCCCCC',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  recordingIndicator: {
    position: 'absolute',
    top: 50,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 48, 64, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
  },
  recordingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  durationContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#FF3040',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingHorizontal: 20,
  },
  recordingControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  previewControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  controlButton: {
    alignItems: 'center',
    padding: 16,
  },
  controlText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'transparent',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonActive: {
    backgroundColor: '#FF3040',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    alignSelf: 'center',
    padding: 16,
  },
});

export default VideoRecorder; 