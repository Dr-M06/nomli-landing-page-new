import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Ensure profile visibility database setup is complete
 * This function checks and creates the necessary database structure
 */
export const ensureProfileVisibilitySetup = async (): Promise<boolean> => {
  try {
    log('[ProfileVisibility] Ensuring database setup...');
    
    // Check if the profile_visible column exists
    const { data: columnCheck, error: columnError } = await supabase
      .from('profiles')
      .select('profile_visible')
      .limit(1);
    
    if (columnError && columnError.code === '42703') {
      // Column doesn't exist, try to create it
      log('[ProfileVisibility] Column missing, attempting to create...');
      
      const { error: alterError } = await supabase.rpc('exec_sql', {
        sql: `
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN DEFAULT true;
          CREATE INDEX IF NOT EXISTS idx_profiles_visible ON profiles(profile_visible) WHERE profile_visible = true;
        `
      });
      
      if (alterError) {
        error('[ProfileVisibility] Failed to create column:', alterError);
        return false;
      }
      
      log('[ProfileVisibility] Column created successfully');
    } else if (columnError) {
      error('[ProfileVisibility] Error checking column:', columnError);
      return false;
    } else {
      log('[ProfileVisibility] Column exists ✓');
    }
    
    // Test the custom function
    try {
      const { error: functionError } = await supabase.rpc('get_profile_visibility');
      if (functionError) {
        log('[ProfileVisibility] Custom function not available, will use direct queries');
      } else {
        log('[ProfileVisibility] Custom function available ✓');
      }
    } catch (funcError) {
      log('[ProfileVisibility] Custom function test failed:', funcError);
    }
    
    return true;
  } catch (error) {
    error('[ProfileVisibility] Setup failed:', error);
    return false;
  }
};

/**
 * Simple function to set profile visibility using direct table update
 */
export const setProfileVisibilityDirect = async (visible: boolean): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ profile_visible: visible })
      .eq('id', (await supabase.auth.getUser()).data.user?.id);
    
    if (error) {
      error('[ProfileVisibility] Direct update failed:', error);
      return false;
    }
    
    log('[ProfileVisibility] Direct update successful');
    return true;
  } catch (error) {
    error('[ProfileVisibility] Direct update error:', error);
    return false;
  }
};

/**
 * Simple function to get profile visibility using direct table query
 */
export const getProfileVisibilityDirect = async (): Promise<boolean> => {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return true;

    // Source of truth for Dating tab visibility:
    // visible only when profile is visible and not explicitly hidden from discover.
    const { data, error } = await supabase
      .from('profiles')
      .select('profile_visible, hide_from_discover')
      .eq('id', userId)
      .single();

    if (!error && data) {
      const profileVisible = data?.profile_visible !== false;
      const hiddenFromDiscover = data?.hide_from_discover === true;
      return profileVisible && !hiddenFromDiscover;
    }

    // Backward-compatible fallback if hide_from_discover is unavailable in some environments.
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('profiles')
      .select('profile_visible')
      .eq('id', userId)
      .single();

    if (fallbackError) {
      error('[ProfileVisibility] Direct query failed:', fallbackError);
      return true; // Default to visible
    }

    return fallbackData?.profile_visible ?? true;
  } catch (e) {
    error('[ProfileVisibility] Direct query error:', e);
    return true; // Default to visible
  }
};
