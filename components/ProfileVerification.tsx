import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  Dimensions,
  Platform,
} from 'react-native';
import { Camera } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { X, Camera as CameraIcon, Check, Shield, RefreshCw, Image as ImageIcon } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius, Shadow } from '../constants/Theme';
import { log, warn, error } from '../utils/productionLogger';
import {
  validateImage,
  startVerificationSession,
  uploadVerificationSelfie,
  completeVerification,
  VerificationSession,
  VerificationResult,
} from '../utils/profileVerification';

const { width, height } = Dimensions.get('window');

interface ProfileVerificationProps {
  userId: string;
  profilePhotoUrl: string;
  onComplete: (success: boolean) => void;
  onCancel: () => void;
}

export default function ProfileVerification({
  userId,
  profilePhotoUrl,
  onComplete,
  onCancel,
}: ProfileVerificationProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [verificationSession, setVerificationSession] = useState<VerificationSession | null>(null);
  const [step, setStep] = useState<'instructions' | 'camera' | 'review' | 'processing' | 'complete'>('instructions');
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const cameraRef = useRef<Camera | null>(null);
  
  // Request camera permission on mount
  useEffect(() => {
    (async () => {
      try {
        log('[ProfileVerification] Requesting camera permission...');
        const { status } = await Camera.requestCameraPermissionsAsync();
        log('[ProfileVerification] Camera permission status:', status);
        setHasPermission(status === 'granted');
        
        if (status !== 'granted') {
          Alert.alert(
            'Camera Permission Required',
            'We need camera access to verify your identity. Please grant permission in your device settings.',
            [{ text: 'OK' }]
          );
        }
      } catch (err) {
        error('[ProfileVerification] Error requesting camera permission:', err);
        setHasPermission(false);
        setCameraError('Failed to request camera permission');
      }
    })();
    
    // Start verification session
    startSession();
  }, []);
  
  // Start a verification session
  const startSession = async () => {
    try {
      setLoading(true);
      
      const session = await startVerificationSession(userId, profilePhotoUrl);
      
      if (!session) {
        setError('Failed to start verification session. Please try again.');
        return;
      }
      
      setVerificationSession(session);
      setLoading(false);
    } catch (error) {
      error('[ProfileVerification] Error starting session:', error);
      setError('Failed to start verification session. Please try again.');
      setLoading(false);
    }
  };
  
  // Handle camera ready state
  const handleCameraReady = () => {
    log('[ProfileVerification] Camera ready');
    setCameraReady(true);
    setCameraError(null);
  };

  // Handle camera errors
  const handleCameraError = (error: any) => {
    error('[ProfileVerification] Camera error:', error);
    setCameraError(`Camera error: ${error.message || 'Unknown error'}`);
    setCameraReady(false);
  };
  
  // Take a photo for verification
  const takePicture = async () => {
    if (!cameraRef.current || !cameraReady) {
      log('[ProfileVerification] Camera not ready, cameraRef:', !!cameraRef.current, 'cameraReady:', cameraReady);
      Alert.alert('Camera not ready', 'Please wait for the camera to initialize or use the image picker instead.');
      return;
    }
    
    try {
      setProcessingImage(true);
      
      log('[ProfileVerification] Taking picture...');
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });
      log('[ProfileVerification] Picture taken:', photo.uri);
      
      // Resize and compress the image
      const processedImage = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 800 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      log('[ProfileVerification] Image processed:', processedImage.uri);
      
      setCapturedImage(processedImage.uri);
      setStep('review');
      setProcessingImage(false);
    } catch (error) {
      error('[ProfileVerification] Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture. Please try using the image picker instead.');
      setProcessingImage(false);
    }
  };

  // Pick an image from gallery as alternative to camera
  const pickImage = async () => {
    try {
      setProcessingImage(true);
      
      log('[ProfileVerification] Opening image picker...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && (result.assets?.length || 0) > 0) {
        const selectedAsset = result.assets[0];
        log('[ProfileVerification] Image selected:', selectedAsset.uri);
        
        // Resize and compress the image
        const processedImage = await ImageManipulator.manipulateAsync(
          selectedAsset.uri,
          [{ resize: { width: 800 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        log('[ProfileVerification] Image processed:', processedImage.uri);
        
        setCapturedImage(processedImage.uri);
        setStep('review');
      } else {
        log('[ProfileVerification] Image picker canceled');
      }
      
      setProcessingImage(false);
    } catch (error) {
      error('[ProfileVerification] Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
      setProcessingImage(false);
    }
  };
  
  // Retake the photo
  const retakePicture = () => {
    setCapturedImage(null);
    setStep('camera');
  };
  
  // Submit the verification photo
  const submitVerification = async () => {
    if (!capturedImage || !verificationSession) {
      Alert.alert('Error', 'Missing verification data. Please try again.');
      return;
    }
    
    try {
      setStep('processing');
      
      // Upload the verification selfie
      const uploadResult = await uploadVerificationSelfie(
        verificationSession.id,
        capturedImage
      );
      
      if (!uploadResult.success) {
        setError(uploadResult.message);
        setStep('review');
        return;
      }
      
      // Complete the verification process
      const completeResult = await completeVerification(verificationSession.id);
      
      if (!completeResult.success) {
        setError(completeResult.message);
        setStep('review');
        return;
      }
      
      // Verification completed successfully
      setStep('complete');
    } catch (error) {
      error('[ProfileVerification] Error submitting verification:', error);
      setError('Failed to submit verification. Please try again.');
      setStep('review');
    }
  };
  
  // Handle completion
  const handleComplete = () => {
    onComplete(step === 'complete');
  };
  
  // Render instructions step
  const renderInstructions = () => (
    <View style={styles.contentContainer}>
      <View style={styles.instructionIconContainer}>
        <Shield size={64} color={Colors.primary.main} />
      </View>
      
      <Text style={styles.title}>Verify Your Profile Photo</Text>
      
      <Text style={styles.description}>
        To ensure the authenticity of your profile, we need to verify that you're the person in your profile photo.
      </Text>
      
      <View style={styles.instructionsList}>
        <View style={styles.instructionItem}>
          <View style={styles.instructionNumber}>
            <Text style={styles.instructionNumberText}>1</Text>
          </View>
          <Text style={styles.instructionText}>
            We'll take a selfie photo to compare with your profile photo
          </Text>
        </View>
        
        <View style={styles.instructionItem}>
          <View style={styles.instructionNumber}>
            <Text style={styles.instructionNumberText}>2</Text>
          </View>
          <Text style={styles.instructionText}>
            Make sure your face is clearly visible and well-lit
          </Text>
        </View>
        
        <View style={styles.instructionItem}>
          <View style={styles.instructionNumber}>
            <Text style={styles.instructionNumberText}>3</Text>
          </View>
          <Text style={styles.instructionText}>
            Look directly at the camera and keep a neutral expression
          </Text>
        </View>
      </View>
      
      <View style={styles.profilePhotoContainer}>
        <Text style={styles.profilePhotoLabel}>Your Profile Photo:</Text>
        <Image
          source={{ uri: profilePhotoUrl }}
          style={styles.profilePhoto}
          resizeMode="cover"
        />
      </View>
      
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => setStep('camera')}
        disabled={loading || !verificationSession}
      >
        {loading ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Continue</Text>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={onCancel}
      >
        <Text style={styles.secondaryButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
  
  // Render camera step
  const renderCamera = () => {
    if (hasPermission === null) {
      return (
        <View style={styles.cameraContainer}>
          <ActivityIndicator size="large" color={Colors.primary.main} />
          <Text style={styles.cameraText}>Requesting camera permission...</Text>
        </View>
      );
    }
    
    if (hasPermission === false) {
      return (
        <View style={styles.cameraContainer}>
          <X size={48} color={Colors.error.main} />
          <Text style={styles.cameraText}>No access to camera</Text>
          <Text style={styles.cameraInstructionText}>
            You can continue with the image picker instead or go back.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.secondaryButton, styles.halfButton]}
              onPress={onCancel}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.primaryButton, styles.halfButton]}
              onPress={pickImage}
            >
              <ImageIcon size={18} color="white" />
              <Text style={[styles.primaryButtonText, styles.buttonWithIcon]}>Choose Photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    
    // Safe check for Camera.Constants
    const cameraType = Camera.Constants && Camera.Constants.Type 
      ? Camera.Constants.Type.front 
      : undefined;
    
    return (
      <View style={styles.cameraContainer}>
        {cameraType !== undefined ? (
          <>
            <Camera
              ref={cameraRef}
              style={styles.camera}
              type={cameraType}
              onCameraReady={handleCameraReady}
              onMountError={handleCameraError}
              ratio="1:1"
            >
              <View style={styles.cameraOverlay}>
                <View style={styles.cameraGuide}>
                  <View style={styles.faceMask} />
                </View>
                
                <View style={styles.cameraInstructions}>
                  <Text style={styles.cameraInstructionText}>
                    Position your face within the circle
                  </Text>
                </View>
              </View>
            </Camera>
            
            {cameraError && (
              <View style={styles.cameraErrorContainer}>
                <Text style={styles.errorText}>{cameraError}</Text>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={pickImage}
                >
                  <ImageIcon size={18} color={Colors.primary.main} />
                  <Text style={[styles.secondaryButtonText, styles.buttonWithIcon]}>Use Image Picker Instead</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.camera, styles.cameraFallback]}>
            <Text style={styles.cameraText}>Camera not available</Text>
            <Text style={styles.cameraInstructionText}>
              Please use the image picker instead
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: Spacing.lg }]}
              onPress={pickImage}
            >
              <ImageIcon size={18} color="white" />
              <Text style={[styles.primaryButtonText, styles.buttonWithIcon]}>Choose Photo</Text>
            </TouchableOpacity>
          </View>
        )}
        
        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setStep('instructions')}
          >
            <X size={24} color={Colors.neutral.text} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePicture}
            disabled={processingImage || !cameraReady || cameraType === undefined || !!cameraError}
          >
            {processingImage ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <CameraIcon size={32} color="white" />
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.imagePickerButton}
            onPress={pickImage}
            disabled={processingImage}
          >
            <ImageIcon size={24} color={Colors.neutral.text} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  
  // Render review step
  const renderReview = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.title}>Review Your Selfie</Text>
      
      <Text style={styles.description}>
        Make sure your face is clearly visible and matches your profile photo.
      </Text>
      
      <View style={styles.photoComparisonContainer}>
        <View style={styles.photoContainer}>
          <Text style={styles.photoLabel}>Profile Photo</Text>
          <Image
            source={{ uri: profilePhotoUrl }}
            style={styles.comparisonPhoto}
            resizeMode="cover"
          />
        </View>
        
        <View style={styles.photoContainer}>
          <Text style={styles.photoLabel}>Verification Selfie</Text>
          <Image
            source={{ uri: capturedImage || '' }}
            style={styles.comparisonPhoto}
            resizeMode="cover"
          />
        </View>
      </View>
      
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
      
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, styles.halfButton]}
          onPress={retakePicture}
        >
          <RefreshCw size={18} color={Colors.primary.main} />
          <Text style={[styles.secondaryButtonText, styles.buttonWithIcon]}>Retake</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.primaryButton, styles.halfButton]}
          onPress={submitVerification}
        >
          <Check size={18} color="white" />
          <Text style={[styles.primaryButtonText, styles.buttonWithIcon]}>Submit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  
  // Render processing step
  const renderProcessing = () => (
    <View style={styles.contentContainer}>
      <ActivityIndicator size="large" color={Colors.primary.main} />
      <Text style={styles.title}>Processing Verification</Text>
      <Text style={styles.description}>
        Please wait while we verify your identity...
      </Text>
    </View>
  );
  
  // Render complete step
  const renderComplete = () => (
    <View style={styles.contentContainer}>
      <View style={styles.successIconContainer}>
        <Check size={64} color="white" />
      </View>
      
      <Text style={styles.title}>Verification Complete</Text>
      
      <Text style={styles.description}>
        Your profile has been successfully verified. Thank you for helping us maintain a trusted community.
      </Text>
      
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleComplete}
      >
        <Text style={styles.primaryButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
  
  // Render content based on current step
  const renderContent = () => {
    switch (step) {
      case 'instructions':
        return renderInstructions();
      case 'camera':
        return renderCamera();
      case 'review':
        return renderReview();
      case 'processing':
        return renderProcessing();
      case 'complete':
        return renderComplete();
      default:
        return null;
    }
  };
  
  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={false}
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        {renderContent()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
  },
  contentContainer: {
    flex: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.h3,
    fontFamily: FontFamily.bold,
    color: Colors.neutral.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  description: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.textSecondary,
    marginBottom: Spacing.xl,
    textAlign: 'center',
    lineHeight: FontSizes.body * 1.4,
  },
  instructionIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    ...Shadow.md,
  },
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.success.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    ...Shadow.md,
  },
  instructionsList: {
    width: '100%',
    marginBottom: Spacing.xl,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  instructionNumberText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.bold,
    color: 'white',
  },
  instructionText: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.text,
    lineHeight: FontSizes.body * 1.4,
  },
  profilePhotoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  profilePhotoLabel: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.textSecondary,
    marginBottom: Spacing.sm,
  },
  profilePhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    ...Shadow.sm,
  },
  primaryButton: {
    backgroundColor: Colors.primary.main,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    width: '100%',
    ...Shadow.sm,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: FontSizes.button,
    fontFamily: FontFamily.bold,
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    color: Colors.primary.main,
    fontSize: FontSizes.button,
    fontFamily: FontFamily.bold,
  },
  buttonWithIcon: {
    marginLeft: Spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  halfButton: {
    width: '48%',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  cameraFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  cameraGuide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceMask: {
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    borderWidth: 2,
    borderColor: 'white',
    backgroundColor: 'transparent',
  },
  cameraInstructions: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: Spacing.md,
    width: '100%',
  },
  cameraInstructionText: {
    color: 'white',
    textAlign: 'center',
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: 'black',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePickerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoComparisonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.xl,
  },
  photoContainer: {
    alignItems: 'center',
    width: '48%',
  },
  photoLabel: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.textSecondary,
    marginBottom: Spacing.sm,
  },
  comparisonPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    ...Shadow.sm,
  },
  errorText: {
    color: Colors.error.main,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  cameraText: {
    color: 'white',
    fontSize: FontSizes.h4,
    fontFamily: FontFamily.medium,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  cameraErrorContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
}); 