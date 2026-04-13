import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  FlatList, 
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  Platform,
  StatusBar,
  Alert,
  Modal,
  PanResponder,
  Animated
} from 'react-native';
import { 
  Calendar, 
  Plus, 
  Filter, 
  CalendarDays, 
  Search, 
  PlusCircle, 
  MapPin, 
  Clock, 
  Users,
  CheckCircle2,
  MoreVertical,
  Trash2,
  Pencil,
  X,
  Check
} from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Event } from '../../utils/supabase';
import { trackAdClick } from '../../utils/adClickService';
import { initializeEventAttendeesTable } from '../../utils/createEventAttendeesTable';
import { deleteEvent } from '../../utils/eventActions';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Shadow, Spacing } from '../../constants/Theme';
import EventCard from '../../components/EventCard';
import Header from '../../components/Header';
import useAuth from '../../hooks/useAuth';
import useLocation from '../../hooks/useLocation';
import Button from '../../components/Button';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { format, isToday, isThisWeek, isThisMonth, parseISO } from '../../utils/dateFormatters';
import { useTheme } from '../../contexts/ThemeContext';
import { badgeCounter } from '../../utils/badgeCounter';
import { getDistance } from 'geolib';
import { SEARCH_RADIUS_KM } from '../../constants/Endpoints';
import { log, warn, error } from '../../utils/productionLogger';


// Get status bar height for different platforms
const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 20 : StatusBar.currentHeight || 0;
const BOTTOM_INSET = Platform.OS === 'ios' ? 34 : 16;

// Filter options
const FILTER_OPTIONS = ['All', 'Today', 'This Week', 'This Month'];

// Categories
const CATEGORIES = [
  'All Categories',
  'Food & Drink',
  'Sightseeing',
  'Adventure',
  'Cultural',
  'Nightlife',
  'Workshops'
];

