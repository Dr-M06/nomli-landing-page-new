"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Video, MessageSquare, Users, Heart, Shield } from "lucide-react"

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
    icon: Users,
    title: "Communities",
    description: "Events, interests, and meetups. Find your people.",
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
    <section id="features" ref={ref} className="relative py-24 sm:py-32 bg-[#fafafa] overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-3">
            Everything you need.
          </h2>
          <p className="text-lg text-[#666] max-w-md mx-auto">
            Connect, create, and build communities.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="bg-white rounded-2xl p-6 border border-gray-100"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-primary" />
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
