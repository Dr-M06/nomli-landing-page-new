const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  ""
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  ""

if (process.env.NODE_ENV !== "production") {
  if (!supabaseUrl) {
    console.warn("[supabase-admin] Missing project URL (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL)")
  } else if (!serviceRoleKey) {
    console.warn(
      "[supabase-admin] SUPABASE_SERVICE_ROLE_KEY not set — admin uploads/storage use service role; catalog list can still use anon (same as /api/music/discover)."
    )
  }
}

/** Service role: full admin (RLS bypass, storage uploads, deletes). */
export const hasSupabaseAdmin = Boolean(supabaseUrl && serviceRoleKey)

/** URL + anon: read catalog via PostgREST (must match RLS; same idea as discover when service role is absent). */
export const hasSupabaseAnonRead = Boolean(supabaseUrl && supabaseAnonKey)

function requireSupabaseAdminConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
  }
  return { supabaseUrl, serviceRoleKey }
}

export async function supabaseAdminRequest(path: string, init: RequestInit = {}) {
  const { supabaseUrl: url, serviceRoleKey: key } = requireSupabaseAdminConfig()
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers || {}),
    },
  })
  const text = await response.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!response.ok) {
    const message =
      (payload && (payload.message || payload.error || payload.msg || payload.error_description)) ||
      `Supabase request failed (${response.status})`
    throw new Error(String(message))
  }
  return payload
}

export async function selectSongs() {
  const query =
    "/rest/v1/app_songs?select=id,title,artist,genre,url,cover_url,duration_sec,play_count,created_at,updated_at&order=created_at.desc"
  const data = await supabaseAdminRequest(query, { method: "GET" })
  return Array.isArray(data) ? data : []
}

/** List songs with anon key (no service role). Works when RLS allows anon SELECT on app_songs — mirrors /api/music/discover. */
export async function selectSongsWithAnon() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and anon key are required for public catalog reads.")
  }
  const query =
    "/rest/v1/app_songs?select=id,title,artist,genre,url,cover_url,duration_sec,play_count,created_at,updated_at&order=created_at.desc"
  const response = await fetch(`${supabaseUrl}${query}`, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    cache: "no-store",
  })
  const text = await response.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!response.ok) {
    const message =
      (payload && (payload.message || payload.error || payload.msg || payload.error_description)) ||
      `Supabase request failed (${response.status}) — check RLS allows anon read on app_songs`
    throw new Error(String(message))
  }
  return Array.isArray(payload) ? payload : []
}

/** Columns needed by /music and /music/artist public pages */
export async function selectPublicCatalogSongs(orderBy: "created" | "plays" = "created", artistIlike?: string) {
  const select =
    "id,title,artist,url,cover_url,artist_bio,artist_username,artist_avatar_url,artist_youtube_url,artist_spotify_url,genre,duration_sec,play_count"
  const order =
    orderBy === "plays"
      ? "order=play_count.desc.nullslast,created_at.desc"
      : "order=created_at.desc"
  const filter =
    artistIlike && artistIlike.trim()
      ? `&artist=ilike.*${encodeURIComponent(artistIlike.trim())}*`
      : ""
  const query = `/rest/v1/app_songs?select=${select}${filter}&${order}`
  const data = await supabaseAdminRequest(query, { method: "GET" })
  return Array.isArray(data) ? data : []
}

export async function insertSong(payload: Record<string, unknown>) {
  const data = await supabaseAdminRequest("/rest/v1/app_songs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  })
  return Array.isArray(data) ? data[0] : data
}

export async function getSongById(id: string) {
  const query = `/rest/v1/app_songs?id=eq.${encodeURIComponent(id)}&select=id,url,cover_url&limit=1`
  const data = await supabaseAdminRequest(query, { method: "GET" })
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

export async function deleteSongById(id: string) {
  await supabaseAdminRequest(`/rest/v1/app_songs?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal",
    },
  })
}

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
}

export async function uploadStorageObject(bucket: string, path: string, body: Blob | Buffer, contentType: string) {
  await supabaseAdminRequest(`/storage/v1/object/${bucket}/${encodeStoragePath(path)}`, {
    method: "POST",
    headers: {
      "x-upsert": "false",
      "Content-Type": contentType,
    },
    body,
  })
}

export async function deleteStorageObject(bucket: string, path: string) {
  await supabaseAdminRequest(`/storage/v1/object/${bucket}/${encodeStoragePath(path)}`, {
    method: "DELETE",
  })
}

export function getPublicStorageUrl(bucket: string, path: string) {
  const { supabaseUrl: url } = requireSupabaseAdminConfig()
  return `${url}/storage/v1/object/public/${bucket}/${path}`
}
