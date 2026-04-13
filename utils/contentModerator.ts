import { log, warn, error } from './productionLogger';
// Content moderation utilities for Nomli chat

// List of known inappropriate or offensive words
const INAPPROPRIATE_WORDS = [
  // Profanity
  'fuck', 'shit', 'ass', 'bitch', 'cunt', 'dick', 'pussy', 'cock', 'whore', 'slut',
  // Slurs and offensive terms (partial list for demonstration)
  'nigger', 'nigga', 'faggot', 'retard', 'spic', 'chink', 'kike', 'tranny',
  // Contextual offensive words and violence
  'kill', 'murder', 'stab', 'shoot', 'attack', 'bomb', 'terrorist', 'rape', 'assault',
  'kill yourself', 'kys', 'die', 'hate you', 'suicide', 'gun', 'knife', 'weapon',
  // Add more words as needed
];

// Regular expressions for detecting sensitive information
const SENSITIVE_PATTERNS = [
  // Credit card numbers (basic pattern)
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/,
  // Social security numbers (US)
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/,
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  // Phone numbers (basic pattern)
  /\b(?:\+\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b/,
  // URLs with potential adult content keywords
  /https?:\/\/[^\s]*(?:porn|xxx|adult|sex|nude|naked)/i,
  // Add more patterns as needed
];

// Regular expression to match all URLs/links
const URL_PATTERN = /https?:\/\/\S+|www\.\S+|\S+\.\S+\/\S+|\S+\.(?:com|org|net|edu|io|co|me|app|dev)/gi;

export interface ModerationResult {
  isInappropriate: boolean;
  reason?: string;
  containsLink?: boolean;
  detectedTerm?: string;
  sensitiveInfo?: boolean;
  allCaps?: boolean;
  tooLong?: boolean;
}

export interface ModerationLogData {
  type: string;
  userId: string;
  roomId?: string;
  messageContent: string;
  moderationResult: ModerationResult;
  timestamp: string;
}

export interface UserBehaviorAnalysis {
  isSuspicious: boolean;
  reason?: string;
  type?: string;
}

export interface UserMessage {
  content: string;
  created_at: string;
}

/**
 * Check if a message contains inappropriate content
 * @param message - The message to check
 * @returns Result with isInappropriate flag and reason
 */
export function checkMessageContent(message: string): ModerationResult {
  if (!message) return { isInappropriate: false };
  
  // Convert message to lowercase for case-insensitive matching
  const lowerMessage = message.toLowerCase();
  
  // Check for any URLs or links
  if (URL_PATTERN.test(message)) {
    return {
      isInappropriate: true,
      reason: 'Links are not allowed in this chat room',
      containsLink: true
    };
  }
  
  // Check for inappropriate words
  for (const word of INAPPROPRIATE_WORDS) {
    // Use word boundary to match whole words (not parts of words)
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(lowerMessage)) {
      return {
        isInappropriate: true,
        reason: 'Your message contains inappropriate language',
        detectedTerm: word
      };
    }
  }
  
  // Check for sensitive information patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(message)) {
      return {
        isInappropriate: true,
        reason: 'Your message contains what appears to be sensitive information',
        sensitiveInfo: true
      };
    }
  }
  
  // Check for excessive capitalization (shouting)
  const words = message.split(/\s+/);
  if ((words?.length || 0) >= 3) {
    const capsWords = words.filter(word => (word?.length || 0) > 2 && word === word.toUpperCase());
    if ((capsWords?.length || 0) / (words?.length || 0) > 0.5) {
      return {
        isInappropriate: true,
        reason: 'Please avoid using excessive capitalization',
        allCaps: true
      };
    }
  }
  
  // Check message length (spam prevention)
  if ((message?.length || 0) > 500) {
    return {
      isInappropriate: true,
      reason: 'Your message is too long. Please keep messages under 500 characters',
      tooLong: true
    };
  }
  
  // No issues found
  return { isInappropriate: false };
}

