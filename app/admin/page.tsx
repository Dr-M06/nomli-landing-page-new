"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useRef, useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Users,
  TrendingUp,
  Copy,
  Eye,
  Check,
  X,
} from "lucide-react"

interface Influencer {
  id: string
  name: string
  email: string
  platform: string
  socialHandle: string
  followers: string
  status: "pending" | "approved" | "rejected"
  referralCode?: string
  referralLink?: string
  totalSignups: number
  activeUsers: number
  pendingUsers: number
  totalEarned: number
  isActive: boolean
  createdAt: any
}

interface Payment {
  id: string
  influencerId: string
  milestoneThreshold: number
  rewardAmount: number
  activeUsersCount: number
  paymentStatus: "pending" | "paid" | "failed"
  paidAt?: string
  createdAt: string
  influencer?: {
    id: string
    name: string
    email: string
    referralCode: string
  }
}

export default function AdminDashboard() {
  // Use window scroll instead of container scroll to avoid hydration issues
  const { scrollYProgress } = useScroll()
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [referrals, setReferrals] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"influencers" | "payments" | "referrals">("influencers")
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null)

  useEffect(() => {
    fetchInfluencers()
    fetchPayments()
    fetchReferrals()
  }, [])

  const fetchInfluencers = async () => {
    try {
      const response = await fetch("/api/admin/influencers")
      const result = await response.json()
      if (result.success) {
        setInfluencers(result.data)
      }
    } catch (error) {
      console.error("Error fetching influencers:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPayments = async () => {
    try {
      const response = await fetch("/api/admin/payments")
      const result = await response.json()
      if (result.success) {
        setPayments(result.data)
      }
    } catch (error) {
      console.error("Error fetching payments:", error)
    }
  }

  const fetchReferrals = async () => {
    try {
      const response = await fetch("/api/admin/referrals")
      const result = await response.json()
      if (result.success) {
        setReferrals(result.data)
      }
    } catch (error) {
      console.error("Error fetching referrals:", error)
    }
  }

  const handleApprove = async (influencerId: string) => {
    try {
      const response = await fetch("/api/admin/influencers/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerId, action: "approve" }),
      })
      const result = await response.json()
      if (result.success) {
        alert(`Influencer approved! Referral code: ${result.code}`)
        fetchInfluencers()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error("Error approving influencer:", error)
      alert("Failed to approve influencer")
    }
  }

  const handleReject = async (influencerId: string) => {
    if (!confirm("Are you sure you want to reject this influencer?")) return

    try {
      const response = await fetch("/api/admin/influencers/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerId, action: "reject" }),
      })
      const result = await response.json()
      if (result.success) {
        alert("Influencer rejected")
        fetchInfluencers()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error("Error rejecting influencer:", error)
      alert("Failed to reject influencer")
    }
  }

  const handleMarkPaid = async (paymentId: string) => {
    if (!confirm("Mark this payment as paid?")) return

    try {
      const response = await fetch("/api/admin/payments/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      })
      const result = await response.json()
      if (result.success) {
        alert("Payment marked as paid")
        fetchPayments()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error("Error marking payment:", error)
      alert("Failed to mark payment as paid")
    }
  }

  const pendingInfluencers = influencers.filter((i) => i.status === "pending")
  const approvedInfluencers = influencers.filter((i) => i.status === "approved")
  const pendingPayments = payments.filter((p) => p.paymentStatus === "pending")
  const totalEarned = payments
    .filter((p) => p.paymentStatus === "paid")
    .reduce((sum, p) => sum + p.rewardAmount, 0)

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
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <motion.div
                className="flex items-center gap-2 sm:gap-3 text-white/70 hover:text-white transition-colors"
                whileHover={{ x: -4 }}
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="font-medium text-sm sm:text-base">Back to Home</span>
              </motion.div>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative w-6 h-6 sm:w-8 sm:h-8">
                <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" />
              </div>
              <span className="text-xs sm:text-sm text-white/50 font-medium hidden sm:inline">Admin Dashboard</span>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <section className="relative pt-12 sm:pt-20 pb-8 sm:pb-12">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-7xl mx-auto"
          >
            <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-6 sm:mb-8">Admin Dashboard</h1>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
                  <span className="text-[10px] sm:text-xs text-white/50">Pending Approval</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-white">{pendingInfluencers.length}</p>
                <p className="text-xs sm:text-sm text-white/60 mt-1">Influencers</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                  <span className="text-[10px] sm:text-xs text-white/50">Approved</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-white">{approvedInfluencers.length}</p>
                <p className="text-xs sm:text-sm text-white/60 mt-1">Active Influencers</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  <span className="text-[10px] sm:text-xs text-white/50">Pending Payments</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-white">{pendingPayments.length}</p>
                <p className="text-xs sm:text-sm text-white/60 mt-1">Awaiting payment</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                  <span className="text-[10px] sm:text-xs text-white/50">Total Paid</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-white">${totalEarned}</p>
                <p className="text-xs sm:text-sm text-white/60 mt-1">Rewards distributed</p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Tabs */}
      <section className="relative pb-8 sm:pb-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex gap-2 sm:gap-4 mb-4 sm:mb-6 border-b border-white/10 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 scrollbar-hide">
              <button
                onClick={() => setActiveTab("influencers")}
                className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition-colors whitespace-nowrap ${
                  activeTab === "influencers"
                    ? "text-white border-b-2 border-primary"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Influencers ({influencers.length})
              </button>
              <button
                onClick={() => setActiveTab("payments")}
                className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition-colors whitespace-nowrap ${
                  activeTab === "payments"
                    ? "text-white border-b-2 border-primary"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Payments ({payments.length})
              </button>
              <button
                onClick={() => setActiveTab("referrals")}
                className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition-colors whitespace-nowrap ${
                  activeTab === "referrals"
                    ? "text-white border-b-2 border-primary"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Referrals ({referrals.length})
              </button>
            </div>

            {/* Influencers Tab */}
            {activeTab === "influencers" && (
              <div className="space-y-4">
                {isLoading ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white/60">Loading influencers...</p>
                  </div>
                ) : influencers.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-white/60">No influencers found</p>
                  </div>
                ) : (
                  influencers.map((influencer) => (
                    <motion.div
                      key={influencer.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
                    >
                      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
                        <div className="flex-1 w-full">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-2">
                            <h3 className="text-lg sm:text-xl font-bold text-white break-words">{influencer.name}</h3>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                influencer.status === "approved"
                                  ? "bg-green-500/20 text-green-400"
                                  : influencer.status === "pending"
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {influencer.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                            <div>
                              <p className="text-white/60">Email</p>
                              <p className="text-white">{influencer.email}</p>
                            </div>
                            <div>
                              <p className="text-white/60">Platform</p>
                              <p className="text-white">
                                {influencer.platform} - {influencer.socialHandle}
                              </p>
                            </div>
                            <div>
                              <p className="text-white/60">Followers</p>
                              <p className="text-white">{influencer.followers}</p>
                            </div>
                            {influencer.referralCode && (
                              <div>
                                <p className="text-white/60">Referral Code</p>
                                <p className="text-white font-mono">{influencer.referralCode}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-white/60">Stats</p>
                              <p className="text-white">
                                {influencer.activeUsers} active / {influencer.totalSignups} total
                              </p>
                            </div>
                            <div>
                              <p className="text-white/60">Total Earned</p>
                              <p className="text-white">${influencer.totalEarned}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                          {influencer.status === "pending" && (
                            <>
                              <motion.button
                                onClick={() => handleApprove(influencer.id)}
                                className="px-3 sm:px-4 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-initial"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">Approve</span>
                                <span className="sm:hidden">Approve</span>
                              </motion.button>
                              <motion.button
                                onClick={() => handleReject(influencer.id)}
                                className="px-3 sm:px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-initial"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">Reject</span>
                                <span className="sm:hidden">Reject</span>
                              </motion.button>
                            </>
                          )}
                          {influencer.referralLink && (
                            <motion.button
                              onClick={() => {
                                navigator.clipboard.writeText(influencer.referralLink!)
                                alert("Link copied!")
                              }}
                              className="px-3 sm:px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-initial"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              <span className="hidden sm:inline">Copy Link</span>
                              <span className="sm:hidden">Copy</span>
                            </motion.button>
                          )}
                          <Link href={`/influencer/dashboard?id=${influencer.id}`} className="flex-1 sm:flex-initial">
                            <motion.button
                              className="w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              <span className="hidden sm:inline">View</span>
                              <span className="sm:hidden">View</span>
                            </motion.button>
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            )}

            {/* Payments Tab */}
            {activeTab === "payments" && (
              <div className="space-y-4">
                {isLoading ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white/60">Loading payments...</p>
                  </div>
                ) : payments.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-white/60">No payments found</p>
                  </div>
                ) : (
                  payments.map((payment) => (
                    <motion.div
                      key={payment.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
                    >
                      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
                        <div className="flex-1 w-full">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-2">
                            <h3 className="text-lg sm:text-xl font-bold text-white break-words">
                              {payment.influencer?.name || "Unknown Influencer"}
                            </h3>
                            <span
                              className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium w-fit ${
                                payment.paymentStatus === "paid"
                                  ? "bg-green-500/20 text-green-400"
                                  : payment.paymentStatus === "pending"
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {payment.paymentStatus}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                            <div>
                              <p className="text-white/60">Milestone</p>
                              <p className="text-white">
                                {payment.milestoneThreshold} Active Users
                              </p>
                            </div>
                            <div>
                              <p className="text-white/60">Reward Amount</p>
                              <p className="text-white font-bold text-lg">${payment.rewardAmount}</p>
                            </div>
                            <div>
                              <p className="text-white/60">Influencer</p>
                              <p className="text-white">
                                {payment.influencer?.email || payment.influencerId}
                              </p>
                            </div>
                            <div>
                              <p className="text-white/60">Created</p>
                              <p className="text-white">
                                {new Date(payment.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            {payment.paidAt && (
                              <div>
                                <p className="text-white/60">Paid At</p>
                                <p className="text-white">
                                  {new Date(payment.paidAt).toLocaleDateString()}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        {payment.paymentStatus === "pending" && (
                          <motion.button
                            onClick={() => handleMarkPaid(payment.id)}
                            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="hidden sm:inline">Mark as Paid</span>
                            <span className="sm:hidden">Mark Paid</span>
                          </motion.button>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            )}

            {/* Referrals Tab */}
            {activeTab === "referrals" && (
              <div className="space-y-4">
                {isLoading ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white/60">Loading referrals...</p>
                  </div>
                ) : referrals.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-white/60">No referrals found</p>
                  </div>
                ) : (
                  referrals.map((referral) => (
                    <motion.div
                      key={referral.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
                    >
                      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
                        <div className="flex-1 w-full">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-2">
                            <h3 className="text-lg sm:text-xl font-bold text-white">Referral #{referral.id.slice(0, 8)}</h3>
                            <span
                              className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium w-fit ${
                                referral.status === "active"
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-yellow-500/20 text-yellow-400"
                              }`}
                            >
                              {referral.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                            <div>
                              <p className="text-white/60 mb-1">Influencer ID</p>
                              <p className="text-white font-mono text-[10px] sm:text-xs break-all">{referral.influencerId}</p>
                            </div>
                            <div>
                              <p className="text-white/60 mb-1">User ID</p>
                              <p className="text-white font-mono text-[10px] sm:text-xs break-all">{referral.userId}</p>
                            </div>
                            <div>
                              <p className="text-white/60">Signup Date</p>
                              <p className="text-white">
                                {new Date(referral.signupDate).toLocaleDateString()}
                              </p>
                            </div>
                            {referral.activatedAt && (
                              <div>
                                <p className="text-white/60">Activated At</p>
                                <p className="text-white">
                                  {new Date(referral.activatedAt).toLocaleDateString()}
                                </p>
                              </div>
                            )}
                            <div>
                              <p className="text-white/60">Signup Method</p>
                              <p className="text-white capitalize">{referral.signupMethod || "unknown"}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

