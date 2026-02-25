import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { StructuredData } from "./structured-data"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: {
    default: "Nomli Mingle - Beyond Borders. Beyond Limits.",
    template: "%s | Nomli Mingle",
  },
  description:
    "Nomli Mingle — dating, livestreaming, chat, and communities in one app. Connect with people who share your interests. Available on Android and iOS.",
  keywords: [
    "social app",
    "livestream app",
    "video chat",
    "community app",
    "social networking",
    "video calls",
    "social media platform",
    "meet new people",
    "events discovery",
    "online communities",
    "livestreaming platform",
    "group chat",
    "voice calls",
    "android social app",
    "dating",
  ],
  authors: [{ name: "Nomli Mingle Team", url: "https://nomlimingle.com" }],
  creator: "Nomli Mingle",
  publisher: "Nomli Mingle",
  applicationName: "Nomli Mingle",
  category: "Social Networking",
  classification: "Social Media",
  metadataBase: new URL("https://nomlimingle.com"),
  alternates: {
    canonical: "https://nomlimingle.com",
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
  verification: {
    google: "your-google-verification-code", // Add your Google Search Console verification code
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://nomlimingle.com",
    title: "Nomli Mingle - Beyond Borders. Beyond Limits.",
    description:
      "Nomli Mingle — dating, livestreaming, chat, and communities. Connect with people who share your interests.",
    siteName: "Nomli Mingle",
    images: [
      {
        url: "https://nomlimingle.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Nomli Mingle - Social networking app for livestreaming, video calls, and community building",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@nomlimingle",
    creator: "@nomlimingle",
    title: "Nomli Mingle - Beyond Borders. Beyond Limits.",
    description:
      "Nomli Mingle — dating, livestreaming, chat, and communities. Connect with people who share your interests.",
    images: {
      url: "https://nomlimingle.com/twitter-image.png",
      alt: "Nomli Mingle - Social networking app for livestreaming, video calls, and community building",
    },
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
        <meta name="theme-color" content="#8b5cf6" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={`${inter.variable} font-sans antialiased overflow-x-hidden`}>
        <StructuredData />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg">
          Skip to main content
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
