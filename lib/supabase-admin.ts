const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[supabase-admin] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
}

export const hasSupabaseAdmin = Boolean(supabaseUrl && serviceRoleKey)

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
