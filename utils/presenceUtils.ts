/**
 * Presence helpers: 90s online threshold, dynamic last seen text.
 * Use with profiles.last_seen (updated by usePresence when user is in chat/call/stream).
 */

const ONLINE_THRESHOLD_MS = 90 * 1000; // 90 seconds

/**
 * Consider user online if last_seen is within 90 seconds.
 */
export function isUserOnline(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < ONLINE_THRESHOLD_MS;
}

/** Show "Last seen recently" when within this many minutes (recent but not exact). */
const RECENTLY_MINS = 10;

/**
 * Human-readable last seen (e.g. "Active now", "Last seen recently", "Last seen 5 mins ago", "Last seen 2 days ago").
 * When lastSeen is missing (never set or old profile), show "Last seen long ago".
 */
export function formatLastSeen(lastSeen: string | null | undefined): string {
  if (!lastSeen) return 'Last seen long ago';
  const diffMs = Date.now() - new Date(lastSeen).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 1) return 'Active now';
  if (diffMins === 1) return 'Last seen 1 min ago';
  if (diffMins <= RECENTLY_MINS) return 'Last seen recently';
  if (diffMins < 60) return `Last seen ${diffMins} mins ago`;
  if (diffHours === 1) return 'Last seen 1 hour ago';
  if (diffHours < 24) return `Last seen ${diffHours} hours ago`;
  if (diffDays === 1) return 'Last seen 1 day ago';
  if (diffDays < 7) return `Last seen ${diffDays} days ago`;
  if (diffWeeks === 1) return 'Last seen 1 week ago';
  if (diffWeeks < 4) return `Last seen ${diffWeeks} weeks ago`;
  if (diffMonths === 1) return 'Last seen 1 month ago';
  if (diffMonths < 12) return `Last seen ${diffMonths} months ago`;
  const diffYears = Math.floor(diffDays / 365);
  if (diffYears === 1) return 'Last seen 1 year ago';
  return `Last seen ${diffYears} years ago`;
}
