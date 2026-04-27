import { NextRequest, NextResponse } from "next/server"
import {
  hasSupabaseAdmin,
  insertSong,
  selectSongs,
  uploadStorageObject,
  getPublicStorageUrl,
} from "@/lib/supabase-admin"

const MUSIC_BUCKET = "app-music"

function supabaseMissing() {
  return NextResponse.json(
    {
      error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  if (!hasSupabaseAdmin) return supabaseMissing()
  try {
    const data = await selectSongs()
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to load songs" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!hasSupabaseAdmin) return supabaseMissing()

  const form = await request.formData()
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

