import { NextRequest, NextResponse } from "next/server"
import {
  deleteSongById,
  deleteStorageObject,
  getSongById,
  hasSupabaseAdmin,
} from "@/lib/supabase-admin"
import { canProxyMusicAdminToEdge } from "@/lib/music-admin-edge"
import { proxyMusicAdminEdge } from "@/lib/music-admin-edge-proxy"

const MUSIC_BUCKET = "app-music"

function extractStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null
  const marker = `/storage/v1/object/public/${MUSIC_BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  return publicUrl.slice(idx + marker.length)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing song id" }, { status: 400 })
  }

  if (!hasSupabaseAdmin) {
    if (canProxyMusicAdminToEdge()) {
      const proxied = await proxyMusicAdminEdge(request, {
        method: "DELETE",
        searchParams: `id=${encodeURIComponent(id)}`,
      })
      if (proxied) return proxied
      return NextResponse.json(
        {
          success: false,
          error: "Sign in for Edge admin deletes, or set SUPABASE_SERVICE_ROLE_KEY on the server.",
        },
        { status: 401 }
      )
    }
    return NextResponse.json(
      {
        success: false,
        code: "service_role_required",
        error: "Deletes require SUPABASE_SERVICE_ROLE_KEY or deployed admin-music Edge Function + signed-in admin.",
      },
      { status: 503 }
    )
  }

  let song: { id: string; url: string | null; cover_url: string | null } | null = null
  try {
    song = await getSongById(id)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to load song" }, { status: 500 })
  }
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 })
  }

  const pathsToDelete = [extractStoragePath(song.url), extractStoragePath(song.cover_url)].filter(
    (v): v is string => Boolean(v)
  )

  if (pathsToDelete.length > 0) {
    await Promise.all(
      pathsToDelete.map((path) =>
        deleteStorageObject(MUSIC_BUCKET, path).catch(() => {
          // Non-fatal: still remove DB record.
        })
      )
    )
  }

  try {
    await deleteSongById(id)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to delete song" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

