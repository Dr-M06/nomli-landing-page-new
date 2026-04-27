import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface LiveStreamGuest {
  id: string;
  stream_id: string;
  user_id: string;
  joined_at: string;
  left_at?: string;
  is_active: boolean;
  audio_enabled: boolean;
  video_enabled: boolean;
  agora_uid?: number;
  profile?: {
    username: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface LiveStreamInvitation {
  id: string;
  stream_id: string;
  host_id: string;
  invited_user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
  responded_at?: string;
  expires_at: string;
  host_profile?: {
    username: string;
    full_name?: string;
    avatar_url?: string;
  };
  stream?: {
    title: string;
  };
}

export interface LiveStreamJoinRequest {
  id: string;
  stream_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  responded_at?: string;
  user_profile?: {
    username: string;
    full_name?: string;
    avatar_url?: string;
  };
}

/**
 * ============================================================================
 * NEW CLEAN DESIGN - Guest Request & Invitation Flow
 * ============================================================================
 * 
 * Principles:
 * 1. Bootstrap API is the single source of truth for UID assignment
 * 2. Guest records created WITHOUT UID initially
 * 3. UID assigned dynamically when guest joins via bootstrap API
 * 4. Clean separation: Request/Invitation logic separate from Agora joining
 * 5. Idempotent operations - safe to retry
 */

/**
 * Send a join request to become a guest
 * Creates a pending request that the host can accept/decline
 */
export const sendJoinRequest = async (
  streamId: string
): Promise<{ success: boolean; error?: string; request?: LiveStreamJoinRequest }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if stream allows guests
    const { data: stream, error: streamError } = await supabase
      .from('live_streams')
      .select('allow_guests, is_live')
      .eq('id', streamId)
      .single();

    if (streamError) {
      error('[GuestService] Error fetching stream:', streamError);
      return { success: false, error: 'Stream not found' };
    }

    if (stream.allow_guests === false) {
      return { success: false, error: 'This stream does not allow guests. It is a single-person stream only.' };
    }

    if (!stream.is_live) {
      return { success: false, error: 'Stream is not currently live' };
    }

    // Check if user is already a guest
    const { data: existingGuest } = await supabase
      .from('live_stream_guests')
      .select('id')
      .eq('stream_id', streamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (existingGuest) {
      return { success: false, error: 'You are already a guest' };
    }

    // Check if user already has a pending request
    // Also check for accepted requests that might still be in the system
    const { data: existingRequest } = await supabase
      .from('live_stream_join_requests')
      .select('*')
      .eq('stream_id', streamId)
      .eq('user_id', user.id)
      .in('status', ['pending', 'accepted'])
      .maybeSingle();

    if (existingRequest) {
      // If request is accepted but user is not an active guest, allow new request
      // This handles the case where user left as guest but request status wasn't cleaned up
      if (existingRequest.status === 'accepted') {
        // Double-check that user is not actually an active guest
        const { data: activeGuest } = await supabase
          .from('live_stream_guests')
          .select('id')
          .eq('stream_id', streamId)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
        
        if (!activeGuest) {
          // User is not an active guest, so allow new request
          // Clean up the old accepted request first
          await supabase
            .from('live_stream_join_requests')
            .update({ status: 'declined' })
            .eq('id', existingRequest.id);
        } else {
          return { success: false, error: 'You are already a guest' };
        }
      } else {
        // Request is pending
        return { success: false, error: 'Request already sent' };
      }
    }

    // For open channels: Check if there's already an active guest BEFORE creating request
    // This prevents showing requests that will be auto-approved immediately
    let shouldAutoApprove = false;
    if (stream.allow_guests === true) {
      // Check if there's already an active guest (open channels: max 1 guest at a time)
      const { data: activeGuests, error: guestsCheckError } = await supabase
        .from('live_stream_guests')
        .select('id')
        .eq('stream_id', streamId)
        .eq('is_active', true)
        .limit(1);

      if (!guestsCheckError && (!activeGuests || activeGuests.length === 0)) {
        // No active guest - can auto-approve
        shouldAutoApprove = true;
      }
    }

    // Create join request with appropriate status
    // If auto-approving, create as 'accepted' to avoid showing in pending requests
    const { data: requestData, error: requestError } = await supabase
      .from('live_stream_join_requests')
      .insert({
        stream_id: streamId,
        user_id: user.id,
        status: shouldAutoApprove ? 'accepted' : 'pending',
        responded_at: shouldAutoApprove ? new Date().toISOString() : null,
      })
      .select('*')
      .single();

    if (requestError) {
      error('[GuestService] Error sending join request:', requestError);
      return { success: false, error: requestError.message };
    }

    // AUTO-APPROVAL: If stream allows guests and no active guest, automatically create guest record
    // This makes joining instant and keeps the channel open for easy access
    if (shouldAutoApprove && requestData) {

      log('[GuestService] Auto-approving join request for open guest stream (no active guests)');
      
      // Request is already created with 'accepted' status, no need to update

      // Create guest record immediately (UID will be assigned by bootstrap API when guest joins)
      // Cohosts join unmuted by default
      const { error: guestError } = await supabase
        .from('live_stream_guests')
        .insert({
          stream_id: streamId,
          user_id: user.id,
          is_active: true,
          audio_enabled: true, // Cohosts join unmuted
          video_enabled: true, // Video enabled by default
          joined_at: new Date().toISOString(),
          // agora_uid is NULL - will be assigned by bootstrap API when guest joins
        });

      if (guestError) {
        // Handle unique_active_guest correctly:
        // If *this* user is already the active guest -> treat as success (idempotent).
        // If *someone else* is the active guest -> return a clear error.
        if (guestError.code === '23505') {
          const { data: activeGuest } = await supabase
            .from('live_stream_guests')
            .select('user_id')
            .eq('stream_id', streamId)
            .eq('is_active', true)
            .maybeSingle();

          if (activeGuest?.user_id === user.id) {
            log('[GuestService] Guest already active for this user, treating as success');
            return { success: true, request: requestData, autoApproved: true };
          }

          return { success: false, error: 'This stream already has an active co-host. Please wait for them to leave.' };
        }

        error('[GuestService] Error creating guest record:', guestError);
        return { success: false, error: guestError.message };
      }

      log('[GuestService] ✅ Join request auto-approved and guest record created');
      return { success: true, request: requestData, autoApproved: true };
    }

    return { success: true, request: requestData };
  } catch (error: any) {
    error('[GuestService] Exception sending join request:', error);
    return { success: false, error: 'Failed to send join request' };
  }
};

/**
 * Accept a join request
 * Creates a guest record WITHOUT UID - UID will be assigned by bootstrap API when guest joins
 */
export const acceptJoinRequest = async (
  requestId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Get request details
    const { data: request, error: fetchError } = await supabase
      .from('live_stream_join_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) {
      return { success: false, error: 'Request not found' };
    }

    // Update request status
    const { error: updateError } = await supabase
      .from('live_stream_join_requests')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Create guest record WITHOUT UID - bootstrap API will assign it
    const { error: guestError } = await supabase
      .from('live_stream_guests')
      .insert({
        stream_id: request.stream_id,
        user_id: request.user_id,
        is_active: true,
        audio_enabled: true,
        video_enabled: true,
        joined_at: new Date().toISOString(),
        // agora_uid is NULL - will be assigned by bootstrap API
      });

    if (guestError) {
      if (guestError.code === '23505') {
        const { data: activeGuest } = await supabase
          .from('live_stream_guests')
          .select('user_id')
          .eq('stream_id', request.stream_id)
          .eq('is_active', true)
          .maybeSingle();

        // If the same user is already active, treat as idempotent success
        if (activeGuest?.user_id === request.user_id) {
          log('[GuestService] Guest already active for this user, treating as success');
          return { success: true };
        }

        return { success: false, error: 'This stream already has an active co-host. Remove them first.' };
      }

      return { success: false, error: guestError.message };
    }

    return { success: true };
  } catch (error: any) {
    error('[GuestService] Exception accepting join request:', error);
    return { success: false, error: 'Failed to accept join request' };
  }
};

