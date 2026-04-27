import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { checkRateLimit, getClientIP, rateLimitResponse, RateLimits } from '../_shared/rateLimit.ts';

interface CheckoutRequest {
  planId: string;
  currency: 'USD' | 'NGN';
  userId: string;
  successUrl: string;
  cancelUrl: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // Get Stripe secret key from environment
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
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

    const requestData: CheckoutRequest = await req.json();
    const { planId, currency, userId, successUrl, cancelUrl } = requestData;

    // Validate input
    if (!planId || !currency || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: planId, currency, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify userId matches authenticated user
    if (userId !== user.id) {
      return new Response(
        JSON.stringify({ error: 'User ID mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting for payment processing
    const ipAddress = getClientIP(req);
    const rateLimitResult = await checkRateLimit(
      supabase,
      user.id,
      ipAddress,
      RateLimits.PAYMENT_PROCESS
    );
    
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // Fetch payment plan from database
    const { data: plan, error: planError } = await supabase
      .from('payment_plans')
      .select('*')
      .eq('id', planId)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      console.error('❌ [STRIPE] Plan not found:', planError);
      return new Response(
        JSON.stringify({ error: 'Payment plan not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Stripe price ID based on currency
    const stripePriceId = currency === 'USD' ? plan.stripe_price_id_usd : plan.stripe_price_id_ngn;
    if (!stripePriceId) {
      console.error('❌ [STRIPE] Stripe Price ID not configured for plan:', planId, 'currency:', currency);
      return new Response(
        JSON.stringify({
          error: 'Checkout is not available for this plan and currency yet.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile for customer info
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single();

    const customerEmail = profile?.email || user.email || '';
    const customerName = profile?.full_name || '';

    // Create Stripe Checkout Session
    const stripeCheckoutUrl = 'https://api.stripe.com/v1/checkout/sessions';
    
    const checkoutParams = new URLSearchParams({
      'payment_method_types[]': 'card',
      'mode': plan.plan_type === 'recurring' ? 'subscription' : 'payment',
      'line_items[0][price]': stripePriceId,
      'line_items[0][quantity]': '1',
      'success_url': successUrl || `${supabaseUrl.replace('/rest/v1', '')}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': cancelUrl || `${supabaseUrl.replace('/rest/v1', '')}/payment-cancel`,
      'customer_email': customerEmail,
      'metadata[user_id]': user.id,
      'metadata[plan_id]': planId,
      'metadata[plan_name]': plan.name,
      'metadata[token_amount]': plan.total_tokens.toString(),
      'metadata[currency]': currency,
      'metadata[plan_category]': plan.plan_category || 'discover',
    });

    // For subscriptions, add subscription_data
    if (plan.plan_type === 'recurring') {
      checkoutParams.append('subscription_data[metadata][user_id]', user.id);
      checkoutParams.append('subscription_data[metadata][plan_id]', planId);
      checkoutParams.append('subscription_data[metadata][token_amount]', plan.total_tokens.toString());
      checkoutParams.append('subscription_data[metadata][plan_category]', plan.plan_category || 'discover');
    }

    const stripeResponse = await fetch(stripeCheckoutUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: checkoutParams.toString(),
    });

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.json().catch(() => ({}));
      console.error('❌ [STRIPE] Checkout session creation failed:', errorData);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create checkout session',
          details: errorData.error?.message || 'Unknown error'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const checkoutSession = await stripeResponse.json();

    console.log('✅ [STRIPE] Checkout session created:', checkoutSession.id);

    // Create pending purchase record for one-time payments
    if (plan.plan_type === 'one_time') {
      const { error: purchaseError } = await supabase
        .from('token_purchases')
        .insert({
          user_id: user.id,
          package_id: planId, // Reference to payment_plan
          token_amount: plan.token_amount,
          bonus_tokens: plan.bonus_tokens,
          total_tokens: plan.total_tokens,
          price_usd: currency === 'USD' ? plan.price_usd : plan.price_usd, // Store USD equivalent
          payment_method: 'stripe',
          payment_id: checkoutSession.id,
          status: 'pending',
        });

      if (purchaseError) {
        console.error('⚠️ [STRIPE] Failed to create purchase record:', purchaseError);
        // Don't fail the request, webhook will handle it
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [STRIPE] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

