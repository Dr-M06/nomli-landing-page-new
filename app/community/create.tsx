import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Image as ImageIcon, X, Send, Video as VideoIcon, Maximize2 } from 'lucide-react-native';
// LinearGradient removed - not used in simplified UI
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

// Lazy load VideoPicker to reduce initial bundle size (only load when creating post)
const VideoPicker = React.lazy(() => import('../../components/VideoPicker').then(m => ({ default: m.default })));
import ImagePicker from '../../components/ImagePicker';
import EnhancedAvatar from '../../components/EnhancedAvatar';
import { Video, ResizeMode } from 'expo-av';

import { Colors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, GlobalStyles, Shadow } from '../../constants/Theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import useAuth from '../../hooks/useAuth';
import useProfile from '../../hooks/useProfile';
import { createPost, createPollPost, createQuestionPost, testImageUpload, clearPostsCache } from '../../utils/communityUtils';
import Constants from 'expo-constants';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { supabase } from '../../utils/supabase';
import { validatePostContent } from '../../utils/contentFilter';
import { log, warn, error } from '../../utils/productionLogger';
import { uploadVideoToMux } from '../../utils/muxConfig';
import { decodeShareMediaPayload, expandShareMediaPayload } from '../../utils/shareImportPayload';

function paramOne(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

// Geoapify API key is now stored securely in Edge Function secrets
// No need to access it client-side

// Geoapify API key is now stored securely in Edge Function secrets
// No need to access it client-side

  // Helper function to count characters excluding hashtags
const countCharactersWithoutHashtags = (text: string): number => {
  if (!text) return 0;
  // Remove all hashtags (words starting with # followed by alphanumeric characters)
  const textWithoutHashtags = text.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
  return textWithoutHashtags.length;
};

const fetchLocationSuggestions = async (query: string) => {
  if (!query) return [];
  
  try {
    // Use Supabase Edge Function for secure Geoapify API calls
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../../constants/Endpoints');
    const supabaseUrl = SUPABASE_URL;
    if (!supabaseUrl) {
      warn('Supabase URL not configured, location suggestions unavailable');
      return [];
    }

    // Get user session for authentication (optional - Edge Function can be public)
    const { data: { session } } = await supabase.auth.getSession();

    // Call Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/geoapify-autocomplete?query=${encodeURIComponent(query)}&limit=5`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add auth header if session exists (optional for location services)
    if (session) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
      headers['apikey'] = SUPABASE_ANON_KEY;
    }

    if (__DEV__) {
      log('[Geoapify] Calling Edge Function for location suggestions');
    }

    const response = await fetch(edgeFunctionUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      error('[Geoapify] Edge Function error:', response.status, errorText);
      return [];
    }

    const jsonData = await response.json();
    
    if (jsonData.success && jsonData.data) {
      // Extract formatted addresses from Edge Function response
      const suggestions = jsonData.data.map((item: any) => item.formatted);
      if (__DEV__) {
        log('[Geoapify] Suggestions received:', suggestions.length);
      }
      return suggestions;
    }
    
    return [];
  } catch (e) {
    error('[Geoapify] Fetch error:', e);
    return [];
  }
};

