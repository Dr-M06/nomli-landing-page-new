import { log, warn, error } from './productionLogger';
/**
 * Mock Notifee Service
 * Temporary replacement while Notifee native module is disabled
 * Firebase Cloud Messaging handles basic notifications
 */

// Mock Notifee types
export const AndroidImportance = {
  DEFAULT: 3,
  HIGH: 4,
  LOW: 2,
  MIN: 1,
  NONE: 0,
};

export const EventType = {
  DELIVERED: 0,
  PRESS: 1,
  ACTION_PRESS: 2,
  DISMISSED: 3,
};

// Mock notifee service
export const notifeeService = {
  async cancelAllNotifications() {
    log('[Notifee Mock] Cancel all notifications');
    return Promise.resolve();
  },

  async cancelNotification(notificationId: string) {
    log('[Notifee Mock] Cancel notification:', notificationId);
    return Promise.resolve();
  },

  async createChannel(channel: any) {
    log('[Notifee Mock] Create channel:', channel.id);
    return Promise.resolve(channel.id);
  },

  async displayNotification(notification: any) {
    log('[Notifee Mock] Display notification:', notification.title);
    return Promise.resolve('mock-notification-id');
  },

  onBackgroundEvent(handler: any) {
    log('[Notifee Mock] Background event handler registered');
    return () => {}; // Unsubscribe function
  },

  onForegroundEvent(handler: any) {
    log('[Notifee Mock] Foreground event handler registered');
    return () => {}; // Unsubscribe function
  },
};

// Default export mock
const notifee = {
  ...notifeeService,
  AndroidImportance,
  EventType,
};

export default notifee;

