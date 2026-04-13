import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { supabase, Profile } from '../utils/supabase';
import { Colors, getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import ProfileCard from '../components/ProfileCard';
import { useRouter } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import useAuth from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';
import { log, warn, error } from '../utils/productionLogger';


type EventParticipantListProps = {
  eventId: string;
  initialParticipants?: Profile[];
  onParticipantCountChange?: (count: number) => void;
  insideScrollView?: boolean; // New prop to indicate if it's inside a ScrollView
  event?: any; // To check if a participant is the host
};

function EventParticipantList({
  eventId,
  initialParticipants = [],
  onParticipantCountChange,
  insideScrollView = false,
  event
}: EventParticipantListProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [participants, setParticipants] = useState<Profile[]>(initialParticipants);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Use refs to track previous values and avoid unnecessary updates
  const eventIdRef = useRef(eventId);
  const initialParticipantsRef = useRef(initialParticipants);
  const participantsCountRef = useRef((initialParticipants?.length || 0));
  
  // Notify parent of count change, but memoize the function to avoid causing re-renders
  const notifyCountChange = useCallback((newCount: number) => {
    if (onParticipantCountChange && newCount !== participantsCountRef.current) {
      participantsCountRef.current = newCount;
      onParticipantCountChange(newCount);
    }
  }, [onParticipantCountChange]);
  
  // Update initial participants only if they've actually changed
  useEffect(() => {
    if (initialParticipants !== initialParticipantsRef.current) {
      initialParticipantsRef.current = initialParticipants;
      if ((initialParticipants?.length || 0) > 0) {
        setParticipants(initialParticipants);
        setIsLoading(false);
        notifyCountChange((initialParticipants?.length || 0));
      }
    }
  }, [initialParticipants, notifyCountChange]);
  
  // Make sure to check initialParticipants when component mounts
  useEffect(() => {
    if ((initialParticipants?.length || 0) > 0) {
      setParticipants(initialParticipants);
      setIsLoading(false);
      notifyCountChange((initialParticipants?.length || 0));
    }
  }, []);
  
  useEffect(() => {
    // Fetch the participants
    fetchParticipants();
    
    // Retry after 2 seconds if no participants found on initial load
    const retryTimer = setTimeout(() => {
      if ((participants?.length || 0) === 0 && !loadError) {
        log('[EventParticipantList] No participants found after initial load, retrying...');
        fetchParticipants();
      }
    }, 2000);
    
    // Set up realtime subscription for participant changes
    const subscription = supabase
      .channel(`event-participants-${eventId}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'event_attendees',
          filter: `event_id=eq.${eventId}`
        }, 
        (payload) => {
          log('Participant list update:', payload);
          
          // UPDATE: Refresh the full list when there's any change
          fetchParticipants();
        }
      )
      .subscribe();
    
    // Clean up subscription
    return () => {
      clearTimeout(retryTimer);
      supabase.removeChannel(subscription);
    };
  }, [eventId]);
  
  // Fetch full list of participants - completely revised to debug and fix profile loading issues
  const fetchParticipants = async () => {
    try {
      setLoadError(null);
      
      // Don't show loading if we already have participants from props
      if ((participants?.length || 0) === 0) {
        setIsLoading(true);
      }
      
      log(`[EventParticipantList] Fetching participants for event: ${eventId}`);
      
      // STEP 1: First get the attendee records - this confirms which users have joined
      const { data: attendeeData, error: attendeeError } = await supabase
        .from('event_attendees')
        .select('*')
        .eq('event_id', eventId);
      
      if (attendeeError) {
        error('[EventParticipantList] Error fetching attendee records:', attendeeError);
        setLoadError('Failed to load participant data');
        return;
      }
      
      // Check if we got any attendees at all
      if (!attendeeData || (attendeeData?.length || 0) === 0) {
        log('[EventParticipantList] No attendees found');
        setParticipants([]);
        notifyCountChange(0);
        setIsLoading(false);
        return;
      }
      
      log(`[EventParticipantList] Found ${attendeeData?.length || 0} attendee records`);
      log('[EventParticipantList] Sample attendee:', JSON.stringify(attendeeData[0]));
      
      // STEP 2: Extract ALL the user IDs - we'll debug what these look like
      let userIds: string[] = [];
      
      // Try to extract user_id field
      if (attendeeData[0]?.user_id) {
        userIds = attendeeData.map(record => record.user_id);
        log('[EventParticipantList] Extracted user_ids:', userIds);
      } 
      // Fallback to profile_id if that's what exists
      else if (attendeeData[0]?.profile_id) {
        userIds = attendeeData.map(record => record.profile_id);
        log('[EventParticipantList] Extracted profile_ids:', userIds);
      }
      // Last resort - try to extract any ID-like fields
      else {
        log('[EventParticipantList] attendee record fields:', Object.keys(attendeeData[0]));
        const possibleIdFields = ['id', 'user_id', 'profile_id', 'attendee_id', 'participant_id'];
        for (const field of possibleIdFields) {
          if (attendeeData[0]?.[field]) {
            userIds = attendeeData.map(record => record[field]);
            log(`[EventParticipantList] Extracted ${field}:`, userIds);
            break;
          }
        }
      }
      
      // If we couldn't extract any IDs, we can't proceed
      if ((userIds?.length || 0) === 0) {
        error('[EventParticipantList] Could not extract any user IDs from attendee records');
        setLoadError('Failed to extract participant data');
        setIsLoading(false);
        return;
      }
      
      // STEP 3: Now DIRECTLY fetch profiles one by one to see which ones we can get
      log(`[EventParticipantList] Attempting to fetch ${userIds?.length || 0} profiles one by one for debugging`);
      
      const retrievedProfiles: Profile[] = [];
      
      for (const userId of userIds) {
        try {
          log(`[EventParticipantList] Fetching profile for user ID: ${userId}`);
          
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          
          if (profileError) {
            if (profileError.code === 'PGRST116') {
              log(`[EventParticipantList] No profile found for user ID: ${userId}`);
            } else {
              error(`[EventParticipantList] Error fetching profile for ${userId}:`, profileError);
            }
            
            // Skip participants without valid profiles instead of creating placeholders
            continue;
          } else if (profileData) {
            log(`[EventParticipantList] Successfully retrieved profile for ${userId}:`, 
              JSON.stringify({
                id: profileData.id,
                username: profileData.username,
                name: profileData.full_name
              })
            );
            retrievedProfiles.push(profileData);
          } else {
            log(`[EventParticipantList] No profile found for user ID: ${userId}`);
            // Skip participants without valid profiles
            continue;
          }
        } catch (err) {
          error(`[EventParticipantList] Exception fetching profile for ${userId}:`, err);
        }
      }
      
      // STEP 4: Update state with whatever profiles we managed to retrieve
      log(`[EventParticipantList] Retrieved ${retrievedProfiles?.length || 0} profiles in total`);
      
      // Update state with the retrieved profiles, even if empty
      setParticipants(retrievedProfiles);
      notifyCountChange((retrievedProfiles?.length || 0));
      
    } catch (error) {
      error('[EventParticipantList] Exception in fetchParticipants:', error);
      setLoadError('Error loading participants');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch participants directly by user IDs
  const fetchParticipantsDirectly = async (userIds: string[]) => {
    try {
      if (!(userIds?.length || 0)) {
        log('[EventParticipantList] No user IDs to fetch');
        setParticipants([]);
        notifyCountChange(0);
        return;
      }
      
      log(`[EventParticipantList] Fetching ${userIds?.length || 0} participant profiles directly`);
      
      // Fetch all profiles in one go
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);
      
      if (error) {
        error('[EventParticipantList] Error fetching profiles directly:', error);
        setLoadError('Failed to load participant profiles');
        return;
      }
      
      if (data && (data?.length || 0) > 0) {
        log(`[EventParticipantList] Successfully fetched ${data?.length || 0} profiles directly`);
        
        // Log the first profile for debugging
        if ((data?.length || 0) > 0) {
          log(`[EventParticipantList] First direct profile: ${JSON.stringify(data[0])}`);
        }
        
        setParticipants(data);
        notifyCountChange((data?.length || 0));
      } else {
        log('[EventParticipantList] No profiles found with direct fetch');
        setParticipants([]);
        notifyCountChange(0);
      }
    } catch (error) {
      error('[EventParticipantList] Exception fetching profiles directly:', error);
      setLoadError('Error loading participant profiles');
    }
  };
  
  // Fetch a single user's profile and add to the list
  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        // Add to the list if not already present
        setParticipants(current => {
          if (!current.find(p => p.id === data.id)) {
            const newList = [...current, data];
            notifyCountChange((newList?.length || 0));
            return newList;
          }
          return current;
        });
      }
    } catch (error) {
      error('Error fetching user profile:', error);
    }
  };
  
  // Remove a user from the list
  const removeUserFromList = (userId: string) => {
    setParticipants(current => {
      const newList = current.filter(p => p.id !== userId);
      if ((newList?.length || 0) !== (current?.length || 0)) {
        notifyCountChange((newList?.length || 0));
      }
      return newList;
    });
  };
  
  // Render a single participant item
  const renderParticipantItem = (profile: Profile, index: number) => {
    return (
      <View key={profile.id}>
        <ProfileCard
          profile={profile}
          onPress={undefined} // Disable navigation to profile detail screen
          showMessageButton={false} // Never show message button for any participants
        />
        {index < (participants?.length || 0) - 1 && <View style={[styles.separator, { backgroundColor: themeColors.neutral.border }]} />}
      </View>
    );
  };
  
  // Render loading state
  if (isLoading && (participants?.length || 0) === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary.main} />
        <Text style={[styles.statusText, { color: themeColors.neutral.subtext }]}>Loading participants...</Text>
      </View>
    );
  }
  
  // Render error state
  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        {/* Removed retry button for now, as list has auto-retry and realtime updates */}
        {/* <TouchableOpacity onPress={fetchParticipants} style={styles.retryButton}> */}
        {/*   <Text style={styles.retryButtonText}>Try Again</Text> */}
        {/* </TouchableOpacity> */}
      </View>
    );
  }
  
  // Render empty state
  if ((participants?.length || 0) === 0) {
    return (
      <View style={styles.emptyContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.primary.main} size="small" />
            <Text style={styles.loadingText}>Loading participants...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.emptyText}>
              No one has joined this event yet. Be the first to join!
            </Text>
            {/* Removed Refresh Button */}
          </>
        )}
      </View>
    );
  }
  
  // When inside a ScrollView, render directly without using FlatList
  if (insideScrollView) {
    return (
      <View style={styles.container}>
        <View style={styles.listContent}>
          {participants.map((item, index) => renderParticipantItem(item, index))}
        </View>
      </View>
    );
  }
  
  // When standalone, use FlatList for performance
  return (
    <View style={styles.container}>
      <FlatList
        data={participants}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => renderParticipantItem(item, index)}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!insideScrollView} // Disable scrolling if inside another ScrollView
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        windowSize={5}
        getItemLayout={(data, index) => ({
          length: 80, // Approximate height of ProfileCard + separator
          offset: 80 * index,
          index,
        })}
      />
    </View>
  );
}

// Memoize component to prevent unnecessary re-renders
export default React.memo(EventParticipantList, (prevProps, nextProps) => {
  // Only re-render if participants list changes
  return (
    prevProps.eventId === nextProps.eventId &&
    prevProps.initialParticipants.length === nextProps.initialParticipants.length &&
    prevProps.insideScrollView === nextProps.insideScrollView
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  loadingContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
    marginTop: Spacing.sm,
  },
  errorContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: Colors.error.main,
    marginBottom: Spacing.md,
  },
  emptyContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  listContent: {
    padding: Spacing.xs,
  },
  separator: {
    height: 1,
    marginVertical: Spacing.xs,
  },
  statusText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.sm,
  },
  refreshButtonText: {
    color: Colors.primary.main,
    fontFamily: FontFamily.medium,
    marginLeft: Spacing.xs,
  },
}); 