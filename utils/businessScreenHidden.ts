/**
 * Business screen hidden: admins can hide a profile or post from the Businesses tab only.
 * The original post/profile is unchanged elsewhere in the app.
 */
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export type HiddenIds = {
  profileIds: Set<string>;
  postIds: Set<string>;
};

/**
 * Fetch all profile IDs and post IDs that are hidden from the business screen.
 */
export async function getBusinessScreenHiddenIds(): Promise<HiddenIds> {
  const profileIds = new Set<string>();
  const postIds = new Set<string>();

  try {
    const { data, error } = await supabase
      .from('business_screen_hidden')
      .select('hidden_type, profile_id, post_id');

    if (error) {
      warn('[BusinessScreenHidden] Error fetching hidden ids:', error);
      return { profileIds, postIds };
    }

    (data || []).forEach((row: { hidden_type: string; profile_id?: string; post_id?: string }) => {
      if (row.hidden_type === 'profile' && row.profile_id) {
        profileIds.add(row.profile_id);
      } else if (row.hidden_type === 'post' && row.post_id) {
        postIds.add(row.post_id);
      }
    });
  } catch (e) {
    warn('[BusinessScreenHidden] Exception fetching hidden ids:', e);
  }

  return { profileIds, postIds };
}

/**
 * Admin only: hide a profile from the business screen. Does not affect the profile elsewhere.
 */
export async function adminHideProfileFromBusinessScreen(
  profileId: string,
  adminUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('business_screen_hidden').insert({
      hidden_type: 'profile',
      profile_id: profileId,
      post_id: null,
      hidden_by: adminUserId,
    });

    if (error) {
      if (error.code === '23505') {
        return { success: true }; // already hidden
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Admin only: hide a post from the business screen. Does not affect the post in the main feed.
 */
export async function adminHidePostFromBusinessScreen(
  postId: string,
  adminUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('business_screen_hidden').insert({
      hidden_type: 'post',
      profile_id: null,
      post_id: postId,
      hidden_by: adminUserId,
    });

    if (error) {
      if (error.code === '23505') {
        return { success: true }; // already hidden
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Admin only: unhide a profile from the business screen.
 */
export async function adminUnhideProfileFromBusinessScreen(
  profileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('business_screen_hidden')
      .delete()
      .eq('hidden_type', 'profile')
      .eq('profile_id', profileId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Admin only: unhide a post from the business screen.
 */
export async function adminUnhidePostFromBusinessScreen(
  postId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('business_screen_hidden')
      .delete()
      .eq('hidden_type', 'post')
      .eq('post_id', postId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error: message };
  }
}
