"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, CheckCircle2, Users, Gift, Link2, Sparkles, Mail, User, Instagram, Youtube, Twitter } from "lucide-react"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { getAuthInstance } from "@/lib/firebase/config"
import { hasInfluencerApplication } from "@/lib/firebase/auth-helpers"

const steps = [
  {
    number: "01",
    title: "Apply",
    description: "Submit your details to join the program.",
    icon: User,
    color: "#8b5cf6",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    number: "02",
    title: "Get Your Invite Code",
    description: "You'll receive a unique referral link assigned to you.",
    icon: Link2,
    color: "#06b6d4",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    number: "03",
    title: "Invite Real Users",
    description: "Share your link and invite people to join Nomli Mingle.",
    icon: Users,
    color: "#10b981",
    gradient: "from-emerald-500 to-green-600",
  },
  {
    number: "04",
    title: "Get Rewarded",
    description: "Earn cash when invited users complete required activities.",
    icon: Gift,
    color: "#f59e0b",
    gradient: "from-amber-500 to-orange-600",
  },
]

const milestones = [
  {
    users: "5 Active Users",
    reward: "$7",
    color: "#8b5cf6",
  },
  {
    users: "10 Active Users",
    reward: "$13",
    color: "#06b6d4",
  },
  {
    users: "20 Active Users",
    reward: "$34",
    color: "#10b981",
  },
]

const activeRequirements = [
  "Profile photo uploaded",
  "Bio completed",
  "At least 1 story posted",
  "At least 1 community post",
  "Account active for 48-72 hours",
]

