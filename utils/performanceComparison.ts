/**
 * Performance Comparison Utility
 * 
 * Quick utility to compare performance before/after aggressive caching
 * Run this in your app to see speed improvements
 */

import { performanceMonitor } from './performanceMonitor';
import { log, warn, error } from './productionLogger';


/**
 * Display performance comparison in console
 */
export async function showPerformanceComparison(): Promise<void> {
  try {
    const stats = await performanceMonitor.getStats();
    const comparison = await performanceMonitor.compareSessions();

    log('\n');
    log('╔══════════════════════════════════════════════════════════╗');
    log('║        🚀 PERFORMANCE COMPARISON REPORT                  ║');
    log('╠══════════════════════════════════════════════════════════╣');
    log('║                                                          ║');
    log('║  📊 OVERALL STATISTICS                                   ║');
    log('║  ──────────────────────────────────────────────────────  ║');
    log(`║  Total Sessions: ${stats.totalSessions.toString().padEnd(40)} ║`);
    log(`║  Average Startup Time: ${Math.round(stats.averageStartupTime).toString().padEnd(30)}ms ║`);
    log(`║  Average Data Load: ${Math.round(stats.averageDataLoadTime).toString().padEnd(33)}ms ║`);
    log(`║  Average Image Load: ${Math.round(stats.averageImageLoadTime).toString().padEnd(33)}ms ║`);
    log(`║  Cache Hit Rate: ${stats.cacheHitRate.toFixed(1).padEnd(37)}% ║`);
    log('║                                                          ║');
    log('║  📈 IMPROVEMENTS (After Aggressive Caching)             ║');
    log('║  ──────────────────────────────────────────────────────  ║');
    
    const startupImprovement = comparison.improvement.startupTime;
    const dataImprovement = comparison.improvement.dataLoadTime;
    const imageImprovement = comparison.improvement.imageLoadTime;
    const cacheImprovement = comparison.improvement.cacheHitRate;
    
    log(`║  Startup Time: ${startupImprovement > 0 ? '✅' : '❌'} ${startupImprovement > 0 ? '+' : ''}${startupImprovement.toFixed(1).padEnd(34)}% ║`);
    log(`║  Data Load Time: ${dataImprovement > 0 ? '✅' : '❌'} ${dataImprovement > 0 ? '+' : ''}${dataImprovement.toFixed(1).padEnd(31)}% ║`);
    log(`║  Image Load Time: ${imageImprovement > 0 ? '✅' : '❌'} ${imageImprovement > 0 ? '+' : ''}${imageImprovement.toFixed(1).padEnd(31)}% ║`);
    log(`║  Cache Hit Rate: ${cacheImprovement > 0 ? '✅' : '❌'} ${cacheImprovement > 0 ? '+' : ''}${cacheImprovement.toFixed(1).padEnd(32)}% ║`);
    log('║                                                          ║');
    log('╚══════════════════════════════════════════════════════════╝');
    log('\n');

    // Detailed breakdown
    if (comparison.before.length > 0 && comparison.after.length > 0) {
      const beforeAvg = stats.averageStartupTime;
      const afterAvg = comparison.improvement.startupTime > 0 
        ? beforeAvg * (1 - comparison.improvement.startupTime / 100)
        : beforeAvg;

      log('📋 DETAILED BREAKDOWN:');
      log(`   Before: ${Math.round(beforeAvg)}ms average startup`);
      log(`   After:  ${Math.round(afterAvg)}ms average startup`);
      log(`   Improvement: ${Math.round(beforeAvg - afterAvg)}ms faster (${Math.abs(comparison.improvement.startupTime).toFixed(1)}%)`);
      log('\n');
    }
  } catch (error) {
    error('[Performance] Error generating comparison:', error);
  }
}

/**
 * Quick performance check - shows current session stats
 */
export async function quickPerformanceCheck(): Promise<void> {
  try {
    const stats = await performanceMonitor.getStats();
    
    log('\n');
    log('⚡ QUICK PERFORMANCE CHECK');
    log('─────────────────────────');
    log(`Total Sessions: ${stats.totalSessions}`);
    log(`Avg Startup: ${Math.round(stats.averageStartupTime)}ms`);
    log(`Avg Data Load: ${Math.round(stats.averageDataLoadTime)}ms`);
    log(`Avg Image Load: ${Math.round(stats.averageImageLoadTime)}ms`);
    log(`Cache Hit Rate: ${stats.cacheHitRate.toFixed(1)}%`);
    log('\n');
  } catch (error) {
    error('[Performance] Error in quick check:', error);
  }
}

/**
 * Export performance data as JSON
 */
export async function exportPerformanceData(): Promise<string> {
  try {
    const stats = await performanceMonitor.getStats();
    const comparison = await performanceMonitor.compareSessions();
    const logs = await performanceMonitor.getLogs();

    return JSON.stringify({
      stats,
      comparison,
      recentLogs: logs.slice(-20),
      timestamp: new Date().toISOString(),
    }, null, 2);
  } catch (error) {
    error('[Performance] Error exporting data:', error);
    return '{}';
  }
}

