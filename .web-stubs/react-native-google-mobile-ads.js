/**
 * Web / SSR stub — avoids bundling native codegen from react-native-google-mobile-ads.
 */
function NullBanner() {
  return null;
}

module.exports = {
  __esModule: true,
  default: () => ({
    initialize: () => Promise.resolve(),
  }),
  BannerAd: NullBanner,
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'adaptive' },
  TestIds: { BANNER: 'web-stub' },
};
