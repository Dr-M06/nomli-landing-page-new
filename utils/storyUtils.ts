import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { uploadVideoToMux, VideoUploadResult } from './muxConfig';
import { getBlockedUserIds } from './blockUser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadToBunnyNet, isBunnyNetEnabled } from './bunnyNetStorage';
import { log, warn, error } from './productionLogger';

/** Max story video length in seconds. Must match StoryCamera recording limit. */
export const STORY_VIDEO_MAX_SECONDS = 45;

export interface StoryMetadata {
  text_style?: string;
  text_animation?: string;
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'photo' | 'video';
  caption?: string;
  is_public: boolean; // true = everyone, false = followers only
  mux_asset_id?: string; // Mux asset ID for videos (needed for deletion)
  audio_url?: string | null;
  audio_title?: string | null;
  audio_artist?: string | null;
  metadata?: StoryMetadata | null;
  created_at: string;
  expires_at: string;
  views_count: number;
  // User data
  username?: string;
  display_name?: string;
  avatar_url?: string;
  // View status
  viewed?: boolean;
}

export interface StoryView {
  id: string;
  story_id: string;
  viewer_id: string;
  viewed_at: string;
  // Viewer data
  username?: string;
  display_name?: string;
  avatar_url?: string;
}

/**
 * Check if stories table exists (no setup needed - SQL should be run manually)
 * This is just a check to provide helpful error messages
 */
export const setupStoriesTable = async (): Promise<boolean> => {
  try {
    // Just check if the table exists by trying to query it
    const { error } = await supabase
      .from('stories')
      .select('id')
      .limit(1);

    if (error && error.code === '42P01') {
      // Table doesn't exist
      error('[StoryUtils] Stories table does not exist. Please run the SQL migration: supabase/migrations/create_stories_tables.sql');
      return false;
    }

    if (error) {
      error('[StoryUtils] Error checking stories table:', error);
      return false;
    }

    log('[StoryUtils] ✅ Stories table exists');
    return true;
  } catch (error) {
    error('[StoryUtils] Exception checking stories table:', error);
    return false;
  }
};

export interface StoryMediaUploadResult {
  mediaUrl: string;
  muxAssetId?: string; // Only for videos
}

/**
 * Convert UTF-8 string to Uint8Array (React Native compatible)
 */
