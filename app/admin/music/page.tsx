"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Music2, Trash2, Upload, RefreshCw } from "lucide-react"

type Song = {
  id: string
  title: string
  artist: string
  genre: string | null
  url: string
  cover_url?: string | null
  duration_sec?: number | null
  play_count?: number | null
  created_at?: string | null
}

const GENRES = ["Trending", "Pop", "Afrobeats", "Hip-Hop", "R&B", "Amapiano", "Gospel", "Other"]

export default function AdminMusicPage() {
  const [songs, setSongs] = useState<Song[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedGenre, setSelectedGenre] = useState("Trending")

  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  const [genre, setGenre] = useState("Pop")
  const [durationSec, setDurationSec] = useState("15")
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)

  const fetchSongs = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/music")
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error("Failed to load songs")
      }
      setSongs(Array.isArray(result.data) ? result.data : [])
    } catch (error: any) {
      alert("Failed to load songs")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSongs()
  }, [fetchSongs])

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!audioFile) {
      alert("Audio file is required")
      return
    }
    if (!title.trim() || !artist.trim()) {
      alert("Title and artist are required")
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.set("title", title.trim())
      formData.set("artist", artist.trim())
      formData.set("genre", genre)
      formData.set("durationSec", durationSec || "15")
      formData.set("audioFile", audioFile)
      if (coverFile) formData.set("coverFile", coverFile)

      const response = await fetch("/api/admin/music", {
        method: "POST",
        body: formData,
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error("Upload failed")
      }

      setTitle("")
      setArtist("")
      setGenre("Pop")
      setDurationSec("15")
      setAudioFile(null)
      setCoverFile(null)
      await fetchSongs()
    } catch (error: any) {
      alert("Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (song: Song) => {
    if (!confirm(`Delete "${song.title}" by ${song.artist}?`)) return
    try {
      const response = await fetch(`/api/admin/music/${song.id}`, {
        method: "DELETE",
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error("Delete failed")
      }
      await fetchSongs()
    } catch (error: any) {
      alert("Delete failed")
    }
  }

  const filteredSongs =
    selectedGenre === "Trending"
      ? [...songs].sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0))
      : songs.filter((s) => (s.genre || "Other").toLowerCase() === selectedGenre.toLowerCase())

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/admin" className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Admin</span>
          </Link>
          <button
            type="button"
            onClick={fetchSongs}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white/90 hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Music2 className="h-5 w-5 text-primary" />
            <h1 className="text-xl sm:text-2xl font-semibold">Music Admin</h1>
          </div>
          <p className="mb-5 text-sm text-white/60">Upload tracks and manage your music catalog.</p>

          <form onSubmit={handleUpload} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song title"
                className="h-11 rounded-full border border-white/15 bg-black/20 px-4 text-sm outline-none focus:border-primary"
              />
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Artist"
                className="h-11 rounded-full border border-white/15 bg-black/20 px-4 text-sm outline-none focus:border-primary"
              />
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="h-11 rounded-full border border-white/15 bg-black/20 px-4 text-sm outline-none focus:border-primary"
              >
                {GENRES.filter((g) => g !== "Trending").map((g) => (
                  <option key={g} value={g} className="bg-[#0a0a0f]">
                    {g}
                  </option>
                ))}
              </select>
              <input
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value)}
                type="number"
                min={1}
                step={1}
                placeholder="Duration (seconds)"
                className="h-11 rounded-full border border-white/15 bg-black/20 px-4 text-sm outline-none focus:border-primary"
              />
              <label className="rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm text-white/80">
                Audio file (required)
                <input
                  type="file"
                  accept="audio/*"
                  className="mt-2 block w-full text-xs"
                  onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                  required
                />
              </label>
              <label className="rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm text-white/80">
                Cover image (optional)
                <input
                  type="file"
                  accept="image/*"
                  className="mt-2 block w-full text-xs"
                  onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={isUploading}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {isUploading ? "Uploading..." : "Upload track"}
                </button>
              </div>
            </form>
        </div>

        <>
            <div className="mb-4 flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGenre(g)}
                  className={`rounded-full border px-4 py-1.5 text-xs sm:text-sm ${
                    selectedGenre === g
                      ? "border-primary bg-primary/20 text-white"
                      : "border-white/15 text-white/70 hover:text-white"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              {filteredSongs.length === 0 ? (
                <p className="py-6 text-center text-sm text-white/60">No tracks found.</p>
              ) : (
                <div className="space-y-2">
                  {filteredSongs.map((song) => (
                    <div
                      key={song.id}
                      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {song.title} <span className="text-white/60">- {song.artist}</span>
                        </p>
                        <p className="mt-1 text-xs text-white/50">
                          {(song.genre || "Other").toUpperCase()} • {song.duration_sec || 15}s • plays:{" "}
                          {song.play_count || 0}
                        </p>
                        <a
                          href={song.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                          Open audio URL
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(song)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-red-400/30 px-4 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
      </div>
    </main>
  )
}

