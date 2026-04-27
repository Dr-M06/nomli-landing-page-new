import { supabase } from './supabase';
import { triggerProcessNotification } from './triggerProcessNotification';
import { followUser } from './followersServiceFixed';
import { log, warn, error } from './productionLogger';


export interface FriendRequest {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  requester?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
    is_verified: boolean;
  };
  recipient?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
    is_verified: boolean;
  };
}

/**
 * Send a friend request
 */
export const sendFriendRequest = async (recipientId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      error('[FriendRequest] User not authenticated');
      return false;
    }

    // Check if already following
    const { data: existingFollow } = await supabase
      .from('user_followers')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', recipientId)
      .maybeSingle();

    if (existingFollow) {
      log('[FriendRequest] Already following, no request needed');
      return true; // Already following, consider it success
    }

    // Check if request already exists
    const { data: existingRequest } = await supabase
      .from('friend_requests')
      .select('id, status')
      .eq('requester_id', user.id)
      .eq('recipient_id', recipientId)
      .maybeSingle();

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        log('[FriendRequest] Request already pending');
        return true; // Already pending
      }
      if (existingRequest.status === 'accepted') {
        log('[FriendRequest] Request already accepted');
        return true;
      }
      // If rejected, delete old request and create new one
      await supabase
        .from('friend_requests')
        .delete()
        .eq('id', existingRequest.id);
    }

    // Create new friend request
    const { error } = await supabase
      .from('friend_requests')
      .insert({
        requester_id: user.id,
        recipient_id: recipientId,
        status: 'pending',
      });

    if (error) {
      error('[FriendRequest] Error sending request:', error);
      return false;
    }

    log('[FriendRequest] ✅ Friend request sent');
    return true;
  } catch (error) {
    error('[FriendRequest] Exception sending request:', error);
    return false;
  }
};

/**
 * Accept a friend request
 */
export const acceptFriendRequest = async (requestId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      error('[FriendRequest] User not authenticated');
      return false;
    }

    // First, get the request details to notify the requester
    const { data: request, error: fetchError } = await supabase
      .from('friend_requests')
      .select(`
        requester_id,
        recipient_id,
        profiles!friend_requests_requester_id_fkey (
          username,
          full_name
        )
      `)
      .eq('id', requestId)
      .eq('recipient_id', user.id)
      .single();

    if (fetchError || !request) {
      error('[FriendRequest] Error fetching request:', fetchError);
      return false;
    }

    // Use Edge Function to accept friend request and create follow relationships
    // This bypasses RLS issues by using service role permissions
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        error('[FriendRequest] No session token available');
        return false;
      }

      // Get Supabase URL from constants
      const { SUPABASE_URL } = await import('../constants/Endpoints');

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/accept-friend-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': (await import('../constants/Endpoints')).SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ requestId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const edgeErrorMessage = String(
          (errorData as any)?.error ??
          (errorData as any)?.message ??
          ''
        ).toLowerCase();

        // Idempotent accept: if another client/process already accepted this request,
        // treat it as success so UI does not show a false failure.
        if (edgeErrorMessage.includes('already accepted')) {
          log('[FriendRequest] Request already accepted (idempotent success)');
          return true;
        }

        error('[FriendRequest] Edge Function error:', errorData);
        return false;
      }

      const result = await response.json();
      log('[FriendRequest] ✅ Friend request accepted via Edge Function:', result);
      return true;
    } catch (error) {
      error('[FriendRequest] Exception calling Edge Function:', error);
      // Fallback: Try direct update (without follow relationship creation)
      const { error: updateError } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .eq('recipient_id', user.id);

      if (updateError) {
        error('[FriendRequest] Error accepting request (fallback):', updateError);
        return false;
      }

      // Try to create follow relationship using followUser (may fail due to RLS)
      try {
        await followUser(request.requester_id);
      } catch (followErr) {
        warn('[FriendRequest] Could not create follow relationship (RLS may be blocking):', followErr);
      }

      return true; // Request accepted even if follow fails
    }

    // Notify the requester that their request was accepted
    try {
      const requesterProfile = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles;
      const recipientName = requesterProfile?.full_name || requesterProfile?.username || 'Someone';
      
      // Get current user's profile for notification
      const { data: currentUserProfile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', user.id)
        .single();

      const senderName = currentUserProfile?.full_name || currentUserProfile?.username || 'Someone';

      // Create notification for requester
      const { data: queued, error: notifError } = await supabase
        .from('notification_queue')
        .insert({
          recipient_id: request.requester_id,
          sender_id: user.id,
          notification_type: 'friend_request_accepted',
          sender_name: senderName,
          message_content: `${senderName} accepted your friend request`,
          metadata: {
            request_id: requestId,
            type: 'friend_request_accepted',
          },
        })
        .select('id')
        .single();

      if (notifError) {
        error('[FriendRequest] Error creating notification:', notifError);
        // Don't fail the accept if notification fails
      } else {
        log('[FriendRequest] ✅ Notification sent to requester');
        triggerProcessNotification(queued?.id);
      }
    } catch (notifErr) {
      error('[FriendRequest] Exception creating notification:', notifErr);
      // Don't fail the accept if notification fails
    }

    log('[FriendRequest] ✅ Friend request accepted');
    return true;
  } catch (error) {
    error('[FriendRequest] Exception accepting request:', error);
    return false;
  }
};

