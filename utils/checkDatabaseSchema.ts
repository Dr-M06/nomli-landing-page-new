import { supabase } from './supabase';
import { customNotifications } from './customNotifications';
import { log, warn, error } from './productionLogger';


/**
 * Check if the notification database schema is properly set up
 */
export async function checkNotificationSchema() {
  log('🔍 Checking notification database schema...');
  
  try {
    // Check if profiles table has the required columns
    const { data, error } = await supabase
      .from('profiles')
      .select('id, expo_push_token, push_token_updated_at')
      .limit(1);
    
    if (error) {
      if (error.code === '42703') {
        log('❌ Missing columns in profiles table');
        log('   - expo_push_token column does not exist');
        log('   - push_token_updated_at column does not exist');
        log('');
        log('🔧 Solution: Run the database migration:');
        log('   20241201000000_add_expo_push_tokens.sql');
        log('');
        log('📱 How to run:');
        log('   1. Go to Supabase Dashboard → SQL Editor');
        log('   2. Copy the migration SQL');
        log('   3. Run the SQL');
        return false;
      } else {
        log('❌ Database error:', error);
        return false;
      }
    }
    
    log('✅ Database schema is correct');
    log('✅ expo_push_token column exists');
    log('✅ push_token_updated_at column exists');
    
    // Check if we can actually update the columns
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          expo_push_token: 'test-token-' + Date.now(),
          push_token_updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (updateError) {
        log('❌ Cannot update profile:', updateError);
        return false;
      }
      
      log('✅ Profile update test successful');
      
      // Clean up test data
      await supabase
        .from('profiles')
        .update({ 
          expo_push_token: null,
          push_token_updated_at: null
        })
        .eq('id', user.id);
    }
    
    return true;
    
  } catch (error) {
    error('❌ Error checking schema:', error);
    return false;
  }
}

/**
 * Test the custom notification service
 */
export async function testCustomNotificationService() {
  log('🧪 Testing custom notification service...');
  
  try {
    // Test initialization
    const initialized = await customNotifications.initialize();
    log('✅ Custom service initialized:', initialized ? 'SUCCESS' : 'FAILED');
    
    if (initialized) {
      // Test getting push token
      const token = await customNotifications.getPushToken();
      log('✅ Push token obtained:', token ? 'Present' : 'NONE');
      
      // Test notification channels
      await customNotifications.setupNotificationChannels();
      log('✅ Notification channels set up');
    }
    
    return initialized;
    
  } catch (error) {
    error('❌ Error testing custom service:', error);
    return false;
  }
}

/**
 * Get the migration SQL that needs to be run
 */
export function getMigrationSQL() {
  return `-- Add Expo push token columns to profiles table
-- This migration adds support for the new clean Expo push notification system

-- Add expo_push_token column if it doesn't exist
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

-- Add push_token_updated_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'push_token_updated_at'
    ) THEN
        ALTER TABLE profiles ADD COLUMN push_token_updated_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added push_token_updated_at column to profiles table';
    ELSE
        RAISE NOTICE 'push_token_updated_at column already exists in profiles table';
    END IF;
END $$;

-- Create index on expo_push_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_expo_push_token ON profiles(expo_push_token);

-- Add comment to document the new columns
COMMENT ON COLUMN profiles.expo_push_token IS 'Expo push notification token for this user';
COMMENT ON COLUMN profiles.push_token_updated_at IS 'Timestamp when the push token was last updated';

-- Grant necessary permissions
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, UPDATE ON profiles TO service_role;`;
}
