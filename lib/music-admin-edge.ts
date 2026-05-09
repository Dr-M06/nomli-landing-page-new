/**
 * Music admin via Supabase Edge Function: the service_role JWT is injected by Supabase
 * in the function runtime (Deno.env) — you do not put it in Vercel/Next .env.
 *
 * Deploy: `supabase functions deploy admin-music --no-verify-jwt` (or configure JWT verify in dashboard)
 * Invoke from Next with the logged-in user's access token + anon apikey (see /api/admin/music proxy).
 */

export function getMusicAdminEdgeUrl(): string | null {
  const explicit = process.env.SUPABASE_MUSIC_ADMIN_EDGE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")
  const u =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    ""
  if (!u) return null
  const name = (process.env.SUPABASE_MUSIC_ADMIN_FUNCTION_NAME || "admin-music").replace(/^\/+|\/+$/g, "")
  return `${u.replace(/\/$/, "")}/functions/v1/${name}`
}

export function getServerAnonKeyForEdgeInvoke(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  )
}

export function canProxyMusicAdminToEdge(): boolean {
  return Boolean(getMusicAdminEdgeUrl() && getServerAnonKeyForEdgeInvoke())
}
