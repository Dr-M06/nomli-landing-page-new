"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"

export function BrandStatement() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section
      ref={ref}
      className="relative py-40 bg-gradient-to-b from-background via-[#0a0a1a] to-background overflow-hidden"
    >
      {/* Background Elements */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-primary/20 blur-[100px]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-accent/20 blur-[80px]"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.4, 0.6, 0.4] }}
          transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, delay: 2 }}
        />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1 }}
          className="text-center"
        >

          <h2 className="text-5xl sm:text-6xl lg:text-8xl font-bold mb-8">
            <span className="gradient-text">Beyond Borders.</span>
            <br />
            <span className="gradient-text">Beyond Limits.</span>
          </h2>

          <p className="text-xl sm:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Connecting the world — one meaningful interaction at a time.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
