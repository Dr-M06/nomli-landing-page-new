import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
}

async function fetchPlanCategory(supabase: any, planId: string): Promise<string> {
  const { data, error } = await supabase
    .from('payment_plans')
    .select('plan_category')
    .eq('id', planId)
    .single();
  if (error) {
    console.warn('⚠️ [STRIPE] Could not load plan_category for plan', planId, error.message);
  }
  return data?.plan_category || 'discover';
}

/** Dating uses discover_premium_until; Creator Pro uses creator_pro_until — never mix. */
async function applyProfilePremiumForPlan(
  supabase: any,
  userId: string,
  planId: string,
  active: boolean,
  periodEndIso: string | null
) {
  const cat = await fetchPlanCategory(supabase, planId);
  const patch: Record<string, unknown> = {};
  if (cat === 'discover') {
    patch.discover_premium_until = active && periodEndIso ? periodEndIso : null;
  } else if (cat === 'creator') {
    patch.creator_pro_until = active && periodEndIso ? periodEndIso : null;
  }
  if (Object.keys(patch).length === 0) {
    console.log('ℹ️ [STRIPE] plan_category', cat, '— no profile premium flags to set');
    return;
  }
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) {
    console.error('❌ [STRIPE] Error updating profiles premium flags:', error);
  } else if (active && periodEndIso) {
    console.log('✅ [STRIPE] Premium flag set for', cat, 'until:', periodEndIso);
    if (cat === 'creator') {
      const { error: fcErr } = await supabase.rpc('schedule_founding_creator_credit_vesting', {
        p_user_id: userId,
        p_period_end: periodEndIso,
      });
      if (fcErr) {
        console.warn('⚠️ [STRIPE] schedule_founding_creator_credit_vesting:', fcErr.message);
      }
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Stripe webhook secret from environment
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('❌ [STRIPE] STRIPE_WEBHOOK_SECRET not configured');
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }

    // Get Stripe signature from headers
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get request body
    const body = await req.text();

    // Verify webhook signature (simplified - in production, use Stripe's signature verification)
    // For now, we'll trust the webhook if it comes from Stripe
    // TODO: Implement proper signature verification using crypto.subtle

    // Parse Stripe event
    const event: StripeEvent = JSON.parse(body);

    console.log('📥 [STRIPE] Webhook received:', event.type, event.id);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event, supabase);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event, supabase);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event, supabase);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event, supabase);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event, supabase);
        break;

      default:
        console.log('ℹ️ [STRIPE] Unhandled event type:', event.type);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [STRIPE] Webhook error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Handle checkout.session.completed (one-time payments)
async function handleCheckoutCompleted(event: StripeEvent, supabase: any) {
  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const planId = session.metadata?.plan_id;
  const tokenAmount = parseInt(session.metadata?.token_amount || '0');

  if (!userId || !planId) {
    console.error('❌ [STRIPE] Missing metadata in checkout session:', session.id);
    return;
  }

  console.log('✅ [STRIPE] Checkout completed:', {
    sessionId: session.id,
    userId,
    planId,
    tokenAmount,
  });

  // Find the purchase record
  const { data: purchase, error: findError } = await supabase
    .from('token_purchases')
    .select('*')
    .eq('payment_id', session.id)
    .single();

  if (findError && findError.code !== 'PGRST116') {
    console.error('❌ [STRIPE] Error finding purchase:', findError);
    return;
  }

  // Update purchase status to completed
  const { error: updateError } = await supabase
    .from('token_purchases')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('payment_id', session.id);

  if (updateError) {
    console.error('❌ [STRIPE] Error updating purchase:', updateError);
    return;
  }

  // Credit tokens to user wallet
  const { error: walletError } = await supabase.rpc('update_wallet_balance', {
    p_user_id: userId,
    p_amount: tokenAmount,
    p_transaction_type: 'purchase',
    p_reference_id: session.id,
    p_description: `Token purchase: ${session.metadata?.plan_name || 'Unknown plan'}`,
  });

  if (walletError) {
    console.error('❌ [STRIPE] Error crediting tokens:', walletError);
    // Don't fail - purchase is recorded, tokens can be credited manually
  } else {
    console.log('✅ [STRIPE] Tokens credited to user:', userId, 'Amount:', tokenAmount);
  }
}

