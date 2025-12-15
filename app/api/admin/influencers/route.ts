import { NextRequest, NextResponse } from "next/server"
import { db, getDb } from "@/lib/firebase/config"
import { collection, getDocs, query, orderBy, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore"
import { createInfluencerReferralCode } from "@/lib/firebase/influencers"

// Helper to get db instance
const getDbInstance = () => {
  return db || getDb()
}

/**
 * Get all influencers (Admin only)
 * GET /api/admin/influencers
 */
export async function GET(request: NextRequest) {
  try {
    const dbInstance = getDbInstance()
    if (!dbInstance) {
      return NextResponse.json(
        { error: "Firebase not initialized. Please check your configuration." },
        { status: 500 }
      )
    }

    // TODO: Add admin authentication check
    // const isAdmin = await checkAdminAuth(request)
    // if (!isAdmin) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    // }

    const influencersQuery = query(
      collection(dbInstance, "influencers"),
      orderBy("createdAt", "desc")
    )
    const snapshot = await getDocs(influencersQuery)

    const influencers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    return NextResponse.json({
      success: true,
      data: influencers,
      count: influencers.length,
    })
  } catch (error: any) {
    console.error("Error fetching influencers:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * Approve influencer and generate referral code
 * POST /api/admin/influencers/approve
 * 
 * Body: {
 *   influencerId: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { influencerId, action } = body

    if (!influencerId || !action) {
      return NextResponse.json(
        { error: "influencerId and action are required" },
        { status: 400 }
      )
    }

    const dbInstance = getDbInstance()
    if (!dbInstance) {
      return NextResponse.json(
        { error: "Firebase not initialized. Please check your configuration." },
        { status: 500 }
      )
    }

    const influencerRef = doc(dbInstance, "influencers", influencerId)
    const influencerSnap = await getDoc(influencerRef)
    
    if (!influencerSnap.exists()) {
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 }
      )
    }

    const influencerData = influencerSnap.data()

    if (action === "approve") {
      // Generate referral code if not already exists
      if (!influencerData.referralCode) {
        const { code, referralLink } = await createInfluencerReferralCode(
          influencerId,
          influencerData.email,
          influencerData.name
        )

        await updateDoc(influencerRef, {
          status: "approved",
          isActive: true,
          referralCode: code,
          referralLink,
          updatedAt: serverTimestamp(),
        })

        return NextResponse.json({
          success: true,
          message: "Influencer approved and referral code generated",
          code,
          referralLink,
        })
      } else {
        // Just approve if code already exists
        await updateDoc(influencerRef, {
          status: "approved",
          isActive: true,
          updatedAt: serverTimestamp(),
        })

        return NextResponse.json({
          success: true,
          message: "Influencer approved",
          code: influencerData.referralCode,
          referralLink: influencerData.referralLink,
        })
      }
    } else if (action === "reject") {
      await updateDoc(influencerRef, {
        status: "rejected",
        isActive: false,
        updatedAt: serverTimestamp(),
      })

      return NextResponse.json({
        success: true,
        message: "Influencer application rejected",
      })
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'approve' or 'reject'" },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error("Error processing influencer action:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

