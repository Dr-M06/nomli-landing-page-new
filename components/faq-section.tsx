"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { HelpCircle } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqCategories = [
  {
    title: "Earning & Rewards",
    items: [
      {
        question: "How do I earn on Nomli Mingle?",
        answer: (
          <div className="space-y-3">
            <p>There are several ways to earn tokens on Nomli Mingle:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>
                <strong>Livestream Gifts</strong>: When you go live, viewers can send you gifts during your stream. You earn tokens equal to the value of gifts received. The more engaging your content, the more gifts you'll receive from your viewers!
              </li>
              <li>
                <strong>Daily Contributor Rewards</strong>: Engage with the community by liking and commenting on posts. Your contributions are ranked daily, and top contributors earn token rewards based on their rank and contribution score. Check the Daily Scoreboard to see your ranking and claim your rewards!
              </li>
              <li>
                <strong>Community Engagement</strong>: Stay active by participating in community posts, polls, and discussions to build your contribution score and earn rewards.
              </li>
            </ol>
          </div>
        ),
      },
      {
        question: "How do I withdraw my earnings?",
        answer: (
          <div className="space-y-3">
            <p>When withdrawals are available, you'll be able to:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>
                <strong>Bank Transfer</strong>: Withdraw your tokens directly to your bank account through our secure payment partner. You'll need to verify your bank account details in your profile settings. Withdrawal limits and fees depend on your payout tier.
              </li>
              <li>
                <strong>Airtime/Data Bundles</strong>: Redeem your tokens for mobile airtime or data bundles directly from the app.
              </li>
            </ol>
            <p className="text-sm text-muted-foreground">
              You can buy tokens in-app on iOS and Android, and earn more through the Daily Contributor Program by liking and commenting on posts. Check the Daily Scoreboard to claim your rewards!
            </p>
          </div>
        ),
      },
      {
        question: "Can I purchase tokens?",
        answer: (
          <div className="space-y-3">
            <p className="font-semibold text-primary">
              Yes! You can buy tokens in-app on both Apple (iOS) and Android.
            </p>
            <p>Open the Nomli Mingle app, go to the Wallet section, and follow the in-app purchase flow for your device.</p>
            <p>You can also earn tokens by:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Participating in the Daily Contributor Program (like and comment on posts)</li>
              <li>Receiving gifts during livestreams (if you're a streamer)</li>
              <li>Engaging with the community through posts, polls, and discussions</li>
            </ul>
          </div>
        ),
      },
    ],
  },
  {
    title: "Making Connections",
    items: [
      {
        question: "How do I make international friends?",
        answer: (
          <div className="space-y-3">
            <p>Nomli Mingle makes it easy to connect with people from around the world:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>
                <strong>Country-Based Chat Rooms</strong>: Join public chat rooms for different countries. You can chat with people from Nigeria, Ghana, Kenya, the United States, United Kingdom, and many more countries. Look for the "World Chat" or country-specific rooms in the chat section.
              </li>
              <li>
                <strong>Discover & Nearby</strong>: Use the Discover feature to find users based on location and shared interests. You can filter by country, interests, and distance to find people you'd like to connect with.
              </li>
              <li>
                <strong>Community Posts</strong>: Engage with community posts from users worldwide. Comment, like, and share to start conversations and build friendships.
              </li>
              <li>
                <strong>Events & Meetups</strong>: Join or create events where you can meet people from different countries, both online and in-person.
              </li>
              <li>
                <strong>Live Streaming</strong>: Watch livestreams from creators around the world and interact with them and other viewers in real-time.
              </li>
            </ol>
          </div>
        ),
      },
      {
        question: "How do I find people near me?",
        answer: (
          <div className="space-y-3">
            <p>Use the "Nearby" feature to discover users in your area:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>Enable location permissions when prompted</li>
              <li>The app will show you users within a certain radius</li>
              <li>You can filter by distance, interests, and other preferences</li>
              <li>Tap on a profile to view their details and start a conversation</li>
            </ol>
            <p className="text-sm text-primary font-medium">
              Privacy Note: Your exact location is never shared. The app uses approximate coordinates to show your general area while protecting your privacy.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    title: "Features & Usage",
    items: [
      {
        question: "How does livestreaming work?",
        answer: (
          <div className="space-y-3">
            <p>Livestreaming on Nomli Mingle is simple:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>
                <strong>Start a Stream</strong>: Tap the "Go Live" button, add a title and description, and start broadcasting
              </li>
              <li>
                <strong>Earn from Gifts</strong>: Viewers can send you gifts during your stream. You earn tokens equal to the value of gifts received from your audience
              </li>
              <li>
                <strong>Guest Mode</strong>: Invite viewers to join your stream as guests/co-hosts for interactive sessions
              </li>
              <li>
                <strong>Viewer Interactions</strong>: Viewers can react with honks and applause, send messages, and interact in real-time
              </li>
              <li>
                <strong>Stream Controls</strong>: Toggle your camera, microphone, and switch between front/back cameras while streaming
              </li>
            </ol>
            <p className="text-sm text-muted-foreground">
              Requirements: You need camera and microphone permissions to start a livestream.
            </p>
          </div>
        ),
      },
      {
        question: "How do I create or join events?",
        answer: (
          <div className="space-y-3">
            <div>
              <p className="font-semibold mb-2">Creating Events:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Go to the Events tab</li>
                <li>Tap "Create Event"</li>
                <li>Fill in event details (name, description, date, time, location)</li>
                <li>Set event preferences and visibility</li>
                <li>Share your event with the community</li>
              </ol>
            </div>
            <div>
              <p className="font-semibold mb-2">Joining Events:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Browse events in the Events tab</li>
                <li>Tap on an event to view details</li>
                <li>Tap "Join Event" to RSVP</li>
                <li>Get notified when the event is about to start</li>
              </ol>
            </div>
            <p className="text-sm text-muted-foreground">
              You can see who's attending, chat with other attendees, and get reminders for events you've joined.
            </p>
          </div>
        ),
      },
      {
        question: "How do I send messages and make calls?",
        answer: (
          <div className="space-y-3">
            <div>
              <p className="font-semibold mb-2">Messaging:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Go to the Chat tab</li>
                <li>Select an existing conversation or start a new one</li>
                <li>Type your message and send</li>
                <li>Messages are delivered in real-time</li>
              </ol>
            </div>
            <div>
              <p className="font-semibold mb-2">Video/Audio Calls:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Open a chat conversation</li>
                <li>Tap the video or phone icon</li>
                <li>Wait for the other person to accept</li>
                <li>Enjoy your call!</li>
              </ol>
            </div>
            <p className="text-sm text-muted-foreground">
              Note: Both users need to be online and have the app open to receive calls.
            </p>
          </div>
        ),
      },
      {
        question: "What are community posts?",
        answer: (
          <div className="space-y-3">
            <p>Community posts are public posts where you can:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Share updates, thoughts, and media</li>
              <li>Create polls to get community opinions</li>
              <li>Ask questions and get answers</li>
              <li>Use hashtags to reach more people</li>
              <li>Like, comment, and bookmark posts</li>
              <li>React with likes, laughs, and other emojis</li>
            </ul>
            <p>Community posts help you connect with a wider audience beyond your direct connections.</p>
          </div>
        ),
      },
      {
        question: "How do I customize my profile?",
        answer: (
          <div className="space-y-3">
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Go to your Profile</li>
              <li>Tap "Edit Profile"</li>
              <li>Update your:
                <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                  <li>Profile picture</li>
                  <li>Bio and interests</li>
                  <li>Location (optional)</li>
                  <li>Privacy settings</li>
                  <li>Notification preferences</li>
                </ul>
              </li>
            </ol>
            <p>A complete profile helps others find and connect with you!</p>
          </div>
        ),
      },
    ],
  },
  {
    title: "Account & Security",
    items: [
      {
        question: "How do I sign up?",
        answer: (
          <ol className="list-decimal list-inside space-y-1 ml-4">
            <li>Download the Nomli Mingle app</li>
            <li>Tap "Sign Up"</li>
            <li>Enter your email and create a password</li>
            <li>Verify your email address</li>
            <li>Complete your profile setup</li>
            <li>Start connecting!</li>
          </ol>
        ),
      },
      {
        question: "How do I reset my password?",
        answer: (
          <ol className="list-decimal list-inside space-y-1 ml-4">
            <li>Go to the Sign In screen</li>
            <li>Tap "Forgot Password"</li>
            <li>Enter your email address</li>
            <li>Check your email for password reset instructions</li>
            <li>Follow the link to create a new password</li>
          </ol>
        ),
      },
      {
        question: "How do I verify my bank account for withdrawals?",
        answer: (
          <div className="space-y-3">
            <p>When withdrawals are available, you can verify your bank account through Profile → Settings in the app.</p>
            <p>You can buy tokens in-app on iOS and Android anytime, and earn more through the Daily Contributor Program by engaging with community posts.</p>
          </div>
        ),
      },
      {
        question: "How do I report inappropriate content or users?",
        answer: (
          <div>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Tap the three dots (⋯) on any post, message, or profile</li>
              <li>Select "Report"</li>
              <li>Choose the reason for reporting</li>
              <li>Add any additional details</li>
              <li>Submit your report</li>
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">
              Our moderation team reviews all reports and takes appropriate action. You can also block users directly from their profile.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    title: "Technical",
    items: [
      {
        question: "Why am I not receiving notifications?",
        answer: (
          <div className="space-y-3">
            <p>Check these settings:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>
                <strong>App Notifications</strong>: Go to your device Settings → Apps → Nomli Mingle → Notifications, and ensure notifications are enabled
              </li>
              <li>
                <strong>In-App Settings</strong>: Go to Profile → Settings → Notifications and enable the types of notifications you want
              </li>
              <li>
                <strong>Permissions</strong>: Make sure the app has notification permissions enabled
              </li>
            </ol>
          </div>
        ),
      },
      {
        question: "How do I update the app?",
        answer: (
          <div className="space-y-2">
            <p>
              <strong>iOS</strong>: Go to the App Store, search for "Nomli Mingle", and tap "Update" if available
            </p>
            <p>
              <strong>Android</strong>: Go to the Google Play Store, search for "Nomli Mingle", and tap "Update" if available
            </p>
            <p className="text-sm text-muted-foreground">
              We recommend keeping the app updated to access the latest features and bug fixes.
            </p>
          </div>
        ),
      },
      {
        question: "The app is running slowly. What can I do?",
        answer: (
          <div className="space-y-3">
            <p>Try these troubleshooting steps:</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li><strong>Restart the app</strong>: Close and reopen the app</li>
              <li><strong>Clear cache</strong>: Go to your device settings and clear the app cache</li>
              <li><strong>Check internet connection</strong>: Ensure you have a stable internet connection</li>
              <li><strong>Update the app</strong>: Make sure you're using the latest version</li>
              <li><strong>Restart your device</strong>: Sometimes a simple restart helps</li>
            </ol>
            <p className="text-sm text-muted-foreground">
              If issues persist, contact our support team.
            </p>
          </div>
        ),
      },
      {
        question: "Can I use Nomli Mingle on multiple devices?",
        answer: (
          <p>
            Yes! You can use Nomli Mingle on multiple devices with the same account. Your messages, profile, and wallet balance will sync across all devices where you're signed in.
          </p>
        ),
      },
    ],
  },
  {
    title: "Privacy & Safety",
    items: [
      {
        question: "How is my location data used?",
        answer: (
          <div className="space-y-3">
            <p>Your location is used to:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Show you nearby users (with approximate location only)</li>
              <li>Suggest relevant country chat rooms</li>
              <li>Help you discover local events</li>
            </ul>
            <p className="font-semibold text-primary">
              Your exact location is never shared with other users. The app uses approximate coordinates to protect your privacy while still enabling location-based features.
            </p>
          </div>
        ),
      },
      {
        question: "Can I make my profile private?",
        answer: (
          <div className="space-y-3">
            <p>Yes! You can control your privacy settings:</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Go to Profile → Settings → Privacy</li>
              <li>Adjust who can:
                <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                  <li>See your profile</li>
                  <li>Send you messages</li>
                  <li>See your location</li>
                  <li>View your posts</li>
                </ul>
              </li>
            </ol>
            <p>You can also block specific users from contacting you.</p>
          </div>
        ),
      },
      {
        question: "How do I delete my account?",
        answer: (
          <div className="space-y-3">
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Go to Profile → Settings</li>
              <li>Scroll to "Account Settings"</li>
              <li>Tap "Delete Account"</li>
              <li>Follow the confirmation prompts</li>
            </ol>
            <p className="font-semibold text-red-500">
              Warning: Deleting your account is permanent and cannot be undone. All your data, messages, and earnings will be permanently deleted.
            </p>
          </div>
        ),
      },
    ],
  },
]

export function FaqSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section
      id="faq"
      ref={ref}
      className="relative py-32 bg-gradient-to-b from-white via-[#fafafa] to-white overflow-hidden"
    >
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-primary/3 rounded-full blur-[180px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] bg-accent/3 rounded-full blur-[150px]" />
      </div>

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
            <HelpCircle className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1a1a1a] mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-xl text-[#666] max-w-2xl mx-auto">
            Everything you need to know about Nomli Mingle
          </p>
        </motion.div>

        {/* FAQ Accordions */}
        <div className="max-w-4xl mx-auto">
          {faqCategories.map((category, categoryIndex) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.3 + categoryIndex * 0.1, duration: 0.5 }}
              className="mb-12"
            >
              <h3 className="text-2xl font-bold text-[#1a1a1a] mb-6">{category.title}</h3>
              <Accordion type="single" collapsible className="w-full space-y-3">
                {category.items.map((item, itemIndex) => (
                  <AccordionItem
                    key={item.question}
                    value={`${categoryIndex}-${itemIndex}`}
                    className="bg-white rounded-xl border border-gray-100 px-6 shadow-sm hover:shadow-lg hover:border-primary/20 transition-all"
                  >
                    <AccordionTrigger className="text-left font-semibold text-[#1a1a1a] hover:no-underline py-6 hover:text-primary transition-colors">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-[#555] leading-relaxed pb-6">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          ))}
        </div>

        {/* Contact CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1, duration: 0.6 }}
          className="text-center mt-16"
        >
          <div className="inline-block p-8 rounded-2xl bg-white border border-gray-200 shadow-lg">
            <h3 className="text-2xl font-bold text-[#1a1a1a] mb-3">Still Have Questions?</h3>
            <p className="text-[#666] mb-4">
              If you can't find the answer you're looking for, contact our support team:
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="mailto:hello@nomli.cc"
                className="px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold hover:shadow-lg hover:shadow-primary/30 transition-all"
              >
                hello@nomli.cc
              </a>
              <p className="text-sm text-[#666]">or</p>
              <p className="text-sm text-[#666]">In-app: Go to Profile → Help & Support</p>
            </div>
            <p className="text-xs text-[#999] mt-4">Last updated: January 2025</p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
