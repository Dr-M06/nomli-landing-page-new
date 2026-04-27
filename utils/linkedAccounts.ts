import { supabase } from './supabase';
import { signInWithGoogle } from './oauthAuth';
import { log, warn, error } from './productionLogger';


/**
 * Check which OAuth providers are linked to the current user's account
 */
export const checkLinkedProviders = async (): Promise<{
  google: boolean;
  apple: boolean;
  facebook: boolean;
}> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return { google: false, apple: false, facebook: false };
    }

    // Check user identities for linked providers
    const identities = user.identities || [];
    
    return {
      google: identities.some(id => id.provider === 'google'),
      apple: identities.some(id => id.provider === 'apple'),
      facebook: identities.some(id => id.provider === 'facebook'),
    };
  } catch (error) {
    error('Error checking linked providers:', error);
    return { google: false, apple: false, facebook: false };
  }
};

/**
 * Link Google account to existing user
 * Uses Supabase's linkIdentity feature
 */
export const linkGoogleAccount = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    // Use the same OAuth flow - Supabase will link if user is already signed in
    const result = await signInWithGoogle();
    
    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Verify linking was successful
    const providers = await checkLinkedProviders();
    
    if (providers.google) {
      return { success: true };
    }

    return { success: false, error: 'Failed to link Google account' };
  } catch (error: any) {
    error('Error linking Google account:', error);
    return { success: false, error: error.message || 'Failed to link Google account' };
  }
};

/**
 * Unlink Google account from user
 * Note: User must have at least one other auth method (email/password or another provider)
 */
export const unlinkGoogleAccount = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Find the Google identity
    const googleIdentity = user.identities?.find(id => id.provider === 'google');
    
    if (!googleIdentity) {
      return { success: false, error: 'Google account is not linked' };
    }

    // Check if user has other auth methods before unlinking
    const hasPassword = user.email && !user.identities?.every(id => id.provider !== 'email');
    const otherProviders = user.identities?.filter(id => id.provider !== 'google') || [];
    
    if (!hasPassword && otherProviders.length === 0) {
      return { 
        success: false, 
        error: 'Cannot unlink Google - you need at least one other sign-in method (email/password or another provider)' 
      };
    }

    // Unlink the identity using Supabase Admin API
    // Note: This requires the user to have admin privileges or use an edge function
    // For now, we'll use a simpler approach
    const { error } = await supabase.auth.unlinkIdentity(googleIdentity);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    error('Error unlinking Google account:', error);
    return { success: false, error: error.message || 'Failed to unlink Google account' };
  }
};
