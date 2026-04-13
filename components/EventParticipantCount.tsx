import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Users } from 'lucide-react-native';
import { supabase } from '../utils/supabase';
import { Colors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import { log, warn, error } from '../utils/productionLogger';


type EventParticipantCountProps = {
  eventId: string;
  maxAttendees?: number | null;
  initialCount?: number;
};

export default function EventParticipantCount({ 
  eventId, 
  maxAttendees = null,
  initialCount = 0
}: EventParticipantCountProps) {
  const [count, setCount] = useState(initialCount);
  const initialCountRef = useRef(initialCount);
  const eventIdRef = useRef(eventId);
  
  // Update refs when props change
  useEffect(() => {
    eventIdRef.current = eventId;
  }, [eventId]);
  
  useEffect(() => {
    // Only update state from initialCount when it actually changes
    if (initialCount !== initialCountRef.current) {
      initialCountRef.current = initialCount;
      setCount(initialCount);
    }
  }, [initialCount]);
  
  useEffect(() => {
    // Set up realtime subscription
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
          log('[EventParticipantCount] Participant count update:', payload);
          
          // When someone is added or removed, fetch the accurate count rather than incrementing/decrementing
          // This ensures we're only counting participants with valid profiles
          fetchParticipantCount();
        }
      )
      .subscribe();
    
    // Fetch the current accurate count on mount
    fetchParticipantCount();
    
    // Clean up subscription
    return () => {
      supabase.removeChannel(subscription);
    };
  }, [eventId]); // Only depend on eventId, not initialCount
  
  const fetchParticipantCount = async () => {
    try {
      // First, get all attendee records with their associated profiles
      const { data, error } = await supabase
        .from('event_attendees')
        .select('user_id, profiles(*)')
        .eq('event_id', eventId);
      
      if (error) {
        error('[EventParticipantCount] Error fetching attendees:', error);
        return;
      }
      
      if (data) {
        // Only count attendees with valid profiles
        const validProfiles = data.filter(item => item.profiles && Object.keys(item.profiles).length > 0);
        log(`[EventParticipantCount] Found ${validProfiles?.length || 0} valid participants out of ${data?.length || 0} total`);
        setCount((validProfiles?.length || 0));
      }
    } catch (error) {
      error('[EventParticipantCount] Error fetching participant count:', error);
    }
  };
  
  const isFull = maxAttendees !== null && count >= maxAttendees;
  
  return (
    <View style={styles.container}>
      <Users size={16} color={Colors.secondary.main} />
      <Text style={styles.text}>
        {count} {maxAttendees ? `/ ${maxAttendees}` : ''}
        {isFull && ' (Full)'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral.card,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  text: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.text,
    marginLeft: Spacing.xs,
  },
}); 