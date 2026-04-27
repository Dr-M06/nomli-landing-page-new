/**
 * Discover Profile Booster – spend tokens to place your profile at the top of others' discover feed.
 * Options: 6h or 12h (different from Tinder). Uses purchased tokens only.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOKENS_6H = 10;
const TOKENS_12H = 18;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const body = await req.json().catch(() => ({}));
    const rawOption = body?.option;
    const option = rawOption === '12h' ? '12h' : '6h';

    const tokensSpent = option === '12h' ? TOKENS_12H : TOKENS_6H;
    const durationMs = option === '12h' ? TWELVE_HOURS_MS : SIX_HOURS_MS;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: wallet, error: walletError } = await adminClient
      .from('user_wallets')
      .select('token_balance, earned_tokens_redeemed')
      .eq('user_id', userId)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ success: false, error: 'Wallet not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const totalBalance = Number(wallet.token_balance) || 0;
    const redeemedEarned = Number(wallet.earned_tokens_redeemed) || 0;
    const availablePurchasedTokens = totalBalance - redeemedEarned;

    if (availablePurchasedTokens < tokensSpent) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Earned tokens cannot be used for this. Get tokens from Wallet to boost your profile.',
          required: tokensSpent,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('discover_boosted_until')
      .eq('id', userId)
      .single();

    const now = Date.now();
    const currentUntil = profile?.discover_boosted_until ? new Date(profile.discover_boosted_until).getTime() : 0;
    const newEnd = Math.max(currentUntil, now) + durationMs;
    const boostedUntil = new Date(newEnd).toISOString();

    const description = option === '12h' ? 'Profile boost – 12 hours' : 'Profile boost – 6 hours';
    const walletRes = await fetch(`${supabaseUrl}/functions/v1/update-wallet-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        userId,
        amount: -tokensSpent,
        transactionType: 'discover_boost',
        referenceId: userId,
        description,
      }),
    });
    const walletResult = await walletRes.json();

    if (!walletRes.ok || walletResult.newBalance === undefined) {
      console.error('[discover-boost] Wallet update failed:', walletResult);
      return new Response(
        JSON.stringify({
          success: false,
          error: walletResult.error || 'Failed to deduct tokens. Transaction not recorded.',
        }),
        { status: walletRes.status >= 400 ? walletRes.status : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateProfileError } = await adminClient
      .from('profiles')
      .update({
        discover_boosted_until: boostedUntil,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateProfileError) {
      console.error('[discover-boost] Profile update error (tokens already deducted):', updateProfileError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Boost payment recorded but profile update failed. Contact support.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        boostedUntil,
        newBalance: walletResult.newBalance,
        option,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[discover-boost] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
