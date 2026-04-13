import { supabase } from './supabase';
import { Alert } from 'react-native';
import { log, warn, error } from './productionLogger';


// SQL as a string (copied from setup_country_chat.sql)
const SETUP_COUNTRY_CHAT_SQL = `
-- Create countries table
CREATE TABLE IF NOT EXISTS public.countries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    flag_emoji TEXT NOT NULL,
    region TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create country chatrooms table
CREATE TABLE IF NOT EXISTS public.country_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_id UUID REFERENCES public.countries(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    participant_count INTEGER DEFAULT 0
);

-- Create country chat messages table
CREATE TABLE IF NOT EXISTS public.country_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_chat_id UUID REFERENCES public.country_chats(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_pinned BOOLEAN DEFAULT false
);

-- Create country chat participants table
CREATE TABLE IF NOT EXISTS public.country_chat_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_chat_id UUID REFERENCES public.country_chats(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create bookmarked messages table
CREATE TABLE IF NOT EXISTS public.bookmarked_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_id UUID NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('country_chat', 'community_post')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create community posts table
CREATE TABLE IF NOT EXISTS public.community_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    media_url JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0
);

-- Create community post comments table
CREATE TABLE IF NOT EXISTS public.community_post_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create community post likes table
CREATE TABLE IF NOT EXISTS public.community_post_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

-- Insert some sample countries
INSERT INTO public.countries (name, code, flag_emoji, region)
VALUES 
    ('Nigeria', 'NG', '🇳🇬', 'Africa'),
    ('Ghana', 'GH', '🇬🇭', 'Africa'),
    ('Kenya', 'KE', '🇰🇪', 'Africa'),
    ('South Africa', 'ZA', '🇿🇦', 'Africa'),
    ('Egypt', 'EG', '🇪🇬', 'Africa'),
    ('United States', 'US', '🇺🇸', 'North America'),
    ('Canada', 'CA', '🇨🇦', 'North America'),
    ('United Kingdom', 'GB', '🇬🇧', 'Europe'),
    ('France', 'FR', '🇫🇷', 'Europe'),
    ('Germany', 'DE', '🇩🇪', 'Europe'),
    ('Australia', 'AU', '🇦🇺', 'Oceania'),
    ('Japan', 'JP', '🇯🇵', 'Asia'),
    ('China', 'CN', '🇨🇳', 'Asia'),
    ('India', 'IN', '🇮🇳', 'Asia'),
    ('Brazil', 'BR', '🇧🇷', 'South America')
ON CONFLICT (code) DO NOTHING;

-- Create a chat room for each country
INSERT INTO public.country_chats (country_id, name, description)
SELECT 
    id, 
    name || ' Chat', 
    'Welcome to the ' || name || ' chat room! Connect with travelers and locals in ' || name || '.'
FROM public.countries
ON CONFLICT DO NOTHING;
`;

// Function to check if execute_sql RPC function exists
const checkExecuteSqlFunction = async () => {
  try {
    await supabase.rpc('execute_sql', { sql_string: 'SELECT 1' });
    return true;
  } catch (error: any) {
    if (error.message.includes("function") && error.message.includes("does not exist")) {
      return false;
    }
    throw error; // Re-throw other errors
  }
};

// Simple function to create basic countries table directly
const createCountriesTableDirect = async () => {
  try {
    log('Attempting to create countries table directly...');
    
    // Create countries table using Supabase's createTable method
    // NOTE: This is a simplified approach that only creates the countries table
    // with minimal functionality. For the full setup, you need to use the SQL script.
    
    // First, get the database schema info
    const { error: schemaError } = await supabase
      .from('_schemas')
      .select('*')
      .limit(1);
    
    if (schemaError) {
      // Try direct insert to see if table exists
      const { error: createError } = await supabase
        .from('countries')
        .insert([
          {
            name: 'Nigeria',
            code: 'NG',
            flag_emoji: '🇳🇬',
            region: 'Africa'
          }
        ]);
      
      if (createError && createError.code === '42P01') {
        error('Could not create countries table directly.');
        return false;
      } else if (!createError) {
        log('Countries table exists and record was inserted!');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    error('Error in createCountriesTableDirect:', error);
    return false;
  }
};

// Modified function to check for chat_rooms table
export const setupCountryChatTables = async () => {
  try {
    log('Checking existing chat_rooms and chat_messages tables...');
    
    // Check if chat_rooms table exists
    const { error: roomsError } = await supabase.from('chat_rooms').select('count');
    
    if (roomsError) {
      error('Error accessing chat_rooms table:', roomsError);
      Alert.alert(
        'Database Configuration Error',
        'Could not access the chat_rooms table. Please check your database setup.',
        [{ text: 'OK' }]
      );
      return false;
    }
    
    // Check if chat_messages table exists
    const { error: messagesError } = await supabase.from('chat_messages').select('count');
    
    if (messagesError) {
      error('Error accessing chat_messages table:', messagesError);
      Alert.alert(
        'Database Configuration Error',
        'Could not access the chat_messages table. Please check your database setup.',
        [{ text: 'OK' }]
      );
      return false;
    }
    
    log('All required tables exist - using existing database schema');
    return true;
  } catch (error) {
    error('Error in setupCountryChatTables:', error);
    Alert.alert(
      'Database Connection Error',
      'Could not connect to the database. Please check your internet connection and try again.',
      [{ text: 'OK' }]
    );
    return false;
  }
}; 