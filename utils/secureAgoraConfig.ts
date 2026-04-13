import { log, warn, error } from './productionLogger';
// Secure Agora Configuration
// This approach keeps sensitive data on the server side

export const SECURE_AGORA_CONFIG = {
  // Server-side endpoint for token generation
  TOKEN_ENDPOINT: '/api/agora/token', // Your backend endpoint
  
  // Client-side configuration (no sensitive data)
  CHANNEL_PROFILE: 'live_broadcasting' as const,
  CLIENT_ROLE: 'broadcaster' as const,
  ENABLE_ENCRYPTION: true,
  ENCRYPTION_MODE: 'aes-128-xts' as const,
};

// Function to get Agora token from your backend
export const getAgoraToken = async (channelName: string, uid: number, role: string = 'publisher') => {
  try {
    const response = await fetch(SECURE_AGORA_CONFIG.TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authentication headers here
        // 'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        channelName,
        uid,
        role,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      token: data.token,
      appId: data.appId,
      channelName: data.channelName,
      uid: data.uid,
      expirationTime: data.expirationTime,
    };
  } catch (error) {
    error('Failed to get Agora token:', error);
    throw error;
  }
};

// Fallback configuration for development (less secure)
export const FALLBACK_AGORA_CONFIG = {
  APP_ID: process.env.EXPO_PUBLIC_AGORA_APP_ID, // Only for development
  USE_FALLBACK: process.env.NODE_ENV === 'development',
};
