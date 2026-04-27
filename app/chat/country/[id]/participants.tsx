import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  Platform,
  Animated,
  Easing
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Users, CircleUser, UserPlus, X } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import ChatEmptyState from '../../../../components/ChatEmptyState';
import { supabase } from '../../../../utils/supabase';
import { Colors, getThemeColors } from '../../../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, GlobalStyles, Shadow } from '../../../../constants/Theme';
import useAuth from '../../../../hooks/useAuth';
import { 
  trackOnlineUsers,
  stopTrackingOnlineUsers,
  OnlineUser,
  getOnlineUsers
} from '../../../../utils/countryChat';
import { useTheme } from '../../../../contexts/ThemeContext';
import EnhancedAvatar from '../../../../components/EnhancedAvatar';
import { log, warn, error } from '../../../../utils/productionLogger';


// Types
interface Participant {
  id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string | null;
  is_online?: boolean;
  last_active?: string;
  bio?: string;
}

// Helper function to generate DiceBear URL
const generateDiceBearUrl = (style: string, seed?: string) => {
  const userSeed = seed || 'default';
  return `https://api.dicebear.com/9.x/${style}/png?seed=${userSeed}&size=120`;
};

// Helper function to get the correct avatar URL
const getAvatarUrl = (avatarUrl?: string | null, userId?: string) => {
  if (!avatarUrl) return null;
  
  // Handle DiceBear avatars
  if (avatarUrl.startsWith('dicebear:')) {
    const avatarData = avatarUrl.replace('dicebear:', '');
    if (avatarData.includes(':')) {
      const [style, seed] = avatarData.split(':');
      return generateDiceBearUrl(style, seed);
    } else {
      // Handle old format (style only) - use userId as seed
      return generateDiceBearUrl(avatarData, userId);
    }
  }
  
  // Return regular URL as-is
  return avatarUrl;
};

