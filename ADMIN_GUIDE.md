# Admin Dashboard Guide

## Overview

The admin dashboard allows you to:
1. **Review and approve influencer applications**
2. **Track all influencer progress**
3. **Manage milestone payments manually**
4. **View comprehensive statistics**

## Access

Navigate to: `https://nomlimingle.com/admin`

## Features

### 1. Influencer Management

**View All Influencers:**
- See all applications (pending, approved, rejected)
- View influencer details (name, email, platform, followers)
- See their referral code and link (if approved)
- View their stats (signups, active users, earnings)

**Actions:**
- **Approve**: Generates unique referral code and activates influencer
- **Reject**: Marks application as rejected
- **View Dashboard**: Opens influencer's personal dashboard
- **Copy Link**: Copies referral link to clipboard

### 2. Payment Management

**View All Payments:**
- See all milestone payments (pending, paid, failed)
- Filter by status
- View payment details (influencer, amount, milestone)

**Actions:**
- **Mark as Paid**: Manually mark payment as paid
  - Updates payment status
  - Updates influencer's totalEarned
  - Records payment date

### 3. Statistics Dashboard

**Overview Cards:**
- Pending Approvals: Number of influencers awaiting approval
- Approved: Number of active influencers
- Pending Payments: Number of payments awaiting processing
- Total Paid: Sum of all paid milestone rewards

## Workflow

### Approving an Influencer

1. Go to Admin Dashboard → Influencers tab
2. Find pending influencer application
3. Review their details (platform, followers, reason)
4. Click **"Approve"**
5. System automatically:
   - Generates unique referral code (e.g., `NOMLI-ABC123`)
   - Creates referral link
   - Activates influencer account
6. Copy the referral link and send to influencer via email

### Processing a Payment

1. Go to Admin Dashboard → Payments tab
2. Find pending payment
3. Review payment details:
   - Influencer name and email
   - Milestone achieved (5, 10, or 20 active users)
   - Reward amount ($7, $13, or $34)
4. Process payment through your payment system
5. Click **"Mark as Paid"**
6. System automatically:
   - Updates payment status to "paid"
   - Records payment date
   - Updates influencer's totalEarned

## API Endpoints

### Get All Influencers
```
GET /api/admin/influencers
```

### Approve/Reject Influencer
```
POST /api/admin/influencers/approve
Body: {
  "influencerId": "inf_123",
  "action": "approve" // or "reject"
}
```

### Get All Payments
```
GET /api/admin/payments?status=pending
```

### Mark Payment as Paid
```
POST /api/admin/payments/mark-paid
Body: {
  "paymentId": "payment_123"
}
```

## Security

**Important:** Add authentication to admin routes before production:

1. Add admin authentication check in API routes
2. Protect `/admin` page with authentication
3. Use Firebase Auth or your preferred auth system

Example:
```typescript
// In API routes
const isAdmin = await checkAdminAuth(request)
if (!isAdmin) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

## Data Structure

### Influencer Status Flow
```
pending → approved (with code) → active
pending → rejected
```

### Payment Status Flow
```
pending → paid (manual by admin)
pending → failed (if payment fails)
```

## Best Practices

1. **Review applications promptly** - Respond within 48 hours
2. **Verify influencer authenticity** - Check their social media
3. **Process payments regularly** - Weekly or bi-weekly
4. **Keep records** - Export payment data for accounting
5. **Monitor for fraud** - Watch for suspicious patterns

## Troubleshooting

**Influencer not showing up?**
- Check if they're in "pending" status
- Verify they completed the signup form

**Payment not appearing?**
- Check if milestone was actually reached
- Verify user became "active" (all 4 requirements met)

**Can't approve influencer?**
- Check Firebase connection
- Verify environment variables are set
- Check browser console for errors

