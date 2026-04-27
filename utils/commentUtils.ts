import { supabase } from './supabase';
import { ensureDbSetup } from './ensureDbSetup';
import { getBlockedUserIds } from './blockUser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from './productionLogger';


// In-memory cache for comments
const commentsCache = new Map<string, { comments: Comment[]; timestamp: number }>();
const COMMENTS_CACHE_DURATION = 60000; // 1 minute cache duration

// Track ongoing requests to prevent duplicate fetches for the same post
const ongoingRequests = new Map<string, Promise<Comment[]>>();

// Persistent cache keys for AsyncStorage
const COMMENTS_CACHE_KEY_PREFIX = 'post_comments_cache_';
const COMMENTS_CACHE_TIMESTAMP_KEY_PREFIX = 'post_comments_timestamp_';
const COMMENTS_PERSISTENT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for persistent cache

/**
 * Load comments from persistent cache (AsyncStorage)
 */
const loadCachedComments = async (postId: string, userId?: string): Promise<Comment[] | null> => {
  try {
    const cacheKey = `${postId}_${userId || 'anonymous'}`;
    const cachedData = await AsyncStorage.getItem(COMMENTS_CACHE_KEY_PREFIX + cacheKey);
    const timestampStr = await AsyncStorage.getItem(COMMENTS_CACHE_TIMESTAMP_KEY_PREFIX + cacheKey);
    
    if (cachedData && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      
      // Check if cache is still valid (within 24 hours)
      if (now - timestamp < COMMENTS_PERSISTENT_CACHE_DURATION) {
        log(`[CommentUtils] Loading comments from persistent cache for post ${postId} (age: ${Math.round((now - timestamp) / 1000 / 60)} minutes)`);
        return JSON.parse(cachedData);
      } else {
        // Silently clear expired cache - no logging to reduce noise
        await AsyncStorage.multiRemove([
          COMMENTS_CACHE_KEY_PREFIX + cacheKey,
          COMMENTS_CACHE_TIMESTAMP_KEY_PREFIX + cacheKey
        ]);
      }
    }
  } catch (error) {
    error('[CommentUtils] Error loading cached comments:', error);
  }
  return null;
};

/**
 * Save comments to persistent cache (AsyncStorage)
 */
const saveCachedComments = async (postId: string, userId: string | undefined, comments: Comment[]): Promise<void> => {
  try {
    const cacheKey = `${postId}_${userId || 'anonymous'}`;
    const now = Date.now();
    const commentsString = JSON.stringify(comments);
    
    // Check cache size (iOS has stricter AsyncStorage limits ~6MB)
    const cacheSizeKB = (commentsString.length * 2) / 1024;
    if (cacheSizeKB > 1000) { // 1MB warning for comments
      warn(`[CommentUtils] ⚠️ Large comment cache size: ${cacheSizeKB.toFixed(2)}KB for post ${postId}`);
    }
    
    await AsyncStorage.multiSet([
      [COMMENTS_CACHE_KEY_PREFIX + cacheKey, commentsString],
      [COMMENTS_CACHE_TIMESTAMP_KEY_PREFIX + cacheKey, now.toString()]
    ]);
    
    log(`[CommentUtils] ✅ Saved ${comments.length} comments to persistent cache for post ${postId} (${cacheSizeKB.toFixed(2)}KB)`);
  } catch (error: any) {
    error('[CommentUtils] Error saving cached comments:', error);
    
    // Handle iOS-specific storage quota errors
    if (error?.message?.includes('quota') || error?.message?.includes('storage') || error?.code === 'EUNSPECIFIED') {
      warn('[CommentUtils] Storage quota exceeded, skipping comment cache save...');
    }
  }
};

/**
 * Interface for comment object
 */
export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  user_email?: string; // User's email
  content: string;
  created_at: string;
  updated_at?: string;
  display_name?: string;
  username?: string;
  user_avatar?: string;
  profiles?: any;
  likes_count?: number;
  liked?: boolean;
  reply_to_id?: string;
  reply_to?: string; // Alias for reply_to_id
  reply_to_username?: string;
  currentReplyTo?: string; // Current reply target
  edited?: boolean; // Whether comment was edited
  newComment?: string; // New comment input value
  is_pinned?: boolean; // Whether comment is pinned by admin
}

export interface CommentLiker {
  user_id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string | null;
  is_verified?: boolean;
  reaction_emoji?: string;
}

