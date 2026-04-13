import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { log, warn, error } from './productionLogger';


/**
 * Delete user account permanently
 * This will:
 * - Delete user profile
 * - Delete all user messages
 * - Delete user media
 * - Delete user from auth (via Edge Function with admin privileges)
 * - Clear local storage
 */
export const deleteUserAccount = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    log('[AccountDeletion] Starting account deletion process...');
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      error('[AccountDeletion] Auth error:', authError);
      return { success: false, error: 'You must be logged in to delete your account.' };
    }

    const userId = user.id;
    log('[AccountDeletion] Deleting account for user:', userId);

    // Call Edge Function to delete account (has admin privileges)
    // The Edge Function will handle:
    // 1. Deleting all user data (profile, messages, posts, events, etc.)
    // 2. Deleting the auth user from auth.users table
    const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke(
      'delete-user-account',
      {
        body: { userId },
      }
    );

    if (edgeFunctionError) {
      error('[AccountDeletion] Edge Function error:', edgeFunctionError);
      
      // Fallback: Try RPC function if Edge Function doesn't exist
      log('[AccountDeletion] Trying RPC function as fallback...');
      const { error: rpcError } = await supabase.rpc('delete_user_account');
      
      if (rpcError) {
        error('[AccountDeletion] RPC function also failed:', rpcError);
        return { 
          success: false, 
          error: 'Failed to delete account. Please contact support if this issue persists.' 
        };
      }
    }

    // Check if Edge Function returned an error
    if (edgeFunctionData && edgeFunctionData.error) {
      error('[AccountDeletion] Edge Function returned error:', edgeFunctionData.error);
      return { 
        success: false, 
        error: edgeFunctionData.error || 'Failed to delete account' 
      };
    }

    // Sign out user
    // Local-only sign out after deletion flow cleanup.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    
    if (signOutError) {
      warn('[AccountDeletion] Error signing out:', signOutError);
    }

    // Clear local storage
    try {
      await AsyncStorage.clear();
      await SecureStore.deleteItemAsync('authEmail');
      await SecureStore.deleteItemAsync('authPassword');
    } catch (storageError) {
      warn('[AccountDeletion] Error clearing storage:', storageError);
    }

    log('[AccountDeletion] Account deletion completed successfully');
    
    return { success: true };
  } catch (error) {
    error('[AccountDeletion] Error deleting account:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to delete account' 
    };
  }
};

