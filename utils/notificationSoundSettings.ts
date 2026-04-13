import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from './productionLogger';


const NOTIFICATION_SOUND_ENABLED_KEY = 'notification_sound_enabled';

/**
 * Get notification sound preference
 * @returns true if sounds are enabled, false if muted (defaults to true)
 */
export async function getNotificationSoundEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(NOTIFICATION_SOUND_ENABLED_KEY);
    if (value === null) {
      // Default to enabled if not set
      return true;
    }
    return value === 'true';
  } catch (error) {
    error('[NotificationSound] Error getting sound preference:', error);
    // Default to enabled on error
    return true;
  }
}

/**
 * Set notification sound preference
 * @param enabled true to enable sounds, false to mute
 */
export async function setNotificationSoundEnabled(enabled: boolean): Promise<boolean> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
    log(`[NotificationSound] Sound preference saved: ${enabled ? 'enabled' : 'muted'}`);
    return true;
  } catch (error) {
    error('[NotificationSound] Error saving sound preference:', error);
    return false;
  }
}

