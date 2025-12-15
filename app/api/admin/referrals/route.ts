import { NextRequest, NextResponse } from "next/server"
import { db, getDb } from "@/lib/firebase/config"
import { collection, getDocs, query, orderBy, Timestamp } from "firebase/firestore"

// Helper to get db instance
const getDbInstance = () => {
  return db || getDb()
}

/**
 * Get all referrals (Admin only)
 * GET /api/admin/referrals
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

    // Fetch all referrals
    const referralsQuery = query(
      collection(dbInstance, "referrals"),
      orderBy("signupDate", "desc")
    )
    const snapshot = await getDocs(referralsQuery)

    const referrals = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        signupDate: data.signupDate instanceof Timestamp 
          ? data.signupDate.toDate().toISOString() 
          : data.signupDate,
        activatedAt: data.activatedAt instanceof Timestamp 
          ? data.activatedAt?.toDate().toISOString() 
          : data.activatedAt,
      }
    })

    return NextResponse.json({
      success: true,
      data: referrals,
      count: referrals.length,
      activeCount: referrals.filter((r) => r.status === "active").length,
      pendingCount: referrals.filter((r) => r.status === "pending").length,
    })
  } catch (error: any) {
    console.error("Error fetching referrals:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

