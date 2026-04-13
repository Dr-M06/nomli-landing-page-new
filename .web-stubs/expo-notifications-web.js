// Web-compatible stub for expo-notifications
// This stub works in SSR/static rendering contexts where native notifications aren't available

// Android Notification Priority enum
const AndroidNotificationPriority = {
  MIN: 'min',
  LOW: 'low',
  DEFAULT: 'default',
  HIGH: 'high',
  MAX: 'max',
};

// Notification handler stub
let notificationHandler = null;

const Notifications = {
  // Set notification handler - no-op on web
  setNotificationHandler: (handler) => {
    notificationHandler = handler;
  },
  
  // Get notification handler
  getNotificationHandler: () => notificationHandler,
  
  // Add notification received listener - returns subscription stub
  addNotificationReceivedListener: (listener) => {
    // Return a subscription object with remove method
    return {
      remove: () => {},
    };
  },
  
  // Add notification response received listener - returns subscription stub
  addNotificationResponseReceivedListener: (listener) => {
    // Return a subscription object with remove method
    return {
      remove: () => {},
    };
  },
  
  // Remove all notification listeners - no-op on web
  removeAllNotificationListeners: () => {},
  
  // Get all notification categories - returns empty array on web
  getNotificationCategoriesAsync: async () => [],
  
  // Set notification category - no-op on web
  setNotificationCategoryAsync: async () => {},
  
  // Delete notification category - no-op on web
  deleteNotificationCategoryAsync: async () => {},
  
  // Get all scheduled notifications - returns empty array on web
  getAllScheduledNotificationsAsync: async () => [],
  
  // Schedule notification - returns empty string on web
  scheduleNotificationAsync: async () => '',
  
  // Cancel scheduled notification - no-op on web
  cancelScheduledNotificationAsync: async () => {},
  
  // Cancel all scheduled notifications - no-op on web
  cancelAllScheduledNotificationsAsync: async () => {},
  
  // Get badge count - returns 0 on web
  getBadgeCountAsync: async () => 0,
  
  // Set badge count - no-op on web
  setBadgeCountAsync: async () => {},
  
  // Dismiss notification - no-op on web
  dismissNotificationAsync: async () => {},
  
  // Dismiss all notifications - no-op on web
  dismissAllNotificationsAsync: async () => {},
  
  // Get permissions - returns denied on web
  getPermissionsAsync: async () => ({
    status: 'denied',
    granted: false,
    canAskAgain: false,
  }),
  
  // Request permissions - returns denied on web
  requestPermissionsAsync: async () => ({
    status: 'denied',
    granted: false,
    canAskAgain: false,
  }),
  
  // Android Notification Priority enum
  AndroidNotificationPriority,
};

module.exports = Notifications;
module.exports.default = Notifications;
module.exports.AndroidNotificationPriority = AndroidNotificationPriority;
