"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Mail } from "lucide-react"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

function assertSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Login service is temporarily unavailable.")
  }
}

async function supabaseAuthRequest(path: string, body: Record<string, unknown>) {
  assertSupabaseConfig()
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((payload as any)?.msg || (payload as any)?.error_description || "Authentication failed.")
  }
  return payload
}

async function validateAccessToken(token: string) {
  assertSupabaseConfig()
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) return false
  const payload = await response.json().catch(() => null)
  return Boolean((payload as any)?.id)
}

export default function LoginPage() {
  const { scrollYProgress } = useScroll()
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])
  const router = useRouter()
  const [nextPath, setNextPath] = useState("/music?tab=submit")

  const [email, setEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const next = params.get("next")
    if (next) setNextPath(next)
  }, [])

  useEffect(() => {
    // Keep page client-only and validate envs early.
    const bootstrap = async () => {
      try {
        assertSupabaseConfig()
        const existingToken =
          typeof window !== "undefined" ? localStorage.getItem("nomli_supabase_access_token") : null
        if (!existingToken) return

        const valid = await validateAccessToken(existingToken)
        if (valid) {
          router.replace(nextPath)
          return
        }

        // Stale token should not block login flow.
        if (typeof window !== "undefined") {
          localStorage.removeItem("nomli_supabase_access_token")
          localStorage.removeItem("nomli_supabase_refresh_token")
        }
      } catch (err: any) {
        setError(err?.message || "Login service is temporarily unavailable.")
      }
    }
    void bootstrap()
  }, [router, nextPath])

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccessMessage("")

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError("Please enter your email")
      return
    }
    if (!validateEmail(normalizedEmail)) {
      setError("Please enter a valid email address")
      return
    }

    setIsLoading(true)
    try {
      await supabaseAuthRequest("otp", {
        email: normalizedEmail,
        create_user: false,
      })
      setOtpSent(true)
      setSuccessMessage("OTP sent to your email. Enter it below to continue.")
    } catch (err: any) {
      setError(err?.message || "Failed to send OTP. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccessMessage("")

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      setError("Please enter a valid email address")
      return
    }
    if (!otpCode.trim()) {
      setError("Please enter the OTP code")
      return
    }

    setIsLoading(true)
    try {
      const payload = await supabaseAuthRequest("verify", {
        email: normalizedEmail,
        token: otpCode.trim(),
        type: "email",
      })
      if (typeof window !== "undefined") {
        const accessToken = String((payload as any)?.access_token || "")
        const refreshToken = String((payload as any)?.refresh_token || "")
        if (accessToken) localStorage.setItem("nomli_supabase_access_token", accessToken)
        if (refreshToken) localStorage.setItem("nomli_supabase_refresh_token", refreshToken)
      }
      router.replace(nextPath)
    } catch (err: any) {
      setError(err?.message || "OTP verification failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

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
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <motion.div className="flex items-center gap-3 text-white/70 hover:text-white transition-colors" whileHover={{ x: -4 }}>
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

      <section className="relative pt-20 pb-12 min-h-[calc(100vh-80px)] flex items-center">
        <div className="container mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto">
            <div className="p-8 lg:p-12 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <div className="text-center mb-8">
                <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">Welcome Back</h1>
                <p className="text-white/60">Sign in with one-time code (OTP)</p>
              </div>

              <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="space-y-6">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors"
                    placeholder="john@example.com"
                  />
                </div>

                {otpSent ? (
                  <div className="relative">
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors tracking-[0.3em]"
                      placeholder="Enter OTP"
                    />
                  </div>
                ) : null}

                {error ? <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div> : null}
                {successMessage ? (
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                    {successMessage}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold disabled:opacity-50"
                >
                  {isLoading ? (otpSent ? "Verifying..." : "Sending OTP...") : otpSent ? "Verify OTP" : "Send OTP"}
                </button>

                {otpSent ? (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => {
                      setOtpSent(false)
                      setOtpCode("")
                      setError("")
                      setSuccessMessage("")
                    }}
                    className="w-full px-6 py-2 rounded-full border border-white/20 text-white/80 text-sm hover:bg-white/10 disabled:opacity-50"
                  >
                    Use another email
                  </button>
                ) : null}
              </form>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
