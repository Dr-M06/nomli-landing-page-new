import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface CreateSessionRequest {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
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

    // Get request body (optional - userId will come from authenticated user)
    let requestData: Partial<CreateSessionRequest> = {};
    try {
      const body = await req.text();
      if (body) {
        requestData = JSON.parse(body);
      }
    } catch (e) {
      // Body is optional, continue without it
    }

    const { ipAddress, userAgent } = requestData;
    // Use authenticated user's ID (from token) instead of requiring it in body
    const userId = user.id;

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

    // Generate session token (cryptographically secure random)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const sessionToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour session

    // Create session record
    const { data: session, error: sessionError } = await supabase
      .from('admin_sessions')
      .insert({
        user_id: user.id,
        session_token: sessionToken,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        expires_at: expiresAt.toISOString(),
        is_active: true,
      })
      .select()
      .single();

    if (sessionError) {
      console.error('❌ [ADMIN] Error creating session:', sessionError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create session',
          details: sessionError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean up expired sessions (non-blocking)
    supabase.rpc('cleanup_expired_admin_sessions').catch(err => {
      console.error('⚠️ [ADMIN] Error cleaning up expired sessions:', err);
    });

    // Log admin action for audit trail
    await supabase.from('admin_audit_log').insert({
      admin_id: user.id,
      action: 'create_session',
      target_user_id: userId,
      ip_address: requestData.ipAddress || null,
      user_agent: requestData.userAgent || null,
      metadata: { session_id: session.id },
    }).catch(err => {
      console.error('⚠️ [ADMIN] Failed to log audit:', err);
    });

    console.log('✅ [ADMIN] Session created:', {
      userId: user.id,
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        session: {
          id: session.id,
          token: sessionToken,
          expiresAt: expiresAt.toISOString(),
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [ADMIN] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to create session: Unknown error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

