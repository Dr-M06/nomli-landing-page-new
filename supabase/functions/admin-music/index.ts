/**
 * Admin music catalog — uses SUPABASE_SERVICE_ROLE_KEY from the Edge runtime (Supabase injects it).
 * Invoke with: Authorization: Bearer <user access_token>, apikey: <anon key>
 *
 * Deploy: supabase functions deploy admin-music
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MUSIC_BUCKET = "app-music"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function requireAdmin(req: Request): Promise<{ admin: SupabaseClient } | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Edge function missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500)
  }

  const auth = req.headers.get("Authorization")
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization" }, 401)
  }
  const jwt = auth.slice(7).trim()
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: got, error } = await admin.auth.getUser(jwt)
  if (error || !got.user) {
    return json({ error: "Invalid session" }, 401)
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", got.user.id)
    .maybeSingle()

  const isAdmin = Boolean(
    profile?.is_admin || String(profile?.role || "").toLowerCase() === "admin"
  )
  if (!isAdmin) {
    return json({ error: "Admin access required" }, 403)
  }

  return { admin }
}

function extractStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null
  const marker = `/storage/v1/object/public/${MUSIC_BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  return publicUrl.slice(idx + marker.length)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const gate = await requireAdmin(req)
  if (gate instanceof Response) return gate
  const { admin } = gate
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!

  try {
    if (req.method === "GET") {
      const { data, error } = await admin
        .from("app_songs")
        .select("id,title,artist,genre,url,cover_url,duration_sec,play_count,created_at,updated_at")
        .order("created_at", { ascending: false })
      if (error) throw error
      return json({ success: true, data: data ?? [], readOnly: false })
    }

    if (req.method === "DELETE") {
      const id = new URL(req.url).searchParams.get("id")
      if (!id) return json({ error: "Missing id" }, 400)

      const { data: song, error: fe } = await admin
        .from("app_songs")
        .select("id,url,cover_url")
        .eq("id", id)
        .maybeSingle()
      if (fe) throw fe
      if (!song) return json({ error: "Song not found" }, 404)

      const paths = [extractStoragePath(song.url), extractStoragePath(song.cover_url)].filter(
        (p): p is string => Boolean(p)
      )
      if (paths.length > 0) {
        await admin.storage.from(MUSIC_BUCKET).remove(paths).catch(() => {})
      }

      const { error: de } = await admin.from("app_songs").delete().eq("id", id)
      if (de) throw de
      return json({ success: true })
    }

    if (req.method === "POST") {
      const form = await req.formData()
      const audioFile = form.get("audioFile")
      const coverFile = form.get("coverFile")
      const title = String(form.get("title") || "").trim()
      const artist = String(form.get("artist") || "").trim()
      const genre = String(form.get("genre") || "").trim() || "Pop"
      const durationSecRaw = Number(form.get("durationSec") || 15)
      const durationSec = Number.isFinite(durationSecRaw) ? Math.max(1, Math.round(durationSecRaw)) : 15

      if (!(audioFile instanceof File)) {
        return json({ error: "audioFile is required" }, 400)
      }
      if (!title || !artist) {
        return json({ error: "title and artist are required" }, 400)
      }

      const timestamp = Date.now()
      const audioExt = audioFile.name.split(".").pop()?.toLowerCase() || "mp3"
      const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      const audioPath = `tracks/${timestamp}-${safeTitle || "track"}.${audioExt}`
      const audioBytes = new Uint8Array(await audioFile.arrayBuffer())

      const { error: upErr } = await admin.storage.from(MUSIC_BUCKET).upload(audioPath, audioBytes, {
        contentType: audioFile.type || "audio/mpeg",
        upsert: false,
      })
      if (upErr) throw upErr

      const audioUrl = `${supabaseUrl}/storage/v1/object/public/${MUSIC_BUCKET}/${audioPath}`

      let coverUrl: string | null = null
      if (coverFile instanceof File && coverFile.size > 0) {
        const coverExt = coverFile.name.split(".").pop()?.toLowerCase() || "jpg"
        const coverPath = `covers/${timestamp}-${safeTitle || "cover"}.${coverExt}`
        const coverBytes = new Uint8Array(await coverFile.arrayBuffer())
        const { error: cErr } = await admin.storage.from(MUSIC_BUCKET).upload(coverPath, coverBytes, {
          contentType: coverFile.type || "image/jpeg",
          upsert: false,
        })
        if (!cErr) {
          coverUrl = `${supabaseUrl}/storage/v1/object/public/${MUSIC_BUCKET}/${coverPath}`
        }
      }

      const { data: row, error: insErr } = await admin
        .from("app_songs")
        .insert({
          title,
          artist,
          genre,
          url: audioUrl,
          cover_url: coverUrl,
          duration_sec: durationSec,
        })
        .select()
        .single()
      if (insErr) throw insErr
      return json({ success: true, data: row })
    }

    return json({ error: "Method not allowed" }, 405)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error"
    return json({ success: false, error: msg }, 500)
  }
})
