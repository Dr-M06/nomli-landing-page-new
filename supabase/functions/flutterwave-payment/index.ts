import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentRequest {
  tx_ref: string;
  amount: number;
  currency: string;
  customer: {
    email: string;
    name: string;
  };
  customizations: {
    title: string;
    description: string;
    logo?: string;
  };
  meta: {
    user_id: string;
    purchase_id: string;
    package_id: string;
    token_amount: number;
    bonus_tokens: number;
    total_tokens: number;
  };
  redirect_url: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Flutterwave credentials
    const flutterwaveSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY')
    
    if (!flutterwaveSecretKey) {
      console.error('❌ Flutterwave secret key not configured')
      console.error('💡 Add FLUTTERWAVE_SECRET_KEY to Supabase Edge Function secrets')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Payment service not configured. Please add FLUTTERWAVE_SECRET_KEY to Supabase secrets.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Detect test mode from secret key
    const isTestMode = flutterwaveSecretKey.includes('TEST') || flutterwaveSecretKey.startsWith('FLWSECK_TEST')
    
    const requestData: PaymentRequest = await req.json()

    console.log('💰 [FLUTTERWAVE] Creating payment link:', {
      tx_ref: requestData.tx_ref,
      amount: requestData.amount,
      currency: requestData.currency,
      user_id: requestData.meta.user_id,
      test_mode: isTestMode,
      redirect_url: requestData.redirect_url,
    })

    // Call Flutterwave API to create payment link
    // Note: Same endpoint for test and live, difference is in the API key
    const flutterwaveResponse = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flutterwaveSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: requestData.tx_ref,
        amount: requestData.amount,
        currency: requestData.currency,
        redirect_url: requestData.redirect_url,
        payment_options: 'card,banktransfer,ussd,mobilemoney',
        customer: requestData.customer,
        customizations: requestData.customizations,
        meta: requestData.meta,
      }),
    })

    if (!flutterwaveResponse.ok) {
      const errorData = await flutterwaveResponse.json().catch(() => ({}))
      console.error('❌ [FLUTTERWAVE] API error:', errorData)
      console.error('❌ [FLUTTERWAVE] Response status:', flutterwaveResponse.status)
      console.error('❌ [FLUTTERWAVE] Test mode:', isTestMode)
      
      // Provide helpful error message for test mode
      let errorMessage = errorData.message || 'Failed to create payment link'
      if (isTestMode && errorData.message?.includes('live')) {
        errorMessage = 'Test mode detected but payment failed. Ensure Flutterwave dashboard is set to TEST MODE and you\'re using test keys (FLWSECK_TEST-...)'
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: isTestMode ? 'Using test mode. Test cards: 5531886652142950, CVV: 123, PIN: 3310, OTP: 123456' : undefined
        }),
        { status: flutterwaveResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const flutterwaveData = await flutterwaveResponse.json()

    if (flutterwaveData.status === 'success' && flutterwaveData.data?.link) {
      console.log('✅ [FLUTTERWAVE] Payment link created:', flutterwaveData.data.link)
      console.log('✅ [FLUTTERWAVE] Test mode:', isTestMode)
      
      if (isTestMode) {
        console.log('💡 [FLUTTERWAVE] Test card details:')
        console.log('   Card: 5531886652142950')
        console.log('   CVV: 123')
        console.log('   PIN: 3310')
        console.log('   OTP: 123456')
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          paymentLink: flutterwaveData.data.link,
          transactionId: requestData.tx_ref,
          testMode: isTestMode,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.error('❌ [FLUTTERWAVE] Unexpected response:', flutterwaveData)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: flutterwaveData.message || 'Failed to create payment link',
        response: flutterwaveData
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ [FLUTTERWAVE] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

