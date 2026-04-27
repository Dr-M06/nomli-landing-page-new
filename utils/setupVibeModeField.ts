import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export type VibeMode = 'anyone' | 'gift_required';

/**
 * Setup Vibe Mode field on profiles.
 * vibe_mode: 'anyone' = anyone can send vibe (default); 'gift_required' = only after sending a gift (break the ice).
 */
export async function setupVibeModeField(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('execute_sql', {
      sql: `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'profiles' AND column_name = 'vibe_mode'
            ) THEN
                ALTER TABLE profiles ADD COLUMN vibe_mode TEXT DEFAULT 'anyone';
                COMMENT ON COLUMN profiles.vibe_mode IS 'Who can message: anyone | gift_required (Badoo-style break the ice)';
                RAISE NOTICE 'Added vibe_mode column to profiles table';
            ELSE
                RAISE NOTICE 'vibe_mode column already exists';
            END IF;
        END $$;
      `,
    });
    if (error) {
      warn('[VibeMode] Error adding column (run SQL manually if needed):', error);
    }
    return !error;
  } catch (e) {
    warn('[VibeMode] setup error:', e);
    return false;
  }
}

/** SQL to run in Supabase SQL Editor if RPC is not available. */
export const VIBE_MODE_MIGRATION_SQL = `
-- Add vibe_mode to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'vibe_mode'
  ) THEN
    ALTER TABLE profiles ADD COLUMN vibe_mode TEXT DEFAULT 'anyone';
    COMMENT ON COLUMN profiles.vibe_mode IS 'Who can message: anyone | gift_required (break the ice)';
  END IF;
END $$;
`;
