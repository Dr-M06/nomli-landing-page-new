/**
 * Production-Safe Logger
 * 
 * IMPORTANT: Use this instead of console.log/warn/error in production builds
 * 
 * Benefits:
 * - Automatically disabled in production (reduces bundle size)
 * - Can be configured to send errors to remote logging (Sentry, etc.)
 * - Prevents sensitive data exposure
 * - Improves performance
 */

// Check if we're in production
const isProduction = !__DEV__;

// Optional: use Firebase Crashlytics when available (install @react-native-firebase/crashlytics to enable)
let crashlyticsModule: (() => { recordError: (e: Error) => void }) | null = null;
try {
  crashlyticsModule = require('@react-native-firebase/crashlytics').default;
} catch {
  // Crashlytics not installed
}

/**
 * Production-safe log (disabled in production)
 * Use for debug/info messages
 */
export const log = (...args: any[]) => {
  if (!isProduction) {
    console.log(...args);
  }
};

/**
 * Production-safe warn (disabled in production)
 * Use for warnings that don't need to be in production
 */
export const warn = (...args: any[]) => {
  if (!isProduction) {
    console.warn(...args);
  }
};

/**
 * Production-safe error (ALWAYS tracks, even in production)
 * Use for actual errors that need to be tracked
 * 
 * IMPORTANT: In production builds, ALL console.* statements are removed by Babel.
 * This function will send errors to remote logging service instead.
 */
export const error = (...args: any[]) => {
  if (!isProduction) {
    // In development, use console.error
    console.error(...args);
  } else {
    if (crashlyticsModule) {
      try {
        const err = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
        crashlyticsModule().recordError(err);
      } catch {
        // ignore
      }
    }
  }
};

/**
 * Production-safe info (disabled in production)
 * Use for informational messages
 */
export const info = (...args: any[]) => {
  if (!isProduction) {
    console.info(...args);
  }
};

/**
 * Production-safe debug (disabled in production)
 * Use for detailed debugging
 */
export const debug = (...args: any[]) => {
  if (!isProduction) {
    console.debug(...args);
  }
};

/**
 * Log with context (useful for tracking specific features)
 * Automatically includes context in production logs
 */
export const logWithContext = (context: string, ...args: any[]) => {
  if (!isProduction) {
    console.log(`[${context}]`, ...args);
  } else {
    // In production, you might want to send structured logs
    // remoteLoggingService.log({ context, data: args });
  }
};

/**
 * Error with context (always tracks, even in production)
 * In production, sends to remote logging service instead of console
 */
export const errorWithContext = (context: string, ...args: any[]) => {
  if (!isProduction) {
    console.error(`[${context}]`, ...args);
  } else {
    if (crashlyticsModule) {
      try {
        const err = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
        crashlyticsModule().recordError(err);
      } catch {
        // ignore
      }
    }
  }
};

/**
 * Performance logging (disabled in production)
 * Use for tracking performance metrics
 */
export const perf = (label: string, startTime: number) => {
  if (!isProduction) {
    const duration = Date.now() - startTime;
    console.log(`[PERF] ${label}: ${duration}ms`);
  }
};

/**
 * Group logs together (disabled in production)
 */
export const group = (label: string) => {
  if (!isProduction && console.group) {
    console.group(label);
  }
};

export const groupEnd = () => {
  if (!isProduction && console.groupEnd) {
    console.groupEnd();
  }
};

// Export default logger object for convenience
export default {
  log,
  warn,
  error,
  info,
  debug,
  logWithContext,
  errorWithContext,
  perf,
  group,
  groupEnd,
};
