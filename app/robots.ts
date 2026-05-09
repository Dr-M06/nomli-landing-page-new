import type { MetadataRoute } from "next"
import { getSiteUrl } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl()
  const host = base.replace(/^https:\/\//, "")

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/_next/", "/api/", "/admin", "/admin/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host,
  }
}
