"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useRef, useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { onAuthStateChanged } from "firebase/auth"
import { getAuthInstance } from "@/lib/firebase/config"
import { ArrowLeft, CheckCircle2, Users, Gift, Link2, Copy, TrendingUp, Clock, Award, BarChart3, Loader2, Sparkles } from "lucide-react"

// Mock data - Fallback if API fails
const mockStats = {
  referralCode: "NOMLI-ABC123",
  referralLink: "https://nomlimingle.com/invite/NOMLI-ABC123",
  totalSignups: 28,
  activeUsers: 12,
  pendingUsers: 5,
  totalEarned: "$13",
  nextMilestone: {
    target: 20,
    current: 12,
    reward: "$34",
    progress: 60,
  },
  milestones: [
    {
      users: 5,
      reward: "$7",
      achieved: true,
      achievedDate: "2024-12-01",
      color: "#8b5cf6",
    },
    {
      users: 10,
      reward: "$13",
      achieved: true,
      achievedDate: "2024-12-10",
      color: "#06b6d4",
    },
    {
      users: 20,
      reward: "$34",
      achieved: false,
      progress: 12,
      color: "#10b981",
    },
  ],
  recentActivity: [
    { user: "@johndoe", status: "Active", date: "2 days ago", reward: "$7" },
    { user: "@janedoe", status: "Active", date: "3 days ago", reward: "$7" },
    { user: "@creator1", status: "Pending", date: "1 day ago", reward: null },
  ],
}

