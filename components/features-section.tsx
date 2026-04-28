"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Video, MessageSquare, Music, Heart, Shield } from "lucide-react"

const features = [
  {
    icon: Heart,
    title: "Dating",
    description: "Match and meet people who share your interests. Nearby or worldwide.",
  },
  {
    icon: Video,
    title: "Livestream",
    description: "Go live with up to 3 guests. Real-time reactions, low latency.",
  },
  {
    icon: MessageSquare,
    title: "Chat & calls",
    description: "Rich messaging, voice and video calls. Media that auto-expires.",
  },
  {
    icon: Music,
    title: "Creators & Music",
    description: "Discover creators, stream music, and connect with people who match your vibe.",
  },
  {
    icon: Shield,
    title: "Privacy first",
    description: "Your data, your control. Block, report, stay safe.",
  },
]

export function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section id="features" ref={ref} className="relative py-14 sm:py-32 bg-[#fafafa] overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-10 sm:mb-16"
        >
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-3">
            Everything you need.
          </h2>
          <p className="text-base sm:text-lg text-[#666] max-w-md mx-auto">
            Connect, create, and build communities.
          </p>
        </motion.div>

        <div className="sm:hidden -mx-4 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-3 snap-x snap-mandatory pb-1">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="snap-start min-w-[82%] bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-[#1a1a1a] mb-1">{feature.title}</h3>
                <p className="text-sm text-[#666] leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-100"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 sm:mb-4">
                <feature.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-[#1a1a1a] mb-1">{feature.title}</h3>
              <p className="text-sm text-[#666] leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
