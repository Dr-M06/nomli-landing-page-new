"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Shield, Clock, Ban, MapPin, AlertTriangle, UserCheck } from "lucide-react"

const safetyFeatures = [
  { icon: Clock, title: "Restricted directmessage", description: "Premium allows you to chat with anyone you like." },
  { icon: Ban, title: "User blocking system", description: "Full control over who can contact you." },
  { icon: Shield, title: "Enforced compliance", description: "Industry-standard security measures." },
  { icon: MapPin, title: "Content moderation", description: "Advanced content filtering and moderation systems." },
  { icon: AlertTriangle, title: "Content controls", description: "Safe content features for all users." },
  { icon: UserCheck, title: "Account verification", description: "Verified profiles and age consent." },
]

export function SafetySection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section id="safety" ref={ref} className="relative py-32 bg-[#fafafa] overflow-hidden">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1a1a1a] mb-6">Your safety matters.</h2>
          <p className="text-xl text-[#666] max-w-2xl mx-auto">
            Built with privacy and security at its core. Your data, your control.
          </p>
        </motion.div>

        {/* Safety Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {safetyFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex items-start gap-4 p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                <feature.icon className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-[#1a1a1a] mb-1">{feature.title}</h3>
                <p className="text-sm text-[#666]">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Central Shield Visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="flex justify-center mt-16"
        >
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-accent to-teal-400 flex items-center justify-center">
              <Shield className="w-16 h-16 text-white" />
            </div>
            {/* Animated Ring */}
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-accent/30"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0, 1] }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
            />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
