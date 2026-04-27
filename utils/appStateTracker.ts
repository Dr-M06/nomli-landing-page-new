import { AppState, AppStateStatus } from 'react-native';

/**
 * Shared app state tracker for checking if app is active
 * Used to suppress notifications when app is in foreground
 */
class AppStateTracker {
  private currentState: AppStateStatus;
  private listeners: Set<(state: AppStateStatus) => void> = new Set();

  constructor() {
    this.currentState = AppState.currentState;
    
    // Listen to app state changes
    AppState.addEventListener('change', (nextAppState) => {
      this.currentState = nextAppState;
      // Notify all listeners
      this.listeners.forEach(listener => listener(nextAppState));
    });
  }

  /**
   * Get current app state
   */
  getCurrentState(): AppStateStatus {
    return this.currentState;
  }

  /**
   * Check if app is currently active (foreground)
   */
  isAppActive(): boolean {
    return this.currentState === 'active';
  }

  /**
   * Check if app is in background
   */
  isAppInBackground(): boolean {
    return this.currentState === 'background';
  }

  /**
   * Add a listener for app state changes
   */
  addListener(listener: (state: AppStateStatus) => void): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }
}

// Export singleton instance
export const appStateTracker = new AppStateTracker();

