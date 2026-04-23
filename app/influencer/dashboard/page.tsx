"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useRef, useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { getAuthInstance } from "@/lib/firebase/config"
import { ArrowLeft, CheckCircle2, Users, Gift, Copy, TrendingUp, Clock, Award, BarChart3, Loader2, Sparkles, Info, X, LogOut } from "lucide-react"

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
  const [codeCopied, setCodeCopied] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [showActiveModal, setShowActiveModal] = useState(false)
  const [user, setUser] = useState<any>(null)

  const handleLogout = async () => {
    try {
      const auth = getAuthInstance()
      if (auth) {
        await signOut(auth)
        router.push("/")
      }
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

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
        setUser(user)
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
            <Link href="/">
              <motion.div
                className="flex items-center gap-3 text-white/70 hover:text-white transition-colors"
                whileHover={{ x: -4 }}
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Back to Home</span>
              </motion.div>
            </Link>
            <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-white/50">Signed in as</p>
                    <p className="text-sm text-white font-medium truncate max-w-[150px]">{user.email}</p>
                  </div>
                  <motion.button
                    onClick={handleLogout}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </motion.button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8">
                  <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" />
                </div>
                <span className="text-sm text-white/50 font-medium hidden sm:inline">Nomli Mingle</span>
              </div>
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

      {/* Referral Code Section - Compact Display */}
      <section className="relative py-8">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="p-6 rounded-2xl bg-gradient-to-br from-primary/20 via-accent/10 to-primary/20 border border-primary/30 backdrop-blur-sm"
            >
              <div className="text-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-3"
                >
                  <Sparkles className="w-6 h-6 text-white" />
                </motion.div>
                <h2 className="text-2xl font-bold text-white mb-1">Your Referral Code</h2>
                <p className="text-white/60 text-sm">Share this code to start earning rewards</p>
              </div>

              {/* Referral Code Display */}
              <div className="mb-4">
                <div className="bg-white/5 border border-white/20 rounded-xl p-4 mb-3">
                  <p className="text-xs text-white/50 mb-2 text-center uppercase tracking-wider">Your Unique Code</p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <code className="text-2xl lg:text-3xl font-bold text-white font-mono tracking-wider">
                      {stats.referralCode}
                    </code>
                    <motion.button
                      onClick={copyCodeToClipboard}
                      className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors flex items-center gap-2 text-sm font-medium"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Copy className="w-4 h-4" />
                      {codeCopied ? "Copied!" : "Copy Code"}
                    </motion.button>
                  </div>
                </div>

              </div>

              {/* Info Box - Compact */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-white mb-2">How to Use Your Code</h3>
                    <ul className="space-y-1.5 text-white/70 text-xs">
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Share your code with your audience</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Users sign up using your code and are tracked automatically</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Earn rewards when they become active users</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Track progress and earnings in real-time on this dashboard</span>
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.milestones.map((milestone, index) => (
                <motion.div
                  key={milestone.users}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
                >
                  <div className="mb-3">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg bg-gradient-to-br ${
                            milestone.achieved ? "from-primary to-accent" : "from-white/5 to-white/5"
                          } flex items-center justify-center flex-shrink-0`}
                          style={
                            milestone.achieved
                              ? {}
                              : {
                                  border: `2px solid ${milestone.color}40`,
                                }
                          }
                        >
                          {milestone.achieved ? (
                            <CheckCircle2 className="w-5 h-5 text-white" />
                          ) : (
                            <Award className="w-5 h-5" style={{ color: milestone.color }} />
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">
                            {milestone.users} Active Users
                          </h3>
                          <p className="text-white/60 text-xs">
                            {milestone.achieved && milestone.achievedDate
                              ? `Achieved ${new Date(milestone.achievedDate).toLocaleDateString()}`
                              : `${milestone.progress || 0}/${milestone.users} users`}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        {milestone.reward}
                      </p>
                      {milestone.achieved && (
                        <div>
                          {(milestone as any).paymentStatus === "paid" ? (
                            <p className="text-xs text-green-400">✓ Paid</p>
                          ) : (
                            <p className="text-xs text-yellow-400">⏳ Pending</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {!milestone.achieved && milestone.progress !== undefined && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
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
                      <p className="text-xs text-white/50 mt-1.5">
                        {milestone.users - milestone.progress} more needed
                      </p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Disclaimer and Active User Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-8 p-6 rounded-2xl bg-white/[0.02] border border-white/5"
            >
              <p className="text-sm text-white/60 mb-4 text-center">
                *Only fully active users are counted. Spam or inactive accounts are excluded.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setShowActiveModal(true)}
                  className="text-sm text-primary hover:text-accent transition-colors flex items-center gap-1 underline"
                >
                  <Info className="w-4 h-4" />
                  What qualifies as an active user?
                </button>
              </div>
            </motion.div>

            {/* Program Limits Notice */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20"
            >
              <p className="text-sm text-yellow-400 text-center">
                <strong>Note:</strong> Referral rewards are currently limited and may pause at any time. This is an invite-only program.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Active User Requirements Modal */}
      {showActiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative max-w-md w-full p-6 rounded-2xl bg-[#0a0a0f] border border-white/10"
          >
            <button
              onClick={() => setShowActiveModal(false)}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-2xl font-bold text-white mb-4">What Qualifies as an Active User?</h3>
            <p className="text-white/70 mb-6">
              To count toward your milestones, referred users must complete all of the following:
            </p>
            <ul className="space-y-3">
              {[
                "Profile photo uploaded",
                "Bio completed",
                "At least 1 story posted",
                "At least 1 community post",
                "Account active for 48-72 hours",
              ].map((requirement, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-white/80">{requirement}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-sm text-white/60">
                <strong className="text-white">Why these requirements?</strong> We want to reward you for bringing real, engaged users to Nomli Mingle—not spam accounts or inactive profiles.
              </p>
            </div>
            <button
              onClick={() => setShowActiveModal(false)}
              className="mt-6 w-full px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold"
            >
              Got it
            </button>
          </motion.div>
        </div>
      )}

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

