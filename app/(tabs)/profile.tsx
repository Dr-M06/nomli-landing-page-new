import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Dimensions,
  FlatList,
  Platform,
  StatusBar,
  Animated,
  Alert,
  Modal,
  DeviceEventEmitter,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings, Edit, MapPin, Calendar, Bookmark, Image as ImageIcon, MessageSquare, FileText, Trash2, Square, Type, Users, CalendarDays, Clock, Bell, Play, X, Heart, Wallet, CreditCard, AlertTriangle, Eye, Grid3X3 as Grid3x3 } from 'lucide-react-native';
import { Video, ResizeMode } from 'expo-av';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Profile as ProfileType } from '../../utils/supabase';
import useAuth from '../../hooks/useAuth';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Shadow, Spacing } from '../../constants/Theme';
import ProfileCard from '../../components/ProfileCard';
import ProfileMap from '../../components/ProfileMap';
import InterestTag from '../../components/InterestTag';
import Header from '../../components/Header';
// NotificationIcon removed – using Expo notifications only
import { logError, getUserFriendlyError } from '../../utils/errorHandler';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemeStyles } from '../../hooks/useThemeStyles';
import EnhancedAvatar from '../../components/EnhancedAvatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import AppWatermark from '../../components/AppWatermark';
import UserBadgesList from '../../components/UserBadgesList';
import { getUserBadges, UserBadgeData } from '../../utils/badgeService';

import { getBookmarkedMessages, removeBookmark } from '../../utils/countryChat';
import { getBookmarkedPosts, unbookmarkPost, getUserPosts, Post } from '../../utils/communityUtils';
import { getSafeDisplayName } from '../../utils/contentFilter';
import { generateThumbnailFromVideo } from '../../utils/videoPostUtils';
import { fixFollowersTriggers } from '../../utils/fixFollowersTriggers';
import { format } from '../../utils/dateFormatters';
import { createPlaceholderProfile } from '../../utils/profilesManager';
import FollowStatsCard from '../../components/FollowStatsCard';
import { resizePostImage, resizeThumbnail } from '../../utils/imageResizer';
import FollowersModal from '../../components/FollowersModal';
import WalletButton from '../../components/WalletButton';
import WalletScreen from '../../components/WalletScreen';
import RedemptionScreen from '../../components/RedemptionScreen';
import { getUserWallet } from '../../utils/walletService';
import { getBookmarkedBusinesses, unbookmarkBusiness } from '../../utils/businessBookmarks';
import Toast from 'react-native-toast-message';
import { WalletModalWithDrag } from '../../components/wallet/WalletModal';
import { log, warn, error } from '../../utils/productionLogger';
import { 
  ShimmerPlaceholder, 
  ProfileHeaderSkeleton, 
  PostsGridSkeleton, 
  BookmarksSkeleton 
} from '../../components/profile/ProfileSkeletons';
import { isVerifiedEntity } from '../../utils/verification';

type BookmarkType = 'country_chat' | 'community_post' | 'business' | 'all';

const { width } = Dimensions.get('window');

// Get status bar height for different platforms
const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 20 : StatusBar.currentHeight || 0;
const BOTTOM_INSET = Platform.OS === 'ios' ? 34 : 16;
// Extra padding so last cards are not cropped behind the tab bar
const PROFILE_SCROLL_BOTTOM_PADDING = BOTTOM_INSET + 56 + Spacing.xl;


// Default interests shown when user hasn't set any
const DEFAULT_INTERESTS = [
  'Photography', 'Hiking', 'Food', 'Culture', 'History', 'Architecture', 'Nature', 'Adventure'
];

function formatViews(n?: number) {
  const v = Number(n || 0);
  if (!v) return '';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\\.0$/, '')}m`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\\.0$/, '')}k`;
  return String(v);
}


// Loading container - static indicator (no pulse/rotate loops for performance)
const EnhancedLoadingContainer = ({ text = "Loading..." }) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const themeStyles = useThemeStyles();

  return (
    <View style={[styles.enhancedLoadingContainer, themeStyles.background]}>
      <ActivityIndicator color={themeColors.primary?.main || Colors.primary.main} size="large" />
      <Text style={[styles.loadingText, themeStyles.subtext]}>{text}</Text>
    </View>
  );
};

