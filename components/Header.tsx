"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import Link from "next/link"

export type HeaderVariant = "default" | "light" | "social"

export function Header({ variant = "default" }: { variant?: HeaderVariant }) {
  const isLight = variant === "light"
  const isSocial = variant === "social"
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToDownload = () => {
    document.getElementById("download")?.scrollIntoView({ behavior: "smooth" })
    setIsMobileMenuOpen(false)
  }

  const headerClass = isSocial
    ? `fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-xl transition-shadow duration-300 py-3.5 ${
        isScrolled ? "shadow-lg shadow-black/20" : ""
      }`
    : isLight
      ? `fixed top-0 left-0 right-0 z-50 border-b border-neutral-200/70 bg-[#f7f6f3]/92 backdrop-blur-md transition-shadow duration-300 py-3.5 ${
          isScrolled ? "shadow-sm shadow-neutral-900/5" : ""
        }`
      : `fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? "glass py-3" : "bg-transparent py-5"
        }`

  const logoTextClass = isSocial
    ? "text-base font-semibold text-white"
    : isLight
      ? "text-base font-semibold text-neutral-900"
      : "text-base font-bold text-foreground"

  const linkClass = isSocial
    ? "text-sm text-white/75 hover:text-white transition-colors"
    : isLight
      ? "text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
      : "text-sm text-muted-foreground hover:text-foreground transition-colors"

  const iconBtnClass = isSocial
    ? "lg:hidden p-2 text-white"
    : isLight
      ? "lg:hidden p-2 text-neutral-900"
      : "lg:hidden text-foreground p-2"

  const isLightChrome = isLight && !isSocial

  return (
    <>
      <motion.header
        initial={isLight || isSocial ? undefined : { y: -100 }}
        animate={isLight || isSocial ? undefined : { y: 0 }}
        transition={isLight || isSocial ? undefined : { duration: 0.5, ease: "easeOut" }}
        className={headerClass}
      >
        <div className="container mx-auto flex items-center justify-between px-6">
          {isLight || isSocial ? (
            <Link href="/" className="flex items-center gap-2">
              <div className="relative h-8 w-8 flex-shrink-0">
                <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" priority sizes="32px" unoptimized />
              </div>
              <span className={logoTextClass}>Nomli Mingle</span>
            </Link>
          ) : (
            <motion.a href="/" className="flex items-center gap-2" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <div className="relative h-8 w-8 flex-shrink-0">
                <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" priority sizes="32px" unoptimized />
              </div>
              <span className={logoTextClass}>Nomli Mingle</span>
            </motion.a>
          )}

          <nav className="hidden items-center gap-8 lg:flex">
            <Link href="/music" className={linkClass}>
              Music
            </Link>
            <Link href="/about" className={linkClass}>
              About
            </Link>
            {!isSocial && (
              <Link href="/faq" className={linkClass}>
                FAQ
              </Link>
            )}
            <Button
              size="sm"
              onClick={scrollToDownload}
              className={
                isSocial
                  ? "rounded-md border-0 bg-gradient-to-r from-fuchsia-500 to-pink-500 px-5 text-white shadow-md shadow-fuchsia-900/40 hover:from-fuchsia-400 hover:to-pink-400"
                  : isLight
                    ? "rounded-md bg-neutral-900 px-5 text-white hover:bg-neutral-800"
                    : "rounded-full bg-foreground px-5 text-background hover:bg-foreground/90"
              }
            >
              Download
            </Button>
          </nav>

          <motion.button
            className={iconBtnClass}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            whileTap={{ scale: 0.95 }}
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
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
            className="fixed top-[3.75rem] right-3 z-40 w-[min(320px,calc(100vw-1.5rem))] lg:hidden"
          >
            <nav
              className={
                isLightChrome
                  ? "flex max-h-[70dvh] flex-col gap-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white px-3 py-3 shadow-lg"
                  : "flex max-h-[70dvh] flex-col gap-2 overflow-y-auto rounded-2xl border border-white/15 bg-gradient-to-b from-zinc-900/98 to-black/95 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md"
              }
            >
              <Link
                href="/music"
                className={
                  isLightChrome
                    ? "rounded-lg px-2 py-2 text-base font-medium text-neutral-800 hover:bg-neutral-100"
                    : "rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                }
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Music
              </Link>
              <Link
                href="/about"
                className={
                  isLightChrome
                    ? "rounded-lg px-2 py-2 text-base font-medium text-neutral-800 hover:bg-neutral-100"
                    : "rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                }
                onClick={() => setIsMobileMenuOpen(false)}
              >
                About
              </Link>
              {!isSocial && (
                <Link
                  href="/faq"
                  className={
                    isLightChrome
                      ? "rounded-lg px-2 py-2 text-base font-medium text-neutral-800 hover:bg-neutral-100"
                      : "rounded-lg px-2 py-1.5 text-[20px] font-semibold leading-tight text-white/95 hover:bg-white/10"
                  }
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  FAQ
                </Link>
              )}
              <Button
                className={
                  isSocial
                    ? "mt-2 w-full rounded-md border-0 bg-gradient-to-r from-fuchsia-500 to-pink-500 py-2 text-sm text-white shadow-md shadow-fuchsia-900/30 hover:from-fuchsia-400 hover:to-pink-400"
                    : isLightChrome
                      ? "mt-2 w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-800"
                      : "mt-2 w-full rounded-full bg-white py-2 text-sm text-black hover:bg-white/90"
                }
                onClick={scrollToDownload}
              >
                Download
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
