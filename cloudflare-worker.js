/**
 * Cloudflare Worker for CDN - Proxies Supabase Storage
 * 
 * Deploy this to Cloudflare Workers and route it to your CDN domain
 * Example: cdn.yourdomain.com/* -> This Worker
 * 
 * To prevent cold starts, add a Cron Trigger:
 * - Go to Cloudflare Dashboard → Workers & Pages → Your Worker
 * - Triggers tab → Add Cron Trigger: "*/5 * * * *" (every 5 minutes)
 */

export default {
  async fetch(request) {
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

    // Extract the path from the CDN URL
    // Example: cdn.yourdomain.com/post-images/image.jpg -> /post-images/image.jpg
    const url = new URL(request.url);
    
    // Your Supabase project ID (extracted from your Supabase URL)
    const SUPABASE_PROJECT_ID = "kankyfankhhwqalvilen";
    const SUPABASE_STORAGE = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public`;
    
    // Health check endpoint - keeps worker warm
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
    // Remove leading slash if present
    // Path format: /post-images/image.jpg -> post-images/image.jpg
    const pathname = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    
    // Ensure we have a valid path (must include bucket name)
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
          // Forward important headers but remove host
          'User-Agent': request.headers.get('User-Agent') || 'Cloudflare-Worker',
          'Accept': request.headers.get('Accept') || '*/*',
          'Accept-Encoding': request.headers.get('Accept-Encoding') || 'gzip, deflate, br',
        },
      });
      
      // If Supabase returns an error, return a more helpful error message
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
      // Avatars: 1 hour (can change frequently)
      // Other media: 1 year (rarely change)
      const isAvatar = pathname.startsWith('avatars/');
      const cacheMaxAge = isAvatar ? 3600 : 31536000; // 1 hour for avatars, 1 year for others
      
      // Create a new response with optimized caching headers
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          // Copy original headers
          ...Object.fromEntries(response.headers.entries()),
          // Optimized cache headers:
          // - max-age: Browser cache duration
          // - s-maxage: Cloudflare edge cache duration (same as max-age for consistency)
          // - immutable: Only for long-lived assets (not avatars)
          'Cache-Control': isAvatar 
            ? `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}, must-revalidate`
            : `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}, immutable`,
          // Add CORS headers for mobile app
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
      
      return newResponse;
    } catch (error) {
      // Return error response
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
   * Setup: Add a Cron Trigger in Cloudflare Dashboard:
   * - Workers & Pages → Your Worker → Triggers tab
   * - Add Cron Trigger: "*/5 * * * *" (every 5 minutes)
   */
  async scheduled(event, env, ctx) {
    // This function is called by Cloudflare's Cron Trigger
    // The mere fact that this executes keeps the worker warm
    
    // Log the keepalive event (visible in Cloudflare Dashboard → Workers → Logs)
    console.log(`[KeepAlive] Worker warmed at ${new Date().toISOString()}`);
    
    // The scheduled handler doesn't need to return anything,
    // but returning a response is fine for consistency
    return new Response('OK', { status: 200 });
  },
};

