import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

const APPLE_VERIFY_RECEIPT_URL_PRODUCTION = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_RECEIPT_URL_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

interface VerifyReceiptRequest {
  receipt: string;
  productId: string;
  transactionId: string;
  userId: string;
  packageId?: string; // Optional - will be looked up if not provided
}

serve(async (req) => {
  // Log immediately - even before CORS check
  console.log('🔔 [verify-apple-receipt] Function invoked at:', new Date().toISOString());
  console.log('📥 [verify-apple-receipt] Request method:', req.method);
  console.log('📥 [verify-apple-receipt] Request URL:', req.url);
  console.log('📥 [verify-apple-receipt] Request headers:', Object.keys(req.headers));

  // Handle CORS preflight (pass request so response reflects real Origin)
  if (req.method === 'OPTIONS') {
    console.log('✅ [verify-apple-receipt] Handling CORS preflight');
    return handleCorsPreflight(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const body = await req.json();
    console.log('📦 [verify-apple-receipt] Request body keys:', Object.keys(body));
    console.log('📦 [verify-apple-receipt] Request body:', {
      hasReceipt: !!body.receipt,
      receiptLength: body.receipt?.length || 0,
      receiptPreview: body.receipt ? `${body.receipt.substring(0, 50)}...` : null,
      productId: body.productId,
      transactionId: body.transactionId,
      userId: body.userId,
      packageId: body.packageId,
    });

    const { receipt, productId, transactionId, userId }: VerifyReceiptRequest = body;

    if (!receipt || !productId || !transactionId || !userId) {
      console.error('❌ [verify-apple-receipt] Missing required fields:', {
        hasReceipt: !!receipt,
        productId,
        transactionId,
        userId,
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate receipt format - Apple receipts are base64-encoded and should be substantial length
    if (receipt.length < 100) {
      console.error('❌ [verify-apple-receipt] Receipt too short for Apple verification:', {
        length: receipt.length,
        receiptPreview: receipt.substring(0, 100),
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Receipt data appears invalid: length ${receipt.length} characters (expected > 100). This may be a transaction ID rather than a full receipt.` 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ [verify-apple-receipt] All required fields present');

    // Get Apple shared secret from environment
    const appleSharedSecret = Deno.env.get('APPLE_SHARED_SECRET');
    if (!appleSharedSecret) {
      console.error('Apple shared secret not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify receipt with Apple
    const verifyBody = {
      'receipt-data': receipt,
      password: appleSharedSecret,
      'exclude-old-transactions': true,
    };

    // Try production first with timeout
    const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 15000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    };

    let response = await fetchWithTimeout(APPLE_VERIFY_RECEIPT_URL_PRODUCTION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verifyBody),
    });

    let verificationResult = await response.json();

    // If sandbox receipt, try sandbox
    if (verificationResult.status === 21007) {
      console.log('Receipt is from sandbox, verifying with sandbox URL...');
      response = await fetchWithTimeout(APPLE_VERIFY_RECEIPT_URL_SANDBOX, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verifyBody),
      });
      verificationResult = await response.json();
    }

    // Check verification status
    if (verificationResult.status !== 0) {
      const errorMessages: Record<number, string> = {
        21000: 'The App Store could not read the JSON object you provided.',
        21002: 'The data in the receipt-data property was malformed or missing. This usually means the receipt is invalid or corrupted.',
        21003: 'The receipt could not be authenticated.',
        21004: 'The shared secret you provided does not match the shared secret on file for your account.',
        21005: 'The receipt server is not currently available.',
        21006: 'This receipt is valid but the subscription has expired.',
        21007: 'This receipt is from the test environment, but it was sent to the production environment for verification.',
        21008: 'This receipt is from the production environment, but it was sent to the test environment for verification.',
        21010: 'This receipt could not be authorized.',
      };

      const errorMessage = errorMessages[verificationResult.status] || `Unknown error code: ${verificationResult.status}`;
      
      console.error('❌ [verify-apple-receipt] Receipt verification failed:', {
        status: verificationResult.status,
        error: errorMessage,
        receiptLength: receipt.length,
        receiptPreview: receipt.substring(0, 50),
      });

      // Special handling for error 21002 (malformed receipt)
      if (verificationResult.status === 21002) {
        console.error('❌ [verify-apple-receipt] Error 21002 details:', {
          receiptLength: receipt.length,
          receiptIsBase64: /^[A-Za-z0-9+/=]+$/.test(receipt),
          receiptFirstChars: receipt.substring(0, 100),
          receiptLastChars: receipt.substring(Math.max(0, receipt.length - 100)),
        });
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Receipt verification failed (${verificationResult.status}): ${errorMessage}`,
          statusCode: verificationResult.status,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if transaction exists in receipt
    const receiptTransactions = verificationResult.receipt?.in_app || [];
    const transaction = receiptTransactions.find(
      (tx: any) => String(tx.transaction_id) === String(transactionId) && tx.product_id === productId
    );

    if (!transaction) {
      console.error('Transaction not found in receipt');
      return new Response(
        JSON.stringify({ success: false, error: 'Transaction not found in receipt' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Idempotency: any prior row for this Apple transaction (tokens or Creator Pro)
    const { data: existingTx } = await supabaseClient
      .from('wallet_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('reference_id', String(transactionId))
      .maybeSingle();

    if (existingTx) {
      console.log('✅ [verify-apple-receipt] Transaction already processed');
      return new Response(
        JSON.stringify({ success: true, message: 'Transaction already processed' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // --- Nomli Creator Pro (auto-renewable): payment_plans.plan_category = creator + iap_product_id_apple
    const { data: creatorPlan } = await supabaseClient
      .from('payment_plans')
      .select('id, name, token_amount, bonus_tokens')
      .eq('iap_product_id_apple', productId)
      .eq('plan_category', 'creator')
      .eq('is_active', true)
      .maybeSingle();

    if (creatorPlan) {
      const expiresMsRaw = (transaction as any).expires_date_ms;
      let expiresMs = expiresMsRaw != null ? parseInt(String(expiresMsRaw), 10) : NaN;
      if (Number.isNaN(expiresMs)) {
        const latest = verificationResult.latest_receipt_info as any[] | undefined;
        const sub = latest?.find((x: any) => x.product_id === productId);
        if (sub?.expires_date_ms != null) {
          expiresMs = parseInt(String(sub.expires_date_ms), 10);
        }
      }
      if (Number.isNaN(expiresMs) || expiresMs <= 0) {
        console.error('❌ [verify-apple-receipt] Creator Pro: missing expires_date_ms in receipt');
        return new Response(
          JSON.stringify({ success: false, error: 'Subscription expiry not found in receipt' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const expiresIso = new Date(expiresMs).toISOString();

      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('creator_pro_until')
        .eq('id', userId)
        .single();

      const prev = profile?.creator_pro_until ? new Date(profile.creator_pro_until as string).getTime() : 0;
      const nextUntil = Math.max(prev, expiresMs);

      const { error: profErr } = await supabaseClient
        .from('profiles')
        .update({ creator_pro_until: new Date(nextUntil).toISOString() })
        .eq('id', userId);

      if (profErr) {
        console.error('❌ [verify-apple-receipt] Creator Pro profile update:', profErr);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to activate Creator Pro' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabaseClient.from('wallet_transactions').insert({
        user_id: userId,
        amount: 0,
        transaction_type: 'creator_pro_apple',
        reference_id: String(transactionId),
        description: `Creator Pro (Apple): ${creatorPlan.name || productId} until ${expiresIso}`,
        balance_after: 0,
      });

      const totalTokens =
        (creatorPlan.token_amount || 0) + (creatorPlan.bonus_tokens || 0);
      if (totalTokens > 0) {
        const { error: wErr } = await supabaseClient.rpc('update_wallet_balance', {
          p_user_id: userId,
          p_amount: totalTokens,
          p_transaction_type: 'bonus',
          p_reference_id: `creator_pro_apple:${transactionId}`,
          p_description: `Creator Pro monthly tokens (${creatorPlan.name || productId})`,
        });
        if (wErr) {
          console.warn('⚠️ [verify-apple-receipt] Creator Pro token credit failed:', wErr);
        }
      }

      console.log('✅ [verify-apple-receipt] Creator Pro activated until', expiresIso);
      return new Response(
        JSON.stringify({ success: true, kind: 'creator_pro', message: 'Creator Pro active', expiresAt: expiresIso }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Token consumables (existing path)
    const { data: packageData, error: packageError } = await supabaseClient.rpc(
      'get_token_package_by_iap_product_id',
      { p_iap_product_id: productId }
    );

    if (packageError || !packageData || packageData.length === 0) {
      console.error('Token package / Creator plan not found:', packageError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unknown product (not a token pack or Creator Pro plan)' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tokenPackage = packageData[0];

    // Calculate total tokens (including bonus)
    const totalTokens = tokenPackage.token_amount + (tokenPackage.bonus_tokens || 0);

    // Ensure user has a wallet (create if missing)
    let { data: wallet, error: walletFetchError } = await supabaseClient
      .from('user_wallets')
      .select('token_balance, total_purchased')
      .eq('user_id', userId)
      .single();

    if (walletFetchError || !wallet) {
      const { error: insertError } = await supabaseClient
        .from('user_wallets')
        .insert({
          user_id: userId,
          token_balance: 0,
          total_purchased: 0,
          total_redeemed: 0,
        });
      if (insertError) {
        console.error('Error creating wallet:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create wallet' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      wallet = { token_balance: 0, total_purchased: 0 };
    }

    const newBalance = wallet.token_balance + totalTokens;
    const newTotalPurchased = wallet.total_purchased + totalTokens;

    // Update user wallet balance
    const { error: walletUpdateError } = await supabaseClient
      .from('user_wallets')
      .update({
        token_balance: newBalance,
        total_purchased: newTotalPurchased,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (walletUpdateError) {
      console.error('Error updating wallet:', walletUpdateError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to credit tokens: ${walletUpdateError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Record wallet transaction (for history display)
    // reference_id must be TEXT in DB (Apple transaction IDs are numeric strings like "2000001121760704", not UUIDs)
    const { error: transactionError } = await supabaseClient
      .from('wallet_transactions')
      .insert({
        user_id: userId,
        amount: Math.round(Number(totalTokens)),
        transaction_type: 'purchase',
        reference_id: String(transactionId),
        description: `Token purchase: ${totalTokens} tokens (Apple IAP)`,
        balance_after: Math.round(Number(newBalance)),
      });

    if (transactionError) {
      console.error('❌ [verify-apple-receipt] Error recording wallet transaction:', transactionError);
      // Don't fail the whole operation - tokens are already credited
    } else {
      console.log('✅ [verify-apple-receipt] Wallet transaction recorded');
    }

    // Record purchase in token_purchases table (for consistency with other payment methods)
    // Note: token_purchases uses payment_id (not transaction_id) and payment_method (not payment_provider)
    const { error: purchaseError } = await supabaseClient
      .from('token_purchases')
      .insert({
        user_id: userId,
        package_id: tokenPackage.id,
        token_amount: tokenPackage.token_amount,
        bonus_tokens: tokenPackage.bonus_tokens || 0,
        total_tokens: totalTokens,
        price_usd: tokenPackage.price_usd,
        payment_method: 'apple_iap',
        payment_id: transactionId, // Use transaction_id as payment_id
        status: 'completed',
        completed_at: new Date().toISOString(),
      });

    if (purchaseError) {
      console.error('❌ [verify-apple-receipt] Error recording purchase:', purchaseError);
      // Don't fail - tokens are already credited and wallet_transaction is recorded
    } else {
      console.log('✅ [verify-apple-receipt] Purchase recorded in token_purchases');
    }

    console.log('✅ [verify-apple-receipt] Purchase processed successfully:', {
      userId,
      packageId: tokenPackage.id,
      transactionId,
      totalTokens,
      newBalance,
    });

    const successResponse = {
      success: true,
      message: 'Purchase processed successfully',
      tokens: totalTokens,
      kind: 'tokens',
    };

    console.log('📤 [verify-apple-receipt] Sending success response:', successResponse);

    return new Response(
      JSON.stringify(successResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ [verify-apple-receipt] Error in verify-apple-receipt:', error);
    console.error('❌ [verify-apple-receipt] Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });

    const errorResponse = {
      success: false,
      error: error.message || 'Unknown error',
    };

    console.log('📤 [verify-apple-receipt] Sending error response:', errorResponse);

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

