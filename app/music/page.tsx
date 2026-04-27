"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, Pause, Play, Upload, ShieldCheck, UserCircle2, Music4, Shuffle, Repeat, Repeat1, SkipBack, SkipForward } from "lucide-react"
import { AudioSlicer } from "@/components/AudioSlicer"

type Song = {
  id: string
  title: string
  artist: string
  genre: string | null
  url: string
  duration_sec?: number | null
  play_count?: number | null
}

type Submission = {
  id: string
  title: string
  artist: string
  genre: string | null
  url: string
  duration_sec: number | null
  status: "pending" | "approved" | "rejected"
  submitted_by: string | null
  created_at: string
}

type InAppMessage = {
  id: string
  title: string
  body: string
  read_at: string | null
  created_at: string
  metadata?: {
    status?: string
  } | null
}

type TabKey = "discover" | "submit" | "dashboard" | "admin"

const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
const PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

const DISCOVER_GENRES = ["All", "Afrobeats", "Afro-Pop", "Amapiano", "Hip-Hop", "R&B", "Gospel", "Other"]
const MIN_SUBMISSION_CLIP_SECONDS = 30

function getAccessToken() {
  if (typeof window === "undefined") return ""
  return localStorage.getItem("nomli_supabase_access_token") || ""
}

function deriveGenre(track: { genre: string | null; title: string; artist: string }) {
  if (track.genre && track.genre.trim()) return track.genre
  const s = `${track.title} ${track.artist}`.toLowerCase()
  if (s.includes("afro")) return "Afrobeats"
  if (s.includes("amapiano")) return "Amapiano"
  if (s.includes("hip") || s.includes("rap")) return "Hip-Hop"
  if (s.includes("r&b") || s.includes("soul")) return "R&B"
  if (s.includes("gospel")) return "Gospel"
  return "Other"
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

function isAudioFile(file: File) {
  if (file.type?.startsWith("audio/")) return true
  const name = file.name.toLowerCase()
  return [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"].some((ext) => name.endsWith(ext))
}

function audioBufferToWavBlob(buffer: AudioBuffer) {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numFrames * blockAlign
  const bufferSize = 44 + dataSize
  const arrayBuffer = new ArrayBuffer(bufferSize)
  const view = new DataView(arrayBuffer)

  let offset = 0
  const writeString = (value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset++, value.charCodeAt(i))
    }
  }
  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true)
    offset += 2
  }
  const writeUint32 = (value: number) => {
    view.setUint32(offset, value, true)
    offset += 4
  }

  writeString("RIFF")
  writeUint32(36 + dataSize)
  writeString("WAVE")
  writeString("fmt ")
  writeUint32(16)
  writeUint16(1)
  writeUint16(numChannels)
  writeUint32(sampleRate)
  writeUint32(byteRate)
  writeUint16(blockAlign)
  writeUint16(bitsPerSample)
  writeString("data")
  writeUint32(dataSize)

  const channels = Array.from({ length: numChannels }, (_, i) => buffer.getChannelData(i))
  for (let frame = 0; frame < numFrames; frame++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame] || 0))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, intSample, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" })
}

async function createAudioClip(file: File, startSeconds: number, clipSeconds: number) {
  const safeStart = Math.max(0, Math.floor(startSeconds || 0))
  const targetSeconds = Math.max(MIN_SUBMISSION_CLIP_SECONDS, Math.floor(clipSeconds || MIN_SUBMISSION_CLIP_SECONDS))
  const arrayBuffer = await file.arrayBuffer()
  const audioContext = new AudioContext()
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    const totalFrames = decoded.length
    const startFrame = Math.min(totalFrames - 1, Math.floor(safeStart * decoded.sampleRate))
    const maxAvailableFrames = Math.max(1, totalFrames - startFrame)
    const frameCount = Math.min(maxAvailableFrames, Math.floor(targetSeconds * decoded.sampleRate))
    const clipped = audioContext.createBuffer(decoded.numberOfChannels, frameCount, decoded.sampleRate)

    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const source = decoded.getChannelData(ch).subarray(startFrame, startFrame + frameCount)
      clipped.copyToChannel(source, ch, 0)
    }

    const wavBlob = audioBufferToWavBlob(clipped)
    const baseName = file.name.replace(/\.[^.]+$/, "")
    return new File([wavBlob], `${baseName}-${safeStart}s-${targetSeconds}s.wav`, { type: "audio/wav" })
  } finally {
    await audioContext.close()
  }
}

async function authedFetch(path: string, init: RequestInit = {}, requireAuth = false) {
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) throw new Error("Service unavailable")
  const token = getAccessToken()
  if (requireAuth && !token) throw new Error("Login required")
  const bearer = requireAuth ? token : PUBLIC_SUPABASE_ANON_KEY
  const response = await fetch(`${PUBLIC_SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${bearer}`,
      ...(init.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (data as any)?.message || (data as any)?.error || "Request failed"
    throw new Error(String(message))
  }
  return data
}