export default function InfluencerDashboard() {
  // Use window scroll instead of container scroll to avoid hydration issues
  const { scrollYProgress } = useScroll()
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])
  const router = useRouter()
  
  const [stats, setStats] = useState(mockStats)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // Get authenticated user ID
  useEffect(() => {
    const auth = getAuthInstance()
    if (!auth) {
      router.push("/influencer/auth")
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid)
      } else {
        router.push("/influencer/auth")
      }
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    async function fetchDashboardData() {
      if (!userId) return

      try {
        setIsLoading(true)
        const response = await fetch(`/api/influencer/dashboard?influencerId=${userId}`)
        const result = await response.json()
        
        if (result.success) {
          setStats(result.data)
        } else {
          setError(result.error || "Failed to load dashboard")
        }
      } catch (err) {
        console.error("Error fetching dashboard:", err)
        setError("Failed to load dashboard data")
        // Use mock data as fallback
        setStats(mockStats)
      } finally {
        setIsLoading(false)
      }
    }

    if (userId) {
      fetchDashboardData()
    }
  }, [userId])

  const copyToClipboard = () => {
    // Ensure the link is properly formatted and trimmed
    const link = stats.referralLink?.trim() || ""
    // Ensure it has the protocol if missing
    const formattedLink = link.startsWith("http") ? link : `https://${link}`
    navigator.clipboard.writeText(formattedLink.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyCodeToClipboard = () => {
    navigator.clipboard.writeText(stats.referralCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error && userId) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">⚠️</span>
          </div>
          <h1 className="text-3xl font-bold mb-4">Error Loading Dashboard</h1>
          <p className="text-white/60 mb-8">{error}</p>
          <Link href="/influencer">
            <motion.button
              className="px-8 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              Back to Program
            </motion.button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
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
            <Link href="/influencer">
              <motion.div
                className="flex items-center gap-3 text-white/70 hover:text-white transition-colors"
                whileHover={{ x: -4 }}
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Back to Program</span>
              </motion.div>
            </Link>
            <div className="flex items-center gap-3">
              <div className="relative w-8 h-8">
                <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" />
              </div>
              <span className="text-sm text-white/50 font-medium">Nomli Mingle</span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Stats */}
      <section className="relative pt-20 pb-12">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-6xl mx-auto"
          >
            <h1 className="text-4xl lg:text-5xl font-bold mb-2">Your Influencer Dashboard</h1>
            <p className="text-white/60 text-lg mb-8">Track your referrals and earnings in real-time</p>

            {/* Stats Grid */}
            <div className="grid md:grid-cols-4 gap-6 mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="text-xs text-white/50">Active Users</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats.activeUsers}</p>
                <p className="text-sm text-white/60 mt-1">of {stats.totalSignups} signups</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <Clock className="w-5 h-5 text-accent" />
                  <span className="text-xs text-white/50">Pending</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats.pendingUsers}</p>
                <p className="text-sm text-white/60 mt-1">Awaiting activation</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <Gift className="w-5 h-5 text-green-400" />
                  <span className="text-xs text-white/50">Total Earned</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats.totalEarned}</p>
                <p className="text-sm text-white/60 mt-1">Rewards paid</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="w-5 h-5 text-yellow-400" />
                  <span className="text-xs text-white/50">Next Reward</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats.nextMilestone.reward}</p>
                <p className="text-sm text-white/60 mt-1">
                  {stats.nextMilestone.current}/{stats.nextMilestone.target} users
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Referral Code Section - Prominently Displayed */}
      <section className="relative py-12">
        <div className="container mx-auto px-6">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="p-8 lg:p-12 rounded-3xl bg-gradient-to-br from-primary/20 via-accent/10 to-primary/20 border-2 border-primary/30 backdrop-blur-sm"
            >
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4"
                >
                  <Link2 className="w-10 h-10 text-white" />
                </motion.div>
                <h2 className="text-3xl lg:text-4xl font-bold text-white mb-2">Your Referral Code</h2>
                <p className="text-white/60 text-lg">Share this code to start earning rewards</p>
              </div>

              {/* Referral Code Display */}
              <div className="mb-8">
                <div className="bg-white/5 border-2 border-white/20 rounded-2xl p-6 mb-4">
                  <p className="text-sm text-white/50 mb-2 text-center uppercase tracking-wider">Your Unique Code</p>
                  <div className="flex items-center justify-center gap-4 flex-wrap">
                    <code className="text-4xl lg:text-5xl font-bold text-white font-mono tracking-wider">
                      {stats.referralCode}
                    </code>
                    <motion.button
                      onClick={copyCodeToClipboard}
                      className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors flex items-center gap-2 font-semibold"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Copy className="w-5 h-5" />
                      {codeCopied ? "Copied!" : "Copy Code"}
                    </motion.button>
                  </div>
                </div>

                {/* Referral Link */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-sm text-white/50 mb-2">Your Referral Link</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <code className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm flex-1 min-w-[200px] break-all font-mono">
                      {stats.referralLink?.trim() || "Loading..."}
                    </code>
                    <motion.button
                      onClick={copyToClipboard}
                      className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors flex items-center gap-2 whitespace-nowrap"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Copy className="w-4 h-4" />
                      {copied ? "Copied!" : "Copy Link"}
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">How to Use Your Code</h3>
                    <ul className="space-y-2 text-white/70 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>Share your referral link or code with your audience</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>When users sign up using your code, they'll be tracked automatically</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>Earn rewards when they become active users (upload photo, add bio, post story, etc.)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>Track your progress and earnings in real-time on this dashboard</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Milestones Progress */}
      <section className="relative py-12">
        <div className="container mx-auto px-6">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-8"
            >
              <h2 className="text-3xl font-bold text-white mb-2">Milestone Progress</h2>
              <p className="text-white/60">Track your progress toward earning rewards</p>
            </motion.div>

            <div className="space-y-6">
              {stats.milestones.map((milestone, index) => (
                <motion.div
                  key={milestone.users}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                          milestone.achieved ? "from-primary to-accent" : "from-white/5 to-white/5"
                        } flex items-center justify-center`}
                        style={
                          milestone.achieved
                            ? {}
                            : {
                                border: `2px solid ${milestone.color}40`,
                              }
                        }
                      >
                        {milestone.achieved ? (
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        ) : (
                          <Award className="w-6 h-6" style={{ color: milestone.color }} />
                        )}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {milestone.users} Active Users
                        </h3>
                        <p className="text-white/60 text-sm">
                          {milestone.achieved
                            ? `Achieved on ${new Date(milestone.achievedDate).toLocaleDateString()}`
                            : `${milestone.progress || 0}/${milestone.users} users`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        {milestone.reward}
                      </p>
                      {milestone.achieved && (
                        <p className="text-xs text-green-400 mt-1">✓ Paid</p>
                      )}
                    </div>
                  </div>

                  {!milestone.achieved && milestone.progress !== undefined && (
                    <div className="mt-4">
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, ${milestone.color}, ${milestone.color}80)`,
                            width: `${(milestone.progress / milestone.users) * 100}%`,
                          }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${(milestone.progress / milestone.users) * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, delay: index * 0.1 }}
                        />
                      </div>
                      <p className="text-xs text-white/50 mt-2">
                        {milestone.users - milestone.progress} more users needed
                      </p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="relative py-12">
        <div className="container mx-auto px-6">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-8"
            >
              <h2 className="text-3xl font-bold text-white mb-2">Recent Activity</h2>
              <p className="text-white/60">Track your latest referrals and their status</p>
            </motion.div>

            <div className="space-y-4">
              {stats.recentActivity.map((activity, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        activity.status === "Active"
                          ? "bg-gradient-to-br from-green-500 to-green-600"
                          : "bg-gradient-to-br from-yellow-500 to-yellow-600"
                      }`}
                    >
                      {activity.status === "Active" ? (
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      ) : (
                        <Clock className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{activity.user}</p>
                      <p className="text-sm text-white/60">{activity.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        activity.status === "Active"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {activity.status}
                    </span>
                    {activity.reward && (
                      <p className="text-sm text-white/60 mt-1">+{activity.reward}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
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
              <p className="text-white/60 text-lg mb-4">Need help or have questions?</p>
              <a href="mailto:hello@nomli.cc" className="text-primary hover:underline font-semibold text-xl">
                hello@nomli.cc
              </a>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                <Link href="/influencer">
                  <motion.button
                    className="px-8 py-3 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Program Info
                  </motion.button>
                </Link>
                <Link href="/">
                  <motion.button
                    className="px-8 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Back to Home
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

