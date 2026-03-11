"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Wallet, Gift, ArrowDownCircle, Coins } from "lucide-react"

export function WalletSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section ref={ref} className="relative py-32 bg-white overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1a1a1a] mb-6">
              Wallet & Tokens
            </h2>
            <p className="text-xl text-[#666] mb-8 leading-relaxed">
              Buy tokens in-app on Apple and Android. Send gifts, receive gifts, and manage your wallet — seamlessly integrated into your Nomli experience. In regions where in-app purchase isn&apos;t available, you can use our{" "}
              <a
                href="https://wallet.nomlimingle.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Web Wallet
              </a>
              .
            </p>

            {/* Wallet Features */}
            <div className="space-y-4">
              {[
                { icon: Coins, text: "Buy tokens in-app", desc: "iOS and Android in-app purchase" },
                { icon: Gift, text: "Send & receive gifts", desc: "Support your favorite creators" },
                { icon: ArrowDownCircle, text: "Withdraw when ready", desc: "Fast and secure options" },
              ].map((item, i) => (
                <motion.div
                  key={item.text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  className="flex items-center gap-4 p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#1a1a1a]">{item.text}</p>
                    <p className="text-sm text-[#666]">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right Visual - Wallet Card */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative flex justify-center"
          >
            {/* Wallet Card - Apple, Google, multi-currency */}
            <motion.div
              className="relative w-[340px] min-h-[220px] bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-3xl p-6 shadow-2xl"
              whileHover={{ rotateY: 5, rotateX: -5 }}
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Top: Logo + Apple & Google */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Wallet className="w-8 h-8 text-white" />
                  <span className="text-white font-bold text-lg">Nomli Wallet</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Apple icon */}
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                  </div>
                  {/* Google Play icon */}
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center p-1">
                    <svg viewBox="0 0 24 24" className="w-full h-full">
                      <path fill="#fff" d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35z" />
                      <path fill="#fff" fillOpacity="0.8" d="M16.81 15.12l-3.12-3.12 3.12-3.12 4.41 2.59c.68.4.68 1.28 0 1.68l-4.41 2.59z" />
                      <path fill="#fff" fillOpacity="0.6" d="M16.81 8.88V15.12l4.41-2.59c.68-.4.68-1.28 0-1.68l-4.41-2.59z" />
                      <path fill="#fff" d="M13.69 12l-9.85-9.85c-.5.24-.84.76-.84 1.35v17c0 .59.34 1.11.84 1.35L13.69 12z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Balance */}
              <div className="mb-5">
                <p className="text-white/70 text-xs uppercase tracking-wider mb-1">Balance</p>
                <p className="text-white text-3xl font-bold">Tokens</p>
              </div>

              {/* Currencies: NGN · USD · EUR */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-white/20 text-white text-xs font-medium">NGN</span>
                  <span className="px-2.5 py-1 rounded-md bg-white/20 text-white text-xs font-medium">USD</span>
                  <span className="px-2.5 py-1 rounded-md bg-white/20 text-white text-xs font-medium">EUR</span>
                </div>
                <span className="text-white/60 text-xs">In-app purchase</span>
              </div>

              {/* Shine Effect */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 rounded-3xl pointer-events-none" />
            </motion.div>

            {/* Floating Coins */}
            <motion.div
              className="absolute -top-4 -right-4"
              animate={{ y: [0, -10, 0], rotate: [0, 10, 0] }}
              transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-2xl shadow-lg">
                🪙
              </div>
            </motion.div>

            <motion.div
              className="absolute -bottom-4 -left-4"
              animate={{ y: [0, 10, 0], rotate: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, delay: 1 }}
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center text-xl shadow-lg">
                💎
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
