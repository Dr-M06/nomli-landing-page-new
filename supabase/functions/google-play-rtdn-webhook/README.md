# Google Play RTDN Webhook

Handles **Real-Time Developer Notifications** from Google Play via Cloud Pub/Sub push. Processes **refunds** for one-time consumable token purchases.

## What it does

- **OneTimeProductNotification** with `notificationType: 2` (CANCELED)
- **VoidedPurchaseNotification** (refunds, chargebacks)

On refund:
- Finds the original purchase in `wallet_transactions` by `reference_id` = `purchaseToken`
- Deducts the token amount from `user_wallets`
- Inserts a `refund` row in `wallet_transactions`
- Sets `token_purchases.status` to `'refunded'` for that purchase

Other notification types (e.g. `ONE_TIME_PRODUCT_PURCHASED`, subscription events) are acknowledged with `200` but not processed.

## Setup

### 1. Google Cloud – Pub/Sub topic

1. [Google Cloud Console](https://console.cloud.google.com/) → **Pub/Sub** → **Topics**
2. **Create topic** → Topic ID: e.g. `play-rtdn` → **Create**

### 2. Grant Google Play publish rights

1. Open your topic → **Permissions** (or IAM)
2. **Add principal**: `google-play-developer-notifications@system.gserviceaccount.com`
3. Role: **Pub/Sub Publisher**
4. **Save**

### 3. Create push subscription

1. **Pub/Sub** → **Subscriptions** → **Create subscription**
2. **Subscription ID**: e.g. `play-rtdn-to-supabase`
3. **Topic**: select the topic from step 1
4. **Delivery type**: **Push**
5. **Endpoint URL**:
   ```
   https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/google-play-rtdn-webhook
   ```
6. **Create**

### 4. Play Console – Enable RTDN

1. [Play Console](https://play.google.com/console) → your app **Nomli Mingle**
2. **Monetize** → **Monetization setup**
3. **Real-time developer notifications**
4. **Topic name**: `projects/YOUR_GCP_PROJECT_ID/topics/YOUR_TOPIC_ID`
   - Example: `projects/team-nomli/topics/play-rtdn`
5. Enable **Subscriptions, voided purchases, and all one-time products**
6. **Save changes**
7. Use **Send test notification** to verify (requires deployed endpoint)

### 5. Deploy the function

```bash
supabase functions deploy google-play-rtdn-webhook
```

## Security

- The endpoint is public (no auth) because Pub/Sub push does not send standard auth headers by default.
- You can add a **Push subscription** verification token in GCP and validate it in the function for extra security.
- Only notifications for `com.nomli.mingle2` are processed; others are ignored.
