import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  TextInput,
  Switch,
  DeviceEventEmitter,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Play, Pause } from 'lucide-react-native';
import { 
  Camera, 
  Video as VideoIcon, 
  X, 
  CheckCircle, 
  CloudUpload,
  Info,
} from 'lucide-react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withRepeat, 
  withSequence,
  Easing
} from 'react-native-reanimated';

import { uploadVideoToMux, VideoUploadResult, MAX_VIDEO_UPLOAD_SIZE_MB } from '../utils/muxConfig';
import { useVideoUpload } from '../contexts/VideoUploadContext';
import { logNetworkDiagnostics } from '../utils/networkDiagnostics';
import { 
  quickCompress, 
  aggressiveCompress, 
  highQualityCompress,
  getCompressionRecommendation,
  VideoCompressionProgress,
  VideoCompressionResult 
} from '../utils/videoCompression';
import { createPost } from '../utils/communityUtils';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import useAuth from '../hooks/useAuth';
import useProfile from '../hooks/useProfile';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from '../utils/productionLogger';

interface VideoPickerProps {
  visible: boolean;
  onClose: () => void;
  onVideoUploaded: (videoData: VideoUploadResult) => void;
  maxDuration?: number; // Maximum video duration in seconds (default: 110 seconds = 1:50)
  allowDirectPost?: boolean; // Whether to allow posting directly from this screen
  onMinimize?: () => void; // Optional minimize callback
  isMinimized?: boolean; // Whether the modal is minimized
}

