/**
 * Pixabay open-source music search via Supabase Edge Function.
 * The API key is stored in Edge Function secrets (PIXABAY_API_KEY), not in the app.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants/Endpoints';
import { supabase } from './supabase';

export interface PixabayMusicTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration?: number;
  license?: string;
}

/** Search Pixabay music via Edge Function. Returns playable tracks; empty array on error. */
export async function searchPixabayMusic(query: string, page: number = 1, perPage: number = 15): Promise<PixabayMusicTrack[]> {
  if (!query.trim() || !SUPABASE_URL) return [];
  try {
    const edgeUrl = `${SUPABASE_URL}/functions/v1/pixabay-music?query=${encodeURIComponent(query.trim())}&page=${page}&per_page=${perPage}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY || '' };
    const { data: { session } } = await supabase.auth.getSession();
    if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

    const res = await fetch(edgeUrl, { method: 'GET', headers });
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];
    return json.data as PixabayMusicTrack[];
  } catch {
    return [];
  }
}
