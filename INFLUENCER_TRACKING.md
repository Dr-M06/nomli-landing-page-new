# Influencer Program Tracking System

## Overview

This document explains how the Nomli Mingle Influencer Program tracks referrals and calculates rewards.

## Tracking Mechanism

### 1. Referral Code Generation

**Implementation:**
- Utility function: `lib/referral-code.ts`
- API endpoint: `POST /api/influencer/generate-code`
- Format: `NOMLI-XXXXXX` (6 alphanumeric characters, excludes confusing chars like 0, O, I, 1)

**Process:**
1. When an influencer is approved, call the generate-code API
2. System generates a unique code (e.g., `NOMLI-ABC123`)
3. Code is validated for uniqueness against database
4. Referral link is created: `https://nomlimingle.com/invite/NOMLI-ABC123`
5. Code is stored in database linked to influencer's account

**Code Generation:**
```typescript
import { generateReferralCode } from "@/lib/referral-code"

const code = generateReferralCode() // Returns: "NOMLI-ABC123"
```

### 2. User Signup Tracking

**Implementation:**
- Invite page: `app/invite/[code]/page.tsx`
- API endpoint: `POST /api/track/signup`
- Code extraction: `lib/referral-code.ts` → `extractReferralCodeFromUrl()`

**Process:**
1. User clicks referral link: `https://nomlimingle.com/invite/NOMLI-ABC123`
2. Invite page (`/invite/[code]`) loads and:
   - Validates the referral code format
   - Stores code in `localStorage` and `sessionStorage`
   - Shows welcome message with download CTA
3. When user downloads app and signs up:
   - App reads referral code from localStorage
   - Sends signup request to `POST /api/track/signup` with:
     ```json
     {
       "userId": "user_123",
       "referralCode": "NOMLI-ABC123",
       "email": "user@example.com",
       "signupMethod": "mobile"
     }
     ```
4. Backend:
   - Validates referral code exists and is active
   - Creates referral relationship in database
   - Updates influencer stats (totalSignups++, pendingUsers++)
   - Returns success response

**Database Schema:**
```sql
users:
  - id
  - email
  - referral_code (the code used to sign up)
  - referred_by (influencer_id)
  - created_at

influencers:
  - id
  - name
  - email
  - referral_code
  - total_signups
  - active_users
  - total_earned
```

### 3. Active User Tracking

A user is considered "Active" when they complete ALL of these requirements:

1. ✅ **Profile photo uploaded** - Check if `user.profile_photo` exists
2. ✅ **Bio completed** - Check if `user.bio` is not empty
3. ✅ **At least 1 story posted** - Count `stories` table where `user_id = user.id`
4. ✅ **Community post** - Count `posts` table where `user_id = user.id` and `type = 'community'`

**Tracking Logic:**
```javascript
function checkUserActive(userId) {
  const user = getUserById(userId);
  const hasPhoto = !!user.profile_photo;
  const hasBio = user.bio && user.bio.length > 0;
  const storyCount = getStoryCount(userId);
  const communityPostCount = getCommunityPostCount(userId);
  
  return hasPhoto && hasBio && storyCount >= 1 && communityPostCount >= 1;
}
```

### 4. Milestone Calculation

**Milestones:**
- 5 Active Users → $7
- 10 Active Users → $13
- 20 Active Users → $34

**Calculation:**
```javascript
function calculateMilestones(influencerId) {
  const activeUsers = getActiveUsersByInfluencer(influencerId);
  const count = activeUsers.length;
  
  const milestones = [
    { threshold: 5, reward: 7, achieved: count >= 5 },
    { threshold: 10, reward: 13, achieved: count >= 10 },
    { threshold: 20, reward: 34, achieved: count >= 20 }
  ];
  
  return milestones;
}
```

### 5. Real-time Updates

**Webhook/Event System:**
- When a user completes an active requirement, trigger an event
- Check if user becomes "active"
- If active, update influencer's stats
- Check if new milestone is reached
- Send notification to influencer

