import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Setup necessary database tables for the event functionality
 * This function should be called during app initialization if the tables don't exist
 */
export const setupDatabaseTables = async () => {
  try {
    log('Setting up database tables...');
    
    // First check if tables exist to avoid errors
    const { error: checkError } = await supabase.from('events').select('count');
    
    // If there's an error, the table likely doesn't exist
    if (checkError && checkError.code === '42P01') {
      log('Tables do not exist. Creating tables...');
      
      // Create events table
      await supabase.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.events (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title TEXT NOT NULL,
            description TEXT,
            date DATE NOT NULL,
            time TIME WITHOUT TIME ZONE NOT NULL,
            location TEXT NOT NULL,
            max_attendees INTEGER,
            host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            image_url TEXT,
            category TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            deleted_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT events_max_attendees_check CHECK (max_attendees > 0)
          );
          
          CREATE INDEX IF NOT EXISTS idx_events_host_id ON public.events USING btree (host_id);
          CREATE INDEX IF NOT EXISTS idx_events_category ON public.events USING btree (category);
          CREATE INDEX IF NOT EXISTS idx_events_date ON public.events USING btree (date);
          
          CREATE TRIGGER update_events_updated_at 
          BEFORE UPDATE ON events 
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
        `
      });
      
      // Verify that events table was created before creating event_attendees
      const { error: eventsTableCheck } = await supabase.from('events').select('count').limit(1);
      
      if (eventsTableCheck) {
        error('Events table creation failed, cannot create event_attendees:', eventsTableCheck);
      } else {
        log('Events table created successfully, creating event_attendees table...');
        
        // Create event attendees table
        await supabase.rpc('execute_sql', {
          sql: `
            CREATE TABLE IF NOT EXISTS public.event_attendees (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
              profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              UNIQUE(event_id, profile_id)
            );
            
            CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON public.event_attendees USING btree (event_id);
            CREATE INDEX IF NOT EXISTS idx_event_attendees_profile_id ON public.event_attendees USING btree (profile_id);
          `
        });
        
        // Verify event_attendees table creation
        const { error: attendeesCheck } = await supabase.from('event_attendees').select('count').limit(1);
        if (attendeesCheck) {
          error('Event attendees table creation failed:', attendeesCheck);
        } else {
          log('Event attendees table created successfully!');
        }
      }
      
      log('Database tables created successfully!');
    } else {
      log('Database tables already exist.');
    }
    
    return { success: true };
  } catch (error) {
    error('Error setting up database tables:', error);
    return { success: false, error };
  }
};

/**
 * Create a mock chat with predefined users for testing
 * This creates a chat between the current user and a mock user
 */
export const createMockChat = async (userId: string) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    // Create a mock chat
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .insert([{}])
      .select()
      .single();
      
    if (chatError) throw chatError;
    
    // Create a mock user to chat with if needed
    const mockUserId = '00000000-0000-0000-0000-000000000000'; // was 'mock-user-id', use a valid UUID for dev
    const { data: mockUserCheck } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', mockUserId)
      .single();
      
    if (!mockUserCheck) {
      await supabase
        .from('profiles')
        .insert([{
          id: mockUserId,
          full_name: 'Alex Traveler',
          username: 'wanderlust_alex',
          location: 'Bangkok, Thailand',
          bio: 'Adventure seeker exploring Southeast Asia. Love street food and hidden gems!',
          avatar_url: null
        }]);
    }
    
    // Add both users as participants
    await Promise.all([
      supabase
        .from('country_chat_participants')
        .insert([{ country_chat_id: chat.id, user_id: userId }]),
      supabase
        .from('country_chat_participants')
        .insert([{ country_chat_id: chat.id, user_id: mockUserId }])
    ]);
    
    // Add some initial messages
    await supabase
      .from('messages')
      .insert([
        {
          chat_id: chat.id,
          sender_id: mockUserId,
          content: 'Hi there! How are you enjoying your travels?'
        }
      ]);
      
    // Update the chat's last message
    await supabase
      .from('chats')
      .update({
        last_message: 'Hi there! How are you enjoying your travels?',
        last_message_at: new Date().toISOString()
      })
      .eq('id', chat.id);
      
    return { success: true, chatId: chat.id };
  } catch (error) {
    error('Error creating mock chat:', error);
    return { success: false, error };
  }
}; 