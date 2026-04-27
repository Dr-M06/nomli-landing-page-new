/**
 * Cloudflare Worker: Nomli Persistent Cache
 * 
 * Stores app cache in Cloudflare KV for persistence across app reinstalls.
 * Cache persists globally and doesn't expire on app restart.
 * 
 * Features:
 * - Store/retrieve cache by key
 * - Automatic expiration (configurable TTL)
 * - Batch operations for efficiency
 * - Works without authentication (public cache)
 * 
 * Deployment:
 * 1. Create KV namespace "NOMLI_CACHE" in Cloudflare Dashboard
 * 2. Bind it to this worker as "CACHE" variable
 * 3. Deploy using: wrangler deploy
 *    OR copy code to Cloudflare Dashboard → Workers → Create Worker
 * 
 * Usage:
 * GET /cache?key=profile_12345
 * PUT /cache (body: {key: "profile_12345", value: {...}, ttl: 86400})
 * DELETE /cache?key=profile_12345
 * POST /cache/batch (body: {operations: [...]})
 * GET /health (health check)
 */

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'Nomli Persistent Cache',
        version: '1.0.0',
        kvNamespace: env.CACHE ? 'bound' : 'not bound',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cache operations
    if (url.pathname === '/cache') {
      try {
        if (request.method === 'GET') {
          return await handleGet(request, url, env.CACHE, corsHeaders);
        } else if (request.method === 'PUT' || request.method === 'POST') {
          return await handlePut(request, env.CACHE, corsHeaders);
        } else if (request.method === 'DELETE') {
          return await handleDelete(request, url, env.CACHE, corsHeaders);
        }
      } catch (error: any) {
        console.error('[Cache Worker] Error:', error);
        return new Response(JSON.stringify({
          error: 'Internal server error',
          message: error.message,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Batch operations
    if (url.pathname === '/cache/batch') {
      if (request.method === 'POST') {
        return await handleBatch(request, env.CACHE, corsHeaders);
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};

// GET /cache?key=profile_12345
async function handleGet(
  request: Request,
  url: URL,
  cache: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const key = url.searchParams.get('key');
  if (!key) {
    return new Response(JSON.stringify({ error: 'Key parameter required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!cache) {
    return new Response(JSON.stringify({ error: 'KV namespace not bound' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const value = await cache.get(key);
    
    if (!value) {
      return new Response(JSON.stringify({ 
        found: false,
        key,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse stored value (includes metadata)
    const parsed = JSON.parse(value);
    
    // Check if expired
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      // Delete expired entry
      await cache.delete(key);
      return new Response(JSON.stringify({ 
        found: false,
        key,
        expired: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      found: true,
      key,
      value: parsed.value,
      cachedAt: parsed.cachedAt,
      expiresAt: parsed.expiresAt,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Cache Worker] Get error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// PUT /cache (body: {key, value, ttl?})
async function handlePut(
  request: Request,
  cache: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!cache) {
    return new Response(JSON.stringify({ error: 'KV namespace not bound' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { key, value, ttl } = body;

    if (!key || value === undefined) {
      return new Response(JSON.stringify({ 
        error: 'Key and value required',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare cache entry with metadata
    const cacheEntry = {
      value,
      cachedAt: Date.now(),
      expiresAt: ttl ? Date.now() + (ttl * 1000) : null, // TTL in seconds
    };

    // Store in KV (KV automatically handles expiration if we set metadata)
    await cache.put(key, JSON.stringify(cacheEntry), {
      expirationTtl: ttl || undefined, // Cloudflare KV expiration (in seconds)
    });

    return new Response(JSON.stringify({
      success: true,
      key,
      cachedAt: cacheEntry.cachedAt,
      expiresAt: cacheEntry.expiresAt,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Cache Worker] Put error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// DELETE /cache?key=profile_12345
async function handleDelete(
  request: Request,
  url: URL,
  cache: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const key = url.searchParams.get('key');
  if (!key) {
    return new Response(JSON.stringify({ error: 'Key parameter required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!cache) {
    return new Response(JSON.stringify({ error: 'KV namespace not bound' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    await cache.delete(key);
    return new Response(JSON.stringify({
      success: true,
      key,
      deleted: true,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Cache Worker] Delete error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// POST /cache/batch (body: {operations: [{type: 'get'|'put'|'delete', key, value?, ttl?}]})
async function handleBatch(
  request: Request,
  cache: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!cache) {
    return new Response(JSON.stringify({ error: 'KV namespace not bound' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { operations } = body;

    if (!Array.isArray(operations)) {
      return new Response(JSON.stringify({ error: 'Operations array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await Promise.all(
      operations.map(async (op: any) => {
        try {
          if (op.type === 'get') {
            const value = await cache.get(op.key);
            if (!value) {
              return { type: 'get', key: op.key, found: false };
            }
            const parsed = JSON.parse(value);
            if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
              await cache.delete(op.key);
              return { type: 'get', key: op.key, found: false, expired: true };
            }
            return { type: 'get', key: op.key, found: true, value: parsed.value };
          } else if (op.type === 'put') {
            const cacheEntry = {
              value: op.value,
              cachedAt: Date.now(),
              expiresAt: op.ttl ? Date.now() + (op.ttl * 1000) : null,
            };
            await cache.put(op.key, JSON.stringify(cacheEntry), {
              expirationTtl: op.ttl || undefined,
            });
            return { type: 'put', key: op.key, success: true };
          } else if (op.type === 'delete') {
            await cache.delete(op.key);
            return { type: 'delete', key: op.key, success: true };
          }
          return { type: op.type, key: op.key, error: 'Unknown operation type' };
        } catch (error: any) {
          return { type: op.type, key: op.key, error: error.message };
        }
      })
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Cache Worker] Batch error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
