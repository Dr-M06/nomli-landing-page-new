import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

type RcEntitlement = {
  expires_date?: string | null;
  product_identifier?: string;
};

type RcSubscription = {
  expires_date?: string | null;
};

function parseExpiresMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function addSkuIfPresent(target: Set<string>, value: string | null | undefined): void {
  const normalized = (value || '').trim();
  if (normalized) target.add(normalized);
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

    // Load active plan SKUs so we can map RevenueCat subscriptions even if
    // entitlement IDs are missing/misconfigured.
    const { data: planRows, error: planErr } = await admin
      .from('payment_plans')
      .select('plan_category, iap_product_id_apple, iap_product_id_google')
      .in('plan_category', ['discover', 'creator'])
      .eq('is_active', true);

    if (planErr) {
      return new Response(JSON.stringify({ success: false, error: 'Could not load subscription plans' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const datingSkuSet = new Set<string>();
    const creatorSkuSet = new Set<string>();
    for (const row of planRows || []) {
      const appleSku = (row as { iap_product_id_apple?: string | null }).iap_product_id_apple?.trim();
      const googleSku = (row as { iap_product_id_google?: string | null }).iap_product_id_google?.trim();
      const category = String((row as { plan_category?: string }).plan_category || '').trim().toLowerCase();
      if (!category) continue;
      if (category === 'discover') {
        if (appleSku) datingSkuSet.add(appleSku);
        if (googleSku) datingSkuSet.add(googleSku);
      } else if (category === 'creator') {
        if (appleSku) creatorSkuSet.add(appleSku);
        if (googleSku) creatorSkuSet.add(googleSku);
      }
    }

    // Safety fallback: if DB rows are missing/misconfigured, still map known RC product ids.
    // Accept optional env overrides first, then project defaults.
    addSkuIfPresent(datingSkuSet, Deno.env.get('REVENUECAT_DATING_MONTHLY_PRODUCT_ID'));
    addSkuIfPresent(datingSkuSet, Deno.env.get('REVENUECAT_DATING_ANNUAL_PRODUCT_ID'));
    addSkuIfPresent(datingSkuSet, Deno.env.get('REVENUECAT_BUNDLE_MONTHLY_PRODUCT_ID'));
    addSkuIfPresent(datingSkuSet, Deno.env.get('REVENUECAT_BUNDLE_ANNUAL_PRODUCT_ID'));
    addSkuIfPresent(creatorSkuSet, Deno.env.get('REVENUECAT_CREATOR_MONTHLY_PRODUCT_ID'));
    addSkuIfPresent(creatorSkuSet, Deno.env.get('REVENUECAT_CREATOR_ANNUAL_PRODUCT_ID'));
    // Shared bundle products grant both dating + creator windows.
    addSkuIfPresent(creatorSkuSet, Deno.env.get('REVENUECAT_BUNDLE_MONTHLY_PRODUCT_ID'));
    addSkuIfPresent(creatorSkuSet, Deno.env.get('REVENUECAT_BUNDLE_ANNUAL_PRODUCT_ID'));

    // Dot-style product ids (current RC setup).
    addSkuIfPresent(datingSkuSet, 'nomli.dating.pro_monthly');
    addSkuIfPresent(datingSkuSet, 'nomli.dating.pro_annual');
    addSkuIfPresent(datingSkuSet, 'nomli.bundle_monthly');
    addSkuIfPresent(datingSkuSet, 'nomli.bundle_annual');
    // Underscore-style legacy fallbacks.
    addSkuIfPresent(datingSkuSet, 'nomli_dating_pro_monthly');
    addSkuIfPresent(datingSkuSet, 'nomli_dating_pro_annual');
    addSkuIfPresent(datingSkuSet, 'nomli_bundle_monthly');
    addSkuIfPresent(datingSkuSet, 'nomli_bundle_annual');

    addSkuIfPresent(creatorSkuSet, 'com.nomli.mingle2.creator.pro.monthly');
    addSkuIfPresent(creatorSkuSet, 'com.nomli.mingle2.creator.pro.yearly');
    addSkuIfPresent(creatorSkuSet, 'nomli.bundle_monthly');
    addSkuIfPresent(creatorSkuSet, 'nomli.bundle_annual');
    addSkuIfPresent(creatorSkuSet, 'nomli_bundle_monthly');
    addSkuIfPresent(creatorSkuSet, 'nomli_bundle_annual');

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
      return new Response(
        JSON.stringify({
          success: false,
          error: (rcJson as { message?: string }).message || `RevenueCat error (${rcRes.status})`,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const subscriber = (rcJson as { subscriber?: Record<string, unknown> }).subscriber || {};
    const entitlements = (subscriber.entitlements || {}) as Record<string, RcEntitlement>;
    const subscriptions = (subscriber.subscriptions || {}) as Record<string, RcSubscription>;
    const nowMs = Date.now();

    const datingEntitlementId = (Deno.env.get('REVENUECAT_DATING_ENTITLEMENT_ID') || 'dating_pro').trim();
    const creatorEntitlementId = (Deno.env.get('REVENUECAT_CREATOR_ENTITLEMENT_ID') || 'creator_pro').trim();

    const datingEnt = entitlements[datingEntitlementId];
    const creatorEnt = entitlements[creatorEntitlementId];

    let datingExpiresMs = parseExpiresMs(datingEnt?.expires_date);
    let creatorExpiresMs = parseExpiresMs(creatorEnt?.expires_date);
    let hasDatingSignal = !!datingEnt;
    let hasCreatorSignal = !!creatorEnt;

    // Fallback: map active subscriptions by product SKU category.
    for (const [productId, sub] of Object.entries(subscriptions)) {
      const expMs = parseExpiresMs(sub?.expires_date);
      if (datingSkuSet.has(productId)) {
        hasDatingSignal = true;
        if (expMs > datingExpiresMs) datingExpiresMs = expMs;
      }
      if (creatorSkuSet.has(productId)) {
        hasCreatorSignal = true;
        if (expMs > creatorExpiresMs) creatorExpiresMs = expMs;
      }
    }

    const hasDating = datingExpiresMs > nowMs;
    const hasCreator = creatorExpiresMs > nowMs;

    const { data: profile } = await admin
      .from('profiles')
      .select('discover_premium_until, creator_pro_until')
      .eq('id', userId)
      .maybeSingle();

    const currentDatingMs = parseExpiresMs(profile?.discover_premium_until || null);
    const currentCreatorMs = parseExpiresMs(profile?.creator_pro_until || null);

    const nextDatingMs = hasDating
      ? Math.max(currentDatingMs, datingExpiresMs)
      : hasDatingSignal
        ? 0
        : currentDatingMs;
    const nextCreatorMs = hasCreator
      ? Math.max(currentCreatorMs, creatorExpiresMs)
      : hasCreatorSignal
        ? 0
        : currentCreatorMs;

    const patch: Record<string, string | null> = {
      discover_premium_until: nextDatingMs > nowMs ? new Date(nextDatingMs).toISOString() : null,
      creator_pro_until: nextCreatorMs > nowMs ? new Date(nextCreatorMs).toISOString() : null,
    };

    const { error: profErr } = await admin.from('profiles').update(patch).eq('id', userId);
    if (profErr) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to sync subscription access' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        dating: {
          active: hasDating,
          expiresAt: patch.discover_premium_until,
          productId: datingEnt?.product_identifier || null,
        },
        creator: {
          active: hasCreator,
          expiresAt: patch.creator_pro_until,
          productId: creatorEnt?.product_identifier || null,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    return new Response(JSON.stringify({ success: false, error: (e as Error)?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
