"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useRef } from "react"
import Link from "next/link"
import { ArrowLeft, Heart, Globe, Users, Sparkles, Target, Zap, Shield, Star } from "lucide-react"

const aboutSections = [
  {
    id: "mission",
    icon: Target,
    title: "Our Mission",
    color: "#8b5cf6",
    gradient: "from-violet-500 to-purple-600",
    content: "To create a global platform where people can connect, share, and build meaningful relationships beyond geographical and cultural boundaries.",
  },
  {
    id: "vision",
    icon: Globe,
    title: "Our Vision",
    color: "#06b6d4",
    gradient: "from-cyan-500 to-blue-600",
    content: "A world where distance doesn't limit connection, where technology brings people together, and where every voice can be heard and celebrated.",
  },
  {
    id: "values",
    icon: Heart,
    title: "Our Values",
    color: "#10b981",
    gradient: "from-emerald-500 to-green-600",
    content: "We believe in authenticity, respect, safety, and inclusivity. Every feature we build is designed with these core principles in mind.",
  },
  {
    id: "innovation",
    icon: Zap,
    title: "Innovation",
    color: "#f59e0b",
    gradient: "from-amber-500 to-orange-600",
    content: "We're constantly pushing the boundaries of what's possible in social networking, from livestreaming to real-time events and beyond.",
  },
  {
    id: "safety",
    icon: Shield,
    title: "Safety First",
    color: "#ec4899",
    gradient: "from-pink-500 to-rose-600",
    content: "Your safety and privacy are our top priorities. We've built comprehensive safety features and moderation tools to ensure a positive experience.",
  },
  {
    id: "community",
    icon: Users,
    title: "Community Driven",
    color: "#6366f1",
    gradient: "from-indigo-500 to-violet-600",
    content: "Nomli Mingle is built by the community, for the community. Your feedback shapes our platform and helps us grow together.",
  },
]

const features = [
  {
    title: "Livestreaming",
    description: "Share your moments in real-time with your community",
    icon: "📺",
  },
  {
    title: "Video Calls",
    description: "Connect face-to-face with friends and new people",
    icon: "📹",
  },
  {
    title: "Events",
    description: "Discover and create events that bring people together",
    icon: "🎉",
  },
  {
    title: "Communities",
    description: "Join groups and build connections around shared interests",
    icon: "👥",
  },
]

function AboutCard({
  section,
  index,
  total,
}: { section: (typeof aboutSections)[0]; index: number; total: number }) {
  const isLast = index === total - 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="relative"
    >
      {/* Connector Line */}
      {!isLast && (
        <div className="absolute left-1/2 top-full -translate-x-1/2 w-1 h-24 md:h-32">
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/10 to-transparent rounded-full"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
            style={{ transformOrigin: "top" }}
          />
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/30"
            animate={{ y: [0, 80, 0] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: index * 0.2 }}
          />
        </div>
      )}

      <motion.div
        className="group relative p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm overflow-hidden"
        whileHover={{ scale: 1.02, borderColor: `${section.color}40`, y: -5 }}
        transition={{ duration: 0.3 }}
      >
        {/* Glow effect */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${section.color}20 0%, transparent 60%)`,
          }}
        />

        {/* Icon */}
        <motion.div
          className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${section.gradient} flex items-center justify-center mb-6 shadow-lg`}
          style={{ boxShadow: `0 10px 30px ${section.color}30` }}
          whileHover={{ rotate: 5, scale: 1.1 }}
        >
          <section.icon className="w-8 h-8 text-white" />
        </motion.div>

        {/* Content */}
        <h3 className="text-2xl font-bold text-white mb-4">{section.title}</h3>
        <p className="text-white/70 leading-relaxed">{section.content}</p>

        {/* Step number */}
        <div className="absolute bottom-4 right-4 text-6xl font-bold text-white/[0.03]">0{index + 1}</div>
      </motion.div>
    </motion.div>
  )
}

export default function AboutPage() {
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
            <span className="text-sm text-white/50">Nomli Mingle</span>
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
              <Heart className="w-10 h-10 text-white" />
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
                About Nomli Mingle
              </span>
            </h1>
            <p className="text-xl text-white/60 leading-relaxed mb-8">
              Beyond Borders. Beyond Limits. We're building the future of social connection.
            </p>

            {/* Trust badges */}
            <div className="flex flex-wrap justify-center gap-3">
              {["Global Community", "Innovation Driven", "User First"].map((badge, i) => (
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

      {/* About Sections */}
      <section className="relative pb-32">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {aboutSections.map((section, index) => (
              <AboutCard key={section.id} section={section} index={index} total={aboutSections.length} />
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative pb-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-white mb-4">What We Offer</h2>
            <p className="text-white/60 text-lg">Powerful features designed to bring people together</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm hover:border-primary/50 transition-colors"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-white/60 text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative pb-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center"
          >
            <div className="p-8 rounded-3xl bg-gradient-to-b from-white/[0.05] to-transparent border border-white/10">
              <motion.div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-6"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY }}
              >
                <Star className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-3xl font-bold text-white mb-4">Join Our Community</h3>
              <p className="text-white/60 text-lg mb-8">
                Be part of a global movement that's redefining how people connect, share, and build relationships.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/">
                  <motion.button
                    className="px-8 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Get Started
                  </motion.button>
                </Link>
                <a href="mailto:hello@nomli.cc">
                  <motion.button
                    className="px-8 py-3 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Contact Us
                  </motion.button>
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

