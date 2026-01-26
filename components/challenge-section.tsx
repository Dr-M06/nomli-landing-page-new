"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Trophy, Video, Hash, Share2, Users, Award, CheckCircle2, Sparkles } from "lucide-react"

const steps = [
  {
    number: "01",
    title: "Create Your Video",
    description: "Create a 15-second video about Nomli Mingle. Be creative — tell your story, show features, or share why you love the app.",
    icon: Video,
    color: "#8b5cf6",
  },
  {
    number: "02",
    title: "Add the Hashtag",
    description: "Add #NomliMingleChallenge to your caption. Make sure it's visible!",
    icon: Hash,
    color: "#06b6d4",
  },
  {
    number: "03",
    title: "Post on Social Media",
    description: "Post on your Instagram, TikTok, X, Facebook, or any platform. Your post must be public.",
    icon: Share2,
    color: "#10b981",
  },
  {
    number: "04",
    title: "Team Selection",
    description: "The Nomli Mingle team will randomly pick 5 videos to be featured in the app for community voting.",
    icon: Users,
    color: "#f59e0b",
  },
  {
    number: "05",
    title: "Community Voting",
    description: "Voting happens only on Nomli Mingle. The community decides the winners!",
    icon: Award,
    color: "#ef4444",
  },
]

const prizes = [
  {
    place: "1st Place",
    amount: "₦100,000",
    emoji: "🥇",
    gradient: "from-yellow-500 to-amber-600",
  },
  {
    place: "2nd Place",
    amount: "₦100,000",
    emoji: "🥈",
    gradient: "from-gray-400 to-gray-600",
  },
  {
    place: "3rd - 5th Place",
    amount: "₦50,000 each",
    emoji: "🥉",
    gradient: "from-orange-500 to-red-600",
  },
]

const rules = [
  "One entry per user",
  "No fake accounts or bots",
  "Offensive or misleading content = disqualification",
  "Nomli Mingle reserves the right to remove any entry",
]

export function ChallengeSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section
      id="challenge"
      ref={ref}
      className="relative py-32 bg-gradient-to-b from-background via-[#0a0a1a] to-background overflow-hidden"
    >
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[180px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[150px]" />
      </div>
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.02]" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : {}}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent mb-6"
          >
            <Trophy className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-4">
            🏆 Nomli Mingle Video Challenge
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Create. Post. Get Voted. Get Paid.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className="relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm hover:border-white/20 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: step.color }}
                  >
                    {step.number}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-5 h-5" style={{ color: step.color }} />
                      <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Prizes Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mb-20"
        >
          <div className="text-center mb-12">
            <h3 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">💰 Prizes</h3>
            <p className="text-muted-foreground">Win real cash by showcasing your creativity</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {prizes.map((prize, index) => (
              <motion.div
                key={prize.place}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.7 + index * 0.1, duration: 0.5 }}
                className={`relative p-8 rounded-2xl bg-gradient-to-br ${prize.gradient} text-white overflow-hidden`}
              >
                <div className="absolute top-4 right-4 text-6xl opacity-20">{prize.emoji}</div>
                <div className="relative z-10">
                  <div className="text-4xl mb-2">{prize.emoji}</div>
                  <h4 className="text-xl font-bold mb-2">{prize.place}</h4>
                  <p className="text-2xl font-bold">{prize.amount}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Rules & Why Join */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Rules */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm"
          >
            <h3 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-primary" />
              Rules & Notes
            </h3>
            <ul className="space-y-3">
              {rules.map((rule, index) => (
                <li key={index} className="flex items-start gap-3 text-muted-foreground">
                  <span className="text-primary mt-1">•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Why Join */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 backdrop-blur-sm"
          >
            <h3 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-accent" />
              Why Join?
            </h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                <span className="text-foreground">Get featured on Nomli Mingle</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                <span className="text-foreground">Win real cash 💸</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                <span className="text-foreground">Be part of a growing global community</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                <span className="text-foreground">Let your creativity speak</span>
              </li>
            </ul>
          </motion.div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1, duration: 0.6 }}
          className="text-center mt-16"
        >
          <motion.div
            className="inline-block px-8 py-4 rounded-full bg-gradient-to-r from-primary to-accent text-white font-bold text-xl shadow-lg shadow-primary/30"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            #NomliMingleChallenge
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
