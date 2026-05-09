/** Canonical public site origin (no trailing slash). Override in prod with NEXT_PUBLIC_SITE_URL if needed. */
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://nomlimingle.com").replace(/\/$/, "")
}
