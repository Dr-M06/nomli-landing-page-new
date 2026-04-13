import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Calendar, ChevronRight, MapPin, ArrowRight } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { OFFICIAL_ACCOUNT_HANDLE, OFFICIAL_ACCOUNT_ID } from '../constants/ContactEmails';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow } from '../constants/Theme';
import { fetchUpcomingEvents, getCachedEvents, joinEvent, leaveEvent, isUserAttending, Event } from '../utils/eventUtils';
import { trackAdClick } from '../utils/adClickService';
import EventCard from './EventCard';
import useAuth from '../hooks/useAuth';
import { Link, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { supabase } from '../utils/supabase';
import { getPrefetchedData } from '../utils/prefetchService';
import { log, warn, error } from '../utils/productionLogger';


const { width: screenWidth } = Dimensions.get('window');
const CARD_WIDTH = screenWidth * 0.8; // 80% of screen width

interface EventsSectionProps {
  limit?: number;
  showHeader?: boolean;
  onEventPress?: (event: Event) => void;
}

export default function EventsSection({ 
  limit = 50, // Increased limit to fetch more events/ads for banner filtering
  showHeader = true,
  onEventPress 
}: EventsSectionProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const router = useRouter();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false); // Start with false - only show loading if actively fetching
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedCache, setHasCheckedCache] = useState(false); // Track if we've checked cache
  const [joiningEvents, setJoiningEvents] = useState<Set<string>>(new Set());
  const [userAttendance, setUserAttendance] = useState<Record<string, boolean>>({});
  const flatListRef = useRef<FlatList>(null);
  const scrollIndexRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);
  const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Only show items on the banner that meet strict visual quality rules:
  // - Must have a custom image
  // - Must be from admin users OR official account
  const bannerEvents = useMemo(() => {
    if (!events || events.length === 0) return [];

    const filtered = events.filter((event) => {
      const hasCustomImage =
        typeof event.image_url === 'string' &&
        event.image_url.trim().length > 0;

      // Always require a real custom image for the banner
      if (!hasCustomImage) {
        return false;
      }

      // Only show events/ads from admin users or official account
      // Check multiple ways to identify official account (ID, admin flag, or if it was marked as official in transformation)
      const isFromAdmin = event.host_is_admin === true;
      const isFromOfficialAccount = event.host_id === OFFICIAL_ACCOUNT_ID;
      
      // Debug logging to verify official account recognition
      if (hasCustomImage) {
        log(`[BannerFilter] Event "${event.title}": host_id=${event.host_id}, is_admin=${event.host_is_admin}, official_id=${OFFICIAL_ACCOUNT_ID}, host_matches_official=${isFromOfficialAccount}, matches=${isFromAdmin || isFromOfficialAccount}`);
      }
      
      if (!isFromAdmin && !isFromOfficialAccount) {
        return false;
      }

      // Include both ads and events (post_type can be 'event', 'ad', or undefined/null for older rows)
      // We allow all post types here, as long as they meet the admin/official account criteria above
      return true; // All post types are allowed (event, ad, or null)
    });
    
    log(`[BannerFilter] Filtered ${filtered.length} banner events from ${events.length} total events`);
    log(`[BannerFilter] Banner event IDs:`, filtered.map(e => ({ id: e.id, title: e.title, post_type: e.post_type, host_id: e.host_id, host_is_admin: e.host_is_admin })));
    return filtered;
  }, [events]);

  // Pre-resolve bundled placeholder images for instant loading
  const placeholderImages = useMemo(() => {
    try {
      const { Image: RNImage } = require('react-native');
      const images = [];
      
      // Try to resolve splash image
      try {
        const splash = require('../assets/images/splash.png');
        const resolved = RNImage.resolveAssetSource(splash);
        if (resolved?.uri) images.push(resolved.uri);
      } catch (e) {
        warn('[EventsSection] Could not resolve splash.png');
      }
      
      // Try to resolve icon
      try {
        const icon = require('../assets/images/icon.png');
        const resolved = RNImage.resolveAssetSource(icon);
        if (resolved?.uri) images.push(resolved.uri);
      } catch (e) {
        warn('[EventsSection] Could not resolve icon.png');
      }
      
      // Try to resolve default avatar as fallback
      try {
        const avatar = require('../assets/images/default-avatar.png');
        const resolved = RNImage.resolveAssetSource(avatar);
        if (resolved?.uri) images.push(resolved.uri);
      } catch (e) {
        warn('[EventsSection] Could not resolve default-avatar.png');
      }
      
      return images.length > 0 ? images : [];
    } catch (error) {
      warn('[EventsSection] Could not initialize placeholder images:', error);
      return [];
    }
  }, []);

  // Get placeholder image for event (cycles through available bundled images)
  const getEventPlaceholderImage = (eventIndex: number): string | null => {
    if (placeholderImages.length === 0) return null;
    return placeholderImages[eventIndex % placeholderImages.length];
  };

  // Fetch events on component mount - load prefetched/cached first for instant display
  useEffect(() => {
    const loadInitialEvents = async () => {
      try {
        // First, try to get prefetched events from app startup cache
        const prefetchedData = await getPrefetchedData();
        if (prefetchedData?.events && prefetchedData.events.length > 0) {
          log(`[EventsSection] 🚀 Using ${prefetchedData.events.length} prefetched events from app startup`);
          setEvents(prefetchedData.events);
          setHasCheckedCache(true);
          setLoading(false); // Show prefetched data immediately - no loading spinner
          
          // Fetch fresh data in background (will update UI when it arrives)
          const upcomingEvents = await fetchUpcomingEvents(limit, true);
          if (upcomingEvents.length > 0) {
            setEvents(upcomingEvents);
            log(`[EventsSection] Updated with ${upcomingEvents.length} fresh events`);
          }
          return;
        }
        
        // Fallback to regular cached events if no prefetched data
        const cachedEvents = await getCachedEvents({ date: new Date().toISOString().split('T')[0], limit });
        if (cachedEvents && cachedEvents.length > 0) {
          log(`[EventsSection] Displaying ${cachedEvents.length} cached events immediately`);
          setEvents(cachedEvents);
          setHasCheckedCache(true);
          setLoading(false); // Show cached data immediately - no loading spinner
          
          // Fetch fresh data in background (will update UI when it arrives)
          const upcomingEvents = await fetchUpcomingEvents(limit, true);
          if (upcomingEvents.length > 0) {
            setEvents(upcomingEvents);
            log(`[EventsSection] Updated with ${upcomingEvents.length} fresh events`);
          }
          return;
        }
        
        // No cache available - mark cache as checked, don't show loading spinner
        setHasCheckedCache(true);
        setLoading(false); // No events in cache - don't show spinner
        
        // Load fresh data silently in background
        const upcomingEvents = await fetchUpcomingEvents(limit, false);
        if (upcomingEvents.length > 0) {
          setEvents(upcomingEvents);
          log(`[EventsSection] Loaded ${upcomingEvents.length} fresh events`);
        }
      } catch (error) {
        error('[EventsSection] Error loading initial events:', error);
        setHasCheckedCache(true);
        setLoading(false); // Don't show spinner on error
      }
    };
    
    loadInitialEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]); // limit is the only dependency we care about

  // Refresh events when screen comes into focus - always fetch fresh data
  useFocusEffect(
    React.useCallback(() => {
      // Always fetch fresh data when screen comes into focus (force refresh)
      loadEvents(false, true); // No loading spinner, but force refresh
    }, [])
  );

  // Check user attendance for each event
  useEffect(() => {
    if (user && events.length > 0) {
      checkUserAttendance();
    }
  }, [user, events]);

  // Set up real-time event listening
  useEffect(() => {
    const setupRealtimeSubscription = () => {
      // Listen for new events
      const eventsSubscription = supabase
        .channel('events_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'events'
          },
          (payload) => {
            log('Events real-time update:', payload);
            // Refresh events when any change occurs (without loading spinner)
            loadEvents(false);
          }
        )
        .subscribe();

      // Listen for event attendance changes
      const attendanceSubscription = supabase
        .channel('event_attendees_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_attendees'
          },
          (payload) => {
            log('Event attendance real-time update:', payload);
            // Refresh events to update attendee counts (without loading spinner)
            loadEvents(false);
          }
        )
        .subscribe();

      return () => {
        eventsSubscription.unsubscribe();
        attendanceSubscription.unsubscribe();
      };
    };

    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, []);

  // Periodic refresh as fallback (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      log('Periodic events refresh');
      loadEvents(false);
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll functionality for Gen Z-friendly banner
  useEffect(() => {
    if (bannerEvents.length <= 1 || !autoScrollEnabledRef.current) {
      return;
    }

    const startAutoScroll = () => {
      if (scrollTimerRef.current) {
        clearInterval(scrollTimerRef.current);
      }

      scrollTimerRef.current = setInterval(() => {
        if (!autoScrollEnabledRef.current || bannerEvents.length <= 1) {
          return;
        }

        scrollIndexRef.current = (scrollIndexRef.current + 1) % bannerEvents.length;
        
        try {
          flatListRef.current?.scrollToIndex({
            index: scrollIndexRef.current,
            animated: true,
          });
        } catch (error) {
          // Fallback to scrollToOffset if scrollToIndex fails
          flatListRef.current?.scrollToOffset({
            offset: scrollIndexRef.current * (CARD_WIDTH + Spacing.md),
            animated: true,
          });
        }
      }, 4000); // Auto-scroll every 4 seconds
    };

    startAutoScroll();

    return () => {
      if (scrollTimerRef.current) {
        clearInterval(scrollTimerRef.current);
      }
    };
  }, [bannerEvents]);

  // Pause auto-scroll when user manually scrolls
  const handleScrollBeginDrag = () => {
    autoScrollEnabledRef.current = false;
    if (scrollTimerRef.current) {
      clearInterval(scrollTimerRef.current);
    }
  };

  // Resume auto-scroll after user stops scrolling
  const handleScrollEndDrag = () => {
    setTimeout(() => {
      autoScrollEnabledRef.current = true;
      if (bannerEvents.length > 1) {
        const timer = setInterval(() => {
          if (!autoScrollEnabledRef.current || bannerEvents.length <= 1) {
            clearInterval(timer);
            return;
          }

          scrollIndexRef.current = (scrollIndexRef.current + 1) % bannerEvents.length;
          
          try {
            flatListRef.current?.scrollToIndex({
              index: scrollIndexRef.current,
              animated: true,
            });
          } catch (error) {
            // Fallback to scrollToOffset if scrollToIndex fails
            flatListRef.current?.scrollToOffset({
              offset: scrollIndexRef.current * (CARD_WIDTH + Spacing.md),
              animated: true,
            });
          }
        }, 4000);
        scrollTimerRef.current = timer;
      }
    }, 5000); // Resume after 5 seconds of inactivity
  };

  // Update scroll index when user manually scrolls
  const handleViewableItemsChanged = ({ viewableItems }: any) => {
    if (viewableItems.length > 0 && !autoScrollEnabledRef.current) {
      scrollIndexRef.current = viewableItems[0].index || 0;
    }
  };

  const loadEvents = async (showLoading = true, forceRefresh = false) => {
    try {
      // Clear cache if forcing refresh
      if (forceRefresh) {
        try {
          const { clearEventCache } = await import('../utils/eventUtils');
          await clearEventCache();
          log('[EventsSection] Cache cleared for fresh data');
        } catch (error) {
          error('[EventsSection] Error clearing cache:', error);
        }
      }
      
      // If not forcing refresh, try to load cached data first for instant display
      if (!forceRefresh) {
        const cachedEvents = await getCachedEvents({ date: new Date().toISOString().split('T')[0], limit });
        if (cachedEvents && cachedEvents.length > 0) {
          log(`[EventsSection] Displaying ${cachedEvents.length} cached events immediately`);
          setEvents(cachedEvents);
          setHasCheckedCache(true);
          setLoading(false); // Show cached data immediately - no loading spinner
        } else {
          // No cache - mark as checked, don't show spinner
          setHasCheckedCache(true);
          if (showLoading) {
            setLoading(false); // Don't show spinner if no cache
          }
        }
      } else {
        // Force refresh - mark cache as checked
        setHasCheckedCache(true);
        if (showLoading) {
          setLoading(true); // Only show spinner if explicitly requested
        }
      }
      
      // Fetch fresh data (will update UI when it arrives)
      const upcomingEvents = await fetchUpcomingEvents(limit, !forceRefresh);
      setEvents(upcomingEvents);
      log(`[EventsSection] Loaded ${upcomingEvents.length} fresh events`);
    } catch (error) {
      error('Error loading events:', error);
      // Don't show error toast if we have cached data
      if (showLoading && events.length === 0) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to load events',
        });
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const checkUserAttendance = async () => {
    if (!user) return;

    const attendanceMap: Record<string, boolean> = {};
    const isNetworkErr = (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      return msg.includes('Network request failed') || msg.includes('Failed to fetch');
    };

    for (const event of events) {
      try {
        const isAttending = await isUserAttending(event.id, user.id);
        attendanceMap[event.id] = isAttending;
      } catch (error) {
        if (isNetworkErr(error)) {
          if (__DEV__) warn(`[EventsSection] Attendance check skipped (network) for event ${event.id}`);
        } else {
          error(`Error checking attendance for event ${event.id}:`, error);
        }
        attendanceMap[event.id] = false;
      }
    }

    setUserAttendance(attendanceMap);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Force refresh (bypass cache)
    await loadEvents(true, true);
    setRefreshing(false);
  };

  const handleEventPress = async (event: Event) => {
    // Track click if this is an ad and user is not the owner
    if (event.post_type === 'ad' && user && event.host_id !== user.id) {
      trackAdClick(event.id, user.id).catch(err => {
        error('[EventsSection] Error tracking ad click:', err);
      });
    }
    
    if (onEventPress) {
      onEventPress(event);
    } else {
      router.push(`/events/${event.id}`);
    }
  };

  const handleJoinEvent = async (eventId: string) => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }

    try {
      setJoiningEvents(prev => new Set(prev).add(eventId));
      
      const isCurrentlyAttending = userAttendance[eventId];
      
      let success: boolean;
      if (isCurrentlyAttending) {
        success = await leaveEvent(eventId, user.id);
      } else {
        success = await joinEvent(eventId, user.id);
      }

      if (success) {
        // Update local state
        setUserAttendance(prev => ({
          ...prev,
          [eventId]: !isCurrentlyAttending
        }));

        // Update attendee count
        setEvents(prev => prev.map(event => 
          event.id === eventId 
            ? { 
                ...event, 
                attendee_count: isCurrentlyAttending 
                  ? (event.attendee_count || 1) - 1
                  : (event.attendee_count || 0) + 1
              }
            : event
        ));

        Toast.show({
          type: 'success',
          text1: isCurrentlyAttending ? 'Left Event' : 'Joined Event',
          text2: isCurrentlyAttending ? 'You left the event' : 'You joined the event',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: isCurrentlyAttending ? 'Failed to leave event' : 'Failed to join event',
        });
      }
    } catch (error) {
      error('Error joining/leaving event:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Something went wrong',
      });
    } finally {
      setJoiningEvents(prev => {
        const newSet = new Set(prev);
        newSet.delete(eventId);
        return newSet;
      });
    }
  };

  const handleViewAllEvents = () => {
    router.push('/events');
  };

  // Compact horizontal event card for banner
  const renderHorizontalEventCard = ({ item, index }: { item: Event; index: number }) => {
    // Use event image if available, otherwise use bundled placeholder
    const imageUrl = item.image_url || getEventPlaceholderImage(index);
    
    return (
      <TouchableOpacity
        style={[styles.horizontalCard, { backgroundColor: themeColors.surface }]}
        onPress={() => handleEventPress(item)}
        activeOpacity={0.8}
      >
        {/* Event Image - Always show (either real or placeholder) */}
        {imageUrl && (
          <View style={[styles.horizontalImageContainer, { backgroundColor: themeColors.neutral.card }]}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.horizontalEventImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              placeholder={null} // No placeholder needed since we're using bundled images
            />
          </View>
        )}

        {/* Minimal title inside the card container, below the banner */}
        {item.title ? (
          <View style={styles.horizontalTitleContainer}>
            <Text
              style={[
                styles.horizontalTitleText,
                { color: themeColors.text } // Theme-responsive text color
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const formatEventDate = (dateString: string | null, timeString: string | null) => {
    if (!dateString || !timeString) {
      return 'No date set';
    }
    
    const eventDate = new Date(`${dateString}T${timeString}`);
    const now = new Date();
    const isToday = eventDate.toDateString() === now.toDateString();
    const isTomorrow = eventDate.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
    
    if (isToday) {
      return `Today at ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (isTomorrow) {
      return `Tomorrow at ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return eventDate.toLocaleDateString([], { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  // Only show loading spinner if we're actively fetching AND haven't checked cache yet
  // Don't show spinner if cache check completed with no events
  if (loading && !hasCheckedCache && events.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.surface }]}>
        <ActivityIndicator size="large" color={themeColors.primary.main} />
        <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
          Loading events...
        </Text>
      </View>
    );
  }

  // Hide component if no events after cache check completes (no spinner, just hide)
  if (hasCheckedCache && bannerEvents.length === 0) {
    return null;
  }

  return (
    <View style={[styles.bannerContainer, { backgroundColor: themeColors.surface }]}>
      <FlatList
        ref={flatListRef}
        data={bannerEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => renderHorizontalEventCard({ item, index })}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalEventsList}
        snapToInterval={CARD_WIDTH + Spacing.md}
        decelerationRate="fast"
        snapToAlignment="start"
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
        }}
        getItemLayout={(data, index) => ({
          length: CARD_WIDTH + Spacing.md,
          offset: (CARD_WIDTH + Spacing.md) * index,
          index,
        })}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        initialNumToRender={3}
        windowSize={3}
        updateCellsBatchingPeriod={50}
      />

      {/* Small disclaimer with "Contact" CTA close to text – opens chat with official account */}
      <View style={styles.bannerDisclaimerContainer}>
        <Text style={[styles.bannerDisclaimerText, { color: themeColors.textSecondary }]}>
          Advertise here & on video feed
        </Text>
        <Link href={`/chat/${OFFICIAL_ACCOUNT_ID}` as any} prefetch asChild>
          <TouchableOpacity style={styles.bannerDisclaimerCtaWrap} activeOpacity={0.7}>
            <Text style={[styles.bannerDisclaimerCtaLabel, { color: themeColors.primary.main }]}>
              Contact
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Banner container styles
  bannerContainer: {
    marginHorizontal: screenWidth >= 768 ? Spacing.xl : Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  bannerDisclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 2,
    paddingHorizontal: Spacing.sm,
    gap: 4,
  },
  bannerDisclaimerText: {
    fontSize: FontSizes.caption - 1,
    fontFamily: FontFamily.regular,
    opacity: 0.85,
  },
  bannerDisclaimerCtaWrap: {
    paddingVertical: 2,
    paddingLeft: 2,
  },
  bannerDisclaimerCtaLabel: {
    fontSize: FontSizes.caption - 1,
    fontFamily: FontFamily.medium,
    textDecorationLine: 'underline',
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  bannerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerHeaderTitle: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    marginLeft: Spacing.xs,
  },
  bannerViewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  bannerViewAllText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    marginRight: Spacing.xs,
  },
  horizontalEventsList: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  
  // Horizontal card styles - pure banner look, no extra content
  horizontalCard: {
    width: CARD_WIDTH,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  horizontalImageContainer: {
    position: 'relative',
    height: 80,
    width: '100%',
    overflow: 'hidden',
  },
  horizontalEventImage: {
    width: '100%',
    height: '100%',
  },
  // Minimal title row inside the card container (below the banner)
  horizontalTitleContainer: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  horizontalTitleText: {
    fontSize: FontSizes.xs + 1,
    fontFamily: FontFamily.semibold,
  },
  horizontalCategoryBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    marginLeft: Spacing.xs,
    alignSelf: 'flex-start',
  },
  horizontalCategoryText: {
    fontSize: FontSizes.caption - 2,
    fontFamily: FontFamily.medium,
    fontWeight: '600',
  },
  horizontalContent: {
    padding: Spacing.xs + 2,
    paddingTop: Spacing.xs + 2,
    paddingBottom: Spacing.xs,
    justifyContent: 'center', // Center the title vertically
    flex: 1,
    minHeight: 30, // Ensure enough space for title
  },
  horizontalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  horizontalTitle: {
    fontSize: FontSizes.xs + 1,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    lineHeight: 14,
    marginBottom: 0,
    flex: 1,
    flexShrink: 1,
  },
  horizontalDetails: {
    marginBottom: Spacing.xs,
    minHeight: 32, // Reserve minimum height for details section
  },
  horizontalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
  },
  horizontalDetailText: {
    fontSize: FontSizes.xs + 1,
    fontFamily: FontFamily.regular,
    marginLeft: Spacing.xs / 2,
    flex: 1,
  },
  horizontalViewMoreButton: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginTop: 2,
    flexDirection: 'row',
  },
  horizontalJoinButton: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 2,
  },
  horizontalJoinButtonText: {
    fontSize: FontSizes.xs + 1,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
  loadingContainer: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    ...Shadow.sm,
  },
  loadingText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.sm,
  },
  emptyContainer: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    ...Shadow.sm,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
});
