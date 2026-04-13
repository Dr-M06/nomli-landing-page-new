import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Image,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { Image as ImageIcon, X, Upload, Camera } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow } from '../constants/Theme';
import { OFFICIAL_ACCOUNT_ID } from '../constants/ContactEmails';
import { useTheme } from '../contexts/ThemeContext';
import { EVENT_IMAGES, getImagesByCategory } from '../utils/eventCategories';
import useAuth from '../hooks/useAuth';
import { supabase } from '../utils/supabase';
import { log, warn, error } from '../utils/productionLogger';


const { width, height } = Dimensions.get('window');

interface EventImagePickerProps {
  selectedImage: string | null;
  selectedCategory: string | null;
  onSelectImage: (imageUrl: string) => void;
}

export default function EventImagePicker({ 
  selectedImage, 
  selectedCategory,
  onSelectImage 
}: EventImagePickerProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [images, setImages] = useState(EVENT_IMAGES);
  const [loading, setLoading] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [canUploadCustom, setCanUploadCustom] = useState(false);

  // Check if user can upload custom images (admin or official account)
  useEffect(() => {
    const checkUploadPermission = async () => {
      if (!user?.id) {
        setCanUploadCustom(false);
        return;
      }

      try {
        // Check if user is official account
        const isOfficial = user.id === OFFICIAL_ACCOUNT_ID;
        
        if (isOfficial) {
          setCanUploadCustom(true);
          return;
        }
        
        // Check if user is admin
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle();
        
        if (!error && profile) {
          setCanUploadCustom(profile.is_admin === true);
        } else {
          setCanUploadCustom(false);
        }
      } catch (error) {
        error('[EventImagePicker] Error checking admin status:', error);
        setCanUploadCustom(false);
      }
    };

    checkUploadPermission();
  }, [user?.id]);

  // Update images when category changes
  useEffect(() => {
    if (selectedCategory) {
      const filteredImages = getImagesByCategory(selectedCategory);
      // If there are no images for this category, use all images
      setImages((filteredImages?.length || 0) > 0 ? filteredImages : EVENT_IMAGES);
    } else {
      setImages(EVENT_IMAGES);
    }
  }, [selectedCategory]);

  const handlePickImage = async (source: 'library' | 'camera') => {
    try {
      let result;
      
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera permission is needed to take photos');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [16, 9], // Banner aspect ratio
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library permission is needed to select images');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [16, 9], // Banner aspect ratio
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets[0]) {
        onSelectImage(result.assets[0].uri);
        setModalVisible(false);
        setShowUploadOptions(false);
      }
    } catch (error) {
      error('[EventImagePicker] Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const renderImageItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.imageItem,
        selectedImage === item.url && [styles.selectedImageItem, { borderColor: themeColors.primary.main }]
      ]}
      onPress={() => {
        onSelectImage(item.url);
        setModalVisible(false);
      }}
    >
      <Image
        source={{ uri: item.url }}
        style={styles.thumbnail}
        resizeMode="cover"
      />
      <View style={styles.imageCredit}>
        <Text style={styles.imageCreditText}>{item.credit}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.imageButton, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}
        onPress={() => setModalVisible(true)}
      >
        {selectedImage ? (
          <Image
            source={{ uri: selectedImage }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderContainer}>
            <ImageIcon size={32} color={themeColors.textSecondary} />
            <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>Select an image</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalContainer, { backgroundColor: themeColors.overlay }]}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.cardBackground }]}>
              <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Select Event Image</Text>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  style={styles.closeButton}
                >
                  <X size={20} color={themeColors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                {!selectedCategory && (
                  <View style={[styles.categoryPrompt, { backgroundColor: themeColors.primary.light }]}>
                    <Text style={[styles.categoryPromptText, { color: themeColors.primary.dark }]}>
                      Please select a category first to see relevant images
                    </Text>
                  </View>
                )}

                {selectedCategory && (
                  <Text style={[styles.categoryNote, { color: themeColors.textSecondary }]}>
                    Showing images for selected category. Tap an image to select it.
                  </Text>
                )}

                {/* Upload Custom Image Button - Only for admins and official account */}
                {canUploadCustom && (
                  <>
                    <TouchableOpacity
                      style={[styles.uploadButton, { backgroundColor: themeColors.primary.main }]}
                      onPress={() => setShowUploadOptions(!showUploadOptions)}
                    >
                      <Upload size={18} color="#FFFFFF" />
                      <Text style={styles.uploadButtonText}>Upload Custom Banner Image</Text>
                    </TouchableOpacity>

                    {showUploadOptions && (
                      <View style={styles.uploadOptionsContainer}>
                        <TouchableOpacity
                          style={[styles.uploadOption, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}
                          onPress={() => handlePickImage('library')}
                        >
                          <ImageIcon size={20} color={themeColors.primary.main} />
                          <Text style={[styles.uploadOptionText, { color: themeColors.text }]}>Choose from Gallery</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.uploadOption, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}
                          onPress={() => handlePickImage('camera')}
                        >
                          <Camera size={20} color={themeColors.primary.main} />
                          <Text style={[styles.uploadOptionText, { color: themeColors.text }]}>Take Photo</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}

                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={themeColors.primary.main} />
                    <Text style={[styles.loadingText, { color: themeColors.text }]}>Loading images...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={images}
                    renderItem={renderImageItem}
                    keyExtractor={item => item.id}
                    numColumns={3}
                    contentContainerStyle={styles.imageList}
                    showsVerticalScrollIndicator={true}
                    style={styles.imageListContainer}
                    initialNumToRender={9}
                    windowSize={9}
                    removeClippedSubviews={false}
                    scrollEnabled={true}
                    scrollToOverflowEnabled={true}
                    bounces={true}
                  />
                )}

                <Text style={[styles.imagesNote, { color: themeColors.textSecondary }]}>
                  Select from our curated collection or upload your own banner image (recommended 16:9 aspect ratio)
                </Text>
              </View>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.xs,
  },
  imageButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    height: 200,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    marginTop: Spacing.sm,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.lg,
    height: height * 0.85, // Use 85% of screen height
    width: '100%',
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  imageListContainer: {
    flex: 1,
    marginVertical: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    paddingBottom: Spacing.md,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  modalTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.lg,
  },
  categoryNote: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.caption,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  imagesNote: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.caption,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.md,
    paddingHorizontal: Spacing.lg,
    fontStyle: 'italic',
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
  },
  imageList: {
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.xl,
  },
  imageItem: {
    flex: 1,
    margin: Spacing.xs,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    height: 120,
    maxWidth: (width - Spacing.md * 2 - Spacing.xs * 6) / 3, // Ensure 3 items fit per row with margins
    ...Shadow.sm,
  },
  selectedImageItem: {
    borderWidth: 3,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  imageCredit: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderTopLeftRadius: BorderRadius.sm,
  },
  imageCreditText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.tiny,
    color: 'white',
  },
  categoryPrompt: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  categoryPromptText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.body,
    textAlign: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  uploadButtonText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.sm,
    color: '#FFFFFF',
  },
  uploadOptionsContainer: {
    marginVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  uploadOptionText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.sm,
    marginLeft: Spacing.xs,
  },
}); 