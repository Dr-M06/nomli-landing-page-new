# Influencer Program Implementation Guide

## Quick Start

This guide shows you how to implement the complete referral tracking system.

## 1. Code Generation Flow

### Step 1: Generate Code When Influencer is Approved

```typescript
// In your influencer approval process
import { generateReferralCode } from "@/lib/referral-code"

async function approveInfluencer(influencerId: string, email: string) {
  // Generate code
  const response = await fetch("/api/influencer/generate-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ influencerId, email })
  })
  
  const { code, referralLink } = await response.json()
  
  // Save to database
  await db.influencers.update({
    where: { id: influencerId },
    data: { referralCode: code, referralLink }
  })
  
  // Send email to influencer with their link
  await sendEmail(email, {
    subject: "Your Nomli Mingle Referral Link",
    body: `Your referral link: ${referralLink}`
  })
}
```

## 2. User Signup Flow

### Step 1: User Visits Invite Link

User clicks: `https://nomlimingle.com/invite/NOMLI-ABC123`

The invite page automatically:
- Validates the code
- Stores it in localStorage: `nomli_referral_code = "NOMLI-ABC123"`
- Shows welcome page with download button

### Step 2: User Downloads App

When user opens the app for the first time, check for referral code:

```typescript
// In your mobile app (React Native / Flutter)
const referralCode = localStorage.getItem("nomli_referral_code")
// or read from deep link if app was opened via link
```

### Step 3: Track Signup

When user creates account in the app:

```typescript
// In your signup API handler
async function handleSignup(userData) {
  // Create user account
  const user = await createUser(userData)
  
  // Check for referral code
  const referralCode = userData.referralCode || 
                       localStorage.getItem("nomli_referral_code")
  
  if (referralCode) {
    // Track the signup
    await fetch("/api/track/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        referralCode: referralCode,
        email: user.email,
        signupMethod: "mobile" // or "web"
      })
    })
  }
  
  return user
}
```

## 3. Activity Tracking

### Track User Actions

When user performs actions in the app, track them:

```typescript
// When user uploads profile photo
await fetch("/api/track/activity", {
  method: "POST",
  body: JSON.stringify({
    userId: user.id,
    activityType: "photo_upload"
  })
})

// When user updates bio
await fetch("/api/track/activity", {
  method: "POST",
  body: JSON.stringify({
    userId: user.id,
    activityType: "bio_update"
  })
})

// When user posts a story
await fetch("/api/track/activity", {
  method: "POST",
  body: JSON.stringify({
    userId: user.id,
    activityType: "story_post"
  })
})

// When user creates community post
await fetch("/api/track/activity", {
  method: "POST",
  body: JSON.stringify({
    userId: user.id,
    activityType: "community_post"
  })
})
```

### Backend Activity Handler

The activity endpoint automatically:
1. Checks if user meets all 4 requirements
2. If user becomes "active":
   - Updates referral status to "active"
   - Increments influencer's activeUsers count
   - Decrements pendingUsers count
   - Checks for milestone achievements
   - Sends notification to influencer

## 4. Database Schema

### Required Tables

```sql
-- Influencers table
CREATE TABLE influencers (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  referral_code VARCHAR(50) UNIQUE NOT NULL,
  referral_link TEXT NOT NULL,
  total_signups INT DEFAULT 0,
  active_users INT DEFAULT 0,
  pending_users INT DEFAULT 0,
  total_earned DECIMAL(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Referrals table (links users to influencers)
CREATE TABLE referrals (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  influencer_id VARCHAR(255) NOT NULL,
  referral_code VARCHAR(50) NOT NULL,
  status ENUM('pending', 'active', 'inactive') DEFAULT 'pending',
  signup_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  activation_date TIMESTAMP NULL,
  FOREIGN KEY (influencer_id) REFERENCES influencers(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY unique_user_referral (user_id)
);

-- Milestone payments table
CREATE TABLE milestone_payments (
  id VARCHAR(255) PRIMARY KEY,
  influencer_id VARCHAR(255) NOT NULL,
  milestone_threshold INT NOT NULL,
  reward_amount DECIMAL(10, 2) NOT NULL,
  active_users_count INT NOT NULL,
  payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (influencer_id) REFERENCES influencers(id)
);

-- User activity tracking (optional, for analytics)
CREATE TABLE user_activity_log (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 5. Environment Variables

Add to your `.env` file:

```env
NEXT_PUBLIC_BASE_URL=https://nomlimingle.com
DATABASE_URL=your_database_url
```

## 6. Complete Implementation Example

### Backend: Activity Tracking Handler

```typescript
// app/api/track/activity/route.ts (complete implementation)

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db" // Your database client

