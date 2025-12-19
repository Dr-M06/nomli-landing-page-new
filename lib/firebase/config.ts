import { initializeApp, getApps, FirebaseApp } from "firebase/app"
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore"
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth"

// Validate Firebase config
const requiredEnvVars = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
]

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])

if (missingVars.length > 0 && typeof window === "undefined") {
  const errorMessage = `
⚠️  MISSING FIREBASE ENVIRONMENT VARIABLES ⚠️

Missing variables: ${missingVars.join(", ")}

Please create a .env.local file in your project root with the following:

NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

See FIREBASE_SETUP.md for detailed instructions.
`
  console.error(errorMessage)
  
  // Don't throw error, but log it clearly
  if (process.env.NODE_ENV === "production") {
    throw new Error("Firebase environment variables are required in production")
  }
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "dummy-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "dummy-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "dummy.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:dummy",
}

// Initialize Firebase
let app: FirebaseApp | null = null
if (getApps().length === 0) {
  try {
    // Only initialize if we have at least the project ID
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      app = initializeApp(firebaseConfig)
      // Only log in development to avoid exposing info in production
      if (process.env.NODE_ENV === "development") {
        console.log("✅ Firebase initialized successfully")
      }
    } else {
      if (process.env.NODE_ENV === "development") {
        console.warn("⚠️ Firebase not initialized - missing environment variables")
      }
    }
  } catch (error: any) {
    console.error("❌ Firebase initialization error:", error.message)
    if (process.env.NODE_ENV === "production") {
      throw error
    }
  }
} else {
  app = getApps()[0]
}

// Initialize services only if app is initialized
// Note: Firestore can be used on server (API routes), but Auth should only be used on client
let _db: ReturnType<typeof getFirestore> | null = null
let _auth: ReturnType<typeof getAuth> | null = null

export const getDb = () => {
  if (!app) return null as any
  if (!_db) _db = getFirestore(app)
  return _db
}

export const getAuthInstance = () => {
  // Auth should only be used on client side
  if (typeof window === "undefined") return null as any
  if (!app) return null as any
  if (!_auth) _auth = getAuth(app)
  return _auth
}

// Export for use in API routes (server-side) and client components
// db can be used on both server and client
// auth should only be used on client
export const db = app ? getDb() : null as any
export const auth = typeof window !== "undefined" && app ? getAuthInstance() : null as any

if (!app && typeof window === "undefined" && process.env.NODE_ENV === "development") {
  console.warn("⚠️ Firestore not available - Firebase not initialized")
}

// Connect to emulator in development if needed (only on client)
if (typeof window !== "undefined" && app && process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
  try {
    const dbInstance = getDb()
    if (dbInstance) {
      connectFirestoreEmulator(dbInstance, "localhost", 8080)
      console.log("🔧 Connected to Firestore emulator")
    }
    const authInstance = getAuthInstance()
    if (authInstance) {
      connectAuthEmulator(authInstance, "http://localhost:9099")
      console.log("🔧 Connected to Auth emulator")
    }
  } catch (error) {
    // Emulator already connected
  }
}

export default app

