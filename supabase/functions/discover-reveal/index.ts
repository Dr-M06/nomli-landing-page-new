/**
 * Discover "Who Liked You" reveal – spend tokens for 24h, 7 days or 30 days access.
 * Deducts from user wallet and creates discover_who_liked_reveals row.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOKENS_24H = 15;
const TOKENS_7D = 120;
const TOKENS_30D = 500;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
    const option = rawOption === '7d' ? '7d' : rawOption === 'permanent' ? 'permanent' : '24h';

    const tokensSpent = option === 'permanent' ? TOKENS_30D : option === '7d' ? TOKENS_7D : TOKENS_24H;
    const expiresAt =
      option === 'permanent'
        ? new Date(Date.now() + THIRTY_DAYS_MS).toISOString()
        : option === '7d'
          ? new Date(Date.now() + SEVEN_DAYS_MS).toISOString()
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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
          error: 'Earned tokens cannot be used for this. Get tokens from Wallet to reveal who liked you.',
          required: tokensSpent,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newBalance = totalBalance - tokensSpent;

    const { data: revealRow, error: revealError } = await adminClient
      .from('discover_who_liked_reveals')
      .insert({
        user_id: userId,
        option,
        tokens_spent: tokensSpent,
        expires_at: expiresAt,
      })
      .select('id, expires_at')
      .single();

    if (revealError || !revealRow) {
      console.error('[discover-reveal] Insert reveal error:', revealError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create reveal' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateError } = await adminClient
      .from('user_wallets')
      .update({
        token_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[discover-reveal] Wallet update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to deduct tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const description =
      option === 'permanent' ? 'Who liked you – 30 days' : option === '7d' ? 'Who liked you – 7 days' : 'Who liked you – 24h';
    await adminClient.from('wallet_transactions').insert({
      user_id: userId,
      amount: -tokensSpent,
      transaction_type: 'discover_reveal',
      reference_id: revealRow.id,
      description,
      balance_after: newBalance,
    });

    // Grant unlimited discover likes until reveal expires (token reveal = can swipe unlimited too).
    // Only extend if new expiry is later than current (don't shorten e.g. 7d left then buy 24h).
    const { data: profile } = await adminClient
      .from('profiles')
      .select('discover_premium_until')
      .eq('id', userId)
      .single();
    const currentUntil = profile?.discover_premium_until ? new Date(profile.discover_premium_until).getTime() : 0;
    const newUntil = new Date(expiresAt).getTime();
    if (newUntil > currentUntil) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({ discover_premium_until: expiresAt })
        .eq('id', userId);
      if (profileError) {
        console.error('[discover-reveal] Error updating discover_premium_until:', profileError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        revealId: revealRow.id,
        expiresAt: revealRow.expires_at,
        newBalance,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[discover-reveal] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
