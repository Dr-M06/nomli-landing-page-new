"use client"

import Link from "next/link"
import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Coins, Gift, TrendingUp, Video } from "lucide-react"

const monetizationFeatures = [
  {
    icon: Gift,
    title: "Earn From Livestream Gifts",
    detail: "Every creator can receive gifts from viewers while live.",
  },
  {
    icon: Coins,
    title: "Earn From Your Content",
    detail: "Creator Pro unlocks monthly content earnings based on engagement.",
  },
  {
    icon: TrendingUp,
    title: "$1 Creator Welcome Package",
    detail: "Every creator starts with a $1 welcome package to kick off earnings.",
  },
]

export function CreatorMonetizationSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section id="creator-monetization" ref={ref} className="relative py-16 sm:py-24 bg-[#fbfbfd] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(6,182,212,0.08),transparent_30%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_80%,rgba(139,92,246,0.1),transparent_35%)]" />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.65 }}
            className="order-2 lg:order-1"
          >
            <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-[11px] sm:text-xs font-semibold tracking-wide text-violet-700 mb-5">
              Creator Monetization
            </span>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] leading-tight mb-4">
              Turn your content into real earnings.
            </h2>
            <p className="text-base sm:text-lg text-[#666] leading-relaxed mb-6">
              Nomli creator monetization combines two revenue streams: earnings from your content and earnings from
              livestream gifts, plus a $1 creator welcome package.
            </p>

            <div className="space-y-3 mb-7">
              {monetizationFeatures.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                  className="rounded-xl border border-[#ece8ff] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#f6f3ff] border border-violet-100 flex items-center justify-center shrink-0">
                      <feature.icon className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm sm:text-base font-semibold text-[#27253a]">{feature.title}</p>
                      <p className="text-xs sm:text-sm text-[#63607b] mt-0.5">{feature.detail}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <a
              href="#download"
              className="inline-flex items-center justify-center rounded-full bg-[#1a1a1a] px-6 py-3 text-sm sm:text-base font-semibold text-white hover:bg-[#101010] transition-colors"
            >
              Download the App
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.1 }}
            className="order-1 lg:order-2 lg:pl-2"
          >
            <div className="relative rounded-[1.75rem] border border-[#e5e7f5] bg-white p-3.5 sm:p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] max-w-[520px] lg:ml-auto">
              <div className="rounded-[1.2rem] bg-gradient-to-br from-[#181735] to-[#20395c] p-2.5 sm:p-3">
                <div className="w-full aspect-[16/17] rounded-[0.9rem] overflow-hidden">
                  <img
                    src="/happy%20model.jpeg"
                    alt="Happy content creator holding phone"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#27253a]">In-app creator campaign</p>
                  <p className="text-xs text-[#63607b] mt-1">Content + livestream earnings with $1 welcome package.</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#eef2ff] text-[#4f46e5]">
                    <Video className="w-3.5 h-3.5" />
                  </span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f3f0ff] text-[#7c3aed]">
                    <Gift className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
