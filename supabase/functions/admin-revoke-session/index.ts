import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface RevokeSessionRequest {
  sessionToken?: string;
  revokeAll?: boolean;
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

    // Get request body
    let requestData: RevokeSessionRequest = {};
    try {
      const body = await req.text();
      if (body) {
        requestData = JSON.parse(body);
      }
    } catch (e) {
      // Body is optional
    }

    const { sessionToken, revokeAll } = requestData;

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ [ADMIN] Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify admin status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile.is_admin) {
      return new Response(
        JSON.stringify({ error: 'User is not an admin' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Revoke session(s)
    if (revokeAll) {
      // Revoke all sessions for this user
      const { data: revokedCount, error: revokeError } = await supabase
        .rpc('revoke_all_admin_sessions', { target_user_id: user.id });

      if (revokeError) {
        console.error('❌ [ADMIN] Error revoking all sessions:', revokeError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to revoke sessions',
            details: revokeError.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log admin action for audit trail
      await supabase.from('admin_audit_log').insert({
        admin_id: user.id,
        action: 'revoke_all_sessions',
        target_user_id: user.id,
        metadata: { revoked_count: revokedCount || 0 },
      }).catch(err => {
        console.error('⚠️ [ADMIN] Failed to log audit:', err);
      });

      console.log('✅ [ADMIN] All sessions revoked:', {
        userId: user.id,
        revokedCount: revokedCount || 0,
      });

      return new Response(
        JSON.stringify({
          success: true,
          revokedCount: revokedCount || 0,
          message: 'All sessions revoked',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (sessionToken) {
      // Revoke specific session
      const { data: revoked, error: revokeError } = await supabase
        .rpc('revoke_admin_session', { token: sessionToken });

      if (revokeError) {
        console.error('❌ [ADMIN] Error revoking session:', revokeError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to revoke session',
            details: revokeError.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!revoked) {
        return new Response(
          JSON.stringify({ 
            error: 'Session not found or already revoked' 
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log admin action for audit trail
      await supabase.from('admin_audit_log').insert({
        admin_id: user.id,
        action: 'revoke_session',
        metadata: { session_token_prefix: sessionToken.substring(0, 8) },
      }).catch(err => {
        console.error('⚠️ [ADMIN] Failed to log audit:', err);
      });

      console.log('✅ [ADMIN] Session revoked:', {
        userId: user.id,
        sessionToken: sessionToken.substring(0, 8) + '...',
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Session revoked',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Either sessionToken or revokeAll must be provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('❌ [ADMIN] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to revoke session: Unknown error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

