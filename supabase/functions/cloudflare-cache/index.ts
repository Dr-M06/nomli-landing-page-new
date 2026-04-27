/**
 * Cloudflare Cache Proxy
 * 
 * Supabase Edge Function that proxies cache requests to Cloudflare KV.
 * This keeps Cloudflare API tokens server-side only.
 * 
 * Endpoint: /functions/v1/cloudflare-cache
 * 
 * Methods:
 * - GET: Retrieve cache
 * - PUT: Store cache
 * - DELETE: Delete cache
 * - POST /batch: Batch operations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const CLOUDFLARE_CACHE_WORKER_URL = Deno.env.get('CLOUDFLARE_CACHE_WORKER_URL') || 
  'https://nomli-cache.your-subdomain.workers.dev';

// Public cache endpoint - no auth required
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Allow public access - cache should work without authentication
  // This is safe because cache operations are read-only for GET requests
  // and write operations are rate-limited by Cloudflare

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // Forward request to Cloudflare Worker
    const cloudflareUrl = `${CLOUDFLARE_CACHE_WORKER_URL}${path === 'cloudflare-cache' ? '/cache' : `/${path}`}${url.search}`;
    
    // Clone request for forwarding
    const forwardRequest = new Request(cloudflareUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' && req.method !== 'DELETE' ? req.body : undefined,
    });

    const response = await fetch(forwardRequest);
    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('❌ [Cloudflare Cache Proxy] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
