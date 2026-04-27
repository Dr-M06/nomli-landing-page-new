/**
 * Client-side helper to call the notification processor
 * This can be used to manually trigger notification processing
 */

import Constants from 'expo-constants';
import { log, warn, error } from './productionLogger';


const NOTIFICATION_PROCESSOR_URL = 
  process.env.EXPO_PUBLIC_NOTIFICATION_PROCESSOR_URL || 
  Constants?.expoConfig?.extra?.NOTIFICATION_PROCESSOR_URL || 
  'https://notification-processor.onrender.com';

const PROCESSOR_SECRET = 
  process.env.EXPO_PUBLIC_NOTIFICATION_PROCESSOR_SECRET || 
  Constants?.expoConfig?.extra?.NOTIFICATION_PROCESSOR_SECRET || 
  'np_3rqwhebawpkbmnib2jy7xs';

export interface ProcessorResponse {
  processed: number;
  failed: number;
  total: number;
  timestamp: string;
  message?: string;
}

/**
 * Call the notification processor to process pending notifications
 */
export const callNotificationProcessor = async (): Promise<ProcessorResponse> => {
  try {
    log('🔄 Calling notification processor...');
    
    const response = await fetch(`${NOTIFICATION_PROCESSOR_URL}/process-notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-processor-secret': PROCESSOR_SECRET,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: ProcessorResponse = await response.json();
    log('✅ Notification processor response:', result);
    return result;

  } catch (error) {
    error('❌ Error calling notification processor:', error);
    throw error;
  }
};

/**
 * Check if the notification processor is healthy
 */
export const checkProcessorHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${NOTIFICATION_PROCESSOR_URL}/health`);
    return response.ok;
  } catch (error) {
    error('❌ Notification processor health check failed:', error);
    return false;
  }
};

/**
 * Process notifications with retry logic
 */
export const processNotificationsWithRetry = async (maxRetries: number = 3): Promise<ProcessorResponse> => {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`🔄 Processing notifications (attempt ${attempt}/${maxRetries})...`);
      const result = await callNotificationProcessor();
      
      if (result.processed > 0 || result.failed === 0) {
        log(`✅ Successfully processed ${result.processed} notifications`);
        return result;
      }
      
      // If no notifications were processed, wait a bit before retrying
      if (attempt < maxRetries) {
        log('⏳ No notifications processed, waiting before retry...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      lastError = error as Error;
      error(`❌ Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        log(`⏳ Waiting before retry ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
};
