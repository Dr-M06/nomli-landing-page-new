import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  getDocs,
  increment,
  serverTimestamp,
  Timestamp,
  FieldValue
} from "firebase/firestore"
import { db, getDb } from "./config"
import { generateReferralCode } from "@/lib/referral-code"

// Helper to get db instance (works on both server and client)
const getDbInstance = () => {
  return db || getDb()
}

const INFLUENCERS_COLLECTION = "influencers"
const REFERRALS_COLLECTION = "referrals"
const MILESTONE_PAYMENTS_COLLECTION = "milestone_payments"

export interface Influencer {
  id: string
  name: string
  email: string
  referralCode: string
  referralLink: string
  totalSignups: number
  activeUsers: number
  pendingUsers: number
  totalEarned: number
  isActive: boolean
  createdAt: Timestamp | FieldValue
  updatedAt: Timestamp | FieldValue
}

export interface Referral {
  id: string
  userId: string
  influencerId: string
  referralCode: string
  status: "pending" | "active" | "inactive"
  signupDate: Timestamp | FieldValue
  activationDate?: Timestamp | FieldValue
}

export interface MilestonePayment {
  id: string
  influencerId: string
  milestoneThreshold: number
  rewardAmount: number
  activeUsersCount: number
  paymentStatus: "pending" | "paid" | "failed"
  paidAt?: Timestamp | FieldValue
  createdAt: Timestamp | FieldValue
}

/**
 * Generate and save referral code for influencer
 */
