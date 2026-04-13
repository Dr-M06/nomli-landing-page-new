import { supabase } from './supabase';
import { log } from './productionLogger';

export type ActivitySummaryCounts = {
  /** Pending friend requests (private profiles), not the same as “new follower” notifications. */
  friendRequests: number;
  /** Unread `follow` rows in notification_queue — “Someone started following you”. */
  newFollows: number;
  messageRequests: number;
  unreadAnnouncements: number;
  unreadSocial: number;
};

/**
 * Incoming cold-DM threads where you're the recipient and you haven't replied yet
 * (dm_initiations + no outbound private_message to that initiator).
 */
async function countPendingIncomingMessageRequests(userId: string): Promise<number> {
  try {
    const { data: rows, error } = await supabase
      .from('dm_initiations')
      .select('initiator_id')
      .eq('recipient_id', userId);
    if (error) {
      if (!String(error.message || '').includes('does not exist')) {
        log('[activitySummaryCounts] dm_initiations:', error.message);
      }
      return 0;
    }
    const initiators = [
      ...new Set((rows || []).map((r: { initiator_id: string }) => r.initiator_id).filter(Boolean)),
    ];
    if (initiators.length === 0) return 0;

    const { data: outbound } = await supabase
      .from('private_messages')
      .select('recipient_id')
      .eq('sender_id', userId)
      .in('recipient_id', initiators);
    const replied = new Set((outbound || []).map((r: { recipient_id: string }) => r.recipient_id));
    return initiators.filter((id) => !replied.has(id)).length;
  } catch {
    return 0;
  }
}

const SOCIAL_TYPES = [
  'like',
  'comment',
  'follow',
  'friend_request_accepted',
  'credit',
  'profile_view',
  'new_post',
  'discover_like',
] as const;

function filterActiveAnnouncements(all: any[] | null, userIdStr: string) {
  const now = new Date();
  return (all || []).filter((ann) => {
    if (!ann?.is_active) return false;
    const endDate = ann.end_date ? new Date(ann.end_date) : null;
    if (endDate && endDate < now) return false;
    const startDate = ann.start_date ? new Date(ann.start_date) : null;
    if (startDate && startDate > now) return false;
    const targetAudience = ann.target_audience || ['all'];
    if (Array.isArray(targetAudience) && targetAudience.includes('all')) return true;
    if (userIdStr && Array.isArray(targetAudience) && targetAudience.includes(userIdStr)) return true;
    return false;
  });
}

/**
 * Lightweight counts for the activity summary card (not a full notifications fetch).
 */
export async function fetchActivitySummaryCounts(userId: string): Promise<ActivitySummaryCounts> {
  const empty: ActivitySummaryCounts = {
    friendRequests: 0,
    newFollows: 0,
    messageRequests: 0,
    unreadAnnouncements: 0,
    unreadSocial: 0,
  };

  if (!userId) return empty;

  try {
    const [
      frRowsRes,
      messageRequests,
      frQueueRes,
      annReadsRes,
      announcementsRes,
      readSocialRes,
      queueRes,
      dismissedRes,
    ] = await Promise.all([
      // Select rows (not head count) — RLS often allows this when count-only fails.
      supabase
        .from('friend_requests')
        .select('id')
        .eq('recipient_id', userId)
        .eq('status', 'pending'),
      countPendingIncomingMessageRequests(userId),
      supabase
        .from('notification_queue')
        .select('id')
        .eq('recipient_id', userId)
        .eq('notification_type', 'friend_request')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.from('announcement_reads').select('announcement_id').eq('user_id', userId),
      supabase
        .from('announcements')
        .select('id, is_active, start_date, end_date, target_audience')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('notification_reads').select('notification_queue_id').eq('user_id', userId),
      supabase
        .from('notification_queue')
        .select('id, notification_type')
        .eq('recipient_id', userId)
        .in('notification_type', [...SOCIAL_TYPES])
        .order('created_at', { ascending: false })
        .limit(80),
      supabase.from('notification_dismissals').select('notification_type, notification_id').eq('user_id', userId),
    ]);

    if (frRowsRes.error) {
      log('[activitySummaryCounts] friend_requests:', frRowsRes.error.message);
    }
    const friendRequestsFromTable = frRowsRes.data?.length ?? 0;

    const readSocialIds = new Set(
      (readSocialRes.data || []).map((r: { notification_queue_id: string }) => r.notification_queue_id)
    );
    const dismissedSet = new Set(
      (dismissedRes.data || []).map(
        (d: { notification_type: string; notification_id: string }) =>
          `${d.notification_type}_${d.notification_id}`
      )
    );

    let friendRequestsFromQueue = 0;
    for (const row of (frQueueRes.data || []) as { id: string }[]) {
      if (!row?.id) continue;
      const key = `friend_request_${row.id}`;
      if (dismissedSet.has(key)) continue;
      if (readSocialIds.has(row.id)) continue;
      friendRequestsFromQueue += 1;
    }

    const friendRequests = Math.max(friendRequestsFromTable, friendRequestsFromQueue);

    const readAnnouncementIds = new Set(
      (annReadsRes.data || []).map((r: { announcement_id: string }) => r.announcement_id)
    );
    const activeAnn = filterActiveAnnouncements(announcementsRes.data as any[], userId);
    const unreadAnnouncements = activeAnn.filter((a) => a?.id && !readAnnouncementIds.has(a.id)).length;

    let newFollows = 0;
    let unreadSocial = 0;
    const rows = queueRes.data || [];
    for (const row of rows as { id: string; notification_type: string }[]) {
      if (!row?.id) continue;
      const key = `${row.notification_type}_${row.id}`;
      if (dismissedSet.has(key)) continue;
      if (readSocialIds.has(row.id)) continue;
      if (row.notification_type === 'follow') {
        newFollows += 1;
      } else {
        unreadSocial += 1;
      }
    }

    return {
      friendRequests,
      newFollows,
      messageRequests,
      unreadAnnouncements,
      unreadSocial,
    };
  } catch (e) {
    log('[activitySummaryCounts] fetch failed:', e);
    return empty;
  }
}

export function activitySummarySignature(c: ActivitySummaryCounts): string {
  return `fr:${c.friendRequests}|fol:${c.newFollows}|msg:${c.messageRequests}|ann:${c.unreadAnnouncements}|soc:${c.unreadSocial}`;
}

export function activitySummaryHasAny(c: ActivitySummaryCounts): boolean {
  return (
    c.friendRequests > 0 ||
    c.newFollows > 0 ||
    c.messageRequests > 0 ||
    c.unreadAnnouncements > 0 ||
    c.unreadSocial > 0
  );
}
