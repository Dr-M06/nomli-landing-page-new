import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
// AdMob native module may not exist in Expo Go / unre-built dev clients.
// Load it defensively so the app never crashes.
let ads: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ads = require('react-native-google-mobile-ads');
} catch {
  ads = null;
}

let initialized = false;
function ensureInit() {
  if (initialized) return;
  initialized = true;
  try {
    ads?.default?.()?.initialize?.()?.catch?.(() => {});
  } catch {
    // ignore
  }
}

export default function PostScreenAd({
  isDark,
}: {
  isDark: boolean;
}) {
  if (!ads?.BannerAd || !ads?.TestIds) {
    // Running in an environment without the native AdMob module.
    return null;
  }

  const unitId = useMemo(() => {
    const extra: any = Constants.expoConfig?.extra || {};
    const ios = extra.ADMOB_UNIT_POST_SCREEN_IOS as string | undefined;
    const android = extra.ADMOB_UNIT_POST_SCREEN_ANDROID as string | undefined;
    const prod = (Constants.expoConfig as any)?.extra?.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
    const configured = Platform.OS === 'ios' ? ios : android;
    if (!configured) return ads.TestIds.BANNER;
    // Always use test ads in dev
    if (!prod) return ads.TestIds.BANNER;
    return configured;
  }, []);

  ensureInit();

  const BannerAd = ads.BannerAd as any;
  const BannerAdSize = ads.BannerAdSize as any;
  return (
    <View style={[styles.wrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignSelf: 'stretch',
  },
});

