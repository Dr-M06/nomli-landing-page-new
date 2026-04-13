/**
 * MediaMessage Component
 * Displays media (images/videos) in chat messages with download functionality
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native'
import { Download, Play, AlertCircle, Clock } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import { Message } from '../utils/chat'
import { downloadAndSaveMedia, markMediaAsDownloaded, isMediaExpired, isMediaDeleted } from '../utils/mediaStorage'
import { getThemeColors } from '../constants/Colors'
import { useTheme } from '../contexts/ThemeContext'
import MediaViewer from './MediaViewer'
import MediaTimerRing from './MediaTimerRing'
import { log, warn, error } from '../utils/productionLogger';


interface MediaMessageProps {
  message: Message
  isOwnMessage: boolean
  onDownload?: () => void
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const MAX_MEDIA_WIDTH = SCREEN_WIDTH * 0.7

export default function MediaMessage({ message, isOwnMessage, onDownload }: MediaMessageProps) {
  const { theme } = useTheme()
  const themeColors = getThemeColors(theme)
  const [downloading, setDownloading] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [showViewer, setShowViewer] = useState(false)

  const expired = isMediaExpired(message.expiry_at || null)
  const deleted = isMediaDeleted(message.file_deleted || false, message.file_url || null)
  const isVideo = message.file_type?.startsWith('video/')
  const isImage = message.file_type?.startsWith('image/')
  const [showCountdown, setShowCountdown] = useState(false)
  
  // Format time remaining for popup
  const getTimeText = () => {
    if (!message.expiry_at) return ''
    const now = new Date().getTime()
    const expiry = new Date(message.expiry_at).getTime()
    const diffMs = expiry - now
    
    if (diffMs <= 0) return 'Expired'
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m`
    return '<1m'
  }

  const handleDownload = async () => {
    if (!message.file_url || deleted || expired) {
      Alert.alert(
        'Media Unavailable',
        'This file has expired. Ask the sender to resend.'
      )
      return
    }

    setDownloading(true)
    try {
      const fileName = `media_${message.id}.${message.file_type?.split('/')[1] || 'jpg'}`
      const success = await downloadAndSaveMedia(
        message.file_url,
        fileName,
        message.file_type || 'image/jpeg'
      )

      if (success) {
        // Mark as downloaded in database
        await markMediaAsDownloaded(message.id)
        Alert.alert(
          '✅ Saved to Device!', 
          'Media saved to your Photos. This chat copy will auto-delete in 24 hours, but your saved copy is permanent.\n\nWe don\'t auto-save for your privacy — you choose what to keep!'
        )
        onDownload?.()
      }
    } catch (error) {
      error('Error downloading media:', error)
      Alert.alert('Error', 'Failed to download media.')
    } finally {
      setDownloading(false)
    }
  }

  const handlePress = () => {
    if (expired || deleted) {
      Alert.alert(
        'Media Expired',
        'This file has expired. Ask the sender to resend.'
      )
      return
    }

    // Open full-screen viewer
    if (message.file_url) {
      setShowViewer(true)
    }
  }

  // Show expired/deleted state - compact and sleek
  if (expired || deleted) {
    const { isDarkMode } = useTheme();
    
    const handleExpiredPress = () => {
      Alert.alert(
        'Media Expired',
        'Auto-deleted after 24h for privacy',
        [{ text: 'OK' }]
      );
    };
    
    return (
      <View style={[
        styles.container,
        isOwnMessage && styles.ownMessage
      ]}>
        <TouchableOpacity 
          activeOpacity={0.7}
          onPress={handleExpiredPress}
        >
          <View style={[
            styles.expiredContainer,
            { 
              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            }
          ]}>
            <View style={styles.expiredContent}>
              <Clock size={16} color={isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'} strokeWidth={2.5} />
              <Text style={[styles.expiredText, { color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)' }]}>
                Media expired after 24h
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    )
  }

  // For images, use thumbnail or fallback to file_url
  // For videos, ONLY use thumbnail_url (can't use file_url as it's a video file)
  // If no thumbnail for video, show placeholder
  const imageUrl = isImage 
    ? (message.thumbnail_url || message.file_url)
    : (message.thumbnail_url || null) // Videos must have thumbnail_url

  return (
    <>
      <View style={styles.container}>
        {/* Floating countdown popup - outside overflow container */}
        {showCountdown && message.expiry_at && !expired && (
          <View style={styles.floatingPopup}>
            <Text style={styles.floatingPopupText}>{getTimeText()}</Text>
          </View>
        )}
        
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.8}
          style={styles.mediaContainer}
        >
        {isImage && imageUrl && !imageError ? (
          <View style={styles.imageWrapper}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
            {/* Minimal timer ring - tap to see time */}
            {message.expiry_at && !expired && (
              <TouchableOpacity 
                style={styles.timerRingOverlay}
                onPress={(e) => {
                  e.stopPropagation()
                  setShowCountdown(!showCountdown)
                }}
                activeOpacity={0.8}
              >
                <MediaTimerRing 
                  expiryAt={message.expiry_at} 
                  size={20} 
                  strokeWidth={1.5}
                  showLabel={false}
                />
              </TouchableOpacity>
            )}
          </View>
        ) : isVideo ? (
          <View style={styles.videoContainer}>
            {imageUrl && !imageError ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
            ) : (
              <View style={styles.videoPlaceholder}>
                <Play size={48} color="#fff" fill="#fff" />
                <Text style={[styles.placeholderText, { color: '#fff' }]}>
                  Video
                </Text>
              </View>
            )}
            <View style={styles.playButtonOverlay}>
              <Play size={32} color="#fff" fill="#fff" />
            </View>
            {/* Minimal timer ring for videos */}
            {message.expiry_at && !expired && (
              <TouchableOpacity 
                style={styles.timerRingOverlay}
                onPress={(e) => {
                  e.stopPropagation()
                  setShowCountdown(!showCountdown)
                }}
                activeOpacity={0.8}
              >
                <MediaTimerRing 
                  expiryAt={message.expiry_at} 
                  size={20} 
                  strokeWidth={1.5}
                  showLabel={false}
                />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.placeholder}>
            {isVideo ? (
              <View style={styles.videoPlaceholder}>
                <Play size={40} color={themeColors.textSecondary} />
                <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
                  Video
                </Text>
              </View>
            ) : (
              <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
                Image
              </Text>
            )}
          </View>
        )}

        {/* Download button overlay */}
        {!isOwnMessage && (
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Download size={20} color="#fff" />
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>

        {/* Caption - only show if exists */}
        {message.content && message.content.trim() !== '' && (
          <View style={[styles.captionContainer, { backgroundColor: themeColors.cardBackground }]}>
            <Text style={[styles.caption, { color: themeColors.text }]}>
              {message.content}
            </Text>
          </View>
        )}
      </View>

      {/* Full-screen viewer */}
      {message.file_url && (
        <MediaViewer
          visible={showViewer}
          mediaUrl={message.file_url}
          mediaType={isVideo ? 'video' : 'image'}
          expiryAt={message.expiry_at}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    maxWidth: MAX_MEDIA_WIDTH,
    marginVertical: 4,
    position: 'relative',
  },
  ownMessage: {
    alignSelf: 'flex-end',
  },
  floatingPopup: {
    position: 'absolute',
    top: -32,
    right: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingPopupText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  mediaContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  imageWrapper: {
    position: 'relative',
  },
  image: {
    width: MAX_MEDIA_WIDTH,
    height: MAX_MEDIA_WIDTH * 0.75,
  },
  videoContainer: {
    position: 'relative',
  },
  timerRingOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 100,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
  },
  placeholder: {
    width: MAX_MEDIA_WIDTH,
    height: MAX_MEDIA_WIDTH * 0.75,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  videoPlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 14,
  },
  downloadButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captionContainer: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  caption: {
    fontSize: 14,
    lineHeight: 18,
  },
  expiredContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  expiredContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  expiredText: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
})

