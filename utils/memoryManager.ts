// Global Memory Management for React Native App
// Helps prevent OutOfMemoryError crashes

import { cleanupChatMemory } from './chat';
import { log, warn, error } from './productionLogger';


export interface MemoryStats {
  totalMemory: number;
  usedMemory: number;
  freeMemory: number;
}

// Track memory usage and cleanup when needed
class MemoryManager {
  private static instance: MemoryManager;
  private cleanupCallbacks: (() => void)[] = [];
  private isCleaningUp = false;

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  // Register cleanup callbacks
  registerCleanup(callback: () => void) {
    this.cleanupCallbacks.push(callback);
  }

  // Perform aggressive memory cleanup
  async performMemoryCleanup() {
    if (this.isCleaningUp) {
      log('[MemoryManager] Cleanup already in progress');
      return;
    }

    this.isCleaningUp = true;
    log('[MemoryManager] Starting aggressive memory cleanup...');

    try {
      // 1. Clean up chat-related memory
      cleanupChatMemory();

      // 2. Run registered cleanup callbacks
      for (const callback of this.cleanupCallbacks) {
        try {
          callback();
        } catch (error) {
          error('[MemoryManager] Error in cleanup callback:', error);
        }
      }

      // 3. Force garbage collection if available
      if (global.gc && typeof global.gc === 'function') {
        log('[MemoryManager] Forcing garbage collection...');
        global.gc();
      }

      // 4. Clear any large objects from global scope
      this.clearGlobalObjects();

      log('[MemoryManager] Memory cleanup completed');
    } catch (error) {
      error('[MemoryManager] Error during memory cleanup:', error);
    } finally {
      this.isCleaningUp = false;
    }
  }

  // Clear large objects that might be holding memory
  private clearGlobalObjects() {
    try {
      // Clear any cached data that might be holding memory
      if (global.__DEV__) {
        // In development, clear metro cache if available
        if (global.__METRO_CACHE__) {
          log('[MemoryManager] Clearing Metro cache...');
          global.__METRO_CACHE__ = {};
        }
      }
    } catch (error) {
      error('[MemoryManager] Error clearing global objects:', error);
    }
  }

  // Monitor memory usage (Android specific)
  getMemoryInfo(): MemoryStats | null {
    try {
      // This would need native module integration for real memory stats
      // For now, return null to indicate not available
      return null;
    } catch (error) {
      error('[MemoryManager] Error getting memory info:', error);
      return null;
    }
  }

  // Check if we should trigger cleanup based on available memory
  shouldTriggerCleanup(): boolean {
    // For now, return false - would need native integration
    // In a real implementation, this would check actual memory usage
    return false;
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();

// Convenience function for emergency cleanup
export const emergencyMemoryCleanup = () => {
  log('[MemoryManager] EMERGENCY MEMORY CLEANUP TRIGGERED');
  return memoryManager.performMemoryCleanup();
};

// Auto-cleanup function that can be called periodically
export const periodicMemoryCleanup = () => {
  const manager = MemoryManager.getInstance();
  
  // Only cleanup if it seems necessary
  if (manager.shouldTriggerCleanup()) {
    log('[MemoryManager] Triggering periodic memory cleanup');
    manager.performMemoryCleanup();
  }
};

export default memoryManager;