function utf8StringToUint8Array(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i);
    if (charCode < 0x80) {
      // Single byte character (ASCII)
      bytes.push(charCode);
    } else if (charCode < 0x800) {
      // Two byte character
      bytes.push(0xc0 | (charCode >> 6));
      bytes.push(0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      // Three byte character
      bytes.push(0xe0 | (charCode >> 12));
      bytes.push(0x80 | ((charCode >> 6) & 0x3f));
      bytes.push(0x80 | (charCode & 0x3f));
    } else {
      // Surrogate pair (four byte character)
      i++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (charCode >> 18));
      bytes.push(0x80 | ((charCode >> 12) & 0x3f));
      bytes.push(0x80 | ((charCode >> 6) & 0x3f));
      bytes.push(0x80 | (charCode & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Upload story media with automatic retry on network failure
 * - Videos: Upload to Mux (same as posts)
 * - Photos: Upload to Supabase Storage
 * @param uri - Local file URI
 * @param type - Media type ('photo' | 'video')
 * @param retryCount - Current retry attempt (internal use)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 */
export const uploadStoryMedia = async (
  uri: string,
  type: 'photo' | 'video',
  retryCount: number = 0,
  maxRetries: number = 3
): Promise<StoryMediaUploadResult | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    if (type === 'video') {
      // Yield to UI thread before starting video upload to prevent freeze
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Upload video to Mux (same system as posts)
      log('[StoryUtils] Uploading story video to Mux...');
      
      const muxResult: VideoUploadResult = await uploadVideoToMux(uri, {
        title: `Story video - ${new Date().toISOString()}`,
        description: 'Story video uploaded via Nomli Mingle',
        maxDuration: STORY_VIDEO_MAX_SECONDS,
      });

      log('[StoryUtils] ✅ Story video uploaded to Mux:', muxResult.secure_url);
      
      // Return the Mux HLS URL and asset ID for deletion
      return {
        mediaUrl: muxResult.secure_url,
        muxAssetId: muxResult.muxId || muxResult.id,
      };
    } else {
      // Check if it's an SVG file
      const isSvg = uri.toLowerCase().endsWith('.svg');
      const fileExtension = isSvg ? 'svg' : 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExtension}`;
      const contentType = isSvg ? 'image/svg+xml' : 'image/jpeg';

      // Try Bunny.net first (if enabled) - Best performance for Africa
      try {
        if (isBunnyNetEnabled() && !isSvg) { // Bunny.net doesn't support SVG well
          log('[StoryUtils] Attempting Bunny.net upload (Africa-optimized)...');
          
          const bunnyUrl = await uploadToBunnyNet(uri, fileName, 'story-photos');
          
          if (bunnyUrl) {
            log('[StoryUtils] ✅ Bunny.net upload successful! CDN URL:', bunnyUrl);
            return {
              mediaUrl: bunnyUrl,
              muxAssetId: null,
            };
          } else {
            log('[StoryUtils] ⚠️ Bunny.net upload failed, falling back to Supabase...');
          }
        }
      } catch (bunnyError: any) {
        warn('[StoryUtils] ⚠️ Bunny.net upload error (non-critical), falling back to Supabase:', bunnyError?.message || bunnyError);
      }
      
      // Fallback to Supabase Storage
      const bucket = 'story-photos';
      log('[StoryUtils] Uploading story photo to bucket:', bucket, 'file:', fileName, 'type:', contentType);

      // Read file
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      log('[StoryUtils] Photo size:', fileInfo.size, 'bytes');

      // Check file size before processing (5MB limit for photos to prevent memory issues)
      const maxPhotoSize = 5 * 1024 * 1024; // 5MB limit
      if (fileInfo.size && fileInfo.size > maxPhotoSize) {
        throw new Error(`Photo is too large (${(fileInfo.size / (1024 * 1024)).toFixed(1)}MB). Please use a smaller image (max 5MB).`);
      }

      // Use signed URL approach for React Native compatibility (same as uploadPostImage)
      log('[StoryUtils] Creating signed upload URL...');
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(fileName, {
          upsert: false
        });

      if (signedUrlError || !signedUrlData?.signedUrl) {
        error('[StoryUtils] Error creating signed URL:', signedUrlError);
        
        // Check for specific errors
        if (signedUrlError?.message?.includes('Bucket not found')) {
          throw new Error(`Storage bucket "${bucket}" not found. Please create it in Supabase Dashboard > Storage. See STORY_SETUP_GUIDE.md for instructions.`);
        }
        
        throw new Error(`Failed to create upload URL: ${signedUrlError?.message || 'Unknown error'}`);
      }

      log('[StoryUtils] ✅ Got signed upload URL');

      // Yield to UI thread before reading large files to prevent freeze
      await new Promise(resolve => setTimeout(resolve, 0));
      
      let uploadBody: Uint8Array;
      
      if (isSvg) {
        // For SVG, read as UTF8 string and convert to Uint8Array
        const svgString = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        
        // Yield to UI thread during conversion
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Convert UTF8 string to Uint8Array (proper UTF-8 encoding)
        uploadBody = utf8StringToUint8Array(svgString);
      } else {
        // For photos, read as base64 and convert to Uint8Array
        // Use chunked reading for large files to prevent UI freeze
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        // Yield to UI thread before conversion
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Convert base64 to Uint8Array - React Native compatible
        // Process in chunks to prevent blocking
        const binaryString = atob(base64);
        const chunkSize = 8192; // Process 8KB at a time
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i += chunkSize) {
          const end = Math.min(i + chunkSize, binaryString.length);
          for (let j = i; j < end; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }
          // Yield to UI thread every chunk
          if (i % (chunkSize * 10) === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        uploadBody = bytes;
      }

      log('[StoryUtils] File read, size:', uploadBody.length, 'bytes');
      
      // Yield to UI thread before upload
      await new Promise(resolve => setTimeout(resolve, 0));

      // Upload file using signed URL via fetch (avoids Blob/ReadableStream issues)
      log('[StoryUtils] Uploading to signed URL...');
      const uploadResponse = await fetch(signedUrlData.signedUrl, {
        method: 'PUT',
        body: uploadBody,
        headers: {
          'Content-Type': contentType,
        },
      });

      if (!uploadResponse.ok) {
        error('[StoryUtils] Upload failed:', uploadResponse.status, uploadResponse.statusText);
        
        // Retry on network/server errors
        if (retryCount < maxRetries && (
          uploadResponse.status === 0 || // Network error
          uploadResponse.status >= 500 || // Server error
          uploadResponse.status === 408 // Timeout
        )) {
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s
          log(`[StoryUtils] Retrying upload in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return uploadStoryMedia(uri, type, retryCount + 1, maxRetries);
        }
        
        throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      log('[StoryUtils] ✅ File uploaded successfully');

      // Get public URL
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      
      log('[StoryUtils] ✅ Story photo uploaded:', urlData.publicUrl);
      return {
        mediaUrl: urlData.publicUrl,
      };
    }
  } catch (error: any) {
    error('[StoryUtils] Exception uploading story media:', error);
    
    // Retry on network errors
    const isNetworkError = 
      error?.message?.includes('Network request failed') ||
      error?.message?.includes('timeout') ||
      error?.message?.includes('fetch') ||
      error?.message?.includes('Failed to fetch') ||
      error?.code === 'NETWORK_ERROR' ||
      error?.code === 'TIMEOUT';
    
    if (isNetworkError && retryCount < maxRetries) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s
      log(`[StoryUtils] Network error detected, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return uploadStoryMedia(uri, type, retryCount + 1, maxRetries);
    }
    
    throw error;
  }
};

/**
 * Create a new story
 */
export const createStory = async (
  mediaUrl: string,
  mediaType: 'photo' | 'video',
  caption?: string,
  isPublic: boolean = true, // Default to public
  muxAssetId?: string, // Mux asset ID for videos (needed for deletion)
  audio?: { url: string; title?: string | null; artist?: string | null } | null,
  metadata?: StoryMetadata | null
): Promise<Story | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Ensure stories table exists
    await setupStoriesTable();

    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      media_url: mediaUrl,
      media_type: mediaType,
      caption: caption || null,
      is_public: isPublic,
      mux_asset_id: muxAssetId || null,
    };
    if (audio?.url) {
      insertPayload.audio_url = audio.url;
      insertPayload.audio_title = audio.title ?? null;
      insertPayload.audio_artist = audio.artist ?? null;
    }
    if (metadata && (metadata.text_style || metadata.text_animation)) {
      insertPayload.metadata = metadata;
    }

    const { data, error } = await supabase
      .from('stories')
      .insert(insertPayload)
      .select(`
        *,
        profiles (
          id,
          username,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      error('[StoryUtils] Error creating story:', error);
      return null;
    }

    log('[StoryUtils] ✅ Story created:', data.id, 'Privacy:', isPublic ? 'Public' : 'Followers only', muxAssetId ? `Mux ID: ${muxAssetId}` : '');
    // Handle profiles - could be object or array
    const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    
    return {
      ...data,
      username: profile?.username,
      display_name: profile?.full_name,
      avatar_url: profile?.avatar_url,
    };
  } catch (error) {
    error('[StoryUtils] Exception creating story:', error);
    return null;
  }
};