export default function InfluencerPage() {
  const router = useRouter()
  
  // Use window scroll instead of container scroll to avoid hydration issues
  const { scrollYProgress } = useScroll()
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    socialHandle: "",
    platform: "",
    followers: "",
    reason: "",
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const totalSteps = 3

  // Check authentication
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") {
      return
    }

    const auth = getAuthInstance()
    if (!auth) {
      setIsLoading(false)
      // Redirect to auth if Firebase not initialized
      router.push("/influencer/auth")
      return
    }

    try {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUser(user)
          
          // Check if user has already submitted an application
          const hasApplied = await hasInfluencerApplication(user.uid)
          if (hasApplied) {
            // User already applied, redirect to dashboard
            router.push("/influencer/dashboard")
            return
          }
          
          // Pre-fill email from auth
          setFormData((prev) => ({
            ...prev,
            email: user.email || "",
          }))
        } else {
          // Redirect to auth page if not logged in
          router.push("/influencer/auth")
        }
        setIsLoading(false)
      })

      return () => unsubscribe()
    } catch (error) {
      console.error("Auth error:", error)
      setIsLoading(false)
      router.push("/influencer/auth")
    }
  }, [router])

  const handleLogout = async () => {
    try {
      const auth = getAuthInstance()
      if (auth) {
        await signOut(auth)
        router.push("/influencer/auth")
      }
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  // Email validation function
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Validate specific field
  const validateField = (name: string, value: string): string => {
    switch (name) {
      case "name":
        if (!value.trim()) return "Full name is required"
        if (value.trim().length < 2) return "Name must be at least 2 characters"
        if (value.trim().length > 100) return "Name must be less than 100 characters"
        if (!/^[a-zA-Z\s'-]+$/.test(value.trim())) return "Name can only contain letters, spaces, hyphens, and apostrophes"
        return ""
      
      case "email":
        if (!value.trim()) return "Email address is required"
        if (!validateEmail(value.trim())) return "Please enter a valid email address"
        return ""
      
      case "platform":
        if (!value) return "Please select a platform"
        return ""
      
      case "socialHandle":
        if (!value.trim()) return "Social media handle is required"
        if (value.trim().length < 2) return "Handle must be at least 2 characters"
        if (value.trim().length > 50) return "Handle must be less than 50 characters"
        return ""
      
      case "followers":
        if (!value.trim()) return "Follower count is required"
        // Allow formats like: 1K, 10K, 100K, 1M, 10M, 1000, 10000, etc.
        const followerRegex = /^(\d+[KMB]?|\d+\.\d+[KMB]?)$/i
        if (!followerRegex.test(value.trim())) return "Please enter a valid follower count (e.g., 10K, 50K, 1M)"
        return ""
      
      case "reason":
        if (value.trim().length > 500) return "Reason must be less than 500 characters"
        return ""
      
      default:
        return ""
    }
  }

  // Validate current step
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (step === 1) {
      const nameError = validateField("name", formData.name)
      const emailError = validateField("email", formData.email)
      if (nameError) newErrors.name = nameError
      if (emailError) newErrors.email = emailError
    } else if (step === 2) {
      const platformError = validateField("platform", formData.platform)
      const handleError = validateField("socialHandle", formData.socialHandle)
      const followersError = validateField("followers", formData.followers)
      if (platformError) newErrors.platform = platformError
      if (handleError) newErrors.socialHandle = handleError
      if (followersError) newErrors.followers = followersError
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < totalSteps) {
        setCurrentStep(currentStep + 1)
      }
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all steps before submitting
    let isValid = true
    const allErrors: Record<string, string> = {}
    
    // Validate step 1
    const nameError = validateField("name", formData.name)
    const emailError = validateField("email", formData.email)
    if (nameError) { allErrors.name = nameError; isValid = false }
    if (emailError) { allErrors.email = emailError; isValid = false }
    
    // Validate step 2
    const platformError = validateField("platform", formData.platform)
    const handleError = validateField("socialHandle", formData.socialHandle)
    const followersError = validateField("followers", formData.followers)
    if (platformError) { allErrors.platform = platformError; isValid = false }
    if (handleError) { allErrors.socialHandle = handleError; isValid = false }
    if (followersError) { allErrors.followers = followersError; isValid = false }
    
    // Validate step 3 (optional field)
    const reasonError = validateField("reason", formData.reason)
    if (reasonError) { allErrors.reason = reasonError; isValid = false }
    
    setErrors(allErrors)
    setTouched({
      name: true,
      email: true,
      platform: true,
      socialHandle: true,
      followers: true,
      reason: true,
    })
    
    if (!isValid) {
      // Go to first step with errors
      if (allErrors.name || allErrors.email) {
        setCurrentStep(1)
      } else if (allErrors.platform || allErrors.socialHandle || allErrors.followers) {
        setCurrentStep(2)
      } else {
        setCurrentStep(3)
      }
      return
    }
    
    setIsSubmitting(true)
    
    try {
      if (!user || !user.uid) {
        alert("You must be logged in to submit an application")
        router.push("/influencer/auth")
        return
      }

      const response = await fetch("/api/influencer/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          platform: formData.platform,
          socialHandle: formData.socialHandle.trim(),
          followers: formData.followers.trim(),
          reason: formData.reason.trim(),
          userId: user.uid, // Firebase Auth UID
        }),
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Auto-approved - redirect to dashboard
        router.push("/influencer/dashboard")
      } else {
        alert(result.error || "Failed to submit application")
      }
    } catch (error) {
      console.error("Error submitting application:", error)
      alert("Failed to submit application. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors({ ...errors, [name]: "" })
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setTouched({ ...touched, [name]: true })
    
    // Validate field on blur
    const error = validateField(name, value)
    if (error) {
      setErrors({ ...errors, [name]: error })
    } else {
      setErrors({ ...errors, [name]: "" })
    }
  }

  const canProceedStep1 = 
    formData.name.trim() !== "" && 
    formData.email.trim() !== "" && 
    validateEmail(formData.email.trim()) &&
    !errors.name && 
    !errors.email

  const canProceedStep2 = 
    formData.platform !== "" && 
    formData.socialHandle.trim() !== "" && 
    formData.followers.trim() !== "" &&
    !errors.platform && 
    !errors.socialHandle && 
    !errors.followers

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render form if not authenticated (will redirect)
  if (!user) {
    return null
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
                    <p className="text-sm text-white font-medium">{user.email}</p>
                  </div>
                  <motion.button
                    onClick={handleLogout}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Sign Out
                  </motion.button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8">
                  <Image src="/icon.png" alt="Nomli Mingle" fill className="object-contain" />
                </div>
                <span className="text-sm text-white/50 font-medium">Nomli Mingle</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 lg:pt-32 lg:pb-24">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto">
            {/* Left Side */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <motion.div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-6"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY }}
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
                <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                  Invite. Build. Earn.
                </span>
              </h1>
              <p className="text-xl text-white/70 leading-relaxed mb-4">
                Join the Nomli Mingle Influencer Program and earn rewards for bringing real, active users into a
                growing social platform.
              </p>
              <div className="mb-8 p-4 rounded-xl bg-primary/10 border border-primary/20">
                <p className="text-sm text-primary/90">
                  <strong>Invite-Only Program:</strong> This is an exclusive program with limited spots. Referral rewards may pause at any time.
                </p>
              </div>
              <motion.a
                href="#apply"
                className="inline-block"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="px-8 py-4 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold text-lg shadow-lg shadow-primary/30 cursor-pointer text-center">
                  Apply as an Influencer
                </div>
              </motion.a>
            </motion.div>

            {/* Right Side - Abstract Illustration */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative h-[400px] lg:h-[500px]"
            >
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Abstract avatars/connections */}
                <div className="relative w-full h-full">
                  <motion.div
                    className="absolute top-0 left-1/4 w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 blur-xl"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY }}
                  />
                  <motion.div
                    className="absolute top-1/2 right-1/4 w-32 h-32 rounded-full bg-gradient-to-br from-accent/30 to-primary/30 blur-xl"
                    animate={{ scale: [1.2, 1, 1.2], opacity: [0.8, 0.5, 0.8] }}
                    transition={{ duration: 5, repeat: Number.POSITIVE_INFINITY, delay: 1 }}
                  />
                  <motion.div
                    className="absolute bottom-0 left-1/2 w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 blur-xl"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, delay: 2 }}
                  />
                  {/* Connection lines */}
                  <svg className="absolute inset-0 w-full h-full opacity-20">
                    <motion.line
                      x1="25%"
                      y1="0%"
                      x2="50%"
                      y2="50%"
                      stroke="url(#gradient1)"
                      strokeWidth="2"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 2, delay: 1 }}
                    />
                    <motion.line
                      x1="75%"
                      y1="50%"
                      x2="50%"
                      y2="100%"
                      stroke="url(#gradient2)"
                      strokeWidth="2"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 2, delay: 1.5 }}
                    />
                    <defs>
                      <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                      <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* What is This Section */}
      <section className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto"
          >
            <div className="p-8 lg:p-12 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">What is the Nomli Influencer Program?</h2>
              <p className="text-lg text-white/70 leading-relaxed">
                This is a private invite program for creators who believe in building real communities. You invite
                people, we track real engagement, and you get rewarded for quality — not spam.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-white/60 text-lg">Simple steps to start earning</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative group"
              >
                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 left-full w-full h-0.5 z-0">
                    <motion.div
                      className="h-full bg-gradient-to-r from-white/20 to-transparent"
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
                      style={{ transformOrigin: "left" }}
                    />
                  </div>
                )}

                <motion.div
                  className="relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm h-full group-hover:border-primary/50 transition-colors"
                  whileHover={{ y: -5, scale: 1.02 }}
                >
                  {/* Number Badge */}
                  <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-sm">{step.number}</span>
                  </div>

                  {/* Icon */}
                  <motion.div
                    className={`w-14 h-14 rounded-xl bg-gradient-to-br ${step.gradient} flex items-center justify-center mb-4`}
                    style={{ boxShadow: `0 10px 30px ${step.color}30` }}
                    whileHover={{ rotate: 5, scale: 1.1 }}
                  >
                    <step.icon className="w-7 h-7 text-white" />
                  </motion.div>

                  {/* Content */}
                  <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{step.description}</p>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Reward Milestones Section */}
      <section className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4">Reward Milestones</h2>
            <p className="text-white/60 text-lg">Earn rewards as you grow your community</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-8">
            {milestones.map((milestone, index) => (
              <motion.div
                key={milestone.users}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm text-center group hover:border-primary/50 transition-colors"
              >
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="w-8 h-8" style={{ color: milestone.color }} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">{milestone.users}</h3>
                <p className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  {milestone.reward}
                </p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center space-y-3"
          >
            <p className="text-white/60 text-sm">
              *Only fully active users are counted. Spam or inactive accounts are excluded.
            </p>
            <p className="text-yellow-400/80 text-sm">
              <strong>Note:</strong> Referral rewards are currently limited and may pause at any time. Payouts require manual verification.
            </p>
          </motion.div>
        </div>
      </section>

      {/* What Counts as Active Section */}
      <section className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto"
          >
            <div className="p-8 lg:p-12 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <h2 className="text-3xl font-bold text-white mb-6">What Counts as "Active"?</h2>
              <p className="text-white/60 mb-6">
                To count toward your milestones, referred users must complete <strong>all</strong> of the following:
              </p>
              <div className="space-y-4 mb-6">
                {activeRequirements.map((requirement, index) => (
                  <motion.div
                    key={requirement}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-white/80">{requirement}</span>
                  </motion.div>
                ))}
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-sm text-white/60">
                  <strong className="text-white">Why these requirements?</strong> We want to reward you for bringing real, engaged users to Nomli Mingle—not spam accounts or inactive profiles.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Application Form Section */}
      <section id="apply" className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto"
          >
            <div className="p-8 lg:p-12 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-2">Apply as an Influencer</h2>
              <p className="text-white/60 mb-8">Fill out the form below to join our creator program</p>

              <form onSubmit={handleSubmit}>
                  {/* Progress Steps */}
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                      {[1, 2, 3].map((step) => (
                        <div key={step} className="flex items-center flex-1">
                          <div className="flex items-center">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                                currentStep >= step
                                  ? "bg-gradient-to-br from-primary to-accent text-white"
                                  : "bg-white/5 border border-white/10 text-white/50"
                              }`}
                            >
                              {currentStep > step ? (
                                <CheckCircle2 className="w-5 h-5" />
                              ) : (
                                step
                              )}
                            </div>
                            {step < totalSteps && (
                              <div
                                className={`h-1 flex-1 mx-2 transition-all ${
                                  currentStep > step ? "bg-primary" : "bg-white/10"
                                }`}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-white/60">
                      <span>Personal Info</span>
                      <span>Social Media</span>
                      <span>Additional Info</span>
                    </div>
                  </div>

                  {/* Step 1: Personal Information */}
                  {currentStep === 1 && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-white/80 mb-2">
                          Full Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          required
                          className={`w-full px-4 py-3 rounded-xl bg-white/5 border ${
                            errors.name && touched.name
                              ? "border-red-500 focus:border-red-500"
                              : "border-white/10 focus:border-primary"
                          } text-white placeholder-white/30 focus:outline-none transition-colors`}
                          placeholder="John Doe"
                        />
                        {errors.name && touched.name && (
                          <p className="mt-1 text-sm text-red-400">{errors.name}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-2">
                          Email Address <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          required
                          className={`w-full px-4 py-3 rounded-xl bg-white/5 border ${
                            errors.email && touched.email
                              ? "border-red-500 focus:border-red-500"
                              : "border-white/10 focus:border-primary"
                          } text-white placeholder-white/30 focus:outline-none transition-colors`}
                          placeholder="john@example.com"
                        />
                        {errors.email && touched.email && (
                          <p className="mt-1 text-sm text-red-400">{errors.email}</p>
                        )}
                      </div>

                      <div className="flex gap-3 pt-4">
                        <motion.button
                          type="button"
                          onClick={handleNext}
                          disabled={!canProceedStep1}
                          className="flex-1 px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          whileHover={{ scale: canProceedStep1 ? 1.02 : 1 }}
                          whileTap={{ scale: canProceedStep1 ? 0.98 : 1 }}
                        >
                          Next
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Social Media Information */}
                  {currentStep === 2 && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div>
                        <label htmlFor="platform" className="block text-sm font-medium text-white/80 mb-2">
                          Primary Platform <span className="text-red-400">*</span>
                        </label>
                        <select
                          id="platform"
                          name="platform"
                          value={formData.platform}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          required
                          className={`w-full px-4 py-3 rounded-xl bg-white/10 border ${
                            errors.platform && touched.platform
                              ? "border-red-500 focus:border-red-500"
                              : "border-white/20 focus:border-primary"
                          } text-white focus:outline-none transition-colors [&>option]:bg-[#1a1a2e] [&>option]:text-white`}
                        >
                          <option value="" className="bg-[#1a1a2e] text-white/50">Select platform</option>
                          <option value="instagram" className="bg-[#1a1a2e] text-white">Instagram</option>
                          <option value="youtube" className="bg-[#1a1a2e] text-white">YouTube</option>
                          <option value="twitter" className="bg-[#1a1a2e] text-white">Twitter/X</option>
                          <option value="facebook" className="bg-[#1a1a2e] text-white">Facebook</option>
                          <option value="tiktok" className="bg-[#1a1a2e] text-white">TikTok</option>
                          <option value="other" className="bg-[#1a1a2e] text-white">Other</option>
                        </select>
                        {errors.platform && touched.platform && (
                          <p className="mt-1 text-sm text-red-400">{errors.platform}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="socialHandle" className="block text-sm font-medium text-white/80 mb-2">
                          Social Media Handle <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          id="socialHandle"
                          name="socialHandle"
                          value={formData.socialHandle}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          required
                          className={`w-full px-4 py-3 rounded-xl bg-white/5 border ${
                            errors.socialHandle && touched.socialHandle
                              ? "border-red-500 focus:border-red-500"
                              : "border-white/10 focus:border-primary"
                          } text-white placeholder-white/30 focus:outline-none transition-colors`}
                          placeholder="@yourhandle"
                        />
                        {errors.socialHandle && touched.socialHandle && (
                          <p className="mt-1 text-sm text-red-400">{errors.socialHandle}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="followers" className="block text-sm font-medium text-white/80 mb-2">
                          Approximate Follower Count <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          id="followers"
                          name="followers"
                          value={formData.followers}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          required
                          className={`w-full px-4 py-3 rounded-xl bg-white/5 border ${
                            errors.followers && touched.followers
                              ? "border-red-500 focus:border-red-500"
                              : "border-white/10 focus:border-primary"
                          } text-white placeholder-white/30 focus:outline-none transition-colors`}
                          placeholder="e.g., 10K, 50K, 1M"
                        />
                        {errors.followers && touched.followers && (
                          <p className="mt-1 text-sm text-red-400">{errors.followers}</p>
                        )}
                      </div>

                      <div className="flex gap-3 pt-4">
                        <motion.button
                          type="button"
                          onClick={handlePrevious}
                          className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          Previous
                        </motion.button>
                        <motion.button
                          type="button"
                          onClick={handleNext}
                          disabled={!canProceedStep2}
                          className="flex-1 px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          whileHover={{ scale: canProceedStep2 ? 1.02 : 1 }}
                          whileTap={{ scale: canProceedStep2 ? 0.98 : 1 }}
                        >
                          Next
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Additional Information */}
                  {currentStep === 3 && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div>
                        <label htmlFor="reason" className="block text-sm font-medium text-white/80 mb-2">
                          Why do you want to join? <span className="text-white/50">(Optional)</span>
                        </label>
                        <textarea
                          id="reason"
                          name="reason"
                          value={formData.reason}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          maxLength={500}
                          rows={5}
                          className={`w-full px-4 py-3 rounded-xl bg-white/5 border ${
                            errors.reason && touched.reason
                              ? "border-red-500 focus:border-red-500"
                              : "border-white/10 focus:border-primary"
                          } text-white placeholder-white/30 focus:outline-none transition-colors resize-none`}
                          placeholder="Tell us about yourself and why you're interested in joining the Nomli Mingle Influencer Program..."
                        />
                        <div className="flex justify-between items-center mt-1">
                          {errors.reason && touched.reason && (
                            <p className="text-sm text-red-400">{errors.reason}</p>
                          )}
                          <p className="text-xs text-white/50 ml-auto">
                            {formData.reason.length}/500 characters
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-4">
                        <motion.button
                          type="button"
                          onClick={handlePrevious}
                          className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          Previous
                        </motion.button>
                        <motion.button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex-1 px-8 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold text-lg shadow-lg shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                          whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
                          whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
                        >
                          {isSubmitting ? "Submitting..." : "Submit Application"}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </form>
            </div>
          </motion.div>
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
              <p className="text-white/60 text-lg mb-4">Questions about the program?</p>
              <a href="mailto:hello@nomli.cc" className="text-primary hover:underline font-semibold text-xl">
                hello@nomli.cc
              </a>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
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

