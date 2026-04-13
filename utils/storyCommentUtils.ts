import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface StoryComment {
  id: string;
  story_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  // User data
  username?: string;
  display_name?: string;
  user_avatar?: string;
  profiles?: any;
  likes_count?: number;
  liked?: boolean;
}

/**
 * Fetch comments for a story
 * Only returns comments that the current user is allowed to see:
 * - Story owner can see all comments
 * - Commenter can see their own comments
 */
export const fetchStoryComments = async (
  storyId: string,
  currentUserId: string,
  storyOwnerId: string
): Promise<StoryComment[]> => {
  try {
    // First, fetch the story to get the owner ID
    const { data: storyData } = await supabase
      .from('stories')
      .select('user_id')
      .eq('id', storyId)
      .single();

    const storyOwner = storyData?.user_id || storyOwnerId;
    const isStoryOwner = currentUserId === storyOwner;

    if (__DEV__) {
      log('[StoryCommentUtils] Fetching comments:', {
        storyId,
        currentUserId,
        storyOwnerId,
        fetchedStoryOwner: storyData?.user_id,
        finalStoryOwner: storyOwner,
        isStoryOwner,
      });
    }

    // Fetch comments - filter based on privacy rules
    let commentsQuery = supabase
      .from('story_comments')
      .select('*')
      .eq('story_id', storyId);

    // If not the story owner, only show comments from the current user
    if (!isStoryOwner) {
      commentsQuery = commentsQuery.eq('user_id', currentUserId);
      if (__DEV__) {
        log('[StoryCommentUtils] Not story owner - filtering to own comments only');
      }
    } else {
      if (__DEV__) {
        log('[StoryCommentUtils] Story owner - showing all comments');
      }
    }

    const { data: commentsData, error: commentsError } = await commentsQuery
      .order('created_at', { ascending: true });

    if (commentsError) {
      error('[StoryCommentUtils] Error fetching comments:', commentsError);
      return [];
    }

    if (!commentsData || commentsData.length === 0) {
      return [];
    }

    // Get unique user IDs
    const userIds = [...new Set(commentsData.map(c => c.user_id))];

    // Fetch profiles separately
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', userIds);

    // Create a map of user profiles
    const profilesMap = new Map();
    if (profilesData) {
      profilesData.forEach(profile => {
        profilesMap.set(profile.id, profile);
      });
    }

    // Format comments with user data
    const formattedComments: StoryComment[] = commentsData.map((comment: any) => {
      const profile = profilesMap.get(comment.user_id);
      
      return {
        id: comment.id,
        story_id: comment.story_id,
        user_id: comment.user_id,
        content: comment.content,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        username: profile?.username,
        display_name: profile?.full_name,
        user_avatar: profile?.avatar_url,
        likes_count: 0, // TODO: Add likes support if needed
        liked: false,
      };
    });

    return formattedComments;
  } catch (error) {
    error('[StoryCommentUtils] Exception fetching comments:', error);
    return [];
  }
};

/**
 * Add a comment to a story
 */
export const addStoryComment = async (
  storyId: string,
  userId: string,
  content: string
): Promise<StoryComment | null> => {
  try {
    if (!content || !content.trim()) {
      error('[StoryCommentUtils] Empty comment content');
      return null;
    }

    // Insert comment
    const { data: commentData, error: insertError } = await supabase
      .from('story_comments')
      .insert({
        story_id: storyId,
        user_id: userId,
        content: content.trim(),
      })
      .select('*')
      .single();

    if (insertError) {
      error('[StoryCommentUtils] Error adding comment:', insertError);
      return null;
    }

    // Fetch user profile separately
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .eq('id', userId)
      .single();

    return {
      id: commentData.id,
      story_id: commentData.story_id,
      user_id: commentData.user_id,
      content: commentData.content,
      created_at: commentData.created_at,
      updated_at: commentData.updated_at,
      username: profileData?.username,
      display_name: profileData?.full_name,
      user_avatar: profileData?.avatar_url,
      likes_count: 0,
      liked: false,
    };
  } catch (error) {
    error('[StoryCommentUtils] Exception adding comment:', error);
    return null;
  }
};

/**
 * Delete a story comment
 */
export const deleteStoryComment = async (commentId: string, userId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('story_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId); // Only allow users to delete their own comments

    if (error) {
      error('[StoryCommentUtils] Error deleting comment:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('[StoryCommentUtils] Exception deleting comment:', error);
    return false;
  }
};

/**
 * Subscribe to real-time story comment updates
 * Only notifies about comments that the current user is allowed to see
 */
export const subscribeToStoryComments = (
  storyId: string,
  currentUserId: string,
  storyOwnerId: string,
  onCommentAdded: (comment: StoryComment) => void,
  onCommentDeleted: (commentId: string) => void
) => {
  const channel = supabase
    .channel(`story_comments_${storyId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'story_comments',
        filter: `story_id=eq.${storyId}`,
      },
      async (payload) => {
        // Fetch the story to get the actual owner ID
        const { data: storyData } = await supabase
          .from('stories')
          .select('user_id')
          .eq('id', storyId)
          .single();

        const actualStoryOwner = storyData?.user_id || storyOwnerId;
        const commentUserId = payload.new.user_id;
        const isStoryOwner = currentUserId === actualStoryOwner;
        const isCommenter = commentUserId === currentUserId;

        if (__DEV__) {
          log('[StoryCommentUtils] Real-time comment received:', {
            storyId,
            currentUserId,
            storyOwnerId,
            actualStoryOwner,
            commentUserId,
            isStoryOwner,
            isCommenter,
          });
        }

        // Only show comment if user is story owner or the commenter
        if (!isStoryOwner && !isCommenter) {
          if (__DEV__) {
            log('[StoryCommentUtils] Filtering out comment - user not owner or commenter');
          }
          return; // Don't show this comment to this user
        }

        // Fetch the full comment
        const { data: commentData } = await supabase
          .from('story_comments')
          .select('*')
          .eq('id', payload.new.id)
          .single();

        if (commentData) {
          // Fetch user profile separately
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', commentData.user_id)
            .single();

          const comment: StoryComment = {
            id: commentData.id,
            story_id: commentData.story_id,
            user_id: commentData.user_id,
            content: commentData.content,
            created_at: commentData.created_at,
            updated_at: commentData.updated_at,
            username: profileData?.username,
            display_name: profileData?.full_name,
            user_avatar: profileData?.avatar_url,
            likes_count: 0,
            liked: false,
          };
          onCommentAdded(comment);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'story_comments',
        filter: `story_id=eq.${storyId}`,
      },
      (payload) => {
        onCommentDeleted(payload.old.id);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
