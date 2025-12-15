import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebase/config"
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore"

/**
 * Test Firebase connection
 * GET /api/test-firebase
 */
export async function GET(request: NextRequest) {
  try {
    // Test 1: Check if Firestore is accessible
    const testCollection = collection(db, "_test")
    const testDocRef = doc(testCollection, "connection-test")

    // Test 2: Write a test document
    await setDoc(testDocRef, {
      timestamp: new Date().toISOString(),
      message: "Firebase connection test",
    })

    // Test 3: Read the test document
    const testSnap = await getDocs(testCollection)
    const testData = testSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Test 4: Clean up test document
    await deleteDoc(testDocRef)

    return NextResponse.json({
      success: true,
      message: "Firebase connection successful!",
      test: {
        write: "✅ Success",
        read: "✅ Success",
        cleanup: "✅ Success",
        data: testData,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Firebase connection test failed:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Firebase connection failed",
        details: error.code || "Unknown error",
        hint: "Check your Firebase configuration and environment variables",
      },
      { status: 500 }
    )
  }
}

