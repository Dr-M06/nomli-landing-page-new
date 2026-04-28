import { NextRequest, NextResponse } from "next/server"

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

async function supabaseFetch(path: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    next: { revalidate: 30 },
  })
  if (!res.ok) return null
  return res.json()
}

export async function GET(request: NextRequest) {
  try {
    const postId = request.nextUrl.searchParams.get("postId")
    if (!postId) return NextResponse.json({ items: [] })

    const rows = await supabaseFetch(
      `post_comments?post_id=eq.${encodeURIComponent(postId)}&select=id,user_id,content,created_at&order=created_at.desc&limit=30`
    )
    const items = Array.isArray(rows) ? rows : []
    const userIds = Array.from(new Set(items.map((c: any) => c.user_id).filter(Boolean)))

    let profileMap = new Map<string, any>()
    if (userIds.length > 0) {
      const idsCsv = userIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",")
      const profiles = await supabaseFetch(
        `profiles?id=in.(${encodeURIComponent(idsCsv)})&select=id,username,full_name,avatar_url`
      )
      if (Array.isArray(profiles)) {
        profileMap = new Map(profiles.filter((p) => p?.id).map((p) => [p.id, p]))
      }
    }

    return NextResponse.json({
      items: items.map((comment: any) => ({
        ...comment,
        profile: profileMap.get(comment.user_id) || null,
      })),
    })
  } catch {
    return NextResponse.json({ items: [] }, { status: 500 })
  }
}
