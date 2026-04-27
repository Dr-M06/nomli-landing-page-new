/**
 * Live Stream Bootstrap Hook
 * 
 * Implements the single API call pattern for joining live streams.
 * This hook fetches all necessary data (token, channel, role, UID) in one call,
 * preventing API storms and reducing ingress.
 * 
 * Based on: NOMLI MINGLE LIVE STREAMING DOCUMENTATION
 */

import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { SUPABASE_URL } from '../constants/Endpoints';
import useAuth from './useAuth';

export interface LiveBootstrapData {
  token: string;
  appId: string;
  channelName: string;
  uid: number;
  role: 'broadcaster' | 'audience';
  streamId: string;
  streamTitle: string;
  streamerName: string;
  streamerAvatar?: string;
}

interface UseLiveBootstrapResult {
  bootstrap: (streamId: string, userId: string, role: 'broadcaster' | 'audience') => Promise<LiveBootstrapData | null>;
  loading: boolean;
  error: string | null;
}

// Cache bootstrap data for 2-5 minutes to prevent API storms
const bootstrapCache = new Map<string, { data: LiveBootstrapData; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

export const useLiveBootstrap = (): UseLiveBootstrapResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const bootstrap = useCallback(async (
    streamId: string,
    userId: string,
    role: 'broadcaster' | 'audience'
  ): Promise<LiveBootstrapData | null> => {
    setLoading(true);
    setError(null);

    try {
      // ============================================
      // BOOTSTRAP API PATTERN
      // Single API call with Redis caching (backend)
      // Client-side cache as fallback
      // ============================================
      
      // Step 1: Check client-side cache first (fastest)
      const cacheKey = `${streamId}_${role}`;
      const cached = bootstrapCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('✅ [BOOTSTRAP] Using client-side cached bootstrap data');
        setLoading(false);
        return cached.data;
      }

      console.log(`📡 [BOOTSTRAP] Fetching bootstrap data for stream ${streamId} as ${role}`);

      // Step 2: Call backend bootstrap API (with Redis caching)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated');
      }

      // Call Supabase Edge Function
      const bootstrapUrl = `${SUPABASE_URL}/functions/v1/live-bootstrap?streamId=${streamId}&role=${role}`;
      
      const response = await fetch(bootstrapUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to fetch bootstrap data (${response.status})`);
      }

      const bootstrapData: LiveBootstrapData = await response.json();

      // Step 3: Cache the result client-side (double caching)
      bootstrapCache.set(cacheKey, {
        data: bootstrapData,
        timestamp: Date.now(),
      });

      console.log('✅ [BOOTSTRAP] Bootstrap data fetched successfully (from backend with Redis cache)');
      setLoading(false);
      return bootstrapData;
    } catch (err: any) {
      console.error('❌ [BOOTSTRAP] Error fetching bootstrap data:', err);
      setError(err.message || 'Failed to fetch bootstrap data');
      setLoading(false);
      return null;
    }
  }, []);

  return { bootstrap, loading, error };
};