// Story cache keys
const STORIES_CACHE_KEY = '@nomli_stories_cache';
const STORIES_CACHE_TIMESTAMP_KEY = '@nomli_stories_cache_timestamp';
const STORIES_CACHE_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes cache (stories expire quickly)

/**
 * Load stories from cache
 */
const loadCachedStories = async (): Promise<Story[] | null> => {
  try {
    const cachedData = await AsyncStorage.getItem(STORIES_CACHE_KEY);
    const timestampStr = await AsyncStorage.getItem(STORIES_CACHE_TIMESTAMP_KEY);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const cacheAge = Date.now() - timestamp;
      
      // Check if cache is still valid
      if (cacheAge < STORIES_CACHE_EXPIRY_MS) {
        log(`[StoryUtils] Loading ${JSON.parse(cachedData).length} stories from cache (${Math.round(cacheAge / 1000)}s old)`);
        return JSON.parse(cachedData);
      } else {
        log('[StoryUtils] Story cache expired, will fetch fresh');
        // Don't clear here - let it be overwritten on next fetch
      }
    }
  } catch (error) {
    error('[StoryUtils] Error loading cached stories:', error);
  }
  return null;
};

/**
 * Save stories to cache
 */
const saveCachedStories = async (stories: Story[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORIES_CACHE_KEY, JSON.stringify(stories));
    await AsyncStorage.setItem(STORIES_CACHE_TIMESTAMP_KEY, Date.now().toString());
    log(`[StoryUtils] Cached ${stories.length} stories`);
  } catch (error) {
    error('[StoryUtils] Error saving cached stories:', error);
  }
};

/**
 * Fetch stories from users (active stories only, not expired)
 * Filters out stories from blocked users
 * Uses cache for instant loading
 */
