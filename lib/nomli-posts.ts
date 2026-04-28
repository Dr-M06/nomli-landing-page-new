type NomliPost = {
  id: string
  user_id: string
  content?: string | null
  location?: string | null
  post_type?: string | null
  image_url?: string | null
  image_urls?: string[] | string | null
  video_url?: string | null
  likes_count?: number | null
  comments_count?: number | null
  shares_count?: number | null
  like_count?: number | null
  comment_count?: number | null
  share_count?: number | null
  lc?: number | null
  cc?: number | null
  likes?: Array<{ count?: number | null }> | { count?: number | null } | null
  comments?: Array<{ count?: number | null }> | { count?: number | null } | null
  created_at?: string | null
}

type NomliProfile = {
  id: string
  username?: string | null
  full_name?: string | null
  avatar_url?: string | null
}

export type LandingPost = NomliPost & {
  profile: NomliProfile | null
  previewImage: string | null
  displayName: string
}

export type LandingFeedPage = {
  items: LandingPost[]
  nextCursor: string | null
  hasMore: boolean
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY

function parseImageUrls(value: NomliPost["image_urls"]): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter(Boolean)
      return []
    } catch {
      return []
    }
  }
  return []
}

function pickPreviewImage(post: NomliPost): string | null {
  const urls = parseImageUrls(post.image_urls)
  if (urls.length > 0) return urls[0]
  if (post.image_url && /^https?:\/\//.test(post.image_url)) return post.image_url
  return null
}

async function supabaseFetch(path: string): Promise<any> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    cache: "no-store",
  })
  if (!res.ok) return null
  return res.json()
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export async function getLandingFeedPostsPage(
  limit = 20,
  before?: string | null,
  videoOnly = false
): Promise<LandingFeedPage> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 50)) : 20
  const beforeFilter =
    before && String(before).trim().length > 0
      ? `&created_at=lt.${encodeURIComponent(String(before))}`
      : ""
  const videoOnlyFilter = videoOnly ? "&video_url=not.is.null" : ""
  const baseQuery = `posts?select=*,likes:post_reactions(count),comments:post_comments(count)&order=created_at.desc&limit=${encodeURIComponent(
    String(safeLimit)
  )}${beforeFilter}${videoOnlyFilter}`
  const postRows = await supabaseFetch(baseQuery)
  if (!Array.isArray(postRows) || postRows.length === 0) {
    return { items: [], nextCursor: null, hasMore: false }
  }

  const posts = postRows as NomliPost[]
  const uniqueUserIds = Array.from(new Set(posts.map((post) => post.user_id).filter(Boolean)))
  let profileMap = new Map<string, NomliProfile>()

  if (uniqueUserIds.length > 0) {
    const idsCsv = uniqueUserIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",")
    const profileRows = await supabaseFetch(
      `profiles?id=in.(${encodeURIComponent(idsCsv)})&select=id,username,full_name,avatar_url`
    )
    if (Array.isArray(profileRows)) {
      profileMap = new Map(
        (profileRows as NomliProfile[])
          .filter((profile) => profile?.id)
          .map((profile) => [profile.id, profile])
      )
    }
  }

  const postIds = posts.map((post) => post.id).filter(Boolean)
  const reactionCountMap: Record<string, number> = {}
  const commentCountMap: Record<string, number> = {}

  if (postIds.length > 0) {
    const idsCsv = postIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",")

    const [reactionRows, commentRows] = await Promise.all([
      supabaseFetch(`post_reactions?select=post_id&post_id=in.(${encodeURIComponent(idsCsv)})&limit=5000`),
      supabaseFetch(`post_comments?select=post_id&post_id=in.(${encodeURIComponent(idsCsv)})&limit=5000`),
    ])

    if (Array.isArray(reactionRows)) {
      for (const row of reactionRows) {
        const postId = row?.post_id
        if (!postId) continue
        reactionCountMap[postId] = (reactionCountMap[postId] || 0) + 1
      }
    }

    if (Array.isArray(commentRows)) {
      for (const row of commentRows) {
        const postId = row?.post_id
        if (!postId) continue
        commentCountMap[postId] = (commentCountMap[postId] || 0) + 1
      }
    }
  }

  const mappedPosts = posts.map((post) => {
    const profile = profileMap.get(post.user_id) || null
    const displayName = profile?.username || profile?.full_name || "Nomli user"
    const likesFromPost =
      toNumber(post.likes_count, NaN) ||
      toNumber(post.like_count, NaN) ||
      toNumber(post.lc, NaN) ||
      0
    const commentsFromPost =
      toNumber(post.comments_count, NaN) ||
      toNumber(post.comment_count, NaN) ||
      toNumber(post.cc, NaN) ||
      0
    const sharesFromPost = toNumber(post.shares_count, NaN) || toNumber(post.share_count, NaN) || 0
    const embeddedLikes =
      Array.isArray(post.likes) ? toNumber(post.likes[0]?.count, 0) : toNumber((post.likes as any)?.count, 0)
    const embeddedComments = Array.isArray(post.comments)
      ? toNumber(post.comments[0]?.count, 0)
      : toNumber((post.comments as any)?.count, 0)
    const liveLikes = reactionCountMap[post.id]
    const liveComments = commentCountMap[post.id]

    return {
      ...post,
      likes_count: Math.max(likesFromPost, embeddedLikes, toNumber(liveLikes, 0)),
      comments_count: Math.max(commentsFromPost, embeddedComments, toNumber(liveComments, 0)),
      shares_count: Math.max(0, sharesFromPost),
      profile,
      previewImage: pickPreviewImage(post),
      displayName,
    }
  })

  // Web strategy: keep videos first, but blend older and newer clips
  // so the feed feels less repetitive than strict created_at ordering.
  const videos = mappedPosts.filter((p) => Boolean(p.video_url))
  const nonVideos = mappedPosts.filter((p) => !p.video_url)

  const videosNewestFirst = videos.sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })

  const recent = videosNewestFirst.slice(0, Math.ceil(videosNewestFirst.length * 0.6))
  const older = videosNewestFirst.slice(Math.ceil(videosNewestFirst.length * 0.6))

  // Stable pseudo-random order for older videos (changes by day).
  const daySeed = new Date().toISOString().slice(0, 10)
  const olderShuffled = [...older].sort((a, b) => {
    const aScore = hashString(`${a.id}-${daySeed}`)
    const bScore = hashString(`${b.id}-${daySeed}`)
    return aScore - bScore
  })

  const mixedVideos: LandingPost[] = []
  let i = 0
  let j = 0
  while (i < recent.length || j < olderShuffled.length) {
    if (i < recent.length) mixedVideos.push(recent[i++])
    if (j < olderShuffled.length) mixedVideos.push(olderShuffled[j++])
  }

  const sortedNonVideos = nonVideos.sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })

  const sortedItems = [...mixedVideos, ...sortedNonVideos]

  const chronologicallyOldest = [...mappedPosts].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return aTime - bTime
  })[0]

  return {
    items: sortedItems,
    nextCursor: chronologicallyOldest?.created_at ?? null,
    hasMore: sortedItems.length >= safeLimit,
  }
}

export async function getLandingFeedPosts(limit = 20, videoOnly = false): Promise<LandingPost[]> {
  const page = await getLandingFeedPostsPage(limit, null, videoOnly)
  return page.items
}
