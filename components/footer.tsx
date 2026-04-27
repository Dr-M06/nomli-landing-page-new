"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import Image from "next/image"
import { Instagram, Twitter, Loader2 } from "lucide-react"

const footerLinks = [
  { name: "About", href: "/about" },
  { name: "Support", href: "mailto:hello@nomli.cc" },
  { name: "Wallet", href: "https://wallet.nomlimingle.com", external: true },
  { name: "Privacy", href: "/privacy" },
  { name: "Terms", href: "/terms" },
]

const TIKTOK_LINK = "https://www.tiktok.com/@nomli_mingle?lang=en"
const X_LINK = "https://x.com/nomlimingl20270?s=11"

export function Footer() {
  const [isRedirecting, setIsRedirecting] = useState(false)

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
    <footer className="bg-white border-t border-gray-100 py-10 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <Link href="/" className="flex items-center gap-2 justify-center sm:justify-start mb-1">
              <div className="relative w-8 h-8 flex-shrink-0">
                <Image
                  src="/icon.png"
                  alt="Nomli Mingle"
                  fill
                  className="object-contain"
                  sizes="32px"
                  unoptimized
                />
              </div>
              <span className="font-bold text-[#1a1a1a]">Nomli Mingle</span>
            </Link>
            <p className="text-sm text-[#666]">Beyond Borders. Beyond Limits.</p>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
            {footerLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                {...(link.external && { target: "_blank", rel: "noopener noreferrer" })}
                className="text-sm text-[#666] hover:text-[#1a1a1a] transition-colors"
              >
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <motion.a
              href="https://www.instagram.com/nomli_minglehq/?hl=en"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-[#666] hover:bg-[#1a1a1a] hover:text-white transition-colors"
              aria-label="Instagram"
            >
              <Instagram className="w-4 h-4" />
            </motion.a>
            <motion.button
              onClick={handleTikTokClick}
              disabled={isRedirecting}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-[#666] hover:bg-[#1a1a1a] hover:text-white transition-colors disabled:opacity-50"
              aria-label="TikTok"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
              </svg>
            </motion.button>
            <motion.a
              href={X_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-[#666] hover:bg-[#1a1a1a] hover:text-white transition-colors"
              aria-label="X"
            >
              <Twitter className="w-4 h-4" />
            </motion.a>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-[#999]">© {new Date().getFullYear()} Nomli Mingle.</p>
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

    </footer>
  )
}
