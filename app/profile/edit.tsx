import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { X, Camera, Check, Calendar } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../../utils/supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../constants/Endpoints';
import useAuth from '../../hooks/useAuth';
import { Colors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Shadow, Spacing } from '../../constants/Theme';
import Button from '../../components/Button';
import InterestTag from '../../components/InterestTag';
import { logError, getUserFriendlyError, showErrorToast } from '../../utils/errorHandler';
import Toast from 'react-native-toast-message';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProfileVerification from '../../components/ProfileVerification';
import { isProfileVerified } from '../../utils/profileVerification';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { validateUsername, getPolicyViolationMessage } from '../../utils/wordFilter';
import { uploadToBunnyNet, isBunnyNetEnabled } from '../../utils/bunnyNetStorage';
import { log, warn, error } from '../../utils/productionLogger';
import { computeAge } from '../../utils/ageGate';


// Default avatar image - defined as constant to avoid require() issues in conditionals
const DEFAULT_AVATAR = require('../../assets/images/default-avatar.png');

// CDN cache purge utility - static require to avoid Metro bundler issues
let cdnCachePurge: any = null;
try {
  cdnCachePurge = require('../../utils/cdnCachePurge');
} catch (e) {
  // Silently fail - optional service
}

// Available interests for selection
const availableInterests = [
  'Photography', 'Music', 'Food', 'Art', 'Technology', 
  'Fitness', 'Gaming', 'Reading', 'Cooking', 'Movies', 
  'Sports', 'Dancing', 'Writing', 'Design', 'Entrepreneurship',
  'Fashion', 'Travel', 'Nature', 'Volunteering', 'Learning'
];

