/**
 * PremiumMediaPicker - Apple-style multi-media selector
 * Gen Z friendly with smooth animations and modern UI
 * Supports up to 10 photos/videos at once
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Dimensions,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Image as ImageIcon, Video as VideoIcon, Camera, X, Plus, Send, Clock } from 'lucide-react-native'
import { pickImage, pickVideo, takePhoto, uploadMedia } from '../utils/mediaStorage'
import { getThemeColors } from '../constants/Colors'
import { useTheme } from '../contexts/ThemeContext'
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH } = Dimensions.get('window')
const MAX_MEDIA_ITEMS = 10

interface MediaItem {
  id: string
  fileUrl: string
  thumbnailUrl: string | null
  fileType: string
  fileSize?: number
  expiryAt: string
}

interface PremiumMediaPickerProps {
  visible: boolean
  onClose: () => void
  onMediaSelected: (mediaItems: MediaItem[]) => void
}

export default function PremiumMediaPicker({
  visible,
  onClose,
  onMediaSelected,
}: PremiumMediaPickerProps) {
  const { theme } = useTheme()
  const themeColors = getThemeColors(theme)
  const [uploading, setUploading] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([])

  const handlePickImage = async () => {
    if (selectedMedia.length >= MAX_MEDIA_ITEMS) {
      Alert.alert('Limit Reached', `You can only send up to ${MAX_MEDIA_ITEMS} items at once.`)
      return
    }

    const file = await pickImage()
    if (file) {
      await handleUpload(file)
    }
  }

  const handlePickVideo = async () => {
    if (selectedMedia.length >= MAX_MEDIA_ITEMS) {
      Alert.alert('Limit Reached', `You can only send up to ${MAX_MEDIA_ITEMS} items at once.`)
      return
    }

    const file = await pickVideo()
    if (file) {
      await handleUpload(file)
    }
  }

  const handleTakePhoto = async () => {
    if (selectedMedia.length >= MAX_MEDIA_ITEMS) {
      Alert.alert('Limit Reached', `You can only send up to ${MAX_MEDIA_ITEMS} items at once.`)
      return
    }

    const file = await takePhoto()
    if (file) {
      await handleUpload(file)
    }
  }

  const handleUpload = async (file: { uri: string; type: string; name: string; size?: number }) => {
    setUploading(true)
    try {
      log('[PremiumMediaPicker] Uploading:', file.name)
      const result = await uploadMedia(file, true)
      
      if (result) {
        const newItem: MediaItem = {
          id: Date.now().toString() + Math.random(),
          fileUrl: result.fileUrl,
          thumbnailUrl: result.thumbnailUrl,
          fileType: file.type,
          fileSize: file.size,
          expiryAt: result.expiryAt,
        }
        
        setSelectedMedia(prev => [...prev, newItem])
        log('[PremiumMediaPicker] Added media, total:', selectedMedia.length + 1)
      } else {
        Alert.alert('Upload Failed', 'Failed to upload media. Please try again.')
      }
    } catch (error) {
      error('[PremiumMediaPicker] Upload error:', error)
      Alert.alert('Error', 'Failed to upload media. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveItem = (id: string) => {
    setSelectedMedia(prev => prev.filter(item => item.id !== id))
  }

  const handleSend = () => {
    if (selectedMedia.length === 0) {
      Alert.alert('No Media', 'Please select at least one photo or video.')
      return
    }

    onMediaSelected(selectedMedia)
    setSelectedMedia([])
    onClose()
  }

  const handleClose = () => {
    if (selectedMedia.length > 0) {
      Alert.alert(
        'Discard Media?',
        `You have ${selectedMedia.length} item(s) selected. Discard them?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Discard', 
            style: 'destructive',
            onPress: () => {
              setSelectedMedia([])
              onClose()
            }
          }
        ]
      )
    } else {
      onClose()
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <BlurView intensity={100} style={StyleSheet.absoluteFill} tint="dark" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>
            {selectedMedia.length > 0 
              ? `${selectedMedia.length}/${MAX_MEDIA_ITEMS} Selected`
              : 'Select Media'}
          </Text>
          {selectedMedia.length > 0 && (
            <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
              <Send size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Auto-delete notice */}
        <View style={styles.noticeContainer}>
          <Clock size={16} color="rgba(255, 255, 255, 0.7)" />
          <Text style={styles.noticeText}>
            Media auto-deletes after 24 hours. Tap download to save to your device.
          </Text>
        </View>

        {/* Selected media preview */}
        {selectedMedia.length > 0 && (
          <View style={styles.previewContainer}>
            <FlatList
              data={selectedMedia}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.previewItem}>
                  <Image
                    source={{ uri: item.thumbnailUrl || item.fileUrl }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveItem(item.id)}
                  >
                    <X size={16} color="#fff" />
                  </TouchableOpacity>
                  {item.fileType.startsWith('video/') && (
                    <View style={styles.videoIndicator}>
                      <VideoIcon size={20} color="#fff" fill="#fff" />
                    </View>
                  )}
                </View>
              )}
              contentContainerStyle={styles.previewList}
            />
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, uploading && styles.actionButtonDisabled]}
            onPress={handlePickImage}
            disabled={uploading}
            activeOpacity={0.7}
          >
            <View style={styles.actionButtonInner}>
              <ImageIcon size={32} color="#fff" />
              <Text style={styles.actionButtonText}>Photos</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, uploading && styles.actionButtonDisabled]}
            onPress={handleTakePhoto}
            disabled={uploading}
            activeOpacity={0.7}
          >
            <View style={styles.actionButtonInner}>
              <Camera size={32} color="#fff" />
              <Text style={styles.actionButtonText}>Camera</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, uploading && styles.actionButtonDisabled]}
            onPress={handlePickVideo}
            disabled={uploading}
            activeOpacity={0.7}
          >
            <View style={styles.actionButtonInner}>
              <VideoIcon size={32} color="#fff" />
              <Text style={styles.actionButtonText}>Videos</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Upload indicator */}
        {uploading && (
          <View style={styles.uploadingOverlay}>
            <BlurView intensity={80} style={styles.uploadingBlur} tint="dark">
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.uploadingText}>Uploading...</Text>
            </BlurView>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 20,
  },
  noticeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  noticeText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  previewContainer: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  previewList: {
    paddingHorizontal: 20,
  },
  previewItem: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingBlur: {
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    gap: 12,
  },
  uploadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
})

