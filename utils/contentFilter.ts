import { log, warn, error } from './productionLogger';
/**
 * Content Filter Utility
 * Prevents users from sharing sensitive information and inappropriate content
 */

// Blocked words and patterns
const BLOCKED_WORDS = [
  // Explicit content
  'porn', 'sex', 'xxx', 'nsfw', 'nude', 'naked', 'adult',
  // Sexual orientation (to prevent discrimination/targeting)
  'gay', 'lesbian', 'lgbtq', 'lgbt',
  // Inappropriate content
  'escort', 'hookup', 'onlyfans', 'premium', 'subscribe',
  // Drugs
  'weed', 'marijuana', 'cocaine', 'drugs', 'dealer',
  // Violence
  'kill', 'murder', 'suicide', 'weapon', 'gun',
  // Hate speech
  'nazi', 'racist', 'hate',
];

// Email pattern
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

// Phone number patterns (various formats)
const PHONE_PATTERNS = [
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // 123-456-7890, 123.456.7890, 1234567890
  /\b\(\d{3}\)\s?\d{3}[-.]?\d{4}\b/g, // (123) 456-7890
  /\b\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g, // International
];

// URL patterns
const URL_PATTERN = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|io|co|app|me|tv|gg)[^\s]*)/gi;

// Social media handles
const SOCIAL_HANDLE_PATTERN = /@[a-zA-Z0-9_]{3,}/g;

// Full name pattern (First Last format)
// More restrictive: requires words to be 3+ characters and not common capitalized words
const FULL_NAME_PATTERN = /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g;

// Common capitalized words that are NOT names (to reduce false positives)
const COMMON_CAPITALIZED_WORDS = [
  'urgent', 'gig', 'opportunity', 'immediate', 'availability', 'needed', 'interested',
  'send', 'message', 'contact', 'available', 'looking', 'need', 'want', 'help',
  'job', 'work', 'business', 'service', 'product', 'offer', 'deal', 'sale',
  'event', 'meeting', 'party', 'gathering', 'workshop', 'seminar', 'conference',
  'today', 'tomorrow', 'yesterday', 'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may',
  'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'new', 'old', 'best', 'great', 'good', 'nice', 'awesome', 'amazing', 'wonderful',
  'please', 'thanks', 'thank', 'hello', 'hi', 'hey', 'welcome', 'welcome',
  'city', 'state', 'country', 'street', 'avenue', 'road', 'drive', 'lane',
  'company', 'corporation', 'inc', 'llc', 'ltd', 'group', 'team', 'organization'
];

export interface ContentFilterResult {
  isValid: boolean;
  reason?: string;
  blockedContent?: string[];
}

/**
 * Check if text contains blocked words
 */
function containsBlockedWords(text: string): { found: boolean; words: string[] } {
  const lowerText = text.toLowerCase();
  const foundWords: string[] = [];

  for (const word of BLOCKED_WORDS) {
    // Use word boundaries to avoid false positives
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(lowerText)) {
      foundWords.push(word);
    }
  }

  return {
    found: foundWords.length > 0,
    words: foundWords,
  };
}

/**
 * Check if text contains email addresses
 */
function containsEmail(text: string): boolean {
  return EMAIL_PATTERN.test(text);
}

/**
 * Check if text contains phone numbers
 */