export const fetchStories = async (useCache: boolean = true): Promise<Story[]> => {
  try {
    // Check network before auth check - if offline, try to get user from stored session
    const NetInfo = (await import('@react-native-community/netinfo')).default;
    const netInfo = await NetInfo.fetch();
    
    let user: any = null;
    if (netInfo.isConnected) {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        user = authUser;
      } catch (authError) {
        // If auth check fails (network error), try to get user from stored session
        log('[StoryUtils] Auth check failed - trying to get user from stored session');
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          const sessionStr = await AsyncStorage.getItem('supabase.auth.session');
          if (sessionStr) {
            const sessionData = JSON.parse(sessionStr);
            user = sessionData?.user;
          }
        } catch (storageError) {
          log('[StoryUtils] Could not get user from stored session');
        }
      }
    } else {
      // Offline - try to get user from stored session
      log('[StoryUtils] Offline detected - getting user from stored session');
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const sessionStr = await AsyncStorage.getItem('supabase.auth.session');
        if (sessionStr) {
          const sessionData = JSON.parse(sessionStr);
          user = sessionData?.user;
        }
      } catch (storageError) {
        log('[StoryUtils] Could not get user from stored session');
      }
    }
    
    if (!user) {
      // If no user, still return cached stories if available (for offline viewing)
      if (useCache) {
        const cachedStories = await loadCachedStories();
        if (cachedStories && cachedStories.length > 0) {
          log('[StoryUtils] No user but returning cached stories for offline viewing');
          return cachedStories;
        }
      }
      return [];
    }

    // Try to load from cache first for instant display
    if (useCache) {
      const cachedStories = await loadCachedStories();
      if (cachedStories && cachedStories.length > 0) {
        // Check network status - if offline, return cached stories immediately (reuse netInfo from above)
        if (!netInfo.isConnected) {
          log(`[StoryUtils] Offline detected - returning ${cachedStories.length} cached stories`);
          return cachedStories;
        }
        
        // Return cached stories immediately, then refresh in background
        log(`[StoryUtils] Returning ${cachedStories.length} cached stories immediately`);
        // Refresh in background (don't await)
        fetchStories(false).catch(() => {}); // Silent refresh
        return cachedStories;
      }
    }

    // Check network status before fetching (reuse netInfo from above)
    if (!netInfo.isConnected) {
      log('[StoryUtils] Offline detected - returning cached stories or empty array');
      const cachedStories = await loadCachedStories();
      return cachedStories || [];
    }

    // Get blocked user IDs (both directions)
    const blockedUserIds = await getBlockedUserIds(user.id);
    log(`[StoryUtils] Fetching stories from network, blocking ${blockedUserIds.length} users`);

    const { data, error} = await supabase
      .from('stories')
      .select(`
        *,
        profiles (
          id,
          username,
          full_name,
          avatar_url
        ),
        story_views!left (
          viewer_id
        )
      `)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      error('[StoryUtils] Error fetching stories:', error);
      // Return cached stories if available, even if expired
      const cachedStories = await loadCachedStories();
      return cachedStories || [];
    }

    // Filter out stories from blocked users
    const filteredData = (data || []).filter((story: any) => 
      !blockedUserIds.includes(story.user_id)
    );

    log(`[StoryUtils] Filtered ${(data || []).length - filteredData.length} blocked stories`);

    // Get unique user IDs to fetch profiles if needed
    const userIds = [...new Set(filteredData.map((s: any) => s.user_id))];
    
    // Fetch profiles separately as fallback
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', userIds);
    
    const profileMap = (profilesData || []).reduce((map: any, profile: any) => {
      map[profile.id] = profile;
      return map;
    }, {});

    // Group by user and mark if current user has viewed
    const storiesWithViewStatus = filteredData.map((story: any) => {
      // Handle profiles - could be object or array from join
      const profileFromJoin = Array.isArray(story.profiles) ? story.profiles[0] : story.profiles;
      // Fallback to separate profile fetch if join didn't work
      const profile = profileFromJoin || profileMap[story.user_id];
      
      return {
        ...story,
        username: profile?.username,
        display_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
        viewed: story.story_views?.some((view: any) => view.viewer_id === user.id),
      };
    });

    // Cache the fresh stories
    await saveCachedStories(storiesWithViewStatus);

    return storiesWithViewStatus;
  } catch (error) {
    error('[StoryUtils] Exception fetching stories:', error);
    // Return cached stories if available, even on error
    const cachedStories = await loadCachedStories();
    return cachedStories || [];
  }
};

