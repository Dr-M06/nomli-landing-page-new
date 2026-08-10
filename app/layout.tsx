import type React from "react"
import type { Metadata } from "next"
import { Fraunces, Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { StructuredData } from "./structured-data"
import { SoothingPageLoader } from "@/components/soothing-page-loader"
import { getSiteUrl } from "@/lib/site"
import "./globals.css"

const siteUrl = getSiteUrl()
const defaultTitle = "Nomli Mingle — Social feed & chat in one app"
const defaultDescription =
  "Nomli Mingle brings your social feed and chat into one home. Free on iOS and Android — join your crew on Nomli."

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const displaySerif = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
})

export const metadata: Metadata = {
  title: {
    default: defaultTitle,
    template: "%s | Nomli Mingle",
  },
  description: defaultDescription,
  keywords: [
    "Nomli Mingle",
    "nomli",
    "social app",
    "social networking",
    "community app",
    "group chat",
    "meet new people",
    "online communities",
    "Android social app",
    "iOS social app",
  ],
  authors: [{ name: "Nomli Mingle", url: siteUrl }],
  creator: "Nomli Mingle",
  publisher: "Nomli Mingle",
  applicationName: "Nomli Mingle",
  category: "Social Networking",
  classification: "Social Media",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    title: defaultTitle,
    description: defaultDescription,
    siteName: "Nomli Mingle",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Nomli Mingle — social feed and chat in one app",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@nomlimingl20270",
    creator: "@nomlimingl20270",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/twitter-image.png"],
  },
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        sizes: "any",
      },
      {
        url: "/icon.png",
        sizes: "any",
        type: "image/png",
      },
      {
        url: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/favicon-48x48.png",
        sizes: "48x48",
        type: "image/png",
      },
      {
        url: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: "/favicon.ico",
  },
  manifest: "/manifest.json",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <meta name="theme-color" content="#FF6FAE" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={`${inter.variable} ${displaySerif.variable} font-sans antialiased overflow-x-hidden`}>
        <StructuredData />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg">
          Skip to main content
        </a>
        <SoothingPageLoader />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
