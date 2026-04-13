// Supabase Edge Function to withdraw/revoke daily contributor token claim
// This function has admin privileges via service role key
// Bypasses RLS policies that prevent wallet balance updates

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
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user is authenticated
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Create admin client with service role key (has admin privileges, bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log(`💰 [WITHDRAW_DAILY_CLAIM] Withdrawing claim for user: ${userId}`);

    // Call the SQL function to withdraw the claim
    const { data: withdrawResult, error: withdrawError } = await adminClient.rpc('withdraw_daily_contributor_claim', {
      p_user_id: userId,
    });

    if (withdrawError) {
      console.error('❌ [WITHDRAW_DAILY_CLAIM] Error calling withdraw function:', withdrawError);
      return new Response(
        JSON.stringify({ success: false, error: withdrawError.message || 'Failed to withdraw claim' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON response from the SQL function
    const result = typeof withdrawResult === 'string' ? JSON.parse(withdrawResult) : withdrawResult;

    if (!result.success) {
      console.error('❌ [WITHDRAW_DAILY_CLAIM] Withdraw failed:', result.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error || 'Failed to withdraw claim',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ [WITHDRAW_DAILY_CLAIM] Claim withdrawn successfully:', {
      tokens_withdrawn: result.tokens_withdrawn,
      new_balance: result.new_balance,
    });

    return new Response(
      JSON.stringify({
        success: true,
        tokens: result.tokens_withdrawn,
        new_balance: result.new_balance,
        contribution_score: result.contribution_score,
        rank: result.rank,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ [WITHDRAW_DAILY_CLAIM] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
