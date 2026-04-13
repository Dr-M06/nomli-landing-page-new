/**
 * Load Shielding System
 * 
 * Prioritizes critical content (Community screen) first, then loads
 * non-critical content/services in the background after the critical path is ready.
 * 
 * This ensures the app feels fast by showing the main content immediately,
 * while other screens and services load progressively without blocking.
 */

import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';


export enum LoadPriority {
  CRITICAL = 0,      // Community screen - load immediately
  HIGH = 1,          // Other tab screens - load after critical
  MEDIUM = 2,        // Background services - load after high priority
  LOW = 3,           // Optional optimizations - load last
}

interface LoadTask {
  id: string;
  priority: LoadPriority;
  task: () => Promise<void> | void;
  description?: string;
}

class LoadShieldingManager {
  private tasks: LoadTask[] = [];
  private criticalPathComplete = false;
  private isProcessing = false;
  private processedTasks = new Set<string>();

  /**
   * Register a task to be executed based on priority
   */
  registerTask(
    id: string,
    priority: LoadPriority,
    task: () => Promise<void> | void,
    description?: string
  ): void {
    // Don't register duplicate tasks
    if (this.processedTasks.has(id)) {
      return;
    }

    this.tasks.push({
      id,
      priority,
      task,
      description,
    });

    // Sort tasks by priority
    this.tasks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Mark critical path as complete (Community screen loaded)
   * This triggers background loading of lower priority tasks
   */
  markCriticalPathComplete(): void {
    if (this.criticalPathComplete) {
      return;
    }

    this.criticalPathComplete = true;
    log('[LoadShielding] ✅ Critical path complete - starting background loading');

    // Start processing tasks in background
    this.processTasks();
  }

  /**
   * Process tasks based on priority
   * Critical tasks run immediately, others run in background
   */
  private async processTasks(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // Process critical tasks immediately (synchronously)
    const criticalTasks = this.tasks.filter(t => t.priority === LoadPriority.CRITICAL);
    for (const task of criticalTasks) {
      if (this.processedTasks.has(task.id)) continue;
      
      try {
        log(`[LoadShielding] 🚀 Executing CRITICAL: ${task.description || task.id}`);
        await task.task();
        this.processedTasks.add(task.id);
      } catch (error) {
        warn(`[LoadShielding] Critical task failed: ${task.id}`, error);
      }
    }

    // Mark critical path complete after critical tasks finish
    if (!this.criticalPathComplete && criticalTasks.length > 0) {
      this.markCriticalPathComplete();
    }

    // Process high priority tasks after critical path (deferred)
    this.deferTaskExecution(LoadPriority.HIGH, () => {
      const highPriorityTasks = this.tasks.filter(t => t.priority === LoadPriority.HIGH);
      return this.executeTasks(highPriorityTasks, 'HIGH');
    });

    // Process medium priority tasks (further deferred)
    this.deferTaskExecution(LoadPriority.MEDIUM, () => {
      const mediumPriorityTasks = this.tasks.filter(t => t.priority === LoadPriority.MEDIUM);
      return this.executeTasks(mediumPriorityTasks, 'MEDIUM');
    });

    // Process low priority tasks (last)
    this.deferTaskExecution(LoadPriority.LOW, () => {
      const lowPriorityTasks = this.tasks.filter(t => t.priority === LoadPriority.LOW);
      return this.executeTasks(lowPriorityTasks, 'LOW');
    });

    this.isProcessing = false;
  }

  /**
   * Execute a batch of tasks
   */
  private async executeTasks(tasks: LoadTask[], priorityName: string): Promise<void> {
    for (const task of tasks) {
      if (this.processedTasks.has(task.id)) continue;

      try {
        log(`[LoadShielding] ⏳ Executing ${priorityName}: ${task.description || task.id}`);
        await task.task();
        this.processedTasks.add(task.id);
      } catch (error) {
        warn(`[LoadShielding] ${priorityName} task failed: ${task.id}`, error);
      }
    }
  }

  /**
   * Defer task execution using requestIdleCallback or setTimeout
   */
  private deferTaskExecution(priority: LoadPriority, executeFn: () => Promise<void>): void {
    // Calculate delay based on priority
    // HIGH: 500ms after critical, MEDIUM: 2000ms, LOW: 5000ms
    const delays = {
      [LoadPriority.HIGH]: 500,
      [LoadPriority.MEDIUM]: 2000,
      [LoadPriority.LOW]: 5000,
    };

    const delay = delays[priority] || 0;

    // Use requestIdleCallback if available (browser/React Native), otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(
        () => {
          setTimeout(executeFn, delay);
        },
        { timeout: delay + 1000 }
      );
    } else {
      // Fallback to setTimeout
      setTimeout(executeFn, delay);
    }
  }

  /**
   * Start processing tasks (called on app init)
   */
  start(): void {
    // Process critical tasks immediately
    this.processTasks();
  }

  /**
   * Check if critical path is complete
   */
  isCriticalPathComplete(): boolean {
    return this.criticalPathComplete;
  }

  /**
   * Get status of all tasks
   */
  getStatus(): {
    total: number;
    completed: number;
    pending: number;
    criticalPathComplete: boolean;
  } {
    return {
      total: this.tasks.length,
      completed: this.processedTasks.size,
      pending: this.tasks.length - this.processedTasks.size,
      criticalPathComplete: this.criticalPathComplete,
    };
  }
}

// Singleton instance
export const loadShielding = new LoadShieldingManager();

/**
 * Helper to defer execution until after critical path
 */
export function deferUntilAfterCritical(task: () => Promise<void> | void, description?: string): void {
  loadShielding.registerTask(
    `deferred_${Date.now()}_${Math.random()}`,
    LoadPriority.HIGH,
    task,
    description
  );
}

/**
 * Helper to defer low priority tasks
 */
export function deferLowPriority(task: () => Promise<void> | void, description?: string): void {
  loadShielding.registerTask(
    `low_priority_${Date.now()}_${Math.random()}`,
    LoadPriority.LOW,
    task,
    description
  );
}
