import { supabase, Profile } from './supabase';
import { ensureDbSetup } from './ensureDbSetup';
import { logError } from './errorHandler';
import { validateUsername } from './wordFilter';
import { cacheProfile, cacheProfiles, clearProfileCache } from './profileCache';
import { validateUsername as validateUsernameContent, validateDisplayName, validateBio } from './contentFilter';
import { log, warn, error } from './productionLogger';


/**
 * Create a generic placeholder profile
 * @param userId The user ID to use for the placeholder
 * @returns A placeholder profile object
 *
 * Placeholder avatar: no avatar_url so EnhancedAvatar shows clean "NU" initials
 * on a gradient circle (no external image).
 */
export const createPlaceholderProfile = (userId: string = 'placeholder'): Partial<Profile> => ({
  id: userId,
  full_name: 'New User',
  username: `user_${userId.substring(0, 8)}`,
  avatar_url: null, // No image – EnhancedAvatar shows "NU" initials on gradient
  location: '',
  bio: 'Set up your profile to share your interests and connect with others.',
  interests: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

/**
 * Fetch all profiles from the database
 */
export const fetchAllProfiles = async (limit: number = 50): Promise<Partial<Profile>[]> => {
  try {
    await ensureDbSetup();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      logError('ProfilesManager:FetchAll', error);
      return [];
    }
    
    // Filter out suspended users (client-side fallback)
    const nonSuspendedProfiles = (data || []).filter((profile: any) => profile.is_suspended !== true);
    
    const profiles = processProfiles(nonSuspendedProfiles);
    
    // Cache profiles for quick access
    try {
      await cacheProfiles(profiles);
    } catch (cacheError) {
      warn('[ProfilesManager] Failed to cache profiles:', cacheError);
      // Don't fail the operation if caching fails
    }
    
    return profiles;
  } catch (error) {
    logError('ProfilesManager:FetchAll', error);
    return [];
  }
};

/**
 * Fetch profiles with specific criteria
 */
export const fetchProfilesWithFilter = async ({
  hasBio = false,
  hasLocation = false, 
  hasInterests = false,
  currentUserId = null,
  limit = 50
}: {
  hasBio?: boolean,
  hasLocation?: boolean,
  hasInterests?: boolean,
  currentUserId?: string | null,
  limit?: number
} = {}): Promise<Partial<Profile>[]> => {
  try {
    await ensureDbSetup();
    
    let query = supabase.from('profiles').select('*');
    
    if (hasBio) {
      query = query.not('bio', 'is', null);
    }
    
    if (hasLocation) {
      query = query.not('location', 'is', null);
    }
    
    if (currentUserId) {
      query = query.neq('id', currentUserId);
    }
    
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      logError('ProfilesManager:FetchFiltered', error);
      return [];
    }
    
    // Process all profiles to ensure consistent format
    const processedProfiles = processProfiles(data || []);
    
    log('Debug - Processed profiles before filter:', (processedProfiles?.length || 0));
    
    // If we don't need to filter by interests, return all processed profiles
    if (!hasInterests) {
      return processedProfiles;
    }
    
    // Filter for profiles with interests
    const profilesWithInterests = processedProfiles.filter(profile => 
      profile.interests && 
      Array.isArray(profile.interests) && 
      (profile.interests?.length || 0) > 0
    );
    
    log('Debug - Profiles with interests after filter:', (profilesWithInterests?.length || 0));
    
    return profilesWithInterests;
  } catch (error) {
    logError('ProfilesManager:FetchFiltered', error);
    return [];
  }
};

/**
 * Process profile data to ensure consistent format
 * @param profiles Array of profile objects
 * @returns Processed profile objects
 */
const processProfiles = (profiles: Partial<Profile>[]): Partial<Profile>[] => {
  return profiles.map(profile => {
    // Ensure interests is an array
    let interests = profile.interests || [];
    
    // Handle interests that might be stored as strings
    if (typeof interests === 'string') {
      try {
        interests = JSON.parse(interests);
      } catch (e) {
        // If parsing fails, try to split by comma
        interests = interests.split(',').map(item => item.trim());
      }
    }
    
    // Ensure it's an array
    if (!Array.isArray(interests)) {
      interests = [];
    }
    
    return {
      ...profile,
      interests
    };
  });
};

/**
 * Add mock distance to profiles for UI display
 */
export const addMockDistanceToProfiles = (
  profiles: Partial<Profile>[]
): (Partial<Profile> & { distance: number })[] => {
  return profiles.map(profile => ({
    ...profile,
    distance: (Math.random() * 5) + 0.1, // Random distance between 0.1 and 5.1 km
  }));
};

/**
 * Get profile by ID
 */
