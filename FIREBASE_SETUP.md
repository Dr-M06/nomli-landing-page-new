# Firebase Setup Guide for Influencer Program

## 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: "Nomli Mingle"
4. Enable Google Analytics (optional)
5. Create project

## 2. Enable Firestore Database

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Start in **production mode** (we'll add security rules)
4. Choose a location (closest to your users)
5. Enable database

## 3. Set Up Authentication (Optional)

If you want to authenticate influencers:

1. Go to "Authentication"
2. Click "Get started"
3. Enable "Email/Password" sign-in method

## 4. Get Firebase Config

1. Go to Project Settings (gear icon)
2. Scroll to "Your apps"
3. Click Web icon (`</>`)
4. Register app with nickname: "Nomli Web"
5. Copy the config object

## 5. Add Environment Variables

Create `.env.local` file in your project root:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=nomli-mingle.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=nomli-mingle
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=nomli-mingle.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
NEXT_PUBLIC_BASE_URL=https://nomlimingle.com
```

## 6. Install Firebase SDK

```bash
npm install firebase
```

## 7. Set Up Firestore Collections

The following collections will be created automatically when you use them:

### Collections Structure:

1. **influencers**
   - Document ID: `influencerId`
   - Fields:
     - `id` (string)
     - `name` (string)
     - `email` (string)
     - `referralCode` (string, unique)
     - `referralLink` (string)
     - `totalSignups` (number)
     - `activeUsers` (number)
     - `pendingUsers` (number)
     - `totalEarned` (number)
     - `isActive` (boolean)
     - `createdAt` (timestamp)
     - `updatedAt` (timestamp)

2. **referrals**
   - Document ID: auto-generated
   - Fields:
     - `userId` (string)
     - `influencerId` (string)
     - `referralCode` (string)
     - `status` (string: "pending" | "active" | "inactive")
     - `signupDate` (timestamp)
     - `activationDate` (timestamp, optional)

3. **milestone_payments**
   - Document ID: auto-generated
   - Fields:
     - `influencerId` (string)
     - `milestoneThreshold` (number: 5, 10, or 20)
     - `rewardAmount` (number)
     - `activeUsersCount` (number)
     - `paymentStatus` (string: "pending" | "paid" | "failed")
     - `paidAt` (timestamp, optional)
     - `createdAt` (timestamp)

4. **users** (your existing user collection)
   - Should have fields:
     - `profilePhoto` or `photo` (string, optional)
     - `bio` (string, optional)

5. **stories** (your existing stories collection)
   - Should have field:
     - `userId` (string)

6. **posts** (your existing posts collection)
   - Should have fields:
     - `userId` (string)
     - `type` (string, should include "community")

## 8. Firestore Security Rules

Go to Firestore Database → Rules and add:

**⚠️ IMPORTANT:** The rules below allow writes from API routes for development. For production, use Firebase Admin SDK.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Influencers collection
    match /influencers/{influencerId} {
      // Allow read if user is the influencer or influencer is active
      allow read: if isAuthenticated() && 
                     (resource.data.userId == request.auth.uid || 
                      resource.data.isActive == true);
      
      // Allow create if user is creating their own record
      allow create: if isAuthenticated() && 
                       request.resource.data.userId == request.auth.uid;
      
      // Allow update from server (API routes) - use Admin SDK in production
      allow update: if true; // Temporary for development
    }
    
    // Referrals collection
    match /referrals/{referralId} {
      // Allow read if user is the referred user or the influencer
      allow read: if isAuthenticated() && 
                     (resource.data.userId == request.auth.uid || 
                      resource.data.influencerId == request.auth.uid);
      
      // Allow create/update from server (API routes)
      allow create, update: if true; // Temporary for development
    }
    
    // Milestone payments
    match /milestone_payments/{paymentId} {
      // Allow read if user is the influencer
      allow read: if isAuthenticated() && 
                     resource.data.influencerId == request.auth.uid;
      
      // Allow create/update from server (API routes)
      allow create, update: if true; // Temporary for development
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated() && request.auth.uid == userId;
      allow write: if isAuthenticated() && request.auth.uid == userId;
    }
    
    // Stories collection
    match /stories/{storyId} {
      allow read: if true; // Public read
      allow write: if isAuthenticated() && 
                     request.resource.data.userId == request.auth.uid;
    }
    
    // Posts collection
    match /posts/{postId} {
      allow read: if true; // Public read
      allow write: if isAuthenticated() && 
                     request.resource.data.userId == request.auth.uid;
    }
  }
}
```

**Note:** 
- These rules allow writes from API routes for development/testing
- For production, implement Firebase Admin SDK for all server-side writes
- See `FIRESTORE_RULES.md` for production-ready rules and Admin SDK setup

## 9. Firebase Admin SDK (Server-Side)

For server-side operations, install Firebase Admin:

```bash
npm install firebase-admin
```

Create `lib/firebase/admin.ts`:

```typescript
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  })
}

export const adminDb = getFirestore()
```

## 10. Create Indexes

Firestore will prompt you to create indexes when needed. Common indexes:

1. **influencers** collection:
   - `referralCode` (ascending) - for code lookups

2. **referrals** collection:
   - `userId` (ascending) - for user lookups
   - `influencerId` (ascending) - for influencer dashboards
   - `status` (ascending) - for filtering

3. **milestone_payments** collection:
   - `influencerId` (ascending) + `milestoneThreshold` (ascending)

## 11. Testing

### Test Code Generation:
```bash
curl -X POST http://localhost:3000/api/influencer/generate-code \
  -H "Content-Type: application/json" \
  -d '{
    "influencerId": "inf_123",
    "email": "influencer@example.com",
    "name": "John Influencer"
  }'
```

### Test Signup Tracking:
```bash
curl -X POST http://localhost:3000/api/track/signup \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "referralCode": "NOMLI-ABC123",
    "email": "user@example.com",
    "signupMethod": "web"
  }'
```

### Test Activity Tracking:
```bash
curl -X POST http://localhost:3000/api/track/activity \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "activityType": "photo_upload"
  }'
```

### Test Dashboard:
```bash
curl http://localhost:3000/api/influencer/dashboard?influencerId=inf_123
```

## 12. Firebase Functions (Optional)

For real-time notifications and automated payments, consider Firebase Cloud Functions:

```typescript
// functions/src/index.ts
import * as functions from "firebase-functions"
import * as admin from "firebase-admin"

admin.initializeApp()

// Trigger when referral becomes active
export const onReferralActivated = functions.firestore
  .document("referrals/{referralId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data()
    const after = change.after.data()

    // Check if status changed to active
    if (before.status !== "active" && after.status === "active") {
      // Send notification to influencer
      // Process milestone payments
      // etc.
    }
  })
```

## 13. Monitoring

Set up Firebase monitoring:
1. Go to Firebase Console → Analytics
2. Enable event tracking
3. Monitor API usage in Firestore → Usage tab

## Troubleshooting

### Common Issues:

1. **"Missing or insufficient permissions"**
   - Check Firestore security rules
   - Ensure you're using Admin SDK for writes

2. **"Collection not found"**
   - Collections are created automatically on first write
   - Check your collection names match exactly

3. **"Index required"**
   - Click the link in the error to create the index
   - Wait for index to build (can take a few minutes)

4. **Environment variables not loading**
   - Restart dev server after adding `.env.local`
   - Ensure variables start with `NEXT_PUBLIC_` for client-side access

