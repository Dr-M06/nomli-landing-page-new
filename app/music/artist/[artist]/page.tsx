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

export default function ArtistPage() {
  const params = useParams<{ artist: string }>()
  const searchParams = useSearchParams()
  const artistSlug = String(params?.artist || "")
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

  const loadData = async () => {
    if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
      setError("Music service is not configured.")
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    const queryArtist = artistNameHint.trim() || artistSlug.replace(/-/g, " ").trim()
    try {
      const songsUrl = `${PUBLIC_SUPABASE_URL}/rest/v1/app_songs?select=id,title,artist,url,genre,duration_sec,play_count,cover_url,artist_bio,artist_username,artist_avatar_url,artist_youtube_url,artist_spotify_url&artist=ilike.*${encodeURIComponent(
        queryArtist
      )}*&order=play_count.desc.nullslast,created_at.desc`
      const songsRes = await fetch(songsUrl, {
        headers: {
          apikey: PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${PUBLIC_SUPABASE_ANON_KEY}`,
        },
      })
      const songsRows = (await songsRes.json().catch(() => [])) as SongRow[]
      const normalizedSongs = Array.isArray(songsRows) ? songsRows : []
      setSongs(normalizedSongs)

      const richSong = normalizedSongs.find(
        (s) => s.artist_bio || s.artist_avatar_url || s.artist_username || s.artist_youtube_url || s.artist_spotify_url
      )
      if (richSong) {
        setProfileBio(richSong.artist_bio || "")
        setProfileUsername(richSong.artist_username || "")
        setProfileAvatar(richSong.artist_avatar_url || "")
        setProfileYoutube(richSong.artist_youtube_url || "")
        setProfileSpotify(richSong.artist_spotify_url || "")
        setLoading(false)
        return
      }

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
      const fallback = Array.isArray(fallbackRows) && fallbackRows[0] ? fallbackRows[0] : null
      setProfileBio(fallback?.artist_bio || "")
      setProfileUsername(fallback?.artist_username || "")
      setProfileAvatar(fallback?.artist_avatar_url || "")
      setProfileYoutube(fallback?.artist_youtube_url || "")
      setProfileSpotify(fallback?.artist_spotify_url || "")

      // Always prefer current user's saved profile settings when this artist page
      // appears to be their own profile (or the official Nomli account).
      const token = getAccessToken()
      if (token) {
        const meRes = await fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/user`, {
          headers: {
            apikey: PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        })
        const me = await meRes.json().catch(() => null)
        if (meRes.ok && me?.id) {
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
          if (p) {
            const profileDisplayName = String(p?.display_name || p?.full_name || "").trim()
            const profileUser = String(p?.username || "").trim().replace(/^@/, "")
            const profileAvatarUrl = String(
              p?.avatar_url || p?.photo_url || p?.profile_image_url || p?.image_url || ""
            ).trim()
            const profileMusicBio = String(p?.music_bio || p?.bio || "").trim()
            const profileMusicYoutube = String(p?.music_youtube_url || p?.youtube_url || "").trim()
            const profileMusicSpotify = String(p?.music_spotify_url || p?.spotify_url || "").trim()
            const profileIsAdmin = Boolean(p?.is_admin || String(p?.role || "").toLowerCase() === "admin")

            const currentArtistName = (songs[0]?.artist || queryArtist || "").trim().toLowerCase()
            const looksLikeOwnPage =
              (profileDisplayName && currentArtistName === profileDisplayName.toLowerCase()) ||
              (profileUser && profileUsername && profileUser === profileUsername.toLowerCase().replace(/^@/, "")) ||
              currentArtistName.includes("nomli mingle")

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
                setIsOfficialAccount(false)
              }
            }
          }
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

        <section className="mt-4 rounded-3xl border border-white/10 bg-gradient-to-br from-[#14122f] via-[#1c3d7a] to-[#102140] p-5 sm:p-7 overflow-hidden relative shadow-[0_18px_55px_rgba(0,0,0,0.35)]">
          <div className="absolute -top-12 -right-10 h-40 w-40 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-violet-300/15 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(255,255,255,0.14),transparent_42%)]" />
          <div className="relative flex items-start gap-4">
            <Link href="/profile" className="shrink-0 group">
              {profileAvatar || songs[0]?.cover_url ? (
                <img
                  src={profileAvatar || songs[0]?.cover_url || ""}
                  alt={artistName}
                  className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover border border-white/25 group-hover:border-white/50 transition-colors"
                />
              ) : (
                <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border border-white/25 bg-white/10 flex items-center justify-center text-2xl font-semibold group-hover:border-white/50 transition-colors">
                  {(artistName || "A").slice(0, 1).toUpperCase()}
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-white/70">Artist</p>
              <Link href="/profile" className="inline-block hover:opacity-90 transition-opacity">
                <h1 className="text-2xl sm:text-4xl font-bold truncate">{artistName}</h1>
              </Link>
              <p className="text-sm text-white/80 mt-1">{profileUsername ? `@${profileUsername}` : "Nomli creator"}</p>
              {isOfficialAccount ? <p className="text-[11px] text-[#ffbfd0] mt-0.5">Official account</p> : null}
              <p className="text-sm text-white/75 mt-3 max-w-2xl leading-relaxed">
                {profileBio || "No artist bio yet. Creator details will appear here once added."}
              </p>
              <div className="mt-3 flex items-center gap-2">
                {profileYoutube ? (
                  <a
                    href={profileYoutube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-red-300/35 bg-red-300/10 px-3 py-1 text-xs font-medium text-red-100"
                  >
                    YouTube
                  </a>
                ) : null}
                {profileSpotify ? (
                  <a
                    href={profileSpotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100"
                  >
                    Spotify
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white"
                >
                  {editing ? "Close edit" : "Edit profile"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {editing ? (
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

