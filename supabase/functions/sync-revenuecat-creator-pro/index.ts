import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

/**
 * Reads RevenueCat REST `GET /v1/subscribers/{app_user_id}` with the **secret** API key,
 * finds an active Creator Pro subscription (payment_plans SKUs or optional entitlement),
 * then updates `profiles.creator_pro_until` and ledger rows (same spirit as verify-apple-receipt).
 *
 * Secrets (Supabase project → Edge Functions):
 * - REVENUECAT_SECRET_API_KEY — Project settings → API keys → **Secret** key
 * Optional:
 * - REVENUECAT_CREATOR_ENTITLEMENT_ID — e.g. `creator_pro` if you attach products to that entitlement
 */

function parseExpiresMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const rcSecret = Deno.env.get('REVENUECAT_SECRET_API_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ success: false, error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!rcSecret) {
      console.error('[sync-revenuecat-creator-pro] REVENUECAT_SECRET_API_KEY missing');
      return new Response(JSON.stringify({ success: false, error: 'RevenueCat not configured on server' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user?.id) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: planRows, error: planErr } = await admin
      .from('payment_plans')
      .select('id, name, token_amount, bonus_tokens, iap_product_id_apple, iap_product_id_google')
      .eq('plan_category', 'creator')
      .eq('is_active', true);

    if (planErr) {
      console.error('[sync-revenuecat-creator-pro] payment_plans:', planErr);
      return new Response(JSON.stringify({ success: false, error: 'Could not load subscription plans' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const skuSet = new Set<string>();
    for (const row of planRows || []) {
      const a = (row as { iap_product_id_apple?: string | null }).iap_product_id_apple?.trim();
      const g = (row as { iap_product_id_google?: string | null }).iap_product_id_google?.trim();
      if (a) skuSet.add(a);
      if (g) skuSet.add(g);
    }

    const rcUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`;
    const rcRes = await fetch(rcUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${rcSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const rcJson = (await rcRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!rcRes.ok) {
      console.error('[sync-revenuecat-creator-pro] RevenueCat HTTP', rcRes.status, rcJson);
      return new Response(
        JSON.stringify({
          success: false,
          error: (rcJson as { message?: string }).message || `RevenueCat error (${rcRes.status})`,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const subscriber = (rcJson as { subscriber?: Record<string, unknown> }).subscriber || {};
    const subscriptions = (subscriber.subscriptions || {}) as Record<
      string,
      {
        expires_date?: string | null;
        unsubscribe_detected_at?: string | null;
        billing_issues_detected_at?: string | null;
        store?: string;
        original_transaction_id?: string;
        store_transaction_id?: string;
      }
    >;

    const now = Date.now();
    let bestExpiresMs = 0;
    let bestProductId = '';
    let bestStore = '';
    let bestRefId = '';

    const entitlementId = (Deno.env.get('REVENUECAT_CREATOR_ENTITLEMENT_ID') || '').trim();
    if (entitlementId) {
      const entitlements = (subscriber.entitlements || {}) as Record<
        string,
        { expires_date?: string | null; product_identifier?: string }
      >;
      const ent = entitlements[entitlementId];
      if (ent?.expires_date) {
        const ms = parseExpiresMs(ent.expires_date);
        if (ms > now && ms >= bestExpiresMs) {
          bestExpiresMs = ms;
          bestProductId = String(ent.product_identifier || '');
        }
      }
    }

    for (const [productId, sub] of Object.entries(subscriptions)) {
      if (!skuSet.has(productId)) continue;
      const ms = parseExpiresMs(sub?.expires_date);
      if (ms > now && ms >= bestExpiresMs) {
        bestExpiresMs = ms;
        bestProductId = productId;
        bestStore = String(sub?.store || '');
        bestRefId =
          String(sub?.original_transaction_id || sub?.store_transaction_id || '').trim() ||
          `rc:${productId}:${ms}`;
      }
    }

    if (!bestExpiresMs || !bestProductId) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'No active Creator Pro subscription found in RevenueCat for this account. Finish the purchase on-device, ensure products are imported into RevenueCat, and that payment_plans SKUs match store product IDs.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const subRow = subscriptions[bestProductId];
    if (subRow) {
      bestStore = bestStore || String(subRow.store || '');
      const rid = String(subRow.original_transaction_id || subRow.store_transaction_id || '').trim();
      if (rid) bestRefId = rid;
    }
    if (!bestRefId) bestRefId = `rc:${bestProductId}:${bestExpiresMs}`;

    const expiresIso = new Date(bestExpiresMs).toISOString();

    const creatorPlan =
      (planRows || []).find(
        (r) =>
          (r as { iap_product_id_apple?: string }).iap_product_id_apple === bestProductId ||
          (r as { iap_product_id_google?: string }).iap_product_id_google === bestProductId,
      ) || (planRows || [])[0];

    if (!creatorPlan) {
      return new Response(JSON.stringify({ success: false, error: 'Creator plan row missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const refIds = [...new Set([bestRefId].filter(Boolean))];
    if (refIds.length) {
      const { data: existingRows } = await admin
        .from('wallet_transactions')
        .select('id, transaction_type')
        .eq('user_id', userId)
        .in('reference_id', refIds)
        .limit(1);
      const existingTx = existingRows?.[0];
      if (existingTx) {
        // Even if we've already recorded this transaction, refresh profile window
        // so users do not lose access when `creator_pro_until` is unexpectedly cleared.
        const { data: existingProfile } = await admin
          .from('profiles')
          .select('creator_pro_until')
          .eq('id', userId)
          .single();
        const existingPrev = existingProfile?.creator_pro_until ? new Date(existingProfile.creator_pro_until as string).getTime() : 0;
        const existingNextUntil = Math.max(existingPrev, bestExpiresMs);
        const { error: existingProfErr } = await admin
          .from('profiles')
          .update({ creator_pro_until: new Date(existingNextUntil).toISOString() })
          .eq('id', userId);
        if (existingProfErr) {
          console.error('[sync-revenuecat-creator-pro] profile backfill on existing tx', existingProfErr);
          return new Response(JSON.stringify({ success: false, error: 'Failed to refresh Creator Pro access' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const t = (existingTx as { transaction_type?: string }).transaction_type;
        const kind =
          t === 'creator_pro_apple' || t === 'creator_pro_google' || t === 'creator_pro_revenuecat'
            ? 'creator_pro'
            : 'tokens';
        return new Response(JSON.stringify({ success: true, message: 'Already synced', kind, expiresAt: new Date(existingNextUntil).toISOString() }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: profile } = await admin.from('profiles').select('creator_pro_until').eq('id', userId).single();
    const prev = profile?.creator_pro_until ? new Date(profile.creator_pro_until as string).getTime() : 0;
    const nextUntil = Math.max(prev, bestExpiresMs);

    const { error: profErr } = await admin
      .from('profiles')
      .update({ creator_pro_until: new Date(nextUntil).toISOString() })
      .eq('id', userId);

    if (profErr) {
      console.error('[sync-revenuecat-creator-pro] profile update', profErr);
      return new Response(JSON.stringify({ success: false, error: 'Failed to activate Creator Pro' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    {
      const { error: fcErr } = await admin.rpc('schedule_founding_creator_credit_vesting', {
        p_user_id: userId,
        p_period_end: expiresIso,
      });
      if (fcErr) {
        console.warn('[sync-revenuecat-creator-pro] schedule_founding_creator_credit_vesting:', fcErr.message);
      }
    }

    const storeUpper = bestStore.toUpperCase();
    const txType =
      storeUpper.includes('PLAY') || storeUpper.includes('GOOGLE')
        ? 'creator_pro_google'
        : storeUpper.includes('STRIPE')
          ? 'creator_pro_revenuecat'
          : 'creator_pro_apple';

    const canonicalRef = bestRefId || `rc:${bestProductId}:${bestExpiresMs}`;

    await admin.from('wallet_transactions').insert({
      user_id: userId,
      amount: 0,
      transaction_type: txType,
      reference_id: canonicalRef,
      description: `Creator Pro (RevenueCat / ${bestStore || 'store'}): ${(creatorPlan as { name?: string }).name || bestProductId} until ${expiresIso}`,
      balance_after: 0,
    });

    const totalTokens =
      ((creatorPlan as { token_amount?: number }).token_amount || 0) +
      ((creatorPlan as { bonus_tokens?: number }).bonus_tokens || 0);
    if (totalTokens > 0) {
      const { error: wErr } = await admin.rpc('update_wallet_balance', {
        p_user_id: userId,
        p_amount: totalTokens,
        p_transaction_type: 'bonus',
        p_reference_id: `creator_pro_revenuecat:${canonicalRef}`,
        p_description: `Creator Pro monthly tokens (${(creatorPlan as { name?: string }).name || bestProductId})`,
      });
      if (wErr) {
        console.warn('[sync-revenuecat-creator-pro] bonus tokens:', wErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        kind: 'creator_pro',
        expiresAt: expiresIso,
        productId: bestProductId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    console.error('[sync-revenuecat-creator-pro]', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error)?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
