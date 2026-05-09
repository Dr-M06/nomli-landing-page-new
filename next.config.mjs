/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Client-side auth reads these from process.env. Map common non-prefixed names
   * so `.env` entries like SUPABASE_URL still work (anon key is safe to expose).
   * Restart `next dev` after changing env files.
   */
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.EXPO_PUBLIC_SUPABASE_URL ||
      "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  },
  compiler: {
    // Strip console.* calls from client bundles in production builds.
    removeConsole: process.env.NODE_ENV === "production",
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Don't ship source maps in production — makes inspected code harder to follow
  productionBrowserSourceMaps: false,
  /**
   * Universal Links / App Links: Apple and Google expect `application/json` for these URLs.
   * Replace placeholders in `public/.well-known/*` (Team ID + Android cert SHA-256), then deploy.
   */
  async redirects() {
    return [
      { source: "/social", destination: "/", permanent: true },
      { source: "/social/:path*", destination: "/", permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/app-ads.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
}

export default nextConfig
