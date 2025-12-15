import { NextRequest, NextResponse } from "next/server"
import { trackUserActivity } from "@/lib/firebase/user-activity"

/**
 * Track user activity and check if user becomes "active"
 * POST /api/track/activity
 * 
 * Body: {
 *   userId: string,
 *   activityType: "photo_upload" | "bio_update" | "story_post" | "community_post"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, activityType } = body

    if (!userId || !activityType) {
      return NextResponse.json(
        { error: "userId and activityType are required" },
        { status: 400 }
      )
    }

    const validActivityTypes = ["photo_upload", "bio_update", "story_post", "community_post"]
    if (!validActivityTypes.includes(activityType)) {
      return NextResponse.json(
        { error: `Invalid activityType. Must be one of: ${validActivityTypes.join(", ")}` },
        { status: 400 }
      )
    }

    // Track activity and check if user becomes active
    const result = await trackUserActivity(userId, activityType as any)

    return NextResponse.json({
      success: true,
      message: "Activity tracked successfully",
      isActive: result.isActive,
      requirements: result.requirements
    })
  } catch (error: any) {
    console.error("Error tracking activity:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

