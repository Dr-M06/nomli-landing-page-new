import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Apply the online status migration to add last_active and online_status fields
 */
export const applyOnlineStatusMigration = async (): Promise<boolean> => {
  try {
    log('[Migration] Starting online status migration...');
    
    // First create the enum type if it doesn't exist
    log('[Migration] Creating online_status_enum type...');
    const { error: enumError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'online_status_enum') THEN
            CREATE TYPE online_status_enum AS ENUM ('online', 'offline', 'away');
          END IF;
        END $$;
      `
    });
    
    if (enumError) {
      error('[Migration] Error creating enum type:', enumError);
      return false;
    }
    
    // Add last_active column
    log('[Migration] Adding last_active column...');
    const { error: lastActiveError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE profiles 
        ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      `
    });
    
    if (lastActiveError) {
      error('[Migration] Error adding last_active column:', lastActiveError);
      return false;
    }
    
    // Add online_status column
    log('[Migration] Adding online_status column...');
    const { error: onlineStatusError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE profiles 
        ADD COLUMN IF NOT EXISTS online_status online_status_enum DEFAULT 'offline';
      `
    });
    
    if (onlineStatusError) {
      error('[Migration] Error adding online_status column:', onlineStatusError);
      return false;
    }
    
    // Update existing profiles to have a last_active timestamp
    log('[Migration] Updating existing profiles with last_active...');
    const { error: updateError } = await supabase.rpc('exec_sql', {
      sql: `
        UPDATE profiles 
        SET last_active = COALESCE(updated_at, created_at, NOW())
        WHERE last_active IS NULL;
      `
    });
    
    if (updateError) {
      error('[Migration] Error updating existing profiles:', updateError);
      return false;
    }
    
    // Set all existing users as offline initially
    log('[Migration] Setting existing users as offline...');
    const { error: offlineError } = await supabase.rpc('exec_sql', {
      sql: `
        UPDATE profiles 
        SET online_status = 'offline'
        WHERE online_status IS NULL;
      `
    });
    
    if (offlineError) {
      error('[Migration] Error setting users as offline:', offlineError);
      return false;
    }
    
    log('[Migration] Online status migration completed successfully!');
    return true;
  } catch (error) {
    error('[Migration] Error applying online status migration:', error);
    return false;
  }
};

/**
 * Check if the online status migration has been applied
 */
export const checkOnlineStatusMigration = async (): Promise<boolean> => {
  try {
    // Try to query the profiles table with the new columns
    const { data, error } = await supabase
      .from('profiles')
      .select('last_active, online_status')
      .limit(1);
    
    if (error) {
      // If we get an error about missing columns, migration hasn't been applied
      if (error.code === '42703') { // undefined_column error
        log('[Migration] Migration not applied - columns missing');
        return false;
      }
      error('[Migration] Error checking migration status:', error);
      return false;
    }
    
    log('[Migration] Migration already applied - columns exist');
    return true;
  } catch (error) {
    error('[Migration] Error checking migration status:', error);
    return false;
  }
}; 