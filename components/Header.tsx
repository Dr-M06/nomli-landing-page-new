"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import Link from "next/link"

export function Header() {
  const router = useRouter()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const refreshLoginState = () => {
      const token = localStorage.getItem("nomli_supabase_access_token")
      setIsLoggedIn(Boolean(token))
    }
    refreshLoginState()
    window.addEventListener("storage", refreshLoginState)
    window.addEventListener("focus", refreshLoginState)
    return () => {
      window.removeEventListener("storage", refreshLoginState)
      window.removeEventListener("focus", refreshLoginState)
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("nomli_supabase_access_token")
    localStorage.removeItem("nomli_supabase_refresh_token")
    setIsLoggedIn(false)
    setIsMobileMenuOpen(false)
    router.push("/")
  }

  const scrollToDownload = () => {
    document.getElementById("download")?.scrollIntoView({ behavior: "smooth" })
    setIsMobileMenuOpen(false)
  }

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? "glass py-3" : "bg-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-6 flex items-center justify-between">
          <motion.a href="/" className="flex items-center gap-2" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <div className="relative w-8 h-8 flex-shrink-0">
              <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" priority sizes="32px" unoptimized />
            </div>
            <span className="text-base font-bold text-foreground">Nomli Mingle</span>
          </motion.a>

          <nav className="hidden lg:flex items-center gap-8">
            <a
              href="https://wallet.nomlimingle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Wallet
            </a>
            <Link href="/social" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Social
            </Link>
            <Link href="/music" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Music
            </Link>
            {isLoggedIn && (
              <Link href="/music?tab=submit" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Music Upload
              </Link>
            )}
            <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              About
            </Link>
            <Link href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </Link>
            {isLoggedIn ? (
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Logout
              </button>
            ) : (
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Login
              </Link>
            )}
            <Button size="sm" className="bg-foreground hover:bg-foreground/90 text-background rounded-full px-5" onClick={scrollToDownload}>
              Download
            </Button>
          </nav>

          <motion.button
            className="lg:hidden text-foreground p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            whileTap={{ scale: 0.95 }}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </motion.button>
        </div>
      </motion.header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed top-16 right-3 z-40 w-[min(320px,calc(100vw-1.5rem))] lg:hidden"
          >
            <nav className="flex max-h-[70dvh] flex-col gap-2 overflow-y-auto rounded-2xl border border-white/15 bg-gradient-to-b from-[#111a3a]/95 to-[#0a122b]/95 px-4 py-3 shadow-[0_20px_60px_rgba(6,10,28,0.5)] backdrop-blur-md">
              <a
                href="https://wallet.nomlimingle.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Wallet
              </a>
              <Link
                href="/social"
                className="rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Social
              </Link>
              <Link
                href="/music"
                className="rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Music
              </Link>
              {isLoggedIn && (
                <Link
                  href="/music?tab=submit"
                  className="rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Music Upload
                </Link>
              )}
              <Link
                href="/about"
                className="rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                About
              </Link>
              <Link
                href="#faq"
                className="rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                FAQ
              </Link>
              {isLoggedIn ? (
                <button
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-left text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              ) : (
                <Link
                  href="/login"
                  className="rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Login
                </Link>
              )}
              <Button className="mt-2 w-full rounded-full bg-white py-2 text-sm text-black hover:bg-white/90" onClick={scrollToDownload}>
                Download
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}