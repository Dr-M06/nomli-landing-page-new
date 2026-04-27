import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { encodeShareMediaPayload } from '../utils/shareImportPayload';
import { log, warn } from '../utils/productionLogger';

type NomliShareNative = {
  consumePendingShare?: () => Promise<string | null>;
};

/**
 * Consumes Android ACTION_SEND payloads written by ShareIntentProcessor (MainActivity)
 * and navigates to create with the same query shape as the iOS share extension.
 */
export default function AndroidShareIntentBridge() {
  const router = useRouter();
  const busy = useRef(false);

  const tryConsume = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (busy.current) return;
    const mod = NativeModules.NomliShareIntent as NomliShareNative | undefined;
    if (!mod?.consumePendingShare) return;

    busy.current = true;
    try {
      const raw = await mod.consumePendingShare();
      if (!raw || typeof raw !== 'string') return;

      let data: { images?: string[]; videos?: string[]; text?: string; url?: string };
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        warn('[AndroidShareIntent] Invalid JSON from native');
        return;
      }

      const images = Array.isArray(data.images) ? data.images : [];
      const videos = Array.isArray(data.videos) ? data.videos : [];
      const q = new URLSearchParams();
      if (data.text) q.set('sharedText', String(data.text).slice(0, 2000));
      if (data.url) q.set('sharedUrl', String(data.url).slice(0, 2000));
      if (images.length > 0 || videos.length > 0) {
        q.set('shareMedia', encodeShareMediaPayload({ images, videos }));
      }
      const qs = q.toString();
      const href = qs ? (`/(tabs)/create?${qs}` as const) : ('/(tabs)/create' as const);
      if (__DEV__) {
        log('[AndroidShareIntent] Navigating to create with share payload');
      }
      router.push(href);
    } catch (e) {
      warn('[AndroidShareIntent] consume failed:', e);
    } finally {
      busy.current = false;
    }
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const t = setTimeout(() => {
      void tryConsume();
    }, 400);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setTimeout(() => void tryConsume(), 200);
      }
    });

    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [tryConsume]);

  return null;
}
