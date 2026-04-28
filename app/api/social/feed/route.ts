import { NextRequest, NextResponse } from "next/server"
import { getLandingFeedPostsPage } from "@/lib/nomli-posts"

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit")
    const before = request.nextUrl.searchParams.get("before")
    const limit = limitParam ? Number(limitParam) : 12
    const page = await getLandingFeedPostsPage(limit, before, true)
    return NextResponse.json(page)
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load social feed page", items: [], nextCursor: null, hasMore: false },
      { status: 500 }
    )
  }
}
