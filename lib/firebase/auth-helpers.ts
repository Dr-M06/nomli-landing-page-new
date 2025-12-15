/**
 * Authentication helper functions
 * Used to check user status and redirect appropriately
 */

import { getDb } from "./config"
import { doc, getDoc } from "firebase/firestore"

/**
 * Check if a user has already submitted an influencer application
 * @param userId - Firebase Auth UID
 * @returns true if user has an influencer record, false otherwise
 */
export async function hasInfluencerApplication(userId: string): Promise<boolean> {
  try {
    const db = getDb()
    if (!db) {
      console.warn("Firebase not initialized")
      return false
    }

    const influencerRef = doc(db, "influencers", userId)
    const influencerSnap = await getDoc(influencerRef)

    return influencerSnap.exists()
  } catch (error) {
    console.error("Error checking influencer application:", error)
    return false
  }
}

/**
 * Get the appropriate redirect path after authentication
 * @param userId - Firebase Auth UID
 * @returns "/influencer/dashboard" if user has applied, "/influencer" otherwise
 */
export async function getPostAuthRedirect(userId: string): Promise<string> {
  const hasApplied = await hasInfluencerApplication(userId)
  return hasApplied ? "/influencer/dashboard" : "/influencer"
}

