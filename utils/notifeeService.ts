// Temporarily using mock while Notifee native module is disabled
import notifee, { AndroidImportance } from './notifeeServiceMock';
import { Platform } from 'react-native';
import { log, error } from './productionLogger';

class NotifeeService {
  private static instance: NotifeeService;
  private isInitialized = false;

  public static getInstance(): NotifeeService {
    if (!NotifeeService.instance) {
      NotifeeService.instance = new NotifeeService();
    }
    return NotifeeService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      log('[NotifeeService] Already initialized');
      return;
    }

    try {
      log('[NotifeeService] Initializing Notifee service...');
      await this.createChannels();
      this.setupActionHandlers();
      this.setupFCMDisplayHandler();
      this.isInitialized = true;
      log('[NotifeeService] Notifee service initialized successfully');
    } catch (e) {
      error('[NotifeeService] Failed to initialize:', e);
      throw e;
    }
  }

  private async createChannels(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      await notifee.createChannel({
        id: 'default',
        name: 'Default Notifications',
        importance: AndroidImportance.DEFAULT,
        sound: 'default',
      });
      log('[NotifeeService] Notification channels created');
    } catch (e) {
      error('[NotifeeService] Error creating channels:', e);
    }
  }

  private setupFCMDisplayHandler(): void {
    log('[NotifeeService] FCM display handler setup (background handler is in index.js)');
  }

  private setupActionHandlers(): void {
    log('[NotifeeService] Setting up action handlers (call actions removed)...');

    notifee.onForegroundEvent(async ({ type, detail }) => {
      log('[NotifeeService] Foreground event:', type, detail);
    });

    notifee.onBackgroundEvent(async ({ type, detail }) => {
      log('[NotifeeService] Background event:', type, detail);
    });

    log('[NotifeeService] Action handlers set up successfully');
  }

  public async cancelAllNotifications(): Promise<void> {
    try {
      await notifee.cancelAllNotifications();
      log('[NotifeeService] All notifications cancelled');
    } catch (e) {
      error('[NotifeeService] Error cancelling notifications:', e);
    }
  }

  public async cancelNotification(notificationId: string): Promise<void> {
    try {
      await notifee.cancelNotification(notificationId);
      log('[NotifeeService] Notification cancelled:', notificationId);
    } catch (e) {
      error('[NotifeeService] Error cancelling notification:', e);
    }
  }
}

export const notifeeService = NotifeeService.getInstance();