/**
 * Reject a friend request
 */
export const rejectFriendRequest = async (requestId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      error('[FriendRequest] User not authenticated');
      return false;
    }

    // Update request status to rejected
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)
      .eq('recipient_id', user.id); // Ensure user is the recipient

    if (error) {
      error('[FriendRequest] Error rejecting request:', error);
      return false;
    }

    log('[FriendRequest] ✅ Friend request rejected');
    return true;
  } catch (error) {
    error('[FriendRequest] Exception rejecting request:', error);
    return false;
  }
};

/**
 * Cancel a sent friend request
 */
export const cancelFriendRequest = async (recipientId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      error('[FriendRequest] User not authenticated');
      return false;
    }

    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .eq('requester_id', user.id)
      .eq('recipient_id', recipientId)
      .eq('status', 'pending');

    if (error) {
      error('[FriendRequest] Error canceling request:', error);
      return false;
    }

    log('[FriendRequest] ✅ Friend request canceled');
    return true;
  } catch (error) {
    error('[FriendRequest] Exception canceling request:', error);
    return false;
  }
};

/**
 * Check if there's a pending friend request between two users
 */
export const hasPendingRequest = async (
  requesterId: string,
  recipientId: string
): Promise<'sent' | 'received' | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Check if user sent a request
    const { data: sentRequest } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('requester_id', requesterId)
      .eq('recipient_id', recipientId)
      .eq('status', 'pending')
      .maybeSingle();

    if (sentRequest) return 'sent';

    // Check if user received a request
    const { data: receivedRequest } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('requester_id', recipientId)
      .eq('recipient_id', requesterId)
      .eq('status', 'pending')
      .maybeSingle();

    if (receivedRequest) return 'received';

    return null;
  } catch (error) {
    error('[FriendRequest] Exception checking request:', error);
    return null;
  }
};

/**
 * Get pending friend requests received by current user
 */
export const getPendingRequests = async (): Promise<FriendRequest[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('friend_requests')
      .select(`
        *,
        requester:requester_id (
          id,
          username,
          full_name,
          avatar_url,
          is_verified
        )
      `)
      .eq('recipient_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      error('[FriendRequest] Error getting requests:', error);
      return [];
    }

    return (data || []).map(item => ({
      ...item,
      requester: Array.isArray(item.requester) ? item.requester[0] : item.requester,
    }));
  } catch (error) {
    error('[FriendRequest] Exception getting requests:', error);
    return [];
  }
};

/**
 * Get sent friend requests by current user
 */
export const getSentRequests = async (): Promise<FriendRequest[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('friend_requests')
      .select(`
        *,
        recipient:recipient_id (
          id,
          username,
          full_name,
          avatar_url,
          is_verified
        )
      `)
      .eq('requester_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      error('[FriendRequest] Error getting sent requests:', error);
      return [];
    }

    return (data || []).map(item => ({
      ...item,
      recipient: Array.isArray(item.recipient) ? item.recipient[0] : item.recipient,
    }));
  } catch (error) {
    error('[FriendRequest] Exception getting sent requests:', error);
    return [];
  }
};

