/**
 * Supabase Edge Function: Purge CDN Cache
 * 
 * Securely purges Cloudflare CDN cache when content is updated
 * This keeps API tokens server-side only
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PurgeRequest {
  filePath?: string; // e.g., "avatars/avatar_xxx.jpg"
  fileUrl?: string; // Full Supabase Storage URL
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is authenticated
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Cloudflare credentials from Edge Function secrets
    const cloudflareZoneId = Deno.env.get('CLOUDFLARE_ZONE_ID');
    const cloudflareApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    const cdnDomain = Deno.env.get('EXPO_PUBLIC_CDN_DOMAIN');

    if (!cloudflareZoneId || !cloudflareApiToken) {
      console.warn('[Purge CDN] Cloudflare credentials not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'CDN purge not configured',
          message: 'CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN must be set in Edge Function secrets'
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { filePath, fileUrl }: PurgeRequest = await req.json().catch(() => ({}));

    // Extract file path from URL if provided
    let purgePath: string | null = null;

    if (filePath) {
      // Direct path provided
      purgePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    } else if (fileUrl) {
      // Extract path from Supabase Storage URL
      // Pattern: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
      const match = fileUrl.match(/supabase\.co\/storage\/v1\/object\/public\/(.+)$/);
      if (match) {
        const path = match[1].split('?')[0]; // Remove query parameters
        purgePath = `/${path}`;
      }
    }

    if (!purgePath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing filePath or fileUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Purge CDN] Purging cache for: ${purgePath}`);

    // Call Cloudflare API to purge cache
    const purgeResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cloudflareApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: [purgePath],
        }),
      }
    );

    if (!purgeResponse.ok) {
      const errorData = await purgeResponse.json().catch(() => ({}));
      console.error('[Purge CDN] Cloudflare API error:', errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to purge cache',
          details: errorData 
        }),
        { status: purgeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await purgeResponse.json();
    console.log('[Purge CDN] Cache purged successfully:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Cache purged successfully',
        filePath: purgePath 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[Purge CDN] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

