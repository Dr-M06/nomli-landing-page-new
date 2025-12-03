"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useRef } from "react"
import Link from "next/link"
import { ArrowLeft, Lock, Eye, Database, Share2, Shield, Globe, Trash2, Bell, Sparkles } from "lucide-react"

const roadmapSections = [
  {
    id: "collection",
    icon: Database,
    title: "Information We Collect",
    color: "#8b5cf6",
    gradient: "from-violet-500 to-purple-600",
    items: [
      "Account info (name, email, photo)",
      "Content you create & share",
      "Usage data for improvements",
      "Device info for security",
    ],
    milestone: "Data Input",
  },
  {
    id: "usage",
    icon: Eye,
    title: "How We Use Your Data",
    color: "#06b6d4",
    gradient: "from-cyan-500 to-blue-600",
    items: ["Personalize your experience", "Connect you with others", "Improve our features", "Keep the platform safe"],
    milestone: "Processing",
  },
  {
    id: "sharing",
    icon: Share2,
    title: "Data Sharing",
    color: "#10b981",
    gradient: "from-emerald-500 to-green-600",
    items: ["Never sold to advertisers", "Shared only with consent", "Service providers only", "Legal requirements"],
    milestone: "Distribution",
  },
  {
    id: "security",
    icon: Shield,
    title: "Security Measures",
    color: "#f59e0b",
    gradient: "from-amber-500 to-orange-600",
    items: ["End-to-end encryption", "24/7 monitoring", "Regular security audits", "Two-factor auth available"],
    milestone: "Protection",
  },
  {
    id: "international",
    icon: Globe,
    title: "International Transfers",
    color: "#ec4899",
    gradient: "from-pink-500 to-rose-600",
    items: ["GDPR compliant", "Standard contracts", "Certified facilities", "Transparent policies"],
    milestone: "Global",
  },
  {
    id: "deletion",
    icon: Trash2,
    title: "Data Deletion",
    color: "#ef4444",
    gradient: "from-red-500 to-rose-600",
    items: ["Delete anytime", "Download your data", "30-day recovery", "Permanent after confirm"],
    milestone: "Control",
  },
  {
    id: "cookies",
    icon: Lock,
    title: "No Tracking, No Cookies",
    color: "#6366f1",
    gradient: "from-indigo-500 to-violet-600",
    items: ["We don't use cookies", "We don't track users", "No analytics tracking", "Privacy by design"],
    milestone: "Privacy",
  },
  {
    id: "updates",
    icon: Bell,
    title: "Policy Updates",
    color: "#14b8a6",
    gradient: "from-teal-500 to-cyan-600",
    items: ["Email notifications", "In-app alerts", "30-day notice", "Changes summarized"],
    milestone: "Updates",
  },
]

function RoadmapCard({
  section,
  index,
  total,
}: { section: (typeof roadmapSections)[0]; index: number; total: number }) {
  const isLast = index === total - 1

  return (
    <motion.div
      initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="relative"
    >
      {/* Horizontal connector line */}
      {!isLast && (
        <div className="absolute top-1/2 left-full w-full h-0.5 hidden lg:block">
          <motion.div
            className="h-full bg-gradient-to-r from-white/20 to-transparent"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
            style={{ transformOrigin: "left" }}
          />
          {/* Animated particle */}
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/50"
            animate={{ x: [0, 100, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, delay: index * 0.3 }}
          />
        </div>
      )}

      <motion.div
        className="group relative p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm overflow-hidden h-full"
        whileHover={{ scale: 1.02, borderColor: `${section.color}40`, y: -5 }}
        transition={{ duration: 0.3 }}
      >
        {/* Top glow */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${section.color}20 0%, transparent 60%)`,
          }}
        />

        {/* Milestone badge */}
        <div className="absolute top-4 right-4">
          <span
            className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{ backgroundColor: `${section.color}20`, color: section.color }}
          >
            {section.milestone}
          </span>
        </div>

        {/* Icon */}
        <motion.div
          className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${section.gradient} flex items-center justify-center mb-4 shadow-lg`}
          style={{ boxShadow: `0 10px 30px ${section.color}30` }}
          whileHover={{ rotate: 5, scale: 1.1 }}
        >
          <section.icon className="w-7 h-7 text-white" />
        </motion.div>

        {/* Content */}
        <h3 className="text-xl font-bold text-white mb-4 pr-20">{section.title}</h3>

        <ul className="space-y-2">
          {section.items.map((item, i) => (
            <motion.li
              key={i}
              className="flex items-center gap-2 text-white/60 text-sm"
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 + i * 0.05 }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: section.color }} />
              {item}
            </motion.li>
          ))}
        </ul>

        {/* Step number */}
        <div className="absolute bottom-4 right-4 text-5xl font-bold text-white/[0.03]">0{index + 1}</div>
      </motion.div>
    </motion.div>
  )
}

