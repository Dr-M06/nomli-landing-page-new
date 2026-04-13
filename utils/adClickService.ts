import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Track a click on an ad
 * @param eventId The ID of the ad/event
 * @param userId Optional user ID if user is logged in
 * @returns Success status
 */
export const trackAdClick = async (
  eventId: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // First verify this is an ad
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, post_type')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      error('[AdClickService] Error fetching event:', eventError);
      return { success: false, error: 'Event not found' };
    }

    // Only track clicks for ads
    if (event.post_type !== 'ad') {
      log('[AdClickService] Not an ad, skipping click tracking');
      return { success: true }; // Don't error, just skip
    }

    // Insert click record
    const { error } = await supabase
      .from('ad_clicks')
      .insert([
        {
          event_id: eventId,
          user_id: userId || null,
          clicked_at: new Date().toISOString(),
        },
      ]);

    if (error) {
      error('[AdClickService] Error tracking ad click:', error);
      return { success: false, error: error.message };
    }

    log('[AdClickService] Successfully tracked ad click');
    return { success: true };
  } catch (error: any) {
    error('[AdClickService] Exception tracking ad click:', error);
    return { success: false, error: error.message || 'Failed to track click' };
  }
};

/**
 * Get click count for an ad
 * @param eventId The ID of the ad/event
 * @returns Click count
 */
export const getAdClickCount = async (eventId: string): Promise<number> => {
  try {
    const { data, error } = await supabase.rpc('get_ad_click_count', {
      p_event_id: eventId,
    });

    if (error) {
      error('[AdClickService] Error getting ad click count:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    error('[AdClickService] Exception getting ad click count:', error);
    return 0;
  }
};

/**
 * Get click statistics for ads owned by a user
 * @param userId The ID of the ad owner
 * @returns Array of ads with click counts
 */
export const getAdClickStats = async (
  userId: string
): Promise<Array<{ event_id: string; title: string; click_count: number }>> => {
  try {
    // Get all ads owned by the user
    const { data: ads, error: adsError } = await supabase
      .from('events')
      .select('id, title')
      .eq('host_id', userId)
      .eq('post_type', 'ad')
      .is('deleted_at', null);

    if (adsError || !ads) {
      error('[AdClickService] Error fetching ads:', adsError);
      return [];
    }

    // Get click counts for each ad
    const stats = await Promise.all(
      ads.map(async (ad) => {
        const clickCount = await getAdClickCount(ad.id);
        return {
          event_id: ad.id,
          title: ad.title,
          click_count: clickCount,
        };
      })
    );

    return stats;
  } catch (error) {
    error('[AdClickService] Exception getting ad click stats:', error);
    return [];
  }
};

