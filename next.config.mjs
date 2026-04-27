/** @type {import('next').NextConfig} */
const nextConfig = {
  compiler: {
    // Strip console.* calls from client bundles in production builds.
    removeConsole: process.env.NODE_ENV === "production",
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
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