**Example Events:**
```
user.photo_uploaded → checkActiveStatus()
user.bio_updated → checkActiveStatus()
story.created → checkActiveStatus()
post.created → checkActiveStatus()
```

## API Endpoints

### For Influencers

**Get Dashboard Stats:**
```
GET /api/influencer/dashboard
Response: {
  referralCode: "NOMLI-ABC123",
  referralLink: "https://nomlimingle.com/invite/NOMLI-ABC123",
  totalSignups: 28,
  activeUsers: 12,
  pendingUsers: 5,
  totalEarned: "$13",
  milestones: [...],
  recentActivity: [...]
}
```

**Get Referral Link:**
```
GET /api/influencer/referral-link
Response: {
  code: "NOMLI-ABC123",
  link: "https://nomlimingle.com/invite/NOMLI-ABC123"
}
```

### For Tracking

**Track Signup:**
```
POST /api/track/signup
Body: {
  referralCode: "NOMLI-ABC123",
  userId: "user_123"
}
```

**Check User Active Status:**
```
GET /api/track/active-status/:userId
Response: {
  isActive: true,
  requirements: {
    photo: true,
    bio: true,
    story: true,
    communityPost: true
  }
}
```

## Dashboard Features

### What Influencers See:

1. **Stats Overview:**
   - Total Signups
   - Active Users
   - Pending Users (signed up but not active)
   - Total Earned
   - Next Milestone Progress

2. **Referral Link:**
   - Copy-to-clipboard functionality
   - Share buttons (social media)
   - QR code generation

3. **Milestone Progress:**
   - Visual progress bars
   - Achieved milestones (with dates)
   - Pending milestones (with progress)
   - Reward amounts

4. **Recent Activity:**
   - List of recent signups
   - Status (Active/Pending)
   - When they became active
   - Rewards earned per user

## Implementation Notes

### Backend Requirements:

1. **Database Tables:**
   - `influencers` - Store influencer info and codes
   - `referrals` - Track which users were referred by which influencer
   - `user_activity` - Track user completion of active requirements
   - `milestone_payments` - Track when milestones were paid

2. **Background Jobs:**
   - Daily cron job to check pending users for active status
   - Weekly job to calculate and pay milestone rewards
   - Real-time event listeners for immediate updates

3. **Security:**
   - Validate referral codes on signup
   - Prevent self-referrals
   - Rate limiting on referral link clicks
   - Fraud detection (same IP, device fingerprinting)

### Frontend Integration:

1. **Signup Flow:**
   - Check URL for `?ref=CODE` parameter
   - Store in localStorage
   - Include in signup API call

2. **Dashboard:**
   - Real-time updates via WebSocket or polling
   - Refresh stats every 30 seconds
   - Show notifications for new milestones

3. **Mobile App:**
   - Deep linking support for referral codes
   - In-app dashboard view
   - Push notifications for milestones

## Testing

### Test Scenarios:

1. **User signs up with referral code**
   - Verify code is stored
   - Verify influencer stats update

2. **User becomes active**
   - Complete all 4 requirements
   - Verify active status updates
   - Verify influencer milestone progress

3. **Milestone reached**
   - Reach 5, 10, 20 active users
   - Verify milestone marked as achieved
   - Verify reward calculation

4. **Edge Cases:**
   - Invalid referral code
   - User signs up without code
   - User completes requirements out of order
   - Multiple influencers with same user (shouldn't happen)

## Future Enhancements

1. **Analytics:**
   - Conversion rates (signups → active)
   - Time to activation
   - Geographic distribution
   - Platform breakdown

2. **Gamification:**
   - Leaderboards
   - Badges for achievements
   - Streak bonuses

3. **Advanced Tracking:**
   - Click tracking on referral links
   - Conversion funnel analysis
   - A/B testing different referral messages

