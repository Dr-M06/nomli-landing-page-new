import { NextRequest, NextResponse } from "next/server"
import { hasSupabaseAdmin, selectPublicCatalogSongs } from "@/lib/supabase-admin"

function supabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    ""
  )
}

function anonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  )
}

async function fetchWithAnon(pathAndQuery: string) {
  const url = supabaseUrl()
  const anon = anonKey()
  if (!url || !anon) return { ok: false as const, status: 503, data: null as unknown[] | null }
  const res = await fetch(`${url}${pathAndQuery}`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    cache: "no-store",
  })
  if (!res.ok) {
    return { ok: false as const, status: res.status, data: null as unknown[] | null }
  }
  const data = await res.json().catch(() => null)
  return { ok: true as const, status: 200, data: Array.isArray(data) ? data : [] }
}

/**
 * Public music catalog — server-side so Supabase env works without rebuilding the client
 * after .env changes, and so service role can read when RLS blocks anon.
 */
export async function GET(request: NextRequest) {
  const artist = request.nextUrl.searchParams.get("artist")?.trim() || ""
  const sort = request.nextUrl.searchParams.get("sort") === "plays" ? "plays" : "created"

  try {
    if (hasSupabaseAdmin) {
      const rows = await selectPublicCatalogSongs(sort === "plays" ? "plays" : "created", artist || undefined)
      return NextResponse.json({ data: rows })
    }

    const select =
      "id,title,artist,url,cover_url,artist_bio,artist_username,artist_avatar_url,artist_youtube_url,artist_spotify_url,genre,duration_sec,play_count"
    const order =
      sort === "plays" ? "play_count.desc.nullslast,created_at.desc" : "created_at.desc"
    let path = `/rest/v1/app_songs?select=${select}&order=${order}`
    if (artist) {
      path += `&artist=ilike.*${encodeURIComponent(artist)}*`
    }

    const result = await fetchWithAnon(path)
    if (!result.ok && result.status === 503) {
      return NextResponse.json(
        { error: "not_configured", message: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) on the server." },
        { status: 503 }
      )
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: "upstream", message: "Could not load songs from Supabase. Check RLS policies for anon read on app_songs." },
        { status: 502 }
      )
    }
    return NextResponse.json({ data: result.data })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: "server", message }, { status: 500 })
  }
}
