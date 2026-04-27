/**
 * Performance Monitor
 * 
 * Tracks and compares app loading speeds before/after aggressive caching
 * Measures: App startup, data loading, image loading, cache hit rates
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';


const PERFORMANCE_LOG_KEY = '@nomli_performance_logs';
const MAX_LOGS = 100; // Keep last 100 performance logs

interface PerformanceMetric {
  timestamp: number;
  event: string;
  duration: number;
  cacheHit: boolean;
  dataSize?: number;
  platform: string;
}

interface PerformanceLog {
  sessionId: string;
  startTime: number;
  endTime?: number;
  metrics: PerformanceMetric[];
  cacheStats: {
    prefetchCacheHit: boolean;
    imageCacheHit: boolean;
    totalCacheHits: number;
    totalCacheMisses: number;
  };
}

class PerformanceMonitor {
  private currentSession: PerformanceLog | null = null;
  private metrics: PerformanceMetric[] = [];

  /**
   * Start a new performance monitoring session
   */
  startSession(sessionId: string): void {
    this.currentSession = {
      sessionId,
      startTime: Date.now(),
      metrics: [],
      cacheStats: {
        prefetchCacheHit: false,
        imageCacheHit: false,
        totalCacheHits: 0,
        totalCacheMisses: 0,
      },
    };
    this.metrics = [];
    log(`[Performance] Started session: ${sessionId}`);
  }

  /**
   * Record a performance metric
   */
  recordMetric(
    event: string,
    duration: number,
    cacheHit: boolean = false,
    dataSize?: number
  ): void {
    const metric: PerformanceMetric = {
      timestamp: Date.now(),
      event,
      duration,
      cacheHit,
      dataSize,
      platform: Platform.OS,
    };

    this.metrics.push(metric);

    if (this.currentSession) {
      this.currentSession.metrics.push(metric);
      if (cacheHit) {
        this.currentSession.cacheStats.totalCacheHits++;
      } else {
        this.currentSession.cacheStats.totalCacheMisses++;
      }
    }

    log(
      `[Performance] ${event}: ${duration}ms ${cacheHit ? '(CACHE HIT)' : '(CACHE MISS)'}`
    );
  }

  /**
   * Mark prefetch cache hit
   */
  markPrefetchCacheHit(): void {
    if (this.currentSession) {
      this.currentSession.cacheStats.prefetchCacheHit = true;
      this.currentSession.cacheStats.totalCacheHits++;
    }
  }

  /**
   * Mark image cache hit
   */
  markImageCacheHit(): void {
    if (this.currentSession) {
      this.currentSession.cacheStats.imageCacheHit = true;
      this.currentSession.cacheStats.totalCacheHits++;
    }
  }

  /**
   * End current session and save results
   */
  async endSession(): Promise<PerformanceLog | null> {
    if (!this.currentSession) {
      return null;
    }

    this.currentSession.endTime = Date.now();
    const totalDuration = this.currentSession.endTime - this.currentSession.startTime;

    log(`[Performance] Session ended: ${totalDuration}ms`);
    log(`[Performance] Cache hits: ${this.currentSession.cacheStats.totalCacheHits}`);
    log(`[Performance] Cache misses: ${this.currentSession.cacheStats.totalCacheMisses}`);

    // Save to AsyncStorage
    await this.saveLog(this.currentSession);

    const session = this.currentSession;
    this.currentSession = null;
    this.metrics = [];

    return session;
  }

  /**
   * Save performance log
   */
  private async saveLog(log: PerformanceLog): Promise<void> {
    try {
      const existingLogs = await this.getLogs();
      existingLogs.push(log);

      // Keep only last MAX_LOGS
      const trimmedLogs = existingLogs.slice(-MAX_LOGS);
      await AsyncStorage.setItem(PERFORMANCE_LOG_KEY, JSON.stringify(trimmedLogs));
    } catch (error) {
      error('[Performance] Error saving log:', error);
    }
  }

  /**
   * Get all performance logs
   */
  async getLogs(): Promise<PerformanceLog[]> {
    try {
      const logsJson = await AsyncStorage.getItem(PERFORMANCE_LOG_KEY);
      if (logsJson) {
        return JSON.parse(logsJson);
      }
      return [];
    } catch (error) {
      error('[Performance] Error getting logs:', error);
      return [];
    }
  }

  /**
   * Get performance statistics
   */
  async getStats(): Promise<{
    averageStartupTime: number;
    averageDataLoadTime: number;
    averageImageLoadTime: number;
    cacheHitRate: number;
    totalSessions: number;
    recentSessions: PerformanceLog[];
  }> {
    const logs = await this.getLogs();
    if (logs.length === 0) {
      return {
        averageStartupTime: 0,
        averageDataLoadTime: 0,
        averageImageLoadTime: 0,
        cacheHitRate: 0,
        totalSessions: 0,
        recentSessions: [],
      };
    }

    // Calculate averages
    const startupTimes: number[] = [];
    const dataLoadTimes: number[] = [];
    const imageLoadTimes: number[] = [];
    let totalCacheHits = 0;
    let totalCacheMisses = 0;

    logs.forEach((log) => {
      const sessionDuration = log.endTime
        ? log.endTime - log.startTime
        : 0;
      startupTimes.push(sessionDuration);

      log.metrics.forEach((metric) => {
        if (metric.event.includes('data') || metric.event.includes('posts')) {
          dataLoadTimes.push(metric.duration);
        }
        if (metric.event.includes('image') || metric.event.includes('media')) {
          imageLoadTimes.push(metric.duration);
        }
        if (metric.cacheHit) {
          totalCacheHits++;
        } else {
          totalCacheMisses++;
        }
      });

      totalCacheHits += log.cacheStats.totalCacheHits;
      totalCacheMisses += log.cacheStats.totalCacheMisses;
    });

    const average = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const totalCacheOperations = totalCacheHits + totalCacheMisses;
    const cacheHitRate =
      totalCacheOperations > 0 ? (totalCacheHits / totalCacheOperations) * 100 : 0;

    return {
      averageStartupTime: average(startupTimes),
      averageDataLoadTime: average(dataLoadTimes),
      averageImageLoadTime: average(imageLoadTimes),
      cacheHitRate,
      totalSessions: logs.length,
      recentSessions: logs.slice(-10), // Last 10 sessions
    };
  }

  /**
   * Compare recent sessions (before/after aggressive caching)
   */
  async compareSessions(): Promise<{
    before: PerformanceLog[];
    after: PerformanceLog[];
    improvement: {
      startupTime: number; // Percentage improvement
      dataLoadTime: number;
      imageLoadTime: number;
      cacheHitRate: number;
    };
  }> {
    const logs = await this.getLogs();
    
    // Split into before/after (assuming we can identify by timestamp or session ID)
    // For now, we'll compare first half vs second half
    const midpoint = Math.floor(logs.length / 2);
    const before = logs.slice(0, midpoint);
    const after = logs.slice(midpoint);

    const beforeStats = this.calculateStats(before);
    const afterStats = this.calculateStats(after);

    const improvement = {
      startupTime: this.calculateImprovement(
        beforeStats.averageStartupTime,
        afterStats.averageStartupTime
      ),
      dataLoadTime: this.calculateImprovement(
        beforeStats.averageDataLoadTime,
        afterStats.averageDataLoadTime
      ),
      imageLoadTime: this.calculateImprovement(
        beforeStats.averageImageLoadTime,
        afterStats.averageImageLoadTime
      ),
      cacheHitRate: afterStats.cacheHitRate - beforeStats.cacheHitRate,
    };

    return {
      before,
      after,
      improvement,
    };
  }

  /**
   * Calculate statistics for a set of logs
   */
  private calculateStats(logs: PerformanceLog[]): {
    averageStartupTime: number;
    averageDataLoadTime: number;
    averageImageLoadTime: number;
    cacheHitRate: number;
  } {
    if (logs.length === 0) {
      return {
        averageStartupTime: 0,
        averageDataLoadTime: 0,
        averageImageLoadTime: 0,
        cacheHitRate: 0,
      };
    }

    const startupTimes: number[] = [];
    const dataLoadTimes: number[] = [];
    const imageLoadTimes: number[] = [];
    let totalCacheHits = 0;
    let totalCacheMisses = 0;

    logs.forEach((log) => {
      const sessionDuration = log.endTime ? log.endTime - log.startTime : 0;
      startupTimes.push(sessionDuration);

      log.metrics.forEach((metric) => {
        if (metric.event.includes('data') || metric.event.includes('posts')) {
          dataLoadTimes.push(metric.duration);
        }
        if (metric.event.includes('image') || metric.event.includes('media')) {
          imageLoadTimes.push(metric.duration);
        }
        if (metric.cacheHit) {
          totalCacheHits++;
        } else {
          totalCacheMisses++;
        }
      });

      totalCacheHits += log.cacheStats.totalCacheHits;
      totalCacheMisses += log.cacheStats.totalCacheMisses;
    });

    const average = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const totalCacheOperations = totalCacheHits + totalCacheMisses;
    const cacheHitRate =
      totalCacheOperations > 0 ? (totalCacheHits / totalCacheOperations) * 100 : 0;

    return {
      averageStartupTime: average(startupTimes),
      averageDataLoadTime: average(dataLoadTimes),
      averageImageLoadTime: average(imageLoadTimes),
      cacheHitRate,
    };
  }

  /**
   * Calculate percentage improvement
   */
  private calculateImprovement(before: number, after: number): number {
    if (before === 0) return 0;
    return ((before - after) / before) * 100;
  }

  /**
   * Clear all performance logs
   */
  async clearLogs(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PERFORMANCE_LOG_KEY);
      log('[Performance] Logs cleared');
    } catch (error) {
      error('[Performance] Error clearing logs:', error);
    }
  }

  /**
   * Get formatted performance report
   */
  async getReport(): Promise<string> {
    const stats = await this.getStats();
    const comparison = await this.compareSessions();

    return `
╔══════════════════════════════════════════════════════════╗
║           PERFORMANCE REPORT - NOMLI MINGLE              ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  📊 OVERALL STATISTICS                                   ║
║  ──────────────────────────────────────────────────────  ║
║  Total Sessions: ${stats.totalSessions.toString().padEnd(40)} ║
║  Average Startup Time: ${Math.round(stats.averageStartupTime).toString().padEnd(30)}ms ║
║  Average Data Load: ${Math.round(stats.averageDataLoadTime).toString().padEnd(33)}ms ║
║  Average Image Load: ${Math.round(stats.averageImageLoadTime).toString().padEnd(33)}ms ║
║  Cache Hit Rate: ${stats.cacheHitRate.toFixed(1).padEnd(37)}% ║
║                                                          ║
║  📈 IMPROVEMENTS (After Aggressive Caching)             ║
║  ──────────────────────────────────────────────────────  ║
║  Startup Time: ${comparison.improvement.startupTime > 0 ? '+' : ''}${comparison.improvement.startupTime.toFixed(1).padEnd(36)}% ║
║  Data Load Time: ${comparison.improvement.dataLoadTime > 0 ? '+' : ''}${comparison.improvement.dataLoadTime.toFixed(1).padEnd(33)}% ║
║  Image Load Time: ${comparison.improvement.imageLoadTime > 0 ? '+' : ''}${comparison.improvement.imageLoadTime.toFixed(1).padEnd(33)}% ║
║  Cache Hit Rate: ${comparison.improvement.cacheHitRate > 0 ? '+' : ''}${comparison.improvement.cacheHitRate.toFixed(1).padEnd(34)}% ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `.trim();
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Helper function to measure async operation
 */
export async function measurePerformance<T>(
  eventName: string,
  operation: () => Promise<T>,
  checkCache?: () => boolean
): Promise<T> {
  const startTime = Date.now();
  const cacheHit = checkCache ? checkCache() : false;

  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    performanceMonitor.recordMetric(eventName, duration, cacheHit);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    performanceMonitor.recordMetric(`${eventName}_error`, duration, false);
    throw error;
  }
}

