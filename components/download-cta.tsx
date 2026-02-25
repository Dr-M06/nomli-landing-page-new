"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { StoreButtons } from "@/components/store-buttons"

export function DownloadCta() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section
      id="download"
      ref={ref}
      className="relative py-24 sm:py-32 bg-white overflow-hidden"
    >
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-3">
            Get Nomli Mingle.
          </h2>
          <p className="text-lg text-[#666] mb-10">
            Download free on the App Store and Google Play.
          </p>
          <StoreButtons size="large" className="justify-center" />
        </motion.div>
      </div>
    </section>
  )
}