export default function VideoPicker({ 
  visible, 
  onClose, 
  onVideoUploaded, 
  maxDuration = 110,
  allowDirectPost = false,
  onMinimize,
  isMinimized = false
}: VideoPickerProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const { uploadVideo, uploads } = useVideoUpload();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [keyboardPad, setKeyboardPad] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvt, (e) => {
      setKeyboardPad(e.endCoordinates?.height ?? 0);
    });
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardPad(0));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);
  
  // Upload states
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'idle' | 'preparing' | 'compressing' | 'uploading' | 'processing' | 'complete'>('idle');
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  
  // Compression states
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionStage, setCompressionStage] = useState<string>('');
  const [compressedVideoUri, setCompressedVideoUri] = useState<string | null>(null);
  const [compressionSavings, setCompressionSavings] = useState<string>('');
  const [compressionQuality, setCompressionQuality] = useState<'quick' | 'aggressive' | 'high'>('aggressive');
  
  // Selection states
  const [isSelectingVideo, setIsSelectingVideo] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideoUri, setSelectedVideoUri] = useState<string | null>(null);
  const [selectedVideoDuration, setSelectedVideoDuration] = useState<number>(0);
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [adultContent, setAdultContent] = useState(false);
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [videoPosition, setVideoPosition] = useState<number>(0);
  
  // Animation values
  const progressValue = useSharedValue(0);
  const uploadButtonScale = useSharedValue(1);
  const checkmarkScale = useSharedValue(0);
  const uploadIconRotation = useSharedValue(0);

  // Video ref for duration detection
  const videoRef = useRef<Video>(null);
  
  // Track current upload ID and refs for cleanup
  const currentUploadIdRef = useRef<string | null>(null);
  const optimisticPostIdRef = useRef<string | null>(null);
  const canCloseEarlyRef = useRef(false);
  const autoCloseScheduledRef = useRef(false);
  const handleDirectPostRef = useRef<((videoResult: VideoUploadResult) => Promise<void>) | null>(null);

  // Reset states when modal opens/closes
  useEffect(() => {
    if (visible) {
      resetStates();
      currentUploadIdRef.current = null;
      optimisticPostIdRef.current = null;
      canCloseEarlyRef.current = false;
      autoCloseScheduledRef.current = false;
    }
  }, [visible]);

  // Update animation progress
  useEffect(() => {
    progressValue.value = withTiming(uploadProgress / 100, { duration: 300 });
  }, [uploadProgress]);
  
  // Watch for upload progress updates from context
  useEffect(() => {
    if (!currentUploadIdRef.current) return;
    
    const currentUpload = uploads.find(u => u.id === currentUploadIdRef.current);
    if (!currentUpload) return;
    
    // Update progress from upload context
    if (currentUpload.progress > 0) {
      setUploadProgress(currentUpload.progress);
      
      // Allow early close after 5% progress (user sees it's working)
      if (currentUpload.progress >= 5 && !canCloseEarlyRef.current) {
        canCloseEarlyRef.current = true;
        setUploadStatus('📤 Uploading in background... You can close this and continue using the app.');
        
        if (!autoCloseScheduledRef.current) {
          autoCloseScheduledRef.current = true;
          setTimeout(() => {
            const upload = uploads.find(u => u.id === currentUploadIdRef.current);
            if (upload && upload.status !== 'completed' && upload.status !== 'failed') {
              log('🎬 [VideoPicker] Auto-closing modal - upload continues in background');
              // CRITICAL: Use onMinimize instead of onClose when allowDirectPost - we must stay
              // mounted so handleDirectPost runs when upload completes. If we call onClose(),
              // the parent unmounts us and the post is never created.
              if (allowDirectPost && onMinimize) {
                onMinimize();
              } else {
                onClose();
              }
            }
          }, 2000);
        }
      }
    }
    
    // Update status based on upload stage
    if (currentUpload.status === 'compressing') {
      setUploadStatus(`🗜️ Compressing... ${Math.round(currentUpload.progress)}%`);
    } else if (currentUpload.status === 'uploading') {
      if (!canCloseEarlyRef.current) {
        setUploadStatus(`📤 Uploading... ${Math.round(currentUpload.progress)}%`);
      }
      if (allowDirectPost && optimisticPostIdRef.current) {
        DeviceEventEmitter.emit('optimisticVideoPostProgress', {
          tempId: optimisticPostIdRef.current,
          status: 'uploading',
          progress: Math.max(1, Math.min(98, Math.round(currentUpload.progress))),
        });
      }
    } else if (currentUpload.status === 'processing') {
      setUploadStatus('⏳ Processing video on our servers...');
      setUploadProgress(Math.max(0, Math.min(100, Math.round(currentUpload.progress))));
      if (allowDirectPost && optimisticPostIdRef.current) {
        DeviceEventEmitter.emit('optimisticVideoPostProgress', {
          tempId: optimisticPostIdRef.current,
          status: 'processing',
          progress: Math.max(82, Math.min(98, Math.round(currentUpload.progress))),
        });
      }
    } else if (currentUpload.status === 'completed' && currentUpload.result) {
      // Use edited video duration if available, otherwise original
      const finalDuration = selectedVideoDuration;
      const isVideoEdited = false;
      
      // Prepare final result with correct edited metadata
      const videoResult: VideoUploadResult = {
        secure_url: currentUpload.result.secure_url,
        thumbnail: currentUpload.result.thumbnail,
        duration: currentUpload.result.duration || finalDuration,
        startTime: 0,
        endTime: finalDuration,
        isEdited: isVideoEdited,
        muxId: currentUpload.result.muxId || currentUpload.result.id,
        playbackId: currentUpload.result.playbackId,
        originalDuration: selectedVideoDuration,
        trimmedDuration: finalDuration
      };

      log('🎬 [VideoPicker] Upload completed:', videoResult);
      log('🎬 [VideoPicker] Video was edited:', isVideoEdited, 'Duration:', finalDuration);
      
      setUploadProgress(100);
      setUploadStage('complete');
      setUploadStatus('✅ Upload complete!');
      setIsUploading(false);
      
      // Prevent auto-close when upload completes
      autoCloseScheduledRef.current = false;
      canCloseEarlyRef.current = false;
      
      // Handle direct post if enabled
      if (allowDirectPost && user && handleDirectPostRef.current) {
        // Call handleDirectPost via ref
        handleDirectPostRef.current(videoResult).catch(console.error);
      } else {
        // Call parent callback for non-direct posts
        onVideoUploaded(videoResult);
        
        // Show success alert
        Toast.show({
          type: 'success',
          text1: '✅ Video uploaded!',
          text2: isVideoEdited ? 'Your edited video is ready.' : 'Your video is ready.',
        });
        
        // Close modal after showing success
        setTimeout(() => {
          onClose();
        }, 2000);
      }
      
      // Reset upload tracking
      currentUploadIdRef.current = null;
    } else if (currentUpload.status === 'failed') {
      setError(currentUpload.error || 'Upload failed. Please try again.');
      setUploadStage('error');
      setUploadStatus('❌ Upload failed');
      setIsUploading(false);
      if (allowDirectPost && optimisticPostIdRef.current) {
        DeviceEventEmitter.emit('optimisticVideoPostFailed', {
          tempId: optimisticPostIdRef.current,
          error: currentUpload.error || 'Upload failed. Please try again.',
        });
      }
      
      Toast.show({
        type: 'error',
        text1: 'Upload Failed',
        text2: currentUpload.error || 'Please try again.',
      });
      
      // Reset upload tracking
      currentUploadIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads, selectedVideoDuration, allowDirectPost, onVideoUploaded, onClose, user]);

  const resetStates = () => {
    setUploadProgress(0);
    setUploadStage('idle');
    setUploadStatus('');
    setIsUploading(false);
    setIsSelectingVideo(false);
    setIsRecordingVideo(false);
    setError(null);
    setSelectedVideoUri(null);
    setSelectedVideoDuration(0);
    setVideoTitle('');
    setLocation('');
    setAdultContent(false);
    setIsPosting(false);
    // Reset compression states
    setIsCompressing(false);
    setCompressionProgress(0);
    setCompressionStage('');
    setCompressedVideoUri(null);
    setCompressionSavings('');
    setCompressionQuality('aggressive');
    setIsVideoPlaying(false);
    setVideoPosition(0);
    checkmarkScale.value = 0;
    uploadIconRotation.value = 0;
  };



  const handleVideoSelect = async () => {
    try {
      setIsSelectingVideo(true);
      setError(null);
      
      log('🎬 [VideoPicker] Requesting media library permissions...');
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to select videos.');
        return;
      }

      log('🎬 [VideoPicker] Launching image library...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
        // Remove videoMaxDuration - allow longer videos for editing/clipping
        // Duration will be validated after editing, before upload
      });

      log('🎬 [VideoPicker] Image library result:', result);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        log('🎬 [VideoPicker] Selected video asset:', asset);
        log('🎬 [VideoPicker] ImagePicker reported duration:', asset.duration, 'seconds');
        
        // Validate file size (PS5 clips can be very large)
        const maxFileSize = MAX_VIDEO_UPLOAD_SIZE_MB * 1024 * 1024;
        if (asset.fileSize && asset.fileSize > maxFileSize) {
          setError(
            `Video file is too large (${Math.round(asset.fileSize / (1024 * 1024))}MB). Please select a video smaller than ${MAX_VIDEO_UPLOAD_SIZE_MB}MB.`
          );
          return;
        }
        
        // Skip initial duration validation - we'll validate with real duration detection
        // ImagePicker duration estimates can be inaccurate, especially for certain video formats
        log('🎬 [VideoPicker] ImagePicker duration estimate:', asset.duration, 'seconds (may be inaccurate)');
        
        // Validate file size - check if we can get file size info
        if (asset.fileSize) {
          const fileSizeMB = asset.fileSize / (1024 * 1024);
          log('📦 [VideoPicker] Video file size:', fileSizeMB.toFixed(2), 'MB');
          
          if (asset.fileSize > maxFileSize) {
            setError(
              `Video file is too large (${fileSizeMB.toFixed(1)}MB). Please select a video smaller than ${MAX_VIDEO_UPLOAD_SIZE_MB}MB.`
            );
            return;
          }
        }
        
        log('🎬 [VideoPicker] File size validation passed:', {
          fileSize: asset.fileSize,
          fileSizeMB: asset.fileSize ? Math.round(asset.fileSize / (1024 * 1024)) : 'unknown',
          duration: asset.duration,
        });
        
        // Store video info and show title input
        setSelectedVideoUri(asset.uri);
        // Convert duration to seconds if it's in milliseconds (duration > 1000 likely means milliseconds)
        const durationInSeconds = (asset.duration || 0) > 1000 
          ? Math.floor((asset.duration || 0) / 1000) 
          : Math.floor(asset.duration || 0);
        setSelectedVideoDuration(durationInSeconds);
        setUploadStage('preparing');
        
        // The real duration will be detected by the hidden video component
      }
    } catch (error) {
      error('🎬 [VideoPicker] Video selection error:', error);
      setError('Failed to select video. Please try again.');
    } finally {
      setIsSelectingVideo(false);
    }
  };

  const handleVideoRecord = async () => {
    try {
      setIsRecordingVideo(true);
      setError(null);
      
      log('🎬 [VideoPicker] Requesting camera permissions...');
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Please allow camera access to record videos.');
        return;
      }

      log('🎬 [VideoPicker] Launching camera...');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
        // Remove videoMaxDuration - allow longer videos for editing/clipping
        // Duration will be validated after editing, before upload
      });

      log('🎬 [VideoPicker] Camera result:', result);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        log('🎬 [VideoPicker] Recorded video asset:', asset);
        log('🎬 [VideoPicker] ImagePicker reported duration:', asset.duration, 'seconds');
        
        // Store video info and show title input
        setSelectedVideoUri(asset.uri);
        // Convert duration to seconds if it's in milliseconds (duration > 1000 likely means milliseconds)
        const durationInSeconds = (asset.duration || 0) > 1000 
          ? Math.floor((asset.duration || 0) / 1000) 
          : Math.floor(asset.duration || 0);
        setSelectedVideoDuration(durationInSeconds);
        setUploadStage('preparing');
        
        // The real duration will be detected by the hidden video component
      }
    } catch (error) {
      error('🎬 [VideoPicker] Video recording error:', error);
      setError('Failed to record video. Please try again.');
    } finally {
      setIsRecordingVideo(false);
    }
  };

  // Handle video playback status updates
  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsVideoPlaying(status.isPlaying);
      setVideoPosition(status.positionMillis / 1000);
      
      // Auto-pause when video ends
      if (status.didJustFinish) {
        setIsVideoPlaying(false);
        if (videoRef.current) {
          videoRef.current.setPositionAsync(0);
        }
      }
    }
  };

  // Toggle play/pause
  const handlePlayPause = async () => {
    if (!videoRef.current) return;
    
    try {
      if (isVideoPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    } catch (error) {
      error('[VideoPicker] Error toggling playback:', error);
    }
  };

  const handleUpload = async () => {
    if (!selectedVideoUri) return;

    if (!videoTitle.trim()) {
      setError('Please enter a title for your video.');
      return;
    }

    const finalVideoDuration = selectedVideoDuration;

    // Validate final video duration before uploading (maxDuration is enforced for post uploads).
    const MAX_UPLOAD_DURATION = maxDuration;
    const durationSecRounded = Math.round(finalVideoDuration);
    if (durationSecRounded > MAX_UPLOAD_DURATION) {
      setError(
        `Your edited video is ${durationSecRounded}s long. ` +
        `Please trim it to ${MAX_UPLOAD_DURATION} seconds (${Math.floor(MAX_UPLOAD_DURATION / 60)}:${String(MAX_UPLOAD_DURATION % 60).padStart(2, '0')}) or shorter before uploading.`
      );
      return;
    }

    try {
      setIsUploading(true);
      setUploadStage('preparing');
      setUploadStatus('✨ Getting your video ready...');
      setUploadProgress(0);
      
      // Step 1: Compress only larger files to reduce waiting time before upload starts.
      const localFileInfo = await FileSystem.getInfoAsync(selectedVideoUri);
      const fileSizeBytes = localFileInfo.exists && 'size' in localFileInfo && localFileInfo.size ? localFileInfo.size : 0;
      const shouldCompress = fileSizeBytes > 25 * 1024 * 1024; // 25MB+
      let videoToUpload = selectedVideoUri;

      if (shouldCompress) {
        setUploadStage('compressing');
        setUploadStatus('🗜️ Compressing video for faster upload...');
        setIsCompressing(true);

        log('🎬 [VideoPicker] Starting video compression...');
        const recommendation = getCompressionRecommendation(fileSizeBytes || 50000000, 'cellular');
        log('📊 [VideoPicker] Compression recommendation:', recommendation);
        setUploadStatus(`🗜️ Compressing video (${recommendation.estimatedTime})...`);

        const compressionFunctions = {
          quick: quickCompress,
          aggressive: aggressiveCompress,
          high: highQualityCompress,
        };

        const compressionResult: VideoCompressionResult = await compressionFunctions[compressionQuality](
          selectedVideoUri,
          (progress: VideoCompressionProgress) => {
            setCompressionProgress(progress.progress);
            setCompressionStage(progress.stage);
            setUploadProgress(Math.round(progress.progress * 0.4));

            const stageMessages = {
              analyzing: '🔍 Analyzing video...',
              compressing: '🗜️ Compressing video...',
              finalizing: '✨ Finalizing compression...'
            };

            setUploadStatus(stageMessages[progress.stage] || 'Processing...');

            if (progress.estimatedTime) {
              setUploadStatus(prev => `${prev} (~${Math.round(progress.estimatedTime)}s remaining)`);
            }
          }
        );

        log('✅ [VideoPicker] Video compression completed:', compressionResult);
        const savingsPercent = Math.round((1 - compressionResult.compressionRatio) * 100);
        const savingsText = `${savingsPercent}% smaller (${(compressionResult.originalSize / (1024 * 1024)).toFixed(1)}MB → ${(compressionResult.compressedSize / (1024 * 1024)).toFixed(1)}MB)`;
        setCompressionSavings(savingsText);
        setCompressedVideoUri(compressionResult.uri);
        videoToUpload = compressionResult.uri;
        setIsCompressing(false);
        setUploadProgress(40);
      } else {
        setCompressionSavings('');
        setCompressedVideoUri(null);
        setIsCompressing(false);
        setUploadProgress(20);
        setUploadStatus('⚡ Skipping compression for faster upload...');
      }
      
      // Start upload animation
      uploadButtonScale.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withTiming(1, { duration: 100 })
      );
      
      uploadIconRotation.value = withRepeat(
        withTiming(360, { duration: 2000, easing: Easing.linear }),
        -1,
        false
      );

      // Step 2: Upload the compressed video
      setUploadStage('uploading');
      setUploadStatus('🚀 Uploading compressed video...');
      
      log('🎬 [VideoPicker] Starting Mux upload...');
      log('🎬 [VideoPicker] Video URI:', videoToUpload);
      log('🎬 [VideoPicker] Original URI:', selectedVideoUri);
      log('🎬 [VideoPicker] Video duration:', selectedVideoDuration, 'seconds');
      log('🎬 [VideoPicker] Video title:', videoTitle);
      log('🎬 [VideoPicker] Compression savings:', compressionSavings);

      // Start background upload (TikTok-style - non-blocking)
      setUploadStage('uploading');
      setUploadStatus('🚀 Starting upload...');
      setUploadProgress(0);

      // Get upload ID immediately (context returns it before upload finishes) so completion useEffect can call handleDirectPost
      const uploadId = await uploadVideo(videoToUpload, videoTitle.trim(), {
        maxDuration,
        description: `Video uploaded via video picker: ${videoTitle.trim()}`,
      });
      currentUploadIdRef.current = uploadId;
      if (allowDirectPost && user?.id) {
        const tempId = `temp_video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        optimisticPostIdRef.current = tempId;
        const optimisticContent = (videoTitle.trim() || 'New video post').trim();
        DeviceEventEmitter.emit('optimisticVideoPostCreated', {
          tempId,
          post: {
            id: tempId,
            client_temp_id: tempId,
            client_upload_status: 'uploading',
            client_upload_progress: 3,
            user_id: user.id,
            user_email: user.email || '',
            username: user.user_metadata?.username || user.email?.split('@')[0] || 'User',
            display_name: profile?.full_name || user.user_metadata?.full_name || undefined,
            user_avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || undefined,
            content: optimisticContent,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            video_url: selectedVideoUri || videoToUpload,
            likes_count: 0,
            comments_count: 0,
            liked_by_user: false,
            liked: false,
            bookmarked: false,
            isBookmarked: false,
            post_type: 'standard',
            adult_content: adultContent,
          },
        });
      }
      log('🎬 [VideoPicker] Upload started with ID:', uploadId);

    } catch (error: any) {
      error('🎬 [VideoPicker] Mux upload failed:', error);
      // Check if it's a content moderation error
      const errorMessage = error?.message || 'Oops! Something went wrong. Please try again.';
      const isModerationError = errorMessage.includes('content') || errorMessage.includes('guidelines') || errorMessage.includes('moderation');
      
      // Show alert for moderation errors
      if (isModerationError) {
        Alert.alert(
          'Content Not Allowed',
          errorMessage || 'Your video does not meet our community guidelines. Please review and try again.',
          [{ text: 'OK' }]
        );
      }
      
      setError(isModerationError ? errorMessage : `Oops! Something went wrong. Please try again.`);
      setUploadStage('error');
      setUploadStatus(isModerationError ? '❌ Content not allowed' : '❌ Let\'s try that again...');
      setIsUploading(false);
      return;
    }
  };

  // Store handleDirectPost in ref so it can be accessed in useEffect
  const handleDirectPost = useCallback(async (videoResult: VideoUploadResult) => {
    if (!user || !allowDirectPost) return;

    try {
      setIsPosting(true);
      setUploadStage('processing');
      setUploadStatus('📝 Publishing your story...');

      log('📝 [VideoPicker] Creating post directly...');
      log('📝 [VideoPicker] Video result:', videoResult);
      log('📝 [VideoPicker] Post title:', videoTitle.trim());
      log('📝 [VideoPicker] Location:', location);

      const username = user.user_metadata?.username || user.email?.split('@')[0] || 'User';
      const userEmail = user.email || '';

      const result = await createPost(
        videoTitle.trim(),
        user.id,
        username,
        userEmail,
        location,
        undefined, // No image URLs
        undefined, // No image URL
        videoResult.secure_url, // Video URL
        false, // isBusiness
        'standard',
        null, // audio
        adultContent
      );

      if (result && result.id) {
        log('✅ [VideoPicker] Post created successfully:', result.id);
        log('✅ [VideoPicker] Post data:', JSON.stringify(result, null, 2));
        
        setUploadStage('complete');
        setUploadStatus('🎊 Your video is live!');
        
        // Clear ALL caches to ensure new video appears immediately
        try {
          const { clearVideoPostsCache } = require('../utils/videoPostUtils');
          await clearVideoPostsCache();
          log('✅ [VideoPicker] Cleared video posts cache');
        } catch (error: any) {
          warn('[VideoPicker] Failed to clear video cache:', error);
        }
        
        try {
          const { clearPostsCache, clearUserPostsCache } = require('../utils/communityUtils');
          clearPostsCache();
          await clearUserPostsCache(user.id);
          log('✅ [VideoPicker] Cleared posts cache and user posts cache');
        } catch (error: any) {
          warn('[VideoPicker] Failed to clear posts cache:', error);
        }
        
        // Set flag to refresh both community and videos screens
        await AsyncStorage.setItem('should_refresh_community', 'true');
        await AsyncStorage.setItem('should_refresh_videos', 'true');
        log('✅ [VideoPicker] Set refresh flags');
        
        // Emit event so Community tab can refresh immediately (even if still mounted in background)
        DeviceEventEmitter.emit('refreshCommunityFeed');
        if (allowDirectPost && optimisticPostIdRef.current) {
          DeviceEventEmitter.emit('optimisticVideoPostFinalized', {
            tempId: optimisticPostIdRef.current,
            post: result,
          });
          optimisticPostIdRef.current = null;
        }
        log('✅ [VideoPicker] Emitted refreshCommunityFeed');
        
        // Show success message (clear so users don't think it failed and re-upload)
        Toast.show({
          type: 'success',
          text1: '🎉 Video is live!',
          text2: 'It will appear on your profile and feed in a few seconds. Don’t upload again.',
          visibilityTime: 5000,
        });

        // Close modal after brief delay
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        error('❌ [VideoPicker] Post creation returned invalid result:', result);
        throw new Error('Failed to create post - invalid response');
      }
    } catch (error) {
      error('❌ [VideoPicker] Direct post failed:', error);
      if (allowDirectPost && optimisticPostIdRef.current) {
        DeviceEventEmitter.emit('optimisticVideoPostFailed', {
          tempId: optimisticPostIdRef.current,
          error: 'Failed to publish video post.',
        });
      }
      setError('Failed to create post. Please try again.');
      setUploadStage('idle');
      setUploadStatus('');
      
      Toast.show({
        type: 'error',
        text1: 'Oops! Something went wrong',
        text2: 'Don\'t worry, let\'s try that again.',
      });
    } finally {
      setIsPosting(false);
    }
  }, [user, allowDirectPost, videoTitle, location, adultContent, onClose]);
  
  // Store handleDirectPost in ref for useEffect access
  useEffect(() => {
    handleDirectPostRef.current = handleDirectPost;
  }, [handleDirectPost]);

  // Animated styles
  const uploadButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: uploadButtonScale.value }]
  }));

  const uploadIconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${uploadIconRotation.value}deg` }]
  }));

  const checkmarkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkmarkScale.value }],
    opacity: checkmarkScale.value
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value * 100}%`
  }));

  if (!visible) return null;
  const isExpandedSheet = uploadStage === 'preparing' || isUploading || isPosting;
  const headerRowHeight = 52;
  const sheetSizeStyle = isExpandedSheet
    ? {
        width: '100%' as const,
        minHeight: Math.min(Math.max(winH * 0.84, 520), winH - Math.max(insets.top, 12) - 12),
        maxHeight: winH * 0.97,
      }
    : {
        width: '100%' as const,
        minHeight: Math.min(Math.max(winH * 0.54, 420), winH - Math.max(insets.top, 12) - 20),
        maxHeight: winH * 0.92,
      };
  const previewVideoHeight = Math.round(Math.min(Math.max(winH * 0.26, 188), 300));
  const scrollBreathing =
    insets.bottom + Spacing.xl + (uploadStage === 'preparing' ? 40 : 20);
  /** iOS: KeyboardAvoidingView handles lift; Android: pad scroll by measured keyboard height. */
  const scrollPadBottom =
    scrollBreathing + (Platform.OS === 'android' ? keyboardPad : 0);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (uploadStage === 'idle' || (uploadStage === 'uploading' && uploadProgress >= 5)) {
              onClose();
            }
          }}
        />
        <SafeAreaView
          style={[
            styles.sheet,
            isExpandedSheet ? styles.sheetExpanded : styles.sheetCompact,
            sheetSizeStyle,
            { backgroundColor: themeColors.background },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { backgroundColor: themeColors.primary.main }]}>
            <TouchableOpacity 
              onPress={() => {
                if (uploadStage === 'idle' || (uploadStage === 'uploading' && uploadProgress >= 5)) {
                  onClose();
                }
              }} 
              style={styles.closeButton}
              disabled={uploadStage === 'uploading' && uploadProgress < 5}
            >
              <X size={24} color={uploadStage === 'uploading' && uploadProgress < 5 ? themeColors.textSecondary : themeColors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Upload Video</Text>
            <View style={styles.headerSpacer} />
          </View>

          <KeyboardAvoidingView
            style={styles.keyboardAvoiding}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + headerRowHeight : 0}
          >
            <ScrollView
              ref={scrollRef}
              style={styles.content}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: scrollPadBottom, flexGrow: uploadStage === 'preparing' ? 1 : 0 },
              ]}
              showsVerticalScrollIndicator={uploadStage === 'preparing'}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
            >
            {uploadStage === 'idle' ? (
              <View style={styles.selectionContainer}>
                <Text style={[styles.title, { color: themeColors.text }]}>
                  Select or Record Video
                </Text>
                <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                  {`Upload up to ${Math.floor(maxDuration / 60)}:${String(maxDuration % 60).padStart(2, '0')} per video`}
                </Text>

                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: themeColors.primary.main }]}
                    onPress={handleVideoSelect}
                    disabled={isSelectingVideo || isRecordingVideo}
                  >
                    {isSelectingVideo ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <VideoIcon size={24} color="white" />
                    )}
                    <Text style={styles.actionButtonText}>Gallery</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: themeColors.secondary.main }]}
                    onPress={handleVideoRecord}
                    disabled={isRecordingVideo || isSelectingVideo}
                  >
                    {isRecordingVideo ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Camera size={24} color="white" />
                    )}
                    <Text style={styles.actionButtonText}>Record</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.infoCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                  <Text style={[styles.infoCardText, { color: themeColors.textSecondary }]}>
                    Tip: shorter videos upload faster on weak networks.
                  </Text>
                </View>

                {error && (
                  <Text style={[styles.errorText, { color: themeColors.error.main }]}>
                    {error}
                  </Text>
                )}
              </View>
            ) : uploadStage === 'preparing' ? (
            /* Video Title Input */
            <View style={styles.titleContainer}>
              {/* Video Preview */}
              {selectedVideoUri && (
                <View style={styles.videoPreviewContainer}>
                  <Text style={[styles.previewTitle, { color: themeColors.text }]}>
                    Video Preview
                  </Text>
                  <View
                    style={[
                      styles.videoPreview,
                      { backgroundColor: themeColors.surface, height: previewVideoHeight },
                    ]}
                  >
                    <Video
                      ref={videoRef}
                      source={{ uri: selectedVideoUri }}
                      style={styles.videoPreviewPlayer}
                      shouldPlay={isVideoPlaying}
                      isLooping={false}
                      resizeMode={ResizeMode.COVER}
                      onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                      useNativeControls={false}
                    />
                    {!isVideoPlaying && (
                      <View style={styles.videoOverlay}>
                        <TouchableOpacity
                          style={styles.playButton}
                          onPress={handlePlayPause}
                        >
                          <Play size={32} color="white" fill="white" />
                        </TouchableOpacity>
                      </View>
                    )}
                    {isVideoPlaying && (
                      <TouchableOpacity
                        style={styles.pauseButton}
                        onPress={handlePlayPause}
                      >
                        <Pause size={24} color="white" fill="white" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[styles.videoInfoText, { color: themeColors.textSecondary }]}>
                    Duration: {Math.floor(selectedVideoDuration)} seconds
                    {Math.round(selectedVideoDuration) > maxDuration && (
                      <Text style={[styles.warningText, { color: themeColors.error.main }]}>
                        {' '}— Max allowed is {maxDuration} seconds to upload
                      </Text>
                    )}
                  </Text>
                </View>
              )}

              <Text style={[styles.title, { color: themeColors.text }]}>
                Add Video Title
              </Text>

              <TextInput
                style={[styles.titleInput, { 
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                  color: themeColors.text 
                }]}
                placeholder="Enter video title..."
                placeholderTextColor={themeColors.textSecondary}
                value={videoTitle}
                onChangeText={setVideoTitle}
                maxLength={100}
                returnKeyType="done"
                onFocus={() => {
                  requestAnimationFrame(() => {
                    setTimeout(() => {
                      scrollRef.current?.scrollTo({ y: 120, animated: true });
                    }, 200);
                  });
                }}
              />

              {/* Sensitive content – Apple-friendly wording */}
              <View style={[styles.adultContentRow, { borderColor: themeColors.border }]}>
                <View style={styles.adultContentLabelWrap}>
                  <Text style={[styles.adultContentLabel, { color: themeColors.text }]}>Sensitive content</Text>
                  <Text style={[styles.adultContentHint, { color: themeColors.textSecondary }]}>
                    Mark if not suitable for work or all audiences
                  </Text>
                </View>
                <View style={styles.adultContentSwitchWrap}>
                  <Switch
                    value={adultContent}
                    onValueChange={setAdultContent}
                    trackColor={{ false: themeColors.border, true: themeColors.primary.main + '99' }}
                    thumbColor={adultContent ? themeColors.primary.main : themeColors.surface}
                  />
                </View>
              </View>

              <View style={styles.actionButtonContainer}>
                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: themeColors.border }]}
                  onPress={resetStates}
                >
                  <Text style={[styles.cancelButtonText, { color: themeColors.textSecondary }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.uploadButton, { backgroundColor: themeColors.primary.main }]}
                  onPress={handleUpload}
                  disabled={!videoTitle.trim() || isPosting}
                >
                  <CloudUpload size={20} color="white" />
                  <Text style={styles.uploadButtonText}>
                    {allowDirectPost ? 'Upload' : 'Upload Video'}
                  </Text>
                </TouchableOpacity>
              </View>

              {error && (
                <Text style={[styles.errorText, { color: themeColors.error.main }]}>
                  {error}
                </Text>
              )}
            </View>
            ) : (
            /* Upload Progress */
            <View style={styles.uploadContainer}>
              {isUploading ? (
                <View style={styles.uploadProgressContainer}>
                  <View style={[styles.progressBarBackground, { backgroundColor: themeColors.surface }]}>
                    <Animated.View 
                      style={[
                        styles.progressBarFill, 
                        { backgroundColor: themeColors.primary.main },
                        progressAnimatedStyle
                      ]} 
                    />
                  </View>
                  
                  <Text style={[styles.uploadStatusText, { color: themeColors.text }]}>
                    {uploadStatus}
                  </Text>
                  
                  <Text style={[styles.uploadProgressText, { color: themeColors.textSecondary }]}>
                    {Math.round(uploadProgress)}%
                  </Text>
                  
                  {compressionSavings && (
                    <Text style={[styles.compressionSavingsText, { color: themeColors.success.main }]}>
                      📦 {compressionSavings}
                    </Text>
                  )}

                  {/* Disclaimer Note */}
                  <View style={[styles.disclaimerContainer, { 
                    backgroundColor: themeColors.primary.main + '15',
                    borderColor: themeColors.primary.main + '30',
                  }]}>
                    <Info size={14} color={themeColors.primary.main} strokeWidth={2} />
                    <Text style={[styles.disclaimerText, { color: themeColors.textSecondary }]}>
                      You can safely close this and continue using the app. Progress will be shown at the top.
                    </Text>
                  </View>
                </View>
              ) : uploadStage === 'complete' ? (
                <Animated.View style={[styles.completeContainer, checkmarkAnimatedStyle]}>
                  <CheckCircle size={48} color={themeColors.success.main} />
                  <Text style={[styles.completeText, { color: themeColors.success.main }]}>
                    Upload Complete!
                  </Text>
                </Animated.View>
              ) : null}
            </View>
            )}
            </ScrollView>
          </KeyboardAvoidingView>
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
    width: '100%',
  },
  /** Base caps; actual min/max heights come from `sheetSizeStyle` (window + safe area). */
  sheetCompact: {
    maxHeight: '92%',
  },
  sheetExpanded: {
    maxHeight: '97%',
  },
  editorLoadingFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  editorLoadingText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSizes.h3,
    fontFamily: FontFamily.medium,
    color: 'white',
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: Spacing.lg,
  },
  selectionContainer: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.h2,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
    minWidth: 120,
    justifyContent: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
  },
  uploadContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  uploadProgressContainer: {
    alignItems: 'center',
  },
  disclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    maxWidth: '90%',
  },
  disclaimerText: {
    flex: 1,
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
    textAlign: 'left',
  },
  progressBarBackground: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  uploadStatusText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.xs,
  },
  uploadProgressText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
  },
  compressionSavingsText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  compressionContainer: {
    width: '100%',
    marginBottom: Spacing.lg,
  },
  compressionTitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  compressionButtons: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  compressionButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  compressionButtonText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    marginBottom: 2,
  },
  compressionButtonSubtext: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
  },
  completeContainer: {
    alignItems: 'center',
  },
  completeText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.bold,
    marginTop: Spacing.sm,
  },
  warningText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    marginTop: Spacing.xs,
  },
  errorText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  infoCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  infoCardText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  titleContainer: {
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'stretch',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    paddingHorizontal: 0,
  },
  titleInput: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  adultContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  adultContentLabelWrap: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  adultContentLabel: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginBottom: 1,
  },
  adultContentHint: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    opacity: 0.9,
  },
  adultContentSwitchWrap: {
    transform: [{ scale: 0.78 }],
  },
  locationInput: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.lg,
  },
  videoInfoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  videoInfoText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  editButtonText: {
    color: 'white',
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
  },
  actionButtonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  cancelButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  uploadButtonText: {
    color: 'white',
    fontSize: FontSizes.body,
    fontFamily: FontFamily.bold,
  },
  videoPreviewContainer: {
    width: '100%',
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: FontSizes.h3,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.md,
  },
  videoPreview: {
    width: '100%',
    minHeight: 180,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: Spacing.sm,
  },
  videoPreviewPlayer: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
