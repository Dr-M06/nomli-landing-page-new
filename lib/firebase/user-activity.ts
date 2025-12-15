import { 
  collection, 
  doc, 
  getDoc, 
  query, 
  where, 
  getDocs,
  count,
  Timestamp
} from "firebase/firestore"
import { db, getDb } from "./config"
import { getReferralByUserId, activateReferral } from "./influencers"

// Helper to get db instance (works on both server and client)
const getDbInstance = () => {
  return db || getDb()
}

const USERS_COLLECTION = "users"
const STORIES_COLLECTION = "stories"
const POSTS_COLLECTION = "posts"

export interface UserActivityStatus {
  hasPhoto: boolean
  hasBio: boolean
  storyCount: number
  communityPostCount: number
  isActive: boolean
}

/**
 * Check if user meets all active requirements
 */
export async function checkUserActiveStatus(userId: string): Promise<UserActivityStatus> {
  const dbInstance = getDbInstance()
  if (!dbInstance) {
    throw new Error("Firebase not initialized. Please set up Firebase environment variables in .env.local")
  }
  // Get user document
  const userRef = doc(dbInstance, USERS_COLLECTION, userId)
  const userSnap = await getDoc(userRef)

  if (!userSnap.exists()) {
    throw new Error("User not found")
  }

  const userData = userSnap.data()

  // Check profile photo
  const hasPhoto = !!userData.profilePhoto || !!userData.photo

  // Check bio
  const hasBio = !!(userData.bio && userData.bio.length > 0)

  // Count stories
  const storiesQuery = query(
    collection(getDbInstance(), STORIES_COLLECTION),
    where("userId", "==", userId)
  )
  const storiesSnap = await getDocs(storiesQuery)
  const storyCount = storiesSnap.size

  // Count community posts
  const postsQuery = query(
    collection(getDbInstance(), POSTS_COLLECTION),
    where("userId", "==", userId),
    where("type", "==", "community")
  )
  const postsSnap = await getDocs(postsQuery)
  const communityPostCount = postsSnap.size

  // Check if user is active
  const isActive = hasPhoto && hasBio && storyCount >= 1 && communityPostCount >= 1

  return {
    hasPhoto,
    hasBio,
    storyCount,
    communityPostCount,
    isActive,
  }
}

/**
 * Track user activity and activate referral if user becomes active
 */
export async function trackUserActivity(
  userId: string,
  activityType: "photo_upload" | "bio_update" | "story_post" | "community_post"
): Promise<{ isActive: boolean; requirements: UserActivityStatus }> {
  // Check current status
  const status = await checkUserActiveStatus(userId)

  // Get referral
  const referral = await getReferralByUserId(userId)

  // If user just became active and referral is pending
  if (status.isActive && referral && referral.status === "pending") {
    await activateReferral(referral.id, userId)
  }

  return {
    isActive: status.isActive,
    requirements: status,
  }
}

