"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useRef } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  FileText,
  Shield,
  Users,
  MessageSquare,
  Scale,
  AlertTriangle,
  RefreshCw,
  Mail,
  CheckCircle2,
} from "lucide-react"

const roadmapSections = [
  {
    id: "acceptance",
    icon: FileText,
    title: "Acceptance of Terms",
    color: "#8b5cf6",
    gradient: "from-violet-500 to-purple-600",
    content: `By accessing or using Nomli Mingle, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.`,
    status: "required",
  },
  {
    id: "eligibility",
    icon: Users,
    title: "Eligibility",
    color: "#06b6d4",
    gradient: "from-cyan-500 to-blue-600",
    content: `You must be at least 13 years old to use Nomli Mingle. Users under 18 require parental consent. We reserve the right to terminate accounts that violate age restrictions.`,
    status: "required",
  },
  {
    id: "account",
    icon: Shield,
    title: "Account Responsibilities",
    color: "#10b981",
    gradient: "from-emerald-500 to-green-600",
    content: `You are responsible for safeguarding your account credentials and for any activities under your account. Notify us immediately of any unauthorized access.`,
    status: "required",
  },
  {
    id: "conduct",
    icon: MessageSquare,
    title: "User Conduct",
    color: "#f59e0b",
    gradient: "from-amber-500 to-orange-600",
    content: `No harmful, threatening, or discriminatory content. No harassment, spam, or illegal activities. Respect other users and the community.`,
    status: "important",
  },
  {
    id: "intellectual",
    icon: Scale,
    title: "Intellectual Property",
    color: "#ec4899",
    gradient: "from-pink-500 to-rose-600",
    content: `The Service is owned by Nomli Mingle and protected by international copyright laws. User-generated content remains yours, but you grant us a license to display it on the platform.`,
    status: "important",
  },
  {
    id: "termination",
    icon: AlertTriangle,
    title: "Termination",
    color: "#ef4444",
    gradient: "from-red-500 to-rose-600",
    content: `We may terminate or suspend your account for conduct that violates these Terms. Upon termination, your right to use the Service will cease immediately.`,
    status: "warning",
  },
  {
    id: "changes",
    icon: RefreshCw,
    title: "Changes to Terms",
    color: "#6366f1",
    gradient: "from-indigo-500 to-violet-600",
    content: `We reserve the right to modify these terms at any time. We will notify users of any material changes via email or through the app.`,
    status: "info",
  },
  {
    id: "contact",
    icon: Mail,
    title: "Contact Us",
    color: "#14b8a6",
    gradient: "from-teal-500 to-cyan-600",
    content: `Questions about these Terms? Reach out at hello@nomli.cc. Our support team typically responds within 24-48 hours.`,
    status: "complete",
  },
]

function RoadmapNode({
  section,
  index,
  total,
}: { section: (typeof roadmapSections)[0]; index: number; total: number }) {
  const isLeft = index % 2 === 0
  const isLast = index === total - 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="relative"
    >
      {/* Connector Line / Rope */}
      {!isLast && (
        <div className="absolute left-1/2 top-full -translate-x-1/2 w-1 h-24 md:h-32">
          {/* Animated rope/connection */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/10 to-transparent rounded-full"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
            style={{ transformOrigin: "top" }}
          />
          {/* Animated dots along the rope */}
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/30"
            animate={{ y: [0, 80, 0] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: index * 0.2 }}
          />
        </div>
      )}

      {/* Main Card */}
      <div className={`flex items-center gap-4 md:gap-8 ${isLeft ? "flex-row" : "flex-row-reverse"} md:flex-row`}>
        {/* Content Card */}
        <motion.div
          className={`flex-1 max-w-md ${isLeft ? "md:text-right" : "md:text-left"} text-left`}
          whileHover={{ scale: 1.02 }}
        >
          <motion.div
            className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm relative overflow-hidden group"
            whileHover={{ borderColor: `${section.color}40` }}
          >
            {/* Glow effect */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: `radial-gradient(circle at ${isLeft ? "100%" : "0%"} 50%, ${section.color}15 0%, transparent 70%)`,
              }}
            />

            {/* Mobile icon (shown on small screens) */}
            <div className="md:hidden flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${section.gradient} flex items-center justify-center`}
              >
                <section.icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white/40">0{index + 1}</span>
            </div>

            <div className="relative">
              <h3 className="text-xl font-bold text-white mb-3">{section.title}</h3>
              <p className="text-white/60 leading-relaxed text-sm">{section.content}</p>
            </div>

            {/* Status indicator */}
            <div className={`mt-4 flex items-center gap-2 ${isLeft ? "md:justify-end" : "md:justify-start"}`}>
              <CheckCircle2 className="w-4 h-4" style={{ color: section.color }} />
              <span className="text-xs font-medium text-white/40 uppercase tracking-wider">{section.status}</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Center Node */}
        <motion.div className="relative z-10 hidden md:flex flex-col items-center" whileHover={{ scale: 1.1 }}>
          {/* Outer glow ring */}
          <motion.div
            className={`absolute inset-0 rounded-full bg-gradient-to-br ${section.gradient} blur-xl opacity-50`}
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
          />

          {/* Node circle */}
          <div
            className={`relative w-16 h-16 rounded-full bg-gradient-to-br ${section.gradient} flex items-center justify-center shadow-lg`}
            style={{ boxShadow: `0 0 30px ${section.color}40` }}
          >
            <section.icon className="w-7 h-7 text-white" />
          </div>

          {/* Step number */}
          <span className="mt-2 text-xs font-bold text-white/40">0{index + 1}</span>
        </motion.div>

        {/* Empty space for alignment */}
        <div className="flex-1 max-w-md hidden md:block" />
      </div>
    </motion.div>
  )
}

export default function TermsPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: containerRef })
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 h-1 bg-gradient-to-r from-primary via-accent to-primary z-50"
        style={{ width: progressWidth }}
      />

      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[120px] animate-pulse delay-1000" />
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
            <span className="text-sm text-white/50">Last updated: December 2025</span>
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
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent mb-8"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY }}
            >
              <FileText className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 text-balance">
              <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                Terms of Service
              </span>
            </h1>
            <p className="text-xl text-white/60 leading-relaxed mb-8">
              Your journey through our terms — clear, fair, and straightforward.
            </p>

            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2">
              {roadmapSections.map((section, i) => (
                <motion.div
                  key={section.id}
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: section.color }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Roadmap Sections */}
      <section className="relative pb-32">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto space-y-24 md:space-y-32">
            {roadmapSections.map((section, index) => (
              <RoadmapNode key={section.id} section={section} index={index} total={roadmapSections.length} />
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
              <p className="text-white/60 text-lg mb-6">By using Nomli Mingle, you agree to these terms. Questions?</p>
              <a href="mailto:hello@nomli.cc" className="text-primary hover:underline font-medium text-lg">
                hello@nomli.cc
              </a>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                <Link href="/privacy">
                  <motion.button
                    className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    View Privacy Policy
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
