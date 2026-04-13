import { supabase } from './supabase';

/**
 * Subscribe to real-time updates for all events
 * @param onUpdate Callback function to be called when events are updated
 * @returns A cleanup function to remove the subscription
 */
export const subscribeToEvents = (onUpdate: () => void) => {
  const subscription = supabase
    .channel('events-changes')
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'events' 
      }, 
      () => {
        onUpdate();
      }
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(subscription);
  };
};

/**
 * Subscribe to real-time updates for a specific event
 * @param eventId The ID of the event to subscribe to
 * @param onUpdate Callback function to be called when the event is updated
 * @param onDelete Callback function to be called when the event is deleted (or soft-deleted)
 * @returns A cleanup function to remove the subscription
 */
export const subscribeToEvent = (
  eventId: string, 
  onUpdate: () => void,
  onDelete: () => void
) => {
  const subscription = supabase
    .channel(`event-${eventId}`)
    .on('postgres_changes', 
      { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'events',
        filter: `id=eq.${eventId}`
      }, 
      (payload) => {
        // If the event was soft-deleted (deleted_at was set)
        if (payload.new && payload.new.deleted_at) {
          onDelete();
        } else {
          onUpdate();
        }
      }
    )
    .on('postgres_changes', 
      { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'events',
        filter: `id=eq.${eventId}`
      }, 
      () => {
        onDelete();
      }
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(subscription);
  };
};

/**
 * Subscribe to real-time updates for participants of a specific event
 * @param eventId The ID of the event
 * @param onUpdate Callback function to be called when participants change
 * @returns A cleanup function to remove the subscription
 */
export const subscribeToEventParticipants = (
  eventId: string, 
  onUpdate: () => void
) => {
  const subscription = supabase
    .channel(`event-participants-${eventId}`)
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'event_attendees',
        filter: `event_id=eq.${eventId}`
      }, 
      () => {
        onUpdate();
      }
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(subscription);
  };
}; 