/**
 * Setup User Suspension Feature
 * Adds required columns to profiles table for user suspension functionality
 */

import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Get the SQL migration for user suspension columns
 */
export function getUserSuspensionMigrationSQL() {
  return `-- Add user suspension columns to profiles table
-- This migration adds support for admin user suspension functionality

-- Add is_suspended column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'is_suspended'
    ) THEN
        ALTER TABLE profiles ADD COLUMN is_suspended BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_suspended column to profiles table';
    ELSE
        RAISE NOTICE 'is_suspended column already exists in profiles table';
    END IF;
END $$;

-- Add suspended_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'suspended_at'
    ) THEN
        ALTER TABLE profiles ADD COLUMN suspended_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added suspended_at column to profiles table';
    ELSE
        RAISE NOTICE 'suspended_at column already exists in profiles table';
    END IF;
END $$;

-- Add suspended_by column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'suspended_by'
    ) THEN
        ALTER TABLE profiles ADD COLUMN suspended_by UUID REFERENCES profiles(id);
        RAISE NOTICE 'Added suspended_by column to profiles table';
    ELSE
        RAISE NOTICE 'suspended_by column already exists in profiles table';
    END IF;
END $$;

-- Add suspension_reason column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'suspension_reason'
    ) THEN
        ALTER TABLE profiles ADD COLUMN suspension_reason TEXT;
        RAISE NOTICE 'Added suspension_reason column to profiles table';
    ELSE
        RAISE NOTICE 'suspension_reason column already exists in profiles table';
    END IF;
END $$;

-- Create index on is_suspended for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON profiles(is_suspended) WHERE is_suspended = true;

-- Add comments to document the new columns
COMMENT ON COLUMN profiles.is_suspended IS 'Whether the user account is currently suspended by an admin';
COMMENT ON COLUMN profiles.suspended_at IS 'Timestamp when the user was suspended';
COMMENT ON COLUMN profiles.suspended_by IS 'ID of the admin user who suspended this account';
COMMENT ON COLUMN profiles.suspension_reason IS 'Reason for the suspension (optional)';

-- Grant necessary permissions
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, UPDATE ON profiles TO service_role;`;
}

/**
 * Setup user suspension feature by adding required columns
 * This function attempts to add the columns via RPC if available
 */
export const setupUserSuspension = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    log('[UserSuspension] Setting up user suspension feature...');
    
    // Try to execute the migration via RPC (if execute_sql function exists)
    const migrationSQL = getUserSuspensionMigrationSQL();
    
    const { error: rpcError } = await supabase.rpc('execute_sql', {
      sql: migrationSQL,
    });

    if (rpcError) {
      error('[UserSuspension] RPC error:', rpcError);
      // Return the SQL so admin can run it manually
      return {
        success: false,
        error: `Database migration required. Please run this SQL in your Supabase dashboard:\n\n${migrationSQL}`,
      };
    }

    log('[UserSuspension] ✅ User suspension columns added successfully');
    return { success: true };
  } catch (error: any) {
    error('[UserSuspension] Exception setting up suspension:', error);
    const migrationSQL = getUserSuspensionMigrationSQL();
    return {
      success: false,
      error: `Database migration required. Please run this SQL in your Supabase dashboard:\n\n${migrationSQL}`,
    };
  }
};

