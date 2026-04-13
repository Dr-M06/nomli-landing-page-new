/**
 * Cloudflare Worker Keep-Alive Handler
 * 
 * This worker has two purposes:
 * 1. Main CDN proxy (same as cloudflare-worker.js)
 * 2. Keep-alive endpoint to prevent cold starts
 * 
 * Deploy this with a Cron Trigger to keep the worker warm.
 * 
 * Cron Trigger Setup:
 * - Go to Cloudflare Dashboard → Workers & Pages → Your Worker
 * - Go to "Triggers" tab
 * - Add Cron Trigger with pattern: every 5 minutes
 *   (Cron pattern format: every 5 minutes)
 * - This will call the worker's scheduled() handler
 */

export default {
  /**
   * Handle HTTP requests (CDN proxy)
   */
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Health check endpoint - keeps worker warm
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/keepalive') {
      return new Response(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        worker: 'cdn-proxy',
        message: 'Worker is warm and ready',
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Extract the path from the CDN URL
    const SUPABASE_PROJECT_ID = "kankyfankhhwqalvilen";
    const SUPABASE_STORAGE = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public`;
    
    // Handle root path - return info message
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(JSON.stringify({
        message: 'Cloudflare CDN Proxy for Supabase Storage',
        usage: 'Access files via: cdn.yourdomain.com/[bucket]/[file-path]',
        example: 'cdn.yourdomain.com/post-images/image.jpg',
        buckets: ['post-images', 'avatars', 'story-photos', 'chat-media', 'audio'],
        health: '/health or /keepalive',
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    // Construct the target Supabase Storage URL
    const pathname = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    
    if (!pathname || pathname.trim() === '') {
      return new Response(JSON.stringify({
        error: 'Invalid path',
        message: 'Path must include bucket name and file path',
        example: '/post-images/image.jpg',
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    const targetUrl = `${SUPABASE_STORAGE}/${pathname}${url.search}`;
    
    try {
      // Forward the request to Supabase Storage
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'User-Agent': request.headers.get('User-Agent') || 'Cloudflare-Worker',
          'Accept': request.headers.get('Accept') || '*/*',
          'Accept-Encoding': request.headers.get('Accept-Encoding') || 'gzip, deflate, br',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || 'Unknown error' };
        }
        
        return new Response(JSON.stringify({
          error: 'Supabase Storage Error',
          status: response.status,
          statusText: response.statusText,
          message: errorData.message || 'Failed to fetch from Supabase Storage',
          path: pathname,
          targetUrl: targetUrl,
        }), {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // Determine cache duration based on file type
      const isAvatar = pathname.startsWith('avatars/');
      const cacheMaxAge = isAvatar ? 3600 : 31536000; // 1 hour for avatars, 1 year for others
      
      // Create a new response with optimized caching headers
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'Cache-Control': isAvatar 
            ? `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}, must-revalidate`
            : `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}, immutable`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
      
      return newResponse;
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: 'CDN Proxy Error', 
        message: error.message,
        path: pathname,
        targetUrl: targetUrl,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },

  /**
   * Handle scheduled events (Cron Triggers)
   * This keeps the worker warm by executing every 5 minutes
   * 
   * Note: The cron trigger itself keeps the worker warm.
   * This handler just logs the execution for monitoring.
   */
  async scheduled(event, env, ctx) {
    // This function is called by Cloudflare's Cron Trigger
    // The mere fact that this executes keeps the worker warm
    
    // Log the keepalive event (visible in Cloudflare Dashboard → Workers → Logs)
    console.log(`[KeepAlive] Worker warmed at ${new Date().toISOString()}`);
    
    // Optional: You can add additional warm-up logic here if needed
    // For example, pre-warming cache or connections
    
    // The scheduled handler doesn't need to return anything,
    // but returning a response is fine for consistency
    return new Response('OK', { status: 200 });
  },
};
