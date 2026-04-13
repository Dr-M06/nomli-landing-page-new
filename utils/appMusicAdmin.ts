/**
 * Admin-only: upload tracks to app-music bucket and manage app_songs table.
 * Gate all calls with isUserAdmin() in the UI.
 */

import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { log, error as logError } from './productionLogger';

const APP_MUSIC_BUCKET = 'app-music';

function getAudioContentType(fileUri: string): string {
  const ext = (fileUri.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
  };
  return map[ext] || 'audio/mpeg';
}

/** Optional: try to ensure bucket exists. List buckets may fail for anon key; upload will still work if bucket exists. */
export async function ensureAppMusicBucketExists(): Promise<boolean> {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      log('[AppMusicAdmin] listBuckets skipped (expected for client key):', error.message);
      return true;
    }
    const exists = buckets?.some((b) => b.name === APP_MUSIC_BUCKET);
    if (!exists) {
      const { error: createError } = await supabase.storage.createBucket(APP_MUSIC_BUCKET, {
        public: true,
        fileSizeLimit: 1024 * 1024 * 15,
      });
      if (createError) {
        log('[AppMusicAdmin] createBucket not allowed (use Dashboard to create bucket):', createError.message);
        return true;
      }
    }
    return true;
  } catch {
    return true;
  }
}

export type UploadResult = { url: string } | { error: string };

/**
 * Upload an audio file to the app-music bucket using direct upload (works with RLS).
 * Returns { url } on success or { error } on failure (caller can show error to user).
 */
export async function uploadAppMusicFile(fileUri: string): Promise<UploadResult> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      log('[AppMusicAdmin] File does not exist:', fileUri);
      return { error: 'File not found' };
    }
    const ext = (fileUri.split('.').pop() || 'mp3').toLowerCase();
    const timestamp = Date.now();
    const fileName = `app_music_${timestamp}.${ext}`;
    const contentType = getAudioContentType(fileUri);

    await ensureAppMusicBucketExists();

    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    if (!base64) {
      log('[AppMusicAdmin] Could not read file as base64');
      return { error: 'Could not read file' };
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const body = bytes.buffer.byteLength === bytes.byteLength ? bytes.buffer : bytes.slice(0).buffer;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(APP_MUSIC_BUCKET)
      .upload(fileName, body, { contentType, upsert: true });

    if (uploadError) {
      logError('[AppMusicAdmin] Storage upload failed:', uploadError.message, uploadError);
      return { error: uploadError.message || 'Upload failed' };
    }

    const { data: urlData } = supabase.storage.from(APP_MUSIC_BUCKET).getPublicUrl(uploadData?.path ?? fileName);
    const publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${timestamp}` : null;
    if (publicUrl) {
      log('[AppMusicAdmin] Upload success:', publicUrl);
      return { url: publicUrl };
    }
    return { error: 'Could not get public URL' };
  } catch (e: any) {
    logError('[AppMusicAdmin] uploadAppMusicFile exception:', e);
    return { error: e?.message ?? 'Upload failed' };
  }
}

export interface AppSongRow {
  id: string;
  title: string;
  artist: string;
  url: string;
  license: string | null;
  sort_order: number;
  created_at: string;
}

/**
 * List all app songs (for admin UI). Requires admin RLS.
 */
export async function listAppSongs(): Promise<AppSongRow[]> {
  const { data, error } = await supabase
    .from('app_songs')
    .select('id, title, artist, url, license, sort_order, created_at')
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    url: r.url,
    license: r.license ?? null,
    sort_order: r.sort_order ?? 0,
    created_at: r.created_at,
  }));
}

/**
 * Insert a new app song. Requires admin (RLS). Returns the new row id or null.
 */
export async function addAppSong(params: {
  title: string;
  artist: string;
  url: string;
  license?: string | null;
  sort_order?: number;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_songs')
    .insert({
      title: params.title.trim(),
      artist: params.artist.trim(),
      url: params.url.trim(),
      license: params.license ?? null,
      sort_order: params.sort_order ?? 0,
    })
    .select('id')
    .single();
  if (error) return null;
  return data?.id ?? null;
}

/**
 * Delete a file from the app-music bucket by its public URL. Requires admin (RLS).
 * Extracts path from URL (e.g. .../app-music/app_music_123.mp3 -> app_music_123.mp3).
 */
export async function deleteAppMusicFileFromStorage(publicUrl: string): Promise<boolean> {
  try {
    const match = publicUrl.match(/\/app-music\/([^/?]+)/);
    const path = match?.[1];
    if (!path) return false;
    const { error } = await supabase.storage.from(APP_MUSIC_BUCKET).remove([path]);
    if (error) {
      log('[AppMusicAdmin] Storage remove error:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete an app song by id (and optionally its file from storage). Requires admin (RLS).
 */
export async function deleteAppSong(id: string, options?: { deleteFromStorage?: boolean; storageUrl?: string }): Promise<boolean> {
  if (options?.deleteFromStorage && options?.storageUrl) {
    await deleteAppMusicFileFromStorage(options.storageUrl);
  }
  const { error } = await supabase.from('app_songs').delete().eq('id', id);
  return !error;
}
