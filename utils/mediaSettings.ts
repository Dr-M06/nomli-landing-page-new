/**
 * Media Settings Utilities
 * Handles user preferences for media auto-save
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { log, warn, error } from './productionLogger';


const AUTO_SAVE_MEDIA_KEY = 'auto_save_media'

/**
 * Get the auto-save media setting
 * @returns true if auto-save is enabled, false otherwise
 */
export async function getAutoSaveMediaSetting(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(AUTO_SAVE_MEDIA_KEY)
    return value === 'true'
  } catch (error) {
    error('Error getting auto-save media setting:', error)
    return false // Default to false
  }
}

/**
 * Set the auto-save media setting
 * @param enabled Whether to enable auto-save
 */
export async function setAutoSaveMediaSetting(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTO_SAVE_MEDIA_KEY, enabled.toString())
  } catch (error) {
    error('Error setting auto-save media setting:', error)
    throw error
  }
}