/**
 * Like a comment
 */
export const likeComment = async (commentId: string, userId: string): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    log(`[CommentUtils] Liking comment ${commentId} by user ${userId}`);
    
    // Check if the user has already liked the comment
    const { data: existingLike, error: checkError } = await supabase
      .from('post_comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (checkError) {
      error('[CommentUtils] Error checking if comment is already liked:', checkError);
      return false;
    }
    
    // If already liked, do nothing (already successful)
    if (existingLike) {
      log('[CommentUtils] Comment already liked, no action needed');
      return true;
    }
    
    log('[CommentUtils] Adding like to database');
    
    // Start a transaction to ensure atomicity
    // First, get the current likes_count
    const { data: comment, error: getError } = await supabase
      .from('post_comments')
      .select('likes_count')
      .eq('id', commentId)
      .single();
    
    if (getError) {
      error('[CommentUtils] Error getting current likes_count:', getError);
      return false;
    }
    
    const currentLikesCount = comment?.likes_count || 0;
    log('[CommentUtils] Current likes_count:', currentLikesCount);
    
    // Add the like
    const { data, error } = await supabase
      .from('post_comment_likes')
      .insert({
        comment_id: commentId,
        user_id: userId
      })
      .select();
    
    if (error) {
      error('[CommentUtils] Error liking comment:', error);
      return false;
    }
    
    log('[CommentUtils] Like added successfully:', data);
    
    // Manually update the likes_count in case triggers don't work
    const { error: updateError } = await supabase
      .from('post_comments')
      .update({
        likes_count: currentLikesCount + 1
      })
      .eq('id', commentId);
    
    if (updateError) {
      error('[CommentUtils] Error updating likes_count:', updateError);
      // Not returning false here because the like was added successfully
    } else {
      log('[CommentUtils] Likes count updated manually');
    }
    
    // Verify the likes_count was updated in the post_comments table
    try {
      const { data: updatedComment, error: commentError } = await supabase
        .from('post_comments')
        .select('likes_count')
        .eq('id', commentId)
        .single();
      
      if (commentError) {
        error('[CommentUtils] Error fetching updated comment:', commentError);
      } else {
        log('[CommentUtils] Updated comment likes_count:', updatedComment.likes_count);
      }
    } catch (verifyError) {
      error('[CommentUtils] Error verifying likes_count update:', verifyError);
    }
    
    return true;
  } catch (error) {
    error('[CommentUtils] Exception in likeComment:', error);
    return false;
  }
};

/**
 * Unlike a comment
 */
export const unlikeComment = async (commentId: string, userId: string): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    log(`[CommentUtils] Unliking comment ${commentId} by user ${userId}`);
    
    // First, get the current likes_count
    const { data: comment, error: getError } = await supabase
      .from('post_comments')
      .select('likes_count')
      .eq('id', commentId)
      .single();
    
    if (getError) {
      error('[CommentUtils] Error getting current likes_count:', getError);
      return false;
    }
    
    const currentLikesCount = comment?.likes_count || 0;
    log('[CommentUtils] Current likes_count:', currentLikesCount);
    
    // Delete the like
    const { data, error } = await supabase
      .from('post_comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .select();
    
    if (error) {
      error('[CommentUtils] Error unliking comment:', error);
      return false;
    }
    
    log('[CommentUtils] Unlike successful:', data);
    
    // Only decrement if there was a like to delete and the current count is > 0
    if (data && (data?.length || 0) > 0 && currentLikesCount > 0) {
      // Manually update the likes_count in case triggers don't work
      const { error: updateError } = await supabase
        .from('post_comments')
        .update({
          likes_count: Math.max(0, currentLikesCount - 1)
        })
        .eq('id', commentId);
      
      if (updateError) {
        error('[CommentUtils] Error updating likes_count:', updateError);
        // Not returning false here because the unlike was successful
      } else {
        log('[CommentUtils] Likes count updated manually');
      }
    } else {
      log('[CommentUtils] No like found to delete or likes_count already 0');
    }
    
    // Verify the likes_count was updated in the post_comments table
    try {
      const { data: updatedComment, error: commentError } = await supabase
        .from('post_comments')
        .select('likes_count')
        .eq('id', commentId)
        .single();
      
      if (commentError) {
        error('[CommentUtils] Error fetching updated comment:', commentError);
      } else {
        log('[CommentUtils] Updated comment likes_count after unlike:', updatedComment.likes_count);
      }
    } catch (verifyError) {
      error('[CommentUtils] Error verifying likes_count update:', verifyError);
    }
    
    return true;
  } catch (error) {
    error('[CommentUtils] Exception in unlikeComment:', error);
    return false;
  }
};

