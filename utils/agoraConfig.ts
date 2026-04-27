import { log, warn, error } from './productionLogger';
// Agora Configuration
// 🔒 SECURE: App ID is server-side only
// For production, implement token-based authentication

export const AGORA_CONFIG = {
  // 🔒 SECURE: App ID is server-side only (not accessible to client)
  // This will be provided by the token server
  APP_ID: undefined, // Will be provided by token server
  
  // Token server URL (required for production)
  TOKEN_SERVER_URL: process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL || '',
  
  // Default channel profile for calls
  DEFAULT_CHANNEL_PROFILE: 'communication' as const, // Communication for 1-to-1 calls
  
  // Default client role for calls
  DEFAULT_CLIENT_ROLE: 'broadcaster' as const, // Both users are broadcasters in calls
  
  // Security settings
  ENABLE_ENCRYPTION: true, // Enable media stream encryption
  ENCRYPTION_MODE: 'aes-128-xts' as const, // AES-128 encryption
  
  // Token-based authentication (required for production)
  USE_TOKEN_AUTH: true, // Always use token authentication
};

// Token server validation
// Note: Token server is optional now - we use bootstrap API (call-bootstrap/live-bootstrap) for calls and livestreams
// This validation is only used for fallback scenarios
export const validateAgoraConfig = (): boolean => {
  // Token server is optional - bootstrap API is preferred
  // Only return false if we're in a context where token server is required for fallback
  if (!AGORA_CONFIG.TOKEN_SERVER_URL) {
    // Don't log error - bootstrap API handles token generation
    // Only log in development for debugging
    if (__DEV__) {
      log('ℹ️ Agora Token Server not configured (using bootstrap API instead)');
    }
    return false; // Return false but don't show error - bootstrap API will be used
  }
  return true;
};

// Get token server URL with validation
// Note: This is only used for fallback scenarios - bootstrap API is preferred
export const getTokenServerUrl = (): string => {
  if (!AGORA_CONFIG.TOKEN_SERVER_URL) {
    // Don't throw error - bootstrap API handles token generation
    // Return empty string to indicate token server not available
    if (__DEV__) {
      log('ℹ️ Token server URL not available (using bootstrap API instead)');
    }
    return '';
  }
  return AGORA_CONFIG.TOKEN_SERVER_URL;
};