export async function POST(request: NextRequest) {
  try {
    const { userId, activityType } = await request.json()

    // Get user
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get referral info
    const referral = await db.referral.findUnique({ 
      where: { userId },
      include: { influencer: true }
    })

    if (!referral) {
      return NextResponse.json({ 
        success: true, 
        message: "No referral to track" 
      })
    }

    // Check current status
    const hasPhoto = !!user.profilePhoto
    const hasBio = !!(user.bio && user.bio.length > 0)
    const storyCount = await db.story.count({ where: { userId } })
    const communityPostCount = await db.post.count({ 
      where: { userId, type: "community" } 
    })

    // Check if user is now active
    const isActive = hasPhoto && hasBio && storyCount >= 1 && communityPostCount >= 1

    // If user just became active
    if (isActive && referral.status === "pending") {
      // Update referral
      await db.referral.update({
        where: { id: referral.id },
        data: { 
          status: "active",
          activationDate: new Date()
        }
      })

      // Update influencer stats
      await db.influencer.update({
        where: { id: referral.influencerId },
        data: {
          activeUsers: { increment: 1 },
          pendingUsers: { decrement: 1 }
        }
      })

      // Check milestones
      const influencer = await db.influencer.findUnique({
        where: { id: referral.influencerId }
      })

      const milestones = [
        { threshold: 5, reward: 7 },
        { threshold: 10, reward: 13 },
        { threshold: 20, reward: 34 }
      ]

      for (const milestone of milestones) {
        if (influencer.activeUsers === milestone.threshold) {
          // Create milestone payment record
          await db.milestonePayment.create({
            data: {
              influencerId: influencer.id,
              milestoneThreshold: milestone.threshold,
              rewardAmount: milestone.reward,
              activeUsersCount: influencer.activeUsers,
              paymentStatus: "pending"
            }
          })

          // Update total earned
          await db.influencer.update({
            where: { id: influencer.id },
            data: {
              totalEarned: { increment: milestone.reward }
            }
          })

          // TODO: Send payment to influencer
          // TODO: Send notification
        }
      }
    }

    return NextResponse.json({
      success: true,
      isActive,
      requirements: { hasPhoto, hasBio, storyCount, communityPostCount }
    })
  } catch (error) {
    console.error("Error tracking activity:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

## 7. Testing the Flow

### Test Referral Code Generation
```bash
curl -X POST http://localhost:3000/api/influencer/generate-code \
  -H "Content-Type: application/json" \
  -d '{"influencerId": "inf_123", "email": "test@example.com"}'
```

### Test Signup Tracking
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

### Test Activity Tracking
```bash
curl -X POST http://localhost:3000/api/track/activity \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "activityType": "photo_upload"
  }'
```

## 8. Mobile App Integration

### React Native Example

```typescript
// In your React Native app
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Linking } from 'react-native'

// Handle deep links
Linking.addEventListener('url', (event) => {
  const url = event.url
  const code = url.match(/\/invite\/([A-Z0-9-]+)/)?.[1]
  if (code) {
    AsyncStorage.setItem('nomli_referral_code', code)
  }
})

// On signup
async function signup(userData) {
  const referralCode = await AsyncStorage.getItem('nomli_referral_code')
  
  const response = await fetch('https://nomlimingle.com/api/track/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: user.id,
      referralCode,
      email: user.email,
      signupMethod: 'mobile'
    })
  })
}
```

## 9. Security Considerations

1. **Validate referral codes** - Always validate format and existence
2. **Prevent self-referrals** - Check if user is trying to use their own code
3. **Rate limiting** - Limit API calls to prevent abuse
4. **Fraud detection** - Track IP addresses, device fingerprints
5. **Code expiration** - Optionally expire codes after certain period
6. **One referral per user** - Prevent multiple referrals for same user

## 10. Next Steps

1. Implement database models using your ORM (Prisma, Drizzle, etc.)
2. Set up background jobs for milestone payments
3. Add email notifications for influencers
4. Create admin dashboard to manage influencers
5. Add analytics and reporting
6. Implement payment processing for rewards

