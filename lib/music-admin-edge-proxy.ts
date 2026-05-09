import { NextRequest, NextResponse } from "next/server"
import { canProxyMusicAdminToEdge, getMusicAdminEdgeUrl, getServerAnonKeyForEdgeInvoke } from "@/lib/music-admin-edge"

/** Forward to Supabase Edge Function `admin-music` (service role lives in Deno.env there). */
export async function proxyMusicAdminEdge(
  request: NextRequest,
  init: { method: string; body?: FormData; searchParams?: string }
): Promise<NextResponse | null> {
  if (!canProxyMusicAdminToEdge()) return null

  const edge = getMusicAdminEdgeUrl()!
  const anon = getServerAnonKeyForEdgeInvoke()
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) {
    return null
  }

  let url = edge
  if (init.searchParams) {
    url += (url.includes("?") ? "&" : "?") + init.searchParams
  }

  const res = await fetch(url, {
    method: init.method,
    headers: {
      apikey: anon,
      Authorization: auth,
    },
    body: init.body,
  })

  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  })
}
