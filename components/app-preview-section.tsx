"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useRef, useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, Home, Compass, MessageCircle } from "lucide-react"
import Image from "next/image"

const screens = [
  {
    id: 1,
    title: "Home Feed",
    subtitle: "Stay in the loop",
    description: "Discover events, trending posts, and connect with creators in your community.",
    icon: Home,
    gradient: "from-[#0f172a] via-[#1e293b] to-[#0f172a]",
    accentColor: "#14b8a6",
    screenshot: "/images/1.jpg",
  },
  {
    id: 2,
    title: "Discover",
    subtitle: "Find your tribe",
    description: "Meet people nearby who share your interests. Filter by location, age, and passions.",
    icon: Compass,
    gradient: "from-[#1e1b4b] via-[#312e81] to-[#1e1b4b]",
    accentColor: "#a855f7",
    screenshot: "/images/2.jpg",
  },
  {
    id: 3,
    title: "Chat",
    subtitle: "Connect deeper",
    description: "Rich messaging with voice notes, media sharing, video calls, and more.",
    icon: MessageCircle,
    gradient: "from-[#0c1222] via-[#1a2744] to-[#0c1222]",
    accentColor: "#06b6d4",
    screenshot: "/images/3.jpg",
  },
]

export function AppPreviewSection() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeScreen = screens[activeIndex]

  useEffect(() => {
    if (!isAutoPlaying) return
    const interval = setInterval(() => {
      setDirection(1)
      setActiveIndex((prev) => (prev + 1) % screens.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isAutoPlaying])

  const goToSlide = (index: number) => {
    setDirection(index > activeIndex ? 1 : -1)
    setActiveIndex(index)
    setIsAutoPlaying(false)
  }

  const goNext = () => {
    setDirection(1)
    setActiveIndex((prev) => (prev + 1) % screens.length)
    setIsAutoPlaying(false)
  }

  const goPrev = () => {
    setDirection(-1)
    setActiveIndex((prev) => (prev - 1 + screens.length) % screens.length)
    setIsAutoPlaying(false)
  }

  return (
    <section
      id="app-preview"
      ref={containerRef}
      className="relative py-24 lg:py-32 overflow-hidden bg-[#fafafa]"
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
    >
      {/* Animated background */}
      <motion.div
        className="absolute inset-0 opacity-20"
        animate={{
          background: `radial-gradient(ellipse 60% 40% at 50% 50%, ${activeScreen.accentColor}30 0%, transparent 70%)`,
        }}
        transition={{ duration: 0.8 }}
      />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-[#1a1a1a] text-white text-xs font-semibold tracking-wider mb-6">
            APP PREVIEW
          </span>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1a1a1a] mb-4 text-balance">
            Built for creators &<br className="hidden sm:block" /> everyday connections
          </h2>
          <p className="text-lg text-[#666] max-w-xl mx-auto">Smooth UI. Fast performance. Smart features.</p>
        </motion.div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Left Side - Feature Info */}
          <div className="w-full lg:w-1/2 order-2 lg:order-1">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={activeScreen.id}
                custom={direction}
                initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction < 0 ? 50 : -50 }}
                transition={{ duration: 0.4 }}
                className="text-center lg:text-left"
              >
                {/* Icon Badge */}
                <motion.div
                  className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 shadow-lg"
                  style={{ backgroundColor: activeScreen.accentColor }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <activeScreen.icon className="w-8 h-8 text-white" />
                </motion.div>

                <h3 className="text-3xl sm:text-4xl font-bold text-[#1a1a1a] mb-2">{activeScreen.title}</h3>
                <p className="text-xl font-medium mb-4" style={{ color: activeScreen.accentColor }}>
                  {activeScreen.subtitle}
                </p>
                <p className="text-lg text-[#666] max-w-md mx-auto lg:mx-0 leading-relaxed">
                  {activeScreen.description}
                </p>

                {/* Progress Indicators */}
                <div className="flex items-center gap-3 mt-8 justify-center lg:justify-start">
                  {screens.map((screen, index) => (
                    <button
                      key={screen.id}
                      onClick={() => goToSlide(index)}
                      className="group relative"
                      aria-label={`Go to ${screen.title}`}
                    >
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          index === activeIndex ? "w-12" : "w-6"
                        }`}
                        style={{
                          backgroundColor: index === activeIndex ? activeScreen.accentColor : "#e5e5e5",
                        }}
                      />
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#1a1a1a] text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {screen.title}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Navigation Arrows */}
                <div className="flex items-center gap-3 mt-6 justify-center lg:justify-start">
                  <motion.button
                    onClick={goPrev}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-12 h-12 rounded-full bg-white border border-[#e5e5e5] flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
                  >
                    <ChevronLeft className="w-5 h-5 text-[#1a1a1a]" />
                  </motion.button>
                  <motion.button
                    onClick={goNext}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
                    style={{ backgroundColor: activeScreen.accentColor }}
                  >
                    <ChevronRight className="w-5 h-5 text-white" />
                  </motion.button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right Side - Phone Mockup with Real Screenshot */}
          <div className="w-full lg:w-1/2 order-1 lg:order-2 flex justify-center">
            <div className="relative" style={{ perspective: "1200px" }}>
              {/* Glow Effect */}
              <motion.div
                className="absolute inset-0 blur-3xl opacity-50 rounded-full"
                animate={{
                  background: `radial-gradient(circle, ${activeScreen.accentColor}50 0%, transparent 70%)`,
                }}
                transition={{ duration: 0.5 }}
                style={{ transform: "scale(1.3)" }}
              />

              {/* Phone Frame */}
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={activeScreen.id}
                  custom={direction}
                  initial={{
                    x: direction > 0 ? 200 : -200,
                    opacity: 0,
                    rotateY: direction > 0 ? 30 : -30,
                    scale: 0.9,
                  }}
                  animate={{
                    x: 0,
                    opacity: 1,
                    rotateY: 0,
                    scale: 1,
                  }}
                  exit={{
                    x: direction < 0 ? 200 : -200,
                    opacity: 0,
                    rotateY: direction < 0 ? 30 : -30,
                    scale: 0.9,
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="relative"
                >
                  {/* Phone Outer Frame */}
                  <div className="relative w-[280px] sm:w-[300px] h-[570px] sm:h-[610px] rounded-[3rem] p-[3px] bg-gradient-to-b from-gray-600 via-gray-800 to-gray-900 shadow-2xl">
                    {/* Phone Inner with Screen */}
                    <div className="w-full h-full rounded-[2.8rem] overflow-hidden bg-black relative">
                      {/* Dynamic Island */}
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-8 bg-black rounded-full z-30 flex items-center justify-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-800" />
                        <div className="w-3 h-3 rounded-full bg-gray-800 ring-1 ring-gray-700" />
                      </div>

                      {/* Actual App Screenshot */}
                      <Image
                        src={activeScreen.screenshot || "/placeholder.svg"}
                        alt={`${activeScreen.title} screen`}
                        fill
                        className="object-cover"
                        priority
                      />
                    </div>

                    {/* Side Buttons */}
                    <div className="absolute -left-[2px] top-28 w-1 h-8 bg-gray-700 rounded-l-full" />
                    <div className="absolute -left-[2px] top-44 w-1 h-12 bg-gray-700 rounded-l-full" />
                    <div className="absolute -left-[2px] top-60 w-1 h-12 bg-gray-700 rounded-l-full" />
                    <div className="absolute -right-[2px] top-36 w-1 h-16 bg-gray-700 rounded-r-full" />
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Floating Tags */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                className="absolute -top-2 -right-6 sm:-right-10 px-4 py-2 rounded-full bg-white shadow-xl border border-gray-100"
              >
                <span className="text-sm font-semibold text-[#1a1a1a]" style={{ color: activeScreen.accentColor }}>
                  {activeScreen.id === 1 ? "Events" : activeScreen.id === 2 ? "Nearby" : "Voice Notes"}
                </span>
              </motion.div>

              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 3.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                className="absolute bottom-24 -left-6 sm:-left-12 px-4 py-2 rounded-full bg-white shadow-xl border border-gray-100"
              >
                <span className="text-sm font-semibold" style={{ color: activeScreen.accentColor }}>
                  {activeScreen.id === 1 ? "Community" : activeScreen.id === 2 ? "Interests" : "Video Call"}
                </span>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Bottom Feature Pills */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap justify-center gap-3 mt-20"
        >
          {["Cross-platform", "End-to-end encrypted", "Low latency", "Smart matching"].map((feature) => (
            <span
              key={feature}
              className="px-5 py-2.5 rounded-full bg-white border border-gray-200 text-sm font-medium text-[#666] hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors"
            >
              {feature}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
