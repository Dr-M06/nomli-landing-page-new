import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TransferRequest {
  tokenAmount: number;
  currency: 'NGN' | 'USD';
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  narration?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Flutterwave secret key from environment
    const flutterwaveSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!flutterwaveSecretKey) {
      throw new Error('FLUTTERWAVE_SECRET_KEY not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData: TransferRequest = await req.json();
    const { tokenAmount, currency, bankCode, accountNumber, accountName, narration } = requestData;

    // Validate input
    if (!tokenAmount || tokenAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid token amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!bankCode || !accountNumber) {
      return new Response(
        JSON.stringify({ error: 'Missing bank code or account number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile and wallet
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('payout_tier, bank_account_verified, bank_account_number, bank_code')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('❌ [FLUTTERWAVE] Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user wallet (need total_purchased to enforce withdrawable = gifts + credits only, not purchase)
    const { data: wallet, error: walletError } = await supabase
      .from('user_wallets')
      .select('token_balance, total_purchased')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: 'Wallet not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const totalPurchased = typeof wallet.total_purchased === 'number' ? wallet.total_purchased : 0;
    const withdrawableBalance = Math.max(0, (wallet.token_balance || 0) - totalPurchased);

    // Check if user has sufficient total balance
    if (wallet.token_balance < tokenAmount) {
      return new Response(
        JSON.stringify({ error: 'Insufficient token balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only gifts and credits are withdrawable; purchased tokens cannot be withdrawn
    if (tokenAmount > withdrawableBalance) {
      return new Response(
        JSON.stringify({
          error: 'Only gifts and credits can be withdrawn',
          withdrawable: withdrawableBalance,
          message: `Your withdrawable balance is ${withdrawableBalance} tokens (tokens from purchases cannot be withdrawn).`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payout limits for user tier
    const userTier = profile.payout_tier || 'tier1';
    const { data: limits, error: limitsError } = await supabase
      .from('payout_limits')
      .select('*')
      .eq('user_tier', userTier)
      .eq('currency', currency)
      .eq('is_active', true)
      .single();

    if (limitsError || !limits) {
      console.error('❌ [FLUTTERWAVE] Payout limits not found:', limitsError);
      return new Response(
        JSON.stringify({ error: 'Payout limits not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate cash amount from tokens
    const cashAmount = tokenAmount * limits.token_to_cash_rate;
    
    // Calculate fees
    const fixedFee = limits.transaction_fee || 0;
    const percentageFee = (cashAmount * (limits.transaction_fee_percentage || 0)) / 100;
    const totalFee = fixedFee + percentageFee;
    const payoutAmount = cashAmount - totalFee;

    // Validate minimum payout amount
    if (payoutAmount < limits.min_payout_amount) {
      return new Response(
        JSON.stringify({ 
          error: `Minimum payout amount is ${limits.currency} ${limits.min_payout_amount.toFixed(2)}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate maximum payout amount
    if (cashAmount > limits.max_payout_amount) {
      return new Response(
        JSON.stringify({ 
          error: `Maximum payout amount is ${limits.currency} ${limits.max_payout_amount.toFixed(2)}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or create payout tracking record
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const { data: tracking, error: trackingError } = await supabase
      .from('user_payout_tracking')
      .select('*')
      .eq('user_id', user.id)
      .eq('currency', currency)
      .single();

    // Reset daily tracking if needed
    let dailyAmount = 0;
    let dailyCount = 0;
    let monthlyAmount = 0;
    let monthlyCount = 0;

    if (tracking) {
      // Reset daily if last payout was not today
      if (tracking.last_payout_date !== today) {
        dailyAmount = 0;
        dailyCount = 0;
      } else {
        dailyAmount = tracking.daily_payout_amount || 0;
        dailyCount = tracking.daily_transaction_count || 0;
      }

      // Reset monthly if month changed
      if (tracking.current_month !== currentMonth || tracking.current_year !== currentYear) {
        monthlyAmount = 0;
        monthlyCount = 0;
      } else {
        monthlyAmount = tracking.monthly_payout_amount || 0;
        monthlyCount = tracking.monthly_transaction_count || 0;
      }
    }

    // Check daily limits
    if (dailyAmount + cashAmount > limits.daily_limit) {
      return new Response(
        JSON.stringify({ 
          error: `Daily payout limit exceeded. Remaining: ${limits.currency} ${(limits.daily_limit - dailyAmount).toFixed(2)}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (dailyCount >= limits.max_transactions_per_day) {
      return new Response(
        JSON.stringify({ error: 'Daily transaction limit exceeded' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check monthly limits
    if (monthlyAmount + cashAmount > limits.monthly_limit) {
      return new Response(
        JSON.stringify({ 
          error: `Monthly payout limit exceeded. Remaining: ${limits.currency} ${(limits.monthly_limit - monthlyAmount).toFixed(2)}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate unique transfer reference
    const transferRef = `nomli_payout_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create redemption record
    const { data: redemption, error: redemptionError } = await supabase
      .from('token_redemptions')
      .insert({
        streamer_id: user.id,
        token_amount: tokenAmount,
        redemption_method: 'flutterwave_transfer',
        payout_details: {
          bank_code: bankCode,
          account_number: accountNumber,
          account_name: accountName,
          currency: currency,
          cash_amount: payoutAmount,
          fees: totalFee,
          transfer_reference: transferRef,
        },
        status: 'pending',
      })
      .select()
      .single();

    if (redemptionError) {
      console.error('❌ [FLUTTERWAVE] Error creating redemption record:', redemptionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create redemption record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Flutterwave Transfer API
    const flutterwaveResponse = await fetch('https://api.flutterwave.com/v3/transfers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flutterwaveSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_bank: bankCode,
        account_number: accountNumber,
        amount: Math.round(payoutAmount * 100) / 100, // Round to 2 decimal places
        narration: narration || `Token redemption payout - ${tokenAmount} tokens`,
        currency: currency,
        reference: transferRef,
        callback_url: `${supabaseUrl}/functions/v1/flutterwave-transfer-webhook`,
        debit_currency: currency,
      }),
    });

    if (!flutterwaveResponse.ok) {
      const errorData = await flutterwaveResponse.json().catch(() => ({}));
      console.error('❌ [FLUTTERWAVE] Transfer API error:', errorData);

      // Update redemption status to failed
      await supabase
        .from('token_redemptions')
        .update({ status: 'failed' })
        .eq('id', redemption.id);

      return new Response(
        JSON.stringify({ 
          error: 'Transfer failed',
          details: errorData.message || 'Unknown error'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transferData = await flutterwaveResponse.json();

    if (transferData.status !== 'success') {
      console.error('❌ [FLUTTERWAVE] Transfer not successful:', transferData);

      // Update redemption status to failed
      await supabase
        .from('token_redemptions')
        .update({ status: 'failed' })
        .eq('id', redemption.id);

      return new Response(
        JSON.stringify({ 
          error: transferData.message || 'Transfer failed'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct tokens from wallet
    const { error: walletUpdateError } = await supabase.rpc('update_wallet_balance', {
      p_user_id: user.id,
      p_amount: -tokenAmount,
      p_transaction_type: 'redemption',
      p_reference_id: transferRef,
      p_description: `Payout: ${tokenAmount} tokens → ${currency} ${payoutAmount.toFixed(2)}`,
    });

    if (walletUpdateError) {
      console.error('❌ [FLUTTERWAVE] Error updating wallet:', walletUpdateError);
      // Don't fail - transfer is initiated, wallet can be updated manually
    }

    // Update payout tracking
    const newDailyAmount = dailyAmount + cashAmount;
    const newDailyCount = dailyCount + 1;
    const newMonthlyAmount = monthlyAmount + cashAmount;
    const newMonthlyCount = monthlyCount + 1;

    await supabase
      .from('user_payout_tracking')
      .upsert({
        user_id: user.id,
        currency: currency,
        daily_payout_amount: newDailyAmount,
        daily_transaction_count: newDailyCount,
        last_payout_date: today,
        monthly_payout_amount: newMonthlyAmount,
        monthly_transaction_count: newMonthlyCount,
        current_month: currentMonth,
        current_year: currentYear,
        last_reset_date: today,
      }, {
        onConflict: 'user_id,currency',
      });

    // Update redemption with transfer ID
    await supabase
      .from('token_redemptions')
      .update({
        payout_details: {
          ...redemption.payout_details,
          flutterwave_transfer_id: transferData.data.id,
          flutterwave_status: transferData.data.status,
        },
        status: transferData.data.status === 'SUCCESSFUL' ? 'processing' : 'pending',
      })
      .eq('id', redemption.id);

    console.log('✅ [FLUTTERWAVE] Transfer initiated:', {
      transferId: transferData.data.id,
      amount: payoutAmount,
      currency: currency,
      userId: user.id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        transferId: transferData.data.id,
        amount: payoutAmount,
        currency: currency,
        fees: totalFee,
        status: transferData.data.status,
        message: transferData.message || 'Transfer initiated successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [FLUTTERWAVE] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

