"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Lock, Mail } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase-browser"

const NEXT_STORAGE = "nomli_auth_next"

async function validateAccessToken(token: string) {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase.auth.getUser(token)
  return !error && Boolean(data.user?.id)
}

/** Google "G" logo — brand colors (marketing guidelines). */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

export default function LoginPage() {
  const { scrollYProgress } = useScroll()
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])
  const router = useRouter()
  const [nextPath, setNextPath] = useState("/music?tab=discover")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const next = params.get("next")
    if (next) setNextPath(next)
  }, [])

  useEffect(() => {
    const bootstrap = async () => {
      try {
        getSupabaseBrowserClient()
        const existingToken =
          typeof window !== "undefined" ? localStorage.getItem("nomli_supabase_access_token") : null
        if (!existingToken) return

        const valid = await validateAccessToken(existingToken)
        if (valid) {
          router.replace(nextPath)
          return
        }

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

  const persistFromSession = (accessToken: string, refreshToken: string) => {
    if (typeof window === "undefined") return
    if (accessToken) localStorage.setItem("nomli_supabase_access_token", accessToken)
    if (refreshToken) localStorage.setItem("nomli_supabase_refresh_token", refreshToken)
  }

  const handleGoogle = async () => {
    setError("")
    setIsLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if (typeof window !== "undefined") {
        sessionStorage.setItem(NEXT_STORAGE, nextPath)
      }
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      })
      if (oauthError) throw oauthError
      if (data.url) {
        window.location.href = data.url
        return
      }
      throw new Error("Could not start Google sign-in.")
    } catch (err: any) {
      setError(err?.message || "Google sign-in failed.")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError("Please enter your email")
      return
    }
    if (!validateEmail(normalizedEmail)) {
      setError("Please enter a valid email address")
      return
    }
    if (!password) {
      setError("Please enter your password")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setIsLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })
      if (signError) throw signError
      const session = data.session
      if (!session) throw new Error("No session returned.")
      persistFromSession(session.access_token, session.refresh_token)
      router.replace(nextPath)
    } catch (err: any) {
      setError(err?.message || "Sign-in failed.")
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
                <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">Sign in</h1>
                <p className="text-white/60">Google or email and password</p>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => void handleGoogle()}
                className="mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <GoogleLogo className="h-5 w-5 shrink-0" />
                Sign in with Google
              </button>

              <div className="mb-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[11px] uppercase tracking-wider text-white/40">or</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={handlePasswordAuth} className="space-y-5">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    minLength={6}
                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors"
                    placeholder="Password"
                  />
                </div>

                {error ? <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div> : null}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold disabled:opacity-50"
                >
                  {isLoading ? "Signing in…" : "Sign in"}
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
