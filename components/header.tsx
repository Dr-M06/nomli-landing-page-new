"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Dropdown groups (Wallet and Download stay as single links)
const navDropdowns = [
  {
    label: "Explore",
    links: [
      { name: "Features", href: "#features" },
      { name: "App", href: "#app-preview" },
      { name: "Safety", href: "#safety" },
    ],
  },
  {
    label: "Community",
    links: [
      { name: "FAQ", href: "#faq" },
    ],
  },
]

const navSingleLinks = [
  { name: "Wallet", href: "https://wallet.nomlimingle.com", external: true },
]

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToDownload = () => {
    const downloadSection = document.getElementById("download")
    if (downloadSection) {
      downloadSection.scrollIntoView({ behavior: "smooth" })
    }
    setIsMobileMenuOpen(false)
  }

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled ? "glass py-3" : "bg-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-6 lg:px-10 flex items-center justify-between gap-8">
          {/* Logo */}
          <motion.a
            href="/"
            className="flex items-center gap-2 flex-shrink-0"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="relative w-8 h-8 flex-shrink-0">
              <Image
                src="/icon.png"
                alt="Nomli Mingle Logo"
                fill
                className="object-contain"
                priority
                sizes="32px"
                unoptimized
              />
            </div>
            <span className="text-base font-bold text-foreground">Nomli Mingle</span>
          </motion.a>

          {/* Desktop: Nav + CTAs grouped so no big gap in middle */}
          <div className="hidden md:flex items-center gap-8 flex-shrink-0">
            {/* Navigation - dropdowns + Wallet & Download */}
            <nav className="flex items-center gap-6">
              {navDropdowns.map((dropdown) => (
                <DropdownMenu key={dropdown.label}>
                  <DropdownMenuTrigger asChild>
                    <motion.button
                      className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium whitespace-nowrap py-2 px-3 rounded-lg hover:bg-white/5 flex items-center gap-1 outline-none"
                      whileHover={{ y: -2 }}
                    >
                      {dropdown.label}
                      <ChevronDown className="w-4 h-4 opacity-70" />
                    </motion.button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="min-w-[10rem] !bg-white dark:!bg-gray-900 !text-[#1a1a1a] dark:!text-gray-100 border border-gray-200 dark:border-gray-700 shadow-xl"
                  >
                    {dropdown.links.map((link) => (
                      <DropdownMenuItem key={link.name} asChild>
                        <a
                          href={link.href}
                          className="cursor-pointer !text-[#1a1a1a] dark:!text-gray-100 focus:!bg-gray-100 dark:focus:!bg-gray-800 focus:!text-[#1a1a1a] dark:focus:!text-gray-100"
                        >
                          {link.name}
                        </a>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ))}
              {navSingleLinks.map((link) => (
                <motion.a
                  key={link.name}
                  href={link.href}
                  {...(link.external && { target: "_blank", rel: "noopener noreferrer" })}
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium whitespace-nowrap py-2 px-3 rounded-lg hover:bg-white/5"
                  whileHover={{ y: -2 }}
                >
                  {link.name}
                </motion.a>
              ))}
            </nav>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3 border-l border-white/15 pl-6">
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-muted-foreground hover:text-foreground text-sm" 
                asChild
              >
                <Link href="/influencer/auth">Become an Influencer</Link>
              </Button>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
              <Button
                size="sm"
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-full px-4 text-sm h-8"
                onClick={scrollToDownload}
              >
                Download App
              </Button>
            </motion.div>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <motion.button
            className="md:hidden text-foreground p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            whileTap={{ scale: 0.95 }}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </motion.button>
        </div>
      </motion.header>

      {/* Mobile Menu - CHANGE: Added onClick handlers */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 glass pt-24 px-6 md:hidden"
          >
            <nav className="flex flex-col gap-6">
              {navDropdowns.map((dropdown) => (
                <div key={dropdown.label}>
                  <p className="text-sm font-medium text-muted-foreground mb-2 px-1">{dropdown.label}</p>
                  <div className="flex flex-col gap-2 pl-2">
                    {dropdown.links.map((link) => (
                      <motion.a
                        key={link.name}
                        href={link.href}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xl font-semibold text-foreground py-1"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {link.name}
                      </motion.a>
                    ))}
                  </div>
                </div>
              ))}
              {navSingleLinks.map((link, index) => (
                <motion.a
                  key={link.name}
                  href={link.href}
                  {...(link.external && { target: "_blank", rel: "noopener noreferrer" })}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="text-2xl font-semibold text-foreground"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.name}
                </motion.a>
              ))}
              <div className="flex flex-col gap-3 pt-6">
                <Button 
                  variant="outline" 
                  className="w-full bg-transparent" 
                  asChild
                >
                  <Link href="/influencer/auth" onClick={() => setIsMobileMenuOpen(false)}>Become an Influencer</Link>
                </Button>
                <Button className="w-full bg-gradient-to-r from-primary to-primary/80" onClick={scrollToDownload}>
                  Download App
                </Button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
