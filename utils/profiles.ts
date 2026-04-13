import { supabase, Profile } from './supabase';
import { ensureDbSetup } from './ensureDbSetup';
import { log, warn, error } from './productionLogger';


/**
 * Fetch profiles with bio, location, and interests
 * @param currentUserId The current user's ID to exclude from results
 * @param limit Maximum number of profiles to return
 * @returns Array of profile objects
 */
export const fetchDetailedProfiles = async (
  currentUserId?: string,
  limit: number = 20
): Promise<Partial<Profile>[]> => {
  try {
    // Ensure database is set up
    await ensureDbSetup();
    
    // Start with a query that selects profiles with bio and location
    let query = supabase
      .from('profiles')
      .select('*')
      .not('bio', 'is', null)
      .not('location', 'is', null)
      .or('is_suspended.is.null,is_suspended.eq.false'); // Exclude suspended users
    
    // If we have a current user ID, exclude them from results
    if (currentUserId) {
      query = query.neq('id', currentUserId);
    }
    
    // Get the results
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      error('Error fetching profiles:', error);
      return [];
    }
    
    // Process the data to ensure interests is always an array
    const processedData = (data || []).map(profile => {
      // Handle interests field - it might be a string or an array
      let interests = profile.interests;
      
      if (interests) {
        // If it's a string, try to parse it as JSON
        if (typeof interests === 'string') {
          try {
            interests = JSON.parse(interests);
          } catch (e) {
            // If parsing fails, split by comma
            interests = interests.split(',').map((item: string) => item.trim());
          }
        }
        
        // Ensure it's an array
        if (!Array.isArray(interests)) {
          interests = [];
        }
      } else {
        interests = [];
      }
      
      return {
        ...profile,
        interests
      };
    });
    
    return processedData;
  } catch (error) {
    error('Error in fetchDetailedProfiles:', error);
    return [];
  }
};

/**
 * Calculate mock distance between users
 * This is a placeholder - in a real app, you would use geolocation
 * @param profiles Array of profiles to add distance to
 * @returns The same profiles with added distance property
 */
export const addMockDistanceToProfiles = (
  profiles: Partial<Profile>[]
): (Partial<Profile> & { distance: number })[] => {
  return profiles.map((profile, index) => ({
    ...profile,
    distance: (Math.random() * 5) + 0.1, // Random distance between 0.1 and 5.1 km
  }));
}; 