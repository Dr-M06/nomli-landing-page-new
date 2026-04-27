// Supabase Edge Function to send OneSignal notifications
// This runs on the server and can be called from your app or database triggers

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

interface NotificationRequest {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: 'high' | 'normal';
  sound?: string;
}

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OneSignal credentials not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const notification: NotificationRequest = await req.json();
    const { userId, title, message, data, priority = 'high', sound = 'default' } = notification;

    // Get Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user's OneSignal player ID
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('onesignal_player_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.onesignal_player_id) {
      console.error('No OneSignal player ID found for user:', userId);
      return new Response(
        JSON.stringify({ error: 'User does not have OneSignal player ID' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send notification via OneSignal REST API
    const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: [profile.onesignal_player_id],
        contents: { en: message },
        headings: { en: title },
        data: data || {},
        ios_sound: sound,
        android_sound: sound,
        priority: priority === 'high' ? 10 : 5,
        content_available: true, // Enable background data for iOS
        mutable_content: true, // Enable rich notifications
        // iOS specific
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        // Android specific
        android_channel_id: 'default',
        android_visibility: 1, // Public visibility
        android_sound: sound,
      })
    });

    if (!oneSignalResponse.ok) {
      const errorText = await oneSignalResponse.text();
      console.error('OneSignal API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send notification', details: errorText }),
        { status: oneSignalResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await oneSignalResponse.json();
    console.log('OneSignal notification sent:', result);

    return new Response(
      JSON.stringify({ success: true, notificationId: result.id }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  } catch (error) {
    console.error('Error sending OneSignal notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

