import { NextRequest, NextResponse } from "next/server"
import { getInfluencerDashboard } from "@/lib/firebase/influencers"

/**
 * Get influencer dashboard data
 * GET /api/influencer/dashboard?influencerId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const influencerId = searchParams.get("influencerId")

    if (!influencerId) {
      return NextResponse.json(
        { error: "influencerId is required" },
        { status: 400 }
      )
    }

    const dashboardData = await getInfluencerDashboard(influencerId)

    return NextResponse.json({
      success: true,
      data: dashboardData
    })
  } catch (error: any) {
    console.error("Error fetching dashboard:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

