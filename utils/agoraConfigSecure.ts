import { log, warn, error } from './productionLogger';
// Secure Agora Configuration
// This approach uses environment variables without exposing them in client code

// ⚠️ IMPORTANT: Never use EXPO_PUBLIC_ prefix for sensitive data
// EXPO_PUBLIC_ variables are visible in client-side code

export const AGORA_CONFIG_SECURE = {
  // These should be set in your build environment, not in .env with EXPO_PUBLIC_
  APP_ID: process.env.AGORA_APP_ID, // No EXPO_PUBLIC_ prefix
  APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE, // Server-side only
  
  // Client-side safe configuration
  CHANNEL_PROFILE: 'live_broadcasting' as const,
  CLIENT_ROLE: 'broadcaster' as const,
  ENABLE_ENCRYPTION: true,
  ENCRYPTION_MODE: 'aes-128-xts' as const,
  
  // Token server configuration
  TOKEN_SERVER_URL: process.env.AGORA_TOKEN_SERVER_URL, // Server-side only
  USE_TOKEN_AUTH: true, // Always use tokens in production
};

// Validation function
export const validateSecureAgoraConfig = (): boolean => {
  if (!AGORA_CONFIG_SECURE.APP_ID) {
    error('❌ Agora App ID not configured securely!');
    log('📝 To fix this:');
    log('1. Remove EXPO_PUBLIC_ prefix from AGORA_APP_ID in .env');
    log('2. Set AGORA_APP_ID in your build environment');
    log('3. Use server-side token generation');
    return false;
  }
  return true;
};

// Get App ID securely (only works in server-side context)
export const getSecureAgoraAppId = (): string => {
  if (!validateSecureAgoraConfig()) {
    throw new Error('Agora App ID not configured securely');
  }
  return AGORA_CONFIG_SECURE.APP_ID;
};
