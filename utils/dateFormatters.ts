/**
 * Lightweight Date Formatting Utilities
 * Replaces date-fns to reduce bundle size (~80KB savings)
 */

/**
 * Format date as "MMM dd, yyyy" (e.g., "Jan 15, 2024")
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Format date as relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatTimeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  if (diffWeeks < 4) return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
  if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
}

/**
 * Check if date is today
 */
export function isToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if date is this week
 */
export function isThisWeek(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  return d >= weekAgo && d <= today;
}

/**
 * Check if date is this month
 */
export function isThisMonth(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

/**
 * Parse ISO date string to Date object
 */
export function parseISO(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Format date with custom format (simplified version)
 * Supports: 'MMM dd, yyyy', 'MM/dd/yyyy', 'dd MMM yyyy'
 */
export function format(date: Date | string, formatStr: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  if (formatStr === 'MMM dd, yyyy') {
    return `${month} ${day.toString().padStart(2, '0')}, ${year}`;
  }
  if (formatStr === 'MM/dd/yyyy') {
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
  }
  if (formatStr === 'dd MMM yyyy') {
    return `${day.toString().padStart(2, '0')} ${month} ${year}`;
  }
  
  // Default fallback
  return d.toLocaleDateString();
}
