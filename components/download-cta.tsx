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
      className="relative py-14 sm:py-32 bg-white overflow-hidden"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto rounded-[1.6rem] sm:rounded-none border border-[#ece8ff] sm:border-none bg-[#fcfbff] sm:bg-transparent px-4 py-8 sm:p-0"
        >
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-3">
            Get Nomli Mingle.
          </h2>
          <p className="text-base sm:text-lg text-[#666] mb-7 sm:mb-10">
            Download free on the App Store and Google Play.
          </p>
          <StoreButtons size="large" className="justify-center" />
          <p className="text-sm text-[#888] mt-6">
            In-app purchases not available in your region?{" "}
            <a
              href="https://wallet.nomlimingle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Use our Web Wallet
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  )
}