export default function MusicPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("discover")
  const [genreFilter, setGenreFilter] = useState("All")

  const [songs, setSongs] = useState<Song[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverError, setDiscoverError] = useState("")

  const [profileName, setProfileName] = useState("")
  const [userId, setUserId] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  const [submitTitle, setSubmitTitle] = useState("")
  const [submitArtist, setSubmitArtist] = useState("Nomli Mingle User")
  const [submitGenre, setSubmitGenre] = useState("Afrobeats")
  const [submitDurationSec, setSubmitDurationSec] = useState(String(MIN_SUBMISSION_CLIP_SECONDS))
  const [submitStartSec, setSubmitStartSec] = useState("0")
  const [selectedAudioDurationSec, setSelectedAudioDurationSec] = useState<number | null>(null)
  const [submitFile, setSubmitFile] = useState<File | null>(null)
  const [submitFilePreviewUrl, setSubmitFilePreviewUrl] = useState<string | null>(null)
  const [submitFileError, setSubmitFileError] = useState("")
  const [splitBeforeUpload, setSplitBeforeUpload] = useState(true)
  const [submitRightsConfirmed, setSubmitRightsConfirmed] = useState(false)
  const [submitBusy, setSubmitBusy] = useState(false)

  const [mySubmissions, setMySubmissions] = useState<Submission[]>([])
  const [myLoading, setMyLoading] = useState(false)
  const [myMessages, setMyMessages] = useState<InAppMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [markingReadId, setMarkingReadId] = useState("")

  const [queue, setQueue] = useState<Submission[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [adminActionBusyId, setAdminActionBusyId] = useState("")
  const [deleteSongBusyId, setDeleteSongBusyId] = useState("")
  const [editSongBusyId, setEditSongBusyId] = useState("")

  const [activeSongId, setActiveSongId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackMs, setPlaybackMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [shuffleEnabled, setShuffleEnabled] = useState(false)
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("all")
  const [playHistory, setPlayHistory] = useState<string[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = "metadata"
    audioRef.current = audio
    const onTimeUpdate = () => setPlaybackMs(Math.max(0, audio.currentTime * 1000))
    const onLoadedMetadata = () => setDurationMs(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0)
    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("loadedmetadata", onLoadedMetadata)
    return () => {
      audio.pause()
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("loadedmetadata", onLoadedMetadata)
      audioRef.current = null
    }
  }, [])

  const loadDiscover = async () => {
    setDiscoverLoading(true)
    setDiscoverError("")
    try {
      const data = await authedFetch("/rest/v1/app_songs?select=id,title,artist,url")
      const normalized: Song[] = Array.isArray(data)
        ? data
            .filter((row) => row?.id && row?.title && row?.artist && row?.url)
            .map((row) => ({
              id: String(row.id),
              title: String(row.title),
              artist: String(row.artist),
              url: String(row.url),
              genre: typeof row.genre === "string" ? row.genre : null,
              duration_sec: typeof row.duration_sec === "number" ? row.duration_sec : 15,
              play_count: typeof row.play_count === "number" ? row.play_count : 0,
            }))
        : []
      setSongs(normalized)
    } catch {
      setDiscoverError("Unable to load music right now.")
    } finally {
      setDiscoverLoading(false)
    }
  }

  const loadAuthProfile = async () => {
    try {
      const token = getAccessToken()
      if (!token || !PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
        setAuthChecked(true)
        return
      }
      const meResponse = await fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      const me = await meResponse.json().catch(() => null)
      if (!meResponse.ok || !me?.id) {
        setAuthChecked(true)
        return
      }
      setUserId(String(me.id))
      const name = String(me?.user_metadata?.full_name || me?.user_metadata?.name || me?.email || "Nomli User")
      setProfileName(name)
      if (!submitArtist || submitArtist === "Nomli Mingle User") setSubmitArtist(name)

      const profileRows = await authedFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(String(me.id))}&select=id,is_admin,role`, {}, true)
      const profile = Array.isArray(profileRows) && profileRows[0] ? profileRows[0] : null
      const admin = Boolean(profile?.is_admin || String(profile?.role || "").toLowerCase() === "admin")
      setIsAdmin(admin)
    } catch {
      // Keep unauthenticated fallback experience.
    } finally {
      setAuthChecked(true)
    }
  }

  const loadMySubmissions = async () => {
    if (!userId) return
    setMyLoading(true)
    try {
      const rows = await authedFetch(
        `/rest/v1/app_song_submissions?submitted_by=eq.${encodeURIComponent(userId)}&select=id,title,artist,genre,url,duration_sec,status,submitted_by,created_at`,
        {},
        true
      )
      setMySubmissions(Array.isArray(rows) ? rows : [])
    } catch {
      setMySubmissions([])
    } finally {
      setMyLoading(false)
    }
  }

  const loadAdminQueue = async () => {
    if (!isAdmin) return
    setQueueLoading(true)
    try {
      const rows = await authedFetch(
        "/rest/v1/app_song_submissions?status=eq.pending&select=id,title,artist,genre,url,duration_sec,status,submitted_by,created_at",
        {},
        true
      )
      setQueue(Array.isArray(rows) ? rows : [])
    } catch {
      setQueue([])
    } finally {
      setQueueLoading(false)
    }
  }

  const loadMyMessages = async () => {
    if (!userId) return
    setMessagesLoading(true)
    try {
      const rows = await authedFetch(
        `/rest/v1/in_app_messages?user_id=eq.${encodeURIComponent(userId)}&select=id,title,body,read_at,created_at,metadata&order=created_at.desc`,
        {},
        true
      )
      setMyMessages(Array.isArray(rows) ? rows : [])
    } catch {
      setMyMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }

  const markMessageRead = async (messageId: string) => {
    setMarkingReadId(messageId)
    try {
      await authedFetch(`/rest/v1/in_app_messages?id=eq.${encodeURIComponent(messageId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ read_at: new Date().toISOString() }),
      }, true)
      await loadMyMessages()
    } catch (err: any) {
      alert(err?.message || "Could not mark message as read.")
    } finally {
      setMarkingReadId("")
    }
  }

  useEffect(() => {
    void loadDiscover()
    void loadAuthProfile()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const tab = new URLSearchParams(window.location.search).get("tab")
    if (tab === "submit" || tab === "dashboard" || tab === "admin" || tab === "discover") {
      setActiveTab(tab)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "dashboard") void loadMySubmissions()
    if (activeTab === "dashboard") void loadMyMessages()
    if (activeTab === "admin") void loadAdminQueue()
  }, [activeTab, userId, isAdmin])

  const filteredSongs = useMemo(() => {
    const all = genreFilter === "All" ? songs : songs.filter((s) => deriveGenre(s).toLowerCase() === genreFilter.toLowerCase())
    return all.sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0))
  }, [genreFilter, songs])

  const activeSong = songs.find((s) => s.id === activeSongId) || null
  const progressPct = durationMs > 0 ? Math.min(100, (playbackMs / durationMs) * 100) : 0
  const elapsedSec = Math.max(0, Math.floor(playbackMs / 1000))
  const totalSec = Math.max(1, Math.round((durationMs || (activeSong?.duration_sec ?? 15) * 1000) / 1000))
  const activeGenre = activeSong ? deriveGenre(activeSong).toUpperCase() : ""
  const heroLabel = activeSong ? (activeGenre === "OTHER" ? "TRENDING NOW" : `${activeGenre} NOW`) : "NOMLI MUSIC"
  const heroSubLabel = activeSong ? `${activeSong.artist} · Live Discover` : "Live Discover"

  const playSong = async (song: Song, options?: { fromHistory?: boolean; triedIds?: Set<string> }) => {
    const audio = audioRef.current
    if (!audio) return
    if (activeSongId === song.id) {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        await audio.play().catch(() => {})
        setIsPlaying(true)
      }
      return
    }
    try {
      if (activeSongId && activeSongId !== song.id && !options?.fromHistory) {
        setPlayHistory((prev) => [...prev.slice(-30), activeSongId])
      }
      audio.pause()
      audio.src = song.url
      audio.currentTime = 0
      setPlaybackMs(0)
      setDurationMs((song.duration_sec ?? 15) * 1000)
      setActiveSongId(song.id)
      await audio.play()
      setIsPlaying(true)
      setDiscoverError("")
    } catch {
      const triedIds = new Set(options?.triedIds || [])
      triedIds.add(song.id)
      const fallbackSong =
        filteredSongs.find((candidate) => !triedIds.has(candidate.id)) ||
        songs.find((candidate) => !triedIds.has(candidate.id))

      if (fallbackSong) {
        await playSong(fallbackSong, { fromHistory: true, triedIds })
        return
      }

      setDiscoverError("Playback failed. Some track URLs may be unavailable (403).")
      setIsPlaying(false)
    }
  }

  const playPreviousTrack = async () => {
    if (!filteredSongs.length) return
    const audio = audioRef.current
    if (audio && audio.currentTime > 4 && activeSongId) {
      audio.currentTime = 0
      setPlaybackMs(0)
      return
    }

    const lastHistoryId = playHistory[playHistory.length - 1]
    if (lastHistoryId) {
      const previousSong = filteredSongs.find((song) => song.id === lastHistoryId) || songs.find((song) => song.id === lastHistoryId)
      if (previousSong) {
        setPlayHistory((prev) => prev.slice(0, -1))
        await playSong(previousSong, { fromHistory: true })
        return
      }
    }

    if (!activeSongId) return
    const currentIndex = filteredSongs.findIndex((song) => song.id === activeSongId)
    if (currentIndex < 0) return
    const prevIndex = (currentIndex - 1 + filteredSongs.length) % filteredSongs.length
    const previous = filteredSongs[prevIndex]
    if (previous) await playSong(previous)
  }

  const playNextTrack = async () => {
    if (!filteredSongs.length) return
    if (!activeSongId) {
      await playSong(filteredSongs[0])
      return
    }

    if (repeatMode === "one") {
      const audio = audioRef.current
      if (audio && activeSongId) {
        audio.currentTime = 0
        setPlaybackMs(0)
        try {
          await audio.play()
          setIsPlaying(true)
        } catch {
          setIsPlaying(false)
        }
      }
      return
    }

    const currentIndex = filteredSongs.findIndex((song) => song.id === activeSongId)
    if (currentIndex < 0) return

    if (shuffleEnabled && filteredSongs.length > 1) {
      const candidates = filteredSongs.filter((song) => song.id !== activeSongId)
      const randomSong = candidates[Math.floor(Math.random() * candidates.length)]
      if (randomSong) await playSong(randomSong)
      return
    }

    const nextIndex = currentIndex + 1
    const nextSong = filteredSongs[nextIndex]
    if (nextSong) {
      await playSong(nextSong)
      return
    }

    if (repeatMode === "all") {
      const firstSong = filteredSongs[0]
      if (firstSong) await playSong(firstSong)
      return
    }

    const audio = audioRef.current
    if (audio) audio.pause()
    setIsPlaying(false)
  }

  const toPreviewSong = (item: Submission): Song => ({
    id: `submission-${item.id}`,
    title: item.title,
    artist: item.artist,
    genre: item.genre,
    url: item.url,
    duration_sec: item.duration_sec ?? 15,
    play_count: 0,
  })

  const sendSubmissionStatusMessage = async (item: Submission, status: "approved" | "rejected") => {
    if (!item.submitted_by) return
    const title = status === "approved" ? "Track approved" : "Track not approved"
    const body =
      status === "approved"
        ? `"${item.title}" has been approved and is now live in Nomli Music.`
        : `"${item.title}" was not approved. Please update and submit again.`

    try {
      await authedFetch("/rest/v1/in_app_messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          user_id: item.submitted_by,
          kind: "music_submission_update",
          title,
          body,
          metadata: {
            submission_id: item.id,
            status,
            track_title: item.title,
            track_artist: item.artist,
          },
        }),
      }, true)
    } catch {
      // Fallback only; DB trigger may already handle this.
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onEnded = () => {
      setPlaybackMs(0)
      void playNextTrack()
    }

    audio.addEventListener("ended", onEnded)
    return () => {
      audio.removeEventListener("ended", onEnded)
    }
  }, [activeSongId, filteredSongs, shuffleEnabled, repeatMode])

  useEffect(() => {
    return () => {
      if (submitFilePreviewUrl) URL.revokeObjectURL(submitFilePreviewUrl)
    }
  }, [submitFilePreviewUrl])

  useEffect(() => {
    if (!songs.length || activeSongId) return
    setActiveSongId(songs[0].id)
  }, [songs, activeSongId])

  const handleSubmitTrack = async () => {
    if (!userId) {
      alert("Please login with your Nomli profile first.")
      return
    }
    if (!submitFile || !submitTitle.trim() || !submitArtist.trim()) {
      alert("Add title, artist, and audio file.")
      return
    }
    if (submitFileError) {
      alert(submitFileError)
      return
    }
    if (!submitRightsConfirmed) {
      alert("Please confirm you own this track or have full rights to upload it.")
      return
    }
    const clipSeconds = Number.isFinite(Number(submitDurationSec))
      ? Math.max(MIN_SUBMISSION_CLIP_SECONDS, Number(submitDurationSec))
      : MIN_SUBMISSION_CLIP_SECONDS
    const clipStartSec = Number.isFinite(Number(submitStartSec)) ? Math.max(0, Number(submitStartSec)) : 0
    if (selectedAudioDurationSec !== null && clipStartSec >= selectedAudioDurationSec) {
      alert("Clip start must be less than the audio duration.")
      return
    }
    if (
      selectedAudioDurationSec !== null &&
      clipStartSec + clipSeconds > selectedAudioDurationSec
    ) {
      alert("Selected clip exceeds audio length. Reduce start or duration.")
      return
    }

    setSubmitBusy(true)
    try {
      const uploadFile = splitBeforeUpload ? await createAudioClip(submitFile, clipStartSec, clipSeconds) : submitFile
      const ext = uploadFile.name.split(".").pop()?.toLowerCase() || "wav"
      const safeTitle = submitTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      const filePath = `submissions/${Date.now()}-${safeTitle || "track"}.${ext}`
      await authedFetch(`/storage/v1/object/app-music/${filePath}`, {
        method: "POST",
        headers: {
          "x-upsert": "false",
          "Content-Type": uploadFile.type || "audio/wav",
        },
        body: uploadFile,
      }, true)

      if (!PUBLIC_SUPABASE_URL) throw new Error("Upload service unavailable")
      const publicUrl = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/app-music/${filePath}`
      await authedFetch("/rest/v1/app_song_submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          title: submitTitle.trim(),
          artist: submitArtist.trim(),
          genre: submitGenre,
          url: publicUrl,
          duration_sec: clipSeconds,
          status: "pending",
          submitted_by: userId,
        }),
      }, true)

      setSubmitTitle("")
      setSubmitFile(null)
      if (submitFilePreviewUrl) URL.revokeObjectURL(submitFilePreviewUrl)
      setSubmitFilePreviewUrl(null)
      setSubmitFileError("")
      setSubmitStartSec("0")
      setSelectedAudioDurationSec(null)
      setSubmitDurationSec(String(MIN_SUBMISSION_CLIP_SECONDS))
      setSubmitRightsConfirmed(false)
      alert("Track submitted. Admin will review it.")
      setActiveTab("dashboard")
      void loadMySubmissions()
    } catch (err: any) {
      alert(err?.message || "Could not submit track.")
    } finally {
      setSubmitBusy(false)
    }
  }

  const adminApprove = async (item: Submission) => {
    setAdminActionBusyId(item.id)
    try {
      await authedFetch("/rest/v1/app_songs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          title: item.title,
          artist: item.artist,
          url: item.url,
          genre: item.genre,
          duration_sec: item.duration_sec ?? 15,
        }),
      }, true)
      await authedFetch(`/rest/v1/app_song_submissions?id=eq.${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "approved",
          reviewed_by: userId || null,
          reviewed_at: new Date().toISOString(),
        }),
      }, true)
      await sendSubmissionStatusMessage(item, "approved")
      await loadAdminQueue()
      await loadDiscover()
    } catch (err: any) {
      alert(err?.message || "Could not approve track.")
    } finally {
      setAdminActionBusyId("")
    }
  }

  const adminReject = async (item: Submission) => {
    setAdminActionBusyId(item.id)
    try {
      await authedFetch(`/rest/v1/app_song_submissions?id=eq.${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "rejected",
          reviewed_by: userId || null,
          reviewed_at: new Date().toISOString(),
        }),
      }, true)
      await sendSubmissionStatusMessage(item, "rejected")
      await loadAdminQueue()
    } catch (err: any) {
      alert(err?.message || "Could not reject track.")
    } finally {
      setAdminActionBusyId("")
    }
  }

  const adminDeleteSong = async (song: Song) => {
    const ok = window.confirm(`Delete "${song.title}" from live songs?`)
    if (!ok) return
    setDeleteSongBusyId(song.id)
    try {
      await authedFetch(`/rest/v1/app_songs?id=eq.${encodeURIComponent(song.id)}`, {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      }, true)
      await loadDiscover()
    } catch (err: any) {
      alert(err?.message || "Could not delete song.")
    } finally {
      setDeleteSongBusyId("")
    }
  }

  const adminEditSong = async (song: Song) => {
    const nextTitle = window.prompt("Edit track title", song.title)?.trim()
    if (!nextTitle) return
    const nextArtist = window.prompt("Edit artist name", song.artist)?.trim()
    if (!nextArtist) return
    const nextGenre = window.prompt("Edit genre", song.genre || "Other")?.trim() || "Other"
    const nextDurationRaw = window.prompt("Edit duration (seconds)", String(song.duration_sec || 15))?.trim()
    const nextDuration = Number(nextDurationRaw)
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
      alert("Duration must be a valid number of seconds.")
      return
    }

    setEditSongBusyId(song.id)
    try {
      await authedFetch(`/rest/v1/app_songs?id=eq.${encodeURIComponent(song.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          title: nextTitle,
          artist: nextArtist,
          genre: nextGenre,
          duration_sec: Math.round(nextDuration),
        }),
      }, true)
      await loadDiscover()
    } catch (err: any) {
      alert(err?.message || "Could not update song.")
    } finally {
      setEditSongBusyId("")
    }
  }

  const renderDiscover = () => (
    <>
      <div className="mt-3 px-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {DISCOVER_GENRES.map((genre) => (
          <button
            key={genre}
            type="button"
            onClick={() => setGenreFilter(genre)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full border text-[11px] font-semibold ${
              genreFilter === genre ? "bg-[#D6526A] border-[#D6526A] text-white" : "border-white/10 text-white/65"
            }`}
          >
            {genre}
          </button>
        ))}
      </div>
      <section className="px-3 pt-4">
        <div className="rounded-[1.4rem] border border-white/10 bg-[#16121d] p-3 sm:p-4">
          {discoverLoading ? <p className="p-5 text-center text-sm text-[#2f2f4b]">Loading tracks...</p> : null}
          {!discoverLoading && discoverError ? <p className="p-5 text-center text-sm text-red-700">{discoverError}</p> : null}
          {!discoverLoading && !discoverError && filteredSongs.length === 0 ? (
            <p className="p-5 text-center text-sm text-[#494969]">No tracks found.</p>
          ) : null}
          {!discoverLoading && !discoverError && filteredSongs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-[0.78fr_1.22fr] gap-3">
              <div className="rounded-[1.3rem] bg-gradient-to-b from-[#1f1c45] to-[#13152f] p-4 text-white min-h-[295px]">
                <p className="text-xs text-white/75 mb-3">Now playing</p>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="h-24 rounded-xl bg-gradient-to-br from-[#2f2c62] to-[#1c1d43] flex items-center justify-center">
                    <Music4 className="h-8 w-8 text-white/80" />
                  </div>
                  <p className="mt-3 text-sm font-semibold truncate">{activeSong?.title || "Select a track"}</p>
                  <p className="text-xs text-white/65 truncate">{activeSong?.artist || "Nomli Music"}</p>
                  <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#a78bfa] to-[#22d3ee]" style={{ width: `${progressPct}%` }} />
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
                  <div className="mt-3 flex items-center justify-between text-[11px] text-white/60">
                    <span>{fmt(elapsedSec)}</span>
                    <span>{fmt(totalSec)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void playPreviousTrack()
                      }}
                      className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
                    >
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => activeSong && void playSong(activeSong)}
                      className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void playNextTrack()
                      }}
                      className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShuffleEnabled((prev) => !prev)}
                      className={`h-6 px-2 rounded-full border text-[9px] font-medium inline-flex items-center gap-1 ${
                        shuffleEnabled ? "border-cyan-300/70 bg-cyan-300/12 text-cyan-100" : "border-white/20 text-white/60"
                      }`}
                    >
                      <Shuffle className="h-2.5 w-2.5" />
                      Shuffle
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRepeatMode((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"))
                      }
                      className={`h-6 px-2 rounded-full border text-[9px] font-medium inline-flex items-center gap-1 ${
                        repeatMode !== "off" ? "border-violet-300/70 bg-violet-300/12 text-violet-100" : "border-white/20 text-white/60"
                      }`}
                    >
                      {repeatMode === "one" ? <Repeat1 className="h-2.5 w-2.5" /> : <Repeat className="h-2.5 w-2.5" />}
                      {repeatMode === "off" ? "Repeat Off" : repeatMode === "all" ? "Repeat All" : "Repeat One"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.3rem] bg-gradient-to-b from-[#1f1c45] to-[#13152f] p-4 sm:p-5 min-h-[295px] text-white">
                <div className="relative rounded-xl h-24 sm:h-28 p-4 mb-4 flex flex-col justify-end overflow-hidden bg-[length:200%_200%] animate-[hero-gradient_8s_ease-in-out_infinite] bg-gradient-to-r from-[#3f3a82] via-[#33528f] to-[#2a4f78]">
                  <div className="absolute -top-10 -right-8 w-28 h-28 rounded-full bg-white/15 blur-2xl animate-[hero-orb_6s_ease-in-out_infinite]" />
                  <div className="absolute -bottom-8 left-8 w-24 h-24 rounded-full bg-cyan-300/15 blur-2xl animate-[hero-orb_7s_ease-in-out_infinite_0.5s]" />
                  <p className="relative text-xl sm:text-2xl font-bold leading-none animate-[hero-text_700ms_ease-out]">{heroLabel}</p>
                  <p className="relative text-xs text-white/80 mt-1 animate-[hero-text_900ms_ease-out]">{heroSubLabel}</p>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm sm:text-base font-semibold text-white">Trending right now</h2>
                  <button
                    type="button"
                    onClick={() => {
                      if (filteredSongs.length > 0) void playSong(filteredSongs[0])
                    }}
                    className="text-xs text-white/75 hover:text-white"
                  >
                    Play all
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {filteredSongs.map((song, index) => {
                    const active = song.id === activeSongId
                    return (
                      <button
                        key={song.id}
                        type="button"
                        onClick={() => void playSong(song)}
                        className={`w-full rounded-lg px-3 py-2 text-left transition-colors border ${
                          active ? "bg-white/10 border-white/30" : "bg-transparent border-transparent hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-white/45 w-5">{String(index + 1).padStart(2, "0")}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-semibold text-white truncate">{song.title}</p>
                            <p className="text-[11px] text-white/60 truncate">{song.artist}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {active ? (
                              <span className="flex items-end gap-[2px] h-3" aria-hidden="true">
                                {[0, 1, 2].map((i) => (
                                  <span
                                    key={i}
                                    className={`w-[2px] rounded-full bg-[#7dd3fc] ${
                                      isPlaying ? "animate-[music-wave_850ms_ease-in-out_infinite]" : ""
                                    }`}
                                    style={{ height: isPlaying ? undefined : "6px", animationDelay: `${i * 120}ms` }}
                                  />
                                ))}
                              </span>
                            ) : null}
                            <span className="text-[11px] text-white/55">{fmt(song.duration_sec || 15)}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  )

  const renderSubmit = () => (
    <section className="px-3 pt-4">
      <div className="rounded-xl border border-white/10 bg-[#201820]/60 p-4">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-[#E07A8F]" />
          <h2 className="text-sm font-semibold">Submit Track</h2>
        </div>
        <p className="mt-2 text-xs text-white/60">
          To upload music, you must have a Nomli Mingle app account. If approved, your track is added to our in-app music library.
        </p>
        <p className="mt-2 text-[11px] text-amber-200/80">
          Only upload tracks you created or have full legal rights to use and distribute.
        </p>
        {!authChecked ? <p className="mt-3 text-sm text-white/50">Checking login...</p> : null}
        {authChecked && !userId ? (
          <div className="mt-4 rounded-lg border border-white/10 p-3">
            <p className="text-sm text-white/70">
              Login with your Nomli Mingle app account to upload music. Approved tracks are added to Nomli in-app music.
            </p>
            <Link
              href="/login?next=%2Fmusic%3Ftab%3Dsubmit"
              className="inline-flex mt-3 rounded-md bg-[#D6526A] px-3 py-2 text-xs font-semibold"
            >
              Go to Login
            </Link>
          </div>
        ) : null}
        {userId ? (
          <div className="mt-4 space-y-3">
            <input
              value={submitTitle}
              onChange={(e) => setSubmitTitle(e.target.value)}
              placeholder="Track title"
              className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A]"
            />
            <input
              value={submitArtist}
              onChange={(e) => setSubmitArtist(e.target.value)}
              placeholder="Artist name"
              className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A]"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={submitGenre}
                onChange={(e) => setSubmitGenre(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A]"
              >
                {DISCOVER_GENRES.filter((x) => x !== "All").map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <input
                value={submitDurationSec}
                onChange={(e) => setSubmitDurationSec(e.target.value)}
                type="number"
                min={MIN_SUBMISSION_CLIP_SECONDS}
                step={1}
                placeholder={`Clip seconds (min ${MIN_SUBMISSION_CLIP_SECONDS})`}
                className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A]"
              />
            </div>
            <AudioSlicer
              startSec={Math.max(0, Number(submitStartSec) || 0)}
              durationSec={Math.max(MIN_SUBMISSION_CLIP_SECONDS, Number(submitDurationSec) || MIN_SUBMISSION_CLIP_SECONDS)}
              totalDurationSec={selectedAudioDurationSec}
              previewUrl={submitFilePreviewUrl}
              minDurationSec={MIN_SUBMISSION_CLIP_SECONDS}
              onChangeStartSec={(value) => setSubmitStartSec(String(value))}
              onChangeDurationSec={(value) => setSubmitDurationSec(String(value))}
              disabled={!splitBeforeUpload}
            />
            <label className="flex items-center gap-2 rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-xs text-white/75">
              <input
                type="checkbox"
                checked={splitBeforeUpload}
                onChange={(e) => setSplitBeforeUpload(e.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-transparent"
              />
              <span>
                Auto-split before upload (uploads at least {Math.max(MIN_SUBMISSION_CLIP_SECONDS, Number(submitDurationSec) || MIN_SUBMISSION_CLIP_SECONDS)}s clip)
              </span>
            </label>
            <div className="rounded-md border border-white/10 bg-[#141014] px-3 py-2">
              <p className="mb-2 text-xs text-white/65">Audio file (required): MP3, M4A, AAC, WAV, OGG, FLAC</p>
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  if (!file) {
                    setSubmitFile(null)
                    setSubmitFileError("")
                    setSelectedAudioDurationSec(null)
                    if (submitFilePreviewUrl) URL.revokeObjectURL(submitFilePreviewUrl)
                    setSubmitFilePreviewUrl(null)
                    return
                  }
                  if (!isAudioFile(file)) {
                    setSubmitFile(null)
                    setSubmitFileError("Please choose a valid audio file.")
                    setSelectedAudioDurationSec(null)
                    if (submitFilePreviewUrl) URL.revokeObjectURL(submitFilePreviewUrl)
                    setSubmitFilePreviewUrl(null)
                    e.currentTarget.value = ""
                    return
                  }
                  setSubmitFile(file)
                  setSubmitFileError("")

                  const objectUrl = URL.createObjectURL(file)
                  if (submitFilePreviewUrl) URL.revokeObjectURL(submitFilePreviewUrl)
                  setSubmitFilePreviewUrl(objectUrl)
                  const probe = document.createElement("audio")
                  probe.preload = "metadata"
                  probe.onloadedmetadata = () => {
                    const duration = Number.isFinite(probe.duration) ? Math.floor(probe.duration) : null
                    setSelectedAudioDurationSec(duration)
                    if (duration !== null) {
                      const currentStart = Number(submitStartSec) || 0
                      if (currentStart >= duration) {
                        setSubmitStartSec("0")
                      }
                    }
                  }
                  probe.onerror = () => {
                    setSelectedAudioDurationSec(null)
                  }
                  probe.src = objectUrl
                }}
                className="w-full text-sm"
              />
              {submitFile ? <p className="mt-2 text-[11px] text-emerald-300">Selected: {submitFile.name}</p> : null}
              {selectedAudioDurationSec !== null ? (
                <p className="mt-1 text-[11px] text-white/60">Audio length: {selectedAudioDurationSec}s</p>
              ) : null}
              {splitBeforeUpload ? (
                <p className="mt-1 text-[11px] text-white/60">
                  Clip preview: {Math.max(0, Number(submitStartSec) || 0)}s to{" "}
                  {Math.max(0, Number(submitStartSec) || 0) + Math.max(MIN_SUBMISSION_CLIP_SECONDS, Number(submitDurationSec) || MIN_SUBMISSION_CLIP_SECONDS)}s
                </p>
              ) : null}
              {submitFileError ? <p className="mt-2 text-[11px] text-red-300">{submitFileError}</p> : null}
            </div>
            <label className="flex items-start gap-2 rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-xs text-white/75">
              <input
                type="checkbox"
                checked={submitRightsConfirmed}
                onChange={(e) => setSubmitRightsConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/30 bg-transparent"
              />
              <span>
                I confirm this is my original track, or I have full legal rights and permission to upload and distribute this audio on Nomli Mingle.
              </span>
            </label>
            <button
              type="button"
              disabled={submitBusy || !submitRightsConfirmed}
              onClick={() => void handleSubmitTrack()}
              className="w-full rounded-md bg-[#D6526A] px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {submitBusy ? "Submitting..." : "Submit for Review"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )

  const renderDashboard = () => (
    <section className="px-3 pt-4">
      <div className="rounded-xl border border-white/10 bg-[#201820]/60 p-4">
        <div className="flex items-center gap-2">
          <UserCircle2 className="h-4 w-4 text-[#E07A8F]" />
          <h2 className="text-sm font-semibold">My Uploads</h2>
        </div>
        <p className="mt-2 text-xs text-white/60">{profileName ? `Signed in as ${profileName}` : "Login to see your uploads."}</p>
        {myLoading ? <p className="mt-4 text-sm text-white/50">Loading your submissions...</p> : null}
        {!myLoading && userId && mySubmissions.length === 0 ? <p className="mt-4 text-sm text-white/50">No submissions yet.</p> : null}
        {!myLoading && !userId ? <p className="mt-4 text-sm text-white/50">Login required.</p> : null}
        {!myLoading && mySubmissions.length > 0 ? (
          <div className="mt-3 space-y-2">
            {mySubmissions.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-[#141014] p-3">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-white/60 mt-1">
                  {item.artist} · {item.genre || "Other"} · {(item.duration_sec ?? 15)}s
                </p>
                <p className="mt-1 text-[11px]">
                  Status:{" "}
                  <span className={item.status === "approved" ? "text-emerald-300" : item.status === "rejected" ? "text-red-300" : "text-amber-300"}>
                    {item.status}
                  </span>
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-[#201820]/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">In-app Messages</h3>
          <span className="text-[11px] text-white/50">
            {myMessages.filter((m) => !m.read_at).length} unread
          </span>
        </div>
        {messagesLoading ? <p className="mt-3 text-sm text-white/50">Loading messages...</p> : null}
        {!messagesLoading && !userId ? <p className="mt-3 text-sm text-white/50">Login required.</p> : null}
        {!messagesLoading && userId && myMessages.length === 0 ? <p className="mt-3 text-sm text-white/50">No messages yet.</p> : null}
        {!messagesLoading && myMessages.length > 0 ? (
          <div className="mt-3 space-y-2">
            {myMessages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg border p-3 ${
                  msg.read_at
                    ? "border-white/10 bg-[#141014]/70"
                    : msg.metadata?.status === "approved" || msg.title.toLowerCase().includes("approved")
                      ? "border-emerald-400/40 bg-emerald-950/30"
                      : msg.metadata?.status === "rejected" || msg.title.toLowerCase().includes("not approved")
                        ? "border-red-400/40 bg-red-950/30"
                        : "border-[#D6526A]/40 bg-[#2A151C]/70"
                }`}
              >
                <p className="text-sm font-semibold">{msg.title}</p>
                <p className="mt-1 text-xs text-white/70">{msg.body}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-white/40">
                    {new Date(msg.created_at).toLocaleString()}
                  </p>
                  {!msg.read_at ? (
                    <button
                      type="button"
                      disabled={markingReadId === msg.id}
                      onClick={() => void markMessageRead(msg.id)}
                      className="rounded-md border border-white/20 px-2 py-1 text-[10px] font-semibold text-white/80 disabled:opacity-60"
                    >
                      {markingReadId === msg.id ? "Saving..." : "Mark Read"}
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-300">Read</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )

  const renderAdmin = () => (
    <section className="px-3 pt-4">
      <div className="rounded-xl border border-white/10 bg-[#201820]/60 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#E07A8F]" />
          <h2 className="text-sm font-semibold">Admin Review Queue</h2>
        </div>
        {!isAdmin ? <p className="mt-3 text-sm text-white/50">Admin access required.</p> : null}
        {isAdmin && queueLoading ? <p className="mt-3 text-sm text-white/50">Loading queue...</p> : null}
        {isAdmin && !queueLoading && queue.length === 0 ? <p className="mt-3 text-sm text-white/50">No pending tracks.</p> : null}
        {isAdmin && queue.length > 0 ? (
          <div className="mt-3 space-y-2">
            {queue.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-[#141014] p-3">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-white/60 mt-1">
                  {item.artist} · {item.genre || "Other"} · {(item.duration_sec ?? 15)}s
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void playSong(toPreviewSong(item))}
                    className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80"
                  >
                    {activeSongId === `submission-${item.id}` && isPlaying ? "Pause Preview" : "Play Preview"}
                  </button>
                  <button
                    type="button"
                    disabled={adminActionBusyId === item.id}
                    onClick={() => void adminApprove(item)}
                    className="rounded-md bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={adminActionBusyId === item.id}
                    onClick={() => void adminReject(item)}
                    className="rounded-md bg-red-600/80 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-[#201820]/60 p-4">
        <h3 className="text-sm font-semibold">Live Songs</h3>
        {isAdmin && songs.length === 0 ? <p className="mt-3 text-sm text-white/50">No live songs yet.</p> : null}
        {!isAdmin ? <p className="mt-3 text-sm text-white/50">Admin access required.</p> : null}
        {isAdmin && songs.length > 0 ? (
          <div className="mt-3 space-y-2">
            {songs.map((song) => (
              <div key={song.id} className="rounded-lg border border-white/10 bg-[#141014] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{song.title}</p>
                  <p className="text-xs text-white/60 truncate">{song.artist}</p>
                </div>
                <button
                  type="button"
                  disabled={editSongBusyId === song.id || deleteSongBusyId === song.id}
                  onClick={() => void adminEditSong(song)}
                  className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 disabled:opacity-60"
                >
                  {editSongBusyId === song.id ? "Saving..." : "Edit"}
                </button>
                <button
                  type="button"
                  disabled={deleteSongBusyId === song.id}
                  onClick={() => void adminDeleteSong(song)}
                  className="rounded-md bg-red-600/80 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                >
                  {deleteSongBusyId === song.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )

  return (
    <main className="min-h-screen bg-[#0E0B0D] text-[#F5EEF0] pb-10">
      <div className="mx-auto w-full max-w-[880px] min-h-screen pb-36 bg-[#0E0B0D]">
      <header className="sticky top-0 z-20 h-[54px] flex items-center justify-between px-4 border-b border-white/10 bg-[#0E0B0D]/90 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#D6526A] shadow-[0_0_8px_#D6526A]" />
          <span className="font-semibold tracking-tight">NOMLI MUSIC</span>
        </div>
        <Link href="/" className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-[#201820] px-2.5 py-1.5 text-xs text-white/75">
          <ChevronLeft className="h-3.5 w-3.5" />
          Home
        </Link>
      </header>

      <div className="px-3 pt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { key: "discover", label: "Discover" },
          { key: "submit", label: "Submit" },
          { key: "dashboard", label: "Dashboard" },
          { key: "admin", label: "Admin" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full border text-[11px] font-semibold ${
              activeTab === tab.key ? "bg-[#D6526A] border-[#D6526A] text-white" : "border-white/10 text-white/65"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "discover" ? renderDiscover() : null}
      {activeTab === "submit" ? renderSubmit() : null}
      {activeTab === "dashboard" ? renderDashboard() : null}
      {activeTab === "admin" ? renderAdmin() : null}

      <style jsx>{`
        @keyframes music-wave {
          from {
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
          to {
            height: 6px;
            transform: translateY(0);
          }
        }
        @keyframes hero-gradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        @keyframes hero-orb {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.45;
          }
          50% {
            transform: translate3d(-8px, 6px, 0) scale(1.12);
            opacity: 0.8;
          }
        }
        @keyframes hero-text {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      </div>
    </main>
  )
}

