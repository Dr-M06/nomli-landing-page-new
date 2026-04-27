// Supabase Edge Function to claim daily contributor tokens
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

    console.log(`💰 [CLAIM_DAILY_TOKENS] Claiming tokens for user: ${userId}`);

    // Call the SQL function to calculate contribution score, rank, and reward
    const { data: claimResult, error: claimError } = await adminClient.rpc('claim_daily_contributor_tokens', {
      p_user_id: userId,
    });

    if (claimError) {
      console.error('❌ [CLAIM_DAILY_TOKENS] Error calling claim function:', claimError);
      return new Response(
        JSON.stringify({ success: false, error: claimError.message || 'Failed to claim tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON response from the SQL function
    const result = typeof claimResult === 'string' ? JSON.parse(claimResult) : claimResult;

    if (!result.success) {
      console.error('❌ [CLAIM_DAILY_TOKENS] Claim failed:', result.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error || 'Failed to claim tokens',
          claimed_at: result.claimed_at,
          tokens: result.tokens,
          contribution_score: result.contribution_score,
          rank: result.rank,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ [CLAIM_DAILY_TOKENS] Tokens claimed successfully:', {
      tokens: result.tokens,
      base: result.base_tokens,
      bonus: result.bonus_tokens,
      score: result.contribution_score,
      rank: result.rank,
    });

    return new Response(
      JSON.stringify({
        success: true,
        tokens: result.tokens,
        base_tokens: result.base_tokens,
        bonus_tokens: result.bonus_tokens,
        contribution_score: result.contribution_score,
        rank: result.rank,
        claim_id: result.claim_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ [CLAIM_DAILY_TOKENS] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
