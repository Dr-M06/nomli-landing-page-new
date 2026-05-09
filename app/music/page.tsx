"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Pause,
  Play,
  Upload,
  ShieldCheck,
  UserCircle2,
  Music4,
  Shuffle,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react"
import { AudioSlicer } from "@/components/AudioSlicer"

type Song = {
  id: string
  title: string
  artist: string
  genre: string | null
  url: string
  cover_url?: string | null
  artist_bio?: string | null
  artist_username?: string | null
  artist_avatar_url?: string | null
  artist_youtube_url?: string | null
  artist_spotify_url?: string | null
  duration_sec?: number | null
  play_count?: number | null
}

type Submission = {
  id: string
  title: string
  artist: string
  genre: string | null
  url: string
  cover_url?: string | null
  artist_bio?: string | null
  artist_username?: string | null
  artist_avatar_url?: string | null
  artist_youtube_url?: string | null
  artist_spotify_url?: string | null
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
/** Same seed as Submit tab genre dropdown (excludes discover-only "All"). */
const LIVE_CATALOG_GENRES = DISCOVER_GENRES.filter((g) => g !== "All")

function liveCatalogGenreOptions(currentGenre: string | null | undefined): string[] {
  const g = (currentGenre || "").trim()
  const base = [...LIVE_CATALOG_GENRES]
  if (g && !base.includes(g)) base.push(g)
  return base
}

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

function slugifyArtist(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function isAudioFile(file: File) {
  if (file.type?.startsWith("audio/")) return true
  const name = file.name.toLowerCase()
  return [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"].some((ext) => name.endsWith(ext))
}

function isImageFile(file: File) {
  if (file.type?.startsWith("image/")) return true
  const name = file.name.toLowerCase()
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) => name.endsWith(ext))
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
  /** Mobile Discover: full track list + genre hint live in a Spotify-style sheet (desktop always shows inline list). */
  const [mobileDiscoverLibraryOpen, setMobileDiscoverLibraryOpen] = useState(false)

  const [songs, setSongs] = useState<Song[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverError, setDiscoverError] = useState("")

  const [profileName, setProfileName] = useState("")
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("")
  const [userId, setUserId] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  const [submitTitle, setSubmitTitle] = useState("")
  const [submitArtist, setSubmitArtist] = useState("Nomli Mingle User")
  const [submitArtistBio, setSubmitArtistBio] = useState("")
  const [submitArtistUsername, setSubmitArtistUsername] = useState("")
  const [submitArtistAvatarUrl, setSubmitArtistAvatarUrl] = useState("")
  const [submitArtistYoutubeUrl, setSubmitArtistYoutubeUrl] = useState("")
  const [submitArtistSpotifyUrl, setSubmitArtistSpotifyUrl] = useState("")
  const [submitGenre, setSubmitGenre] = useState("Afrobeats")
  const [submitDurationSec, setSubmitDurationSec] = useState(String(MIN_SUBMISSION_CLIP_SECONDS))
  const [submitStartSec, setSubmitStartSec] = useState("0")
  const [selectedAudioDurationSec, setSelectedAudioDurationSec] = useState<number | null>(null)
  const [submitFile, setSubmitFile] = useState<File | null>(null)
  const [submitFilePreviewUrl, setSubmitFilePreviewUrl] = useState<string | null>(null)
  const [submitFileError, setSubmitFileError] = useState("")
  const [submitCoverFile, setSubmitCoverFile] = useState<File | null>(null)
  const [submitCoverPreviewUrl, setSubmitCoverPreviewUrl] = useState<string | null>(null)
  const [submitCoverError, setSubmitCoverError] = useState("")
  const [submitArtistAvatarUploading, setSubmitArtistAvatarUploading] = useState(false)
  const [splitBeforeUpload, setSplitBeforeUpload] = useState(true)
  const [submitRightsConfirmed, setSubmitRightsConfirmed] = useState(false)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitStep, setSubmitStep] = useState<1 | 2>(1)
  const [hasSavedMusicProfile, setHasSavedMusicProfile] = useState(false)

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
  const [editDraft, setEditDraft] = useState<{
    id: string
    title: string
    artist: string
    genre: string
    existing_cover_url: string | null
    duration_sec: string
  } | null>(null)
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null)
  const [editCoverPreviewUrl, setEditCoverPreviewUrl] = useState<string | null>(null)
  const [editCoverError, setEditCoverError] = useState("")
  const [editRemoveCover, setEditRemoveCover] = useState(false)
  const [editFormError, setEditFormError] = useState("")
  const [deleteConfirmSong, setDeleteConfirmSong] = useState<Song | null>(null)

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
      const res = await fetch("/api/music/discover", { cache: "no-store" })
      const payload = (await res.json().catch(() => ({}))) as {
        data?: unknown[]
        error?: string
        message?: string
      }
      if (!res.ok) {
        const hint =
          payload?.error === "not_configured"
            ? "Music isn’t configured: add Supabase URL + anon key (or service role) in .env.local, then restart the dev server."
            : payload?.message || "Unable to load music right now."
        setDiscoverError(hint)
        return
      }
      const data = payload.data
      const normalized: Song[] = Array.isArray(data)
        ? data
            .filter((row): row is Record<string, unknown> => {
              if (!row || typeof row !== "object") return false
              const r = row as Record<string, unknown>
              return Boolean(r.id && r.title && r.artist && r.url)
            })
            .map((r) => {
              return {
                id: String(r.id),
                title: String(r.title),
                artist: String(r.artist),
                url: String(r.url),
                cover_url: typeof r.cover_url === "string" ? r.cover_url : null,
                artist_bio: typeof r.artist_bio === "string" ? r.artist_bio : null,
                artist_username: typeof r.artist_username === "string" ? r.artist_username : null,
                artist_avatar_url: typeof r.artist_avatar_url === "string" ? r.artist_avatar_url : null,
                artist_youtube_url: typeof r.artist_youtube_url === "string" ? r.artist_youtube_url : null,
                artist_spotify_url: typeof r.artist_spotify_url === "string" ? r.artist_spotify_url : null,
                genre: typeof r.genre === "string" ? r.genre : null,
                duration_sec: typeof r.duration_sec === "number" ? r.duration_sec : 15,
                play_count: typeof r.play_count === "number" ? r.play_count : 0,
              }
            })
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
      const avatar = String(me?.user_metadata?.avatar_url || me?.user_metadata?.picture || "")
      setProfileName(name)
      setProfileAvatarUrl(avatar)

      const profileRows = await authedFetch(
        `/rest/v1/profiles?id=eq.${encodeURIComponent(
          String(me.id)
        )}&select=*`,
        {},
        true
      )
      const profile = Array.isArray(profileRows) && profileRows[0] ? profileRows[0] : null
      const admin = Boolean(profile?.is_admin || String(profile?.role || "").toLowerCase() === "admin")
      setIsAdmin(admin)
      const profileAvatar = String(
        profile?.avatar_url || profile?.photo_url || profile?.profile_image_url || profile?.image_url || ""
      )
      if (profileAvatar) {
        setProfileAvatarUrl(profileAvatar)
      }
      const profileDisplayName = String(profile?.display_name || profile?.full_name || "")
      if (profileDisplayName) {
        setProfileName(profileDisplayName)
      }

      /** Music identity: latest submission — never copy mobile profile / auth avatar into artist fields. */
      let lastSub: {
        artist?: string
        artist_username?: string | null
        artist_bio?: string | null
        artist_avatar_url?: string | null
        artist_youtube_url?: string | null
        artist_spotify_url?: string | null
      } | null = null
      try {
        const subRows = await authedFetch(
          `/rest/v1/app_song_submissions?submitted_by=eq.${encodeURIComponent(
            String(me.id)
          )}&select=artist,artist_username,artist_bio,artist_avatar_url,artist_youtube_url,artist_spotify_url&order=created_at.desc&limit=1`,
          {},
          true
        )
        lastSub = Array.isArray(subRows) && subRows[0] ? subRows[0] : null
      } catch {
        lastSub = null
      }

      if (lastSub) {
        const a = String(lastSub.artist || "").trim()
        if (a) setSubmitArtist(a)
        setSubmitArtistUsername(String(lastSub.artist_username || "").replace(/^@/, "").trim())
        setSubmitArtistBio(String(lastSub.artist_bio || "").trim())
        setSubmitArtistAvatarUrl(String(lastSub.artist_avatar_url || "").trim())
        setSubmitArtistYoutubeUrl(String(lastSub.artist_youtube_url || "").trim())
        setSubmitArtistSpotifyUrl(String(lastSub.artist_spotify_url || "").trim())
      } else {
        setSubmitArtist("Nomli Mingle User")
        setSubmitArtistUsername("")
        setSubmitArtistBio("")
        setSubmitArtistAvatarUrl("")
        setSubmitArtistYoutubeUrl("")
        setSubmitArtistSpotifyUrl("")
        /** Optional defaults from music-only profile columns (not mobile bio/links). */
        const profileMusicBio = String(profile?.music_bio || "").trim()
        const profileMusicYoutube = String(profile?.music_youtube_url || "").trim()
        const profileMusicSpotify = String(profile?.music_spotify_url || "").trim()
        if (profileMusicBio) setSubmitArtistBio(profileMusicBio)
        if (profileMusicYoutube) setSubmitArtistYoutubeUrl(profileMusicYoutube)
        if (profileMusicSpotify) setSubmitArtistSpotifyUrl(profileMusicSpotify)
      }

      const profileMusicBio = String(profile?.music_bio || "").trim()
      const profileMusicYoutube = String(profile?.music_youtube_url || "").trim()
      const profileMusicSpotify = String(profile?.music_spotify_url || "").trim()
      const savedFromSubmission = Boolean(
        lastSub &&
          (String(lastSub.artist_username || "").trim() ||
            String(lastSub.artist_avatar_url || "").trim() ||
            String(lastSub.artist_bio || "").trim() ||
            String(lastSub.artist_youtube_url || "").trim() ||
            String(lastSub.artist_spotify_url || "").trim())
      )
      const savedFromMusicProfileCols = Boolean(profileMusicBio || profileMusicYoutube || profileMusicSpotify)
      setHasSavedMusicProfile(savedFromSubmission || savedFromMusicProfileCols)
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
        `/rest/v1/app_song_submissions?submitted_by=eq.${encodeURIComponent(
          userId
        )}&select=id,title,artist,artist_bio,artist_username,artist_avatar_url,artist_youtube_url,artist_spotify_url,cover_url,genre,url,duration_sec,status,submitted_by,created_at`,
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
        "/rest/v1/app_song_submissions?status=eq.pending&select=id,title,artist,artist_bio,artist_username,artist_avatar_url,artist_youtube_url,artist_spotify_url,cover_url,genre,url,duration_sec,status,submitted_by,created_at",
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

  useEffect(() => {
    if (activeTab !== "discover") setMobileDiscoverLibraryOpen(false)
  }, [activeTab])

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(min-width: 768px)")
    const onMq = () => {
      if (mq.matches) setMobileDiscoverLibraryOpen(false)
    }
    mq.addEventListener("change", onMq)
    onMq()
    return () => mq.removeEventListener("change", onMq)
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    if (!mobileDiscoverLibraryOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileDiscoverLibraryOpen])

  useEffect(() => {
    if (!mobileDiscoverLibraryOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileDiscoverLibraryOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mobileDiscoverLibraryOpen])

  const resetEditSongModal = () => {
    setEditDraft(null)
    setEditFormError("")
    setEditCoverFile(null)
    setEditCoverError("")
    setEditRemoveCover(false)
    setEditCoverPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  useEffect(() => {
    if (!editDraft && !deleteConfirmSong) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (editSongBusyId || deleteSongBusyId) return
      resetEditSongModal()
      setDeleteConfirmSong(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editDraft, deleteConfirmSong, editSongBusyId, deleteSongBusyId])

  const filteredSongs = useMemo(() => {
    const all = genreFilter === "All" ? songs : songs.filter((s) => deriveGenre(s).toLowerCase() === genreFilter.toLowerCase())
    return all.sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0))
  }, [genreFilter, songs])

  const myArtistProfileHref = useMemo(() => {
    if (!userId) return null
    const displayArtist = (submitArtist || profileName || "").trim()
    if (!displayArtist) return null
    const slugSource = (submitArtistUsername || submitArtist || profileName || "artist").trim()
    const slug = slugifyArtist(slugSource) || "artist"
    return `/music/artist/${encodeURIComponent(slug)}?name=${encodeURIComponent(displayArtist)}`
  }, [userId, submitArtist, submitArtistUsername, profileName])

  const logout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("nomli_supabase_access_token")
      localStorage.removeItem("nomli_supabase_refresh_token")
    }
    setUserId("")
    setProfileName("")
    setProfileAvatarUrl("")
    setIsAdmin(false)
    setHasSavedMusicProfile(false)
    setMySubmissions([])
    setMyMessages([])
    setQueue([])
    setActiveTab("discover")
    setAuthChecked(true)
  }

  const activeSong = songs.find((s) => s.id === activeSongId) || null
  const progressPct = durationMs > 0 ? Math.min(100, (playbackMs / durationMs) * 100) : 0
  const elapsedSec = Math.max(0, Math.floor(playbackMs / 1000))
  const totalSec = Math.max(1, Math.round((durationMs || (activeSong?.duration_sec ?? 15) * 1000) / 1000))
  const activeGenre = activeSong ? deriveGenre(activeSong).toUpperCase() : ""
  const heroLabel = activeSong ? (activeGenre === "OTHER" ? "TRENDING NOW" : `${activeGenre} NOW`) : "NOMLI MUSIC"
  const heroSubLabel = activeSong
    ? `${activeSong.artist_username ? `@${activeSong.artist_username}` : activeSong.artist} · Live Discover`
    : "Live Discover"

  const playSong = async (song: Song, options?: { fromHistory?: boolean; triedIds?: Set<string> }) => {
    const audio = audioRef.current
    if (!audio) return
    const loadedSrc = audio.src || ""
    const songUrl = song.url || ""
    const sameSongLoaded = loadedSrc.length > 0 && loadedSrc.includes(songUrl)
    if (activeSongId === song.id && sameSongLoaded) {
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
    cover_url: item.cover_url ?? null,
    artist_bio: item.artist_bio ?? null,
    artist_username: item.artist_username ?? null,
    artist_avatar_url: item.artist_avatar_url ?? null,
    artist_youtube_url: item.artist_youtube_url ?? null,
    artist_spotify_url: item.artist_spotify_url ?? null,
    duration_sec: item.duration_sec ?? 15,
    play_count: 0,
  })

  const sendSubmissionStatusMessage = async (item: Submission, status: "approved" | "rejected") => {
    if (!item.submitted_by) return
    const title = status === "approved" ? "Track approved" : "Track not approved"
    const body =
      status === "approved"
        ? `"${item.title}" has been approved and is now in Nomli Mingle in-app music.`
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
      if (submitCoverPreviewUrl) URL.revokeObjectURL(submitCoverPreviewUrl)
    }
  }, [submitFilePreviewUrl, submitCoverPreviewUrl])

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
    if (submitFileError || submitCoverError) {
      alert(submitFileError || submitCoverError)
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
      let coverPublicUrl: string | null = null
      if (submitCoverFile) {
        const coverForm = new FormData()
        coverForm.append("file", submitCoverFile)
        coverForm.append("folder", "music/covers")
        coverForm.append("baseName", safeTitle || "track-cover")
        const coverUploadRes = await fetch("/api/upload/bunny-image", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getAccessToken()}`,
          },
          body: coverForm,
        })
        const coverUploadBody = await coverUploadRes.json().catch(() => null)
        if (!coverUploadRes.ok || !coverUploadBody?.url) {
          throw new Error(coverUploadBody?.error || "Cover upload failed")
        }
        coverPublicUrl = String(coverUploadBody.url)
      }
      const submissionPayload = {
        title: submitTitle.trim(),
        artist: submitArtist.trim(),
        genre: submitGenre,
        artist_bio: submitArtistBio.trim() || null,
        artist_username: submitArtistUsername.trim().replace(/^@/, "") || null,
        artist_avatar_url: submitArtistAvatarUrl.trim() || null,
        artist_youtube_url: submitArtistYoutubeUrl.trim() || null,
        artist_spotify_url: submitArtistSpotifyUrl.trim() || null,
        cover_url: coverPublicUrl,
        url: publicUrl,
        duration_sec: clipSeconds,
        status: "pending",
        submitted_by: userId,
      }
      try {
        await authedFetch("/rest/v1/app_song_submissions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(submissionPayload),
        }, true)
      } catch (err: any) {
        const message = String(err?.message || "")
        if (!message.toLowerCase().includes("artist_bio")) throw err
        await authedFetch("/rest/v1/app_song_submissions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            title: submissionPayload.title,
            artist: submissionPayload.artist,
            genre: submissionPayload.genre,
            artist_username: submissionPayload.artist_username,
            artist_avatar_url: submissionPayload.artist_avatar_url,
            artist_youtube_url: submissionPayload.artist_youtube_url,
            artist_spotify_url: submissionPayload.artist_spotify_url,
            cover_url: submissionPayload.cover_url,
            url: submissionPayload.url,
            duration_sec: submissionPayload.duration_sec,
            status: submissionPayload.status,
            submitted_by: submissionPayload.submitted_by,
          }),
        }, true)
      }

      setSubmitTitle("")
      setSubmitArtist(submissionPayload.artist.trim() || submitArtist)
      setSubmitArtistBio(submissionPayload.artist_bio?.trim() || "")
      setSubmitArtistUsername(String(submissionPayload.artist_username || "").replace(/^@/, "").trim())
      setSubmitArtistAvatarUrl(submissionPayload.artist_avatar_url?.trim() || "")
      setSubmitArtistYoutubeUrl(submissionPayload.artist_youtube_url?.trim() || "")
      setSubmitArtistSpotifyUrl(submissionPayload.artist_spotify_url?.trim() || "")
      setHasSavedMusicProfile(
        Boolean(
          submissionPayload.artist_username ||
            submissionPayload.artist_avatar_url ||
            submissionPayload.artist_bio ||
            submissionPayload.artist_youtube_url ||
            submissionPayload.artist_spotify_url
        )
      )
      setSubmitFile(null)
      if (submitFilePreviewUrl) URL.revokeObjectURL(submitFilePreviewUrl)
      setSubmitFilePreviewUrl(null)
      setSubmitFileError("")
      setSubmitCoverFile(null)
      if (submitCoverPreviewUrl) URL.revokeObjectURL(submitCoverPreviewUrl)
      setSubmitCoverPreviewUrl(null)
      setSubmitCoverError("")
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

  const goToSubmitStepTwo = () => {
    if (!submitTitle.trim()) {
      alert("Add track title first.")
      return
    }
    if (!submitArtist.trim()) {
      alert("Add artist name first.")
      return
    }
    setSubmitStep(2)
  }

  const handleSubmitArtistAvatarUpload = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      alert("Please choose a valid image file.")
      return
    }
    const token = getAccessToken()
    if (!token) {
      alert("Please login first.")
      return
    }
    setSubmitArtistAvatarUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("folder", "avatars")
      form.append("baseName", submitArtistUsername || submitArtist || "artist-avatar")
      const response = await fetch("/api/upload/bunny-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Artist avatar upload failed")
      }
      setSubmitArtistAvatarUrl(String(payload.url))
    } catch (err: any) {
      alert(err?.message || "Artist avatar upload failed.")
    } finally {
      setSubmitArtistAvatarUploading(false)
    }
  }

  const adminApprove = async (item: Submission) => {
    setAdminActionBusyId(item.id)
    try {
      const approvedPayload = {
        title: item.title,
        artist: item.artist,
        url: item.url,
        cover_url: item.cover_url || null,
        artist_bio: item.artist_bio || null,
        artist_username: item.artist_username || null,
        artist_avatar_url: item.artist_avatar_url || null,
        artist_youtube_url: item.artist_youtube_url || null,
        artist_spotify_url: item.artist_spotify_url || null,
        genre: item.genre,
        duration_sec: item.duration_sec ?? 15,
      }
      try {
        await authedFetch("/rest/v1/app_songs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(approvedPayload),
        }, true)
      } catch (err: any) {
        const message = String(err?.message || "")
        if (!message.toLowerCase().includes("artist_bio")) throw err
        await authedFetch("/rest/v1/app_songs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            title: approvedPayload.title,
            artist: approvedPayload.artist,
            url: approvedPayload.url,
            cover_url: approvedPayload.cover_url,
            artist_username: approvedPayload.artist_username,
            artist_avatar_url: approvedPayload.artist_avatar_url,
            artist_youtube_url: approvedPayload.artist_youtube_url,
            artist_spotify_url: approvedPayload.artist_spotify_url,
            genre: approvedPayload.genre,
            duration_sec: approvedPayload.duration_sec,
          }),
        }, true)
      }
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

  const openEditSongModal = (song: Song) => {
    setEditFormError("")
    setEditCoverError("")
    setEditRemoveCover(false)
    setEditCoverFile(null)
    setEditCoverPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    const rawGenre = (song.genre || "Other").trim() || "Other"
    setEditDraft({
      id: song.id,
      title: song.title,
      artist: song.artist,
      genre: rawGenre,
      existing_cover_url: song.cover_url ?? null,
      duration_sec: String(song.duration_sec ?? 15),
    })
  }

  const submitEditSong = async () => {
    if (!editDraft) return
    const nextTitle = editDraft.title.trim()
    const nextArtist = editDraft.artist.trim()
    if (!nextTitle || !nextArtist) {
      setEditFormError("Title and artist are required.")
      return
    }
    const nextGenre = editDraft.genre.trim() || "Other"
    const nextDuration = Number(editDraft.duration_sec)
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
      setEditFormError("Duration must be a positive number of seconds.")
      return
    }

    let nextCoverUrl: string | null
    if (editRemoveCover) {
      nextCoverUrl = null
    } else if (editCoverFile) {
      const safeTitle = nextTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      const coverForm = new FormData()
      coverForm.append("file", editCoverFile)
      coverForm.append("folder", "music/covers")
      coverForm.append("baseName", `${safeTitle || "cover"}-${editDraft.id.slice(0, 8)}`)
      const coverUploadRes = await fetch("/api/upload/bunny-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: coverForm,
      })
      const coverUploadBody = await coverUploadRes.json().catch(() => null)
      if (!coverUploadRes.ok || !coverUploadBody?.url) {
        setEditFormError(String(coverUploadBody?.error || "Cover upload failed"))
        return
      }
      nextCoverUrl = String(coverUploadBody.url)
    } else {
      nextCoverUrl = editDraft.existing_cover_url?.trim() || null
    }

    setEditSongBusyId(editDraft.id)
    try {
      await authedFetch(`/rest/v1/app_songs?id=eq.${encodeURIComponent(editDraft.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          title: nextTitle,
          artist: nextArtist,
          genre: nextGenre,
          cover_url: nextCoverUrl,
          duration_sec: Math.round(nextDuration),
        }),
      }, true)
      await loadDiscover()
      resetEditSongModal()
    } catch (err: any) {
      setEditFormError(err?.message || "Could not update song.")
    } finally {
      setEditSongBusyId("")
    }
  }

  const confirmDeleteLiveSong = async () => {
    const song = deleteConfirmSong
    if (!song) return
    setDeleteConfirmSong(null)
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

  const renderDiscover = () => {
    const showDiscoverGrid = !discoverLoading && !discoverError && filteredSongs.length > 0

    const discoverQueueButton = (song: Song, index: number, closeSheetAfterPick: boolean) => {
      const active = song.id === activeSongId
      return (
        <button
          key={song.id}
          type="button"
          onClick={() => {
            void playSong(song)
            if (closeSheetAfterPick) setMobileDiscoverLibraryOpen(false)
          }}
          className={`w-full rounded-lg px-3 py-2 text-left transition-colors border ${
            active ? "bg-white/10 border-white/30" : "bg-transparent border-transparent hover:bg-white/5"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-white/45 w-5">{String(index + 1).padStart(2, "0")}</span>
            {song.cover_url ? (
              <img src={song.cover_url} alt={song.title} className="h-8 w-8 rounded object-cover border border-white/15" />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-white truncate">{song.title}</p>
              <p className="text-[11px] text-white/60 truncate">{song.artist}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/music/artist/${encodeURIComponent(
                  slugifyArtist(song.artist_username || song.artist || "artist")
                )}?name=${encodeURIComponent(song.artist)}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-fuchsia-200/90 hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10"
              >
                Profile
              </Link>
              {active ? (
                <span className="flex items-end gap-[2px] h-3" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`w-[2px] rounded-full bg-gradient-to-t from-[#38bdf8] to-[#c4b5fd] ${
                        isPlaying ? "animate-[music-wave-v2_900ms_ease-in-out_infinite]" : ""
                      }`}
                      style={{ height: isPlaying ? undefined : "6px", animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </span>
              ) : null}
              <span className="text-[11px] text-white/55 tabular-nums">{fmt(song.duration_sec || 15)}</span>
            </div>
          </div>
        </button>
      )
    }

    const queueItemsDesktop = showDiscoverGrid ? filteredSongs.map((s, i) => discoverQueueButton(s, i, false)) : null
    const queueItemsSheet = showDiscoverGrid ? filteredSongs.map((s, i) => discoverQueueButton(s, i, true)) : null

    return (
    <>
      <section className="px-3 pt-3 sm:pt-4">
        <div className="rounded-[1.4rem] border border-white/10 bg-[#16121d] p-4 sm:p-6">
          {discoverLoading ? <p className="p-5 text-center text-sm text-white/45">Loading tracks...</p> : null}
          {!discoverLoading && discoverError ? (
            <p className="p-5 text-center text-sm text-red-300/95">{discoverError}</p>
          ) : null}
          {!discoverLoading && !discoverError && filteredSongs.length === 0 ? (
            <p className="p-5 text-center text-sm text-white/50">No tracks found for this filter.</p>
          ) : null}
          {!discoverLoading && !discoverError && filteredSongs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-[0.78fr_1.22fr] gap-4 md:gap-5">
              <div className="rounded-[1.3rem] bg-gradient-to-b from-[#1f1c45] to-[#13152f] p-5 sm:p-6 text-white min-h-[300px] md:min-h-[320px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 mb-4 sm:mb-5">Now playing</p>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                  <div className="relative h-28 sm:h-32 rounded-xl bg-gradient-to-br from-[#2f2c62] via-[#2a3f74] to-[#1c1d43] flex items-center justify-center overflow-hidden">
                    {activeSong?.cover_url ? (
                      <img src={activeSong.cover_url} alt={activeSong.title} className="absolute inset-0 h-full w-full object-cover" />
                    ) : null}
                    <div className="absolute inset-0 bg-black/30" />
                    <div
                      className={`pointer-events-none absolute -inset-[40%] rounded-full bg-[radial-gradient(ellipse_at_30%_20%,rgba(167,139,250,0.35),transparent_55%),radial-gradient(ellipse_at_70%_80%,rgba(34,211,238,0.22),transparent_50%)] ${
                        isPlaying ? "animate-[nomli-ambient-drift_9s_ease-in-out_infinite]" : "opacity-70"
                      }`}
                    />
                    <div className="pointer-events-none absolute -top-10 -left-10 h-24 w-24 rounded-full bg-violet-400/20 blur-2xl animate-[nomli-hero-orb-float_11s_ease-in-out_infinite]" />
                    <div
                      className="pointer-events-none absolute -bottom-10 -right-8 h-24 w-24 rounded-full bg-cyan-400/18 blur-2xl animate-[nomli-hero-orb-float_13s_ease-in-out_infinite]"
                      style={{ animationDelay: "1.2s" }}
                    />
                    <div className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center">
                      <div
                        className={`absolute inset-0 rounded-full bg-[conic-gradient(from_140deg,#67e8f9_0%,#a78bfa_32%,#f472b6_58%,#22d3ee_82%,#67e8f9_100%)] p-[2.5px] transition-[opacity,filter] duration-500 ${
                          isPlaying
                            ? "animate-[nomli-ring-spin_2.85s_linear_infinite] opacity-100 shadow-[0_0_28px_-4px_rgba(103,232,249,0.55),0_0_20px_-6px_rgba(244,114,182,0.35)]"
                            : "opacity-75"
                        }`}
                      >
                        <div className="h-full w-full rounded-full bg-gradient-to-b from-[#12102c]/95 to-[#0c0b22]/95" />
                      </div>
                      <div
                        className={`relative flex h-[3.35rem] w-[3.35rem] items-center justify-center rounded-[12px] border border-white/25 bg-[radial-gradient(circle_at_35%_28%,rgba(255,255,255,0.2),rgba(15,14,42,0.92)_45%,rgba(10,9,30,0.98)_100%)] backdrop-blur-sm ${
                          isPlaying
                            ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_0_1px_rgba(167,139,250,0.28),0_12px_28px_rgba(0,0,0,0.42)]"
                            : "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.35)]"
                        }`}
                      >
                        {isPlaying ? (
                          <div
                            className="pointer-events-none absolute inset-0 flex items-center justify-center animate-[nomli-spark-orbit_14s_linear_infinite]"
                            aria-hidden
                          >
                            <span className="absolute top-1 left-1/2 h-px w-[38%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
                            <span className="absolute bottom-1 left-1/2 h-px w-[38%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                            <span className="absolute left-1 top-1/2 h-[38%] w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-white/30 to-transparent" />
                            <span className="absolute right-1 top-1/2 h-[38%] w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-white/25 to-transparent" />
                          </div>
                        ) : null}
                        {(
                          [
                            { className: "top-1 left-1", color: "#facc15" },
                            { className: "top-1 right-1", color: "#fb7185" },
                            { className: "bottom-1 left-1", color: "#4ade80" },
                            { className: "bottom-1 right-1", color: "#60a5fa" },
                          ] as const
                        ).map((spark, i) => (
                          <span
                            key={i}
                            className={`absolute h-1.5 w-1.5 rounded-full ${spark.className} ${
                              isPlaying ? "animate-[nomli-spark-twinkle_1.35s_ease-in-out_infinite]" : "opacity-70"
                            }`}
                            style={{
                              backgroundColor: spark.color,
                              boxShadow: `0 0 8px ${spark.color}`,
                              animationDelay: isPlaying ? `${i * 160}ms` : undefined,
                            }}
                            aria-hidden
                          />
                        ))}
                        <span
                          className={`pointer-events-none absolute z-[5] h-2 w-2 rounded-full bg-white ${
                            isPlaying ? "animate-[nomli-core-beacon_1.5s_ease-in-out_infinite]" : "opacity-90 shadow-[0_0_10px_rgba(255,255,255,0.6)]"
                          }`}
                          aria-hidden
                        />
                        <img src="/icon.png" alt="Nomli Mingle" className="relative z-10 h-8 w-8 object-contain opacity-[0.97] drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-1.5">
                    <p className="text-sm sm:text-base font-semibold leading-snug truncate">{activeSong?.title || "Select a track"}</p>
                    <p className="text-xs sm:text-sm text-white/65 truncate">{activeSong?.artist || "Nomli Music"}</p>
                  </div>
                  <div className="mt-5 h-2 rounded-full bg-white/12 overflow-hidden ring-1 ring-inset ring-white/10">
                    <div className="h-full overflow-hidden rounded-full" style={{ width: `${progressPct}%` }}>
                      <div className="relative h-full w-full">
                        <div className="absolute inset-0 bg-gradient-to-r from-[#a78bfa] via-[#818cf8] to-[#22d3ee]" />
                        {isPlaying ? (
                          <div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-90 bg-[length:220%_100%] animate-[shimmer_1.8s_linear_infinite]"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-center gap-1 h-8 px-1">
                    {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                      <span
                        key={bar}
                        className={`w-[3px] rounded-full bg-gradient-to-t from-[#38bdf8] via-[#a78bfa] to-[#f9a8d4] origin-bottom ${
                          isPlaying ? "animate-[music-wave-v2_980ms_ease-in-out_infinite]" : ""
                        }`}
                        style={{
                          height: isPlaying ? undefined : "7px",
                          opacity: isPlaying ? 1 : 0.5,
                          animationDelay: `${bar * 85}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-white/60 tabular-nums px-0.5">
                    <span>{fmt(elapsedSec)}</span>
                    <span>{fmt(totalSec)}</span>
                  </div>
                  <div className="mt-5 flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        void playPreviousTrack()
                      }}
                      className="h-11 w-11 sm:h-10 sm:w-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <SkipBack className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => activeSong && void playSong(activeSong)}
                      className="h-12 w-12 sm:h-11 sm:w-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center active:scale-95 transition-transform"
                    >
                      {isPlaying ? <Pause className="h-5 w-5 sm:h-4 sm:w-4" /> : <Play className="h-5 w-5 sm:h-4 sm:w-4 ml-0.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void playNextTrack()
                      }}
                      className="h-11 w-11 sm:h-10 sm:w-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <SkipForward className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5" />
                    </button>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 pb-0.5">
                    <button
                      type="button"
                      onClick={() => setShuffleEnabled((prev) => !prev)}
                      className={`min-h-[2rem] px-3 py-1.5 rounded-full border text-[10px] sm:text-[11px] font-medium inline-flex items-center justify-center gap-1.5 ${
                        shuffleEnabled ? "border-cyan-300/70 bg-cyan-300/12 text-cyan-100" : "border-white/20 text-white/60"
                      }`}
                    >
                      <Shuffle className="h-3 w-3 shrink-0" />
                      Shuffle
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRepeatMode((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"))
                      }
                      className={`min-h-[2rem] px-3 py-1.5 rounded-full border text-[10px] sm:text-[11px] font-medium inline-flex items-center justify-center gap-1.5 ${
                        repeatMode !== "off" ? "border-violet-300/70 bg-violet-300/12 text-violet-100" : "border-white/20 text-white/60"
                      }`}
                    >
                      {repeatMode === "one" ? <Repeat1 className="h-3 w-3 shrink-0" /> : <Repeat className="h-3 w-3 shrink-0" />}
                      {repeatMode === "off" ? "Repeat Off" : repeatMode === "all" ? "Repeat All" : "Repeat One"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.3rem] bg-gradient-to-b from-[#1f1c45] to-[#13152f] p-5 sm:p-6 min-h-0 md:min-h-[295px] text-white">
                <div className="relative mb-0 md:mb-5 overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-[#2f2b58] via-[#344872] to-[#1e3550] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] min-h-[10.5rem] sm:min-h-[8.75rem] bg-[length:220%_220%] animate-[nomli-hero-breathe_12s_ease-in-out_infinite]">
                  <div className="pointer-events-none absolute -top-12 -right-10 h-36 w-36 rounded-full bg-violet-300/18 blur-3xl animate-[nomli-hero-orb-float_10s_ease-in-out_infinite]" />
                  <div
                    className="pointer-events-none absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-cyan-400/14 blur-3xl animate-[nomli-hero-orb-float_11.5s_ease-in-out_infinite]"
                    style={{ animationDelay: "1.5s" }}
                  />
                  <div className="relative z-10 flex flex-col gap-5 sm:gap-4">
                    <div className="flex items-start justify-between gap-3 sm:items-stretch">
                      <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                          {activeSong ? (activeGenre === "OTHER" ? "Trending" : activeGenre.replace(/-/g, " ")) : "Discover"}
                        </p>
                        <p className="text-[1.35rem] font-bold leading-[1.15] tracking-tight text-white sm:text-2xl sm:leading-tight animate-[hero-text_700ms_ease-out]">
                          {heroLabel}
                        </p>
                        <p className="text-[11px] leading-snug text-white/75 sm:text-xs animate-[hero-text_900ms_ease-out]">
                          {heroSubLabel}
                        </p>
                      </div>
                      {showDiscoverGrid ? (
                        <button
                          type="button"
                          onClick={() => setMobileDiscoverLibraryOpen((open) => !open)}
                          aria-label={
                            mobileDiscoverLibraryOpen
                              ? "Close music library"
                              : `Open music library, ${filteredSongs.length} tracks`
                          }
                          aria-expanded={mobileDiscoverLibraryOpen}
                          className={`md:hidden shrink-0 flex flex-col items-center gap-0.5 rounded-2xl border px-2.5 py-2 shadow-md backdrop-blur-md transition-[transform,background-color,border-color,box-shadow] active:scale-[0.97] ${
                            mobileDiscoverLibraryOpen
                              ? "border-fuchsia-400/45 bg-fuchsia-950/45 text-fuchsia-50 shadow-[0_0_24px_-8px_rgba(192,38,211,0.45)]"
                              : "border-white/20 bg-black/25 text-white"
                          }`}
                        >
                          <Music4 className="h-[18px] w-[18px] opacity-95" aria-hidden />
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-white/80">Tracks</span>
                          {!mobileDiscoverLibraryOpen && filteredSongs.length > 0 ? (
                            <span className="mt-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#D6526A] px-1 text-[10px] font-bold tabular-nums text-white">
                              {filteredSongs.length > 99 ? "99+" : filteredSongs.length}
                            </span>
                          ) : null}
                        </button>
                      ) : null}
                    </div>
                    <div className="shrink-0">
                      {activeSong ? (
                        <Link
                          href={`/music/artist/${encodeURIComponent(
                            slugifyArtist(activeSong.artist_username || activeSong.artist || "artist")
                          )}?name=${encodeURIComponent(activeSong.artist)}`}
                          className="inline-flex w-fit items-center gap-2 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/12 px-4 py-2 text-[11px] font-semibold text-fuchsia-100 shadow-[0_0_24px_-8px_rgba(217,70,239,0.4)] transition-colors hover:border-fuchsia-300/55 hover:bg-fuchsia-500/22"
                        >
                          View artist profile
                        </Link>
                      ) : (
                        <p className="text-[11px] text-white/45">Pick a track to open its artist page.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="hidden md:block">
                  <div className="flex items-center justify-between mb-3">
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
                    {queueItemsDesktop}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
      {showDiscoverGrid && mobileDiscoverLibraryOpen ? (
        <div
          className="md:hidden fixed inset-0 z-[90]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-discover-library-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close library"
            onClick={() => setMobileDiscoverLibraryOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[min(88vh,720px)] flex-col rounded-t-[1.25rem] border border-white/10 border-b-0 bg-[#12101c] shadow-[0_-20px_60px_rgba(0,0,0,0.55)]">
            <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
              <h2 id="mobile-discover-library-title" className="text-sm font-semibold text-white">
                Library
              </h2>
              <button
                type="button"
                className="rounded-full p-2 text-white/80 hover:bg-white/10"
                aria-label="Close"
                onClick={() => setMobileDiscoverLibraryOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="px-4 pt-2.5 text-[11px] leading-snug text-white/50">
              Change genre in the bar above—scroll the chips sideways, then pick a track here.
            </p>
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/55">Trending</h3>
              <button
                type="button"
                onClick={() => {
                  if (filteredSongs.length > 0) {
                    void playSong(filteredSongs[0])
                    setMobileDiscoverLibraryOpen(false)
                  }
                }}
                className="text-xs font-medium text-fuchsia-200/95 hover:text-white"
              >
                Play all
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8 [scrollbar-width:thin]">
              <div className="space-y-1.5 pr-0.5">{queueItemsSheet}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
    )
  }

  const renderSubmit = () => (
    <section className="px-3 pt-4">
      <div className="rounded-xl border border-white/10 bg-[#201820]/60 p-4">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-[#E07A8F]" />
          <h2 className="text-sm font-semibold">Submit Track</h2>
        </div>
        <p className="mt-2 text-xs text-white/65 leading-relaxed">
          Sign in with your Nomli Mingle account, then upload a clip and submit it. We review submissions; if yours is approved, it is added to in-app music in Nomli Mingle—the catalog listeners hear inside the app.
        </p>
        <p className="mt-2 text-[11px] text-amber-200/85 leading-snug">
          Upload only music you own or have permission to share publicly—we may reject submissions that infringe rights.
        </p>
        {!authChecked ? <p className="mt-3 text-sm text-white/50">Checking login...</p> : null}
        {authChecked && !userId ? (
          <div className="mt-4 rounded-lg border border-white/10 p-3">
            <p className="text-sm text-white/70">
              Sign in with your Nomli Mingle account to submit a track. Approved songs are added to in-app music.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent("/music?tab=submit")}`}
              className="inline-flex mt-3 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#c9455e] to-[#e34d6d] px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_-8px_rgba(227,77,109,0.55)] hover:brightness-110"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in to upload
            </Link>
          </div>
        ) : null}
        {userId ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubmitStep(1)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
                  submitStep === 1 ? "bg-[#D6526A] border-[#D6526A] text-white" : "border-white/15 text-white/65"
                }`}
              >
                1. Track Info
              </button>
              <button
                type="button"
                onClick={() => setSubmitStep(2)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
                  submitStep === 2 ? "bg-[#D6526A] border-[#D6526A] text-white" : "border-white/15 text-white/65"
                }`}
              >
                2. Upload & Submit
              </button>
            </div>
            <div className="rounded-md border border-white/10 bg-[#141014] px-3 py-2.5">
              <p className="text-[11px] text-white/55 mb-2">
                Your Nomli account (chat / app profile). Artist name below is your music identity only.
              </p>
              <div className="flex items-center gap-2.5">
                {profileAvatarUrl ? (
                  <img
                    src={profileAvatarUrl}
                    alt="Profile avatar"
                    className="h-9 w-9 rounded-full object-cover border border-white/15"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full border border-white/15 bg-white/10 flex items-center justify-center text-xs font-semibold text-white/80">
                    {(profileName || "N").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{profileName || "Nomli User"}</p>
                  <p className="text-[11px] text-white/60 truncate">{submitArtist || "Nomli Mingle User"}</p>
                </div>
              </div>
            </div>
            <input
              value={submitTitle}
              onChange={(e) => setSubmitTitle(e.target.value)}
              placeholder="Track title"
              className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A]"
            />
            {submitStep === 1 ? (
              <>
                <input
                  value={submitArtist}
                  onChange={(e) => setSubmitArtist(e.target.value)}
                  placeholder="Artist name"
                  className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A]"
                />
                {hasSavedMusicProfile ? (
                  <div className="rounded-md border border-white/10 bg-[#141014] px-3 py-2.5">
                    <p className="text-xs text-white/80">Using your saved music profile.</p>
                    <p className="mt-1 text-[11px] text-white/60">
                      Username, avatar, bio, and social links are auto-applied to new uploads.
                    </p>
                    {myArtistProfileHref ? (
                      <Link
                        href={myArtistProfileHref}
                        className="inline-flex mt-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-medium text-fuchsia-100 hover:bg-fuchsia-500/20"
                      >
                        Open artist page
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveTab("dashboard")}
                        className="mt-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium text-white hover:bg-white/15"
                      >
                        Open dashboard
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <textarea
                      value={submitArtistBio}
                      onChange={(e) => setSubmitArtistBio(e.target.value)}
                      placeholder="Artist bio (optional, like Spotify/YouTube Music)"
                      rows={3}
                      className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A] resize-none"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={submitArtistUsername}
                        onChange={(e) => setSubmitArtistUsername(e.target.value)}
                        placeholder="Artist username (e.g. @nomliartist)"
                        className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A]"
                      />
                      <div className="rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm">
                        <p className="text-[11px] text-white/60 mb-1">Artist avatar image</p>
                        <input
                          type="file"
                          accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                          onChange={(e) => void handleSubmitArtistAvatarUpload(e.target.files?.[0] || null)}
                          className="w-full text-sm"
                        />
                        <p className="mt-1 text-[11px] text-white/60">
                          {submitArtistAvatarUploading
                            ? "Uploading avatar..."
                            : submitArtistAvatarUrl
                              ? "Avatar uploaded."
                              : "No avatar uploaded yet."}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={submitArtistYoutubeUrl}
                        onChange={(e) => setSubmitArtistYoutubeUrl(e.target.value)}
                        placeholder="YouTube profile URL"
                        className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A]"
                      />
                      <input
                        value={submitArtistSpotifyUrl}
                        onChange={(e) => setSubmitArtistSpotifyUrl(e.target.value)}
                        placeholder="Spotify profile URL"
                        className="w-full rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-sm outline-none focus:border-[#D6526A]"
                      />
                    </div>
                  </>
                )}
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
                <button
                  type="button"
                  onClick={goToSubmitStepTwo}
                  className="w-full rounded-md bg-[#D6526A] px-3 py-2.5 text-sm font-semibold"
                >
                  Continue to Upload
                </button>
              </>
            ) : (
              <>
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
                <div className="rounded-md border border-white/10 bg-[#141014] px-3 py-2">
                  <p className="mb-2 text-xs text-white/65">Song cover avatar (optional): JPG, PNG, WEBP</p>
                  <input
                    type="file"
                    accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      if (!file) {
                        setSubmitCoverFile(null)
                        setSubmitCoverError("")
                        if (submitCoverPreviewUrl) URL.revokeObjectURL(submitCoverPreviewUrl)
                        setSubmitCoverPreviewUrl(null)
                        return
                      }
                      if (!isImageFile(file)) {
                        setSubmitCoverFile(null)
                        setSubmitCoverError("Please choose a valid image file.")
                        if (submitCoverPreviewUrl) URL.revokeObjectURL(submitCoverPreviewUrl)
                        setSubmitCoverPreviewUrl(null)
                        e.currentTarget.value = ""
                        return
                      }
                      setSubmitCoverFile(file)
                      setSubmitCoverError("")
                      const objectUrl = URL.createObjectURL(file)
                      if (submitCoverPreviewUrl) URL.revokeObjectURL(submitCoverPreviewUrl)
                      setSubmitCoverPreviewUrl(objectUrl)
                    }}
                    className="w-full text-sm"
                  />
                  {submitCoverPreviewUrl ? (
                    <img src={submitCoverPreviewUrl} alt="Cover preview" className="mt-2 h-16 w-16 rounded object-cover border border-white/15" />
                  ) : null}
                  {submitCoverError ? <p className="mt-2 text-[11px] text-red-300">{submitCoverError}</p> : null}
                </div>
                <label className="flex items-start gap-2 rounded-md border border-white/10 bg-[#141014] px-3 py-2.5 text-xs text-white/75">
                  <input
                    type="checkbox"
                    checked={submitRightsConfirmed}
                    onChange={(e) => setSubmitRightsConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-white/30 bg-transparent"
                  />
                  <span>
                    I confirm this is my original track, or I have full legal rights and permission to upload and distribute this audio in Nomli Mingle (including in-app music).
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSubmitStep(1)}
                    className="w-full rounded-md border border-white/20 px-3 py-2.5 text-sm font-semibold text-white/80"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitBusy || !submitRightsConfirmed}
                    onClick={() => void handleSubmitTrack()}
                    className="w-full rounded-md bg-[#D6526A] px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {submitBusy ? "Submitting..." : "Submit for Review"}
                  </button>
                </div>
              </>
            )}
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
        <div className="mt-3 flex flex-wrap gap-2">
          {myArtistProfileHref ? (
            <Link
              href={myArtistProfileHref}
              className="inline-flex rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-medium text-fuchsia-100 hover:bg-fuchsia-500/20"
            >
              View my artist profile
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setActiveTab("submit")}
            className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
          >
            New upload
          </button>
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
      {isAdmin ? (
        <div className="mb-3 rounded-xl border border-violet-400/30 bg-gradient-to-br from-violet-500/15 to-cyan-500/10 p-4">
          <p className="text-sm font-semibold text-white">Music catalog uploader</p>
          <p className="mt-1 text-xs text-white/65">
            Upload tracks to Supabase storage and the live catalog. Uses the admin API (server-side service role).
          </p>
          <Link
            href="/admin/music"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-violet-300/40 bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:border-violet-200/50 hover:bg-violet-500/30"
          >
            Open admin music uploader
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}
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
                  onClick={() => openEditSongModal(song)}
                  className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 disabled:opacity-60"
                >
                  {editSongBusyId === song.id ? "Saving..." : "Edit"}
                </button>
                <button
                  type="button"
                  disabled={deleteSongBusyId === song.id}
                  onClick={() => setDeleteConfirmSong(song)}
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

  const loginNextHref = `/login?next=${encodeURIComponent(`/music?tab=${activeTab}`)}`

  return (
    <main className="relative min-h-screen bg-[#0a080c] text-[#f4eef1] pb-10">
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-90"
        aria-hidden
      >
        <div className="absolute top-[-12%] right-[-20%] h-[min(520px,80vw)] w-[min(520px,80vw)] rounded-full bg-[#5b2140]/25 blur-[100px]" />
        <div className="absolute bottom-[-8%] left-[-15%] h-[min(440px,70vw)] w-[min(440px,70vw)] rounded-full bg-[#1e2a4a]/35 blur-[90px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] opacity-[0.35]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[880px] min-h-screen pb-24 sm:pb-28 md:pb-36">
        <header className="sticky top-0 z-20 flex min-h-[56px] flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0a080c]/88 px-3 py-3.5 backdrop-blur-xl sm:min-h-[54px] sm:px-5 sm:py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#e34d6d] shadow-[0_0_10px_rgba(227,77,109,0.65)]" />
              <span className="font-semibold tracking-[0.12em] text-[11px] text-white sm:text-xs">NOMLI MUSIC</span>
            </div>
            <span className="pl-4 text-[10px] text-white/40 sm:pl-5">Discover · submit · your artist hub</span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {authChecked && userId && myArtistProfileHref ? (
              <Link
                href={myArtistProfileHref}
                className="hidden rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-100/95 hover:bg-fuchsia-500/18 sm:inline-flex"
              >
                My page
              </Link>
            ) : null}
            {authChecked && !userId ? (
              <Link
                href={loginNextHref}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-white/90 hover:border-fuchsia-400/35 hover:bg-white/[0.1]"
              >
                <LogIn className="h-3 w-3 opacity-80" />
                Sign in
              </Link>
            ) : null}
            {authChecked && userId ? (
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#141018]/90 py-0.5 pl-0.5 pr-1">
                {profileAvatarUrl ? (
                  <img src={profileAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-white/15" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/80">
                    {(profileName || "N").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="max-w-[100px] truncate text-[10px] text-white/70 sm:max-w-[140px]">{profileName || "Account"}</span>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-[#161018] px-2.5 py-1.5 text-[11px] text-white/80 hover:border-white/20 hover:text-white"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Home
            </Link>
          </div>
        </header>

        <div className="border-b border-white/[0.06] bg-[#0a080c]/40">
          <div
            className="flex min-h-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-5 py-2 sm:px-6 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] snap-x snap-proximity scroll-pl-5 scroll-pr-5 sm:scroll-pl-6 sm:scroll-pr-6 [&::-webkit-scrollbar]:hidden"
            role="toolbar"
            aria-label="Music navigation and genre filters"
          >
            {[
              { key: "discover", label: "Discover" },
              { key: "submit", label: "Submit" },
              { key: "dashboard", label: "Dashboard" },
              ...(isAdmin ? [{ key: "admin", label: "Admin" }] : []),
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={`shrink-0 snap-start rounded-full border px-2.5 py-1 text-[10px] font-medium leading-tight tracking-wide transition-[color,background-color,border-color,box-shadow] sm:px-3 sm:text-[11px] ${
                  activeTab === tab.key
                    ? "border-[#c9455e]/90 bg-gradient-to-r from-[#c9455e] to-[#e34d6d] text-white shadow-[0_3px_12px_-4px_rgba(227,77,109,0.42)]"
                    : "border-white/10 bg-white/[0.035] text-white/55 hover:border-white/16 hover:bg-white/[0.06] hover:text-white/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
            {activeTab === "discover" ? (
              <>
                <span className="mx-0.5 shrink-0 w-px self-stretch min-h-[1.125rem] rounded-full bg-white/10" aria-hidden />
                {DISCOVER_GENRES.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => setGenreFilter(genre)}
                    className={`shrink-0 snap-start rounded-full border px-2.5 py-1 text-[10px] font-medium leading-tight transition-[color,background-color,border-color,box-shadow] sm:px-2.5 sm:text-[11px] ${
                      genreFilter === genre
                        ? "border-[#D6526A]/90 bg-[#D6526A] text-white shadow-[0_2px_10px_-3px_rgba(214,82,106,0.4)]"
                        : "border-white/10 bg-[#141018]/70 text-white/55 hover:border-white/15 hover:bg-[#141018] hover:text-white/80"
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </>
            ) : null}
          </div>
        </div>

      {activeTab === "discover" ? renderDiscover() : null}
      {activeTab === "submit" ? renderSubmit() : null}
      {activeTab === "dashboard" ? renderDashboard() : null}
      {activeTab === "admin" ? renderAdmin() : null}

      {editDraft ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/65 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editSongBusyId) resetEditSongModal()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-edit-song-title"
            className="w-full max-w-md rounded-2xl border border-white/12 bg-[#141014] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="admin-edit-song-title" className="text-base font-semibold text-white">
              Edit live track
            </h2>
            <p className="mt-1 text-xs text-white/50">Update metadata for this catalog entry.</p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[11px] font-medium text-white/55">Title</span>
                <input
                  type="text"
                  value={editDraft.title}
                  onChange={(e) => setEditDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[#c9455e]/55"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-white/55">Artist</span>
                <input
                  type="text"
                  value={editDraft.artist}
                  onChange={(e) => setEditDraft((d) => (d ? { ...d, artist: e.target.value } : d))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[#c9455e]/55"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-white/55">Genre</span>
                <select
                  value={editDraft.genre}
                  onChange={(e) => setEditDraft((d) => (d ? { ...d, genre: e.target.value } : d))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[#c9455e]/55"
                >
                  {liveCatalogGenreOptions(editDraft.genre).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg border border-white/15 bg-black/20 px-3 py-2.5">
                <span className="text-[11px] font-medium text-white/55">Cover image (optional)</span>
                <p className="mt-0.5 text-[10px] text-white/40">JPG, PNG, WEBP — uploads to CDN (same as track submit).</p>
                <input
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                  disabled={Boolean(editSongBusyId)}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    if (!file) {
                      setEditCoverFile(null)
                      setEditCoverError("")
                      setEditCoverPreviewUrl((prev) => {
                        if (prev) URL.revokeObjectURL(prev)
                        return null
                      })
                      return
                    }
                    if (!isImageFile(file)) {
                      setEditCoverFile(null)
                      setEditCoverError("Please choose a valid image file.")
                      setEditCoverPreviewUrl((prev) => {
                        if (prev) URL.revokeObjectURL(prev)
                        return null
                      })
                      e.currentTarget.value = ""
                      return
                    }
                    setEditCoverFile(file)
                    setEditCoverError("")
                    setEditRemoveCover(false)
                    const objectUrl = URL.createObjectURL(file)
                    setEditCoverPreviewUrl((prev) => {
                      if (prev) URL.revokeObjectURL(prev)
                      return objectUrl
                    })
                  }}
                  className="mt-2 w-full text-xs text-white/80 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-white"
                />
                {editCoverPreviewUrl ? (
                  <img
                    src={editCoverPreviewUrl}
                    alt="New cover preview"
                    className="mt-2 h-16 w-16 rounded object-cover border border-white/15"
                  />
                ) : !editRemoveCover && editDraft.existing_cover_url ? (
                  <img
                    src={editDraft.existing_cover_url}
                    alt="Current cover"
                    className="mt-2 h-16 w-16 rounded object-cover border border-white/15"
                  />
                ) : null}
                {editRemoveCover ? (
                  <p className="mt-2 text-[11px] text-amber-200/85">Current cover will be removed when you save.</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {editDraft.existing_cover_url || editCoverFile ? (
                    <button
                      type="button"
                      disabled={Boolean(editSongBusyId)}
                      onClick={() => {
                        setEditRemoveCover(true)
                        setEditCoverFile(null)
                        setEditCoverError("")
                        setEditCoverPreviewUrl((prev) => {
                          if (prev) URL.revokeObjectURL(prev)
                          return null
                        })
                      }}
                      className="text-[11px] font-medium text-white/55 underline decoration-white/25 underline-offset-2 hover:text-white/80 disabled:opacity-50"
                    >
                      Remove cover
                    </button>
                  ) : null}
                  {editCoverFile || editRemoveCover ? (
                    <button
                      type="button"
                      disabled={Boolean(editSongBusyId)}
                      onClick={() => {
                        setEditRemoveCover(false)
                        setEditCoverFile(null)
                        setEditCoverError("")
                        setEditCoverPreviewUrl((prev) => {
                          if (prev) URL.revokeObjectURL(prev)
                          return null
                        })
                      }}
                      className="text-[11px] font-medium text-violet-300/90 underline decoration-violet-400/35 underline-offset-2 hover:text-violet-200 disabled:opacity-50"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
                {editCoverError ? <p className="mt-2 text-[11px] text-red-300/95">{editCoverError}</p> : null}
              </div>
              <label className="block">
                <span className="text-[11px] font-medium text-white/55">Duration (seconds)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={editDraft.duration_sec}
                  onChange={(e) => setEditDraft((d) => (d ? { ...d, duration_sec: e.target.value } : d))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[#c9455e]/55"
                />
              </label>
            </div>
            {editFormError ? <p className="mt-3 text-xs text-red-300/95">{editFormError}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(editSongBusyId)}
                onClick={() => resetEditSongModal()}
                className="rounded-lg border border-white/18 bg-transparent px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.06] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(editSongBusyId)}
                onClick={() => void submitEditSong()}
                className="rounded-lg bg-gradient-to-r from-[#c9455e] to-[#e34d6d] px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_-8px_rgba(227,77,109,0.5)] disabled:opacity-50"
              >
                {editSongBusyId ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmSong ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/65 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleteSongBusyId) setDeleteConfirmSong(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-delete-song-title"
            className="w-full max-w-sm rounded-2xl border border-white/12 bg-[#141014] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="admin-delete-song-title" className="text-base font-semibold text-white">
              Delete from live catalog?
            </h2>
            <p className="mt-2 text-sm text-white/65">
              <span className="font-medium text-white/90">{deleteConfirmSong.title}</span>
              <span className="text-white/45"> · </span>
              {deleteConfirmSong.artist}
            </p>
            <p className="mt-2 text-xs text-white/45">This removes the track from discovery. Storage files are not deleted here.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(deleteSongBusyId)}
                onClick={() => setDeleteConfirmSong(null)}
                className="rounded-lg border border-white/18 bg-transparent px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.06] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deleteSongBusyId)}
                onClick={() => void confirmDeleteLiveSong()}
                className="rounded-lg bg-red-600/90 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
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

