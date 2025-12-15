import { NextRequest, NextResponse } from "next/server"
import { db, getDb } from "@/lib/firebase/config"
import { collection, getDocs, query, orderBy, where, doc, getDoc, updateDoc, serverTimestamp, Timestamp, increment } from "firebase/firestore"

// Helper to get db instance
const getDbInstance = () => {
  return db || getDb()
}

/**
 * Get all milestone payments (Admin only)
 * GET /api/admin/payments?status=pending
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

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status") // pending, paid, failed

    let paymentsQuery = query(
      collection(dbInstance, "milestone_payments"),
      orderBy("createdAt", "desc")
    )

    if (status) {
      paymentsQuery = query(
        collection(dbInstance, "milestone_payments"),
        where("paymentStatus", "==", status),
        orderBy("createdAt", "desc")
      )
    }

    const snapshot = await getDocs(paymentsQuery)
    const payments = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        paidAt: data.paidAt instanceof Timestamp ? data.paidAt.toDate().toISOString() : data.paidAt,
      }
    })

    // Get influencer details for each payment
    const paymentsWithInfluencers = await Promise.all(
      payments.map(async (payment) => {
        const influencerRef = doc(dbInstance, "influencers", payment.influencerId)
        const influencerSnap = await getDoc(influencerRef)
        const influencer = influencerSnap.exists()
          ? { id: influencerSnap.id, ...influencerSnap.data() }
          : null

        return {
          ...payment,
          influencer: influencer
            ? {
                id: influencer.id,
                name: influencer.name,
                email: influencer.email,
                referralCode: influencer.referralCode,
              }
            : null,
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: paymentsWithInfluencers,
      count: paymentsWithInfluencers.length,
      pendingCount: paymentsWithInfluencers.filter((p) => p.paymentStatus === "pending").length,
    })
  } catch (error: any) {
    console.error("Error fetching payments:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * Mark payment as paid
 * POST /api/admin/payments/mark-paid
 * 
 * Body: {
 *   paymentId: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { paymentId } = body

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId is required" },
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

    // Get payment details first
    const paymentRef = doc(dbInstance, "milestone_payments", paymentId)
    const paymentSnap = await getDoc(paymentRef)
    
    if (!paymentSnap.exists()) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      )
    }

    const paymentData = paymentSnap.data()
    
    // Check if already paid
    if (paymentData.paymentStatus === "paid") {
      return NextResponse.json(
        { error: "Payment already marked as paid" },
        { status: 400 }
      )
    }
    
    // Update payment status
    await updateDoc(paymentRef, {
      paymentStatus: "paid",
      paidAt: serverTimestamp(),
    })

    // Update influencer's totalEarned (only count paid milestones)
    const influencerRef = doc(dbInstance, "influencers", paymentData.influencerId)
    await updateDoc(influencerRef, {
      totalEarned: increment(paymentData.rewardAmount),
      updatedAt: serverTimestamp(),
    })

    return NextResponse.json({
      success: true,
      message: "Payment marked as paid and influencer earnings updated",
    })
  } catch (error: any) {
    console.error("Error updating payment:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