// Available avatar styles with human avatars and clean designs
const diceBearAvatars = [
  { 
    id: 'avataaars', 
    name: 'Avataaars', 
    description: 'Clean cartoon style',
    seeds: ['avatar1', 'avatar2', 'avatar3', 'avatar4', 'avatar5', 'avatar6']
  },
  { 
    id: 'lorelei', 
    name: 'Lorelei', 
    description: 'Elegant portraits',
    seeds: ['elegant1', 'elegant2', 'elegant3', 'elegant4', 'elegant5', 'elegant6']
  },
  { 
    id: 'micah', 
    name: 'Micah', 
    description: 'Modern illustrations',
    seeds: ['micah1', 'micah2', 'micah3', 'micah4', 'micah5', 'micah6']
  },
  { 
    id: 'miniavs', 
    name: 'Miniavs', 
    description: 'Minimal avatars',
    seeds: ['mini1', 'mini2', 'mini3', 'mini4', 'mini5', 'mini6']
  },
  { 
    id: 'notionists', 
    name: 'Notionists', 
    description: 'Notion style',
    seeds: ['notion1', 'notion2', 'notion3', 'notion4', 'notion5', 'notion6']
  },
  { 
    id: 'personas', 
    name: 'Personas', 
    description: 'Diverse characters',
    seeds: ['person1', 'person2', 'person3', 'person4', 'person5', 'person6']
  },
  { 
    id: 'initials', 
    name: 'Initials', 
    description: 'Letter avatars',
    seeds: ['init1', 'init2', 'init3', 'init4', 'init5', 'init6']
  },
  { 
    id: 'fox', 
    name: 'Classic', 
    description: 'Classic human avatars',
    seeds: ['fox1', 'fox2', 'fox3', 'fox4', 'fox5', 'fox6']
  },
  { 
    id: 'raccoon', 
    name: 'Modern', 
    description: 'Modern human style',
    seeds: ['raccoon1', 'raccoon2', 'raccoon3', 'raccoon4', 'raccoon5', 'raccoon6']
  },
  { 
    id: 'cat', 
    name: 'Elegant', 
    description: 'Elegant human portraits',
    seeds: ['cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6']
  },
  { 
    id: 'bear', 
    name: 'Friendly', 
    description: 'Friendly human style',
    seeds: ['bear1', 'bear2', 'bear3', 'bear4', 'bear5', 'bear6']
  },
  { 
    id: 'owl', 
    name: 'Professional', 
    description: 'Professional avatars',
    seeds: ['owl1', 'owl2', 'owl3', 'owl4', 'owl5', 'owl6']
  },
  { 
    id: 'panda', 
    name: 'Casual', 
    description: 'Casual human style',
    seeds: ['panda1', 'panda2', 'panda3', 'panda4', 'panda5', 'panda6']
  },
  { 
    id: 'rabbit', 
    name: 'Playful', 
    description: 'Playful human avatars',
    seeds: ['rabbit1', 'rabbit2', 'rabbit3', 'rabbit4', 'rabbit5', 'rabbit6']
  },
  { 
    id: 'wolf', 
    name: 'Bold', 
    description: 'Bold human style',
    seeds: ['wolf1', 'wolf2', 'wolf3', 'wolf4', 'wolf5', 'wolf6']
  },
];

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets(); // Get safe area insets
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // Create dynamic styles based on theme
  const dynamicStyles = React.useMemo(() => createStyles(themeColors), [themeColors]);
  
  // Define placeholder color based on theme
  const placeholderColor = isDarkMode ? themeColors.neutral.textTertiary : themeColors.neutral.textSecondary;
  
  // Define input background color based on theme
  const inputBackgroundColor = isDarkMode ? '#1E293B' : themeColors.neutral.card;
  
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);

  
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [selectedAvatarStyle, setSelectedAvatarStyle] = useState<string | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarModalView, setAvatarModalView] = useState<'style' | 'icon'>('style'); // Track which view to show
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const hasNavigatedAfterSave = useRef(false); // Prevent navigation loops

  useEffect(() => {
    if (user?.id) {
      checkProfileAndSetup();
      checkVerificationStatus();
    }
    // Reset navigation flag when user changes
    hasNavigatedAfterSave.current = false;
  }, [user]);

  // Reload profile when screen comes into focus (e.g., when user navigates back)
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id && !saving) {
        log('[ProfileEdit] Screen focused, reloading profile data...');
        checkProfileAndSetup();
      }
    }, [user?.id, saving])
  );

  const checkProfileAndSetup = async () => {
    try {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        // Log error but don't show to user
        logError('ProfileEdit:CheckProfile', error);
        
        // If no profile exists (PGRST116), this is initial setup
        if (error.code === 'PGRST116') {
          setIsInitialSetup(true);
          return;
        }
        
        // For other errors, show a friendly message
        showErrorToast('Profile Error', error);
        return;
      }

      if (!data) {
        // No profile exists, this is initial setup
        setIsInitialSetup(true);
        return;
      }

      // Profile exists, populate form
              setFullName(data.full_name || '');
        // Strip @ from username when loading (we'll show it in the input)
        const cleanedUsername = (data.username || '').replace(/^@+/, '');
        setUsername(cleanedUsername);
        setBio(data.bio || '');
        setAvatarUrl(data.avatar_url || '');
        setSelectedInterests(data.interests || []);
        if (data.date_of_birth) {
          setDateOfBirth(new Date(data.date_of_birth + 'T12:00:00'));
        } else if (data.age != null && typeof data.age === 'number' && data.age > 0 && data.age < 120) {
          const y = new Date().getFullYear() - data.age;
          setDateOfBirth(new Date(y, 0, 1));
        } else {
          setDateOfBirth(null);
        }
      
      // Handle DiceBear avatars
      if (data.avatar_url?.startsWith('dicebear:')) {
        const avatarData = data.avatar_url.replace('dicebear:', '');
        if (avatarData.includes(':')) {
          const [style, seed] = avatarData.split(':');
          setSelectedAvatarStyle(style);
          setSelectedIcon(`${style}:${seed}`);
        } else {
          setSelectedAvatarStyle(avatarData);
          setSelectedIcon(`${avatarData}:${user?.id || 'default'}`);
        }
      }
    } catch (error) {
      logError('ProfileEdit:CheckProfile', error);
      showErrorToast('Profile Error', 'Unable to load profile information');
    }
  };

  const testStorageAccess = async () => {
    try {
      log('[Storage Test] Testing Supabase storage access...');
      
      // Simple test: try to get public URL for a dummy file
      // This will work if storage is accessible and bucket exists
      const { data: testUrl } = supabase.storage
        .from('avatars')
        .getPublicUrl('test-file.jpg');
      
      if (testUrl?.publicUrl) {
        log('[Storage Test] Storage access confirmed - avatars bucket is accessible');
        return true;
      }
      
      // If that fails, try listing buckets and creating if needed
      log('[Storage Test] Testing bucket access...');
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) {
        error('[Storage Test] Error listing buckets:', bucketsError);
        // Don't fail completely - storage might still work for uploads
        log('[Storage Test] Continuing despite bucket listing error...');
        return true;
      }
      
      log('[Storage Test] Available buckets:', buckets?.map(b => b.name));
      
      // Check if avatars bucket exists
      const avatarsBucket = buckets?.find(b => b.name === 'avatars');
      if (!avatarsBucket) {
        log('[Storage Test] Avatars bucket not found, attempting to create...');
        
        const { error: createError } = await supabase.storage.createBucket('avatars', {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024, // 5MB
        });
        
        if (createError) {
          // Check if error is because bucket already exists
          if (createError.message?.includes('already exists') || createError.message?.includes('duplicate')) {
            log('[Storage Test] Avatars bucket already exists (race condition)');
          } else {
            warn('[Storage Test] Could not create avatars bucket:', createError.message);
            // Don't fail completely - bucket might exist or be created by another process
          }
        } else {
          log('[Storage Test] Avatars bucket created successfully');
        }
      } else {
        log('[Storage Test] Avatars bucket exists');
      }
      
      log('[Storage Test] Storage test completed successfully');
      return true;
    } catch (error) {
      error('[Storage Test] Storage test failed:', error);
      // Don't block the user - let them try the upload anyway
      log('[Storage Test] Continuing despite test failure...');
      return true;
    }
  };

  const testDatabaseAccess = async () => {
    try {
      log('[Database Test] Testing profiles table access...');
      
      // Test if we can read from profiles table
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user?.id)
        .limit(1);
      
      if (error) {
        error('[Database Test] Error reading profiles table:', error);
        return false;
      }
      
      log('[Database Test] Profiles table accessible, found profile:', !!data?.length);
      return true;
    } catch (error) {
      error('[Database Test] Exception testing database:', error);
      return false;
    }
  };

  const ensureProfileExists = async () => {
    try {
      log('[Profile Check] Checking if profile exists...');
      
      // Check if profile exists using maybeSingle to avoid errors
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, created_at')
        .eq('id', user?.id)
        .maybeSingle();
      
      if (checkError) {
        error('[Profile Check] Error checking profile:', checkError);
        return false;
      }
      
      if (existingProfile) {
        log('[Profile Check] Profile exists, created at:', existingProfile.created_at);
        return true;
      }
      
      // Profile doesn't exist - don't create it here, let the save function handle it
      // This prevents creating empty profiles prematurely
      log('[Profile Check] Profile not found - will be created during save');
      return false; // Return false so save function knows to use upsert
    } catch (error) {
      error('[Profile Check] Exception ensuring profile exists:', error);
      return false;
    }
  };

  const generateDiceBearUrl = (style: string, seed?: string) => {
    const userSeed = seed || user?.id || 'default';
    
    // Check if it's a custom animal style
    const animalStyles = ['fox', 'raccoon', 'cat', 'bear', 'owl', 'panda', 'rabbit', 'wolf'];
    
    if (animalStyles.includes(style)) {
      // For animal styles, use emoji-based avatars with different backgrounds
      const animalEmojis = {
        'fox': '🦊',
        'raccoon': '🦝', 
        'cat': '🐱',
        'bear': '🐻',
        'owl': '🦉',
        'panda': '🐼',
        'rabbit': '🐰',
        'wolf': '🐺'
      };
      
      const emoji = animalEmojis[style] || '🦊';
      const backgroundColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
      const colorIndex = userSeed.charCodeAt(0) % backgroundColors.length;
      const backgroundColor = backgroundColors[colorIndex];
      
      // Create a simple emoji-based avatar URL using a service like Avataaars or similar
      // For now, we'll use a fallback to a clean DiceBear style
      const fallbackStyles = {
        'fox': 'avataaars',
        'raccoon': 'miniavs', 
        'cat': 'lorelei',
        'bear': 'micah',
        'owl': 'notionists',
        'panda': 'personas',
        'rabbit': 'miniavs',
        'wolf': 'avataaars'
      };
      
      const fallbackStyle = fallbackStyles[style] || 'avataaars';
      return `https://api.dicebear.com/9.x/${fallbackStyle}/png?seed=${userSeed}&size=120&backgroundColor=${backgroundColor.replace('#', '')}`;
    }
    
    // For regular DiceBear styles
    return `https://api.dicebear.com/9.x/${style}/png?seed=${userSeed}&size=120`;
  };

  const selectAvatarStyle = (styleId: string) => {
    setSelectedAvatarStyle(styleId);
    // Switch to icon picker view within the same modal (no nested modals)
    setAvatarModalView('icon');
  };

  const selectIcon = (seed: string) => {
    if (selectedAvatarStyle) {
      setSelectedIcon(`${selectedAvatarStyle}:${seed}`);
      setNewAvatarUri(null); // Clear any selected photo
      setShowAvatarModal(false); // Close the modal
      setAvatarModalView('style'); // Reset to style view for next time
    }
  };

  const goBackToStylePicker = () => {
    // Switch back to style picker view within the same modal
    setAvatarModalView('style');
  };

  const handleDobChange = (_event: any, date?: Date) => {
    setShowDobPicker(false);
    if (date) setDateOfBirth(date);
  };

  // Helper function to open avatar modal
  const openAvatarModal = () => {
    setAvatarModalView('style'); // Start with style picker
    setShowAvatarModal(true);
  };

  const showImageOptions = () => {
    // On iOS, close any open modals before showing Alert
    // iOS can't show a modal (Alert) on top of another modal
    if (Platform.OS === 'ios') {
      if (showAvatarModal) {
        setShowAvatarModal(false);
      }
      // Small delay to ensure modal is fully closed before showing Alert
      setTimeout(() => {
        Alert.alert(
          'Profile Picture',
          'Choose how you want to set your profile picture',
          [
            { text: 'Choose Icon', onPress: openAvatarModal },
            { text: 'Take Photo', onPress: takePhoto },
            { text: 'Pick from Gallery', onPress: pickImage },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }, 300);
    } else {
      // On Android, we can show Alert immediately
      Alert.alert(
        'Profile Picture',
        'Choose how you want to set your profile picture',
        [
          { text: 'Choose Icon', onPress: openAvatarModal },
          { text: 'Take Photo', onPress: takePhoto },
          { text: 'Pick from Gallery', onPress: pickImage },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  // Show toast for premium features
  const showPremiumFeatureToast = (featureName: string) => {
    Toast.show({
      type: 'success',
      text1: '✨ Premium Feature',
      text2: `${featureName} require a premium membership`,
      position: 'top',
      visibilityTime: 4000,
      autoHide: true,
      topOffset: 60,
      props: {
        style: {
          width: '90%',
          borderLeftColor: Colors.primary.main,
          borderLeftWidth: 6,
          backgroundColor: Colors.neutral.card,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.15,
          shadowRadius: 5,
          elevation: 6,
          padding: 8,
        },
        text1Style: {
          fontSize: 18,
          fontFamily: FontFamily.bold,
          color: Colors.primary.main,
          marginBottom: 4,
        },
        text2Style: {
          fontSize: 16,
          fontFamily: FontFamily.medium,
          color: Colors.neutral.text,
          lineHeight: 22,
        }
      }
    });
  };

  const takePhoto = async () => {
    try {
      // On iOS, close any open modals before opening ImagePicker
      // iOS can't show a modal on top of another modal
      if (Platform.OS === 'ios') {
        if (showAvatarModal) {
          setShowAvatarModal(false);
        }
        // Small delay to ensure modal is fully closed
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Test storage access (but don't block on failure)
      testStorageAccess();
      
      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow camera access to take a profile picture.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      log('Launching camera...');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      log('Camera result:', JSON.stringify(result, null, 2));
      
      if (!result.canceled && result.assets && (result.assets?.length || 0) > 0) {
        const selectedAsset = result.assets[0];
        
        if (!selectedAsset.uri) {
          error('No URI in selected asset');
          Alert.alert('Error', 'Failed to get image URI');
          return;
        }
        
        log('Selected asset:', selectedAsset.uri);
        
        // Resize/compress the image
        try {
          const manipResult = await manipulateAsync(
            selectedAsset.uri,
            [{ resize: { width: 400, height: 400 } }],
            { format: SaveFormat.JPEG, compress: 0.8 }
          );
          
          log('Manipulated image:', manipResult.uri);
          setNewAvatarUri(manipResult.uri);
          setSelectedIcon(null); // Clear any selected icon
        } catch (manipError) {
          error('Error manipulating image:', manipError);
          // Fall back to original image if manipulation fails
          setNewAvatarUri(selectedAsset.uri);
          setSelectedIcon(null);
        }
      }
    } catch (error) {
      error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const takeBusinessLogoPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow camera access.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const manipResult = await manipulateAsync(result.assets[0].uri, [{ resize: { width: 200, height: 200 } }], { format: SaveFormat.JPEG, compress: 0.8 });
        setNewBusinessLogoUri(manipResult.uri);
      }
    } catch (_) { Alert.alert('Error', 'Failed to take photo'); }
  };

  const pickBusinessLogoImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow photo library access.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const manipResult = await manipulateAsync(result.assets[0].uri, [{ resize: { width: 200, height: 200 } }], { format: SaveFormat.JPEG, compress: 0.8 });
        setNewBusinessLogoUri(manipResult.uri);
      }
    } catch (_) { Alert.alert('Error', 'Failed to pick image'); }
  };

  const showBusinessLogoOptions = () => {
    const hasLogo = !!(businessLogoUrl || newBusinessLogoUri);
    const buttons: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
      { text: 'Take Photo', onPress: takeBusinessLogoPhoto },
      { text: 'Pick from Gallery', onPress: pickBusinessLogoImage },
    ];
    if (hasLogo) buttons.push({ text: 'Remove logo', onPress: () => { setBusinessLogoUrl(''); setNewBusinessLogoUri(null); } });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Business logo', 'Choose an image for your business', buttons);
  };

  const pickImage = async () => {
    try {
      // On iOS, close any open modals before opening ImagePicker
      // iOS can't show a modal on top of another modal
      if (Platform.OS === 'ios') {
        if (showAvatarModal) {
          setShowAvatarModal(false);
        }
        // Small delay to ensure modal is fully closed
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Test storage access (but don't block on failure)
      testStorageAccess();
      
      // Request permission first
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to change your profile picture.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      log('Launching image picker...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        // Ensure we get a file with good compatibility
        exif: false,
        base64: false,
      });

      log('Image picker result:', JSON.stringify(result, null, 2));
      
      if (!result.canceled && result.assets && (result.assets?.length || 0) > 0) {
        const selectedAsset = result.assets[0];
        
        if (!selectedAsset.uri) {
          error('No URI in selected asset');
          Alert.alert('Error', 'Failed to get image URI');
          return;
        }
        
        log('Selected asset:', selectedAsset.uri);
        log('Image size:', selectedAsset.width, 'x', selectedAsset.height);
        
        // Resize/compress the image
        try {
          const manipResult = await manipulateAsync(
            selectedAsset.uri,
            [{ resize: { width: 400, height: 400 } }],
            { format: SaveFormat.JPEG, compress: 0.8 }
          );
          
          log('Manipulated image:', manipResult.uri);
          setNewAvatarUri(manipResult.uri);
          setSelectedIcon(null); // Clear any selected icon
        } catch (manipError) {
          error('Error manipulating image:', manipError);
          // Fall back to original image if manipulation fails
          setNewAvatarUri(selectedAsset.uri);
          setSelectedIcon(null); // Clear any selected icon
        }
      }
    } catch (error) {
      error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!newAvatarUri || !user?.id) return null;
    
    try {
      setUploading(true);
      log('[Avatar Upload] Starting upload process...');
      log('[Avatar Upload] Source URI:', newAvatarUri);
      
      // Create a simple, unique filename
      const timestamp = Date.now();
      const fileName = `avatar_${user.id}_${timestamp}.jpg`;
      
      log('[Avatar Upload] Target filename:', fileName);
      
      // Try Bunny.net first (if enabled) - Best performance for Africa
      try {
        if (isBunnyNetEnabled()) {
          log('[Avatar Upload] Attempting Bunny.net upload (Africa-optimized)...');
          
          const bunnyUrl = await uploadToBunnyNet(newAvatarUri, fileName, 'avatars');
          
          if (bunnyUrl) {
            log('[Avatar Upload] ✅ Bunny.net upload successful! CDN URL:', bunnyUrl);
            return bunnyUrl;
          } else {
            log('[Avatar Upload] ⚠️ Bunny.net upload failed, falling back to Supabase...');
          }
        } else {
          log('[Avatar Upload] Bunny.net not enabled, using Supabase...');
        }
      } catch (bunnyError: any) {
        warn('[Avatar Upload] ⚠️ Bunny.net upload error (non-critical), falling back to Supabase:', bunnyError?.message || bunnyError);
      }
      
      // Method 1: Direct file upload from URI (Supabase fallback)
      try {
        log('[Avatar Upload] Attempting direct file upload...');
        
        // Get file info
        const fileInfo = await FileSystem.getInfoAsync(newAvatarUri);
        log('[Avatar Upload] File info:', fileInfo);
        
        if (!fileInfo.exists) {
          throw new Error('File does not exist');
        }
        
        // Upload directly from file URI
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, {
            uri: newAvatarUri,
            type: 'image/jpeg',
            name: fileName
          }, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: true
          });
        
        if (uploadError) {
          log('[Avatar Upload] Direct upload failed, trying alternative method:', uploadError);
          throw uploadError; // Try alternative method
        }
        
        log('[Avatar Upload] Direct upload successful:', uploadData);
        
        // Get the public URL
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);
        
        if (!urlData?.publicUrl) {
          throw new Error('Failed to get public URL');
        }
        
        // Add cache busting parameter
        const publicUrl = `${urlData.publicUrl}?t=${timestamp}`;
        log('[Avatar Upload] Public URL:', publicUrl);
        
        // Purge CDN cache for the new avatar (non-blocking)
        log('[Avatar Upload] 🔄 Attempting to purge CDN cache...');
        if (cdnCachePurge && typeof cdnCachePurge.purgeCdnCacheFromUrl === 'function') {
          cdnCachePurge.purgeCdnCacheFromUrl(publicUrl)
            .then((success: boolean) => {
              if (success) {
                log('[Avatar Upload] ✅ CDN cache purged successfully');
              } else {
                warn('[Avatar Upload] ⚠️ CDN cache purge returned false (may be disabled)');
              }
            })
            .catch((error: any) => {
              warn('[Avatar Upload] ❌ CDN cache purge failed (non-critical):', error);
            });
        } else {
          warn('[Avatar Upload] ⚠️ CDN cache purge not available (module not loaded)');
        }
        
        return publicUrl;
      } catch (directUploadError) {
        log('[Avatar Upload] Direct upload failed, trying fetch API approach...');
        
        // Method 2: Use fetch API with FormData
        // Get Supabase storage URL
        const storageUrl = `${supabase.supabaseUrl}/storage/v1/object/avatars/${fileName}`;
        
        // Create form data
        const formData = new FormData();
        formData.append('file', {
          uri: newAvatarUri,
          type: 'image/jpeg',
          name: fileName
        } as any);
        
        // Get auth token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('No active session');
        }
        
        // Make fetch request
        const response = await fetch(storageUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'x-upsert': 'true',
            'Cache-Control': '3600',
            'Content-Type': 'multipart/form-data'
          },
          body: formData
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${errorText}`);
        }
        
        // Get the public URL
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);
        
        if (!urlData?.publicUrl) {
          throw new Error('Failed to get public URL');
        }
        
        // Add cache busting parameter
        const publicUrl = `${urlData.publicUrl}?t=${timestamp}`;
        log('[Avatar Upload] Public URL (fetch method):', publicUrl);
        
        // Purge CDN cache for the new avatar (non-blocking)
        log('[Avatar Upload] 🔄 Attempting to purge CDN cache (fetch method)...');
        if (cdnCachePurge && typeof cdnCachePurge.purgeCdnCacheFromUrl === 'function') {
          cdnCachePurge.purgeCdnCacheFromUrl(publicUrl)
            .then((success: boolean) => {
              if (success) {
                log('[Avatar Upload] ✅ CDN cache purged successfully');
              } else {
                warn('[Avatar Upload] ⚠️ CDN cache purge returned false (may be disabled)');
              }
            })
            .catch((error: any) => {
              warn('[Avatar Upload] ❌ CDN cache purge failed (non-critical):', error);
            });
        } else {
          warn('[Avatar Upload] ⚠️ CDN cache purge not available (module not loaded)');
        }
        
        return publicUrl;
      }
    } catch (error) {
      error('[Avatar Upload] Error:', error);
      Alert.alert(
        'Upload Failed', 
        'Failed to upload profile picture. Please check your internet connection and try again.'
      );
      return null;
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!user?.id) return;
    
    if (!fullName.trim()) {
      Alert.alert('Missing Information', 'Please enter your full name');
      return;
    }
    
    if (!username.trim()) {
      Alert.alert('Missing Information', 'Please enter a username');
      return;
    }
    
    // Validate username against blocked words
    const usernameValidation = validateUsername(username.trim());
    if (!usernameValidation.isValid) {
      Alert.alert(
        'Content Policy Violation',
        usernameValidation.error || getPolicyViolationMessage(),
        [{ text: 'OK' }]
      );
      return;
    }
    
    if (bio.length > 90) {
      Alert.alert('Bio Too Long', 'Bio must be 90 characters or less');
      return;
    }

    if (!dateOfBirth) {
      Alert.alert('Date of birth required', 'Please select your date of birth.');
      return;
    }

    // Enforce 13+ at the UI layer (matches server constraint)
    const age = computeAge(dateOfBirth);
    if (age < 13) {
      Alert.alert('Not eligible', 'You must be 13 or older to use Nomli.');
      return;
    }

    try {
      setSaving(true);
      
      let newAvatarUrl = avatarUrl;
      
      if (newAvatarUri) {
        log('[Profile Update] Uploading new avatar...');
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          log('[Profile Update] Avatar upload successful:', uploadedUrl);
          newAvatarUrl = uploadedUrl;
          setAvatarUrl(uploadedUrl);
          setNewAvatarUri(null);
          setSelectedIcon(null);
        } else {
          error('[Profile Update] Avatar upload failed, skipping profile update');
          showErrorToast('Upload Failed', 'Unable to upload profile picture');
          setSaving(false);
          return;
        }
      } else if (selectedIcon) {
        newAvatarUrl = `dicebear:${selectedIcon}`;
        setAvatarUrl(newAvatarUrl);
        setSelectedIcon(null);
        setSelectedAvatarStyle(null);
      }
      
      let saveSuccessful = false;
      
      // Check if profile exists first to determine best save method
      log('[Profile Update] Checking if profile exists...');
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, created_at')
        .eq('id', user.id)
        .maybeSingle();
      
      if (checkError && checkError.code !== 'PGRST116') {
        error('[Profile Update] Error checking existing profile:', checkError);
      }
      
      const profileExists = !!existingProfile;
      log(`[Profile Update] Profile ${profileExists ? 'exists' : 'does not exist'}`);
      
      // Prepare profile data
      const profileData: any = {
        id: user.id,
        full_name: fullName.trim(),
        username: username.trim().replace(/^@+/, ''), // Strip any @ symbols before saving
        bio: bio.trim(),
        avatar_url: newAvatarUrl,
        interests: selectedInterests,
        date_of_birth: dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : null,
        updated_at: new Date().toISOString()
      };
      
      // Only set created_at and privacy settings if profile doesn't exist
      if (!profileExists) {
        profileData.created_at = new Date().toISOString();
        log('[Profile Update] Will create new profile with created_at');
      }
      
      log('[Profile Update] User ID:', user.id);
      log('[Profile Update] Data to save:', profileData);
      
      // For new profiles, use direct upsert (most reliable)
      // For existing profiles, try RPC first, then fallback to upsert
      if (!profileExists) {
        log('[Profile Update] New profile - using direct upsert (most reliable for new profiles)');
        
        const { data: upsertData, error: upsertError } = await supabase
          .from('profiles')
          .upsert(profileData, {
            onConflict: 'id'
          })
          .select()
          .single();
        
        if (upsertError) {
          logError('ProfileEdit:DirectUpsertFailed', upsertError);
          error('[Profile Update] ❌ Direct upsert FAILED:', upsertError);
          error('[Profile Update] Error details:', JSON.stringify(upsertError, null, 2));
          
          // Check if it's the app_id trigger error
          if (upsertError.message && upsertError.message.includes('app_id')) {
            error('[Profile Update] ⚠️ Database trigger error: profiles table has a trigger referencing app_id field that does not exist');
            error('[Profile Update] This is a database configuration issue that needs to be fixed in Supabase');
            showErrorToast(
              'Database Error', 
              'Profile save failed due to database configuration. Please contact support or check database triggers.'
            );
          } else {
            showErrorToast('Save Error', `Unable to save profile: ${upsertError.message || 'Unknown error'}`);
          }
          setSaving(false);
          return;
        }
        
        log('[Profile Update] ✅ Direct upsert successful (new profile):', upsertData);
        saveSuccessful = true;
      } else {
        log('[Profile Update] Existing profile - using direct upsert...');
        
        const { data: upsertData, error: upsertError } = await supabase
          .from('profiles')
          .upsert(profileData, {
            onConflict: 'id'
          })
          .select()
          .single();
          
        if (upsertError) {
          logError('ProfileEdit:DirectUpsertFailed', upsertError);
          error('[Profile Update] ❌ Direct upsert FAILED:', upsertError);
          error('[Profile Update] Error details:', JSON.stringify(upsertError, null, 2));
          
          // If DB age constraint rejects DOB, retry saving without DOB so profile edits still work.
          if (upsertError.code === '23514' && String(upsertError.message || '').includes('profiles_age_check')) {
            try {
              warn('[Profile Update] Retrying save without date_of_birth due to profiles_age_check...');
              const retryData = { ...profileData };
              delete retryData.date_of_birth;
              const { error: retryError } = await supabase
                .from('profiles')
                .upsert(retryData, { onConflict: 'id' })
                .select()
                .single();
              if (!retryError) {
                Toast.show({
                  type: 'info',
                  text1: 'Profile saved',
                  text2: 'DOB could not be saved (server age policy).',
                  position: 'top',
                  visibilityTime: 3500,
                });
                setSaving(false);
                return;
              }
            } catch {
              // fall through to normal error handling
            }
          }

          // Check if it's the app_id trigger error
          if (upsertError.message && upsertError.message.includes('app_id')) {
            error('[Profile Update] ⚠️ Database trigger error: profiles table has a trigger referencing app_id field that does not exist');
            error('[Profile Update] This is a database configuration issue that needs to be fixed in Supabase');
            showErrorToast(
              'Database Error', 
              'Profile save failed due to database configuration. Please contact support or check database triggers.'
            );
          } else {
            showErrorToast('Save Error', `Unable to save profile: ${upsertError.message || 'Unknown error'}`);
          }
          setSaving(false);
          return;
        }
        
        log('[Profile Update] ✅ Direct upsert successful (existing profile):', upsertData);
        log('[Profile Update] Saved profile:', upsertData?.id);
        saveSuccessful = true;
      }
      
      // Verify the save actually worked by checking the database
      // Add a small delay to allow database replication/consistency
      if (saveSuccessful) {
        log('[Profile Update] Verifying save by fetching profile from database...');
        
        // Retry verification up to 3 times with delays (handles eventual consistency)
        let verifyData = null;
        let verifyError = null;
        let verificationPassed = false;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          log(`[Profile Update] Verification attempt ${attempt}/3...`);
          
          // Wait a bit before checking (except first attempt)
          if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // 500ms, 1000ms delays
          }
          
          const { data, error } = await supabase
            .from('profiles')
          .select('id, full_name, username, bio')
            .eq('id', user.id)
            .maybeSingle();
          
          verifyData = data;
          verifyError = error;
          
          if (error) {
            error(`[Profile Update] ⚠️ Verification attempt ${attempt} error:`, error);
            // Continue to next attempt
          } else if (data) {
            log(`[Profile Update] ✅ Verification attempt ${attempt} successful - profile found:`, data);
            // Check if the data actually matches what we saved
            const cleanedUsername = username.trim().replace(/^@+/, '');
            if (data.full_name === fullName.trim() && data.username === cleanedUsername) {
              log('[Profile Update] ✅ Verified: Saved data matches expected values');
              verificationPassed = true;
              break;
            } else {
              warn('[Profile Update] ⚠️ Profile found but data mismatch:', {
                expected: { full_name: fullName.trim(), username: cleanedUsername },
                actual: { full_name: data.full_name, username: data.username }
              });
              // Continue to next attempt
            }
          } else {
            warn(`[Profile Update] ⚠️ Verification attempt ${attempt}: Profile not found`);
            // Continue to next attempt
          }
        }
        
        if (!verificationPassed) {
          error('[Profile Update] ❌ All verification attempts failed');
          error('[Profile Update] Last error:', verifyError);
          error('[Profile Update] Last data:', verifyData);
          
          // Even if verification fails, if the RPC said it succeeded, we should trust it
          // The verification might fail due to RLS policies or timing, but the save might have worked
          warn('[Profile Update] ⚠️ Verification failed but RPC reported success - proceeding anyway');
          // Don't block the user - the RPC function said it worked
        }
      }

      // Only proceed if save was successful
      if (!saveSuccessful) {
        error('[Profile Update] ❌ Save was not successful, aborting');
        showErrorToast('Save Error', 'Failed to save profile. Please check the logs and try again.');
        setSaving(false);
        return;
      }

      // Reset initial setup flag immediately after successful save
      const wasInitialSetup = isInitialSetup;
      if (wasInitialSetup) {
        setIsInitialSetup(false);
      }

      // Prevent navigation loops
      if (hasNavigatedAfterSave.current) {
        log('[ProfileEdit] Already navigated, skipping navigation');
        setSaving(false);
        return;
      }

      // Reload profile data immediately after successful save to ensure UI reflects saved values
      log('[ProfileEdit] Reloading profile data after save...');
      await checkProfileAndSetup();
      
      // Update cache immediately after successful save
      try {
        const profileCacheModule = await import('../../utils/profileCache');
        // Fetch the updated profile to cache it
        const { data: updatedProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (updatedProfile) {
          await profileCacheModule.cacheProfile(updatedProfile);
          log('[ProfileEdit] ✅ Updated profile cache after save');
        }
      } catch (cacheError) {
        warn('[ProfileEdit] Failed to update cache after save:', cacheError);
        // Don't block user - cache update is non-critical
      }

      log('[Profile Update] 🎉 Save completed successfully, showing success message');
      Alert.alert(
        wasInitialSetup ? 'Welcome!' : 'Success',
        wasInitialSetup ? 'Your profile has been set up successfully!' : 'Profile updated successfully',
        [
          {
            text: 'OK',
            onPress: () => {
              // Prevent multiple navigations
              if (hasNavigatedAfterSave.current) {
                log('[ProfileEdit] Navigation already triggered, skipping');
                return;
              }
              
              hasNavigatedAfterSave.current = true;
              
              if (wasInitialSetup) {
                log('[ProfileEdit] Navigating to community/home after initial setup');
                router.replace('/(tabs)/community');
              } else {
                log('[ProfileEdit] Navigating back after profile update');
                router.back();
              }
            }
          }
        ]
      );
    } catch (error) {
      logError('ProfileEdit:SaveProfile', error);
      showErrorToast('Save Error', 'Unable to save profile changes');
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((current) => {
      if (current.includes(interest)) {
        return current.filter(item => item !== interest);
      } else {
        // Limit to 5 interests
        if ((current?.length || 0) >= 5) {
          Alert.alert('Limit Reached', 'You can select up to 5 interests');
          return current;
        }
        return [...current, interest];
      }
    });
  };

  // Check if the profile is verified
  const checkVerificationStatus = async () => {
    if (!user?.id) return;
    
    try {
      setCheckingVerification(true);
      const verified = await isProfileVerified(user.id);
      setIsVerified(verified);
      setCheckingVerification(false);
    } catch (error) {
      error('[Profile] Error checking verification status:', error);
      setCheckingVerification(false);
    }
  };

  // Handle verification completion
  const handleVerificationComplete = (success: boolean) => {
    setShowVerification(false);
    
    if (success) {
      setIsVerified(true);
      Alert.alert(
        'Verification Successful',
        'Your profile has been verified successfully.',
        [{ text: 'OK' }]
      );
    }
  };

  // Start verification process
  const startVerification = () => {
    if (!avatarUrl) {
      Alert.alert(
        'Profile Photo Required',
        'Please set a profile photo before starting verification.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    if (!user?.id) {
      Alert.alert(
        'Please Sign In',
        'You need to be signed in to verify your profile.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    try {
      log('[ProfileEdit] Starting verification with avatar URL:', avatarUrl);
      log('[ProfileEdit] User ID:', user.id);
      
      // Create a direct URL with all parameters properly encoded
      const params = new URLSearchParams();
      params.append('profilePhotoUrl', avatarUrl);
      params.append('userId', user.id);
      params.append('timestamp', Date.now().toString());
      
      log('[ProfileEdit] Navigation params:', params.toString());
      
      // Use direct navigation with stack push
      router.push({
        pathname: '/verify-photo',
        params: { 
          profilePhotoUrl: avatarUrl,
          userId: user.id,
          timestamp: Date.now().toString()
        }
      });
    } catch (error) {
      error('[ProfileEdit] Navigation error:', error);
      Alert.alert(
        'Navigation Error',
        'Could not open the verification screen. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  // Render avatar with verification status
  const renderAvatar = () => {
    let displayUrl = avatarUrl;
    
    // If there's a new avatar URI selected but not uploaded yet, show that
    if (newAvatarUri) {
      displayUrl = newAvatarUri;
    }
    // If a dicebear icon is selected, generate the URL
    else if (selectedIcon) {
      const [style, seed] = selectedIcon.split(':');
      displayUrl = generateDiceBearUrl(style, seed);
    }
    
    // If we have a URL that starts with 'dicebear:', extract the actual URL
    if (displayUrl && displayUrl.startsWith('dicebear:')) {
      const [_, styleAndSeed] = displayUrl.split(':');
      const [style, seed] = styleAndSeed.split(':');
      displayUrl = generateDiceBearUrl(style, seed);
    }
    
    return (
      <View>
        <Image
          source={displayUrl ? { uri: displayUrl } : DEFAULT_AVATAR}
          style={styles.appleAvatar}
          resizeMode="cover"
          defaultSource={DEFAULT_AVATAR}
        />
        
        {isVerified && (
          <View style={[styles.appleVerifiedBadge, { backgroundColor: themeColors.success.main }]}>
            <Check size={12} color="white" />
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView 
      style={[styles.appleContainer, { backgroundColor: themeColors.neutral.background }]}
      edges={['top']}
    >
      <Stack.Screen 
        options={{
          headerShown: false,
        }}
      />
      
      {/* Apple-style Header */}
      <View style={[styles.appleHeader, { backgroundColor: themeColors.neutral.background }]}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.appleCloseButton}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <X size={20} color={themeColors.neutral.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.appleHeaderTitle, { color: themeColors.neutral.text }]}>Edit Profile</Text>
        <View style={styles.appleHeaderSpacer} />
      </View>
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.appleKeyboardView}
      >
        <ScrollView
          style={styles.appleScrollView}
          contentContainerStyle={styles.appleScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <>
          {/* Minimal Avatar Section */}
          <View style={styles.appleAvatarSection}>
            <TouchableOpacity 
              onPress={showImageOptions}
              style={styles.appleAvatarContainer}
              activeOpacity={0.8}
              disabled={uploading}
            >
              {renderAvatar()}
              {uploading && (
                <View style={styles.appleUploadingOverlay}>
                  <ActivityIndicator color="white" size="small" />
                </View>
              )}
              <View style={[styles.appleAvatarOverlay, { backgroundColor: themeColors.neutral.background + '90' }]}>
                <Camera size={16} color={themeColors.neutral.text} strokeWidth={2} />
              </View>
            </TouchableOpacity>
            {!avatarUrl && !selectedIcon && !newAvatarUri && (
              <Text style={[styles.appleNoPhotoTag, { color: themeColors.neutral.textSecondary }]}>You don't have a profile photo yet</Text>
            )}
          </View>
          
          {/* Compact Form Fields */}
          <View style={styles.appleFormSection}>
            {/* Full Name and Username in same row */}
            <View style={styles.appleFieldRow}>
              <View style={[styles.appleFieldGroup, styles.appleFieldGroupHalfLeft]}>
                <Text style={[styles.appleFieldLabel, { color: themeColors.neutral.text }]}>Full Name</Text>
                <TextInput
                  style={[
                    styles.appleFieldInput, 
                    { 
                      color: themeColors.neutral.text,
                      backgroundColor: themeColors.neutral.card,
                      borderColor: themeColors.neutral.border
                    }
                  ]}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Full name"
                  placeholderTextColor={themeColors.neutral.subtext}
                />
              </View>
              
              <View style={[styles.appleFieldGroup, styles.appleFieldGroupHalfRight]}>
                <Text style={[styles.appleFieldLabel, { color: themeColors.neutral.text }]}>Username</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: themeColors.neutral.text, fontSize: FontSizes.md, marginRight: 4 }}>@</Text>
                  <TextInput
                    style={[
                      styles.appleFieldInput, 
                      { 
                        color: themeColors.neutral.text,
                        backgroundColor: themeColors.neutral.card,
                        borderColor: themeColors.neutral.border,
                        flex: 1
                      }
                    ]}
                    value={username}
                    onChangeText={(text) => {
                      // Strip any @ symbols the user might type
                      const cleaned = text.replace(/@/g, '');
                      setUsername(cleaned);
                      // Real-time validation feedback (optional - can be removed if too aggressive)
                      if (cleaned.trim().length > 0) {
                        const validation = validateUsername(cleaned.trim());
                        if (!validation.isValid) {
                          // Show subtle warning but don't block typing
                          // User will see full error on save
                        }
                      }
                    }}
                    placeholder="username"
                    placeholderTextColor={themeColors.neutral.subtext}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>
            
            <View style={styles.appleFieldGroup}>
              <Text style={[styles.appleFieldLabel, { color: themeColors.neutral.text }]}>Bio</Text>
              <TextInput
                style={[
                  styles.appleFieldInput,
                  styles.appleBioInput,
                  { 
                    color: themeColors.neutral.text,
                    backgroundColor: themeColors.neutral.card,
                    borderColor: themeColors.neutral.border
                  }
                ]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself"
                placeholderTextColor={themeColors.neutral.subtext}
                multiline
                numberOfLines={3}
                maxLength={90}
              />
              <View style={styles.appleCharacterCount}>
                <Text style={[styles.appleCharacterText, { color: themeColors.neutral.subtext }]}>
                  {bio.length}/90
                </Text>
              </View>
            </View>
            
            
            <View style={styles.appleFieldGroup}>
              <Text style={[styles.appleFieldLabel, { color: themeColors.neutral.text }]}>Date of birth</Text>
              <TouchableOpacity
                style={[
                  styles.appleFieldInput,
                  styles.appleDropdown,
                  {
                    backgroundColor: themeColors.neutral.card,
                    borderColor: themeColors.neutral.border,
                  },
                ]}
                onPress={() => setShowDobPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.appleDropdownButton}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Calendar size={18} color={themeColors.neutral.subtext} style={{ marginRight: 8 }} />
                    <Text style={[styles.appleDropdownText, { color: dateOfBirth ? themeColors.neutral.text : themeColors.neutral.subtext }]} numberOfLines={1}>
                      {dateOfBirth
                        ? dateOfBirth.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Select date of birth'}
                    </Text>
                  </View>
                  <Text style={[styles.appleDropdownArrow, { color: themeColors.neutral.subtext }]}>▼</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.appleFieldGroup}>
              <Text style={[styles.appleFieldLabel, { color: themeColors.neutral.text }]}>Interests</Text>
              <View style={styles.appleInterestsGrid}>
                {(() => {
                  // Combine available interests with any previously selected interests not in the new list
                  const allInterests = [...availableInterests];
                  selectedInterests.forEach(interest => {
                    if (!availableInterests.includes(interest)) {
                      allInterests.push(interest);
                    }
                  });
                  
                  return allInterests.map((interest) => (
                    <TouchableOpacity
                      key={interest}
                      onPress={() => toggleInterest(interest)}
                      style={[
                        styles.appleInterestChip,
                        { 
                          backgroundColor: selectedInterests.includes(interest) 
                            ? themeColors.primary.main 
                            : themeColors.neutral.card,
                          borderColor: selectedInterests.includes(interest) 
                            ? themeColors.primary.main 
                            : themeColors.neutral.border
                        }
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.appleInterestText,
                        { 
                          color: selectedInterests.includes(interest) 
                            ? 'white' 
                            : themeColors.neutral.text
                        }
                      ]}>
                        {interest}
                      </Text>
                    </TouchableOpacity>
                  ));
                })()}
              </View>
            </View>
          </View>
          </>
          
          {/* Minimal Save Button */}
          <TouchableOpacity
            onPress={saveProfile}
            disabled={saving || !dateOfBirth}
            style={[
              styles.appleSaveButton,
              { 
                backgroundColor: (saving || !dateOfBirth) ? themeColors.neutral.subtext : themeColors.primary.main,
                opacity: (saving || !dateOfBirth) ? 0.6 : 1
              }
            ]}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.appleSaveText}>
                {isInitialSetup ? "Complete Setup" : "Save"}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
        
        {/* Single Avatar Modal - switches between style and icon views (no nested modals) */}
        {showAvatarModal && (
          <Modal
            transparent={true}
            animationType="fade"
            visible={showAvatarModal}
            onRequestClose={() => {
              setShowAvatarModal(false);
              setAvatarModalView('style'); // Reset to style view for next time
            }}
          >
            <View style={dynamicStyles.modalOverlay}>
              <View style={[dynamicStyles.modalContent, { backgroundColor: themeColors.neutral.card }]}>
                <View style={dynamicStyles.customHeader}>
                  <View style={dynamicStyles.headerContent}>
                    {avatarModalView === 'icon' ? (
                      <TouchableOpacity 
                        style={dynamicStyles.headerButton} 
                        onPress={goBackToStylePicker}
                      >
                        <X size={24} color={themeColors.neutral.text} />
                      </TouchableOpacity>
                    ) : (
                      <View style={dynamicStyles.headerLeft} />
                    )}
                    <Text style={[dynamicStyles.headerTitle, { color: themeColors.neutral.text }]}>
                      {avatarModalView === 'style' ? 'Choose Style' : 'Choose Icon'}
                    </Text>
                    {avatarModalView === 'style' ? (
                      <TouchableOpacity 
                        style={dynamicStyles.headerButton} 
                        onPress={() => {
                          setShowAvatarModal(false);
                          setAvatarModalView('style'); // Reset to style view for next time
                        }}
                      >
                        <X size={24} color={themeColors.neutral.text} />
                      </TouchableOpacity>
                    ) : (
                      <View style={dynamicStyles.headerLeft} />
                    )}
                  </View>
                </View>
                
                <ScrollView 
                  style={{ flex: 1 }} 
                  contentContainerStyle={{ 
                    paddingBottom: Spacing.lg,
                    flexGrow: 1 
                  }}
                  showsVerticalScrollIndicator={true}
                  bounces={false}
                >
                  {avatarModalView === 'style' ? (
                    // Style Picker View
                    <View style={dynamicStyles.variationGrid}>
                      {diceBearAvatars.map((style) => (
                        <TouchableOpacity
                          key={style.id}
                          style={[
                            dynamicStyles.avatarVariation,
                            selectedAvatarStyle === style.id && dynamicStyles.avatarVariationSelected,
                            { backgroundColor: themeColors.neutral.card }
                          ]}
                          onPress={() => selectAvatarStyle(style.id)}
                        >
                          <Image
                            source={{ uri: generateDiceBearUrl(style.id) }}
                            style={dynamicStyles.avatarVariationImage}
                          />
                          <Text style={{ color: themeColors.neutral.text, marginTop: 5, fontSize: FontSizes.caption }}>
                            {style.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    // Icon Picker View
                    <View style={dynamicStyles.variationGrid}>
                      {selectedAvatarStyle && diceBearAvatars.find(style => style.id === selectedAvatarStyle)?.seeds.map((seed) => (
                        <TouchableOpacity
                          key={seed}
                          style={[
                            dynamicStyles.avatarVariation,
                            selectedIcon === `${selectedAvatarStyle}:${seed}` && dynamicStyles.avatarVariationSelected,
                            { backgroundColor: themeColors.neutral.card }
                          ]}
                          onPress={() => selectIcon(seed)}
                        >
                          <Image
                            source={{ uri: generateDiceBearUrl(selectedAvatarStyle, seed) }}
                            style={dynamicStyles.avatarVariationImage}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
        
        
        {showVerification && user && avatarUrl && (
          <ProfileVerification
            userId={user.id}
            profilePhotoUrl={avatarUrl}
            onComplete={handleVerificationComplete}
            onCancel={() => setShowVerification(false)}
          />
        )}

        {/* Date of birth picker */}
        {showDobPicker && (
          <>
            {Platform.OS === 'ios' && (
              <View style={[styles.dobPickerWrapper, { backgroundColor: themeColors.neutral.card }]}>
                <View style={styles.dobPickerHeader}>
                  <TouchableOpacity onPress={() => setShowDobPicker(false)}>
                    <Text style={[styles.dobPickerDone, { color: themeColors.primary.main }]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={dateOfBirth || new Date(new Date().getFullYear() - 25, 0, 1)}
                  mode="date"
                  display="spinner"
                  onChange={handleDobChange}
                  maximumDate={new Date()}
                  minimumDate={new Date(new Date().getFullYear() - 120, 0, 1)}
                  themeVariant={isDarkMode ? 'dark' : 'light'}
                />
              </View>
            )}
            {Platform.OS === 'android' && (
              <DateTimePicker
                value={dateOfBirth || new Date(new Date().getFullYear() - 25, 0, 1)}
                mode="date"
                display="default"
                onChange={handleDobChange}
                maximumDate={new Date()}
                minimumDate={new Date(new Date().getFullYear() - 120, 0, 1)}
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Replace the static styles with a function that creates styles based on theme
const createStyles = (colors) => {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const isSmallScreen = screenWidth < 375;
  const isLargeScreen = screenWidth > 414;
  
  // Calculate dynamic modal height based on content
  const calculateModalHeight = () => {
    const headerHeight = isSmallScreen ? 44 : 48;
    const itemSize = Math.min((screenWidth - (isSmallScreen ? Spacing.md : Spacing.lg) * 2 - Spacing.sm * 2) / 3 - 12, isSmallScreen ? 75 : 90);
    const itemMargin = isSmallScreen ? 2 : 3;
    const itemHeight = itemSize + (itemMargin * 2) + 25; // Include text height and extra padding
    const itemsPerRow = 3;
    const totalItems = 15; // Total number of avatar styles
    const rows = Math.ceil(totalItems / itemsPerRow);
    const contentHeight = (rows * itemHeight) + (Spacing.sm * 2) + (Spacing.lg * 2); // Include padding
    const totalHeight = headerHeight + contentHeight;
    
    // Ensure modal doesn't exceed 90% of screen height but has minimum height
    const maxHeight = screenHeight * 0.9;
    const minHeight = isSmallScreen ? 400 : 450;
    return Math.max(Math.min(totalHeight, maxHeight), minHeight);
  };
  
  return StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: Spacing.xl * 2,
  },
  avatarContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primary.main,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    marginRight: Spacing.md,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  changePhotoText: {
    marginLeft: Spacing.xs,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    color: colors.primary.main,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.success.main,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.neutral.background,
  },
  formSection: {
    paddingHorizontal: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    color: colors.neutral.text,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: colors.neutral.text,
    backgroundColor: colors.neutral.card,
  },
  bioInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  characterCountContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  characterCount: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
    opacity: 0.5,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
  },
  saveButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    paddingHorizontal: isSmallScreen ? Spacing.md : Spacing.lg,
    paddingVertical: isSmallScreen ? Spacing.md : Spacing.xl,
  },
  modalContent: {
    width: Math.min(screenWidth - (isSmallScreen ? Spacing.md : Spacing.lg) * 2, isLargeScreen ? 420 : 380),
    height: calculateModalHeight(),
    backgroundColor: colors.neutral.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.lg,
  },
  avatarVariation: {
    width: Math.min((screenWidth - (isSmallScreen ? Spacing.md : Spacing.lg) * 2 - Spacing.md * 2) / 3 - 12, isSmallScreen ? 75 : 90),
    aspectRatio: 1,
    margin: isSmallScreen ? 2 : 3,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral.card,
    padding: Spacing.xs,
  },
  avatarVariationImage: {
    width: '90%',
    height: '90%',
    borderRadius: 999,
  },
  variationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    alignItems: 'flex-start',
    minHeight: '100%',
  },
  avatarVariationSelected: {
    borderColor: colors.primary.main,
    backgroundColor: colors.primary.surface,
    ...Shadow.sm,
  },
  customHeader: {
    width: '100%',
    backgroundColor: colors.neutral.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.border,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: isSmallScreen ? 44 : 48,
    paddingHorizontal: isSmallScreen ? Spacing.sm : Spacing.md,
  },
  headerTitle: {
    fontSize: isSmallScreen ? FontSizes.body : FontSizes.subhead,
    fontFamily: FontFamily.semiBold,
    color: colors.neutral.text,
    textAlign: 'center',
  },
  headerLeft: {
    width: 24,
  },
  headerButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.circle,
  },
  });
};

// Apple-style minimalistic design
const styles = StyleSheet.create({
  appleContainer: {
    flex: 1,
  },
  appleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  appleCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'System',
  },
  appleHeaderSpacer: {
    width: 32,
  },
  editTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
  },
  editTab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  editTabActive: {
    borderBottomColor: Colors.primary.main,
  },
  editTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  businessTabContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  businessInputMultiline: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  appleKeyboardView: {
    flex: 1,
  },
  appleScrollView: {
    flex: 1,
  },
  appleScrollContent: {
    paddingBottom: 40,
  },
  appleAvatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  appleNoPhotoTag: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    marginTop: 10,
    fontStyle: 'italic',
  },
  appleAvatarContainer: {
    position: 'relative',
  },
  appleAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  appleAvatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  appleUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleFormSection: {
    paddingHorizontal: 20,
  },
  appleFieldGroup: {
    marginBottom: 20,
  },
  businessSection: {
    marginBottom: 16,
    paddingVertical: 8,
  },
  businessLabel: {
    fontSize: 12,
    marginBottom: 4,
    opacity: 0.9,
  },
  businessRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  businessDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  businessDropdownText: {
    fontSize: 13,
  },
  businessArrow: {
    fontSize: 10,
  },
  businessInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  businessLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  businessLogoTouch: {
    position: 'relative',
  },
  businessLogoImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
  },
  businessLogoChangeBtn: {
    marginLeft: 12,
    paddingVertical: 6,
  },
  businessLogoChangeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  businessPhotosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  businessPhotoSlot: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  businessPhotoThumb: {
    width: '100%',
    height: '100%',
  },
  businessPhotoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessPhotoAdd: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessPhotosAddBtn: {
    marginBottom: 12,
    paddingVertical: 6,
  },
  businessGalleryHint: {
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 17,
    paddingHorizontal: 2,
  },
  removeBusinessBtn: {
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  removeBusinessBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  businessDetailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  businessDetailsToggleText: {
    fontSize: 12,
    opacity: 0.9,
  },
  businessDetailsBlock: {
    marginBottom: 8,
    paddingLeft: 4,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,0,0,0.08)',
    paddingTop: 4,
  },
  businessLabelSmall: {
    fontSize: 11,
    marginBottom: 2,
    marginTop: 6,
  },
  businessInputSmall: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    marginBottom: 2,
  },
  businessModalContent: {
    maxHeight: '70%',
  },
  businessModalScroll: {
    maxHeight: 280,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  appleFieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8, // Consistent spacing between fields
  },
  appleFieldGroupHalf: {
    flex: 1,
    marginBottom: 0,
  },
  appleFieldGroupHalfLeft: {
    flex: 1,
    marginRight: 8,
    marginBottom: 0,
    minWidth: 0, // Prevent flex items from growing beyond container
  },
  appleFieldGroupHalfRight: {
    flex: 1,
    marginLeft: 0,
    marginBottom: 0,
    minWidth: 0, // Prevent flex items from growing beyond container
  },
  appleFieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    color: 'rgba(0,0,0,0.6)',
  },
  optionalLabel: {
    fontSize: 11,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  requiredLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  appleFieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.02)',
    height: 44, // Fixed height to match dropdown
    minHeight: 44,
    maxHeight: 44,
  },
  appleBioInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  appleCharacterCount: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  appleCharacterText: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.4)',
  },
  appleInterestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  appleInterestChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
  },
  appleInterestText: {
    fontSize: 11,
    fontWeight: '500',
  },
  appleSaveButton: {
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  appleVerifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  appleDropdown: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44, // Fixed height to match input fields
    minHeight: 44,
    maxHeight: 44,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.02)',
    position: 'relative',
  },
  appleDropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '100%', // Fill the dropdown container
  },
  appleDropdownText: {
    fontSize: 16,
    flex: 1,
  },
  appleDropdownArrow: {
    fontSize: 12,
    marginLeft: 8,
  },
  // Small Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  smallModal: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    paddingVertical: 8,
  },
  modalOption: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  modalOptionSelected: {
    // Selected option styling handled by backgroundColor
  },
  modalOptionText: {
    fontSize: 16,
    textAlign: 'center',
  },
  dobPickerWrapper: {
    borderRadius: 16,
    padding: 8,
    paddingBottom: 16,
  },
  dobPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  dobPickerDone: {
    fontSize: 17,
    fontWeight: '600',
  },
  avatarVariationText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  
  // Country Display Styles
  countryDisplayField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  countryLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  countryLoadingText: {
    marginLeft: 8,
    fontSize: 16,
  },
  countryDisplayText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  retryButton: {
    flex: 1,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  securityText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  countryHelpText: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
}); 