"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { MessageSquare, Video, Mic, Users, Shield, Wallet } from "lucide-react"

const features = [
  {
    icon: MessageSquare,
    title: "Media Chat",
    description: "Send photos, videos, and voice notes with 24-hour auto-delete for your privacy.",
    gradient: "from-blue-500 to-cyan-400",
  },
  {
    icon: Video,
    title: "Multi-Guest Livestream",
    description: "Go live and add up to 3 guests — flip cameras, send join requests, and interact instantly.",
    gradient: "from-primary to-purple-400",
  },
  {
    icon: Mic,
    title: "Voice & Video Calls",
    description: "Crystal-clear calls with low latency, connecting you anywhere in the world.",
    gradient: "from-pink-500 to-rose-400",
  },
  {
    icon: Users,
    title: "Communities & Events",
    description: "Create events, discover interests, and meet people naturally in themed communities.",
    gradient: "from-orange-500 to-amber-400",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description: "Location toggle, blocking, reporting, safe content features, and +18 streamer badge.",
    gradient: "from-accent to-teal-400",
  },
  {
    icon: Wallet,
    title: "Wallet & Payments",
    description: "Buy tokens, receive gifts, and withdraw in Naira. Coming soon!",
    gradient: "from-violet-500 to-purple-400",
    comingSoon: true,
  },
]

export function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section id="features" ref={ref} className="relative py-32 bg-[#fafafa] overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-50" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1a1a1a] mb-6 text-balance">
            Everything you need to connect.
          </h2>
          <p className="text-xl text-[#666] max-w-2xl mx-auto">
            Powerful features designed to bring people together, foster communities, and create meaningful connections.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className="group relative"
            >
              <div className="relative bg-white rounded-3xl p-8 h-full border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-500">
                {feature.comingSoon && (
                  <span className="absolute top-4 right-4 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                    Coming Soon
                  </span>
                )}

                {/* Icon */}
                <div
                  className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} p-4 mb-6 group-hover:scale-110 transition-transform duration-300`}
                >
                  <feature.icon className="w-full h-full text-white" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-[#1a1a1a] mb-3">{feature.title}</h3>
                <p className="text-[#666] leading-relaxed">{feature.description}</p>

                {/* Hover Gradient Line */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${feature.gradient} rounded-b-3xl transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left`}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