export const getProfileById = async (profileId: string): Promise<Partial<Profile> | null> => {
  try {
    log(`[ProfilesManager] Starting getProfileById for: ${profileId}`);
    
    // Check if this is a placeholder user - return placeholder profile
    if (profileId.startsWith('placeholder-user-')) {
      const { generatePlaceholderProfile } = await import('./placeholderProfile');
      const placeholderProfile = generatePlaceholderProfile(profileId);
      if (placeholderProfile) {
        log(`[ProfilesManager] Returning placeholder profile for: ${placeholderProfile.username}`);
        return placeholderProfile as Partial<Profile>;
      }
    }
    
    // Use cached version from chat utils for better performance
    const { getUserProfile } = require('./chat');
    const cachedProfile = await getUserProfile(profileId);
    
    if (cachedProfile) {
      log(`[ProfilesManager] Profile found in cache for: ${cachedProfile.username || cachedProfile.full_name}`);
      return cachedProfile;
    }
    
    // If cache miss, do direct query without ensureDbSetup to avoid blocking
    log(`[ProfilesManager] Cache miss, executing direct database query for profile: ${profileId}`);
    const queryPromise = supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .maybeSingle();
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 3000); // Reduced to 3 seconds
    });
    
    const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;
    
    if (error) {
      error(`[ProfilesManager] Database error for profile ${profileId}:`, error);
      logError('ProfilesManager:GetById', error);
      return null;
    }
    
    if (!data) {
      log(`[ProfilesManager] No profile found for ID: ${profileId}`);
      return null;
    }
    
    log(`[ProfilesManager] Profile data found, processing...`);
    const [processedProfile] = processProfiles([data]);
    log(`[ProfilesManager] Profile processed successfully for: ${processedProfile.username || processedProfile.full_name}`);
    
    return processedProfile;
  } catch (error) {
    error(`[ProfilesManager] Error in getProfileById for ${profileId}:`, error);
    logError('ProfilesManager:GetById', error);
    return null;
  }
};

/**
 * Update a profile
 */
export const updateProfile = async (
  profileId: string, 
  updates: Partial<Profile>
): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    // Validate username if it's being updated
    if (updates.username) {
      // Content filter validation
      const contentFilterResult = validateUsernameContent(updates.username.trim());
      if (!contentFilterResult.isValid) {
        error('[ProfilesManager] Username content filter failed:', contentFilterResult.reason);
        throw new Error(contentFilterResult.reason || 'Username not allowed');
      }
      
      // Word filter validation
      const usernameValidation = validateUsername(updates.username.trim());
      if (!usernameValidation.isValid) {
        error('[ProfilesManager] Username validation failed:', usernameValidation.error);
        throw new Error(usernameValidation.error || 'Invalid username');
      }
    }
    
    // Validate display name if it's being updated
    if (updates.full_name) {
      const displayNameResult = validateDisplayName(updates.full_name.trim());
      if (!displayNameResult.isValid) {
        error('[ProfilesManager] Display name content filter failed:', displayNameResult.reason);
        throw new Error(displayNameResult.reason || 'Display name not allowed');
      }
    }
    
    // Validate bio if it's being updated
    if (updates.bio) {
      const bioResult = validateBio(updates.bio.trim());
      if (!bioResult.isValid) {
        error('[ProfilesManager] Bio content filter failed:', bioResult.reason);
        throw new Error(bioResult.reason || 'Bio content not allowed');
      }
    }
    
    // Prepare interests if it exists in updates
    let processedUpdates = { ...updates };
    
    // Handle interests properly for database storage
    if (updates.interests) {
      // If it's an array, store it as a proper Postgres array
      // For compatibility, we'll stringify it to ensure it works with our database
      if (Array.isArray(updates.interests)) {
        log('Storing interests array:', updates.interests);
        processedUpdates.interests = updates.interests;
      } else if (typeof updates.interests === 'string') {
        // If it's already a string, try to parse it
        try {
          const parsedInterests = JSON.parse(updates.interests);
          if (Array.isArray(parsedInterests)) {
            processedUpdates.interests = parsedInterests;
          }
        } catch (e) {
          // If parsing fails, split by comma
          processedUpdates.interests = updates.interests.split(',').map(item => item.trim());
        }
      }
    }
    
    log('Updating profile with interests:', processedUpdates.interests);
    
    const { error } = await supabase
      .from('profiles')
      .update(processedUpdates)
      .eq('id', profileId);
    
    if (error) {
      logError('ProfilesManager:Update', error);
      return false;
    }
    
    // Invalidate cache for this profile since it was updated
    try {
      await clearProfileCache(profileId);
      log(`[ProfilesManager] Cleared cache for updated profile ${profileId}`);
    } catch (cacheError) {
      warn('[ProfilesManager] Failed to clear profile cache:', cacheError);
      // Don't fail the operation if cache clearing fails
    }
    
    return true;
  } catch (error) {
    logError('ProfilesManager:Update', error);
    return false;
  }
};

/**
 * Fetch raw profiles directly from the database without any filtering
 * @param limit Maximum number of profiles to return
 * @returns Array of unprocessed profile objects
 */
export const fetchRawProfiles = async (limit: number = 100): Promise<Partial<Profile>[]> => {
  try {
    await ensureDbSetup();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      logError('ProfilesManager:FetchRaw', error);
      return [];
    }
    
    const profiles = data || [];
    
    // Cache profiles for quick access
    try {
      await cacheProfiles(profiles);
    } catch (cacheError) {
      warn('[ProfilesManager] Failed to cache raw profiles:', cacheError);
      // Don't fail the operation if caching fails
    }
    
    return profiles;
  } catch (error) {
    logError('ProfilesManager:FetchRaw', error);
    return [];
  }
}; 