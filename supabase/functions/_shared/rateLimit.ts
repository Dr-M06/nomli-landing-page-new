/**
 * Rate Limiting Utility for Supabase Edge Functions
 * Prevents API abuse by limiting requests per user/IP
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface RateLimitConfig {
  maxRequests: number  // Maximum requests allowed
  windowMs: number     // Time window in milliseconds
  action: string       // Action identifier (e.g., 'media_upload', 'message_send')
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

/**
 * Check if a user has exceeded their rate limit
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string | null,
  ipAddress: string | null,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { maxRequests, windowMs, action } = config
  const windowStart = new Date(Date.now() - windowMs)
  
  try {
    // Build query based on available identifiers
    let query = supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('action', action)
      .gte('created_at', windowStart.toISOString())
    
    // Prioritize user ID, fallback to IP address
    if (userId) {
      query = query.eq('user_id', userId)
    } else if (ipAddress) {
      query = query.eq('ip_address', ipAddress)
    } else {
      // No identifier available, allow request
      console.warn('[RateLimit] No user ID or IP address provided')
      return {
        allowed: true,
        remaining: maxRequests,
        resetAt: new Date(Date.now() + windowMs)
      }
    }
    
    const { count, error } = await query
    
    if (error) {
      console.error('[RateLimit] Error checking rate limit:', error)
      // On error, allow request (fail open)
      return {
        allowed: true,
        remaining: maxRequests,
        resetAt: new Date(Date.now() + windowMs)
      }
    }
    
    const requestCount = count || 0
    const remaining = Math.max(0, maxRequests - requestCount)
    const allowed = requestCount < maxRequests
    
    // If allowed, log this request
    if (allowed) {
      await supabase.from('rate_limits').insert({
        user_id: userId,
        ip_address: ipAddress,
        action,
        created_at: new Date().toISOString()
      })
    }
    
    return {
      allowed,
      remaining: allowed ? remaining - 1 : 0,
      resetAt: new Date(Date.now() + windowMs)
    }
  } catch (error) {
    console.error('[RateLimit] Exception in rate limit check:', error)
    // On exception, allow request (fail open)
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: new Date(Date.now() + windowMs)
    }
  }
}

/**
 * Common rate limit configurations
 */
export const RateLimits = {
  // Media uploads: 10 per minute
  MEDIA_UPLOAD: {
    maxRequests: 10,
    windowMs: 60000,
    action: 'media_upload'
  },
  
  // Message sending: 30 per minute
  MESSAGE_SEND: {
    maxRequests: 30,
    windowMs: 60000,
    action: 'message_send'
  },
  
  // Voice note uploads: 5 per minute
  VOICE_NOTE_UPLOAD: {
    maxRequests: 5,
    windowMs: 60000,
    action: 'voice_note_upload'
  },
  
  // User reports: 3 per hour
  USER_REPORT: {
    maxRequests: 3,
    windowMs: 3600000,
    action: 'user_report'
  },
  
  // Account deletion: 1 per day
  ACCOUNT_DELETION: {
    maxRequests: 1,
    windowMs: 86400000,
    action: 'account_deletion'
  },
  
  // Payment processing: 5 per hour
  PAYMENT_PROCESS: {
    maxRequests: 5,
    windowMs: 3600000,
    action: 'payment_process'
  }
}

/**
 * Create a rate limit response
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      remaining: result.remaining,
      resetAt: result.resetAt.toISOString()
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetAt.toISOString(),
        'Retry-After': Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString()
      }
    }
  )
}

/**
 * Get client IP address from request
 */
export function getClientIP(req: Request): string | null {
  // Try various headers that might contain the client IP
  const headers = req.headers
  
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') || // Cloudflare
    headers.get('x-client-ip') ||
    null
  )
}

