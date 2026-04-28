"use client"

import type React from "react"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Bell, Sparkles, Loader2 } from "lucide-react"

interface StoreButtonsProps {
  className?: string
  size?: "default" | "large"
}

export function StoreButtons({ className = "", size = "default" }: StoreButtonsProps) {
  const [showComingSoon, setShowComingSoon] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [isRedirectingIOS, setIsRedirectingIOS] = useState(false)

  const isLarge = size === "large"

  const handlePlayStoreClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsRedirecting(true)

    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en"

    // Show loading for 1.5s then redirect
    setTimeout(() => {
      const newWindow = window.open(playStoreUrl, "_blank", "noopener,noreferrer")
      
      // If popup was blocked, fallback to direct navigation
      if (!newWindow || newWindow.closed || typeof newWindow.closed === "undefined") {
        window.location.href = playStoreUrl
      }
      
      setIsRedirecting(false)
    }, 1500)
  }

  const handleAppStoreClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsRedirectingIOS(true)

    const appStoreUrl = "https://apps.apple.com/us/app/nomli-mingle/id6754324967"

    // Show loading for 1.5s then redirect
    setTimeout(() => {
      const newWindow = window.open(appStoreUrl, "_blank", "noopener,noreferrer")
      
      // If popup was blocked, fallback to direct navigation
      if (!newWindow || newWindow.closed || typeof newWindow.closed === "undefined") {
        window.location.href = appStoreUrl
      }
      
      setIsRedirectingIOS(false)
    }, 1500)
  }

  return (
    <>
      <div className={`flex flex-row gap-1.5 sm:gap-2 ${className}`}>
        {/* Google Play Button */}
        <motion.button
          onClick={handlePlayStoreClick}
          disabled={isRedirecting}
          className={`inline-flex items-center gap-1.5 bg-black hover:bg-black/90 text-white rounded-lg transition-all disabled:opacity-80 ${
            isLarge ? "min-w-0 flex-1 px-3 sm:px-3.5 py-2 sm:py-2.5" : "min-w-[146px] sm:min-w-[160px] px-3 sm:px-3.5 py-2 sm:py-2.5"
          }`}
          whileHover={{ scale: isRedirecting ? 1 : 1.02, y: isRedirecting ? 0 : -2 }}
          whileTap={{ scale: isRedirecting ? 1 : 0.98 }}
        >
          {/* Play Store Icon */}
          <svg viewBox="0 0 24 24" className={isLarge ? "w-4.5 h-4.5 sm:w-5 sm:h-5" : "w-4.5 h-4.5 sm:w-5.5 sm:h-5.5"}>
            <defs>
              <linearGradient id="playstore-blue" x1="60.55%" y1="4.95%" x2="20.77%" y2="71.87%">
                <stop offset="0%" stopColor="#00A0FF" />
                <stop offset="0.66%" stopColor="#00A1FF" />
                <stop offset="26.01%" stopColor="#00BEFF" />
                <stop offset="51.22%" stopColor="#00D2FF" />
                <stop offset="76.04%" stopColor="#00DFFF" />
                <stop offset="100%" stopColor="#00E3FF" />
              </linearGradient>
              <linearGradient id="playstore-green" x1="107.59%" y1="50%" x2="-130.43%" y2="50%">
                <stop offset="0%" stopColor="#FFE000" />
                <stop offset="40.87%" stopColor="#FFBD00" />
                <stop offset="77.54%" stopColor="#FFA500" />
                <stop offset="100%" stopColor="#FF9C00" />
              </linearGradient>
              <linearGradient id="playstore-red" x1="86.23%" y1="30.84%" x2="-50.14%" y2="136.07%">
                <stop offset="0%" stopColor="#FF3A44" />
                <stop offset="100%" stopColor="#C31162" />
              </linearGradient>
              <linearGradient id="playstore-yellow" x1="-18.81%" y1="-11.76%" x2="42.08%" y2="35.03%">
                <stop offset="0%" stopColor="#32A071" />
                <stop offset="6.85%" stopColor="#2DA771" />
                <stop offset="47.62%" stopColor="#15CF74" />
                <stop offset="80.09%" stopColor="#06E775" />
                <stop offset="100%" stopColor="#00F076" />
              </linearGradient>
            </defs>
            <path
              fill="url(#playstore-blue)"
              d="M1.75 1.32C1.3 1.67 1 2.24 1 2.96v18.08c0 .72.3 1.29.75 1.64l.04.03 10.13-10.13v-.24L1.79 1.29l-.04.03z"
            />
            <path
              fill="url(#playstore-green)"
              d="M15.3 15.68l-3.38-3.38v-.24l3.38-3.38.05.03 4.01 2.28c1.15.65 1.15 1.72 0 2.37l-4.01 2.28-.05.04z"
            />
            <path
              fill="url(#playstore-red)"
              d="M15.35 15.65L11.92 12.2 1.75 22.36c.38.4 1.01.45 1.73.03l11.87-6.74"
            />
            <path
              fill="url(#playstore-yellow)"
              d="M15.35 8.35L3.48 1.61C2.76 1.19 2.13 1.24 1.75 1.64L11.92 11.8l3.43-3.45z"
            />
          </svg>
          <div className="text-left">
            <span className={`block uppercase tracking-wide text-white/65 ${isLarge ? "text-[8px] sm:text-[9px]" : "text-[8px] sm:text-[9px]"}`}>
              GET IT ON
            </span>
            <span className={`whitespace-nowrap font-semibold leading-tight ${isLarge ? "text-[15px] sm:text-base" : "text-[14px] sm:text-[15px]"}`}>
              Google Play
            </span>
          </div>
        </motion.button>

        {/* App Store Button */}
        <motion.button
          onClick={handleAppStoreClick}
          disabled={isRedirectingIOS}
          className={`inline-flex items-center gap-1.5 bg-black hover:bg-black/90 text-white rounded-lg transition-all disabled:opacity-80 ${
            isLarge ? "min-w-0 flex-1 px-3 sm:px-3.5 py-2 sm:py-2.5" : "min-w-[146px] sm:min-w-[160px] px-3 sm:px-3.5 py-2 sm:py-2.5"
          }`}
          whileHover={{ scale: isRedirectingIOS ? 1 : 1.02, y: isRedirectingIOS ? 0 : -2 }}
          whileTap={{ scale: isRedirectingIOS ? 1 : 0.98 }}
        >
          {/* Apple Icon */}
          <svg viewBox="0 0 24 24" className={isLarge ? "w-4.5 h-4.5 sm:w-5 sm:h-5" : "w-4.5 h-4.5 sm:w-5.5 sm:h-5.5"} fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          <div className="text-left">
            <span className={`block uppercase tracking-wide text-white/65 ${isLarge ? "text-[8px] sm:text-[9px]" : "text-[8px] sm:text-[9px]"}`}>
              GET IT ON
            </span>
            <span className={`whitespace-nowrap font-semibold leading-tight ${isLarge ? "text-[15px] sm:text-base" : "text-[14px] sm:text-[15px]"}`}>
              App Store
            </span>
          </div>
        </motion.button>
      </div>

      {/* Loading Animation Overlay */}
      <AnimatePresence>
        {(isRedirecting || isRedirectingIOS) && (
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
                {isRedirectingIOS ? "Opening App Store" : "Opening Play Store"}
              </motion.p>
              <p className="text-white/50 text-sm">Get ready to mingle...</p>

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

      {/* Coming Soon Modal */}
      <AnimatePresence>
        {showComingSoon && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowComingSoon(false)}
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
                onClick={() => setShowComingSoon(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white/70" />
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
                  <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
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

                <h3 className="text-2xl font-bold text-white mb-3">Coming to iOS Soon!</h3>
                <p className="text-white/60 mb-8 leading-relaxed">
                  We&apos;re putting the finishing touches on the iOS version. It&apos;ll be worth the wait, we promise!
                </p>

                {/* CTA Button */}
                <motion.button
                  onClick={(e) => {
                    setShowComingSoon(false)
                    handlePlayStoreClick(e)
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Bell className="w-4 h-4" />
                  Get it on Android Now
                </motion.button>

                {/* Footer */}
                <p className="text-white/40 text-sm mt-6">Available now on Google Play</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
