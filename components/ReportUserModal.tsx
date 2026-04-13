import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { X, AlertTriangle, Image as ImageIcon, XCircle } from 'lucide-react-native';
import { Colors, getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { useTheme } from '../contexts/ThemeContext';
import { sendUserReport } from '../utils/reportUser';
import * as ImagePicker from 'expo-image-picker';
import GenZAlert from './GenZAlert';
import { log, warn, error } from '../utils/productionLogger';


interface ReportUserModalProps {
  visible: boolean;
  onClose: () => void;
  reportedUserId: string;
  reportedUsername: string;
  reporterUserId: string;
  reporterUsername: string;
}

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam or fake account' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'impersonation', label: 'Impersonation' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'violence', label: 'Violence or threats' },
  { id: 'hate', label: 'Hate speech' },
  { id: 'other', label: 'Other' },
];

export default function ReportUserModal({
  visible,
  onClose,
  reportedUserId,
  reportedUsername,
  reporterUserId,
  reporterUsername,
}: ReportUserModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSubmessage, setAlertSubmessage] = useState('');
  const closeModalAfterAlertRef = useRef<NodeJS.Timeout | null>(null);

  const handlePickPhoto = async () => {
    // Check if already have 2 photos
    if (uploadedPhotos.length >= 2) {
      showCustomAlert('maximum photos reached', 'you can upload up to 2 photos');
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showCustomAlert('permission needed', 'please allow photo access to upload evidence');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        allowsMultipleSelection: false, // Pick one at a time
      });

      if (!result.canceled && result.assets[0]) {
        setUploadedPhotos([...uploadedPhotos, result.assets[0].uri]);
      }
    } catch (error) {
      error('[ReportUserModal] Error picking photo:', error);
      showCustomAlert('failed to pick photo', 'please try again');
    }
  };

  const handleRemovePhoto = (index: number) => {
    setUploadedPhotos(uploadedPhotos.filter((_, i) => i !== index));
  };

  const showCustomAlert = (message: string, submessage?: string) => {
    setAlertMessage(message);
    setAlertSubmessage(submessage || '');
    setShowAlert(true);
    
    // Clear any existing timer
    if (closeModalAfterAlertRef.current) {
      clearTimeout(closeModalAfterAlertRef.current);
    }
  };

  const handleAlertClose = () => {
    setShowAlert(false);
    
    // Close modal after alert is dismissed
    if (closeModalAfterAlertRef.current) {
      clearTimeout(closeModalAfterAlertRef.current);
    }
    
    closeModalAfterAlertRef.current = setTimeout(() => {
      setSelectedReason(null);
      setCustomReason('');
      setUploadedPhotos([]);
      onClose();
    }, 300); // Small delay for smooth transition
  };

  const handleSubmit = async () => {
    if (!selectedReason) {
      showCustomAlert('please select a reason', 'choose why you\'re reporting this user');
      return;
    }

    // Validate custom reason if "Other" is selected
    if (selectedReason === 'other' && !customReason.trim()) {
      showCustomAlert('please provide details', 'describe why you\'re reporting this user');
      return;
    }

    try {
      setSubmitting(true);
      
      const finalReason = selectedReason === 'other' 
        ? `Other: ${customReason.trim()}`
        : selectedReason;
      
      const success = await sendUserReport({
        reportedUserId,
        reportedUsername,
        reporterUserId,
        reporterUsername,
        reason: finalReason,
        customReason: selectedReason === 'other' ? customReason.trim() : undefined,
        photoUris: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
      });

      if (success) {
        // Show success alert
        showCustomAlert(
          'report submitted',
          'thank you for your report. we\'ll conduct a follow-up. your information will remain anonymous.'
        );
        
        // Don't auto-close modal - let user read alert and close it manually
        // Modal will close when alert is dismissed via handleAlertClose
      } else {
        showCustomAlert('failed to submit report', 'please try again');
      }
    } catch (error) {
      error('[ReportUserModal] Error submitting report:', error);
      showCustomAlert('something went wrong', 'please try again later');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setSelectedReason(null);
      setCustomReason('');
      setUploadedPhotos([]);
      onClose();
    }
  };

  const handleReasonChange = (reasonId: string) => {
    setSelectedReason(reasonId);
    if (reasonId !== 'other') {
      setCustomReason('');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.container, { backgroundColor: themeColors.neutral.card }]}>
                {/* Header */}
                <View style={styles.header}>
                  <View style={styles.headerLeft}>
                    <View style={[styles.iconCircle, { backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)' }]}>
                      <AlertTriangle size={20} color={Colors.error.main} strokeWidth={2.5} />
                    </View>
                    <Text style={[styles.title, { color: themeColors.neutral.text }]}>
                      report user
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleClose}
                    disabled={submitting}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X size={20} color={themeColors.neutral.subtext} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

                {/* Scrollable Content */}
                <ScrollView
                  style={styles.scrollableContent}
                  contentContainerStyle={styles.scrollableContentContainer}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                >
                  {/* Description */}
                  <Text style={[styles.description, { color: themeColors.neutral.subtext }]}>
                    help us understand what's wrong. your report is anonymous and we'll conduct a follow-up.
                  </Text>

                  {/* Radio Options */}
                  <View style={styles.optionsContainer}>
            {REPORT_REASONS.map((reason) => {
              const isSelected = selectedReason === reason.id;
              return (
                <TouchableOpacity
                  key={reason.id}
                  style={[
                    styles.option,
                    {
                      backgroundColor: isSelected
                        ? (isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)')
                        : 'transparent',
                      borderColor: isSelected
                        ? Colors.primary.main
                        : themeColors.neutral.border,
                    },
                  ]}
                  onPress={() => handleReasonChange(reason.id)}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionContent}>
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: isSelected
                            ? Colors.primary.main
                            : themeColors.neutral.border,
                          backgroundColor: isSelected
                            ? Colors.primary.main
                            : 'transparent',
                        },
                      ]}
                    >
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <Text style={[styles.optionLabel, { color: themeColors.neutral.text }]}>
                      {reason.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
                  </View>

                  {/* Custom Reason Input - Show when "Other" is selected */}
                  {selectedReason === 'other' && (
                    <View style={styles.customReasonContainer}>
                      <Text style={[styles.customReasonLabel, { color: themeColors.neutral.text }]}>
                        tell us more
                      </Text>
                      <TextInput
                        style={[
                          styles.customReasonInput,
                          {
                            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                            color: themeColors.neutral.text,
                            borderColor: themeColors.neutral.border,
                          },
                        ]}
                        placeholder="describe the issue..."
                        placeholderTextColor={themeColors.neutral.subtext}
                        value={customReason}
                        onChangeText={setCustomReason}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                        maxLength={500}
                        editable={!submitting}
                        returnKeyType="done"
                        blurOnSubmit={true}
                        onSubmitEditing={Keyboard.dismiss}
                      />
                      <Text style={[styles.characterCount, { color: themeColors.neutral.subtext }]}>
                        {customReason.length}/500
                      </Text>
                    </View>
                  )}

                  {/* Photo Upload Section */}
                  <View style={styles.photoSection}>
                    {uploadedPhotos.length < 2 && (
                      <TouchableOpacity
                        style={[
                          styles.photoButton,
                          {
                            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                            borderColor: themeColors.neutral.border,
                          },
                        ]}
                        onPress={handlePickPhoto}
                        disabled={submitting}
                        activeOpacity={0.7}
                      >
                        <ImageIcon size={18} color={themeColors.neutral.subtext} strokeWidth={2.5} />
                        <Text style={[styles.photoButtonText, { color: themeColors.neutral.subtext }]}>
                          add photo {uploadedPhotos.length > 0 ? `(${uploadedPhotos.length}/2)` : '(optional)'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Show uploaded photos */}
                    {uploadedPhotos.length > 0 && (
                      <View style={styles.photosContainer}>
                        {uploadedPhotos.map((photoUri, index) => (
                          <View key={index} style={styles.photoPreview}>
                            <Image source={{ uri: photoUri }} style={styles.photoImage} />
                            <TouchableOpacity
                              style={styles.removePhotoButton}
                              onPress={() => handleRemovePhoto(index)}
                              disabled={submitting}
                            >
                              <XCircle size={20} color={Colors.error.main} fill="#FFFFFF" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </ScrollView>

                {/* Submit Button - Fixed at bottom */}
                <View style={[styles.submitButtonContainer, { borderTopColor: themeColors.neutral.border }]}>
                  <TouchableOpacity
                    style={[
                      styles.submitButton,
                      {
                        backgroundColor: (selectedReason && (selectedReason !== 'other' || customReason.trim()))
                          ? Colors.primary.main
                          : themeColors.neutral.border,
                        opacity: submitting || !selectedReason || (selectedReason === 'other' && !customReason.trim()) ? 0.6 : 1,
                      },
                    ]}
                    onPress={handleSubmit}
                    disabled={!selectedReason || submitting || (selectedReason === 'other' && !customReason.trim())}
                    activeOpacity={0.8}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>submit</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      
      {/* Custom Gen Z Alert */}
      <GenZAlert
        visible={showAlert}
        message={alertMessage}
        submessage={alertSubmessage}
        onClose={handleAlertClose}
        duration={6000}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexShrink: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  scrollableContent: {
    flexGrow: 0,
  },
  scrollableContentContainer: {
    paddingBottom: Spacing.sm,
    flexGrow: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.subhead,
    fontFamily: FontFamily.semibold,
    letterSpacing: -0.3,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  description: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    lineHeight: FontSizes.caption * 1.5,
    marginBottom: Spacing.lg,
    letterSpacing: -0.2,
  },
  optionsContainer: {
    marginBottom: Spacing.lg,
  },
  option: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.pill,
    borderWidth: 2,
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.pill,
    backgroundColor: '#FFFFFF',
  },
  optionLabel: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    flex: 1,
    letterSpacing: -0.2,
  },
  submitButtonContainer: {
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  submitButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  customReasonContainer: {
    marginBottom: Spacing.lg,
  },
  customReasonLabel: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.xs,
    letterSpacing: -0.2,
  },
  customReasonInput: {
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    padding: Spacing.md,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    minHeight: 100,
    maxHeight: 150,
    letterSpacing: -0.2,
  },
  characterCount: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.xs,
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  photoSection: {
    marginBottom: Spacing.lg,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  photoButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginLeft: Spacing.sm,
    letterSpacing: -0.2,
  },
  photoPreview: {
    position: 'relative',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    width: '48%',
    aspectRatio: 4 / 3,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.md,
  },
  removePhotoButton: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BorderRadius.pill,
    padding: Spacing.xs,
  },
});

