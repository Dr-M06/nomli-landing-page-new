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
    // Create Supabase client with service role to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is authenticated (using anon key, not service role)
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { requestId } = await req.json();

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: 'Missing requestId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the friend request
    const { data: request, error: fetchError } = await supabase
      .from('friend_requests')
      .select('requester_id, recipient_id, status')
      .eq('id', requestId)
      .eq('recipient_id', user.id)
      .single();

    if (fetchError || !request) {
      return new Response(
        JSON.stringify({ error: 'Friend request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (request.status === 'accepted') {
      return new Response(
        JSON.stringify({ error: 'Request already accepted' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update request status to accepted
    const { error: updateError } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId)
      .eq('recipient_id', user.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update request status', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create bidirectional follow relationships using service role (bypasses RLS)
    // 1. Recipient follows requester
    const { error: followError1 } = await supabase
      .from('user_followers')
      .insert({
        follower_id: request.recipient_id,
        following_id: request.requester_id,
      });

    if (followError1 && followError1.code !== '23505') { // 23505 = duplicate key
      console.error('Error creating follow (recipient -> requester):', followError1);
    }

    // 2. Requester follows recipient
    const { error: followError2 } = await supabase
      .from('user_followers')
      .insert({
        follower_id: request.requester_id,
        following_id: request.recipient_id,
      });

    if (followError2 && followError2.code !== '23505') { // 23505 = duplicate key
      console.error('Error creating follow (requester -> recipient):', followError2);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Friend request accepted and follow relationships created'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in accept-friend-request function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

