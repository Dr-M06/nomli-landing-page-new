/**
 * Apple App Store Server Notifications (v2) webhook
 *
 * Receives REFUND (and other) notifications from Apple when a customer is refunded.
 * Configure in App Store Connect: App → App Information → App Store Server Notifications
 * - Production Server URL: https://<your-project>.supabase.co/functions/v1/apple-iap-webhook
 * - Sandbox Server URL: same (or separate) URL
 *
 * Refund flow: deduct tokens from user_wallets, record refund in wallet_transactions,
 * set token_purchases.status = 'refunded'.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

// Decode JWT payload without verification (Apple signs it; full verification would use Apple's certs)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
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
    if (!body || body.length < 10) {
      console.warn('[apple-iap-webhook] Empty or invalid body');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = decodeJwtPayload(body);
    if (!payload) {
      console.warn('[apple-iap-webhook] Failed to decode JWT');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const notificationType = payload.notificationType as string | undefined;
    const subtype = payload.subtype as string | undefined;
    const data = payload.data as { signedTransactionInfo?: string; signedRenewalInfo?: string } | undefined;
    const signedTransactionInfo = data?.signedTransactionInfo as string | undefined;

    console.log('[apple-iap-webhook] Notification:', { notificationType, subtype, hasTransactionInfo: !!signedTransactionInfo });

    if (notificationType !== 'REFUND') {
      return new Response(JSON.stringify({ received: true, ignored: notificationType }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!signedTransactionInfo) {
      console.warn('[apple-iap-webhook] No signedTransactionInfo in payload');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const txPayload = decodeJwtPayload(signedTransactionInfo);
    if (!txPayload) {
      console.warn('[apple-iap-webhook] Failed to decode signedTransactionInfo');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const originalTransactionId = (txPayload.originalTransactionId as string) || (txPayload.transactionId as string);
    const transactionId = txPayload.transactionId as string | undefined;
    const productId = txPayload.productId as string | undefined;

    if (!originalTransactionId) {
      console.warn('[apple-iap-webhook] No originalTransactionId in transaction');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Find the original purchase in wallet_transactions (reference_id = Apple transaction id)
    const refId = String(originalTransactionId);
    const { data: purchaseRow, error: findError } = await supabaseClient
      .from('wallet_transactions')
      .select('id, user_id, amount, balance_after')
      .eq('reference_id', refId)
      .eq('transaction_type', 'purchase')
      .single();

    if (findError || !purchaseRow) {
      console.log('[apple-iap-webhook] No purchase found for reference_id:', refId, findError?.message);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if we already processed this refund (idempotency)
    const { data: existingRefund } = await supabaseClient
      .from('wallet_transactions')
      .select('id')
      .eq('reference_id', `refund:${refId}`)
      .eq('transaction_type', 'refund')
      .single();

    if (existingRefund) {
      console.log('[apple-iap-webhook] Refund already processed for:', refId);
      return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = purchaseRow.user_id as string;
    const amount = Number(purchaseRow.amount);
    if (amount <= 0) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const deductAmount = -Math.abs(amount);

    const { data: wallet, error: walletError } = await supabaseClient
      .from('user_wallets')
      .select('token_balance, total_purchased')
      .eq('user_id', userId)
      .single();

    if (walletError || !wallet) {
      console.error('[apple-iap-webhook] Wallet not found:', userId, walletError);
      return new Response(JSON.stringify({ received: true, error: 'Wallet not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      description: `Apple IAP refund: ${productId || 'consumable'} (tx ${refId})`,
      balance_after: newBalance,
    });

    await supabaseClient
      .from('token_purchases')
      .update({ status: 'refunded' })
      .eq('user_id', userId)
      .eq('payment_id', refId)
      .eq('payment_method', 'apple_iap');

    console.log('[apple-iap-webhook] Refund processed:', { userId, amount: Math.abs(amount), refId, newBalance });

    return new Response(
      JSON.stringify({ received: true, refundProcessed: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[apple-iap-webhook] Error:', err);
    return new Response(
      JSON.stringify({ received: true, error: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
