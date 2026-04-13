/**
 * Music for posts and stories:
 * 1. App-owned songs: stored in Supabase table `app_songs`, loaded when the picker opens and cached briefly.
 *    Add tracks in Supabase Dashboard or by uploading to Storage bucket "app-music" and inserting a row.
 * 2. Fallback: MUSIC_LIBRARY below (edit URLs here for static tracks).
 * Suggested sources: Pixabay Music, Free Music Archive (download and re-host in app-music bucket).
 */

import { supabase } from '../utils/supabase';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  license?: string;
}

/** Static fallback tracks; only entries with a non-empty url are shown. */
export const MUSIC_LIBRARY: MusicTrack[] = [
  { id: 'chill-1', title: 'Sunset Drive', artist: 'Open Source', url: '', license: 'CC0 / Royalty-free' },
  { id: 'upbeat-1', title: 'Good Day', artist: 'Open Source', url: '', license: 'CC0 / Royalty-free' },
  { id: 'calm-1', title: 'Quiet Moment', artist: 'Open Source', url: '', license: 'CC0 / Royalty-free' },
];

export function getMusicTrackById(id: string): MusicTrack | undefined {
  return MUSIC_LIBRARY.find((t) => t.id === id);
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes – avoid repeated network when opening picker
let cachedTracks: MusicTrack[] | null = null;
let cacheTime = 0;

/** Fetches app-owned songs (no cache – used internally). */
async function fetchAppSongsUncached(): Promise<MusicTrack[]> {
  try {
    const { data, error } = await supabase
      .from('app_songs')
      .select('id, title, artist, url, license')
      .order('sort_order', { ascending: true });
    if (error) return [];
    return (data || []).map((row: { id: string; title: string; artist: string; url: string; license?: string }) => ({
      id: String(row.id),
      title: row.title,
      artist: row.artist,
      url: row.url,
      license: row.license ?? undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * All selectable tracks: app songs first, then static library. Cached for 5 minutes
 * so reopening the music picker doesn’t hit the network every time (keeps the app fast).
 */
export async function getSelectableTracks(): Promise<MusicTrack[]> {
  const now = Date.now();
  if (cachedTracks !== null && now - cacheTime < CACHE_TTL_MS) {
    return cachedTracks;
  }
  const appSongs = await fetchAppSongsUncached();
  const staticWithUrl = MUSIC_LIBRARY.filter((t) => t.url && t.url.trim() !== '');
  const seen = new Set(appSongs.map((t) => t.id));
  const extra = staticWithUrl.filter((t) => !seen.has(t.id));
  cachedTracks = [...appSongs, ...extra];
  cacheTime = now;
  return cachedTracks;
}

/** Clear the in-memory cache (e.g. after adding new songs in dashboard). */
export function clearMusicTracksCache(): void {
  cachedTracks = null;
  cacheTime = 0;
}
