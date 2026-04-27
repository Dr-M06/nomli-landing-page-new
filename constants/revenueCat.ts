import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const RC_PRODUCTS = {
  // Keep underscore ids as primary app defaults; purchase flow also supports dot aliases.
  datingMonthly: 'nomli_dating_pro_monthly',
  datingAnnual: 'nomli_dating_pro_annual',
  bundleMonthly: 'nomli_bundle_monthly',
  bundleAnnual: 'nomli_bundle_annual',
} as const;

/**
 * RevenueCat **public** SDK keys (safe in the client). Set via EAS or `.env`:
 * - EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
 * - EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
 *
 * `app.config.js` maps those into `extra` at build/config time. After changing `.env`,
 * restart Metro (e.g. `npx expo start --clear`) so the app picks up new values.
 *
 * Server-side: set `REVENUECAT_SECRET_API_KEY` on the Edge Function `sync-revenuecat-creator-pro`.
 */
export function getRevenueCatPublicApiKey(): string {
  let raw = '';
  if (Platform.OS === 'ios') {
    raw =
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ||
      (Constants.expoConfig?.extra as Record<string, string> | undefined)?.REVENUECAT_IOS_API_KEY ||
      '';
  } else if (Platform.OS === 'android') {
    raw =
      process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ||
      (Constants.expoConfig?.extra as Record<string, string> | undefined)?.REVENUECAT_ANDROID_API_KEY ||
      '';
  }
  return typeof raw === 'string' ? raw.trim() : '';
}

export function isRevenueCatEnabled(): boolean {
  return getRevenueCatPublicApiKey().length > 0;
}