export default function EventsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { location } = useLocation();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [events, setEvents] = useState<Event[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'mine'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [eventMenuVisible, setEventMenuVisible] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'distance'>('date');
  
  // Pan responder for drag-to-close
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only handle vertical drags
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          // Close modal if dragged down more than 100px
          Animated.timing(translateY, {
            toValue: 400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setFilterModalVisible(false);
            translateY.setValue(0);
          });
        } else {
          // Snap back to original position
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;
  
  // Ref to store subscription
  const subscription = useRef<any>(null);
  // Defer heavy work until tab is focused (faster app startup)
  const [hasFocused, setHasFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setHasFocused(true);
      return () => {};
    }, [])
  );

  // Find the selected event for the menu
  const selectedEvent = events.find(event => event.id === eventMenuVisible);

  useEffect(() => {
    if (!hasFocused) return;
    // Fetch when tab focused or filter/location change
    fetchEvents(true);
    try {
      badgeCounter.decrementBadgeCount('events');
    } catch (error) {
      error('[Events] Error clearing event badge:', error);
    }
    setupEventsSubscription();
    return () => {
      if (subscription.current) {
        supabase.removeChannel(subscription.current);
      }
    };
  }, [filter, location, hasFocused]);
  
  const setupEventsSubscription = async () => {
    // Remove any existing subscription
    if (subscription.current) {
      supabase.removeChannel(subscription.current);
    }
    
    // Set up subscription to events table
    const eventsSubscription = supabase
      .channel('events-changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'events' 
        }, 
        (payload) => {
          log('Event change received:', payload);
          
          // Handle different types of changes
          if (payload.eventType === 'DELETE') {
            log('Event deleted:', payload.old.id);
            // Remove the deleted event from the state immediately
            setEvents(currentEvents => 
              currentEvents.filter(event => event.id !== payload.old.id)
            );
          } else if (payload.eventType === 'UPDATE') {
            // Check if this is a soft delete (deleted_at was set)
            if (payload.new.deleted_at && !payload.old.deleted_at) {
              log('Event soft deleted:', payload.new.id);
              // Remove the soft-deleted event from the state
              setEvents(currentEvents => 
                currentEvents.filter(event => event.id !== payload.new.id)
              );
          } else {
            // For other updates, refresh the entire list (force refresh)
            fetchEvents(true);
          }
        } else {
          // For inserts or other changes, refresh the entire list (force refresh)
          fetchEvents(true);
        }
        }
      )
      .subscribe();
      
    subscription.current = eventsSubscription;
  };
  
  const fetchEvents = async (forceRefresh = false) => {
    try {
      // 🚀 SPOTLESS: Load cached events INSTANTLY (before showing loading)
      if (!forceRefresh) {
        try {
          const { getCachedEvents } = await import('../../utils/eventUtils');
          const cachedEvents = await getCachedEvents();
          if (cachedEvents && cachedEvents.length > 0) {
            log(`[Events] 🚀 Loaded ${cachedEvents.length} cached events INSTANTLY`);
            setEvents(cachedEvents);
            setLoading(false); // Hide loading immediately with cached data
            // Continue to fetch fresh data in background (non-blocking)
          }
        } catch (cacheError) {
          warn('[Events] Cache load failed (non-critical):', cacheError);
        }
      }
      
      // Only show loading spinner if no events are currently displayed
      // During pull-to-refresh, existing events stay visible
      if (events.length === 0) {
        setLoading(true);
      }
      log(`Fetching events${forceRefresh ? ' (force refresh)' : ''}...`);
      
      // Don't clear cache before fetching - keep existing data as fallback
      // Cache will be updated when fresh data arrives
      
      let query = supabase
        .from('events')
        .select(`
          *,
          host:profiles(id, username, full_name, avatar_url)
        `);
      
      // Add filter for deleted_at - but NOT for "mine" filter (user should see their own deleted events)
      // This is critical for not showing deleted events in public listings
      if (filter !== 'mine') {
        query = query.is('deleted_at', null);
      }
      
      // Order by date if available
      query = query.order('date', { ascending: true });
      
      if (filter === 'upcoming') {
        // Only show events that haven't happened yet OR ads (which don't have dates)
        const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD
        // Include: (events with date >= today) OR (ads with post_type = 'ad') OR (items with null date)
        query = query.or(`date.gte.${today},post_type.eq.ad,date.is.null`);
      } else if (filter === 'mine' && user?.id) {
        // Only show events created by the current user
        // Don't filter by deleted_at - user should see their own deleted events
        query = query.eq('host_id', user.id);
      }
      
      const { data, error } = await query;
      
      if (error) {
        error('Error in events query:', error);
        // Check if the error is related to the deleted_at column
        if (error.message && (error.message.includes('deleted_at') || error.code === '42703')) {
          warn('deleted_at column may not exist, retrying without this filter');
          // Retry without the deleted_at filter
          let retryQuery = supabase
            .from('events')
            .select(`
              *,
              host:profiles(id, username, full_name, avatar_url)
            `);
          
          if (filter === 'upcoming') {
            const today = new Date().toISOString().split('T')[0];
            retryQuery = retryQuery.gte('date', today);
          } else if (filter === 'mine' && user?.id) {
            retryQuery = retryQuery.eq('host_id', user.id);
          }
          
          const { data: retryData, error: retryError } = await retryQuery.order('date', { ascending: true });
          
          if (retryError) {
            throw retryError;
          }
          
          // Process retry data with location filtering if available
          let processedRetryEvents = retryData || [];
          
          if (location && location.latitude && location.longitude) {
            processedRetryEvents = processedRetryEvents
              .map(event => {
                // Only process events with valid coordinates
                if (event.latitude != null && 
                    event.longitude != null && 
                    !isNaN(event.latitude) && 
                    !isNaN(event.longitude) &&
                    !isNaN(location.latitude) && 
                    !isNaN(location.longitude)) {
                  try {
                    const distance = getDistance(
                      { latitude: location.latitude, longitude: location.longitude },
                      { latitude: event.latitude, longitude: event.longitude }
                    ) / 1000; // Convert to kilometers
                    
                    // Validate distance is a valid number
                    if (!isNaN(distance) && isFinite(distance)) {
                      return { ...event, distance };
                    }
                  } catch (error) {
                    error('[Events] Error calculating distance:', error);
                  }
                }
                // Events without valid coordinates - exclude them when location is available
                return null;
              })
              .filter(event => {
                // Only show events within search radius if they have valid coordinates and distance
                if (event && 
                    event.latitude != null && 
                    event.longitude != null && 
                    !isNaN(event.latitude) && 
                    !isNaN(event.longitude) &&
                    event.distance !== undefined && 
                    !isNaN(event.distance) &&
                    event.distance <= SEARCH_RADIUS_KM) {
                  return true;
                }
                // Exclude events without valid coordinates or outside radius
                return false;
              })
              .sort((a, b) => {
                // Sort by distance first (if available), then by date
                if (a && b && a.distance !== undefined && b.distance !== undefined) {
                  return a.distance - b.distance;
                }
                if (a && a.distance !== undefined) return -1;
                if (b && b.distance !== undefined) return 1;
                if (a && b) {
                  // Handle null dates (ads)
                if (!a.date || !b.date) {
                  if (!a.date && !b.date) return 0;
                  return !a.date ? 1 : -1; // Ads go to end
                }
                return new Date(a.date).getTime() - new Date(b.date).getTime();
                }
                return 0;
              }) as Event[];
          } else {
            // No location - show all events and sort by date (handle null dates for ads)
            processedRetryEvents = processedRetryEvents.sort((a, b) => {
              if (!a.date || !b.date) {
                if (!a.date && !b.date) return 0;
                return !a.date ? 1 : -1; // Ads go to end
              }
              return new Date(a.date).getTime() - new Date(b.date).getTime();
            });
          }
          
          setEvents(processedRetryEvents);
          // Fetch participant counts for retry data
          if (processedRetryEvents && (processedRetryEvents?.length || 0) > 0) {
            await fetchParticipantCounts(processedRetryEvents.map(event => event.id));
          }
          return;
        } else {
          throw error;
        }
      }
      
      log(`Fetched ${data?.length || 0} events`);
      
      // Calculate distances and filter by location if available
      let processedEvents = data || [];
      
      if (location && location.latitude && location.longitude) {
        log('[Events] User has location, filtering by distance');
        // Calculate distance for each event and filter by radius
        const eventsWithDistance = processedEvents
          .map(event => {
            // Only process events with valid coordinates
            if (event.latitude != null && 
                event.longitude != null && 
                !isNaN(event.latitude) && 
                !isNaN(event.longitude) &&
                !isNaN(location.latitude) && 
                !isNaN(location.longitude)) {
              try {
                const distance = getDistance(
                  { latitude: location.latitude, longitude: location.longitude },
                  { latitude: event.latitude, longitude: event.longitude }
                ) / 1000; // Convert to kilometers
                
                // Validate distance is a valid number
                if (!isNaN(distance) && isFinite(distance)) {
                  return {
                    ...event,
                    distance
                  };
                }
              } catch (error) {
                error('[Events] Error calculating distance:', error);
              }
            }
            // Return null for events without coordinates
            return null;
          })
          .filter(event => event !== null);
          
        log(`[Events] ${eventsWithDistance.length} events have valid coordinates`);
        
        // Filter by radius
        const eventsInRadius = eventsWithDistance.filter(event => {
          if (event && 
              event.latitude != null && 
              event.longitude != null && 
              !isNaN(event.latitude) && 
              !isNaN(event.longitude) &&
              event.distance !== undefined && 
              !isNaN(event.distance) &&
              event.distance <= SEARCH_RADIUS_KM) {
            return true;
          }
          return false;
        });
        
        log(`[Events] ${eventsInRadius.length} events within ${SEARCH_RADIUS_KM}km radius`);
        
        // If no events in radius, show all events (fallback behavior)
        if (eventsInRadius.length === 0 && processedEvents.length > 0) {
          log('[Events] No events in radius, showing all events');
          processedEvents = processedEvents.map(event => ({
            ...event,
            distance: undefined
          })).sort((a, b) => {
            // Handle null dates for ads
            if (!a.date || !b.date) {
              if (!a.date && !b.date) return 0;
              return !a.date ? 1 : -1; // Ads go to end
            }
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          });
        } else {
          processedEvents = eventsInRadius.sort((a, b) => {
            // Sort by distance first (if available), then by date
            if (a && b && a.distance !== undefined && b.distance !== undefined) {
              return a.distance - b.distance;
            }
            if (a && a.distance !== undefined) return -1;
            if (b && b.distance !== undefined) return 1;
            // Fallback to date sorting (handle null dates for ads)
            if (a && b) {
              if (!a.date || !b.date) {
                if (!a.date && !b.date) return 0;
                return !a.date ? 1 : -1; // Ads go to end
              }
              return new Date(a.date).getTime() - new Date(b.date).getTime();
            }
            return 0;
          }) as Event[];
        }
      } else {
        log('[Events] No location, showing all events');
        // No location - show all events and sort by date (handle null dates for ads)
        processedEvents = processedEvents.sort((a, b) => {
          if (!a.date || !b.date) {
            if (!a.date && !b.date) return 0;
            return !a.date ? 1 : -1; // Ads go to end
          }
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
      }
      
      setEvents(processedEvents);
      
      // 🚀 SPOTLESS: Cache events for instant loading next time
      try {
        const { cacheEvents } = await import('../../utils/eventUtils');
        await cacheEvents(processedEvents);
      } catch (cacheError) {
        warn('[Events] Cache save failed (non-critical):', cacheError);
      }
      
      // Fetch participant counts for each event
      if (processedEvents && (processedEvents?.length || 0) > 0) {
        await fetchParticipantCounts(processedEvents.map(event => event.id));
      }
    } catch (error) {
      error('Error fetching events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  const fetchParticipantCounts = async (eventIds: string[]) => {
    if (!eventIds || (eventIds?.length || 0) === 0) return;
    
    try {
      // Initialize counts map 
      const countsMap: Record<string, number> = {};
      eventIds.forEach(id => {
        countsMap[id] = 0;
      });
      
      // Fetch all attendees for these events
      const { data, error } = await supabase
        .from('event_attendees')
        .select('event_id')
        .in('event_id', eventIds);
      
      if (error) {
        error('Error fetching participant counts:', error);
        setParticipantCounts(countsMap); // Use default zero counts
        return;
      }
      
      // Count attendees for each event
      if (data) {
        data.forEach(item => {
          if (item.event_id) {
            countsMap[item.event_id] = (countsMap[item.event_id] || 0) + 1;
          }
        });
      }
      
      setParticipantCounts(countsMap);
    } catch (error) {
      error('Exception in fetchParticipantCounts:', error);
    }
  };
  
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchEvents(true); // Force refresh - bypass cache
    } catch (error) {
      error('[Events] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };
  
  const handleEventPress = async (eventId: string) => {
    // Track click if this is an ad and user is not the owner
    if (user) {
      // First check if it's an ad
      const { data: eventData } = await supabase
        .from('events')
        .select('post_type, host_id')
        .eq('id', eventId)
        .single();
      
      if (eventData?.post_type === 'ad' && eventData.host_id !== user.id) {
        trackAdClick(eventId, user.id).catch(err => {
          error('[EventsScreen] Error tracking ad click:', err);
        });
      }
    }
    
    router.push(`/events/${eventId}`);
  };
  
  const handleCreateEvent = () => {
    router.push('/events/create');
  };

  // Handle event deletion
  const handleDeleteEvent = async (eventId: string) => {
    if (!user) return;

    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await deleteEvent(eventId, user.id);
              if (result.success) {
                Alert.alert(
                  'Event Deleted',
                  'The event has been successfully deleted.'
                );
                // No need to manually call fetchEvents, subscription should handle it
              } else {
                Alert.alert(
                  'Error',
                  result.message || 'Failed to delete event'
                );
              }
            } catch (error) {
              error('Error deleting event:', error);
              Alert.alert(
                'Error',
                'An unexpected error occurred while deleting the event.'
              );
            }
          },
        },
      ]
    );
  };
  
  // Filter events based on search, time filter, and category
  const filteredEvents = events.filter(event => {
    // Handle null dates/times for ads - skip date-based filters for ads
    const hasDate = event.date && event.time;
    
    return (
      (searchQuery.trim() === '' ||
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (event.location && event.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
        event.category.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (selectedFilter === 'All' ||
        !hasDate || // Include ads (no date) when filter is not 'All'
        (selectedFilter === 'Today' && hasDate && isToday(parseISO(`${event.date}T${event.time}`))) ||
        (selectedFilter === 'This Week' && hasDate && isThisWeek(parseISO(`${event.date}T${event.time}`))) ||
        (selectedFilter === 'This Month' && hasDate && isThisMonth(parseISO(`${event.date}T${event.time}`)))) &&
      (selectedCategory === 'All Categories' || event.category === selectedCategory)
    );
  }).sort((a, b) => {
    // Apply sorting based on sortBy state
    if (sortBy === 'distance') {
      // Sort by distance (nearest first)
      if (a.distance !== undefined && b.distance !== undefined) {
        return a.distance - b.distance;
      }
      if (a.distance !== undefined) return -1;
      if (b.distance !== undefined) return 1;
    }
    // Default: sort by date (earliest first) - handle null dates/times for ads
    if (!a.date || !a.time || !b.date || !b.time) {
      if ((!a.date || !a.time) && (!b.date || !b.time)) return 0;
      return (!a.date || !a.time) ? 1 : -1; // Ads go to end
    }
    return new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime();
  });
  

  
  // Render event item
  const renderEventItem = ({ item }: { item: any }) => {
    // Handle null dates/times for ads
    const formattedDate = (item.date && item.time) 
      ? format(parseISO(`${item.date}T${item.time}`), 'EEE, MMM d')
      : 'No date';
    const formattedTime = (item.date && item.time)
      ? format(parseISO(`${item.date}T${item.time}`), 'h:mm a')
      : '';
    
    // Helper function to generate DiceBear URL
    const generateDiceBearUrl = (style: string, userId: string) => {
      return `https://api.dicebear.com/9.x/${style}/png?seed=${userId}&size=48`;
    };
    
    // Helper function to get the correct avatar URL
    const getHostAvatarUrl = (avatarUrl?: string, hostId?: string) => {
      if (!avatarUrl) {
        // Fallback to UI avatars if no avatar URL
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(item.host?.full_name || 'Host')}&background=random`;
      }
      
      // Handle DiceBear avatars
      if (avatarUrl.startsWith('dicebear:')) {
        const avatarData = avatarUrl.replace('dicebear:', '');
        if (avatarData.includes(':')) {
          const [style, seed] = avatarData.split(':');
          return generateDiceBearUrl(style, seed);
        } else {
          // Handle old format (style only) - use hostId as seed
          return generateDiceBearUrl(avatarData, hostId || 'default');
        }
      }
      
      // Return regular URL as-is
      return avatarUrl;
    };
    
    // Generate host avatar URL properly
    const hostAvatarUrl = getHostAvatarUrl(item.host?.avatar_url, item.host?.id);
    
    // Get host name safely
    const hostName = item.host?.full_name || 'Unknown Host';
    // Check if current user is the host
    const isMyEvent = user?.id === item.host_id;
    
    return (
      <TouchableOpacity
        onPress={() => handleEventPress(item.id)}
        activeOpacity={0.9}
        style={[styles.modernEventCard, { backgroundColor: themeColors.neutral.card }]}
      >
        {/* Event Image with Overlay */}
        <View style={styles.modernEventImageContainer}>
          <Image
            source={{ uri: item.image_url }}
            style={styles.modernEventImage}
            resizeMode="cover"
          />
          {/* Category Badge */}
          <View style={[styles.modernCategoryBadge, { backgroundColor: themeColors.primary.main }]}>
            <Text style={styles.modernCategoryText}>{item.category}</Text>
          </View>
          {/* Verified Badge for verified hosts */}
          {item.host_is_verified && (
            <View style={styles.modernVerifiedBadge}>
              <CheckCircle2 size={14} color="#00D4AA" fill="#00D4AA" strokeWidth={2} />
              <Text style={styles.modernVerifiedText}>Verified</Text>
            </View>
          )}
          {/* Attendees Count */}
          <View style={[styles.modernAttendeesBadge, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
            <Users size={12} color="white" />
            <Text style={styles.modernAttendeesText}>
              {item.attendees_count}/{item.max_attendees || '∞'}
            </Text>
          </View>
        </View>
        
        {/* Event Content */}
        <View style={styles.modernEventContent}>
          {/* Event Title */}
          <Text style={[styles.modernEventTitle, { color: themeColors.neutral.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          
          {/* Event Details */}
          <View style={styles.modernEventDetails}>
            {/* Only show date/time if they exist (for events, not ads) */}
            {formattedDate !== 'No date' && (
              <View style={styles.modernDetailItem}>
                <CalendarDays size={14} color={themeColors.primary.main} />
                <Text style={[styles.modernDetailText, { color: themeColors.neutral.text }]}>{formattedDate}</Text>
              </View>
            )}
            
            {formattedTime && (
              <View style={styles.modernDetailItem}>
                <Clock size={14} color={themeColors.primary.main} />
                <Text style={[styles.modernDetailText, { color: themeColors.neutral.text }]}>{formattedTime}</Text>
              </View>
            )}
            
            {/* Only show location if it exists */}
            {item.location && (
              <View style={styles.modernDetailItem}>
                <MapPin size={14} color={themeColors.primary.main} />
                <Text style={[styles.modernDetailText, { color: themeColors.neutral.text }]} numberOfLines={1}>
                  {item.location}
                </Text>
              </View>
            )}
          </View>
          
          {/* Host Section */}
          <View style={styles.modernHostContainer}>
            <Image
              source={{ uri: hostAvatarUrl }}
              style={styles.modernHostAvatar}
            />
            <Text style={[styles.modernHostName, { color: themeColors.neutral.subtext }]}>
              Hosted by {hostName}
            </Text>
            {isMyEvent && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setEventMenuVisible(item.id);
                }}
                style={styles.modernEventActionIcon}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <MoreVertical size={16} color={themeColors.neutral.subtext} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  
  // Header component that will scroll with content
  const renderHeader = () => (
    <View style={{ backgroundColor: themeColors.neutral.background }}>
        {/* Modern Header with Gradient */}
      <View style={[
        styles.modernHeader, 
        { backgroundColor: themeColors.neutral.surface },
        Platform.OS === 'android' && styles.modernHeaderAndroid
      ]}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
            <Text style={[
              styles.modernTitle, 
              { color: themeColors.neutral.text },
              Platform.OS === 'android' && styles.modernTitleAndroid
            ]}>Events</Text>
            <Text style={[
              styles.modernSubtitle, 
              { color: themeColors.neutral.subtext },
              Platform.OS === 'android' && styles.modernSubtitleAndroid
            ]}>
                {events?.length || 0} events
              </Text>
            </View>
            <TouchableOpacity 
            style={[
              styles.modernCreateButton, 
              { backgroundColor: themeColors.primary.main },
              Platform.OS === 'android' && styles.modernCreateButtonAndroid
            ]}
              onPress={handleCreateEvent}
              activeOpacity={0.8}
            >
            <Plus size={14} color={themeColors.neutral.background} />
              <Text style={[styles.createButtonText, { color: themeColors.neutral.background }]}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Modern Search Bar */}
      <View style={[
        styles.modernSearchContainer, 
        { 
          backgroundColor: 'transparent',
          borderColor: themeColors.neutral.border 
        },
        Platform.OS === 'android' && styles.modernSearchContainerAndroid
      ]}>
        <Search size={14} color={themeColors.neutral.subtext} style={styles.searchIcon} />
          <TextInput
          style={[
            styles.modernSearchInput, 
            { color: themeColors.neutral.text },
            Platform.OS === 'android' && styles.modernSearchInputAndroid
          ]}
            placeholder="Search events..."
            placeholderTextColor={themeColors.neutral.subtext}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity
            onPress={() => setFilterModalVisible(true)}
            style={styles.filterIconButton}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Filter 
              size={18} 
              color={
                selectedFilter !== 'All' || selectedCategory !== 'All Categories' || sortBy !== 'date'
                  ? themeColors.primary.main 
                  : themeColors.neutral.subtext
              } 
            />
            {(selectedFilter !== 'All' || selectedCategory !== 'All Categories' || sortBy !== 'date') && (
              <View style={[styles.filterBadge, { backgroundColor: themeColors.primary.main }]} />
            )}
          </TouchableOpacity>
        </View>
        
        {/* Modern Filter Section - Single Horizontal Scrolling Row */}
        <View style={[styles.modernFiltersContainer, { 
          backgroundColor: themeColors.neutral.background,
          borderBottomColor: themeColors.neutral.border 
        }]}>
          {/* Single Horizontal Scrolling Row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modernFilterRow}
          >
            {['All', 'Today', 'This Week', 'Food & Drink', 'Adventure', 'Cultural'].map((item, index) => {
              // Determine if it's a filter or category
              const isFilter = index < 3;
              const isSelected = isFilter 
                ? selectedFilter === item 
                : selectedCategory === item;
              
              return (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.modernFilterPill,
                    { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border },
                  Platform.OS === 'android' && styles.modernFilterPillAndroid,
                    isSelected && [styles.modernFilterPillActive, { 
                      backgroundColor: themeColors.primary.main, 
                      borderColor: themeColors.primary.main 
                    }]
                  ]}
                  onPress={() => {
                    if (isFilter) {
                      setSelectedFilter(item as any);
                    } else {
                      setSelectedCategory(item);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.modernFilterText,
                      { color: isSelected ? '#FFFFFF' : themeColors.neutral.text },
                    Platform.OS === 'android' && styles.modernFilterTextAndroid,
                      isSelected && styles.modernFilterTextActive
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
    </View>
  );
        
  return (
    <SafeAreaView style={[GlobalStyles.safeArea, styles.safeContainer, { backgroundColor: themeColors.neutral.background }]}>
      <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={themeColors.primary.main} size="large" />
          </View>
        ) : (
          <FlatList
            data={filteredEvents}
            keyExtractor={item => item.id}
            renderItem={renderEventItem}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={styles.modernListContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[themeColors.primary.main]}
                tintColor={themeColors.primary.main}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.primary.main + '10' }]}>
                  <Calendar size={40} color={themeColors.primary.main} strokeWidth={1.5} />
                </View>
                <Text style={[styles.emptyTitle, { color: themeColors.neutral.text }]}>
                  {selectedFilter === 'Today' ? 'No events today' :
                   selectedFilter === 'This Week' ? 'No events this week' :
                   selectedFilter === 'This Month' ? 'No events this month' :
                   selectedCategory !== 'All Categories' ? `No ${selectedCategory} events` :
                   'No events found'}
                </Text>
                <Text style={[styles.emptyText, { color: themeColors.neutral.subtext }]}>
                  {location ? 'Try adjusting your filters or search radius' : 'Be the first to create an event in your area'}
                </Text>
                <TouchableOpacity
                  style={[styles.createEventButton, { backgroundColor: themeColors.primary.main }]}
                  onPress={handleCreateEvent}
                  activeOpacity={0.8}
                >
                  <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.createEventButtonText}>Create Event</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>

      {/* Filter & Sort Modal */}
      <Modal
        visible={filterModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.filterModalOverlay}
          activeOpacity={1}
          onPress={() => setFilterModalVisible(false)}
        >
          <Animated.View 
            style={[
              styles.filterModalContainer, 
              { backgroundColor: themeColors.neutral.surface },
              { transform: [{ translateY }] }
            ]}
            onStartShouldSetResponder={() => true}
          >
            {/* Handle Bar - Draggable area */}
            <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
              <View style={[styles.filterModalHandle, { backgroundColor: themeColors.neutral.border }]} />
            </View>
            
            {/* Header */}
            <View style={styles.filterModalHeader}>
              <Text style={[styles.filterModalTitle, { color: themeColors.neutral.text }]}>Filters</Text>
              {(selectedFilter !== 'All' || selectedCategory !== 'All Categories' || sortBy !== 'date') && (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedFilter('All');
                    setSelectedCategory('All Categories');
                    setSortBy('date');
                  }}
                  style={styles.clearAllButton}
                >
                  <Text style={[styles.clearAllText, { color: themeColors.primary.main }]}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.filterModalContent}
              scrollEnabled={true}
            >
              {/* Sort Options */}
              <View style={styles.filterSectionModern}>
                <Text style={[styles.filterSectionTitleModern, { color: themeColors.neutral.subtext }]}>SORT BY</Text>
                <View style={styles.sortOptionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.sortOption,
                      { backgroundColor: themeColors.neutral.background, borderColor: themeColors.neutral.border },
                      sortBy === 'date' && { backgroundColor: themeColors.primary.main, borderColor: themeColors.primary.main }
                    ]}
                    onPress={() => setSortBy('date')}
                  >
                    <CalendarDays size={18} color={sortBy === 'date' ? '#FFFFFF' : themeColors.neutral.text} />
                    <Text style={[styles.sortOptionText, { color: sortBy === 'date' ? '#FFFFFF' : themeColors.neutral.text }]}>
                      Date
                    </Text>
                  </TouchableOpacity>
                  {location && location.latitude && location.longitude && (
                    <TouchableOpacity
                      style={[
                        styles.sortOption,
                        { backgroundColor: themeColors.neutral.background, borderColor: themeColors.neutral.border },
                        sortBy === 'distance' && { backgroundColor: themeColors.primary.main, borderColor: themeColors.primary.main }
                      ]}
                      onPress={() => setSortBy('distance')}
                    >
                      <MapPin size={18} color={sortBy === 'distance' ? '#FFFFFF' : themeColors.neutral.text} />
                      <Text style={[styles.sortOptionText, { color: sortBy === 'distance' ? '#FFFFFF' : themeColors.neutral.text }]}>
                        Distance
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Time Filter */}
              <View style={styles.filterSectionModern}>
                <Text style={[styles.filterSectionTitleModern, { color: themeColors.neutral.subtext }]}>TIME</Text>
                <View style={styles.filterPillsGrid}>
                  {['All', 'Today', 'This Week', 'This Month'].map((filterOption) => (
                    <TouchableOpacity
                      key={filterOption}
                      style={[
                        styles.filterPillModern,
                        { backgroundColor: themeColors.neutral.background, borderColor: themeColors.neutral.border },
                        selectedFilter === filterOption && { backgroundColor: themeColors.primary.main, borderColor: themeColors.primary.main }
                      ]}
                      onPress={() => setSelectedFilter(filterOption as any)}
                    >
                      <Text style={[styles.filterPillTextModern, { color: selectedFilter === filterOption ? '#FFFFFF' : themeColors.neutral.text }]}>
                        {filterOption}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Category Filter */}
              <View style={styles.filterSectionModern}>
                <Text style={[styles.filterSectionTitleModern, { color: themeColors.neutral.subtext }]}>CATEGORY</Text>
                <View style={styles.filterPillsGrid}>
                  {CATEGORIES.map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.filterPillModern,
                        { backgroundColor: themeColors.neutral.background, borderColor: themeColors.neutral.border },
                        selectedCategory === category && { backgroundColor: themeColors.primary.main, borderColor: themeColors.primary.main }
                      ]}
                      onPress={() => setSelectedCategory(category)}
                    >
                      <Text style={[styles.filterPillTextModern, { color: selectedCategory === category ? '#FFFFFF' : themeColors.neutral.text }]}>
                        {category}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Event Action Menu Modal */}
      <Modal
        visible={!!eventMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEventMenuVisible(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setEventMenuVisible(null)}
        >
          <View style={[styles.modalContainer, { backgroundColor: themeColors.neutral.surface }]}>
            <View style={styles.actionMenu}>
              <TouchableOpacity
                style={[styles.actionMenuItem, styles.deleteMenuItem, { borderBottomColor: themeColors.neutral.border }]}
                onPress={() => {
                  if (selectedEvent) {
                    setEventMenuVisible(null);
                    handleDeleteEvent(selectedEvent.id);
                  }
                }}
              >
                <Trash2 size={20} color={themeColors.error.main} />
                <Text style={[styles.actionMenuItemText, styles.deleteMenuItemText, { color: themeColors.error.main }]}>Delete Event</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setEventMenuVisible(null)}
              >
                <X size={20} color={themeColors.neutral.text} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingTop: 0, // Remove top padding to reduce header space
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm, // Reduced from md
    paddingHorizontal: Spacing.sm, // Reduced from md
    paddingVertical: Spacing.xs, // Reduced from sm
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: Spacing.xs, // Reduced from sm
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.sm, // Reduced from md
    fontFamily: FontFamily.regular,
    paddingVertical: Spacing.xs, // Reduced from sm
  },
  filtersContainer: {
    borderBottomWidth: 1,
    paddingBottom: Spacing.sm, // Reduced from md
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs, // Reduced from sm
    gap: Spacing.xs, // Reduced from sm
  },
  filterButton: {
    paddingHorizontal: Spacing.sm, // Reduced from md
    paddingVertical: Spacing.xs, // Reduced from sm
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    minHeight: 32, // Reduced from default
  },
  filterButtonActive: {
    // Colors will be applied inline
  },
  filterText: {
    fontSize: FontSizes.sm, // Reduced from md
    fontFamily: FontFamily.medium,
  },
  filterTextActive: {
    fontFamily: FontFamily.bold,
  },
  categoriesContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs, // Reduced from sm
    gap: Spacing.xs, // Reduced from sm
  },
  categoryButton: {
    paddingHorizontal: Spacing.sm, // Reduced from md
    paddingVertical: Spacing.xs, // Reduced from sm
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    minHeight: 32, // Reduced from default
  },
  categoryButtonActive: {
    // Colors will be applied inline
  },
  categoryButtonText: {
    fontSize: FontSizes.sm, // Reduced from md
    fontFamily: FontFamily.medium,
  },
  categoryButtonTextActive: {
    fontFamily: FontFamily.bold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    paddingVertical: Spacing.xl * 3,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
    maxWidth: 280,
  },
  createEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
    gap: Spacing.xs,
    ...Shadow.md,
  },
  createEventButtonText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
  },
  eventCard: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm, // Reduced from md
    overflow: 'hidden',
    ...Shadow.md,
  },
  eventImage: {
    width: '100%',
    height: 120, // Reduced from 150
  },
  eventContent: {
    padding: Spacing.sm, // Reduced from md
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  eventCategory: {
    fontSize: FontSizes.xs, // Reduced from sm
    fontFamily: FontFamily.medium,
    color: '#FFFFFF',
    paddingHorizontal: Spacing.xs, // Reduced from sm
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  attendeesCount: {
    fontSize: FontSizes.xs, // Reduced from sm
    fontFamily: FontFamily.regular,
  },
  eventTitle: {
    fontSize: FontSizes.lg, // Reduced from xl
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.xs, // Reduced from sm
    lineHeight: 20, // Reduced from 22
  },
  eventDetails: {
    marginBottom: Spacing.xs, // Reduced from sm
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs / 2,
  },
  detailText: {
    fontSize: FontSizes.xs, // Reduced from sm
    fontFamily: FontFamily.regular,
    marginLeft: Spacing.xs,
  },
  hostContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  hostAvatar: {
    width: 20, // Reduced from 24
    height: 20, // Reduced from 24
    borderRadius: 10, // Reduced from 12
    marginRight: Spacing.xs,
  },
  hostName: {
    fontSize: FontSizes.xs, // Reduced from sm
    fontFamily: FontFamily.medium,
  },
  eventsListContent: {
    padding: Spacing.sm, // Reduced from md
    paddingBottom: Spacing.lg, // Reduced from xl
  },
  eventCardContent: {
    flex: 1,
  },
  eventHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventActionIcon: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    width: '80%',
    maxHeight: '80%',
  },
  actionMenu: {
    flexDirection: 'column',
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    width: '100%',
  },
  actionMenuItemText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
    marginLeft: Spacing.md,
  },
  deleteMenuItem: {
    borderBottomWidth: 0,
  },
  deleteMenuItemText: {
    // Color will be applied inline
  },
  closeButton: {
    padding: Spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  // New styles for modern header and search bar
  modernHeader: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    marginBottom: Spacing.xs,
  },
  modernHeaderAndroid: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  modernTitle: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
    marginBottom: 1,
  },
  modernSubtitle: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
  },
  modernTitleAndroid: {
    fontSize: FontSizes.md + 1,
  },
  modernSubtitleAndroid: {
    fontSize: FontSizes.xs + 1,
  },
  modernCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs + 4,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    gap: 3,
  },
  modernCreateButtonAndroid: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    minHeight: 32,
    minWidth: 70,
  },
  createButtonText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.medium,
  },
  modernSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  modernSearchContainerAndroid: {
    paddingVertical: 8,
    minHeight: 40,
  },
  modernSearchInput: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  modernSearchInputAndroid: {
    fontSize: FontSizes.sm + 1,
    paddingVertical: 4,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  modernFiltersContainer: {
    borderBottomWidth: 1,
    paddingBottom: Spacing.sm,
  },
  modernFilterColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  modernFilterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    minHeight: 28,
    minWidth: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernFilterPillAndroid: {
    minHeight: 32,
    minWidth: 75,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.xs + 2,
  },
  modernFilterPillActive: {
    // Colors will be applied inline
  },
  modernFilterText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  modernFilterTextAndroid: {
    fontSize: FontSizes.sm + 1,
  },
  modernFilterTextActive: {
    fontFamily: FontFamily.bold,
  },
  modernListContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl + 80, // Added extra padding for tab bar
  },
  // New styles for modern event card
  modernEventCard: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md, // Increased from sm
    overflow: 'hidden',
    ...Shadow.md,
  },
  modernEventImageContainer: {
    position: 'relative',
    width: '100%',
    height: 160, // Increased from 150
  },
  modernEventImage: {
    width: '100%',
    height: '100%',
  },
  modernCategoryBadge: {
    position: 'absolute',
    top: Spacing.md, // Increased from sm
    left: Spacing.md, // Increased from sm
    paddingHorizontal: Spacing.sm, // Increased from xs
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  modernCategoryText: {
    fontSize: FontSizes.sm, // Increased from xs
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
  modernVerifiedBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: '#00D4AA',
  },
  modernVerifiedText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: '#00D4AA',
    marginLeft: 3,
  },
  modernAttendeesBadge: {
    position: 'absolute',
    bottom: Spacing.md, // Increased from sm
    right: Spacing.md, // Increased from sm
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm, // Increased from xs
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  modernAttendeesText: {
    fontSize: FontSizes.sm, // Increased from xs
    fontFamily: FontFamily.medium,
    color: '#FFFFFF',
    marginLeft: Spacing.sm, // Increased from xs
  },
  modernEventContent: {
    padding: Spacing.md, // Increased from sm
  },
  modernEventTitle: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.sm, // Increased from xs
    lineHeight: 24, // Added line height for better readability
  },
  modernEventDetails: {
    marginBottom: Spacing.sm, // Increased from xs
  },
  modernDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm, // Increased from xs/2
  },
  modernDetailText: {
    fontSize: FontSizes.sm, // Increased from xs
    fontFamily: FontFamily.regular,
    marginLeft: Spacing.sm, // Increased from xs
  },
  modernHostContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm, // Increased from xs
  },
  modernHostAvatar: {
    width: 28, // Increased from 24
    height: 28, // Increased from 24
    borderRadius: 14, // Increased from 12
    marginRight: Spacing.sm, // Increased from xs
  },
  modernHostName: {
    fontSize: FontSizes.sm, // Increased from xs
    fontFamily: FontFamily.medium,
  },
  modernEventActionIcon: {
    padding: Spacing.sm, // Increased from xs
    marginLeft: Spacing.sm, // Increased from xs
  },
  modernFilterRow: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterIconButton: {
    padding: Spacing.xs,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  filterModalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '65%',
    paddingBottom: BOTTOM_INSET + Spacing.md,
  },
  filterModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  filterModalTitle: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
  },
  clearAllButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  clearAllText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
  filterModalContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  filterSectionModern: {
    marginBottom: Spacing.lg,
  },
  filterSectionTitleModern: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  sortOptionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  sortOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    gap: Spacing.xs,
  },
  sortOptionText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
  },
  filterPillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  filterPillModern: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.pill,
    borderWidth: 1.5,
  },
  filterPillTextModern: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
  },
});