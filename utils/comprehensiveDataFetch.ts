import { supabase } from './supabase';
import { getBlockedUserIds } from './blockUser';
import { log, warn, error } from './productionLogger';


/**
 * Supabase default limit is 1000 rows per query
 * We need to paginate to fetch all data
 */
const SUPABASE_MAX_ROWS_PER_QUERY = 1000;
const BATCH_SIZE = 1000; // Fetch 1000 rows at a time

/**
 * Fetch ALL posts from the database using pagination
 * Handles Supabase's 1000 row limit by fetching in batches
 * 
 * @param currentUserId - Current user ID for filtering blocked users
 * @param useCache - Whether to use cache (default: true)
 * @returns Array of all posts
 */
export const fetchAllPostsComprehensive = async (
  currentUserId?: string,
  useCache: boolean = true
): Promise<any[]> => {
  try {
    log('[ComprehensiveFetch] Starting comprehensive posts fetch...');
    
    // Get blocked user IDs for filtering
    let blockedUserIds: string[] = [];
    if (currentUserId) {
      try {
        blockedUserIds = await getBlockedUserIds(currentUserId);
        log(`[ComprehensiveFetch] Found ${blockedUserIds.length} blocked users to filter`);
      } catch (error) {
        error('[ComprehensiveFetch] Error getting blocked user IDs:', error);
      }
    }
    
    const blockedSet = new Set(blockedUserIds);
    const allPosts: any[] = [];
    let offset = 0;
    let hasMore = true;
    let batchNumber = 1;
    
    // Fetch posts in batches until we get less than BATCH_SIZE (indicating we've fetched all)
    while (hasMore) {
      log(`[ComprehensiveFetch] Fetching posts batch ${batchNumber} (offset: ${offset}, limit: ${BATCH_SIZE})`);
      
      try {
        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + BATCH_SIZE - 1);
        
        if (error) {
          error(`[ComprehensiveFetch] Error fetching batch ${batchNumber}:`, error);
          // If error, try to continue with next batch or break
          break;
        }
        
        if (!data || data.length === 0) {
          log(`[ComprehensiveFetch] No more posts found at batch ${batchNumber}`);
          hasMore = false;
          break;
        }
        
        // Filter out blocked users' posts
        const filteredPosts = data.filter(post => {
          // Always show user's own posts
          if (currentUserId && post.user_id === currentUserId) {
            return true;
          }
          // Filter out posts from blocked users
          return !blockedSet.has(post.user_id);
        });
        
        allPosts.push(...filteredPosts);
        log(`[ComprehensiveFetch] Batch ${batchNumber}: Fetched ${data.length} posts, ${filteredPosts.length} after filtering (total: ${allPosts.length})`);
        
        // If we got less than BATCH_SIZE, we've reached the end
        if (data.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
          batchNumber++;
          
          // Add a small delay between batches to avoid overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (batchError) {
        error(`[ComprehensiveFetch] Exception in batch ${batchNumber}:`, batchError);
        // Continue to next batch or break if critical error
        hasMore = false;
        break;
      }
    }
    
    log(`[ComprehensiveFetch] ✅ Comprehensive fetch complete: ${allPosts.length} total posts`);
    return allPosts;
  } catch (error) {
    error('[ComprehensiveFetch] Error in fetchAllPostsComprehensive:', error);
    return [];
  }
};

/**
 * Fetch ALL visible profiles from the database using pagination
 * Respects both profile_visible and hide_from_discover settings
 * 
 * @param currentUserId - Current user ID to exclude from results
 * @param useCache - Whether to use cache (default: true)
 * @returns Array of all visible profiles
 */
