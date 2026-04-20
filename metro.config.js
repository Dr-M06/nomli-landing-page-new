// Learn more https://docs.expo.dev/guides/customizing-metro
// Keep this file fully local (not iCloud-only); Metro reads it synchronously and will fail with ETIMEDOUT otherwise.
const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Never resolve app imports into these trees (safety net). They are not part of the app runtime
// but can be huge; a mistaken `import` would bloat `:app:createBundleReleaseJsAndAssets`.
// Metro still only bundles what the graph reaches — this does not remove legitimate deps.
config.resolver.blockList = exclusionList([
  /[/\\]archive[/\\].*/,
  /[/\\]oldrepo_ref[/\\].*/,
  /[/\\]supabase[/\\]migrations[/\\].*/,
]);

module.exports = config;
