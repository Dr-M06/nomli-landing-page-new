import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Create the event_attendees table separately
 * This is a workaround for when the table creation through setupDatabase fails
 */
export const createEventAttendeesTable = async () => {
  try {
    log('Attempting to create event_attendees table directly...');
    
    // Check if events table exists first
    const { error: eventsError } = await supabase.from('events').select('id').limit(1);
    
    if (eventsError) {
      error('Cannot create event_attendees because events table does not exist:', eventsError);
      return false;
    }

    // Since execute_sql RPC function is not available, try direct insertion
    // First, try to do a simple insert to see if the table already exists
    const testData = {
      event_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
      user_id: '00000000-0000-0000-0000-000000000000' // Using user_id instead of profile_id
    };

    const { error } = await supabase.from('event_attendees').insert([testData]).select();
    
    if (error) {
      // If table doesn't exist (42P01 error)
      log('Could not insert test record, table may not exist:', error);
      // We cannot create the table directly without execute_sql RPC
      // At this point, we need admin intervention to create the table
      error('Cannot automatically create event_attendees table. Please create it manually via Supabase dashboard.');
      
      // Display the correct SQL for the table structure
      warn('=====================================================================');
      warn('IMPORTANT: You may need to manually create the event_attendees table.');
      warn('Run the following SQL in your Supabase SQL Editor:');
      warn('');
      warn(`CREATE TABLE IF NOT EXISTS public.event_attendees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON public.event_attendees USING btree (event_id);  
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id ON public.event_attendees USING btree (user_id);`);
      warn('=====================================================================');
      
      return false;
    } else {
      // Clean up our test data
      try {
        await supabase.from('event_attendees')
          .delete()
          .eq('event_id', '00000000-0000-0000-0000-000000000000')
          .eq('user_id', '00000000-0000-0000-0000-000000000000'); // Clean up using user_id
      } catch (cleanupError) {
        warn('Could not clean up test record:', cleanupError);
      }
    }
    
    log('Successfully verified event_attendees table');
    return true;
  } catch (error) {
    error('Exception checking event_attendees table:', error);
    return false;
  }
};

/**
 * Call this function to force the creation of the event_attendees table
 * if it doesn't exist yet and the app is having trouble with participant tracking
 */
export const initializeEventAttendeesTable = async () => {
  try {
    // First check if the table already exists and has correct structure
    const { error } = await supabase
      .from('event_attendees')
      .select('user_id') // Check for user_id instead of profile_id
      .limit(1);
    
    if (error) {
      log('Error with event_attendees table:', error);
      
      // Table doesn't exist or has wrong structure
      if (error.code === '42P01' || // relation does not exist
          error.message.includes('column') || // column related issues
          error.code === 'PGRST204') { // column not in schema cache
        
        log('Table needs to be created or fixed');
        
        // Try to create/verify it
        return await createEventAttendeesTable();
      }
      
      return false;
    } else {
      log('event_attendees table already exists with correct structure');
      return true;
    }
  } catch (error) {
    error('Error checking event_attendees table:', error);
    return false;
  }
}; 