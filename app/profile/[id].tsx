import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Easing,
  ToastAndroid,
  Platform,
  Alert,
  FlatList,
  Dimensions,
  StatusBar,
  Pressable,
  DeviceEventEmitter,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ArrowLeft, MapPin, Heart, X, Grid3X3, Play, FileText, Calendar, Users, Star, Send, UserPlus, Ban, UserX, Flag, Eye } from 'lucide-react-native';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Shadow, Spacing } from '../../constants/Theme';
import { getProfileById } from '../../utils/profilesManager';
import useAuth from '../../hooks/useAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import InterestTag from '../../components/InterestTag';
import VipBadge from '../../components/VipBadge';
import { blockUser, unblockUser, hasUserBlocked, isUserBlocked } from '../../utils/blockUser';
import { useTheme } from '../../contexts/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import EnhancedAvatar from '../../components/EnhancedAvatar';
import VipPlate from '../../components/VipPlate';
import VerifiedBadge from '../../components/VerifiedBadge';
import { getUserPosts, Post } from '../../utils/communityUtils';
import { convertPostsToVideoFeed, mixVideoFeed } from '../../utils/videoPostUtils';
import { VideoPost } from '../../components/VideoFeed';
import { getUserProfile } from '../../utils/chat';
// Heavy visuals removed for speed (minimal UI)
import { getSafeDisplayName, sanitizeUsernameForDisplay } from '../../utils/contentFilter';
import { Image as ExpoImage } from 'expo-image';
import FollowButton from '../../components/FollowButton';
import FollowStatsCard from '../../components/FollowStatsCard';
import FollowersModal from '../../components/FollowersModal';
import LikesPrivacyModal from '../../components/LikesPrivacyModal';
import PremiumSendButton from '../../components/PremiumSendButton';
import ReportUserModal from '../../components/ReportUserModal';
import { isFollowing } from '../../utils/followersServiceFixed';
import Toast from 'react-native-toast-message';
import { getUserBadges } from '../../utils/badgeService';
import { UserBadgeData } from '../../components/UserBadge';
import UserBadgesList from '../../components/UserBadgesList';
import { trackProfileViewWithDuration } from '../../utils/profileViewTracker';
import { log, warn, error } from '../../utils/productionLogger';
import { formatViewCountLabel } from '../../utils/formatters';
import { OFFICIAL_ACCOUNT_ID } from '../../constants/ContactEmails';
import { isVerifiedEntity } from '../../utils/verification';


  // Simple profile cache to avoid re-fetching
const profileCache = new Map();

const isProfileVerified = isVerifiedEntity;