/**
 * Toggle like status for a comment
 */
export const toggleCommentLike = async (commentId: string, userId: string): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    log(`[CommentUtils] Toggling like for comment ${commentId} by user ${userId}`);
    
    // Validate user authentication
    if (!userId || userId === '00000000-0000-0000-0000-000000000000' || userId.trim() === '') {
      error('[CommentUtils] Invalid or missing user ID - user not authenticated');
      throw new Error('Authentication required. Please sign in to like comments.');
    }
    
    // Verify current auth session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      error('[CommentUtils] Session error:', sessionError);
      throw new Error('Please sign in again');
    }
    
    if (!session) {
      error('[CommentUtils] No valid auth session');
      throw new Error('No active session. Please sign in to like comments.');
    }
    
    if (session.user.id !== userId) {
      error(`[CommentUtils] Auth mismatch: session=${session.user.id}, provided=${userId}`);
      throw new Error('Please sign in again to continue.');
    }
    
    log(`[CommentUtils] User authenticated: ${session.user.id}`);
    
    // Verify comment exists
    const { data: comment, error: commentError } = await supabase
      .from('post_comments')
      .select('id')
      .eq('id', commentId)
      .maybeSingle();
    
    if (commentError) {
      error('[CommentUtils] Error checking if comment exists:', commentError);
      throw new Error('Comment not found');
    }
    
    if (!comment) {
      error('[CommentUtils] Comment not found:', commentId);
      throw new Error('Comment not found');
    }
    
    log('[CommentUtils] Comment exists, proceeding with like toggle');
    
    // Check current like status
    const { data: existingLike, error: checkError } = await supabase
      .from('post_comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (checkError) {
      error('[CommentUtils] Error checking comment like status:', checkError);
      return false;
    }
    
    log('[CommentUtils] Current like status:', existingLike ? 'liked' : 'not liked');
    
    if (existingLike) {
      // Unlike if already liked
      log('[CommentUtils] Unliking comment');
      const { error: unlikeError } = await supabase
        .from('post_comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId);
      
      if (unlikeError) {
        error('[CommentUtils] Error unliking comment:', unlikeError);
        return false;
      }
      
      // Calculate accurate likes_count by counting remaining likes
      const { data: remainingLikes, error: countError } = await supabase
        .from('post_comment_likes')
        .select('id')
        .eq('comment_id', commentId);
        
      if (!countError) {
        const actualCount = remainingLikes?.length || 0;
        log(`[CommentUtils] After unlike: actual count is ${actualCount}`);
        
        // Update the likes_count with the accurate count
        const { error: updateError } = await supabase
          .from('post_comments')
          .update({ likes_count: actualCount })
          .eq('id', commentId);
          
        if (updateError) {
          error('[CommentUtils] Error updating likes_count:', updateError);
        } else {
          log(`[CommentUtils] Updated likes_count to ${actualCount}`);
        }
      }
      
      // Verify the like was removed
      const { data: verifyLike, error: verifyError } = await supabase
        .from('post_comment_likes')
        .select('id')
        .eq('comment_id', commentId)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (verifyError) {
        error('[CommentUtils] Error verifying unlike:', verifyError);
      } else {
        log('[CommentUtils] Unlike verification:', verifyLike ? 'failed - like still exists' : 'successful - like removed');
      }
      
      log('[CommentUtils] Comment unliked successfully');
      
      return true;
    } else {
      // Like if not already liked
      log('[CommentUtils] Liking comment');
      const { error: likeError } = await supabase
        .from('post_comment_likes')
        .insert({
          comment_id: commentId,
          user_id: userId
        });
      
      if (likeError) {
        error('[CommentUtils] Error liking comment:', likeError);
        
        // Check if it's a notification-related error that we can ignore
        const isNotificationError = (
          (likeError.message && (
            likeError.message.includes('notification_queue') || 
            likeError.message.includes('notification') ||
            likeError.message.includes('does not exist')
          )) ||
          likeError.code === '42703' || // Column does not exist
          likeError.code === '23502'    // Not null violation
        );
        
        if (isNotificationError) {
          warn('[CommentUtils] Notification creation failed but like operation may have succeeded');
          warn('[CommentUtils] Notification error details:', {
            message: likeError.message,
            code: likeError.code,
            details: likeError.details
          });
          
          // Verify if the like was actually inserted despite the notification error
          const { data: verifyLike, error: verifyError } = await supabase
            .from('post_comment_likes')
            .select('id')
            .eq('comment_id', commentId)
            .eq('user_id', userId)
            .maybeSingle();
          
          if (!verifyError && verifyLike) {
            log('[CommentUtils] Like was inserted successfully despite notification error');
            // Continue with the rest of the function even though notification failed
          } else {
            log('[CommentUtils] Attempting to insert like again...');
            
            // Try to insert the like directly without triggering notifications
            const { error: directInsertError } = await supabase
              .from('post_comment_likes')
              .insert({
                comment_id: commentId,
                user_id: userId
              });
            
            if (directInsertError && !directInsertError.message.includes('duplicate')) {
              error('[CommentUtils] Direct insert also failed:', directInsertError);
              return false;
            }
            
            log('[CommentUtils] Like inserted successfully on retry');
          }
        } else {
          error('[CommentUtils] Non-notification error:', likeError);
          return false;
        }
      }
      
      // Calculate accurate likes_count by counting actual likes
      const { data: allLikes, error: countError } = await supabase
        .from('post_comment_likes')
        .select('id')
        .eq('comment_id', commentId);
        
      if (!countError && allLikes) {
        const actualCount = allLikes.length;
        log(`[CommentUtils] After like: actual count is ${actualCount}`);
        
        // Update the likes_count with the accurate count
        const { error: updateError } = await supabase
          .from('post_comments')
          .update({ likes_count: actualCount })
          .eq('id', commentId);
          
        if (updateError) {
          error('[CommentUtils] Error updating likes_count:', updateError);
        } else {
          log(`[CommentUtils] Updated likes_count to ${actualCount}`);
        }
      }
      
      // Verify the like was added
      const { data: verifyLike, error: verifyError } = await supabase
        .from('post_comment_likes')
        .select('id')
        .eq('comment_id', commentId)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (verifyError) {
        error('[CommentUtils] Error verifying like:', verifyError);
      } else {
        log('[CommentUtils] Like verification:', verifyLike ? 'successful - like added' : 'failed - like not found');
      }
      
      log('[CommentUtils] Comment liked successfully');
      
      return true;
    }
  } catch (error: any) {
    error('[CommentUtils] Exception in toggleCommentLike:', error);
    error('[CommentUtils] Error details:', {
      commentId,
      userId,
      errorMessage: error?.message,
      errorCode: error?.code,
      errorDetails: error?.details
    });
    return false;
  }
};

