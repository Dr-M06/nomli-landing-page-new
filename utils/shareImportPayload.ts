import { decode as b64decode, encode as b64encode } from 'base-64';

/** Normalize paths from iOS Share Extension (images use file://; videos may be bare paths). */
export function normalizeSharedFileUri(s: string): string {
  if (!s) return s;
  const t = s.trim();
  if (t.startsWith('file://')) return t;
  if (t.startsWith('/')) return `file://${t}`;
  return t;
}

export type ShareMediaPayload = {
  images?: string[];
  videos?: string[];
  files?: string[];
};

const IMG_EXT = /\.(jpe?g|png|gif|heic|webp)$/i;
const VID_EXT = /\.(mp4|mov|m4v|avi|mkv|webm)$/i;

export function expandShareMediaPayload(raw: ShareMediaPayload): { images: string[]; videos: string[] } {
  const images: string[] = [...(raw.images || []).map(normalizeSharedFileUri)];
  const videos: string[] = [...(raw.videos || []).map(normalizeSharedFileUri)];
  for (const f of raw.files || []) {
    const u = f.toLowerCase();
    const n = normalizeSharedFileUri(f);
    if (IMG_EXT.test(u)) images.push(n);
    else if (VID_EXT.test(u)) videos.push(n);
  }
  return { images, videos };
}

/** ASCII-only JSON (paths) — safe for base-64 without UTF-8 escapes. */
export function encodeShareMediaPayload(payload: ShareMediaPayload): string {
  return b64encode(JSON.stringify(payload));
}

export function decodeShareMediaPayload(encoded: string): ShareMediaPayload | null {
  const candidates: string[] = [encoded];
  try {
    const once = decodeURIComponent(encoded);
    if (once !== encoded) candidates.push(once);
  } catch {
    /* keep encoded */
  }
  for (const raw of candidates) {
    try {
      const json = b64decode(raw);
      const parsed = JSON.parse(json) as ShareMediaPayload;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}
