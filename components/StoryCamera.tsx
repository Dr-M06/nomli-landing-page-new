import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
  Animated,
  InteractionManager,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { X, RotateCcw, Zap, ZapOff, Image as ImageIcon, Circle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import { log, warn, error } from '../utils/productionLogger';
import { STORY_VIDEO_MAX_SECONDS } from '../utils/storyUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Detect smaller devices - they need longer delays for modal transitions
const isSmallDevice = SCREEN_HEIGHT < 700;
const isTinyDevice = SCREEN_HEIGHT < 650;

interface StoryCameraProps {
  visible: boolean;
  onClose: () => void;
  onMediaCaptured: (uri: string, type: 'photo' | 'video') => void;
}

export default function StoryCamera({ visible, onClose, onMediaCaptured }: StoryCameraProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const cameraRef = useRef<CameraView>(null);
  
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTime = useRef<number>(0);

  const recordingPulseAnim = useRef(new Animated.Value(1)).current;
  const captureScaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    if (visible) {
      // Entrance animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Cleanup and reset
      if (isRecording) {
        stopRecording();
      }
      setRecordingDuration(0);
      fadeAnim.setValue(0);
    }
  }, [visible]);

  useEffect(() => {
    if (isRecording) {
      // Recording pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingPulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(recordingPulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      recordingPulseAnim.setValue(1);
    }
  }, [isRecording]);

  const toggleCameraType = () => {
    setFacing(current => current === 'back' ? 'front' : 'back');
  };

  const toggleFlash = () => {
    setFlash(current => current === 'off' ? 'on' : 'off');
  };

  const takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;
    
    // Capture button animation
    Animated.sequence([
      Animated.timing(captureScaleAnim, {
        toValue: 0.85,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(captureScaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      setIsProcessing(true);
      
      // Yield to UI thread before camera operation (critical for real devices)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Use InteractionManager to defer heavy camera operation
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(async () => {
          try {
            const photo = await cameraRef.current?.takePictureAsync({
              quality: 0.85,
            });
            
            if (photo && photo.uri) {
              log('[StoryCamera] 📸 Photo captured:', photo.uri);
              
              // Yield to UI thread before file operations
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Verify photo file exists before calling callback
              try {
                const fileInfo = await FileSystem.getInfoAsync(photo.uri);
                if (fileInfo.exists) {
                  log('[StoryCamera] ✅ Photo file verified, size:', fileInfo.size);
                  
                  // On iOS, close this modal first before opening the editor modal (prevents nested modal freeze)
                  if (Platform.OS === 'ios') {
                    setIsProcessing(false);
                    onClose(); // Close camera modal first
                    
                    // Longer delay for smaller devices (they need more time for modal animations)
                    const delay = isTinyDevice ? 600 : isSmallDevice ? 500 : 400;
                    
                    // Use InteractionManager to ensure modal is fully closed before opening next one
                    InteractionManager.runAfterInteractions(() => {
                      setTimeout(() => {
                        onMediaCaptured(photo.uri, 'photo');
                      }, delay);
                    });
                  } else {
                    // Use InteractionManager to defer callback on Android
                    InteractionManager.runAfterInteractions(() => {
                      onMediaCaptured(photo.uri, 'photo');
                      setIsProcessing(false);
                    });
                  }
                } else {
                  throw new Error('Photo file not found after capture');
                }
              } catch (fileError) {
                error('[StoryCamera] Error verifying photo file:', fileError);
                Alert.alert('Error', 'Photo file not ready. Please try again.');
                setIsProcessing(false);
              }
            } else {
              setIsProcessing(false);
            }
            resolve();
          } catch (error) {
            error('[StoryCamera] Error taking picture:', error);
            Alert.alert('Error', 'Failed to take picture. Please try again.');
            setIsProcessing(false);
            resolve();
          }
        });
      });
    } catch (error) {
      error('[StoryCamera] Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture. Please try again.');
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || isRecording || isProcessing) return;
    
    try {
      setIsRecording(true);
      setRecordingDuration(0);
      recordingStartTime.current = Date.now();
      
      // Yield to UI thread before starting recording (critical for real devices)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Start duration timer (must match upload limit in storyUtils)
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          if (newDuration >= STORY_VIDEO_MAX_SECONDS) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);

      // Use InteractionManager to defer heavy camera operation
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(async () => {
          try {
            const video = await cameraRef.current?.recordAsync({
              maxDuration: STORY_VIDEO_MAX_SECONDS,
            });
            
            if (video && video.uri) {
              log('[StoryCamera] 🎥 Video recorded:', video.uri);
              
              // Yield to UI thread before file operations
              await new Promise(resolve => setTimeout(resolve, 200));
              
              // Verify video file exists before calling callback
              try {
                const fileInfo = await FileSystem.getInfoAsync(video.uri);
                if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
                  log('[StoryCamera] ✅ Video file verified, size:', fileInfo.size);
                  
                  // On iOS, close this modal first before opening the editor modal (prevents nested modal freeze)
                  if (Platform.OS === 'ios') {
                    setIsRecording(false);
                    if (recordingTimer.current) {
                      clearInterval(recordingTimer.current);
                    }
                    onClose(); // Close camera modal first
                    
                    // Longer delay for smaller devices (they need more time for modal animations)
                    const delay = isTinyDevice ? 600 : isSmallDevice ? 500 : 400;
                    
                    // Use InteractionManager to ensure modal is fully closed before opening next one
                    InteractionManager.runAfterInteractions(() => {
                      setTimeout(() => {
                        onMediaCaptured(video.uri, 'video');
                      }, delay);
                    });
                  } else {
                    // Use InteractionManager to defer callback on Android
                    InteractionManager.runAfterInteractions(() => {
                      onMediaCaptured(video.uri, 'video');
                      setIsRecording(false);
                      if (recordingTimer.current) {
                        clearInterval(recordingTimer.current);
                      }
                    });
                  }
                } else {
                  throw new Error('Video file is empty or invalid');
                }
              } catch (fileError) {
                error('[StoryCamera] Error verifying video file:', fileError);
                Alert.alert('Error', 'Video file not ready. Please try again.');
                setIsRecording(false);
                if (recordingTimer.current) {
                  clearInterval(recordingTimer.current);
                }
              }
            }
            resolve();
          } catch (error) {
            error('[StoryCamera] Error recording video:', error);
            setIsRecording(false);
            if (recordingTimer.current) {
              clearInterval(recordingTimer.current);
            }
            resolve();
          }
        });
      });
    } catch (error: any) {
      error('[StoryCamera] Error recording video:', error);
      
      // Check if it's a "too short" error
      const errorMessage = error?.message || '';
      if (errorMessage.includes('stopped before any data') || errorMessage.includes('too short')) {
        Alert.alert('Video Too Short', 'Please hold the record button longer (at least 1 second).');
      } else {
        Alert.alert('Error', 'Failed to record video. Please try again.');
      }
      
      setIsRecording(false);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
      }
    }
  };

  const stopRecording = async () => {
    if (!cameraRef.current || !isRecording) return;
    
    // Check if minimum recording time has elapsed (at least 500ms)
    const recordingTime = Date.now() - recordingStartTime.current;
    const minRecordingTime = 500; // 500ms minimum
    
    if (recordingTime < minRecordingTime) {
      log(`[StoryCamera] Recording too short (${recordingTime}ms), waiting...`);
      // Wait for minimum time before stopping
      await new Promise(resolve => setTimeout(resolve, minRecordingTime - recordingTime));
    }
    
    try {
      setIsProcessing(true);
      await cameraRef.current.stopRecording();
      setIsRecording(false);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
      }
    } catch (error) {
      error('[StoryCamera] Error stopping recording:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const pickFromGallery = async () => {
    try {
      // Yield to UI thread before permission request
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library.');
        return;
      }

      // Use InteractionManager to defer heavy image picker operation
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(async () => {
          try {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              allowsEditing: false, // No cropping - use original image
              quality: 1.0, // Full quality for stories
              videoMaxDuration: STORY_VIDEO_MAX_SECONDS,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
              const asset = result.assets[0];
              const type = asset.type === 'video' ? 'video' : 'photo';
              log('[StoryCamera] 🖼️ Media picked from gallery:', asset.uri, type);
              
              // On iOS, close this modal first before opening the editor modal (prevents nested modal freeze)
              if (Platform.OS === 'ios') {
                onClose(); // Close camera modal first
                
                // Longer delay for smaller devices (they need more time for modal animations)
                const delay = isTinyDevice ? 600 : isSmallDevice ? 500 : 400;
                
                // Use InteractionManager to ensure modal is fully closed before opening next one
                InteractionManager.runAfterInteractions(() => {
                  setTimeout(() => {
                    onMediaCaptured(asset.uri, type);
                  }, delay);
                });
              } else {
                // Yield to UI thread before callback on Android
                await new Promise(resolve => setTimeout(resolve, 100));
                // Use InteractionManager to defer callback
                InteractionManager.runAfterInteractions(() => {
                  onMediaCaptured(asset.uri, type);
                });
              }
            }
            resolve();
          } catch (error) {
            error('[StoryCamera] Error picking from gallery:', error);
            Alert.alert('Error', 'Failed to pick media. Please try again.');
            resolve();
          }
        });
      });
    } catch (error) {
      error('[StoryCamera] Error picking from gallery:', error);
      Alert.alert('Error', 'Failed to pick media. Please try again.');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="fade" presentationStyle="pageSheet">
        <View style={[styles.container, { backgroundColor: themeColors.background.primary }]}>
          <View style={styles.permissionContainer}>
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring' }}
            >
              <Text style={[styles.permissionText, { color: themeColors.text.primary }]}>
                Camera permission is required to create stories
              </Text>
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={onClose}
              >
                <LinearGradient
                  colors={['#FF3B5C', '#FF1744']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.permissionButtonGradient}
                >
                  <Text style={styles.permissionButtonText}>Go Back</Text>
                </LinearGradient>
              </TouchableOpacity>
            </MotiView>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="pageSheet">
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          flash={flash}
        >
          {/* Premium gradient overlays */}
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'transparent']}
            style={styles.topGradient}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={styles.bottomGradient}
          />

          {/* Top Controls with glass morphism */}
          <View style={styles.topControls}>
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', delay: 100 }}
            >
              <TouchableOpacity style={styles.glassButton} onPress={onClose}>
                <X size={26} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </MotiView>
            
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', delay: 150 }}
            >
              <TouchableOpacity style={styles.glassButton} onPress={toggleFlash}>
                {flash === 'off' ? (
                  <ZapOff size={24} color="#FFFFFF" strokeWidth={2.5} />
                ) : (
                  <Zap size={24} color="#FFD700" strokeWidth={2.5} />
                )}
              </TouchableOpacity>
            </MotiView>
          </View>

          {/* Recording Indicator with premium styling */}
          {isRecording && (
            <MotiView
              from={{ opacity: 0, translateY: -20 }}
              animate={{ opacity: 1, translateY: 0 }}
              style={styles.recordingIndicator}
            >
              <LinearGradient
                colors={['#FF3B5C', '#C2185B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.recordingIndicatorGradient}
              >
                <Animated.View 
                  style={[
                    styles.recordingDot,
                    { transform: [{ scale: recordingPulseAnim }] }
                  ]} 
                />
                <Text style={styles.recordingDuration}>{formatDuration(recordingDuration)}</Text>
              </LinearGradient>
            </MotiView>
          )}

          {/* Bottom Controls with premium design */}
          <View style={styles.bottomControls}>
            {/* Gallery Button */}
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', delay: 200 }}
            >
              <TouchableOpacity
                style={styles.glassSecondaryButton}
                onPress={pickFromGallery}
                disabled={isRecording || isProcessing}
              >
                <ImageIcon size={26} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </MotiView>

            {/* Premium Capture/Record Button */}
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', delay: 250 }}
            >
              <Animated.View style={{ transform: [{ scale: captureScaleAnim }] }}>
                <TouchableOpacity
                  style={[
                    styles.captureButton,
                    isRecording && styles.captureButtonRecording,
                  ]}
                  onPress={isRecording ? stopRecording : takePicture}
                  onLongPress={startRecording}
                  delayLongPress={200}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="large" color="#FFFFFF" />
                  ) : (
                    <>
                      <View style={styles.captureButtonOuter}>
                        {isRecording ? (
                          <Animated.View 
                            style={[
                              styles.captureButtonInnerRecording,
                              { transform: [{ scale: recordingPulseAnim }] }
                            ]} 
                          />
                        ) : (
                          <View style={styles.captureButtonInner} />
                        )}
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </MotiView>

            {/* Flip Camera Button */}
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', delay: 300 }}
            >
              <TouchableOpacity
                style={styles.glassSecondaryButton}
                onPress={toggleCameraType}
                disabled={isRecording || isProcessing}
              >
                <RotateCcw size={26} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </MotiView>
          </View>

          {/* Instructions with glass morphism */}
          {!isRecording && !isProcessing && (
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'spring', delay: 400 }}
              style={styles.instructionsContainer}
            >
              <View style={styles.glassInstructions}>
                <Circle size={6} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={styles.instructionsText}>Tap for photo</Text>
                <View style={styles.instructionsDivider} />
                <Circle size={6} color="#FF3B5C" fill="#FF3B5C" />
                <Text style={styles.instructionsText}>Hold for video</Text>
              </View>
            </MotiView>
          )}
        </CameraView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 250,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  permissionText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  permissionButton: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  permissionButtonGradient: {
    paddingHorizontal: Spacing.xl + Spacing.md,
    paddingVertical: Spacing.md,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  glassButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingIndicator: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    alignSelf: 'center',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  recordingIndicatorGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    marginRight: Spacing.sm,
  },
  recordingDuration: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
  },
  bottomControls: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  glassSecondaryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonRecording: {
    // No additional styles needed as animation handles it
  },
  captureButtonOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
  },
  captureButtonInnerRecording: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#FF3B5C',
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 170 : 150,
    alignSelf: 'center',
  },
  glassInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  instructionsText: {
    color: '#FFFFFF',
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  instructionsDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: Spacing.xs,
  },
});