/**
 * Fetch users who liked a specific comment
 */
export const fetchCommentLikers = async (commentId: string): Promise<CommentLiker[]> => {
  try {
    await ensureDbSetup();

    const { data: likes, error: likesError } = await supabase
      .from('post_comment_likes')
      .select('user_id, created_at')
      .eq('comment_id', commentId)
      .order('created_at', { ascending: false });

    if (likesError || !likes || likes.length === 0) return [];

    const userIds = [...new Set(likes.map((l: any) => l.user_id).filter(Boolean))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, is_verified')
      .in('id', userIds);

    const profileMap = (profiles || []).reduce((acc: Record<string, any>, p: any) => {
      acc[p.id] = p;
      return acc;
    }, {});

    return likes.map((like: any) => {
      const p = profileMap[like.user_id];
      return {
        user_id: like.user_id,
        username: p?.username,
        full_name: p?.full_name,
        avatar_url: p?.avatar_url,
        is_verified: !!p?.is_verified,
        // Current post comment reaction model is single-tap reaction.
        // Keep emoji explicit in UI so users can see "who reacted and with what".
        reaction_emoji: '😂',
      };
    });
  } catch (e) {
    error('[CommentUtils] Exception in fetchCommentLikers:', e);
    return [];
  }
};

/**
 * Check if a user has liked a comment
 */
export const hasUserLikedComment = async (commentId: string, userId: string): Promise<boolean> => {
  try {
    await ensureDbSetup();
    
    const { data, error } = await supabase
      .from('post_comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      error('Error checking if user liked comment:', error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    error('Exception in hasUserLikedComment:', error);
    return false;
  }
};

/**
 * Get like count for a comment
 */
export const getCommentLikeCount = async (commentId: string): Promise<number> => {
  try {
    await ensureDbSetup();
    
    const { count, error } = await supabase
      .from('post_comment_likes')
      .select('id', { count: 'exact', head: true })
      .eq('comment_id', commentId);
    
    if (error) {
      error('Error getting comment like count:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    error('Exception in getCommentLikeCount:', error);
    return 0;
  }
};

/**
 * Add a regular comment to a post
 */
export const addComment = async (
  postId: string,
  userId: string,
  content: string
): Promise<Comment | null> => {
  try {
    await ensureDbSetup();
    
    // Insert the new comment
    const { data: newComment, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        user_id: userId,
        content: content,
        reply_to_id: null // Regular comment, not a reply
      })
      .select('*')
      .single();
    
    if (error) {
      error('[CommentUtils] Error adding comment:', error);
      error('[CommentUtils] Full error details:', error);
      
      // Provide specific error messages for common issues
      if (error.code === '42501') {
        error('[CommentUtils] 🚨 RLS POLICY VIOLATION!');
        error('[CommentUtils] This means database permissions are blocking the comment.');
        error('[CommentUtils] Run this SQL in your Supabase dashboard:');
        error('[CommentUtils] See migrations/fix_comment_threading_rls.sql');
      }
      
      return null;
    }
    
    log('Comment added successfully:', newComment);
    return newComment;
  } catch (error) {
    error('Exception in addComment:', error);
    return null;
  }
};

/**
 * Add a reply to a comment
 */
export const replyToComment = async (
  postId: string, 
  userId: string, 
  content: string, 
  replyToCommentId: string,
  replyToUsername: string
): Promise<Comment | null> => {
  try {
    await ensureDbSetup();
    
    log(`[CommentUtils] Creating reply to comment ${replyToCommentId} by ${replyToUsername}`);
    log(`[CommentUtils] Reply content: "${content}"`);
    
    // Validate that the comment being replied to exists
    const { data: originalComment, error: checkError } = await supabase
      .from('post_comments')
      .select('id, user_id, content')
      .eq('id', replyToCommentId)
      .single();
    
    if (checkError || !originalComment) {
      error('[CommentUtils] Error finding original comment to reply to:', checkError);
      return null;
    }
    
    log(`[CommentUtils] Found original comment: "${originalComment.content?.substring(0, 30)}..."`);
    
    // Insert the reply
    const replyData = {
      post_id: postId,
      user_id: userId,
      content: content,
      reply_to_id: replyToCommentId,
      reply_to_username: replyToUsername
    };
    
    log('[CommentUtils] Inserting reply with data:', replyData);
    
    const { data: newComment, error } = await supabase
      .from('post_comments')
      .insert(replyData)
      .select('*')
      .single();
    
    if (error) {
      error('[CommentUtils] Error adding reply to comment:', error);
      error('[CommentUtils] Full error details:', error);
      
      // Provide specific error messages for common issues
      if (error.code === '42501') {
        error('[CommentUtils] 🚨 RLS POLICY VIOLATION!');
        error('[CommentUtils] This means database permissions are blocking the reply.');
        error('[CommentUtils] Run this SQL in your Supabase dashboard:');
        error('[CommentUtils] See migrations/fix_comment_threading_rls.sql');
      } else if (error.code === '23505') {
        error('[CommentUtils] Duplicate key error - reply may already exist');
      } else if (error.code === '23503') {
        error('[CommentUtils] Foreign key constraint error - parent comment may not exist');
      }
      
      return null;
    }
    
    log('[CommentUtils] Reply created successfully:', newComment);
    log(`[CommentUtils] Reply saved with reply_to_id: ${newComment.reply_to_id}`);
    
    return newComment;
  } catch (error) {
    error('Exception in replyToComment:', error);
    return null;
  }
};

/**
 * Fetch comments for a post with user like status
 */
export const fetchCommentsWithLikes = async (postId: string, userId?: string, useCache = true): Promise<Comment[]> => {
  try {
    // MEMORY LEAK FIX: Check if this is a placeholder post - return empty array without querying database
    if (postId.startsWith('placeholder-post-')) {
      if (__DEV__) {
        log(`[CommentUtils] Placeholder post detected, returning empty comments for ${postId}`);
      }
      return [];
    }

    // Validate UUID format before querying database
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(postId)) {
      if (__DEV__) {
        warn(`[CommentUtils] Invalid UUID format for postId: ${postId}, returning empty comments`);
      }
      return [];
    }

    const cacheKey = `${postId}_${userId || 'anonymous'}`;
    const now = Date.now();
    
    if (useCache) {
      // Check in-memory cache first (fastest)
      const cached = commentsCache.get(cacheKey);
      if (cached && (now - cached.timestamp < COMMENTS_CACHE_DURATION)) {
        // Only log in dev mode to reduce log spam
        if (__DEV__) {
        log(`[CommentUtils] Using in-memory cached comments for post ${postId} (${cached.comments.length} comments)`);
        }
        return cached.comments;
      }
      
      // Check persistent cache (AsyncStorage) - slower but survives app restarts
      const persistentCached = await loadCachedComments(postId, userId);
      if (persistentCached && persistentCached.length > 0) {
        // Only log in dev mode to reduce log spam
        if (__DEV__) {
        log(`[CommentUtils] Using persistent cached comments for post ${postId} (${persistentCached.length} comments)`);
        }
        // Update in-memory cache for faster access next time
        commentsCache.set(cacheKey, {
          comments: persistentCached,
          timestamp: now
        });
        return persistentCached;
      }
    }
    
    // Check if there's already an ongoing request for this post
    const requestKey = cacheKey;
    if (ongoingRequests.has(requestKey)) {
      if (__DEV__) {
        log(`[CommentUtils] Request already in progress for post ${postId}, reusing...`);
      }
      return ongoingRequests.get(requestKey)!;
    }
    
    // Create the request promise
    const requestPromise = (async () => {
      try {
    await ensureDbSetup();
    
        if (__DEV__) {
    log(`[CommentUtils] Fetching comments for post ${postId}, user: ${userId || 'anonymous'}`);
        }
    
    // Fetch comments for the post with explicit reply_to_id and likes_count
    const { data: comments, error } = await supabase
      .from('post_comments')
      .select(`
        id,
        post_id,
        user_id,
        content,
        created_at,
        updated_at,
        display_name,
        reply_to_id,
        reply_to_username,
        likes_count
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    
    if (error) {
          if (__DEV__) {
      error('[CommentUtils] Error fetching comments:', error);
          }
      return [];
    }
    
    if (!comments || (comments?.length || 0) === 0) {
          if (__DEV__) {
      log('[CommentUtils] No comments found for this post');
          }
      return [];
    }
    
        if (__DEV__) {
    log(`[CommentUtils] Found ${comments?.length || 0} comments`);
        }
    
    // Filter out comments from blocked users
    let blockedUserIds: string[] = [];
    if (userId) {
      try {
        blockedUserIds = await getBlockedUserIds(userId);
        if (blockedUserIds.length > 0) {
          const beforeCount = comments.length;
          const filteredComments = comments.filter(comment => !blockedUserIds.includes(comment.user_id));
          const filteredCount = beforeCount - filteredComments.length;
              if (filteredCount > 0 && __DEV__) {
            log(`[CommentUtils] Filtered out ${filteredCount} comments from blocked users`);
          }
          // Replace comments array with filtered version
          comments.splice(0, comments.length, ...filteredComments);
        }
      } catch (error) {
            if (__DEV__) {
        error('[CommentUtils] Error filtering blocked users from comments:', error);
            }
      }
    }
    
        // Debug: Log reply relationships (only in dev mode)
        if (__DEV__) {
    const repliesFound = comments?.filter(c => c.reply_to_id) || [];
          if (repliesFound.length > 0) {
            log(`[CommentUtils] Found ${repliesFound.length} replies`);
          }
        }
    
    // Get all comment IDs
    const commentIds = comments.map(comment => comment.id);
    
    // Get user profiles and likes data in parallel
    const userIds = [...new Set(comments.map(comment => comment.user_id))];
    
    const [profilesResult, userLikesResult, allLikesResult] = await Promise.all([
      // Get user profiles (include is_verified for verified badges)
      supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_verified')
        .in('id', userIds),
      
      // Get user's likes (only if user is logged in)
      userId ? supabase
        .from('post_comment_likes')
        .select('comment_id')
        .eq('user_id', userId)
        .in('comment_id', commentIds) : Promise.resolve({ data: [], error: null }),
      
      // Get all likes for count verification
      supabase
        .from('post_comment_likes')
        .select('comment_id')
        .in('comment_id', commentIds)
    ]);
    
        const profileMap = (profilesResult.data || []).reduce((map: any, profile: any) => {
      map[profile.id] = profile;
      return map;
    }, {});
    
    // Process user likes
    let userLikes = new Set<string>();
    if (userId && userLikesResult.data && (userLikesResult.data?.length || 0) > 0) {
          userLikes = new Set(userLikesResult.data.map((like: any) => like.comment_id));
          if (__DEV__) {
      log(`[CommentUtils] User has liked ${userLikes.size} comments`);
          }
    }
    
    // Count likes per comment
        const actualLikeCounts: Record<string, number> = {};
    if (!allLikesResult.error && allLikesResult.data) {
          allLikesResult.data.forEach((like: any) => {
        actualLikeCounts[like.comment_id] = (actualLikeCounts[like.comment_id] || 0) + 1;
      });
    }

    // Add username, avatar, and like status to each comment (without database updates)
        const enrichedComments = comments.map((comment: any) => {
      const userProfile = profileMap[comment.user_id];
      
      // Set username with fallbacks
      // Better fallback for username
      let username = comment.user_id ? `user_${comment.user_id.substring(0, 8)}` : 'Unknown User';
      if (comment.display_name) {
        username = comment.display_name;
      } else if (userProfile?.username) {
        username = userProfile.username;
      } else if (userProfile?.full_name) {
        username = userProfile.full_name;
      } else if (comment.user_email) {
        username = comment.user_email.split('@')[0];
      }
      
      const isLiked = userLikes.has(comment.id);
      const actualCount = actualLikeCounts[comment.id] || 0;
      
      return {
        ...comment,
        username,
        user_avatar: userProfile?.avatar_url,
        profiles: userProfile,
        liked: isLiked,
        likes_count: actualCount // Use the accurate count
      };
    });
    
    // Batch update incorrect likes counts after returning comments (non-blocking)
        const commentsToUpdate = comments.filter((comment: any) => {
      const storedCount = comment.likes_count || 0;
      const actualCount = actualLikeCounts[comment.id] || 0;
      return storedCount !== actualCount;
    });
    
    if (commentsToUpdate.length > 0) {
          if (__DEV__) {
      log(`[CommentUtils] Found ${commentsToUpdate.length} comments with incorrect likes_count, updating in background...`);
          }
      
      // Update in background without blocking the UI
          Promise.all(commentsToUpdate.map((comment: any) => {
        const actualCount = actualLikeCounts[comment.id] || 0;
        return supabase
          .from('post_comments')
          .update({ likes_count: actualCount })
          .eq('id', comment.id);
      })).catch(error => {
            if (__DEV__) {
        error('[CommentUtils] Error updating likes_count in background:', error);
            }
      });
    }
    
    // Cache the results (both in-memory and persistent)
    commentsCache.set(cacheKey, {
      comments: enrichedComments,
      timestamp: now
    });
    
    // Save to persistent cache in background (non-blocking)
    saveCachedComments(postId, userId, enrichedComments).catch(error => {
          if (__DEV__) {
      error('[CommentUtils] Error saving to persistent cache (non-fatal):', error);
          }
    });
    
    return enrichedComments;
  } catch (error) {
        if (__DEV__) {
    error('[CommentUtils] Exception in fetchCommentsWithLikes:', error);
        }
        return [];
      } finally {
        // Remove from ongoing requests when done
        ongoingRequests.delete(requestKey);
      }
    })();
    
    // Store the promise so other concurrent requests can reuse it
    ongoingRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  } catch (error) {
    if (__DEV__) {
      error('[CommentUtils] Exception in fetchCommentsWithLikes:', error);
    }
    return [];
  }
};

/**
 * Clear cached comments for a post (useful after adding/deleting comments)
 */
export const clearCommentsCache = async (postId: string, userId?: string): Promise<void> => {
  const cacheKey = `${postId}_${userId || 'anonymous'}`;
  
  // Clear in-memory cache
  commentsCache.delete(cacheKey);
  if (userId) {
    commentsCache.delete(`${postId}_anonymous`);
  }
  
  // Clear persistent cache
  try {
    await AsyncStorage.multiRemove([
      COMMENTS_CACHE_KEY_PREFIX + cacheKey,
      COMMENTS_CACHE_TIMESTAMP_KEY_PREFIX + cacheKey,
      COMMENTS_CACHE_KEY_PREFIX + `${postId}_anonymous`,
      COMMENTS_CACHE_TIMESTAMP_KEY_PREFIX + `${postId}_anonymous`
    ]);
    log(`[CommentUtils] Cleared cache (in-memory + persistent) for post ${postId}`);
  } catch (error) {
    error('[CommentUtils] Error clearing persistent cache:', error);
  }
};

/**
 * Get cached comments synchronously (for immediate display)
 * Returns cached comments if available, null otherwise
 */
export const getCachedComments = async (postId: string, userId?: string): Promise<Comment[] | null> => {
  try {
    // Check in-memory cache first
    const cacheKey = `${postId}_${userId || 'anonymous'}`;
    const cached = commentsCache.get(cacheKey);
    if (cached) {
      return cached.comments;
    }
    
    // Check persistent cache
    return await loadCachedComments(postId, userId);
  } catch (error) {
    error('[CommentUtils] Error getting cached comments:', error);
    return null;
  }
};

/**
 * Check if database triggers are working for likes_count
 */
export const checkTriggersWorking = async (): Promise<void> => {
  try {
    await ensureDbSetup();
    
    log('[CommentUtils] 🔍 Checking if database triggers are working...');
    
    // Check if triggers exist
    // Note: exec_sql doesn't exist - this check should be done via migrations or Edge Functions
    // Silently skip this check to avoid errors
    log('[CommentUtils] ⚠️ Trigger check skipped - use database migrations to verify triggers');
    return;
    
    /* DEPRECATED - Use migrations to check triggers
    const { data: triggers, error } = await supabase
      .rpc('exec_sql', { 
        sql_query: `
          SELECT trigger_name, event_manipulation, action_timing 
          FROM information_schema.triggers 
          WHERE event_object_table = 'post_comment_likes'
        `
      });
    
    if (error) {
      error('[CommentUtils] Error checking triggers:', error);
      return;
    }
    
    log('[CommentUtils] Database triggers found:', triggers);
    
    if (!triggers || triggers.length === 0) {
      error('[CommentUtils] ❌ NO TRIGGERS FOUND! This explains why likes_count is not updating.');
      log('[CommentUtils] 💡 Solution: Run the database migration to create triggers');
    } else {
      log('[CommentUtils] ✅ Triggers exist, checking if they work...');
    }
    */
    
  } catch (error) {
    error('[CommentUtils] Exception checking triggers:', error);
  }
};

/**
 * Verify and fix likes_count for all comments in a post
 */
export const verifyCommentLikeCounts = async (postId: string): Promise<void> => {
  try {
    await ensureDbSetup();
    
    log(`[CommentUtils] Verifying likes_count for post ${postId}`);
    
    // Get all comments for this post
    const { data: comments, error: commentsError } = await supabase
      .from('post_comments')
      .select('id, likes_count, content')
      .eq('post_id', postId);
    
    if (commentsError || !comments) {
      error('[CommentUtils] Error fetching comments for verification:', commentsError);
      return;
    }
    
    log(`[CommentUtils] Checking ${comments.length} comments for likes_count accuracy`);
    
    for (const comment of comments) {
      // Get actual like count from post_comment_likes table
      const { data: likes, error: likesError } = await supabase
        .from('post_comment_likes')
        .select('id')
        .eq('comment_id', comment.id);
      
      if (likesError) {
        error(`[CommentUtils] Error fetching likes for comment ${comment.id}:`, likesError);
        continue;
      }
      
      const actualCount = likes?.length || 0;
      const storedCount = comment.likes_count || 0;
      
      log(`[CommentUtils] Comment "${comment.content?.substring(0, 30)}..."`);
      log(`  - Stored likes_count: ${storedCount}`);
      log(`  - Actual likes in DB: ${actualCount}`);
      
      if (actualCount !== storedCount) {
        log(`[CommentUtils] 🚨 MISMATCH FOUND! Fixing...`);
        
        // Fix the mismatch
        const { error: updateError } = await supabase
          .from('post_comments')
          .update({ likes_count: actualCount })
          .eq('id', comment.id);
        
        if (updateError) {
          error(`[CommentUtils] Error fixing likes_count:`, updateError);
        } else {
          log(`[CommentUtils] ✅ Fixed likes_count: ${storedCount} → ${actualCount}`);
        }
      } else if (actualCount > 0) {
        log(`[CommentUtils] ✅ Correct: ${actualCount} likes`);
      }
    }
    
    log('[CommentUtils] Verification complete');
    
  } catch (error) {
    error('[CommentUtils] Exception in verifyCommentLikeCounts:', error);
  }
}; 