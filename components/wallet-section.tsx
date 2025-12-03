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
            <span className="inline-block px-4 py-2 rounded-full bg-violet-100 text-violet-600 text-sm font-medium mb-6">
              SECTION 6 — NOMLI WALLET
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1a1a1a] mb-6">
              Wallet & Naira Payments
              <br />
              <span className="text-primary">Coming Soon</span>
            </h2>
            <p className="text-xl text-[#666] mb-8 leading-relaxed">
              Buy tokens, send gifts, receive gifts, and withdraw safely. Seamlessly integrated into your Nomli
              experience.
            </p>

            {/* Wallet Features */}
            <div className="space-y-4">
              {[
                { icon: Coins, text: "Buy tokens easily", desc: "Multiple payment options" },
                { icon: Gift, text: "Send & receive gifts", desc: "Support your favorite creators" },
                { icon: ArrowDownCircle, text: "Withdraw in Naira", desc: "Fast and secure withdrawals" },
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
            {/* Wallet Card */}
            <motion.div
              className="relative w-[320px] h-[200px] bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-3xl p-6 shadow-2xl"
              whileHover={{ rotateY: 5, rotateX: -5 }}
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Card Content */}
              <div className="flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-8 h-8 text-white" />
                    <span className="text-white font-bold text-lg">Nomli Wallet</span>
                  </div>
                  <span className="text-white/60 text-xs">NGN</span>
                </div>

                <div>
                  <p className="text-white/60 text-sm mb-1">Balance</p>
                  <p className="text-white text-3xl font-bold">₦ 250,000</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-white/80 text-sm">**** **** **** 4242</span>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-emerald-400 flex items-center justify-center text-lg font-bold text-white">
                    ₦
                  </div>
                </div>
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
