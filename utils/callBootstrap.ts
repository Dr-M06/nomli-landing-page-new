/**
 * Call Bootstrap Utility
 * 
 * Fetches call configuration (token, appId, channelName, uid) from the bootstrap API
 * Similar to livestream bootstrap but for 1-to-1 calls
 */

import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface CallBootstrapResponse {
  token: string;
  appId: string;
  channelName: string;
  uid: number;
  callId: string;
  callType: 'audio' | 'video';
}

/**
 * Fetch call bootstrap data from the server
 * @param callId - The chat/channel ID for the call
 * @param callType - 'audio' or 'video'
 * @returns Bootstrap data including token, appId, channelName, and uid
 */
export async function fetchCallBootstrap(
  callId: string,
  callType: 'audio' | 'video'
): Promise<CallBootstrapResponse> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  // Get user session for authentication
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  // Call the call-bootstrap Edge Function
  const bootstrapUrl = `${supabaseUrl}/functions/v1/call-bootstrap?callId=${encodeURIComponent(callId)}&callType=${callType}`;
  
  log('📞 [CALL-BOOTSTRAP] Fetching bootstrap data:', { callId, callType });
  
  const response = await fetch(bootstrapUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    error('❌ [CALL-BOOTSTRAP] Failed to fetch bootstrap:', response.status, errorText);
    throw new Error(`Failed to fetch call bootstrap: ${response.status} - ${errorText}`);
  }

  const data: CallBootstrapResponse = await response.json();
  
  log('✅ [CALL-BOOTSTRAP] Bootstrap data received:', {
    hasToken: !!data.token,
    tokenLength: data.token?.length || 0,
    tokenPrefix: data.token?.substring(0, 15) || 'N/A',
    hasAppId: !!data.appId,
    appId: data.appId?.substring(0, 8) + '...' || 'N/A',
    channelName: data.channelName,
    uid: data.uid,
    callId: data.callId,
    callType: data.callType,
  });
  
  // Validate response
  if (!data.token) {
    error('❌ [CALL-BOOTSTRAP] No token in response!');
    throw new Error('Bootstrap response missing token');
  }
  if (!data.appId) {
    warn('⚠️ [CALL-BOOTSTRAP] No App ID in response, will extract from token or use default');
  }
  if (!data.uid) {
    warn('⚠️ [CALL-BOOTSTRAP] No UID in response, will use random UID');
  }

  return data;
}

