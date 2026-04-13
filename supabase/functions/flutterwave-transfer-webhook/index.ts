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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const webhookData = await req.json();
    console.log('📥 [FLUTTERWAVE] Transfer webhook received:', webhookData);

    const { event, data } = webhookData;

    // Handle different event types
    switch (event) {
      case 'transfer.completed':
        await handleTransferCompleted(data, supabase);
        break;

      case 'transfer.failed':
        await handleTransferFailed(data, supabase);
        break;

      case 'transfer.reversed':
        await handleTransferReversed(data, supabase);
        break;

      default:
        console.log('ℹ️ [FLUTTERWAVE] Unhandled event type:', event);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [FLUTTERWAVE] Webhook error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Handle transfer completed
async function handleTransferCompleted(transferData: any, supabase: any) {
  const transferId = transferData.id;
  const reference = transferData.reference;
  const status = transferData.status;

  console.log('✅ [FLUTTERWAVE] Transfer completed:', {
    transferId,
    reference,
    status,
  });

  // Find redemption record by transfer reference
  const { data: redemption, error: findError } = await supabase
    .from('token_redemptions')
    .select('*')
    .eq('payout_details->>transfer_reference', reference)
    .single();

  if (findError || !redemption) {
    console.error('❌ [FLUTTERWAVE] Redemption not found for transfer:', reference);
    return;
  }

  // Update redemption status
  const { error: updateError } = await supabase
    .from('token_redemptions')
    .update({
      status: status === 'SUCCESSFUL' ? 'completed' : 'processing',
      processed_at: new Date().toISOString(),
      payout_details: {
        ...redemption.payout_details,
        flutterwave_transfer_id: transferId,
        flutterwave_status: status,
        completed_at: new Date().toISOString(),
      },
    })
    .eq('id', redemption.id);

  if (updateError) {
    console.error('❌ [FLUTTERWAVE] Error updating redemption:', updateError);
    return;
  }

  console.log('✅ [FLUTTERWAVE] Redemption updated to completed:', redemption.id);
}

// Handle transfer failed
async function handleTransferFailed(transferData: any, supabase: any) {
  const transferId = transferData.id;
  const reference = transferData.reference;
  const reason = transferData.complete_message || transferData.requery_response || 'Unknown error';

  console.log('❌ [FLUTTERWAVE] Transfer failed:', {
    transferId,
    reference,
    reason,
  });

  // Find redemption record
  const { data: redemption, error: findError } = await supabase
    .from('token_redemptions')
    .select('*')
    .eq('payout_details->>transfer_reference', reference)
    .single();

  if (findError || !redemption) {
    console.error('❌ [FLUTTERWAVE] Redemption not found for transfer:', reference);
    return;
  }

  // Refund tokens to user wallet
  const { error: refundError } = await supabase.rpc('update_wallet_balance', {
    p_user_id: redemption.streamer_id,
    p_amount: redemption.token_amount,
    p_transaction_type: 'refund',
    p_reference_id: reference,
    p_description: `Refund: Transfer failed - ${reason}`,
  });

  if (refundError) {
    console.error('❌ [FLUTTERWAVE] Error refunding tokens:', refundError);
  }

  // Update redemption status
  const { error: updateError } = await supabase
    .from('token_redemptions')
    .update({
      status: 'failed',
      processed_at: new Date().toISOString(),
      payout_details: {
        ...redemption.payout_details,
        flutterwave_transfer_id: transferId,
        flutterwave_status: 'FAILED',
        failure_reason: reason,
      },
    })
    .eq('id', redemption.id);

  if (updateError) {
    console.error('❌ [FLUTTERWAVE] Error updating redemption:', updateError);
  }

  console.log('✅ [FLUTTERWAVE] Redemption updated to failed, tokens refunded:', redemption.id);
}

// Handle transfer reversed
async function handleTransferReversed(transferData: any, supabase: any) {
  const transferId = transferData.id;
  const reference = transferData.reference;

  console.log('🔄 [FLUTTERWAVE] Transfer reversed:', {
    transferId,
    reference,
  });

  // Find redemption record
  const { data: redemption, error: findError } = await supabase
    .from('token_redemptions')
    .select('*')
    .eq('payout_details->>transfer_reference', reference)
    .single();

  if (findError || !redemption) {
    console.error('❌ [FLUTTERWAVE] Redemption not found for transfer:', reference);
    return;
  }

  // Refund tokens to user wallet
  const { error: refundError } = await supabase.rpc('update_wallet_balance', {
    p_user_id: redemption.streamer_id,
    p_amount: redemption.token_amount,
    p_transaction_type: 'refund',
    p_reference_id: reference,
    p_description: 'Refund: Transfer reversed',
  });

  if (refundError) {
    console.error('❌ [FLUTTERWAVE] Error refunding tokens:', refundError);
  }

  // Update redemption status
  const { error: updateError } = await supabase
    .from('token_redemptions')
    .update({
      status: 'failed',
      processed_at: new Date().toISOString(),
      payout_details: {
        ...redemption.payout_details,
        flutterwave_transfer_id: transferId,
        flutterwave_status: 'REVERSED',
      },
    })
    .eq('id', redemption.id);

  if (updateError) {
    console.error('❌ [FLUTTERWAVE] Error updating redemption:', updateError);
  }

  console.log('✅ [FLUTTERWAVE] Redemption updated to reversed, tokens refunded:', redemption.id);
}