function containsPhoneNumber(text: string): boolean {
  return PHONE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if text contains URLs
 */
function containsURL(text: string): boolean {
  return URL_PATTERN.test(text);
}

/**
 * Check if text contains social media handles
 */
function containsSocialHandle(text: string): boolean {
  return SOCIAL_HANDLE_PATTERN.test(text);
}

/**
 * Check if text contains full names
 * Improved to reduce false positives from common capitalized words
 */
function containsFullName(text: string): boolean {
  const matches = text.match(FULL_NAME_PATTERN);
  if (!matches) {
    return false;
  }
  
  // Check each match to see if it's likely a real name
  return matches.some(match => {
    const parts = match.split(' ');
    const firstWord = parts[0]?.toLowerCase() || '';
    const secondWord = parts[1]?.toLowerCase() || '';
    
    // Skip if it's the same word repeated (like "John John")
    if (firstWord === secondWord) {
      return false;
    }
    
    // Skip if either word is a common capitalized word (not a name)
    if (COMMON_CAPITALIZED_WORDS.includes(firstWord) || COMMON_CAPITALIZED_WORDS.includes(secondWord)) {
      return false;
    }
    
    // Skip if words are too short (less than 3 chars) - already handled by pattern but double-check
    if (firstWord.length < 3 || secondWord.length < 3) {
      return false;
    }
    
    // Likely a real name if it passes all checks
    return true;
  });
}

/**
 * Validate post content
 * Only blocks URLs/links - everything else is allowed
 */
export function validatePostContent(content: string): ContentFilterResult {
  if (!content || content.trim().length === 0) {
    return { isValid: true };
  }

  // Only check for URLs/links - block these
  if (containsURL(content)) {
    return {
      isValid: false,
      reason: 'Please do not share external links in your posts.',
    };
  }

  // Everything else is allowed (social handles, emails, phone numbers, etc.)
  return { isValid: true };
}

/**
 * Validate username
 */
export function validateUsername(username: string): ContentFilterResult {
  if (!username || username.trim().length === 0) {
    return {
      isValid: false,
      reason: 'Username cannot be empty.',
    };
  }

  // Check for blocked words
  const blockedCheck = containsBlockedWords(username);
  if (blockedCheck.found) {
    return {
      isValid: false,
      reason: 'Username contains inappropriate content.',
      blockedContent: blockedCheck.words,
    };
  }

  // Check for email-like usernames
  if (containsEmail(username)) {
    return {
      isValid: false,
      reason: 'Username cannot contain email addresses.',
    };
  }

  // Check for full names in username
  if (containsFullName(username)) {
    return {
      isValid: false,
      reason: 'Please do not use your full name as username for privacy.',
    };
  }

  return { isValid: true };
}

/**
 * Validate display name / full name
 */
export function validateDisplayName(name: string): ContentFilterResult {
  if (!name || name.trim().length === 0) {
    return { isValid: true }; // Display name is optional
  }

  // Check for blocked words
  const blockedCheck = containsBlockedWords(name);
  if (blockedCheck.found) {
    return {
      isValid: false,
      reason: 'Display name contains inappropriate content.',
      blockedContent: blockedCheck.words,
    };
  }

  // Check for email in display name
  if (containsEmail(name)) {
    return {
      isValid: false,
      reason: 'Display name cannot contain email addresses.',
    };
  }

  // Check for phone numbers
  if (containsPhoneNumber(name)) {
    return {
      isValid: false,
      reason: 'Display name cannot contain phone numbers.',
    };
  }

  // Check for URLs
  if (containsURL(name)) {
    return {
      isValid: false,
      reason: 'Display name cannot contain URLs.',
    };
  }

  return { isValid: true };
}

/**
 * Validate bio/about text
 */
export function validateBio(bio: string): ContentFilterResult {
  if (!bio || bio.trim().length === 0) {
    return { isValid: true }; // Bio is optional
  }

  // Check for blocked words
  const blockedCheck = containsBlockedWords(bio);
  if (blockedCheck.found) {
    return {
      isValid: false,
      reason: 'Bio contains inappropriate content.',
      blockedContent: blockedCheck.words,
    };
  }

  // Check for email addresses
  if (containsEmail(bio)) {
    return {
      isValid: false,
      reason: 'Please do not share email addresses in your bio for your safety.',
    };
  }

  // Check for phone numbers
  if (containsPhoneNumber(bio)) {
    return {
      isValid: false,
      reason: 'Please do not share phone numbers in your bio for your safety.',
    };
  }

  // Check for URLs
  if (containsURL(bio)) {
    return {
      isValid: false,
      reason: 'Please do not share external links in your bio.',
    };
  }

  // Check for social media handles
  if (containsSocialHandle(bio)) {
    return {
      isValid: false,
      reason: 'Please do not share social media handles in your bio.',
    };
  }

  return { isValid: true };
}

/**
 * Validate comment content
 * More lenient than post validation - only blocks inappropriate words
 */
export function validateComment(comment: string): ContentFilterResult {
  if (!comment || comment.trim().length === 0) {
    return { isValid: true };
  }

  // Only check for blocked words - allow emails, phone numbers, URLs, etc. in comments
  const blockedCheck = containsBlockedWords(comment);
  if (blockedCheck.found) {
    return {
      isValid: false,
      reason: 'Your comment contains inappropriate content that is not allowed.',
      blockedContent: blockedCheck.words,
    };
  }

  // Allow everything else (emails, phone numbers, URLs, social handles, full names, capitalization, etc.)
  return { isValid: true };
}

/**
 * Sanitize text by removing blocked content (for display purposes)
 */
export function sanitizeText(text: string): string {
  let sanitized = text;

  // Remove emails
  sanitized = sanitized.replace(EMAIL_PATTERN, '[email removed]');

  // Remove phone numbers
  PHONE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[phone removed]');
  });

  // Remove URLs
  sanitized = sanitized.replace(URL_PATTERN, '[link removed]');

  return sanitized;
}

