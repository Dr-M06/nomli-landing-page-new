import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AirtimeRequest {
  phone_number: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  amount?: number;
  bundle_code?: string;
  currency: 'NGN';
  token_amount: number;
  user_id: string;
  redemption_type: 'airtime' | 'data';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const flutterwaveSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY') ?? '';

    if (!flutterwaveSecretKey) {
      console.error('❌ [AIRTIME] Flutterwave secret key not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Airtime service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: AirtimeRequest = await req.json();
    const { phone_number, network, amount, bundle_code, currency, token_amount, user_id, redemption_type } = body;

    // Validate request
    if (!phone_number || !network || !token_amount || !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user ID matches authenticated user
    if (user.id !== user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has enough earned tokens
    const { data: wallet, error: walletError } = await supabase
      .from('user_wallets')
      .select('earned_tokens_balance')
      .eq('user_id', user_id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ success: false, error: 'Wallet not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if ((wallet.earned_tokens_balance || 0) < token_amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient earned tokens' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate amount if not provided (for data bundles, amount is in tokens)
    // For data bundles: 500 tokens = 1GB, so we need to convert tokens to actual NGN amount
    // For airtime: 1 token = ₦15, so amount * 15 = NGN
    let finalAmount = amount;
    
    if (redemption_type === 'data' && bundle_code) {
      // For data bundles, the amount parameter is in tokens
      // We need to fetch the actual bundle price from Flutterwave or use a conversion
      // Since 500 tokens = 1GB, and typical 1GB costs ~₦300-500, we'll use a conversion
      // But for now, we'll use the token amount as a reference and fetch actual price
      // In production, you should fetch bundle prices from Flutterwave's bill-items API
      
      // For now, use a simple conversion: tokens * 15 (same as airtime)
      // But note: This should be replaced with actual bundle pricing from Flutterwave
      finalAmount = amount * 15; // Temporary: will be replaced with actual bundle price
    } else if (redemption_type === 'airtime') {
      // For airtime: 1 token = ₦15
      finalAmount = amount * 15;
    }

    if (!finalAmount || finalAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Amount is required and must be greater than 0' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate unique reference
    const reference = `nomli_airtime_${user_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Call Flutterwave Bill Payments API
    let flutterwaveResponse;
    try {
      // First, get the biller code for the network
      // MTN: BIL136, AIRTEL: BIL137, GLO: BIL138, 9MOBILE: BIL139 (for airtime)
      // For data bundles, use MOBILEDATA category
      const billerCodes: Record<string, { airtime: string; data: string }> = {
        'MTN': { airtime: 'BIL136', data: 'BIL136' },
        'AIRTEL': { airtime: 'BIL137', data: 'BIL137' },
        'GLO': { airtime: 'BIL138', data: 'BIL138' },
        '9MOBILE': { airtime: 'BIL139', data: 'BIL139' },
      };

      const billerCode = billerCodes[network]?.[redemption_type === 'data' ? 'data' : 'airtime'] || 'BIL136';
      
      if (redemption_type === 'data' && bundle_code) {
        // Purchase data bundle - use create-bill endpoint with item_code
        flutterwaveResponse = await fetch('https://api.flutterwave.com/v3/bills', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            country: 'NG',
            customer: phone_number,
            amount: finalAmount,
            type: 'MOBILEDATA', // Mobile data service
            reference: reference,
            biller_name: network,
            // Note: For data bundles, you may need to fetch item_code from bill-items endpoint first
            // This is a simplified version - in production, fetch available bundles first
          }),
        });
      } else {
        // Purchase airtime
        flutterwaveResponse = await fetch('https://api.flutterwave.com/v3/bills', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            country: 'NG',
            customer: phone_number,
            amount: finalAmount,
            type: 'AIRTIME',
            reference: reference,
            biller_name: network,
          }),
        });
      }

      if (!flutterwaveResponse.ok) {
        const errorData = await flutterwaveResponse.json().catch(() => ({}));
        console.error('❌ [AIRTIME] Flutterwave API error:', errorData);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: errorData.message || 'Failed to process airtime purchase' 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const flutterwaveData = await flutterwaveResponse.json();

      if (flutterwaveData.status !== 'success') {
        console.error('❌ [AIRTIME] Flutterwave purchase not successful:', flutterwaveData);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: flutterwaveData.message || 'Airtime purchase failed' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Deduct earned tokens from wallet
      const { error: redeemError } = await supabase.rpc('redeem_earned_tokens', {
        p_user_id: user_id,
        p_token_amount: token_amount,
        p_redemption_method: redemption_type === 'airtime' ? 'airtime' : 'data_bundle',
        p_payout_details: {
          phone_number,
          network,
          amount: finalAmount,
          bundle_code: bundle_code || null,
          flutterwave_reference: reference,
          flutterwave_transaction_id: flutterwaveData.data?.transaction_id,
        },
      });

      if (redeemError) {
        console.error('❌ [AIRTIME] Error redeeming tokens:', redeemError);
        // Note: Airtime was purchased but tokens weren't deducted
        // In production, you might want to implement a refund mechanism
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Airtime purchased but failed to deduct tokens. Please contact support.' 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Record redemption in token_redemptions table (already done by redeem_earned_tokens function)
      // But we can update it with Flutterwave transaction details
      const { data: redemptionRecord } = await supabase
        .from('token_redemptions')
        .select('id')
        .eq('user_id', user_id)
        .eq('reference_id', reference)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (redemptionRecord) {
        await supabase
          .from('token_redemptions')
          .update({
            status: flutterwaveData.data?.status === 'successful' ? 'completed' : 'pending',
            payout_details: {
              ...redemptionRecord.payout_details,
              flutterwave_transaction_id: flutterwaveData.data?.transaction_id,
              flutterwave_reference: reference,
            },
          })
          .eq('id', redemptionRecord.id);
      }

      console.log('✅ [AIRTIME] Airtime purchase successful:', {
        reference,
        phone_number,
        network,
        amount: finalAmount,
        transaction_id: flutterwaveData.data?.transaction_id,
      });

      return new Response(
        JSON.stringify({
          success: true,
          transaction_id: flutterwaveData.data?.transaction_id || reference,
          reference: reference,
          amount: finalAmount,
          phone_number: phone_number,
          network: network,
          status: flutterwaveData.data?.status === 'successful' ? 'success' : 'pending',
          message: `Airtime purchase successful. ${finalAmount} NGN credited to ${phone_number}`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (apiError) {
      console.error('❌ [AIRTIME] Error calling Flutterwave API:', apiError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to process airtime purchase. Please try again.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('❌ [AIRTIME] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An unexpected error occurred' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
