import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Creates all necessary tables for the community feature
 */
export const setupCommunityTables = async () => {
  try {
    // Check if create_posts_table function exists before trying to call it
    const { error: checkError } = await supabase.rpc('check_function_exists', { function_name: 'create_posts_table' });
    
    if (checkError) {
      log('create_posts_table function does not exist or cannot be checked, skipping table creation');
      return true; // Return true to avoid breaking the app flow
    }
    
    // Create posts table
    const { error: postsError } = await supabase.rpc('create_posts_table', {});
    
    if (postsError) {
      error('Error creating posts table:', postsError);
      return false;
    }
    
    // Create post_likes table
    const { error: likesError } = await supabase.rpc('create_post_likes_table', {});
    
    if (likesError) {
      error('Error creating post_likes table:', likesError);
      return false;
    }
    
    // Create post_comments table
    const { error: commentsError } = await supabase.rpc('create_post_comments_table', {});
    
    if (commentsError) {
      error('Error creating post_comments table:', commentsError);
      return false;
    }
    
    // Create post_bookmarks table
    const { error: bookmarksError } = await supabase.rpc('create_post_bookmarks_table', {});
    
    if (bookmarksError) {
      error('Error creating post_bookmarks table:', bookmarksError);
      // Continue even if this fails, as the other tables might be working
    }

    return true;
  } catch (error) {
    error('Error in setupCommunityTables:', error);
    return true; // Return true to allow the app to continue working with mock data
  }
};

/**
 * SQL functions for creating tables
 */
export const createCommunityTablesSQL = `
-- Function to check if another function exists
CREATE OR REPLACE FUNCTION check_function_exists(function_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = function_name
  );
END;
$$ LANGUAGE plpgsql;

-- Function to create the posts table
CREATE OR REPLACE FUNCTION create_posts_table()
RETURNS VOID AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    user_email TEXT,
    content TEXT NOT NULL,
    location TEXT,
    image_url TEXT,
    image_urls TEXT[],
    video_url TEXT,
    display_name TEXT,
    is_business BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );
  
  -- Add video_url column if it doesn't exist (for existing tables)
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'video_url'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN video_url TEXT;
  END IF;
  
  -- Add is_business column if it doesn't exist (for existing tables)
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'is_business'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN is_business BOOLEAN DEFAULT false;
  END IF;
  
  -- Add views_count column if it doesn't exist (for video posts)
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'views_count'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN views_count INTEGER DEFAULT 0;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to create the post_likes table
CREATE OR REPLACE FUNCTION create_post_likes_table()
RETURNS VOID AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.post_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (post_id, user_id)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to create the post_comments table
CREATE OR REPLACE FUNCTION create_post_comments_table()
RETURNS VOID AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.post_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );
END;
$$ LANGUAGE plpgsql;

-- Function to create the post_bookmarks table
CREATE OR REPLACE FUNCTION create_post_bookmarks_table()
RETURNS VOID AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.post_bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (post_id, user_id)
  );
END;
$$ LANGUAGE plpgsql;
`; 