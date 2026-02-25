# Security & code protection

## What we do

- **Production builds** — Next.js minifies and bundles all client code. Inspecting the site shows minified JS, not readable source.
- **No source maps in production** — `productionBrowserSourceMaps: false` in `next.config.mjs` so browsers don’t get original source files, only the minified bundles.
- **Secrets stay server-side** — API keys (e.g. `RESEND_API_KEY`, `SENDGRID_API_KEY`) are used only in API routes and server code. They are never sent to the browser.

## Important rules

1. **Never put secrets in `NEXT_PUBLIC_*` env vars** — Anything with the `NEXT_PUBLIC_` prefix is embedded in client-side JavaScript and can be seen by anyone. Use it only for non-sensitive config (e.g. Firebase client config, public base URL).
2. **Sensitive logic in API routes** — Anything that must stay private (payments, admin actions, sending email, secret keys) should live in `app/api/` or other server-only code.
3. **Firebase** — Client config (apiKey, projectId, etc.) in `NEXT_PUBLIC_*` is normal for Firebase. Restrict your API key by domain in the [Firebase Console](https://console.firebase.google.com) so it can’t be abused from other sites.

## What we don’t do

- We don’t try to disable DevTools or right-click. Browsers don’t allow sites to block inspection reliably, and doing so hurts accessibility and annoys users without providing real protection.
