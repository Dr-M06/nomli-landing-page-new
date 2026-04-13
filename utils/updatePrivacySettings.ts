import { supabase } from './supabase';
import { logError } from './errorHandler';
import { log, warn, error } from './productionLogger';


/**
 * Updates the profiles table schema to add allow_dms column
 * Note: This can only work with proper database access rights
 * We'll focus on client-side handling instead
 */
export const updatePrivacySettings = async (): Promise<boolean> => {
  try {
    log('[Schema] Checking if allow_dms column exists in profiles table');
    
    // Check if the column exists by trying to select it
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('allow_dms')
        .limit(1);
      
      if (!error) {
        log('[Schema] allow_dms column exists, continuing...');
        return true;
      } else {
        log('[Schema] Error checking allow_dms column:', error);
        // The column likely doesn't exist, but we can't create it from the client
        // Just continue and handle the case where it doesn't exist
      }
    } catch (error) {
      error('[Schema] Exception checking allow_dms column:', error);
    }
    
    log('[Schema] Privacy settings initialization complete');
    return true;
  } catch (error) {
    logError('UpdatePrivacySettings', error);
    error('[Schema] Error in updatePrivacySettings:', error);
    return false;
  }
}; 