import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Verify Flutterwave webhook signature
 * Flutterwave sends verif-hash header that should match secret hash
 */
function verifyWebhookSignature(
  signature: string | null,
  secretHash: string
): boolean {
  if (!signature || !secretHash) {
    return false
  }
  
  // Flutterwave sends the secret hash in the verif-hash header
  // It should match exactly with your configured secret hash
  return signature === secretHash
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get webhook signature from header
    const signature = req.headers.get('verif-hash')
    const secretHash = Deno.env.get('FLUTTERWAVE_SECRET_HASH')
    
    if (!secretHash) {
      console.error('❌ [FLUTTERWAVE] Secret hash not configured')
      return new Response(
        JSON.stringify({ success: false, error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get request body
    const body = await req.text()
    
    // Verify webhook signature
    if (signature) {
      const isValid = verifyWebhookSignature(signature, secretHash)
      if (!isValid) {
        console.error('❌ [FLUTTERWAVE] Invalid webhook signature')
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      console.warn('⚠️ [FLUTTERWAVE] No signature header found - webhook may be from test mode')
    }

    const webhookData = JSON.parse(body)
    console.log('📥 [FLUTTERWAVE] Webhook received:', {
      event: webhookData.event,
      tx_ref: webhookData.data?.tx_ref,
      status: webhookData.data?.status,
    })

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Handle charge.completed event
    if (webhookData.event === 'charge.completed') {
      const transaction = webhookData.data
      const txRef = transaction.tx_ref
      const status = transaction.status

      if (status === 'successful') {
        console.log('✅ [FLUTTERWAVE] Processing successful payment:', {
          txRef,
          transactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
        })

        // Find the purchase record - try both tx_ref and transaction.id
        let purchase = null
        let purchaseError = null

        // First try with tx_ref (payment_id)
        const { data: purchaseByTxRef, error: errorByTxRef } = await supabase
          .from('token_purchases')
          .select('*, token_packages(*)')
          .eq('payment_id', txRef)
          .eq('status', 'pending')
          .single()

        if (purchaseByTxRef && !errorByTxRef) {
          purchase = purchaseByTxRef
          console.log('✅ [FLUTTERWAVE] Found purchase by tx_ref:', txRef)
        } else {
          // Try with transaction ID if tx_ref doesn't work
          if (transaction.id) {
            const { data: purchaseById, error: errorById } = await supabase
              .from('token_purchases')
              .select('*, token_packages(*)')
              .eq('payment_id', transaction.id.toString())
              .eq('status', 'pending')
              .single()

            if (purchaseById && !errorById) {
              purchase = purchaseById
              console.log('✅ [FLUTTERWAVE] Found purchase by transaction ID:', transaction.id)
            } else {
              purchaseError = errorById || errorByTxRef
            }
          } else {
            purchaseError = errorByTxRef
          }
        }

        // Also try without status filter as fallback
        if (!purchase) {
          const { data: purchaseAnyStatus } = await supabase
            .from('token_purchases')
            .select('*, token_packages(*)')
            .eq('payment_id', txRef)
            .single()

          if (purchaseAnyStatus) {
            purchase = purchaseAnyStatus
            console.log('⚠️ [FLUTTERWAVE] Found purchase but status is:', purchaseAnyStatus.status)
          }
        }

        if (!purchase) {
          console.error('❌ [FLUTTERWAVE] Purchase not found:', {
            txRef,
            transactionId: transaction.id,
            error: purchaseError,
          })
          
          // Log all pending purchases for debugging
          const { data: allPending } = await supabase
            .from('token_purchases')
            .select('id, payment_id, status, user_id, created_at')
            .eq('status', 'pending')
            .limit(10)
          
          console.log('📊 [FLUTTERWAVE] Recent pending purchases:', allPending)
          
          return new Response(
            JSON.stringify({ success: false, error: 'Purchase not found', txRef, transactionId: transaction.id }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Check if already processed (idempotency)
        if (purchase.status === 'completed') {
          console.log('✅ [FLUTTERWAVE] Purchase already processed:', txRef)
          return new Response(
            JSON.stringify({ success: true, message: 'Already processed' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Update purchase status
        const { error: updateError } = await supabase
          .from('token_purchases')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            payment_id: transaction.id?.toString() || txRef,
          })
          .eq('id', purchase.id)

        if (updateError) {
          console.error('❌ [FLUTTERWAVE] Error updating purchase:', updateError)
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to update purchase' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Add tokens to user wallet
        const { data: wallet, error: walletError } = await supabase
          .from('user_wallets')
          .select('token_balance, total_purchased')
          .eq('user_id', purchase.user_id)
          .single()

        if (walletError || !wallet) {
          console.error('❌ [FLUTTERWAVE] Wallet not found:', walletError)
          return new Response(
            JSON.stringify({ success: false, error: 'Wallet not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const newBalance = wallet.token_balance + purchase.total_tokens
        const newTotalPurchased = wallet.total_purchased + purchase.total_tokens

        const { error: walletUpdateError } = await supabase
          .from('user_wallets')
          .update({
            token_balance: newBalance,
            total_purchased: newTotalPurchased,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', purchase.user_id)

        if (walletUpdateError) {
          console.error('❌ [FLUTTERWAVE] Error updating wallet:', walletUpdateError)
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to update wallet' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Record wallet transaction
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

        console.log('✅ [FLUTTERWAVE] Payment processed successfully:', {
          purchaseId: purchase.id,
          userId: purchase.user_id,
          tokens: purchase.total_tokens,
          newBalance,
          oldBalance: wallet.token_balance,
        })

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Payment processed',
            data: {
              purchaseId: purchase.id,
              userId: purchase.user_id,
              tokens: purchase.total_tokens,
              newBalance,
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else if (status === 'failed') {
        // Mark purchase as failed
        const { error: updateError } = await supabase
          .from('token_purchases')
          .update({
            status: 'failed',
          })
          .eq('payment_id', txRef)
          .eq('status', 'pending')

        console.log('❌ [FLUTTERWAVE] Payment failed:', txRef)
        return new Response(
          JSON.stringify({ success: true, message: 'Payment failed recorded' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Return success for other events (we only care about charge.completed)
    return new Response(
      JSON.stringify({ success: true, message: 'Webhook received' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ [FLUTTERWAVE] Webhook error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

