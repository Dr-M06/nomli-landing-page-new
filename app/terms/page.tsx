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
    color: "#9333ea",
    gradient: "from-violet-600 to-purple-600",
    content: `By accessing or using Nomli Mingle, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.`,
    status: "required",
  },
  {
    id: "eligibility",
    icon: Users,
    title: "Eligibility",
    color: "#0891b2",
    gradient: "from-cyan-600 to-sky-600",
    content: `You must be at least 13 years old to use Nomli Mingle. Users under 18 require parental consent. We reserve the right to terminate accounts that violate age restrictions.`,
    status: "required",
  },
  {
    id: "account",
    icon: Shield,
    title: "Account Responsibilities",
    color: "#059669",
    gradient: "from-emerald-600 to-teal-600",
    content: `You are responsible for safeguarding your account credentials and for any activities under your account. Notify us immediately of any unauthorized access.`,
    status: "required",
  },
  {
    id: "conduct",
    icon: MessageSquare,
    title: "User Conduct",
    color: "#d97706",
    gradient: "from-amber-600 to-orange-600",
    content: `No harmful, threatening, or discriminatory content. No harassment, spam, or illegal activities. Respect other users and the community.`,
    status: "important",
  },
  {
    id: "intellectual",
    icon: Scale,
    title: "Intellectual Property",
    color: "#db2777",
    gradient: "from-pink-600 to-rose-600",
    content: `The Service is owned by Nomli Mingle and protected by international copyright laws. User-generated content remains yours, but you grant us a license to display it on the platform.`,
    status: "important",
  },
  {
    id: "termination",
    icon: AlertTriangle,
    title: "Termination",
    color: "#dc2626",
    gradient: "from-red-600 to-rose-600",
    content: `We may terminate or suspend your account for conduct that violates these Terms. Upon termination, your right to use the Service will cease immediately.`,
    status: "warning",
  },
  {
    id: "changes",
    icon: RefreshCw,
    title: "Changes to Terms",
    color: "#4f46e5",
    gradient: "from-indigo-600 to-violet-600",
    content: `We reserve the right to modify these terms at any time. We will notify users of any material changes via email or through the app.`,
    status: "info",
  },
  {
    id: "contact",
    icon: Mail,
    title: "Contact Us",
    color: "#0d9488",
    gradient: "from-teal-600 to-cyan-600",
    content: `Questions about these Terms? Reach out at support@nomlimingle.com. Our team typically responds within 24–48 hours.`,
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
      {!isLast && (
        <div className="absolute top-full left-1/2 hidden h-28 w-px -translate-x-1/2 md:block md:h-36">
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-b from-neutral-300 via-neutral-200 to-transparent"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
            style={{ transformOrigin: "top" }}
          />
          <motion.div
            className="absolute top-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-fuchsia-400/80"
            animate={{ y: [0, 88, 0] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: index * 0.2 }}
          />
        </div>
      )}

      <div className={`flex items-center gap-4 md:gap-10 ${isLeft ? "flex-row" : "flex-row-reverse"} md:flex-row`}>
        <motion.div
          className={`max-w-md flex-1 ${isLeft ? "md:text-right" : "md:text-left"} text-left`}
          whileHover={{ scale: 1.02 }}
        >
          <motion.div
            className="group relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
            whileHover={{ borderColor: `${section.color}55` }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background: `radial-gradient(circle at ${isLeft ? "100%" : "0%"} 40%, ${section.color}12 0%, transparent 65%)`,
              }}
            />

            <div className="mb-4 flex items-center gap-3 md:hidden">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${section.gradient}`}
              >
                <section.icon className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-semibold text-neutral-400">0{index + 1}</span>
            </div>

            <div className="relative">
              <h3 className="mb-3 font-serif text-xl font-medium tracking-tight text-neutral-950">{section.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-600">{section.content}</p>
            </div>

            <div className={`mt-4 flex items-center gap-2 ${isLeft ? "md:justify-end" : "md:justify-start"}`}>
              <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: section.color }} />
              <span className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">{section.status}</span>
            </div>
          </motion.div>
        </motion.div>

        <motion.div className="relative z-10 hidden flex-col items-center md:flex" whileHover={{ scale: 1.1 }}>
          <motion.div
            className={`absolute inset-0 rounded-full bg-gradient-to-br ${section.gradient} opacity-40 blur-xl`}
            animate={{ scale: [1, 1.15, 1], opacity: [0.25, 0.45, 0.25] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
          />

          <div
            className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${section.gradient} shadow-lg`}
            style={{ boxShadow: `0 12px 32px ${section.color}35` }}
          >
            <section.icon className="h-7 w-7 text-white" />
          </div>

          <span className="mt-2 text-xs font-semibold text-neutral-400">0{index + 1}</span>
        </motion.div>

        <div className="hidden max-w-md flex-1 md:block" />
      </div>
    </motion.div>
  )
}

export default function TermsPage() {
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
        <div className="absolute top-[18%] left-[-6%] h-[400px] w-[400px] rounded-full bg-fuchsia-400/11 blur-[95px]" />
        <div className="absolute right-[-4%] bottom-[14%] h-[360px] w-[360px] rounded-full bg-pink-400/10 blur-[85px]" />
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
          <span className="text-xs text-neutral-500 sm:text-sm">Last updated December 2025</span>
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
                className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500 shadow-lg shadow-fuchsia-900/15"
                animate={{ rotate: [0, 4, -4, 0] }}
                transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY }}
              >
                <FileText className="h-10 w-10 text-white" />
              </motion.div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-700/80">Legal</p>
              <h1 className="mt-4 font-serif text-4xl font-medium tracking-tight text-neutral-950 sm:text-5xl lg:text-[3.25rem]">
                Terms of Service
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-600">
                A clear path through what you agree to when you use Nomli Mingle.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                {roadmapSections.map((section, i) => (
                  <motion.div
                    key={section.id}
                    className="h-2.5 w-2.5 rounded-full shadow-sm ring-2 ring-white"
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

        <section className="relative pb-24 sm:pb-32">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl space-y-20 md:space-y-28">
              {roadmapSections.map((section, index) => (
                <RoadmapNode key={section.id} section={section} index={index} total={roadmapSections.length} />
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
                <p className="text-lg text-neutral-600">By using Nomli Mingle, you agree to these terms. Questions?</p>
                <a
                  href="mailto:support@nomlimingle.com"
                  className="mt-3 inline-block font-medium text-fuchsia-700 underline-offset-4 transition-colors hover:text-fuchsia-900 hover:underline"
                >
                  support@nomlimingle.com
                </a>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
                  <Link href="/privacy">
                    <motion.button
                      type="button"
                      className="w-full rounded-lg border border-neutral-200 bg-white px-6 py-3 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 sm:w-auto"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Privacy Policy
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