export const fetchAllVisibleProfilesComprehensive = async (
  currentUserId?: string,
  useCache: boolean = true
): Promise<any[]> => {
  try {
    log('[ComprehensiveFetch] Starting comprehensive profiles fetch...');
    
    // Get blocked user IDs for filtering
    let blockedUserIds: string[] = [];
    if (currentUserId) {
      try {
        blockedUserIds = await getBlockedUserIds(currentUserId);
        log(`[ComprehensiveFetch] Found ${blockedUserIds.length} blocked users to filter`);
      } catch (error) {
        error('[ComprehensiveFetch] Error getting blocked user IDs:', error);
      }
    }
    
    const blockedSet = new Set(blockedUserIds);
    const allProfiles: any[] = [];
    let offset = 0;
    let hasMore = true;
    let batchNumber = 1;
    
    // Fetch profiles in batches until we get less than BATCH_SIZE
    while (hasMore) {
      log(`[ComprehensiveFetch] Fetching profiles batch ${batchNumber} (offset: ${offset}, limit: ${BATCH_SIZE})`);
      
      try {
        // Build query with visibility filters
        let query = supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, bio, country, interests, profile_visible, hide_from_discover, estimated_latitude, estimated_longitude, latitude, longitude, is_placeholder, created_at, last_active, updated_at')
          .eq('profile_visible', true) // Only visible profiles
          .eq('hide_from_discover', false) // Not hidden from discover
          .or('is_suspended.is.null,is_suspended.eq.false') // Exclude suspended users
          .order('created_at', { ascending: false })
          .range(offset, offset + BATCH_SIZE - 1);
        
        // Exclude current user if provided
        if (currentUserId) {
          query = query.not('id', 'eq', currentUserId);
        }
        
        const { data, error } = await query;
        
        // If profile_visible or hide_from_discover columns don't exist, use fallback query
        if (error && (error.code === '42703' || error.message?.includes('column'))) {
          log('[ComprehensiveFetch] Some columns not found, using fallback query');
          
          // Fallback: try without hide_from_discover first
          let fallbackQuery = supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, bio, country, interests, profile_visible, estimated_latitude, estimated_longitude, latitude, longitude, is_placeholder, created_at, last_active, updated_at')
            .eq('profile_visible', true)
            .or('is_suspended.is.null,is_suspended.eq.false') // Exclude suspended users
            .order('created_at', { ascending: false })
            .range(offset, offset + BATCH_SIZE - 1);
          
          if (currentUserId) {
            fallbackQuery = fallbackQuery.not('id', 'eq', currentUserId);
          }
          
          const fallbackResult = await fallbackQuery;
          
          if (fallbackResult.error) {
            // If profile_visible also doesn't exist, fetch all profiles and filter client-side
            log('[ComprehensiveFetch] profile_visible column not found, fetching all profiles');
            
            let allProfilesQuery = supabase
              .from('profiles')
              .select('id, username, full_name, avatar_url, bio, country, interests, estimated_latitude, estimated_longitude, latitude, longitude, is_placeholder, created_at, last_active, updated_at')
              .or('is_suspended.is.null,is_suspended.eq.false') // Exclude suspended users
              .order('created_at', { ascending: false })
              .range(offset, offset + BATCH_SIZE - 1);
            
            if (currentUserId) {
              allProfilesQuery = allProfilesQuery.not('id', 'eq', currentUserId);
            }
            
            const allProfilesResult = await allProfilesQuery;
            
            if (allProfilesResult.error) {
              error(`[ComprehensiveFetch] Error fetching batch ${batchNumber}:`, allProfilesResult.error);
              break;
            }
            
            // Filter client-side: exclude profiles with hide_from_discover = true if column exists
            const filteredData = (allProfilesResult.data || []).filter((profile: any) => {
              // Exclude suspended users
              if (profile.is_suspended === true) {
                return false;
              }
              // If hide_from_discover exists and is true, exclude
              if (profile.hide_from_discover === true) {
                return false;
              }
              // If profile_visible exists and is false, exclude
              if (profile.profile_visible === false) {
                return false;
              }
              return true;
            });
            
            // Filter out blocked users
            const finalFiltered = filteredData.filter((profile: any) => !blockedSet.has(profile.id));
            allProfiles.push(...finalFiltered);
            
            if (filteredData.length < BATCH_SIZE) {
              hasMore = false;
            } else {
              offset += BATCH_SIZE;
              batchNumber++;
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            continue;
          } else {
            // Use fallback result (only profile_visible filter)
            const filteredData = (fallbackResult.data || []).filter((profile: any) => !blockedSet.has(profile.id));
            allProfiles.push(...filteredData);
            
            if (fallbackResult.data && fallbackResult.data.length < BATCH_SIZE) {
              hasMore = false;
            } else {
              offset += BATCH_SIZE;
              batchNumber++;
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            continue;
          }
        }
        
        if (error) {
          error(`[ComprehensiveFetch] Error fetching batch ${batchNumber}:`, error);
          break;
        }
        
        if (!data || data.length === 0) {
          log(`[ComprehensiveFetch] No more profiles found at batch ${batchNumber}`);
          hasMore = false;
          break;
        }
        
        // Filter out blocked users
        const filteredProfiles = data.filter((profile: any) => !blockedSet.has(profile.id));
        
        allProfiles.push(...filteredProfiles);
        log(`[ComprehensiveFetch] Batch ${batchNumber}: Fetched ${data.length} profiles, ${filteredProfiles.length} after filtering (total: ${allProfiles.length})`);
        
        // If we got less than BATCH_SIZE, we've reached the end
        if (data.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
          batchNumber++;
          
          // Add a small delay between batches to avoid overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (batchError) {
        error(`[ComprehensiveFetch] Exception in batch ${batchNumber}:`, batchError);
        hasMore = false;
        break;
      }
    }
    
    log(`[ComprehensiveFetch] ✅ Comprehensive fetch complete: ${allProfiles.length} total visible profiles`);
    return allProfiles;
  } catch (error) {
    error('[ComprehensiveFetch] Error in fetchAllVisibleProfilesComprehensive:', error);
    return [];
  }
};

/**
 * Get total count of posts (for verification)
 */
export const getTotalPostsCount = async (): Promise<number> => {
  try {
    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      error('[ComprehensiveFetch] Error getting posts count:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    error('[ComprehensiveFetch] Error in getTotalPostsCount:', error);
    return 0;
  }
};

/**
 * Get total count of visible profiles (for verification)
 */
export const getTotalVisibleProfilesCount = async (currentUserId?: string): Promise<number> => {
  try {
    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('profile_visible', true)
      .eq('hide_from_discover', false);
    
    if (currentUserId) {
      query = query.not('id', 'eq', currentUserId);
    }
    
    const { count, error } = await query;
    
    // If columns don't exist, try fallback
    if (error && (error.code === '42703' || error.message?.includes('column'))) {
      let fallbackQuery = supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('profile_visible', true);
      
      if (currentUserId) {
        fallbackQuery = fallbackQuery.not('id', 'eq', currentUserId);
      }
      
      const fallbackResult = await fallbackQuery;
      
      if (fallbackResult.error) {
        // If profile_visible doesn't exist, count all profiles
        let allQuery = supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });
        
        if (currentUserId) {
          allQuery = allQuery.not('id', 'eq', currentUserId);
        }
        
        const allResult = await allQuery;
        return allResult.count || 0;
      }
      
      return fallbackResult.count || 0;
    }
    
    if (error) {
      error('[ComprehensiveFetch] Error getting profiles count:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    error('[ComprehensiveFetch] Error in getTotalVisibleProfilesCount:', error);
    return 0;
  }
};

