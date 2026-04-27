import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      return new Response(
        JSON.stringify({ success: false, error: 'Payment service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { tx_ref } = await req.json()

    if (!tx_ref) {
      return new Response(
        JSON.stringify({ success: false, error: 'Transaction reference required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('🔍 [FLUTTERWAVE] Verifying transaction:', tx_ref)

    // First, check database status (webhook might have already processed it)
    const { data: purchase, error: purchaseError } = await supabase
      .from('token_purchases')
      .select('status, payment_id')
      .eq('payment_id', tx_ref)
      .single()

    if (purchase && purchase.status === 'completed') {
      console.log('✅ [FLUTTERWAVE] Payment already completed in database')
      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          alreadyProcessed: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If not completed in DB, verify with Flutterwave API
    // Flutterwave verify endpoint uses tx_ref as query parameter
    const verifyResponse = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(tx_ref)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${flutterwaveSecretKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!verifyResponse.ok) {
      const errorData = await verifyResponse.json().catch(() => ({}))
      console.error('❌ [FLUTTERWAVE] Verification API error:', errorData)
      
      // If API fails but purchase exists, check its status
      if (purchase) {
        return new Response(
          JSON.stringify({
            success: true,
            verified: purchase.status === 'completed',
            status: purchase.status,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          verified: false,
          error: errorData.message || 'Verification failed' 
        }),
        { status: verifyResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const verifyData = await verifyResponse.json()

    console.log('📊 [FLUTTERWAVE] Verification response:', {
      status: verifyData.status,
      transactionStatus: verifyData.data?.status,
      txRef: verifyData.data?.tx_ref,
    })

          if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
            // Double-check database status
            const { data: updatedPurchase } = await supabase
              .from('token_purchases')
              .select('status, user_id, total_tokens')
              .eq('payment_id', tx_ref)
              .single()

            // If payment is verified but not processed, trigger processing
            if (updatedPurchase && updatedPurchase.status !== 'completed') {
              console.log('⚠️ [FLUTTERWAVE] Payment verified but not processed, triggering webhook processing...')
              
              // Call webhook processing logic directly
              try {
                const { data: purchase } = await supabase
                  .from('token_purchases')
                  .select('*, token_packages(*)')
                  .eq('payment_id', tx_ref)
                  .single()

                if (purchase && purchase.status === 'pending') {
                  // Update purchase status
                  await supabase
                    .from('token_purchases')
                    .update({
                      status: 'completed',
                      completed_at: new Date().toISOString(),
                    })
                    .eq('id', purchase.id)

                  // Update wallet
                  const { data: wallet } = await supabase
                    .from('user_wallets')
                    .select('token_balance, total_purchased')
                    .eq('user_id', purchase.user_id)
                    .single()

                  if (wallet) {
                    const newBalance = wallet.token_balance + purchase.total_tokens
                    await supabase
                      .from('user_wallets')
                      .update({
                        token_balance: newBalance,
                        total_purchased: wallet.total_purchased + purchase.total_tokens,
                        updated_at: new Date().toISOString(),
                      })
                      .eq('user_id', purchase.user_id)

                    // Record transaction
                    await supabase
                      .from('wallet_transactions')
                      .insert({
                        user_id: purchase.user_id,
                        amount: purchase.total_tokens,
                        transaction_type: 'purchase',
                        reference_id: purchase.id,
                        description: `Token purchase: ${purchase.total_tokens} tokens`,
                        balance_after: newBalance,
                      })

                    console.log('✅ [FLUTTERWAVE] Payment processed via verify endpoint')
                  }
                }
              } catch (processError) {
                console.error('❌ [FLUTTERWAVE] Error processing payment:', processError)
              }
            }

            return new Response(
              JSON.stringify({
                success: true,
                verified: true,
                alreadyProcessed: updatedPurchase?.status === 'completed',
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

    // Payment not yet successful
    return new Response(
      JSON.stringify({
        success: true,
        verified: false,
        status: verifyData.data?.status || 'pending',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ [FLUTTERWAVE] Verification error:', error)
    return new Response(
      JSON.stringify({ success: false, verified: false, error: 'Verification failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

