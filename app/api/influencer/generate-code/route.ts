import { NextRequest, NextResponse } from "next/server"
import { createInfluencerReferralCode } from "@/lib/firebase/influencers"

/**
 * Generate a unique referral code for an influencer
 * POST /api/influencer/generate-code
 * 
 * Body: {
 *   influencerId: string,
 *   email: string,
 *   name: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { influencerId, email, name } = body

    if (!influencerId || !email || !name) {
      return NextResponse.json(
        { error: "influencerId, email, and name are required" },
        { status: 400 }
      )
    }

    const { code, referralLink } = await createInfluencerReferralCode(
      influencerId,
      email,
      name
    )

    return NextResponse.json({
      success: true,
      code,
      referralLink,
      message: "Referral code generated successfully"
    })
  } catch (error: any) {
    console.error("Error generating referral code:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
