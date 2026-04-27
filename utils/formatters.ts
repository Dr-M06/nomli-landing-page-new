/**
 * Format a date string to a relative time string (e.g. "5m ago")
 */
export const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays}d ago`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}mo ago`;
  }
  
  return `${Math.floor(diffInMonths / 12)}y ago`;
};

/** Compact number for views: 0, 1..999, 1K, 1.2K, 1M. Lightweight. */
function compactViewNum(n: number): string {
  if (n <= 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return n >= 10_000 ? `${(n / 1000).toFixed(0)}K` : `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * TikTok-style view counter: compact number only (no "people" text). Lightweight.
 * Hides view count for recently uploaded videos (within 10 minutes) to avoid showing initial boost.
 */
export function formatViewCountLabel(views: number, createdAt?: string | null): string {
  // Hide view count for videos uploaded within the last 10 minutes
  if (createdAt) {
    const postDate = new Date(createdAt);
    const now = new Date();
    const minutesDiff = (now.getTime() - postDate.getTime()) / (1000 * 60);
    
    // If video is less than 10 minutes old, don't show view count
    if (minutesDiff < 10) {
      return '';
    }
  }
  
  return compactViewNum(views || 0);
} 