/**
 * Decline a join request
 */
export const declineJoinRequest = async (
  requestId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('live_stream_join_requests')
      .update({
        status: 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to decline join request' };
  }
};

/**
 * Send an invitation to a user to join as a guest
 * Creates a pending invitation that the user can accept/decline
 */
export const sendGuestInvitation = async (
  streamId: string,
  invitedUserId: string
): Promise<{ success: boolean; error?: string; invitation?: LiveStreamInvitation }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if user is already a guest
    const { data: existingGuest } = await supabase
      .from('live_stream_guests')
      .select('id')
      .eq('stream_id', streamId)
      .eq('user_id', invitedUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (existingGuest) {
      return { success: false, error: 'User is already a guest' };
    }

    // Check if invitation already exists
    const { data: existingInvitation } = await supabase
      .from('live_stream_invitations')
      .select('*')
      .eq('stream_id', streamId)
      .eq('invited_user_id', invitedUserId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInvitation) {
      return { success: false, error: 'Invitation already sent' };
    }

    // Create invitation
    const { data, error } = await supabase
      .from('live_stream_invitations')
      .insert({
        stream_id: streamId,
        host_id: user.id,
        invited_user_id: invitedUserId,
        status: 'pending',
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      })
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Push notification removed - invitations are shown via real-time subscription

    return { success: true, invitation: data };
  } catch (error: any) {
    return { success: false, error: 'Failed to send invitation' };
  }
};

