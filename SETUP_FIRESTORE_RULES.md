# Quick Setup: Firestore Security Rules

## ⚠️ IMPORTANT: Copy Rules to Firebase Console

The `firestore.rules` file in your project is just a reference. You **MUST** copy these rules to Firebase Console for them to take effect.

## Steps to Fix "Missing or insufficient permissions" Error:

### 1. Open Firebase Console
- Go to: https://console.firebase.google.com/
- Select your project

### 2. Navigate to Firestore Rules
- Click **Firestore Database** in the left menu
- Click the **Rules** tab at the top

### 3. Copy Rules from `firestore.rules` File
- Open `firestore.rules` in your project
- Copy ALL the content
- Paste it into the Firebase Console Rules editor

### 4. Publish Rules
- Click **Publish** button
- Wait for confirmation

### 5. Test
- Try submitting the influencer form again
- The permission error should be resolved

## Current Rules (from firestore.rules)

The rules allow:
- ✅ Server-side writes (API routes) - `request.auth == null`
- ✅ Authenticated users creating their own records
- ✅ Reads from server (for queries/checks)
- ✅ Users reading their own data

## Why This Works

API routes use the Firebase client SDK on the server side, which means:
- No authenticated user context (`request.auth == null`)
- Rules need to explicitly allow `request.auth == null` for server-side operations
- This is a development setup - use Firebase Admin SDK in production

## After Publishing Rules

Once you publish the rules, the influencer signup should work without permission errors.

