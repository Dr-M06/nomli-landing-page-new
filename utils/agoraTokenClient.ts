import { getTokenServerUrl } from './agoraConfig';
import { log, warn, error } from './productionLogger';


export type AgoraRole = 'broadcaster' | 'audience';

export interface RtcTokenRequest {
  channelName: string;
  uid: number;
  role: AgoraRole;
  expireSeconds?: number;
}

export interface RtcTokenResponse {
  rtcToken: string;
  appId?: string;
}

export interface RtcTokenResult {
  token: string;
  appId?: string;
}

export async function fetchRtcToken(params: RtcTokenRequest): Promise<string> {
  const result = await fetchRtcTokenWithAppId(params);
  return result.token;
}

/**
 * Extract App ID from Agora RTC token
 * Agora tokens have the format: [VERSION][APP_ID][REST_OF_TOKEN]
 * - Version: 3 characters (e.g., "006", "007", "008")
 * - App ID: 32 hex characters
 * - Rest: Base64 encoded token data
 */
function decodeAppIdFromToken(token: string): string | undefined {
  try {
    if (!token || token.length < 35) {
      warn('⚠️ [TOKEN] Token too short to contain App ID');
      return undefined;
    }
    
    // Agora token format: [VERSION(3 chars)][APP_ID(32 hex chars)][REST]
    // Extract App ID: skip first 3 chars (version), take next 32 chars
    const appId = token.substring(3, 35);
    
    // Validate it's a valid hex string (32 hex characters)
    const hexPattern = /^[0-9a-fA-F]{32}$/;
    if (hexPattern.test(appId)) {
      log('✅ [TOKEN] Extracted App ID from token:', appId);
      return appId;
    }
    
    warn('⚠️ [TOKEN] Extracted value does not match App ID format (32 hex chars):', appId);
    return undefined;
  } catch (error) {
    error('❌ [TOKEN] Failed to extract App ID from token:', error);
    return undefined;
  }
}

export async function fetchRtcTokenWithAppId(params: RtcTokenRequest): Promise<RtcTokenResult> {
  // Use Supabase Edge Function for secure token generation
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured. Please check your environment variables.');
  }

  // Get user session for authentication
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('User not authenticated. Please sign in to generate Agora tokens.');
  }

  // Call Edge Function
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/agora-token`;
  const response = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify({
      channelName: params.channelName,
      uid: params.uid,
      role: params.role,
      expireSeconds: params.expireSeconds ?? 3600,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to fetch RTC token (${response.status}): ${text}`);
  }

  const jsonData = await response.json();
  
  // Log the full response for debugging
  log('📥 [TOKEN] Edge Function response:', JSON.stringify(jsonData, null, 2));
  
  // Handle Edge Function response format: { success: true, data: { token, appId, ... } }
  if (!jsonData.success || !jsonData.data) {
    const errorMsg = jsonData.error || 'Token generation failed';
    error('❌ [TOKEN] Edge Function error:', errorMsg);
    throw new Error(errorMsg);
  }
  
  const { token, appId } = jsonData.data;
  
  if (!token) {
    throw new Error('Edge Function did not return token');
  }
  
  log('✅ [TOKEN] Token generated successfully:', { 
    hasToken: !!token, 
    tokenLength: token?.length || 0,
    appId: appId || 'NOT PROVIDED'
  });
  
  // If App ID not provided, try to decode it from the token
  let finalAppId = appId;
  if (!finalAppId) {
    log('⚠️ [TOKEN] App ID not provided, attempting to decode from token...');
    finalAppId = decodeAppIdFromToken(token);
    if (finalAppId) {
      log('✅ [TOKEN] Successfully decoded App ID from token:', finalAppId);
    } else {
      warn('⚠️ [TOKEN] Could not extract App ID from token');
    }
  }
  
  return { token, appId: finalAppId };
}


