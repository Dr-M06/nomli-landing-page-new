import { log, warn, error } from './productionLogger';
// Secure Agora Configuration
// This file contains server-side only configurations

export const AGORA_SECURITY_CONFIG = {
  // Server-side only - these should NEVER be exposed to client
  APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE, // No EXPO_PUBLIC_ prefix!
  
  // Token server configuration
  TOKEN_SERVER_URL: process.env.AGORA_TOKEN_SERVER_URL,
  
  // Security settings
  TOKEN_EXPIRATION_TIME: 24 * 60 * 60, // 24 hours in seconds
  CHANNEL_ENCRYPTION_KEY: process.env.AGORA_CHANNEL_ENCRYPTION_KEY,
  
  // Encryption modes
  ENCRYPTION_MODES: {
    AES_128: 'aes-128-xts',
    AES_256: 'aes-256-xts',
  } as const,
  
  // Default encryption (recommended for production)
  DEFAULT_ENCRYPTION_MODE: 'aes-128-xts' as const,
};

// Validate server-side security configuration
export const validateSecurityConfig = (): boolean => {
  const missing = [];
  
  if (!AGORA_SECURITY_CONFIG.APP_CERTIFICATE) {
    missing.push('AGORA_APP_CERTIFICATE');
  }
  
  if (!AGORA_SECURITY_CONFIG.TOKEN_SERVER_URL) {
    missing.push('AGORA_TOKEN_SERVER_URL');
  }
  
  if (missing.length > 0) {
    error('❌ Missing required security environment variables:');
    missing.forEach(env => error(`   - ${env}`));
    log('📝 Add these to your .env file (without EXPO_PUBLIC_ prefix)');
    return false;
  }
  
  return true;
};

// Generate token for user (server-side only)
export const generateAgoraToken = async (
  channelName: string,
  uid: string,
  role: 'publisher' | 'subscriber' = 'publisher'
): Promise<string> => {
  if (!validateSecurityConfig()) {
    throw new Error('Security configuration incomplete');
  }
  
  // This would typically call your token server
  // For now, return a placeholder
  log(`🔐 Generating token for user ${uid} in channel ${channelName}`);
  
  // TODO: Implement actual token generation
  // This should call your backend token server
  return 'PLACEHOLDER_TOKEN';
};

// Security recommendations
export const SECURITY_RECOMMENDATIONS = {
  CLIENT_SIDE: [
    'Never expose App Certificate to client',
    'Use tokens for channel access control',
    'Implement proper user authentication',
    'Enable media stream encryption',
  ],
  SERVER_SIDE: [
    'Store App Certificate securely',
    'Implement token server',
    'Validate user permissions',
    'Log security events',
  ],
  PRODUCTION: [
    'Use HTTPS for all communications',
    'Implement rate limiting',
    'Monitor for abuse',
    'Regular security audits',
  ],
};
