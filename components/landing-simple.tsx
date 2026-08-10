import Image from "next/image"
import Link from "next/link"
import { ArrowRight, MessageCircle, Users2, Video } from "lucide-react"
import { LandingDownloadButtons } from "@/components/landing-download-buttons"

const PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en"
const APP_STORE = "https://apps.apple.com/us/app/nomli-mingle/id6754324967"

const pillars = [
  {
    icon: Video,
    title: "A feed that owns the screen",
    body: "Full-bleed posts, For You and Following, reactions where your thumb already is—tap in and see what you missed.",
  },
  {
    icon: MessageCircle,
    title: "Chat that stays close",
    body: "DMs with photos, voice notes, and the people from your feed—without bouncing to another app.",
  },
  {
    icon: Users2,
    title: "People & communities",
    body: "Find profiles, follow creators, and grow circles that feel intentional—not algorithmically noisy.",
  },
]

function HeroProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[300px] sm:max-w-[320px]">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-fuchsia-500/25 via-transparent to-pink-600/20 blur-2xl"
      />
      <div className="relative rounded-[2.75rem] border border-white/10 bg-zinc-900/90 p-[10px] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_28px_56px_-8px_rgba(236,72,153,0.35),0_48px_80px_-24px_rgba(0,0,0,0.75)]">
        <div className="relative aspect-[9/19.2] overflow-hidden rounded-[2.2rem] bg-black ring-1 ring-white/5">
          <Image
            src="/Profile.png"
            alt="Nomli Mingle app screen showing the social feed, For You tab, reactions, and navigation"
            fill
            className="object-contain object-center"
            priority
            sizes="(max-width: 1024px) 300px, 340px"
          />
        </div>
      </div>
    </div>
  )
}

