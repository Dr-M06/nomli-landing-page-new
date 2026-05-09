import { NextRequest, NextResponse } from "next/server"
import {
  hasSupabaseAdmin,
  hasSupabaseAnonRead,
  insertSong,
  selectSongs,
  selectSongsWithAnon,
  uploadStorageObject,
  getPublicStorageUrl,
} from "@/lib/supabase-admin"
import { canProxyMusicAdminToEdge } from "@/lib/music-admin-edge"
import { proxyMusicAdminEdge } from "@/lib/music-admin-edge-proxy"

const MUSIC_BUCKET = "app-music"

function catalogUnavailable() {
  return NextResponse.json(
    {
      success: false,
      code: "supabase_not_configured",
      error:
        "Set Supabase URL + anon key, and either SUPABASE_SERVICE_ROLE_KEY on this server OR deploy the Edge Function supabase/functions/admin-music and sign in (Bearer token) so Next can proxy to it. See .env.example.",
    },
    { status: 503 }
  )
}

function serviceRoleOrEdgeMessage() {
  return NextResponse.json(
    {
      success: false,
      code: "service_role_or_edge",
      error:
        "Uploads need SUPABASE_SERVICE_ROLE_KEY in .env.local, or deploy `admin-music` Edge Function and stay signed in (proxy uses your access token).",
    },
    { status: 503 }
  )
}

export async function GET(request: NextRequest) {
  try {
    if (hasSupabaseAdmin) {
      const data = await selectSongs()
      return NextResponse.json({ success: true, data: data ?? [], readOnly: false })
    }
    const edgeGet = await proxyMusicAdminEdge(request, { method: "GET" })
    if (edgeGet) return edgeGet
    if (hasSupabaseAnonRead) {
      const data = await selectSongsWithAnon()
      return NextResponse.json({
        success: true,
        data: data ?? [],
        readOnly: true,
        message:
          "Listed with anon key only. For uploads/deletes: add SUPABASE_SERVICE_ROLE_KEY on the server, or deploy Edge Function admin-music and open this page signed in as an admin.",
      })
    }
    return catalogUnavailable()
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load songs" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (hasSupabaseAdmin) {
    const form = await request.formData()
    return handlePostWithServiceRole(form)
  }

  if (canProxyMusicAdminToEdge()) {
    const form = await request.formData()
    const proxied = await proxyMusicAdminEdge(request, { method: "POST", body: form })
    if (proxied) return proxied
    return NextResponse.json(
      {
        success: false,
        code: "auth_required",
        error: "Sign in for Edge admin uploads (Bearer token), or set SUPABASE_SERVICE_ROLE_KEY on the server.",
      },
      { status: 401 }
    )
  }

  return serviceRoleOrEdgeMessage()
}

async function handlePostWithServiceRole(form: FormData) {
  const audioFile = form.get("audioFile")
  const coverFile = form.get("coverFile")
  const title = String(form.get("title") || "").trim()
  const artist = String(form.get("artist") || "").trim()
  const genre = String(form.get("genre") || "").trim() || "Pop"
  const durationSecRaw = Number(form.get("durationSec") || 15)
  const durationSec = Number.isFinite(durationSecRaw) ? Math.max(1, Math.round(durationSecRaw)) : 15

  if (!(audioFile instanceof File)) {
    return NextResponse.json({ error: "audioFile is required" }, { status: 400 })
  }
  if (!title || !artist) {
    return NextResponse.json({ error: "title and artist are required" }, { status: 400 })
  }

  const timestamp = Date.now()
  const audioExt = audioFile.name.split(".").pop()?.toLowerCase() || "mp3"
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  const audioPath = `tracks/${timestamp}-${safeTitle || "track"}.${audioExt}`

  const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
  try {
    await uploadStorageObject(MUSIC_BUCKET, audioPath, audioBuffer, audioFile.type || "audio/mpeg")
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Audio upload failed" }, { status: 500 })
  }

  const audioUrl = getPublicStorageUrl(MUSIC_BUCKET, audioPath)

  let coverUrl: string | null = null
  if (coverFile instanceof File && coverFile.size > 0) {
    const coverExt = coverFile.name.split(".").pop()?.toLowerCase() || "jpg"
    const coverPath = `covers/${timestamp}-${safeTitle || "cover"}.${coverExt}`
    const coverBuffer = Buffer.from(await coverFile.arrayBuffer())
    try {
      await uploadStorageObject(MUSIC_BUCKET, coverPath, coverBuffer, coverFile.type || "image/jpeg")
      coverUrl = getPublicStorageUrl(MUSIC_BUCKET, coverPath)
    } catch {
      // Non-fatal: keep upload flow working even if optional cover fails.
    }
  }

  const payload = {
    title,
    artist,
    genre,
    url: audioUrl,
    cover_url: coverUrl,
    duration_sec: durationSec,
  }

  try {
    const data = await insertSong(payload)
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to create song record" }, { status: 500 })
  }
}

