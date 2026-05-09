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
    color: "#c026d3",
    gradient: "from-fuchsia-600 to-pink-600",
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
    color: "#0891b2",
    gradient: "from-cyan-600 to-sky-600",
    items: ["Personalize your experience", "Connect you with others", "Improve our features", "Keep the platform safe"],
    milestone: "Processing",
  },
  {
    id: "sharing",
    icon: Share2,
    title: "Data Sharing",
    color: "#059669",
    gradient: "from-emerald-600 to-teal-600",
    items: ["Never sold to advertisers", "Shared only with consent", "Service providers only", "Legal requirements"],
    milestone: "Distribution",
  },
  {
    id: "security",
    icon: Shield,
    title: "Security Measures",
    color: "#d97706",
    gradient: "from-amber-600 to-orange-600",
    items: ["End-to-end encryption", "24/7 monitoring", "Regular security audits", "Two-factor auth available"],
    milestone: "Protection",
  },
  {
    id: "international",
    icon: Globe,
    title: "International Transfers",
    color: "#db2777",
    gradient: "from-pink-600 to-rose-600",
    items: ["GDPR compliant", "Standard contracts", "Certified facilities", "Transparent policies"],
    milestone: "Global",
  },
  {
    id: "deletion",
    icon: Trash2,
    title: "Data Deletion",
    color: "#dc2626",
    gradient: "from-red-600 to-rose-600",
    items: ["Delete anytime", "Download your data", "30-day recovery", "Permanent after confirm"],
    milestone: "Control",
  },
  {
    id: "cookies",
    icon: Lock,
    title: "No Tracking, No Cookies",
    color: "#4f46e5",
    gradient: "from-indigo-600 to-violet-600",
    items: ["We don't use cookies", "We don't track users", "No analytics tracking", "Privacy by design"],
    milestone: "Privacy",
  },
  {
    id: "updates",
    icon: Bell,
    title: "Policy Updates",
    color: "#0d9488",
    gradient: "from-teal-600 to-cyan-600",
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
      {!isLast && (
        <div className="absolute top-1/2 left-full z-0 hidden h-0.5 w-full lg:block">
          <motion.div
            className="h-full bg-gradient-to-r from-neutral-300/80 to-transparent"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
            style={{ transformOrigin: "left" }}
          />
          <motion.div
            className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-fuchsia-400/70"
            animate={{ x: [0, 100, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, delay: index * 0.3 }}
          />
        </div>
      )}

      <motion.div
        className="group relative h-full overflow-hidden rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
        whileHover={{ scale: 1.02, borderColor: `${section.color}55`, y: -5 }}
        transition={{ duration: 0.3 }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${section.color}18 0%, transparent 55%)`,
          }}
        />

        <div className="absolute top-4 right-4">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
            style={{ backgroundColor: `${section.color}14`, color: section.color }}
          >
            {section.milestone}
          </span>
        </div>

        <motion.div
          className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${section.gradient} shadow-lg`}
          style={{ boxShadow: `0 12px 28px ${section.color}2a` }}
          whileHover={{ rotate: 5, scale: 1.1 }}
        >
          <section.icon className="h-7 w-7 text-white" />
        </motion.div>

        <h3 className="mb-4 pr-20 font-serif text-xl font-medium tracking-tight text-neutral-950">{section.title}</h3>

        <ul className="space-y-2">
          {section.items.map((item, i) => (
            <motion.li
              key={i}
              className="flex items-center gap-2 text-sm leading-relaxed text-neutral-600"
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 + i * 0.05 }}
            >
              <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: section.color }} />
              {item}
            </motion.li>
          ))}
        </ul>

        <div className="pointer-events-none absolute bottom-3 right-4 font-serif text-5xl font-medium text-neutral-950/[0.06]">
          0{index + 1}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function PrivacyPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: containerRef })
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  return (
    <div ref={containerRef} className="relative min-h-screen overflow-hidden bg-[#f7f6f3] text-neutral-900">
      <motion.div
        className="fixed top-0 left-0 z-50 h-0.5 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-fuchsia-500"
        style={{ width: progressWidth }}
      />

      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-[12%] right-[-5%] h-[420px] w-[420px] rounded-full bg-fuchsia-400/12 blur-[100px]" />
        <div className="absolute bottom-[8%] left-[-8%] h-[380px] w-[380px] rounded-full bg-pink-400/10 blur-[90px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-50" />
      </div>

      <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-[#f7f6f3]/90 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/">
            <motion.div
              className="flex items-center gap-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-950"
              whileHover={{ x: -4 }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </motion.div>
          </Link>
          <span className="text-xs text-neutral-500 sm:text-sm">Effective December 2025</span>
        </div>
      </header>

      <main id="main-content">
        <section className="relative pt-16 pb-14 sm:pt-20 sm:pb-16">
          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mx-auto max-w-3xl text-center"
            >
              <motion.div
                className="relative mb-8 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500 shadow-lg shadow-fuchsia-900/15"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
              >
                <Lock className="h-10 w-10 text-white" />
                <motion.div
                  className="absolute -top-1 -right-1"
                  animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                >
                  <Sparkles className="h-5 w-5 text-amber-200" />
                </motion.div>
              </motion.div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-700/80">Legal</p>
              <h1 className="mt-4 font-serif text-4xl font-medium tracking-tight text-neutral-950 sm:text-5xl lg:text-[3.25rem]">
                Privacy Policy
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-600">
                Your data journey—from collection to protection. Plain language, no filler.
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {["GDPR aligned", "Encryption in transit", "No data sales"].map((badge, i) => (
                  <motion.span
                    key={badge}
                    className="rounded-full border border-neutral-200/90 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm"
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

        <section className="relative pb-24 sm:pb-32">
          <div className="container mx-auto px-6">
            <div className="mx-auto mb-14 max-w-6xl">
              <div className="relative h-2 overflow-hidden rounded-full bg-neutral-200/80">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-500 via-cyan-500 via-emerald-500 via-amber-500 via-pink-500 via-red-500 via-indigo-500 to-teal-500"
                  initial={{ width: "0%" }}
                  whileInView={{ width: "100%" }}
                  viewport={{ once: true }}
                  transition={{ duration: 2, ease: "easeOut" }}
                />
                {roadmapSections.map((section, i) => (
                  <motion.div
                    key={section.id}
                    className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
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

            <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2 lg:grid-cols-4">
              {roadmapSections.map((section, index) => (
                <RoadmapCard key={section.id} section={section} index={index} total={roadmapSections.length} />
              ))}
            </div>
          </div>
        </section>

        <section className="relative pb-20">
          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mx-auto max-w-2xl text-center"
            >
              <div className="rounded-2xl border border-neutral-200/90 bg-white p-8 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.12)] sm:p-10">
                <p className="text-lg text-neutral-600">Questions about your privacy?</p>
                <a
                  href="mailto:support@nomlimingle.com"
                  className="mt-3 inline-block font-medium text-fuchsia-700 underline-offset-4 transition-colors hover:text-fuchsia-900 hover:underline"
                >
                  support@nomlimingle.com
                </a>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
                  <Link href="/terms">
                    <motion.button
                      type="button"
                      className="w-full rounded-lg border border-neutral-200 bg-white px-6 py-3 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 sm:w-auto"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Terms of Service
                    </motion.button>
                  </Link>
                  <Link href="/">
                    <motion.button
                      type="button"
                      className="w-full rounded-lg bg-neutral-950 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 sm:w-auto"
                      whileHover={{ scale: 1.03 }}
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
      </main>
    </div>
  )
}
