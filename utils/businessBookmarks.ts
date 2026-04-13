import { supabase } from './supabase';

/**
 * Bookmark a business
 */
export const bookmarkBusiness = async (
  userId: string,
  businessId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('business_bookmarks')
      .insert({
        user_id: userId,
        business_id: businessId,
      });

    if (error) {
      // If already bookmarked, that's okay
      if (error.code === '23505') {
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to bookmark business' };
  }
};

/**
 * Unbookmark a business
 */
export const unbookmarkBusiness = async (
  userId: string,
  businessId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('business_bookmarks')
      .delete()
      .eq('user_id', userId)
      .eq('business_id', businessId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to unbookmark business' };
  }
};

/**
 * Check if a business is bookmarked
 */
export const isBusinessBookmarked = async (
  userId: string,
  businessId: string
): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('business_bookmarks')
      .select('id')
      .eq('user_id', userId)
      .eq('business_id', businessId)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get all bookmarked businesses for a user
 */
export const getBookmarkedBusinesses = async (
  userId: string
): Promise<{ success: boolean; error?: string; businessIds?: string[] }> => {
  try {
    const { data, error } = await supabase
      .from('business_bookmarks')
      .select('business_id')
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    const businessIds = (data || []).map((item) => item.business_id);
    return { success: true, businessIds };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch bookmarked businesses' };
  }
};
