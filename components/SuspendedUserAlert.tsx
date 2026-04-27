import React from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { checkUserSuspension, getSuspensionReasons, SuspensionInfo } from '../utils/checkUserSuspension';
import { SUPPORT_EMAIL } from '../constants/ContactEmails';
import { supabase } from '../utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { log, warn, error } from '../utils/productionLogger';


/**
 * Log out suspended user
 */
const logoutSuspendedUser = async () => {
  try {
    log('[SuspendedUserAlert] Logging out suspended user...');
    
    // Local-only sign out so this device exits cleanly without revoking unrelated app/device sessions.
    await supabase.auth.signOut({ scope: 'local' });
    
    // Clear local storage
    try {
      await AsyncStorage.clear();
      await SecureStore.deleteItemAsync('authEmail');
      await SecureStore.deleteItemAsync('authPassword');
    } catch (storageError) {
      warn('[SuspendedUserAlert] Error clearing storage:', storageError);
    }
    
    log('[SuspendedUserAlert] Suspended user logged out successfully');
  } catch (error) {
    error('[SuspendedUserAlert] Error logging out suspended user:', error);
  }
};

/**
 * Show suspension alert to user
 */
export const showSuspensionAlert = (suspensionInfo: SuspensionInfo) => {
  const reasons = getSuspensionReasons();
  const contactEmail = SUPPORT_EMAIL;

  const reasonsList = reasons.map((reason, index) => `• ${reason}`).join('\n');

  const handleContactSupport = async () => {
    try {
      // Encode the email body properly
      const subject = encodeURIComponent('Account Suspension Appeal');
      const body = encodeURIComponent(
        `Hello,\n\nI would like to appeal my account suspension.\n\nPlease review my account and let me know if you need any additional information.\n\nThank you.`
      );
      
      const mailtoUrl = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
      
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        // Fallback: show email address if mailto doesn't work
        Alert.alert(
          'Contact Support',
          `Please contact us at: ${contactEmail}\n\nSubject: Account Suspension Appeal`,
          [{ 
            text: 'OK',
            onPress: async () => {
              // Log out after showing email
              await logoutSuspendedUser();
            }
          }]
        );
        return; // Don't logout twice
      }
      
      // Log out after opening email (with small delay to ensure email opens)
      setTimeout(async () => {
        await logoutSuspendedUser();
      }, 500);
    } catch (error) {
      error('[SuspendedUserAlert] Error opening email:', error);
      // Fallback: show email address
      Alert.alert(
        'Contact Support',
        `Please contact us at: ${contactEmail}\n\nSubject: Account Suspension Appeal`,
        [{ 
          text: 'OK',
          onPress: async () => {
            // Log out after showing email
            await logoutSuspendedUser();
          }
        }]
      );
    }
  };

  Alert.alert(
    'Account Suspended',
    `Your account has been suspended. This may be due to one of the following reasons:\n\n${reasonsList}\n\nIf you believe this is a mistake, please contact our customer care team for assistance.`,
    [
      {
        text: 'Contact Support',
        onPress: handleContactSupport,
        style: 'default',
      },
      {
        text: 'OK',
        onPress: async () => {
          // Auto-logout when OK is clicked
          log('[SuspendedUserAlert] User dismissed suspension alert - logging out');
          await logoutSuspendedUser();
        },
        style: 'cancel',
      },
    ],
    { cancelable: false }
  );
};

/**
 * Check and show suspension alert if user is suspended
 */
export const checkAndShowSuspensionAlert = async (userId: string): Promise<boolean> => {
  try {
    const suspensionInfo = await checkUserSuspension(userId);
    
    if (suspensionInfo.isSuspended) {
      showSuspensionAlert(suspensionInfo);
      return true; // User is suspended
    }
    
    return false; // User is not suspended
  } catch (error) {
    error('[SuspendedUserAlert] Error checking suspension:', error);
    return false; // On error, assume not suspended to avoid blocking user
  }
};

