import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Create the events_participants table separately
 * This is a workaround for when the table creation through setupDatabase fails
 */
export const createEventsParticipantsTable = async () => {
  try {
    log('Attempting to create events_participants table directly...');
    
    // Check if events table exists first
    const { error: eventsError } = await supabase.from('events').select('id').limit(1);
    
    if (eventsError) {
      error('Cannot create events_participants because events table does not exist:', eventsError);
      return false;
    }
    
    // Try to create the table using SQL
    const { error } = await supabase.rpc('execute_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.events_participants (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
          joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(event_id, user_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_events_participants_event_id ON public.events_participants USING btree (event_id);
        CREATE INDEX IF NOT EXISTS idx_events_participants_user_id ON public.events_participants USING btree (user_id);
      `
    });
    
    if (error) {
      error('Failed to create events_participants table:', error);
      return false;
    }
    
    log('Successfully created events_participants table');
    return true;
  } catch (error) {
    error('Exception creating events_participants table:', error);
    return false;
  }
};

/**
 * Call this function to force the creation of the events_participants table
 * if it doesn't exist yet and the app is having trouble with participant tracking
 */
export const initializeEventsParticipantsTable = async () => {
  try {
    // First check if the table already exists
    const { error } = await supabase.from('events_participants').select('count');
    
    if (error && error.code === '42P01') {
      // Table doesn't exist, try to create it
      return await createEventsParticipantsTable();
    } else {
      log('events_participants table already exists');
      return true;
    }
  } catch (error) {
    error('Error checking events_participants table:', error);
    return false;
  }
}; 