export default function PrivacyPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: containerRef })
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 h-1 bg-gradient-to-r from-accent via-primary to-accent z-50"
        style={{ width: progressWidth }}
      />

      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[180px] animate-pulse" />
        <div className="absolute bottom-1/3 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse delay-700" />
        {/* Grid pattern */}
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
            <span className="text-sm text-white/50">Effective: December 2025</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-24 pb-16">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-3xl mx-auto"
          >
            <motion.div
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-accent to-primary mb-8 relative"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
            >
              <Lock className="w-10 h-10 text-white" />
              <motion.div
                className="absolute -top-1 -right-1"
                animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              >
                <Sparkles className="w-5 h-5 text-accent" />
              </motion.div>
            </motion.div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 text-balance">
              <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                Privacy Policy
              </span>
            </h1>
            <p className="text-xl text-white/60 leading-relaxed mb-8">
              Your data journey — from collection to protection. No legal jargon, just straight talk.
            </p>

            {/* Trust badges */}
            <div className="flex flex-wrap justify-center gap-3">
              {["GDPR Compliant", "End-to-End Encrypted", "No Data Sales"].map((badge, i) => (
                <motion.span
                  key={badge}
                  className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/60 text-sm font-medium"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                >
                  {badge}
                </motion.span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Roadmap Grid */}
      <section className="relative pb-32">
        <div className="container mx-auto px-6">
          {/* Connected line visualization at the top */}
          <div className="max-w-6xl mx-auto mb-16">
            <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 via-cyan-500 via-emerald-500 via-amber-500 via-pink-500 via-red-500 via-indigo-500 to-teal-500"
                initial={{ width: "0%" }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true }}
                transition={{ duration: 2, ease: "easeOut" }}
              />
              {/* Nodes on the progress line */}
              {roadmapSections.map((section, i) => (
                <motion.div
                  key={section.id}
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-background"
                  style={{
                    left: `${(i / (roadmapSections.length - 1)) * 100}%`,
                    backgroundColor: section.color,
                    transform: "translate(-50%, -50%)",
                  }}
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: (i / roadmapSections.length) * 2 }}
                />
              ))}
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {roadmapSections.map((section, index) => (
              <RoadmapCard key={section.id} section={section} index={index} total={roadmapSections.length} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="relative pb-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center"
          >
            <div className="p-8 rounded-3xl bg-gradient-to-b from-white/[0.05] to-transparent border border-white/10">
              <p className="text-white/60 text-lg mb-4">Questions about your privacy?</p>
              <a href="mailto:hello@nomli.cc" className="text-primary hover:underline font-semibold text-xl">
                hello@nomli.cc
              </a>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                <Link href="/terms">
                  <motion.button
                    className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    View Terms of Service
                  </motion.button>
                </Link>
                <Link href="/">
                  <motion.button
                    className="px-8 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Back to Nomli Mingle
                  </motion.button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
