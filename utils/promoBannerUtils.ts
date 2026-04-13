import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackAdClick } from './adClickService';
import { Event } from './eventUtils';
import { OFFICIAL_ACCOUNT_ID } from '../constants/ContactEmails';
import { log, warn, error } from './productionLogger';


const ADS_CACHE_KEY = 'mingle_video_ads_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Re-export the Event type for use in components
export type PromoBanner = Event;

interface AdsCache {
  ads: Event[];
  timestamp: number;
}

/**
 * Fetch active ads from the events table
 * Uses local cache to reduce database calls
 * 
 * Ad expiration: The `date` field is used as the end date for ads
 * - If date is null: ad shows indefinitely
 * - If date is set: ad stops showing after that date
 */
export const fetchPromoBanners = async (forceRefresh = false): Promise<Event[]> => {
  try {
    // Check cache first
    if (!forceRefresh) {
      const cached = await getCachedAds();
      if (cached) {
        // Filter out expired ads and non-admin/official ads from cache
        const today = new Date().toISOString().split('T')[0];
        const activeAds = cached.filter(ad => {
          // Filter expired ads
          if (ad.date && ad.date < today) return false;
          
          // Only show ads from admin users or official account
          const isFromAdmin = ad.host_is_admin === true;
          const isFromOfficialAccount = ad.host_id === OFFICIAL_ACCOUNT_ID;
          
          return isFromAdmin || isFromOfficialAccount;
        });
        log('[PromoBanners] Using cached ads:', activeAds.length, '(filtered from', cached.length, ')');
        return activeAds;
      }
    }

    log('[PromoBanners] Fetching ads from events table...');
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Fetch ads from events table
    // Filter: post_type = 'ad' AND not deleted AND (no end date OR end date >= today)
    // AND (host is admin OR host is official account)
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        profiles:host_id (
          id,
          username,
          full_name,
          avatar_url,
          is_admin
        )
      `)
      .eq('post_type', 'ad')
      .is('deleted_at', null)
      .or(`date.is.null,date.gte.${today}`) // Show if no end date OR end date is today or future
      .order('created_at', { ascending: false })
      .limit(50); // Fetch more to filter by admin/official

    if (error) {
      error('[PromoBanners] Error fetching ads:', error);
      // Return cached on error (with expiry and admin/official filter)
      const cached = await getCachedAds(true);
      if (cached) {
        const today = new Date().toISOString().split('T')[0];
        const activeAds = cached.filter(ad => {
          // Filter expired ads
          if (ad.date && ad.date < today) return false;
          
          // Only show ads from admin users or official account
          const isFromAdmin = ad.host_is_admin === true;
          const isFromOfficialAccount = ad.host_id === OFFICIAL_ACCOUNT_ID;
          
          return isFromAdmin || isFromOfficialAccount;
        });
        return activeAds;
      }
      return [];
    }

    // Filter to only ads with images AND from admin/official account
    // Transform to Event format with host_is_admin included
    const ads = (data || [])
      .filter(ad => {
        const hasImage = ad.image_url && ad.image_url.trim().length > 0;
        if (!hasImage) return false;
        
        // Only show ads from admin users or official account
        const isFromAdmin = ad.profiles?.is_admin === true;
        const isFromOfficialAccount = ad.host_id === OFFICIAL_ACCOUNT_ID;
        
        return isFromAdmin || isFromOfficialAccount;
      })
      .map(ad => ({
        ...ad,
        host_is_admin: ad.profiles?.is_admin === true,
      }))
      .slice(0, 10); // Limit to 10 after filtering
    
    log('[PromoBanners] Fetched', ads.length, 'active ads with images from admin/official account');
    
    // Cache the results
    await cacheAds(ads);
    
    return ads;
  } catch (error) {
    error('[PromoBanners] Error:', error);
    return [];
  }
};

/**
 * Get a random ad from the pool
 */
export const getRandomBanner = (ads: Event[]): Event | null => {
  if (!ads || ads.length === 0) return null;
  
  // Simple random selection
  const randomIndex = Math.floor(Math.random() * ads.length);
  return ads[randomIndex];
};

/**
 * Track when an ad is shown (impression)
 * Note: Currently just logs - can extend to track in database
 */
export const trackBannerImpression = async (adId: string): Promise<void> => {
  try {
    log('[PromoBanners] Ad impression:', adId);
    // Could add impression tracking to database here if needed
  } catch (error) {
    log('[PromoBanners] Error tracking impression:', error);
  }
};

/**
 * Track when an ad is clicked
 * Uses existing adClickService
 */
export const trackBannerClick = async (adId: string, userId?: string): Promise<void> => {
  try {
    await trackAdClick(adId, userId);
  } catch (error) {
    log('[PromoBanners] Error tracking click:', error);
  }
};

/**
 * Get cached ads from local storage
 */
const getCachedAds = async (ignoreExpiry = false): Promise<Event[] | null> => {
  try {
    const cached = await AsyncStorage.getItem(ADS_CACHE_KEY);
    if (!cached) return null;
    
    const parsed: AdsCache = JSON.parse(cached);
    
    // Check if cache is still valid
    if (!ignoreExpiry && Date.now() - parsed.timestamp > CACHE_DURATION) {
      return null;
    }
    
    return parsed.ads;
  } catch (error) {
    return null;
  }
};

/**
 * Cache ads to local storage
 */
const cacheAds = async (ads: Event[]): Promise<void> => {
  try {
    const cache: AdsCache = {
      ads,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(ADS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    log('[PromoBanners] Error caching ads:', error);
  }
};
