import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Setup the followers system by running the migration
 * This should be run once to initialize the followers functionality
 */
export const setupFollowersSystem = async (): Promise<boolean> => {
  try {
    log('[FollowersSetup] Setting up followers system...');
    
    // Read the migration SQL
    const migrationSql = `
      -- Create user_followers table for following relationships
      CREATE TABLE IF NOT EXISTS user_followers (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(follower_id, following_id),
        CHECK(follower_id != following_id)
      );

      -- Create indexes for faster lookups
      CREATE INDEX IF NOT EXISTS idx_user_followers_follower_id ON user_followers(follower_id);
      CREATE INDEX IF NOT EXISTS idx_user_followers_following_id ON user_followers(following_id);
      CREATE INDEX IF NOT EXISTS idx_user_followers_created_at ON user_followers(created_at);

      -- Add followers_count and following_count columns to profiles table
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

      -- Create indexes for the count columns
      CREATE INDEX IF NOT EXISTS idx_profiles_followers_count ON profiles(followers_count);
      CREATE INDEX IF NOT EXISTS idx_profiles_following_count ON profiles(following_count);

      -- Enable RLS (Row Level Security)
      ALTER TABLE user_followers ENABLE ROW LEVEL SECURITY;
    `;

    // Execute the migration
    const { error: migrationError } = await supabase.rpc('execute_sql', {
      sql: migrationSql
    });

    if (migrationError) {
      error('[FollowersSetup] Migration error:', migrationError);
      return false;
    }

    log('[FollowersSetup] Migration completed successfully');

    // Create RLS policies
    const policiesSql = `
      -- Drop existing policies if they exist
      DROP POLICY IF EXISTS "Users can view public follower relationships" ON user_followers;
      DROP POLICY IF EXISTS "Users can follow other users" ON user_followers;
      DROP POLICY IF EXISTS "Users can unfollow other users" ON user_followers;

      -- Create RLS policies for user_followers
      CREATE POLICY "Users can view public follower relationships" ON user_followers
        FOR SELECT USING (true);

      CREATE POLICY "Users can follow other users" ON user_followers
        FOR INSERT WITH CHECK (auth.uid()::text = follower_id::text);

      CREATE POLICY "Users can unfollow other users" ON user_followers
        FOR DELETE USING (auth.uid()::text = follower_id::text);
    `;

    const { error: policiesError } = await supabase.rpc('execute_sql', {
      sql: policiesSql
    });

    if (policiesError) {
      error('[FollowersSetup] Policies error:', policiesError);
      return false;
    }

    log('[FollowersSetup] RLS policies created successfully');

    // Create helper functions
    const functionsSql = `
      -- Drop existing functions if they exist
      DROP FUNCTION IF EXISTS get_user_followers(uuid);
      DROP FUNCTION IF EXISTS get_user_following(uuid);
      DROP FUNCTION IF EXISTS is_following(uuid, uuid);
      DROP FUNCTION IF EXISTS get_mutual_followers(uuid, uuid);
      DROP FUNCTION IF EXISTS update_follower_counts();
      
      -- Function to update follower counts
      CREATE OR REPLACE FUNCTION update_follower_counts()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          -- Increment followers count for the user being followed
          UPDATE profiles 
          SET followers_count = followers_count + 1 
          WHERE id = NEW.following_id;
          
          -- Increment following count for the user who is following
          UPDATE profiles 
          SET following_count = following_count + 1 
          WHERE id = NEW.follower_id;
          
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          -- Decrement followers count for the user being unfollowed
          UPDATE profiles 
          SET followers_count = GREATEST(followers_count - 1, 0)
          WHERE id = OLD.following_id;
          
          -- Decrement following count for the user who is unfollowing
          UPDATE profiles 
          SET following_count = GREATEST(following_count - 1, 0)
          WHERE id = OLD.follower_id;
          
          RETURN OLD;
        END IF;
        
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      -- Create trigger to automatically update counts
      DROP TRIGGER IF EXISTS trigger_update_follower_counts ON user_followers;
      CREATE TRIGGER trigger_update_follower_counts
        AFTER INSERT OR DELETE ON user_followers
        FOR EACH ROW
        EXECUTE FUNCTION update_follower_counts();

      -- Function to check if user A follows user B
      CREATE OR REPLACE FUNCTION is_following(follower_id UUID, following_id UUID)
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN EXISTS(
          SELECT 1 FROM user_followers 
          WHERE follower_id = $1 AND following_id = $2
        );
      END;
      $$ LANGUAGE plpgsql;

      -- Function to get followers for a user
      CREATE OR REPLACE FUNCTION get_user_followers(user_id UUID)
      RETURNS TABLE (
        id UUID,
        username TEXT,
        full_name TEXT,
        avatar_url TEXT,
        is_verified BOOLEAN,
        followed_at TIMESTAMP WITH TIME ZONE
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          p.id,
          p.username,
          p.full_name,
          p.avatar_url,
          p.is_verified,
          uf.created_at as followed_at
        FROM user_followers uf
        JOIN profiles p ON p.id = uf.follower_id
        WHERE uf.following_id = user_id
        ORDER BY uf.created_at DESC;
      END;
      $$ LANGUAGE plpgsql;

      -- Function to get following for a user
      CREATE OR REPLACE FUNCTION get_user_following(user_id UUID)
      RETURNS TABLE (
        id UUID,
        username TEXT,
        full_name TEXT,
        avatar_url TEXT,
        is_verified BOOLEAN,
        followed_at TIMESTAMP WITH TIME ZONE
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          p.id,
          p.username,
          p.full_name,
          p.avatar_url,
          p.is_verified,
          uf.created_at as followed_at
        FROM user_followers uf
        JOIN profiles p ON p.id = uf.following_id
        WHERE uf.follower_id = user_id
        ORDER BY uf.created_at DESC;
      END;
      $$ LANGUAGE plpgsql;
    `;

    const { error: functionsError } = await supabase.rpc('execute_sql', {
      sql: functionsSql
    });

    if (functionsError) {
      error('[FollowersSetup] Functions error:', functionsError);
      return false;
    }

    log('[FollowersSetup] Helper functions created successfully');

    // Initialize counts for existing users
    const initCountsSql = `
      UPDATE profiles 
      SET 
        followers_count = COALESCE((
          SELECT COUNT(*) 
          FROM user_followers 
          WHERE following_id = profiles.id
        ), 0),
        following_count = COALESCE((
          SELECT COUNT(*) 
          FROM user_followers 
          WHERE follower_id = profiles.id
        ), 0)
      WHERE profiles.followers_count IS NULL OR profiles.following_count IS NULL;
    `;

    const { error: initError } = await supabase.rpc('execute_sql', {
      sql: initCountsSql
    });

    if (initError) {
      error('[FollowersSetup] Count initialization error:', initError);
      return false;
    }

    log('[FollowersSetup] Follower counts initialized for existing users');
    log('[FollowersSetup] Followers system setup completed successfully! 🎉');
    
    return true;
  } catch (error) {
    error('[FollowersSetup] Setup failed:', error);
    return false;
  }
};

/**
 * Check if followers system is already set up
 */
export const checkFollowersSystemSetup = async (): Promise<boolean> => {
  try {
    // Check if user_followers table exists
    const { data, error } = await supabase
      .from('user_followers')
      .select('id')
      .limit(1);

    if (error && error.code === '42P01') {
      // Table doesn't exist
      return false;
    }

    // Check if columns exist in profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('followers_count, following_count')
      .limit(1);

    if (profileError) {
      return false;
    }

    return true;
  } catch (error) {
    error('[FollowersSetup] Check failed:', error);
    return false;
  }
};
