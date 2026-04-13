import AsyncStorage from '@react-native-async-storage/async-storage';
import { logError } from './errorHandler';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


// Local storage key for caching DM preferences
const DM_PREFERENCES_KEY = 'mingle2_dm_preferences';

/**
 * Get the user's DM preferences from database with local cache fallback
 * @param userId User ID to check
 * @returns Boolean indicating if user allows DMs, true by default
 */
export const getUserDmPreference = async (userId: string): Promise<boolean> => {
  try {
    if (!userId) {
      return true; // Default to true if no user ID provided
    }
    
    // Placeholder users always have DMs disabled
    if (userId.startsWith('placeholder-user-')) {
      log(`[Privacy] Placeholder user ${userId} - DMs disabled`);
      return false;
    }
    
    // First try to get from database
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('allow_dms')
        .eq('id', userId)
        .single();
      
      if (profileError) {
        // PGRST116 means no rows found - user doesn't exist, default to allowing DMs silently
        if (profileError.code !== 'PGRST116') {
          log(`[Privacy] Error fetching DM preference from database for ${userId}:`, profileError);
        }
        // Fall back to local storage if database fails
        const localPreference = await getDmPreferenceFromLocalStorage(userId);
        if (localPreference !== null) {
          log(`[Privacy] Using cached DM preference for ${userId}: ${localPreference}`);
          return localPreference;
        }
      } else {
        // Database query succeeded
        const allowDms = profileData.allow_dms !== false; // Default to true if null/undefined
        log(`[Privacy] Database DM preference for ${userId}: ${allowDms} (raw: ${profileData.allow_dms})`);
        
        // Cache the result locally for faster future access
        await storeDmPreferenceLocally(userId, allowDms);
        
        return allowDms;
      }
    } catch (dbError) {
      log(`[Privacy] Database error for ${userId}:`, dbError);
      // Fall back to local storage
      const localPreference = await getDmPreferenceFromLocalStorage(userId);
      if (localPreference !== null) {
        log(`[Privacy] Using cached DM preference for ${userId}: ${localPreference}`);
        return localPreference;
      }
    }
    
    // Default to true if nothing found
    log(`[Privacy] No preference found for ${userId}, defaulting to allow DMs`);
    return true;
  } catch (error) {
    logError('PrivacySettings:GetDmPreference', error);
    return true; // Default to true if error
  }
};

/**
 * Update a user's DM preferences in database and local storage
 * @param userId User ID to update
 * @param allowDms Boolean value to set
 * @returns Boolean indicating success
 */
export const updateDmPreference = async (userId: string, allowDms: boolean): Promise<boolean> => {
  if (!userId) {
    log('No user ID provided to updateDmPreference');
    return false;
  }
  
  log(`[Privacy] Setting DM preference for user ${userId} to ${allowDms}`);
  
  try {
    // First try to update in database
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        allow_dms: allowDms,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
    
    if (updateError) {
      log(`[Privacy] Error updating DM preference in database:`, updateError);
      
      // Try using the update function if direct update fails
      try {
        const { data: functionResult, error: functionError } = await supabase
          .rpc('update_privacy_settings', { 
            user_id: userId, 
            allow_messages: allowDms 
          });
        
        if (functionError) {
          log(`[Privacy] Error using update function:`, functionError);
          // Fall back to local storage only
          await storeDmPreferenceLocally(userId, allowDms);
          log(`[Privacy] Stored DM preference locally only for ${userId}: ${allowDms}`);
          return true;
        } else {
          log(`[Privacy] Successfully updated DM preference via function for ${userId}: ${allowDms}`);
        }
      } catch (functionError) {
        log(`[Privacy] Function call failed:`, functionError);
        // Fall back to local storage only
        await storeDmPreferenceLocally(userId, allowDms);
        log(`[Privacy] Stored DM preference locally only for ${userId}: ${allowDms}`);
        return true;
      }
    } else {
      log(`[Privacy] Successfully updated DM preference in database for ${userId}: ${allowDms}`);
    }
    
    // Also store in local storage for faster access
    await storeDmPreferenceLocally(userId, allowDms);
    log(`[Privacy] Successfully stored DM preference for ${userId}: ${allowDms}`);
    return true;
  } catch (error) {
    log('[Privacy] Error storing DM preference:', error);
    
    // Try to at least save locally
    try {
      await storeDmPreferenceLocally(userId, allowDms);
      log(`[Privacy] Stored DM preference locally as fallback for ${userId}: ${allowDms}`);
      return true;
    } catch (localError) {
      log('[Privacy] Failed to store even locally:', localError);
      return false;
    }
  }
};

/**
 * Store DM preference in local storage
 */
