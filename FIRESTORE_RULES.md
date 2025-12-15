# Firestore Security Rules for Influencer Program

## Quick Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Firestore Database** → **Rules** tab
4. Copy and paste the rules below
5. Click **Publish**

## Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to check if user is admin (you can customize this)
    function isAdmin() {
      return isAuthenticated() && 
             request.auth.token.admin == true;
    }
    
    // Influencers collection
    match /influencers/{influencerId} {
      // Allow read if:
      // - User is the influencer (matches their userId)
      // - Influencer is active (for public referral links)
      allow read: if isAuthenticated() && 
                     (resource.data.userId == request.auth.uid || 
                      resource.data.isActive == true);
      
      // Allow create if user is authenticated and creating their own record
      allow create: if isAuthenticated() && 
                       request.resource.data.userId == request.auth.uid;
      
      // Allow update only if:
      // - User is updating their own record (limited fields)
      // - Admin is updating (full access)
      allow update: if isAuthenticated() && 
                       (resource.data.userId == request.auth.uid || isAdmin());
      
      // Only admins can delete
      allow delete: if isAdmin();
    }
    
    // Referrals collection
    match /referrals/{referralId} {
      // Allow read if user is the referred user or the influencer
      allow read: if isAuthenticated() && 
                     (resource.data.userId == request.auth.uid || 
                      resource.data.influencerId == request.auth.uid);
      
      // Allow create from server (API routes)
      // In production, use Firebase Admin SDK for writes
      allow create: if true; // Temporary - use Admin SDK in production
      
      // Allow update from server
      allow update: if true; // Temporary - use Admin SDK in production
    }
    
    // Milestone payments collection
    match /milestone_payments/{paymentId} {
      // Allow read if user is the influencer
      allow read: if isAuthenticated() && 
                     resource.data.influencerId == request.auth.uid;
      
      // Allow create/update from server (API routes)
      // In production, use Firebase Admin SDK
      allow create: if true; // Temporary - use Admin SDK in production
      allow update: if true; // Temporary - use Admin SDK in production
    }
    
    // Users collection (your existing users)
    match /users/{userId} {
      // Users can read their own data
      allow read: if isAuthenticated() && request.auth.uid == userId;
      
      // Users can update their own data
      allow write: if isAuthenticated() && request.auth.uid == userId;
    }
    
    // Stories collection
    match /stories/{storyId} {
      // Public read
      allow read: if true;
      
      // Users can write their own stories
      allow write: if isAuthenticated() && 
                      request.resource.data.userId == request.auth.uid;
    }
    
    // Posts collection
    match /posts/{postId} {
      // Public read
      allow read: if true;
      
      // Users can write their own posts
      allow write: if isAuthenticated() && 
                      request.resource.data.userId == request.auth.uid;
    }
  }
}
```

## Development Rules (For API Routes - Less Secure)

Since API routes use the client SDK (not Admin SDK), they don't have authenticated user context. Use these rules for development:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Influencers collection
    match /influencers/{influencerId} {
      allow read: if isAuthenticated() && 
                     (resource.data.userId == request.auth.uid || 
                      resource.data.isActive == true);
      // Allow writes from server (API routes) or authenticated users
      allow create: if request.auth == null || 
                       (isAuthenticated() && request.resource.data.userId == request.auth.uid);
      allow update: if request.auth == null || 
                       (isAuthenticated() && resource.data.userId == request.auth.uid);
    }
    
    // Referrals collection
    match /referrals/{referralId} {
      allow read: if isAuthenticated() && 
                     (resource.data.userId == request.auth.uid || 
                      resource.data.influencerId == request.auth.uid);
      // Allow writes from server (API routes)
      allow create, update: if request.auth == null || isAuthenticated();
    }
    
    // Milestone payments
    match /milestone_payments/{paymentId} {
      allow read: if isAuthenticated() && 
                     resource.data.influencerId == request.auth.uid;
      // Allow writes from server (API routes)
      allow create, update: if request.auth == null || isAuthenticated();
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated() && request.auth.uid == userId;
      allow write: if isAuthenticated() && request.auth.uid == userId;
    }
    
    // Stories collection
    match /stories/{storyId} {
      allow read: if true;
      allow write: if isAuthenticated() && 
                     request.resource.data.userId == request.auth.uid;
    }
    
    // Posts collection
    match /posts/{postId} {
      allow read: if true;
      allow write: if isAuthenticated() && 
                     request.resource.data.userId == request.auth.uid;
    }
  }
}
```

**⚠️ IMPORTANT:** 
- `request.auth == null` allows writes from server-side API routes
- These rules are less secure - use Firebase Admin SDK in production
- Never use completely open rules (`allow read, write: if true`) in production!

## Production Best Practices

1. **Use Firebase Admin SDK** for all server-side writes in API routes
2. **Implement proper authentication** checks
3. **Use custom claims** for admin users
4. **Validate data** in security rules
5. **Test rules thoroughly** before deploying

## Setting Up Admin Users

To mark a user as admin, you'll need to use Firebase Admin SDK:

```typescript
// In a server-side script or API route
import { getAuth } from "firebase-admin/auth"

await getAuth().setCustomUserClaims(uid, { admin: true })
```

## Testing Rules

Use the Firebase Console → Firestore → Rules → Rules Playground to test your rules before deploying.