/**
 * Check if a private message contains inappropriate content
 * NOTE: Only links are flagged - all other content is allowed (capitalization, profanity, sensitive info, etc.)
 * @param message - The message to check
 * @returns Result with isInappropriate flag and reason (only for links)
 */
export function checkPrivateMessageContent(message: string): ModerationResult {
  if (!message) return { isInappropriate: false };
  
  // Only check for URLs/links - this is important for user safety
  if (URL_PATTERN.test(message)) {
    return {
      isInappropriate: true,
      reason: 'Links are not allowed in private messages for your safety',
      containsLink: true
    };
  }
  
  // Allow everything else: capitalization, profanity, sensitive info, long messages, etc.
  return { isInappropriate: false };
}

/**
 * Censor inappropriate content in a message
 * @param message - The message to censor
 * @returns The censored message
 */
export function censorMessage(message: string): string {
  if (!message) return '';
  
  let censoredMessage = message;
  
  // Censor URLs/links
  censoredMessage = censoredMessage.replace(URL_PATTERN, '[link removed]');
  
  // Censor inappropriate words
  for (const word of INAPPROPRIATE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    censoredMessage = censoredMessage.replace(regex, match => {
      return '*'.repeat((match?.length || 0));
    });
  }
  
  // Censor sensitive information
  for (const pattern of SENSITIVE_PATTERNS) {
    censoredMessage = censoredMessage.replace(pattern, match => {
      // Keep first and last character, replace rest with asterisks
      if ((match?.length || 0) <= 4) return '*'.repeat((match?.length || 0));
      return match.charAt(0) + '*'.repeat((match?.length || 0) - 2) + match.charAt((match?.length || 0) - 1);
    });
  }
  
  return censoredMessage;
}

/**
 * Log moderation action for auditing
 * @param data - Moderation data to log
 */
export function logModerationAction(data: ModerationLogData): void {
  // In production, you would send this to your server or a monitoring service
  // For now, we'll just keep it in console.warn for easier debugging
  if (__DEV__) {
    warn('[AI Moderator]', data);
  }
  
  // In a production environment, you would implement something like this:
  // 
  // try {
  //   fetch('/api/log/moderation', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       ...data,
  //       timestamp: new Date().toISOString()
  //     })
  //   });
  // } catch (error) {
  //   // Silent fail for logging
  // }
}

/**
 * Analyze user behavior patterns for potential issues
 * @param userMessages - Recent messages from the user
 * @returns Analysis results
 */
export function analyzeUserBehavior(userMessages: UserMessage[]): UserBehaviorAnalysis {
  // Disabled flooding detection - always return false
  // This ensures users in public chat rooms can chat freely without restrictions
  return { isSuspicious: false };
  
  /* Original implementation - commented out
  if (!userMessages || (userMessages?.length || 0) < 3) {
    return { isSuspicious: false };
  }
  
  // Check for repeated identical messages
  const messageContents = userMessages.map(msg => msg.content);
  const uniqueMessages = new Set(messageContents);
  
  if ((messageContents?.length || 0) >= 3 && uniqueMessages.size === 1) {
    return {
      isSuspicious: true,
      reason: 'Repeated identical messages detected',
      type: 'repetition'
    };
  }
  
  // No suspicious behavior detected
  return { isSuspicious: false };
  */
}

/**
 * Get automated moderator response for common violations
 * @param violationType - Type of violation
 * @returns Moderator response message
 */
export function getModeratorResponse(violationType: string): string {
  const responses: Record<string, string> = {
    inappropriate: "Please keep conversations respectful and family-friendly. Inappropriate language is not allowed in this chat.",
    sensitive: "For everyone's safety, please do not share sensitive personal information in chat rooms.",
    spam: "Please avoid sending too many messages in a short period of time.",
    caps: "Please avoid using excessive capitalization in your messages.",
    repetition: "Please avoid sending the same message repeatedly.",
    link: "For security and safety reasons, links are not permitted in this chat room.",
    default: "Your message has been flagged by our AI moderator. Please review our community guidelines."
  };
  
  return responses[violationType] || responses.default;
} 