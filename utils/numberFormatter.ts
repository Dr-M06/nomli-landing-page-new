/**
 * Number Formatting Utilities
 * Formats large numbers with abbreviations (1K, 1M, etc.) for better UI
 */

/**
 * Format a number with abbreviations (K for thousand, M for million)
 * Removes unnecessary decimals for cleaner display
 * 
 * @param count - The number to format
 * @returns Formatted string (e.g., "1K", "1.5K", "1M", "1.2M")
 * 
 * @example
 * formatNumber(999) // "999"
 * formatNumber(1000) // "1K"
 * formatNumber(1500) // "1.5K"
 * formatNumber(1000000) // "1M"
 * formatNumber(1200000) // "1.2M"
 */
export const formatNumber = (count: number): string => {
  if (count < 0) return '0';
  
  // Less than 1,000: show as-is
  if (count < 1000) {
    return count.toString();
  }
  
  // 1,000 to 999,999: show as K
  if (count < 1000000) {
    const thousands = count / 1000;
    // If it's a whole number, don't show decimal
    if (thousands % 1 === 0) {
      return `${thousands}K`;
    }
    // Show 1 decimal place, but remove trailing zero
    const formatted = thousands.toFixed(1);
    return formatted.endsWith('.0') ? `${Math.floor(thousands)}K` : `${formatted}K`;
  }
  
  // 1,000,000 and above: show as M
  const millions = count / 1000000;
  // If it's a whole number, don't show decimal
  if (millions % 1 === 0) {
    return `${millions}M`;
  }
  // Show 1 decimal place, but remove trailing zero
  const formatted = millions.toFixed(1);
  return formatted.endsWith('.0') ? `${Math.floor(millions)}M` : `${formatted}M`;
};

/**
 * Format viewer count specifically (alias for formatNumber for consistency)
 */
export const formatViewerCount = formatNumber;

/**
 * Format any count (likes, views, followers, etc.)
 */
export const formatCount = formatNumber;
