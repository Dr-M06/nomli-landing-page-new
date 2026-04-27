/**
 * Secure CORS Configuration for Supabase Edge Functions
 * Prevents unauthorized cross-origin requests
 */

export interface CorsConfig {
  allowedOrigins: string[]
  allowedMethods?: string[]
  allowedHeaders?: string[]
  allowCredentials?: boolean
}

const DEFAULT_CONFIG: CorsConfig = {
  allowedOrigins: [
    'https://nomli.cc',
    'https://www.nomli.cc',
    'exp://localhost:8081', // Development only - remove in production
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['authorization', 'x-client-info', 'apikey', 'content-type'],
  allowCredentials: true,
}

/**
 * Get CORS headers based on request origin
 */
export function getCorsHeaders(
  request: Request,
  config: Partial<CorsConfig> = {}
): Record<string, string> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const origin = request.headers.get('Origin') || ''
  
  // Check if origin is allowed
  const isAllowed = mergedConfig.allowedOrigins.includes(origin) || 
                    (origin.startsWith('exp://') && origin.includes('localhost')) // Dev only
  
  const allowedOrigin = isAllowed ? origin : 'null'
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': mergedConfig.allowedMethods?.join(', ') || 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': mergedConfig.allowedHeaders?.join(', ') || 'authorization, content-type',
    'Access-Control-Allow-Credentials': mergedConfig.allowCredentials ? 'true' : 'false',
    'Access-Control-Max-Age': '86400', // 24 hours
  }
}

/**
 * Handle CORS preflight request.
 * Pass the actual request when available so the response reflects the real Origin.
 */
export function handleCorsPreflight(
  requestOrConfig?: Request | Partial<CorsConfig>,
  config?: Partial<CorsConfig>
): Response {
  const req = requestOrConfig instanceof Request ? requestOrConfig : new Request('http://localhost')
  const mergedConfig = config ?? (typeof requestOrConfig === 'object' && !(requestOrConfig instanceof Request) ? requestOrConfig : {})
  const headers = getCorsHeaders(req, mergedConfig)
  return new Response('ok', { headers })
}

/**
 * Validate origin (for additional security checks)
 */
export function isValidOrigin(origin: string | null, config: Partial<CorsConfig> = {}): boolean {
  if (!origin) return false
  
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  
  // Allow localhost in development
  if (origin.startsWith('exp://') && origin.includes('localhost')) {
    return true
  }
  
  return mergedConfig.allowedOrigins.includes(origin)
}