export async function createInfluencerReferralCode(
  influencerId: string,
  email: string,
  name: string
): Promise<{ code: string; referralLink: string }> {
  const dbInstance = getDbInstance()
  if (!dbInstance) {
    throw new Error("Firebase not initialized. Please set up Firebase environment variables in .env.local")
  }
  
  // Check if influencer already has a code
  const influencerRef = doc(dbInstance, INFLUENCERS_COLLECTION, influencerId)
  const influencerSnap = await getDoc(influencerRef)

  if (influencerSnap.exists() && influencerSnap.data().referralCode) {
    const data = influencerSnap.data()
    return {
      code: data.referralCode,
      referralLink: data.referralLink,
    }
  }

  // Generate unique code
  let code = generateReferralCode()
  let attempts = 0
  const maxAttempts = 10

  // Ensure code is unique
  while (attempts < maxAttempts) {
    const codeQuery = query(
      collection(getDbInstance(), INFLUENCERS_COLLECTION),
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
    throw new Error("Failed to generate unique referral code")
  }

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nomlimingle.com").trim().replace(/\/$/, "")
  const referralLink = `${baseUrl}/invite/${code}`.trim()

  // Save influencer
  await setDoc(influencerRef, {
    id: influencerId,
    name,
    email,
    referralCode: code,
    referralLink,
    totalSignups: 0,
    activeUsers: 0,
    pendingUsers: 0,
    totalEarned: 0,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as Omit<Influencer, "createdAt" | "updatedAt">)

  return { code, referralLink }
}

/**
 * Get influencer by referral code
 */
export async function getInfluencerByCode(referralCode: string): Promise<Influencer | null> {
  const dbInstance = getDbInstance()
  if (!dbInstance) {
    throw new Error("Firebase not initialized. Please set up Firebase environment variables in .env.local")
  }
  const q = query(
    collection(dbInstance, INFLUENCERS_COLLECTION),
    where("referralCode", "==", referralCode),
    where("isActive", "==", true)
  )
  const querySnapshot = await getDocs(q)

  if (querySnapshot.empty) {
    return null
  }

  const doc = querySnapshot.docs[0]
  return { id: doc.id, ...doc.data() } as Influencer
}

/**
 * Get influencer by ID
 */
export async function getInfluencerById(influencerId: string): Promise<Influencer | null> {
  const dbInstance = getDbInstance()
  if (!dbInstance) {
    throw new Error("Firebase not initialized. Please set up Firebase environment variables in .env.local")
  }
  const influencerRef = doc(dbInstance, INFLUENCERS_COLLECTION, influencerId)
  const influencerSnap = await getDoc(influencerRef)

  if (!influencerSnap.exists()) {
    return null
  }

  return { id: influencerSnap.id, ...influencerSnap.data() } as Influencer
}

/**
 * Track user signup with referral code
 */
export async function trackSignup(
  userId: string,
  referralCode: string,
  email: string,
  signupMethod: "web" | "mobile"
): Promise<Referral> {
  const dbInstance = getDbInstance()
  if (!dbInstance) {
    throw new Error("Firebase not initialized. Please set up Firebase environment variables in .env.local")
  }
  // Get influencer
  const influencer = await getInfluencerByCode(referralCode)
  if (!influencer) {
    throw new Error("Invalid or inactive referral code")
  }

  // Check if referral already exists
  const referralQuery = query(
    collection(getDbInstance(), REFERRALS_COLLECTION),
    where("userId", "==", userId)
  )
  const existingReferrals = await getDocs(referralQuery)

  if (!existingReferrals.empty) {
    const existing = existingReferrals.docs[0]
    return { id: existing.id, ...existing.data() } as Referral
  }

  // Create referral
  const referralRef = doc(collection(getDbInstance(), REFERRALS_COLLECTION))
  const referralData = {
    userId,
    influencerId: influencer.id,
    referralCode,
    status: "pending" as const,
    signupDate: serverTimestamp(),
  }

  await setDoc(referralRef, referralData)

  // Update influencer stats
  const influencerRef = doc(getDbInstance(), INFLUENCERS_COLLECTION, influencer.id)
  await updateDoc(influencerRef, {
    totalSignups: increment(1),
    pendingUsers: increment(1),
    updatedAt: serverTimestamp(),
  })

  return {
    id: referralRef.id,
    userId,
    influencerId: influencer.id,
    referralCode,
    status: "pending" as const,
    signupDate: referralData.signupDate,
  } as Referral
}

/**
 * Update referral status to active
 */
export async function activateReferral(referralId: string, userId: string): Promise<void> {
  const referralRef = doc(getDbInstance(), REFERRALS_COLLECTION, referralId)
  await updateDoc(referralRef, {
    status: "active",
    activationDate: serverTimestamp(),
  })

  // Get influencer ID
  const referralSnap = await getDoc(referralRef)
  const referralData = referralSnap.data() as Referral
  const influencerId = referralData.influencerId

  // Update influencer stats
  const influencerRef = doc(getDbInstance(), INFLUENCERS_COLLECTION, influencerId)
  await updateDoc(influencerRef, {
    activeUsers: increment(1),
    pendingUsers: increment(-1),
    updatedAt: serverTimestamp(),
  })

  // Check for milestones
  await checkMilestones(influencerId)
}

/**
 * Check and update milestones for influencer
 */
export async function checkMilestones(influencerId: string): Promise<void> {
  const influencer = await getInfluencerById(influencerId)
  if (!influencer) return

  const milestones = [
    { threshold: 5, reward: 7 },
    { threshold: 10, reward: 13 },
    { threshold: 20, reward: 34 },
  ]

  for (const milestone of milestones) {
    // Check if milestone was just reached
    if (influencer.activeUsers === milestone.threshold) {
      // Check if milestone payment already exists
      const milestoneQuery = query(
        collection(getDbInstance(), MILESTONE_PAYMENTS_COLLECTION),
        where("influencerId", "==", influencerId),
        where("milestoneThreshold", "==", milestone.threshold)
      )
      const existingMilestones = await getDocs(milestoneQuery)

      if (existingMilestones.empty) {
          // Create milestone payment record (only if it doesn't exist)
          const paymentQuery = query(
            collection(getDbInstance(), MILESTONE_PAYMENTS_COLLECTION),
            where("influencerId", "==", influencerId),
            where("milestoneThreshold", "==", milestone.threshold)
          )
          const existingPayments = await getDocs(paymentQuery)

          if (existingPayments.empty) {
            const paymentRef = doc(collection(getDbInstance(), MILESTONE_PAYMENTS_COLLECTION))
            await setDoc(paymentRef, {
              influencerId,
              milestoneThreshold: milestone.threshold,
              rewardAmount: milestone.reward,
              activeUsersCount: influencer.activeUsers,
              paymentStatus: "pending", // Manual payment - admin will mark as paid
              createdAt: serverTimestamp(),
            })
          }

        // Don't update totalEarned here - it will be updated when admin marks payment as paid
        // This keeps totalEarned accurate (only counts paid milestones)
      }
    }
  }
}

/**
 * Get referral by user ID
 */
export async function getReferralByUserId(userId: string): Promise<Referral | null> {
  const q = query(
    collection(getDbInstance(), REFERRALS_COLLECTION),
    where("userId", "==", userId)
  )
  const querySnapshot = await getDocs(q)

  if (querySnapshot.empty) {
    return null
  }

  const doc = querySnapshot.docs[0]
  return { id: doc.id, ...doc.data() } as Referral
}

/**
 * Get influencer dashboard data
 */
export async function getInfluencerDashboard(influencerId: string) {
  const influencer = await getInfluencerById(influencerId)
  if (!influencer) {
    throw new Error("Influencer not found")
  }

  // Ensure referral link is properly formatted
  let referralLink = influencer.referralLink?.trim() || ""
  if (!referralLink && influencer.referralCode) {
    // Regenerate link if missing
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nomlimingle.com").trim().replace(/\/$/, "")
    referralLink = `${baseUrl}/invite/${influencer.referralCode}`.trim()
    
    // Update in database
    const influencerRef = doc(getDbInstance(), INFLUENCERS_COLLECTION, influencerId)
    await updateDoc(influencerRef, {
      referralLink,
      updatedAt: serverTimestamp(),
    })
  } else if (referralLink && !referralLink.startsWith("http")) {
    // Ensure protocol is present
    referralLink = `https://${referralLink}`.trim()
  }

  // Get all referrals for this influencer
  const referralsQuery = query(
    collection(getDbInstance(), REFERRALS_COLLECTION),
    where("influencerId", "==", influencerId)
  )
  const referralsSnap = await getDocs(referralsQuery)
  const referrals = referralsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Referral[]

  // Get milestone payments
  const paymentsQuery = query(
    collection(db, MILESTONE_PAYMENTS_COLLECTION),
    where("influencerId", "==", influencerId)
  )
  const paymentsSnap = await getDocs(paymentsQuery)
  const payments = paymentsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as MilestonePayment[]

  // Calculate milestones status
  const milestones = [
    { threshold: 5, reward: 7 },
    { threshold: 10, reward: 13 },
    { threshold: 20, reward: 34 },
  ].map((milestone) => {
    const payment = payments.find((p) => p.milestoneThreshold === milestone.threshold)
    return {
      users: milestone.threshold,
      reward: `$${milestone.reward}`,
      achieved: influencer.activeUsers >= milestone.threshold,
      achievedDate: payment?.createdAt && payment.createdAt instanceof Timestamp 
        ? payment.createdAt.toDate().toISOString() 
        : undefined,
      progress: influencer.activeUsers,
      color: milestone.threshold === 5 ? "#8b5cf6" : milestone.threshold === 10 ? "#06b6d4" : "#10b981",
      paymentStatus: payment?.paymentStatus || (influencer.activeUsers >= milestone.threshold ? "pending" : undefined),
    }
  })

  // Get recent activity (last 10 referrals)
  const recentReferrals = referrals
    .sort((a, b) => {
      const aDate = a.signupDate instanceof Timestamp ? a.signupDate.toMillis() : 0
      const bDate = b.signupDate instanceof Timestamp ? b.signupDate.toMillis() : 0
      return bDate - aDate
    })
    .slice(0, 10)
    .map((ref) => ({
      userId: ref.userId,
      status: ref.status,
      date: ref.signupDate && ref.signupDate instanceof Timestamp
        ? ref.signupDate.toDate().toLocaleDateString()
        : "Unknown",
      reward: ref.status === "active" ? "$7" : null,
    }))

  return {
    referralCode: influencer.referralCode,
    referralLink: referralLink || influencer.referralLink,
    totalSignups: influencer.totalSignups,
    activeUsers: influencer.activeUsers,
    pendingUsers: influencer.pendingUsers,
    totalEarned: `$${influencer.totalEarned}`,
    nextMilestone: {
      target: milestones.find((m) => !m.achieved)?.users || 20,
      current: influencer.activeUsers,
      reward: milestones.find((m) => !m.achieved)?.reward || "$34",
      progress: Math.round((influencer.activeUsers / (milestones.find((m) => !m.achieved)?.users || 20)) * 100),
    },
    milestones,
    recentActivity: recentReferrals,
  }
}

