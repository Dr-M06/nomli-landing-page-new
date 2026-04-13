import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Completely recreate the followers table with correct references
 * This fixes the "permission denied for table users" error
 */
export const recreateFollowersTable = async (): Promise<boolean> => {
  try {
    log('🔧 [RecreateTable] Recreating followers table with correct references...');
    
    // Step 1: Drop everything related to followers
    log('[RecreateTable] Dropping existing components...');
    const dropSql = `
      -- Drop trigger first
      DROP TRIGGER IF EXISTS trigger_update_follower_counts ON user_followers;
      
      -- Drop functions
      DROP FUNCTION IF EXISTS update_follower_counts();
      DROP FUNCTION IF EXISTS get_user_followers(uuid);
      DROP FUNCTION IF EXISTS get_user_following(uuid);
      DROP FUNCTION IF EXISTS is_following(uuid, uuid);
      DROP FUNCTION IF EXISTS get_mutual_followers(uuid, uuid);
      
      -- Drop table (this will cascade and drop policies)
      DROP TABLE IF EXISTS user_followers CASCADE;
    `;

    const { error: dropError } = await supabase.rpc('execute_sql', {
      sql: dropSql
    });

    if (dropError) {
      error('[RecreateTable] Error dropping components:', dropError);
      return false;
    }

    log('[RecreateTable] Existing components dropped successfully');

    // Step 2: Add columns to profiles if they don't exist
    log('[RecreateTable] Ensuring profile columns exist...');
    const profileColumnsSql = `
      -- Add followers_count and following_count columns to profiles table
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

      -- Create indexes for the count columns
      CREATE INDEX IF NOT EXISTS idx_profiles_followers_count ON profiles(followers_count);
      CREATE INDEX IF NOT EXISTS idx_profiles_following_count ON profiles(following_count);
    `;

    const { error: columnsError } = await supabase.rpc('execute_sql', {
      sql: profileColumnsSql
    });

    if (columnsError) {
      error('[RecreateTable] Error adding columns:', columnsError);
      return false;
    }

    log('[RecreateTable] Profile columns ensured');

    // Step 3: Create the table with correct references
    log('[RecreateTable] Creating new table...');
    const createTableSql = `
      -- Create user_followers table with correct references to profiles
      CREATE TABLE user_followers (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(follower_id, following_id),
        CHECK(follower_id != following_id)
      );

      -- Create indexes for faster lookups
      CREATE INDEX idx_user_followers_follower_id ON user_followers(follower_id);
      CREATE INDEX idx_user_followers_following_id ON user_followers(following_id);
      CREATE INDEX idx_user_followers_created_at ON user_followers(created_at);

      -- Enable RLS
      ALTER TABLE user_followers ENABLE ROW LEVEL SECURITY;
    `;

    const { error: tableError } = await supabase.rpc('execute_sql', {
      sql: createTableSql
    });

    if (tableError) {
      error('[RecreateTable] Error creating table:', tableError);
      return false;
    }

    log('[RecreateTable] Table created successfully');

    // Step 4: Create RLS policies
    log('[RecreateTable] Creating RLS policies...');
    const policiesSql = `
      -- Create RLS policies
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
      error('[RecreateTable] Error creating policies:', policiesError);
      return false;
    }

    log('[RecreateTable] Policies created successfully');

    // Step 5: Create functions
    log('[RecreateTable] Creating functions...');
    const functionsSql = `
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

      -- Create trigger
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
      error('[RecreateTable] Error creating functions:', functionsError);
      return false;
    }

    log('[RecreateTable] Functions created successfully');

    // Step 6: Initialize counts for existing users
    log('[RecreateTable] Initializing counts...');
    const initCountsSql = `
      UPDATE profiles 
      SET 
        followers_count = 0,
        following_count = 0
      WHERE followers_count IS NULL OR following_count IS NULL;
    `;

    const { error: initError } = await supabase.rpc('execute_sql', {
      sql: initCountsSql
    });

    if (initError) {
      error('[RecreateTable] Error initializing counts:', initError);
      return false;
    }

    log('[RecreateTable] Counts initialized');

    log('✅ [RecreateTable] Table recreation completed successfully!');
    log('');
    log('📋 Recreation Summary:');
    log('   ✅ Old table and components dropped');
    log('   ✅ New table created with profiles references');
    log('   ✅ RLS policies configured');
    log('   ✅ Functions and triggers created');
    log('   ✅ Counts initialized');
    log('');
    log('🚀 Your followers system should now work without permission errors!');
    
    return true;
  } catch (error) {
    error('❌ [RecreateTable] Recreation failed:', error);
    return false;
  }
};

/**
 * Test the recreated table
 */
export const testRecreatedTable = async (): Promise<boolean> => {
  try {
    log('🧪 [TestTable] Testing recreated table...');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Test reading
    const { error: readError } = await supabase
      .from('user_followers')
      .select('*')
      .limit(1);

    if (readError) {
      error('[TestTable] Read test failed:', readError);
      return false;
    }

    log('✅ [TestTable] Read test passed');

    // Test function
    const { error: functionError } = await supabase
      .rpc('is_following', {
        follower_id: user.id,
        following_id: user.id
      });

    if (functionError) {
      error('[TestTable] Function test failed:', functionError);
      return false;
    }

    log('✅ [TestTable] Function test passed');
    log('🎉 [TestTable] All tests passed! Table is working correctly.');
    
    return true;
  } catch (error) {
    error('❌ [TestTable] Test failed:', error);
    return false;
  }
};
