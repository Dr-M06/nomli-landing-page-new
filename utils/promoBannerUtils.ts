import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackAdClick } from './adClickService';
import { OFFICIAL_ACCOUNT_ID } from '../constants/ContactEmails';
import { log, error } from './productionLogger';

/**
 * Sponsored video ad row (stored in public.events with post_type = 'ad').
 */
export interface PromoBanner {
  id: string;
  title: string;
  description: string;
  date: string | null;
  host_id: string;
  created_at: string;
  time?: string | null;
  location?: string | null;
  category?: string;
  max_attendees?: number;
  image_url?: string;
  host_name?: string;
  host_avatar?: string;
  host_is_verified?: boolean;
  host_is_admin?: boolean;
  attendee_count?: number;
  post_type?: 'event' | 'ad';
  external_url?: string | null;
  cta_text?: string | null;
  profiles?: {
    id?: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
    is_admin?: boolean;
  };
}

const ADS_CACHE_KEY = 'mingle_video_ads_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface AdsCache {
  ads: PromoBanner[];
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
export const fetchPromoBanners = async (forceRefresh = false): Promise<PromoBanner[]> => {
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
        const todayInner = new Date().toISOString().split('T')[0];
        const activeAds = cached.filter(ad => {
          if (ad.date && ad.date < todayInner) return false;
          const isFromAdmin = ad.host_is_admin === true;
          const isFromOfficialAccount = ad.host_id === OFFICIAL_ACCOUNT_ID;
          return isFromAdmin || isFromOfficialAccount;
        });
        return activeAds;
      }
      return [];
    }

    const ads: PromoBanner[] = (data || [])
      .filter(ad => {
        const hasImage = ad.image_url && ad.image_url.trim().length > 0;
        if (!hasImage) return false;
        const isFromAdmin = ad.profiles?.is_admin === true;
        const isFromOfficialAccount = ad.host_id === OFFICIAL_ACCOUNT_ID;
        return isFromAdmin || isFromOfficialAccount;
      })
      .map(ad => ({
        ...ad,
        host_is_admin: ad.profiles?.is_admin === true,
      }))
      .slice(0, 10);

    log('[PromoBanners] Fetched', ads.length, 'active ads with images from admin/official account');

    await cacheAds(ads);

    return ads;
  } catch (err) {
    error('[PromoBanners] Error:', err);
    return [];
  }
};

/**
 * Get a random ad from the pool
 */
export const getRandomBanner = (ads: PromoBanner[]): PromoBanner | null => {
  if (!ads || ads.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * ads.length);
  return ads[randomIndex];
};

/**
 * Track when an ad is shown (impression)
 */
export const trackBannerImpression = async (adId: string): Promise<void> => {
  try {
    log('[PromoBanners] Ad impression:', adId);
  } catch (err) {
    log('[PromoBanners] Error tracking impression:', err);
  }
};

/**
 * Track when an ad is clicked
 */
export const trackBannerClick = async (adId: string, userId?: string): Promise<void> => {
  try {
    await trackAdClick(adId, userId);
  } catch (err) {
    log('[PromoBanners] Error tracking click:', err);
  }
};

const getCachedAds = async (ignoreExpiry = false): Promise<PromoBanner[] | null> => {
  try {
    const cached = await AsyncStorage.getItem(ADS_CACHE_KEY);
    if (!cached) return null;

    const parsed: AdsCache = JSON.parse(cached);

    if (!ignoreExpiry && Date.now() - parsed.timestamp > CACHE_DURATION) {
      return null;
    }

    return parsed.ads;
  } catch {
    return null;
  }
};

const cacheAds = async (ads: PromoBanner[]): Promise<void> => {
  try {
    const cache: AdsCache = {
      ads,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(ADS_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    log('[PromoBanners] Error caching ads:', err);
  }
};
