import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface StreamModerator {
  id: string;
  stream_id: string;
  moderator_id: string;
  added_by: string;
  added_at: string;
  profile?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
  };
}

export interface StreamWarning {
  id: string;
  stream_id: string;
  user_id: string;
  warned_by: string;
  reason?: string;
  created_at: string;
}

export interface StreamKick {
  id: string;
  stream_id: string;
  user_id: string;
  kicked_by: string;
  reason?: string;
  created_at: string;
}

/**
 * Check if a user is a moderator for a stream
 */
export const isModerator = async (streamId: string, userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('live_stream_moderators')
      .select('id')
      .eq('stream_id', streamId)
      .eq('moderator_id', userId)
      .maybeSingle();

    if (error) {
      error('[Moderation] Error checking moderator status:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    error('[Moderation] Exception checking moderator status:', error);
    return false;
  }
};

/**
 * Check if a user is the streamer
 */
export const isStreamer = async (streamId: string, userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('live_streams')
      .select('streamer_id')
      .eq('id', streamId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.streamer_id === userId;
  } catch (error) {
    error('[Moderation] Exception checking streamer status:', error);
    return false;
  }
};

/**
 * Check if a user can moderate (is streamer or moderator)
 */
export const canModerate = async (streamId: string, userId: string): Promise<boolean> => {
  const [isStreamerUser, isModeratorUser] = await Promise.all([
    isStreamer(streamId, userId),
    isModerator(streamId, userId),
  ]);

  return isStreamerUser || isModeratorUser;
};

/**
 * Add a moderator to a stream
 */
export const addModerator = async (
  streamId: string,
  moderatorUserId: string,
  addedByUserId: string
): Promise<boolean> => {
  try {
    // Verify the adder is the streamer
    const streamerCheck = await isStreamer(streamId, addedByUserId);
    if (!streamerCheck) {
      error('[Moderation] Only streamer can add moderators');
      return false;
    }

    // Don't allow adding the streamer as a moderator
    const isStreamerUser = await isStreamer(streamId, moderatorUserId);
    if (isStreamerUser) {
      error('[Moderation] Cannot add streamer as moderator');
      return false;
    }

    const { error } = await supabase
      .from('live_stream_moderators')
      .insert({
        stream_id: streamId,
        moderator_id: moderatorUserId,
        added_by: addedByUserId,
      });

    if (error) {
      error('[Moderation] Error adding moderator:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('[Moderation] Exception adding moderator:', error);
    return false;
  }
};

/**
 * Remove a moderator from a stream
 */
export const removeModerator = async (
  streamId: string,
  moderatorUserId: string,
  removedByUserId: string
): Promise<boolean> => {
  try {
    // Verify the remover is the streamer
    const streamerCheck = await isStreamer(streamId, removedByUserId);
    if (!streamerCheck) {
      error('[Moderation] Only streamer can remove moderators');
      return false;
    }

    const { error } = await supabase
      .from('live_stream_moderators')
      .delete()
      .eq('stream_id', streamId)
      .eq('moderator_id', moderatorUserId);

    if (error) {
      error('[Moderation] Error removing moderator:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('[Moderation] Exception removing moderator:', error);
    return false;
  }
};

/**
 * Get all moderators for a stream
 */
export const getModerators = async (streamId: string): Promise<StreamModerator[]> => {
  try {
    // First, fetch the moderators
    const { data: moderatorsData, error: moderatorsError } = await supabase
      .from('live_stream_moderators')
      .select('*')
      .eq('stream_id', streamId);

    if (moderatorsError) {
      error('[Moderation] Error fetching moderators:', moderatorsError);
      return [];
    }

    if (!moderatorsData || moderatorsData.length === 0) {
      return [];
    }

    // Then, fetch the profiles for those moderators
    const moderatorIds = moderatorsData.map(m => m.moderator_id);
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', moderatorIds);

    if (profilesError) {
      error('[Moderation] Error fetching moderator profiles:', profilesError);
      // Return moderators without profiles if profile fetch fails
      return moderatorsData.map((mod: any) => ({
        id: mod.id,
        stream_id: mod.stream_id,
        moderator_id: mod.moderator_id,
        added_by: mod.added_by,
        added_at: mod.added_at,
        profile: null,
      }));
    }

    // Combine the data
    return moderatorsData.map((mod: any) => {
      const profile = profilesData?.find(p => p.id === mod.moderator_id);
      return {
        id: mod.id,
        stream_id: mod.stream_id,
        moderator_id: mod.moderator_id,
        added_by: mod.added_by,
        added_at: mod.added_at,
        profile: profile || null,
      };
    });
  } catch (error) {
    error('[Moderation] Exception fetching moderators:', error);
    return [];
  }
};

/**
 * Warn a user in a stream
 */
export const warnUser = async (
  streamId: string,
  userId: string,
  warnedByUserId: string,
  reason?: string
): Promise<boolean> => {
  try {
    // Verify the warner can moderate
    const canModerateCheck = await canModerate(streamId, warnedByUserId);
    if (!canModerateCheck) {
      error('[Moderation] User cannot moderate this stream:', {
        streamId,
        warnedByUserId,
        message: 'User is not a streamer or moderator for this stream',
      });
      return false;
    }
    
    log('[Moderation] ✅ Permission check passed for warning:', { streamId, warnedByUserId });

    // Don't allow warning the streamer
    const isStreamerUser = await isStreamer(streamId, userId);
    if (isStreamerUser) {
      error('[Moderation] Cannot warn streamer');
      return false;
    }

    const { error } = await supabase
      .from('live_stream_warnings')
      .insert({
        stream_id: streamId,
        user_id: userId,
        warned_by: warnedByUserId,
        reason: reason || undefined,
      });

    if (error) {
      error('[Moderation] Error warning user:', {
        error,
        streamId,
        userId,
        warnedByUserId,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
      });
      
      // Check if table doesn't exist
      if (error.code === 'PGRST204' || error.message?.includes('does not exist')) {
        error('[Moderation] ⚠️ live_stream_warnings table may not exist. Please run the migration: 20251230000001_create_livestream_moderation_tables.sql');
      }
      
      return false;
    }

    log('[Moderation] ✅ User warned successfully:', { streamId, userId, warnedByUserId });
    return true;
  } catch (error) {
    error('[Moderation] Exception warning user:', error);
    return false;
  }
};

/**
 * Kick a user from a stream
 */
export const kickUser = async (
  streamId: string,
  userId: string,
  kickedByUserId: string,
  reason?: string
): Promise<boolean> => {
  try {
    // Verify the kicker can moderate
    const canModerateCheck = await canModerate(streamId, kickedByUserId);
    if (!canModerateCheck) {
      error('[Moderation] User cannot moderate this stream:', {
        streamId,
        kickedByUserId,
        message: 'User is not a streamer or moderator for this stream',
      });
      return false;
    }
    
    log('[Moderation] ✅ Permission check passed for kick:', { streamId, kickedByUserId });

    // Don't allow kicking the streamer
    const isStreamerUser = await isStreamer(streamId, userId);
    if (isStreamerUser) {
      error('[Moderation] Cannot kick streamer');
      return false;
    }

    // Add kick record
    const { error: kickError } = await supabase
      .from('live_stream_kicks')
      .upsert({
        stream_id: streamId,
        user_id: userId,
        kicked_by: kickedByUserId,
        reason: reason || undefined,
      }, {
        onConflict: 'stream_id,user_id'
      });

    if (kickError) {
      error('[Moderation] Error kicking user:', {
        error: kickError,
        streamId,
        userId,
        kickedByUserId,
        errorCode: kickError.code,
        errorMessage: kickError.message,
        errorDetails: kickError.details,
        errorHint: kickError.hint,
      });
      
      // Check if table doesn't exist
      if (kickError.code === 'PGRST204' || kickError.message?.includes('does not exist')) {
        error('[Moderation] ⚠️ live_stream_kicks table may not exist. Please run the migration: 20251230000001_create_livestream_moderation_tables.sql');
      }
      
      return false;
    }
    
    log('[Moderation] ✅ Kick record created:', { streamId, userId, kickedByUserId });

    // Remove user from viewers
    const { error: viewerError } = await supabase
      .from('live_stream_viewers')
      .update({
        is_active: false,
        left_at: new Date().toISOString(),
      })
      .eq('stream_id', streamId)
      .eq('user_id', userId);

    if (viewerError) {
      error('[Moderation] Error removing viewer:', viewerError);
      // Continue anyway - kick record was created
    }

    // Remove user from guests if they're a guest
    const { error: guestError } = await supabase
      .from('live_stream_guests')
      .update({
        is_active: false,
        left_at: new Date().toISOString(),
      })
      .eq('stream_id', streamId)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (guestError) {
      error('[Moderation] Error removing guest:', guestError);
      // Continue anyway - kick record was created
    }

    return true;
  } catch (error) {
    error('[Moderation] Exception kicking user:', error);
    return false;
  }
};

/**
 * Check if a user has been kicked from a stream
 */
export const isKicked = async (streamId: string, userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('live_stream_kicks')
      .select('id')
      .eq('stream_id', streamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      error('[Moderation] Error checking kick status:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    error('[Moderation] Exception checking kick status:', error);
    return false;
  }
};

/**
 * Get warnings for a user in a stream
 */
export const getUserWarnings = async (streamId: string, userId: string): Promise<StreamWarning[]> => {
  try {
    const { data, error } = await supabase
      .from('live_stream_warnings')
      .select('*')
      .eq('stream_id', streamId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      error('[Moderation] Error fetching warnings:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('[Moderation] Exception fetching warnings:', error);
    return [];
  }
};

/**
 * Pin a comment in a stream (streamer only)
 * Only one comment can be pinned at a time - unpins any existing pinned comment
 */
export const pinComment = async (
  streamId: string,
  commentId: string,
  pinnedByUserId: string
): Promise<boolean> => {
  try {
    // Verify the user is the streamer
    const streamerCheck = await isStreamer(streamId, pinnedByUserId);
    if (!streamerCheck) {
      error('[Moderation] Only streamer can pin comments');
      return false;
    }

    // First, unpin any existing pinned comment for this stream
    const { error: unpinError } = await supabase
      .from('live_stream_comments')
      .update({
        is_pinned: false,
        pinned_at: null,
        pinned_by: null,
      })
      .eq('stream_id', streamId)
      .eq('is_pinned', true);

    if (unpinError) {
      error('[Moderation] Error unpinning existing comment:', unpinError);
      // Continue anyway - might be no existing pinned comment
    }

    // Pin the new comment
    const { error: pinError } = await supabase
      .from('live_stream_comments')
      .update({
        is_pinned: true,
        pinned_at: new Date().toISOString(),
        pinned_by: pinnedByUserId,
      })
      .eq('id', commentId)
      .eq('stream_id', streamId);

    if (pinError) {
      error('[Moderation] Error pinning comment:', pinError);
      return false;
    }

    log('[Moderation] ✅ Comment pinned successfully:', { streamId, commentId, pinnedByUserId });
    return true;
  } catch (error) {
    error('[Moderation] Exception pinning comment:', error);
    return false;
  }
};

/**
 * Unpin a comment in a stream (streamer only)
 */
export const unpinComment = async (
  streamId: string,
  commentId: string,
  unpinnedByUserId: string
): Promise<boolean> => {
  try {
    // Verify the user is the streamer
    const streamerCheck = await isStreamer(streamId, unpinnedByUserId);
    if (!streamerCheck) {
      error('[Moderation] Only streamer can unpin comments');
      return false;
    }

    const { error } = await supabase
      .from('live_stream_comments')
      .update({
        is_pinned: false,
        pinned_at: null,
        pinned_by: null,
      })
      .eq('id', commentId)
      .eq('stream_id', streamId);

    if (error) {
      error('[Moderation] Error unpinning comment:', error);
      return false;
    }

    log('[Moderation] ✅ Comment unpinned successfully:', { streamId, commentId, unpinnedByUserId });
    return true;
  } catch (error) {
    error('[Moderation] Exception unpinning comment:', error);
    return false;
  }
};