const storeDmPreferenceLocally = async (userId: string, allowDms: boolean): Promise<void> => {
  if (!userId) {
    log('No user ID provided to storeDmPreferenceLocally');
    return;
  }
  
  try {
    // Get existing preferences
    let preferences = {};
    try {
      const preferencesJson = await AsyncStorage.getItem(DM_PREFERENCES_KEY);
      if (preferencesJson) {
        preferences = JSON.parse(preferencesJson);
      }
    } catch (parseError) {
      log('Error parsing stored preferences, creating new storage:', parseError);
      // Continue with empty preferences
    }
    
    // Update preference for this user
    preferences[userId] = allowDms;
    
    // Save back to storage
    await AsyncStorage.setItem(DM_PREFERENCES_KEY, JSON.stringify(preferences));
    log(`Stored DM preference locally for user ${userId}: ${allowDms}`);
  } catch (error) {
    log('Error storing DM preference locally:', error);
    throw error; // Rethrow for caller to handle
  }
};

/**
 * Get DM preference from local storage
 * @returns boolean preference or null if not found
 */
const getDmPreferenceFromLocalStorage = async (userId: string): Promise<boolean | null> => {
  if (!userId) {
    log('No user ID provided to getDmPreferenceFromLocalStorage');
    return null;
  }
  
  try {
    const preferencesJson = await AsyncStorage.getItem(DM_PREFERENCES_KEY);
    if (!preferencesJson) return null;
    
    try {
      const preferences = JSON.parse(preferencesJson);
      if (preferences[userId] === undefined) return null;
      
      log(`Retrieved DM preference from storage for user ${userId}: ${preferences[userId]}`);
      return preferences[userId];
    } catch (parseError) {
      log('Error parsing stored preferences:', parseError);
      return null;
    }
  } catch (error) {
    log('Error getting DM preference from storage:', error);
    return null;
  }
};

/**
 * Clear the cached DM preference for a specific user
 * This is useful when troubleshooting DM permission issues
 * @param userId User ID to clear preferences for
 */
export const clearCachedDmPreference = async (userId: string): Promise<boolean> => {
  if (!userId) {
    log('No user ID provided to clearCachedDmPreference');
    return false;
  }
  
  try {
    // Get existing preferences
    const preferencesJson = await AsyncStorage.getItem(DM_PREFERENCES_KEY);
    if (!preferencesJson) return true; // Nothing to clear
    
    try {
      const preferences = JSON.parse(preferencesJson);
      
      // Remove this user's preference
      if (preferences[userId] !== undefined) {
        delete preferences[userId];
        // Save back to storage
        await AsyncStorage.setItem(DM_PREFERENCES_KEY, JSON.stringify(preferences));
        log(`Cleared cached DM preference for user ${userId}`);
      }
      
      return true;
    } catch (parseError) {
      log('Error parsing stored preferences:', parseError);
      return false;
    }
  } catch (error) {
    log('Error clearing DM preference from storage:', error);
    return false;
  }
};

/**
 * Ensure the database schema is set up for privacy settings
 * This creates the allow_dms column if it doesn't exist
 */
export const ensurePrivacySchema = async (): Promise<boolean> => {
  try {
    log('[Privacy] Ensuring database schema is set up...');
    
    // Try to create the allow_dms column if it doesn't exist
    const createColumnSQL = `
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_name = 'profiles' AND column_name = 'allow_dms'
          ) THEN
              ALTER TABLE profiles ADD COLUMN allow_dms BOOLEAN DEFAULT true;
              CREATE INDEX IF NOT EXISTS idx_profiles_allow_dms ON profiles(allow_dms);
          END IF;
      END $$;
    `;
    
    // Try to execute via RPC first
    try {
      const { error: rpcError } = await supabase.rpc('exec', { query: createColumnSQL });
      if (rpcError) {
        log('[Privacy] RPC exec not available, trying direct query...');
        // RPC might not be available, that's okay
      } else {
        log('[Privacy] Successfully set up database schema via RPC');
        return true;
      }
    } catch (rpcError) {
      log('[Privacy] RPC approach failed:', rpcError);
    }
    
    // Try a simple query to check if the column exists
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('allow_dms')
        .limit(1);
      
      if (error) {
        if (error.message?.includes('column "allow_dms" does not exist')) {
          log('[Privacy] ❌ allow_dms column does not exist - manual database setup required');
          log('[Privacy] 📋 Please run the SQL script: supabase/setup_privacy_settings.sql');
          log('[Privacy] 🔗 Or copy this SQL to your Supabase dashboard:');
          log('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_dms BOOLEAN DEFAULT true;');
          log('CREATE INDEX IF NOT EXISTS idx_profiles_allow_dms ON profiles(allow_dms);');
          return false;
        } else {
          log('[Privacy] Unexpected error checking schema:', error);
          return false;
        }
      } else {
        log('[Privacy] ✅ Database schema is already set up correctly');
        return true;
      }
    } catch (checkError) {
      log('[Privacy] Error checking database schema:', checkError);
      return false;
    }
  } catch (error) {
    log('[Privacy] Error ensuring database schema:', error);
    return false;
  }
}; 