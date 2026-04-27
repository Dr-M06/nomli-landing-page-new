// Supabase Edge Function to award daily contributor tokens
// Runs at midnight UTC (via cron) to award tokens to top 5 contributors for the previous day
// Replaces manual claim - tokens are automatically credited based on final daily leaderboard

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Optional: allow manual invocation with ?date=YYYY-MM-DD for testing
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    let claimDate: string;

    if (dateParam) {
      claimDate = dateParam;
    } else {
      // Yesterday in UTC (for midnight cron run)
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      claimDate = yesterday.toISOString().split('T')[0];
    }

    console.log(`💰 [AWARD_DAILY_TOKENS] Awarding tokens for date: ${claimDate}`);

    const { data: result, error } = await adminClient.rpc('award_daily_contributor_tokens_for_date', {
      p_claim_date: claimDate,
    });

    if (error) {
      console.error('❌ [AWARD_DAILY_TOKENS] Error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    if (!parsed.success) {
      console.error('❌ [AWARD_DAILY_TOKENS] Award failed:', parsed.error);
      return new Response(
        JSON.stringify({ success: false, error: parsed.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ [AWARD_DAILY_TOKENS] Awarded:', parsed.awarded_count, 'users,', parsed.total_tokens_awarded, 'tokens');

    return new Response(
      JSON.stringify({
        success: true,
        claim_date: parsed.claim_date,
        awarded_count: parsed.awarded_count,
        total_tokens_awarded: parsed.total_tokens_awarded,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ [AWARD_DAILY_TOKENS] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
