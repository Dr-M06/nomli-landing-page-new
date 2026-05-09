"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSupabaseBrowserClient } from "@/lib/supabase-browser"

const TOKEN_KEY = "nomli_supabase_access_token"
const REFRESH_KEY = "nomli_supabase_refresh_token"
const NEXT_KEY = "nomli_auth_next"

function persistSession(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return
  localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState("Completing sign-in…")

  useEffect(() => {
    const run = async () => {
      if (typeof window === "undefined") return

      const qp = new URLSearchParams(window.location.search)
      const fallbackNext =
        sessionStorage.getItem(NEXT_KEY) || qp.get("next") || "/music?tab=discover"
      sessionStorage.removeItem(NEXT_KEY)

      try {
        const supabase = getSupabaseBrowserClient()

        const code = qp.get("code")
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            setMessage(error.message || "Could not complete sign-in.")
            return
          }
          if (data.session) {
            persistSession(data.session.access_token, data.session.refresh_token)
            router.replace(fallbackNext)
            return
          }
        }

        const hash = window.location.hash.replace(/^#/, "")
        if (hash) {
          const p = new URLSearchParams(hash)
          const access = p.get("access_token")
          const refresh = p.get("refresh_token") || ""
          if (access) {
            persistSession(access, refresh)
            window.history.replaceState(null, "", window.location.pathname + window.location.search)
            router.replace(fallbackNext)
            return
          }
        }

        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData.session) {
          persistSession(sessionData.session.access_token, sessionData.session.refresh_token)
          router.replace(fallbackNext)
          return
        }

        setMessage("No session returned. Try signing in again.")
      } catch (e: any) {
        setMessage(e?.message || "Something went wrong.")
      }
    }
    void run()
  }, [router])

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center px-6">
      <p className="text-sm text-white/80">{message}</p>
      <Link href="/login" className="mt-4 text-sm text-violet-300 hover:text-violet-200">
        Back to login
      </Link>
    </main>
  )
}
