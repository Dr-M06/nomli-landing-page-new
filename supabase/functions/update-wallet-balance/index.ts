// Supabase Edge Function to update wallet balance
// This function has admin privileges via service role key
// Used for gift transactions, discover_boost (profile booster), discover_reveal (who liked you),
// and other system-initiated wallet updates. Transaction history is written to wallet_transactions.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user is authenticated
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { userId, amount, transactionType, referenceId, description } = await req.json();

    if (!userId || amount === undefined || !transactionType) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: userId, amount, transactionType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate that the transaction is legitimate
    // For gift_received, verify there's a corresponding gift_transaction
    if (transactionType === 'gift_received' && referenceId) {
      // Use admin client to check gift transaction (bypasses RLS)
      const adminCheckClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const { data: giftTransaction, error: giftError } = await adminCheckClient
        .from('gift_transactions')
        .select('id, receiver_id, gift_price')
        .eq('id', referenceId)
        .eq('receiver_id', userId)
        .single();

      if (giftError || !giftTransaction) {
        console.error('❌ [UPDATE_WALLET] Gift transaction not found or invalid:', giftError);
        console.error('❌ [UPDATE_WALLET] Reference ID:', referenceId, 'User ID:', userId);
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid gift transaction' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify the amount matches the gift price (allow small rounding differences)
      if (Math.abs(giftTransaction.gift_price - amount) > 1) {
        console.error('❌ [UPDATE_WALLET] Amount mismatch:', { expected: giftTransaction.gift_price, received: amount });
        return new Response(
          JSON.stringify({ success: false, error: 'Amount mismatch' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ [UPDATE_WALLET] Gift transaction validated:', giftTransaction.id);
    }

    // Create admin client with service role key (has admin privileges)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log(`💰 [UPDATE_WALLET] Updating wallet for user: ${userId}, amount: ${amount}, type: ${transactionType}`);

    // Get current wallet balance
    const { data: currentWallet, error: fetchError } = await adminClient
      .from('user_wallets')
      .select('token_balance, total_purchased, total_redeemed, earned_tokens_redeemed')
      .eq('user_id', userId)
      .single();

    // Handle case where wallet doesn't exist
    if (fetchError && fetchError.code === 'PGRST116') {
      console.log('🔧 [UPDATE_WALLET] No wallet found, creating one for user:', userId);
      const startingBalance = amount > 0 ? amount : 0;
      const { data: newWallet, error: createError } = await adminClient
        .from('user_wallets')
        .insert({
          user_id: userId,
          token_balance: startingBalance,
          total_purchased: amount > 0 ? amount : 0,
          total_redeemed: amount < 0 ? Math.abs(amount) : 0,
        })
        .select('token_balance')
        .single();

      if (createError || !newWallet) {
        console.error('❌ [UPDATE_WALLET] Error creating wallet:', createError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create wallet' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Record transaction
      if (amount > 0) {
        await adminClient
          .from('wallet_transactions')
          .insert({
            user_id: userId,
            amount: amount,
            transaction_type: transactionType,
            reference_id: referenceId,
            description: description,
            balance_after: startingBalance,
          });
      }

      return new Response(
        JSON.stringify({ success: true, newBalance: newWallet.token_balance }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (fetchError) {
      console.error('❌ [UPDATE_WALLET] Error fetching wallet:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch wallet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newBalance = currentWallet.token_balance + amount;

    // For spend transactions (credit, gift, profile boost, reveal), validate that only purchased tokens are used (not earned)
    const isSpendFromPurchasedOnly =
      transactionType === 'user_credit_sent' ||
      transactionType === 'gift_sent' ||
      transactionType === 'discover_boost' ||
      transactionType === 'discover_reveal';
    if (amount < 0 && isSpendFromPurchasedOnly) {
      const redeemedEarnedTokens = currentWallet.earned_tokens_redeemed || 0;
      const availablePurchasedTokens = currentWallet.token_balance - redeemedEarnedTokens;
      const requestedAmount = Math.abs(amount);
      
      if (availablePurchasedTokens < requestedAmount) {
        console.error('❌ [UPDATE_WALLET] Insufficient purchased tokens for credit/gift:', { 
          availablePurchased: availablePurchasedTokens, 
          requested: requestedAmount,
          totalBalance: currentWallet.token_balance,
          redeemedEarned: redeemedEarnedTokens
        });
        return new Response(
          JSON.stringify({ success: false, error: 'Insufficient purchased tokens. Earned tokens cannot be used for credits or gifts.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (newBalance < 0) {
      console.error('❌ [UPDATE_WALLET] Insufficient balance:', { current: currentWallet.token_balance, requested: amount });
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update wallet balance
    const { data: updatedWallet, error: updateError } = await adminClient
      .from('user_wallets')
      .update({
        token_balance: newBalance,
        total_purchased: amount > 0 ? currentWallet.total_purchased + amount : currentWallet.total_purchased,
        total_redeemed: amount < 0 ? currentWallet.total_redeemed + Math.abs(amount) : currentWallet.total_redeemed,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('token_balance')
      .single();

    if (updateError) {
      console.error('❌ [UPDATE_WALLET] Error updating wallet:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update wallet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record transaction
    try {
      await adminClient
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          amount: amount,
          transaction_type: transactionType,
          reference_id: referenceId,
          description: description,
          balance_after: newBalance,
        });
    } catch (transactionError) {
      console.error('⚠️ [UPDATE_WALLET] Error recording transaction (balance updated):', transactionError);
      // Don't fail the whole operation for transaction recording error
    }

    console.log(`✅ [UPDATE_WALLET] Wallet updated successfully. New balance: ${newBalance}`);
    return new Response(
      JSON.stringify({ success: true, newBalance: updatedWallet.token_balance }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ [UPDATE_WALLET] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

