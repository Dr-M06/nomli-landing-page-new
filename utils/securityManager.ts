/**
 * Security Manager
 * Centralized security control and monitoring system
 */

import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from './productionLogger';


// Security event types
export enum SecurityEventType {
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_INPUT = 'invalid_input',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  SESSION_ANOMALY = 'session_anomaly',
  API_ABUSE = 'api_abuse',
}

// Security risk levels
export enum SecurityRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Security event interface
export interface SecurityEvent {
  type: SecurityEventType;
  level: SecurityRiskLevel;
  userId?: string;
  details: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

// Rate limiting configuration
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  key: string;
}

// Security thresholds
const SECURITY_THRESHOLDS = {
  MAX_LOGIN_ATTEMPTS: 5,
  MAX_API_REQUESTS_PER_MINUTE: 60,
  MAX_MESSAGE_LENGTH: 5000,
  MAX_FILE_SIZE_MB: 50,
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 hours
  SUSPICIOUS_ACTIVITY_THRESHOLD: 10, // events per hour
};

// Rate limit storage
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Check rate limit for a given key
 */
export const checkRateLimit = async (
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> => {
  const now = Date.now();
  const key = `rate_limit_${config.key}`;
  
  // Get stored rate limit data
  const stored = rateLimitStore.get(key);
  
  if (!stored || now > stored.resetTime) {
    // Reset or initialize
    const resetTime = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    return { allowed: true, remaining: config.maxRequests - 1, resetTime };
  }
  
  if (stored.count >= config.maxRequests) {
    // Rate limit exceeded
    logSecurityEvent({
      type: SecurityEventType.RATE_LIMIT_EXCEEDED,
      level: SecurityRiskLevel.MEDIUM,
      details: `Rate limit exceeded for key: ${config.key}`,
      metadata: { key: config.key, count: stored.count, maxRequests: config.maxRequests },
      timestamp: new Date().toISOString(),
    });
    return { allowed: false, remaining: 0, resetTime: stored.resetTime };
  }
  
  // Increment count
  stored.count++;
  rateLimitStore.set(key, stored);
  
  return {
    allowed: true,
    remaining: config.maxRequests - stored.count,
    resetTime: stored.resetTime,
  };
};

/**
 * Validate input for security risks
 */
export const validateInputSecurity = (
  input: string,
  fieldName: string = 'input'
): { isValid: boolean; riskLevel: SecurityRiskLevel; issues: string[] } => {
  const issues: string[] = [];
  let riskLevel = SecurityRiskLevel.LOW;
  
  if (!input || typeof input !== 'string') {
    return { isValid: false, riskLevel: SecurityRiskLevel.MEDIUM, issues: ['Invalid input type'] };
  }
  
  // Check length
  if (input.length > SECURITY_THRESHOLDS.MAX_MESSAGE_LENGTH) {
    issues.push(`Input exceeds maximum length of ${SECURITY_THRESHOLDS.MAX_MESSAGE_LENGTH} characters`);
    riskLevel = SecurityRiskLevel.MEDIUM;
  }
  
  // Check for SQL injection patterns (context-aware to avoid false positives)
  // Only flag clearly suspicious SQL injection attempts, not normal punctuation
  
  // 1. SQL keywords - only flag if they appear in suspicious SQL injection contexts
  // Common SQL injection patterns:
  // - SQL keywords followed by quotes and injection logic
  // - SQL keywords with semicolons (command chaining)
  const sqlKeywordWithInjection = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\s+.*?(['"`]|;|--|\bor\b|\band\b)/i;
  if (sqlKeywordWithInjection.test(input)) {
    issues.push('Potential SQL injection detected');
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  // 2. SQL comment pattern (-- with proper spacing, not in words)
  // Only flag if -- appears at word boundaries or with spaces (SQL comment syntax)
  // This won't match normal text like "all--in" or contractions
  if (/\s--\s|^--\s|--\s|--$/.test(input)) {
    issues.push('Potential SQL injection detected');
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  // 3. Classic SQL injection patterns: OR/AND with numeric comparisons
  // Pattern: ' OR 1=1 -- or " OR 1=1 -- or similar
  if (/\b(OR|AND)\s+\d+\s*=\s*\d+/i.test(input)) {
    issues.push('Potential SQL injection detected');
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  // 4. Quote-based SQL injection patterns
  // Only flag if quotes appear in suspicious SQL contexts, not normal contractions
  // Pattern: ' OR 'x'='x or " OR "x"="x or similar injection attempts
  // Allow normal contractions like "there's", "don't", "you're" (word + apostrophe + letter)
  const sqlInjectionWithQuotes = /(['"`])\s*(OR|AND)\s+['"`]?\w+['"`]?\s*=\s*['"`]?\w+['"`]?/i;
  if (sqlInjectionWithQuotes.test(input)) {
    issues.push('Potential SQL injection detected');
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  // 5. Multiple semicolons (potential command chaining) or semicolons with SQL keywords
  const semicolonCount = (input.match(/;/g) || []).length;
  if (semicolonCount > 1) {
    // Multiple semicolons are suspicious (command chaining)
    issues.push('Potential SQL injection detected');
    riskLevel = SecurityRiskLevel.HIGH;
  } else if (semicolonCount === 1 && /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE).*;/i.test(input)) {
    // Single semicolon with SQL keyword is suspicious
    issues.push('Potential SQL injection detected');
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  // Note: We intentionally do NOT flag standalone apostrophes/quotes
  // Normal contractions like "there's", "don't", "you're" are allowed
  // Only flag quotes when they appear in clearly suspicious SQL injection contexts above
  
  // Check for XSS patterns
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
  ];
  
  for (const pattern of xssPatterns) {
    if (pattern.test(input)) {
      issues.push('Potential XSS attack detected');
      riskLevel = SecurityRiskLevel.HIGH;
      break;
    }
  }
  
  // Check for command injection (context-aware)
  // Only flag command injection patterns when they appear in suspicious contexts
  // Don't flag normal punctuation like parentheses, brackets, dollar signs in normal text
  
  // 1. Command chaining patterns (semicolons, pipes, ampersands in command contexts)
  // Pattern: command1; command2 or command1 | command2 or command1 & command2
  const commandChaining = /\b(cat|ls|rm|mv|cp|chmod|sudo|su|echo|exec|eval|system|shell_exec)\s*[;&|]/i;
  if (commandChaining.test(input)) {
    issues.push('Potential command injection detected');
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  // 2. Backticks in command contexts (command substitution)
  // Pattern: `command` or $(command) in suspicious contexts
  // Only flag if backticks or $() contain actual command keywords
  const backtickPattern = /`[^`]*(cat|ls|rm|mv|cp|chmod|sudo|su|echo|exec|eval|system|shell_exec|wget|curl)[^`]*`/i;
  const dollarCommandPattern = /\$\([^)]*(cat|ls|rm|mv|cp|chmod|sudo|su|echo|exec|eval|system|shell_exec|wget|curl)[^)]*\)/i;
  if (backtickPattern.test(input) || dollarCommandPattern.test(input)) {
    issues.push('Potential command injection detected');
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  // 3. Command keywords followed by file paths or system operations
  const commandWithPath = /\b(cat|ls|rm|mv|cp|chmod|sudo|su)\s+[\/\\~]/i;
  if (commandWithPath.test(input)) {
    issues.push('Potential command injection detected');
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  // Note: We intentionally do NOT flag standalone punctuation like:
  // - Parentheses: (normal text) or [arrays] or {objects}
  // - Dollar signs: $50 or price: $100
  // - Semicolons: used in normal text (though multiple semicolons are caught above)
  // These are normal in user content and should not be blocked
  
  // Check for excessive special characters (potential encoding attack)
  const specialCharCount = (input.match(/[^a-zA-Z0-9\s]/g) || []).length;
  if (specialCharCount > input.length * 0.5) {
    issues.push('Excessive special characters detected');
    riskLevel = SecurityRiskLevel.MEDIUM;
  }
  
  return {
    isValid: issues.length === 0,
    riskLevel,
    issues,
  };
};

/**
 * Validate file upload security
 */
export const validateFileSecurity = (
  fileName: string,
  fileSize: number,
  mimeType?: string
): { isValid: boolean; riskLevel: SecurityRiskLevel; issues: string[] } => {
  const issues: string[] = [];
  let riskLevel = SecurityRiskLevel.LOW;
  
  // Check file size
  const maxSizeBytes = SECURITY_THRESHOLDS.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (fileSize > maxSizeBytes) {
    issues.push(`File size exceeds maximum of ${SECURITY_THRESHOLDS.MAX_FILE_SIZE_MB}MB`);
    riskLevel = SecurityRiskLevel.MEDIUM;
  }
  
  // Check file extension
  const extension = fileName.split('.').pop()?.toLowerCase();
  const allowedExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', // Images
    'mp4', 'mov', 'avi', 'webm', // Videos
    'mp3', 'wav', 'm4a', 'aac', // Audio
  ];
  
  if (!extension || !allowedExtensions.includes(extension)) {
    issues.push(`File type not allowed: ${extension || 'unknown'}`);
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  // Check MIME type if provided
  if (mimeType) {
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac',
    ];
    
    if (!allowedMimeTypes.includes(mimeType)) {
      issues.push(`MIME type not allowed: ${mimeType}`);
      riskLevel = SecurityRiskLevel.HIGH;
    }
  }
  
  // Check for double extensions (potential security risk)
  const doubleExtensionPattern = /\.(exe|bat|cmd|scr|vbs|js|jar|app|deb|rpm|dmg|pkg)\.[a-z]{2,4}$/i;
  if (doubleExtensionPattern.test(fileName)) {
    issues.push('Suspicious file extension pattern detected');
    riskLevel = SecurityRiskLevel.HIGH;
  }
  
  return {
    isValid: issues.length === 0,
    riskLevel,
    issues,
  };
};

/**
 * Log security event
 * SECURITY: Logs are server-side only - users cannot access them
 */
export const logSecurityEvent = async (event: SecurityEvent): Promise<void> => {
  try {
    // Log to console in development only
    if (__DEV__) {
      warn(`[SECURITY] ${event.level.toUpperCase()}: ${event.type} - ${event.details}`);
      if (event.metadata) {
        warn('[SECURITY] Metadata:', event.metadata);
      }
    }
    
    // SECURITY: Do NOT store logs locally - users should not be able to access security logs
    // Only send to server (admin-only access via RLS policies)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Fire and forget - don't block the app
      // Server-side RLS policies ensure only admins can read these logs
      supabase
        .from('security_events')
        .insert({
          user_id: user.id,
          event_type: event.type,
          risk_level: event.level,
          details: event.details,
          metadata: event.metadata || {},
          created_at: event.timestamp,
        })
        .catch((error) => {
          // Silently fail - security logging shouldn't break the app
          if (__DEV__) {
            error('[SECURITY] Failed to log event to server:', error);
          }
        });
    }
  } catch (error) {
    // Silently fail - security logging shouldn't break the app
    if (__DEV__) {
      error('[SECURITY] Error logging security event:', error);
    }
  }
};

/**
 * Check for suspicious activity
 * SECURITY: Uses server-side data only - users cannot access logs
 */
export const checkSuspiciousActivity = async (userId: string): Promise<boolean> => {
  try {
    // SECURITY: Check server-side only - users cannot read security logs
    // This function should be called from server-side Edge Functions only
    // For client-side, we'll use a server-side endpoint
    
    // For now, return false - actual suspicious activity detection should be server-side
    // This prevents users from accessing security log data
    return false;
  } catch (error) {
    if (__DEV__) {
      error('[SECURITY] Error checking suspicious activity:', error);
    }
    return false;
  }
};

/**
 * Validate session security
 */
export const validateSessionSecurity = async (): Promise<{
  isValid: boolean;
  riskLevel: SecurityRiskLevel;
  issues: string[];
}> => {
  const issues: string[] = [];
  let riskLevel = SecurityRiskLevel.LOW;
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      issues.push('Invalid or missing session');
      riskLevel = SecurityRiskLevel.MEDIUM;
      return { isValid: false, riskLevel, issues };
    }
    
    // Check session age
    const sessionAge = Date.now() - new Date(session.expires_at! * 1000).getTime();
    if (sessionAge > SECURITY_THRESHOLDS.SESSION_TIMEOUT_MS) {
      issues.push('Session expired');
      riskLevel = SecurityRiskLevel.MEDIUM;
    }
    
    // Check for session anomalies
    const storedSession = await AsyncStorage.getItem('supabase.auth.session');
    if (storedSession) {
      const parsed = JSON.parse(storedSession);
      if (parsed.user?.id !== session.user.id) {
        issues.push('Session user mismatch');
        riskLevel = SecurityRiskLevel.HIGH;
      }
    }
    
    return {
      isValid: issues.length === 0,
      riskLevel,
      issues,
    };
  } catch (error) {
    issues.push('Error validating session');
    riskLevel = SecurityRiskLevel.MEDIUM;
    return { isValid: false, riskLevel, issues };
  }
};

/**
 * Sanitize user input
 */
export const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  
  // Remove potentially dangerous characters
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * Get security status summary
 * SECURITY: Returns minimal info - users cannot access detailed logs
 * This function is for internal use only and does not expose security logs
 */
export const getSecurityStatus = async (): Promise<{
  overallRisk: SecurityRiskLevel;
  recentEvents: number;
  rateLimitStatus: Record<string, any>;
}> => {
  try {
    // SECURITY: Do not expose security logs to users
    // Only return rate limit status (non-sensitive operational data)
    // Actual security events are server-side only
    
    return {
      overallRisk: SecurityRiskLevel.LOW, // Never expose actual risk level to users
      recentEvents: 0, // Never expose event count to users
      rateLimitStatus: Object.fromEntries(rateLimitStore.entries()), // Only rate limits (non-sensitive)
    };
  } catch (error) {
    return {
      overallRisk: SecurityRiskLevel.LOW,
      recentEvents: 0,
      rateLimitStatus: {},
    };
  }
};

/**
 * Clear security logs (for testing/debugging)
 * SECURITY: Only available in development mode - users cannot clear logs
 */
export const clearSecurityLogs = async (): Promise<void> => {
  // SECURITY: Only allow clearing in development mode
  if (!__DEV__) {
    throw new Error('Security logs cannot be cleared in production');
  }
  
  // Clear local rate limit store only (logs are server-side)
  rateLimitStore.clear();
  
  if (__DEV__) {
    log('[SECURITY] Rate limit store cleared (dev mode only)');
  }
};

