import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

const PACKAGE_NAME = 'com.nomli.mingle2';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

interface VerifyGoogleReceiptRequest {
  purchaseToken: string;
  productId: string;
  userId: string;
  packageId?: string;
}

interface GoogleServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
}

/** Base64url encode (no padding). */
function b64urlEncode(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Get OAuth2 access token using service account JWT (RS256). */
async function getGoogleAccessToken(serviceAccount: GoogleServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: ANDROID_PUBLISHER_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pem = serviceAccount.private_key;
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${b64urlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth2 token failed: ${tokenRes.status} ${errText}`);
  }
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error('Google OAuth2 response missing access_token');
  }
  return tokenData.access_token;
}

/** One-time product (consumable tokens). */
async function verifyGooglePurchase(
  accessToken: string,
  packageName: string,
  productId: string,
  purchaseToken: string
): Promise<{ purchaseState: number; acknowledgementState: number }> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Google Play API error:', res.status, errText);
    if (res.status === 404) {
      throw new Error('Purchase not found or invalid token');
    }
    if (res.status === 400) {
      throw new Error('Invalid request to Google Play');
    }
    throw new Error(`Google Play API error: ${res.status}`);
  }

  const data = await res.json();
  return {
    purchaseState: data.purchaseState ?? 0,
    acknowledgementState: data.acknowledgementState ?? 0,
  };
}

/** Auto-renewing subscription (Creator Pro). */
async function verifyGoogleSubscription(
  accessToken: string,
  packageName: string,
  subscriptionId: string,
  purchaseToken: string
): Promise<{ expiryTimeMillis: string; paymentState: number }> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Google Play Subscriptions API error:', res.status, errText);
    throw new Error(`Google subscription verify failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    expiryTimeMillis: String(data.expiryTimeMillis ?? ''),
    paymentState: data.paymentState ?? 0,
  };
}

serve(async (req) => {
  console.log('🔔 [verify-google-receipt] Function invoked at:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return handleCorsPreflight(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { purchaseToken, productId, userId }: VerifyGoogleReceiptRequest = body;

    if (!purchaseToken || !productId || !userId) {
      console.error('❌ [verify-google-receipt] Missing required fields');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: purchaseToken, productId, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jsonSecret = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
    if (!jsonSecret) {
      console.error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let serviceAccount: GoogleServiceAccount;
    try {
      serviceAccount = JSON.parse(jsonSecret) as GoogleServiceAccount;
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid service account JSON' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getGoogleAccessToken(serviceAccount);

    const { data: creatorPlan } = await supabaseClient
      .from('payment_plans')
      .select('id, name, token_amount, bonus_tokens')
      .eq('iap_product_id_google', productId)
      .eq('plan_category', 'creator')
      .eq('is_active', true)
      .maybeSingle();

    if (creatorPlan) {
      const sub = await verifyGoogleSubscription(accessToken, PACKAGE_NAME, productId, purchaseToken);
      // paymentState: 0=pending, 1=received, 2=free trial, 3=pending deferred
      if (sub.paymentState !== 1 && sub.paymentState !== 2) {
        return new Response(
          JSON.stringify({ success: false, error: `Subscription payment state: ${sub.paymentState}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const expMs = parseInt(sub.expiryTimeMillis, 10);
      if (Number.isNaN(expMs) || expMs <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid subscription expiry from Google' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const expiresIso = new Date(expMs).toISOString();

      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('creator_pro_until')
        .eq('id', userId)
        .single();

      const prev = profile?.creator_pro_until ? new Date(profile.creator_pro_until as string).getTime() : 0;
      const nextUntil = Math.max(prev, expMs);

      const { error: profErr } = await supabaseClient
        .from('profiles')
        .update({ creator_pro_until: new Date(nextUntil).toISOString() })
        .eq('id', userId);

      if (profErr) {
        console.error('❌ [verify-google-receipt] Creator Pro profile update:', profErr);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to activate Creator Pro' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: existingAudit } = await supabaseClient
        .from('wallet_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('reference_id', purchaseToken)
        .eq('transaction_type', 'creator_pro_google')
        .maybeSingle();

      if (!existingAudit) {
        await supabaseClient.from('wallet_transactions').insert({
          user_id: userId,
          amount: 0,
          transaction_type: 'creator_pro_google',
          reference_id: purchaseToken,
          description: `Creator Pro (Google): ${creatorPlan.name || productId} until ${expiresIso}`,
          balance_after: 0,
        });

        const totalTokens =
          (creatorPlan.token_amount || 0) + (creatorPlan.bonus_tokens || 0);
        if (totalTokens > 0) {
          const { error: wErr } = await supabaseClient.rpc('update_wallet_balance', {
            p_user_id: userId,
            p_amount: totalTokens,
            p_transaction_type: 'bonus',
            p_reference_id: `creator_pro_google:${purchaseToken}`,
            p_description: `Creator Pro monthly tokens (${creatorPlan.name || productId})`,
          });
          if (wErr) {
            console.warn('⚠️ [verify-google-receipt] Creator Pro token credit failed:', wErr);
          }
        }
      }

      console.log('✅ [verify-google-receipt] Creator Pro (Google) until', expiresIso);
      return new Response(
        JSON.stringify({ success: true, kind: 'creator_pro', message: 'Creator Pro active', expiresAt: expiresIso }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const purchase = await verifyGooglePurchase(accessToken, PACKAGE_NAME, productId, purchaseToken);

    if (purchase.purchaseState !== 0) {
      return new Response(
        JSON.stringify({ success: false, error: `Purchase not in completed state: ${purchase.purchaseState}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: existingTokenPurchase } = await supabaseClient
      .from('wallet_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('reference_id', purchaseToken)
      .eq('transaction_type', 'purchase')
      .maybeSingle();

    if (existingTokenPurchase) {
      console.log('✅ [verify-google-receipt] Token purchase already processed');
      return new Response(
        JSON.stringify({ success: true, message: 'Transaction already processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: packageData, error: packageError } = await supabaseClient.rpc(
      'get_token_package_by_iap_product_id',
      { p_iap_product_id: productId }
    );

    if (packageError || !packageData?.length) {
      console.error('Token package not found:', packageError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unknown product (not a token pack or Creator Pro plan)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenPackage = packageData[0];
    const totalTokens = tokenPackage.token_amount + (tokenPackage.bonus_tokens || 0);

    let { data: wallet, error: walletFetchError } = await supabaseClient
      .from('user_wallets')
      .select('token_balance, total_purchased')
      .eq('user_id', userId)
      .single();

    if (walletFetchError || !wallet) {
      const { error: insertError } = await supabaseClient.from('user_wallets').insert({
        user_id: userId,
        token_balance: 0,
        total_purchased: 0,
        total_redeemed: 0,
      });
      if (insertError) {
        console.error('Error creating wallet:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create wallet' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      wallet = { token_balance: 0, total_purchased: 0 };
    }

    const newBalance = wallet.token_balance + totalTokens;
    const newTotalPurchased = wallet.total_purchased + totalTokens;

    const { error: walletUpdateError } = await supabaseClient
      .from('user_wallets')
      .update({
        token_balance: newBalance,
        total_purchased: newTotalPurchased,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (walletUpdateError) {
      console.error('Error updating wallet:', walletUpdateError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to credit tokens: ${walletUpdateError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabaseClient.from('wallet_transactions').insert({
      user_id: userId,
      amount: Math.round(Number(totalTokens)),
      transaction_type: 'purchase',
      reference_id: String(purchaseToken),
      description: `Token purchase: ${totalTokens} tokens (Google Play)`,
      balance_after: Math.round(Number(newBalance)),
    });

    await supabaseClient.from('token_purchases').insert({
      user_id: userId,
      package_id: tokenPackage.id,
      token_amount: tokenPackage.token_amount,
      bonus_tokens: tokenPackage.bonus_tokens || 0,
      total_tokens: totalTokens,
      price_usd: tokenPackage.price_usd,
      payment_method: 'google_iap',
      payment_id: purchaseToken,
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    console.log('✅ [verify-google-receipt] Purchase processed:', { userId, totalTokens, newBalance });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Purchase processed successfully',
        tokens: totalTokens,
        kind: 'tokens',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [verify-google-receipt] Error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