// Handle subscription created/updated
async function handleSubscriptionUpdated(event: StripeEvent, supabase: any) {
  const subscription = event.data.object;
  const userId = subscription.metadata?.user_id;
  const planId = subscription.metadata?.plan_id;
  const tokenAmount = parseInt(subscription.metadata?.token_amount || '0');

  if (!userId || !planId) {
    console.error('❌ [STRIPE] Missing metadata in subscription:', subscription.id);
    return;
  }

  console.log('📝 [STRIPE] Subscription updated:', {
    subscriptionId: subscription.id,
    userId,
    planId,
    status: subscription.status,
  });

  // Get or create customer record
  const { data: customer } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  // Upsert subscription record
  const { error: upsertError } = await supabase
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      plan_id: planId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      stripe_price_id: subscription.items.data[0]?.price?.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      tokens_per_period: tokenAmount,
      tokens_credited_this_period: subscription.status === 'active' ? tokenAmount : 0,
    }, {
      onConflict: 'stripe_subscription_id',
    });

  if (upsertError) {
    console.error('❌ [STRIPE] Error upserting subscription:', upsertError);
    return;
  }

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const subscriptionActive =
    subscription.status === 'active' || subscription.status === 'trialing';
  await applyProfilePremiumForPlan(supabase, userId, planId, subscriptionActive, periodEnd);

  // If subscription is active and just created, credit tokens
  if (subscription.status === 'active' && event.type === 'customer.subscription.created') {
    const { error: walletError } = await supabase.rpc('update_wallet_balance', {
      p_user_id: userId,
      p_amount: tokenAmount,
      p_transaction_type: 'purchase',
      p_reference_id: subscription.id,
      p_description: `Subscription started: ${subscription.metadata?.plan_name || 'Unknown plan'}`,
    });

    if (walletError) {
      console.error('❌ [STRIPE] Error crediting subscription tokens:', walletError);
    } else {
      console.log('✅ [STRIPE] Subscription tokens credited:', userId, 'Amount:', tokenAmount);
    }
  }
}

// Handle subscription deleted
async function handleSubscriptionDeleted(event: StripeEvent, supabase: any) {
  const subscription = event.data.object;
  const userId = subscription.metadata?.user_id;

  console.log('🗑️ [STRIPE] Subscription deleted:', subscription.id);

  const { data: subRow } = await supabase
    .from('user_subscriptions')
    .select('user_id, plan_id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  const uid = userId || subRow?.user_id;
  const pid = subscription.metadata?.plan_id || subRow?.plan_id;
  if (uid && pid) {
    const cat = await fetchPlanCategory(supabase, pid);
    const patch: Record<string, unknown> = {};
    if (cat === 'discover') patch.discover_premium_until = null;
    if (cat === 'creator') patch.creator_pro_until = null;
    if (Object.keys(patch).length > 0) {
      const { error: profileError } = await supabase.from('profiles').update(patch).eq('id', uid);
      if (profileError) {
        console.error('❌ [STRIPE] Error clearing profile premium flags:', profileError);
      } else {
        console.log('✅ [STRIPE] Cleared premium flags for', cat, 'user:', uid);
      }
    }
  } else if (uid) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ discover_premium_until: null })
      .eq('id', uid);
    if (profileError) {
      console.error('❌ [STRIPE] Error clearing discover_premium_until (legacy):', profileError);
    }
  }

  const { error: updateError } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  if (updateError) {
    console.error('❌ [STRIPE] Error updating canceled subscription:', updateError);
  }
}

// Handle invoice payment succeeded (subscription renewal)
async function handleInvoicePaymentSucceeded(event: StripeEvent, supabase: any) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) {
    return; // Not a subscription invoice
  }

  console.log('💰 [STRIPE] Invoice payment succeeded:', invoice.id);

  // Find subscription
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!subscription) {
    console.error('❌ [STRIPE] Subscription not found for invoice:', subscriptionId);
    return;
  }

  // Reset tokens credited this period and credit new tokens
  const { error: updateError } = await supabase
    .from('user_subscriptions')
    .update({
      tokens_credited_this_period: subscription.tokens_per_period,
      current_period_start: new Date(invoice.period_start * 1000).toISOString(),
      current_period_end: new Date(invoice.period_end * 1000).toISOString(),
    })
    .eq('id', subscription.id);

  if (updateError) {
    console.error('❌ [STRIPE] Error updating subscription period:', updateError);
    return;
  }

  const periodEndIso = new Date(invoice.period_end * 1000).toISOString();
  const { data: planRow } = await supabase
    .from('payment_plans')
    .select('plan_category')
    .eq('id', subscription.plan_id)
    .maybeSingle();
  if (planRow?.plan_category === 'creator') {
    const { error: fcErr } = await supabase.rpc('schedule_founding_creator_credit_vesting', {
      p_user_id: subscription.user_id,
      p_period_end: periodEndIso,
    });
    if (fcErr) {
      console.warn('⚠️ [STRIPE] invoice schedule_founding_creator_credit_vesting:', fcErr.message);
    }
  }

  // Credit tokens for new period
  const { error: walletError } = await supabase.rpc('update_wallet_balance', {
    p_user_id: subscription.user_id,
    p_amount: subscription.tokens_per_period,
    p_transaction_type: 'purchase',
    p_reference_id: invoice.id,
    p_description: `Subscription renewal: ${subscriptionId}`,
  });

  if (walletError) {
    console.error('❌ [STRIPE] Error crediting renewal tokens:', walletError);
  } else {
    console.log('✅ [STRIPE] Renewal tokens credited:', subscription.user_id, 'Amount:', subscription.tokens_per_period);
  }
}

// Handle invoice payment failed
async function handleInvoicePaymentFailed(event: StripeEvent, supabase: any) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) {
    return;
  }

  console.log('⚠️ [STRIPE] Invoice payment failed:', invoice.id);

  const { error: updateError } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'past_due',
    })
    .eq('stripe_subscription_id', subscriptionId);

  if (updateError) {
    console.error('❌ [STRIPE] Error updating subscription status:', updateError);
  }
}