export default function ProfileDetailScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const fromDiscover = from === 'discover';
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  
  // Refresh callback for parent component
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Handle follow changes
  const handleFollowChange = (isFollowing: boolean) => {
    setIsFollowingProfile(isFollowing);
    setRefreshTrigger(prev => prev + 1);
  };

  // Check follow status
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (!user || !profile || user.id === profile.id) return;
      
      try {
        const [youFollowThem, theyFollowYou] = await Promise.all([
          isFollowing(profile.id, user.id),
          isFollowing(user.id, profile.id),
        ]);
        setIsFollowingProfile(youFollowThem);
        setFollowsYou(theyFollowYou);
      } catch (error) {
        error('[Profile] Error checking follow status:', error);
      }
    };

    if (profile && user) {
      checkFollowStatus();
    }
  }, [profile?.id, user?.id]);
  
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileVisible, setProfileVisible] = useState(true);
  const [profileVisibilityLoaded, setProfileVisibilityLoaded] = useState(false);
  const [isFollowingProfile, setIsFollowingProfile] = useState(false);
  const [followsYou, setFollowsYou] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasBlocked, setHasBlocked] = useState(false);
  const [blockStatusLoaded, setBlockStatusLoaded] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Track last refresh time to prevent excessive refreshes and double-load on open
  const lastRefreshRef = useRef<number>(0);
  const lastContentLoadRef = useRef<number>(0);
  const REFRESH_COOLDOWN = 10000; // 10 seconds minimum between refreshes
  const CONTENT_LOAD_COOLDOWN = 5000; // 5 seconds before refetching posts on focus
  
  // User content state
  const [userPosts, setUserPosts] = useState<Post[]>([]); // Media posts only (photos/videos)
  const [userTextPosts, setUserTextPosts] = useState<Post[]>([]); // Text-only posts
  const [userVideos, setUserVideos] = useState<VideoPost[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'videos'>('posts');
  const [contentLoading, setContentLoading] = useState(false);
  
  // Scroll tracking for dots
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Followers modal state
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [followersModalTab, setFollowersModalTab] = useState<'followers' | 'following'>('followers');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [userBadges, setUserBadges] = useState<UserBadgeData[]>([]);
  
  // Define fetchProfile function outside useEffect so it can be used in useFocusEffect
  const fetchProfile = React.useCallback(async (silent: boolean = false) => {
    if (!id) return;
    
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      if (!silent) {
        setLoading(true);
      }
      log(`[Profile] Loading profile for ID: ${id}`);
      
      if (!id) {
        error("[Profile] Profile ID is missing");
        setError("Profile ID is missing");
        setLoading(false);
        return;
      }
      
      // Create a placeholder profile immediately for better UX
      const placeholderProfile = {
        id: id as string,
        username: `user_${(id as string).substring(0, 8)}`,
        full_name: 'Loading...',
        bio: '',
        avatar_url: null,
        interests: [],
        location: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Set placeholder immediately to show something to the user
      setProfile(placeholderProfile);
      
      // Much shorter timeout for better UX - 3 seconds
      timeoutId = setTimeout(() => {
        log(`[Profile] Loading taking longer than expected for profile: ${id}, continuing with placeholder...`);
        // Don't set error, just keep the placeholder and continue loading in background
        setLoading(false);
      }, 3000); // 3 second timeout
      
      // Check cache first - use longer cache duration (5 minutes)
      const cacheKey = `profile_${id}`;
      const cachedData = profileCache.get(cacheKey);
      const now = Date.now();
      const CACHE_DURATION = 48 * 60 * 60 * 1000; // 48 hours cache - profiles don't change frequently
      
      let profileData;
      if (cachedData && (now - cachedData.timestamp < CACHE_DURATION)) {
        log(`[Profile] Using cached profile data for: ${id} (age: ${Math.round((now - cachedData.timestamp) / 1000)}s)`);
        profileData = cachedData.profile;
        
        // Load badges in background if we have cached profile
        if (profileData?.id) {
          getUserBadges(profileData.id).then(badges => {
            setUserBadges(badges);
          }).catch(error => {
            error('[Profile] Error loading badges:', error);
          });
        }
      } else {
        log(`[Profile] Cache expired or missing, fetching fresh profile data for: ${id}`);
        profileData = await getProfileById(id as string);
        log(`[Profile] Profile data received:`, profileData);
        
        // Load user badges
        if (profileData?.id) {
          try {
            const badges = await getUserBadges(profileData.id);
            setUserBadges(badges);
          } catch (error) {
            error('[Profile] Error loading badges:', error);
          }
        }
        
        // Cache the result
        if (profileData) {
          profileCache.set(cacheKey, {
            profile: profileData,
            timestamp: now
          });
        }
      }
      
      // If main method fails, try fallback
      if (!profileData) {
        log(`[Profile] Main method failed, trying fallback method...`);
        const fallbackProfile = await getUserProfile(id as string);
        if (fallbackProfile) {
          profileData = fallbackProfile;
          log(`[Profile] Fallback profile data received:`, profileData);
        }
      }
      
      // Clear timeout since we got a response
      if (timeoutId) clearTimeout(timeoutId);
      
      if (profileData) {
        // Check if user is suspended
        if (profileData.is_suspended === true) {
          log(`[Profile] User ${id} is suspended, hiding profile`);
          setError('This profile is not available.');
          setLoading(false);
          if (timeoutId) clearTimeout(timeoutId);
          return;
        }
        
        log(`[Profile] Processing profile data for: ${profileData.username || profileData.full_name}`);
        
        // Ensure interests is processed correctly
        let interests = profileData.interests || [];
        
        // If it's a string, try to parse it as JSON
        if (typeof interests === 'string') {
          try {
            interests = JSON.parse(interests);
          } catch (e) {
            interests = interests.split(',').map(item => item.trim());
          }
        }
        
        // Set the real profile with processed interests
        setProfile({
          ...profileData,
          interests: Array.isArray(interests) ? interests : []
        });
        log(`[Profile] Profile state set successfully`);
        
        // Start non-blocking operations in background after a small delay
        setTimeout(() => {
          log(`[Profile] Starting background operations...`);
          
          // Check profile visibility (non-blocking)
          checkProfileVisibility().catch(err => {
            error(`[Profile] Profile visibility check failed:`, err);
          });
          
          // Check block status (non-blocking)
          checkBlockStatus().catch(err => {
            error(`[Profile] Block status check failed:`, err);
          });
          
          // Load user content (non-blocking)
          loadUserContent().catch(err => {
            error(`[Profile] Content loading failed:`, err);
          });
        }, 100); // Small delay to ensure profile is shown first
        
        log(`[Profile] Profile loading completed successfully`);
        setError(null);
      } else {
        log(`[Profile] No profile data returned, keeping placeholder profile for user: ${id}`);
        // Keep the placeholder profile instead of showing error
        // This is better UX than showing "Profile not found"
      }
    } catch (err) {
      error("Error fetching profile:", err);
      log(`[Profile] Error occurred, keeping placeholder profile for user: ${id}`);
      // Keep placeholder profile instead of showing error
      // Clear timeout in case of error
      if (timeoutId) clearTimeout(timeoutId);
    } finally {
      setLoading(false);
    }
  }, [id, checkProfileVisibility, checkBlockStatus, loadUserContent]);
  
  // Reset scroll position when posts change
  useEffect(() => {
    setCurrentPostIndex(0);
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ x: 0, animated: false });
    }
  }, [userPosts.length]);
  
  // Animation values for the blob
  const blob1Anim = useRef(new Animated.Value(0)).current;
  const blob2Anim = useRef(new Animated.Value(0)).current;

  // Generate DiceBear avatar URL
  const generateDiceBearUrl = (style: string, seed?: string) => {
    const userSeed = seed || user?.id || 'default';
    return `https://api.dicebear.com/9.x/${style}/png?seed=${userSeed}&size=120`;
  };

  // Helper function to get the correct avatar URL
  const getAvatarUrl = (avatarUrl?: string | null) => {
    if (!avatarUrl) return null;
    
    // Handle DiceBear avatars
    if (avatarUrl.startsWith('dicebear:')) {
      const avatarData = avatarUrl.replace('dicebear:', '');
      if (avatarData.includes(':')) {
        const [style, seed] = avatarData.split(':');
        return generateDiceBearUrl(style, seed);
      } else {
        // Handle old format (style only) - use userId as seed
        return generateDiceBearUrl(avatarData, user?.id || 'default');
      }
    }
    
    // Return regular URL as-is
    return avatarUrl;
  };
  
  // Start blob animation
  useEffect(() => {
    // Blob 1 animation - rotation and scale
    Animated.loop(
      Animated.timing(blob1Anim, {
        toValue: 1,
        duration: 10000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();
    
    // Blob 2 animation - counter rotation
    Animated.loop(
      Animated.timing(blob2Anim, {
        toValue: 1,
        duration: 15000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();
  }, []);
  
  // Post-pivot: no direct-messaging state on profiles

  // Function to check profile visibility
  const checkProfileVisibility = async () => {
    try {
      if (!profile) {
        // Profile not loaded yet - default to visible but mark as loaded
        // This prevents the message button from being permanently hidden
        log('[Profile] Profile not loaded yet, defaulting to visible');
        setProfileVisible(true);
        setProfileVisibilityLoaded(true);
        return;
      }
      
      log(`[Profile] Checking profile visibility for ${profile.id}`);
      
      // Privacy: we store "hide from discover" as hide_from_discover (true = hidden)
      // Some older code referenced profile_visible; prefer hide_from_discover when present.
      const isVisible =
        typeof profile.hide_from_discover === 'boolean'
          ? !profile.hide_from_discover
          : profile.profile_visible !== false; // fallback for legacy data
      setProfileVisible(isVisible);
      setProfileVisibilityLoaded(true);
      
      log(`[Profile] Profile visibility for ${profile.id}: ${isVisible ? 'VISIBLE' : 'HIDDEN'}`);
    } catch (error) {
      error('[Profile] Error checking profile visibility:', error);
      // Default to visible on error
      setProfileVisible(true);
      setProfileVisibilityLoaded(true);
    }
  };

  // Function to check block status
  const checkBlockStatus = async () => {
    try {
      if (!user?.id || !profile?.id || user.id === profile.id) {
        setBlockStatusLoaded(true);
        return;
      }

      const blocked = await isUserBlocked(user.id, profile.id);
      const hasBlockedUser = await hasUserBlocked(user.id, profile.id);
      
      setIsBlocked(blocked);
      setHasBlocked(hasBlockedUser);
      setBlockStatusLoaded(true);
      
      log(`[Profile] Block status - isBlocked: ${blocked}, hasBlocked: ${hasBlockedUser}`);
    } catch (error) {
      error('[Profile] Error checking block status:', error);
      setBlockStatusLoaded(true);
    }
  };

  // Function to handle block/unblock
  const handleBlock = async () => {
    if (!user?.id || !profile?.id) return;

    const username = profile.username || profile.full_name || 'this user';

    if (hasBlocked) {
      // Unblock
      Alert.alert(
        'Unblock User',
        `Are you sure you want to unblock ${username}? They'll be able to see your profile, posts, and message you again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: async () => {
              log(`[Profile] Unblocking user ${profile.id}`);
              const { success, error } = await unblockUser(user.id, profile.id);
              if (success) {
                log(`[Profile] Successfully unblocked user ${profile.id}`);
                
                // Update state immediately for UI responsiveness
                setHasBlocked(false);
                setIsBlocked(false);
                
                // Clear posts cache so filtering updates immediately
                try {
                  const { clearPostsCache } = await import('../../utils/communityUtils');
                  clearPostsCache();
                  log(`[Profile] Cleared posts cache after unblocking`);
                } catch (error) {
                  error(`[Profile] Error clearing cache:`, error);
                }
                
                // Show success message
                if (Platform.OS === 'android') {
                  ToastAndroid.show(`${username} has been unblocked`, ToastAndroid.SHORT);
                }
                
                // Wait a moment for DB to settle, then refresh
                setTimeout(async () => {
                  await checkBlockStatus();
                  log(`[Profile] Block status refreshed after unblocking`);
                }, 500);
              } else {
                error(`[Profile] Failed to unblock user:`, error);
                Alert.alert('Error', error || 'Failed to unblock user');
              }
            },
          },
        ]
      );
    } else {
      // Block
      Alert.alert(
        'Block User',
        `Are you sure you want to block ${username}?\n\nThey won't be able to:\n• See your profile or posts\n• Send you messages or calls\n• Find you in search or discover\n\nYou'll both be unfollowed automatically.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              log(`[Profile] Blocking user ${profile.id}`);
              log(`[Profile] Current user ID: ${user.id}, Profile ID: ${profile.id}`);
              
              const { success, error } = await blockUser(user.id, profile.id);
              
              log(`[Profile] Block result - success: ${success}, error: ${error}`);
              
              if (success) {
                log(`[Profile] Successfully blocked user ${profile.id}`);
                
                // Update state immediately for UI responsiveness
                setHasBlocked(true);
                setIsBlocked(true);
                
                // Clear posts cache so filtering takes effect immediately
                try {
                  const { clearPostsCache } = await import('../../utils/communityUtils');
                  clearPostsCache();
                  log(`[Profile] Cleared posts cache after blocking`);
                } catch (error) {
                  error(`[Profile] Error clearing cache:`, error);
                }
                
                // Show success message
                if (Platform.OS === 'android') {
                  ToastAndroid.show(`${username} has been blocked`, ToastAndroid.SHORT);
                }
                
                // Wait a moment for DB to settle, then refresh
                setTimeout(async () => {
                  await checkBlockStatus();
                  log(`[Profile] Block status refreshed after blocking`);
                }, 500);
              } else {
                error(`[Profile] Failed to block user:`, error);
                const errorMessage = error || 'Failed to block user. Please check if the database migration has been run.';
                Alert.alert('Error Blocking User', errorMessage, [
                  { text: 'OK' },
                  { 
                    text: 'Check Logs', 
                    onPress: () => log('[Profile] Full error details logged above')
                  }
                ]);
              }
            },
          },
        ]
      );
    }
  };

  // Function to load user content (forceRefresh = bypass cache so new uploads appear)
  const loadUserContent = async (forceRefresh = false) => {
    try {
      if (!id) return;

      lastContentLoadRef.current = Date.now();
      setContentLoading(true);
      log(`[Profile] Loading content for user: ${id}${forceRefresh ? ' (bypassing cache)' : ''}`);
      
      // Fetch user's posts (useCache=false when forceRefresh so new video appears)
      const posts = await getUserPosts(id as string, !forceRefresh);
      log(`[Profile] Loaded ${posts.length} posts for user ${id}`);
      
      // Sort all posts by creation date (newest first), then separate for different displays
      const sortedPosts = posts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // For horizontal scroll cards: include both regular posts and video posts
      const allPostsForCards = sortedPosts.map(post => {
        let thumbnail = '';
        
        if (post.video_url) {
          // Check if there's already a thumbnail stored in the database
          if (post.thumbnail_url) {
            thumbnail = post.thumbnail_url;
          } else if (post.video_url.includes('stream.mux.com')) {
            // For video posts, generate thumbnail from Mux URL
            try {
              // Extract playback ID from Mux URL
              const playbackId = post.video_url.match(/stream\.mux\.com\/([^\/]+)\.m3u8/)?.[1];
              if (playbackId) {
                thumbnail = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0&width=400&height=600&fit_mode=smartcrop`;
              }
            } catch (error) {
              log('Error generating Mux thumbnail:', error);
            }
          }
          
          // Fallback to generic video placeholder if thumbnail generation fails
          if (!thumbnail) {
            thumbnail = 'https://via.placeholder.com/400x600/2563EB/FFFFFF?text=📹';
          }
        } else {
          // For regular posts, use first image
          thumbnail = post.image_urls && post.image_urls[0] ? post.image_urls[0] : '';
        }
        
        // Debug logging for thumbnail generation
        if (__DEV__ && post.video_url) {
          log(`[ProfileThumbnail] Video post ${post.id}: video_url=${post.video_url}, thumbnail=${thumbnail}`);
        }
        
        return {
          ...post,
          isVideo: !!post.video_url,
          thumbnail
        };
      });
      
      // Separate media posts (with images or videos) from text-only posts
      const mediaPosts = allPostsForCards.filter(post => 
        post.video_url || (post.image_urls && post.image_urls.length > 0)
      );
      const textOnlyPosts = allPostsForCards.filter(post => 
        !post.video_url && (!post.image_urls || post.image_urls.length === 0)
      );
      const videoPosts = mixVideoFeed(convertPostsToVideoFeed(sortedPosts.filter(post => post.video_url)));
      
      log(`[Profile] User has ${mediaPosts.length} media posts, ${textOnlyPosts.length} text posts, ${videoPosts.length} videos`);
      
      setUserPosts(mediaPosts);
      setUserTextPosts(textOnlyPosts);
      setUserVideos(videoPosts);
      
    } catch (error) {
      error('[Profile] Error loading user content:', error);
    } finally {
      setContentLoading(false);
    }
  };
  
  // When a new post is created (e.g. video upload), refresh profile so it appears without restart
  const loadUserContentRef = useRef(loadUserContent);
  loadUserContentRef.current = loadUserContent;
  useEffect(() => {
    if (!user?.id || id !== user.id) return;
    const sub = DeviceEventEmitter.addListener('refreshCommunityFeed', () => {
      log('[Profile] refreshCommunityFeed – reloading own profile content');
      loadUserContentRef.current(true).catch((err: unknown) => warn('[Profile] Refresh content failed:', err));
    });
    return () => sub.remove();
  }, [id, user?.id]);

  // Refresh profile visibility when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      // When viewing own profile, reload content only if cooldown passed (avoids double load / sluggishness)
      if (user?.id && id === user.id) {
        const sinceContentLoad = Date.now() - lastContentLoadRef.current;
        if (sinceContentLoad > CONTENT_LOAD_COOLDOWN) {
          lastContentLoadRef.current = Date.now();
          loadUserContent().catch(err => {
            warn('[Profile] Focus refresh content failed:', err);
          });
        }
      }

      // Only refresh visibility if enough time has passed
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshRef.current;
      
      if (timeSinceLastRefresh > REFRESH_COOLDOWN) {
        log('[Profile] Screen focused, refreshing profile visibility');
        lastRefreshRef.current = now;
        checkProfileVisibility();
      }
      
      return () => {
        // Cleanup if needed
      };
    }, [id, user?.id, profile, checkProfileVisibility, loadUserContent])
  );
  
  // Track profile view start time (and ensure we only send one notification per view)
  const profileViewStartTime = useRef<number | null>(null);
  const profileViewTrackedRef = useRef<boolean>(false);

  // Initial load on mount
  useEffect(() => {
    lastRefreshRef.current = Date.now(); // Prevent 2s delayed refresh from firing right after open (avoids double load/sluggishness)
    fetchProfile(false); // Initial load

    // Track profile view start time (for duration tracking)
    if (user?.id && id && id !== user.id) {
      profileViewStartTime.current = Date.now();
      profileViewTrackedRef.current = false;
    }

    // Cleanup: Track profile view when component unmounts or id changes (only once per view)
    return () => {
      if (profileViewStartTime.current && user?.id && id && id !== user.id && !profileViewTrackedRef.current) {
        profileViewTrackedRef.current = true;
        const viewDuration = (Date.now() - profileViewStartTime.current) / 1000; // Duration in seconds
        trackProfileViewWithDuration(user.id, id as string, viewDuration).catch(error => {
          error('[Profile] Error tracking profile view:', error);
        });
        profileViewStartTime.current = null;
      }
    };
  }, [fetchProfile, user?.id, id]);
  
  // Silent refresh on focus (only if profile already exists)
  // Also track profile view when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      if (profile && id) {
        // Check cooldown before refreshing
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshRef.current;
        
        if (timeSinceLastRefresh > REFRESH_COOLDOWN) {
          lastRefreshRef.current = now;
          // Silent refresh after a delay to avoid conflicts
          const timer = setTimeout(() => {
            fetchProfile(true); // Silent refresh
          }, 2000);
          return () => clearTimeout(timer);
        }
      }
      
      // Track profile view start time when screen is focused
      if (user?.id && id && id !== user.id) {
        profileViewStartTime.current = Date.now();
        profileViewTrackedRef.current = false;
      }
      
      // Cleanup: Track profile view when screen loses focus (only once per view)
      return () => {
        if (profileViewStartTime.current && user?.id && id && id !== user.id && !profileViewTrackedRef.current) {
          profileViewTrackedRef.current = true;
          const viewDuration = (Date.now() - profileViewStartTime.current) / 1000; // Duration in seconds
          trackProfileViewWithDuration(user.id, id as string, viewDuration).catch(error => {
            error('[Profile] Error tracking profile view:', error);
          });
          profileViewStartTime.current = null;
        }
      };
    }, [profile, id, fetchProfile, user?.id])
  );
  
  const handleBack = () => {
    try {
      // If there's history, go back; otherwise, go to profile tab
      // @ts-ignore expo-router provides canGoBack at runtime
      if ((router as any).canGoBack?.()) {
        router.back();
      } else {
        router.replace('/(tabs)/profile');
      }
    } catch {
      router.replace('/(tabs)/profile');
    }
  };
  
  // Post-pivot: no credits/gifts/DM entrypoints from profile screen
  
  // Handle VIP plate tap
  const handleVipTap = () => {
    if (Platform.OS === 'android') {
      ToastAndroid.show('Upgrade to VIP for exclusive features!', ToastAndroid.SHORT);
    } else {
      Alert.alert('VIP Status', 'Upgrade to VIP for exclusive features and priority support!');
    }
  };

  // Handle scroll position for dots - improved calculation
  const handleScroll = (event: any) => {
    const scrollX = event.nativeEvent.contentOffset.x;
    const cardWidth = 152; // 140px width + 12px margin
    const maxScrollX = (userPosts.length - 1) * cardWidth;
    
    let currentIndex;
    
    // Special handling for the last card - if we're very close to the end, force last index
    if (scrollX >= maxScrollX - cardWidth / 3) {
      currentIndex = userPosts.length - 1;
    } else {
      // More accurate calculation with proper rounding
      const rawIndex = scrollX / cardWidth;
      currentIndex = Math.round(rawIndex);
    }
    
    // Ensure index is within bounds and represents actual scroll position
    const clampedIndex = Math.max(0, Math.min(currentIndex, userPosts.length - 1));
    
    // Debug logging
    if (__DEV__) {
      log(`[ProfileScroll] scrollX: ${scrollX}, maxScrollX: ${maxScrollX}, currentIndex: ${currentIndex}, clampedIndex: ${clampedIndex}, userPosts.length: ${userPosts.length}`);
    }
    
    // Only update if the index actually changed to prevent unnecessary re-renders
    if (clampedIndex !== currentPostIndex) {
      setCurrentPostIndex(clampedIndex);
    }
  };

  // Handle dot tap for navigation
  const handleDotPress = (index: number) => {
    if (scrollViewRef.current) {
      const cardWidth = 152; // 140px width + 12px margin
      scrollViewRef.current.scrollTo({
        x: index * cardWidth,
        animated: true
      });
    }
  };
  
  // Blob 1 spin animation
  const spin1 = blob1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });
  
  // Blob 2 spin animation (opposite direction)
  const spin2 = blob2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg']
  });
  
  // Blob scales
  const scale1 = blob1Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.1, 1]
  });
  
  const scale2 = blob2Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1.05, 0.95, 1.05]
  });
  
  // Remove the loading spinner UI since we now show placeholder content immediately
  
  if (error || !profile) {
    return (
      <SafeAreaView style={GlobalStyles.safeArea}>
        <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
          <TouchableOpacity onPress={handleBack} style={[styles.backButton, { backgroundColor: themeColors.neutral.card }]}>
            <ArrowLeft size={24} color={themeColors.neutral.text} />
          </TouchableOpacity>
          
          <View style={styles.errorContainer}>
            <X size={48} color={themeColors.error.main} />
            <Text style={[styles.errorText, { color: themeColors.neutral.text }]}>{error || "Profile not found"}</Text>
            <TouchableOpacity onPress={handleBack} style={[styles.errorButton, { backgroundColor: themeColors.primary.main }]}>
              <Text style={[styles.errorButtonText, { color: themeColors.neutral.background }]}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[GlobalStyles.safeArea, { backgroundColor: themeColors.neutral.background }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <Stack.Screen options={{ 
        headerShown: false,
        title: ''
      }} />
      
      {/* Gen Z Header with Back Button */}
      <View 
        style={[
          styles.genZHeader,
          {
            paddingTop: Platform.OS === 'ios' ? insets.top + 8 : Math.max(insets.top, StatusBar.currentHeight || 0) + 8,
            paddingBottom: 12,
            paddingHorizontal: 20,
          }
        ]}
      >
        <Pressable 
          onPress={handleBack} 
          style={({ pressed }) => [
            styles.iconButton,
            { 
              transform: [{ scale: pressed ? 0.95 : 1 }],
              opacity: pressed ? 0.8 : 1,
            }
          ]}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <View style={styles.iconShadow}>
            <ArrowLeft size={16} color="#ffffff" strokeWidth={2.5} />
          </View>
        </Pressable>
        
        {/* Report Button in Header - Always visible for other users */}
        {user?.id && profile?.id && user.id !== profile.id && (
          <Pressable 
            onPress={() => setShowReportModal(true)} 
            style={({ pressed }) => [
              styles.iconButton,
              { 
                transform: [{ scale: pressed ? 0.92 : 1 }],
                opacity: pressed ? 0.7 : 1,
                marginLeft: 'auto',
              }
            ]}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <View style={styles.iconShadow}>
              <Flag size={22} color="#ffffff" strokeWidth={2.5} />
            </View>
          </Pressable>
        )}
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={[styles.lightContainer, { backgroundColor: themeColors.neutral.background }]}
        showsVerticalScrollIndicator={true}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.appleScrollContent, { paddingBottom: insets.bottom + 140 }]}
        bounces={true}
        scrollEnabled={true}
      >
        {/* Lightweight header section */}
        <View style={styles.lightHeader}>
          {/* Simple avatar - no heavy animations */}
          <View style={styles.lightAvatarContainer}>
            <View style={[styles.simpleAvatarRing, { borderColor: themeColors.primary.main }]}>
              <ExpoImage
                source={{ uri: (profile.account_type === 'business' && profile.business_logo_url) ? profile.business_logo_url : profile.avatar_url }}
                style={styles.simpleAvatar}
                contentFit="cover"
                placeholder={require('../../assets/images/default-avatar.png')}
                transition={150}
              />
            </View>
          </View>
          
          {/* Name and username - clean typography */}
          <View style={styles.lightNameSection}>
            <View style={styles.lightNameRow}>
              <Text style={[styles.lightName, { color: themeColors.neutral.text }]} numberOfLines={1}>
                {getSafeDisplayName(profile.username, (profile.account_type === 'business' && profile.business_name) ? profile.business_name : profile.full_name) || 'Traveler'}
              </Text>
              {isProfileVerified(profile) && (
                <VerifiedBadge size="small" showText={false} style={styles.lightVerifiedBadge} />
              )}
              {userBadges && userBadges.length > 0 && (
                <UserBadgesList badges={userBadges} size="small" />
              )}
            </View>
            
            {profile.username && (
              <Text style={[styles.lightUsername, { color: themeColors.neutral.subtext }]} numberOfLines={1}>
                {profile.account_type === 'business' ? `@${sanitizeUsernameForDisplay(profile.username)}` : `@${sanitizeUsernameForDisplay(profile.username)}`}
              </Text>
            )}
            
            {profile.account_type === 'business' && (
              <View style={[styles.lightBusinessBadge, { backgroundColor: themeColors.primary.main + '15' }]}>
                <Text style={[styles.lightBusinessBadgeText, { color: themeColors.primary.main }]}>Business</Text>
              </View>
            )}
          </View>
        </View>

        {/* Lightweight action row + block/report area */}
        {user?.id !== profile.id && blockStatusLoaded && (
          <View style={styles.lightActionSection}>
            {!isBlocked && (
              <View style={styles.lightActionsRow}>
                <FollowButton
                  userId={profile.id}
                  size="small"
                  variant="primary"
                  style={styles.lightFollowBtn}
                  onFollowChange={handleFollowChange}
                  profileVisible={profileVisible}
                />
                {(profile.id === OFFICIAL_ACCOUNT_ID || (isFollowingProfile && followsYou)) && profileVisible && (
                  <TouchableOpacity
                    onPress={() => router.push(`/chat/${profile.id}`)}
                    style={[styles.lightActionBtn, { backgroundColor: themeColors.primary.main }]}
                    activeOpacity={0.8}
                  >
                    <Send size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Minimal block/report row */}
            <View style={styles.lightUtilityRow}>
              <TouchableOpacity
                onPress={handleBlock}
                style={styles.lightUtilityBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.lightUtilityText, { color: hasBlocked ? themeColors.neutral.subtext : '#FF3B30' }]}>
                  {hasBlocked ? 'unblock' : 'block'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.lightUtilityText, { color: themeColors.neutral.border }]}>•</Text>
              <TouchableOpacity
                onPress={() => setShowReportModal(true)}
                style={styles.lightUtilityBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.lightUtilityText, { color: themeColors.neutral.subtext }]}>report</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Blocked user message - lightweight */}
        {user?.id !== profile.id && blockStatusLoaded && isBlocked && (
          <View style={styles.lightMessageBox}>
            <Ban size={20} color={themeColors.neutral.subtext} />
            <Text style={[styles.lightMessageText, { color: themeColors.neutral.subtext }]}>
              {hasBlocked ? "You blocked this user" : "This user blocked you"}
            </Text>
            {hasBlocked && (
              <TouchableOpacity onPress={handleBlock} style={styles.lightMessageAction}>
                <Text style={[styles.lightMessageActionText, { color: themeColors.primary.main }]}>Unblock</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Hidden profile message - lightweight */}
        {user?.id !== profile.id && profileVisibilityLoaded && !profileVisible && (
          <View style={styles.lightMessageBox}>
            <Users size={20} color={themeColors.neutral.subtext} />
            <Text style={[styles.lightMessageText, { color: themeColors.neutral.subtext }]}>
              Hidden profile
            </Text>
          </View>
        )}

        {/* Post-pivot: no DM state shown on profiles */}

        {/* Ultra-lightweight info strip */}
        <View style={styles.lightInfoStrip}>
          {profile.bio && (
            <Text style={[styles.lightBio, { color: themeColors.neutral.text }]} numberOfLines={2}>
              {profile.bio}
            </Text>
          )}
          
          {/* Single-line stats (no post count) */}
          {profile?.id && (
            <FollowStatsCard
              userId={profile.id}
              variant="row"
              onFollowersPress={
                user?.id === profile.id
                  ? () => {
                      setFollowersModalTab('followers');
                      setShowFollowersModal(true);
                    }
                  : undefined
              }
              onFollowingPress={
                user?.id === profile.id
                  ? () => {
                      setFollowersModalTab('following');
                      setShowFollowersModal(true);
                    }
                  : undefined
              }
              style={styles.lightStatsRow}
            />
          )}
          
          {/* Optional location/business info */}
          {profile.account_type !== 'business' && profile.location && (
            <View style={styles.lightLocationRow}>
              <MapPin size={12} color={themeColors.neutral.subtext} strokeWidth={2} />
              <Text style={[styles.lightLocation, { color: themeColors.neutral.subtext }]}>{profile.location}</Text>
            </View>
          )}
          
          {profile.account_type === 'business' && profile.business_tagline && (
            <Text style={[styles.lightBio, { color: themeColors.neutral.subtext }]} numberOfLines={2}>
              {profile.business_tagline}
            </Text>
          )}
          
          {/* Minimal interests */}
          {profile.account_type !== 'business' && profile.interests && Array.isArray(profile.interests) && profile.interests.length > 0 && (
            <Text style={[styles.lightInterests, { color: themeColors.neutral.subtext }]} numberOfLines={1}>
              {profile.interests.slice(0, 3).join(' • ')}{profile.interests.length > 3 && ` • +${profile.interests.length - 3}`}
            </Text>
          )}
        </View>

        {/* Content wrapper - clearly separated gallery */}
        <View style={[styles.lightContentWrapper, { borderTopColor: themeColors.neutral.border }]}>

          {/* Media Gallery Section */}
          <View style={styles.lightGalleryHeader}>
            <Grid3X3 size={16} color={themeColors.neutral.text} />
            <Text style={[styles.lightGalleryTitle, { color: themeColors.neutral.text }]}>Media</Text>
          </View>

          {/* Empty state when no media posts */}
          {userPosts.length === 0 && (
            <View style={[styles.lightPostsEmptyState, { backgroundColor: themeColors.neutral.background }]}>
              <Grid3X3 size={24} color={themeColors.neutral.subtext} strokeWidth={1.5} />
              <Text style={[styles.lightPostsEmptySubtitle, { color: themeColors.neutral.subtext }]}>
                No photos or videos yet
              </Text>
            </View>
          )}

          {/* Clean 3-column media grid */}
          {userPosts.length > 0 && (
            <FlatList
              data={userPosts}
              numColumns={3}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              nestedScrollEnabled={false}
              style={styles.lightGridList}
              contentContainerStyle={styles.lightGridContainer}
              columnWrapperStyle={styles.lightGridRow}
              renderItem={({ item }) => (
                <Pressable 
                  style={({ pressed }) => [
                    styles.lightGridItem,
                    { opacity: pressed ? 0.8 : 1 }
                  ]}
                  onPress={() => {
                    // Profile media taps should always open post details, never jump tabs.
                    router.push(`/community/post/${item.id}`);
                  }}
                >
                  {item.isVideo || item.video_url ? (
                    <>
                      <ExpoImage 
                        source={{ uri: item.thumbnail || item.image_urls?.[0] }} 
                        style={styles.lightGridImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                      <View style={styles.lightPlayIcon}>
                        <Play size={14} color="#fff" fill="#fff" />
                      </View>
                      {formatViewCountLabel(item.views_count ?? 0, item.created_at) !== '' && (
                        <View style={styles.lightGridViewCountBadge}>
                          <Eye size={10} color="#fff" />
                          <Text style={styles.lightGridViewCountText} numberOfLines={1}>
                            {formatViewCountLabel(item.views_count ?? 0, item.created_at)}
                          </Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <ExpoImage 
                      source={{ uri: item.image_urls?.[0] }} 
                      style={styles.lightGridImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  )}
                </Pressable>
              )}
            />
          )}

          {/* Text Posts Section */}
          {userTextPosts.length > 0 && (
            <>
              <View style={[styles.lightGalleryHeader, { marginTop: Spacing.md }]}>
                <FileText size={16} color={themeColors.neutral.text} />
                <Text style={[styles.lightGalleryTitle, { color: themeColors.neutral.text }]}>Posts</Text>
              </View>
              {userTextPosts.map((post) => (
                <Pressable
                  key={post.id}
                  style={({ pressed }) => [
                    styles.textPostItem,
                    { 
                      backgroundColor: pressed ? themeColors.neutral.border + '30' : 'transparent',
                      borderBottomColor: themeColors.neutral.border 
                    }
                  ]}
                  onPress={() => router.push(`/community/post/${post.id}`)}
                >
                  <Text 
                    style={[styles.textPostContent, { color: themeColors.neutral.text }]} 
                    numberOfLines={3}
                  >
                    {post.content || 'Text post'}
                  </Text>
                  <Text style={[styles.textPostMeta, { color: themeColors.neutral.subtext }]}>
                    {new Date(post.created_at).toLocaleDateString()}
                  </Text>
                </Pressable>
              ))}
            </>
          )}

          <View style={{ height: insets.bottom + 48 }} />

        </View>
      </ScrollView>
      
      {/* Followers Modal - Only accessible to profile owner */}
      {user?.id === profile.id && profile && (
        <FollowersModal
          visible={showFollowersModal}
          onClose={() => setShowFollowersModal(false)}
          userId={profile.id}
          initialTab={followersModalTab}
          username={profile.username}
        />
      )}

      {/* Privacy Modal */}
      <LikesPrivacyModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      {/* Post-pivot: credits/gifts removed */}
      
      {/* Report User Modal */}
      {user?.id && profile?.id && user.id !== profile.id && (
        <ReportUserModal
          visible={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUserId={profile.id}
          reportedUsername={profile.username || profile.full_name || 'Unknown'}
          reporterUserId={user.id}
          reporterUsername={user.user_metadata?.username || user.email || 'Unknown'}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Legacy styles for error states
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  errorButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  errorButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: 16,
  },

  // Gen Z Glass Header with Back Button
  genZHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  iconButton: {
    padding: 0,
  },
  iconShadow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  blockSection: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  blockButtonMinimal: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  blockButtonTextMinimal: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  reportButtonMinimal: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    flexDirection: 'row',
  },
  reportButtonTextMinimal: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },

  // Main Container - Responsive (removed paddingTop since button is now inside banner)
  appleContainer: {
    flex: 1,
  },
  appleScrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.OS === 'ios' ? 100 : 80, // Extra bottom padding for safe area
  },

  // Banner/Cover Image - Social Media Style
  bannerContainer: {
    width: '100%',
    height: 180, // Reduced banner height
    position: 'relative',
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerGradient: {
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)', // Subtle dark overlay
  },
  // Hero Section - Apple Card Style
  appleHeroSection: {
    alignItems: 'center',
    paddingTop: 20, // Added padding to create space from header
    paddingBottom: 20,
    paddingHorizontal: 24,
    marginTop: -70, // Avatar overlaps banner
  },
  appleAvatarContainer: {
    position: 'relative',
    marginBottom: 40, // Increased to move name section below blob rings
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Animated Blob Rings
  animatedBlobRing: {
    position: 'absolute',
    width: 140, // 120 (avatar) + 20 (ring width)
    height: 140,
    borderRadius: 70,
    zIndex: 1, // Behind avatar
    alignItems: 'center',
    justifyContent: 'center',
  },
  animatedBlobRing2: {
    position: 'absolute',
    width: 160, // Slightly larger for depth
    height: 160,
    borderRadius: 80,
    zIndex: 0, // Behind first ring
    alignItems: 'center',
    justifyContent: 'center',
  },
  blobRingOuter: {
    width: '100%',
    height: '100%',
    borderRadius: 70,
    overflow: 'hidden',
    position: 'relative',
  },
  blobRingOuter2: {
    width: '100%',
    height: '100%',
    borderRadius: 80,
    overflow: 'hidden',
    position: 'relative',
  },
  blobRingGradient: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  blobRingInner: {
    position: 'absolute',
    width: 120, // Avatar size
    height: 120,
    borderRadius: 60,
    backgroundColor: 'white', // Match background or use theme
    top: '50%',
    left: '50%',
    marginTop: -60,
    marginLeft: -60,
  },
  blobRingInner2: {
    position: 'absolute',
    width: 140, // Slightly larger to create layered effect
    height: 140,
    borderRadius: 70,
    backgroundColor: 'white', // Match background or use theme
    top: '50%',
    left: '50%',
    marginTop: -70,
    marginLeft: -70,
  },
  avatarOverBanner: {
    zIndex: 10, // Ensure avatar is above banner
    // Add border to make avatar stand out
    borderRadius: 64, // 60 (avatar) + 4 (border)
    borderWidth: 4,
    borderColor: 'white',
    backgroundColor: 'white',
    padding: 0, // No padding, border wraps avatar
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    alignSelf: 'center', // Center the avatar
  },
  appleAvatar: {
    borderRadius: 60,
  },
  appleVipBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },

  // Typography - San Francisco Pro inspired
  appleNameSection: {
    alignItems: 'center',
    maxWidth: '80%',
    marginTop: 8, // Additional spacing from avatar/blob area
  },
  nameAndBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  appleNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  appleName: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.bold,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  verifiedBadgeContainer: {
    marginLeft: 8,
  },
  appleUsername: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.medium,
    textAlign: 'center',
    marginBottom: 6,
    opacity: 0.7,
  },
  appleLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  appleLocationText: {
    fontSize: 15,
    fontWeight: '400',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.regular,
    marginLeft: 6,
    opacity: 0.7,
  },
  gpsVerifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  gpsVerifiedText: {
    fontSize: 8,
    fontFamily: FontFamily.bold,
    color: 'white',
  },
  businessProfileBadge: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  businessProfileBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  businessProfileCard: {
    marginTop: 10,
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  businessProfileCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    opacity: 0.9,
  },
  businessInfoBlock: {
    marginTop: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  businessTaglineText: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 4,
  },
  businessMetaText: {
    fontSize: 12,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 2,
  },
  businessPhotosGalleryWrap: {
    marginTop: 8,
    maxHeight: 72,
  },
  businessPhotosGallery: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  businessPhotoGallerySlot: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 8,
  },
  businessPhotoGalleryThumb: {
    width: '100%',
    height: '100%',
  },

  // Action Buttons - Enhanced
  appleActionSection: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  appleActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  appleFollowButton: {
    // Let button size itself naturally
  },
  appleMessageButton: {
    // Premium send button will handle its own sizing
  },
  appleCreditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    minWidth: 100,
  },
  appleCreditButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  creditDisabledContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  creditDisabledText: {
    fontSize: 12,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  appleMessageCard: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  appleActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    gap: 8,
  },
  appleActionText: {
    fontSize: 17,
    fontWeight: '600',
    color: 'white',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.semibold,
  },
  appleHiddenProfileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  appleHiddenProfileText: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.medium,
    textAlign: 'center',
    flex: 1,
    opacity: 0.8,
  },

  // Lightweight redesigned styles
  lightContainer: {
    flex: 1,
  },
  lightHeader: {
    paddingHorizontal: 12,
    paddingTop: 34,
    paddingBottom: 8,
    alignItems: 'center',
  },
  lightAvatarContainer: {
    marginBottom: 8,
  },
  simpleAvatarRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    padding: 2,
  },
  simpleAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
  },
  lightNameSection: {
    alignItems: 'center',
    gap: 4,
  },
  lightNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lightName: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.bold,
    letterSpacing: -0.3,
  },
  unverifiedBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 6,
  },
  unverifiedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  lightVerifiedBadge: {
    marginLeft: 0,
  },
  lightUsername: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
  },
  lightBusinessBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
  },
  lightBusinessBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  
  // Lightweight action buttons
  lightActionSection: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  lightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  lightFollowBtn: {
    flexShrink: 0,
    paddingHorizontal: 0,
    minWidth: 96,
  },
  lightActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  
  // Lightweight utility row
  lightUtilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  lightUtilityBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  lightUtilityText: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    textTransform: 'lowercase',
  },
  
  // Lightweight message boxes
  lightMessageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  lightMessageText: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
  },
  lightMessageAction: {
    marginLeft: 'auto',
  },
  lightMessageActionText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: FontFamily.semibold,
  },
  
  // Lightweight info strip
  lightInfoStrip: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lightBio: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: FontFamily.regular,
  },
  lightStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  lightStat: {
    fontSize: 12.5,
    fontFamily: FontFamily.regular,
  },
  lightStatNum: {
    fontWeight: '600',
    fontFamily: FontFamily.semibold,
  },
  lightLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  lightLocation: {
    fontSize: 12.5,
    fontFamily: FontFamily.regular,
  },
  lightInterests: {
    fontSize: 12.5,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  
  // Lightweight grid
  lightContentWrapper: {
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lightGridList: {
    flexGrow: 0,
  },
  lightGridContainer: {
    gap: 2,
    paddingBottom: 24,
  },
  lightGridRow: {
    gap: 2,
  },
  lightGridItem: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: (Dimensions.get('window').width - 4) / 3,
  },
  lightGridImage: {
    width: '100%',
    height: '100%',
  },
  lightPlayIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightGridViewCountBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
    maxWidth: '80%',
  },
  lightGridViewCountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: FontFamily.semibold,
  },

  // Text-post tile styling
  lightTextTile: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  lightTextTileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginBottom: 4,
  },
  lightTextTileBadgeLabel: {
    fontSize: 9,
    fontFamily: FontFamily.medium,
    marginLeft: 3,
    textTransform: 'uppercase',
  },
  lightTextTileContent: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FontFamily.regular,
  },

  // Gallery header
  lightGalleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lightPostsEmptyState: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  lightPostsEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  lightPostsEmptyTitle: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    marginBottom: 4,
  },
  lightPostsEmptySubtitle: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  lightGalleryTitle: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  lightGalleryCount: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
  },

  // Text Post Items
  textPostItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  textPostContent: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
  },
  textPostMeta: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    marginTop: 4,
  },

  // Content Cards - Clean and minimal with dynamic height
  appleContentWrapper: {
    paddingHorizontal: 0,
    gap: 0,
    paddingBottom: 20,
    marginTop: 16,
  },
  appleCard: {
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    minHeight: 'auto',
  },
  appleCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.bold,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  appleCardContent: {
    fontSize: 16,
    fontWeight: '400',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.regular,
    lineHeight: 24,
    opacity: 0.8,
  },

  // Interests - Pill style
  appleInterestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  appleInterestChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  appleInterestText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.medium,
  },

  // Personal Info - Clean grid layout
  applePersonalInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  applePersonalInfoItem: {
    flex: 1,
    minWidth: '45%',
  },
  applePersonalInfoLabel: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    opacity: 0.7,
  },
  applePersonalInfoValue: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.semiBold,
    letterSpacing: -0.2,
  },

  // Stats Row - Notion style
  appleStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  appleStat: {
    alignItems: 'center',
    flex: 1,
  },
  appleStatNumber: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.bold,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  appleStatLabel: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.6,
  },

  // Posts Grid - Horizontal Scrollable with Indicators
  // Instagram-style 3-column grid
  gridContainer: {
    paddingTop: 2,
  },
  gridItem: {
    width: (Dimensions.get('window').width - 4) / 3,
    height: (Dimensions.get('window').width - 4) / 3,
    margin: 0.5,
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridVideoOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },

  applePostsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appleScrollHint: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  appleScrollHintText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.medium,
  },
  applePostsScrollView: {
    marginTop: 0,
  },
  applePostsScrollContainer: {
    paddingRight: 20,
  },
  applePostThumbnail: {
    width: 140,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  appleScrollDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
    flexWrap: 'wrap', // Allow wrapping for many dots
    maxWidth: '100%', // Prevent overflow
  },
  appleScrollDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    minWidth: 6, // Ensure consistent size
  },
  appleScrollMoreText: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : FontFamily.medium,
    marginLeft: 4,
    opacity: 0.7,
  },
  applePostImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  applePostPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  blockButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  unblockButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'center',
  },
  unblockButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
  },
});