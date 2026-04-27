"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth"
import { getAuthInstance } from "@/lib/firebase/config"

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [actionCode, setActionCode] = useState<string | null>(null)

  useEffect(() => {
    // Get the action code from URL parameters
    const code = searchParams.get("oobCode")
    const mode = searchParams.get("mode")

    if (!code || mode !== "resetPassword") {
      setError("Invalid or missing reset link. Please request a new password reset.")
      setIsVerifying(false)
      return
    }

    setActionCode(code)

    // Verify the reset code is valid
    const auth = getAuthInstance()
    if (auth) {
      verifyPasswordResetCode(auth, code)
        .then((email) => {
          setIsVerifying(false)
        })
        .catch((error: any) => {
          console.error("Reset code verification error:", error)
          if (error.code === "auth/expired-action-code") {
            setError("This password reset link has expired. Please request a new one.")
          } else if (error.code === "auth/invalid-action-code") {
            setError("This password reset link is invalid. Please request a new one.")
          } else {
            setError("Failed to verify reset link. Please request a new password reset.")
          }
          setIsVerifying(false)
        })
    } else {
      setError("Firebase not initialized. Please check your configuration.")
      setIsVerifying(false)
    }
  }, [searchParams])

  const validatePassword = (): string => {
    if (!password.trim()) {
      return "Password is required"
    }
    if (password.length < 6) {
      return "Password must be at least 6 characters"
    }
    if (password !== confirmPassword) {
      return "Passwords do not match"
    }
    return ""
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const validationError = validatePassword()
    if (validationError) {
      setError(validationError)
      return
    }

    const auth = getAuthInstance()
    if (!actionCode || !auth) {
      setError("Invalid reset link. Please request a new password reset.")
      return
    }

    setIsLoading(true)

    try {
      await confirmPasswordReset(auth, actionCode, password)
      setSuccess(true)
      // Redirect home after 3 seconds (influencer login retired)
      setTimeout(() => {
        router.push("/")
      }, 3000)
    } catch (error: any) {
      console.error("Password reset error:", error)
      if (error.code === "auth/expired-action-code") {
        setError("This password reset link has expired. Please request a new one.")
      } else if (error.code === "auth/invalid-action-code") {
        setError("This password reset link is invalid. Please request a new one.")
      } else {
        setError(error.message || "Failed to reset password. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="relative pt-20 pb-12 min-h-[calc(100vh-80px)] flex items-center">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto"
          >
            <div className="p-8 lg:p-12 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <div className="text-center mb-8">
                <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">Reset Password</h1>
                <p className="text-white/60">
                  {isVerifying
                    ? "Verifying reset link..."
                    : success
                    ? "Password reset successful!"
                    : "Enter your new password below"}
                </p>
              </div>

              {isVerifying ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white/60">Verifying reset link...</p>
                </div>
              ) : success ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12"
                >
                  <motion.div
                    className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-6"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.5 }}
                  >
                    <CheckCircle2 className="w-10 h-10 text-white" />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-white mb-2">Password Reset Successful!</h3>
                  <p className="text-white/60 mb-6">
                    Your password has been reset. Redirecting to login page...
                  </p>
                  <Link href="/">
                    <motion.button
                      className="px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Go Home
                    </motion.button>
                  </Link>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-white/80 mb-2">
                      New Password <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                      <input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="w-full pl-12 pr-12 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-white/50">Password must be at least 6 characters</p>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/80 mb-2">
                      Confirm New Password <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        id="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        className="w-full pl-12 pr-12 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
                    >
                      {error}
                    </motion.div>
                  )}

                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    className="w-full px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: isLoading ? 1 : 1.02 }}
                    whileTap={{ scale: isLoading ? 1 : 0.98 }}
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Resetting Password...
                      </span>
                    ) : (
                      "Reset Password"
                    )}
                  </motion.button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </section>
  )
}

export default function ResetPasswordPage() {
  const { scrollYProgress } = useScroll()
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 h-1 bg-gradient-to-r from-accent via-primary to-accent z-50"
        style={{ width: progressWidth }}
      />

      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[180px] animate-pulse" />
        <div className="absolute bottom-1/3 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse delay-700" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <motion.div
                className="flex items-center gap-3 text-white/70 hover:text-white transition-colors"
                whileHover={{ x: -4 }}
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Back to Home</span>
              </motion.div>
            </Link>
            <div className="flex items-center gap-3">
              <div className="relative w-8 h-8">
                <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" />
              </div>
              <span className="text-sm text-white/50 font-medium">Nomli Mingle</span>
            </div>
          </div>
        </div>
      </header>

      {/* Reset Password Form */}
      <Suspense
        fallback={
          <section className="relative pt-20 pb-12 min-h-[calc(100vh-80px)] flex items-center">
            <div className="container mx-auto px-6">
              <div className="max-w-md mx-auto">
                <div className="p-8 lg:p-12 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
                  <div className="text-center py-12">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white/60">Loading...</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}

