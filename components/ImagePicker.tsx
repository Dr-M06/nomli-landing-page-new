import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Image,
  FlatList,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { 
  Camera, 
  Image as ImageIcon, 
  X, 
  CheckCircle,
  Upload,
} from 'lucide-react-native';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { log, warn, error } from '../utils/productionLogger';


interface ImagePickerProps {
  visible: boolean;
  onClose: () => void;
  onImagesSelected: (imageUris: string[]) => void;
  maxImages?: number; // Maximum number of images (default: 2)
  allowDirectPost?: boolean; // Whether to allow posting directly from this screen
}

export default function ImagePickerComponent({ 
  visible, 
  onClose, 
  onImagesSelected,
  maxImages = 2,
  allowDirectPost = false
}: ImagePickerProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isSelectingImage, setIsSelectingImage] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset states when modal opens/closes
  useEffect(() => {
    if (visible) {
      setSelectedImages([]);
      setIsSelectingImage(false);
      setIsTakingPhoto(false);
      setIsProcessing(false);
    }
  }, [visible]);

  const pickImage = async () => {
    try {
      setIsSelectingImage(true);
      
      // Request permissions
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to select images.');
        return;
      }

      // Calculate how many more images can be selected
      const remainingSlots = maxImages - selectedImages.length;
      if (remainingSlots <= 0) {
        Alert.alert(
          'Maximum Images Reached',
          `You can only upload up to ${maxImages} images.`,
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 1.0,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsProcessing(true);
        
        // Process each selected image
        const processedImages = await Promise.all(
          result.assets.map(async (asset) => {
            // Compress the image with higher quality to preserve dynamic range
            // Higher quality prevents "burn and ashy" look
            const compressedImage = await ImageManipulator.manipulateAsync(
              asset.uri,
              [{ resize: { width: 1500 } }],
              { 
                compress: 0.92, // Increased from 0.9 for better quality
                format: ImageManipulator.SaveFormat.JPEG,
                base64: false, // Don't need base64, saves memory
              }
            );
            return compressedImage.uri;
          })
        );

        // Add new images to existing ones, up to maxImages
        const updatedImages = [...selectedImages, ...processedImages].slice(0, maxImages);
        setSelectedImages(updatedImages);
        setIsProcessing(false);
      }
    } catch (error: any) {
      error('[ImagePicker] Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    } finally {
      setIsSelectingImage(false);
    }
  };

  const takePhoto = async () => {
    try {
      setIsTakingPhoto(true);
      
      // Request camera permissions
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraPermission.granted === false) {
        Alert.alert('Permission Required', 'Please allow camera access to take photos.');
        return;
      }

      // Check if we can add more images
      if (selectedImages.length >= maxImages) {
        Alert.alert(
          'Maximum Images Reached',
          `You can only upload up to ${maxImages} images.`,
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1.0,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsProcessing(true);
        
        // Process the captured image
        const compressedImage = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1500 } }],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );

        // Add to selected images
        const updatedImages = [...selectedImages, compressedImage.uri].slice(0, maxImages);
        setSelectedImages(updatedImages);
        setIsProcessing(false);
      }
    } catch (error: any) {
      error('[ImagePicker] Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const removeImage = (index: number) => {
    const newImages = selectedImages.filter((_, i) => i !== index);
    setSelectedImages(newImages);
  };

  const handleDone = () => {
    if (selectedImages.length > 0) {
      onImagesSelected(selectedImages);
      onClose();
    } else {
      Alert.alert('No Images Selected', 'Please select at least one image.');
    }
  };

  const renderImageItem = ({ item, index }: { item: string; index: number }) => (
    <View style={styles.imageItem}>
      <Image source={{ uri: item }} style={styles.previewImage} />
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeImage(index)}
      >
        <X size={16} color="white" />
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView
          style={[
            styles.sheet,
            selectedImages.length > 0 || isProcessing ? styles.sheetExpanded : styles.sheetCompact,
            { backgroundColor: themeColors.background },
          ]}
        >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Select Photos</Text>
          <TouchableOpacity 
            onPress={handleDone} 
            style={[styles.doneButton, { opacity: selectedImages.length > 0 ? 1 : 0.5 }]}
            disabled={selectedImages.length === 0}
          >
            <Text style={[styles.doneButtonText, { color: themeColors.primary.main }]}>
              Done ({selectedImages.length}/{maxImages})
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
          {/* Action Buttons */}
          <View style={[styles.actionButtons, { backgroundColor: themeColors.cardBackground }]}>
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: themeColors.border }]}
              onPress={pickImage}
              disabled={isSelectingImage || isTakingPhoto || isProcessing || selectedImages.length >= maxImages}
            >
              {isSelectingImage ? (
                <ActivityIndicator size="small" color={themeColors.primary.main} />
              ) : (
                <ImageIcon size={24} color={themeColors.primary.main} />
              )}
              <Text style={[styles.actionButtonText, { color: themeColors.text }]}>Gallery</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <TouchableOpacity
              style={[styles.actionButton, { borderColor: themeColors.border }]}
              onPress={takePhoto}
              disabled={isSelectingImage || isTakingPhoto || isProcessing || selectedImages.length >= maxImages}
            >
              {isTakingPhoto ? (
                <ActivityIndicator size="small" color={themeColors.primary.main} />
              ) : (
                <Camera size={24} color={themeColors.primary.main} />
              )}
              <Text style={[styles.actionButtonText, { color: themeColors.text }]}>Camera</Text>
            </TouchableOpacity>
          </View>

          {/* Processing Indicator */}
          {isProcessing && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color={themeColors.primary.main} />
              <Text style={[styles.processingText, { color: themeColors.textSecondary }]}>
                Processing images...
              </Text>
            </View>
          )}

          {/* Selected Images Preview */}
          {selectedImages.length > 0 && (
            <View style={styles.imagesContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                Selected Images ({selectedImages.length}/{maxImages})
              </Text>
              <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>
                Add your title/caption in the "What's on your mind?" field before posting.
              </Text>
              <FlatList
                data={selectedImages}
                renderItem={renderImageItem}
                keyExtractor={(item, index) => `image-${index}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.imagesList}
              />
            </View>
          )}

          {/* Empty State */}
          {selectedImages.length === 0 && !isProcessing && (
            <View style={styles.emptyState}>
              <ImageIcon size={44} color={themeColors.textSecondary} />
              <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                No images selected
              </Text>
              <Text style={[styles.emptyStateSubtext, { color: themeColors.textSecondary }]}>
                Choose from gallery or take a photo
              </Text>
            </View>
          )}
        </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  sheetCompact: {
    minHeight: 340,
    maxHeight: '62%',
  },
  sheetExpanded: {
    minHeight: 500,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.lg,
  },
  doneButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  doneButtonText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.body,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  actionButtons: {
    flexDirection: 'row',
    borderRadius: BorderRadius.xl,
    padding: Spacing.sm,
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  actionButtonText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.body,
  },
  divider: {
    width: 1,
    marginHorizontal: Spacing.sm,
  },
  processingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  processingText: {
    marginTop: Spacing.md,
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.body,
  },
  imagesContainer: {
    marginTop: Spacing.md,
  },
  sectionTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.body,
    marginBottom: Spacing.md,
  },
  helperText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.caption,
    marginBottom: Spacing.sm,
  },
  imagesList: {
    gap: Spacing.md,
  },
  imageItem: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.md,
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: Spacing.lg,
  },
  emptyStateText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.lg,
    marginTop: Spacing.md,
  },
  emptyStateSubtext: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});

