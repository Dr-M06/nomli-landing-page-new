/**
 * Keep-Alive Function for Redis and Edge Functions
 * 
 * This function:
 * 1. Keeps Redis connections warm
 * 2. Prevents cold starts for Edge Functions
 * 3. Can be called by Supabase Cron Jobs
 * 
 * Setup:
 * 1. Deploy this function: supabase functions deploy keepalive
 * 2. Create a cron job in Supabase Dashboard:
 *    - Go to Database → Cron Jobs
 *    - Add cron pattern: every 5 minutes
 *    - URL: https://[project-ref].supabase.co/functions/v1/keepalive
 *    - Method: GET
 * 
 * This ensures Redis connections stay warm and functions don't cold start.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Redis client (supports both Redis Cloud and Upstash Redis)
let redisClient: any = null;

const getRedisClient = async () => {
  if (redisClient) return redisClient;
  
  try {
    const REDIS_URL = Deno.env.get('REDIS_URL');
    const REDIS_TOKEN = Deno.env.get('REDIS_TOKEN');
    
    if (!REDIS_URL || !REDIS_TOKEN) {
      console.warn('⚠️ Redis not configured, using in-memory cache fallback');
      return null;
    }
    
    // Check if it's Upstash Redis (REST API) or Redis Cloud (standard Redis)
    const isUpstash = REDIS_URL.startsWith('https://');
    
    if (isUpstash) {
      // Upstash Redis REST API
      redisClient = {
        url: REDIS_URL,
        token: REDIS_TOKEN,
        get: async (key: string) => {
          const response = await fetch(`${REDIS_URL}/get/${key}`, {
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
          });
          const data = await response.json();
          return data.result ? JSON.parse(data.result) : null;
        },
        setex: async (key: string, seconds: number, value: string) => {
          await fetch(`${REDIS_URL}/setex/${key}/${seconds}`, {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${REDIS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: value,
          });
        },
        ping: async () => {
          // Upstash doesn't have PING, but we can do a simple GET
          await fetch(`${REDIS_URL}/get/keepalive`, {
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
          });
        },
      };
    } else {
      // Redis Cloud (standard Redis protocol)
      const [host, port] = REDIS_URL.split(':');
      const redisPort = port ? parseInt(port) : 6379;
      
      const { connect } = await import('https://deno.land/x/redis@v0.29.4/mod.ts');
      
      const redis = await connect({
        hostname: host,
        port: redisPort,
        password: REDIS_TOKEN,
      });
      
      redisClient = {
        redis,
        get: async (key: string) => {
          const value = await redis.get(key);
          return value ? JSON.parse(value as string) : null;
        },
        setex: async (key: string, seconds: number, value: string) => {
          await redis.setex(key, seconds, value);
        },
        ping: async () => {
          await redis.ping();
        },
      };
    }
    
    return redisClient;
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error);
    return null;
  }
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: any = {
    timestamp: new Date().toISOString(),
    status: 'ok',
    checks: {},
  };

  try {
    // 1. Check Redis connection
    const redis = await getRedisClient();
    if (redis) {
      try {
        // Ping Redis to keep connection warm
        if (redis.ping) {
          await redis.ping();
        } else {
          // For Upstash, do a simple operation
          await redis.get('keepalive');
        }
        
        // Set a keepalive key (expires in 10 minutes)
        await redis.setex('keepalive:timestamp', 600, JSON.stringify({
          timestamp: Date.now(),
          function: 'keepalive',
        }));
        
        results.checks.redis = {
          status: 'ok',
          message: 'Redis connection warm',
        };
      } catch (redisError: any) {
        results.checks.redis = {
          status: 'error',
          message: redisError.message,
        };
      }
    } else {
      results.checks.redis = {
        status: 'skipped',
        message: 'Redis not configured',
      };
    }

    // 2. Check Supabase connection
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        // Simple query to keep connection warm
        const { error } = await supabase.from('profiles').select('id').limit(1);
        
        results.checks.supabase = {
          status: error ? 'warning' : 'ok',
          message: error ? `Query warning: ${error.message}` : 'Supabase connection warm',
        };
      } else {
        results.checks.supabase = {
          status: 'skipped',
          message: 'Supabase credentials not found',
        };
      }
    } catch (supabaseError: any) {
      results.checks.supabase = {
        status: 'error',
        message: supabaseError.message,
      };
    }

    // 3. Warm up other critical functions by calling them
    const functionChecks: any = {};
    
    // List of functions to warm up (optional - can be configured)
    const functionsToWarm = [
      'app-cache',
      'live-bootstrap',
      'call-bootstrap',
    ];

    for (const funcName of functionsToWarm) {
      try {
        const functionUrl = `${supabaseUrl}/functions/v1/${funcName}`;
        // Make a lightweight request to keep function warm
        const response = await fetch(functionUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        });
        
        functionChecks[funcName] = {
          status: response.ok ? 'ok' : 'warning',
          statusCode: response.status,
        };
      } catch (funcError: any) {
        functionChecks[funcName] = {
          status: 'error',
          message: funcError.message,
        };
      }
    }

    results.checks.functions = functionChecks;
    results.duration = `${Date.now() - startTime}ms`;

    return new Response(
      JSON.stringify(results, null, 2),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    results.status = 'error';
    results.error = error.message;
    results.duration = `${Date.now() - startTime}ms`;

    return new Response(
      JSON.stringify(results, null, 2),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
