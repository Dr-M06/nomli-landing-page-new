"use client"

import { motion } from "framer-motion"
import Image from "next/image"

export function PhoneMockup() {
  return (
    <div className="relative">
      {/* Glow Effect Behind Phone */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-3xl scale-110" />

      {/* Main Phone */}
      <motion.div className="relative z-10 animate-float" whileHover={{ scale: 1.02 }} transition={{ duration: 0.3 }}>
        <div className="relative w-[280px] sm:w-[320px] h-[560px] sm:h-[640px]">
          {/* Phone Frame */}
          <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900 rounded-[3rem] p-[3px]">
            <div className="w-full h-full bg-gray-950 rounded-[2.8rem] overflow-hidden relative">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-gray-950 rounded-b-2xl z-20" />

              {/* Screen Content */}
              <div className="w-full h-full bg-gradient-to-b from-background to-card p-4 pt-10">
                {/* Status Bar */}
                <div className="flex items-center justify-between px-2 mb-4">
                  <span className="text-xs text-muted-foreground">9:41</span>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-2 bg-muted-foreground rounded-sm" />
                    <div className="w-6 h-3 border border-muted-foreground rounded-sm relative">
                      <div className="absolute right-0.5 top-0.5 bottom-0.5 w-3 bg-accent rounded-sm" />
                    </div>
                  </div>
                </div>

                {/* Live Stream UI */}
                <div className="glass rounded-2xl p-3 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Multi Guest Viewers</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-accent flex items-center gap-1">
                          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          LIVE
                        </span>
                        <span className="text-xs text-muted-foreground">12K watching</span>
                      </div>
                    </div>
                  </div>

                  {/* Video Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="aspect-square bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl overflow-hidden">
                      <Image
                        src="/person-streaming-video-call.jpg"
                        alt="Streamer 1"
                        width={150}
                        height={150}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="aspect-square bg-gradient-to-br from-accent/20 to-primary/20 rounded-xl overflow-hidden">
                      <Image
                        src="/person-video-call-happy.jpg"
                        alt="Streamer 2"
                        width={150}
                        height={150}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="space-y-2">
                  <div className="glass rounded-xl p-2 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/30" />
                    <p className="text-xs text-muted-foreground">{"Amazing stream! 🔥"}</p>
                  </div>
                  <div className="glass rounded-xl p-2 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-accent/30" />
                    <p className="text-xs text-muted-foreground">{"Love this content!"}</p>
                  </div>
                </div>

                {/* Bottom Nav Hint */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="flex items-center justify-around glass rounded-2xl py-3">
                    {["Home", "Discover", "Live", "Chat", "Profile"].map((item, i) => (
                      <div
                        key={item}
                        className={`flex flex-col items-center gap-1 ${i === 2 ? "text-primary" : "text-muted-foreground"}`}
                      >
                        <div className={`w-5 h-5 rounded-full ${i === 2 ? "bg-primary" : "bg-muted"}`} />
                        <span className="text-[8px]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating UI Elements */}
      <motion.div
        className="absolute -top-4 -right-4 glass rounded-2xl p-3 z-20"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold">
            12
          </div>
          <span className="text-xs text-foreground font-medium">New followers</span>
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-20 -left-8 glass rounded-2xl p-3 z-20"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: 1 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">💜</span>
          <span className="text-xs text-foreground font-medium">2.4K gifts</span>
        </div>
      </motion.div>
    </div>
  )
}
