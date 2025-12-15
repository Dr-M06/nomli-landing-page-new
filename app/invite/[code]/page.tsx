"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { Download, CheckCircle2, Sparkles, ArrowRight } from "lucide-react"
import { normalizeReferralCode, isValidReferralCode } from "@/lib/referral-code"

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const [code, setCode] = useState<string | null>(null)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Wait for params to be available
    if (typeof window === 'undefined') {
      setIsLoading(false)
      return
    }
    
    if (!params || !params.code) {
      console.log("No params or code parameter found")
      setIsLoading(false)
      setIsValid(false)
      return
    }

    const codeParam = params.code as string | undefined
    if (!codeParam) {
      console.log("No code parameter found in URL")
      setIsLoading(false)
      setIsValid(false)
      return
    }

    // Decode URL-encoded referral code
    let referralCode: string
    try {
      referralCode = decodeURIComponent(codeParam)
    } catch (e) {
      referralCode = codeParam // Fallback to raw value if decode fails
    }

    if (!referralCode) {
      setIsLoading(false)
      setIsValid(false)
      return
    }

    console.log("Referral code from URL:", referralCode) // Debug log

    const normalized = normalizeReferralCode(referralCode)
    console.log("Normalized code:", normalized) // Debug log
    
    const valid = isValidReferralCode(normalized)
    console.log("Is valid:", valid) // Debug log
    
    setCode(normalized)
    setIsValid(valid)
    
    // Store referral code in localStorage for signup
    if (valid) {
      try {
        localStorage.setItem("nomli_referral_code", normalized)
        // Also store in sessionStorage for immediate use
        sessionStorage.setItem("nomli_referral_code", normalized)
        console.log("Referral code stored:", normalized)
      } catch (e) {
        console.error("Failed to store referral code:", e)
      }
    }
    
    setIsLoading(false)
  }, [params])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isValid || !code) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">⚠️</span>
          </div>
          <h1 className="text-3xl font-bold mb-4">Invalid Invite Link</h1>
          <p className="text-white/60 mb-8">
            This referral link is not valid. Please check the link and try again.
          </p>
          <Link href="/">
            <motion.button
              className="px-8 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              Go to Home
            </motion.button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[180px] animate-pulse" />
        <div className="absolute bottom-1/3 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse delay-700" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <div className="relative z-10 container mx-auto px-6 py-20">
        <div className="max-w-2xl mx-auto text-center">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="relative w-20 h-20 mx-auto mb-6">
              <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" />
            </div>
            <motion.div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-6"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
            >
              <Sparkles className="w-8 h-8 text-white" />
            </motion.div>
          </motion.div>

          {/* Success Message */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 border border-green-500/30 mb-6">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-green-400 font-medium">Referral Code Applied: {code}</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-4">
              Welcome to Nomli Mingle!
            </h1>
            <p className="text-xl text-white/70 mb-2">
              You've been invited to join our community
            </p>
            <p className="text-white/60">
              Download the app and start connecting with people around the world
            </p>
          </motion.div>

          {/* Benefits */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-12"
          >
            <div className="grid md:grid-cols-2 gap-4 text-left">
              {[
                "Livestream & Earn",
                "Video Calls & Chat",
                "Discover Events",
                "Build Communities",
              ].map((benefit, index) => (
                <motion.div
                  key={benefit}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10"
                >
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-white/80">{benefit}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-8"
          >
            <motion.a
              href="https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold text-lg shadow-lg shadow-primary/30"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <Download className="w-5 h-5" />
              Download for Android
              <ArrowRight className="w-5 h-5" />
            </motion.a>
            <Link href="/">
              <motion.button
                className="px-8 py-4 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                Learn More
              </motion.button>
            </Link>
          </motion.div>

          {/* Info Box */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-left"
          >
            <h3 className="font-semibold text-white mb-2">What happens next?</h3>
            <ol className="space-y-2 text-white/60 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">1.</span>
                <span>Download and install the Nomli Mingle app</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">2.</span>
                <span>Create your account (your referral code is already saved)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">3.</span>
                <span>Complete your profile: add photo, bio, post a story, and join a community</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">4.</span>
                <span>Once active, your referrer will be rewarded!</span>
              </li>
            </ol>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