export function LandingSimple() {
  return (
    <div id="main-content" className="bg-[#f7f6f3] text-neutral-900 antialiased">
      <section className="relative overflow-hidden border-b border-white/10 bg-[#070708] pt-28 pb-20 text-white sm:pt-32 sm:pb-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_70%_-10%,rgba(217,70,239,0.22),transparent_50%),radial-gradient(ellipse_70%_50%_at_10%_100%,rgba(244,114,182,0.12),transparent_45%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,transparent_28%,transparent_100%)]"
        />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.02fr] lg:gap-12">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em]">
                <span className="text-white/80">Nomli</span>
                <span className="text-fuchsia-300"> · Mingle</span>
              </p>
              <h1 className="mt-5 text-[2.25rem] font-bold leading-[1.08] tracking-tight sm:text-5xl sm:leading-[1.05] lg:text-[3.25rem]">
                Social feed &amp; chat—<span className="text-white/90">one calm home,</span>{" "}
                <span className="bg-gradient-to-r from-fuchsia-300 to-pink-300 bg-clip-text text-transparent">
                  tap in.
                </span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-white/65 sm:text-[1.125rem]">
                Posts, stories, and real conversations in one place—download Nomli Mingle and join the people already in
                the feed.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  href="#download"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-500 px-7 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/50 transition-[filter] hover:brightness-110"
                >
                  Join Nomli Mingle
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
                <Link
                  href="/about"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-7 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-white/10"
                >
                  How we build
                </Link>
              </div>
              <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/45">
                <span className="inline-flex items-center gap-2">
                  <Video className="h-4 w-4 text-fuchsia-400/80" aria-hidden />
                  Feed
                </span>
                <span className="inline-flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-fuchsia-400/80" aria-hidden />
                  Chat
                </span>
                <span className="inline-flex items-center gap-2">
                  <Users2 className="h-4 w-4 text-fuchsia-400/80" aria-hidden />
                  People
                </span>
              </div>
            </div>
            <HeroProductPreview />
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-200/45 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl">
                Feed, chat, and people
              </h2>
              <p className="mt-3 text-neutral-600">
                Everything you need to share and stay close—without the clutter of five separate apps.
              </p>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-neutral-500 sm:text-right">
              Scroll the feed, open a chat, find someone new—tabs you learn once, then move at full speed.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-3">
            {pillars.map(({ icon: Icon, title, body }, i) => (
              <div
                key={title}
                className="group relative rounded-md border border-neutral-200/50 bg-white p-8 transition-colors hover:border-neutral-200/75"
              >
                <span className="text-xs font-medium tabular-nums text-fuchsia-600/70">0{i + 1}</span>
                <Icon className="mt-5 h-5 w-5 text-neutral-500" strokeWidth={1.5} aria-hidden />
                <h3 className="mt-4 text-base font-semibold tracking-tight text-neutral-900">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-white/10 bg-[#0c0c0e] py-16 text-neutral-50 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,rgba(192,38,211,0.15),transparent_55%)]"
        />
        <div className="relative mx-auto max-w-6xl px-6">
          <p className="text-center font-serif text-xl font-medium tracking-tight text-white sm:text-2xl">
            Free on iOS and Android—<span className="text-fuchsia-300">your crew is already inside.</span>
          </p>
          <div className="mx-auto mt-12 grid max-w-3xl gap-10 sm:grid-cols-3 sm:gap-8">
            <div className="text-center">
              <p className="font-serif text-3xl font-medium tabular-nums text-white sm:text-4xl">iOS</p>
              <p className="mt-2 text-sm text-white/50">App Store</p>
            </div>
            <div className="text-center sm:border-x sm:border-white/10">
              <p className="font-serif text-3xl font-medium tabular-nums text-white sm:text-4xl">Android</p>
              <p className="mt-2 text-sm text-white/50">Google Play</p>
            </div>
            <div className="text-center">
              <p className="font-serif text-3xl font-medium tabular-nums text-white sm:text-4xl">∞</p>
              <p className="mt-2 text-sm text-white/50">Feed · chat</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-200/45 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20 lg:items-center">
            <div>
              <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl">
                Built so you don&apos;t miss the moment
              </h2>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-neutral-600">
                Fewer dead ends, faster paths to the good stuff—so when someone replies or a post drops, you&apos;re
                already in the app.
              </p>
              <ul className="mt-10 space-y-4 border-t border-neutral-200/45 pt-10">
                {[
                  "Social loads full-screen—no tiny previews while everyone else is already reacting.",
                  "Feed, create, inbox, profile—tabs you learn once, then move at full speed.",
                  "No tricks with your account—you’re in control of who sees you and how you show up.",
                ].map((line) => (
                  <li key={line} className="flex gap-3 text-sm leading-relaxed text-neutral-700">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fuchsia-500/70" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="#download"
                className="mt-10 inline-flex h-12 items-center justify-center rounded-lg bg-neutral-950 px-7 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
              >
                Get Nomli Mingle
              </Link>
            </div>
            <div className="relative">
              <div className="rounded-md border border-neutral-200/50 bg-white p-10 sm:p-12">
                <blockquote className="font-serif text-2xl font-medium leading-snug tracking-tight text-neutral-900 sm:text-[1.65rem]">
                  &ldquo;I kept seeing Nomli in group chats before I downloaded—turns out half my contacts were already
                  posting here.&rdquo;
                </blockquote>
                <p className="mt-8 text-sm text-neutral-500">— Early member</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl">Voices</h2>
          <p className="mt-3 max-w-lg text-neutral-600">
            People who got tired of juggling apps—now they just open Nomli.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <figure className="rounded-md border border-neutral-200/50 bg-white p-8 sm:p-10">
              <blockquote className="text-[17px] leading-relaxed text-neutral-700">
                I opened it for one post and stayed. My group thread went quiet because everyone moved here.
              </blockquote>
              <figcaption className="mt-8 text-sm font-medium text-neutral-900">Early member</figcaption>
              <p className="text-xs text-neutral-500">Social</p>
            </figure>
            <figure className="rounded-md border border-neutral-200/50 bg-white p-8 sm:p-10">
              <blockquote className="text-[17px] leading-relaxed text-neutral-700">
                Chat and the feed in one place finally clicked. I stopped bouncing between three apps just to keep up.
              </blockquote>
              <figcaption className="mt-8 text-sm font-medium text-neutral-900">Member</figcaption>
              <p className="text-xs text-neutral-500">Chat</p>
            </figure>
          </div>
        </div>
      </section>

      <section id="download" className="border-t border-neutral-200/45 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl">Download</h2>
          <p className="mx-auto mt-4 max-w-md text-neutral-600">
            Same app on iOS and Android—install now so the next post or message doesn&apos;t pass you by.
          </p>
          <LandingDownloadButtons playStoreUrl={PLAY_STORE} appStoreUrl={APP_STORE} />
        </div>
      </section>
    </div>
  )
}
