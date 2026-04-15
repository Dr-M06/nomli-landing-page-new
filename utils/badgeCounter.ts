import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface BadgeCounts {
  total: number;
  messages: number;
  community: number;
}

class BadgeCounterService {
  private currentBadgeCount = 0;
  private isInitialized = false;

  /**
   * Initialize the badge counter service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      log('[BadgeCounter] Initializing badge counter service...');
      
      // Request permissions if needed
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        log('[BadgeCounter] Notification permissions not granted');
        return;
      }

      // Set up notification handlers
      Notifications.setBadgeCountAsync(0);
      this.isInitialized = true;
      
      log('[BadgeCounter] Badge counter service initialized');
    } catch (error) {
      error('[BadgeCounter] Error initializing:', error);
    }
  }

  /**
   * Get unread notification counts from database
   */
  async getUnreadCounts(): Promise<BadgeCounts> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { total: 0, messages: 0, community: 0 };
      }

      let messageCount = 0;
      let communityCount = 0;

      // Try to get unread message count from private_messages
      try {
        const { count: msgCount } = await supabase
          .from('private_messages')
          .select('*', { count: 'exact', head: true })
          .eq('recipient_id', user.id)
          .eq('read', false);
        messageCount = msgCount || 0;
      } catch (error) {
        log('[BadgeCounter] Could not count private messages:', error);
      }

      // Try to get community notifications - use posts as fallback
      try {
        // Count recent posts that might be of interest
        const { count: commCount } = await supabase
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .neq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours
        communityCount = Math.min(commCount || 0, 10); // Cap at 10 for badge
      } catch (error) {
        log('[BadgeCounter] Could not count community posts:', error);
      }

      const counts: BadgeCounts = {
        messages: messageCount,
        community: communityCount,
        total: messageCount + communityCount
      };

      log('[BadgeCounter] Unread counts:', counts);
      return counts;
    } catch (error) {
      error('[BadgeCounter] Error getting unread counts:', error);
      return { total: 0, messages: 0, community: 0 };
    }
  }

  /**
   * Update the app icon badge count
   */
  async updateBadgeCount(): Promise<void> {
    try {
      log('[BadgeCounter] updateBadgeCount called');
      
      if (!this.isInitialized) {
        log('[BadgeCounter] Not initialized, initializing now...');
        await this.initialize();
      }

      const counts = await this.getUnreadCounts();
      const newBadgeCount = counts.total;

      log('[BadgeCounter] Current badge count:', this.currentBadgeCount, 'New count:', newBadgeCount);

      // Always update the badge count, even if it's the same
      log('[BadgeCounter] Setting badge count to:', newBadgeCount);
      
      // Set the badge count on the app icon
      await this.setBadgeCountCrossPlatform(newBadgeCount);
      this.currentBadgeCount = newBadgeCount;
      
      log('[BadgeCounter] Badge count updated successfully:', newBadgeCount);
    } catch (error) {
      error('[BadgeCounter] Error updating badge count:', error);
    }
  }

  /**
   * Cross-platform badge count implementation
   */
  private async setBadgeCountCrossPlatform(count: number): Promise<void> {
    try {
      // iOS: Use native badge support
      if (Platform.OS === 'ios') {
        await Notifications.setBadgeCountAsync(count);
        log('[BadgeCounter] iOS badge count set:', count);
        return;
      }

      // Android: Use notification-based badge approach
      if (Platform.OS === 'android') {
        await this.setAndroidBadgeCount(count);
        log('[BadgeCounter] Android badge count set:', count);
        return;
      }
    } catch (error) {
      error('[BadgeCounter] Error setting cross-platform badge count:', error);
      // Fallback to expo-notifications
      try {
        await Notifications.setBadgeCountAsync(count);
      } catch (fallbackError) {
        error('[BadgeCounter] Fallback badge count failed:', fallbackError);
      }
    }
  }

  /**
   * Android-specific badge count implementation using persistent notification
   */
  private async setAndroidBadgeCount(count: number): Promise<void> {
    try {
      // Cancel any existing badge notification
      await Notifications.dismissNotificationAsync('badge_notification');

      if (count > 0) {
        // Create a persistent notification that shows badge count
        // This works on most Android launchers and provides visual feedback
        await Notifications.scheduleNotificationAsync({
          identifier: 'badge_notification',
          content: {
            title: `${count} unread notification${count === 1 ? '' : 's'}`,
            body: 'You have unread messages',
            data: { 
              type: 'badge',
              count: count,
              persistent: true 
            },
            badge: count,
            priority: Notifications.AndroidNotificationPriority.MIN, // Low priority so it's less intrusive
            sticky: true,
          },
          trigger: null, // Show immediately
        });

        // Also try the expo method for launchers that support it
        await Notifications.setBadgeCountAsync(count);
      } else {
        // Clear badge when count is 0
        await Notifications.setBadgeCountAsync(0);
      }
    } catch (error) {
      error('[BadgeCounter] Error setting Android badge count:', error);
      // Fallback to expo method only
      await Notifications.setBadgeCountAsync(count);
    }
  }

  /**
   * Clear the badge count (when user opens app)
   */
  async clearBadgeCount(): Promise<void> {
    try {
      log('[BadgeCounter] Clearing badge count...');
      await this.setBadgeCountCrossPlatform(0);
      this.currentBadgeCount = 0;
      log('[BadgeCounter] Badge count cleared successfully');
    } catch (error) {
      error('[BadgeCounter] Error clearing badge count:', error);
    }
  }

  /**
   * Increment badge count for new notification
   */
  async incrementBadgeCount(type: 'messages' | 'community'): Promise<void> {
    try {
      const counts = await this.getUnreadCounts();
      counts[type]++;
      counts.total++;
      
      await Notifications.setBadgeCountAsync(counts.total);
      this.currentBadgeCount = counts.total;
      
      log('[BadgeCounter] Badge count incremented for', type, ':', counts.total);
    } catch (error) {
      error('[BadgeCounter] Error incrementing badge count:', error);
    }
  }

  /**
   * Decrement badge count when notification is read
   */
  async decrementBadgeCount(type: 'messages' | 'community'): Promise<void> {
    try {
      const counts = await this.getUnreadCounts();
      if (counts[type] > 0) {
        counts[type]--;
        counts.total = Math.max(0, counts.total - 1);
        
        await Notifications.setBadgeCountAsync(counts.total);
        this.currentBadgeCount = counts.total;
        
        log('[BadgeCounter] Badge count decremented for', type, ':', counts.total);
      }
    } catch (error) {
      error('[BadgeCounter] Error decrementing badge count:', error);
    }
  }

  /**
   * Get current badge count
   */
  getCurrentBadgeCount(): number {
    return this.currentBadgeCount;
  }

  // No test setter in production – rely on real unread counts only
}

// Create and export singleton instance
export const badgeCounter = new BadgeCounterService();

// Export the class for testing
export default BadgeCounterService;
