"use client"

import Link from "next/link"
import { motion, useInView } from "framer-motion"
import { useEffect, useMemo, useRef, useState } from "react"
import { Expand, PlayCircle, Volume2, VolumeX } from "lucide-react"

type SocialShowcaseSectionProps = {
  videoUrl?: string | null
}

export function SocialShowcaseSection({ videoUrl }: SocialShowcaseSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoShellRef = useRef<HTMLDivElement | null>(null)
  const [isVideoVisible, setIsVideoVisible] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const isInView = useInView(ref, { once: true, margin: "-80px" })
  const hasVideo = Boolean(videoUrl)
  const poster = useMemo(() => "/icon.png", [])

  useEffect(() => {
    if (!videoShellRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setIsVideoVisible(Boolean(entry?.isIntersecting))
      },
      { threshold: 0.6 }
    )
    observer.observe(videoShellRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = isMuted
  }, [isMuted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isVideoVisible) {
      video
        .play()
        .then(() => {})
        .catch(() => {})
    } else {
      video.pause()
      setIsMuted(true)
    }
  }, [isVideoVisible])

  return (
    <section id="social-showcase" ref={ref} className="relative overflow-hidden bg-[#070b1d] py-14 sm:py-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(124,58,237,0.2),transparent_34%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_86%_78%,rgba(56,189,248,0.16),transparent_34%)]" />

      <div className="container relative z-10 mx-auto px-4 sm:px-6">
        <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(120deg,rgba(7,11,29,0.92),rgba(14,28,66,0.9))] px-5 py-7 shadow-[0_30px_80px_rgba(2,6,23,0.45)] sm:px-8 sm:py-10">
          <div className="grid items-center gap-8 sm:gap-12 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <span className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-white sm:text-xs">
              Social
            </span>
            <h2 className="mb-4 max-w-[560px] text-[1.8rem] font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
              Real people. Real moments. No filter.
            </h2>
            <p className="mb-6 max-w-[560px] text-[15px] leading-relaxed text-white/75 sm:text-lg">
              Meet real people, share authentic moments, and connect through a social feed built for meaningful conversations.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/social"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
              >
                <Expand className="h-4 w-4" />
                Open Nomli Social
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.1 }}
            className="lg:pl-2"
          >
            <div className="mx-auto w-full max-w-[360px] rounded-[30px] border border-[#2f3c72] bg-[#0b1230] p-3 shadow-[0_30px_60px_rgba(2,8,24,0.5)]">
              <div className="mb-2 flex items-center justify-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-white/35" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
              </div>
              <div ref={videoShellRef} className="relative overflow-hidden rounded-[22px] bg-black">
                {hasVideo ? (
                  <video
                    ref={videoRef}
                    src={videoUrl || undefined}
                    muted={isMuted}
                    loop
                    autoPlay
                    controls={false}
                    playsInline
                    preload="metadata"
                    poster={poster}
                    className="h-[460px] w-full object-cover"
                  />
                ) : (
                  <Link href="/social" className="relative flex h-[460px] w-full items-center justify-center bg-[#0b1029]">
                    <img src={poster} alt="Nomli Social preview" className="h-20 w-20 rounded-2xl object-cover opacity-90" />
                    <span className="absolute bottom-4 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                      Open social feed
                    </span>
                  </Link>
                )}
                {hasVideo && (
                  <button
                    type="button"
                    onClick={() => setIsMuted((prev) => !prev)}
                    className="absolute bottom-3 left-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70"
                    aria-label={isMuted ? "Unmute video" : "Mute video"}
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                )}
                {hasVideo && (
                  <Link
                    href="/social"
                    className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/70"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    Open social
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        </div>
        </div>
      </div>
    </section>
  )
}
