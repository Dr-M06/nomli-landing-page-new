"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"

type Phase = "in" | "out" | "gone"

const MIN_VISIBLE_MS = 720
const FADE_OUT_MS = 850

/** Full-page load overlay — Nomli flamingo + real window `load` timing. */
export function SoothingPageLoader() {
  const [phase, setPhase] = useState<Phase>("in")

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion) {
      setPhase("gone")
      return
    }

    let cancelled = false
    const started = performance.now()

    const scheduleExit = () => {
      if (cancelled) return
      const elapsed = performance.now() - started
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed)
      window.setTimeout(() => {
        if (!cancelled) setPhase("out")
      }, remaining)
    }

    if (document.readyState === "complete") {
      requestAnimationFrame(() => requestAnimationFrame(scheduleExit))
    } else {
      window.addEventListener("load", scheduleExit, { once: true })
    }

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (phase !== "out") return
    const id = window.setTimeout(() => setPhase("gone"), FADE_OUT_MS)
    return () => clearTimeout(id)
  }, [phase])

  if (phase === "gone") return null

  return (
    <motion.div
      aria-hidden
      animate={{ opacity: phase === "out" ? 0 : 1 }}
      transition={{ duration: FADE_OUT_MS / 1000, ease: "easeOut" }}
      className={`fixed inset-0 z-[9998] flex flex-col items-center justify-center overflow-hidden bg-[#0a0a12] ${
        phase === "out" ? "pointer-events-none" : ""
      }`}
    >
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/4 left-1/4 h-[min(500px,90vw)] w-[min(500px,90vw)] rounded-full blur-[120px]"
          style={{ backgroundColor: "rgba(255, 111, 174, 0.18)" }}
          animate={{
            scale: [1, 1.2, 1],
            x: [0, 50, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-1/4 bottom-1/4 h-[min(400px,80vw)] w-[min(400px,80vw)] rounded-full blur-[100px]"
          style={{ backgroundColor: "rgba(226, 85, 149, 0.16)" }}
          animate={{
            scale: [1.2, 1, 1.2],
            x: [0, -40, 0],
            y: [0, 40, 0],
          }}
          transition={{ duration: 3.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center px-6"
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <motion.div
          className="mb-6 select-none text-7xl sm:text-8xl"
          animate={{
            rotate: [-4, 4, -4],
            y: [0, -8, 0],
          }}
          transition={{
            duration: 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        >
          🦩
        </motion.div>

        <motion.h1
          className="mb-2 text-2xl font-bold text-white"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Nomli Mingle
        </motion.h1>

        <motion.p
          className="mb-8 text-sm text-white/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          Beyond Borders. Beyond Limits.
        </motion.p>

        <div className="relative h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-[#FF6FAE] via-[#FF8FBE] to-[#E25595]"
            animate={{ x: ["-100%", "280%"] }}
            transition={{ duration: 1.35, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          />
        </div>

        <motion.div
          className="mt-4 flex items-center gap-2 text-xs text-white/40"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
        >
          <span>Loading</span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: i * 0.2 }}
              >
                .
              </motion.span>
            ))}
          </span>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
