# Apple IAP Webhook (Server Notifications)

Handles **App Store Server Notifications v2** from Apple, including **REFUND** events for consumable IAP.

## What it does

- **REFUND**: When a customer is refunded by Apple, this function:
  - Finds the original purchase in `wallet_transactions` by `reference_id` = Apple `originalTransactionId`
  - Deducts the token amount from `user_wallets`
  - Inserts a `refund` row in `wallet_transactions`
  - Sets `token_purchases.status` to `'refunded'` for that purchase

- Other notification types (e.g. SUBSCRIBED, DID_CHANGE_RENEWAL_PREF) are acknowledged with `200` but not processed.

## Setup in App Store Connect

1. Open [App Store Connect](https://appstoreconnect.apple.com) → your app → **App Information**.
2. Under **App Store Server Notifications**, set:
   - **Production Server URL**:  
     `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/apple-iap-webhook`
   - **Sandbox Server URL**:  
     Same URL (or a separate one if you use a different project for sandbox).
3. Save. Apple will send a test notification; you can confirm in Supabase → Edge Functions → `apple-iap-webhook` → Logs.

Example: if your Supabase project URL is `https://abcdefgh.supabase.co`, use:
`https://abcdefgh.supabase.co/functions/v1/apple-iap-webhook`.

## Deploy

```bash
supabase functions deploy apple-iap-webhook
```

## Security note

The request body is a signed JWT from Apple. This function decodes the payload to process refunds. For production you may want to add full signature verification using Apple’s root certificate (see [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi)).
