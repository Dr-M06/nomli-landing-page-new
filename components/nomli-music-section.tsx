"use client"

import Link from "next/link"
import { motion, useInView } from "framer-motion"
import { useEffect, useMemo, useRef, useState } from "react"
import { Headphones, Music2, ShieldCheck, Pause, Play, SkipForward } from "lucide-react"

const highlights = [
  "Upload with your Nomli Mingle account",
  "Tracks are reviewed before publishing",
  "Approved songs go live in Nomli in-app music",
]

type Song = {
  id: string
  title: string
  artist: string
  url: string
  duration_sec?: number | null
}

const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
const PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function NomliMusicSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-80px" })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(30)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = "metadata"
    audioRef.current = audio

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0)
    const onLoaded = () => setDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30)
    const onEnded = () => {
      setActiveIndex((prev) => (songs.length > 0 ? (prev + 1) % songs.length : 0))
    }

    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("loadedmetadata", onLoaded)
    audio.addEventListener("ended", onEnded)

    return () => {
      audio.pause()
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("loadedmetadata", onLoaded)
      audio.removeEventListener("ended", onEnded)
      audioRef.current = null
    }
  }, [songs.length])

  useEffect(() => {
    let ignore = false
    const loadSongs = async () => {
      if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) return
      try {
        const response = await fetch(
          `${PUBLIC_SUPABASE_URL}/rest/v1/app_songs?select=id,title,artist,url,duration_sec&order=created_at.desc&limit=6`,
          {
            headers: {
              apikey: PUBLIC_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${PUBLIC_SUPABASE_ANON_KEY}`,
            },
          },
        )
        const rows = await response.json().catch(() => [])
        if (!response.ok || !Array.isArray(rows) || ignore) return
        const normalized = rows
          .filter((song) => song?.id && song?.title && song?.artist && song?.url)
          .map((song) => ({
            id: String(song.id),
            title: String(song.title),
            artist: String(song.artist),
            url: String(song.url),
            duration_sec: typeof song.duration_sec === "number" ? song.duration_sec : 30,
          }))
        setSongs(normalized)
      } catch {
        // Keep UI functional without data.
      }
    }
    void loadSongs()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    const activeSong = songs[activeIndex]
    if (!audio || !activeSong?.url) return

    audio.src = activeSong.url
    audio.currentTime = 0
    setCurrentTime(0)
    setDuration(activeSong.duration_sec ?? 30)

    if (isPlaying) {
      void audio.play().catch(() => setIsPlaying(false))
    }
  }, [activeIndex, songs, isPlaying])

  const activeSong = songs[activeIndex] || null
  const previewSongs = useMemo(() => songs.slice(0, 3), [songs])
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  const handleToggle = async () => {
    const audio = audioRef.current
    if (!audio || !activeSong) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      return
    }
    try {
      await audio.play()
      setIsPlaying(true)
    } catch {
      setIsPlaying(false)
    }
  }

  const handleNext = () => {
    if (!songs.length) return
    setActiveIndex((prev) => (prev + 1) % songs.length)
    setIsPlaying(true)
  }

  return (
    <section id="music" ref={ref} className="relative py-16 sm:py-24 bg-[#f6f4fb] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(139,92,246,0.14),transparent_38%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_85%,rgba(6,182,212,0.14),transparent_34%)]" />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-[11px] sm:text-xs font-semibold tracking-wide text-violet-700 mb-5">
              <Music2 className="w-3.5 h-3.5" />
              Nomli Music
            </span>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] leading-tight mb-4">
              Share your sound with the Nomli community.
            </h2>
            <p className="text-base sm:text-lg text-[#666] leading-relaxed mb-6">
              Upload your music for review. Once approved, your track is featured inside Nomli Mingle so people can use
              it across content and community moments.
            </p>

            <div className="space-y-3 mb-7">
              {highlights.map((item, index) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, x: -14 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.45, delay: 0.08 * index }}
                  className="flex items-start gap-3 rounded-xl bg-white/75 border border-white px-3.5 py-3"
                >
                  <ShieldCheck className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
                  <span className="text-sm sm:text-[15px] text-[#4a4a4a]">{item}</span>
                </motion.div>
              ))}
            </div>

            <Link
              href="/music?tab=submit"
              className="inline-flex items-center justify-center rounded-full bg-[#1a1a1a] px-6 py-3 text-sm sm:text-base font-semibold text-white hover:bg-[#101010] transition-colors"
            >
              Submit Music
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="relative"
          >
            <div className="relative rounded-[2rem] border border-[#d9d3f8] bg-[#c7c4ef] p-3 sm:p-4 shadow-[0_26px_60px_rgba(17,24,39,0.2)]">
              <div className="grid grid-cols-1 md:grid-cols-[0.78fr_1.22fr] gap-3">
                <div className="rounded-[1.4rem] bg-gradient-to-b from-[#1f1c45] to-[#13152f] p-4 sm:p-5 text-white min-h-[300px]">
                  <p className="text-xs text-white/75 mb-3">Now playing</p>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="h-28 rounded-xl bg-gradient-to-br from-[#2f2c62] to-[#1c1d43] flex items-center justify-center">
                      <Headphones className="w-10 h-10 text-white/85" />
                    </div>
                    <p className="mt-3 text-sm font-semibold truncate">
                      {activeSong ? activeSong.title : "Nomli Session"}
                    </p>
                    <p className="text-xs text-white/65 truncate">
                      {activeSong ? activeSong.artist : "Nomli Mingle"}
                    </p>
                    <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#a78bfa] to-[#22d3ee] transition-all duration-150"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-end gap-1 h-6">
                      {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                        <span
                          key={bar}
                          className={`w-1 rounded-full bg-gradient-to-t from-[#7dd3fc] to-[#c4b5fd] ${
                            isPlaying ? "animate-[music-wave_850ms_ease-in-out_infinite]" : ""
                          }`}
                          style={{
                            height: isPlaying ? undefined : "8px",
                            opacity: isPlaying ? 0.95 : 0.55,
                            animationDelay: `${bar * 90}ms`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] text-white/60">{formatTime(Math.floor(currentTime))}</span>
                      <span className="text-[11px] text-white/60">{formatTime(duration)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggle()}
                        disabled={!activeSong}
                        className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center disabled:opacity-50"
                        aria-label={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleNext}
                        disabled={!activeSong}
                        className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center disabled:opacity-50"
                        aria-label="Next track"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.4rem] bg-[#f7f8ff] p-4 sm:p-5 min-h-[300px]">
                  <div className="rounded-xl bg-gradient-to-r from-[#60b4e8] to-[#2f6698] h-28 sm:h-32 p-4 text-white mb-4 flex flex-col justify-end">
                    <p className="text-xl sm:text-2xl font-bold leading-none">R&B NOW</p>
                    <p className="text-xs text-white/80 mt-1">Nomli Music Discover</p>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm sm:text-base font-semibold text-[#1f2340]">Trending right now</h3>
                    <Link href="/music" className="text-xs text-[#6d70a7] hover:underline">
                      See all
                    </Link>
                  </div>
                  <div className="space-y-1.5">
                    {previewSongs.length > 0 ? (
                      previewSongs.map((song, index) => (
                        <button
                          key={song.id}
                          type="button"
                          onClick={() => {
                            setActiveIndex(index)
                            setIsPlaying(true)
                          }}
                          className={`w-full rounded-lg px-3 py-2 text-left transition-colors border ${
                            activeSong?.id === song.id
                              ? "bg-white border-[#cfd5ff]"
                              : "bg-transparent border-transparent hover:bg-white/70"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-[#8f95bc] w-5">{String(index + 1).padStart(2, "0")}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs sm:text-sm font-semibold text-[#1f2340] truncate">{song.title}</p>
                              <p className="text-[11px] text-[#6f7398] truncate">{song.artist}</p>
                            </div>
                            <span className="text-[11px] text-[#7e82a8]">{formatTime(song.duration_sec ?? 30)}</span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-[#7e82a8] px-1 py-2">Loading real songs...</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      <style jsx>{`
        @keyframes music-wave {
          0%,
          100% {
            height: 6px;
            transform: translateY(0);
          }
          25% {
            height: 16px;
            transform: translateY(-1px);
          }
          50% {
            height: 10px;
            transform: translateY(0);
          }
          75% {
            height: 20px;
            transform: translateY(-1px);
          }
        }
      `}</style>
    </section>
  )
}
