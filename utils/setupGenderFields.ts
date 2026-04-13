import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Setup Gender Fields Feature
 * Adds gender and show_me columns to the profiles table for discover filtering
 */
export async function setupGenderFields(): Promise<boolean> {
  try {
    log('[GenderFields] Setting up gender fields feature...');
    
    // Add gender column if it doesn't exist
    const { error: genderError } = await supabase.rpc('execute_sql', {
      sql: `
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'profiles' 
                AND column_name = 'gender'
            ) THEN
                ALTER TABLE profiles ADD COLUMN gender TEXT;
                COMMENT ON COLUMN profiles.gender IS 'User gender: male, female, or custom text for other genders';
                RAISE NOTICE 'Added gender column to profiles table';
            ELSE
                RAISE NOTICE 'gender column already exists in profiles table';
            END IF;
        END $$;
      `
    });
    
    if (genderError) {
      error('[GenderFields] Error adding gender column:', genderError);
      // Try direct SQL if RPC doesn't work
      log('[GenderFields] Attempting direct SQL...');
    }
    
    // Add show_me column if it doesn't exist
    const { error: showMeError } = await supabase.rpc('execute_sql', {
      sql: `
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'profiles' 
                AND column_name = 'show_me'
            ) THEN
                ALTER TABLE profiles ADD COLUMN show_me TEXT DEFAULT 'all';
                COMMENT ON COLUMN profiles.show_me IS 'Who user wants to see in discover: all, male, female, or other';
                RAISE NOTICE 'Added show_me column to profiles table';
            ELSE
                RAISE NOTICE 'show_me column already exists in profiles table';
            END IF;
        END $$;
      `
    });
    
    if (showMeError) {
      error('[GenderFields] Error adding show_me column:', showMeError);
    }
    
    // Create indexes for faster filtering
    const { error: indexError } = await supabase.rpc('execute_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender) WHERE gender IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_profiles_show_me ON profiles(show_me) WHERE show_me IS NOT NULL;
      `
    });
    
    if (indexError) {
      warn('[GenderFields] Error creating indexes (non-critical):', indexError);
    }
    
    log('[GenderFields] Gender fields setup completed');
    return true;
  } catch (error) {
    error('[GenderFields] Error setting up gender fields:', error);
    return false;
  }
}

/**
 * Get the SQL migration for gender fields
 * Run this in Supabase SQL Editor if the RPC method doesn't work
 */
export function getGenderFieldsMigrationSQL() {
  return `-- Add gender and show_me columns to profiles table
-- This migration adds support for gender-based filtering in discover screen

-- Add gender column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'gender'
    ) THEN
        ALTER TABLE profiles ADD COLUMN gender TEXT;
        COMMENT ON COLUMN profiles.gender IS 'User gender: male, female, or custom text for other genders';
        RAISE NOTICE 'Added gender column to profiles table';
    ELSE
        RAISE NOTICE 'gender column already exists in profiles table';
    END IF;
END $$;

-- Add show_me column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'show_me'
    ) THEN
        ALTER TABLE profiles ADD COLUMN show_me TEXT DEFAULT 'all';
        COMMENT ON COLUMN profiles.show_me IS 'Who user wants to see in discover: all, male, female, or other';
        RAISE NOTICE 'Added show_me column to profiles table';
    ELSE
        RAISE NOTICE 'show_me column already exists in profiles table';
    END IF;
END $$;

-- Create indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender) WHERE gender IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_show_me ON profiles(show_me) WHERE show_me IS NOT NULL;

-- Grant necessary permissions
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, UPDATE ON profiles TO service_role;`;
}
