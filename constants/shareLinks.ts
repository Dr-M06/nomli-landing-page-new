/**
 * Public HTTPS URLs shared into other apps. Recipients see a link; rich previews
 * (image, title) require matching Open Graph meta tags on these pages.
 * Set EXPO_PUBLIC_SHARE_WEB_ORIGIN in `.env` (e.g. https://www.nomlimingle.com).
 *
 * Open in installed app (Universal Links / App Links): the hostname must match
 * `ios` associated domains, Android intent-filters in `app.config.js`, and (for bare)
 * `ios/NomliMingle/NomliMingle.entitlements` + `android/app/src/main/AndroidManifest.xml`.
 * Host the Apple and Google association files on this same host:
 *
 * - `https://<host>/.well-known/apple-app-site-association` (JSON, no file extension)
 *   Include paths like `/community/post/*` and `/video/*`, and appID `TEAMID.com.nomli.mingle2`.
 * - `https://<host>/.well-known/assetlinks.json` for package `com.nomli.mingle2` + release signing SHA-256.
 *
 * Replace TEAMID with your Apple Developer Team ID. See:
 * https://developer.apple.com/documentation/xcode/supporting-associated-domains
 * https://developer.android.com/training/app-links/verify-site-associations
 */
export const SHARE_WEB_ORIGIN = (
  process.env.EXPO_PUBLIC_SHARE_WEB_ORIGIN || 'https://www.nomlimingle.com'
).replace(/\/$/, '');

/** Web wallet — creator withdrawals (sign-in on site). Override for staging via `EXPO_PUBLIC_WALLET_WITHDRAWAL_URL`. */
export const WALLET_WITHDRAWAL_URL = (
  process.env.EXPO_PUBLIC_WALLET_WITHDRAWAL_URL || 'https://wallet.nomlimingle.com/withdrawal'
).trim();

/** App deep-link route for community post detail (avoids web 404 when opened outside app links). */
export function shareCommunityPostDeepLink(postId: string): string {
  return `nomlimingle://community/post/${encodeURIComponent(postId)}`;
}

export function shareCommunityPostUrl(postId: string): string {
  return `${SHARE_WEB_ORIGIN}/community/post/${encodeURIComponent(postId)}`;
}

export function shareVideoPostUrl(videoId: string): string {
  return `${SHARE_WEB_ORIGIN}/video/${encodeURIComponent(videoId)}`;
}