export default function CreatePostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, isLoaded } = useAuth();
  const { profile, loading: profileLoading } = useProfile(user?.id);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // State
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'standard' | 'poll' | 'question'>('standard');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollExpiry, setPollExpiry] = useState<'none' | '24h' | '72h'>('24h');
  const [qaQuestion, setQaQuestion] = useState('');
  const [mediaFiles, setMediaFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false); // Media upload state
  const [uploadProgress, setUploadProgress] = useState(0); // Upload progress (0-100)
  const [uploadMessage, setUploadMessage] = useState(''); // Upload status message
  const uploadHint =
    uploadProgress < 35
      ? 'Compressing media...'
      : uploadProgress < 95
        ? 'Uploading...'
        : 'Finishing...';
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isBusiness, setIsBusiness] = useState(false); // Business promotion toggle
  const [adultContent, setAdultContent] = useState(false); // 18+ / sensitive content (Twitter-style hide until Show)
  const [hasDraft, setHasDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [postJustSubmitted, setPostJustSubmitted] = useState(false); // Flag to prevent draft saving after post
  const [contentValidation, setContentValidation] = useState<{ isValid: boolean; reason?: string; blockedContent?: string[] }>({ isValid: true });
  
  
  // Refs for keyboard handling
  const scrollViewRef = useRef<ScrollView>(null);
  const textInputRef = useRef<TextInput>(null);
  const inputLayoutRef = useRef<{ y: number; height: number } | null>(null);
  
  // Video upload state
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [isVideoPickerMinimized, setIsVideoPickerMinimized] = useState(false);
  const [uploadedVideo, setUploadedVideo] = useState<{
    secure_url: string;
    thumbnail: string;
    duration: number;
    startTime?: number;
    endTime?: number;
    isEdited?: boolean;
  } | null>(null);
  
  // Image picker state
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [pendingSharedVideoUri, setPendingSharedVideoUri] = useState<string | null>(null);
  const appliedShareMediaKey = useRef<string | null>(null);
  const sharedVideoUploadStarted = useRef(false);

  // Upload progress animation
  const uploadProgressAnim = useSharedValue(0);
  
  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${uploadProgressAnim.value}%`,
  }));
  
  // Update progress animation
  useEffect(() => {
    uploadProgressAnim.value = withTiming(uploadProgress, { duration: 300 });
  }, [uploadProgress]);

  // Redirect if not logged in, but only after auth has loaded
  useEffect(() => {
    if (isLoaded && !user) {
      router.push('/auth/signin');
    }
  }, [isLoaded, user]);
  
  // Test image upload functionality on component load
  useEffect(() => {
    const runTest = async () => {
      if (user) {
        log('[CreatePost] Running image upload test...');
        const testResult = await testImageUpload();
        if (testResult) {
          log('[CreatePost] Image upload test passed - functionality should work');
        } else {
          warn('[CreatePost] Image upload test failed - there may be issues with image uploads');
        }
      }
    };
    
    runTest();
  }, [user]);

  // Handle uploaded video data from video editor (legacy support)
  useEffect(() => {
    log('[CreatePost] All params:', params);
    
    if (params.uploadedVideoData) {
      try {
        const videoData = JSON.parse(params.uploadedVideoData as string);
        setUploadedVideo(videoData);
        log('[CreatePost] Set uploaded video from editor with Mux data:', videoData);
      } catch (error) {
        error('[CreatePost] Error parsing uploaded video data:', error);
      }
    } else {
      log('[CreatePost] No video data in params - using VideoPicker component');
    }
  }, [params.uploadedVideoData]);

  // iOS Share Extension / deep link: prefill when opening (tabs)/create?sharedText=…&sharedUrl=…
  useEffect(() => {
    const st = (paramOne(params.sharedText) ?? '').trim();
    const su = (paramOne(params.sharedUrl) ?? '').trim();
    if (!st && !su) return;
    const combined = st && su ? `${st}\n\n${su}` : st || su;
    setContent((prev) => (prev.trim() ? prev : combined));
  }, [params.sharedText, params.sharedUrl]);

  // Share extension: images / files → mediaFiles; first video → Mux upload
  useEffect(() => {
    const sm = paramOne(params.shareMedia);
    if (!sm) return;
    if (appliedShareMediaKey.current === sm) return;
    const decoded = decodeShareMediaPayload(sm);
    if (!decoded) {
      warn('[CreatePost] Invalid or undecodable shareMedia payload');
      return;
    }
    appliedShareMediaKey.current = sm;
    const { images, videos } = expandShareMediaPayload(decoded);
    if (videos.length > 0) {
      sharedVideoUploadStarted.current = false;
      setMediaFiles([]);
      setUploadedVideo(null);
      setPendingSharedVideoUri(videos[0]);
    } else {
      setPendingSharedVideoUri(null);
      if (images.length > 0) {
        setUploadedVideo(null);
        setMediaFiles(images.slice(0, 4));
        Toast.show({
          type: 'success',
          text1: images.length === 1 ? '1 photo added from share' : `${Math.min(images.length, 4)} photos added from share`,
        });
      }
    }
  }, [params.shareMedia]);

  useEffect(() => {
    if (!pendingSharedVideoUri || !user?.id) return;
    if (sharedVideoUploadStarted.current) return;
    sharedVideoUploadStarted.current = true;
    let cancelled = false;
    (async () => {
      try {
        setUploadingMedia(true);
        setUploadMessage('Uploading shared video…');
        setUploadProgress(8);
        const result = await uploadVideoToMux(pendingSharedVideoUri, {
          title: 'Shared video',
          onProgress: (p) => {
            if (!cancelled) setUploadProgress(Math.max(8, Math.min(92, p)));
          },
        });
        if (cancelled) return;
        setUploadedVideo(result);
        setPendingSharedVideoUri(null);
        setUploadProgress(100);
        setUploadMessage('');
        Toast.show({
          type: 'success',
          text1: 'Video ready',
          text2: 'Add a caption and post.',
        });
      } catch (e: any) {
        if (!cancelled) {
          sharedVideoUploadStarted.current = false;
          setPendingSharedVideoUri(null);
          Toast.show({
            type: 'error',
            text1: 'Could not upload shared video',
            text2: e?.message || 'Try again or pick the video inside Nomli.',
          });
        }
      } finally {
        if (!cancelled) setUploadingMedia(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingSharedVideoUri, user?.id]);

  // Debug: Log when uploadedVideo state changes
  useEffect(() => {
    log('[CreatePost] uploadedVideo state changed:', uploadedVideo);
  }, [uploadedVideo]);

  // Draft key (for manual save/load if needed in future)
  const DRAFT_KEY = `draft_post_${user?.id}`;

  // Profile caching removed - no longer aggressively caching profile data
  // Profile data is loaded fresh from the hook when needed
  
  // Use profile directly - no caching
  const displayProfile = profile;
  const displayName = displayProfile?.full_name || displayProfile?.username || user?.email?.split('@')[0] || 'User';
  const firstName = displayName.split(' ')[0];

  // Save draft to cache
  const saveDraft = useCallback(async () => {
    // Don't save draft if post was just submitted
    if (postJustSubmitted) {
      return;
    }
    
    if (!user?.id || (!content.trim() && mediaFiles.length === 0 && !uploadedVideo)) {
      return;
    }
    
    try {
      setIsSavingDraft(true);
      const draft = {
        content,
        mediaFiles,
        uploadedVideo,
        isBusiness,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setHasDraft(true);
      log('[CreatePost] Draft saved successfully');
    } catch (error) {
      error('[CreatePost] Error saving draft:', error);
    } finally {
      setIsSavingDraft(false);
    }
  }, [content, mediaFiles, uploadedVideo, isBusiness, user?.id, DRAFT_KEY]);

  // Load draft from cache
  const loadDraft = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const draftStr = await AsyncStorage.getItem(DRAFT_KEY);
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        // Only load draft if it's recent (less than 1 hour old) to avoid loading old posted content
        const draftAge = Date.now() - (draft.timestamp || 0);
        const oneHour = 60 * 60 * 1000;
        
        if (draftAge < oneHour) {
          // Draft loading disabled - no longer auto-restoring drafts
          // setContent(draft.content || '');
          // setMediaFiles(draft.mediaFiles || []);
          // setUploadedVideo(draft.uploadedVideo || null);
          // setIsBusiness(draft.isBusiness || false);
          // setHasDraft(true);
          log('[CreatePost] Draft found but not auto-loaded');
          
          // Clear old draft instead of loading it
          await AsyncStorage.removeItem(DRAFT_KEY);
        } else {
          // Draft is too old, clear it
          await AsyncStorage.removeItem(DRAFT_KEY);
          log('[CreatePost] Old draft cleared');
        }
      }
    } catch (error) {
      error('[CreatePost] Error loading draft:', error);
        }
  }, [user?.id, DRAFT_KEY]);

  // Clear draft from cache
  const clearDraft = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
      setHasDraft(false);
      // Also clear state to ensure nothing persists
      setContent('');
      setMediaFiles([]);
      setUploadedVideo(null);
      setIsBusiness(false);
      log('[CreatePost] Draft cleared successfully');
    } catch (error) {
      error('[CreatePost] Error clearing draft:', error);
        }
  }, [user?.id, DRAFT_KEY]);
    
  // Auto-save draft removed - no longer aggressively caching user content
  // Users can manually save drafts if needed in the future
  
  // Auto-load draft removed - no longer automatically restoring drafts on mount

  // Reset screen state when user navigates back to it
  useFocusEffect(
    useCallback(() => {
      log('[CreatePost] Screen focused');
      setIsInputFocused(false);
      
      // Always clear state on focus - no draft restoration
      setContent('');
      setMediaFiles([]);
      setUploadedVideo(null);
      setIsBusiness(false);
      setHasDraft(false);
      setPostJustSubmitted(false);
      log('[CreatePost] State cleared on focus');
    }, [])
  );

  // Keyboard event listeners for responsive scrolling
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardVisible(true);
        // Scroll to input when keyboard appears
        if (isInputFocused && scrollViewRef.current && inputLayoutRef.current) {
          const keyboardHeight = e.endCoordinates.height;
          const headerHeight = 60; // Approximate header height
          const padding = 100; // Extra padding to show input comfortably above keyboard
          const scrollOffset = inputLayoutRef.current.y - headerHeight - padding;
          // Use longer delay on Android since it doesn't have KeyboardAvoidingView
          setTimeout(() => {
            scrollViewRef.current?.scrollTo({
              y: Math.max(0, scrollOffset),
              animated: true,
            });
          }, Platform.OS === 'ios' ? 100 : 200);
        }
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [isInputFocused]);

  // Handle input focus with auto-scroll
  const handleInputFocus = () => {
    setIsInputFocused(true);
    // Scroll to input after a short delay to ensure layout is complete
    setTimeout(() => {
      if (scrollViewRef.current && inputLayoutRef.current) {
        // Calculate scroll offset: input position minus header height and some padding
        const headerHeight = 60; // Approximate header height
        const padding = 100; // Extra padding to show input comfortably above keyboard
        const scrollOffset = inputLayoutRef.current.y - headerHeight - padding;
        scrollViewRef.current.scrollTo({
          y: Math.max(0, scrollOffset),
          animated: true,
        });
      }
    }, Platform.OS === 'ios' ? 300 : 200); // Delay to wait for keyboard animation
  };

  // Dismiss keyboard
  const handleDismissKeyboard = () => {
    Keyboard.dismiss();
    setIsInputFocused(false);
  };

  
  // Handle image selection from ImagePicker component
  const handleImagesSelected = (imageUris: string[]) => {
    // Check if user has uploaded a video
    if (uploadedVideo) {
      Alert.alert(
        'Video Already Added',
        'You cannot add both images and videos to the same post. Please use either images OR a video.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setMediaFiles(imageUris.slice(0, 4));
    log('📱 [CreatePost] Images selected:', imageUris);
  };
  
  // Remove a media file
  const removeMedia = (index: number) => {
    const newMediaFiles = [...mediaFiles];
    newMediaFiles.splice(index, 1);
    setMediaFiles(newMediaFiles);
  };
  
  // Handle video upload completion
  const handleVideoUploaded = (videoData: any) => {
    log('🎬 [CreatePost] Received video upload data:', JSON.stringify(videoData, null, 2));
    
    // Don't set video if post was just submitted
    if (postJustSubmitted) {
      log('🚫 [CreatePost] Ignoring video upload - post was just submitted');
      return;
    }
    
    // If VideoPicker has allowDirectPost=true, don't set the video in state
    // because the post will be created directly and we'll clear state on close
    if (showVideoPicker) {
      log('📝 [CreatePost] VideoPicker has allowDirectPost=true - will clear state on close');
      // Don't set the video state since it will be posted directly
      return;
    }
    
    // Clear any existing images when video is uploaded
    if (mediaFiles.length > 0) {
      log('🔄 [CreatePost] Clearing existing images because video was uploaded');
      setMediaFiles([]);
    }
    
    setUploadedVideo(videoData);
    Toast.show({
      type: 'success',
      text1: 'Video uploaded successfully to Mux!',
    });
  };

  // Remove uploaded video
  const removeVideo = () => {
    setUploadedVideo(null);
  };


  // Submit the post
  const handleSubmit = async () => {
    // CRITICAL: Check if user is authenticated
    if (!user || !user.id) {
      Toast.show({
        type: 'error',
        text1: 'Authentication Error',
        text2: 'Please log in to create a post.',
      });
      return;
    }
    
    // Validate input (excluding hashtags from character count)
    const contentWithoutHashtags = content.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
    
    // Check hashtag limit (max 4)
    const hashtagMatches = content.match(/#\w+/g) || [];
    if (hashtagMatches.length > 4) {
      Alert.alert(
        'Too Many Hashtags',
        'You can only add up to 4 hashtags per post.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // For standard text-only posts, ensure there's actual content (not just whitespace/special chars)
    if (postType === 'standard' && !uploadedVideo && (!mediaFiles || mediaFiles.length === 0)) {
      if (!contentWithoutHashtags || contentWithoutHashtags.length === 0) {
        Toast.show({
          type: 'error',
          text1: 'Please enter some content for your post.',
        });
        return;
      }
    }

    // Poll validation
    if (postType === 'poll') {
      const q = pollQuestion.trim();
      const opts = pollOptions.map(s => s.trim()).filter(Boolean);
      if (!q) {
        Toast.show({ type: 'error', text1: 'Please enter a poll question.' });
        return;
      }
      if (opts.length < 2 || opts.length > 6) {
        Toast.show({ type: 'error', text1: 'Poll needs 2–6 options.' });
        return;
      }
      if (opts.some(o => o.length > 60)) {
        Toast.show({ type: 'error', text1: 'Poll options must be 60 characters or less.' });
        return;
      }
    }

    // Q&A validation
    if (postType === 'question') {
      const q = qaQuestion.trim();
      if (!q) {
        Toast.show({ type: 'error', text1: 'Please enter your question.' });
        return;
      }
      if (q.length > 140) {
        Toast.show({ type: 'error', text1: 'Question must be 140 characters or less.' });
        return;
      }
    }
    
    // Check character limit (excluding hashtags)
    const charCount = countCharactersWithoutHashtags(content);
    if (charCount > 500) {
      Alert.alert(
        'Character Limit Exceeded',
        `Your post content exceeds 500 characters (hashtags excluded). Current: ${charCount} characters.`,
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Content validation - only blocks URLs/links
    const validation = validatePostContent(content.trim());
    if (!validation.isValid) {
      Alert.alert(
        '⚠️ Link Detected',
        validation.reason || 'Please do not share external links in your posts.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }
    
    // Set flag IMMEDIATELY to prevent any auto-save from happening
    setPostJustSubmitted(true);
    
    try {
      setLoading(true);
      setUploadingMedia(true);
      setUploadProgress(0);
      setUploadMessage('Preparing your post...');
      
      Toast.show({
        type: 'info',
        text1: 'Creating your post...',
        text2: '',
      });
      
      // Create the post in the database - with safe user data extraction
      const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'User';
      const userEmail = user?.email || '';
      const userId = user.id; // Safe - already checked above
      
      // Validate username and email are not empty
      if (!username || username.trim().length === 0) {
        throw new Error('Unable to get your username. Please log out and log back in.');
      }
      
      // Prepare media - FIXED: Don't pass video URLs as image URLs
      const postMediaFiles = uploadedVideo ? undefined : ((mediaFiles?.length || 0) > 0 ? mediaFiles : undefined);
      const postThumbnail = uploadedVideo ? undefined : ((mediaFiles?.length || 0) > 0 ? mediaFiles[0] : undefined);
      
      log('🎬 [CreatePost] About to create post with video URL:', uploadedVideo?.secure_url);
      log('🎬 [CreatePost] Full uploaded video object:', JSON.stringify(uploadedVideo, null, 2));
      log('📸 [CreatePost] Image files being passed:', postMediaFiles);
      log('📸 [CreatePost] Number of image files:', postMediaFiles?.length || 0);
      log('📸 [CreatePost] Image file URIs:', postMediaFiles?.map((uri, i) => `${i + 1}: ${uri?.substring(0, 50)}...`));
      log('🎬 [CreatePost] Video URL being passed separately:', uploadedVideo?.secure_url);
      
      // Update progress for media upload
      if (postMediaFiles && postMediaFiles.length > 0) {
        setUploadMessage(`Uploading ${postMediaFiles.length} photo${postMediaFiles.length > 1 ? 's' : ''}...`);
        setUploadProgress(30);
      } else if (uploadedVideo) {
        setUploadMessage('Processing video...');
        setUploadProgress(30);
      } else {
        setUploadProgress(50);
      }
      
      // IMPORTANT: your DB enforces posts_content_check; poll/Q&A must still provide valid content
      const effectiveContent =
        postType === 'poll'
          ? (content.trim() || pollQuestion.trim())
          : postType === 'question'
            ? (content.trim() || qaQuestion.trim())
            : content.trim();

      let result: any = null;
      if (postType === 'poll') {
        const now = Date.now();
        const expiresAt =
          pollExpiry === 'none'
            ? null
            : new Date(now + (pollExpiry === '24h' ? 24 : 72) * 60 * 60 * 1000).toISOString();
        result = await createPollPost(
          effectiveContent,
          userId,
          username,
          userEmail,
          {
            question: pollQuestion.trim(),
            options: pollOptions.map(s => s.trim()).filter(Boolean),
            expiresAt,
            showResultsMode: 'after_vote',
          }
        );
      } else if (postType === 'question') {
        result = await createQuestionPost(
          effectiveContent,
          userId,
          username,
          userEmail,
          { question: qaQuestion.trim() }
        );
      } else {
        result = await createPost(
          effectiveContent,
          userId,
          username,
          userEmail,
          undefined, // No location
          postMediaFiles, // Only pass actual image files here
          postThumbnail,  // Only pass image thumbnail here
          uploadedVideo?.secure_url, // Video URL goes separately
          isBusiness, // Business promotion flag
          'standard',
          null, // Music only in video editor
          adultContent
        );
      }
      
      log('✅ [CreatePost] Post creation result:', result ? 'SUCCESS' : 'FAILED');
      if (result) {
        log('✅ [CreatePost] Post ID:', result.id);
        log('✅ [CreatePost] Post image_urls:', result.image_urls);
        log('✅ [CreatePost] Post image_url:', result.image_url);
      }
      
      setUploadProgress(90);
      setUploadMessage('Almost done...');
      
      if (result) {
        setUploadProgress(100);
        setUploadMessage('Post created! ✨');
        
        // If video was posted, clear video cache and set refresh flags
        if (uploadedVideo?.secure_url) {
          const { clearVideoPostsCache } = require('../../utils/videoPostUtils');
          clearVideoPostsCache().catch((error: any) => {
            warn('[CreatePost] Failed to clear video cache:', error);
          });

          AsyncStorage.setItem('should_refresh_videos', 'true');
        }

        // Always refresh the home/community feed after creating ANY post type.
        // Also clear local post caches so the new post is visible immediately.
        AsyncStorage.setItem('should_refresh_community', 'true');
        clearPostsCache().catch(() => {});
        
        // Reset state FIRST before clearing draft
        setContent('');
        setMediaFiles([]);
        setUploadedVideo(null);
        setIsBusiness(false);
        setAdultContent(false);
        setPostType('standard');
        setPollQuestion('');
        setPollOptions(['', '']);
        setPollExpiry('24h');
        setQaQuestion('');
        
        // Clear draft on successful post (this also clears state again as a safeguard)
        await clearDraft();
        
        // Success message and navigate back
        Toast.show({
          type: 'success',
          text1: 'Your post has been created!',
        });
        
        // Small delay to show success message before navigating
        setTimeout(() => {
          // Safely navigate back - if no history, go to community tab
          try {
            // @ts-ignore expo-router provides canGoBack at runtime
            if ((router as any).canGoBack?.()) {
              router.back();
            } else {
              router.replace('/(tabs)/community');
            }
          } catch {
            router.replace('/(tabs)/community');
          }
          // Reset flag after navigation
          setTimeout(() => {
            setPostJustSubmitted(false);
          }, 500);
        }, 1000);
      } else {
        throw new Error('Failed to create post');
      }
    } catch (error: any) {
      error('❌ [CreatePost] Error creating post:', error);
      error('❌ [CreatePost] Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      
      // Reset flag on error so user can try again
      setPostJustSubmitted(false);
      
      // Check if it's a content moderation error
      const errorMessage = error?.message || 'Failed to create post. Please try again.';
      const isModerationError = errorMessage.includes('content') || errorMessage.includes('guidelines') || errorMessage.includes('moderation') || errorMessage.includes('violates');
      const isUploadError = errorMessage.includes('upload') || errorMessage.includes('Failed to upload images');
      const isRateLimitError = errorMessage.includes('Rate limit') || errorMessage.includes('rate limit');
      const isAuthError = errorMessage.includes('Authentication') || errorMessage.includes('Unauthorized') || errorMessage.includes('log in') || errorMessage.includes('account information');
      const isNetworkError = errorMessage.includes('network') || errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('timeout');
      
      // Show alert for specific error types
      if (isModerationError) {
        Alert.alert(
          'Content Not Allowed',
          errorMessage || 'Your content does not meet our community guidelines. Please review and try again.',
          [{ text: 'OK' }]
        );
      } else if (isUploadError) {
        Alert.alert(
          'Image Upload Failed',
          errorMessage || 'Failed to upload images. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      } else if (isRateLimitError) {
        Alert.alert(
          'Too Many Posts',
          'You\'re posting too quickly. Please wait a moment before creating another post.',
          [{ text: 'OK' }]
        );
      } else if (isAuthError) {
        Alert.alert(
          'Authentication Error',
          'Please log out and log back in, then try again.',
          [{ text: 'OK' }]
        );
      } else if (isNetworkError) {
        Alert.alert(
          'Network Error',
          'Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      }
      
      Toast.show({
        type: 'error',
        text1: isModerationError ? 'Content Not Allowed' : 
               isUploadError ? 'Upload Failed' : 
               isRateLimitError ? 'Too Many Posts' :
               isAuthError ? 'Authentication Error' :
               isNetworkError ? 'Network Error' :
               'Failed to create post',
        text2: errorMessage,
        visibilityTime: 4000,
      });
    } finally {
      setLoading(false);
      setUploadingMedia(false);
      setUploadProgress(0);
      setUploadMessage('');
    }
  };
  
  // Show loading state while auth is being checked
  if (!isLoaded) {
    return (
      <SafeAreaView style={[GlobalStyles.safeArea, { backgroundColor: themeColors.background }]}>
        <View style={[styles.container, styles.loadingContainer, { backgroundColor: themeColors.background }]}>
          <ActivityIndicator size="large" color={themeColors.primary.main} />
          <Text style={[styles.loadingText, { color: themeColors.text }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <>
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        {/* Simple Header */}
        <View style={[styles.header, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Share Your Vibe</Text>
          {keyboardVisible && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={handleDismissKeyboard}
              activeOpacity={0.7}
            >
              <Text style={[styles.doneButtonText, { color: themeColors.primary.main }]}>Done</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Upload Progress Overlay */}
        {uploadingMedia && (
          <View style={styles.uploadOverlay}>
            <View style={[styles.uploadCard, { backgroundColor: themeColors.cardBackground }]}>
              <ActivityIndicator size="large" color={themeColors.primary.main} style={{ marginBottom: Spacing.md }} />
              
              <Text style={[styles.uploadTitle, { color: themeColors.text }]}>
                {uploadMessage || 'Uploading...'}
              </Text>
              
              <View style={[styles.progressBarContainer, { backgroundColor: themeColors.border }]}>
                <Animated.View 
                  style={[
                    styles.progressBar, 
                    { backgroundColor: themeColors.primary.main },
                    animatedProgressStyle
                  ]} 
                />
              </View>
              
              <Text style={[styles.uploadPercentage, { color: themeColors.primary.main }]}>
                {Math.round(uploadProgress)}%
              </Text>
              <Text style={[styles.uploadSubtext, { color: themeColors.textSecondary }]}>
                {uploadHint}
              </Text>
            </View>
          </View>
        )}

        <ScrollView
          ref={scrollViewRef}
          style={[styles.scrollView, { backgroundColor: themeColors.background }]}
          contentContainerStyle={[
            styles.scrollContent, 
            { 
              paddingTop: Spacing.sm, 
              // Extra bottom padding so content never sits under the fixed footer button
              paddingBottom:
                (keyboardVisible ? (Platform.OS === 'ios' ? 360 : 320) : 0) +
                tabBarHeight +
                insets.bottom +
                96
            }
          ]}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={true}
          keyboardDismissMode="interactive"
          nestedScrollEnabled={true}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Clean Composer - Facebook/Twitter style */}
          <View style={styles.composerContainer}>
            <View style={styles.composerRow}>
              <EnhancedAvatar
                avatarUrl={displayProfile?.avatar_url}
                userId={user?.id}
                fullName={displayProfile?.full_name}
                username={displayProfile?.username}
                email={displayProfile?.email || user?.email}
                size={44}
                showBorder={false}
                showOnlineIndicator={false}
              />
              <View style={styles.composerInputArea}>
                <Text style={[styles.composerName, { color: themeColors.text }]}>
                  {displayProfile?.full_name || displayProfile?.username || firstName}
                </Text>
              </View>
              {hasDraft && (
                <View style={[styles.draftBadge, { backgroundColor: themeColors.primary.main + '20' }]}>
                  <Text style={[styles.draftBadgeText, { color: themeColors.primary.main }]}>Draft</Text>
                </View>
              )}
            </View>
          </View>

          {/* Poll / Q&A builders */}
          {postType === 'poll' && (
            <View style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
              <Text style={{ color: themeColors.textSecondary, fontFamily: FontFamily.semibold, marginBottom: 6, fontSize: 12 }}>Poll question</Text>
              <TextInput
                value={pollQuestion}
                onChangeText={setPollQuestion}
                placeholder="Ask something people can vote on…"
                placeholderTextColor={themeColors.textSecondary}
                style={{
                  borderWidth: 1,
                  borderColor: themeColors.border,
                  borderRadius: BorderRadius.lg,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: themeColors.text,
                  backgroundColor: themeColors.cardBackground,
                  fontSize: 13,
                }}
                maxLength={140}
              />

              <Text style={{ color: themeColors.textSecondary, fontFamily: FontFamily.semibold, marginTop: 10, marginBottom: 6, fontSize: 12 }}>Options</Text>
              {pollOptions.map((opt, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <TextInput
                    value={opt}
                    onChangeText={(v) => setPollOptions(prev => prev.map((p, i) => (i === idx ? v : p)))}
                    placeholder={`Option ${idx + 1}`}
                    placeholderTextColor={themeColors.textSecondary}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                      borderRadius: BorderRadius.lg,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      color: themeColors.text,
                      backgroundColor: themeColors.cardBackground,
                      fontSize: 13,
                    }}
                    maxLength={60}
                  />
                  {pollOptions.length > 2 && (
                    <TouchableOpacity
                      onPress={() => setPollOptions(prev => prev.filter((_, i) => i !== idx))}
                      activeOpacity={0.7}
                      style={{ padding: 8 }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <X size={16} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOptions.length < 6 && (
                <TouchableOpacity
                  onPress={() => setPollOptions(prev => [...prev, ''])}
                  activeOpacity={0.8}
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: BorderRadius.lg,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                  }}
                >
                  <Text style={{ color: themeColors.textSecondary, fontFamily: FontFamily.semibold, fontSize: 12 }}>+ Add option</Text>
                </TouchableOpacity>
              )}

              <Text style={{ color: themeColors.textSecondary, fontFamily: FontFamily.semibold, marginTop: 10, marginBottom: 6, fontSize: 12 }}>Expires</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { key: '24h', label: '24h' },
                  { key: '72h', label: '72h' },
                  { key: 'none', label: 'No expiry' },
                ].map((t: any) => (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setPollExpiry(t.key)}
                    activeOpacity={0.85}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: pollExpiry === t.key ? themeColors.primary.main : themeColors.border,
                      backgroundColor: pollExpiry === t.key ? themeColors.primary.main + '18' : 'transparent',
                    }}
                  >
                    <Text style={{ color: pollExpiry === t.key ? themeColors.primary.main : themeColors.textSecondary, fontFamily: FontFamily.semibold, fontSize: 12 }}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {postType === 'question' && (
            <View style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
              <Text style={{ color: themeColors.textSecondary, fontFamily: FontFamily.semibold, marginBottom: 6, fontSize: 12 }}>Your question</Text>
              <TextInput
                value={qaQuestion}
                onChangeText={setQaQuestion}
                placeholder="Ask the community…"
                placeholderTextColor={themeColors.textSecondary}
                style={{
                  borderWidth: 1,
                  borderColor: themeColors.border,
                  borderRadius: BorderRadius.lg,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: themeColors.text,
                  backgroundColor: themeColors.cardBackground,
                  fontSize: 13,
                }}
                maxLength={140}
              />
            </View>
          )}
          
          {/* Main text input - Facebook/Twitter style */}
          <View 
            style={styles.contentSection}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              inputLayoutRef.current = { y, height };
            }}
          >
            <TextInput
                ref={textInputRef}
                style={[
                  styles.contentInput,
                  {
                    color: themeColors.text,
                    backgroundColor: 'transparent',
                    minHeight: 120,
                    fontSize: FontSizes.lg,
                  },
                ]}
                placeholder="Share your Nomli vibe..."
                placeholderTextColor={themeColors.textSecondary}
                multiline
                value={content}
                onChangeText={(text) => {
                  const newHashtags = text.match(/#\w+/g) || [];
                  if (newHashtags.length > 4) {
                    Toast.show({
                      type: 'error',
                      text1: 'Hashtag Limit Reached',
                      text2: 'You can only add up to 4 hashtags per post.',
                    });
                    return;
                  }

                  setContent(text);

                  const validation = validatePostContent(text);
                  setContentValidation(validation);
                }}
                maxLength={500}
                onFocus={handleInputFocus}
                onBlur={() => setIsInputFocused(false)}
                returnKeyType="default"
                blurOnSubmit={false}
              />
          </View>
          {/* Character count and hashtag count */}
          <View style={styles.characterCountContainer}>
            <View style={styles.countRow}>
              {(() => {
                const hashtagCount = (content.match(/#\w+/g) || []).length;
                return hashtagCount > 0 ? (
                  <Text style={[
                    styles.hashtagCount,
                    { 
                      color: hashtagCount >= 4 ? themeColors.error?.main || '#FF3B30' : themeColors.primary.main 
                    }
                  ]}>
                    {hashtagCount} / 4 hashtags
                  </Text>
                ) : null;
              })()}
              {(() => {
                const charCount = countCharactersWithoutHashtags(content);
                const isOverLimit = charCount > 500;
                const excessChars = isOverLimit ? charCount - 500 : 0;
                
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {isOverLimit ? (
                      <>
                        <Text style={[styles.characterCount, { color: themeColors.textSecondary }]}>
                          500 / 500
                        </Text>
                        <Text style={[styles.characterCount, { color: themeColors.error?.main || '#FF3B30', marginLeft: 4 }]}>
                          +{excessChars}
                        </Text>
                      </>
                    ) : (
                      <Text style={[styles.characterCount, { color: themeColors.textSecondary }]}>
                        {charCount} / 500
                      </Text>
                    )}
                  </View>
                );
              })()}
            </View>
            {/* Show validation error message for links only */}
            {!contentValidation.isValid && contentValidation.reason && (
              <View style={styles.validationErrorContainer}>
                <Text style={[styles.validationErrorIcon, { color: themeColors.error?.main || '#FF3B30' }]}>
                  ⚠️
                </Text>
                <Text style={[styles.validationError, { color: themeColors.error?.main || '#FF3B30' }]}>
                  {contentValidation.reason}
                </Text>
              </View>
            )}
          </View>
          
                    {/* Video preview */}
          {uploadedVideo && (
            <View style={styles.mediaPreviewContainer}>
              <View style={styles.videoPreviewItem}>
                <Video
                  source={{ uri: uploadedVideo.secure_url }}
                  style={styles.videoPreviewImage}
                  useNativeControls={false}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={false}
                  isLooping={false}
                />
                <View style={styles.videoPlayIcon}>
                  <VideoIcon size={24} color="white" />
                </View>
                <TouchableOpacity
                  style={styles.removeMediaButton}
                  onPress={removeVideo}
                >
                  <X size={16} color="white" />
                </TouchableOpacity>
                <View style={styles.videoLabel}>
                  <Text style={styles.videoLabelText}>
                    {uploadedVideo.isEdited ? `Edited Video (${Math.round(uploadedVideo.duration)}s)` : 'Video Ready'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Media preview */}
          {(mediaFiles?.length || 0) > 0 && (
            <View style={styles.mediaPreviewContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mediaPreviewScroll}
              >
                {mediaFiles.map((uri, index) => (
                  <View key={index} style={styles.mediaPreviewItem}>
                    <Image source={{ uri }} style={styles.mediaPreviewImage} />
                    <TouchableOpacity
                      style={styles.removeMediaButton}
                      onPress={() => removeMedia(index)}
                    >
                      <X size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Sensitive content – show when user has photo or video (same as video uploader) */}
          {((mediaFiles?.length || 0) > 0 || uploadedVideo) && postType === 'standard' && (
            <View style={styles.sensitiveContentRowWrap}>
              <View style={[styles.sensitiveContentRow, { borderColor: themeColors.border }]}>
                <View style={styles.sensitiveContentLabelWrap}>
                  <Text style={[styles.sensitiveContentLabel, { color: themeColors.text }]}>Sensitive content</Text>
                  <Text style={[styles.sensitiveContentHint, { color: themeColors.textSecondary }]}>
                    Mark if not suitable for work or all audiences
                  </Text>
                </View>
                <View style={styles.sensitiveContentSwitchWrap}>
                  <Switch
                    value={adultContent}
                    onValueChange={setAdultContent}
                    trackColor={{ false: themeColors.border, true: themeColors.primary.main + '99' }}
                    thumbColor={adultContent ? themeColors.primary.main : themeColors.surface}
                  />
                </View>
              </View>
            </View>
          )}

        </ScrollView>

        {/* Fixed footer with action icons and post button */}
        {(() => {
          const charCount = countCharactersWithoutHashtags(content);
          const isOverLimit = charCount > 500;
          const hasValidationError = !contentValidation.isValid;
          const hasContent = content.trim().length > 0 || (mediaFiles?.length || 0) > 0 || uploadedVideo;
          const isDisabled =
            loading ||
            isOverLimit ||
            hasValidationError ||
            (postType === 'standard' ? !hasContent : false);

          return (
            <View
              style={[
                styles.footerBar,
                {
                  bottom: tabBarHeight,
                  paddingBottom: Math.max(insets.bottom, 10),
                  backgroundColor: themeColors.cardBackground,
                  borderTopWidth: 1,
                  borderTopColor: themeColors.border,
                },
              ]}
            >
              {/* Left side: Media action icons */}
              <View style={styles.footerActions}>
                <TouchableOpacity
                  style={styles.footerActionBtn}
                  onPress={() => {
                    if (uploadedVideo) {
                      Alert.alert('Video Already Added', 'Remove the video first to add photos.');
                      return;
                    }
                    setShowImagePicker(true);
                  }}
                  activeOpacity={0.7}
                >
                  <ImageIcon size={22} color={(mediaFiles?.length || 0) > 0 ? themeColors.primary.main : themeColors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.footerActionBtn}
                  onPress={() => {
                    if ((mediaFiles?.length || 0) > 0) {
                      Alert.alert('Photos Already Added', 'Remove photos first to add a video.');
                      return;
                    }
                    setShowVideoPicker(true);
                  }}
                  activeOpacity={0.7}
                >
                  <VideoIcon size={22} color={uploadedVideo ? themeColors.primary.main : themeColors.textSecondary} />
                </TouchableOpacity>
                {/* Events removed */}
                {/* Post type toggle - more options */}
                <TouchableOpacity
                  style={[
                    styles.footerActionBtn,
                    postType !== 'standard' && { backgroundColor: themeColors.primary.main + '20', borderRadius: 8 }
                  ]}
                  onPress={() => {
                    // Cycle through post types
                    if (postType === 'standard') setPostType('poll');
                    else if (postType === 'poll') setPostType('question');
                    else setPostType('standard');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.postTypeLabel,
                    { color: postType !== 'standard' ? themeColors.primary.main : themeColors.textSecondary }
                  ]}>
                    {postType === 'poll' ? 'Poll' : postType === 'question' ? 'Q&A' : 'Aa'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Right side: Post button */}
              <TouchableOpacity
                style={[
                  styles.postButton,
                  {
                    backgroundColor: isDisabled ? themeColors.textSecondary + '30' : themeColors.primary.main,
                  },
                ]}
                onPress={handleSubmit}
                disabled={isDisabled}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.postButtonText}>Post</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* Video Upload Modal */}
        {showVideoPicker && (
          <React.Suspense fallback={<ActivityIndicator size="large" color="#fff" />}>
            <VideoPicker
              visible={showVideoPicker && !isVideoPickerMinimized}
              isMinimized={isVideoPickerMinimized}
              onMinimize={() => {
                setIsVideoPickerMinimized(true);
              }}
              onClose={() => {
                // Simply close the picker and return to create post screen
                setShowVideoPicker(false);
                setIsVideoPickerMinimized(false);
              }}
          onVideoUploaded={handleVideoUploaded}
          maxDuration={110}
          allowDirectPost={true}
        />
          </React.Suspense>
        )}

        {/* Minimized: small FAB to reopen upload — progress is shown in the global top stripe */}
        {isVideoPickerMinimized && (
          <TouchableOpacity
            style={[
              styles.minimizedVideoFab,
              {
                bottom: tabBarHeight + 16,
                backgroundColor: themeColors.primary.main,
                ...Shadow.md,
              },
            ]}
            onPress={() => {
              setIsVideoPickerMinimized(false);
              setShowVideoPicker(true);
            }}
            activeOpacity={0.85}
            accessibilityLabel="Resume video upload"
          >
            <Maximize2 size={20} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        )}

        {/* Image Picker Modal */}
        <ImagePicker
          visible={showImagePicker}
          onClose={() => setShowImagePicker(false)}
          onImagesSelected={handleImagesSelected}
          maxImages={4}
          allowDirectPost={false}
        />


        

      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.neutral.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.border,
  },
  headerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.lg,
    color: Colors.neutral.text,
    letterSpacing: 0.3,
    flex: 1,
  },
  doneButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  doneButtonText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.body,
    color: Colors.primary.main,
    letterSpacing: 0.3,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  savingText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.caption,
    color: Colors.neutral.subtext,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  locationSection: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral.surface + '40',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.neutral.border + '40',
  },
  locationIcon: {
    marginRight: Spacing.sm,
  },
  locationInput: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    color: Colors.neutral.text,
    paddingVertical: 4,
  },
  contentSection: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    position: 'relative',
  },
  contentInput: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.lg,
    color: Colors.neutral.text,
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
    lineHeight: 26,
    minHeight: 120,
  },
  characterCountContainer: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    marginTop: Spacing.xs,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hashtagCount: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.caption,
    fontWeight: '600',
  },
  characterCount: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.caption,
    color: Colors.neutral.subtext,
    opacity: 0.6,
  },
  validationErrorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  validationErrorIcon: {
    fontSize: FontSizes.md,
    marginRight: Spacing.xs,
    marginTop: 2,
  },
  validationError: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.sm,
    lineHeight: FontSizes.sm * 1.4,
  },
  validationErrorDetails: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.xs,
    opacity: 0.8,
    marginTop: 2,
  },
  mediaButton: {
    alignItems: 'center',
    minWidth: 60,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  mediaButtonText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.text,
    marginTop: Spacing.xs,
  },
  submitButton: {
    backgroundColor: Colors.primary.main,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  mediaPreviewContainer: {
    marginBottom: Spacing.md,
  },
  mediaPreviewScroll: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
  },
  mediaPreviewItem: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  mediaPreviewImage: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.md,
  },
  removeMediaButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPreviewItem: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  videoPreviewImage: {
    width: '100%',
    height: '100%',
  },
  videoPlayIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -12 }, { translateY: -12 }],
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoLabel: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  videoLabelText: {
    fontSize: 10,
    fontFamily: FontFamily.medium,
    color: 'white',
    textAlign: 'center',
  },
  loadingContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    color: Colors.neutral.subtext,
    marginTop: Spacing.md,
  },



  locationDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.border,
  },
  businessToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm + 6,
    paddingVertical: Spacing.xs + 4,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.neutral.border,
    backgroundColor: 'transparent',
    gap: Spacing.xs + 4,
  },
  businessToggleText: {
    fontSize: FontSizes.xs + 1,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.3,
  },
  locationDropdownText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    color: Colors.neutral.text,
  },
  mediaButtonDisabled: {
    opacity: 0.5,
  },
  mediaButtonTextDisabled: {
    color: Colors.neutral.subtext,
  },
  loadingIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugText: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  uploadCard: {
    backgroundColor: Colors.neutral.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl * 1.5,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  uploadIconContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  uploadTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.xl,
    color: Colors.neutral.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: Colors.neutral.border,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary.main,
    borderRadius: BorderRadius.full,
  },
  uploadPercentage: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.xxl,
    color: Colors.primary.main,
    marginBottom: Spacing.sm,
  },
  uploadSubtext: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.body,
    color: Colors.neutral.subtext,
    textAlign: 'center',
  },
  minimizedVideoFab: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Clean composer styles (Facebook/Twitter style)
  composerContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  composerInputArea: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  composerName: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.body,
  },
  draftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  draftBadgeText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.xs,
  },
  // Footer toolbar styles
  sensitiveContentRowWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sensitiveContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  sensitiveContentLabelWrap: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  sensitiveContentLabel: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginBottom: 1,
  },
  sensitiveContentHint: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    opacity: 0.9,
  },
  sensitiveContentSwitchWrap: {
    transform: [{ scale: 0.78 }],
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  footerActionBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postTypeLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.sm,
  },
  postButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xxl,
    minWidth: 88,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.body,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});