import { NextRequest, NextResponse } from "next/server"
import { generateReferralCode } from "@/lib/referral-code"
import { db, getDb } from "@/lib/firebase/config"
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore"

// Helper to get db instance
const getDbInstance = () => {
  return db || getDb()
}

/**
 * Sign up as an influencer
 * POST /api/influencer/signup
 * 
 * Body: {
 *   name: string,
 *   email: string,
 *   platform: string,
 *   socialHandle: string,
 *   followers: string,
 *   reason?: string,
 *   userId: string (Firebase Auth UID)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const dbInstance = getDbInstance()
    if (!dbInstance) {
      return NextResponse.json(
        { error: "Firebase not initialized. Please check your configuration." },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { name, email, platform, socialHandle, followers, reason, userId } = body

    if (!name || !email || !platform || !socialHandle || !followers || !userId) {
      return NextResponse.json(
        { error: "name, email, platform, socialHandle, followers, and userId are required" },
        { status: 400 }
      )
    }

    // Check if influencer already exists with this email or userId
    const emailQuery = query(
      collection(dbInstance, "influencers"),
      where("email", "==", email.toLowerCase())
    )
    const existingInfluencers = await getDocs(emailQuery)

    if (!existingInfluencers.empty) {
      const existing = existingInfluencers.docs[0].data()
      return NextResponse.json({
        success: false,
        error: "An influencer account with this email already exists",
        influencerId: existingInfluencers.docs[0].id,
        hasCode: !!existing.referralCode,
      }, { status: 400 })
    }

    // Check if influencer already exists with this userId
    const userIdQuery = query(
      collection(dbInstance, "influencers"),
      where("userId", "==", userId)
    )
    const existingByUserId = await getDocs(userIdQuery)

    if (!existingByUserId.empty) {
      const existing = existingByUserId.docs[0].data()
      return NextResponse.json({
        success: false,
        error: "You have already submitted an application",
        influencerId: existingByUserId.docs[0].id,
        hasCode: !!existing.referralCode,
      }, { status: 400 })
    }

    // Use Firebase Auth UID as influencer ID
    const influencerId = userId

    // Generate unique referral code
    let code = generateReferralCode()
    let attempts = 0
    const maxAttempts = 10

    // Ensure code is unique
    while (attempts < maxAttempts) {
      const codeQuery = query(
        collection(dbInstance, "influencers"),
        where("referralCode", "==", code)
      )
      const codeSnap = await getDocs(codeQuery)

      if (codeSnap.empty) {
        break // Code is unique
      }

      code = generateReferralCode()
      attempts++
    }

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: "Failed to generate unique referral code. Please try again." },
        { status: 500 }
      )
    }

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nomlimingle.com").trim().replace(/\/$/, "")
    const referralLink = `${baseUrl}/invite/${code}`.trim()

    // Create influencer document with auto-approval
    const influencerRef = doc(dbInstance, "influencers", influencerId)
    await setDoc(influencerRef, {
      id: influencerId,
      userId, // Firebase Auth UID
      name,
      email: email.toLowerCase(),
      platform,
      socialHandle,
      followers,
      reason: reason || "",
      status: "approved", // Auto-approved
      referralCode: code,
      referralLink,
      totalSignups: 0,
      activeUsers: 0,
      pendingUsers: 0,
      totalEarned: 0,
      isActive: true, // Auto-activated
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return NextResponse.json({
      success: true,
      message: "Welcome! Your referral code has been generated.",
      influencerId,
      referralCode: code,
      referralLink,
      status: "approved",
    })
  } catch (error: any) {
    console.error("Error creating influencer signup:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