export default function OnlineUsersScreen() {
  const params = useLocalSearchParams();
  const roomId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roomName, setRoomName] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  // Add a state to track if we've successfully loaded profiles at least once
  const [hasLoadedProfilesOnce, setHasLoadedProfilesOnce] = useState(false);
  // We no longer need this since we'll only show online users
  const [hideOfflineUsers, setHideOfflineUsers] = useState(true);
  // Add state for profile navigation loading animation
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  // Animation values for profile loading
  const loadingOpacity = useRef(new Animated.Value(0)).current;
  const loadingScale = useRef(new Animated.Value(0.8)).current;
  // Dots animation values
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;
  const dot1Scale = useRef(new Animated.Value(1)).current;
  const dot2Scale = useRef(new Animated.Value(1)).current;
  const dot3Scale = useRef(new Animated.Value(1)).current;
  
  const presenceChannelRef = useRef<any>(null);
  // Use a ref to track participant IDs without causing re-renders
  const participantIdsRef = useRef<string[]>([]);
  // Ref to store the last online users to prevent quick flickering
  const lastOnlineUsersRef = useRef<string[]>([]);
  // Ref for debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track if we've already loaded data (to prevent reload on navigation back)
  const hasLoadedDataRef = useRef<boolean>(false);
  // Ref to track consecutive empty updates
  const emptyUpdatesCountRef = useRef(0);



  // Loading animation component - redesigned with modern UI
  const LoadingAnimation = () => {
    // Animation values
    const loadingDotOpacity1 = useRef(new Animated.Value(0.4)).current;
    const loadingDotOpacity2 = useRef(new Animated.Value(0.4)).current;
    const loadingDotOpacity3 = useRef(new Animated.Value(0.4)).current;
    const loadingDotScale1 = useRef(new Animated.Value(1)).current;
    const loadingDotScale2 = useRef(new Animated.Value(1)).current;
    const loadingDotScale3 = useRef(new Animated.Value(1)).current;
    
    const pulseValue = useRef(new Animated.Value(0)).current;
    const iconScale = useRef(new Animated.Value(1)).current;
    
    useEffect(() => {
      // Create a more sophisticated dots animation with scale
      const createDotAnimation = (dotOpacity: Animated.Value, dotScale: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
              Animated.timing(dotOpacity, {
                toValue: 1,
                duration: 600,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true
              }),
              Animated.spring(dotScale, {
                toValue: 1.4,
                tension: 50,
                friction: 7,
                useNativeDriver: true
              })
            ]),
            Animated.parallel([
              Animated.timing(dotOpacity, {
                toValue: 0.4,
                duration: 600,
                easing: Easing.in(Easing.ease),
                useNativeDriver: true
              }),
              Animated.spring(dotScale, {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true
              })
            ])
          ])
        );
      };
      
      // Start dot animations
      createDotAnimation(loadingDotOpacity1, loadingDotScale1, 0).start();
      createDotAnimation(loadingDotOpacity2, loadingDotScale2, 200).start();
      createDotAnimation(loadingDotOpacity3, loadingDotScale3, 400).start();
      
      // Create a subtle pulse animation for the icon background
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseValue, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(pulseValue, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      ).start();
      
      // Create a gentle scale animation for the icon
      Animated.loop(
        Animated.sequence([
          Animated.timing(iconScale, {
            toValue: 1.1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(iconScale, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      ).start();
      
    }, []);
    
    // Interpolate pulse for opacity
    const pulseOpacity = pulseValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.6]
    });
    
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.neutral.background }]}>
        {/* Close Button */}
        <TouchableOpacity
          style={[styles.loadingCloseButton, {
            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            top: insets.top + 16,
          }]}
          onPress={() => {
            setLoading(false);
            router.back();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={20} color={themeColors.neutral.text} strokeWidth={2.5} />
        </TouchableOpacity>
        
        <View style={styles.loadingContent}>
          {/* Title */}
          <Text style={[styles.loadingTitle, { color: themeColors.neutral.text }]}>
            Loading Users
          </Text>
          
          {/* Icon Container with modern design */}
          <View style={styles.loadingIconContainer}>
            {/* Pulsing background circle */}
            <Animated.View 
              style={[
                styles.loadingIconBackground,
                { 
                  backgroundColor: themeColors.primary.main,
                  opacity: pulseOpacity,
                  transform: [{ scale: iconScale }]
                }
              ]} 
            />
            {/* Icon with scale animation */}
            <Animated.View
              style={{
                transform: [{ scale: iconScale }]
              }}
            >
              <Users size={40} color={themeColors.primary.main} strokeWidth={2} />
            </Animated.View>
          </View>
        
          {/* Modern loading dots */}
          <View style={styles.loadingDotsContainer}>
            <Animated.View 
              style={[
                styles.loadingDot,
                { 
                  backgroundColor: themeColors.primary.main,
                  opacity: loadingDotOpacity1,
                  transform: [{ scale: loadingDotScale1 }]
                }
              ]} 
            />
            <Animated.View 
              style={[
                styles.loadingDot,
                { 
                  backgroundColor: themeColors.primary.main,
                  opacity: loadingDotOpacity2,
                  transform: [{ scale: loadingDotScale2 }]
                }
              ]} 
            />
            <Animated.View 
              style={[
                styles.loadingDot,
                { 
                  backgroundColor: themeColors.primary.main,
                  opacity: loadingDotOpacity3,
                  transform: [{ scale: loadingDotScale3 }]
                }
              ]} 
            />
          </View>
        </View>
      </View>
    );
  };

  // Update the ref whenever participants change
  useEffect(() => {
    participantIdsRef.current = participants.map(p => p.id);
  }, [participants]);
  
  // First, prefetch online users - only on initial mount or when roomId changes
  useEffect(() => {
    if (!roomId) return;
    
    // Don't reload if we already have data (e.g., when navigating back from profile)
    if (hasLoadedDataRef.current) {
      log(`[ParticipantsScreen] Already have data, skipping reload`);
      setLoading(false);
      if (!initialLoadComplete) {
        setInitialLoadComplete(true);
      }
      return;
    }
    
    const prefetchOnlineUsers = async () => {
      try {
        setLoading(true);
        log(`[ParticipantsScreen] Prefetching participants for room ${roomId}`);
        
        // Get the room name for the header
        const { data: room } = await supabase
          .from('chat_rooms')
          .select('name')
          .eq('id', roomId)
          .single();
        
        if (room) {
          setRoomName(room.name);
        }
        
        // Only proceed if we have a logged-in user
        if (!user) {
          log('[ParticipantsScreen] No user logged in, skipping prefetch');
          setInitialLoadComplete(true);
          setLoading(false);
          return;
        }
        
        // Get user information for presence - fetch username from profiles table
        const userId = user.id;
        
        // Fetch username from profiles table (same as community posts)
        let username = 'User';
        let avatarUrl: string | undefined;
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', userId)
            .single();
          
          if (profile?.username) {
            username = profile.username;
          } else {
            // Fallback to user_metadata or email if profile doesn't have username
            username = user.user_metadata?.username || user.email?.split('@')[0] || 'User';
          }
          
          if (profile?.avatar_url) {
            avatarUrl = profile.avatar_url;
          } else {
            avatarUrl = user.user_metadata?.avatar_url;
          }
        } catch (error) {
          error('[ParticipantsScreen] Error fetching profile for username:', error);
          // Fallback to user_metadata or email
          username = user.user_metadata?.username || user.email?.split('@')[0] || 'User';
          avatarUrl = user.user_metadata?.avatar_url;
        }
        
        log(`[ParticipantsScreen] Getting online users as ${username}`);
        
        // Make sure to pass current user info to the getOnlineUsers function
        const currentOnlineUsers = await getOnlineUsers(roomId, userId, username, avatarUrl);
        log(`[ParticipantsScreen] Received ${currentOnlineUsers?.length || 0} online users`);
        setOnlineUsers(currentOnlineUsers);
        
        // Create a set of online user IDs for faster lookups
        const onlineUserIdSet = new Set(currentOnlineUsers.map(u => u.id));
        
        // Auto-cleanup old participants for security (remove users inactive for more than 24 hours)
        const cleanupCutoff = new Date();
        cleanupCutoff.setHours(cleanupCutoff.getHours() - 24); // 24 hours ago
        
        log(`[ParticipantsScreen] Cleaning up participants inactive since ${cleanupCutoff.toISOString()}`);
        
        // Get all participant user IDs first
        const { data: allParticipants, error: allParticipantsError } = await supabase
          .from('country_chat_participants')
          .select('user_id')
          .eq('country_chat_id', roomId);
          
        if (allParticipantsError) {
          error('Error fetching all participants:', allParticipantsError);
        }
        
        // If we have participants, check their last_active status and clean up old ones
        if (allParticipants && (allParticipants?.length || 0) > 0) {
          const participantIds = allParticipants.map(p => p.user_id);
          
          // Get profiles to check last_active times
          const { data: profilesForCleanup, error: profilesError } = await supabase
            .from('profiles')
            .select('id, last_active')
            .in('id', participantIds);
            
          if (!profilesError && profilesForCleanup) {
            // Find users who haven't been active in the last 24 hours
            const inactiveUserIds = profilesForCleanup
              .filter(profile => {
                if (!profile.last_active) return true; // No last_active means very old
                const lastActive = new Date(profile.last_active);
                return lastActive < cleanupCutoff;
              })
              .map(profile => profile.id);
              
            // Remove inactive participants
            if ((inactiveUserIds?.length || 0) > 0) {
              log(`[ParticipantsScreen] Removing ${inactiveUserIds?.length || 0} inactive participants`);
              const { error: cleanupError } = await supabase
                .from('country_chat_participants')
                .delete()
                .eq('country_chat_id', roomId)
                .in('user_id', inactiveUserIds);
                
              if (cleanupError) {
                error('Error cleaning up old participants:', cleanupError);
              } else {
                log('[ParticipantsScreen] Successfully cleaned up old participants');
              }
            }
          }
        }
        
        // Fetch remaining participants (after cleanup)
        const { data: chatParticipants, error: participantsError } = await supabase
          .from('country_chat_participants')
          .select('user_id')
          .eq('country_chat_id', roomId);
          
        if (participantsError) {
          error('Error fetching chat participants:', participantsError);
        }
        
        // Get all user IDs from participants
        const allParticipantIds = chatParticipants ? chatParticipants.map(p => p.user_id) : [];
        log(`[ParticipantsScreen] Found ${allParticipantIds?.length || 0} participants in chat`);
        
        // If we have participant IDs, fetch their profiles
        if ((allParticipantIds?.length || 0) > 0) {
          try {
            const { data: allProfiles, error: profilesError } = await supabase
              .from('profiles')
              .select('id, username, full_name, avatar_url, last_active, bio')
              .in('id', allParticipantIds);
              
            if (profilesError) {
              error('Error fetching all profiles:', profilesError);
            } else if (allProfiles && (allProfiles?.length || 0) > 0) {
              log(`[ParticipantsScreen] Found ${allProfiles?.length || 0} profiles for participants`);
              
              // Transform profiles and mark online status correctly
              const formattedProfiles = allProfiles.map(profile => ({
                id: profile.id,
                username: profile.username,
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
                is_online: onlineUserIdSet.has(profile.id), // Mark those in online set as online
                last_active: profile.last_active,
                bio: profile.bio
              }));
              
              setParticipants(formattedProfiles);
              
              // Mark that we've successfully loaded profiles at least once
              if ((formattedProfiles?.length || 0) > 0) {
                setHasLoadedProfilesOnce(true);
                // Reset empty updates counter since we have good data
                emptyUpdatesCountRef.current = 0;
              }
            } else {
              log('[ParticipantsScreen] No profiles found for participants');
            }
          } catch (fetchError) {
            error('Error in profile fetch:', fetchError);
          }
        } else {
          log('[ParticipantsScreen] No participants found in chat, showing online users only');
          // If we don't have participant records, use just online users
          const { data: onlineProfiles, error } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, last_active, bio')
            .in('id', currentOnlineUsers.map(u => u.id));
            
          if (error) {
            error('Error fetching online profiles:', error);
          } else if (onlineProfiles && (onlineProfiles?.length || 0) > 0) {
            log(`[ParticipantsScreen] Found ${onlineProfiles?.length || 0} online profiles`);
            
            // Transform profiles and mark online status correctly
            const formattedProfiles = onlineProfiles.map(profile => ({
              id: profile.id,
              username: profile.username,
              full_name: profile.full_name,
              avatar_url: profile.avatar_url,
              is_online: true, // All these are online
              last_active: profile.last_active,
              bio: profile.bio
            }));
            
            setParticipants(formattedProfiles);
            
            // Mark that we've successfully loaded profiles at least once
            if ((formattedProfiles?.length || 0) > 0) {
              setHasLoadedProfilesOnce(true);
              // Reset empty updates counter since we have good data
              emptyUpdatesCountRef.current = 0;
            }
          }
        }
        
        // Mark initial load as complete
        setInitialLoadComplete(true);
        hasLoadedDataRef.current = true;
      } catch (error) {
        error('Error prefetching participants:', error);
        setInitialLoadComplete(true);
        hasLoadedDataRef.current = true;
      } finally {
        setLoading(false);
      }
    };
    
    prefetchOnlineUsers();
  }, [roomId, user]);
  
  // After initial load, set up real-time presence tracking
  useEffect(() => {
    if (!roomId || !initialLoadComplete || !user) return;
    
    // If we already have a presence channel, don't create another one
    if (presenceChannelRef.current) {
      log('[ParticipantsScreen] Presence channel already exists, skipping setup');
      return;
    }
    
    log(`[ParticipantsScreen] Setting up real-time presence tracking for room ${roomId}`);
    
    // Setup real-time presence tracking for online users - fetch username from profiles table
    const fetchPresenceUsername = async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', user.id)
          .single();
        
        if (profile?.username) {
          return {
            username: profile.username,
            avatarUrl: profile.avatar_url || user.user_metadata?.avatar_url,
          };
        }
      } catch (error) {
        error('[ParticipantsScreen] Error fetching profile for presence:', error);
      }
      // Fallback to user_metadata or email
      return {
        username: user.user_metadata?.username || user.email?.split('@')[0] || 'User',
        avatarUrl: user.user_metadata?.avatar_url,
      };
    };
    
    // Fetch username and then track online users
    fetchPresenceUsername().then(({ username, avatarUrl }) => {
      log(`[ParticipantsScreen] Tracking presence as ${username}`);
      
      const presenceChannel = trackOnlineUsers(
        roomId, 
        user.id,
        username,
        avatarUrl,
      async (users) => {
        // Update online users state with debounce for smoother UI
        log(`[ParticipantsScreen] Got presence update with ${users?.length || 0} users`);
        
        // Clear any previous debounce timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        
        // Set a short debounce to prevent UI flickering on rapid presence changes
        debounceTimerRef.current = setTimeout(async () => {
          // Check if new data is different from existing data before updating
          const newOnlineUserIds = users.map(u => u.id).sort();
          const currentOnlineUserIds = lastOnlineUsersRef.current;
          
          // Helper function to check if arrays are equal
          const areArraysEqual = (a, b) => {
            if ((a?.length || 0) !== (b?.length || 0)) return false;
            for (let i = 0; i < (a?.length || 0); i++) {
              if (a[i] !== b[i]) return false;
            }
            return true;
          };
          
          // If there's no change, skip the update
          if (areArraysEqual(newOnlineUserIds, currentOnlineUserIds)) {
            log('[ParticipantsScreen] Skipping update, no change in online users');
            return;
          }
          
          // Update our reference of current online users
          lastOnlineUsersRef.current = newOnlineUserIds;
          
          // Update the state with the new list of online users
          setOnlineUsers(users);
          
          // Update the online status of participants
          // Find any new users that aren't in our participants list yet
          const existingParticipantIds = new Set(participantIdsRef.current);
          const newParticipantIds = users.filter(u => !existingParticipantIds.has(u.id)).map(u => u.id);
          
          // If we have new participants, fetch their profiles
          if ((newParticipantIds?.length || 0) > 0) {
            log(`[ParticipantsScreen] Fetching profiles for ${newParticipantIds?.length || 0} new participants`);
            
            // Add users to the participants table as they come online
            newParticipantIds.forEach(async (userId) => {
              try {
                // Add the user to the participants table
                await supabase
                  .from('country_chat_participants')
                  .upsert({
                    user_id: userId,
                    country_chat_id: roomId,
                    joined_at: new Date().toISOString()
                  });
                log(`[ParticipantsScreen] Added user ${userId} to participants`);
              } catch (error) {
                error(`[ParticipantsScreen] Error adding user ${userId} to participants:`, error);
              }
            });
            
            // Fetch profiles for the new participants
            try {
              const { data: newProfiles, error } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url, last_active, bio')
                .in('id', newParticipantIds);
              
              if (error) {
                error('Error fetching new online profiles:', error);
              } else if (newProfiles && (newProfiles?.length || 0) > 0) {
                log(`[ParticipantsScreen] Found ${newProfiles?.length || 0} new profiles`);
                // Transform and add the new profiles
                const newFormattedProfiles = newProfiles.map(profile => ({
                  id: profile.id,
                  username: profile.username,
                  full_name: profile.full_name,
                  avatar_url: profile.avatar_url,
                  is_online: true,
                  last_active: profile.last_active,
                  bio: profile.bio
                }));
                
                // Add new profiles and update existing profiles' online status
                setParticipants(prevProfiles => {
                  // Create a set of online user IDs for faster lookups
                  const onlineUserIdSet = new Set(users.map(u => u.id));
                  
                  // Update existing profiles' online status
                  const updatedProfiles = prevProfiles.map(profile => ({
                    ...profile,
                    is_online: onlineUserIdSet.has(profile.id)
                  }));
                  
                  // Add new profiles
                  log(`[ParticipantsScreen] Adding ${newFormattedProfiles?.length || 0} new profiles to list`);
                  return [...updatedProfiles, ...newFormattedProfiles];
                });
              }
            } catch (error) {
              error('Error fetching new profiles:', error);
            }
          } else {
            // Just update online status for existing profiles
            log(`[ParticipantsScreen] Updating online status for existing profiles`);
            setParticipants(prevProfiles => {
              // Create a set of online user IDs for faster lookups
              const onlineUserIdSet = new Set(users.map(u => u.id));
              
              return prevProfiles.map(profile => ({
                ...profile,
                is_online: onlineUserIdSet.has(profile.id)
              }));
            });
          }
        }, 100); // Very short debounce to catch rapid updates
      }
      );
      
      // Save the channel reference for cleanup
      presenceChannelRef.current = presenceChannel;
    });
    
    return () => {
      // Clean up presence tracking when component unmounts
      if (presenceChannelRef.current) {
        log('[ParticipantsScreen] Cleaning up presence tracking');
        stopTrackingOnlineUsers(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
      
      // Clear any debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [roomId, initialLoadComplete, user]); // Removed participants dependency
  
  // Filter participants based on online status and search query
  const filteredParticipants = useMemo(() => {
    // Skip filtering by online status - show all participants regardless of status
    // Only filter by search query if one exists
    if (searchQuery) {
      return participants.filter(p => 
        (p.username?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (p.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase())
      );
    }
    
    // Return all participants
    return participants;
  }, [participants, searchQuery]);
  
  // Updated header title and subtitle
  const headerTitle = useMemo(() => {
    return `${roomName || 'Chat'} - All Participants`;
  }, [roomName]);
  
  const headerSubtitle = useMemo(() => {
    return `${participants?.length || 0} total (${onlineUsers?.length || 0} online)`;
  }, [(onlineUsers?.length || 0), (participants?.length || 0)]);
  
  // Navigate to a user's profile with loading animation
  const navigateToUserProfile = (userId: string) => {
    setSelectedUserId(userId);
    setProfileLoading(true);
    
    // Start fade-in animation
    Animated.parallel([
      Animated.timing(loadingOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(loadingScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      })
    ]).start();
    
    // Start loading dots animation
    const animateDot = (opacityValue: Animated.Value, scaleValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(opacityValue, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(scaleValue, {
              toValue: 1.3,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(opacityValue, {
              toValue: 0.3,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(scaleValue, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
    };
    
    // Start the dot animations
    const dot1Animation = animateDot(dot1Opacity, dot1Scale, 0);
    const dot2Animation = animateDot(dot2Opacity, dot2Scale, 150);
    const dot3Animation = animateDot(dot3Opacity, dot3Scale, 300);
    
    dot1Animation.start();
    dot2Animation.start();
    dot3Animation.start();
    
    // Delay the actual navigation to show the animation
    setTimeout(() => {
      router.push(`/profile/${userId}`);
      
      // Stop animations
      dot1Animation.stop();
      dot2Animation.stop();
      dot3Animation.stop();
      
      // Reset animation values after a delay to ensure they're ready for next time
      setTimeout(() => {
        loadingOpacity.setValue(0);
        loadingScale.setValue(0.8);
        dot1Opacity.setValue(0.3);
        dot2Opacity.setValue(0.3);
        dot3Opacity.setValue(0.3);
        dot1Scale.setValue(1);
        dot2Scale.setValue(1);
        dot3Scale.setValue(1);
        setProfileLoading(false);
        setSelectedUserId(null);
      }, 300);
    }, 700);
  };
  
  // Time since last active
  const getLastActiveString = (lastActive?: string) => {
    if (!lastActive) return 'Never active';
    
    const lastActiveDate = new Date(lastActive);
    const now = new Date();
    const diffMs = now.getTime() - lastActiveDate.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return lastActiveDate.toLocaleDateString();
  };
  
  // Render a participant item - redesigned for premium Gen Z UI
  const renderParticipantItem = ({ item }: { item: Participant }) => {
    const avatarUrl = getAvatarUrl(item.avatar_url, item.id);
    const isCurrentUser = user && user.id === item.id;
    const isOnline = item.is_online || false;
    const isSelected = selectedUserId === item.id;
    
    return (
      <TouchableOpacity
        style={[
          styles.participantItem,
          { 
            backgroundColor: themeColors.neutral.background,
          },
          isSelected && [
            styles.selectedParticipantItem, 
            { backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)' }
          ]
        ]}
        onPress={() => navigateToUserProfile(item.id)}
        activeOpacity={0.7}
        disabled={profileLoading}
      >
        <View style={styles.participantAvatarContainer}>
          <EnhancedAvatar
            avatarUrl={item.avatar_url}
            userId={item.id}
            fullName={item.full_name}
            username={item.username}
            size={52}
            isDarkMode={isDarkMode}
            showOnlineIndicator={true}
            isOnline={isOnline}
            style={styles.participantAvatar}
          />
        </View>
        
        <View style={styles.participantInfo}>
          <View style={styles.participantNameRow}>
            <Text 
              style={[
                styles.participantName,
                { color: themeColors.neutral.text }
              ]}
              numberOfLines={1}
            >
              {item.username || item.full_name || 'Anonymous'}
            </Text>
            {isCurrentUser && (
              <View style={[
                styles.youBadge,
                { 
                  backgroundColor: isDarkMode ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)',
                }
              ]}>
                <Text style={[
                  styles.youBadgeText,
                  { color: isDarkMode ? '#C4B5FD' : '#8B5CF6' }
                ]}>you</Text>
              </View>
            )}
          </View>
          
          <View style={styles.participantMetaRow}>
            {item.bio ? (
              <Text 
                style={[
                  styles.participantBio,
                  { color: themeColors.neutral.subtext }
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.bio}
              </Text>
            ) : item.username ? (
              <Text 
                style={[
                  styles.participantUsername,
                  { color: themeColors.neutral.subtext }
                ]}
                numberOfLines={1}
              >
                @{item.username}
              </Text>
            ) : null}
          </View>
        </View>
        
        <View style={styles.participantStatus}>
          {isOnline ? (
            <View style={[
              styles.statusBadge,
              { backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)' }
            ]}>
              <View style={[
                styles.statusDot,
                { backgroundColor: '#22C55E' }
              ]} />
              <Text style={[
                styles.statusText,
                { color: '#22C55E' }
              ]}>online</Text>
            </View>
          ) : (
            <Text style={[
              styles.lastActiveText,
              { color: themeColors.neutral.subtext }
            ]}>
              {getLastActiveString(item.last_active)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[GlobalStyles.safeArea, { backgroundColor: themeColors.neutral.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      
      {loading ? (
        <View style={[styles.contentContainer, { backgroundColor: themeColors.neutral.background }]}>
          <LoadingAnimation />
        </View>
      ) : (
        <View style={[styles.contentContainer, { backgroundColor: themeColors.neutral.background }]}>
          <View style={[styles.screenHeader, { 
            backgroundColor: themeColors.neutral.background,
          }]}>
            <View style={[styles.headerContent, { paddingTop: insets.top + 4 }]}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => router.back()}
                disabled={profileLoading}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ChevronLeft size={24} color={themeColors.neutral.text} strokeWidth={2} />
              </TouchableOpacity>
              
              <View style={styles.headerTextContainer}>
                <Text style={[styles.screenTitle, { color: themeColors.neutral.text }]}>
                  {roomName || 'Chat'}
                </Text>
                <View style={styles.headerSubtitleRow}>
                  <Text style={[styles.participantsCount, { color: themeColors.neutral.subtext }]}>
                    {(participants?.length || 0)} {(participants?.length || 0) === 1 ? 'member' : 'members'}
                  </Text>
                  <View style={[styles.headerDot, { backgroundColor: themeColors.neutral.border }]} />
                  <View style={styles.onlineCountInline}>
                    <View style={[styles.onlineDotSmall, { backgroundColor: '#22C55E' }]} />
                    <Text style={[styles.onlineCountInlineText, { color: '#22C55E' }]}>
                      {(onlineUsers?.length || 0)} online
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
          
          {(onlineUsers?.length || 0) > 0 && (filteredParticipants?.length || 0) === 0 ? (
            <View style={[styles.loadingContainer, { backgroundColor: themeColors.neutral.background }]}>
              <Text style={[styles.loadingText, { color: themeColors.neutral.text }]}>
                Found {(onlineUsers?.length || 0)} active users{'\n'}
                Loading their profiles...
              </Text>
              <ActivityIndicator size="large" color={themeColors.primary.main} />
            </View>
          ) : (filteredParticipants?.length || 0) > 0 ? (
            <FlatList
              data={filteredParticipants}
              renderItem={renderParticipantItem}
              keyExtractor={item => item.id}
              contentContainerStyle={[styles.participantsList, { borderTopColor: themeColors.neutral.border }]}
              showsVerticalScrollIndicator={false}
              initialNumToRender={15}
              removeClippedSubviews={Platform.OS === 'android'}
              ListEmptyComponent={
                searchQuery ? (
                  <View style={[styles.emptySearchContainer, { backgroundColor: themeColors.neutral.background }]}>
                    <CircleUser size={40} color={themeColors.neutral.border} />
                    <Text style={[styles.emptySearchText, { color: themeColors.neutral.subtext }]}>
                      No active users found matching "{searchQuery}"
                    </Text>
                  </View>
                ) : null
              }
            />
          ) : (
            <ChatEmptyState
              title="No Users in Chatroom"
              message="There are currently no users active in this chat room. Be the first to start a conversation!"
              themeColors={themeColors}
              isInverted={false} // This is not in an inverted FlatList
            />
          )}
          
          {/* Profile loading overlay */}
          {profileLoading && (
            <Animated.View 
              style={[
                styles.profileLoadingOverlay,
                {
                  opacity: loadingOpacity,
                  transform: [{ scale: loadingScale }],
                  backgroundColor: 'rgba(0, 0, 0, 0.7)'
                }
              ]}
            >
              <View style={[styles.profileLoadingContent, { backgroundColor: themeColors.neutral.card }]}>
                <Animated.View style={{ transform: [{ scale: loadingScale }] }}>
                  {selectedUserId && (
                    <View style={styles.profileLoadingAvatar}>
                      {participants.find(p => p.id === selectedUserId)?.avatar_url ? (
                        <Image 
                          source={{ 
                            uri: getAvatarUrl(
                              participants.find(p => p.id === selectedUserId)?.avatar_url || null,
                              selectedUserId
                            ) 
                          }} 
                          style={styles.profileLoadingAvatarImage} 
                        />
                      ) : (
                        <View style={[styles.profileLoadingAvatarFallback, { backgroundColor: themeColors.neutral.background }]}>
                          <Text style={[styles.profileLoadingAvatarText, { color: themeColors.neutral.text }]}>
                            {(participants.find(p => p.id === selectedUserId)?.username || 
                              participants.find(p => p.id === selectedUserId)?.full_name || 
                              'U')[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </Animated.View>
                <View style={styles.loadingDots}>
                  <Animated.View 
                    style={[
                      styles.profileLoadingDot, 
                      { 
                        opacity: dot1Opacity, 
                        transform: [{ scale: dot1Scale }],
                        backgroundColor: themeColors.primary.main
                      }
                    ]} 
                  />
                  <Animated.View 
                    style={[
                      styles.profileLoadingDot, 
                      { 
                        opacity: dot2Opacity, 
                        transform: [{ scale: dot2Scale }],
                        backgroundColor: themeColors.primary.main
                      }
                    ]} 
                  />
                  <Animated.View 
                    style={[
                      styles.profileLoadingDot, 
                      { 
                        opacity: dot3Opacity, 
                        transform: [{ scale: dot3Scale }],
                        backgroundColor: themeColors.primary.main
                      }
                    ]} 
                  />
                </View>
                <Text style={[styles.profileLoadingText, { color: themeColors.neutral.text }]}>
                  Loading Profile...
                </Text>
              </View>
            </Animated.View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
  },
  screenHeader: {
    borderBottomWidth: 0,
    // borderBottomColor set inline for theme support
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    // paddingTop set inline with insets
  },
  backButton: {
    marginRight: Spacing.sm,
    padding: 4,
  },
  headerTextContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  screenTitle: {
    fontSize: 22,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.6,
    marginBottom: 4,
    lineHeight: 28,
    // color set inline
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  participantsCount: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    // color set inline
  },
  headerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 8,
  },
  onlineCountInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  onlineCountInlineText: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.1,
    // color set inline
  },
  onlineCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    // backgroundColor set inline
  },
  onlineCountText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.semibold,
    // color set inline
  },
  participantsList: {
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.xs,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
    borderBottomWidth: 0,
    minHeight: 72,
  },
  selectedParticipantItem: {
    // Color applied inline
  },
  participantAvatarContainer: {
    marginRight: Spacing.md,
  },
  participantAvatar: {
    position: 'relative',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.circle,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.circle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FontSizes.title,
    fontFamily: FontFamily.bold,
  },
  onlineIndicator: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: 'white',
  },
  participantInfo: {
    flex: 1,
    marginRight: Spacing.sm,
    justifyContent: 'center',
  },
  participantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  participantName: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    letterSpacing: -0.3,
    marginRight: Spacing.xs,
  },
  youBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.2,
  },
  participantMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantUsername: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    opacity: 0.6,
  },
  participantBio: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    opacity: 0.6,
  },
  participantStatus: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.1,
  },
  onlineStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.2,
  },
  lastActiveText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    textAlign: 'right',
  },
  awayStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  awayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  awayText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    position: 'relative',
  },
  loadingCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    } : {
      elevation: 3,
    }),
  },
  loadingContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  loadingTitle: {
    fontSize: FontSizes.title,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.xl,
    letterSpacing: 0.5,
  },
  loadingSubtitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  loadingIconContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  loadingIconBackground: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  loadingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
  loadingText: {
    fontSize: FontSizes.subhead,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  loadingDots: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  emptyTextContainer: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: FontSizes.title,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  emptyActionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  emptyActionText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginLeft: Spacing.xs,
  },
  emptySearchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    flex: 1,
    minHeight: 200,
  },
  emptySearchText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  profileLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 5,
  },
  profileLoadingContent: {
    width: '80%',
    maxWidth: 300,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.lg,
  },
  profileLoadingAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  profileLoadingAvatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  profileLoadingAvatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileLoadingAvatarText: {
    fontSize: 32,
    fontFamily: FontFamily.bold,
  },
  profileLoadingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
  profileLoadingText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginTop: Spacing.md,
  },
}); 