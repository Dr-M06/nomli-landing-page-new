"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Music2 } from "lucide-react"

export default function AdminDashboard() {
  const { scrollYProgress } = useScroll()
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <motion.div
        className="fixed top-0 left-0 h-1 bg-gradient-to-r from-accent via-primary to-accent z-50"
        style={{ width: progressWidth }}
      />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[180px] animate-pulse" />
        <div className="absolute bottom-1/3 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse delay-700" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <motion.div
                className="flex items-center gap-2 sm:gap-3 text-white/70 hover:text-white transition-colors"
                whileHover={{ x: -4 }}
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="font-medium text-sm sm:text-base">Back to Home</span>
              </motion.div>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative w-6 h-6 sm:w-8 sm:h-8">
                <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" />
              </div>
              <span className="text-xs sm:text-sm text-white/50 font-medium hidden sm:inline">Admin Dashboard</span>
            </div>
          </div>
        </div>
      </header>

      <section className="relative pt-12 sm:pt-20 pb-8 sm:pb-12">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">Admin Dashboard</h1>
            <p className="text-white/60 mb-8">
              Legacy referral, influencer, and payment panels have been removed.
            </p>

            <Link href="/admin/music">
              <motion.div
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 border border-primary/30">
                    <Music2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg sm:text-xl font-semibold">Music Admin</p>
                    <p className="text-sm text-white/60 mt-1">Upload tracks, manage catalog, and review songs.</p>
                  </div>
                </div>
              </motion.div>
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

