import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface CallHistoryItem {
  id: string;
  caller_id: string;
  recipient_id: string;
  call_type: 'audio' | 'video';
  status: 'missed' | 'answered' | 'rejected' | 'ended' | 'declined' | 'pending';
  created_at: string;
  ended_at?: string;
  duration?: number; // in seconds
}

/**
 * Fetch call history between two users
 */
export async function getCallHistory(
  userId: string,
  otherUserId: string,
  limit: number = 10
): Promise<CallHistoryItem[]> {
  try {
    // Query both call_notifications and call_logs tables for comprehensive history
    // Only fetch completed calls (not pending or ringing)
    const { data: callNotifications, error: notifError } = await supabase
      .from('call_notifications')
      .select('*')
      .or(`and(caller_id.eq.${userId},recipient_id.eq.${otherUserId}),and(caller_id.eq.${otherUserId},recipient_id.eq.${userId})`)
      .in('status', ['answered', 'ended', 'missed', 'rejected', 'declined'])
      .order('created_at', { ascending: false })
      .limit(limit * 2); // Fetch more to account for filtering

    if (notifError) {
      error('Error fetching call notifications:', notifError);
    }

    // Also check call_logs if it exists
    const { data: callLogs, error: logsError } = await supabase
      .from('call_logs')
      .select('*')
      .or(`and(caller_id.eq.${userId},recipient_id.eq.${otherUserId}),and(caller_id.eq.${otherUserId},recipient_id.eq.${userId})`)
      .order('created_at', { ascending: false })
      .limit(limit * 2);

    if (logsError && !logsError.message.includes('does not exist')) {
      error('Error fetching call logs:', logsError);
    }

    log('[CallHistory] Fetched call notifications:', callNotifications?.length || 0);
    log('[CallHistory] Fetched call logs:', callLogs?.length || 0);

    // Combine and deduplicate
    const allCalls: CallHistoryItem[] = [
      ...(callNotifications || []),
      ...(callLogs || [])
    ];

    // Remove duplicates based on created_at and caller_id
    const uniqueCalls = allCalls.filter((call, index, self) =>
      index === self.findIndex((c) => 
        c.created_at === call.created_at && 
        c.caller_id === call.caller_id &&
        c.recipient_id === call.recipient_id
      )
    );

    // Calculate duration if ended_at exists, or use duration field if present
    const callsWithDuration = uniqueCalls.map(call => {
      // First check if duration is already present in the data
      if (call.duration && call.duration > 0) {
        return call;
      }
      
      // Calculate duration from ended_at and created_at
      if (call.ended_at && call.created_at) {
        const duration = Math.floor(
          (new Date(call.ended_at).getTime() - new Date(call.created_at).getTime()) / 1000
        );
        return { ...call, duration: duration > 0 ? duration : undefined };
      }
      
      return call;
    });

    // Sort by created_at descending
    callsWithDuration.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const finalCalls = callsWithDuration.slice(0, limit);
    log('[CallHistory] Returning calls:', finalCalls.length);
    finalCalls.forEach(call => {
      log(`[CallHistory] - ${call.status} ${call.call_type} call, duration: ${call.duration || 'N/A'}s`);
    });

    return finalCalls;
  } catch (error) {
    error('Error fetching call history:', error);
    return [];
  }
}

/**
 * Subscribe to new call history updates
 */
export function subscribeToCallHistory(
  userId: string,
  otherUserId: string,
  onUpdate: (call: CallHistoryItem) => void
) {
  const channel = supabase
    .channel(`call_history_${userId}_${otherUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'call_notifications',
        filter: `caller_id=in.(${userId},${otherUserId})`,
      },
      (payload) => {
        const newCall = payload.new as CallHistoryItem;
        // Only notify if this call involves both users
        if (
          (newCall.caller_id === userId && newCall.recipient_id === otherUserId) ||
          (newCall.caller_id === otherUserId && newCall.recipient_id === userId)
        ) {
          onUpdate(newCall);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Mark a missed call as seen
 */
export async function markCallAsSeen(callId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('call_notifications')
      .update({ seen: true })
      .eq('id', callId);

    if (error) {
      error('Error marking call as seen:', error);
      return false;
    }

    return true;
  } catch (error) {
    error('Error marking call as seen:', error);
    return false;
  }
}

/**
 * Delete a call history item (hide from user's view)
 * Note: This doesn't delete from database, just removes from local view
 * Users can delete any call history item they see
 */
export async function deleteCallHistory(callId: string, userId: string): Promise<boolean> {
  try {
    // For now, we'll just return true since we're hiding locally
    // In the future, we could add a deleted_calls table to track hidden calls
    log(`[CallHistory] Deleting call ${callId} for user ${userId}`);
    return true;
  } catch (error) {
    error('Error deleting call history:', error);
    return false;
  }
}

