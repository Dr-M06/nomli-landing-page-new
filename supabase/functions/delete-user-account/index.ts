// Supabase Edge Function to delete user account
// This function has admin privileges via service role key

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { checkRateLimit, getClientIP, rateLimitResponse, RateLimits } from '../_shared/rateLimit.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
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
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Rate limiting for account deletion
    const ipAddress = getClientIP(req);
    const rateLimitResult = await checkRateLimit(
      userClient,
      user.id,
      ipAddress,
      RateLimits.ACCOUNT_DELETION
    );
    
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // Parse request body
    const { userId: requestedUserId } = await req.json();

    // Verify user can only delete their own account
    if (requestedUserId && requestedUserId !== userId) {
      return new Response(
        JSON.stringify({ error: 'You can only delete your own account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[DeleteUserAccount] Starting deletion for user: ${userId}`);

    // Create admin client with service role key (has admin privileges)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Step 1: Delete user data from all tables
    console.log(`[DeleteUserAccount] Deleting user data for: ${userId}`);

    // Delete user messages (sent messages)
    const { error: messagesError } = await adminClient
      .from('private_messages')
      .delete()
      .eq('sender_id', userId);

    if (messagesError) {
      console.warn(`[DeleteUserAccount] Error deleting messages:`, messagesError);
    } else {
      console.log(`[DeleteUserAccount] Deleted user messages`);
    }

    // Delete user posts
    const { error: postsError } = await adminClient
      .from('posts')
      .delete()
      .eq('user_id', userId);

    if (postsError) {
      console.warn(`[DeleteUserAccount] Error deleting posts:`, postsError);
    } else {
      console.log(`[DeleteUserAccount] Deleted user posts`);
    }

    // Delete user events
    const { error: eventsError } = await adminClient
      .from('events')
      .delete()
      .eq('host_id', userId);

    if (eventsError) {
      console.warn(`[DeleteUserAccount] Error deleting events:`, eventsError);
    } else {
      console.log(`[DeleteUserAccount] Deleted user events`);
    }

    // Delete user profile
    const { error: profileError } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.warn(`[DeleteUserAccount] Error deleting profile:`, profileError);
    } else {
      console.log(`[DeleteUserAccount] Deleted user profile`);
    }

    // Delete user followers/following relationships
    const { error: followersError } = await adminClient
      .from('user_followers')
      .delete()
      .or(`follower_id.eq.${userId},following_id.eq.${userId}`);

    if (followersError) {
      console.warn(`[DeleteUserAccount] Error deleting followers:`, followersError);
    } else {
      console.log(`[DeleteUserAccount] Deleted user followers`);
    }

    // Delete user notifications
    const { error: notificationsError } = await adminClient
      .from('notification_queue')
      .delete()
      .eq('user_id', userId);

    if (notificationsError) {
      console.warn(`[DeleteUserAccount] Error deleting notifications:`, notificationsError);
    } else {
      console.log(`[DeleteUserAccount] Deleted user notifications`);
    }

    // Step 2: Record deleted account email before deleting auth user
    // This allows us to show a better error message if user tries to sign in later
    try {
      const userEmail = user.email;
      if (userEmail) {
        console.log(`[DeleteUserAccount] Recording deleted account email: ${userEmail}`);
        const { error: recordError } = await adminClient
          .from('deleted_accounts')
          .insert({
            email: userEmail.toLowerCase().trim(),
            user_id: userId,
            deleted_at: new Date().toISOString(),
          });

        if (recordError) {
          console.warn(`[DeleteUserAccount] Error recording deleted account (non-critical):`, recordError);
          // Don't fail deletion if recording fails
        } else {
          console.log(`[DeleteUserAccount] Recorded deleted account email`);
        }
      }
    } catch (recordException) {
      console.warn(`[DeleteUserAccount] Exception recording deleted account (non-critical):`, recordException);
      // Continue with deletion even if recording fails
    }

    // Step 3: Delete auth user (requires admin privileges)
    console.log(`[DeleteUserAccount] Deleting auth user: ${userId}`);
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error(`[DeleteUserAccount] Error deleting auth user:`, deleteAuthError);
      return new Response(
        JSON.stringify({ error: `Failed to delete auth user: ${deleteAuthError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[DeleteUserAccount] Successfully deleted account for user: ${userId}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Account deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[DeleteUserAccount] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

