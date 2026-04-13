/**
 * MediaViewer - Premium full-screen media viewer
 * Apple-style UI with Gen Z aesthetics
 * Supports photos and videos with smooth animations
 * Shows 24-hour countdown timer
 */

import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Modal,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
  StatusBar,
  Text,
} from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { X, Download, Play, Pause, Clock } from 'lucide-react-native'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system'
import { BlurView } from 'expo-blur'
import { getTimeRemaining, formatTimeRemainingLong } from '../utils/mediaTimerUtils'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface MediaViewerProps {
  visible: boolean
  mediaUrl: string
  mediaType: 'image' | 'video'
  expiryAt?: string | null
  onClose: () => void
}

export default function MediaViewer({
  visible,
  mediaUrl,
  mediaType,
  expiryAt,
  onClose,
}: MediaViewerProps) {
  const [downloading, setDownloading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [countdownText, setCountdownText] = useState<string>('')
  const videoRef = useRef<Video>(null)
  const insets = useSafeAreaInsets()
  
  // Drag-down gesture values
  const translateY = useSharedValue(0)
  const opacity = useSharedValue(1)
  
  // Animated style for drag-down
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
    }
  })
  
  // Drag-down gesture to close
  const dragDownGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY
        const opacityValue = Math.max(0, 1 - (event.translationY / SCREEN_HEIGHT))
        opacity.value = opacityValue
      }
    })
    .onEnd((event) => {
      const DRAG_THRESHOLD = 100
      const VELOCITY_THRESHOLD = 500
      
      if (event.translationY > DRAG_THRESHOLD || event.velocityY > VELOCITY_THRESHOLD) {
        // Close the viewer
        runOnJS(onClose)()
      } else {
        // Snap back
        translateY.value = withTiming(0, { duration: 250 })
        opacity.value = withTiming(1, { duration: 250 })
      }
    })
  
  // Reset animation values when modal closes
  useEffect(() => {
    if (!visible) {
      translateY.value = 0
      opacity.value = 1
    }
  }, [visible])

  // Update countdown every minute
  useEffect(() => {
    if (!expiryAt) return

    const updateCountdown = () => {
      const timeRemaining = getTimeRemaining(expiryAt)
      setCountdownText(formatTimeRemainingLong(timeRemaining))
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [expiryAt, visible])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      // Request permission
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow photo library access to save media.'
        )
        setDownloading(false)
        return
      }

      // Download file
      const fileName = `nomli_${Date.now()}.${mediaType === 'image' ? 'jpg' : 'mp4'}`
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`
      
      const downloadResult = await FileSystem.downloadAsync(mediaUrl, fileUri)

      if (downloadResult.status !== 200) {
        throw new Error('Download failed')
      }

      // Save to Photos/Gallery
      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri)
      
      Alert.alert(
        '✅ Saved!',
        `${mediaType === 'image' ? 'Photo' : 'Video'} saved to your ${Platform.OS === 'ios' ? 'Photos' : 'Gallery'}`,
        [{ text: 'OK' }]
      )
    } catch (error) {
      error('Error downloading media:', error)
      Alert.alert('Error', 'Failed to save media. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const togglePlayback = async () => {
    if (!videoRef.current) return

    if (isPlaying) {
      await videoRef.current.pauseAsync()
    } else {
      await videoRef.current.playAsync()
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={styles.container}>
        <GestureDetector gesture={dragDownGesture}>
          <Animated.View style={[styles.container, animatedStyle]}>
            {/* Blurred background */}
            <BlurView intensity={100} style={StyleSheet.absoluteFill} tint="dark" />

            {/* Media content */}
            <View style={styles.mediaContainer}>
          {mediaType === 'image' ? (
            <Image
              source={{ uri: mediaUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.videoWrapper}>
              <Video
                ref={videoRef}
                source={{ uri: mediaUrl }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls={false}
                onPlaybackStatusUpdate={(status) => {
                  if (status.isLoaded) {
                    setIsPlaying(status.isPlaying)
                  }
                }}
              />
              
              {/* Play/Pause overlay */}
              <TouchableOpacity
                style={styles.playButton}
                onPress={togglePlayback}
                activeOpacity={0.8}
              >
                <BlurView intensity={80} style={styles.playButtonBlur} tint="dark">
                  {isPlaying ? (
                    <Pause size={40} color="#fff" fill="#fff" />
                  ) : (
                    <Play size={40} color="#fff" fill="#fff" />
                  )}
                </BlurView>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Top controls */}
        <View style={[styles.topControls, { top: insets.top + 10 }]}>
          {/* Countdown display */}
          {expiryAt && countdownText && (
            <View style={styles.countdownContainer}>
              <BlurView intensity={80} style={styles.countdownBlur} tint="dark">
                <Clock size={16} color="#fff" />
                <Text style={styles.countdownText}>{countdownText}</Text>
              </BlurView>
            </View>
          )}
          
          <TouchableOpacity
            style={styles.controlButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <BlurView intensity={80} style={styles.controlButtonBlur} tint="dark">
              <X size={24} color="#fff" />
            </BlurView>
          </TouchableOpacity>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomControls}>
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={handleDownload}
            disabled={downloading}
            activeOpacity={0.7}
          >
            <BlurView intensity={80} style={styles.downloadButtonBlur} tint="dark">
              {downloading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Download size={24} color="#fff" />
              )}
            </BlurView>
          </TouchableOpacity>
        </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  videoWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  playButton: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
  },
  playButtonBlur: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topControls: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 1000,
  },
  countdownContainer: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  countdownBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countdownText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomControls: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  controlButtonBlur: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  downloadButtonBlur: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
})

