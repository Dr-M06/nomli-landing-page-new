import type { Metadata } from "next"
import SocialFeed from "@/components/social/social-feed"
import { getLandingFeedPosts, getLandingPostById, type LandingPost } from "@/lib/nomli-posts"

type SocialPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const SHARE_WEB_ORIGIN = (process.env.NEXT_PUBLIC_SHARE_WEB_ORIGIN || "https://www.nomlimingle.com").replace(/\/$/, "")

export async function generateMetadata({ searchParams }: SocialPageProps): Promise<Metadata> {
  const params = searchParams ? await searchParams : {}
  const postIdParam = params?.postId
  const postId = Array.isArray(postIdParam) ? postIdParam[0] : postIdParam
  const fallbackImage = `${SHARE_WEB_ORIGIN}/icon.png`
  const fallbackUrl = `${SHARE_WEB_ORIGIN}/social`

  if (!postId) {
    return {
      title: "Nomli Social",
      description: "Real people. Real moments. No filter.",
      openGraph: {
        title: "Nomli Social",
        description: "Real people. Real moments. No filter.",
        url: fallbackUrl,
        images: [{ url: fallbackImage }],
      },
    }
  }

  const post = await getLandingPostById(postId)
  const text = String(post?.content || "").trim()
  const description = text || `Post by @${post?.displayName || "nomli"} on Nomli Social`
  const title = post?.displayName ? `@${post.displayName} on Nomli Social` : "Nomli Social Post"
  const image = post?.previewImage || post?.profile?.avatar_url || fallbackImage
  const pageUrl = `${SHARE_WEB_ORIGIN}/social?postId=${encodeURIComponent(postId)}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  }
}

function getPreviewPosts(): LandingPost[] {
  return [
    {
      id: "preview-1",
      user_id: "preview-user-1",
      content: "Welcome to Nomli Social on web. This is a text post preview while your feed connects.",
      created_at: new Date().toISOString(),
      likes_count: 24,
      comments_count: 7,
      shares_count: 2,
      profile: {
        id: "preview-user-1",
        username: "nomli_updates",
        full_name: "Nomli Updates",
        avatar_url: "/icon.png",
      },
      previewImage: null,
      displayName: "nomli_updates",
    },
    {
      id: "preview-2",
      user_id: "preview-user-2",
      content: "Photo post preview. Your real photos/videos will appear once live feed access is available.",
      created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      image_url: "/icon.png",
      image_urls: ["/icon.png"],
      likes_count: 46,
      comments_count: 11,
      shares_count: 5,
      profile: {
        id: "preview-user-2",
        username: "nomli_creator",
        full_name: "Nomli Creator",
        avatar_url: "/icon.png",
      },
      previewImage: "/icon.png",
      displayName: "nomli_creator",
    },
    {
      id: "preview-3",
      user_id: "preview-user-3",
      content: "Video post preview card with reactions and share actions.",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      video_url: "preview",
      likes_count: 92,
      comments_count: 18,
      shares_count: 9,
      profile: {
        id: "preview-user-3",
        username: "nomli_live",
        full_name: "Nomli Live",
        avatar_url: "/icon.png",
      },
      previewImage: null,
      displayName: "nomli_live",
    },
  ]
}

export default async function SocialPage() {
  const posts = await getLandingFeedPosts(25, true)
  const feedPosts = posts.length > 0 ? posts : getPreviewPosts().filter((p) => Boolean(p.video_url))

  return (
    <main id="main-content" className="min-h-screen bg-black text-white">
      <SocialFeed posts={feedPosts} />
    </main>
  )
}
