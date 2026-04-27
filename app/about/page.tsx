"use client"

import { motion } from "framer-motion"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { StoreButtons } from "@/components/store-buttons"
import { Globe2, Radio, Users2, ShieldCheck } from "lucide-react"

const pillars = [
  {
    icon: Globe2,
    title: "Global discovery",
    detail: "Meet people near you or around the world through interests, communities, and shared vibes.",
  },
  {
    icon: Radio,
    title: "Live and interactive",
    detail: "Go live, host guests, receive gifts, and build real-time moments with your audience.",
  },
  {
    icon: Users2,
    title: "Real communities",
    detail: "Create content, join conversations, and grow meaningful social circles beyond one-off chats.",
  },
  {
    icon: ShieldCheck,
    title: "Safety and control",
    detail: "Use reporting, privacy settings, and moderation tools to keep your experience comfortable.",
  },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main id="main-content" className="flex-1 pt-28 pb-16 sm:pb-20 px-4 sm:px-6">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid lg:grid-cols-2 gap-10 sm:gap-14 items-start"
          >
            <div className="text-left">
              <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-[11px] sm:text-xs font-semibold tracking-wide text-violet-700 mb-5">
                About Nomli Mingle
              </span>
              <h1 className="text-3xl sm:text-5xl font-bold text-foreground leading-tight mb-5">
                Social connection without limits.
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-5">
                Nomli Mingle brings dating, livestreaming, chat, music, and communities into one experience built for
                modern creators and everyday users.
              </p>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-8">
                Whether you want to discover people, share your moments, or grow an audience, Nomli helps you connect
                in real and meaningful ways.
              </p>

              <div className="rounded-2xl border border-[#ece8ff] bg-[#faf9ff] p-5 mb-8">
                <p className="text-sm sm:text-base font-semibold text-[#27253a] mb-2">Our mission</p>
                <p className="text-sm sm:text-base text-[#5d5a73] leading-relaxed">
                  Build a global social platform where people can meet, create, and earn — safely, authentically, and
                  beyond borders.
                </p>
              </div>

              <StoreButtons className="justify-start" />
            </div>

            <div className="space-y-3 sm:space-y-4">
              {pillars.map((pillar, index) => (
                <motion.div
                  key={pillar.title}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.08 * index }}
                  className="rounded-2xl border border-[#ece8ff] bg-white p-4 sm:p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#f6f3ff] border border-violet-100 flex items-center justify-center shrink-0">
                      <pillar.icon className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-semibold text-[#24223a]">{pillar.title}</h2>
                      <p className="text-sm text-[#5d5a73] mt-1 leading-relaxed">{pillar.detail}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
