"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Heart, MessageCircle, Share2, ExternalLink, Volume2, VolumeX } from "lucide-react"
import type { LandingPost } from "@/lib/nomli-posts"

type SocialFeedProps = {
  posts: LandingPost[]
}

type CountsState = Record<
  string,
  {
    reacted: boolean
    reactions: number
    comments: number
    shares: number
  }
>

type FeedResponse = {
  items: LandingPost[]
  nextCursor: string | null
  hasMore: boolean
}

type CommentItem = {
  id: string
  content: string
  username?: string | null
  created_at?: string | null
  profile?: {
    username?: string | null
    full_name?: string | null
    avatar_url?: string | null
  } | null
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".0", "")}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(".0", "")}k`
  return String(value)
}

function formatTime(dateInput: string | null | undefined) {
  if (!dateInput) return "now"
  const date = new Date(dateInput)
  if (Number.isNaN(date.getTime())) return "now"
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60))
  if (diffMinutes < 1) return "now"
  if (diffMinutes < 60) return `${diffMinutes}m`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString()
}

function mergeUniquePosts(current: LandingPost[], incoming: LandingPost[]) {
  const seen = new Set(current.map((p) => p.id))
  const appended = incoming.filter((post) => !seen.has(post.id))
  return [...current, ...appended]
}

export default function SocialFeed({ posts }: SocialFeedProps) {
  const [hasHydrated, setHasHydrated] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [feedPosts, setFeedPosts] = useState<LandingPost[]>(posts)
  const [nextCursor, setNextCursor] = useState<string | null>(posts[posts.length - 1]?.created_at ?? null)
  const [hasMore, setHasMore] = useState(posts.length >= 12)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [activePostId, setActivePostId] = useState<string | null>(posts[0]?.id ?? null)
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null)
  const [openReactionsPostId, setOpenReactionsPostId] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentItem[]>>({})
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [counts, setCounts] = useState<CountsState>({})
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})

  const deepLinkBase = useMemo(() => "nomlimingle://community/post/", [])
  const legacyDeepLinkBase = useMemo(() => "nomlimingle://post/", [])
  const canonicalWebOrigin = useMemo(() => "https://www.nomlimingle.com", [])
  const appStoreUrl = useMemo(() => "https://apps.apple.com/app/nomli-mingle/id123456789", [])
  const playStoreUrl = useMemo(
    () => "https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en",
    []
  )

  useEffect(() => {
    setHasHydrated(true)
  }, [])

  useEffect(() => {
    const refreshLoginState = () => {
      const token = localStorage.getItem("nomli_supabase_access_token")
      setIsLoggedIn(Boolean(token))
    }
    refreshLoginState()
    window.addEventListener("storage", refreshLoginState)
    window.addEventListener("focus", refreshLoginState)
    return () => {
      window.removeEventListener("storage", refreshLoginState)
      window.removeEventListener("focus", refreshLoginState)
    }
  }, [])

  useEffect(() => {
    setCounts((prev) => {
      const out = { ...prev }
      for (const post of feedPosts) {
        if (out[post.id]) continue
        out[post.id] = {
          reacted: false,
          reactions: Math.max(0, post.likes_count ?? 0),
          comments: Math.max(0, post.comments_count ?? 0),
          shares: Math.max(0, post.shares_count ?? 0),
        }
      }
      return out
    })
  }, [feedPosts])

  const syncVideoPlayback = useCallback(
    (activeId: string | null) => {
      for (const post of feedPosts) {
        const video = videoRefs.current[post.id]
        if (!video) continue
        const isActive = Boolean(activeId && post.id === activeId)
        // Hard-stop all non-active videos so audio cannot overlap.
        if (!isActive) {
          video.pause()
          video.muted = true
          continue
        }
        video.muted = isMuted
        video
          .play()
          .then(() => {})
          .catch(() => {})
      }
    },
    [feedPosts, isMuted]
  )

  useEffect(() => {
    if (!containerRef.current || feedPosts.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const topVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (topVisible) {
          setActivePostId(topVisible.target.getAttribute("data-post-id"))
        }
      },
      { root: containerRef.current, threshold: [0.55, 0.75, 0.9] }
    )

    for (const post of feedPosts) {
      const el = sectionRefs.current[post.id]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [feedPosts])

  useEffect(() => {
    syncVideoPlayback(activePostId)
  }, [activePostId, syncVideoPlayback])

  const openInApp = useCallback(
    (postId: string) => {
      if (typeof window === "undefined") return
      const encodedPostId = encodeURIComponent(postId)
      const deepLink = `${deepLinkBase}${encodedPostId}`
      const legacyDeepLink = `${legacyDeepLinkBase}${encodedPostId}`
      const ua = window.navigator.userAgent || ""
      const isAndroid = /Android/i.test(ua)
      const isIOS = /iPhone|iPad|iPod/i.test(ua)
      const universalPostUrl = `${canonicalWebOrigin}/community/post/${encodedPostId}`
      const localPostUrl = `${window.location.origin}/community/post/${encodedPostId}`
      const fallbackUrl = isIOS ? appStoreUrl : isAndroid ? playStoreUrl : universalPostUrl

      const start = Date.now()
      const timer = window.setTimeout(() => {
        if (Date.now() - start < 1800) window.location.href = fallbackUrl
      }, 1400)
      if (isAndroid) {
        // Try direct scheme first so app can resolve exact post route immediately.
        window.location.href = deepLink
        window.setTimeout(() => {
          window.location.href = legacyDeepLink
        }, 280)
        window.setTimeout(() => {
          const intentUrl = `intent://community/post/${encodedPostId}#Intent;scheme=nomlimingle;package=com.nomli.mingle2;S.browser_fallback_url=${encodeURIComponent(
            universalPostUrl
          )};end`
          window.location.href = intentUrl
        }, 560)
      } else if (isIOS) {
        // iOS: try both app routes, then universal link, then App Store fallback timer.
        window.location.href = deepLink
        window.setTimeout(() => {
          window.location.href = legacyDeepLink
        }, 280)
        window.setTimeout(() => {
          window.location.href = universalPostUrl
        }, 700)
      } else {
        window.location.href = localPostUrl
      }
      window.setTimeout(() => window.clearTimeout(timer), 2000)
    },
    [appStoreUrl, canonicalWebOrigin, deepLinkBase, legacyDeepLinkBase, playStoreUrl]
  )

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const url = nextCursor
        ? `/api/social/feed?limit=12&before=${encodeURIComponent(nextCursor)}`
        : `/api/social/feed?limit=12`
      const res = await fetch(url)
      if (!res.ok) return
      const data = (await res.json()) as FeedResponse
      setFeedPosts((prev) => mergeUniquePosts(prev, data.items || []))
      setNextCursor(data.nextCursor ?? null)
      setHasMore(Boolean(data.hasMore))
    } finally {
      setIsLoadingMore(false)
    }
  }, [hasMore, isLoadingMore, nextCursor])

  const openComments = useCallback(
    async (postId: string) => {
      if (!isLoggedIn) {
        setOpenCommentsPostId(postId)
        setCommentsByPost((prev) => ({
          ...prev,
          [postId]: [
            {
              id: "login-required",
              content: "Login is required to comment.",
              username: "system",
            },
          ],
        }))
        return
      }
      const nextId = openCommentsPostId === postId ? null : postId
      setOpenCommentsPostId(nextId)
      setOpenReactionsPostId(null)
      if (!nextId || commentsByPost[postId]) return

      setIsCommentsLoading(true)
      try {
        const res = await fetch(`/api/social/comments?postId=${encodeURIComponent(postId)}`)
        if (!res.ok) return
        const data = await res.json()
        setCommentsByPost((prev) => ({ ...prev, [postId]: Array.isArray(data.items) ? data.items : [] }))
      } finally {
        setIsCommentsLoading(false)
      }
    },
    [commentsByPost, isLoggedIn, openCommentsPostId]
  )

  useEffect(() => {
    if (!sentinelRef.current || !containerRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          void loadMore()
        }
      },
      { root: containerRef.current, threshold: 0.1 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore])

  const handleReaction = (postId: string) => {
    setCounts((prev) => {
      const current = prev[postId]
      if (!current) return prev
      const nextReacted = !current.reacted
      return {
        ...prev,
        [postId]: {
          ...current,
          reacted: nextReacted,
          reactions: Math.max(0, current.reactions + (nextReacted ? 1 : -1)),
        },
      }
    })
  }

  const handleShare = async (post: LandingPost) => {
    const postId = post.id
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/community/post/${encodeURIComponent(postId)}`
        : `/community/post/${encodeURIComponent(postId)}`
    const rawContent = (post.content || "").trim()
    const excerpt = rawContent.length > 180 ? `${rawContent.slice(0, 177)}...` : rawContent
    const shareText = excerpt || `Watch @${post.displayName}'s post on Nomli`
    const shareMessage = `${shareText}\n\n${shareUrl}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: `@${post.displayName} on Nomli`,
          text: shareText,
          url: shareUrl,
        })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareMessage)
      }
      setCounts((prev) => {
        const current = prev[postId]
        if (!current) return prev
        return {
          ...prev,
          [postId]: {
            ...current,
            shares: current.shares + 1,
          },
        }
      })
    } catch {
      // ignore user-cancelled share
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full bg-black">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[560px] items-center justify-between px-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-white/90">
            <span>Nomli Mingle</span>
            <span className="inline-block origin-bottom animate-bounce" aria-hidden="true">
              🦩
            </span>
          </span>
          <span className="rounded-full border border-white/10 bg-white px-3 py-1 text-xs font-semibold text-black">
            Daily Feed
          </span>
          <Link href="/" className="text-xs text-white/70">
            Home
          </Link>
        </div>
      </div>

      <div
        ref={containerRef}
        className="scrollbar-hide relative mx-auto h-[calc(100dvh-3.5rem)] w-full max-w-[560px] snap-y snap-mandatory overflow-y-auto bg-black"
      >
        {feedPosts.map((post) => {
          const postCounts = counts[post.id]
          const isVideo = Boolean(post.video_url)
          if (!isVideo) return null

          return (
            <section
              key={post.id}
              data-post-id={post.id}
              ref={(el) => {
                sectionRefs.current[post.id] = el
              }}
              className="relative flex h-[calc(100dvh-3.5rem)] snap-start items-center justify-center bg-black"
            >
              <video
                ref={(el) => {
                  videoRefs.current[post.id] = el
                }}
                src={post.video_url ?? undefined}
                muted={post.id === activePostId ? isMuted : true}
                loop
                controls={false}
                autoPlay={post.id === activePostId}
                preload="metadata"
                playsInline
                className="h-full w-full object-contain"
                poster={post.previewImage || undefined}
                onClick={(event) => {
                  const target = event.currentTarget
                  if (target.paused) {
                    target.play().catch(() => {})
                  } else {
                    target.pause()
                  }
                }}
                onPlay={() => {
                  // If a background video starts for any reason, enforce single-active playback.
                  syncVideoPlayback(activePostId)
                }}
              />

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/10" />

              <div className="pointer-events-none absolute bottom-24 left-0 right-0 flex items-end justify-between gap-3 p-3 sm:bottom-28">
                <div className="pointer-events-auto max-w-[72%] text-white">
                  <div className="mb-1 flex items-center gap-2">
                    {post.profile?.avatar_url ? (
                      <img src={post.profile.avatar_url} alt={post.displayName} className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-white/20" />
                    )}
                    <span className="text-sm font-semibold">@{post.displayName}</span>
                    <span className="text-xs text-white/60" suppressHydrationWarning>
                      {hasHydrated ? formatTime(post.created_at) : ""}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                  </div>
                </div>

                <div className="pointer-events-auto absolute right-3 bottom-40 z-20 flex flex-col items-center gap-2 text-white sm:right-4 sm:bottom-44">
                  <button
                    type="button"
                    onClick={() => setIsMuted((prev) => !prev)}
                    className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-white/18 backdrop-blur"
                  >
                    {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openInApp(post.id)}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[#6D5EF7]/85 text-white shadow-lg shadow-[#6D5EF7]/30 backdrop-blur"
                    aria-label="Open in mobile app"
                  >
                    <ExternalLink className="h-6 w-6" />
                  </button>
                  <span className="-mt-0.5 text-[11px] font-medium leading-none text-white/85">App</span>
                  <button
                    type="button"
                    onClick={() => handleReaction(post.id)}
                    className={`flex h-14 w-14 items-center justify-center rounded-full backdrop-blur ${
                      postCounts?.reacted ? "bg-pink-500/25 text-pink-400" : "bg-white/15 text-white"
                    }`}
                  >
                    <Heart className={`h-7 w-7 ${postCounts?.reacted ? "fill-pink-400" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenReactionsPostId((prev) => (prev === post.id ? null : post.id))}
                    className="-mt-0.5 text-sm font-medium leading-none text-white/85"
                  >
                    {formatCount(postCounts?.reactions ?? 0)}
                  </button>

                  <button
                    type="button"
                    onClick={() => openComments(post.id)}
                    className="mt-1 flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur"
                  >
                    <MessageCircle className="h-7 w-7" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openComments(post.id)}
                    className="-mt-0.5 text-sm font-medium leading-none text-white/85"
                  >
                    {formatCount(postCounts?.comments ?? 0)}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleShare(post)}
                    className="mt-1 flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur"
                  >
                    <Share2 className="h-7 w-7" />
                  </button>
                  <span className="-mt-0.5 text-sm font-medium leading-none text-white/85">
                    {formatCount(postCounts?.shares ?? 0)}
                  </span>
                </div>
              </div>

              {openReactionsPostId === post.id && (
                <div className="absolute right-20 bottom-24 rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-xs text-white/90 backdrop-blur">
                  Reactions: {formatCount(postCounts?.reactions ?? 0)}
                </div>
              )}

              {openCommentsPostId === post.id && (
                <div className="absolute right-20 bottom-20 w-[min(320px,calc(100%-7rem))] max-h-60 overflow-y-auto rounded-xl border border-white/15 bg-black/85 p-3 backdrop-blur">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-white/90">Comments</p>
                    <div className="flex items-center gap-2">
                      {!isLoggedIn && (
                        <Link href="/login" className="text-[11px] font-semibold text-[#8A7BFF]">
                          Login
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenCommentsPostId(null)}
                        className="text-[11px] text-white/65"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  {isCommentsLoading && <p className="text-xs text-white/60">Loading comments...</p>}
                  {!isCommentsLoading && (commentsByPost[post.id] || []).length === 0 && (
                    <p className="text-xs text-white/60">No comments yet.</p>
                  )}
                  {(commentsByPost[post.id] || []).map((comment) => {
                    const name = comment.profile?.username || comment.profile?.full_name || "User"
                    return (
                      <div key={comment.id} className="mb-2 rounded-lg bg-white/5 px-2 py-1.5">
                        <p className="text-[11px] font-semibold text-white/85">@{name}</p>
                        <p className="text-xs text-white/75">{comment.content || ""}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}

        <div ref={sentinelRef} className="snap-none h-px w-full opacity-0" />
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-white/50">
          {isLoadingMore ? "Loading more..." : hasMore ? "" : "You reached the end"}
        </div>
      </div>
    </div>
  )
}
