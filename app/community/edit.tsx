import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar,
  Dimensions
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, GlobalStyles } from '../../constants/Theme';
import useAuth from '../../hooks/useAuth';
import useProfile from '../../hooks/useProfile';
import EnhancedAvatar from '../../components/EnhancedAvatar';
import { updatePost, fetchPostById } from '../../utils/communityUtils';
import { log, warn, error } from '../../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function EditPostScreen() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const { profile, loading: profileLoading } = useProfile(user?.id);
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  
  // Extract params
  const postId = params.id as string;
  const initialContent = params.content as string || '';
  
  // State
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(false);
  const [loadingPost, setLoadingPost] = useState(true);
  
  // Cached profile data
  const [cachedProfile, setCachedProfile] = useState<{
    avatar_url?: string;
    full_name?: string;
    username?: string;
    email?: string;
  } | null>(null);
  
  // Cache keys
  const PROFILE_CACHE_KEY = `profile_cache_${user?.id}`;

  // Cache user profile
  const cacheProfile = useCallback(async (profileData: any) => {
    if (!user?.id || !profileData) return;
    
    try {
      const cacheData = {
        avatar_url: profileData.avatar_url,
        full_name: profileData.full_name,
        username: profileData.username,
        email: profileData.email || user?.email,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cacheData));
      setCachedProfile(cacheData);
      log('[EditPost] Profile cached successfully');
    } catch (error) {
      error('[EditPost] Error caching profile:', error);
    }
  }, [user?.id, user?.email, PROFILE_CACHE_KEY]);

  // Load cached profile
  const loadCachedProfile = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const cachedStr = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        // Use cache if less than 1 hour old
        if (Date.now() - cached.timestamp < 3600000) {
          setCachedProfile(cached);
          log('[EditPost] Loaded cached profile');
          return true;
        }
      }
    } catch (error) {
      error('[EditPost] Error loading cached profile:', error);
    }
    return false;
  }, [user?.id, PROFILE_CACHE_KEY]);

  // Load cached profile immediately on mount
  useEffect(() => {
    if (user?.id) {
      loadCachedProfile();
    }
  }, [user?.id, loadCachedProfile]);

  // Cache profile when it loads
  useEffect(() => {
    if (profile && !profileLoading) {
      cacheProfile(profile);
    }
  }, [profile, profileLoading, cacheProfile]);

  // Use cached profile or fallback to loading profile
  const displayProfile = cachedProfile || profile;
  const displayName = displayProfile?.full_name || displayProfile?.username || user?.email?.split('@')[0] || 'User';
  
  // Load post content when component mounts or postId changes
  useEffect(() => {
    const loadPostContent = async () => {
      if (!postId) {
        setLoadingPost(false);
        return;
      }

      // If content was passed via params, use it
      if (initialContent) {
        setContent(initialContent);
        setLoadingPost(false);
        return;
      }

      // Otherwise, fetch the post from database
      try {
        setLoadingPost(true);
        const post = await fetchPostById(postId);
        if (post) {
          setContent(post.content || '');
        } else {
          Alert.alert('Error', 'Post not found. Please try again.');
          router.back();
        }
      } catch (error) {
        error('Error loading post:', error);
        Alert.alert('Error', 'Failed to load post. Please try again.');
        router.back();
      } finally {
        setLoadingPost(false);
      }
    };

    loadPostContent();
  }, [postId, initialContent]);
  
  // Redirect if not logged in, but only after auth has loaded
  useEffect(() => {
    if (isLoaded && !user) {
      router.push('/auth/signin');
    }
  }, [isLoaded, user]);
  
  // Submit the post update
  const handleSubmit = async () => {
    // Validate input
    if (!content.trim()) {
      Alert.alert('Error', 'Please enter some content for your post.');
      return;
    }
    
    // Content validation removed
    
    // CRITICAL: Check if user is authenticated
    if (!user || !user.id) {
      Alert.alert('Authentication Error', 'Please log in to edit your post.');
      return;
    }
    
    try {
      setLoading(true);
      
      // Update the post
      const result = await updatePost(
        postId,
        user.id,
        content.trim(),
        undefined, // No location
        undefined // Keep existing image_urls
      );
      
      if (result) {
        // Success message and navigate back
        Alert.alert(
          'Success',
          'Your post has been updated!',
          [
            {
              text: 'OK',
              onPress: () => router.back()
            }
          ]
        );
      } else {
        throw new Error('Failed to update post');
      }
    } catch (error: any) {
      error('Error updating post:', error);
      const errorMessage = error?.message || 'Failed to update post. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  // Show loading state while auth is being checked or post is loading
  if (!isLoaded || loadingPost) {
    return (
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.neutral.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary.main} />
          <Text style={styles.loadingText}>Loading post...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.neutral.background} />
        
        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <ArrowLeft size={24} color={Colors.neutral.text} />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>Edit Post</Text>
          
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={handleSubmit}
            disabled={loading}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.primary.main} />
            ) : (
              <CheckCircle size={24} color={Colors.primary.main} />
            )}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* User profile info */}
            <View style={styles.userInfo}>
              <EnhancedAvatar
                avatarUrl={displayProfile?.avatar_url}
                userId={user?.id}
                fullName={displayProfile?.full_name}
                username={displayProfile?.username}
                email={displayProfile?.email || user?.email}
                size={52}
                showBorder={true}
                showOnlineIndicator={true}
                isOnline={true}
              />
              <View style={styles.userTextContainer}>
                <Text style={styles.userName}>
                  {displayName}
                </Text>
                <Text style={styles.userSubtext}>Editing post</Text>
              </View>
            </View>
            
            {/* Post content input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.contentInput}
                placeholder="What's on your mind?"
                placeholderTextColor={Colors.neutral.subtext}
                multiline
                value={content}
                onChangeText={setContent}
                maxLength={500}
                textAlignVertical="top"
              />
              
              {/* Character count */}
              <View style={styles.characterCountContainer}>
                <Text style={styles.characterCount}>
                  {(content?.length || 0)} / 500
                </Text>
              </View>
            </View>
            
            {/* Save button */}
            <TouchableOpacity
              style={[
                styles.saveButton,
                loading && styles.saveButtonDisabled
              ]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.neutral.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral.text,
    fontFamily: FontFamily.medium,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Math.max(16, SCREEN_WIDTH * 0.04),
    paddingTop: 20,
    paddingBottom: 40,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  userTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontFamily: FontFamily.semibold,
    fontSize: Math.min(18, SCREEN_WIDTH * 0.045),
    color: Colors.neutral.text,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  userSubtext: {
    fontFamily: FontFamily.regular,
    fontSize: Math.min(14, SCREEN_WIDTH * 0.035),
    color: Colors.neutral.subtext,
    opacity: 0.8,
  },
  inputContainer: {
    marginBottom: 20,
  },
  contentInput: {
    fontFamily: FontFamily.regular,
    fontSize: Math.min(16, SCREEN_WIDTH * 0.04),
    color: Colors.neutral.text,
    backgroundColor: Colors.neutral.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.neutral.border,
    minHeight: Math.max(120, SCREEN_HEIGHT * 0.15),
    maxHeight: Math.max(200, SCREEN_HEIGHT * 0.25),
    textAlignVertical: 'top',
  },
  characterCountContainer: {
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  characterCount: {
    fontFamily: FontFamily.regular,
    fontSize: Math.min(12, SCREEN_WIDTH * 0.03),
    color: Colors.neutral.subtext,
  },
  saveButton: {
    backgroundColor: Colors.primary.main,
    paddingVertical: Math.max(14, SCREEN_HEIGHT * 0.018),
    paddingHorizontal: 32,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginHorizontal: 16,
    elevation: 3,
    shadowColor: Colors.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.primary.light,
    opacity: 0.6,
  },
  saveButtonText: {
    color: 'white',
    fontFamily: FontFamily.medium,
    fontSize: Math.min(16, SCREEN_WIDTH * 0.04),
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontFamily: FontFamily.regular,
    fontSize: Math.min(16, SCREEN_WIDTH * 0.04),
    color: Colors.neutral.subtext,
    marginTop: 16,
    textAlign: 'center',
  },
}); 