import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Manual Payment Processing
 * Use this to manually process pending payments if webhook fails
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { payment_id } = await req.json()

    if (!payment_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'payment_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('🔄 [MANUAL] Processing payment:', payment_id)

    // Find pending purchase
    const { data: purchase, error: purchaseError } = await supabase
      .from('token_purchases')
      .select('*, token_packages(*)')
      .eq('payment_id', payment_id)
      .eq('status', 'pending')
      .single()

    if (purchaseError || !purchase) {
      console.error('❌ [MANUAL] Purchase not found:', purchaseError)
      return new Response(
        JSON.stringify({ success: false, error: 'Purchase not found or already processed' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update purchase status
    const { error: updateError } = await supabase
      .from('token_purchases')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', purchase.id)

    if (updateError) {
      console.error('❌ [MANUAL] Error updating purchase:', updateError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update purchase' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get wallet
    const { data: wallet, error: walletError } = await supabase
      .from('user_wallets')
      .select('token_balance, total_purchased')
      .eq('user_id', purchase.user_id)
      .single()

    if (walletError || !wallet) {
      console.error('❌ [MANUAL] Wallet not found:', walletError)
      return new Response(
        JSON.stringify({ success: false, error: 'Wallet not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const newBalance = wallet.token_balance + purchase.total_tokens
    const newTotalPurchased = wallet.total_purchased + purchase.total_tokens

    // Update wallet
    const { error: walletUpdateError } = await supabase
      .from('user_wallets')
      .update({
        token_balance: newBalance,
        total_purchased: newTotalPurchased,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', purchase.user_id)

    if (walletUpdateError) {
      console.error('❌ [MANUAL] Error updating wallet:', walletUpdateError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update wallet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    console.log('✅ [MANUAL] Payment processed successfully:', {
      purchaseId: purchase.id,
      userId: purchase.user_id,
      tokens: purchase.total_tokens,
      newBalance,
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment processed',
        data: {
          purchaseId: purchase.id,
          tokens: purchase.total_tokens,
          newBalance,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ [MANUAL] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

