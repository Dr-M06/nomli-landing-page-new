"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import Image from "next/image"
import { StoreButtons } from "@/components/store-buttons"

export function DownloadCta() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section
      id="download"
      ref={ref}
      className="relative py-32 bg-gradient-to-b from-[#fafafa] to-white overflow-hidden"
    >
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left"
          >
            <span className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-accent/10 text-primary text-sm font-semibold mb-6">
              DOWNLOAD NOW
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1a1a1a] mb-6 text-balance">
              Experience the future of social connection.
            </h2>
            <p className="text-xl text-[#666] mb-8 leading-relaxed max-w-lg mx-auto lg:mx-0">
              Download Nomli Mingle today and start building meaningful connections with people who share your
              interests.
            </p>

            {/* Download Buttons */}
            <StoreButtons size="large" className="justify-center lg:justify-start" />
          </motion.div>

          {/* Right Visual - Phone with Real Screenshot */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative flex justify-center"
          >
            <motion.div className="relative" whileHover={{ y: -10 }} transition={{ duration: 0.3 }}>
              {/* Glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/40 to-accent/40 blur-3xl scale-110 rounded-full" />

              {/* Phone */}
              <div className="relative w-[280px] h-[570px] bg-gradient-to-b from-gray-600 via-gray-800 to-gray-900 rounded-[3rem] p-[3px] shadow-2xl">
                <div className="w-full h-full bg-black rounded-[2.8rem] overflow-hidden relative">
                  {/* Dynamic Island */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-8 bg-black rounded-full z-30 flex items-center justify-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-800" />
                    <div className="w-3 h-3 rounded-full bg-gray-800 ring-1 ring-gray-700" />
                  </div>
                  <Image src="/images/2.jpg" alt="Nomli Mingle Discover" fill className="object-cover" priority />
                </div>
              </div>

              {/* Floating Elements */}
              <motion.div
                animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
                transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY }}
                className="absolute -top-4 -right-8 w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl"
              >
                <span className="text-2xl">🎉</span>
              </motion.div>

              <motion.div
                animate={{ y: [0, 10, 0], rotate: [0, -5, 0] }}
                transition={{ duration: 3.5, repeat: Number.POSITIVE_INFINITY }}
                className="absolute bottom-20 -left-8 px-4 py-2 rounded-full bg-white shadow-xl border border-gray-100"
              >
                <span className="text-sm font-semibold text-primary">Join 10K+ users</span>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
