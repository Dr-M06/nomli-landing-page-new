"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useRef } from "react"
import { ChevronDown } from "lucide-react"
import { FloatingOrbs } from "@/components/floating-orbs"
import { PhoneMockup } from "@/components/phone-mockup"
import { StoreButtons } from "@/components/store-buttons"

export function HeroSection() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  })

  const y = useTransform(scrollYProgress, [0, 1], [0, 200])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])

  return (
    <section
      ref={ref}
      className="relative min-h-[88svh] sm:min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-background via-background to-[#0a0a1a]"
    >
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

      {/* Floating Orbs */}
      <FloatingOrbs />

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.02]" />

      <motion.div style={{ y, opacity }} className="container mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-12 sm:pb-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center">
          {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-left lg:text-left max-w-xl mx-auto lg:mx-0"
            >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="text-[2rem] sm:text-5xl lg:text-7xl font-bold leading-tight mb-5 sm:mb-6"
            >
              <span className="text-foreground">Nomli Mingle</span>
              <br />
              <span className="gradient-text">Beyond Borders.</span>
              <br />
              <span className="gradient-text">Beyond Limits.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="text-[15px] sm:text-xl text-muted-foreground max-w-lg mx-auto lg:mx-0 mb-7 sm:mb-10 leading-relaxed"
            >
              Never miss a moment. Date, livestream, chat, create — build real communities.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="flex justify-center lg:justify-start"
            >
              <StoreButtons />
            </motion.div>
          </motion.div>

          {/* Right Content - Phone Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 50, rotateY: -15 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            className="relative flex justify-center sm:mt-0 -mt-1"
          >
            <PhoneMockup />
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden sm:block"
      >
        <ChevronDown className="w-6 h-6 text-muted-foreground/60" />
      </motion.div>
    </section>
  )
}