/**
 * Accept a guest invitation
 * Creates a guest record WITHOUT UID - UID will be assigned by bootstrap API when guest joins
 */
export const acceptGuestInvitation = async (
  invitationId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get invitation details
    const { data: invitation, error: fetchError } = await supabase
      .from('live_stream_invitations')
      .select('*')
      .eq('id', invitationId)
      .single();

    if (fetchError || !invitation) {
      return { success: false, error: 'Invitation not found' };
    }

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      return { success: false, error: 'Invitation has expired' };
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('live_stream_invitations')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('id', invitationId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Create guest record WITHOUT UID - bootstrap API will assign it
    // Cohosts join unmuted by default
    const { error: guestError } = await supabase
      .from('live_stream_guests')
      .insert({
        stream_id: invitation.stream_id,
        user_id: user.id,
        is_active: true,
        audio_enabled: true, // Cohosts join unmuted
        video_enabled: true,
        joined_at: new Date().toISOString(),
        // agora_uid is NULL - will be assigned by bootstrap API
      });

    if (guestError) {
      if (guestError.code === '23505') {
        const { data: activeGuest } = await supabase
          .from('live_stream_guests')
          .select('user_id')
          .eq('stream_id', invitation.stream_id)
          .eq('is_active', true)
          .maybeSingle();

        if (activeGuest?.user_id === user.id) {
          log('[GuestService] Guest already active for this user, treating as success');
          return { success: true };
        }

        return { success: false, error: 'This stream already has an active co-host. Please wait for them to leave.' };
      }

      return { success: false, error: guestError.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to accept invitation' };
  }
};

/**
 * Decline a guest invitation
 */
export const declineGuestInvitation = async (
  invitationId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('live_stream_invitations')
      .update({
        status: 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', invitationId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to decline invitation' };
  }
};

/**
 * Remove a guest from the livestream
 */
export const removeGuestFromStream = async (
  streamId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // IMPORTANT:
    // Some DBs enforce a unique constraint across (stream_id, user_id, is_active).
    // If an inactive row already exists for this user+stream, updating active -> inactive
    // can throw 23505. Deleting the active row avoids that collision and still removes
    // the co-host immediately (which is what the UI needs).
    const { error } = await supabase
      .from('live_stream_guests')
      .delete()
      .eq('stream_id', streamId)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      return { success: false, error: error.message };
    }

    // Clean up any pending join requests
    await supabase
      .from('live_stream_join_requests')
      .update({
        status: 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('stream_id', streamId)
      .eq('user_id', userId)
      .eq('status', 'pending');

    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to remove guest' };
  }
};

/**
 * Deactivate all active guests for a stream
 * This is used when ending a stream to prevent unique_active_guest constraint violations
 */
export const deactivateAllGuestsForStream = async (
  streamId: string
): Promise<{ success: boolean; error?: string; deactivatedCount?: number }> => {
  try {
    // First, get all active guests to count them
    const { data: activeGuests, error: fetchError } = await supabase
      .from('live_stream_guests')
      .select('id, user_id')
      .eq('stream_id', streamId)
      .eq('is_active', true);

    if (fetchError) {
      error('[guestService] Error fetching active guests:', fetchError);
      return { success: false, error: fetchError.message };
    }

    const guestCount = activeGuests?.length || 0;
    
    if (guestCount === 0) {
      // No active guests to deactivate
      return { success: true, deactivatedCount: 0 };
    }

    // IMPORTANT:
    // On some deployments, updating is_active true -> false can violate a unique constraint
    // if an (stream_id, user_id, false) row already exists. Deleting active rows avoids that.
    const { error: deleteError } = await supabase
      .from('live_stream_guests')
      .delete()
      .eq('stream_id', streamId)
      .eq('is_active', true);

    if (deleteError) {
      error('[guestService] Error deactivating guests:', deleteError);
      return { success: false, error: deleteError.message };
    }

    log(`✅ [guestService] Removed ${guestCount} active guest(s) for stream ${streamId}`);
    return { success: true, deactivatedCount: guestCount };
  } catch (error: any) {
    error('[guestService] Exception deactivating guests:', error);
    return { success: false, error: error.message || 'Failed to deactivate guests' };
  }
};

/**
 * Get active guests for a stream
 */
export const getActiveGuests = async (
  streamId: string
): Promise<{ success: boolean; error?: string; guests?: LiveStreamGuest[] }> => {
  try {
    const { data, error } = await supabase
      .from('live_stream_guests')
      .select(`
        *,
        profiles!live_stream_guests_user_id_fkey (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('stream_id', streamId)
      .eq('is_active', true)
      .order('joined_at', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    // Map profiles to profile field
    const guests = data?.map(guest => ({
      ...guest,
      profile: guest.profiles,
    })) || [];

    return { success: true, guests };
  } catch (error: any) {
    return { success: false, error: 'Failed to fetch guests' };
  }
};

/**
 * Get pending join requests for a stream
 */
export const getPendingJoinRequests = async (
  streamId: string
): Promise<{ success: boolean; error?: string; requests?: LiveStreamJoinRequest[] }> => {
  try {
    const { data, error } = await supabase
      .from('live_stream_join_requests')
      .select(`
        *,
        profiles!live_stream_join_requests_user_id_fkey (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('stream_id', streamId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    // Map profiles to user_profile field
    const requests = data?.map(request => ({
      ...request,
      user_profile: request.profiles,
    })) || [];

    return { success: true, requests };
  } catch (error: any) {
    return { success: false, error: 'Failed to fetch join requests' };
  }
};

/**
 * Get pending invitations for the current user
 */
export const getMyPendingInvitations = async (): Promise<{
  success: boolean;
  error?: string;
  invitations?: LiveStreamInvitation[];
}> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const now = new Date().toISOString();
    
    const { data: invitations, error } = await supabase
      .from('live_stream_invitations')
      .select('*')
      .eq('invited_user_id', user.id)
      .eq('status', 'pending')
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    // Fetch related data (host profile and stream) for each invitation
    const invitationsWithDetails = await Promise.all(
      (invitations || []).map(async (invitation) => {
        const { data: hostProfile } = await supabase
          .from('profiles')
          .select('username, full_name, avatar_url')
          .eq('id', invitation.host_id)
          .maybeSingle();

        const { data: stream } = await supabase
          .from('live_streams')
          .select('title')
          .eq('id', invitation.stream_id)
          .maybeSingle();

        return {
          ...invitation,
          host_profile: hostProfile || null,
          stream: stream || null,
        };
      })
    );

    return { success: true, invitations: invitationsWithDetails };
  } catch (error: any) {
    return { success: false, error: 'Failed to fetch invitations' };
  }
};

/**
 * Update guest audio/video status
 */
export const updateGuestMediaStatus = async (
  streamId: string,
  userId: string,
  audioEnabled?: boolean,
  videoEnabled?: boolean
): Promise<{ success: boolean; error?: string }> => {
  try {
    const updates: any = {};
    if (audioEnabled !== undefined) updates.audio_enabled = audioEnabled;
    if (videoEnabled !== undefined) updates.video_enabled = videoEnabled;

    const { error } = await supabase
      .from('live_stream_guests')
      .update(updates)
      .eq('stream_id', streamId)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to update media status' };
  }
};
