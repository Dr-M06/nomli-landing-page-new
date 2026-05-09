"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play } from "lucide-react"
import { useParams, useSearchParams } from "next/navigation"

type SongRow = {
  id: string
  title: string
  artist: string
  url?: string | null
  genre?: string | null
  duration_sec?: number | null
  play_count?: number | null
  cover_url?: string | null
  artist_bio?: string | null
  artist_username?: string | null
  artist_avatar_url?: string | null
  artist_youtube_url?: string | null
  artist_spotify_url?: string | null
}

const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
const PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

function fmt(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function getAccessToken() {
  if (typeof window === "undefined") return ""
  return localStorage.getItem("nomli_supabase_access_token") || ""
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.397.1-.791-.141-.891-.54-.1-.421.14-.84.54-.94 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.78-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  )
}

export default function ArtistPage() {
  const params = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const artistSlug = String(params?.slug || "")
  const artistNameHint = searchParams.get("name") || ""

  const [songs, setSongs] = useState<SongRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [profileBio, setProfileBio] = useState("")
  const [profileUsername, setProfileUsername] = useState("")
  const [profileAvatar, setProfileAvatar] = useState("")
  const [profileYoutube, setProfileYoutube] = useState("")
  const [profileSpotify, setProfileSpotify] = useState("")
  const [isOfficialAccount, setIsOfficialAccount] = useState(false)
  const [isBioModalOpen, setIsBioModalOpen] = useState(false)
  const [canEditProfile, setCanEditProfile] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [activeSongId, setActiveSongId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!canEditProfile) setEditing(false)
  }, [canEditProfile])

  const loadData = async () => {
    setLoading(true)
    setError("")
    setCanEditProfile(false)
    const queryArtist = artistNameHint.trim() || artistSlug.replace(/-/g, " ").trim()
    try {
      const songsRes = await fetch(
        `/api/music/discover?sort=plays&artist=${encodeURIComponent(queryArtist)}`,
        { cache: "no-store" }
      )
      const songsPayload = (await songsRes.json().catch(() => ({}))) as { data?: SongRow[]; message?: string }
      if (!songsRes.ok) {
        setError(songsPayload?.message || "Could not load this artist’s music.")
        setSongs([])
        setLoading(false)
        return
      }
      const normalizedSongs = Array.isArray(songsPayload.data) ? songsPayload.data : []
      setSongs(normalizedSongs)

      const richSong = normalizedSongs.find(
        (s) => s.artist_bio || s.artist_avatar_url || s.artist_username || s.artist_youtube_url || s.artist_spotify_url
      )

      let profileRow: SongRow | null = richSong || null

      if (!profileRow && PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY) {
        const fallbackUrl = `${PUBLIC_SUPABASE_URL}/rest/v1/app_song_submissions?select=artist_bio,artist_username,artist_avatar_url,artist_youtube_url,artist_spotify_url&artist=ilike.*${encodeURIComponent(
          queryArtist
        )}*&order=created_at.desc&limit=1`
        const fallbackRes = await fetch(fallbackUrl, {
          headers: {
            apikey: PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${PUBLIC_SUPABASE_ANON_KEY}`,
          },
        })
        const fallbackRows = (await fallbackRes.json().catch(() => [])) as SongRow[]
        profileRow = Array.isArray(fallbackRows) && fallbackRows[0] ? fallbackRows[0] : null
      }

      if (profileRow) {
        setProfileBio(profileRow.artist_bio || "")
        setProfileUsername(profileRow.artist_username || "")
        setProfileAvatar(profileRow.artist_avatar_url || "")
        setProfileYoutube(profileRow.artist_youtube_url || "")
        setProfileSpotify(profileRow.artist_spotify_url || "")
        const rowUser = String(profileRow.artist_username || "")
          .trim()
          .replace(/^@/, "")
          .toLowerCase()
        setIsOfficialAccount(rowUser === "nomlimingleofficial")
      } else {
        setProfileBio("")
        setProfileUsername("")
        setProfileAvatar("")
        setProfileYoutube("")
        setProfileSpotify("")
        setIsOfficialAccount(false)
      }

      const pageArtistUsername = String(profileRow?.artist_username || "")
        .trim()
        .replace(/^@/, "")
        .toLowerCase()
      const currentArtistName = String(normalizedSongs[0]?.artist || queryArtist || "")
        .trim()
        .toLowerCase()
      const isNomliOfficialPage =
        currentArtistName.includes("nomli mingle") || pageArtistUsername === "nomlimingleofficial"

      const token = getAccessToken()
      if (!token || !PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
        setLoading(false)
        return
      }

      const meRes = await fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      const me = await meRes.json().catch(() => null)
      if (!meRes.ok || !me?.id) {
        setLoading(false)
        return
      }

      const profRes = await fetch(
        `${PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(String(me.id))}&select=*`,
        {
          headers: {
            apikey: PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      )
      const profRows = (await profRes.json().catch(() => [])) as any[]
      const p = Array.isArray(profRows) && profRows[0] ? profRows[0] : null
      if (!p) {
        setLoading(false)
        return
      }

      const profileDisplayName = String(p?.display_name || p?.full_name || "").trim()
      const profileUser = String(p?.username || "").trim().replace(/^@/, "").toLowerCase()
      const profileAvatarUrl = String(
        p?.avatar_url || p?.photo_url || p?.profile_image_url || p?.image_url || ""
      ).trim()
      const profileMusicBio = String(p?.music_bio || p?.bio || "").trim()
      const profileMusicYoutube = String(p?.music_youtube_url || p?.youtube_url || "").trim()
      const profileMusicSpotify = String(p?.music_spotify_url || p?.spotify_url || "").trim()
      const profileIsAdmin = Boolean(p?.is_admin || String(p?.role || "").toLowerCase() === "admin")

      const ownsByName =
        Boolean(profileDisplayName) && currentArtistName === profileDisplayName.toLowerCase()
      const ownsByUsername = Boolean(profileUser) && Boolean(pageArtistUsername) && profileUser === pageArtistUsername
      const looksLikeOwnPage = ownsByName || ownsByUsername || (profileIsAdmin && isNomliOfficialPage)

      setCanEditProfile(looksLikeOwnPage)

      if (looksLikeOwnPage) {
        if (profileAvatarUrl) setProfileAvatar(profileAvatarUrl)
        if (profileMusicBio) setProfileBio(profileMusicBio)
        if (profileMusicYoutube) setProfileYoutube(profileMusicYoutube)
        if (profileMusicSpotify) setProfileSpotify(profileMusicSpotify)
        if (profileIsAdmin) {
          setProfileUsername("nomlimingleofficial")
          setIsOfficialAccount(true)
        } else if (profileUser) {
          setProfileUsername(profileUser)
          setIsOfficialAccount(profileUser === "nomlimingleofficial")
        }
      }
    } catch {
      setError("Could not load artist profile.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [artistSlug, artistNameHint])

  const artistName = useMemo(() => {
    if (songs[0]?.artist) return songs[0].artist
    if (artistNameHint) return decodeURIComponent(artistNameHint)
    return artistSlug.replace(/-/g, " ")
  }, [songs, artistNameHint, artistSlug])

  const profileBioText = profileBio || "No artist bio yet. Creator details will appear here once added."
  const mobileBioPreview = profileBioText.length > 140 ? `${profileBioText.slice(0, 140).trim()}...` : profileBioText

  const handlePlaySong = async (song: SongRow) => {
    const audio = audioRef.current
    if (!audio || !song.url) return
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
    audio.pause()
    audio.src = song.url
    setActiveSongId(song.id)
    try {
      await audio.play()
      setIsPlaying(true)
    } catch {
      setIsPlaying(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) return
    const token = getAccessToken()
    if (!token) {
      alert("Please login first.")
      return
    }
    setSaving(true)
    const queryArtist = artistName.trim()
    const payload = {
      artist_bio: profileBio.trim() || null,
      artist_username: profileUsername.trim().replace(/^@/, "") || null,
      artist_avatar_url: profileAvatar.trim() || null,
      artist_youtube_url: profileYoutube.trim() || null,
      artist_spotify_url: profileSpotify.trim() || null,
    }
    try {
      await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/app_songs?artist=eq.${encodeURIComponent(queryArtist)}`, {
        method: "PATCH",
        headers: {
          apikey: PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      })
      await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/app_song_submissions?artist=eq.${encodeURIComponent(queryArtist)}`, {
        method: "PATCH",
        headers: {
          apikey: PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      })
      setEditing(false)
      await loadData()
    } catch {
      alert("Could not save profile. Check permissions.")
    } finally {
      setSaving(false)
    }
  }

  const handleArtistAvatarUpload = async (file: File | null) => {
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
    setAvatarUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("folder", "avatars")
      form.append("baseName", profileUsername || artistName || "artist-avatar")
      const response = await fetch("/api/upload/bunny-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Avatar upload failed")
      }
      setProfileAvatar(String(payload.url))
    } catch (err: any) {
      alert(err?.message || "Avatar upload failed.")
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0E0B0D] text-[#F5EEF0] pb-10">
      <div className="mx-auto w-full max-w-[940px] px-4 py-5 sm:py-8">
        <Link
          href="/music"
          className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
        >
          Back to music
        </Link>

        <section className="mt-4 mx-auto w-full max-w-[760px] rounded-2xl border border-white/10 bg-gradient-to-br from-[#14122f] via-[#1c3d7a] to-[#102140] p-3.5 sm:p-6 overflow-hidden relative shadow-[0_18px_55px_rgba(0,0,0,0.35)]">
          <div className="absolute -top-12 -right-10 h-40 w-40 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-violet-300/15 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(255,255,255,0.14),transparent_42%)]" />
          <div className="relative flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
            <div className="shrink-0 group self-center sm:self-start">
              {profileAvatar || songs[0]?.cover_url ? (
                <img
                  src={profileAvatar || songs[0]?.cover_url || ""}
                  alt={artistName}
                  className="h-14 w-14 sm:h-24 sm:w-24 rounded-full object-cover border border-white/25 group-hover:border-white/50 transition-colors"
                />
              ) : (
                <div className="h-14 w-14 sm:h-24 sm:w-24 rounded-full border border-white/25 bg-white/10 flex items-center justify-center text-lg sm:text-2xl font-semibold group-hover:border-white/50 transition-colors">
                  {(artistName || "A").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 w-full text-center sm:text-left">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-white/70">Artist</p>
              <h1 className="text-[30px] sm:text-4xl font-bold leading-tight truncate">{artistName}</h1>
              <p className="text-[15px] sm:text-sm text-white/80 mt-1 break-all">{profileUsername ? `@${profileUsername}` : "Nomli creator"}</p>
              {isOfficialAccount ? <p className="text-[11px] text-[#ffbfd0] mt-0.5">Official account</p> : null}
              <p className="hidden sm:block text-sm text-white/80 mt-3 leading-relaxed">
                {profileBioText}
              </p>
              <p className="sm:hidden text-sm text-white/80 mt-3 leading-relaxed">
                {mobileBioPreview}
              </p>
              {profileBioText.length > 140 ? (
                <button
                  type="button"
                  onClick={() => setIsBioModalOpen(true)}
                  className="sm:hidden mt-1.5 text-xs font-medium text-cyan-200 underline underline-offset-2"
                >
                  Read more
                </button>
              ) : null}
              <div className="mt-4 flex flex-wrap sm:flex-nowrap items-center justify-center sm:justify-start gap-2">
                {profileYoutube ? (
                  <a
                    href={profileYoutube}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="YouTube"
                    title="YouTube"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-red-300/35 bg-red-300/10 text-red-100 transition-colors hover:bg-red-300/20"
                  >
                    <YoutubeIcon className="h-5 w-5" />
                  </a>
                ) : null}
                {profileSpotify ? (
                  <a
                    href={profileSpotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Spotify"
                    title="Spotify"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300/35 bg-emerald-300/10 text-emerald-100 transition-colors hover:bg-emerald-300/20"
                  >
                    <SpotifyIcon className="h-5 w-5" />
                  </a>
                ) : null}
                {canEditProfile ? (
                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    {editing ? "Close edit" : "Edit profile"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {isBioModalOpen ? (
          <div
            className="sm:hidden fixed inset-0 z-[80] bg-[#06060d]/86 backdrop-blur-sm flex items-center justify-center px-4"
            onClick={() => setIsBioModalOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#141328] shadow-[0_18px_60px_rgba(0,0,0,0.55)] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <p className="text-sm font-semibold text-white truncate">About {artistName}</p>
                <button
                  type="button"
                  onClick={() => setIsBioModalOpen(false)}
                  className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-white"
                >
                  Close
                </button>
              </div>
              <p className="max-h-[52vh] overflow-y-auto pr-1 text-sm text-white/85 leading-relaxed">
                {profileBioText}
              </p>
            </div>
          </div>
        ) : null}

        {canEditProfile && editing ? (
          <section className="mt-4 rounded-2xl border border-white/10 bg-[#171222] p-4 sm:p-5 space-y-2.5">
            <h2 className="text-sm font-semibold">Edit artist profile</h2>
            <input
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            />
            <div className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm">
              <p className="text-xs text-white/65 mb-2">Avatar image</p>
              <input
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                onChange={(e) => void handleArtistAvatarUpload(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <p className="mt-2 text-[11px] text-white/60">
                {avatarUploading ? "Uploading avatar..." : profileAvatar ? "Avatar uploaded." : "No avatar uploaded yet."}
              </p>
            </div>
            <textarea
              value={profileBio}
              onChange={(e) => setProfileBio(e.target.value)}
              placeholder="Artist bio"
              rows={3}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40 resize-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={profileYoutube}
                onChange={(e) => setProfileYoutube(e.target.value)}
                placeholder="YouTube URL"
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
              />
              <input
                value={profileSpotify}
                onChange={(e) => setProfileSpotify(e.target.value)}
                placeholder="Spotify URL"
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveProfile()}
              className="rounded-md bg-[#D6526A] px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </section>
        ) : null}

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#171222] p-4 sm:p-5">
          <h2 className="text-sm sm:text-base font-semibold mb-3">Top tracks</h2>
          {loading ? <p className="text-sm text-white/60">Loading tracks...</p> : null}
          {!loading && error ? <p className="text-sm text-red-300">{error}</p> : null}
          {!loading && !error && songs.length === 0 ? <p className="text-sm text-white/60">No tracks found for this artist yet.</p> : null}
          <div className="space-y-2">
            {songs.map((song, index) => (
              <div
                key={song.id}
                className={`rounded-lg border px-3 py-2.5 flex items-center gap-3 transition-colors ${
                  activeSongId === song.id ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <span className="w-5 text-[11px] text-white/50">{String(index + 1).padStart(2, "0")}</span>
                <button
                  type="button"
                  onClick={() => void handlePlaySong(song)}
                  className="h-9 w-9 rounded-full border border-white/20 bg-white/10 flex items-center justify-center text-white"
                  aria-label={activeSongId === song.id && isPlaying ? "Pause track" : "Play track"}
                >
                  {activeSongId === song.id && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </button>
                {song.cover_url ? (
                  <img src={song.cover_url} alt={song.title} className="h-10 w-10 rounded object-cover border border-white/15" />
                ) : profileAvatar ? (
                  <img src={profileAvatar} alt={artistName} className="h-10 w-10 rounded object-cover border border-white/15" />
                ) : (
                  <div className="h-10 w-10 rounded border border-white/15 bg-gradient-to-br from-white/15 to-white/5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{song.title}</p>
                  <p className="text-[11px] text-white/60 truncate">{song.genre || "Other"}</p>
                </div>
                <span className="text-[11px] text-white/60">{fmt(song.duration_sec || 15)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

