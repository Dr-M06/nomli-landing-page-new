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

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              About
            </Link>
            <Link href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </Link>
            <a
              href="https://wallet.nomlimingle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Wallet
            </a>
            <Link href="/music" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Music
            </Link>
            {isLoggedIn ? (
              <>
                <Link href="/music?tab=submit" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Music Upload
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Logout
                </button>
              </>
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
            className="md:hidden text-foreground p-2"
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 glass pt-24 px-6 md:hidden"
          >
            <nav className="flex flex-col gap-6">
              <Link href="/about" className="text-xl font-medium text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                About
              </Link>
              <Link href="#faq" className="text-xl font-medium text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                FAQ
              </Link>
              <a
                href="https://wallet.nomlimingle.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xl font-medium text-foreground"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Wallet
              </a>
              <Link href="/music" className="text-xl font-medium text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                Music
              </Link>
              {isLoggedIn ? (
                <>
                  <Link
                    href="/music?tab=submit"
                    className="text-xl font-medium text-foreground"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Music Upload
                  </Link>
                  <button type="button" className="text-left text-xl font-medium text-foreground" onClick={handleLogout}>
                    Logout
                  </button>
                </>
              ) : (
                <Link href="/login" className="text-xl font-medium text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                  Login
                </Link>
              )}
              <Button className="w-full rounded-full bg-foreground text-background" onClick={scrollToDownload}>
                Download
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}