// Animated Empty State - one-time entrance only (no infinite bounce for performance)
const AnimatedEmptyState = ({ 
  icon: Icon, 
  title, 
  subtitle, 
  buttonText, 
  onButtonPress,
  iconColor = Colors.neutral.subtext 
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const themeStyles = useThemeStyles();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View 
      style={[
        styles.emptyState,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
          backgroundColor: themeColors.neutral.background
        }
      ]}
    >
      <View style={styles.emptyStateIconContainer}>
        <Icon size={24} color={iconColor} />
        <View style={[styles.emptyStateIconGlow, { backgroundColor: themeColors.primary?.light || Colors.primary.light }]} />
      </View>
      
      <Text style={[styles.emptyStateTitle, themeStyles.text]}>{title}</Text>
      <Text style={[styles.emptyStateText, themeStyles.subtext]}>{subtitle}</Text>
      
      {buttonText && onButtonPress && (
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }]
          }}
        >
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={onButtonPress}
          >
            <Text style={styles.emptyStateButtonText}>{buttonText}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </Animated.View>
  );
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isLoaded: authLoaded } = useAuth();
  const [profile, setProfile] = useState<Partial<ProfileType> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const tabContentOpacity = useRef(new Animated.Value(1)).current;
  const initialLoadingShimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading || refreshing) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(initialLoadingShimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(initialLoadingShimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading, refreshing]);

  // Scroll position preservation
  const scrollViewRef = useRef<ScrollView>(null);
  const savedScrollPosition = useRef(0);
  
  // Add state for user posts
  const [userPosts, setUserPosts] = useState<Post[]>([]); // Media posts only
  const [userTextPosts, setUserTextPosts] = useState<Post[]>([]); // Text-only posts
  const [loadingPosts, setLoadingPosts] = useState(false);
  
  // Events removed
  
  // Video modal removed - videos now play inline on post detail screen
  
  // Add theme detection
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const themeStyles = useThemeStyles();

  // Helper function to generate DiceBear URL
  const generateDiceBearUrl = (style: string, seed?: string) => {
    const userSeed = seed || user?.id || 'default';
    return `https://api.dicebear.com/9.x/${style}/png?seed=${userSeed}&size=120`;
  };
  
  const isProfileVerified = useCallback((targetProfile: Partial<ProfileType> | null) => {
    return isVerifiedEntity(targetProfile);
  }, []);

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
        return generateDiceBearUrl(avatarData, user?.id);
      }
    }
    
    // Return regular URL as-is
    return avatarUrl;
  };
  
  

  
  // Track last profile refresh time using useRef to avoid dependency issues
  const lastRefreshTimeRef = useRef<number>(Date.now());
  
  // Defer heavy work until tab is focused (faster app startup)
  const [hasFocused, setHasFocused] = useState(false);

  // Force profile refresh on focus, but with throttling to prevent loops
  const focusCallbackRef = useRef<(() => void) | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      setHasFocused(true);
      // Prevent multiple simultaneous focus callbacks
      if (focusCallbackRef.current) {
        return;
      }
      
      log('Profile screen focused - refreshing data');
      
      // Save current scroll position before any updates
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: savedScrollPosition.current, animated: false });
      }
      
      // Add throttling - only refresh if more than 10 seconds have passed since last refresh
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
      const MIN_REFRESH_INTERVAL = 10000; // 10 seconds
      
      if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL) {
        log(`Skipping profile refresh - last refresh was ${timeSinceLastRefresh}ms ago`);
        return;
      }
      
      // Set flag to prevent concurrent executions
      focusCallbackRef.current = () => {};
      
      // Only refresh if cache is very old - profiles don't change frequently
      // Real-time subscription handles actual updates
      const checkAndRefreshIfNeeded = async () => {
        try {
          const profileCacheModule = await import('../../utils/profileCache');
          const cachedProfile = await profileCacheModule.getCachedProfile(user?.id!);
          if (!cachedProfile) {
            // No cache, fetch fresh
            fetchProfile(true, false);
            return;
          }
          
          // Check cache age - only refresh if older than 24 hours
          const cacheTimestampKey = `@nomli_profile_timestamp_${user?.id}`;
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          const cacheAge = await AsyncStorage.getItem(cacheTimestampKey);
          if (cacheAge) {
            const age = Date.now() - parseInt(cacheAge, 10);
            if (age > 24 * 60 * 60 * 1000) { // Only refresh if cache is older than 24 hours
              log('[ProfileScreen] Cache is old on focus, refreshing in background');
              fetchProfile(true, false);
            } else {
              log('[ProfileScreen] ✅ Cache is fresh, skipping refresh on focus');
            }
          }
        } catch (error) {
          warn('[ProfileScreen] Error checking cache on focus:', error);
        }
      };
      
      checkAndRefreshIfNeeded();
      
      // Restore scroll position after a short delay to ensure content is rendered
      setTimeout(() => {
        if (scrollViewRef.current && savedScrollPosition.current > 0) {
          scrollViewRef.current.scrollTo({ 
            y: savedScrollPosition.current, 
            animated: false 
          });
        }
        focusCallbackRef.current = null;
      }, 100);
      
      // Update the refresh timestamp to prevent immediate re-fetching
      lastRefreshTimeRef.current = now;
      
      return () => {
        // Clear the flag on cleanup
        focusCallbackRef.current = null;
      };
    }, [user?.id]) // Only depend on user ID to reduce callback recreation
  );
  
  // Standard fetch profile function (used for pull-to-refresh)
  // Only calls database when profile was actually updated or cache expired
  // Works with or without auth - shows placeholder if no user
  const fetchProfile = async (useCache: boolean = true, forceRefresh: boolean = false) => {
    try {
      // Only set loading if we don't have any profile data to show
      // During pull-to-refresh, keep existing profile visible (no loading spinner)
      if (!profile) {
        setLoading(true);
      }

      // If no user, show placeholder immediately (no auth required)
      if (!user?.id) {
        setProfile(createPlaceholderProfile());
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (user?.id) {
        const profileCacheModule = await import('../../utils/profileCache');
        let shouldFetchFromDb = forceRefresh;

        // Offline: use cache only, don't call Supabase (app stays usable)
        if (typeof Platform !== 'undefined' && Platform.OS !== 'web') {
          try {
            const NetInfo = (await import('@react-native-community/netinfo')).default;
            const netInfo = await NetInfo.fetch();
            if (!netInfo.isConnected) {
              const cachedProfile = await profileCacheModule.getCachedProfile(user.id);
              if (cachedProfile) {
                setProfile(cachedProfile);
                log('[ProfileScreen] 📴 Offline - showing cached profile');
              }
              setLoading(false);
              setRefreshing(false);
              return;
            }
          } catch {
            // NetInfo failed, continue with normal flow
          }
        }

        // Try to load from cache first (stale-while-revalidate)
        if (useCache && !forceRefresh) {
          try {
            const cachedProfile = await profileCacheModule.getCachedProfile(user.id);
            if (cachedProfile) {
              log('[ProfileScreen] 📦 Using cached profile (showing immediately)');
              setProfile(cachedProfile);
              setLoading(false);
              
              // Check if profile was updated without fetching full profile
              // Only fetch if profile was actually updated
              try {
                const { data: updatedData } = await supabase
                  .from('profiles')
                  .select('updated_at')
                  .eq('id', user.id)
                  .single();
                
                if (updatedData?.updated_at) {
                  const needsRefresh = await profileCacheModule.shouldRefreshProfile(
                    user.id,
                    updatedData.updated_at
                  );
                  
                  if (!needsRefresh) {
                    log('[ProfileScreen] ✅ Profile unchanged, using cache (no database call)');
                    setRefreshing(false);
                    return; // Profile hasn't changed, skip database fetch
                  }
                  
                  log('[ProfileScreen] 🔄 Profile was updated, fetching fresh data...');
                  shouldFetchFromDb = true; // Profile was updated, need to fetch
                } else {
                  // No updated_at field, check cache expiry using profileCache module
                  const cacheTimestampKey = `@nomli_profile_timestamp_${user.id}`;
                  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                  const cacheAge = await AsyncStorage.getItem(cacheTimestampKey);
                  if (cacheAge) {
                    const age = Date.now() - parseInt(cacheAge, 10);
                    if (age < 48 * 60 * 60 * 1000) { // 48 hours - profiles rarely change
                      log('[ProfileScreen] ✅ Cache still valid (48h), skipping database call');
                      setRefreshing(false);
                      return;
                    }
                  }
                  shouldFetchFromDb = true; // Cache expired or no updated_at, fetch
                }
              } catch (checkError) {
                warn('[ProfileScreen] Error checking profile update:', checkError);
                // Continue to fetch fresh data if check fails
                shouldFetchFromDb = true;
              }
            } else {
              // No cache, need to fetch
              shouldFetchFromDb = true;
            }
          } catch (cacheError) {
            warn('[ProfileScreen] Cache check failed, fetching fresh:', cacheError);
            shouldFetchFromDb = true;
          }
        } else {
          // Not using cache or force refresh, fetch from database
          shouldFetchFromDb = true;
        }

        // Fetch full profile from Supabase (only if needed)
        if (shouldFetchFromDb) {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) {
            // Log error safely without exposing details to the frontend
            logError('Profile:Fetch', error);
            // If Supabase fails and we don't have cached data, use placeholder data
            if (!useCache || !profile) {
              setProfile(createPlaceholderProfile(user.id));
            }
          } else if (data) {
            setProfile(data);
            
            // Cache the fresh profile
            try {
              await profileCacheModule.cacheProfile(data);
              log('[ProfileScreen] ✅ Cached fresh profile');
            } catch (cacheError) {
              warn('[ProfileScreen] Failed to cache profile:', cacheError);
            }
          } else {
            // No data returned, use placeholder data
            setProfile(createPlaceholderProfile(user.id));
          }
        }
      } else {
        // No user ID, use placeholder data
        setProfile(createPlaceholderProfile());
      }
    } catch (error) {
      // Log error safely without exposing details to the frontend
      logError('Profile:Fetch', error);
      // If any error occurs, use placeholder data
      setProfile(createPlaceholderProfile(user?.id));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  

  
  // Load posts when posts tab is active - memoize to prevent repeated calls
  const hasLoadedPostsRef = useRef(false);
  const lastActiveTabRef = useRef(activeTab);
  
  useEffect(() => {
    if (!hasFocused) return;
    // Reset flags if user changed
    if (lastUserIdRef.current !== user?.id) {
      hasLoadedPostsRef.current = false;
      hasLoadedBookmarksRef.current = false;
    }
    
    // Reset flag if tab changed
    if (lastActiveTabRef.current !== activeTab) {
      lastActiveTabRef.current = activeTab;
    }
    
    // Load data without requiring auth - show empty state if no user
    if (activeTab === 'posts' && authLoaded && user && !hasLoadedPostsRef.current) {
      loadUserPosts();
      hasLoadedPostsRef.current = true;
    } else if (!user) {
      // No user - set empty states immediately (no loading needed)
      if (activeTab === 'posts' && !hasLoadedPostsRef.current) {
        setUserPosts([]);
        setUserTextPosts([]);
        setLoadingPosts(false);
        hasLoadedPostsRef.current = true;
      }
    }
  }, [activeTab, authLoaded, user?.id, hasFocused]);
  
  // Load bookmarks when saved tab is active - memoize to prevent repeated calls
  const hasLoadedBookmarksRef = useRef(false);
  const lastBookmarkFilterRef = useRef(bookmarkFilter);
  
  useEffect(() => {
    if (activeTab === 'saved' && authLoaded && user && 
        (!hasLoadedBookmarksRef.current || lastBookmarkFilterRef.current !== bookmarkFilter)) {
      loadBookmarks();
      hasLoadedBookmarksRef.current = true;
      lastBookmarkFilterRef.current = bookmarkFilter;
    } else if (activeTab === 'saved' && !user) {
      // No user - set empty bookmarks immediately
      setBookmarks([]);
      setLoadingBookmarks(false);
      hasLoadedBookmarksRef.current = true;
    }
  }, [activeTab, authLoaded, user?.id, bookmarkFilter]); // Use user?.id instead of user

  // Bookmarks state
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [bookmarkFilter, setBookmarkFilter] = useState<BookmarkType>('all');

  // Followers state
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [followersModalTab, setFollowersModalTab] = useState<'followers' | 'following'>('followers');
  const [followersRefreshTrigger, setFollowersRefreshTrigger] = useState(0);
  
  // Badges state
  const [userBadges, setUserBadges] = useState<UserBadgeData[]>([]);

  // Debounce ref for profile updates to prevent excessive reloads
  const profileUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProfileUpdateRef = useRef<number>(0);

  // Wallet state
  const [wallet, setWallet] = useState<any>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showRedemptionModal, setShowRedemptionModal] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [redemptionModalLoading, setRedemptionModalLoading] = useState(false);
  // Deleted-event UI removed along with Events feature

  // Load wallet data
  const loadWallet = async () => {
    if (!user) return;
    
    try {
      setWalletLoading(true);
      const walletData = await getUserWallet();
      setWallet(walletData);
    } catch (error) {
      error('Error loading wallet:', error);
    } finally {
      setWalletLoading(false);
    }
  };

  // Function to refresh followers data
  const refreshFollowersData = () => {
    // Add a small delay to ensure database operations are complete
    setTimeout(() => {
      setFollowersRefreshTrigger(prev => prev + 1);
    }, 500);
  };

  // Refresh followers data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (profile?.id) {
        refreshFollowersData();
        loadWallet();
      }
    }, [profile?.id])
  );

  // Also refresh when the component mounts or when user changes
  useEffect(() => {
    if (profile?.id) {
      refreshFollowersData();
      loadWallet();
      // Load user badges
      const loadBadges = async () => {
        try {
          const badges = await getUserBadges(profile.id);
          setUserBadges(badges);
        } catch (error) {
          error('[ProfileScreen] Error loading badges:', error);
          setUserBadges([]);
        }
      };
      loadBadges();
      // Fix triggers (test function removed for security)
      fixFollowersTriggers();
    }
  }, [profile?.id]);

  // Only fetch profile when user ID changes, not when user object changes
  const hasInitiallyLoadedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!hasFocused) return;
    // Load profile when tab focused - works with or without auth
    if (user?.id && (user.id !== lastUserIdRef.current || !hasInitiallyLoadedRef.current)) {
      // Load cached profile first for instant display
      const loadCachedProfileFirst = async () => {
        try {
          const profileCacheModule = await import('../../utils/profileCache');
          const cachedProfile = await profileCacheModule.getCachedProfile(user.id!);
          if (cachedProfile) {
            log('[ProfileScreen] 🚀 Loading cached profile immediately');
            setProfile(cachedProfile);
            setLoading(false);
          }
        } catch (error) {
          warn('[ProfileScreen] Error loading cached profile:', error);
        }
      };
      
      loadCachedProfileFirst();
      
      // Only refresh in background if cache is very old or missing
      // Don't check for updates immediately - profiles don't change frequently
      // Real-time subscription will handle actual updates
      setTimeout(async () => {
        try {
          const profileCacheModule = await import('../../utils/profileCache');
          const cachedProfile = await profileCacheModule.getCachedProfile(user.id!);
          if (!cachedProfile) {
            // No cache at all, fetch fresh
            log('[ProfileScreen] No cache found, fetching fresh profile');
            fetchProfile(true, false);
          } else {
            // Check cache age - only refresh if very old (24+ hours)
            const cacheTimestampKey = `@nomli_profile_timestamp_${user.id}`;
            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
            const cacheAge = await AsyncStorage.getItem(cacheTimestampKey);
            if (cacheAge) {
              const age = Date.now() - parseInt(cacheAge, 10);
              if (age > 24 * 60 * 60 * 1000) { // Only refresh if cache is older than 24 hours
                log('[ProfileScreen] Cache is old (24h+), refreshing in background');
                fetchProfile(true, false);
              } else {
                log('[ProfileScreen] ✅ Using cached profile, skipping refresh (cache is fresh)');
              }
            }
          }
        } catch (error) {
          warn('[ProfileScreen] Error checking cache age:', error);
        }
      }, 1000); // Small delay to let UI render first
      
      lastUserIdRef.current = user.id;
      hasInitiallyLoadedRef.current = true;
    } else if (!user?.id && !hasInitiallyLoadedRef.current) {
      // No user - show placeholder immediately (no loading delay)
      setProfile(createPlaceholderProfile());
      setLoading(false);
      hasInitiallyLoadedRef.current = true;
    }
  }, [user?.id, hasFocused]);

  // Set up real-time subscription for profile updates
  useEffect(() => {
    if (!user?.id) return;
    
    log('[ProfileScreen] Setting up real-time subscription for profile updates');
    
    const profileSubscription = supabase
      .channel('profile_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          // Profile was updated, refresh it (only if it's a meaningful change)
          // Check if it's just a heartbeat update (last_active, updated_at, etc.) or actual profile change
          const oldData = payload.old || {};
          const newData = payload.new || {};
          
          // Fields that indicate a meaningful profile change (user-editable fields)
          const meaningfulFields = ['full_name', 'username', 'avatar_url', 'bio', 'interests', 'country', 'location', 'virtual_coins'];
          
          // Fields that are just activity/heartbeat updates (should be ignored)
          const heartbeatFields = ['last_active', 'updated_at', 'online_status', 'expo_push_token', 'fcm_token', 'push_token_updated_at', 'last_email_notification_sent'];
          
          // Check if any meaningful field changed
          const hasMeaningfulChange = meaningfulFields.some(field => {
            const oldValue = oldData[field];
            const newValue = newData[field];
            // Deep comparison for arrays (interests)
            if (Array.isArray(oldValue) && Array.isArray(newValue)) {
              return JSON.stringify(oldValue) !== JSON.stringify(newValue);
            }
            return oldValue !== newValue;
          });
          
          // Check if ONLY heartbeat fields changed (and nothing meaningful)
          const onlyHeartbeatChanged = Object.keys(newData).every(key => 
            heartbeatFields.includes(key) || oldData[key] === newData[key]
          );
          
          if (hasMeaningfulChange && !onlyHeartbeatChanged) {
            // Debounce profile updates to prevent excessive reloads (max once per 2 seconds)
            const now = Date.now();
            const timeSinceLastUpdate = now - lastProfileUpdateRef.current;
            
            // Clear any pending update
            if (profileUpdateTimeoutRef.current) {
              clearTimeout(profileUpdateTimeoutRef.current);
              profileUpdateTimeoutRef.current = null;
            }
            
            // If it's been less than 2 seconds since last update, debounce it
            if (timeSinceLastUpdate < 2000) {
              profileUpdateTimeoutRef.current = setTimeout(() => {
                log('[ProfileScreen] 🔄 Meaningful profile change detected (debounced), refreshing...');
                lastProfileUpdateRef.current = Date.now();
                fetchProfile(true, true); // useCache=true, forceRefresh=true to bypass update check
                profileUpdateTimeoutRef.current = null;
              }, 2000 - timeSinceLastUpdate);
            } else {
              // Update immediately if enough time has passed
              log('[ProfileScreen] 🔄 Meaningful profile change detected, refreshing...');
              lastProfileUpdateRef.current = now;
              fetchProfile(true, true); // useCache=true, forceRefresh=true to bypass update check
            }
          }
          // Silently skip heartbeat updates - no need to log every second
        }
      )
      .subscribe();
    
    return () => {
      log('[ProfileScreen] Cleaning up profile subscription');
      // Clear any pending profile update timeout
      if (profileUpdateTimeoutRef.current) {
        clearTimeout(profileUpdateTimeoutRef.current);
        profileUpdateTimeoutRef.current = null;
      }
      try {
        supabase.removeChannel(profileSubscription);
      } catch (e) {
        // Ignore cleanup errors
      }
    };
  }, [user?.id]);
  
  // Load bookmarked messages and posts
  const loadBookmarks = async () => {
    if (!user) return;
    
    try {
      setLoadingBookmarks(true);
      log('Loading bookmarks for user:', user.id);
      
      // Skip loading if using a mock user ID
      if (user.id === '00000000-0000-0000-0000-000000000000' || !user.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        log('Using mock user ID, skipping actual bookmarks fetch');
        setBookmarks([]);
        return;
      }
      
      let bookmarkedItems: any[] = [];
      
      // Load messages if filter includes chat messages
      if (bookmarkFilter === 'all' || bookmarkFilter === 'country_chat') {
        log('Loading bookmarked messages...');
        const messageType = bookmarkFilter === 'all' ? undefined : 'country_chat';
        const bookmarkedMessages = await getBookmarkedMessages(user.id, messageType);
        log('Loaded bookmarked messages:', (bookmarkedMessages?.length || 0));
        
        // Ensure each bookmarked message has a valid id
        const validMessages = bookmarkedMessages.filter(msg => msg && msg.id).map(msg => ({
          ...msg,
          id: msg.id || `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        }));
        
        bookmarkedItems = [...bookmarkedItems, ...validMessages];
      }
      
      // Load posts if filter includes community posts
      if (bookmarkFilter === 'all' || bookmarkFilter === 'community_post') {
        log('Loading bookmarked posts...');
        const bookmarkedPosts = await getBookmarkedPosts(user.id);
        log('Loaded bookmarked posts:', (bookmarkedPosts?.length || 0), bookmarkedPosts);
        
        // Transform posts to match the bookmark format expected by the UI
        const formattedPosts = bookmarkedPosts.filter(post => post && post.id).map(post => ({
          id: `post-${post.id || Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          message_id: post.id,
          message_type: 'community_post',
          content: post,
          created_at: post.created_at,
          bookmark_created_at: post.created_at,
        }));
        
        log('Formatted posts for UI:', (formattedPosts?.length || 0));
        bookmarkedItems = [...bookmarkedItems, ...formattedPosts];
      }
      
      // Load bookmarked businesses if filter includes them
      if (bookmarkFilter === 'all' || bookmarkFilter === 'business') {
        log('Loading bookmarked businesses...');
        const { businessIds, success, error } = await getBookmarkedBusinesses(user.id);
        if (!success) {
          log('Failed to load bookmarked businesses:', error);
        } else if (businessIds && businessIds.length > 0) {
          const { data: businessProfiles, error: businessError } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, business_name, business_tagline, business_type, business_category, business_address')
            .in('id', businessIds);

          if (businessError) {
            log('Failed to load business profiles for bookmarks:', businessError);
          } else {
            const businessItems = (businessProfiles || []).map((bp) => ({
              id: `business-${bp.id}`,
              message_id: bp.id,
              message_type: 'business',
              content: bp,
              created_at: bp.updated_at || bp.created_at || new Date().toISOString(),
              bookmark_created_at: bp.updated_at || bp.created_at || new Date().toISOString(),
            }));
            bookmarkedItems = [...bookmarkedItems, ...businessItems];
          }
        }
      }
      
      // Sort by creation date
      bookmarkedItems.sort((a, b) => {
        const dateA = new Date(a.bookmark_created_at || a.created_at);
        const dateB = new Date(b.bookmark_created_at || b.created_at);
        return dateB.getTime() - dateA.getTime();
      });
      
      log('Final bookmarked items:', (bookmarkedItems?.length || 0));
      
      // Clean up items to ensure they all have valid IDs
      const validBookmarks = bookmarkedItems
        .filter(item => item !== null && item !== undefined)
        .map(item => {
          if (!item.id) {
            return {
              ...item,
              id: `gen-${Math.random().toString(36).substring(2, 9)}`,
            };
          }
          return item;
        });
      
      log('Cleaned bookmarks to set:', (validBookmarks?.length || 0));
      setBookmarks(validBookmarks);
    } catch (error) {
      // Log error safely without exposing details to the frontend
      logError('Profile:LoadBookmarks', error);
      setBookmarks([]);
    } finally {
      setLoadingBookmarks(false);
    }
  };
  
  // Handle bookmark deletion
  const handleRemoveBookmark = async (bookmarkId: string, messageId: string, type: string = 'country_chat') => {
    if (!user) return;
    
    try {
      let success = false;
      
      if (type === 'community_post') {
        success = await unbookmarkPost(messageId, user.id);
      } else if (type === 'business') {
        const result = await unbookmarkBusiness(user.id, messageId);
        success = result.success;
      } else {
        success = await removeBookmark(user.id, messageId);
      }
      
      if (success) {
        // Update local state
        setBookmarks(current => current.filter(bm => bm.id !== bookmarkId));
      }
    } catch (error) {
      // Log error safely without exposing details to the frontend
      logError('Profile:RemoveBookmark', error);
    }
  };
  
  // Navigate to original content
  const navigateToOriginal = async (bookmark: any) => {
    try {
      if (bookmark.message_type === 'country_chat' && bookmark.content) {
        router.push(`/chat/country/${bookmark.content.countryChat.id}`);
        return;
      }
      if (bookmark.message_type === 'community_post' && bookmark.content) {
        router.push(`/community/post/${bookmark.content.id}`);
        return;
      }
      if (bookmark.message_type === 'business' && bookmark.content) {
        // Try to find the latest promoted post for this business user
        const businessId = bookmark.content.id;
        const { data, error } = await supabase
          .from('posts')
          .select('id')
          .eq('user_id', businessId)
          .eq('is_business', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data && data.id) {
          router.push(`/community/post/${data.id}`);
        } else {
          // Fallback: open their profile
          router.push(`/profile/${businessId}`);
        }
        return;
      }
    } catch (e) {
      warn('[Profile] navigateToOriginal failed, falling back:', e);
      if (bookmark?.message_type === 'business' && bookmark?.content?.id) {
        router.push(`/profile/${bookmark.content.id}`);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    
    try {
      // Reset loading flags to allow refresh
      hasLoadedPostsRef.current = false;
      hasLoadedBookmarksRef.current = false;
      
      // Force refresh profile (bypass cache check on pull-to-refresh)
      // Existing profile data stays visible during fetch (no loading spinner)
      await fetchProfile(true, true); // useCache=true, forceRefresh=true
      
      // Refresh active tab content in background (non-blocking)
      if (activeTab === 'saved') {
        loadBookmarks();
      } else if (activeTab === 'posts') {
        loadUserPosts();
      }
    } catch (error) {
      error('[ProfileScreen] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleEditProfile = () => {
    router.push('/profile/edit');
  };

  const handleSettings = () => {
    router.push('/settings');
  };

  const handleTestNotifications = () => {
    router.push('/notification-simple-test');
  };

  const handleWalletPress = () => {
    // Open wallet modal - wallet is now unlocked for users to see their tokens
    setShowWalletModal(true);
  };

  const handleRedemptionPress = () => {
    // Open redemption modal
    setShowRedemptionModal(true);
  };


  const handleMessagePress = (profileId) => {
    router.push(`/chat/${profileId}`);
  };

  const handleProfilePress = (profileId) => {
    // In a real app, you'd navigate to the selected profile
    log(`Navigate to profile: ${profileId}`);
  };
  
  // Bookmark filter tabs - Removed separate function since we're inlining it
  
  const renderBookmarkItem = ({ item }: { item: any }) => {
    // If item is missing required properties, skip rendering
    if (!item || !item.id) {
      log('Invalid bookmark item, skipping render');
      return (
        <View style={[styles.bookmarkCard, { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border }]}>
          <View style={styles.bookmarkHeader}>
            <View style={styles.bookmarkTypeContainer}>
              <FileText size={16} color={Colors.error.main} />
              <Text style={[styles.bookmarkType, themeStyles.subtext]}>
                Invalid Bookmark
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => item?.id && handleRemoveBookmark(item.id, item.message_id || 'unknown', item.message_type || 'unknown')}
              style={styles.removeButton}
            >
              <Bookmark size={14} color={themeColors.primary.main} fill={themeColors.primary.main} />
            </TouchableOpacity>
          </View>
          <View style={styles.bookmarkContent}>
            <Text style={[styles.bookmarkText, themeStyles.text]}>
              This bookmark appears to be invalid or corrupted.
            </Text>
          </View>
        </View>
      );
    }
    
    log('Rendering bookmark item:', item.id, 'type:', item.message_type);
    
    const isCountryChat = item.message_type === 'country_chat';
    const isCommunityPost = item.message_type === 'community_post';
    const isBusinessBookmark = item.message_type === 'business';
    
    if (!item.content) {
      log('Item has no content, showing placeholder');
      return (
        <View style={[styles.bookmarkCard, { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border }]}>
          <View style={styles.bookmarkHeader}>
            <View style={styles.bookmarkTypeContainer}>
              {isCountryChat ? (
                <MessageSquare size={16} color={Colors.primary.main} />
              ) : isBusinessBookmark ? (
                <Bookmark size={16} color={Colors.primary.main} />
              ) : (
                <FileText size={16} color={Colors.accent.main} />
              )}
              <Text style={[styles.bookmarkType, themeStyles.subtext]}>
                {isCountryChat 
                  ? 'Country Chat Message' 
                  : isBusinessBookmark
                    ? 'Business'
                    : 'Community Post'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => handleRemoveBookmark(item.id, item.message_id || 'unknown', item.message_type || 'unknown')}
              style={styles.removeButton}
            >
              <Bookmark size={14} color={themeColors.primary.main} fill={themeColors.primary.main} />
            </TouchableOpacity>
          </View>
          <View style={styles.bookmarkContent}>
            <Text style={[styles.bookmarkText, themeStyles.text]}>
              The content of this bookmark is no longer available.
            </Text>
          </View>
        </View>
      );
    }
    
    // Business bookmark: render lightweight business card row
    if (isBusinessBookmark) {
      const bp = item.content;
      const displayName = bp.business_name || bp.full_name || bp.username || 'Business';
      const subtitle = bp.business_tagline || bp.business_address || '';
      const label = bp.business_type || bp.business_category || '';
      const avatarUrl = bp.business_logo_url || bp.avatar_url;
      return (
        <View style={[styles.bookmarkCard, { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border }]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigateToOriginal(item)}
            style={styles.businessBookmarkRow}
          >
            <View style={styles.businessBookmarkAvatar}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.businessBookmarkAvatarImage}
                  resizeMode="cover"
                />
              ) : null}
            </View>
            <View style={{ flex: 1, marginRight: Spacing.sm }}>
              <Text style={[styles.businessBookmarkName, themeStyles.text]} numberOfLines={1}>
                {displayName}
              </Text>
              {!!subtitle && (
                <Text style={[styles.businessBookmarkSubtitle, themeStyles.subtext]} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
              {!!label && (
                <Text style={[styles.businessBookmarkLabel, themeStyles.subtext]} numberOfLines={1}>
                  {label}
                </Text>
              )}
            </View>
            <View style={styles.businessBookmarkActions}>
              <TouchableOpacity
                onPress={() => navigateToOriginal(item)}
                style={styles.businessBookmarkButton}
                activeOpacity={0.8}
              >
                <Text style={styles.businessBookmarkButtonText}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemoveBookmark(item.id, item.message_id, 'business')}
                style={[styles.businessBookmarkButton, { marginLeft: Spacing.xs }]}
                activeOpacity={0.8}
              >
                <Bookmark size={14} color={Colors.primary.main} fill={Colors.primary.main} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      );
    }
    
    // Truncate content for cleaner display
    const maxContentLength = 100;
    const displayContent = item.content?.content 
      ? (item.content.content.length > maxContentLength 
          ? item.content.content.substring(0, maxContentLength) + '...' 
          : item.content.content)
      : 'No content available';
    
    const authorName = isCountryChat 
      ? (item.content?.profile?.full_name || item.content?.profile?.username || 'Unknown User')
      : (item.content?.profile?.full_name || item.content?.profile?.username || item.content?.username || 'Unknown User');
    
    return (
      <View style={[styles.bookmarkCard, { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border }]}>
        <View style={styles.bookmarkHeader}>
          <View style={styles.bookmarkTypeContainer}>
            {isCountryChat ? (
              <MessageSquare size={14} color={themeColors.primary.main} />
            ) : (
              <FileText size={14} color={themeColors.accent?.main || themeColors.primary.main} />
            )}
            <Text style={[styles.bookmarkType, themeStyles.subtext]}>
              {isCountryChat ? 'Chat' : 'Post'}
            </Text>
          </View>
          <View style={styles.bookmarkHeaderRight}>
            <Text style={[styles.bookmarkDate, themeStyles.subtext]}>
              {item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
            </Text>
            <TouchableOpacity
              onPress={() => handleRemoveBookmark(item.id, item.message_id, item.message_type)}
              style={styles.removeButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Bookmark size={14} color={themeColors.primary.main} fill={themeColors.primary.main} />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.bookmarkContent}>
          {/* Author and location in one line */}
          <View style={styles.authorInfo}>
            <Text style={[styles.authorName, themeStyles.text]} numberOfLines={1}>
              {authorName}
            </Text>
            {(isCountryChat && item.content?.countryChat) && (
              <Text style={[styles.chatName, themeStyles.subtext]} numberOfLines={1}>
                • {item.content.countryChat.name}
              </Text>
            )}
            {(isCommunityPost && item.content?.location) && (
              <Text style={[styles.chatName, themeStyles.subtext]} numberOfLines={1}>
                • {item.content.location}
              </Text>
            )}
          </View>
          
          {/* Content text */}
          <Text style={[styles.bookmarkText, themeStyles.text]} numberOfLines={3}>
            {displayContent}
          </Text>
          
          {/* Image thumbnail if available */}
          {isCommunityPost && item.content?.image_urls && (item.content.image_urls?.length || 0) > 0 && (
            <Image 
              source={{ uri: resizeThumbnail(item.content.image_urls[0]) }}
              style={styles.bookmarkImage}
              cachePolicy="memory-disk"
              priority="low"
              resizeMode="cover"
            />
          )}
        </View>
        
        {/* Compact footer with View Original button */}
        <TouchableOpacity 
          style={[styles.viewButton, { backgroundColor: themeColors.primary.main + '15', borderColor: themeColors.primary.main + '30' }]}
          onPress={() => navigateToOriginal(item)}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewButtonText, { color: themeColors.primary.main }]}>View Original</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'posts':
        if (!authLoaded || !user) {
          return (
            <AnimatedEmptyState
              icon={ImageIcon}
              title="Sign in required"
              subtitle="Sign in to view and share your travel posts"
              buttonText="Sign In"
              onButtonPress={() => router.push('/auth/signin')}
              iconColor={Colors.primary.main}
            />
          );
        }
        
        if (loadingPosts) {
          return <PostsGridSkeleton />;
        }
        
        // Check if no posts at all
        if ((userPosts?.length || 0) === 0 && (userTextPosts?.length || 0) === 0) {
          return (
            <AnimatedEmptyState
              icon={ImageIcon}
              title="No posts yet"
              subtitle="Share your travel experiences with the community"
              buttonText="Create Post"
              onButtonPress={() => router.push('/(tabs)/create')}
              iconColor={Colors.primary.main}
            />
          );
        }
        
        return (
          <View>
            {/* Media Gallery Section */}
            {userPosts.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Grid3x3 size={16} color={themeColors.neutral.text} />
                  <Text style={[styles.sectionTitle, { color: themeColors.neutral.text }]}>Media</Text>
                </View>
                <View style={styles.postsGrid}>
                  {userPosts.map((post, index) => (
                    <TouchableOpacity 
                      key={post.id} 
                      style={[
                        styles.postItem,
                        (index + 1) % 3 === 0 ? { marginRight: 0 } : {}
                      ]}
                      onPress={() => handleVideoPostTap(post)}
                    >
                      {post.video_url ? (
                        <View style={styles.postVideoPreview}>
                          <Image 
                            source={{ uri: generateThumbnailFromVideo(post.video_url) || undefined }} 
                            style={styles.postImage}
                            defaultSource={require('../../assets/images/default-avatar.png')}
                          />
                          <View style={styles.videoOverlay}>
                            <View style={styles.playButtonContainer}>
                              <Play size={20} color="white" fill="white" />
                            </View>
                          </View>
                          {post.video_duration && (
                            <View style={styles.videoDuration}>
                              <Text style={styles.videoDurationText}>
                                {Math.floor(post.video_duration / 60)}:{(post.video_duration % 60).toString().padStart(2, '0')}
                              </Text>
                            </View>
                          )}
                          {formatViews(post.views_count) !== '' && (
                            <View style={styles.profileViewCountBadge}>
                              <Eye size={10} color="#fff" />
                              <Text style={styles.profileViewCountText}>{formatViews(post.views_count)}</Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={styles.postImageContainer}>
                          <Image 
                            source={{ uri: resizePostImage(post.image_url || post.image_urls?.[0] || '', Dimensions.get('window').width) }} 
                            style={styles.postImage}
                            contentFit="cover"
                            contentPosition="top"
                            cachePolicy="memory-disk"
                            priority="low"
                          />
                          {post.image_urls && post.image_urls.length > 1 && (
                            <View style={styles.multipleImagesIndicator}>
                              <Text style={styles.multipleImagesText}>+{post.image_urls.length - 1}</Text>
                            </View>
                          )}
                          {formatViews(post.views_count) !== '' && (
                            <View style={styles.profileViewCountBadge}>
                              <Eye size={10} color="#fff" />
                              <Text style={styles.profileViewCountText}>{formatViews(post.views_count)}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            
            {/* Text Posts Section */}
            {userTextPosts.length > 0 && (
              <>
                <View style={[styles.sectionHeader, userPosts.length > 0 && { marginTop: Spacing.md }]}>
                  <Type size={16} color={themeColors.neutral.text} />
                  <Text style={[styles.sectionTitle, { color: themeColors.neutral.text }]}>Posts</Text>
                </View>
                {userTextPosts.map((post) => (
                  <TouchableOpacity
                    key={post.id}
                    style={[styles.textPostItem, { borderBottomColor: themeColors.neutral.border }]}
                    onPress={() => handleVideoPostTap(post)}
                    activeOpacity={0.7}
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
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        );
      case 'saved':
        if (!authLoaded || !user) {
          return (
            <AnimatedEmptyState
              icon={Bookmark}
              title="Sign in required"
              subtitle="Sign in to save and view your bookmarked content"
              buttonText="Sign In"
              onButtonPress={() => router.push('/auth/signin')}
              iconColor={Colors.social.bookmark}
            />
          );
        }
        
        if (loadingBookmarks) {
          return <BookmarksSkeleton />;
        }
        
        return (
          <View style={[styles.savedContainer, themeStyles.background]}>
            
            {bookmarks.length === 0 ? (
              <AnimatedEmptyState
                icon={Bookmark}
                title="No saved items"
                subtitle="Bookmark posts to view them here"
                iconColor={Colors.social.bookmark}
              />
            ) : (
              <View style={styles.bookmarksList}>
                {bookmarks.map((item, index) => (
                  <View key={item?.id ? String(item.id) : `bookmark-${index}`}>
                    {renderBookmarkItem({ item })}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      default:
        return null;
    }
  };

  // Enforce loading timeout to prevent infinite loading
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        if (loading) {
          log('Profile loading timed out - using placeholder profile');
          setLoading(false);
          
          // If still loading after timeout, use placeholder data
          if (!profile) {
            setProfile(createPlaceholderProfile(user?.id));
          }
        }
      }, 10000); // 10 second timeout
      
      return () => clearTimeout(timer);
    }
  }, [loading, profile, user]);

  // Process interests to ensure they're in array format
  const processInterests = (userProfile: Partial<ProfileType>): string[] => {
    if (!userProfile?.interests) return [];
    
    let interests = userProfile.interests;
    
    // Parse string to array if needed
    if (typeof interests === 'string') {
      try {
        interests = JSON.parse(interests);
      } catch (e) {
        // If JSON parsing fails, try comma-splitting
        interests = interests.split(',').map(item => item.trim());
      }
    }
    
    return Array.isArray(interests) ? interests : [];
  };

  // Load user posts
  const loadUserPosts = async () => {
    if (!user) return;
    
    try {
      setLoadingPosts(true);
      log('[ProfileScreen] Loading posts for user:', user.id);
      
      // Helper to separate media and text posts
      const separatePosts = (posts: Post[]) => {
        const media = posts.filter(p => p.video_url || (p.image_url || (p.image_urls && p.image_urls.length > 0)));
        const text = posts.filter(p => !p.video_url && !p.image_url && (!p.image_urls || p.image_urls.length === 0));
        return { media, text };
      };
      
      // Skip loading if using a mock user ID
      if (user.id === '00000000-0000-0000-0000-000000000000' || !user.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        log('Using mock user ID, skipping actual post fetch');
        setUserPosts([]);
        setUserTextPosts([]);
        return;
      }
      
      // Try to load from cache first for instant display
      const { getCachedUserPosts } = await import('../../utils/communityUtils');
      const cachedPosts = await getCachedUserPosts?.(user.id);
      
      if (cachedPosts && cachedPosts.length > 0) {
        log('[ProfileScreen] ✅ Using cached user posts for instant display');
        // Validate and set cached posts immediately
        const validatedCached = cachedPosts.filter((post) => post && post.id);
        const { media, text } = separatePosts(validatedCached);
        setUserPosts(media);
        setUserTextPosts(text);
        setLoadingPosts(false);
        
        // Then refresh in background
        setTimeout(async () => {
          try {
            const freshPosts = await getUserPosts(user.id, false);
            log('[ProfileScreen] ✅ Refreshed user posts in background:', (freshPosts?.length || 0));
            const validatedFresh = freshPosts.filter((post) => post && post.id);
            const { media: freshMedia, text: freshText } = separatePosts(validatedFresh);
            setUserPosts(freshMedia);
            setUserTextPosts(freshText);
          } catch (err) {
            warn('[ProfileScreen] Background refresh failed:', err);
          }
        }, 100);
        return;
      }
      
      // No cache, fetch fresh data
      const posts = await getUserPosts(user.id, true);
      log('[ProfileScreen] Loaded user posts:', (posts?.length || 0));
      
      const validatedPosts = posts.filter((post) => {
        if (!post || !post.id) {
          error('Invalid post found in user posts:', post);
          return false;
        }
        return true;
      });
      
      const { media, text } = separatePosts(validatedPosts);
      setUserPosts(media);
      setUserTextPosts(text);
    } catch (error) {
      // Log error safely without exposing details to the frontend
      logError('Profile:LoadUserPosts', error);
      setUserPosts([]);
      setUserTextPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  };

  // When a new post is created (e.g. video upload), refresh profile posts so it appears without restart
  const loadUserPostsRef = useRef(loadUserPosts);
  loadUserPostsRef.current = loadUserPosts;
  useEffect(() => {
    if (!user?.id) return;
    const sub = DeviceEventEmitter.addListener('refreshCommunityFeed', () => {
      loadUserPostsRef.current().catch((err: unknown) => logError('Profile:RefreshOnNewPost', err instanceof Error ? err : new Error(String(err))));
    });
    return () => sub.remove();
  }, [user?.id]);

  // Open post: video → Discovery feed at this clip; photo/text → post detail screen
  const handleVideoPostTap = (post: Post) => {
    log('Post tapped:', post);
    openPostFromProfile(post);
  };

  const openPostFromProfile = (post: Post) => {
    try {
      if (!post?.id) {
        error('Cannot open post: missing id');
        Alert.alert('Error', 'Unable to view this post. Please try again later.');
        return;
      }
      if (post.video_url) {
        log('Navigating to Discovery for video post:', post.id);
        router.push({ pathname: '/(tabs)/discovery', params: { postId: post.id } });
        return;
      }
      log('Navigating to post details:', post.id);
      setTimeout(() => {
        router.push({
          pathname: `/community/post/${post.id}`,
          params: { id: post.id },
        });
      }, 100);
    } catch (err) {
      error('Error opening post:', err);
      Alert.alert('Error', 'Something went wrong. Please try again later.');
    }
  };

  const switchTab = (newTab: string) => {
    if (newTab === activeTab) return;
    
    // Reset loading flags when switching tabs to allow fresh loading
    if (newTab === 'posts') {
      hasLoadedPostsRef.current = false;
    } else if (newTab === 'saved') {
      hasLoadedBookmarksRef.current = false;
    }
    
    // Fade out current content
    Animated.timing(tabContentOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      // Change tab
      setActiveTab(newTab);
      
      // Fade in new content
      Animated.timing(tabContentOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[GlobalStyles.safeArea, styles.safeContainer, themeStyles.background]}>
        <StatusBar
          backgroundColor={themeColors.neutral.background}
          barStyle={isDarkMode ? "light-content" : "dark-content"}
        />
        <ScrollView style={[styles.container, themeStyles.background]}>
          <View style={styles.header}>
            <ShimmerPlaceholder width={40} height={40} borderRadius={20} sharedShimmerValue={initialLoadingShimmer} />
            <ShimmerPlaceholder width={100} height={32} borderRadius={16} sharedShimmerValue={initialLoadingShimmer} />
          </View>

          <ProfileHeaderSkeleton />

          <View style={[styles.tabsContainer, { borderColor: themeColors.neutral.border, backgroundColor: themeColors.neutral.card }]}>
            <View style={styles.tabsRow}>
              <View style={styles.tab}>
                <ShimmerPlaceholder width={80} height={36} borderRadius={8} sharedShimmerValue={initialLoadingShimmer} />
              </View>
              <View style={styles.tab}>
                <ShimmerPlaceholder width={80} height={36} borderRadius={8} sharedShimmerValue={initialLoadingShimmer} />
              </View>
              <View style={styles.tab}>
                <ShimmerPlaceholder width={80} height={36} borderRadius={8} sharedShimmerValue={initialLoadingShimmer} />
              </View>
            </View>
          </View>

          {/* Content skeleton */}
          <PostsGridSkeleton />
      </ScrollView>
    </SafeAreaView>
  );
}

  // Bookmark content is now handled in renderTabContent() function

  // For other tabs, use ScrollView
  return (
    <>
      <SafeAreaView style={[GlobalStyles.safeArea, styles.safeContainer, themeStyles.background]}>
      <StatusBar
        backgroundColor={themeColors.neutral.background}
        barStyle={isDarkMode ? "light-content" : "dark-content"}
      />
      <ScrollView
        ref={scrollViewRef}
        style={[styles.container, themeStyles.background]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: PROFILE_SCROLL_BOTTOM_PADDING }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        onScroll={(event) => {
          savedScrollPosition.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {/* Header with profile actions */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={[styles.iconButton, themeStyles.card]} onPress={handleSettings}>
              <Settings size={16} color={themeColors.neutral.text} />
            </TouchableOpacity>
            
            <WalletButton
              onPress={handleWalletPress}
              showBalance={true}
              size="small"
              style={styles.walletButton}
            />
          </View>
          
          <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
            <Edit size={14} color="white" style={styles.editIcon} />
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Profile information */}
        <View style={styles.profileInfo}>
          <TouchableOpacity activeOpacity={0.8}>
            <EnhancedAvatar
              avatarUrl={profile?.avatar_url}
              userId={profile?.id}
              fullName={profile?.full_name}
              username={profile?.username}
              size={60}
              isDarkMode={isDarkMode}
              showBorder={true}
              showBadges={false}
            />
          </TouchableOpacity>
          
          <View style={styles.nameContainer}>
            <View style={styles.nameAndBadgesRow}>
              <Text style={[styles.name, themeStyles.text]}>
                {getSafeDisplayName(profile?.username, profile?.full_name) || 'Your Name'}
              </Text>
              {isProfileVerified(profile) && (
                <VerifiedBadge size="medium" showText={false} style={styles.verifiedBadgeContainer} />
              )}
              {userBadges && userBadges.length > 0 && (
                <UserBadgesList badges={userBadges} size="small" />
              )}
            </View>
          </View>
          
          {/* Marital Status (Age removed from display) */}
          {profile?.marital_status && (
            <View style={styles.ageMaritalContainer}>
              <View style={[styles.maritalContainer, { backgroundColor: 'rgba(0,0,0,0.05)' }]}>
                <Text style={[styles.maritalText, themeStyles.text]}>
                  {profile.marital_status.charAt(0).toUpperCase() + profile.marital_status.slice(1).replace('_', ' ')}
                </Text>
              </View>
            </View>
          )}
          
          {profile?.location && (
            <View style={styles.locationContainer}>
              <MapPin size={14} color={themeColors.neutral.subtext} />
              <Text style={[styles.locationText, themeStyles.subtext]}>{profile.location}</Text>
              <View style={[styles.gpsVerifiedBadge, { backgroundColor: themeColors.success.main }]}>
                <Text style={styles.gpsVerifiedText}>GPS Verified</Text>
              </View>
            </View>
          )}

           {/* Follow Stats Card */}
           {profile?.id && (
             <FollowStatsCard
               userId={profile.id}
               onFollowersPress={() => {
                 setFollowersModalTab('followers');
                 setShowFollowersModal(true);
               }}
               onFollowingPress={() => {
                 setFollowersModalTab('following');
                 setShowFollowersModal(true);
               }}
               style={styles.followStatsCard}
               refreshTrigger={followersRefreshTrigger}
             />
           )}

           
          
          {/* Auto-detected Country */}
          {profile?.country && (
            <View style={styles.countryContainer}>
              <Text style={[styles.countryText, themeStyles.text]}>
                📍 {profile.country}
              </Text>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>✓ Verified</Text>
              </View>
            </View>
          )}
          
          {profile?.bio && (
            <View style={styles.bioContainer}>
              <Text style={[styles.bio, themeStyles.text]}>
                {profile.bio.length > 90 ? `${profile.bio.substring(0, 90)}...` : profile.bio}
              </Text>
              {profile.bio.length > 90 && (
                <Text style={[styles.bioLength, themeStyles.subtext]}>
                  {profile.bio.length}/90 words
                </Text>
              )}
            </View>
          )}
          
          {/* Interests Section */}
          {processInterests(profile || {}).length > 0 && (
            <View style={styles.interestsSection}>
              <Text style={[styles.sectionTitle, themeStyles.text]}>Interests</Text>
          <View style={styles.interestsContainer}>
              {processInterests(profile || {}).map((interest, index) => (
                  <View key={`${interest}-${index}`} style={[GlobalStyles.pill, styles.interestPillItem]}>
                    <Text style={[GlobalStyles.pillText, styles.interestPillText, { color: '#FFFFFF' }]}>{interest}</Text>
                  </View>
                ))}
          </View>
            </View>
          )}

        </View>

        {/* Content tabs */}
        <View style={[styles.tabsContainer, {
          borderColor: themeColors.neutral.border,
          backgroundColor: themeColors.neutral.card
        }]}>
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
              onPress={() => switchTab('posts')}
            >
              <ImageIcon size={16} color={activeTab === 'posts' ? 'white' : themeColors.neutral.subtext} />
              <Text
                style={[
                  styles.tabText,
                  themeStyles.subtext,
                  activeTab === 'posts' && [styles.activeTabText, { color: 'white' }],
                ]}
              >
                Posts
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tab, activeTab === 'saved' && styles.activeTab]}
              onPress={() => switchTab('saved')}
            >
              <Bookmark size={16} color={activeTab === 'saved' ? 'white' : themeColors.neutral.subtext} />
              <Text
                style={[
                  styles.tabText,
                  themeStyles.subtext,
                  activeTab === 'saved' && [styles.activeTabText, { color: 'white' }],
                ]}
              >
                Bookmarks
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab content */}
        <Animated.View style={{ opacity: tabContentOpacity }}>
          {renderTabContent()}
        </Animated.View>

      </ScrollView>

      {/* Video modal removed - videos now play inline on post detail screen */}


      {/* Followers Modal */}
      {profile?.id && (
        <FollowersModal
          visible={showFollowersModal}
          onClose={() => {
            setShowFollowersModal(false);
            // Refresh profile data when modal closes to update follower counts
            refreshFollowersData();
          }}
          userId={profile.id}
          initialTab={followersModalTab}
          refreshTrigger={followersRefreshTrigger}
          onDataChange={() => {
            // Refresh profile data immediately when follow/unfollow happens
            refreshFollowersData();
          }}
        />
      )}

      {/* Wallet Modal */}
      <WalletModalWithDrag
        visible={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        themeColors={themeColors}
        onRedeem={() => {
          log('🔄 [WALLET] Redeem button pressed');
          setShowWalletModal(false);
          // Open redemption modal
          setTimeout(() => {
            setShowRedemptionModal(true);
          }, 300);
        }}
      />

      {/* Redemption Modal */}
      <Modal
        visible={showRedemptionModal}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          log('🔄 [REDEEM] Redemption modal onRequestClose called');
          setShowRedemptionModal(false);
        }}
      >
        <RedemptionScreen onClose={() => {
          log('🔄 [REDEEM] Redemption screen close button pressed');
          setShowRedemptionModal(false);
        }} />
      </Modal>

      {/* Loading overlay for redemption modal */}
      {redemptionModalLoading && (
        <Modal
          visible={redemptionModalLoading}
          transparent={true}
          animationType="fade"
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <View style={{
              backgroundColor: 'white',
              padding: 20,
              borderRadius: 10,
              alignItems: 'center'
            }}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={{ marginTop: 10, color: '#000' }}>Opening redemption...</Text>
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
    paddingTop: Platform.OS === 'android' ? STATUSBAR_HEIGHT : 0,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
    // Remove paddingBottom since it's handled by the tab layout
  },
  scrollContent: {
    paddingBottom: Spacing.xl, // Reduced padding since tab bar handles spacing
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletButton: {
    marginLeft: 0,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary.main,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    ...Shadow.sm,
  },
  editIcon: {
    marginRight: Spacing.xs,
  },
  editText: {
    color: 'white',
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.caption,
  },
  profileInfo: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  followStatsCard: {
    marginHorizontal: 16,
    marginBottom: 6,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.neutral.background,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  nameContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    marginTop: 8,
  },
  nameAndBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: Colors.neutral.text,
    fontWeight: '700',
  },
  verifiedBadgeContainer: {
    marginLeft: 0,
  },
  ageMaritalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    gap: 6,
  },
  ageContainer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  ageText: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.text,
    fontWeight: '500',
  },
  maritalContainer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  maritalText: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.text,
    fontWeight: '500',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
    marginLeft: 4,
    fontWeight: '400',
  },
  gpsVerifiedBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  gpsVerifiedText: {
    fontSize: 9,
    fontFamily: FontFamily.bold,
    color: 'white',
  },
  countryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  countryText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.text,
  },
  verifiedBadge: {
    backgroundColor: Colors.success.main,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  verifiedText: {
    fontSize: 10,
    fontFamily: FontFamily.bold,
    color: 'white',
  },
  bioContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  bio: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
    lineHeight: 18,
  },
  bioLength: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
    textAlign: 'center',
    opacity: 0.7,
  },
  sectionTitle: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.text,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-start',
  },
  interestsSection: {
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.xs,
  },
  interestPillItem: {
    backgroundColor: Colors.primary.main,
    borderColor: Colors.primary.main,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  interestPillText: {
    fontSize: 12,
    letterSpacing: -0.2,
  },
  tabsContainer: {
    marginHorizontal: 18,
    borderRadius: 10,
    padding: 3,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  activeTab: {
    backgroundColor: Colors.primary.main,
    ...Shadow.sm,
  },
  tabText: {
    marginLeft: 6,
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.subtext,
    fontWeight: '500',
  },
  activeTabText: {
    color: 'white',
    fontFamily: FontFamily.bold,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  textPostItem: {
    paddingHorizontal: 20,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  textPostContent: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
  },
  textPostMeta: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    marginTop: 4,
  },
  postItem: {
    width: (width - 40 - 4) / 3,
    height: (width - 40 - 4) / 3,
    marginRight: 2,
    marginBottom: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  postOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: Spacing.xs,
  },
  postLocation: {
    color: 'white',
    fontSize: FontSizes.tiny,
    fontFamily: FontFamily.medium,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: Spacing.lg,
  },
  emptyStateText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  signInButton: {
    backgroundColor: Colors.primary.main,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
    marginTop: Spacing.md,
  },
  signInButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.card,
  },
  savedContainer: {
    flex: 1,
    paddingBottom: Spacing.md, // Reduced padding since tab bar handles spacing
  },
  bookmarkFiltersContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.border,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.neutral.background,
  },
  activeFilterTab: {
    backgroundColor: Colors.primary.light,
  },
  filterTabText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.caption,
    color: Colors.neutral.text,
    marginLeft: Spacing.xs,
  },
  activeFilterTabText: {
    color: Colors.primary.main,
  },
  bookmarksList: {
    padding: Spacing.md,
    flexGrow: 1,
    paddingBottom: Spacing.xl, // Reduced padding since tab bar handles spacing
  },
  businessBookmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  businessBookmarkAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.neutral.surface,
    marginRight: Spacing.sm,
  },
  businessBookmarkAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  businessBookmarkName: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.body,
    marginBottom: 2,
  },
  businessBookmarkSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.caption,
    marginBottom: 2,
  },
  businessBookmarkLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.caption,
  },
  businessBookmarkActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  businessBookmarkButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary.main,
  },
  businessBookmarkButtonText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.caption,
    color: Colors.primary.main,
  },
  loadingText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSizes.body,
    color: Colors.neutral.subtext,
    marginTop: Spacing.md,
  },
  bookmarkCard: {
    backgroundColor: Colors.neutral.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.neutral.border,
  },
  bookmarkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs + 2,
  },
  bookmarkHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  bookmarkTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookmarkType: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.subtext,
    marginLeft: 4,
  },
  removeButton: {
    padding: 4,
  },
  bookmarkContent: {
    marginBottom: Spacing.xs + 2,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  authorName: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
    color: Colors.neutral.text,
    marginRight: 4,
  },
  chatName: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
  },
  bookmarkText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.text,
    lineHeight: 18,
    marginTop: 2,
  },
  bookmarkDate: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
  },
  viewButton: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  viewButtonText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.semibold,
  },
  bookmarkImage: {
    width: '100%',
    height: 120,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
  },

  postTextPreview: {
    backgroundColor: Colors.neutral.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.neutral.border,
  },
  postIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  postIconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  playButtonContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postVideoPreview: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  postImageContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  videoDuration: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDurationText: {
    color: 'white',
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
  },
  multipleImagesIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  multipleImagesText: {
    color: 'white',
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
  },
  profileViewCountBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  profileViewCountText: {
    color: 'white',
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
  },
  // Video Modal Styles - Removed (videos now play inline on post detail screen)
  postTextContent: {
    color: Colors.primary.main,
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.caption,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  createPostButton: {
    backgroundColor: Colors.primary.main,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
    marginTop: Spacing.md,
  },
  createPostButtonText: {
    color: Colors.neutral.card,
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.body,
  },
  eventsContainer: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
  eventsGrid: {
    flexDirection: 'column',
    padding: Spacing.sm,
  },
  eventFilterTabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  eventFilterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  activeEventFilterTab: {
    borderColor: Colors.primary.main,
  },
  eventFilterTabText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.caption,
    marginLeft: Spacing.xs,
  },
  activeEventFilterTabText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bold,
  },
  eventItem: {
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    ...Shadow.sm,
  },
  eventContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventImage: {
    width: 80,
    height: 80,
  },
  eventImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventDetails: {
    flex: 1,
    padding: Spacing.md,
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  eventTitle: {
    fontSize: FontSizes.subhead,
    fontFamily: FontFamily.bold,
    flex: 1,
  },
  deletedBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  deletedBadgeText: {
    fontSize: FontSizes.caption - 2,
    fontFamily: FontFamily.semibold,
  },
  eventInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  eventInfoText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    marginLeft: Spacing.xs,
  },
  
  // Animated Empty State Styles (compact)
  emptyStateIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  emptyStateIconGlow: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    opacity: 0.1,
  },
  emptyStateTitle: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  emptyStateButton: {
    backgroundColor: Colors.primary.main,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.pill,
    marginTop: Spacing.md,
    ...Shadow.sm,
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bold,
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  
  // Enhanced loading styles
  enhancedLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  emptyStateText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  
  tabBarContainer: {
    // ... existing code ...
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  deletedModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadow.lg,
    position: 'relative',
  },
  deletedModalCloseButton: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deletedModalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  deletedModalTitle: {
    fontSize: FontSizes.title,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  deletedModalMessage: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    lineHeight: 22,
  },
  deletedModalNote: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    fontStyle: 'italic',
  },
  deletedModalButton: {
    width: '100%',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletedModalButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.semibold,
  },
});