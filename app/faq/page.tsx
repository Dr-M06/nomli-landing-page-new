import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { Header } from "@/components/Header"
import { FooterSimple } from "@/components/footer-simple"
import { HelpCircle } from "lucide-react"

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Nomli Mingle — frequently asked questions about the app, accounts, privacy, and support.",
}

function FaqItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group border-b border-neutral-200/90 last:border-b-0">
      <summary className="cursor-pointer list-none py-4 pr-8 text-[15px] font-medium leading-snug text-neutral-950 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="relative block pl-0 transition-colors group-open:text-fuchsia-800">
          {question}
          <span
            className="pointer-events-none absolute right-0 top-1/2 inline-block h-5 w-5 -translate-y-1/2 text-neutral-400 transition-transform group-open:rotate-180"
            aria-hidden
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </span>
      </summary>
      <div className="pb-5 text-sm leading-relaxed text-neutral-600 [&_a]:font-medium [&_a]:text-fuchsia-700 [&_a]:underline-offset-2 hover:[&_a]:text-fuchsia-900">
        {children}
      </div>
    </details>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-serif text-xl font-medium tracking-tight text-neutral-950 sm:text-2xl">{title}</h2>
      <div className="mt-2 rounded-2xl border border-neutral-200/80 bg-white px-1 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:px-2">
        {children}
      </div>
    </section>
  )
}

export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f6f3] text-neutral-900 antialiased">
      <Header variant="light" />

      <main id="main-content" className="flex-1 px-5 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-28">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-neutral-200/80">
              <HelpCircle className="h-5 w-5 text-fuchsia-600" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Help</p>
              <h1 className="mt-2 font-serif text-3xl font-medium leading-[1.15] tracking-tight text-neutral-950 sm:text-4xl">
                Nomli Mingle FAQ
              </h1>
              <p className="mt-4 text-base leading-relaxed text-neutral-600 sm:text-[1.0625rem]">
                Quick answers about Nomli Mingle. In-app settings and any notice we send take priority if something
                differs here.
              </p>
            </div>
          </div>

          <nav
            aria-label="FAQ sections"
            className="mt-10 flex flex-wrap gap-2 rounded-2xl border border-neutral-200/80 bg-white/80 p-4 text-xs font-medium text-neutral-600 backdrop-blur-sm"
          >
            {[
              ["about", "About"],
              ["accounts", "Accounts"],
              ["app", "App & performance"],
              ["contact", "Contact"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-full border border-neutral-200/90 bg-[#f7f6f3] px-3 py-1.5 transition-colors hover:border-neutral-300 hover:text-neutral-900"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="mt-12 space-y-14 sm:mt-14 sm:space-y-16">
            <Section id="about" title="About Nomli Mingle">
              <FaqItem question="What is Nomli Mingle?">
                <p>
                  Nomli Mingle is a social app for posts, chat, stories, and communities. Our line is:{" "}
                  <strong className="font-medium text-neutral-800">Beyond borders. Beyond limits.</strong>
                </p>
              </FaqItem>
              <FaqItem question="Where can I get the app?">
                <p>
                  On the App Store and Google Play (search &quot;Nomli Mingle&quot; or use the links from our site).
                </p>
              </FaqItem>
              <FaqItem question="Is the app the same on iPhone and Android?">
                <p>
                  Mostly yes. A few system dialogs and store flows may look different because Apple and Google handle
                  them separately.
                </p>
              </FaqItem>
            </Section>

            <Section id="accounts" title="Accounts & sign-in">
              <FaqItem question="How do I create an account?">
                <p>
                  Download the app and sign up with the options shown on the login screen (for example Google where
                  available). Complete your profile when prompted.
                </p>
              </FaqItem>
              <FaqItem question="I signed in with Google but ended up on profile setup—why?">
                <p>
                  The app checks that your profile is complete. If data is still loading or incomplete, you may be asked
                  to finish setup before the home experience unlocks.
                </p>
              </FaqItem>
              <FaqItem question="How do I delete my account or get my data?">
                <p>
                  Use in-app settings if available, or email{" "}
                  <a href="mailto:support@nomlimingle.com">support@nomlimingle.com</a> with your request. We&apos;ll
                  point you to the right flow or process.
                </p>
              </FaqItem>
            </Section>

            <Section id="app" title="App updates & performance">
              <FaqItem question="How do I get the latest version?">
                <p>Update from the App Store or Google Play. Turning on automatic updates helps.</p>
              </FaqItem>
              <FaqItem question="A feature crashed or video won&apos;t play—what should I try?">
                <p>
                  Update the app, restart the phone, and try again on Wi‑Fi. If it persists, email{" "}
                  <a href="mailto:support@nomlimingle.com">support@nomlimingle.com</a> with your device model, OS
                  version, and what you were doing.
                </p>
              </FaqItem>
              <FaqItem question="Where are the legal links?">
                <p>
                  Privacy:{" "}
                  <Link href="/privacy" className="text-fuchsia-700 underline-offset-2 hover:text-fuchsia-900">
                    nomlimingle.com/privacy
                  </Link>
                  . Terms:{" "}
                  <Link href="/terms" className="text-fuchsia-700 underline-offset-2 hover:text-fuchsia-900">
                    nomlimingle.com/terms
                  </Link>
                  .
                </p>
              </FaqItem>
            </Section>

            <Section id="contact" title="Email, privacy & contact">
              <FaqItem question="Why did I get email from Nomli Mingle?">
                <p>
                  We may send product updates or security notices. Use the unsubscribe link in marketing emails where
                  provided.
                </p>
              </FaqItem>
              <FaqItem question="Who do I contact for help?">
                <p>
                  <a href="mailto:support@nomlimingle.com">support@nomlimingle.com</a>
                </p>
              </FaqItem>
              <FaqItem question="Official site">
                <p>
                  <a href="https://www.nomlimingle.com" target="_blank" rel="noopener noreferrer">
                    https://www.nomlimingle.com
                  </a>
                </p>
              </FaqItem>
            </Section>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50"
              >
                ← Home
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
              >
                About
              </Link>
              <Link
                href="/privacy"
                className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
              >
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </main>

      <FooterSimple />
    </div>
  )
}
