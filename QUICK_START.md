# Quick Start - Fix Firebase Error

## The Error
```
Firebase: Error (auth/invalid-api-key)
```

This happens because Firebase environment variables are not set up.

## Quick Fix (5 minutes)

### Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Name it "Nomli Mingle" (or any name)
4. Click through the setup (Analytics optional)

### Step 2: Enable Firestore
1. In Firebase Console, click "Firestore Database"
2. Click "Create database"
3. Choose "Start in production mode"
4. Select a location (choose closest to your users)
5. Click "Enable"

### Step 3: Get Your Config
1. Click the gear icon ⚙️ → "Project settings"
2. Scroll to "Your apps" section
3. Click the web icon `</>`
4. Register app: "Nomli Web"
5. Copy the config values

### Step 4: Create `.env.local` File
Create a file named `.env.local` in your project root (same folder as `package.json`):

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...your_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abc123def456
NEXT_PUBLIC_BASE_URL=https://nomlimingle.com
```

**Replace all values with your actual Firebase config values!**

### Step 5: Restart Dev Server
1. Stop your dev server (Ctrl+C)
2. Start it again: `npm run dev`

The error should be gone! ✅

## Need Help?

See `FIREBASE_SETUP.md` for detailed instructions.
