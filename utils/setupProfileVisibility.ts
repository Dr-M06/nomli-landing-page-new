import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Setup profile visibility feature by adding the required column to the profiles table
 * This function safely adds the profile_visible column if it doesn't exist
 */
export const setupProfileVisibility = async (): Promise<boolean> => {
  try {
    log('[ProfileVisibility] Setting up profile visibility feature...');
    
    // First, check if the column already exists
    const { data: columns, error: checkError } = await supabase
      .rpc('get_column_names', { table_name: 'profiles' });
    
    if (checkError) {
      log('[ProfileVisibility] Could not check existing columns, attempting to add column...');
    } else if (columns && columns.includes('profile_visible')) {
      log('[ProfileVisibility] Column already exists, no setup needed');
      return true;
    }
    
    // Add the column using a raw SQL query
    const { error: alterError } = await supabase.rpc('execute_sql', {
      sql: `
        DO $$ 
        BEGIN
            -- Add the column if it doesn't exist
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'profiles' 
                AND column_name = 'profile_visible'
            ) THEN
                ALTER TABLE profiles ADD COLUMN profile_visible BOOLEAN DEFAULT true;
                
                -- Add a comment to document the column
                COMMENT ON COLUMN profiles.profile_visible IS 'Controls whether the user profile is visible in nearby users search. Default is true (visible).';
                
                -- Create an index for faster queries when filtering visible profiles
                CREATE INDEX IF NOT EXISTS idx_profiles_visible ON profiles(profile_visible) WHERE profile_visible = true;
            END IF;
        END $$;
      `
    });
    
    if (alterError) {
      error('[ProfileVisibility] Error setting up profile visibility:', alterError);
      return false;
    }
    
    log('[ProfileVisibility] Profile visibility feature setup completed successfully');
    return true;
  } catch (error) {
    error('[ProfileVisibility] Error in setupProfileVisibility:', error);
    return false;
  }
};

/**
 * Simpler version that just adds the column using a direct ALTER TABLE
 */
export const addProfileVisibilityColumn = async (): Promise<boolean> => {
  try {
    log('[ProfileVisibility] Adding profile_visible column...');
    
    // Try to add the column (will fail silently if it already exists)
    const { error } = await supabase.rpc('exec', {
      sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN DEFAULT true;`
    });
    
    if (error && !error.message?.includes('already exists')) {
      error('[ProfileVisibility] Error adding column:', error);
      return false;
    }
    
    log('[ProfileVisibility] Column added successfully');
    return true;
  } catch (error) {
    error('[ProfileVisibility] Error in addProfileVisibilityColumn:', error);
    return false;
  }
};
