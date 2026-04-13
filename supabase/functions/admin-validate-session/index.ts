import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface ValidateSessionRequest {
  sessionToken: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request body
    const body = await req.text();
    if (!body) {
      return new Response(
        JSON.stringify({ error: 'Missing request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { sessionToken }: ValidateSessionRequest = JSON.parse(body);
    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'Missing sessionToken' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate session using the database function
    const { data: validationResult, error: validationError } = await supabase
      .rpc('validate_admin_session', { token: sessionToken });

    if (validationError) {
      console.error('❌ [ADMIN] Error validating session:', validationError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to validate session',
          details: validationError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!validationResult || validationResult.length === 0) {
      return new Response(
        JSON.stringify({ 
          valid: false,
          error: 'Invalid or expired session' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const session = validationResult[0];
    if (!session.is_valid) {
      return new Response(
        JSON.stringify({ 
          valid: false,
          error: 'Invalid session' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is still an admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user_id)
      .single();

    if (profileError || !profile || !profile.is_admin) {
      // If user is no longer admin, revoke all their sessions
      await supabase.rpc('revoke_all_admin_sessions', { target_user_id: session.user_id });
      
      return new Response(
        JSON.stringify({ 
          valid: false,
          error: 'User is no longer an admin' 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ [ADMIN] Session validated:', {
      userId: session.user_id,
      expiresAt: session.expires_at,
    });

    return new Response(
      JSON.stringify({
        valid: true,
        userId: session.user_id,
        expiresAt: session.expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [ADMIN] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to validate session: Unknown error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

