"use client"

import { motion } from "framer-motion"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { StoreButtons } from "@/components/store-buttons"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-28 pb-20 px-6">
        <div className="container mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              About Nomli Mingle
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-10">
              One app for dating, livestreaming, chat, and communities. Connect with people who share your interests — near you or across the world.
            </p>
            <p className="text-muted-foreground mb-12">
              Beyond borders. Beyond limits.
            </p>
            <StoreButtons className="justify-center" />
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
