/**
 * Comprehensive Push Notification Diagnostic Tool
 * Run this to check why notifications aren't being received
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


// Check execution environment
let executionEnvironment: string = 'unknown';
try {
  const Constants = require('expo-constants');
  executionEnvironment = Constants.executionEnvironment || 'unknown';
} catch {
  // Constants not available, assume standalone
  executionEnvironment = 'standalone';
}

interface DiagnosticResult {
  check: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  fix?: string;
}

export async function diagnosePushNotifications(userId?: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // Check 1: Device Type
  if (!Device.isDevice) {
    results.push({
      check: 'Device Type',
      status: 'fail',
      message: 'Running on simulator/emulator - push notifications require a physical device',
      fix: 'Test on a physical device (iPhone or Android phone)',
    });
  } else {
    results.push({
      check: 'Device Type',
      status: 'pass',
      message: 'Running on physical device ✅',
    });
  }

  // Check 2: EAS Build vs Expo Go
  const isEASBuild = executionEnvironment === 'standalone' || 
                     executionEnvironment === 'storeClient';
  const isExpoGo = executionEnvironment === 'bare';
  
  if (isExpoGo) {
    results.push({
      check: 'Build Type',
      status: 'fail',
      message: 'Running in Expo Go - background notifications DO NOT work in Expo Go',
      fix: 'Build with EAS: npx eas build --platform ios --profile preview',
    });
  } else if (isEASBuild) {
    results.push({
      check: 'Build Type',
      status: 'pass',
      message: 'Running EAS build ✅',
    });
  } else {
    results.push({
      check: 'Build Type',
      status: 'warning',
      message: 'Unknown build type - may be development build',
      fix: 'Ensure you built with EAS, not Expo Go',
    });
  }

  // Check 3: Notification Permissions
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
      results.push({
        check: 'Notification Permissions',
        status: 'pass',
        message: 'Permissions granted ✅',
      });
    } else {
      results.push({
        check: 'Notification Permissions',
        status: 'fail',
        message: `Permissions not granted: ${status}`,
        fix: 'Go to device Settings → Nomli Mingle → Notifications → Enable',
      });
    }
  } catch (error) {
    results.push({
      check: 'Notification Permissions',
      status: 'fail',
      message: `Error checking permissions: ${error}`,
    });
  }

  // Check 4: Push Token
  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'd6e68a27-db0b-43e0-ba6d-b37a1608de5c',
    });

    if (token?.data) {
      const isValidFormat = token.data.startsWith('ExponentPushToken[') || 
                           token.data.startsWith('ExpoPushToken[');
      
      if (isValidFormat) {
        results.push({
          check: 'Push Token',
          status: 'pass',
          message: `Token obtained: ${token.data.substring(0, 30)}... ✅`,
        });
      } else {
        results.push({
          check: 'Push Token',
          status: 'fail',
          message: `Invalid token format: ${token.data.substring(0, 30)}...`,
          fix: 'Re-initialize notifications in app',
        });
      }
    } else {
      results.push({
        check: 'Push Token',
        status: 'fail',
        message: 'No token received from Expo',
        fix: 'Check EAS project ID and network connection',
      });
    }
  } catch (error: any) {
    results.push({
      check: 'Push Token',
      status: 'fail',
      message: `Error getting token: ${error?.message || error}`,
      fix: 'Check EAS project ID and network connection',
    });
  }

  // Check 5: Token in Database
  if (userId) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('expo_push_token, push_token_updated_at')
        .eq('id', userId)
        .single();

      if (error) {
        results.push({
          check: 'Token in Database',
          status: 'fail',
          message: `Error fetching profile: ${error.message}`,
        });
      } else if (profile?.expo_push_token) {
        const isValidFormat = profile.expo_push_token.startsWith('ExponentPushToken[') || 
                             profile.expo_push_token.startsWith('ExpoPushToken[');
        
        if (isValidFormat) {
          const updatedAt = profile.push_token_updated_at 
            ? new Date(profile.push_token_updated_at)
            : null;
          const age = updatedAt 
            ? Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          if (age !== null && age < 30) {
            results.push({
              check: 'Token in Database',
              status: 'pass',
              message: `Token exists and is recent (${age} days old) ✅`,
            });
          } else if (age !== null) {
            results.push({
              check: 'Token in Database',
              status: 'warning',
              message: `Token exists but is old (${age} days old)`,
              fix: 'Re-initialize notifications to refresh token',
            });
          } else {
            results.push({
              check: 'Token in Database',
              status: 'pass',
              message: 'Token exists in database ✅',
            });
          }
        } else {
          results.push({
            check: 'Token in Database',
            status: 'fail',
            message: 'Token exists but has invalid format',
            fix: 'Re-initialize notifications',
          });
        }
      } else {
        results.push({
          check: 'Token in Database',
          status: 'fail',
          message: 'No push token found in database',
          fix: 'Re-initialize notifications in app',
        });
      }
    } catch (error: any) {
      results.push({
        check: 'Token in Database',
        status: 'fail',
        message: `Error checking database: ${error?.message || error}`,
      });
    }
  }

  // Check 6: Notification Channels (Android)
  if (Platform.OS === 'android') {
    try {
      const channels = await Notifications.getNotificationChannelsAsync();
      if (channels && channels.length > 0) {
        results.push({
          check: 'Notification Channels',
          status: 'pass',
          message: `${channels.length} channels configured ✅`,
        });
      } else {
        results.push({
          check: 'Notification Channels',
          status: 'warning',
          message: 'No notification channels configured',
          fix: 'Channels should be set up automatically on app start',
        });
      }
    } catch (error) {
      results.push({
        check: 'Notification Channels',
        status: 'warning',
        message: `Error checking channels: ${error}`,
      });
    }
  }

  // Check 7: EAS Project ID
  const projectId = 'd6e68a27-db0b-43e0-ba6d-b37a1608de5c';
  results.push({
    check: 'EAS Project ID',
    status: 'pass',
    message: `Configured: ${projectId} ✅`,
  });

  // Check 8: iOS APNs (if iOS)
  if (Platform.OS === 'ios') {
    // Check if GoogleService-Info.plist exists (we can't check this programmatically, but we can warn)
    results.push({
      check: 'iOS APNs Config',
      status: 'warning',
      message: 'Verify GoogleService-Info.plist exists in ios/NomliMingle/',
      fix: 'Download from Firebase Console and add to Xcode project',
    });
  }

  return results;
}

/**
 * Print diagnostic results to console
 */
export async function printDiagnostics(userId?: string): Promise<void> {
  log('\n🔍 Push Notification Diagnostics\n');
  log('='.repeat(50));
  
  const results = await diagnosePushNotifications(userId);
  
  results.forEach((result, index) => {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    log(`\n${index + 1}. ${icon} ${result.check}`);
    log(`   ${result.message}`);
    if (result.fix) {
      log(`   💡 Fix: ${result.fix}`);
    }
  });
  
  log('\n' + '='.repeat(50));
  
  const failures = results.filter(r => r.status === 'fail');
  const warnings = results.filter(r => r.status === 'warning');
  
  if (failures.length === 0 && warnings.length === 0) {
    log('\n✅ All checks passed! Notifications should work.');
    log('If notifications still don\'t work:');
    log('1. Put app in BACKGROUND before testing');
    log('2. Check Edge Function logs for processing');
    log('3. Verify notification appears in system tray');
  } else {
    log(`\n❌ Found ${failures.length} critical issues and ${warnings.length} warnings`);
    log('Fix the critical issues (❌) first, then test again.');
  }
}

