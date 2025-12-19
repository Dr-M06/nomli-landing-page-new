"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import Image from "next/image"
import { Instagram, Twitter, Loader2, X as XIcon, Sparkles } from "lucide-react"

const footerLinks = [
  { name: "About", href: "/about" },
  { name: "Support", href: "mailto:hello@nomli.cc" },
  { name: "Privacy", href: "/privacy" },
  { name: "Terms", href: "/terms" },
  { name: "Contact", href: "mailto:hello@nomli.cc" },
]

const TIKTOK_LINK = "https://www.tiktok.com/@nomli_mingle?lang=en"

export function Footer() {
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [showXComingSoon, setShowXComingSoon] = useState(false)

  const handleTikTokClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsRedirecting(true)

    // Show loading for 1.5s then redirect
    setTimeout(() => {
      const newWindow = window.open(TIKTOK_LINK, "_blank", "noopener,noreferrer")
      
      // If popup was blocked, fallback to direct navigation
      if (!newWindow || newWindow.closed || typeof newWindow.closed === "undefined") {
        window.location.href = TIKTOK_LINK
      }
      
      setIsRedirecting(false)
    }, 1500)
  }

  return (
    <footer className="bg-white border-t border-gray-100 py-16">
      <div className="container mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
          {/* Logo & Tagline */}
          <div className="text-center lg:text-left">
            <Link href="/">
              <motion.div
                className="flex items-center gap-3 justify-center lg:justify-start mb-2"
                whileHover={{ scale: 1.02 }}
              >
                <div className="relative w-10 h-10 flex-shrink-0">
                  <Image
                    src="/icon.png"
                    alt="Nomli Mingle Logo"
                    fill
                    className="object-contain"
                    sizes="40px"
                    unoptimized
                  />
                </div>
                <span className="text-xl font-bold text-[#1a1a1a]">Nomli Mingle</span>
              </motion.div>
            </Link>
            <p className="text-[#666]">Beyond Borders. Beyond Limits.</p>
            <a href="mailto:hello@nomli.cc" className="text-sm text-primary hover:underline mt-1 inline-block">
              hello@nomli.cc
            </a>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-6">
            {footerLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-[#666] hover:text-[#1a1a1a] transition-colors text-sm font-medium"
              >
                {link.name}
              </Link>
            ))}
            <Link
              href="/influencer/auth"
              className="px-6 py-2 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold text-sm hover:shadow-lg hover:shadow-primary/30 transition-all"
            >
              Become an Influencer
            </Link>
          </nav>

          {/* Social Links */}
          <div className="flex items-center gap-4">
            <motion.a
              href="https://www.instagram.com/nomli_minglehq/?hl=en"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.1, y: -2 }}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-[#666] hover:bg-primary hover:text-white transition-colors"
              aria-label="Follow us on Instagram"
            >
              <Instagram className="w-5 h-5" />
            </motion.a>
            <motion.button
              onClick={handleTikTokClick}
              disabled={isRedirecting}
              whileHover={{ scale: isRedirecting ? 1 : 1.1, y: isRedirecting ? 0 : -2 }}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-[#666] hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
              aria-label="Follow us on TikTok"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
              </svg>
            </motion.button>
            <motion.button
              onClick={() => setShowXComingSoon(true)}
              whileHover={{ scale: 1.1, y: -2 }}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-[#666] hover:bg-primary hover:text-white transition-colors"
              aria-label="Follow us on X (Coming Soon)"
            >
              <Twitter className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 pt-8 border-t border-gray-100 text-center">
          <p className="text-sm text-[#999]">© {new Date().getFullYear()} Nomli Mingle. All rights reserved.</p>
        </div>
      </div>

      {/* Loading Animation Overlay */}
      <AnimatePresence>
        {isRedirecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative flex flex-col items-center"
            >
              {/* Animated rings */}
              <div className="relative w-24 h-24 mb-6">
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-primary/30"
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-accent/30"
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: 0.3 }}
                />
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              </div>

              {/* Text */}
              <motion.p
                className="text-white text-lg font-medium mb-2"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
              >
                Opening TikTok
              </motion.p>
              <p className="text-white/50 text-sm">Follow us on TikTok...</p>

              {/* Progress dots */}
              <div className="flex gap-2 mt-4">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.3, 1, 0.3],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Number.POSITIVE_INFINITY,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* X Coming Soon Modal */}
      <AnimatePresence>
        {showXComingSoon && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowXComingSoon(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-gradient-to-b from-[#1a1a2e] to-[#0f0f1a] rounded-3xl p-8 border border-white/10 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Background Effects */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/30 rounded-full blur-3xl" />
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent/30 rounded-full blur-3xl" />
              </div>

              {/* Close Button */}
              <button
                onClick={() => setShowXComingSoon(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <XIcon className="w-4 h-4 text-white/70" />
              </button>

              {/* Content */}
              <div className="relative text-center">
                {/* Animated Icon */}
                <motion.div
                  className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent mb-6"
                  animate={{
                    rotate: [0, 5, -5, 0],
                    scale: [1, 1.05, 1],
                  }}
                  transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
                >
                  <Twitter className="w-10 h-10 text-white" />
                </motion.div>

                {/* Sparkles */}
                <motion.div
                  className="absolute top-8 left-1/4"
                  animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                </motion.div>
                <motion.div
                  className="absolute top-12 right-1/4"
                  animate={{ scale: [1, 0.8, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: 0.5 }}
                >
                  <Sparkles className="w-3 h-3 text-accent" />
                </motion.div>

                <h3 className="text-2xl font-bold text-white mb-3">Coming to X Soon!</h3>
                <p className="text-white/60 mb-8 leading-relaxed">
                  We&apos;re setting up our X (formerly Twitter) presence. Follow us on other platforms in the meantime!
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col gap-3">
                  <motion.button
                    onClick={() => {
                      setShowXComingSoon(false)
                      handleTikTokClick({ preventDefault: () => {} } as React.MouseEvent)
                    }}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Follow us on TikTok
                  </motion.button>
                  <motion.button
                    onClick={() => setShowXComingSoon(false)}
                    className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Close
                  </motion.button>
                </div>

                {/* Footer */}
                <p className="text-white/40 text-sm mt-6">Stay tuned for updates!</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </footer>
  )
}
