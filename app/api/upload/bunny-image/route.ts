import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || ""
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ""
const EDGE_FUNCTION_NAME =
  process.env.BUNNY_EDGE_FUNCTION_NAME || process.env.EXPO_PUBLIC_BUNNY_EDGE_FUNCTION_NAME || "bunny-net-proxy"
const EDGE_FUNCTION_URL =
  process.env.BUNNY_EDGE_FUNCTION_URL ||
  process.env.EXPO_PUBLIC_BUNNY_EDGE_FUNCTION_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}` : "")

function sanitizeFilename(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "")
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export async function POST(request: NextRequest) {
  if (!EDGE_FUNCTION_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(
      {
        error:
          "Edge upload is not configured. Missing Supabase URL/anon key or edge function URL/name env values.",
      },
      { status: 500 }
    )
  }

  try {
    const form = await request.formData()
    const file = form.get("file")
    const folder = String(form.get("folder") || "music/covers")
    const baseName = String(form.get("baseName") || "cover")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 })
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
    const finalName = `${Date.now()}-${sanitizeFilename(baseName || "cover")}.${sanitizeFilename(ext)}`
    const safeFolder = folder.replace(/^\/+|\/+$/g, "")
    const arrayBuffer = await file.arrayBuffer()
    const base64Data = arrayBufferToBase64(arrayBuffer)
    const imageData = `data:${file.type || "image/jpeg"};base64,${base64Data}`

    const edgeResponse = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: request.headers.get("authorization") || `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "upload",
        imageData,
        fileName: finalName,
        folder: safeFolder,
      }),
    })

    const rawText = await edgeResponse.text().catch(() => "")
    let edgePayload: any = null
    try {
      edgePayload = rawText ? JSON.parse(rawText) : null
    } catch {
      edgePayload = null
    }
    if (!edgeResponse.ok) {
      return NextResponse.json(
        {
          error:
            edgePayload?.error ||
            edgePayload?.message ||
            rawText ||
            `Edge function upload failed (${edgeResponse.status})`,
        },
        { status: 502 }
      )
    }

    const publicUrl = String(edgePayload?.cdnUrl || edgePayload?.url || edgePayload?.publicUrl || "")
    if (!publicUrl) {
      return NextResponse.json({ error: "Edge function did not return a public URL." }, { status: 502 })
    }
    return NextResponse.json({ success: true, url: publicUrl })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Upload failed" }, { status: 500 })
  }
}

