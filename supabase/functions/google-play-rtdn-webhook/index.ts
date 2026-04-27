/**
 * Google Play Real-Time Developer Notifications (RTDN) webhook
 *
 * Receives purchase lifecycle notifications from Google via Cloud Pub/Sub push.
 * Handles refunds for one-time consumable products (token purchases).
 *
 * Configure:
 * 1. Create Pub/Sub topic in Google Cloud
 * 2. Create push subscription → this Edge Function URL
 * 3. Grant google-play-developer-notifications@system.gserviceaccount.com Pub/Sub Publisher on topic
 * 4. In Play Console → Monetization setup → paste topic name
 * 5. Enable "Subscriptions, voided purchases, and all one-time products"
 *
 * Refund flow: deduct tokens from user_wallets, record refund in wallet_transactions,
 * set token_purchases.status = 'refunded'.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

const PACKAGE_NAME = 'com.nomli.mingle2';

/** RTDN payload (decoded from Pub/Sub message.data) */
interface RtdnPayload {
  version?: string;
  packageName?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  oneTimeProductNotification?: {
    version?: string;
    notificationType?: number; // 1=PURCHASED, 2=CANCELED
    purchaseToken?: string;
    sku?: string;
  };
  voidedPurchaseNotification?: {
    version?: string;
    purchaseToken?: string;
    orderId?: string;
  };
}

/** Pub/Sub push message envelope */
interface PubSubMessage {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

function processRefund(
  supabaseClient: ReturnType<typeof createClient>,
  purchaseToken: string,
  productId: string | undefined
): Promise<{ processed: boolean; error?: string }> {
  return (async () => {
    const refId = String(purchaseToken);

    const { data: purchaseRow, error: findError } = await supabaseClient
      .from('wallet_transactions')
      .select('id, user_id, amount, balance_after')
      .eq('reference_id', refId)
      .eq('transaction_type', 'purchase')
      .single();

    if (findError || !purchaseRow) {
      console.log('[google-play-rtdn] No purchase found for reference_id:', refId, findError?.message);
      return { processed: false };
    }

    const { data: existingRefund } = await supabaseClient
      .from('wallet_transactions')
      .select('id')
      .eq('reference_id', `refund:${refId}`)
      .eq('transaction_type', 'refund')
      .single();

    if (existingRefund) {
      console.log('[google-play-rtdn] Refund already processed for:', refId);
      return { processed: false, error: 'alreadyProcessed' };
    }

    const userId = purchaseRow.user_id as string;
    const amount = Number(purchaseRow.amount);
    if (amount <= 0) {
      return { processed: false };
    }

    const deductAmount = -Math.abs(amount);

    const { data: wallet, error: walletError } = await supabaseClient
      .from('user_wallets')
      .select('token_balance, total_purchased')
      .eq('user_id', userId)
      .single();

    if (walletError || !wallet) {
      console.error('[google-play-rtdn] Wallet not found:', userId, walletError);
      return { processed: false, error: 'Wallet not found' };
    }

    const newBalance = Math.max(0, (wallet.token_balance as number) + deductAmount);
    const newTotalPurchased = Math.max(0, (wallet.total_purchased as number) - Math.abs(amount));

    await supabaseClient
      .from('user_wallets')
      .update({
        token_balance: newBalance,
        total_purchased: newTotalPurchased,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    await supabaseClient.from('wallet_transactions').insert({
      user_id: userId,
      amount: deductAmount,
      transaction_type: 'refund',
      reference_id: `refund:${refId}`,
      description: `Google Play IAP refund: ${productId || 'consumable'} (token ${refId.slice(-8)})`,
      balance_after: newBalance,
    });

    await supabaseClient
      .from('token_purchases')
      .update({ status: 'refunded' })
      .eq('user_id', userId)
      .eq('payment_id', refId)
      .eq('payment_method', 'google_iap');

    console.log('[google-play-rtdn] Refund processed:', { userId, amount: Math.abs(amount), refId: refId.slice(-8), newBalance });
    return { processed: true };
  })();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight(req);
  }

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.text();
    if (!body || body.length < 2) {
      console.warn('[google-play-rtdn] Empty or invalid body');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let pubSubMsg: PubSubMessage;
    try {
      pubSubMsg = JSON.parse(body) as PubSubMessage;
    } catch {
      console.warn('[google-play-rtdn] Invalid JSON body');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const dataB64 = pubSubMsg.message?.data;
    if (!dataB64) {
      console.warn('[google-play-rtdn] No message.data in Pub/Sub payload');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let rtdnPayload: RtdnPayload;
    try {
      const decoded = atob(dataB64.replace(/-/g, '+').replace(/_/g, '/'));
      rtdnPayload = JSON.parse(decoded) as RtdnPayload;
    } catch (e) {
      console.warn('[google-play-rtdn] Failed to decode message.data:', (e as Error).message);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pkg = rtdnPayload.packageName;
    if (pkg && pkg !== PACKAGE_NAME) {
      console.log('[google-play-rtdn] Ignoring notification for package:', pkg);
      return new Response(JSON.stringify({ received: true, ignored: 'wrongPackage' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let purchaseToken: string | undefined;
    let productId: string | undefined;
    let isRefund = false;

    const otp = rtdnPayload.oneTimeProductNotification;
    if (otp?.purchaseToken) {
      purchaseToken = otp.purchaseToken;
      productId = otp.sku;
      // notificationType: 1 = ONE_TIME_PRODUCT_PURCHASED, 2 = ONE_TIME_PRODUCT_CANCELED
      if (otp.notificationType === 2) {
        isRefund = true;
      }
    }

    const voided = rtdnPayload.voidedPurchaseNotification;
    if (voided?.purchaseToken) {
      purchaseToken = voided.purchaseToken;
      isRefund = true;
    }

    if (!isRefund || !purchaseToken) {
      console.log('[google-play-rtdn] Non-refund notification, ignoring:', {
        hasOtp: !!otp,
        otpType: otp?.notificationType,
        hasVoided: !!voided,
      });
      return new Response(JSON.stringify({ received: true, ignored: 'notRefund' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const result = await processRefund(supabaseClient, purchaseToken, productId);

    return new Response(
      JSON.stringify({
        received: true,
        refundProcessed: result.processed,
        ...(result.error && { error: result.error }),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('[google-play-rtdn] Error:', err);
    return new Response(
      JSON.stringify({ received: true, error: (err as Error).message }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
