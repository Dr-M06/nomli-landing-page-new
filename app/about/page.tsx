import Link from "next/link"
import { Header } from "@/components/Header"
import { FooterSimple } from "@/components/footer-simple"
import { Globe2, Radio, Users2, ShieldCheck } from "lucide-react"

const PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en"
const APP_STORE = "https://apps.apple.com/us/app/nomli-mingle/id6754324967"

const pillars = [
  {
    icon: Globe2,
    title: "Discovery",
    detail: "Meet people near you or across the world through interests, communities, and shared moments.",
  },
  {
    icon: Radio,
    title: "Live",
    detail: "Go live, host guests, and build real-time experiences with tools that stay out of the way.",
  },
  {
    icon: Users2,
    title: "Communities",
    detail: "Create, join conversations, and grow circles that feel intentional—not algorithmically noisy.",
  },
  {
    icon: ShieldCheck,
    title: "Safety",
    detail: "Reporting, privacy settings, and moderation so you stay in control of your experience.",
  },
]

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f6f3] text-neutral-900 antialiased">
      <Header variant="light" />

      <main id="main-content" className="flex-1 px-6 pb-20 pt-28 sm:pb-28 sm:pt-32">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">About</p>
            <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.1] tracking-tight text-neutral-950 sm:text-5xl lg:text-[3.25rem]">
              Nomli Mingle, in plain language.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-neutral-600 sm:text-[1.125rem]">
              We combine dating, livestreaming, chat, music, and communities in one app—with a layout that favors clarity
              over clutter.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-neutral-600 sm:text-[1.125rem]">
              Whether you want to meet people, share moments, or grow an audience, the product is built to feel
              deliberate, not like a pile of features.
            </p>
          </div>

          <div className="mt-12 rounded-2xl border border-neutral-200/80 bg-white p-8 shadow-sm sm:mt-14 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Mission</p>
            <p className="mt-4 font-serif text-xl font-medium leading-snug text-neutral-950 sm:text-2xl">
              Help people meet, create, and earn—safely, honestly, and across borders.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap gap-3 sm:mt-14">
            <a
              href={PLAY_STORE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-neutral-950 px-7 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Google Play
            </a>
            <a
              href={APP_STORE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-neutral-300 bg-white px-7 text-sm font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50"
            >
              App Store
            </a>
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-transparent px-5 text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
            >
              ← Home
            </Link>
          </div>

          <div className="mt-16 grid gap-4 sm:mt-20 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {pillars.map((pillar) => (
              <div
                key={pillar.title}
                className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f7f6f3] ring-1 ring-neutral-200/60">
                  <pillar.icon className="h-4 w-4 text-neutral-600" strokeWidth={1.5} aria-hidden />
                </div>
                <h2 className="mt-4 text-base font-semibold tracking-tight text-neutral-900">{pillar.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{pillar.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <FooterSimple />
    </div>
  )
}
