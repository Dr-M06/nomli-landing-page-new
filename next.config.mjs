/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Don't ship source maps in production — makes inspected code harder to follow
  productionBrowserSourceMaps: false,
}

export default nextConfig
