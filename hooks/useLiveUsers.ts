import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import useAuth from './useAuth';
import { requestThrottler } from '../utils/requestThrottler';

export interface LiveUser {
  id: string;
  streamId: string;
  username: string;
  full_name?: string;
  avatar?: string;
  streamTitle?: string;
  viewerCount?: number;
  startedAt?: string;
  isLive: boolean;
  adultContent?: boolean;
}

interface LiveStream {
  id: string;
  streamer_id: string;
  title: string;
  is_live: boolean;
  started_at: string;
  viewer_count?: number;
  adult_content?: boolean;
  profiles: {
    id: string;
    username: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export const useLiveUsers = () => {
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  
  // Don't clear live users periodically - let real-time updates handle it
  // This was causing the indicator to flicker

  const fetchLiveUsers = useCallback(async () => {
    try {
      setError(null);
      // Throttle all database queries to prevent overload
      // Check if live_streams table exists by trying a simple query first (throttled)
      const { data: tableCheck, error: tableError } = await requestThrottler.throttle(
        'check_live_streams_table',
        () => supabase
          .from('live_streams')
          .select('id')
          .limit(1),
        2000
      ) as any;
      
      // If table doesn't exist, just return empty array without error
      if (tableError && (tableError.code === '42P01' || tableError.message?.includes('does not exist'))) {
        if (__DEV__) {
          console.log('❌ live_streams table does not exist yet, returning empty array');
        }
        setLiveUsers([]);
        setLoading(false);
        return;
      }
      
      // OLD STABLE BUILD: Simple query - just check is_live and ended_at
      // Database trigger automatically updates updated_at, so we don't need strict time filters
      const { data: liveStreams, error: fetchError } = await requestThrottler.throttle(
        'fetch_live_users',
        () => supabase
          .from('live_streams')
          .select(`
            id,
            streamer_id,
            title,
            is_live,
            started_at,
            updated_at,
            viewer_count,
            adult_content,
            profiles:streamer_id (
              id,
              username,
              full_name,
              avatar_url
            )
          `)
          .eq('is_live', true)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(10),
        3000
      ) as any;

      if (fetchError) {
        console.error('❌ Error fetching live users:', fetchError);
        setError(fetchError.message);
        return;
      }

      // OLD STABLE BUILD: Simple filter - just check is_live and ended_at
      // Database trigger handles updated_at automatically
      const recentStreams = (liveStreams || []).filter(stream => {
        // Only filter out explicitly ended streams
        return stream.is_live === true && !stream.ended_at;
      });

      // Transform data to LiveUser format
      const users: LiveUser[] = (recentStreams as LiveStream[])?.map(stream => ({
        id: stream.streamer_id,
        streamId: stream.id,
        username: stream.profiles?.username || 'Unknown',
        full_name: stream.profiles?.full_name,
        avatar: stream.profiles?.avatar_url,
        streamTitle: stream.title,
        viewerCount: stream.viewer_count || 0,
        startedAt: stream.started_at,
        isLive: stream.is_live,
        adultContent: stream.adult_content || false,
      })) || [];

      // Deduplicate by user ID - keep only the most recent stream per user
      const deduplicatedUsers = users.reduce((acc, current) => {
        const existing = acc.find(user => user.id === current.id);
        if (!existing) {
          acc.push(current);
        } else {
          // Keep the most recent stream (latest startedAt)
          const currentTime = new Date(current.startedAt || 0).getTime();
          const existingTime = new Date(existing.startedAt || 0).getTime();
          if (currentTime > existingTime) {
            const index = acc.findIndex(user => user.id === current.id);
            acc[index] = current;
          }
        }
        return acc;
      }, [] as LiveUser[]);

      // Filter out current user if they're in the list
      const filteredUsers = deduplicatedUsers.filter(liveUser => liveUser.id !== user?.id);
      setLiveUsers(filteredUsers);
    } catch (error: any) {
      // Only log non-timeout errors as errors, timeouts are expected on slow connections
      if (error?.message?.includes('timeout') || error?.message?.includes('Request timeout')) {
        // Silently handle timeouts - they're expected on slow connections
        // Don't set error state for timeouts - keep existing data
        // This prevents UI from showing error messages for expected slow connection behavior
      } else {
        if (__DEV__) {
          console.error('Error in fetchLiveUsers:', error);
        }
        setError(error instanceof Error ? error.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Set up real-time subscription for live streams - STABLE
  useEffect(() => {
    let subscription: any;
    let mounted = true;

    const setupRealtimeSubscription = async () => {
      try {
        subscription = supabase
          .channel('live-streams-updates')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'live_streams',
            },
            (payload) => {
              if (!mounted) return;
              
              // For INSERT events, immediately add new stream to state for instant UI update
              if (payload.eventType === 'INSERT' && payload.new) {
                const newStream = payload.new as any;
                
                // Only add if stream is live and hasn't ended
                if (newStream.is_live && !newStream.ended_at) {
                  
                  // Fetch profile data for the streamer
                  supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .eq('id', newStream.streamer_id)
                    .single()
                    .then(({ data: profile }) => {
                      if (!mounted) return;
                      
                      // Transform to LiveUser format and add immediately
                      const newLiveUser: LiveUser = {
                        id: newStream.streamer_id,
                        streamId: newStream.id,
                        username: profile?.username || 'Unknown',
                        full_name: profile?.full_name,
                        avatar: profile?.avatar_url,
                        streamTitle: newStream.title,
                        viewerCount: newStream.viewer_count || 0,
                        startedAt: newStream.started_at,
                        isLive: newStream.is_live,
                        adultContent: newStream.adult_content || false,
                      };
                      
                      // Filter out current user
                      if (newLiveUser.id !== user?.id) {
                        setLiveUsers(prev => {
                          // Check if user already exists (avoid duplicates)
                          if (prev.some(u => u.id === newLiveUser.id)) {
                            return prev;
                          }
                          // Add to beginning of list (newest first)
                          return [newLiveUser, ...prev];
                        });
                      }
                    })
                    .catch(err => {
                      console.error('❌ [useLiveUsers] Error fetching profile for new stream:', err);
                      // Still add stream even if profile fetch fails
                      const newLiveUser: LiveUser = {
                        id: newStream.streamer_id,
                        streamId: newStream.id,
                        username: 'Unknown',
                        streamTitle: newStream.title,
                        viewerCount: newStream.viewer_count || 0,
                        startedAt: newStream.started_at,
                        isLive: newStream.is_live,
                        adultContent: newStream.adult_content || false,
                      };
                      
                      if (newLiveUser.id !== user?.id) {
                        setLiveUsers(prev => {
                          if (prev.some(u => u.id === newLiveUser.id)) {
                            return prev;
                          }
                          return [newLiveUser, ...prev];
                        });
                      }
                    });
                }
              }
              
              // For UPDATE events, check if stream ended
              if (payload.eventType === 'UPDATE' && payload.new) {
                const newData = payload.new as any;
                const oldData = payload.old as any;
                
                // Check if stream just ended
                const streamEnded = (oldData?.is_live === true && newData?.is_live === false) || 
                                   (!oldData?.ended_at && newData?.ended_at);
                
                if (streamEnded) {
                  setLiveUsers(prev => prev.filter(user => user.streamId !== newData.id));
                }
              }
              
              // For DELETE events, remove from state
              if (payload.eventType === 'DELETE' && payload.old) {
                const oldData = payload.old as any;
                setLiveUsers(prev => prev.filter(user => user.streamId !== oldData.id));
              }
              
              // REMOVED: Background refetch after realtime events - realtime subscription is sufficient
              // This was causing excessive network calls. Realtime updates handle state changes directly.
            }
          )
          .subscribe((status) => {
            if (!mounted) return;
            // Silently handle subscription status
          });
      } catch (subscriptionError) {
        if (__DEV__) {
          console.error('❌ Error setting up live streams subscription:', subscriptionError);
        }
      }
    };

    // Initial fetch
    fetchLiveUsers();

    // Set up real-time subscription
    setupRealtimeSubscription();

    // Periodic refresh every 5 minutes as fallback (increased for high traffic)
    // Real-time subscription handles most updates, polling is just backup
    const interval = setInterval(() => {
      if (mounted) {
        fetchLiveUsers();
      }
    }, 300000); // Increased from 180s to 300s (5 minutes) to reduce database load during high traffic

    return () => {
      mounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
      clearInterval(interval);
    };
  }, [fetchLiveUsers]); // Include fetchLiveUsers but it's memoized with useCallback

  const refreshLiveUsers = useCallback(() => {
    setLoading(true);
    setLiveUsers([]); // Clear current data first
    fetchLiveUsers();
  }, [fetchLiveUsers]);

  return {
    liveUsers,
    loading,
    error,
    refreshLiveUsers,
  };
};
