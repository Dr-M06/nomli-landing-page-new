import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


// Cache to track if database setup is already complete (avoids repeated checks)
let dbSetupComplete: boolean | null = null;
let dbSetupPromise: Promise<boolean> | null = null;

/**
 * Backward compatibility function - redirects to setupNotificationDatabase
 * @deprecated Use setupNotificationDatabase instead
 * 
 * Optimized to cache the setup status and avoid repeated database queries
 */
export const ensureDbSetup = async (): Promise<void> => {
  // If we already know setup is complete, skip entirely
  if (dbSetupComplete === true) {
    return;
  }
  
  // If setup is already in progress, wait for it
  if (dbSetupPromise) {
    await dbSetupPromise;
    return;
  }
  
  // Start setup check (only log first time or if we're not sure)
  if (dbSetupComplete === null) {
    // Only log on first call to reduce log spam
    if (__DEV__) {
      log('[ensureDbSetup] Checking database setup...');
    }
  }
  
  try {
    // Create a single promise that all callers can await
    dbSetupPromise = setupNotificationDatabase();
    const result = await dbSetupPromise;
    
    // Cache the result
    dbSetupComplete = result;
    dbSetupPromise = null;
    
    // Only log if setup was needed (not already complete)
    if (result && dbSetupComplete === true) {
      if (__DEV__) {
        log('[ensureDbSetup] Database setup verified');
      }
    }
  } catch (error) {
    dbSetupPromise = null;
    // Don't cache errors - allow retry on next call
    if (__DEV__) {
    error('[ensureDbSetup] Error during setup:', error);
    }
    // Don't throw the error, just log it to prevent app crashes
  }
};

/**
 * Ensure the database has all required tables and columns for notifications
 */
export async function ensureNotificationDatabaseSetup(): Promise<boolean> {
  try {
    // Check if expo_push_token column exists
    const { data: profiles, error: checkError } = await supabase
      .from('profiles')
      .select('id, expo_push_token')
      .limit(1);

    if (checkError) {
      if (__DEV__) {
      log('❌ Error checking profiles table:', checkError);
      }
      return false;
    }

    // If the column doesn't exist, we need to run the migration
    if (!profiles || profiles.length === 0) {
      if (__DEV__) {
      log('⚠️ Profiles table may be empty or expo_push_token column missing');
      log('📋 Please run the migration: 20241201000000_add_expo_push_tokens.sql');
      }
      return false;
    }

    // Check if the column has the expected structure
    const profile = profiles[0];
    if (!profile || !profile.hasOwnProperty('expo_push_token')) {
      if (__DEV__) {
      log('❌ expo_push_token column missing from profiles table');
      log('📋 Please run the migration: 20241201000000_add_expo_push_tokens.sql');
      }
      return false;
    }
    
    // Column exists, that's all we need to verify
    return true;

  } catch (error) {
    if (__DEV__) {
    error('❌ Error ensuring database setup:', error);
    }
    return false;
  }
}

/**
 * Create the expo_push_token column if it doesn't exist
 * This is a fallback if the migration hasn't been run
 */
export async function createExpoPushTokenColumn(): Promise<boolean> {
  try {
    log('🔧 Creating expo_push_token column...');

    // Try to add the column using a direct SQL query
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'profiles' 
                AND column_name = 'expo_push_token'
            ) THEN
                ALTER TABLE profiles ADD COLUMN expo_push_token TEXT;
                RAISE NOTICE 'Added expo_push_token column to profiles table';
            ELSE
                RAISE NOTICE 'expo_push_token column already exists in profiles table';
            END IF;
        END $$;
      `
    });

    if (error) {
      log('⚠️ Could not create column via RPC');
      log('📋 Please run the migration manually: 20241201000000_add_expo_push_tokens.sql');
      return false;
    }

    log('✅ expo_push_token column created successfully');
    return true;

  } catch (error) {
    error('❌ Error creating expo_push_token column:', error);
    return false;
  }
}

/**
 * Complete database setup for notifications
 */
export async function setupNotificationDatabase(): Promise<boolean> {
  try {
    // Only log on first call to reduce log spam
    const shouldLog = dbSetupComplete === null;
    if (shouldLog) {
    log('🚀 Setting up notification database...');
    }

    // First check if setup is already complete
    const isSetup = await ensureNotificationDatabaseSetup();
    if (isSetup) {
      if (shouldLog) {
      log('✅ Notification database is already properly set up');
      }
      return true;
    }

    // Try to create the missing column
    log('🔧 Attempting to create missing column...');
    const created = await createExpoPushTokenColumn();
    
    if (created) {
      // Verify the setup again
      const verified = await ensureNotificationDatabaseSetup();
      if (verified) {
        log('✅ Notification database setup completed successfully');
        return true;
      }
    }

    log('❌ Could not complete notification database setup');
    log('📋 Please run the migration manually: 20241201000000_add_expo_push_tokens.sql');
    return false;

  } catch (error) {
    error('❌ Error setting up notification database:', error);
    return false;
  }
}

// Default export for backward compatibility
export default ensureDbSetup;

/**
 * Test function to verify ensureDbSetup is working
 */
export const testEnsureDbSetup = async (): Promise<void> => {
  try {
    log('[Test] Testing ensureDbSetup function...');
    await ensureDbSetup();
    log('[Test] ensureDbSetup function test completed successfully');
  } catch (error) {
    error('[Test] ensureDbSetup function test failed:', error);
  }
};


