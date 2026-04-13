import { log, warn, error } from './productionLogger';
/**
 * Global Request Throttler and Circuit Breaker
 * Prevents database overload when many users are active simultaneously
 */

interface ThrottledRequest {
  key: string;
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

class RequestThrottler {
  private requestQueue: Map<string, ThrottledRequest[]> = new Map();
  private lastRequestTime: Map<string, number> = new Map();
  private isProcessing: Map<string, boolean> = new Map();
  private circuitBreakerOpen: boolean = false;
  private consecutiveFailures: number = 0;
  private readonly MAX_FAILURES = 8; // Increased from 5 to 8 for slower connections (Nigeria)
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // Increased from 30s to 60s for slower connections
  private readonly DEFAULT_THROTTLE_MS = 2000; // 2 seconds default throttle
  private readonly REQUEST_TIMEOUT_MS = 20000; // Increased from 10s to 20s for slower connections (Nigeria)

  /**
   * Throttle a database request
   * @param key - Unique key for this type of request (e.g., 'live_streams', 'profiles')
   * @param fn - Function that returns a promise
   * @param throttleMs - Minimum time between requests (default: 2000ms)
   * @returns Promise that resolves when request completes
   */
  async throttle<T>(
    key: string,
    fn: () => Promise<T>,
    throttleMs: number = this.DEFAULT_THROTTLE_MS
  ): Promise<T> {
    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      warn(`[RequestThrottler] Circuit breaker OPEN for ${key} - rejecting request`);
      throw new Error('Database is temporarily unavailable. Please try again in a moment.');
    }

    const now = Date.now();
    const lastRequest = this.lastRequestTime.get(key) || 0;
    const timeSinceLastRequest = now - lastRequest;

    // If enough time has passed, execute immediately
    if (timeSinceLastRequest >= throttleMs && !this.isProcessing.get(key)) {
      return this.executeRequest(key, fn);
    }

    // Otherwise, queue the request
    return new Promise<T>((resolve, reject) => {
      const queue = this.requestQueue.get(key) || [];
      queue.push({
        key,
        fn,
        resolve,
        reject,
        timestamp: now,
      });
      this.requestQueue.set(key, queue);

      // Process queue after throttle delay
      setTimeout(() => {
        this.processQueue(key, throttleMs);
      }, Math.max(0, throttleMs - timeSinceLastRequest));
    });
  }

  private async executeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
    this.isProcessing.set(key, true);
    this.lastRequestTime.set(key, Date.now());

    try {
      // Add timeout to prevent hanging requests
      // Increased timeout for slower connections (Nigeria) - 20 seconds instead of 10
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.REQUEST_TIMEOUT_MS);
      });

      const result = await Promise.race([fn(), timeoutPromise]);
      
      // Success - reset failure count
      this.consecutiveFailures = 0;
      if (this.circuitBreakerOpen) {
        log(`[RequestThrottler] Circuit breaker CLOSED - requests resuming`);
        this.circuitBreakerOpen = false;
      }

      return result as T;
    } catch (error: any) {
      // Check if it's a timeout or upstream error
      const isTimeoutError = 
        error?.message?.includes('timeout') ||
        error?.message?.includes('upstream') ||
        error?.status === 504 ||
        error?.code === 'ETIMEDOUT';

      if (isTimeoutError) {
        this.consecutiveFailures++;
        warn(`[RequestThrottler] Request failed (${this.consecutiveFailures}/${this.MAX_FAILURES}):`, error.message);

        // Detect slow network after 3 consecutive timeouts (not full circuit breaker)
        if (this.consecutiveFailures >= 3 && this.consecutiveFailures < this.MAX_FAILURES) {
          // Import and trigger slow network detection
          try {
            // DISABLED: Slow network alert - adaptive quality handles slow connections silently
            // const { detectSlowNetwork } = require('../components/SlowNetworkAlert');
            // detectSlowNetwork();
          } catch (importError) {
            // Component might not be loaded yet, that's okay
            log('[RequestThrottler] SlowNetworkAlert not available yet');
          }
        }

        // Open circuit breaker if too many failures
        if (this.consecutiveFailures >= this.MAX_FAILURES) {
          this.circuitBreakerOpen = true;
          error(`[RequestThrottler] Circuit breaker OPENED - too many failures`);
          
          // Auto-close after timeout
          setTimeout(() => {
            this.circuitBreakerOpen = false;
            this.consecutiveFailures = 0;
            log(`[RequestThrottler] Circuit breaker auto-closed after timeout`);
          }, this.CIRCUIT_BREAKER_TIMEOUT);
        }
      }

      throw error;
    } finally {
      this.isProcessing.set(key, false);
    }
  }

  private async processQueue(key: string, throttleMs: number) {
    const queue = this.requestQueue.get(key) || [];
    if (queue.length === 0 || this.isProcessing.get(key)) {
      return;
    }

    // Get the oldest request
    const request = queue.shift()!;
    this.requestQueue.set(key, queue);

    try {
      const result = await this.executeRequest(key, request.fn);
      request.resolve(result);

      // Process next request in queue after throttle delay
      if (queue.length > 0) {
        setTimeout(() => {
          this.processQueue(key, throttleMs);
        }, throttleMs);
      }
    } catch (error) {
      request.reject(error);

      // Still process next request (don't block queue on error)
      if (queue.length > 0) {
        setTimeout(() => {
          this.processQueue(key, throttleMs);
        }, throttleMs);
      }
    }
  }

  /**
   * Debounce a function - only execute after no calls for specified time
   */
  debounce<T extends (...args: any[]) => Promise<any>>(
    key: string,
    fn: T,
    delayMs: number = 1000
  ): T {
    let timeoutId: NodeJS.Timeout | null = null;
    let pendingResolve: ((value: any) => void)[] = [];
    let pendingReject: ((error: any) => void)[] = [];

    return ((...args: any[]) => {
      return new Promise((resolve, reject) => {
        // Clear existing timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Store resolve/reject
        pendingResolve.push(resolve);
        pendingReject.push(reject);

        // Set new timeout
        timeoutId = setTimeout(async () => {
          timeoutId = null;
          const resolves = [...pendingResolve];
          const rejects = [...pendingReject];
          pendingResolve = [];
          pendingReject = [];

          try {
            const result = await fn(...args);
            resolves.forEach(r => r(result));
          } catch (error) {
            rejects.forEach(r => r(error));
          }
        }, delayMs);
      });
    }) as T;
  }

  /**
   * Clear all queues (useful for cleanup)
   */
  clear() {
    this.requestQueue.clear();
    this.lastRequestTime.clear();
    this.isProcessing.clear();
  }

  /**
   * Get queue status (for debugging)
   */
  getStatus() {
    return {
      queueSizes: Array.from(this.requestQueue.entries()).map(([key, queue]) => ({
        key,
        size: queue.length,
      })),
      circuitBreakerOpen: this.circuitBreakerOpen,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

// Singleton instance
export const requestThrottler = new RequestThrottler();

/**
 * Helper function to throttle Supabase queries
 */
export async function throttledSupabaseQuery<T>(
  key: string,
  queryFn: () => Promise<{ data: T | null; error: any }>,
  throttleMs: number = 2000
): Promise<{ data: T | null; error: any }> {
  try {
    const result = await requestThrottler.throttle(key, queryFn, throttleMs);
    return result;
  } catch (error: any) {
    // If throttler rejects (circuit breaker), return error response
    return {
      data: null,
      error: {
        message: error.message || 'Request throttled',
        code: 'THROTTLED',
      },
    };
  }
}