/**
 * Strip leading @ symbol from username
 * Prevents double @ when we prepend @ in display
 */
export function stripAtSymbol(username: string | null | undefined): string {
  if (!username) return '';
  // Remove all leading @ symbols
  return username.replace(/^@+/, '');
}

/**
 * Sanitize username for display
 * Replaces email-like usernames with a safe alternative
 */
export function sanitizeUsernameForDisplay(username: string | null | undefined): string {
  try {
    if (!username) return 'User';
    
    // Strip any leading @ symbols first
    let cleaned = stripAtSymbol(username);
    
    // Check if username is an email
    try {
      if (EMAIL_PATTERN.test(cleaned)) {
        // Extract the part before @ and use first 8 characters
        const parts = cleaned.split('@');
        const localPart = parts[0] ? parts[0].substring(0, 8) : 'user';
        return `user_${localPart}`;
      }
    } catch (e) {
      // If regex fails, continue with other checks
    }
    
    // Remove any phone numbers
    let sanitized = cleaned;
    try {
      PHONE_PATTERNS.forEach(pattern => {
        sanitized = sanitized.replace(pattern, 'user');
      });
    } catch (e) {
      // If regex fails, continue
    }
    
    // Remove any URLs
    try {
      sanitized = sanitized.replace(URL_PATTERN, 'user');
    } catch (e) {
      // If regex fails, continue
    }
    
    // If username looks like a full name (First Last), use only first part
    try {
      const nameParts = sanitized.trim().split(/\s+/);
      if (nameParts.length >= 2 && /^[A-Z][a-z]+$/.test(nameParts[0]) && /^[A-Z][a-z]+$/.test(nameParts[1])) {
        return nameParts[0];
      }
    } catch (e) {
      // If regex fails, return sanitized as-is
    }
    
    return sanitized || 'User';
  } catch (error) {
    error('[ContentFilter] Error sanitizing username:', error);
    return username ? stripAtSymbol(username) : 'User';
  }
}

/**
 * Sanitize display name for display
 * Replaces sensitive information with safe alternatives
 */
export function sanitizeDisplayNameForDisplay(displayName: string | null | undefined): string {
  if (!displayName) return '';
  
  let sanitized = displayName;
  
  // Remove emails
  sanitized = sanitized.replace(EMAIL_PATTERN, '');
  
  // Remove phone numbers
  PHONE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  
  // Remove URLs
  sanitized = sanitized.replace(URL_PATTERN, '');
  
  // Remove social handles
  sanitized = sanitized.replace(SOCIAL_HANDLE_PATTERN, '');
  
  // Clean up extra spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // If nothing left, return empty string
  if (sanitized.length === 0) {
    return '';
  }
  
  return sanitized;
}

/**
 * Check if a username contains sensitive information
 */
export function containsSensitiveInfo(text: string): boolean {
  if (!text) return false;
  
  return (
    containsEmail(text) ||
    containsPhoneNumber(text) ||
    containsURL(text)
  );
}

/**
 * Get a safe display name from username and display name
 * Prioritizes display name if it's safe, otherwise uses sanitized username
 */
export function getSafeDisplayName(
  username: string | null | undefined,
  displayName: string | null | undefined
): string {
  try {
    // Try display name first
    if (displayName) {
      try {
        const sanitizedDisplayName = sanitizeDisplayNameForDisplay(displayName);
        if (sanitizedDisplayName && sanitizedDisplayName.length > 0) {
          return sanitizedDisplayName;
        }
      } catch (e) {
        // If sanitization fails, fall back to username
      }
    }
    
    // Fall back to username
    return sanitizeUsernameForDisplay(username);
  } catch (error) {
    error('[ContentFilter] Error getting safe display name:', error);
    // Return the safest fallback
    return username || displayName || 'User';
  }
}

