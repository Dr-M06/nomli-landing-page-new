/**
 * Word Filter Utility
 * Filters inappropriate words from user-generated content
 */

// List of blocked words/phrases (case-insensitive)
const BLOCKED_WORDS = [
  // Explicit sexual content
  'porn',
  'porno',
  'pornography',
  'xxx',
  'sex',
  'sexual',
  'nude',
  'naked',
  'nudity',
  'erotic',
  'adult',
  '18+',
  'nsfw',
  
  // Profanity and offensive terms
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'damn',
  'hell',
  
  // Drug-related
  'drug',
  'cocaine',
  'heroin',
  'marijuana',
  'weed',
  'cannabis',
  
  // Violence
  'kill',
  'murder',
  'violence',
  'weapon',
  'gun',
  'knife',
  
  // Hate speech indicators
  'hate',
  'racist',
  'racism',
  
  // Scam/fraud indicators
  'scam',
  'fraud',
  'fake',
  'spam',
];

/**
 * Check if text contains any blocked words
 * @param text - The text to check
 * @returns Object with isValid boolean and matchedWords array
 */
export const checkBlockedWords = (text: string): { isValid: boolean; matchedWords: string[] } => {
  if (!text || typeof text !== 'string') {
    return { isValid: true, matchedWords: [] };
  }

  const normalizedText = text.toLowerCase().trim();
  const matchedWords: string[] = [];

  // Check each blocked word
  for (const word of BLOCKED_WORDS) {
    // Use word boundary regex to match whole words only
    // This prevents false positives (e.g., "class" containing "ass")
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    
    if (regex.test(normalizedText)) {
      matchedWords.push(word);
    }
  }

  return {
    isValid: matchedWords.length === 0,
    matchedWords,
  };
};

/**
 * Validate username against blocked words
 * @param username - The username to validate
 * @returns Validation result with isValid and error message
 */
export const validateUsername = (username: string): { isValid: boolean; error?: string } => {
  if (!username || username.trim().length === 0) {
    return { isValid: false, error: 'Username cannot be empty' };
  }

  const { isValid, matchedWords } = checkBlockedWords(username);

  if (!isValid) {
    return {
      isValid: false,
      error: `Username contains inappropriate content. Using words like "${matchedWords.join(', ')}" violates our community guidelines.`,
    };
  }

  return { isValid: true };
};

/**
 * Validate livestream title against blocked words
 * @param title - The livestream title to validate
 * @returns Validation result with isValid and error message
 */
export const validateLivestreamTitle = (title: string): { isValid: boolean; error?: string } => {
  if (!title || title.trim().length === 0) {
    return { isValid: false, error: 'Stream title cannot be empty' };
  }

  const { isValid, matchedWords } = checkBlockedWords(title);

  if (!isValid) {
    return {
      isValid: false,
      error: `Stream title contains inappropriate content. Using words like "${matchedWords.join(', ')}" violates our community guidelines.`,
    };
  }

  return { isValid: true };
};

/**
 * Validate any text content against blocked words
 * @param text - The text to validate
 * @param fieldName - Name of the field being validated (for error messages)
 * @returns Validation result with isValid and error message
 */
export const validateTextContent = (
  text: string,
  fieldName: string = 'Content'
): { isValid: boolean; error?: string } => {
  if (!text || text.trim().length === 0) {
    return { isValid: false, error: `${fieldName} cannot be empty` };
  }

  const { isValid, matchedWords } = checkBlockedWords(text);

  if (!isValid) {
    return {
      isValid: false,
      error: `${fieldName} contains inappropriate content. Using words like "${matchedWords.join(', ')}" violates our community guidelines.`,
    };
  }

  return { isValid: true };
};

/**
 * Get policy violation message
 */
export const getPolicyViolationMessage = (): string => {
  return 'This content violates our community guidelines. Please use appropriate language and content that is suitable for all users.';
};

