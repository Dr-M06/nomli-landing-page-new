import { useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';

/**
 * Presence heartbeat: updates profiles.last_seen while the user is "active"
 * (e.g. in a private chat, on a call, or in a livestream).
 * 60s interval; final update on exit. Use with 90s threshold for "online" elsewhere.
 */
export function usePresence(userId: string | null, isActive: boolean): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;

    async function updateLastSeen() {
      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', userId);
    }

    function startHeartbeat() {
      updateLastSeen();

      intervalRef.current = setInterval(() => {
        updateLastSeen();
      }, 60000); // 60 seconds
    }

    function stopHeartbeat() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      updateLastSeen();
    }

    if (isActive) {
      startHeartbeat();
    } else {
      stopHeartbeat();
    }

    return () => stopHeartbeat();
  }, [isActive, userId]);
}
