import { NextRequest, NextResponse } from "next/server"
import { normalizeReferralCode, isValidReferralCode } from "@/lib/referral-code"
import { trackSignup } from "@/lib/firebase/influencers"

/**
 * Track user signup with referral code
 * POST /api/track/signup
 * 
 * Body: {
 *   userId: string,
 *   referralCode: string,
 *   email: string,
 *   signupMethod: "web" | "mobile"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, referralCode, email, signupMethod = "web" } = body

    if (!userId || !email) {
      return NextResponse.json(
        { error: "userId and email are required" },
        { status: 400 }
      )
    }

    // If no referral code, just return success
    if (!referralCode) {
      return NextResponse.json({
        success: true,
        message: "Signup tracked successfully (no referral code)",
        status: "no_referral"
      })
    }

    // Normalize and validate referral code
    const normalizedCode = normalizeReferralCode(referralCode)

    if (!isValidReferralCode(normalizedCode)) {
      return NextResponse.json(
        { error: "Invalid referral code format" },
        { status: 400 }
      )
    }

    // Track signup with Firebase
    const referral = await trackSignup(userId, normalizedCode, email, signupMethod)

    return NextResponse.json({
      success: true,
      message: "Signup tracked successfully",
      referralCode: normalizedCode,
      referralId: referral.id,
      status: referral.status
    })
  } catch (error: any) {
    console.error("Error tracking signup:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

