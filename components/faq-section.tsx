"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqItems: { question: string; answer: React.ReactNode }[] = [
  {
    question: "What is Nomli Mingle?",
    answer: "One app for dating, livestreaming, chat, and communities. Connect with people nearby or worldwide.",
  },
  {
    question: "How do I find dates or people near me?",
    answer: "Use Discover or Nearby to see people by location and interests. Your exact location is never shared — we use approximate area only.",
  },
  {
    question: "How does livestreaming work?",
    answer: "Tap Go Live, add a title, and start. Viewers can send gifts, join as guests (up to 3), and react in real time.",
  },
  {
    question: "How do I earn or use tokens?",
    answer: "Buy tokens in-app (iOS and Android). Earn by receiving livestream gifts or through the Daily Contributor Program. Use them for gifts and in-app features.",
  },
  {
    question: "Can't buy tokens in my region?",
    answer: (
      <>
        Some regions don&apos;t support in-app purchases on the App Store or Google Play. You can still buy Mingle tokens securely from our{" "}
        <a href="https://wallet.nomlimingle.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
          Web Wallet
        </a>
        .
      </>
    ),
  },
  {
    question: "How do I sign up or reset my password?",
    answer: "Download the app, tap Sign Up, and follow the steps. For password reset, use Forgot Password on the sign-in screen and check your email.",
  },
  {
    question: "How do I report someone or delete my account?",
    answer: "Tap the ⋯ on a post, message, or profile and choose Report. To delete your account: Profile → Settings → Account Settings → Delete Account. This is permanent.",
  },
]

export function FaqSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section
      id="faq"
      ref={ref}
      className="relative py-20 sm:py-24 bg-[#fafafa] overflow-hidden"
    >
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] mb-2">
            FAQ
          </h2>
          <p className="text-[#666] text-sm">
            Questions? <a href="mailto:hello@nomli.cc" className="text-primary hover:underline">hello@nomli.cc</a> or Profile → Help in the app.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-2xl mx-auto"
        >
          <Accordion type="single" collapsible className="w-full space-y-2">
            {faqItems.map((item, i) => (
              <AccordionItem
                key={item.question}
                value={`item-${i}`}
                className="bg-white rounded-xl border border-gray-100 px-5 py-1"
              >
                <AccordionTrigger className="text-left font-medium text-[#1a1a1a] hover:no-underline py-4 hover:text-primary text-sm sm:text-base">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-[#555] text-sm leading-relaxed pb-4">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  )
}
