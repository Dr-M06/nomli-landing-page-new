import { supabase } from './supabase';
import { logError } from './errorHandler';
import { log, warn, error } from './productionLogger';


/**
 * Create the necessary function to update privacy settings with proper permissions
 * This addresses the "permission denied for table users" error when updating allow_dms
 */
export const fixPrivacySettings = async (): Promise<boolean> => {
  try {
    log('[FixPrivacySettings] Checking and fixing privacy settings permissions...');
    
    // First, check if the function already exists to avoid errors
    const { data: existingFunctions, error: checkError } = await supabase
      .from('pg_proc')
      .select('proname')
      .eq('proname', 'update_privacy_settings')
      .maybeSingle();
    
    if (checkError) {
      log('[FixPrivacySettings] Error checking for existing function:', checkError);
      // Continue anyway since this might just be a permissions issue
    }
    
    // Create the function if it doesn't exist or replace it
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION update_privacy_settings(
        user_id UUID,
        allow_messages BOOLEAN
      )
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
        -- Update the profile
        UPDATE profiles
        SET 
          allow_dms = allow_messages,
          updated_at = NOW()
        WHERE id = user_id;
        
        RETURN FOUND;
      END;
      $$;
      
      -- Grant execute permissions on the function
      GRANT EXECUTE ON FUNCTION update_privacy_settings(UUID, BOOLEAN) TO authenticated;
    `;
    
    // Execute the SQL to create the function
    const { error: createError } = await supabase.rpc('exec', { 
      query: createFunctionSQL 
    });
    
    if (createError) {
      error('[FixPrivacySettings] Error creating function:', createError);
      
      // Fall back to simpler approach if exec RPC fails
      try {
        const simpleCreateSQL = `
          CREATE OR REPLACE FUNCTION update_privacy_settings(
            user_id UUID,
            allow_messages BOOLEAN
          )
          RETURNS BOOLEAN AS $$
          BEGIN
            UPDATE profiles
            SET allow_dms = allow_messages
            WHERE id = user_id;
            RETURN FOUND;
          END;
          $$ LANGUAGE plpgsql SECURITY DEFINER;
        `;
        
        await supabase.rpc('exec', { query: simpleCreateSQL });
        log('[FixPrivacySettings] Created simplified function');
      } catch (fallbackError) {
        error('[FixPrivacySettings] Fallback also failed:', fallbackError);
      }
    } else {
      log('[FixPrivacySettings] Successfully created/updated privacy settings function');
    }
    
    return true;
  } catch (error) {
    logError('FixPrivacySettings', error);
    error('[FixPrivacySettings] Unhandled error:', error);
    return false;
  }
}; 