"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
const PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

type Profile = {
  id: string
  name: string
  email: string
  avatarUrl: string
  username: string
  bio: string
  youtubeUrl: string
  spotifyUrl: string
  isAdmin: boolean
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    id: "",
    name: "Nomli User",
    email: "",
    avatarUrl: "",
    username: "",
    bio: "",
    youtubeUrl: "",
    spotifyUrl: "",
    isAdmin: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) return
        const token = localStorage.getItem("nomli_supabase_access_token") || ""
        if (!token) return

        const response = await fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/user`, {
          headers: {
            apikey: PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        })
        const me = await response.json().catch(() => null)
        if (!response.ok || !me) return

        const userId = String(me?.id || "")
        let profileAvatar = ""
        let profileName = ""
        let profileUsername = ""
        let profileBio = ""
        let profileYoutube = ""
        let profileSpotify = ""
        let profileIsAdmin = false

        if (userId) {
          const profileRes = await fetch(
            `${PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(
              userId
            )}&select=*`,
            {
              headers: {
                apikey: PUBLIC_SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`,
              },
            }
          )
          const profileRows = await profileRes.json().catch(() => [])
          const p = Array.isArray(profileRows) && profileRows[0] ? profileRows[0] : null
          profileAvatar = String(p?.avatar_url || p?.photo_url || p?.profile_image_url || p?.image_url || "")
          profileName = String(p?.display_name || p?.full_name || "")
          profileUsername = String(p?.username || "")
          profileBio = String(p?.music_bio || p?.bio || "")
          profileYoutube = String(p?.music_youtube_url || p?.youtube_url || "")
          profileSpotify = String(p?.music_spotify_url || p?.spotify_url || "")
          profileIsAdmin = Boolean(p?.is_admin || String(p?.role || "").toLowerCase() === "admin")
        }

        const resolvedName = profileIsAdmin
          ? "Nomli Mingle Official"
          : profileName || String(me?.user_metadata?.full_name || me?.user_metadata?.name || me?.email || "Nomli User")
        const resolvedUsername = profileIsAdmin
          ? "nomlimingleofficial"
          : profileUsername

        setProfile({
          id: userId,
          name: resolvedName,
          email: String(me?.email || ""),
          avatarUrl: profileAvatar || String(me?.user_metadata?.avatar_url || me?.user_metadata?.picture || ""),
          username: resolvedUsername,
          bio: profileBio,
          youtubeUrl: profileYoutube,
          spotifyUrl: profileSpotify,
          isAdmin: profileIsAdmin,
        })
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const saveProfile = async () => {
    if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) return
    const token = localStorage.getItem("nomli_supabase_access_token") || ""
    if (!token || !profile.id) {
      alert("Please login first.")
      return
    }

    setSaving(true)
    try {
      await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
        method: "PATCH",
        headers: {
          apikey: PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          display_name: profile.name.trim() || null,
          avatar_url: profile.avatarUrl.trim() || null,
          username: profile.username.trim().replace(/^@/, "") || null,
          music_bio: profile.bio.trim() || null,
          music_youtube_url: profile.youtubeUrl.trim() || null,
          music_spotify_url: profile.spotifyUrl.trim() || null,
        }),
      })
      alert("Music profile updated.")
    } catch {
      alert("Failed to update profile.")
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      alert("Please choose a valid image file.")
      return
    }
    const token = localStorage.getItem("nomli_supabase_access_token") || ""
    if (!token) {
      alert("Please login first.")
      return
    }
    setAvatarUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("folder", "avatars")
      form.append("baseName", profile.username || profile.name || "avatar")
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
      setProfile((prev) => ({ ...prev, avatarUrl: String(payload.url) }))
    } catch (err: any) {
      alert(err?.message || "Avatar upload failed.")
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0E0B0D] text-[#F5EEF0]">
      <div className="mx-auto max-w-[760px] px-4 py-8">
        <Link href="/music" className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80">
          Back to music
        </Link>

        <section className="mt-4 rounded-3xl border border-white/10 bg-[#171222] p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-wide text-white/70">Music profile setup</p>

          <div className="mt-3 flex items-center gap-3">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.name} className="h-16 w-16 rounded-full object-cover border border-white/20" />
            ) : (
              <div className="h-16 w-16 rounded-full border border-white/20 bg-white/10 flex items-center justify-center text-xl font-semibold">
                {(profile.name || "N").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{loading ? "Loading..." : profile.name}</h1>
              <p className="text-sm text-white/70 truncate">
                {profile.username ? `@${profile.username.replace(/^@/, "")}` : "Set your username"}
              </p>
              {profile.isAdmin ? <p className="text-[11px] text-[#ffbfd0] mt-0.5">Official account</p> : null}
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            <input
              value={profile.name}
              onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Display name"
              disabled={profile.isAdmin}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/35"
            />
            <div className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm">
              <p className="text-xs text-white/65 mb-2">Avatar image</p>
              <input
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                onChange={(e) => void handleAvatarUpload(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <p className="mt-2 text-[11px] text-white/60">
                {avatarUploading ? "Uploading avatar..." : profile.avatarUrl ? "Avatar uploaded." : "No avatar uploaded yet."}
              </p>
            </div>
            <input
              value={profile.username}
              onChange={(e) => setProfile((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="Username (e.g. techduck)"
              disabled={profile.isAdmin}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/35"
            />
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
              placeholder="Short artist bio"
              rows={3}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/35 resize-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={profile.youtubeUrl}
                onChange={(e) => setProfile((prev) => ({ ...prev, youtubeUrl: e.target.value }))}
                placeholder="YouTube profile URL"
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/35"
              />
              <input
                value={profile.spotifyUrl}
                onChange={(e) => setProfile((prev) => ({ ...prev, spotifyUrl: e.target.value }))}
                placeholder="Spotify profile URL"
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/35"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void saveProfile()}
              className="inline-flex rounded-full bg-[#D6526A] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save music profile"}
            </button>
            <Link
              href="/music?tab=dashboard"
              className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white"
            >
              Open music dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