/**
 * Fetch stories for a specific user
 */
export const fetchUserStories = async (userId: string): Promise<Story[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Check if this is a placeholder user - return placeholder stories
    if (userId.startsWith('placeholder-user-')) {
      const { generatePlaceholderStories } = await import('./placeholderData');
      const placeholderStories = generatePlaceholderStories(15); // Generate enough stories for all themes
      const storyIndex = parseInt(userId.replace('placeholder-user-', '')) || 0;
      const story = placeholderStories[storyIndex % placeholderStories.length];
      
      if (story) {
        return [{
          id: story.id,
          user_id: story.userId,
          media_url: story.photoUrl || story.avatarUrl,
          media_type: 'photo' as 'photo' | 'video',
          caption: story.caption || undefined, // Include story caption/title
          is_public: true,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          views_count: 0,
          username: story.username,
          display_name: story.displayName,
          avatar_url: story.avatarUrl,
          viewed: false,
        }];
      }
      return [];
    }

    // Fetch stories
    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        profiles (
          id,
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      error('[StoryUtils] Error fetching user stories:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Fetch profile separately as fallback
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .eq('id', userId)
      .single();

    // Fetch all views for these stories by current user (more reliable than LEFT JOIN)
    const storyIds = data.map((s: any) => s.id);
    const { data: viewsData } = await supabase
      .from('story_views')
      .select('story_id')
      .in('story_id', storyIds)
      .eq('viewer_id', user.id);

    const viewedStoryIds = new Set((viewsData || []).map((v: any) => v.story_id));
    log(`[StoryUtils] Found ${viewedStoryIds.size} viewed stories out of ${storyIds.length} for user ${user.id}`);

    const storiesWithViewStatus = data.map((story: any) => {
      // Handle profiles - could be object or array from join
      const profileFromJoin = Array.isArray(story.profiles) ? story.profiles[0] : story.profiles;
      // Fallback to separate profile fetch if join didn't work
      const profile = profileFromJoin || profileData;
      
      // Check if story has been viewed by current user
      const viewed = viewedStoryIds.has(story.id);
      
      return {
        ...story,
        username: profile?.username,
        display_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
        viewed,
      };
    });

    const viewedCount = storiesWithViewStatus.filter(s => s.viewed).length;
    log(`[StoryUtils] fetchUserStories for ${userId}: ${storiesWithViewStatus.length} stories, ${viewedCount} viewed by ${user.id}`);

    return storiesWithViewStatus;
  } catch (error) {
    error('[StoryUtils] Exception fetching user stories:', error);
    return [];
  }
};

/**
 * Mark a story as viewed (excludes story owner's own views)
 */
export const markStoryAsViewed = async (storyId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('[StoryUtils] markStoryAsViewed: No user, skipping');
      return false;
    }

    // Skip database operations for placeholder stories
    if (storyId.startsWith('placeholder-story-') || storyId.startsWith('placeholder-')) {
      log(`[StoryUtils] Skipping view tracking for placeholder story: ${storyId}`);
      return true; // Return true to indicate "viewed" without database interaction
    }

    log(`[StoryUtils] markStoryAsViewed called for story ${storyId} by user ${user.id}`);

    // First, check if this is the story owner
    const { data: storyData, error: storyError } = await supabase
      .from('stories')
      .select('user_id, views_count')
      .eq('id', storyId)
      .single();

    if (storyError || !storyData) {
      error('[StoryUtils] Error fetching story:', storyError);
      return false;
    }

    // Don't track views from the story owner
    if (storyData.user_id === user.id) {
      log('[StoryUtils] Skipping view tracking for story owner');
      return false;
    }

    // Check if already viewed
    const { data: existingView } = await supabase
      .from('story_views')
      .select('id')
      .eq('story_id', storyId)
      .eq('viewer_id', user.id)
      .single();

    if (existingView) {
      log(`[StoryUtils] Story ${storyId} already viewed by ${user.id}`);
      return true; // Already viewed, return true
    }

    // Insert view record
    const { data: insertData, error: viewError } = await supabase
      .from('story_views')
      .insert({
        story_id: storyId,
        viewer_id: user.id,
      })
      .select()
      .single();

    if (viewError) {
      error('[StoryUtils] Error inserting view record:', viewError);
      return false;
    }

    log(`[StoryUtils] ✅ Successfully marked story ${storyId} as viewed by ${user.id}`, insertData);

    // Increment views count
    const { error: updateError } = await supabase
      .from('stories')
      .update({
        views_count: (storyData.views_count || 0) + 1,
      })
      .eq('id', storyId);

    if (updateError) {
      error('[StoryUtils] Error updating views count:', updateError);
    } else {
      log(`[StoryUtils] ✅ Updated views_count for story ${storyId}`);
    }

    return true;
  } catch (error) {
    error('[StoryUtils] Exception marking story as viewed:', error);
    return false;
  }
};

