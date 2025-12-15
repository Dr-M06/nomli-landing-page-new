"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import Image from "next/image"
import { Camera, Users, Heart, Zap } from "lucide-react"

export function LivestreamSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section ref={ref} className="relative py-32 bg-gradient-to-b from-white to-[#fafafa] overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              SECTION 4 — LIVESTREAM SPOTLIGHT
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1a1a1a] mb-6">
              Go Live.
              <br />
              <span className="gradient-text">Go Further.</span>
            </h2>
            <p className="text-xl text-[#666] mb-8 leading-relaxed">
              Multi-guest streams, smooth video, flip cameras, join requests — everything creators need to build their
              audience.
            </p>

            {/* Feature List */}
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Camera, text: "HD Video Quality" },
                { icon: Users, text: "Up to 3 Guests" },
                { icon: Heart, text: "Real-time Reactions" },
                { icon: Zap, text: "Low Latency" },
              ].map((item, i) => (
                <motion.div
                  key={item.text}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium text-[#1a1a1a]">{item.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right Visual */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            {/* Floating Hearts */}
            <div className="absolute -top-8 right-8 z-20">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute text-2xl"
                  style={{ right: i * 20, top: i * 15 }}
                  animate={{ y: [0, -30, 0], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, delay: i * 0.3, repeat: Number.POSITIVE_INFINITY }}
                >
                  ❤️
                </motion.div>
              ))}
            </div>

            {/* Main Visual */}
            <div className="relative bg-gradient-to-br from-primary/5 to-accent/5 rounded-3xl p-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="aspect-[3/4] bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl overflow-hidden">
                  <Image
                    src="/person-livestreaming-mobile-phone-creator.jpg"
                    alt="Livestream"
                    width={300}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="space-y-4">
                  <div className="aspect-square bg-gradient-to-br from-accent/20 to-primary/20 rounded-2xl overflow-hidden">
                    <Image
                      src="/person-video-call-guest-smiling.jpg"
                      alt="Guest 1"
                      width={200}
                      height={200}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="aspect-square bg-gradient-to-br from-purple-200 to-pink-200 rounded-2xl overflow-hidden">
                    <Image
                      src="/person-video-call-guest-waving.jpg"
                      alt="Guest 2"
                      width={200}
                      height={200}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Live Badge */}
              <motion.div
                className="absolute top-4 left-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
              >
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                LIVE
              </motion.div>

              {/* Viewer Count */}
              <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
                👀 12.4K watching
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
