"use client"

import { useCallback, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2 } from "lucide-react"

export const STORE_REDIRECT_DELAY_MS = 1500

export type StoreRedirectKind = "play" | "ios" | null

export function useDelayedStoreRedirect() {
  const [redirecting, setRedirecting] = useState<StoreRedirectKind>(null)

  const openAfterDelay = useCallback((url: string, kind: Exclude<StoreRedirectKind, null>) => {
    setRedirecting(kind)
    window.setTimeout(() => {
      const newWindow = window.open(url, "_blank", "noopener,noreferrer")
      if (!newWindow || newWindow.closed || typeof newWindow.closed === "undefined") {
        window.location.href = url
      }
      setRedirecting(null)
    }, STORE_REDIRECT_DELAY_MS)
  }, [])

  return { redirecting, openAfterDelay }
}

export function StoreRedirectOverlay({ redirecting }: { redirecting: StoreRedirectKind }) {
  const open = redirecting !== null
  const isIOS = redirecting === "ios"

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          aria-live="polite"
          aria-busy="true"
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.88, opacity: 0 }}
            className="relative flex flex-col items-center"
          >
            <div className="relative mb-6 h-24 w-24">
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-[#FF6FAE]/35"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
              />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-[#E25595]/35"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: 0.3 }}
              />
              <div className="absolute inset-2 flex items-center justify-center rounded-full bg-gradient-to-br from-[#FF6FAE] to-[#E25595]">
                <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
              </div>
            </div>

            <motion.p
              className="mb-2 text-lg font-medium text-white"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
            >
              {isIOS ? "Opening App Store" : "Opening Play Store"}
            </motion.p>
            <p className="text-sm text-white/50">Get ready to mingle...</p>

            <div className="mt-4 flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-2 w-2 rounded-full bg-[#FF6FAE]"
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
      ) : null}
    </AnimatePresence>
  )
}