/**
 * Get viewers for a story (for story owner only)
 */
export const getStoryViewers = async (storyId: string): Promise<StoryView[]> => {
  try {
    // Skip database operations for placeholder stories
    if (storyId.startsWith('placeholder-story-') || storyId.startsWith('placeholder-')) {
      log(`[StoryUtils] Skipping viewer fetch for placeholder story: ${storyId}`);
      return []; // Return empty array for placeholder stories
    }
    
    const { data, error } = await supabase
      .from('story_views')
      .select(`
        *,
        profiles:viewer_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false });

    if (error) {
      error('[StoryUtils] Error fetching story viewers:', error);
      return [];
    }

    return (data || []).map(view => {
      // Handle profiles - could be object or array
      const profile = Array.isArray(view.profiles) ? view.profiles[0] : view.profiles;
      
      return {
        ...view,
        username: profile?.username,
        display_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
      };
    });
  } catch (error) {
    error('[StoryUtils] Exception fetching story viewers:', error);
    return [];
  }
};

/**
 * Delete a story (own stories only)
 */
export const deleteStory = async (storyId: string): Promise<boolean> => {
  try {
    // Skip database operations for placeholder stories
    if (storyId.startsWith('placeholder-story-') || storyId.startsWith('placeholder-')) {
      log(`[StoryUtils] Skipping delete for placeholder story: ${storyId}`);
      return true; // Return true to indicate success without database interaction
    }
    
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId);

    if (error) {
      error('[StoryUtils] Error deleting story:', error);
      return false;
    }

    log('[StoryUtils] ✅ Story deleted:', storyId);
    return true;
  } catch (error) {
    error('[StoryUtils] Exception deleting story:', error);
    return false;
  }
};

/**
 * Reset view tracking for a user's stories (so they can be viewed again from the start)
 * This is called when all of a user's stories have been viewed
 */
export const resetUserStoryViews = async (userId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      error('[StoryUtils] Cannot reset views - user not authenticated');
      return false;
    }

    // Skip database operations for placeholder users
    if (userId.startsWith('placeholder-user-') || userId.startsWith('placeholder-')) {
      log(`[StoryUtils] Skipping view reset for placeholder user: ${userId}`);
      return true; // Return true to indicate success without database interaction
    }

    log(`[StoryUtils] Resetting views for user ${userId} (viewer: ${user.id})`);

    // Get all story IDs for this user
    const { data: stories, error: fetchError } = await supabase
      .from('stories')
      .select('id')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());

    if (fetchError || !stories) {
      error('[StoryUtils] Error fetching user stories for reset:', fetchError);
      return false;
    }

    const storyIds = stories.map(s => s.id);
    log(`[StoryUtils] Found ${storyIds.length} stories to reset views for`);
    
    if (storyIds.length === 0) {
      log('[StoryUtils] No stories to reset');
      return true;
    }

    // Delete all view records for current user viewing this user's stories
    const { data: deletedData, error: deleteError } = await supabase
      .from('story_views')
      .delete()
      .in('story_id', storyIds)
      .eq('viewer_id', user.id)
      .select();

    if (deleteError) {
      error('[StoryUtils] Error resetting story views:', deleteError);
      return false;
    }

    const deletedCount = deletedData?.length || 0;
    log(`[StoryUtils] ✅ Reset view tracking: deleted ${deletedCount} view records for ${storyIds.length} stories from user ${userId}`);
    return true;
  } catch (error) {
    error('[StoryUtils] Exception resetting story views:', error);
    return false;
  }
};

/**
 * Cleanup expired stories (run periodically)
 */
export const cleanupExpiredStories = async (): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from('stories')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      error('[StoryUtils] Error cleaning up expired stories:', error);
      return 0;
    }

    const count = data?.length || 0;
    if (count > 0) {
      log(`[StoryUtils] ✅ Cleaned up ${count} expired stories`);
    }
    return count;
  } catch (error) {
    error('[StoryUtils] Exception cleaning up expired stories:', error);
    return 0;
  }
};

